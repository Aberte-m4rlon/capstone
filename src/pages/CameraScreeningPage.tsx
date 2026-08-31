/**
 * CameraScreeningPage.tsx — AlpasFarm Professional AI Veterinary Assistant & Health Scanner
 *
 * FULL VETERINARY AI WORKFLOW:
 *   Camera -> Detect Animal -> Verify Goat/Sheep -> Analyze ML -> Predict Health Risk -> AI Veterinary Explanation -> Recommended Actions
 *
 * Design System: Farm & Nature (Green #43A047, #2E7D32, #E8F5E9, #F5F8F5)
 * Strict 0 Emojis rule: 100% Lucide-React SVG Icons.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, AlertTriangle, CheckCircle, RefreshCw,
  Loader2, Search, Info, WifiOff, ScanLine, History,
  Save, Ban, Zap, Upload, ShieldAlert, Activity, Check,
  Bot, Sparkles, Stethoscope, Flame, SwitchCamera, X, Compass, Eye
} from 'lucide-react';
import { useAllScreenings, saveScreeningResult, type CameraScreening } from '../lib/useCameraScreenings';
import { useFarmData } from '../lib/useFarmData';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useAutoScan, type ScanState } from '../lib/useAutoScan';
import { formatDate } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { fileToCanvas, type ScanResult } from '../lib/cameraML';
import {
  GOAT_DETECTION_THRESHOLD,
  STABILITY_DURATION_MS,
} from '../lib/goatDetector';

// ── Types ─────────────────────────────────────────────────────────────────────
type CameraPermission = 'pending' | 'granted' | 'denied' | 'unavailable' | 'https_required';

// ── Color Helpers (Farm & Nature Palette) ──────────────────────────────────────
function stateColor(s: ScanState): string {
  switch (s) {
    case 'other_detected': return '#DC2626';
    case 'stable':         return '#43A047';
    case 'scanning':       return '#2563EB';
    case 'result':         return '#2E7D32';
    case 'cooldown':       return '#0284C7';
    case 'error':          return '#DC2626';
    default:               return 'rgba(67, 160, 71, 0.4)';
  }
}

function riskColor(risk: string) {
  switch (risk?.toLowerCase()) {
    case 'critical': return '#DC2626';
    case 'high':     return '#EA580C';
    case 'moderate': return '#D97706';
    case 'low':      return '#16A34A';
    default:         return '#16A34A';
  }
}

function riskBg(risk: string) {
  switch (risk?.toLowerCase()) {
    case 'critical': return 'rgba(220, 38, 38, 0.1)';
    case 'high':     return 'rgba(234, 88, 12, 0.1)';
    case 'moderate': return 'rgba(217, 119, 6, 0.1)';
    case 'low':      return 'rgba(22, 163, 74, 0.1)';
    default:         return 'rgba(22, 163, 74, 0.1)';
  }
}

function riskBorder(risk: string) {
  switch (risk?.toLowerCase()) {
    case 'critical': return 'rgba(220, 38, 38, 0.3)';
    case 'high':     return 'rgba(234, 88, 12, 0.3)';
    case 'moderate': return 'rgba(217, 119, 6, 0.3)';
    case 'low':      return 'rgba(22, 163, 74, 0.3)';
    default:         return 'rgba(22, 163, 74, 0.3)';
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export function CameraScreeningPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast    = useToast();
  const farmData = useFarmData();
  const { screenings, loading: histLoading, refresh } = useAllScreenings();

  const [tab, setTab]                           = useState<'scan' | 'attention' | 'history'>('scan');
  const [speciesMode, setSpeciesMode]           = useState<'auto' | 'goat' | 'sheep'>('auto');
  const [permission, setPermission]             = useState<CameraPermission>('pending');
  const [facingMode, setFacingMode]             = useState<'environment' | 'user'>('environment');
  const [saving, setSaving]                     = useState(false);
  const [savedId, setSavedId]                   = useState<string | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState('');
  const [search, setSearch]                     = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<CameraScreening | null>(null);

  const videoRef         = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef     = useRef<number | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);

  // Selected animal data
  const selectedAnimal = farmData.animals.find(a => a.id === selectedAnimalId);

  // ── Auto-scan hook ────────────────────────────────────────────────────────
  const autoScan = useAutoScan({
    videoRef,
    animalId:          selectedAnimalId || undefined,
    animalName:        selectedAnimal?.name,
    speciesPreference: speciesMode,
    onResult: (scanResult, _canvas, species) => {
      // Auto-create health alert notification for high or critical results
      if (user && (scanResult.riskLevel === 'HIGH' || scanResult.riskLevel === 'CRITICAL')) {
        const animalName = selectedAnimal?.name ?? (species === 'sheep' ? 'Sheep' : 'Goat');
        supabase.from('notifications').insert({
          user_id:     user.id,
          type:        'Health',
          title:       `AI Scanner: ${scanResult.riskLevelLabel} - ${animalName}`,
          description: `Camera Health Scan (${species}): ${scanResult.riskLevelLabel}. ${scanResult.primaryIndicators.slice(0, 2).join(', ')}`,
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
      toast('Analyzing image with AI Veterinary Core...', 'info');
      const canvas = await fileToCanvas(file);
      await autoScan.triggerManualScan(canvas);
    } catch {
      toast('Could not read image file.', 'error');
    } finally {
      if (e.target) e.target.value = '';
    }
  }, [autoScan, toast]);

  // ── Camera management ─────────────────────────────────────────────────────
  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setPermission('pending');
    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) { setPermission('https_required'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setPermission('unavailable'); return; }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      setPermission(msg.includes('permission') || err?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }
  }, [autoScan, facingMode]);

  const stopCamera = useCallback(() => {
    autoScan.stopAutoScan();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [autoScan]);

  const toggleCameraFacing = useCallback(() => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  }, [facingMode, startCamera]);

  useEffect(() => {
    if (tab === 'scan' && permission === 'pending') startCamera();
    return () => { if (tab !== 'scan') stopCamera(); };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopCamera(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live 60 FPS Bounding Box Canvas Overlay Renderer ─────────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || permission !== 'granted') return;

    let isRunning = true;

    const renderOverlay = () => {
      if (!isRunning) return;
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
        }

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const tracked = autoScan.trackedAnimals;
        const selectedId = autoScan.selectedTargetId;

        if (autoScan.state !== 'other_detected' && tracked && tracked.length > 0) {
          for (const animal of tracked) {
            const [x1Norm, y1Norm, x2Norm, y2Norm] = animal.smoothedBox;
            const x = x1Norm * W;
            const y = y1Norm * H;
            const w = Math.max(20, (x2Norm - x1Norm) * W);
            const h = Math.max(20, (y2Norm - y1Norm) * H);

            const isSelected = selectedId ? animal.id === selectedId : animal.isSelected;
            const strokeColor = isSelected ? '#43A047' : 'rgba(255, 255, 255, 0.7)';
            const fillColor = isSelected ? 'rgba(67, 160, 71, 0.12)' : 'rgba(255, 255, 255, 0.05)';

            // Fill bounding box
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, w, h);

            // Border
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.strokeRect(x, y, w, h);

            // Sleek Corner Accents
            const cornerLen = Math.min(22, w * 0.25, h * 0.25);
            ctx.strokeStyle = isSelected ? '#81C784' : '#FFFFFF';
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';

            // Top-Left
            ctx.beginPath();
            ctx.moveTo(x, y + cornerLen);
            ctx.lineTo(x, y);
            ctx.lineTo(x + cornerLen, y);
            ctx.stroke();

            // Top-Right
            ctx.beginPath();
            ctx.moveTo(x + w - cornerLen, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + cornerLen);
            ctx.stroke();

            // Bottom-Left
            ctx.beginPath();
            ctx.moveTo(x, y + h - cornerLen);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + cornerLen, y + h);
            ctx.stroke();

            // Bottom-Right
            ctx.beginPath();
            ctx.moveTo(x + w - cornerLen, y + h);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x + w, y + h - cornerLen);
            ctx.stroke();

            // Target crosshair if selected
            if (isSelected) {
              const cx = x + w / 2;
              const cy = y + h / 2;
              const r = Math.min(16, w * 0.15, h * 0.15);
              ctx.strokeStyle = 'rgba(67, 160, 71, 0.8)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Label Badge: GOAT · SIDE VIEW (94%) / SHEEP · FRONT VIEW (91%)
            const angleSuffix = animal.angleLabel ? ` · ${animal.angleLabel.toUpperCase()}` : (autoScan.angleLabel ? ` · ${autoScan.angleLabel.toUpperCase()}` : '');
            const labelText = `${animal.species.toUpperCase()}${angleSuffix} (${Math.round(animal.confidence * 100)}%)`;
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            const textWidth = ctx.measureText(labelText).width;
            const tagH = 22;
            const tagW = textWidth + 16;
            const tagX = Math.max(6, Math.min(W - tagW - 6, x));
            const tagY = Math.max(tagH + 4, y - 6);

            ctx.fillStyle = isSelected ? '#2E7D32' : 'rgba(15, 23, 42, 0.88)';
            ctx.beginPath();
            ctx.roundRect(tagX, tagY - tagH, tagW, tagH, 6);
            ctx.fill();

            ctx.strokeStyle = isSelected ? '#43A047' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(labelText, tagX + 8, tagY - 7);
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(renderOverlay);
    };

    animFrameRef.current = requestAnimationFrame(renderOverlay);
    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [autoScan.trackedAnimals, autoScan.selectedTargetId, autoScan.state, permission]);

  // ── Save Assessment ───────────────────────────────────────────────────────
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
      toast('Veterinary assessment saved to farm health records.', 'success');
      refresh();
    } catch (err: any) {
      toast(`Could not save: ${err?.message}`, 'error');
    } finally { setSaving(false); }
  }, [autoScan.result, autoScan.capturedCanvas, user, selectedAnimalId, toast, refresh]);

  // ── Trigger AI Cloud Consultation ────────────────────────────────────────
  const handleAskAICloud = (result: ScanResult, animalName?: string, tagId?: string) => {
    const animalLabel = animalName ? `${animalName} (${tagId || 'Tag ID'})` : 'ang na-scan na hayop';
    const conditions = result.possibleConditions?.join(', ') || result.primaryIndicators.join(', ') || 'Normal';
    const risk = result.riskLevel || 'MODERATE';
    const observations = result.observations?.join('. ') || result.explanation || '';

    const promptText = `Kumusta AI Cloud. Nagsagawa ako ng AI Camera Health Scan para kay ${animalLabel}.

Resulta ng Scan:
- Uri ng Hayop: ${result.species ? result.species.toUpperCase() : 'GOAT/SHEEP'}
- Antas ng Panganib (Risk Level): ${risk} (Score: ${result.riskScore}/100)
- Posibleng Kondisyon: ${conditions}
- Mga Visual Observation: ${observations}

Ano ang mga inirerekomendang veterinary first-aid at clinical action plan para sa kambing/tupa na ito bago dumating ang lisensyadong beterinaryo?`;

    const snapshotUrl = autoScan.capturedCanvas ? autoScan.capturedCanvas.toDataURL('image/jpeg', 0.8) : undefined;

    window.dispatchEvent(new CustomEvent('alpas:consult-vet-ai', {
      detail: {
        prompt: promptText,
        animalId: selectedAnimalId,
        scanResult: result,
        image: snapshotUrl,
      }
    }));
  };

  // ── Metrics Computation ───────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const scannedToday = screenings.filter(s => s.created_at && s.created_at.startsWith(todayStr)).length;
  const criticalCases = screenings.filter(s => (s.risk_level === 'CRITICAL' || (s.risk_score != null && s.risk_score >= 75))).length;
  const highRiskCases = screenings.filter(s => (s.risk_level === 'HIGH' || (s.risk_score != null && s.risk_score >= 50 && s.risk_score < 75))).length;
  const moderateRiskCases = screenings.filter(s => (s.risk_level === 'MODERATE' || (s.risk_score != null && s.risk_score >= 28 && s.risk_score < 50))).length;
  const lowRiskCases = screenings.filter(s => (s.risk_level === 'LOW' || (s.risk_score != null && s.risk_score < 28))).length;

  // Animals Requiring Attention (High or Critical)
  const attentionList = screenings
    .filter(s => s.risk_level === 'CRITICAL' || s.risk_level === 'HIGH' || s.prediction === 'possible_health_concern')
    .slice(0, 10)
    .map(s => ({
      ...s,
      animalName: farmData.animals.find(a => a.id === s.animal_id)?.name ?? 'Unknown Animal',
      animalTag:  farmData.animals.find(a => a.id === s.animal_id)?.tag_id ?? 'No Tag',
      species:    farmData.animals.find(a => a.id === s.animal_id)?.species ?? 'Goat',
    }));

  const activeAnimals = farmData.animals;
  const det           = autoScan.detection;
  const speciesLabel  = autoScan.detectedSpecies === 'sheep' ? 'Sheep' : 'Goat';
  const borderColor   = permission === 'granted' ? stateColor(autoScan.state) : '#E5EDE6';

  // History enrichment
  const enriched = screenings.map(s => ({
    ...s,
    animalName: farmData.animals.find(a => a.id === s.animal_id)?.name ?? 'Unlinked Scan',
    animalTag:  farmData.animals.find(a => a.id === s.animal_id)?.tag_id ?? '',
    animalType: farmData.animals.find(a => a.id === s.animal_id)?.species ?? 'Goat',
  }));
  const filtered = enriched.filter(s =>
    !search.trim() ||
    s.animalName.toLowerCase().includes(search.toLowerCase()) ||
    s.animalTag.toLowerCase().includes(search.toLowerCase()) ||
    (s.notes && s.notes.toLowerCase().includes(search.toLowerCase())) ||
    (s.indicators && s.indicators.some((ind: string) => ind.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', paddingBottom: 40 }}>

      {/* ── TOP HEADER: Veterinary AI Center ── */}
      <div style={{
        background: 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)',
        borderRadius: 20,
        padding: '24px 28px',
        color: '#FFFFFF',
        marginBottom: 24,
        boxShadow: '0 8px 24px rgba(46, 125, 50, 0.2)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
            <Sparkles size={13} /> AI Clinical Decision Support
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Veterinary AI Center & Health Scanner
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
            Real-time computer vision camera scanning, multimodal vital health analysis, and AI-assisted veterinary guidance for goats and sheep.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              const prompt = 'Kumusta AI Cloud! Nais kong kumonsulta tungkol sa pangkalahatang kalusugan at herd disease prevention para sa aking mga kambing at tupa.';
              window.dispatchEvent(new CustomEvent('alpas:consult-vet-ai', { detail: { prompt } }));
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#FFFFFF',
              color: '#2E7D32',
              border: 'none',
              borderRadius: 12,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
          >
            <Bot size={16} color="#2E7D32" />
            <span>Ask AI Cloud</span>
          </button>
        </div>
      </div>

      {/* ── METRIC CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Scanned Today" value={scannedToday} subLabel="Today's activity" color="#43A047" icon={<Camera size={18} />} />
        <SummaryCard label="Low Risk" value={lowRiskCases} subLabel="Normal appearance" color="#16A34A" icon={<CheckCircle size={18} />} />
        <SummaryCard label="Moderate Risk" value={moderateRiskCases} subLabel="Monitor within 24h" color="#D97706" icon={<Activity size={18} />} />
        <SummaryCard label="High Risk" value={highRiskCases} subLabel="Requires isolation" color="#EA580C" icon={<AlertTriangle size={18} />} />
        <SummaryCard label="Critical Cases" value={criticalCases} subLabel="Immediate vet care" color="#DC2626" icon={<ShieldAlert size={18} />} />
      </div>

      {/* ── TAB BAR ── */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 20,
        background: '#FFFFFF',
        border: '1px solid #E5EDE6',
        borderRadius: 14,
        padding: 5,
        width: 'fit-content',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}>
        {[
          { key: 'scan',      label: 'Live AI Scanner',                icon: <ScanLine size={15} /> },
          { key: 'attention', label: `Attention List (${attentionList.length})`, icon: <AlertTriangle size={15} /> },
          { key: 'history',   label: 'Screening History',              icon: <History size={15} /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 18px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              background: tab === t.key ? '#43A047' : 'transparent',
              color: tab === t.key ? '#FFFFFF' : '#4B5563',
              boxShadow: tab === t.key ? '0 4px 12px rgba(67, 160, 71, 0.25)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 1: LIVE AI HEALTH SCANNER
         ═════════════════════════════════════════════════════════════════════════ */}
      {tab === 'scan' && (
        <div className="scanner-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: 20, alignItems: 'start' }}>

          {/* LEFT: Camera Viewport */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Species Detection Mode Guidance */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#FFFFFF',
              border: '1px solid #E5EDE6',
              borderRadius: 14,
              padding: '8px 14px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} color="#43A047" /> Target Species:
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'auto',  label: 'Auto Detect' },
                  { key: 'goat',  label: 'Goat (Kambing)' },
                  { key: 'sheep', label: 'Sheep (Tupa)' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setSpeciesMode(item.key as any)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: speciesMode === item.key ? '1px solid #43A047' : '1px solid #E5EDE6',
                      background: speciesMode === item.key ? '#E8F5E9' : '#FFFFFF',
                      color: speciesMode === item.key ? '#2E7D32' : '#6B7280',
                      fontSize: 12,
                      fontWeight: speciesMode === item.key ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-Animal Target Selection Chips */}
            {permission === 'granted' && autoScan.trackedAnimals && autoScan.trackedAnimals.length > 0 && autoScan.state !== 'other_detected' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                background: '#FFFFFF',
                border: '1px solid #E5EDE6',
                borderRadius: 14,
                padding: '8px 14px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {autoScan.trackedAnimals.length > 1 ? `Target Animal (${autoScan.trackedAnimals.length} detected):` : 'Target Lock:'}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {autoScan.trackedAnimals.map((animal) => {
                    const isSelected = autoScan.selectedTargetId ? animal.id === autoScan.selectedTargetId : animal.isSelected;
                    return (
                      <button
                        key={animal.id}
                        onClick={() => autoScan.setSelectedTarget(animal.id)}
                        className={`target-animal-chip ${isSelected ? 'active' : ''}`}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          border: isSelected ? '2px solid #43A047' : '1px solid #D1D5DB',
                          background: isSelected ? '#E8F5E9' : '#FFFFFF',
                          color: isSelected ? '#2E7D32' : '#4B5563',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 2px 8px rgba(67,160,71,0.25)' : 'none',
                        }}
                      >
                        <Activity size={12} color={isSelected ? '#2E7D32' : '#9CA3AF'} />
                        <span>{animal.label} ({Math.round(animal.confidence * 100)}%)</span>
                        {isSelected && <Check size={12} color="#2E7D32" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 9:16 Vertical Portrait Camera Viewport */}
            <div
              className="camera-container"
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 420,
                aspectRatio: '9 / 16',
                margin: '0 auto',
                overflow: 'hidden',
                borderRadius: 24,
                background: '#000000',
                border: `2px solid ${borderColor}`,
                boxShadow: permission === 'granted' ? `0 0 28px ${borderColor}33` : '0 4px 16px rgba(0,0,0,0.1)',
                transition: 'border-color 0.4s, box-shadow 0.4s',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: permission === 'granted' ? 'block' : 'none',
                }}
              />

              {/* Real-time Dynamic Bounding Box Canvas Overlay */}
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  display: permission === 'granted' ? 'block' : 'none',
                }}
              />

              {/* No-camera states */}
              {permission !== 'granted' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
                  {permission === 'pending'        && <Loader2 size={36} color="#43A047" style={{ animation: 'spin 1s linear infinite' }} />}
                  {permission === 'denied'         && <WifiOff size={38} color="#DC2626" />}
                  {permission === 'unavailable'    && <Camera size={38} color="#9CA3AF" />}
                  {permission === 'https_required' && <Camera size={38} color="#9CA3AF" />}
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>
                    {permission === 'pending'        && 'Starting camera stream...'}
                    {permission === 'denied'         && 'Camera access denied'}
                    {permission === 'unavailable'    && 'No camera device detected'}
                    {permission === 'https_required' && 'HTTPS is required for camera'}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, maxWidth: 300 }}>
                    {permission === 'denied'         && 'Camera permission is required for automatic health screening. Please enable camera permissions in your browser settings.'}
                    {permission === 'unavailable'    && 'No active camera was found on this device. You can still upload photos.'}
                    {permission === 'https_required' && 'Camera access requires a secure connection (HTTPS).'}
                  </div>
                  {(permission === 'denied' || permission === 'unavailable') && (
                    <button
                      onClick={() => startCamera()}
                      style={{
                        padding: '10px 22px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#43A047',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        marginTop: 4,
                      }}
                    >
                      Retry Camera
                    </button>
                  )}
                </div>
              )}

              {/* Live HUD Overlay Elements */}
              {permission === 'granted' && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

                  {/* NON-TARGET WARNING BANNER */}
                  {autoScan.state === 'other_detected' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.88)',
                      backdropFilter: 'blur(6px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 12,
                      padding: 24,
                      textAlign: 'center',
                      zIndex: 20,
                    }}>
                      <div style={{
                        width: 60,
                        height: 60,
                        borderRadius: 30,
                        background: 'rgba(220, 38, 38, 0.2)',
                        border: '2px solid #DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <ShieldAlert size={32} color="#DC2626" />
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#DC2626' }}>
                        This is not a goat or sheep!
                      </div>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#FFFFFF',
                        background: 'rgba(220, 38, 38, 0.25)',
                        border: '1px solid rgba(220, 38, 38, 0.5)',
                        borderRadius: 10,
                        padding: '8px 18px',
                      }}>
                        Hindi ito kambing o tupa
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, maxWidth: 300 }}>
                        Pakitapat ang camera sa kambing o tupa. Ang AI Health Scanner ay para lamang sa mga kambing at tupa.
                      </div>
                    </div>
                  )}

                  {/* Scan line effect during health scanning */}
                  {autoScan.state === 'scanning' && (
                    <div style={{
                      position: 'absolute',
                      left: '4%',
                      right: '4%',
                      height: 3,
                      background: 'linear-gradient(90deg, transparent, #2563EB, #60A5FA, transparent)',
                      boxShadow: '0 0 12px #2563EB',
                      animation: 'scanLine 1.5s ease-in-out infinite',
                      zIndex: 10,
                    }} />
                  )}

                  {/* Top-left Angle Indicator Pill */}
                  {autoScan.angleLabel && (
                    <div style={{
                      position: 'absolute',
                      top: 12,
                      left: 12,
                      pointerEvents: 'none',
                      zIndex: 15,
                      background: 'rgba(15, 23, 42, 0.88)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(67, 160, 71, 0.5)',
                      borderRadius: 10,
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#FFFFFF',
                      fontSize: 11,
                      fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}>
                      <Compass size={13} color="#4ADE80" />
                      <span>{autoScan.angleLabel} ({autoScan.angleTagalog})</span>
                    </div>
                  )}

                  {/* Top-right camera flip button */}
                  <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'auto', zIndex: 15 }}>
                    <button
                      onClick={toggleCameraFacing}
                      title="Switch Camera (Front/Rear)"
                      style={{
                        background: 'rgba(0,0,0,0.6)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 10,
                        color: '#FFFFFF',
                        padding: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <SwitchCamera size={16} />
                    </button>
                  </div>

                  {/* Bottom status pill */}
                  <div style={{
                    position: 'absolute',
                    bottom: 14,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(15, 23, 42, 0.88)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 999,
                    padding: '6px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    whiteSpace: 'nowrap',
                    maxWidth: 'calc(100% - 32px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    zIndex: 15,
                  }}>
                    {autoScan.state === 'loading'        && <Loader2 size={13} color="#43A047" style={{ animation: 'spin 1s linear infinite' }} />}
                    {autoScan.state === 'scanning'       && <Loader2 size={13} color="#2563EB" style={{ animation: 'spin 1s linear infinite' }} />}
                    {autoScan.state === 'result'         && <CheckCircle size={13} color="#16A34A" />}
                    {autoScan.state === 'cooldown'       && <RefreshCw size={13} color="#0284C7" />}
                    {autoScan.state === 'other_detected' && <Ban size={13} color="#DC2626" />}
                    {(autoScan.state === 'detecting' || autoScan.state === 'stable') && det?.detected && (
                      <Activity size={13} color="#43A047" />
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {autoScan.message}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2.0-Second Stability & Auto-Scan Verification Progress */}
            {permission === 'granted' && (autoScan.state === 'detecting' || autoScan.state === 'stable') && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E5EDE6',
                borderRadius: 14,
                padding: '12px 16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                maxWidth: 420,
                width: '100%',
                margin: '0 auto',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4B5563', marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: det?.detected ? '#2E7D32' : det?.otherDetected ? '#D97706' : '#6B7280' }}>
                    {det?.detected ? (
                      <><Check size={13} color="#43A047" /> {speciesLabel} detected / Ready for health scan</>
                    ) : det?.otherDetected ? (
                      <><Activity size={13} color="#D97706" /> Sinusuri ang feed...</>
                    ) : (
                      'Naghahanap ng kambing o tupa...'
                    )}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: autoScan.isObserving ? '#2E7D32' : '#9CA3AF' }}>
                    {autoScan.isObserving ? `${autoScan.stabilityRemainingSeconds.toFixed(1)}s (Hold Steady)` : '2.0s Hold Stability'}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#F3F4F6', overflow: 'hidden', marginBottom: 8 }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      background: det?.detected
                        ? 'linear-gradient(90deg, #43A047, #2E7D32)'
                        : det?.otherDetected
                        ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                        : '#E5E7EB',
                      width: `${autoScan.isObserving ? autoScan.stabilityProgress : 0}%`,
                      transition: 'width 0.15s linear',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {autoScan.isObserving
                      ? `Panatilihing nakatutok sa hayop (${autoScan.stabilityProgress}% tapos)...`
                      : 'Itutok ang camera sa kambing o tupa nang 2.0 segundo para sa auto health scan.'}
                  </span>
                  {autoScan.isObserving && (
                    <span style={{ fontWeight: 800, color: det?.detected ? '#2E7D32' : '#D97706' }}>
                      {autoScan.stabilityRemainingSeconds.toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Action Bar */}
            {permission === 'granted' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, width: '100%', margin: '0 auto' }}>
                {/* Instant Scan Button */}
                <button
                  onClick={() => autoScan.triggerManualScan()}
                  disabled={autoScan.state === 'scanning'}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: 12,
                    border: 'none',
                    background: autoScan.state === 'scanning' ? '#9CA3AF' : 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: autoScan.state === 'scanning' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: autoScan.state === 'scanning' ? 'none' : '0 4px 14px rgba(46, 125, 50, 0.25)',
                    transition: 'all 0.2s',
                  }}
                >
                  <Zap size={16} /> Instant Health Scan (Scan Now)
                </button>

                {/* Secondary Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #E5EDE6',
                      background: '#FFFFFF',
                      color: '#1F2937',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Upload size={14} color="#43A047" /> Upload Photo
                  </button>

                  <button
                    onClick={autoScan.rescan}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #E5EDE6',
                      background: '#FFFFFF',
                      color: '#1F2937',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <RefreshCw size={14} color="#43A047" /> Rescan Camera
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
            )}
          </div>

          {/* RIGHT: AI Veterinary Assessment Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Animal Linking Selector */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E5EDE6',
              borderRadius: 14,
              padding: '14px 16px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Link to Animal Record (Optional)
              </div>
              <select
                value={selectedAnimalId}
                onChange={e => { setSelectedAnimalId(e.target.value); setSavedId(null); }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 9,
                  border: '1px solid #D1D5DB',
                  background: '#F9FAFB',
                  color: '#1F2937',
                  fontSize: 13,
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                <option value="">-- Unlinked Scan (Herd-wide) --</option>
                {activeAnimals.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.tag_id}) · {a.species}
                  </option>
                ))}
              </select>
              {selectedAnimal ? (
                <div style={{ marginTop: 8, fontSize: 11, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={12} /> Linked: {selectedAnimal.name} ({selectedAnimal.tag_id}) — Vitals & history will be fused with scan.
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                  Select an animal to automatically merge recent vitals, weight, and history with this scan.
                </div>
              )}
            </div>

            {/* ── WAITING / SCANNING STATES ── */}
            {(autoScan.state === 'idle' || autoScan.state === 'loading' || autoScan.state === 'detecting' || autoScan.state === 'stable') && !autoScan.result && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E5EDE6',
                borderRadius: 16,
                padding: '36px 20px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <Stethoscope size={40} color="#43A047" style={{ opacity: 0.85 }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937', marginBottom: 6 }}>
                  Ready for AI Health Screening
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                  Point your camera at a goat or sheep in good lighting. The AI system will detect the animal, analyze visual indicators, and produce clinical recommendations.
                </div>
              </div>
            )}

            {autoScan.state === 'scanning' && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 16,
                padding: '36px 20px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
              }}>
                <Loader2 size={36} color="#2563EB" style={{ animation: 'spin 1s linear infinite', marginBottom: 14 }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937', marginBottom: 6 }}>
                  Analyzing Health Condition...
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
                  Extracting posture, facial discharge signatures, and coat texture metrics...
                </div>
              </div>
            )}

            {/* ── ASSESSMENT RESULT CARD ── */}
            {(autoScan.state === 'result' || autoScan.state === 'cooldown') && autoScan.result && (
              <ScanResultCard
                result={autoScan.result}
                capturedUrl={autoScan.capturedUrl}
                species={autoScan.detectedSpecies ?? 'goat'}
                animalName={selectedAnimal?.name}
                animalTag={selectedAnimal?.tag_id}
                saving={saving}
                savedId={savedId}
                onSave={handleSave}
                onAskAICloud={() => handleAskAICloud(autoScan.result!, selectedAnimal?.name, selectedAnimal?.tag_id)}
                onRescan={autoScan.rescan}
              />
            )}

          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 2: ANIMALS REQUIRING ATTENTION
         ═════════════════════════════════════════════════════════════════════════ */}
      {tab === 'attention' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E5EDE6', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <AlertTriangle size={20} color="#EA580C" />
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1F2937' }}>
                  Animals Requiring Veterinary Attention
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
                  High and critical risk cases identified by recent AI camera screenings and vital checks.
                </p>
              </div>
            </div>

            {attentionList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B7280' }}>
                <CheckCircle size={36} color="#16A34A" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>All Scanned Animals in Good Condition</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>No high or critical health concerns detected recently.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {attentionList.map(item => {
                  const rRisk = item.risk_level || 'HIGH';
                  return (
                    <div key={item.id} style={{
                      border: `1px solid ${riskBorder(rRisk)}`,
                      background: riskBg(rRisk),
                      borderRadius: 14,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#1F2937' }}>{item.animalName}</div>
                            <div style={{ fontSize: 11, color: '#6B7280' }}>Tag: {item.animalTag} · {item.species}</div>
                          </div>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: riskColor(rRisk),
                            color: '#FFFFFF',
                          }}>
                            {rRisk} RISK ({item.risk_score || 70}%)
                          </span>
                        </div>

                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                          {item.notes || 'Visual indicators show possible respiratory or postural discomfort.'}
                        </div>

                        <div style={{ fontSize: 11, color: '#6B7280' }}>
                          Scanned on {formatDate(item.created_at)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => {
                            setSelectedAnimalId(item.animal_id);
                            setTab('scan');
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid #D1D5DB',
                            background: '#FFFFFF',
                            color: '#1F2937',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                          }}
                        >
                          <Camera size={13} /> Scan Again
                        </button>

                        <button
                          onClick={() => {
                            const prompt = `Kumusta AI Cloud! Nais kong magtanong tungkol sa kalagayan ni ${item.animalName} (${item.animalTag}). Ang nakaraang AI scan result ay nagpahiwatig ng ${rRisk} RISK. Ano ang dapat kong agarang gawin?`;
                            window.dispatchEvent(new CustomEvent('alpas:consult-vet-ai', { detail: { prompt, animalId: item.animal_id } }));
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#2E7D32',
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                          }}
                        >
                          <Bot size={13} /> Ask AI Cloud
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 3: SCREENING HISTORY
         ═════════════════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Search bar */}
          <div style={{
            display: 'flex',
            gap: 10,
            background: '#FFFFFF',
            border: '1px solid #E5EDE6',
            borderRadius: 14,
            padding: '10px 16px',
            alignItems: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}>
            <Search size={16} color="#9CA3AF" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by animal name, tag ID, or clinical symptom..."
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#1F2937', flex: 1 }}
            />
            <button
              onClick={refresh}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid #E5EDE6',
                background: '#F9FAFB',
                color: '#1F2937',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {/* History Table */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5EDE6', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            {histLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px', color: '#6B7280', fontSize: 13 }}>
                <Loader2 size={18} color="#43A047" style={{ animation: 'spin 1s linear infinite' }} /> Loading screening records...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6B7280' }}>
                <Camera size={38} color="#D1D5DB" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginBottom: 4 }}>No screening records found</div>
                <div style={{ fontSize: 13 }}>Saved AI health screenings will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5EDE6' }}>
                      {['Date', 'Animal', 'Risk Level', 'Confidence', 'Model Version', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 700, color: '#6B7280', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => {
                      const rRisk = s.risk_level || (s.prediction === 'possible_health_concern' ? 'HIGH' : 'LOW');
                      return (
                        <tr
                          key={s.id}
                          style={{ borderBottom: '1px solid #F3F4F6' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 18px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                            {formatDate(s.created_at)}
                          </td>
                          <td style={{ padding: '12px 18px' }}>
                            <div style={{ fontWeight: 700, color: '#1F2937' }}>{s.animalName}</div>
                            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{s.animalTag || 'Unlinked'} · {s.animalType}</div>
                          </td>
                          <td style={{ padding: '12px 18px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 800,
                              background: riskBg(rRisk),
                              color: riskColor(rRisk),
                            }}>
                              <Activity size={11} /> {rRisk} RISK ({s.risk_score || (rRisk === 'LOW' ? 15 : 65)}%)
                            </span>
                          </td>
                          <td style={{ padding: '12px 18px', fontWeight: 700, color: '#1F2937' }}>
                            {Math.round(s.confidence * 100)}%
                          </td>
                          <td style={{ padding: '12px 18px', color: '#6B7280', fontSize: 12 }}>
                            {s.model_version || 'goat-health-v1.0'}
                          </td>
                          <td style={{ padding: '12px 18px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setSelectedHistoryItem(s)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 7,
                                  border: '1px solid #E5EDE6',
                                  background: '#FFFFFF',
                                  color: '#2E7D32',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                View Report
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL FOR HISTORY REPORT ── */}
      {selectedHistoryItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            maxWidth: 580,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Stethoscope size={20} color="#43A047" />
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1F2937' }}>
                  Veterinary AI Screening Report
                </h3>
              </div>
              <button
                onClick={() => setSelectedHistoryItem(null)}
                style={{ background: 'none', border: 'none', padding: 4, color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#F9FAFB', padding: '12px 16px', borderRadius: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Date & Time</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{formatDate(selectedHistoryItem.created_at)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Risk Assessment</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: riskColor(selectedHistoryItem.risk_level || 'LOW') }}>
                    {selectedHistoryItem.risk_level || 'LOW'} ({selectedHistoryItem.risk_score || 20}%)
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>CLINICAL SUMMARY</div>
                <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.6, background: '#F9FAFB', padding: '12px 16px', borderRadius: 12 }}>
                  {selectedHistoryItem.notes || 'Normal clinical observations recorded.'}
                </div>
              </div>

              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 11,
                color: '#1E40AF',
                lineHeight: 1.5,
              }}>
                <Info size={14} style={{ marginBottom: 4 }} />
                <div>AI results are intended for early health monitoring and decision support only. They are not a confirmed veterinary diagnosis. Consult a licensed veterinarian for proper diagnosis and treatment.</div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => setSelectedHistoryItem(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 10,
                    border: '1px solid #E5EDE6',
                    background: '#FFFFFF',
                    color: '#1F2937',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const item = selectedHistoryItem;
                    setSelectedHistoryItem(null);
                    const prompt = `Kumusta AI Cloud. Nais kong kumonsulta tungkol sa screening record na ito: ${item.notes || 'Normal screening'}. Ano ang inirerekomendang veterinary follow-up?`;
                    window.dispatchEvent(new CustomEvent('alpas:consult-vet-ai', { detail: { prompt } }));
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#43A047',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Bot size={15} /> Ask AI Cloud
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CSS Keyframes ── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes scanLine { 0% { top: 15%; opacity: 0.8; } 50% { top: 80%; opacity: 0.4; } 100% { top: 15%; opacity: 0.8; } }
        @media (max-width: 768px) { .scanner-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

// ── Scan Result Card Component ────────────────────────────────────────────────
function ScanResultCard({
  result,
  capturedUrl,
  species,
  animalName,
  animalTag,
  saving,
  savedId,
  onSave,
  onAskAICloud,
  onRescan,
}: {
  result: ScanResult;
  capturedUrl: string | null;
  species: 'goat' | 'sheep';
  animalName?: string;
  animalTag?: string;
  saving: boolean;
  savedId: string | null;
  onSave: () => void;
  onAskAICloud: () => void;
  onRescan: () => void;
}) {
  // Non-target animal fallback
  if (!result.goatDetected) {
    return (
      <div style={{ background: '#FFFFFF', border: '2px solid #DC2626', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.15)' }}>
        {capturedUrl && (
          <img src={capturedUrl} alt="Screened Non-Target" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '20px 18px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <ShieldAlert size={40} color="#DC2626" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#DC2626', marginBottom: 6 }}>
            This is not a goat or sheep!
          </div>
          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6, marginBottom: 16 }}>
            {result.recommendation || 'Hindi ito kambing o tupa. Ang AI Health Screening ay eksklusibo lamang para sa mga kambing at tupa. Mangyaring itapat ang camera o mag-upload ng litrato ng kambing o tupa.'}
          </div>
          <button
            onClick={onRescan}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: '#43A047',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Scan Again
          </button>
        </div>
      </div>
    );
  }

  const rLevel = result.riskLevel || 'LOW';
  const rColor = riskColor(rLevel);
  const rBg = riskBg(rLevel);
  const rBorder = riskBorder(rLevel);

  const possibleConditions = result.possibleConditions || ['Normal Clinical Appearance'];
  const observations = result.observations || [];
  const recommendedActions = result.recommendedActions || [
    'Continue standard daily feeding and clean water provisioning.',
    'Maintain routine vaccination and deworming schedule.',
    'Perform bi-weekly weight checks.',
  ];

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5EDE6',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
    }}>
      {capturedUrl && (
        <div style={{ position: 'relative', width: '100%', maxHeight: 180, overflow: 'hidden' }}>
          <img src={capturedUrl} alt="Captured scan" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <Camera size={12} /> Live Capture
          </div>
        </div>
      )}

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Animal Badge & Species */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: '#E8F5E9', border: '1px solid #C8E6C9', fontSize: 12, fontWeight: 700, color: '#2E7D32' }}>
            <Activity size={13} color="#2E7D32" />
            {species.toUpperCase()} {animalName ? `· ${animalName} (${animalTag || 'Tagged'})` : '· Unlinked Scan'}
          </div>

          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            background: rBg,
            border: `1px solid ${rBorder}`,
            color: rColor,
          }}>
            <Flame size={13} /> {rLevel} RISK ({result.riskScore ?? 15}%)
          </span>
        </div>

        {/* Confidence & Model */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1F2937' }}>{result.confidencePercent}%</div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>AI Confidence</div>
          </div>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1F2937' }}>{result.modelVersion || 'goat-health-v1.0'}</div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>Vision Model</div>
          </div>
        </div>

        {/* Detected Viewing Angle & Morphometric Evaluation */}
        {(result.angleLabel || result.detectedAngle) && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(67, 160, 71, 0.08) 0%, rgba(46, 125, 50, 0.04) 100%)',
            border: '1px solid rgba(67, 160, 71, 0.25)',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#2E7D32' }}>
                <Compass size={14} color="#2E7D32" />
                <span>Detected Angle: {result.angleLabel || result.detectedAngle} ({result.angleTagalog || 'Sinuri'})</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', padding: '2px 8px', borderRadius: 6 }}>
                Multi-Angle AI Verified
              </span>
            </div>
            {result.angleClinicalFocus && (
              <div style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Eye size={13} color="#43A047" style={{ marginTop: 2, flexShrink: 0 }} />
                <span><strong>Clinical Focus:</strong> {result.angleClinicalFocus}</span>
              </div>
            )}
            {result.angleGuidance && (
              <div style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', paddingLeft: 19 }}>
                {result.angleGuidance}
              </div>
            )}
          </div>
        )}

        {/* Possible Health Concerns */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Possible Health Concerns
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {possibleConditions.map((cond, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                color: cond.includes('Normal') ? '#16A34A' : '#EA580C',
                background: cond.includes('Normal') ? 'rgba(22, 163, 74, 0.08)' : 'rgba(234, 88, 12, 0.08)',
                padding: '8px 12px',
                borderRadius: 8,
              }}>
                {cond.includes('Normal') ? <CheckCircle size={14} color="#16A34A" /> : <AlertTriangle size={14} color="#EA580C" />}
                <span>{cond}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Why did AI give this result? */}
        {observations.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Why did the AI give this result?
            </div>
            <div style={{ background: '#F9FAFB', border: '1px solid #E5EDE6', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {observations.map((obs, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                  <span style={{ color: '#43A047', fontWeight: 800 }}>•</span>
                  <span>{obs}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Actions */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Recommended Clinical Actions
          </div>
          <div style={{
            background: rBg,
            border: `1px solid ${rBorder}`,
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}>
            {recommendedActions.map((action, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#1F2937', lineHeight: 1.5 }}>
                <span style={{ color: rColor, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mandatory Safety Disclaimer */}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: 11,
          color: '#1E40AF',
          lineHeight: 1.5,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Decision-Support Notice:</strong> AI results are intended for early health monitoring and decision support only. They are not a confirmed veterinary diagnosis. Consult a licensed veterinarian for proper diagnosis and treatment.
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {/* Ask AI Cloud Button */}
          <button
            onClick={onAskAICloud}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #2E7D32 0%, #43A047 100%)',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              boxShadow: '0 4px 12px rgba(46, 125, 50, 0.2)',
            }}
          >
            <Bot size={16} /> Ask AI Cloud About This Scan
          </button>

          {/* Save & Rescan row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {savedId ? (
              <div style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                background: '#E8F5E9',
                border: '1px solid #C8E6C9',
                color: '#2E7D32',
                fontWeight: 700,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}>
                <Check size={14} /> Saved to Records
              </div>
            ) : (
              <button
                onClick={onSave}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: '1px solid #43A047',
                  background: '#FFFFFF',
                  color: '#2E7D32',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                <span>Save Assessment</span>
              </button>
            )}

            <button
              onClick={onRescan}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                border: '1px solid #E5EDE6',
                background: '#F9FAFB',
                color: '#1F2937',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={13} /> Scan Again
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Metric Card Component ─────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  subLabel,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  subLabel?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5EDE6',
      borderRadius: 16,
      padding: '16px 18px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `${color}18`,
        border: `${color}30 1px solid`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#1F2937', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: '#4B5563', fontWeight: 700, marginTop: 2 }}>
          {label}
        </div>
        {subLabel && (
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
            {subLabel}
          </div>
        )}
      </div>
    </div>
  );
}
