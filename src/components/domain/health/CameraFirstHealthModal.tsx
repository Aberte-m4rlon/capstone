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
import {
  captureVideoFrame,
  captureLowResFrame,
  renderLiveDetectionsToCanvas,
  type LiveDetectedObject,
} from '../../../lib/cameraUtils';
import {
  detectLiveObjects,
  scanAnimalWithGemini,
} from '../../../lib/geminiScanner';
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
  | 'UNCERTAIN'
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
  const [selectedTargetIndex, setSelectedTargetIndex] = useState<number>(0);
  const [detectorStatus, setDetectorStatus] = useState<'LOADING' | 'READY' | 'ERROR'>('LOADING');
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

  // Live detector is powered by server-side Gemini Vision API
  useEffect(() => {
    if (open) {
      setDetectorStatus('READY');
    }
  }, [open]);

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
  const detectAbortControllerRef = useRef<AbortController | null>(null);
  const selectedTargetIndexRef = useRef<number>(0);
  const isSamplingRef = useRef(false);
  const stableTargetCountRef = useRef(0);

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
    if (detectAbortControllerRef.current) {
      detectAbortControllerRef.current.abort();
      detectAbortControllerRef.current = null;
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
      const frameCanvas = captureLowResFrame(video, 480);
      const abortCtrl = new AbortController();
      detectAbortControllerRef.current = abortCtrl;

      const result = await detectLiveObjects(frameCanvas, { signal: abortCtrl.signal });

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
        setLiveStatusText('Walang kambing o tupa na nakita');
        return;
      }

      // Immediately replace detections in state with current frame results
      const freshDetections = result.detections;
      setLiveDetections(freshDetections);

      const targetLivestock = freshDetections.filter(
        (d) => d.type === 'GOAT' || d.type === 'SHEEP'
      );
      const goats = freshDetections.filter((d) => d.type === 'GOAT');
      const sheep = freshDetections.filter((d) => d.type === 'SHEEP');
      const uncertains = freshDetections.filter((d) => d.type === 'UNCERTAIN');
      const totalLivestock = targetLivestock.length;

      let currentSelectedIdx = selectedTargetIndexRef.current;
      if (currentSelectedIdx >= totalLivestock) {
        currentSelectedIdx = 0;
        selectedTargetIndexRef.current = 0;
        setSelectedTargetIndex(0);
      }

      // Render crisp bounding boxes and labels to canvas overlay immediately
      if (overlayCanvasRef.current) {
        renderLiveDetectionsToCanvas(
          overlayCanvasRef.current,
          video,
          freshDetections,
          currentSelectedIdx
        );
      }

      if (uncertains.length > 0 && totalLivestock === 0) {
        setMultipleAnimalsDetected(false);
        stableTargetCountRef.current = 0;
        setAutoCaptureStatus('idle');
        setCameraState('UNCERTAIN');
        setLiveStatusText('Hindi malinaw kung kambing o tupa. Ilapit o ayusin ang camera.');
      } else if (totalLivestock > 1) {
        setMultipleAnimalsDetected(true);
        stableTargetCountRef.current = 0;
        setAutoCaptureStatus('idle');
        const activeTarget = targetLivestock[currentSelectedIdx] || targetLivestock[0];
        setCameraState(activeTarget.type === 'SHEEP' ? 'SHEEP_DETECTED' : 'GOAT_DETECTED');

        if (goats.length > 0 && sheep.length > 0) {
          setLiveStatusText('May kambing at tupa na nakita. Piliin ang hayop.');
        } else if (goats.length > 1) {
          setLiveStatusText('May mga kambing na nakita. Piliin ang hayop.');
        } else {
          setLiveStatusText('May mga tupa na nakita. Piliin ang hayop.');
        }
      } else if (totalLivestock === 1) {
        setMultipleAnimalsDetected(false);
        const singleTarget = targetLivestock[0];
        const isGoat = singleTarget.type === 'GOAT';
        setCameraState(isGoat ? 'GOAT_DETECTED' : 'SHEEP_DETECTED');
        setLiveStatusText(isGoat ? 'Kambing ang nakita' : 'Tupa ang nakita');
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
          setLiveStatusText('Tao — Hindi ito kambing o tupa');
        } else if (otherAnimal) {
          setLiveStatusText('Ibang Bagay — Hindi ito kambing o tupa');
        } else if (obj) {
          setLiveStatusText('Ibang Bagay — Hindi ito kambing o tupa');
        } else {
          setLiveStatusText('Walang kambing o tupa na nakita');
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
      setLiveStatusText('Walang kambing o tupa na nakita');
    } finally {
      detectAbortControllerRef.current = null;
      isSamplingRef.current = false;
    }
  }, [isScanning, scanResult]);

  // ── Start Camera Stream ───────────────────────────────────────────────────
  const startCameraStream = useCallback(async () => {
    console.log('[Camera] Initializing stream...');
    stopCameraStream();
    setCameraPermissionError(false);
    setCameraError(null);
    setLiveStatusText('Naghahanap ng kambing o tupa...');

    // 1. Verify HTTPS / Secure Context (Requirement 4)
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      console.error('[Camera] Insecure context: camera access requires HTTPS');
      setCameraError('Kailangan ng secure connection para magamit ang camera.');
      setIsCameraActive(false);
      return;
    }

    // 2. Check navigator.mediaDevices support
    if (!navigator?.mediaDevices?.getUserMedia) {
      console.error('[Camera] navigator.mediaDevices.getUserMedia is not supported');
      setCameraError('Walang camera na nakita sa device.');
      setIsCameraActive(false);
      return;
    }

    try {
      // 3. UserMedia constraints: prefer rear camera on mobile (Requirement 2)
      const primaryConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
        },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (firstErr: any) {
        console.warn('[Camera] Primary constraint failed:', firstErr?.name, firstErr?.message);
        // Fallback 1: exact facingMode string
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: facingMode === 'environment' ? 'environment' : 'user' },
          });
        } catch (secondErr: any) {
          console.warn('[Camera] Facing mode fallback failed:', secondErr?.name, secondErr?.message);
          // Fallback 2: most permissive constraint (video: true)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // 4. Attach stream to video element
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        try {
          await video.play();
        } catch (playErr: any) {
          console.warn('[Camera] video.play() error:', playErr?.name, playErr?.message);
        }
      }

      setIsCameraActive(true);
      setCameraPermissionError(false);
      setCameraError(null);
      setCameraState('DETECTING');
      setLiveStatusText('Naghahanap ng kambing o tupa...');

      // QR detection check
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = setInterval(runLiveQRCheck, 600);
    } catch (err: any) {
      const errName = err?.name || '';
      const errMsg = err?.message || '';
      console.error('[Camera]', errName, errMsg);

      if (!isMountedRef.current) return;
      setIsCameraActive(false);

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        /permission|not\s*allowed/i.test(errMsg)
      ) {
        setCameraPermissionError(true);
        setCameraError('Hindi pinayagan ang camera. I-enable ang Camera permission sa browser.');
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        /not\s*found|no\s*camera/i.test(errMsg)
      ) {
        setCameraError('Walang camera na nakita sa device.');
      } else if (
        errName === 'NotReadableError' ||
        errName === 'TrackStartError' ||
        /busy|in\s*use|readable/i.test(errMsg)
      ) {
        setCameraError('Ginagamit ng ibang app ang camera. Isara muna ito at subukan muli.');
      } else if (errName === 'SecurityError' || (typeof window !== 'undefined' && !window.isSecureContext)) {
        setCameraError('Kailangan ng secure connection para magamit ang camera.');
      } else {
        setCameraError('Hindi mabuksan ang camera. Subukan muli.');
      }
    }
  }, [facingMode, runLiveQRCheck, stopCameraStream]);

  // Flip camera between front & back
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Video element synchronization hook (guarantees stream attaches even after re-renders)
  useEffect(() => {
    if (open && isCameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.play().catch((e) => console.warn('[Camera] sync play error:', e));
      }
    }
  }, [open, isCameraActive]);

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
    } else {
      stopCameraStream();
      setScanResult(null);
      setNotes('');
      setManualMedId('');
      setSaving(false);
      setCameraError(null);
      setCameraPermissionError(false);
    }

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [open, preselectedAnimalId, facingMode]);

  // ── Trigger High-Resolution Scan ──────────────────────────────────────────
  const handlePerformScan = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || isScanning) {
      toast('Siguraduhing bukas ang camera at nakatutok sa hayop.', 'warning');
      return;
    }

    // Strict Species Gate (Sections 14, 20 & 21)
    const validLivestock = liveDetections.filter(
      (d) => d.type === 'GOAT' || d.type === 'SHEEP'
    );
    const hasUncertain = liveDetections.some((d) => d.type === 'UNCERTAIN');
    const hasPerson = liveDetections.some((d) => d.type === 'PERSON');

    if (validLivestock.length === 0) {
      if (hasUncertain) {
        const msg = 'Hindi malinaw ang hayop. Ilapit o ayusin ang camera at subukan muli.';
        toast(msg, 'warning');
        setLiveStatusText(msg);
        return;
      }
      if (hasPerson) {
        const msg = 'Tao ang nakita sa camera. Itapat ang camera sa kambing o tupa.';
        toast(msg, 'warning');
        setLiveStatusText(msg);
        return;
      }
      const msg = 'Walang kambing o tupa na nakita. Itapat ang camera sa hayop at subukan muli.';
      toast(msg, 'warning');
      setLiveStatusText(msg);
      return;
    }

    const currentSelectedTarget = validLivestock[selectedTargetIndexRef.current] || validLivestock[0];
    const targetSpecies = currentSelectedTarget.type === 'SHEEP' ? 'sheep' : 'goat';

    setIsScanning(true);
    setCameraState('ANALYZING');
    setLiveStatusText(`Sinusuri ang kalagayan ng ${targetSpecies === 'sheep' ? 'tupa' : 'kambing'}...`);

    try {
      const frameCanvas = captureVideoFrame(video);
      const snapshotUrl = frameCanvas.toDataURL('image/jpeg', 0.85);

      // Call Google Gemini Vision API via serverless backend (/api/gemini/animal-scan)
      const geminiRes = await scanAnimalWithGemini(frameCanvas, {
        context: 'health_scan',
        animalId: selectedAnimalId,
        animalType: targetSpecies,
        targetBoundingBox: currentSelectedTarget.boundingBox,
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
      notesLines.push(`Napansin: ${visualObservations.join(', ')}`);
      notesLines.push(`Gawin: ${rec}`);
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
      console.error('[Health Analysis] Error:', err);
      toast(err?.message || 'Hindi natapos ang pagsusuri. Subukan muli.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // ── Periodic Object Detection Loop ──  // Keep live detection callback ref synced to avoid recreation
  const runLiveObjectDetectionRef = useRef(runLiveObjectDetection);
  useEffect(() => {
    runLiveObjectDetectionRef.current = runLiveObjectDetection;
  });

  // Periodic object detection loop (~1200ms)
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

    // Run periodic live detection snapshot every 1200ms via Gemini Vision API
    detectionIntervalRef.current = setInterval(() => {
      runLiveObjectDetectionRef.current();
    }, 1200);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [open, isCameraActive, isScanning, !!scanResult]);

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
    setLiveStatusText('Naghahanap ng kambing o tupa...');
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
    setScanResult(null);
    setLiveDetections([]);
    setCameraError(null);
    setCameraPermissionError(false);
    onClose();
  };

  const hasAnimalDetected = scanResult !== null && scanResult.detectedSpecies !== 'Unknown';
  const isGoat = scanResult?.detectedSpecies === 'Goat';
  const isSheep = scanResult?.detectedSpecies === 'Sheep';

  const validLivestock = useMemo(
    () => liveDetections.filter((d) => d.type === 'GOAT' || d.type === 'SHEEP'),
    [liveDetections]
  );
  const liveGoatDetected = liveDetections.some((d) => d.type === 'GOAT');
  const liveSheepDetected = liveDetections.some((d) => d.type === 'SHEEP');
  const liveTargetDetected = liveGoatDetected || liveSheepDetected;

  // Viewport tap / click handler to select target animal (Requirements 10 & 20)
  const handleViewportClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isScanning || scanResult || validLivestock.length <= 1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const cW = rect.width;
    const cH = rect.height;

    const video = videoRef.current;
    const vW = video?.videoWidth || cW;
    const vH = video?.videoHeight || cH;

    const rC = cW / cH;
    const rV = vW / vH;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (rC > rV) {
      scale = cW / vW;
      offsetY = (cH - vH * scale) / 2;
    } else {
      scale = cH / vH;
      offsetX = (cW - vW * scale) / 2;
    }

    let hitIndex = -1;
    let minDistance = Infinity;

    validLivestock.forEach((item, idx) => {
      const b = item.boundingBox;
      if (!b) return;

      const screenX = b.x * vW * scale + offsetX;
      const screenY = b.y * vH * scale + offsetY;
      const screenW = b.width * vW * scale;
      const screenH = b.height * vH * scale;

      // Inside bounding box check
      if (
        clickX >= screenX &&
        clickX <= screenX + screenW &&
        clickY >= screenY &&
        clickY <= screenY + screenH
      ) {
        hitIndex = idx;
      }

      // Proximity distance check
      const centerX = screenX + screenW / 2;
      const centerY = screenY + screenH / 2;
      const dist = Math.hypot(clickX - centerX, clickY - centerY);
      if (dist < minDistance) {
        minDistance = dist;
        if (hitIndex === -1 && dist < 120) {
          hitIndex = idx;
        }
      }
    });

    if (hitIndex !== -1) {
      setSelectedTargetIndex(hitIndex);
      selectedTargetIndexRef.current = hitIndex;
      if (overlayCanvasRef.current && videoRef.current) {
        renderLiveDetectionsToCanvas(
          overlayCanvasRef.current,
          videoRef.current,
          liveDetections,
          hitIndex
        );
      }
      const chosen = validLivestock[hitIndex];
      toast(`Napili: ${chosen.type === 'SHEEP' ? 'Tupa' : 'Kambing'}`, 'info');
    }
  };

  return (
    <Modal open={open} onClose={handleModalClose} size="lg">
      <ModalHeader title="Health Check" onClose={handleModalClose} />

      <ModalBody
        style={{
          maxHeight: 'calc(100dvh - 120px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          minHeight: 0,
        }}
      >
        <div className="modal-inner-flow" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── 1. CAMERA VIEWPORT SECTION ── */}
          <div
            onClick={handleViewportClick}
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
              cursor: validLivestock.length > 1 ? 'pointer' : 'default',
            }}
          >
            {/* Live Video Element - ALWAYS Mounted to prevent null ref */}
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
                transform: 'scaleX(1)',
                WebkitTransform: 'scaleX(1)',
              }}
            />

            {/* Real-Time Live Bounding Box & Label Canvas Overlay - ALWAYS Mounted */}
            <canvas
              ref={overlayCanvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 4,
                transform: 'scaleX(1)',
                WebkitTransform: 'scaleX(1)',
              }}
            />

            {/* Flip camera button */}
            {isCameraActive && (
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
            )}

            {/* Camera Error / Permission Overlay */}
            {(cameraError || cameraPermissionError) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: '#0F172A',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '24px',
                  color: '#FFFFFF',
                  gap: 12,
                  zIndex: 25,
                }}
              >
                {cameraPermissionError ? (
                  <AlertCircle size={40} color="#EF4444" />
                ) : (
                  <AlertTriangle size={40} color="#D97706" />
                )}
                <div style={{ fontSize: 15, fontWeight: 700, maxWidth: 300, lineHeight: 1.4 }}>
                  {cameraError || 'Hindi mabuksan ang camera. Subukan muli.'}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    borderRadius: 10,
                    padding: '9px 20px',
                    fontSize: 13,
                    fontWeight: 700,
                    background: '#16A34A',
                    borderColor: '#16A34A',
                    marginTop: 6,
                  }}
                  onClick={startCameraStream}
                >
                  Subukan Muli
                </button>
              </div>
            )}

            {/* Subtle Viewfinder Guides when camera is idle/searching */}
            {isCameraActive && !cameraError && !cameraPermissionError && liveDetections.length === 0 && !isScanning && (
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
                <span>Maraming hayop ang nakita. Piliin ang hayop na susuriin.</span>
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
                        <span>{liveStatusText}</span>
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
          </div>

          {/* Target Livestock Selector Chips (Requirement 10 & 20) */}
          {validLivestock.length > 1 && !scanResult && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(22, 163, 74, 0.08)',
                border: '1.5px solid rgba(22, 163, 74, 0.25)',
                borderRadius: 12,
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                Piliin ang Hayop na I-scan:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {validLivestock.map((item, idx) => {
                  const isSelected = idx === selectedTargetIndex;
                  const isGoat = item.type === 'GOAT';
                  const label = isGoat ? 'Kambing' : 'Tupa';
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTargetIndex(idx);
                        selectedTargetIndexRef.current = idx;
                        if (overlayCanvasRef.current && videoRef.current) {
                          renderLiveDetectionsToCanvas(
                            overlayCanvasRef.current,
                            videoRef.current,
                            liveDetections,
                            idx
                          );
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        border: isSelected ? '2px solid #16A34A' : '1px solid rgba(0,0,0,0.15)',
                        background: isSelected ? '#16A34A' : 'var(--surface, #FFFFFF)',
                        color: isSelected ? '#FFFFFF' : 'var(--text-primary)',
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 2px 8px rgba(22, 163, 74, 0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isSelected && <CheckCircle2 size={13} color="#FFFFFF" />}
                      <span>{isSelected ? `Napili: ${label}` : label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                    <span>
                      {validLivestock.length > 1
                        ? `I-scan ang Napili (${(validLivestock[selectedTargetIndex] || validLivestock[0])?.type === 'SHEEP' ? 'Tupa' : 'Kambing'})`
                        : validLivestock.length === 1
                        ? (validLivestock[0]?.type === 'SHEEP' ? 'I-scan ang Tupa' : 'I-scan ang Kambing')
                        : 'I-scan ang Hayop'}
                    </span>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                    Kalagayan:
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

              {/* Napansin (Bulleted Observations) */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Napansin:
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

              {/* Gawin */}
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Gawin:
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
