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
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Camera, AlertTriangle, CheckCircle, RefreshCw,
  Loader2, Search, Info, WifiOff, History,
  Zap, ShieldAlert, Activity, Check,
  Bot, SwitchCamera, X, Play,
  ArrowLeft, Settings, Image, Thermometer, Compass,
  ChevronDown, ChevronUp, Eye, HeartPulse, Heart, Pill, Stethoscope
} from 'lucide-react';
import { useAllScreenings, saveScreeningResult, type CameraScreening } from '../lib/useCameraScreenings';
import { useFarmData } from '../lib/useFarmData';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useAutoScan } from '../lib/useAutoScan';
import { formatDate } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { fileToCanvas, type ScanResult } from '../lib/cameraML';
import {
  type RuleBasedScreeningResult,
  type CombinedScreeningAssessment,
  combineScreeningAssessments,
  runRuleBasedScreening,
} from '../lib/ruleBasedScreening';
import { FARM_LABELS, simplifyHealthObservation } from '../lib/farmerTerminology';
import { getTemperatureStatus } from '../lib/geminiScanner';
import { consumeInventoryStock, isMedicineCategory, isDewormerCategory, isSupplementCategory } from '../lib/inventoryOperations';

// ── Types ─────────────────────────────────────────────────────────────────────
type CameraPermission = 'pending' | 'granted' | 'denied' | 'unavailable' | 'https_required';
type DetectionAccuracy = 'standard' | 'high' | 'maximum';

