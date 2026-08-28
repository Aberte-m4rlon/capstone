/**
 * CameraScreeningPage.tsx — AI Livestock Health Scanner
 *
 * AUTO-SCAN WORKFLOW:
 *   Camera opens → MobileNet detects object every 200ms
 *   GOAT / SHEEP → stable 5 frames → auto-capture → health scan → result
 *   OTHER (dog/person/car/etc.) → "This is not a goat or sheep"
 *   NOTHING → "Looking for a goat or sheep…"
 *   After result → 8s cooldown → back to detecting
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Loader2, Search, Info, WifiOff, ScanLine, History,
  Save, Ban, Zap, Upload, ImageIcon, ShieldAlert, Activity, Check,
} from 'lucide-react';
import { useAllScreenings, saveScreeningResult } from '../lib/useCameraScreenings';
import { useFarmData } from '../lib/useFarmData';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useAutoScan, type ScanState } from '../lib/useAutoScan';
import { formatDate } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { fileToCanvas } from '../lib/cameraML';
import {
  GOAT_DETECTION_THRESHOLD,
  REQUIRED_STABLE_FRAMES,
  SCAN_COOLDOWN_SECONDS,
} from '../lib/goatDetector';

// ── Permission type ───────────────────────────────────────────────────────────
type CameraPermission = 'pending' | 'granted' | 'denied' | 'unavailable' | 'https_required';

// ── Colour helpers ────────────────────────────────────────────────────────────
function stateColor(s: ScanState): string {
  switch (s) {
    case 'other_detected': return '#EF4444';
    case 'stable':         return '#FF7A18';
    case 'scanning':       return '#7C3AED';
    case 'result':         return '#16A34A';
    case 'cooldown':       return '#3B82F6';
    case 'error':          return '#EF4444';
    default:               return 'rgba(255,255,255,0.35)';
  }
}
function predColor(p: string) {
  if (p === 'possible_health_concern') return '#F97316';
  if (p === 'normal_appearance')       return '#16A34A';
  return '#F59E0B';
}
function predLabel(p: string) {
  if (p === 'possible_health_concern') return 'Needs Attention';
  if (p === 'normal_appearance')       return 'No Obvious Concern';
  return 'Low Confidence';
}
function predEmoji(p: string) {
  return '';
}

// ── What-to-do recommendations ────────────────────────────────────────────────
const HEALTHY_ACTIONS = [
  'Continue normal monitoring schedule.',
  'Maintain regular feeding, hydration, and rest.',
  'Keep vaccination and health records up to date in AlpasFarm.',
  'Schedule routine check-ups as needed.',
];
const ATTENTION_ACTIONS = [
  'Recheck the animal\'s vital signs (temperature, heart rate).',
  'Review recent health records in AlpasFarm.',
  'Monitor appetite and activity level closely.',
  'Observe the animal for any visible changes or discharge.',
  'Record your observations in AlpasFarm.',
  'Consult a qualified veterinarian if concerning signs persist or worsen.',
];

// ─────────────────────────────────────────────────────────────────────────────

export function CameraScreeningPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast    = useToast();
  const farmData = useFarmData();
  const { screenings, summary, loading: histLoading, refresh } = useAllScreenings();

  const [tab, setTab]                   = useState<'scan' | 'history'>('scan');
  const [permission, setPermission]     = useState<CameraPermission>('pending');
  const [saving, setSaving]             = useState(false);
  const [savedId, setSavedId]           = useState<string | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState('');
  const [search, setSearch]             = useState('');

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-scan hook ────────────────────────────────────────────────────────
  const autoScan = useAutoScan({
    videoRef,
    animalId:   selectedAnimalId || undefined,
    animalName: farmData.animals.find(a => a.id === selectedAnimalId)?.name,
    onResult: (scanResult, _canvas, species) => {
      // Auto-create health alert for high/critical results
      if (user && (scanResult.riskLevel === 'HIGH' || scanResult.riskLevel === 'CRITICAL')) {
        const animalName = farmData.animals.find(a => a.id === selectedAnimalId)?.name
          ?? (species === 'sheep' ? 'Sheep' : 'Goat');
        supabase.from('notifications').insert({
          user_id:     user.id,
          type:        'Health',
          title:       `AI Scanner: ${scanResult.riskLevelLabel} — ${animalName}`,
          description: `Camera screening (${species}): ${scanResult.riskLevelLabel}. ${scanResult.primaryIndicators.slice(0, 2).join(', ')}`,
          priority:    scanResult.riskLevel === 'CRITICAL' ? 'Critical' : 'Warning',
          link:        selectedAnimalId ? `/animals/${selectedAnimalId}` : '/camera-screening',
          read:        false,
        });
      }
    },
  });

  // ── File upload handler ───────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please select a valid image file.', 'error');
      return;
    }
    try {
      toast('Processing image for screening...', 'info');
      const canvas = await fileToCanvas(file);
      await autoScan.triggerManualScan(canvas);
    } catch {
      toast('Could not read image file.', 'error');
    } finally {
      if (e.target) e.target.value = '';
    }
  }, [autoScan, toast]);

  // ── Camera management ─────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setPermission('pending');
    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) { setPermission('https_required'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setPermission('unavailable'); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setPermission('granted');
      autoScan.startAutoScan();
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      setPermission(msg.includes('permission') || err?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }
  }, [autoScan]);

  const stopCamera = useCallback(() => {
    autoScan.stopAutoScan();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [autoScan]);

  useEffect(() => {
    if (tab === 'scan' && permission === 'pending') startCamera();
    return () => { if (tab !== 'scan') stopCamera(); };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopCamera(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!autoScan.result || !user) return;
    if (!autoScan.result.goatDetected) {
      toast('Hindi maaring i-save ang screening dahil hindi ito kambing o tupa.', 'error');
      return;
    }
    setSaving(true);
    try {
      const animalId = selectedAnimalId || 'unlinked';
      const { data, error } = await saveScreeningResult(
        animalId, user.id, autoScan.result, autoScan.capturedCanvas,
      );
      if (error) throw new Error(error);
      setSavedId(data?.id ?? null);
      toast('Screening result saved.', 'success');
      refresh();
    } catch (err: any) {
      toast(`Could not save: ${err?.message}`, 'error');
    } finally { setSaving(false); }
  }, [autoScan.result, autoScan.capturedCanvas, user, selectedAnimalId, toast, refresh]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const activeAnimals = farmData.animals.filter(a => !a.archived);
  const det           = autoScan.detection;
  const speciesLabel  = autoScan.detectedSpecies === 'sheep' ? 'Sheep' : 'Goat';

  const borderColor = permission === 'granted' ? stateColor(autoScan.state) : 'var(--border)';

  // History enrichment
  const enriched = screenings.map(s => ({
    ...s,
    animalName: farmData.animals.find(a => a.id === s.animal_id)?.name ?? 'Unknown',
    animalTag:  farmData.animals.find(a => a.id === s.animal_id)?.tag_id ?? '',
  }));
  const filtered = enriched.filter(s =>
    !search.trim() ||
    s.animalName.toLowerCase().includes(search.toLowerCase()) ||
    s.animalTag.toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 20, background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: 5, width: 'fit-content' }}>
        {[
          { key: 'scan',    label: 'Live Scanner', icon: <ScanLine size={14} /> },
          { key: 'history', label: 'History',      icon: <History size={14} />  },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === t.key ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 4px 14px rgba(255,59,48,0.35)' : 'none', transition: 'all 0.2s' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══ LIVE SCANNER ══ */}
      {tab === 'scan' && (
        <div className="scanner-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,0.85fr)', gap: 18, alignItems: 'start' }}>

          {/* ── LEFT: Camera ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Viewport */}
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#000', aspectRatio: '4/3', border: `2px solid ${borderColor}`, boxShadow: permission === 'granted' ? `0 0 28px ${borderColor}44` : 'none', transition: 'border-color 0.4s, box-shadow 0.4s' }}>

              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: permission === 'granted' ? 'block' : 'none' }} />

              {/* No-camera states */}
              {permission !== 'granted' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
                  {permission === 'pending'        && <Loader2 size={32} color="var(--accent-orange)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {permission === 'denied'         && <WifiOff size={36} color="#EF4444" />}
                  {permission === 'unavailable'    && <Camera size={36} color="var(--text-secondary)" />}
                  {permission === 'https_required' && <Camera size={36} color="var(--text-secondary)" />}
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {permission === 'pending'        && 'Starting camera…'}
                    {permission === 'denied'         && 'Camera access denied'}
                    {permission === 'unavailable'    && 'Camera not available'}
                    {permission === 'https_required' && 'HTTPS required for camera'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 280 }}>
                    {permission === 'denied'         && 'Camera permission is required for automatic health screening. Please allow camera access in your browser settings.'}
                    {permission === 'unavailable'    && 'No camera was detected on this device.'}
                    {permission === 'https_required' && 'Camera requires a secure connection (HTTPS).'}
                  </div>
                  {(permission === 'denied' || permission === 'unavailable') && (
                    <button onClick={startCamera} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                      Try Again
                    </button>
                  )}
                </div>
              )}

              {/* Live overlay */}
              {permission === 'granted' && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

                  {/* Corner brackets — always show */}
                  {(['tl','tr','bl','br'] as const).map(c => (
                    <div key={c} style={{
                      position: 'absolute', width: 30, height: 30,
                      top:    c[0]==='t' ? 14 : undefined, bottom: c[0]==='b' ? 14 : undefined,
                      left:   c[1]==='l' ? 14 : undefined, right:  c[1]==='r' ? 14 : undefined,
                      borderTop:    c[0]==='t' ? `3px solid ${borderColor}` : undefined,
                      borderBottom: c[0]==='b' ? `3px solid ${borderColor}` : undefined,
                      borderLeft:   c[1]==='l' ? `3px solid ${borderColor}` : undefined,
                      borderRight:  c[1]==='r' ? `3px solid ${borderColor}` : undefined,
                      borderRadius: c==='tl'?'8px 0 0 0':c==='tr'?'0 8px 0 0':c==='bl'?'0 0 0 8px':'0 0 8px 0',
                      transition: 'border-color 0.4s',
                    }} />
                  ))}

                  {/* ── OTHER OBJECT OVERLAY ── */}
                  {autoScan.state === 'other_detected' && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><ShieldAlert size={44} color="#EF4444" /></div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#EF4444' }}>
                        {det?.nonTargetClass ? `${det.nonTargetClass} Detected` : 'Object Detected'}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 10, padding: '8px 18px' }}>
                        THIS IS NOT A GOAT OR SHEEP
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                        {det?.nonTargetClass
                          ? `Please point the camera at a goat or sheep.`
                          : 'Please point the camera at a goat or sheep.'}
                      </div>
                    </div>
                  )}

                  {/* Scan line when running */}
                  {autoScan.state === 'scanning' && (
                    <div style={{ position: 'absolute', left: '8%', right: '8%', height: 2, background: 'linear-gradient(90deg,transparent,#7C3AED,transparent)', animation: 'scanLine 1.5s ease-in-out infinite' }} />
                  )}

                  {/* Detection box for goat/sheep */}
                  {det?.detected && autoScan.state !== 'result' && autoScan.state !== 'other_detected' && (
                    <div style={{ position: 'absolute', top: '18%', left: '12%', right: '12%', bottom: '18%', border: `2px solid ${borderColor}`, borderRadius: 10, background: `${borderColor}14` }} />
                  )}

                  {/* Bottom status pill */}
                  <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: '6px 18px', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', maxWidth: 'calc(100% - 32px)' }}>
                    {autoScan.state === 'loading'   && <Loader2 size={13} color="var(--accent-orange)" style={{ animation: 'spin 1s linear infinite' }} />}
                    {autoScan.state === 'scanning'  && <Loader2 size={13} color="#7C3AED" style={{ animation: 'spin 1s linear infinite' }} />}
                    {autoScan.state === 'result'    && <CheckCircle size={13} color="#16A34A" />}
                    {autoScan.state === 'cooldown'  && <RefreshCw size={13} color="#3B82F6" />}
                    {autoScan.state === 'other_detected' && <Ban size={13} color="#EF4444" />}
                    {(autoScan.state === 'detecting' || autoScan.state === 'stable') && det?.detected && (
                      <Activity size={13} color="#FF7A18" />
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {autoScan.message}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Detection progress */}
            {permission === 'granted' && (autoScan.state === 'detecting' || autoScan.state === 'stable') && (
              <div style={{ background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {det?.detected ? <><Activity size={12} color="#FF7A18" /> {speciesLabel} Detected</> : 'Detection'}
                  </span>
                  <span>{det ? Math.round(det.confidence * 100) : 0}% · min {Math.round(GOAT_DETECTION_THRESHOLD * 100)}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', borderRadius: 999, background: det?.detected ? `linear-gradient(90deg,#FF7A18,#FF3B30)` : 'var(--border)', width: `${Math.round((det?.confidence ?? 0) * 100)}%`, transition: 'width 0.3s' }} />
                </div>
                {det?.detected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: REQUIRED_STABLE_FRAMES }).map((_, i) => (
                        <div key={i} style={{ width: 9, height: 9, borderRadius: 3, background: i < (det.stableFrames ?? 0) ? '#FF7A18' : 'var(--border)', transition: 'background 0.2s' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Stable {det.stableFrames}/{REQUIRED_STABLE_FRAMES} frames needed
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {permission === 'granted' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Instant Scan Button */}
                <button
                  onClick={() => autoScan.triggerManualScan()}
                  disabled={autoScan.state === 'scanning'}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    background: autoScan.state === 'scanning' ? 'var(--surface)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                    color: autoScan.state === 'scanning' ? 'var(--text-secondary)' : '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: autoScan.state === 'scanning' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: autoScan.state === 'scanning' ? 'none' : '0 4px 14px rgba(255,59,48,0.35)',
                    transition: 'all 0.2s',
                  }}
                >
                  <Zap size={16} /> Instant Scan (Scan Now)
                </button>

                {/* Secondary Controls */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Upload size={13} /> Upload Photo
                  </button>
                  <button onClick={autoScan.rescan} style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <RefreshCw size={13} /> Rescan
                  </button>
                  <button onClick={() => { stopCamera(); setPermission('pending'); setTimeout(startCamera, 300); }}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Camera size={13} /> Restart
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
            )}

            {autoScan.usingFallback && permission === 'granted' && (
              <div style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 11, color: '#D97706', lineHeight: 1.5 }}>
                [Paalala] MobileNet unavailable — using fallback pixel analysis. Detection accuracy is reduced.
              </div>
            )}
          </div>

          {/* ── RIGHT: Status panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Animal selector */}
            <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                Link to Animal (optional)
              </div>
              <select value={selectedAnimalId} onChange={e => { setSelectedAnimalId(e.target.value); setSavedId(null); }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                <option value="">— Unlinked scan —</option>
                {activeAnimals.map(a => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
              </select>
              {!selectedAnimalId && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Result saved without animal ID. Link it later from the History tab.</div>}
            </div>

            {/* ── OTHER DETECTED panel ── */}
            {autoScan.state === 'other_detected' && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.4)', borderRadius: 14, padding: '20px 18px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><ShieldAlert size={40} color="#EF4444" /></div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#EF4444', marginBottom: 6 }}>
                  Hindi ito Kambing o Tupa!
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  {det?.nonTargetClass ? `Na-detect: ${det.nonTargetClass}` : (autoScan.result?.nonTargetClass ? `Na-detect: ${autoScan.result.nonTargetClass}` : 'Hindi Awtorisadong Bagay / Hayop')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  Ang AI Health Screening ay para lamang sa mga <strong>kambing at tupa</strong>.<br />
                  Mangyaring itapat ang camera o mag-upload ng litrato ng kambing o tupa.
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: '#EF4444', fontWeight: 700 }}>
                  [Paalala] Not a goat or sheep. Visual health screening will not execute.
                </div>
              </div>
            )}

            {/* ── WAITING panel ── */}
            {(autoScan.state === 'idle' || autoScan.state === 'loading' || autoScan.state === 'detecting' || autoScan.state === 'stable') && !autoScan.result && (
              <div style={{ background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
                {autoScan.state === 'stable' ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Activity size={40} color="#FF7A18" /></div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#FF7A18', marginBottom: 6 }}>{speciesLabel} Detected!</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Preparing automatic scan…</div>
                  </>
                ) : det?.detected ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Activity size={40} color="#FF7A18" /></div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#FF7A18', marginBottom: 4 }}>{speciesLabel} Detected</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Stabilizing detection…</div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.6 }}><ScanLine size={36} color="var(--text-secondary)" /></div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Waiting for Goat or Sheep…</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Point the camera at a goat or sheep.<br />The system will detect and screen automatically.
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── SCANNING panel ── */}
            {autoScan.state === 'scanning' && (
              <div style={{ background: 'var(--glass-surface)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
                <Loader2 size={34} color="#7C3AED" style={{ animation: 'spin 1s linear infinite', marginBottom: 14 }} />
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Analyzing Health…</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Running {speciesLabel.toLowerCase()} health screening
                </div>
              </div>
            )}

            {/* ── RESULT panel ── */}
            {(autoScan.state === 'result' || autoScan.state === 'cooldown') && autoScan.result && (
              <ScanResultCard
                result={autoScan.result}
                capturedUrl={autoScan.capturedUrl}
                species={autoScan.detectedSpecies ?? 'goat'}
                saving={saving}
                savedId={savedId}
                cooldownRemaining={autoScan.state === 'cooldown' ? autoScan.cooldownRemaining : null}
                onSave={handleSave}
              />
            )}

            {/* Cooldown banner */}
            {autoScan.state === 'cooldown' && (
              <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#3B82F6', textAlign: 'center', fontWeight: 600 }}>
                Next scan in {autoScan.cooldownRemaining}s…
              </div>
            )}

            {/* Settings info */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Scanner Settings</div>
              Threshold: {Math.round(GOAT_DETECTION_THRESHOLD * 100)}% ·
              Stable frames: {REQUIRED_STABLE_FRAMES} ·
              Cooldown: {SCAN_COOLDOWN_SECONDS}s
            </div>
          </div>
        </div>
      )}

      {/* ══ HISTORY ══ */}
      {tab === 'history' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Total Screenings"  value={summary.total}           color="var(--accent-orange)" icon={<Camera size={16}/>} />
            <SummaryCard label="Possible Concerns" value={summary.possibleConcerns} color="#F97316"             icon={<AlertTriangle size={16}/>} />
            <SummaryCard label="Low Confidence"    value={summary.lowConfidence}    color="#F59E0B"             icon={<XCircle size={16}/>} />
            <SummaryCard label="Last Screening"    value={summary.lastScreeningDate ? formatDate(summary.lastScreeningDate) : '—'} color="#3B82F6" icon={<CheckCircle size={16}/>} small />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '10px 14px', alignItems: 'center' }}>
            <Search size={15} color="var(--text-secondary)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by animal name or tag…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', flex: 1 }} />
            <button onClick={refresh} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>
            {histLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px', color: 'var(--text-secondary)', fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading history…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
                <Camera size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No screenings yet</div>
                <div style={{ fontSize: 13 }}>Saved screenings will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      {['Date','Animal','Result','Confidence','Model','Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '11px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(s.created_at)}</td>
                        <td style={{ padding: '11px 16px' }}>
                          <button onClick={() => navigate(`/animals/${s.animal_id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-orange)', padding: 0 }}>
                            {s.animalName}
                          </button>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.animalTag}</div>
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          <span style={{ fontSize: 14 }}>{predEmoji(s.prediction)}</span>
                          {' '}
                          <span style={{ fontWeight: 700, color: predColor(s.prediction) }}>{predLabel(s.prediction)}</span>
                        </td>
                        <td style={{ padding: '11px 16px', fontWeight: 700, color: predColor(s.prediction) }}>{Math.round(s.confidence * 100)}%</td>
                        <td style={{ padding: '11px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>{s.model_version}</td>
                        <td style={{ padding: '11px 16px' }}>
                          <button onClick={() => navigate(`/animals/${s.animal_id}`)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 10, fontSize: 11, color: '#3B82F6', lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>Camera screening is a preliminary AI assessment and does not replace professional veterinary diagnosis.</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { from{transform:rotate(0deg)}  to{transform:rotate(360deg)} }
        @keyframes scanLine { 0%{top:15%;opacity:.8} 50%{top:80%;opacity:.4} 100%{top:15%;opacity:.8} }
        @media (max-width: 700px) { .scanner-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

// ── Scan Result Card ──────────────────────────────────────────────────────────

function ScanResultCard({ result, capturedUrl, species, saving, savedId, cooldownRemaining, onSave }: {
  result: import('../lib/cameraML').ScanResult;
  capturedUrl: string | null;
  species: 'goat' | 'sheep';
  saving: boolean;
  savedId: string | null;
  cooldownRemaining: number | null;
  onSave: () => void;
}) {
  if (!result.goatDetected) {
    return (
      <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '2px solid rgba(239,68,68,0.4)', borderRadius: 14, overflow: 'hidden' }}>
        {capturedUrl && (
          <img src={capturedUrl} alt="Screened Non-Target" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><ShieldAlert size={36} color="#EF4444" /></div>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#EF4444', marginBottom: 4 }}>
            Hindi ito Kambing o Tupa!
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            {result.nonTargetClass ? `Na-detect: ${result.nonTargetClass}` : 'Non-target object detected'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            {result.recommendation || 'Ang AI Health Screening ay eksklusibo lamang para sa mga kambing at tupa. Mangyaring itapat ang camera o mag-upload ng litrato ng kambing o tupa.'}
          </div>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
            [Paalala] Hindi maaaring suriin ang kalusugan ng hindi kambing o tupa.
          </div>
        </div>
      </div>
    );
  }

  const finalScore = result.combinedRiskScore ?? result.riskScore;
  const col  = result.riskLevelColor;
  const isHealthy = result.prediction === 'normal_appearance';
  const speciesLabel = species === 'sheep' ? 'SHEEP' : 'GOAT';
  const actions = isHealthy ? HEALTHY_ACTIONS : ATTENTION_ACTIONS;

  return (
    <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>

      {capturedUrl && (
        <img src={capturedUrl} alt="Screened" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
      )}

      <div style={{ padding: '14px 16px' }}>

        {/* Species badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '3px 12px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
          <Activity size={12} color="var(--accent-orange)" /> {speciesLabel}
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}><Activity size={24} color={col} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: col }}>
              {isHealthy ? 'HEALTHY' : 'NEEDS ATTENTION'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {isHealthy ? 'No obvious warning detected by the screening model.' : 'Further assessment recommended.'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: col, lineHeight: 1 }}>{finalScore}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Risk</div>
          </div>
        </div>

        {/* Confidence row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{result.confidencePercent}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>AI Confidence</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{result.modelVersion}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Model</div>
          </div>
        </div>

        {/* Important indicators */}
        {result.indicators.filter(i => i.indicator !== 'NORMAL').length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>Detected Indicators</div>
            {result.indicators.filter(i => i.indicator !== 'NORMAL').slice(0, 3).map((ind, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', padding: '3px 0' }}>
                <AlertTriangle size={11} color="#F97316" />
                <span>{ind.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* What to do */}
        <div style={{ marginBottom: 12, background: isHealthy ? 'rgba(22,163,74,0.07)' : 'rgba(249,115,22,0.07)', border: `1px solid ${isHealthy ? 'rgba(22,163,74,0.2)' : 'rgba(249,115,22,0.2)'}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 7 }}>
            {isHealthy ? 'Continue Normal Care' : 'What Should I Do?'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {actions.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>
                <span style={{ color: isHealthy ? '#16A34A' : '#F97316', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ display: 'flex', gap: 7, padding: '8px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', fontSize: 10, color: '#3B82F6', lineHeight: 1.5, marginBottom: 12 }}>
          <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>ML screening is an early-warning tool. NOT a veterinary diagnosis. Consult a licensed veterinarian for confirmation.</span>
        </div>

        {/* Save / saved */}
        {savedId ? (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#16A34A', fontWeight: 700, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Check size={15} /> Saved to history
          </div>
        ) : (
          <button onClick={onSave} disabled={saving}
            style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: saving ? 'var(--surface)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: saving ? 'var(--text-secondary)' : '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: saving ? 'none' : '0 4px 14px rgba(255,59,48,0.3)', transition: 'all 0.2s' }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Save size={14} /> Save Screening</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, icon, small }: {
  label: string; value: number | string; color: string; icon: React.ReactNode; small?: boolean;
}) {
  return (
    <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: small ? 13 : 20, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}
