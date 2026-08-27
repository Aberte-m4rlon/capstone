/**
 * CameraScreeningPage.tsx — AI Health Scanner with Auto-Scan
 *
 * FLOW:
 *   Page opens → Camera auto-starts → Detection loop begins
 *   Goat detected (stable) → Auto-capture → ML scan → Result
 *   Cooldown → Back to detection → Repeat
 *
 * Two tabs:
 *   LIVE SCAN   — automatic real-time scanning
 *   HISTORY     — past screening records
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Loader2, Search, Info, WifiOff, ScanLine, History,
  PawPrint, Save, Zap,
} from 'lucide-react';
import { useAllScreenings, saveScreeningResult } from '../lib/useCameraScreenings';
import { useFarmData } from '../lib/useFarmData';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useAutoScan, type ScanState } from '../lib/useAutoScan';
import { formatDate } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import type { ScanResult } from '../lib/cameraML';
import {
  GOAT_DETECTION_THRESHOLD,
  REQUIRED_STABLE_FRAMES,
  SCAN_COOLDOWN_SECONDS,
} from '../lib/goatDetector';

// ── Camera permission handling ────────────────────────────────────────────────
type CameraPermission = 'pending' | 'granted' | 'denied' | 'unavailable' | 'https_required';

// ── State colours ─────────────────────────────────────────────────────────────
function stateColor(s: ScanState): string {
  switch (s) {
    case 'stable':   return '#FF7A18';
    case 'scanning': return '#7C3AED';
    case 'result':   return '#16A34A';
    case 'cooldown': return '#3B82F6';
    case 'error':    return '#EF4444';
    default:         return 'var(--text-secondary)';
  }
}

function predColor(p: string): string {
  if (p === 'possible_health_concern') return '#F97316';
  if (p === 'normal_appearance')       return '#16A34A';
  return '#F59E0B';
}
function predLabel(p: string): string {
  if (p === 'possible_health_concern') return 'Needs Attention';
  if (p === 'normal_appearance')       return 'No Obvious Concern';
  return 'Low Confidence';
}
function predEmoji(p: string): string {
  if (p === 'possible_health_concern') return '🟠';
  if (p === 'normal_appearance')       return '🟢';
  return '⚠️';
}

// ─────────────────────────────────────────────────────────────────────────────

export function CameraScreeningPage() {
  const navigate         = useNavigate();
  const { user }         = useAuth();
  const toast            = useToast();
  const farmData         = useFarmData();
  const { screenings, summary, loading: histLoading, refresh } = useAllScreenings();

  const [tab, setTab]               = useState<'scan' | 'history'>('scan');
  const [permission, setPermission] = useState<CameraPermission>('pending');
  const [saving, setSaving]         = useState(false);
  const [savedId, setSavedId]       = useState<string | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('');
  const [search, setSearch]         = useState('');

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Auto-scan hook ────────────────────────────────────────────────────────
  const autoScan = useAutoScan({
    videoRef,
    animalId:   selectedAnimalId || undefined,
    animalName: farmData.animals.find(a => a.id === selectedAnimalId)?.name,
    onResult: (_result, _canvas) => {
      // Auto-create alert for high-risk results
      if (user && (_result.riskLevel === 'HIGH' || _result.riskLevel === 'CRITICAL')) {
        const animalName = farmData.animals.find(a => a.id === selectedAnimalId)?.name ?? 'Animal';
        supabase.from('notifications').insert({
          user_id: user.id,
          type: 'Health',
          title: `AI Scanner: ${_result.riskLevelLabel} — ${animalName}`,
          description: `Camera screening: ${_result.riskLevelLabel} (${_result.combinedRiskScore ?? _result.riskScore}% risk). ${_result.primaryIndicators.slice(0, 2).join(', ')}`,
          priority: _result.riskLevel === 'CRITICAL' ? 'Critical' : 'Warning',
          link: selectedAnimalId ? `/animals/${selectedAnimalId}` : '/camera-screening',
          read: false,
        });
      }
    },
  });

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setPermission('pending');

    if (window.location.protocol !== 'https:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1') {
      setPermission('https_required');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unavailable');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 }, height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPermission('granted');
      autoScan.startAutoScan();
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('permission') || err?.name === 'NotAllowedError') {
        setPermission('denied');
      } else {
        setPermission('unavailable');
      }
    }
  }, [autoScan]);

  // ── Stop camera ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    autoScan.stopAutoScan();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [autoScan]);

  // Auto-start camera when page tab is selected
  useEffect(() => {
    if (tab === 'scan' && permission === 'pending') {
      startCamera();
    }
    return () => {
      if (tab !== 'scan') stopCamera();
    };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save result ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!autoScan.result || !user) return;
    setSaving(true);
    try {
      const animalId = selectedAnimalId || `unlinked-${Date.now()}`;
      const { data, error } = await saveScreeningResult(
        animalId, user.id, autoScan.result, autoScan.capturedCanvas,
      );
      if (error) throw new Error(error);
      setSavedId(data?.id ?? null);
      toast('Screening result saved.', 'success');
      refresh();
    } catch (err: any) {
      toast(`Could not save: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [autoScan.result, autoScan.capturedCanvas, user, selectedAnimalId, toast, refresh]);

  // ── History filter ────────────────────────────────────────────────────────
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

  const activeAnimals = farmData.animals.filter(a => !a.archived);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: 5, width: 'fit-content' }}>
        {[
          { key: 'scan', label: 'Live Scanner', icon: <ScanLine size={15} /> },
          { key: 'history', label: 'History', icon: <History size={15} /> },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === t.key ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 4px 14px rgba(255,59,48,0.35)' : 'none', transition: 'all 0.2s' }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── LIVE SCANNER TAB ── */}
      {tab === 'scan' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 18, alignItems: 'start' }} className="scanner-grid">

          {/* Left: Camera */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Camera viewport */}
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#000', aspectRatio: '4/3', border: `2px solid ${permission === 'granted' ? stateColor(autoScan.state) : 'var(--border)'}`, boxShadow: permission === 'granted' ? `0 0 24px ${stateColor(autoScan.state)}33` : 'none', transition: 'border-color 0.4s, box-shadow 0.4s' }}>

              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: permission === 'granted' ? 'block' : 'none' }} />

              {/* No-camera overlay */}
              {permission !== 'granted' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
                  {permission === 'pending' && <Loader2 size={32} color="var(--accent-orange)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {permission === 'denied' && <WifiOff size={36} color="#EF4444" />}
                  {(permission === 'unavailable' || permission === 'https_required') && <Camera size={36} color="var(--text-secondary)" />}
                  <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700 }}>
                    {permission === 'pending'       && 'Starting camera…'}
                    {permission === 'denied'        && 'Camera access denied'}
                    {permission === 'unavailable'   && 'No camera available'}
                    {permission === 'https_required'&& 'HTTPS required for camera'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {permission === 'denied'         && 'Camera permission is required for automatic health screening. Please allow camera access in your browser settings.'}
                    {permission === 'unavailable'    && 'No camera was detected on this device.'}
                    {permission === 'https_required' && 'Camera requires a secure connection (HTTPS). Use the Upload tab instead.'}
                  </div>
                  {(permission === 'denied' || permission === 'unavailable') && (
                    <button onClick={startCamera} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Try Again
                    </button>
                  )}
                </div>
              )}

              {/* Scanning frame overlay */}
              {permission === 'granted' && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {/* Corner brackets */}
                  {['tl','tr','bl','br'].map(corner => (
                    <div key={corner} style={{
                      position: 'absolute',
                      width: 28, height: 28,
                      top: corner.startsWith('t') ? 16 : undefined,
                      bottom: corner.startsWith('b') ? 16 : undefined,
                      left: corner.endsWith('l') ? 16 : undefined,
                      right: corner.endsWith('r') ? 16 : undefined,
                      borderTop: corner.startsWith('t') ? `3px solid ${stateColor(autoScan.state)}` : undefined,
                      borderBottom: corner.startsWith('b') ? `3px solid ${stateColor(autoScan.state)}` : undefined,
                      borderLeft: corner.endsWith('l') ? `3px solid ${stateColor(autoScan.state)}` : undefined,
                      borderRight: corner.endsWith('r') ? `3px solid ${stateColor(autoScan.state)}` : undefined,
                      borderRadius: corner === 'tl' ? '8px 0 0 0' : corner === 'tr' ? '0 8px 0 0' : corner === 'bl' ? '0 0 0 8px' : '0 0 8px 0',
                      transition: 'border-color 0.4s',
                    }} />
                  ))}

                  {/* Scanning animation line */}
                  {autoScan.state === 'scanning' && (
                    <div style={{ position: 'absolute', left: '10%', right: '10%', height: 2, background: `linear-gradient(90deg, transparent, #7C3AED, transparent)`, animation: 'scanLine 1.5s ease-in-out infinite' }} />
                  )}

                  {/* Detection box when goat found */}
                  {autoScan.detection?.detected && autoScan.state !== 'result' && (
                    <div style={{ position: 'absolute', top: '20%', left: '15%', right: '15%', bottom: '20%', border: `2px solid ${stateColor(autoScan.state)}`, borderRadius: 8, background: `${stateColor(autoScan.state)}12` }} />
                  )}

                  {/* Status pill */}
                  <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                    {autoScan.state === 'scanning' && <Loader2 size={13} color="#7C3AED" style={{ animation: 'spin 1s linear infinite' }} />}
                    {autoScan.state === 'detecting' && !autoScan.detection?.detected && <PawPrint size={13} color="var(--text-secondary)" />}
                    {autoScan.detection?.detected && autoScan.state !== 'result' && <PawPrint size={13} color={stateColor(autoScan.state)} />}
                    {autoScan.state === 'result' && <CheckCircle size={13} color="#16A34A" />}
                    {autoScan.state === 'cooldown' && <RefreshCw size={13} color="#3B82F6" />}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {autoScan.message}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Detection confidence bar */}
            {permission === 'granted' && autoScan.state === 'detecting' && (
              <div style={{ background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  <span>Goat Detection</span>
                  <span>{autoScan.detection ? Math.round(autoScan.detection.confidence * 100) : 0}% · threshold: {Math.round(GOAT_DETECTION_THRESHOLD * 100)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: autoScan.detection?.detected ? 'linear-gradient(90deg,#FF7A18,#FF3B30)' : 'var(--border)', width: `${Math.round((autoScan.detection?.confidence ?? 0) * 100)}%`, transition: 'width 0.3s ease' }} />
                </div>
                {autoScan.detection?.detected && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: REQUIRED_STABLE_FRAMES }).map((_, i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < (autoScan.detection?.stableFrames ?? 0) ? '#FF7A18' : 'var(--border)', transition: 'background 0.2s' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Stable frames ({autoScan.detection?.stableFrames ?? 0}/{REQUIRED_STABLE_FRAMES})
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Controls */}
            {permission === 'granted' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={autoScan.rescan} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <RefreshCw size={14} /> Rescan
                </button>
                <button onClick={() => { stopCamera(); setPermission('pending'); setTimeout(startCamera, 300); }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Camera size={14} /> Restart Camera
                </button>
              </div>
            )}

            {/* Model info */}
            {autoScan.usingFallback && permission === 'granted' && (
              <div style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 11, color: '#D97706', lineHeight: 1.5 }}>
                ⚠ MobileNet model unavailable (network issue). Using fallback pixel analysis. Detection accuracy is reduced.
              </div>
            )}
          </div>

          {/* Right: Result + Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Animal selector */}
            <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Link to Animal (optional)</div>
              <select value={selectedAnimalId} onChange={e => setSelectedAnimalId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                <option value=''>— Unlinked scan —</option>
                {activeAnimals.map(a => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
              </select>
              {!selectedAnimalId && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Screening will be saved without an animal ID. You can link it later.
                </div>
              )}
            </div>

            {/* Scan result */}
            {(autoScan.state === 'result' || autoScan.state === 'cooldown') && autoScan.result && (
              <ScanResultCard
                result={autoScan.result}
                capturedUrl={autoScan.capturedUrl}
                saving={saving}
                savedId={savedId}
                onSave={handleSave}
              />
            )}

            {/* Waiting / scanning state */}
            {autoScan.state === 'scanning' && (
              <div style={{ background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
                <Loader2 size={32} color="#7C3AED" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Analyzing Health…</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Running ML screening on captured frame</div>
              </div>
            )}

            {(autoScan.state === 'detecting' || autoScan.state === 'stable' || autoScan.state === 'loading' || autoScan.state === 'idle') && !autoScan.result && (
              <div style={{ background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🐐</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Waiting for Goat…</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Position a goat in front of the camera. The system will automatically detect and screen it.
                </div>
                {autoScan.state === 'stable' && (
                  <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(255,122,24,0.1)', border: '1px solid rgba(255,122,24,0.3)', fontSize: 12, color: '#FF7A18', fontWeight: 700 }}>
                    🐐 Goat detected — preparing scan…
                  </div>
                )}
              </div>
            )}

            {autoScan.state === 'cooldown' && (
              <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#3B82F6', textAlign: 'center' }}>
                Next auto-scan in {autoScan.cooldownRemaining}s
              </div>
            )}

            {/* Config info */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Auto-Scan Settings</div>
              Detection threshold: {Math.round(GOAT_DETECTION_THRESHOLD * 100)}% ·
              Stable frames: {REQUIRED_STABLE_FRAMES} ·
              Cooldown: {SCAN_COOLDOWN_SECONDS}s
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Total Screenings"  value={summary.total}           color="var(--accent-orange)" icon={<Camera size={16}/>} />
            <SummaryCard label="Possible Concerns" value={summary.possibleConcerns} color="#F97316"             icon={<AlertTriangle size={16}/>} />
            <SummaryCard label="Low Confidence"    value={summary.lowConfidence}    color="#F59E0B"             icon={<XCircle size={16}/>} />
            <SummaryCard label="Last Screening"    value={summary.lastScreeningDate ? formatDate(summary.lastScreeningDate) : '—'} color="#3B82F6" icon={<CheckCircle size={16}/>} small />
          </div>

          {/* Search */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '10px 14px', alignItems: 'center' }}>
            <Search size={15} color="var(--text-secondary)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by animal name or tag…" style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', flex: 1 }} />
            <button onClick={refresh} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>
            {histLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px', color: 'var(--text-secondary)', fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading history…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
                <Camera size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No screenings found</div>
                <div style={{ fontSize: 13 }}>Screenings you save will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      {['Date', 'Animal', 'Result', 'Confidence', 'Model', 'Actions'].map(h => (
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14 }}>{predEmoji(s.prediction)}</span>
                            <span style={{ fontWeight: 700, color: predColor(s.prediction) }}>{predLabel(s.prediction)}</span>
                          </div>
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

          {/* Disclaimer */}
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 10, fontSize: 11, color: '#3B82F6', lineHeight: 1.6 }}>
            ℹ️ Camera screening is a preliminary AI assessment and does not replace professional veterinary diagnosis.
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes scanLine {
          0%   { top: 15%; opacity: 0.8; }
          50%  { top: 80%; opacity: 0.4; }
          100% { top: 15%; opacity: 0.8; }
        }
        @media (max-width: 700px) {
          .scanner-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Scan Result Card ──────────────────────────────────────────────────────────

function ScanResultCard({ result, capturedUrl, saving, savedId, onSave }: {
  result: ScanResult;
  capturedUrl: string | null;
  saving: boolean;
  savedId: string | null;
  onSave: () => void;
}) {
  const finalScore = result.combinedRiskScore ?? result.riskScore;
  const col = result.riskLevelColor;

  return (
    <div style={{ background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>

      {/* Captured image */}
      {capturedUrl && (
        <img src={capturedUrl} alt="Screened" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
      )}

      <div style={{ padding: '14px 16px' }}>

        {/* Status header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 28 }}>{result.riskLevelEmoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: col }}>{result.riskLevelLabel}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AI Health Screening</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: col, lineHeight: 1 }}>{finalScore}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Risk Score</div>
          </div>
        </div>

        {/* Confidence + quality */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{result.confidencePercent}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>AI Confidence</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{result.modelVersion}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Model</div>
          </div>
        </div>

        {/* Indicators */}
        {result.indicators.filter(i => i.indicator !== 'NORMAL').length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Detected Indicators</div>
            {result.indicators.filter(i => i.indicator !== 'NORMAL').slice(0, 3).map((ind, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', padding: '4px 0' }}>
                <AlertTriangle size={12} color="#F97316" />
                <span>{ind.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', fontSize: 10, color: '#3B82F6', lineHeight: 1.5, marginBottom: 12, display: 'flex', gap: 6 }}>
          <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>ML screening is an early-warning tool. NOT a veterinary diagnosis.</span>
        </div>

        {/* Save button */}
        {savedId ? (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#16A34A', fontWeight: 700, padding: '8px' }}>
            ✓ Saved to screening history
          </div>
        ) : (
          <button onClick={onSave} disabled={saving} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: saving ? 'var(--surface)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: saving ? 'var(--text-secondary)' : '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: saving ? 'none' : '0 4px 14px rgba(255,59,48,0.3)' }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Save size={14} /> Save Result</>}
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