// ── Color Helpers (Farm & Nature Palette) ──────────────────────────────────────
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
  const { screenings, refresh } = useAllScreenings();

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
          const { data } = await saveScreeningResult(
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

  const autoScanRef = useRef(autoScan);
  useEffect(() => {
    autoScanRef.current = autoScan;
  }, [autoScan]);

  const [isStreamActive, setIsStreamActive] = useState(false);

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
      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setHasMultipleCameras(videoDevices.length > 1 || isMobile);
        } catch {
          setHasMultipleCameras(isMobile);
        }
      } else {
        setHasMultipleCameras(isMobile);
      }
    };
    detectDevices();
  }, [permission]);

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
  const stopCamera = useCallback(() => {
    try {
      autoScanRef.current?.stopAutoScan();
    } catch {}
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
    setIsStreamActive(false);
  }, []); // Strictly empty dependency array so this reference never changes!

  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setPermission('pending');
    setIsStreamActive(false);
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
        streamRef.current = null;
      }

      // Progressive constraint fallback to guarantee mobile compatibility
      const constraintCandidates: MediaTrackConstraints[] = [
        {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        {
          facingMode: { ideal: mode },
        },
        {
          facingMode: mode,
        },
        {},
      ];

      let stream: MediaStream | null = null;
      let lastErr: any = null;

      for (const videoConstraint of constraintCandidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: false,
          });
          if (stream && stream.getVideoTracks().length > 0) {
            break;
          }
        } catch (e: any) {
          lastErr = e;
          console.warn('[Camera] Constraint attempt failed:', videoConstraint, e);
        }
      }

      if (!stream) {
        throw lastErr || new Error('No camera stream could be acquired');
      }

      streamRef.current = stream;
      checkTorchCapabilities(stream);

      // Force video tracks active
      stream.getVideoTracks().forEach(t => {
        t.enabled = true;
      });

      const video = videoRef.current;
      if (video) {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = stream;

        try {
          await video.play();
          setIsStreamActive(true);
        } catch (playErr) {
          console.warn('[Camera] Initial play failed, retrying muted play:', playErr);
          video.muted = true;
          try {
            await video.play();
            setIsStreamActive(true);
          } catch (err2) {
            console.error('[Camera] Play retry error:', err2);
          }
        }
      }

      setPermission('granted');
      autoScanRef.current?.startAutoScan();
    } catch (err: any) {
      console.error('[Camera] startCamera error:', err);
      const msg = (err?.message ?? '').toLowerCase();
      setPermission(msg.includes('permission') || err?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }
  }, [facingMode]);

  const toggleCameraFacing = useCallback(() => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopCamera();
    startCamera(nextMode);
  }, [facingMode, startCamera, stopCamera]);

  // Clean lifecycle: start on enter
  useEffect(() => {
    if (tab === 'scan' && permission === 'pending') {
      startCamera();
    }
  }, [tab, permission, startCamera]);

  // Stop camera strictly on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Keep video element synced with stream whenever permission updates
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.srcObject = stream;
      video.play().then(() => setIsStreamActive(true)).catch(e => console.warn('[Camera] Sync play error:', e));
    }
  }, [permission]);

  // Handle mobile backgrounding/tab switching to wake camera if paused
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && tab === 'scan') {
        const v = videoRef.current;
        if (v && v.srcObject && (v.paused || v.ended)) {
          v.play().then(() => setIsStreamActive(true)).catch(console.warn);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [tab]);

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
  const handleSave = useCallback(async (medicationId?: string) => {
    if (!autoScan.result || !user) return;
    if (!autoScan.result.goatDetected) {
      toast('Hindi mai-save ang pagsusuri dahil hindi ito kambing o tupa.', 'error');
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

      // If medication was chosen and animal is linked, deduct inventory stock & log treatment
      if (medicationId && animalId !== 'unlinked') {
        const item = farmData.inventory.find(i => i.id === medicationId);
        const animal = farmData.animals.find(a => a.id === animalId);
        if (item && animal && item.quantity > 0) {
          await consumeInventoryStock({
            userId: user.id,
            isSuperAdmin: false,
            item,
            quantity: 1,
            usageType: 'medication',
            animalId: animal.id,
            animalTag: animal.tag_id,
            animalName: animal.name,
            referenceType: 'animal',
            referenceId: animal.id,
            reason: `Gamot mula sa AI Health Check: ${item.name}`,
            notes: `Ibinigay pagkatapos ng Camera Screening. Gamot: ${item.name} (1 ${item.unit}).`,
          });
        }
      }

      toast('Nai-save ang health check sa talaan ng bukid.', 'success');
      refresh();
      farmData.refresh();
    } catch (err: any) {
      toast(`Hindi mai-save: ${err?.message}`, 'error');
    } finally { setSaving(false); }
  }, [autoScan.result, autoScan.capturedCanvas, user, selectedAnimalId, toast, refresh, farmData]);

  // ── Trigger AI Cloud Consultation ────────────────────────────────────────
  const handleAskAICloud = (result: ScanResult, aName?: string, tagId?: string) => {
    const animalLabel = aName ? `${aName} (${tagId || 'Tag ID'})` : 'the scanned animal';
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
          for (const a of tracked) {
            const [x1Norm, y1Norm, x2Norm, y2Norm] = a.smoothedBox;
            const x = x1Norm * W;
            const y = y1Norm * H;
            const w = Math.max(30, (x2Norm - x1Norm) * W);
            const h = Math.max(30, (y2Norm - y1Norm) * H);

            const isSelected = selectedId ? a.id === selectedId : a.isSelected;
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

            // High-legibility species label badge: KAMBING / TUPA
            const speciesText = a.species.toLowerCase() === 'sheep' ? 'TUPA' : 'KAMBING';
            const badgeText = speciesText;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, marginRight: 8 }}>
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
              flexShrink: 0,
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

          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Camera Health Screening</span>
              {selectedAnimal && (
                <span style={{
                  flexShrink: 0,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
        onClick={() => {
          // Tap video container to resume playback if suspended by mobile OS
          const v = videoRef.current;
          if (v && v.srcObject && (v.paused || v.ended)) {
            v.play().then(() => setIsStreamActive(true)).catch(console.warn);
          } else if (!streamRef.current && permission === 'granted') {
            startCamera();
          }
        }}
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
        {/* Real Live Video Feed — Always mounted with display: block for mobile decoder initialization */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // @ts-ignore
          webkit-playsinline="true"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            v.play().then(() => setIsStreamActive(true)).catch(err => console.warn('[Video] onLoadedMetadata play catch:', err));
          }}
          onCanPlay={(e) => {
            const v = e.currentTarget;
            v.play().then(() => setIsStreamActive(true)).catch(err => console.warn('[Video] onCanPlay play catch:', err));
          }}
          onPlaying={() => setIsStreamActive(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            zIndex: 1,
            background: '#000000',
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
            zIndex: 10,
            display: permission === 'granted' ? 'block' : 'none',
          }}
        />

        {/* Manual Tap-to-Wake Camera button if auto-play was blocked or stream waiting */}
        {permission === 'granted' && !isStreamActive && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              const v = videoRef.current;
              if (v && v.srcObject) {
                v.muted = true;
                v.play().then(() => setIsStreamActive(true)).catch(() => startCamera());
              } else {
                startCamera();
              }
            }}
            style={{
              position: 'absolute',
              zIndex: 26,
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: 16,
              padding: '14px 22px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ADE80', fontSize: 14, fontWeight: 800 }}>
              <Play size={18} fill="#4ADE80" />
              <span>Simulan ang Camera Feed</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 220 }}>
              Pindutin dito kung hindi pa lumalabas ang video ng camera
            </div>
          </div>
        )}

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
              zIndex: 30,
              background: '#0B1520',
            }}
          >
            {permission === 'pending' && (
              <>
                <Loader2 size={44} color="#43A047" style={{ animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>Sinisimulan ang camera...</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Inihahanda ang camera screening...</div>
              </>
            )}

            {permission === 'denied' && (
              <>
                <WifiOff size={46} color="#DC2626" />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>
                  Kailangan ang pahintulot sa camera para makapag-scan ng hayop.
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 320, lineHeight: 1.5 }}>
                  Pahintulutan ang camera sa iyong browser o device settings upang magamit ang Camera Health Screening.
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
                  Pahintulutan ang Camera
                </button>
              </>
            )}

            {permission === 'unavailable' && (
              <>
                <Camera size={46} color="#9CA3AF" />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>Walang nakitang camera sa device</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 320, lineHeight: 1.5 }}>
                  Walang aktibong camera na nakita sa device. Maaari mo pa ring gamitin ang litrato mula sa Gallery sa ibaba.
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
                  Subukan Ulit ang Camera
                </button>
              </>
            )}

            {permission === 'https_required' && (
              <>
                <Camera size={46} color="#9CA3AF" />
                <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>Kailangan ang HTTPS para sa camera</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 320, lineHeight: 1.5 }}>
                  Ang access sa camera ay nangangailangan ng ligtas na koneksyon (HTTPS).
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SELECTED ANIMAL HUD PILL ── */}
        {permission === 'granted' && selectedAnimal && (
          <div
            style={{
              position: 'absolute',
              top: 122,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.78)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: 999,
              padding: '4px 14px',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              zIndex: 24,
              whiteSpace: 'nowrap',
              fontSize: 11,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
          >
            <Activity size={13} color="#22C55E" />
            <span style={{ color: '#86EFAC' }}>{selectedAnimal.tag_id}</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span style={{ color: '#E2E8F0' }}>{selectedAnimal.name}</span>
          </div>
        )}

        {/* ── STATE 0: AI MODEL LOADING (Non-blocking Pill) ── */}
        {permission === 'granted' && autoScan.state === 'loading' && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.85)',
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
            <Loader2 size={14} color="#4ADE80" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              Inihahanda ang camera scanner...
            </span>
          </div>
        )}

        {/* ── STATE 1: SCANNING / PROMPT GUIDANCE (Floating HUD Pill) ── */}
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
              color: '#F8FAFC',
              padding: '8px 18px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 20,
              maxWidth: '90%',
              textAlign: 'center',
            }}
          >
            <Compass size={16} color="#38BDF8" className="animate-pulse" />
            <span>Itapat ang camera sa isang kambing o tupa</span>
          </div>
        )}

        {/* ── STATE 2: ANIMAL DETECTED & STABILIZING (Green Progress HUD) ── */}
        {permission === 'granted' && autoScan.state === 'detecting' && det?.detected && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(20, 83, 45, 0.92)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1.5px solid #4ADE80',
              color: '#FFFFFF',
              padding: '10px 18px',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 8px 24px rgba(46, 125, 50, 0.45)',
              zIndex: 25,
              minWidth: 270,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={16} color="#A7F3D0" />
                {speciesLabel === 'Sheep' ? 'Tupa detected' : 'Kambing detected'}
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

        {/* ── STATE 4: WRONG OBJECT BANNER (MANDATE 11) ── */}
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
              Parang hindi kambing o tupa ang nasa camera. Iposisyon nang maayos ang hayop sa gitna ng camera.
            </span>
          </div>
        )}

        {/* ── STATE 5: LOW CONFIDENCE BANNER (MANDATE 11) ── */}
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
              Mahina ang pagkakakita. Lumapit nang kaunti at tiyaking malinaw ang hayop.
            </span>
          </div>
        )}

        {/* ── STATE 6: STABLE DETECTION & AUTO-SCREENING COUNTDOWN (STEP 3) ── */}
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
                {speciesLabel === 'Sheep' ? 'Tupa detected' : 'Kambing detected'}
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

        {/* ── CAMERA GUIDANCE HELPER (Section 10) ── */}
        {permission === 'granted' && autoScan.state !== 'result' && autoScan.state !== 'scanning' && (
          <div
            style={{
              position: 'absolute',
              bottom: 116,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.78)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: 999,
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              zIndex: 25,
              whiteSpace: 'nowrap',
              maxWidth: '92%',
              overflowX: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9' }}>Ilapit nang kaunti</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9' }}>Siguraduhing maliwanag</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9' }}>Itutok sa hayop</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9' }}>Kita ang buong katawan</span>
          </div>
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
            Kumuha
          </span>
        </div>

        {/* RIGHT: Switch Camera Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 70, flexShrink: 0 }}>
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
              opacity: hasMultipleCameras ? 1 : 0.4,
              transition: 'all 0.15s ease',
            }}
          >
            <SwitchCamera size={24} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: hasMultipleCameras ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)', textShadow: '0 1px 3px rgba(0,0,0,0.7)', whiteSpace: 'nowrap' }}>
            Magpalit
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
              ruleResult={autoScan.ruleResult}
              combined={autoScan.combinedAssessment}
              capturedUrl={autoScan.capturedUrl}
              species={autoScan.detectedSpecies ?? 'goat'}
              animal={selectedAnimal}
              animalName={selectedAnimal?.name}
              animalTag={selectedAnimal?.tag_id}
              animals={farmData.animals}
              inventory={farmData.inventory}
              onSelectAnimal={(id) => setSelectedAnimalId(id)}
              saving={saving}
              savedId={savedId}
              onSave={handleSave}
              onManualCheck={() => {
                stopCamera();
                const targetId = selectedAnimalId || selectedAnimal?.id || '';
                navigate(targetId ? `/health?action=check&animalId=${targetId}` : `/health?action=check`);
              }}
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
                  Mga Setting ng Camera Scanner
                </h2>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Isara ang Settings"
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
                  Pangalan / Tag ng Hayop
                </label>
                <select
                  className="form-select"
                  value={selectedAnimalId}
                  onChange={e => { setSelectedAnimalId(e.target.value); setSavedId(null); }}
                  style={{
                    width: '100%',
                    padding: '10px 36px 10px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                >
                  <option value="">-- Walang Napiling Hayop (I-link Mamaya) --</option>
                  {activeAnimals.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.tag_id}) · {a.species === 'Sheep' ? 'Tupa' : 'Kambing'}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                  Ang pagpili ng hayop ay awtomatikong mag-uugnay sa timbang at kasaysayan ng kalusugan nito.
                </div>
              </div>

              {/* Target Species */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#4B5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Uri ng Hayop (Species)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { key: 'auto',  label: 'Auto Detect' },
                    { key: 'goat',  label: 'Kambing' },
                    { key: 'sheep', label: 'Tupa' },
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
                  Linaw ng Pagsusuri
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { key: 'standard', label: 'Standard' },
                    { key: 'high',     label: 'Mataas' },
                    { key: 'maximum',  label: 'Pinakamataas' },
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
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1F2937' }}>Kusang Pag-scan (Auto-Scan)</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Awtomatikong susuriin ang hayop kapag steady ang camera nang 2 segundo.</div>
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
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1F2937' }}>Tunog ng Shutter</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Magpatunog kapag kumuha ng litrato o natapos ang pagsusuri.</div>
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
                  <AlertTriangle size={14} /> Mga Kailangang Bantayan ({attentionList.length})
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
                    color: '#176B35',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <History size={14} /> Kasaysayan ng Screening
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
                <ArrowLeft size={16} /> Bumalik sa Live Camera
              </button>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Mga Hayop na Kailangang Bantayan</h2>
            </div>

            {attentionList.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px solid #E5EDE6', borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
                <CheckCircle size={40} color="#16A34A" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937' }}>Maayos ang Kalagayan ng Lahat ng Na-scan</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>Walang napansing seryosong problema sa kalusugan kamakailan.</div>
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
                            <div style={{ fontSize: 11, color: '#6B7280' }}>Tag: {item.animalTag} · {item.species === 'Sheep' ? 'Tupa' : 'Kambing'}</div>
                          </div>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: riskColor(rRisk),
                            color: '#FFFFFF',
                          }}>
                            {rRisk === 'CRITICAL' ? 'Mataas ang Risk' : rRisk === 'HIGH' ? 'Kailangan ng Atensyon' : rRisk === 'MODERATE' ? 'Bantayan' : 'Maayos'} ({item.risk_score || 70}%)
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                          {item.notes || 'May napansing kakaibang senyales sa kilos o tindig.'}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>
                          Na-scan noong {formatDate(item.created_at)}
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
                          <Camera size={13} /> I-scan Ulit
                        </button>
                        <button
                          onClick={() => {
                            const prompt = `Kamusta AI Farm Assistant. Nais kong humingi ng payo para kay ${item.animalName} (${item.animalTag}). Ang resulta ng AI scan ay ${rRisk}. Anong paunang lunas o pag-aalaga ang dapat ihanda bago dumating ang beterinaryo?`;
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
                          <Bot size={13} /> Itanong sa AI
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
                <ArrowLeft size={16} /> Bumalik sa Live Camera
              </button>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Kasaysayan ng Screening</h2>
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
                placeholder="Maghanap ayon sa pangalan, tag ID, o nakita sa scan..."
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
              <div><strong>Recommendation:</strong> {selectedHistoryItem.recommendation || 'Continue standard herd observation.'}</div>
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

// ── Scan Result Card Component (Simplified Farmer-Friendly UI) ───────────────
function ScanResultCard({
  result,
  ruleResult,
  combined,
  capturedUrl,
  species,
  animal,
  animalName,
  animalTag,
  animals,
  inventory,
  onSelectAnimal,
  saving,
  savedId,
  onSave,
  onManualCheck,
  onAskAICloud,
  onRescan,
  onViewHistory,
}: {
  result: ScanResult;
  ruleResult?: RuleBasedScreeningResult | null;
  combined?: CombinedScreeningAssessment | null;
  capturedUrl: string | null;
  species: 'goat' | 'sheep';
  animal?: any;
  animalName?: string;
  animalTag?: string;
  animals?: any[];
  inventory?: any[];
  onSelectAnimal?: (animalId: string) => void;
  saving: boolean;
  savedId: string | null;
  onSave: (medicationId?: string) => void;
  onManualCheck?: () => void;
  onAskAICloud: () => void;
  onRescan: () => void;
  onViewHistory?: () => void;
}) {
  const [selectedMedId, setSelectedMedId] = useState('');
  const targetAnimal = animal;
  const targetName = animalName || targetAnimal?.name;
  const targetTag = animalTag || targetAnimal?.tag_id;

  // Non-target fallback
  if (!result.goatDetected) {
    return (
      <div style={{ background: 'var(--surface, #FFFFFF)', border: '2px solid #DC2626', borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 30px rgba(220, 38, 38, 0.2)' }}>
        {capturedUrl && (
          <img src={capturedUrl} alt="Screened Non-Target" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <ShieldAlert size={44} color="#DC2626" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#DC2626', marginBottom: 6 }}>
            Parang hindi kambing o tupa ang nasa camera.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #4B5563)', lineHeight: 1.6, marginBottom: 20 }}>
            Iposisyon nang maayos ang hayop sa gitna ng camera bago mag-scan.
          </div>
          <button
            onClick={onRescan}
            style={{
              padding: '12px 26px',
              borderRadius: 12,
              border: 'none',
              background: '#238B45',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(35, 139, 69, 0.3)',
            }}
          >
            <RefreshCw size={16} /> Subukang Mag-scan Ulit
          </button>
        </div>
      </div>
    );
  }

  // Combine ML and rule-based screening behind the scenes
  const finalCombined = combined || combineScreeningAssessments(result, ruleResult || null);

  // Available medicines in farm inventory with quantity > 0
  const availableMedicines = useMemo(() => {
    return (inventory || []).filter(item => {
      const isMed = isMedicineCategory(item.category) || isDewormerCategory(item.category) || isSupplementCategory(item.category) || item.category === 'Medicine' || item.category === 'Supplies';
      return isMed && Number(item.quantity) > 0;
    });
  }, [inventory]);

  // 4 Standard Farmer Health Statuses
  const farmerStatus = useMemo(() => {
    const riskLvl = (result.riskLevel || '').toUpperCase();
    const score = result.riskScore ?? 0;
    
    // Check if medication is required: Critical risk or indicators pointing to illness
    const hasMedNeed = riskLvl === 'CRITICAL' || score >= 80 || (result.possibleConditions && result.possibleConditions.some(c => 
      c.toLowerCase().includes('wound') || c.toLowerCase().includes('severe') || c.toLowerCase().includes('pneumonia') || c.toLowerCase().includes('lagnat')
    ));

    if (hasMedNeed) {
      return {
        key: 'gamot',
        label: 'Kailangan ng Gamot',
        badgeBg: 'rgba(220, 38, 38, 0.1)',
        badgeBorder: '#DC2626',
        badgeColor: '#DC2626',
        Icon: Pill,
        recommendation: 'May napansing kondisyon na nangangailangan ng paggamot. Tiyakin ang tamang gamot mula sa stock at kumonsulta sa beterinaryo kung kinakailangan.',
      };
    }

    if (riskLvl === 'HIGH' || score >= 55) {
      return {
        key: 'atensyon',
        label: 'Kailangan ng Atensyon',
        badgeBg: 'rgba(234, 88, 12, 0.1)',
        badgeBorder: '#EA580C',
        badgeColor: '#EA580C',
        Icon: AlertTriangle,
        recommendation: 'May napansing kondisyon na dapat bantayan. Obserbahan ang hayop at magsagawa ng manual health check kung kinakailangan.',
      };
    }

    if (riskLvl === 'MODERATE' || score >= 25) {
      return {
        key: 'bantayan',
        label: 'Bantayan',
        badgeBg: 'rgba(217, 119, 6, 0.1)',
        badgeBorder: '#D97706',
        badgeColor: '#D97706',
        Icon: Eye,
        recommendation: 'Obserbahan ang hayop sa susunod na 24–48 oras. Suriin kung may pagbabago sa gana kumain o sigla.',
      };
    }

    return {
      key: 'maayos',
      label: 'Maayos',
      badgeBg: 'rgba(22, 163, 74, 0.1)',
      badgeBorder: '#16A34A',
      badgeColor: '#16A34A',
      Icon: Heart,
      recommendation: 'Normal at malusog ang kalagayan ng hayop. Panatilihin ang maayos na pagkain at malinis na inumin.',
    };
  }, [result]);

  const StatusIcon = farmerStatus.Icon;

  // Temperature display (Only if physical sensor measurement exists)
  const temp = result.estimatedTemperature ?? (targetAnimal?.current_temperature ?? null);
  const tempDisplay = temp !== null && temp !== undefined ? `${temp.toFixed(1)}°C` : 'Temperatura: Hindi nasukat';

  // Simplified bulleted observations
  const observationsList = useMemo(() => {
    const list: string[] = [];
    if (result.observations && result.observations.length > 0) {
      result.observations.forEach(o => {
        const clean = simplifyHealthObservation(o);
        if (clean && !list.includes(clean)) list.push(clean);
      });
    }
    if (result.primaryIndicators && result.primaryIndicators.length > 0) {
      result.primaryIndicators.forEach(i => {
        const clean = simplifyHealthObservation(i);
        if (clean && !list.includes(clean)) list.push(clean);
      });
    }
    if (list.length === 0) {
      if (farmerStatus.key === 'maayos') {
        list.push('Normal ang galaw at tindig');
        list.push('Walang nakitang malinaw na problema sa balahibo o katawan');
      } else {
        list.push('May napansing bahagyang pagbabago sa hitsura o kilos ng hayop');
      }
    }
    return list;
  }, [result, farmerStatus.key]);

  return (
    <div
      style={{
        background: 'var(--surface, #FFFFFF)',
        border: '1px solid var(--border, #E5EDE6)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg, 0 12px 36px rgba(0,0,0,0.25))',
      }}
    >
      {/* Live capture preview */}
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
            <Camera size={12} /> Litrato ng Hayop
          </div>
        </div>
      )}

      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header: HEALTH CHECK */}
        <div style={{ borderBottom: '1px solid var(--border-subtle, #F3F4F6)', paddingBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#238B45', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} color="#238B45" /> HEALTH CHECK
          </div>

          {targetAnimal ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #1F2937)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{targetName || (species === 'sheep' ? 'Tupa' : 'Kambing')}</span>
                  {targetTag && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#238B45', background: 'rgba(35, 139, 69, 0.1)', padding: '2px 8px', borderRadius: 6 }}>
                      {targetTag}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary, #4B5563)', marginTop: 2 }}>
                  Uri: <strong>{species === 'sheep' ? 'Tupa' : 'Kambing'}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', background: 'rgba(22, 163, 74, 0.08)', padding: '4px 10px', borderRadius: 8 }}>
                  Camera Screening
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400E' }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} color="#D97706" />
                <span>Hayop na nakita, pero hindi matukoy kung alin sa iyong mga hayop.</span>
              </div>
              <div style={{ fontSize: 12, marginBottom: 8, color: '#78350F' }}>
                Piliin ang hayop mula sa iyong listahan upang mai-ugnay ang health check na ito:
              </div>
              {animals && animals.length > 0 && (
                <select
                  onChange={(e) => onSelectAnimal?.(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #D97706',
                    background: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>-- Piliin ang hayop sa iyong bukid --</option>
                  {animals.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.tag_id} – {a.species === 'Sheep' ? 'Tupa' : 'Kambing'}{a.name ? ` (${a.name})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Farmer Health Status Badge (1 of 4: Maayos | Bantayan | Kailangan ng Atensyon | Kailangan ng Gamot) */}
        <div
          style={{
            background: farmerStatus.badgeBg,
            border: `1.5px solid ${farmerStatus.badgeBorder}`,
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          >
            <StatusIcon size={24} color={farmerStatus.badgeColor} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: farmerStatus.badgeColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              RESULTA NG HEALTH CHECK
            </div>
            <div style={{ fontSize: 19, fontWeight: 900, color: farmerStatus.badgeColor, marginTop: 1 }}>
              {farmerStatus.label}
            </div>
          </div>
        </div>

        {/* Body Temperature (Sensor Only or Hindi Nasukat) */}
        <div
          style={{
            background: 'var(--bg-secondary, #F9FAFB)',
            border: '1px solid var(--border, #E5EDE6)',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Thermometer size={18} color={temp !== null ? '#16A34A' : '#6B7280'} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #1F2937)' }}>
              {tempDisplay}
            </span>
          </div>
          {temp === null && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary, #6B7280)' }}>
              Walang thermometer sensor
            </span>
          )}
        </div>

        {/* Napansing Kondisyon (Clean Bulleted List) */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary, #374151)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            MGA NAPANSING KONDISYON:
          </div>
          <div style={{ background: 'var(--bg-secondary, #F9FAFB)', border: '1px solid var(--border, #E5EDE6)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {observationsList.map((item: string, idx: number) => (
              <div key={idx} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-primary, #374151)', lineHeight: 1.5 }}>
                <span style={{ color: farmerStatus.badgeColor, fontWeight: 800 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rekomendasyon (Non-diagnostic guidance) */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary, #374151)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            SUSUNOD NA GAGAWIN:
          </div>
          <div
            style={{
              background: farmerStatus.badgeBg,
              border: `1px solid ${farmerStatus.badgeBorder}`,
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--text-primary, #1F2937)',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {farmerStatus.recommendation}
          </div>
        </div>

        {/* Medication Selector (Only shown if Kailangan ng Gamot) */}
        {farmerStatus.key === 'gamot' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Pill size={16} color="#DC2626" />
              <span>Paggamot at Imbentaryo</span>
            </div>
            <div style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 10 }}>
              Dahilan: May napansing kondisyon na nangangailangan ng agarang gamot o suporta.
            </div>

            {availableMedicines.length > 0 ? (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Pumili ng Gamot mula sa Stock:
                </label>
                <select
                  value={selectedMedId}
                  onChange={(e) => setSelectedMedId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    background: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="">-- Pumili ng Gamot ({availableMedicines.length} may stock) --</option>
                  {availableMedicines.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.quantity} {m.unit} natitira)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ background: '#FFF1F2', border: '1px solid #FDA4AF', borderRadius: 8, padding: '10px 12px', color: '#9F1239', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>Ang gamot na ito ay wala o kulang sa iyong stock.</span>
              </div>
            )}
          </div>
        )}

        {/* Main Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {/* Primary Save Button */}
          <button
            onClick={() => onSave(selectedMedId || undefined)}
            disabled={saving}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 12,
              border: 'none',
              background: savedId ? '#15803D' : 'linear-gradient(135deg, #238B45 0%, #176B35 100%)',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(35, 139, 69, 0.3)',
            }}
          >
            <Check size={18} />
            <span>{savedId ? 'Nai-save Na sa Talaan' : saving ? 'Sini-save...' : 'I-save ang Health Check'}</span>
          </button>

          {/* Secondary Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onRescan}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                border: '1px solid var(--border, #E5EDE6)',
                background: 'var(--bg-secondary, #F9FAFB)',
                color: 'var(--text-primary, #1F2937)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={13} /> Muling Mag-scan
            </button>

            {onManualCheck && (
              <button
                onClick={onManualCheck}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: '1px solid var(--border, #E5EDE6)',
                  background: 'var(--bg-secondary, #F9FAFB)',
                  color: 'var(--text-primary, #1F2937)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <HeartPulse size={13} /> Manual Check
              </button>
            )}
          </div>

          {onViewHistory && (
            <button
              onClick={onViewHistory}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 10,
                border: '1px solid var(--border, #E5EDE6)',
                background: 'var(--surface, #FFFFFF)',
                color: '#238B45',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <History size={14} /> Tingnan ang Talaan ng Hayop
            </button>
          )}
        </div>

        {/* Collapsible Detalye ng Pagsusuri (Hidden by default) */}
        <details
          style={{
            marginTop: 6,
            background: 'var(--bg-secondary, #F9FAFB)',
            border: '1px solid var(--border, #E5EDE6)',
            borderRadius: 10,
            padding: '10px 14px',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-secondary, #6B7280)',
              outline: 'none',
            }}
          >
            Detalye ng Pagsusuri
          </summary>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-secondary, #4B5563)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Teknolohiya / Engine:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary, #1F2937)' }}>{result.detectionEngine || 'Google Gemini Vision AI'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Confidence:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary, #1F2937)' }}>{result.confidencePercent}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Internal Risk Score:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary, #1F2937)' }}>{result.riskScore} / 100</span>
            </div>
            {finalCombined.technicalDetails && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Kalidad ng Larawan:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary, #1F2937)' }}>{finalCombined.technicalDetails.imageQualityScore} / 100</span>
              </div>
            )}
            <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'rgba(35, 139, 69, 0.08)', fontSize: 11, color: '#174B2A', lineHeight: 1.4 }}>
              <strong>Paunawa:</strong> Ang visual screening na ito ay gabay lamang para sa maagang pagmamasid at hindi pamalit sa opisyal na diagnosis ng lisensyadong beterinaryo.
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
