/**
 * CameraFirstHealthModal.tsx — Camera-First Health Check Scanner for ALPASFARM
 *
 * Replaces the legacy manual questionnaire with a unified, camera-first health check:
 * 1. Camera opens immediately on modal mount with 4:3 viewfinder & livestock detection frame.
 * 2. Instant real-time livestock detection (Goat / Sheep / Not Livestock).
 * 3. High-resolution health screening (ML + Rule-based + Gemini AI interpretation).
 * 4. Results appear directly BELOW the camera within the SAME scrollable modal body.
 * 5. Animal identification: auto-matches tag/QR, or provides minimal fallback dropdown.
 * 6. ZERO FAKE TEMPERATURE: Strictly "Temperatura: Hindi nasukat" (null in database).
 * 7. ZERO ML/AI JARGON: Pure farmer terminology (Maayos, Bantayan, Kailangan ng Atensyon, Kailangan ng Gamot).
 * 8. Clean camera stream disposal on close.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  SwitchCamera,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  RefreshCw,
  Heart,
  Eye,
  Pill,
  ChevronDown,
  AlertCircle,
  Tag,
  Stethoscope,
  X,
} from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../../ui/Modal';
import { captureVideoFrame, LiveDetectedObject } from '../../../lib/cameraUtils';
import { scanAnimalWithGemini } from '../../../lib/geminiScanner';
import {
  detectLiveFrameLocally,
  renderLiveDetectionsToCanvas,
  initClientObjectDetector,
} from '../../../lib/clientObjectDetector';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../lib/toast';
import { createNotification } from '../../../lib/recommendations';
import {
  isMedicineCategory,
  isDewormerCategory,
  isSupplementCategory,
  consumeInventoryStock,
  isItemExpired,
} from '../../../lib/inventoryOperations';
import type { Animal, InventoryItem, HealthStatus } from '../../../types';

export interface CameraFirstHealthModalProps {
  open: boolean;
  onClose: () => void;
  farmAnimals: Animal[];
  inventory?: InventoryItem[];
  currentUserId?: string;
  isSuperAdmin?: boolean;
  preselectedAnimalId?: string;
  onSuccess?: () => void;
}

export interface HealthScanResult {
  detectedSpecies: 'Goat' | 'Sheep' | 'Unknown';
  speciesLabelTagalog: string;
  matchedAnimal: Animal | null;
  visualObservations: string[];
  suggestedConditions: string[];
  healthStatus: 'healthy' | 'monitor' | 'attention' | 'medication';
  healthStatusLabel: string;
  recommendation: string;
  temperatureDisplay: string;
  notesSnippet: string;
  capturedImageUrl?: string;
  scannedAt: string;
}

export type CameraLifecycleState =
  | 'INITIALIZING'
  | 'DETECTING'
  | 'GOAT_DETECTED'
  | 'SHEEP_DETECTED'
  | 'OTHER_DETECTED'
  | 'NO_DETECTION'
  | 'CAPTURING'
  | 'ANALYZING'
  | 'RESULT'
  | 'ERROR';

export function CameraFirstHealthModal({
  open,
  onClose,
  farmAnimals,
  inventory = [],
  currentUserId,
  isSuperAdmin = false,
  preselectedAnimalId,
  onSuccess,
}: CameraFirstHealthModalProps) {
  const toast = useToast();

  // ── Camera & Detection State ──
  const [cameraState, setCameraState] = useState<CameraLifecycleState>('INITIALIZING');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraPermissionError, setCameraPermissionError] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [liveStatusText, setLiveStatusText] = useState('Tinitingnan ang camera...');
  const [liveDetections, setLiveDetections] = useState<LiveDetectedObject[]>([]);
  const [multipleAnimalsDetected, setMultipleAnimalsDetected] = useState(false);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState<'idle' | 'holding' | 'capturing'>('idle');

  // ── Scan Evaluation State ──
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<HealthScanResult | null>(null);

  // ── Selected Animal & Form Fields ──
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(preselectedAnimalId || '');
  const [dbAnimals, setDbAnimals] = useState<Animal[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [manualMedId, setManualMedId] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Sync preselectedAnimalId
  useEffect(() => {
    if (preselectedAnimalId) {
      setSelectedAnimalId(preselectedAnimalId);
    }
  }, [preselectedAnimalId]);

  // If farmAnimals is empty or missing, fetch active animals from Supabase
  useEffect(() => {
    if (open && (!farmAnimals || farmAnimals.length <= 1)) {
      supabase
        .from('animals')
        .select('*')
        .eq('archived', false)
        .order('name', { ascending: true })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setDbAnimals(data as Animal[]);
          }
        });
    }
  }, [open, farmAnimals]);

  // ── Refs ──
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSamplingRef = useRef(false);
  const stableTargetCountRef = useRef(0);
  const handlePerformScanRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Combined active farm animals list
  const activeAnimals = useMemo(() => {
    const list = (farmAnimals && farmAnimals.length > 0) ? farmAnimals : dbAnimals;
    return list.filter((a) => !a.archived && !(a as any).is_sold);
  }, [farmAnimals, dbAnimals]);

  // Selected animal object
  const selectedAnimal = useMemo(() => {
    return activeAnimals.find((a) => a.id === selectedAnimalId) || null;
  }, [activeAnimals, selectedAnimalId]);

  // Available medicines from inventory
  const availableMedicines = useMemo(() => {
    return inventory.filter((item) => {
      const isMed =
        isMedicineCategory(item.category) ||
        isDewormerCategory(item.category) ||
        isSupplementCategory(item.category);
      return isMed && (item.quantity ?? 0) > 0 && !isItemExpired(item.expiry_date);
    });
  }, [inventory]);

  // ── Camera Stream Cleanup ──────────────────────────────────────────────────
  const stopCameraStream = useCallback(() => {
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    isSamplingRef.current = false;
    stableTargetCountRef.current = 0;
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      } catch {
        // Safe ignore
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (overlayCanvasRef.current) {
      renderLiveDetectionsToCanvas(overlayCanvasRef.current, videoRef.current, []);
    }
    setIsCameraActive(false);
    setCameraState('INITIALIZING');
    setLiveDetections([]);
    setMultipleAnimalsDetected(false);
    setAutoCaptureStatus('idle');
  }, []);

  // ── Match Decoded Text (QR/Tag/UUID) with Farm Animals ─────────────────────
  const matchAnimalFromText = useCallback(
    (rawText: string): Animal | null => {
      const text = rawText.trim();
      if (!text) return null;

      let candidateId: string | null = null;
      let candidateTag: string | null = null;

      // URL pattern
      const urlMatch = text.match(/\/(?:animals|public)\/([a-f0-9\-]{36})/i);
      if (urlMatch) {
        candidateId = urlMatch[1];
      }

      // JSON pattern
      if (!candidateId && text.startsWith('{') && text.endsWith('}')) {
        try {
          const parsed = JSON.parse(text);
          candidateId = parsed.id || parsed.animal_id || null;
          candidateTag = parsed.tag || parsed.tag_id || null;
        } catch {
          // ignore
        }
      }

      // Plain tag matching
      if (!candidateId && !candidateTag) {
        candidateTag = text;
      }

      if (candidateId) {
        const found = activeAnimals.find(
          (a) => a.id.toLowerCase() === candidateId!.toLowerCase()
        );
        if (found) return found;
      }

      if (candidateTag) {
        const found = activeAnimals.find(
          (a) => a.tag_id.toLowerCase() === candidateTag!.toLowerCase()
        );
        if (found) return found;
      }

      return null;
    },
    [activeAnimals]
  );

  // ── Live QR/Tag Check ─────────────────────────────────────────────────────
  const runLiveQRCheck = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || isScanning) return;

    try {
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length > 0 && isMountedRef.current) {
          const raw = barcodes[0].rawValue;
          const found = matchAnimalFromText(raw);
          if (found) {
            setSelectedAnimalId(found.id);
          }
        }
      }
    } catch {
      // Safe fallback
    }
  }, [isScanning, matchAnimalFromText]);

  // ── Live Object Detection & Bounding Box Sampling (100% Client-Side) ──────
  const runLiveObjectDetection = useCallback(async () => {
    const video = videoRef.current;
    if (
      !video ||
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      isScanning ||
      scanResult ||
      isSamplingRef.current ||
      !isMountedRef.current
    ) {
      return;
    }

    isSamplingRef.current = true;
    try {
      const result = await detectLiveFrameLocally(video);

      if (!isMountedRef.current || isScanning || scanResult) return;

      // Handle unready / failed detector or empty frame
      if (!result.success || !result.detections || result.detections.length === 0) {
        setLiveDetections([]);
        if (overlayCanvasRef.current) {
          renderLiveDetectionsToCanvas(overlayCanvasRef.current, video, []);
        }
        setMultipleAnimalsDetected(false);
        stableTargetCountRef.current = 0;
        setAutoCaptureStatus('idle');
        setCameraState(result.success ? 'NO_DETECTION' : 'ERROR');
        setLiveStatusText(result.statusMessage || 'Handa na ang camera • Ilagay ang kambing o tupa sa loob ng frame.');
        return;
      }

      // Immediately replace detections in state with current frame results
      const freshDetections = result.detections;
      setLiveDetections(freshDetections);

      // Render crisp bounding boxes and labels to canvas overlay immediately
      if (overlayCanvasRef.current) {
        renderLiveDetectionsToCanvas(overlayCanvasRef.current, video, freshDetections);
      }

      const targetLivestock = freshDetections.filter(
        (d) => d.type === 'GOAT' || d.type === 'SHEEP'
      );
      const totalLivestock =
        (result.count_goats || 0) + (result.count_sheep || 0) || targetLivestock.length;

      if (result.multiple_targets || totalLivestock > 1) {
        setMultipleAnimalsDetected(true);
        stableTargetCountRef.current = 0;
        setAutoCaptureStatus('idle');
        setCameraState('OTHER_DETECTED');
        setLiveStatusText('Maraming hayop ang nakita. Itapat ang camera sa isang hayop.');
      } else if (totalLivestock === 1) {
        setMultipleAnimalsDetected(false);
        const singleTarget = targetLivestock[0];
        const isGoat = singleTarget.type === 'GOAT';
        setCameraState(isGoat ? 'GOAT_DETECTED' : 'SHEEP_DETECTED');
        const targetName = singleTarget.label === 'TUPA' ? 'Tupa' : 'Kambing';

        stableTargetCountRef.current += 1;

        if (stableTargetCountRef.current === 1) {
          setAutoCaptureStatus('holding');
          setLiveStatusText(`${targetName}: Handa nang i-scan • Manatiling nakatutok...`);
        } else if (stableTargetCountRef.current >= 3) {
          setCameraState('CAPTURING');
          setAutoCaptureStatus('capturing');
          setLiveStatusText(`Kinukunan ang ${targetName.toLowerCase()}...`);
          stableTargetCountRef.current = 0;
          // Auto-capture Stage 2 health analysis
          handlePerformScanRef.current();
        }
      } else {
        // 0 goats or sheep: Person, Other Animal, Object, or Nothing
        setMultipleAnimalsDetected(false);
        stableTargetCountRef.current = 0;
        setAutoCaptureStatus('idle');
        setCameraState('OTHER_DETECTED');

        const person = freshDetections.find((d) => d.type === 'PERSON');
        const otherAnimal = freshDetections.find((d) => d.type === 'OTHER_ANIMAL');
        const obj = freshDetections.find((d) => d.type === 'OBJECT');

        if (person) {
          setLiveStatusText('TAO — Hindi ito kambing o tupa');
        } else if (otherAnimal) {
          setLiveStatusText(`${otherAnimal.label} — Hindi ito kambing o tupa`);
        } else if (obj) {
          setLiveStatusText(`${obj.label} — Itapat ang camera sa kambing o tupa`);
        } else {
          setLiveStatusText(result.statusMessage || 'Tinitingnan ang camera...');
        }
      }
    } catch {
      // Clear detections on error or frame drop
      setLiveDetections([]);
      if (overlayCanvasRef.current && videoRef.current) {
        renderLiveDetectionsToCanvas(overlayCanvasRef.current, videoRef.current, []);
      }
      setMultipleAnimalsDetected(false);
      stableTargetCountRef.current = 0;
      setAutoCaptureStatus('idle');
      setCameraState('ERROR');
      setLiveStatusText('Tinitingnan ang camera...');
    } finally {
      isSamplingRef.current = false;
    }
  }, [isScanning, scanResult]);

  // ── Start Camera Stream ───────────────────────────────────────────────────
  const startCameraStream = useCallback(async () => {
    console.log('[Camera] Initializing...');
    stopCameraStream();
    setCameraPermissionError(false);
    setCameraError(null);

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        if (firstErr?.name === 'OverconstrainedError' || firstErr?.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
      setCameraState('DETECTING');
      setLiveStatusText('Handa nang mag-scan • Ilagay ang kambing o tupa sa loob ng frame.');

      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = setInterval(runLiveQRCheck, 600);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setIsCameraActive(false);
      const lower = String(err?.message || err?.name || '').toLowerCase();
      if (lower.includes('notallowed') || lower.includes('permission') || err?.name === 'NotAllowedError') {
        setCameraPermissionError(true);
      } else if (lower.includes('notfound') || lower.includes('device') || err?.name === 'NotFoundError') {
        setCameraError('Walang nakitang camera sa device na ito. Maaari mong piliin ang hayop mula sa listahan.');
      } else if (lower.includes('notreadable') || lower.includes('in use')) {
        setCameraError('Ginagamit pa ng ibang application o tab ang camera. Paki-refresh o isara ang ibang tab.');
      } else {
        setCameraError('Hindi mabuksan ang camera. Siguraduhing may camera permission ang browser.');
      }
    }
  }, [facingMode, runLiveQRCheck, stopCameraStream]);

  // Flip camera between front & back
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // ── Open / Mount Camera Lifecycle ─────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    if (open) {
      // Set initial animal if provided
      if (preselectedAnimalId) {
        setSelectedAnimalId(preselectedAnimalId);
      } else if (!selectedAnimalId && activeAnimals.length > 0) {
        // Pre-select first animal as a convenience
        setSelectedAnimalId(activeAnimals[0].id);
      }
      startCameraStream();
      // Preload client detection model
      initClientObjectDetector().catch((err) => {
        console.error('[Detector] Failed to initialize:', err);
      });
    } else {
      stopCameraStream();
      setScanResult(null);
      setNotes('');
      setManualMedId('');
      setSaving(false);
    }

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [open, preselectedAnimalId, startCameraStream, stopCameraStream]);

  // ── Trigger High-Resolution Scan ──────────────────────────────────────────
  const handlePerformScan = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || isScanning) {
      toast('Siguraduhing bukas ang camera at nakatutok sa hayop.', 'warning');
      return;
    }

    // Requirement 20: Validate that unrelated objects or humans are not submitted as goats/sheep
    if (liveDetections.length > 0) {
      const hasLivestock = liveDetections.some((d) => d.type === 'GOAT' || d.type === 'SHEEP');
      const hasPerson = liveDetections.some((d) => d.type === 'PERSON');
      if (hasPerson || !hasLivestock) {
        const msg = 'Walang kambing o tupa na nakita. Itapat ang camera sa hayop at subukan muli.';
        toast(msg, 'warning');
        setLiveStatusText(msg);
        return;
      }
    }

    setIsScanning(true);
    setCameraState('ANALYZING');
    setLiveStatusText('Sinusuri ang kalagayan ng hayop...');

    try {
      const frameCanvas = captureVideoFrame(video);
      const snapshotUrl = frameCanvas.toDataURL('image/jpeg', 0.85);

      // Call Google Gemini Vision API via serverless backend (/api/gemini/animal-scan)
      const geminiRes = await scanAnimalWithGemini(frameCanvas, {
        context: 'health_scan',
        animalId: selectedAnimalId,
      });

      const raw = geminiRes.rawResponse;

      if (!geminiRes.detected || !raw?.detected) {
        let msg = 'Walang nakitang kambing o tupa sa litrato.';
        if (raw?.reason === 'needs_better_image') {
          msg = 'Hindi malinaw ang larawan. Paki-tutok nang maayos ang camera at i-scan muli.';
        } else if (raw?.reason === 'not_goat_or_sheep') {
          msg = 'Hindi kambing o tupa ang nakita sa larawan.';
        } else if (raw?.reason === 'multiple_animals') {
          msg = 'Maraming hayop ang nakita sa camera. Tutukan ang iisang hayop lamang.';
        }
        setCameraState('NO_DETECTION');
        setLiveStatusText(msg);
        toast(msg, 'warning');
        return;
      }

      // Determine animal species
      const isSheep = raw.animal_type === 'sheep';
      const detectedSpecies: 'Goat' | 'Sheep' = isSheep ? 'Sheep' : 'Goat';
      const speciesTagalog = isSheep ? 'Tupa' : 'Kambing';

      // Try QR Code detection on high-res frame if animal not yet selected
      let detectedAnimalMatch = selectedAnimal;
      if (!detectedAnimalMatch && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(frameCanvas);
          if (barcodes && barcodes.length > 0) {
            const matched = matchAnimalFromText(barcodes[0].rawValue);
            if (matched) {
              detectedAnimalMatch = matched;
              setSelectedAnimalId(matched.id);
            }
          }
        } catch {}
      }

      // Observations & Concerns
      const visualObservations = raw.observations && raw.observations.length > 0
        ? raw.observations
        : ['Normal ang tindig at kilos', 'Walang napansing obvious concern sa balahibo o mata'];
      const suggestedConditions = raw.possible_concerns || [];

      // Farmer-friendly Health Status
      let healthStatus: 'healthy' | 'monitor' | 'attention' | 'medication' = 'healthy';
      let healthStatusLabel = 'Maayos';

      if (raw.needs_medication || raw.health_status === 'needs_medication') {
        healthStatus = 'medication';
        healthStatusLabel = 'Kailangan ng Gamot';
      } else if (raw.needs_attention || raw.health_status === 'needs_attention') {
        healthStatus = 'attention';
        healthStatusLabel = 'Kailangan ng Atensyon';
      } else if (raw.health_status === 'monitor' || suggestedConditions.length > 0) {
        healthStatus = 'monitor';
        healthStatusLabel = 'Bantayan';
      } else {
        healthStatus = 'healthy';
        healthStatusLabel = 'Maayos';
      }

      // Recommendation (Farmer-friendly advice, zero medical diagnosis claims)
      const rec = raw.recommendation || (
        healthStatus === 'medication'
          ? 'Kailangan ng gamot o pagsusuri ng lisensyadong beterinaryo.'
          : healthStatus === 'attention'
          ? 'May napansing kondisyon na kailangan bantayan. Obserbahan ang pagkain, galaw, at kalusugan.'
          : healthStatus === 'monitor'
          ? 'Obserbahan ang hayop sa susunod na 24–48 oras.'
          : 'Normal at malusog ang kalagayan ng hayop.'
      );

      const notesLines: string[] = [];
      notesLines.push(`[Camera Scan: ${speciesTagalog.toUpperCase()}]`);
      if (detectedAnimalMatch) {
        notesLines.push(
          `Hayop: ${detectedAnimalMatch.name || detectedAnimalMatch.tag_id} (${detectedAnimalMatch.tag_id})`
        );
      }
      notesLines.push(`Mga Napansin: ${visualObservations.join(', ')}`);
      notesLines.push(`Payo: ${rec}`);
      notesLines.push('Temperatura: Hindi nasukat (walang thermometer sensor)');

      const result: HealthScanResult = {
        detectedSpecies,
        speciesLabelTagalog: speciesTagalog,
        matchedAnimal: detectedAnimalMatch,
        visualObservations,
        suggestedConditions,
        healthStatus,
        healthStatusLabel,
        recommendation: rec,
        temperatureDisplay: 'Hindi nasukat', // ZERO fake vitals
        notesSnippet: notesLines.join('\n'),
        capturedImageUrl: snapshotUrl,
        scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setScanResult(result);
      setCameraState('RESULT');
      if (!notes) {
        setNotes(result.notesSnippet);
      }
      setLiveStatusText(`${speciesTagalog} ang nakita • Katayuan: ${healthStatusLabel}`);
      toast(`Naisagawa ang pagsusuri sa ${speciesTagalog.toLowerCase()} gamit ang Gemini Vision.`, 'success');
    } catch (err: any) {
      console.error('Gemini Scan failed:', err);
      setCameraState('ERROR');
      toast(err.message || 'Hindi nagtagumpay ang scan. Pakisubukang itapat muli ang camera.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Keep handlePerformScan ref synced
  useEffect(() => {
    handlePerformScanRef.current = handlePerformScan;
  });

  // ── Periodic Object Detection Loop ──
  useEffect(() => {
    if (!open || !isCameraActive || isScanning || scanResult) {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      return;
    }

    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    // Run fast client-side frame detection every 120ms (~8 FPS) for smooth real-time tracking
    detectionIntervalRef.current = setInterval(() => {
      runLiveObjectDetection();
    }, 120);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [open, isCameraActive, isScanning, scanResult, runLiveObjectDetection]);

  const handleResetScan = () => {
    setScanResult(null);
    setLiveDetections([]);
    if (overlayCanvasRef.current && videoRef.current) {
      renderLiveDetectionsToCanvas(overlayCanvasRef.current, videoRef.current, []);
    }
    setMultipleAnimalsDetected(false);
    setAutoCaptureStatus('idle');
    stableTargetCountRef.current = 0;
    setCameraState('DETECTING');
    setLiveStatusText('Tinitingnan ang camera...');
  };

  // ── Save Health Check Record to Supabase ──────────────────────────────────
  const handleSaveHealthCheck = async () => {
    if (!selectedAnimal || !currentUserId) {
      toast('Pumili muna ng hayop upang mai-save ang health check.', 'warning');
      return;
    }

    if (!scanResult) {
      toast('Mag-scan muna ng hayop gamit ang camera.', 'warning');
      return;
    }

    if (selectedAnimal.user_id !== currentUserId && !isSuperAdmin) {
      toast('Walang pahintulot na magtala para sa hayop na ito.', 'error');
      return;
    }

    setSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Handle optional medication consumption if Kailangan ng Gamot
      let medName: string | null = null;
      if (manualMedId && scanResult.healthStatus === 'medication') {
        const chosenMed = inventory.find((i) => i.id === manualMedId);
        if (chosenMed && (chosenMed.quantity ?? 0) > 0) {
          const consumeRes = await consumeInventoryStock({
            userId: currentUserId,
            isSuperAdmin,
            item: chosenMed,
            quantity: 1,
            usageType: 'medication',
            animalId: selectedAnimal.id,
            animalTag: selectedAnimal.tag_id,
            animalName: selectedAnimal.name,
            referenceType: 'animal',
            referenceId: selectedAnimal.id,
            reason: `Paggamot mula sa Camera Health Check: ${chosenMed.name}`,
            notes: `Ibinigay kay ${selectedAnimal.name || selectedAnimal.tag_id} (${selectedAnimal.tag_id}).`,
          });
          if (consumeRes.success) {
            medName = chosenMed.name;
          }
        }
      }

      // Map score & levels (Strictly calibrated without exposing technical metrics)
      let riskScore = 5;
      let mappedRiskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' = 'Low';
      let newHealthStatus: HealthStatus = 'Healthy';

      if (scanResult.healthStatus === 'medication') {
        riskScore = 80;
        mappedRiskLevel = 'Critical';
        newHealthStatus = 'Critical';
      } else if (scanResult.healthStatus === 'attention') {
        riskScore = 55;
        mappedRiskLevel = 'High';
        newHealthStatus = 'At Risk';
      } else if (scanResult.healthStatus === 'monitor') {
        riskScore = 30;
        mappedRiskLevel = 'Moderate';
        newHealthStatus = 'Monitor';
      } else {
        riskScore = 5;
        mappedRiskLevel = 'Low';
        newHealthStatus = 'Healthy';
      }

      const reasonsSummary = scanResult.visualObservations.join('; ');
      const finalNotes = (notes.trim() || scanResult.notesSnippet).trim();

      // 1. Insert into health_records
      const healthPayload = {
        user_id: currentUserId,
        animal_id: selectedAnimal.id,
        record_date: todayStr,
        temperature: null, // Strictly null: ordinary camera cannot measure body temperature
        heart_rate: null,
        respiratory_rate: null,
        rumen_sounds: 'Normal' as const,
        famacha_score: null,
        mucous_membrane: 'Pink' as const,
        bloat_score: 0 as const,
        gait: 'Normal' as const,
        appetite: 'Normal' as const,
        activity_level: 'Normal' as const,
        cough: false,
        diarrhea: false,
        nasal_discharge: false,
        eye_condition: 'Normal' as const,
        body_condition: 'Good' as const,
        risk_score: riskScore,
        risk_level: mappedRiskLevel,
        reasons: reasonsSummary,
        recommendation: scanResult.recommendation,
        detected_conditions: scanResult.suggestedConditions.join('; ') || null,
        medication: medName,
        notes: finalNotes,
      };

      const { error: insertError } = await supabase.from('health_records').insert(healthPayload);
      if (insertError) throw insertError;

      // 2. Synchronize animal's profile health status
      let animalUpdate = supabase
        .from('animals')
        .update({
          health_status: newHealthStatus,
          health_risk_score: riskScore,
        })
        .eq('id', selectedAnimal.id);

      if (!isSuperAdmin) {
        animalUpdate = animalUpdate.eq('user_id', currentUserId);
      }
      await animalUpdate;

      // 3. Dispatch alert if status warrants attention
      if (scanResult.healthStatus !== 'healthy') {
        const eventKey = `health_${selectedAnimal.id}_${scanResult.healthStatus}_${todayStr}`;
        const alertTitle = `${selectedAnimal.name || selectedAnimal.tag_id}: May Napansing Kalagayan (${scanResult.healthStatusLabel})`;
        const alertDesc = `${reasonsSummary}${medName ? ` | Gamot: ${medName}` : ''}`;

        createNotification(
          currentUserId,
          'Health',
          alertTitle,
          alertDesc,
          scanResult.healthStatus === 'medication'
            ? 'Critical'
            : scanResult.healthStatus === 'attention'
            ? 'Warning'
            : 'Normal',
          `/animals/${selectedAnimal.id}`,
          eventKey
        ).catch((e) => console.warn('Could not dispatch health notification:', e));
      }

      toast(
        medName
          ? `Nai-save ang health check at nabawasan ang ${medName} sa imbentaryo.`
          : 'Nai-save ang health check ng hayop!',
        'success'
      );

      // Clean up and notify parent
      stopCameraStream();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast(err.message || 'Hindi mai-save ang health check.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleModalClose = () => {
    stopCameraStream();
    onClose();
  };

  const hasAnimalDetected = scanResult !== null && scanResult.detectedSpecies !== 'Unknown';
  const isGoat = scanResult?.detectedSpecies === 'Goat';
  const isSheep = scanResult?.detectedSpecies === 'Sheep';

  const liveGoatDetected = liveDetections.some((d) => d.type === 'GOAT');
  const liveSheepDetected = liveDetections.some((d) => d.type === 'SHEEP');
  const liveTargetDetected = liveGoatDetected || liveSheepDetected;

  return (
    <Modal open={open} onClose={handleModalClose} size="lg">
      <ModalHeader title="Health Check" onClose={handleModalClose} />

      <ModalBody>
        <div className="modal-inner-flow" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── 1. CAMERA VIEWPORT SECTION ── */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4 / 3',
              maxHeight: 'min(44vh, 360px)',
              minHeight: '230px',
              backgroundColor: '#0F172A',
              borderRadius: 14,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}
          >
            {cameraPermissionError ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '20px',
                  color: '#FFFFFF',
                  gap: 10,
                }}
              >
                <AlertCircle size={36} color="#EF4444" />
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  Hindi mabuksan ang camera
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.75)', maxWidth: 320 }}>
                  Siguraduhing may camera permission ang browser para magamit ang scanner.
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    borderRadius: 10,
                    padding: '8px 16px',
                    fontSize: 13,
                    background: '#16A34A',
                    borderColor: '#16A34A',
                    marginTop: 6,
                  }}
                  onClick={startCameraStream}
                >
                  Subukan Ulit
                </button>
              </div>
            ) : cameraError ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '20px',
                  color: '#FFFFFF',
                  gap: 10,
                }}
              >
                <AlertTriangle size={36} color="#D97706" />
                <div style={{ fontSize: 14, fontWeight: 700 }}>{cameraError}</div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ borderRadius: 10, padding: '8px 16px', fontSize: 13, color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}
                  onClick={startCameraStream}
                >
                  Subukan Muli
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  onLoadedMetadata={() => {
                    console.log('[Camera] Video ready');
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />

                {/* Flip camera button */}
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  title="Palitan ang Camera"
                  aria-label="Palitan ang Camera"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '50%',
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                >
                  <SwitchCamera size={16} />
                </button>

                {/* Real-Time Live Bounding Box & Label Canvas Overlay */}
                <canvas
                  ref={overlayCanvasRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 4,
                  }}
                />

                {/* Subtle Viewfinder Guides when camera is idle/searching */}
                {liveDetections.length === 0 && !isScanning && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: '12% 10%',
                      border: '1.5px dashed rgba(255, 255, 255, 0.3)',
                      borderRadius: 14,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        color: 'rgba(255, 255, 255, 0.75)',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 8,
                      }}
                    >
                      Itapat ang camera sa kambing o tupa
                    </span>
                  </div>
                )}

                {/* Multiple Animals Detected Warning Banner */}
                {multipleAnimalsDetected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      right: 54,
                      background: 'rgba(217, 119, 6, 0.95)',
                      backdropFilter: 'blur(6px)',
                      color: '#FFFFFF',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                      zIndex: 12,
                    }}
                  >
                    <AlertTriangle size={14} color="#FFFFFF" />
                    <span>Maraming hayop ang nakita. Itapat ang camera sa isang kambing o tupa.</span>
                  </div>
                )}

                {/* Auto-Capture Steady Indicator */}
                {autoCaptureStatus === 'holding' && !multipleAnimalsDetected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      right: 54,
                      background: 'rgba(22, 163, 74, 0.95)',
                      backdropFilter: 'blur(6px)',
                      color: '#FFFFFF',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                      zIndex: 12,
                    }}
                  >
                    <Sparkles size={14} color="#FFFFFF" />
                    <span>Naka-lock sa hayop • Kinukunan nang kusa...</span>
                  </div>
                )}

                {/* Live Status Pill at Bottom of Viewport */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    right: 10,
                    display: 'flex',
                    justifyContent: 'center',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      background: multipleAnimalsDetected
                        ? 'rgba(217, 119, 6, 0.92)'
                        : liveTargetDetected
                        ? 'rgba(22, 163, 74, 0.92)'
                        : 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(6px)',
                      color: '#FFFFFF',
                      padding: '5px 14px',
                      borderRadius: 18,
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                      textAlign: 'center',
                      maxWidth: '92%',
                    }}
                  >
                    {multipleAnimalsDetected ? (
                      <>
                        <AlertTriangle size={13} color="#FFFFFF" />
                        <span>Maraming hayop ang nakita.</span>
                      </>
                    ) : liveTargetDetected ? (
                      <>
                        <CheckCircle2 size={13} color="#FFFFFF" />
                        <span>{liveStatusText}</span>
                      </>
                    ) : (
                      <>
                        <Info size={13} color="rgba(255,255,255,0.85)" />
                        <span>{liveStatusText}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Scanning Spinner Overlay */}
                {isScanning && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      zIndex: 20,
                      color: '#FFFFFF',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        border: '3px solid rgba(22, 163, 74, 0.25)',
                        borderTopColor: '#16A34A',
                        animation: 'spin 0.85s linear infinite',
                      }}
                    />
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      Sinusuri ang kalusugan sa Gemini Vision...
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Primary Action Button directly below the Camera */}
          <div style={{ display: 'flex', gap: 10 }}>
            {scanResult ? (
              <button
                type="button"
                className="btn btn-outline"
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '11px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 12,
                  color: '#16A34A',
                  borderColor: '#16A34A',
                }}
                onClick={handleResetScan}
              >
                <RefreshCw size={16} />
                <span>Mag-scan ng Panibagong Hayop</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '11px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 12,
                  background: '#16A34A',
                  borderColor: '#16A34A',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                }}
                onClick={handlePerformScan}
                disabled={isScanning || !isCameraActive}
              >
                {isScanning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Sinusuri ang hayop sa Gemini Vision...</span>
                  </>
                ) : (
                  <>
                    <Camera size={18} />
                    <span>I-scan ang Hayop</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* ── 2. RESULTS APPEAR DIRECTLY BELOW CAMERA ── */}
          {!scanResult ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: 'var(--surface-sunken)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.45,
              }}
            >
              <Info size={20} color="#16A34A" style={{ flexShrink: 0 }} />
              <div>
                I-scan ang hayop gamit ang camera sa itaas para makita ang resulta ng health check.
                Awtomatikong tutukuyin ang kalagayan at mga obserbasyon nang walang mahabang questionnaire.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: '16px',
                background: 'var(--surface)',
                borderRadius: 14,
                border: '1px solid var(--border)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
              }}
            >
              {/* Result Header with Status Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Resulta ng Health Check
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Nakuha bandang {scanResult.scannedAt}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    padding: '4px 12px',
                    borderRadius: 8,
                    background:
                      scanResult.healthStatus === 'healthy'
                        ? 'rgba(22, 163, 74, 0.12)'
                        : scanResult.healthStatus === 'monitor'
                        ? 'rgba(217, 119, 6, 0.12)'
                        : scanResult.healthStatus === 'attention'
                        ? 'rgba(234, 88, 12, 0.12)'
                        : 'rgba(220, 38, 38, 0.12)',
                    color:
                      scanResult.healthStatus === 'healthy'
                        ? '#16A34A'
                        : scanResult.healthStatus === 'monitor'
                        ? '#D97706'
                        : scanResult.healthStatus === 'attention'
                        ? '#EA580C'
                        : '#DC2626',
                    border: `1px solid ${
                      scanResult.healthStatus === 'healthy'
                        ? 'rgba(22, 163, 74, 0.25)'
                        : scanResult.healthStatus === 'monitor'
                        ? 'rgba(217, 119, 6, 0.25)'
                        : scanResult.healthStatus === 'attention'
                        ? 'rgba(234, 88, 12, 0.25)'
                        : 'rgba(220, 38, 38, 0.25)'
                    }`,
                  }}
                >
                  ● {scanResult.healthStatusLabel}
                </span>
              </div>

              {/* Animal Tag & Name Identification */}
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {selectedAnimal ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                        {selectedAnimal.species === 'Sheep' ? 'Tupa' : 'Kambing'} — {selectedAnimal.tag_id}
                        {selectedAnimal.name && selectedAnimal.name !== selectedAnimal.tag_id ? ` (${selectedAnimal.name})` : ''}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(22, 163, 74, 0.1)',
                          color: '#16A34A',
                        }}
                      >
                        Natukoy na Hayop
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Lahi: {selectedAnimal.breed || 'Karaniwan'}
                      {selectedAnimal.weight_kg ? ` • Timbang: ${selectedAnimal.weight_kg} kg` : ''}
                    </div>

                    {/* Minimal change animal selector if needed */}
                    <div style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                        Ibang hayop ba ito? Piliin kung kinakailangan:
                      </label>
                      <select
                        className="input"
                        value={selectedAnimalId}
                        onChange={(e) => setSelectedAnimalId(e.target.value)}
                        style={{ width: '100%', borderRadius: 8, fontSize: 13 }}
                      >
                        {activeAnimals.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.tag_id} – {a.species === 'Sheep' ? 'Tupa' : 'Kambing'}{a.name && a.name !== a.tag_id ? ` (${a.name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={15} />
                      <span>Natukoy na {scanResult.speciesLabelTagalog.toLowerCase()} ang hayop, pero hindi matukoy ang Animal ID.</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 8 }}>
                      Pumili ng hayop mula sa iyong kawan upang maiugnay ang health check na ito:
                    </div>

                    <select
                      className="input"
                      value={selectedAnimalId}
                      onChange={(e) => setSelectedAnimalId(e.target.value)}
                      style={{ width: '100%', borderRadius: 8, fontSize: 13 }}
                    >
                      <option value="">-- Piliin ang Hayop --</option>
                      {activeAnimals.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.tag_id} – {a.species === 'Sheep' ? 'Tupa' : 'Kambing'}{a.name && a.name !== a.tag_id ? ` (${a.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Mga Napansin (Bulleted Observations) */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Mga Napansin:
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {scanResult.visualObservations.map((obs, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: 13,
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 6,
                      }}
                    >
                      <span style={{ color: '#16A34A', fontWeight: 800 }}>•</span>
                      <span>{obs}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payo / Rekomendasyon */}
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Payo:
                </span>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                  {scanResult.recommendation}
                </div>
              </div>

              {/* Temperatura: Strictly "Hindi nasukat" */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-sunken)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Temperatura:</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {scanResult.temperatureDisplay}
                </span>
              </div>

              {/* Optional: Gamot mula sa Imbentaryo if Kailangan ng Gamot */}
              {scanResult.healthStatus === 'medication' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Pill size={14} />
                    <span>Pumili ng Gamot mula sa Imbentaryo (Opsyonal):</span>
                  </label>
                  {availableMedicines.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      Walang gamot na available sa kasalukuyang imbentaryo.
                    </div>
                  ) : (
                    <select
                      value={manualMedId}
                      onChange={(e) => setManualMedId(e.target.value)}
                      className="input"
                      style={{ width: '100%', borderRadius: 8, fontSize: 13 }}
                    >
                      <option value="">-- Walang ibinigay na gamot --</option>
                      {availableMedicines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.quantity} {m.unit} natitira)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Karagdagang Tala (Opsyonal) */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Karagdagang Tala (Opsyonal):
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="hal. Nakita sa kural A kaninang umaga..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', borderRadius: 8, fontSize: 13, resize: 'vertical' }}
                />
              </div>

              {/* Collapsible Diagnostics Details (Closed by default) */}
              <details style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Detalye ng Pagsusuri
                </summary>
                <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 6, lineHeight: 1.4 }}>
                  <div>Uri ng Hayop: {scanResult.speciesLabelTagalog}</div>
                  <div>Oras ng Scan: {scanResult.scannedAt}</div>
                  <div>Paalala: Ang pagsusuring ito ay visual screening lamang at hindi opisyal na medical diagnosis.</div>
                </div>
              </details>
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="modal-actions-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleModalClose}
            disabled={saving}
          >
            Kanselahin
          </button>

          <button
            type="button"
            className="btn btn-primary"
            style={{
              padding: '10px 22px',
              fontWeight: 700,
              borderRadius: 10,
              background: '#16A34A',
              borderColor: '#16A34A',
              boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
            }}
            onClick={handleSaveHealthCheck}
            disabled={saving || !scanResult || !selectedAnimal}
            title={!scanResult ? 'Mag-scan muna ng hayop.' : !selectedAnimal ? 'Pumili ng hayop.' : 'I-save ang Health Check'}
          >
            {saving ? 'Inililigtas...' : 'I-save ang Health Check'}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
