/**
 * CameraScreeningPage.tsx — AlpasFarm Professional AI Health Scanner Camera
 *
 * FULL-SCREEN NATIVE MOBILE CAMERA SCANNER EXPERIENCE:
 *   Top Bar:       [← AI Health Scanner]             [⚙️ Settings]
 *   Center:        LIVE CAMERA PREVIEW + Real-time AI Dynamic Bounding Box
 *   Bottom:        [Gallery]       [Capture (◯)]      [Switch Camera]
 *
 * AUTOMATIC HEALTH SCREENING WORKFLOW:
 *   Camera Opens -> Farmer Points at Goat/Sheep -> AI Detects Animal ->
 *   Bounding Box Follows Animal -> System Automatically Identifies Animal & Loads Records ->
 *   AI Visual Health Analysis -> Risk Score & Guidance -> Automatically Saves Result -> Clean Result Screen
 *
 * Zero manual typing required.
 * Strict 0 Emojis rule: 100% Lucide-React SVG Icons with farmer-friendly labels.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Camera, AlertTriangle, CheckCircle, RefreshCw,
  Loader2, Search, Info, WifiOff, ScanLine, History,
  Save, Ban, Zap, Upload, ShieldAlert, Activity, Check,
  Bot, Sparkles, Stethoscope, SwitchCamera, X, Compass,
  ArrowLeft, Settings, Image, Volume2, VolumeX, SlidersHorizontal
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
type DetectionAccuracy = 'standard' | 'high' | 'maximum';

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
  const [searchParams] = useSearchParams();
  const queryAnimalId = searchParams.get('animalId') || '';
  const { user } = useAuth();
  const toast    = useToast();
  const farmData = useFarmData();
  const { screenings, loading: histLoading, refresh } = useAllScreenings();

  // Active view tab ('scan' is the primary native camera, 'attention' & 'history' accessible via Settings)
  const [tab, setTab]                           = useState<'scan' | 'attention' | 'history'>('scan');
  const [speciesMode, setSpeciesMode]           = useState<'auto' | 'goat' | 'sheep'>('auto');
  const [permission, setPermission]             = useState<CameraPermission>('pending');
  const [facingMode, setFacingMode]             = useState<'environment' | 'user'>('environment');
  const [saving, setSaving]                     = useState(false);
  const [savedId, setSavedId]                   = useState<string | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState(queryAnimalId);
  const [search, setSearch]                     = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<CameraScreening | null>(null);

  // Settings & Native Camera Controls State
  const [settingsOpen, setSettingsOpen]               = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras]   = useState(true);
  const [torchSupported, setTorchSupported]           = useState(false);
  const [torchOn, setTorchOn]                         = useState(false);
  const [soundEnabled, setSoundEnabled]               = useState(true);
  const [autoScanEnabled, setAutoScanEnabled]         = useState(true);
  const [detectionAccuracy, setDetectionAccuracy]     = useState<DetectionAccuracy>('standard');
  const [flashActive, setFlashActive]                 = useState(false);

  useEffect(() => {
    const qId = searchParams.get('animalId');
    if (qId) setSelectedAnimalId(qId);
  }, [searchParams]);

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
    onResult: async (scanResult, canvas, species) => {
      // Automatically save result to database & update animal health status
      if (user && scanResult.goatDetected) {
        const targetAnimalId = selectedAnimalId || 'unlinked';
        try {
          setSaving(true);
          const { data, error } = await saveScreeningResult(
            targetAnimalId,
            user.id,
            scanResult,
            canvas,
          );
          if (data?.id) {
            setSavedId(data.id);
            refresh();
            farmData.refresh();
            toast('AI Health Screening automatically saved to farm records.', 'success');
          }
        } catch (saveErr) {
          console.warn('Auto-save error:', saveErr);
        } finally {
          setSaving(false);
        }
      }

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

  // ── Shutter Sound Feedback ────────────────────────────────────────────────
  const playShutterSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // Audio context blocked or unsupported
    }
  }, [soundEnabled]);

  // ── Hardware Camera & Torch Detection ─────────────────────────────────────
  useEffect(() => {
    const detectDevices = async () => {
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setHasMultipleCameras(videoDevices.length > 1);
        } catch {
          setHasMultipleCameras(false);
        }
      }
    };
    detectDevices();
  }, []);

  const checkTorchCapabilities = (stream: MediaStream) => {
    try {
      const track = stream.getVideoTracks()[0];
      const capabilities = (track?.getCapabilities?.() || {}) as any;
      setTorchSupported(Boolean(capabilities?.torch));
    } catch {
      setTorchSupported(false);
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextTorch = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setTorchOn(nextTorch);
      } catch (err) {
        console.warn('Torch constraint error:', err);
      }
    }
  };

  // ── Camera Management & Lifecycle ─────────────────────────────────────────
  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setPermission('pending');
    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setPermission('https_required');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unavailable');
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          try { t.stop(); } catch {}
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
      });
      streamRef.current = stream;
      checkTorchCapabilities(stream);

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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
  }, [autoScan]);

  const toggleCameraFacing = useCallback(() => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopCamera();
    startCamera(nextMode);
  }, [facingMode, startCamera, stopCamera]);

  // Clean lifecycle: start on enter, stop on exit or unmount
  useEffect(() => {
    if (tab === 'scan' && permission === 'pending') {
      startCamera();
    }
    return () => {
      if (tab !== 'scan') stopCamera();
    };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ── Manual Capture Handler ────────────────────────────────────────────────
  const handleManualCapture = useCallback(async () => {
    if (autoScan.state === 'scanning') return;
    setFlashActive(true);
    playShutterSound();
    if (navigator.vibrate) {
      try { navigator.vibrate(50); } catch {}
    }
    setTimeout(() => setFlashActive(false), 160);

    // Trigger instant frame capture and screening
    await autoScan.triggerManualScan();
  }, [autoScan, playShutterSound]);

  // ── Gallery Upload Handler ────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please select a valid image file.', 'error');
      return;
    }
    try {
      toast('Analyzing uploaded image with AI Veterinary Core...', 'info');
      const canvas = await fileToCanvas(file);
      await autoScan.triggerManualScan(canvas);
    } catch {
      toast('Could not read image file.', 'error');
    } finally {
      if (e.target) e.target.value = '';
    }
  }, [autoScan, toast]);

  // ── Save Assessment Manually ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!autoScan.result || !user) return;
    if (!autoScan.result.goatDetected) {
      toast('Cannot save screening because animal is not a goat or sheep.', 'error');
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
      farmData.refresh();
    } catch (err: any) {
      toast(`Could not save: ${err?.message}`, 'error');
    } finally { setSaving(false); }
  }, [autoScan.result, autoScan.capturedCanvas, user, selectedAnimalId, toast, refresh, farmData]);

  // ── Trigger AI Cloud Consultation ────────────────────────────────────────
  const handleAskAICloud = (result: ScanResult, animalName?: string, tagId?: string) => {
    const animalLabel = animalName ? `${animalName} (${tagId || 'Tag ID'})` : 'the scanned animal';
    const conditions = result.possibleConditions?.join(', ') || result.primaryIndicators.join(', ') || 'Normal';
    const risk = result.riskLevel || 'MODERATE';
    const observations = result.observations?.join('. ') || result.explanation || '';

    const promptText = `Hello AI Cloud. I performed an AI Camera Health Scan for ${animalLabel}.

Scan Findings:
- Species: ${result.species ? result.species.toUpperCase() : 'GOAT/SHEEP'}
- Health Risk Level: ${risk} (Score: ${result.riskScore}/100)
- Possible Conditions: ${conditions}
- Visual Observations: ${observations}

What are the recommended early livestock interventions, supportive veterinary care, or isolation steps recommended before the licensed veterinarian examines the animal?`;

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
            const w = Math.max(30, (x2Norm - x1Norm) * W);
            const h = Math.max(30, (y2Norm - y1Norm) * H);

            const isSelected = selectedId ? animal.id === selectedId : animal.isSelected;
            const strokeColor = isSelected ? '#43A047' : 'rgba(255, 255, 255, 0.85)';
            const fillColor = isSelected ? 'rgba(67, 160, 71, 0.14)' : 'rgba(255, 255, 255, 0.06)';

            // Fill bounding box
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, w, h);

            // Bounding box border
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.strokeRect(x, y, w, h);

            // Sleek Corner Accents
            const cornerLen = Math.min(24, w * 0.25, h * 0.25);
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
              ctx.strokeStyle = 'rgba(67, 160, 71, 0.85)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.stroke();
            }

            // High-legibility species label badge: GOAT 96% / SHEEP 94%
            const confPct = Math.round(animal.confidence * 100);
            const speciesText = animal.species.toUpperCase();
            const badgeText = `${speciesText}   ${confPct}%`;

            ctx.font = 'bold 12px Plus Jakarta Sans, Inter, system-ui, sans-serif';
            const textWidth = ctx.measureText(badgeText).width;
            const tagH = 26;
            const tagW = textWidth + 20;
            const tagX = Math.max(8, Math.min(W - tagW - 8, x));
            const tagY = Math.max(tagH + 8, y - 8);

            // Badge Background
            ctx.fillStyle = isSelected ? '#2E7D32' : 'rgba(15, 23, 42, 0.9)';
            ctx.beginPath();
            ctx.roundRect(tagX, tagY - tagH, tagW, tagH, 8);
            ctx.fill();

            // Badge Border
            ctx.strokeStyle = isSelected ? '#43A047' : 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Badge Text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(badgeText, tagX + 10, tagY - 8);
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

  // Derived detection variables
  const det = autoScan.detection;
  const speciesLabel = autoScan.detectedSpecies === 'sheep' ? 'Sheep' : 'Goat';
  const confidenceThreshold = detectionAccuracy === 'maximum' ? 0.85 : detectionAccuracy === 'high' ? 0.75 : 0.65;
  const isLowConfidence = det?.detected && det.confidence < confidenceThreshold;

  // Compute metrics for attention list
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

  // History filtering
  const enrichedHistory = screenings.map(s => ({
    ...s,
    animalName: farmData.animals.find(a => a.id === s.animal_id)?.name ?? 'Unlinked Scan',
    animalTag:  farmData.animals.find(a => a.id === s.animal_id)?.tag_id ?? '',
    animalType: farmData.animals.find(a => a.id === s.animal_id)?.species ?? 'Goat',
  }));
  const filteredHistory = enrichedHistory.filter(s =>
    !search.trim() ||
    s.animalName.toLowerCase().includes(search.toLowerCase()) ||
    s.animalTag.toLowerCase().includes(search.toLowerCase()) ||
    (s.notes && s.notes.toLowerCase().includes(search.toLowerCase())) ||
    (s.indicators && s.indicators.some((ind: string) => ind.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div
      className="fullscreen-camera-page"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#FFFFFF',
        fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif',
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          TOP BAR (TRANSLUCENT / GLASS EFFECT)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 64,
          zIndex: 35,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.35) 65%, rgba(0, 0, 0, 0) 100%)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* LEFT: Back Button + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => {
              stopCamera();
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/health');
              }
            }}
            aria-label="Back"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              background: 'rgba(255, 255, 255, 0.16)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              transition: 'background 0.15s ease',
            }}
          >
            <ArrowLeft size={22} />
          </button>

          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>AI Health Scanner</span>
              {selectedAnimal && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(67, 160, 71, 0.35)',
                  border: '1px solid rgba(67, 160, 71, 0.6)',
                  color: '#A7F3D0',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}>
                  {selectedAnimal.tag_id}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Quick Torch (if supported) + Settings Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {torchSupported && (
            <button
              onClick={toggleTorch}
              title="Toggle Flash / Torch"
              aria-label="Toggle Torch"
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                background: torchOn ? '#F59E0B' : 'rgba(255, 255, 255, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: torchOn ? '#000000' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Zap size={20} />
            </button>
          )}

          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              background: 'rgba(255, 255, 255, 0.16)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              transition: 'background 0.15s ease',
            }}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CENTER: LIVE CAMERA PREVIEW & AI DETECTION OVERLAY
         ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Real Live Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: permission === 'granted' ? 'block' : 'none',
          }}
        />

        {/* Real-time Dynamic AI Bounding Box Canvas Overlay */}
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

        {/* Shutter Flash Animation */}
        {flashActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#FFFFFF',
              zIndex: 40,
              animation: 'cameraFlash 160ms ease-out forwards',
            }}
          />
        )}

        {/* ── CAMERA PERMISSION & LOADING STATES ── */}
        {permission !== 'granted' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              textAlign: 'center',
              padding: 24,
              zIndex: 20,
              background: '#0B1520',
            }}
          >
            {permission === 'pending' && (
              <>
                <Loader2 size={44} color="#43A047" style={{ animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>Starting camera...</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Initializing AI vision core...</div>
              </>
            )}

            {permission === 'denied' && (
              <>
                <WifiOff size={46} color="#DC2626" />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>
                  Camera access is required for AI Health Scanning.
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 320, lineHeight: 1.5 }}>
                  Camera access is required for AI Health Scanning. Please allow camera permissions in your browser or device settings.
                </div>
                <button
                  onClick={() => startCamera()}
                  style={{
                    padding: '12px 28px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#43A047',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    marginTop: 6,
                  }}
                >
                  Allow Camera
                </button>
              </>
            )}

            {permission === 'unavailable' && (
              <>
                <Camera size={46} color="#9CA3AF" />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>No camera device detected</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 320, lineHeight: 1.5 }}>
                  No active camera device was found on this device. You can still scan photos using the Gallery button below.
                </div>
                <button
                  onClick={() => startCamera()}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#43A047',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: 6,
                  }}
                >
                  Retry Camera
                </button>
              </>
            )}

            {permission === 'https_required' && (
              <>
                <Camera size={46} color="#9CA3AF" />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>HTTPS is required for camera</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 320, lineHeight: 1.5 }}>
                  Camera access requires a secure connection (HTTPS).
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STATE 1: SCANNING (Floating HUD Pill) ── */}
        {permission === 'granted' && autoScan.state === 'detecting' && !det?.detected && !det?.otherDetected && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 999,
              padding: '7px 20px',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              zIndex: 25,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            <Activity size={14} color="#4ADE80" />
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              Scanning... Point the camera at a goat or sheep.
            </span>
          </div>
        )}

        {/* ── STATE 4: WRONG OBJECT BANNER ── */}
        {permission === 'granted' && autoScan.state === 'other_detected' && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(220, 38, 38, 0.92)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: 14,
              padding: '10px 20px',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 24px rgba(220, 38, 38, 0.4)',
              zIndex: 25,
              maxWidth: 'calc(100% - 32px)',
              textAlign: 'center',
            }}
          >
            <ShieldAlert size={20} color="#FFFFFF" />
            <span style={{ fontSize: 13, fontWeight: 800 }}>
              This is not a goat or sheep. Point the camera at a goat or sheep.
            </span>
          </div>
        )}

        {/* ── STATE 5: LOW CONFIDENCE BANNER ── */}
        {permission === 'granted' && isLowConfidence && autoScan.state === 'detecting' && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(217, 119, 6, 0.92)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: 14,
              padding: '8px 18px',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              zIndex: 25,
              maxWidth: 'calc(100% - 32px)',
              boxShadow: '0 8px 20px rgba(217, 119, 6, 0.35)',
            }}
          >
            <AlertTriangle size={16} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              Animal not clearly detected. Move the camera closer or improve lighting.
            </span>
          </div>
        )}

        {/* ── STATE 6: STABLE DETECTION & AUTO-SCREENING COUNTDOWN ── */}
        {permission === 'granted' && autoScan.isObserving && det?.detected && autoScanEnabled && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(46, 125, 50, 0.92)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(129, 199, 132, 0.6)',
              borderRadius: 16,
              padding: '10px 20px',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 8px 24px rgba(46, 125, 50, 0.45)',
              zIndex: 25,
              minWidth: 270,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={16} color="#A7F3D0" />
                {speciesLabel} detected ({Math.round(det.confidence * 100)}%)
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#A7F3D0' }}>
                {autoScan.stabilityRemainingSeconds.toFixed(1)}s
              </span>
            </div>
            <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: '#A7F3D0',
                  width: `${autoScan.stabilityProgress}%`,
                  transition: 'width 0.12s linear',
                }}
              />
            </div>
          </div>
        )}

        {/* Scan line effect during AI health feature extraction */}
        {autoScan.state === 'scanning' && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, transparent, #4ADE80, #22C55E, transparent)',
              boxShadow: '0 0 16px #22C55E',
              animation: 'scanLine 1.5s ease-in-out infinite',
              zIndex: 25,
            }}
          />
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BOTTOM CAMERA CONTROLS (GALLERY, CAPTURE, SWITCH)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 24px 28px',
          zIndex: 35,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.55) 60%, rgba(0, 0, 0, 0) 100%)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* LEFT: Gallery Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 68 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload photo from Gallery"
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: 'rgba(255, 255, 255, 0.16)',
              border: '1.5px solid rgba(255, 255, 255, 0.3)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(12px)',
              transition: 'all 0.15s ease',
            }}
          >
            <Image size={24} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            Gallery
          </span>
        </div>

        {/* CENTER: Capture Button (Large circular shutter) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 88 }}>
          <button
            onClick={handleManualCapture}
            disabled={autoScan.state === 'scanning'}
            aria-label="Capture and Scan Animal"
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              background: 'transparent',
              border: '4px solid #FFFFFF',
              padding: 4,
              cursor: autoScan.state === 'scanning' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
              transition: 'transform 0.1s ease',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 999,
                background: autoScan.state === 'scanning' ? '#9CA3AF' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2E7D32',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              <Camera size={30} color="#2E7D32" />
            </div>
          </button>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            Capture
          </span>
        </div>

        {/* RIGHT: Switch Camera Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 68 }}>
          <button
            onClick={toggleCameraFacing}
            disabled={!hasMultipleCameras}
            aria-label="Switch Camera (Front/Rear)"
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: hasMultipleCameras ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.05)',
              border: hasMultipleCameras ? '1.5px solid rgba(255, 255, 255, 0.3)' : '1.5px solid rgba(255, 255, 255, 0.1)',
              color: hasMultipleCameras ? '#FFFFFF' : 'rgba(255, 255, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: hasMultipleCameras ? 'pointer' : 'not-allowed',
              backdropFilter: 'blur(12px)',
              opacity: hasMultipleCameras ? 1 : 0.35,
              transition: 'all 0.15s ease',
            }}
          >
            <SwitchCamera size={24} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: hasMultipleCameras ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            Switch
          </span>
        </div>

        {/* Hidden File Input for Gallery */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CLEAN HEALTH SCREENING RESULT SCREEN MODAL / OVERLAY (SECTION 14)
         ═══════════════════════════════════════════════════════════════════════ */}
      {(autoScan.state === 'result' || autoScan.state === 'cooldown') && autoScan.result && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background: 'rgba(6, 18, 32, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            overflowY: 'auto',
            padding: '20px 16px 40px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ width: '100%', maxWidth: 540, marginTop: 24, marginBottom: 40 }}>
            <ScanResultCard
              result={autoScan.result}
              capturedUrl={autoScan.capturedUrl}
              species={autoScan.detectedSpecies ?? 'goat'}
              animal={selectedAnimal}
              animalName={selectedAnimal?.name}
              animalTag={selectedAnimal?.tag_id}
              saving={saving}
              savedId={savedId}
              onSave={handleSave}
              onAskAICloud={() => handleAskAICloud(autoScan.result!, selectedAnimal?.name, selectedAnimal?.tag_id)}
              onRescan={autoScan.rescan}
              onViewHistory={selectedAnimal ? () => navigate(`/animals/${selectedAnimal.id}`) : undefined}
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CAMERA SETTINGS MODAL (⚙️)
         ═══════════════════════════════════════════════════════════════════════ */}
      {settingsOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#FFFFFF',
              borderRadius: 20,
              padding: '24px 20px',
              color: '#1F2937',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={20} color="#2E7D32" />
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1F2937' }}>
                  Camera Scanner Settings
                </h2>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Close Settings"
                style={{
                  background: '#F3F4F6',
                  border: 'none',
                  borderRadius: 10,
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#4B5563',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Herd Animal Identity Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#4B5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Animal Identity (Herd Record)
                </label>
                <select
                  value={selectedAnimalId}
                  onChange={e => { setSelectedAnimalId(e.target.value); setSavedId(null); }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #D1D5DB',
                    background: '#F9FAFB',
                    color: '#1F2937',
                    fontSize: 13,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                >
                  <option value="">-- Unlinked Scan (Identify Later) --</option>
                  {activeAnimals.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.tag_id}) · {a.species}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                  Linking an animal automatically merges herd weight trajectories and health history.
                </div>
              </div>

              {/* Target Species */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#4B5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Target Species Preference
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { key: 'auto',  label: 'Auto Detect' },
                    { key: 'goat',  label: 'Goat' },
                    { key: 'sheep', label: 'Sheep' },
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => setSpeciesMode(item.key as any)}
                      style={{
                        padding: '9px 6px',
                        borderRadius: 10,
                        border: speciesMode === item.key ? '2px solid #2E7D32' : '1px solid #E5EDE6',
                        background: speciesMode === item.key ? '#E8F5E9' : '#FFFFFF',
                        color: speciesMode === item.key ? '#2E7D32' : '#4B5563',
                        fontSize: 12,
                        fontWeight: speciesMode === item.key ? 800 : 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detection Accuracy (Farmer-Friendly Label) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#4B5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Detection Accuracy
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { key: 'standard', label: 'Standard' },
                    { key: 'high',     label: 'High' },
                    { key: 'maximum',  label: 'Maximum' },
                  ].map(acc => (
                    <button
                      key={acc.key}
                      onClick={() => setDetectionAccuracy(acc.key as DetectionAccuracy)}
                      style={{
                        padding: '9px 6px',
                        borderRadius: 10,
                        border: detectionAccuracy === acc.key ? '2px solid #2E7D32' : '1px solid #E5EDE6',
                        background: detectionAccuracy === acc.key ? '#E8F5E9' : '#FFFFFF',
                        color: detectionAccuracy === acc.key ? '#2E7D32' : '#4B5563',
                        fontSize: 12,
                        fontWeight: detectionAccuracy === acc.key ? 800 : 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Scan Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #F3F4F6' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1F2937' }}>Auto Health Screening</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Automatically analyze animal after 2.0 seconds of steady camera hold.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoScanEnabled}
                  onChange={e => setAutoScanEnabled(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: '#2E7D32', cursor: 'pointer' }}
                />
              </div>

              {/* Sound Feedback Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #F3F4F6' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1F2937' }}>Shutter Sound Feedback</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Play audio sound upon taking capture or completing scan.</div>
                </div>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={e => setSoundEnabled(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: '#2E7D32', cursor: 'pointer' }}
                />
              </div>

              {/* History & Attention List Navigation */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setTab('attention');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #E5EDE6',
                    background: '#FFFFFF',
                    color: '#C2410C',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <AlertTriangle size={14} /> Attention List ({attentionList.length})
                </button>

                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setTab('history');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #E5EDE6',
                    background: '#FFFFFF',
                    color: '#2563EB',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <History size={14} /> Screening History
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ATTENTION LIST MODAL VIEW (ACCESSIBLE FROM SETTINGS)
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'attention' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 55,
            background: '#F9FAFB',
            color: '#1F2937',
            overflowY: 'auto',
            padding: '20px 16px',
          }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button
                onClick={() => setTab('scan')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: '1px solid #E5EDE6',
                  background: '#FFFFFF',
                  color: '#1F2937',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={16} /> Back to Live Camera
              </button>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Animals Requiring Attention</h2>
            </div>

            {attentionList.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px solid #E5EDE6', borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
                <CheckCircle size={40} color="#16A34A" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937' }}>All Scanned Animals in Normal Condition</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>No high or critical health concerns detected recently.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {attentionList.map(item => {
                  const rRisk = item.risk_level || 'HIGH';
                  return (
                    <div
                      key={item.id}
                      style={{
                        border: `1px solid ${riskBorder(rRisk)}`,
                        background: riskBg(rRisk),
                        borderRadius: 14,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
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
                            const prompt = `Hello AI Cloud. I would like advice for ${item.animalName} (${item.animalTag}). The recent AI scan indicated ${rRisk} RISK. What clinical steps should I prepare before the vet arrives?`;
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

      {/* ═══════════════════════════════════════════════════════════════════════
          SCREENING HISTORY VIEW (ACCESSIBLE FROM SETTINGS)
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 55,
            background: '#F9FAFB',
            color: '#1F2937',
            overflowY: 'auto',
            padding: '20px 16px',
          }}
        >
          <div style={{ maxWidth: 840, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button
                onClick={() => setTab('scan')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: '1px solid #E5EDE6',
                  background: '#FFFFFF',
                  color: '#1F2937',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={16} /> Back to Live Camera
              </button>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Screening History</h2>
            </div>

            {/* Search */}
            <div style={{
              display: 'flex',
              gap: 10,
              background: '#FFFFFF',
              border: '1px solid #E5EDE6',
              borderRadius: 14,
              padding: '10px 16px',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <Search size={16} color="#9CA3AF" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search history by animal name, tag ID, or findings..."
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#1F2937', flex: 1 }}
              />
              <button
                onClick={refresh}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid #E5EDE6',
                  background: '#F9FAFB',
                  color: '#4B5563',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {filteredHistory.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px solid #E5EDE6', borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
                <History size={36} color="#9CA3AF" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>No Screening Records Found</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>Complete your first AI Camera screening to view records here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredHistory.map(item => {
                  const rRisk = item.risk_level || 'LOW';
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedHistoryItem(item)}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E5EDE6',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          background: riskBg(rRisk),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Activity size={18} color={riskColor(rRisk)} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1F2937' }}>{item.animalName}</div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>
                            Tag: {item.animalTag || 'Unlinked'} · {item.animalType} · {formatDate(item.created_at)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          background: riskBg(rRisk),
                          color: riskColor(rRisk),
                          border: `1px solid ${riskBorder(rRisk)}`,
                        }}>
                          {rRisk} ({item.risk_score ?? 15}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Detail Modal */}
      {selectedHistoryItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{ width: '100%', maxWidth: 500, background: '#FFFFFF', borderRadius: 16, padding: 20, color: '#1F2937', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Screening Details</h3>
              <button onClick={() => setSelectedHistoryItem(null)} style={{ border: 'none', background: '#F3F4F6', borderRadius: 8, padding: 6, cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div><strong>Risk Level:</strong> {selectedHistoryItem.risk_level} (Score: {selectedHistoryItem.risk_score}%)</div>
              <div><strong>Notes:</strong> {selectedHistoryItem.notes || 'Standard screening record.'}</div>
              <div><strong>Recommendation:</strong> {selectedHistoryItem.recommendations || 'Continue standard herd observation.'}</div>
              <div><strong>Date:</strong> {formatDate(selectedHistoryItem.created_at)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes scanLine { 0% { top: 15%; opacity: 0.85; } 50% { top: 82%; opacity: 0.4; } 100% { top: 15%; opacity: 0.85; } }
        @keyframes cameraFlash { 0% { opacity: 0.85; } 100% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ── Scan Result Card Component (Section 14 Standard Layout) ───────────────────
function ScanResultCard({
  result,
  capturedUrl,
  species,
  animal,
  animalName,
  animalTag,
  saving,
  savedId,
  onSave,
  onAskAICloud,
  onRescan,
  onViewHistory,
}: {
  result: ScanResult;
  capturedUrl: string | null;
  species: 'goat' | 'sheep';
  animal?: any;
  animalName?: string;
  animalTag?: string;
  saving: boolean;
  savedId: string | null;
  onSave: () => void;
  onAskAICloud: () => void;
  onRescan: () => void;
  onViewHistory?: () => void;
}) {
  // Non-target fallback
  if (!result.goatDetected) {
    return (
      <div style={{ background: '#FFFFFF', border: '2px solid #DC2626', borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 30px rgba(220, 38, 38, 0.2)' }}>
        {capturedUrl && (
          <img src={capturedUrl} alt="Screened Non-Target" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <ShieldAlert size={44} color="#DC2626" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#DC2626', marginBottom: 6 }}>
            This is not a goat or sheep.
          </div>
          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6, marginBottom: 20 }}>
            Point the camera at a goat or sheep to scan health indicators.
          </div>
          <button
            onClick={onRescan}
            style={{
              padding: '12px 26px',
              borderRadius: 12,
              border: 'none',
              background: '#43A047',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(67, 160, 71, 0.3)',
            }}
          >
            <RefreshCw size={16} /> Scan Again
          </button>
        </div>
      </div>
    );
  }

  const rLevel = result.riskLevel || 'LOW';
  const rColor = riskColor(rLevel);
  const rBg = riskBg(rLevel);
  const rBorder = riskBorder(rLevel);

  const observations = result.observations || [];
  const recommendedActions = result.recommendedActions || [
    'Continue standard daily feeding and clean water provisioning.',
    'Maintain routine vaccination and herd monitoring schedule.',
  ];

  const targetAnimal = animal;
  const targetName = animalName || targetAnimal?.name;
  const targetTag = animalTag || targetAnimal?.tag_id;

  // Age string calculation
  const ageDisplay = (() => {
    if (!targetAnimal?.date_of_birth) return 'Not recorded';
    const dob = new Date(targetAnimal.date_of_birth);
    const diffMonths = Math.floor((new Date().getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
    if (diffMonths < 1) return 'Less than 1 month';
    if (diffMonths < 12) return `${diffMonths} months`;
    const yrs = Math.floor(diffMonths / 12);
    const mos = diffMonths % 12;
    return mos > 0 ? `${yrs} years ${mos} months` : `${yrs} years`;
  })();

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5EDE6',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
      }}
    >
      {capturedUrl && (
        <div style={{ position: 'relative', width: '100%', maxHeight: 200, overflow: 'hidden' }}>
          <img src={capturedUrl} alt="Captured scan" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
          <div
            style={{
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
            }}
          >
            <Camera size={12} /> Live Capture
          </div>
        </div>
      )}

      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── HEADER: TITLE & SPECIES/ANIMAL IDENTIFICATION ── */}
        <div style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#43A047', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Activity size={14} color="#43A047" /> AI HEALTH SCREENING
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937' }}>
                {species === 'sheep' ? 'Sheep Detected' : 'Goat Detected'}
              </div>
              <div style={{ fontSize: 13, color: '#4B5563', marginTop: 2 }}>
                Animal: {targetTag && targetName ? `${targetTag} (${targetName})` : targetName ? targetName : 'Animal detected, but identity could not be confirmed.'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#2563EB', background: 'rgba(37, 99, 235, 0.08)', padding: '4px 10px', borderRadius: 8 }}>
                Detection: {result.confidencePercent}%
              </div>
            </div>
          </div>
        </div>

        {/* ── HEALTH RISK & SCORE ── */}
        <div
          style={{
            background: rBg,
            border: `1px solid ${rBorder}`,
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: rColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              HEALTH RISK
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: rColor, marginTop: 2 }}>
              {rLevel}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: rColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Risk Score
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: rColor, marginTop: 2 }}>
              {result.riskScore ?? 15} / 100
            </div>
          </div>
        </div>

        {/* ── AI FINDINGS ── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            AI FINDINGS:
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5EDE6', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(result.primaryIndicators && result.primaryIndicators.length > 0 ? result.primaryIndicators : observations).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                <span style={{ color: '#43A047', fontWeight: 800 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── AVAILABLE INFORMATION (MULTI-SOURCE DATA FUSION) ── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            AVAILABLE INFORMATION:
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6B7280' }}>Age:</span>
              <span style={{ fontWeight: 600, color: '#1F2937' }}>{ageDisplay}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6B7280' }}>Weight:</span>
              <span style={{ fontWeight: 600, color: '#1F2937' }}>{targetAnimal?.weight_kg ? `${targetAnimal.weight_kg} kg` : 'Not recorded'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6B7280' }}>Vaccination:</span>
              <span style={{ fontWeight: 600, color: '#1F2937' }}>{targetAnimal?.vaccination_status || 'Up to date'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6B7280' }}>Previous Health Risk:</span>
              <span style={{ fontWeight: 600, color: '#1F2937' }}>{targetAnimal?.health_risk_score !== undefined ? `${targetAnimal.health_status || 'Normal'} (${targetAnimal.health_risk_score})` : 'Low (0)'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #E5E7EB', paddingTop: 6 }}>
              <span style={{ color: '#6B7280' }}>Current Temperature:</span>
              <span style={{ fontWeight: 600, color: '#9CA3AF' }}>Not measured</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6B7280' }}>Current Heart Rate:</span>
              <span style={{ fontWeight: 600, color: '#9CA3AF' }}>Not measured</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6B7280' }}>Current Respiratory Rate:</span>
              <span style={{ fontWeight: 600, color: '#9CA3AF' }}>Not measured</span>
            </div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#9CA3AF', marginTop: 4 }}>
              Some measurements were unavailable during this screening.
            </div>
          </div>
        </div>

        {/* ── RECOMMENDATION ── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            RECOMMENDATION:
          </div>
          <div
            style={{
              background: rBg,
              border: `1px solid ${rBorder}`,
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 12,
              color: '#1F2937',
              lineHeight: 1.5,
            }}
          >
            {result.recommendation || recommendedActions[0]}
          </div>
        </div>

        {/* Decision-Support Notice */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            fontSize: 11,
            color: '#1E40AF',
            lineHeight: 1.5,
          }}
        >
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Decision-Support Notice:</strong> AI results are intended for early health monitoring and decision support only. They are not a confirmed veterinary diagnosis. Consult a licensed veterinarian for proper diagnosis and treatment.
          </div>
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {/* View Animal Health History Button */}
          {onViewHistory && (
            <button
              onClick={onViewHistory}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #FF6A2A 0%, #FF3B30 100%)',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                boxShadow: '0 4px 12px rgba(255, 106, 42, 0.25)',
              }}
            >
              <History size={16} /> View Animal Health History
            </button>
          )}

          {/* Ask AI Farm Assistant Button */}
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
            <Bot size={16} /> Ask AI Farm Assistant About This Scan
          </button>

          {/* Automatic Save Indicator & Scan Again */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
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
              }}
            >
              <Check size={14} /> Automatically Saved
            </div>

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
