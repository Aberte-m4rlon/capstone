/**
 * LiveObjectDetectionCamera.tsx GÃ‡Ã¶ Dedicated Full-Screen "AI Health Scanner"
 *
 * Real-time object-detection mobile camera experience for AlpasFarm:
 * - Dedicated full-screen mobile camera layout (no standard app navigation while active)
 * - Top translucent bar: [GÃ¥Ã‰] [AI Health Scanner status] [GÃœÃ–]
 * - Full-bleed live camera stream with object-fit: cover and hardware-accelerated RAF canvas
 * - Temporal stabilization & IoU tracking (zero jitter, zero flickering, grace periods, clean scene clearing)
 * - Accurate coordinate transformation for object-fit: cover mobile viewports
 * - Tap-to-select on live detection box; selection follows the persistent track
 * - Floating status pill: "Naghahanap ng kambing o tupa...", "Kambing ang nakita", "Kambing na napili", etc.
 * - Dedicated 3-element bottom camera control bar:
 *     [ Thumbnail / Gallery icon ]   GÃ¹Ã… [ Large 78px Circular Shutter (I-SCAN) ]   [ Flip Camera ]
 * - Safe area padding for Android/iOS navigation gestures: env(safe-area-inset-bottom)
 * - Gemini Multimodal Vision API invoked ONLY upon pressing I-SCAN
 * - Post-scan Health Check bottom sheet overlay displayed directly over the camera
 * - Storage persistence to Supabase 'animal-screenings' bucket + health_records update
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  SwitchCamera,
  Camera,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  HeartPulse,
  Save,
  RotateCcw,
  Check,
  UploadCloud,
  Video,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../ui/Toast';
import { useAuth } from '../../../lib/auth';
import { useFarmData } from '../../../lib/useFarmData';
import {
  TemporalLivestockTracker,
  DEFAULT_TRACKER_CONFIG,
  computeViewportTransform,
  renderTrackedAnimalsToCanvas,
  TrackedLivestockAnimal,
  RawLivestockDetection,
  LivestockSpecies,
  LivestockDisplayLabel,
} from '../../../lib/temporalBoxTracker';
import { detectLiveObjects } from '../../../lib/geminiScanner';
import {
  captureVideoFrame,
  captureLowResFrame,
  canvasToBlob,
  cropCanvasToBoundingBox,
  evaluateFrameAvailability,
} from '../../../lib/cameraUtils';
import {
  analyzeAnimalVideo,
  GeminiLiveDetector,
  scanAnimalWithGemini,
  GeminiScanResult,
  GeminiLiveErrorDetail,
  GeminiLiveDebugInfo,
  processUploadedImage,
  analyzeUploadedImage,
  detectUploadedAnimals,
  scanSelectedUploadedAnimal,
  UploadedAnimalDetection,
  UploadedImageAnalysisResult,
  SynchronizedDetectionResult,
} from '../../../lib/geminiScanner';
import { getRecordRiskMeta } from '../../../pages/HealthPage';
import type { Animal, HealthRecord, InventoryItem } from '../../../types';

interface LiveObjectDetectionCameraProps {
  /** Callback to close or go back */
  onClose: () => void;
  /** Optional preselected animal ID */
  preselectedAnimalId?: string;
  /** Optional callback when a health check is successfully saved */
  onHealthCheckSaved?: (record: HealthRecord) => void;
}

export function LiveObjectDetectionCamera({
  onClose,
  preselectedAnimalId,
  onHealthCheckSaved,
}: LiveObjectDetectionCameraProps) {
  const toast = useToast();
  const { user } = useAuth();
  const farmData = useFarmData();

  // GÃ¶Ã‡GÃ¶Ã‡ Elements & State Refs GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const rafIdRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number>(0);
  const detectTimerRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);
  const liveDetectorRef = useRef<GeminiLiveDetector | null>(null);
  const observationRecorderRef = useRef<MediaRecorder | null>(null);
  const observationChunksRef = useRef<Blob[]>([]);
  const observationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startObservationRecording = useCallback(() => {
    if (observationRecorderRef.current || !streamRef.current || typeof MediaRecorder === 'undefined') return;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    observationRecorderRef.current = recorder; observationChunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) observationChunksRef.current.push(event.data); };
    recorder.onstop = async () => { observationRecorderRef.current = null; const blob = new Blob(observationChunksRef.current, { type: mimeType }); observationChunksRef.current = []; if (!blob.size || !isMountedRef.current) return; try { const analysis = await analyzeAnimalVideo(blob); if (isMountedRef.current) setStatusMessage(analysis.summary || 'Napansing kilos.'); } catch { if (isMountedRef.current) setStatusMessage('Hindi sapat ang view ng kilos.'); } };
    recorder.start();
    observationTimerRef.current = setTimeout(() => { if (observationRecorderRef.current?.state === 'recording') observationRecorderRef.current.stop(); observationTimerRef.current = null; }, 6000);
  }, []);

  // GÃ¶Ã‡GÃ¶Ã‡ Suppress standard app navigation while camera scanner is open GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  useEffect(() => {
    document.body.classList.add('camera-scanner-active');
    return () => {
      document.body.classList.remove('camera-scanner-active');
    };
  }, []);

  // GÃ¶Ã‡GÃ¶Ã‡ Camera Lifecycle State GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showSettings, setShowSettings] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  // Gemini Live Connection Lifecycle State
  const [geminiLiveState, setGeminiLiveState] = useState<'OFF' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('OFF');
  const [scannerState, setScannerState] = useState<
    'CAMERA_STARTING' | 'CAMERA_READY' | 'GEMINI_TOKEN_REQUESTING' | 'GEMINI_CONNECTING' | 'GEMINI_READY' | 'GEMINI_ERROR' | 'DETECTING'
  >('CAMERA_STARTING');
  const [geminiErrorDetail, setGeminiErrorDetail] = useState<GeminiLiveErrorDetail | null>(null);
  const [geminiRetryCount, setGeminiRetryCount] = useState<number>(0);
  const geminiStartTimeRef = useRef<number>(0);
  const hasLoggedStepJRef = useRef<boolean>(false);

  // ── Camera Frame Availability & Synchronization (2586.mp4 regression protection) ──
  const [cameraFrameAvailable, setCameraFrameAvailable] = useState<boolean>(true);
  const cameraFrameAvailableRef = useRef<boolean>(true);
  const cameraSessionIdRef = useRef<string>('');
  const latestFrameIdRef = useRef<number>(0);
  const latestAcceptedFrameIdRef = useRef<number>(0);

  // ── Tracking & Selection State ─────────────────────────────────────────────
  const [statusMessage, setStatusMessage] = useState<string>('Naghahanap ng kambing o tupa...');
  const [isTrackLost, setIsTrackLost] = useState<boolean>(false);
  const activeTracksLengthRef = useRef<number>(0);
  const trackerRef = useRef<TemporalLivestockTracker>(
    new TemporalLivestockTracker(DEFAULT_TRACKER_CONFIG, () => {
      // Callback when selected track drops past grace period
      setIsTrackLost(true);
      setSelectedTrack(null);
      setStatusMessage('Hindi ko na makita ang napiling hayop.');
    })
  );
  const [activeTracks, setActiveTracks] = useState<TrackedLivestockAnimal[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackedLivestockAnimal | null>(null);
  const [debugInfo, setDebugInfo] = useState<GeminiLiveDebugInfo>({
    framesSent: 0,
    lastMessage: 'WAITING',
    detectionCount: 0,
    lastSpecies: 'none',
    boxReceived: false,
    parserStatus: 'IDLE',
  });

  // ── Health Scan & Result State ───────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<GeminiScanResult | null>(null);
  const [croppedImagePreview, setCroppedImagePreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [lastCapturedThumbnail, setLastCapturedThumbnail] = useState<string | null>(null);
  const [showResultSheet, setShowResultSheet] = useState<boolean>(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedFarmAnimalId, setSelectedFarmAnimalId] = useState<string>(preselectedAnimalId || '');
  const [medItemId, setMedItemId] = useState<string>('');
  const [medQty, setMedQty] = useState<string>('');

  // ── Scanner Mode & Image Upload State ──────────────────────────────────────
  const [scannerMode, setScannerMode] = useState<'camera' | 'upload'>('camera');
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);
  const [uploadedDimensions, setUploadedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isAnalyzingUpload, setIsAnalyzingUpload] = useState<boolean>(false);
  const [isDetectingUpload, setIsDetectingUpload] = useState<boolean>(false);
  const [uploadDetections, setUploadDetections] = useState<UploadedAnimalDetection[]>([]);
  const [selectedUploadIndex, setSelectedUploadIndex] = useState<number | null>(null);
  const [uploadAnalysisResult, setUploadAnalysisResult] = useState<UploadedImageAnalysisResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Active Animals & Medicines ───────────────────────────────────────────────
  const activeFarmAnimals = useMemo(() => {
    return farmData.animals.filter((a: Animal) => !a.archived && !a.is_sold && a.status !== 'Sold');
  }, [farmData.animals]);

  const availableMedicines = useMemo(() => {
    return farmData.inventory.filter(
      (item: InventoryItem) => (item.quantity ?? 0) > 0 && item.category?.toLowerCase().includes('med')
    );
  }, [farmData.inventory]);

  // Selected registered animal entity
  const selectedAnimal = useMemo(() => {
    return activeFarmAnimals.find((a) => a.id === selectedFarmAnimalId) || null;
  }, [activeFarmAnimals, selectedFarmAnimalId]);

  // ── Formatted Farmer-Friendly Detection Status ──────────────────────────────
  const computeDetectionStatus = useCallback(
    (tracks: TrackedLivestockAnimal[], selected: TrackedLivestockAnimal | null): string => {
      if (tracks.length === 0) {
        return 'Naghahanap ng kambing o tupa...';
      }
      const livestock = tracks.filter((t) => t.species !== 'person');
      const goats = tracks.filter((t) => t.species === 'goat').length;
      const sheep = tracks.filter((t) => t.species === 'sheep').length;
      const persons = tracks.filter((t) => t.species === 'person').length;

      if (selected && selected.species !== 'person') {
        const num = selected.displayNumber ? ` #${selected.displayNumber}` : '';
        const name = selected.species === 'sheep' ? `TUPA${num}` : `KAMBING${num}`;
        return `✓ Napili: ${name}`;
      }

      if (livestock.length > 1) {
        return 'Maraming hayop ang nakita. Piliin ang isang hayop na gusto mong i-scan.';
      }

      if (goats > 0 && sheep > 0) {
        return `${goats} kambing • ${sheep} tupa ang nakita`;
      }
      if (goats > 0) {
        return goats === 1 ? '1 kambing ang nakita' : `${goats} kambing ang nakita`;
      }
      if (sheep > 0) {
        return sheep === 1 ? '1 tupa ang nakita' : `${sheep} tupa ang nakita`;
      }
      if (persons > 0) {
        return 'May taong nakita. Itutok ang camera sa kambing o tupa.';
      }
      return 'Naghahanap ng kambing o tupa...';
    },
    []
  );

  // ── Clear Selection Callback ───────────────────────────────────────────────
  const handleClearSelection = useCallback(() => {
    trackerRef.current.selectTrackById(null);
    setSelectedTrack(null);
    setIsTrackLost(false);
    const activeLivestock = trackerRef.current.getActiveTracks().filter((t) => t.species !== 'person');
    if (activeLivestock.length > 1) {
      setStatusMessage('Maraming hayop ang nakita. Piliin ang isang hayop na gusto mong i-scan.');
    } else if (activeLivestock.length === 1) {
      setStatusMessage('1 kambing ang nakita.');
    } else {
      setStatusMessage('Naghahanap ng kambing o tupa...');
    }
  }, []);

  // GÃ¶Ã‡GÃ¶Ã‡ Stop Camera Stream GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  // Stop Camera Stream
  const stopCameraStream = useCallback(() => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
    cameraSessionIdRef.current = '';
    latestFrameIdRef.current = 0;
    latestAcceptedFrameIdRef.current = 0;
    cameraFrameAvailableRef.current = false;
    setCameraFrameAvailable(false);
    liveDetectorRef.current?.close();
    liveDetectorRef.current = null;
    setGeminiLiveState('OFF');
    if (observationTimerRef.current) { clearTimeout(observationTimerRef.current); observationTimerRef.current = null; }
    if (observationRecorderRef.current?.state === 'recording') observationRecorderRef.current.stop();
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastRafTimeRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    trackerRef.current.reset();
    activeTracksLengthRef.current = 0;
    setActiveTracks([]);
    setSelectedTrack(null);
    setStatusMessage('Naghahanap ng kambing o tupa...');
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setIsCameraActive(false);
  }, []);

  // Connect Gemini Live in Background (Non-blocking)
  const connectGeminiLive = useCallback(async (targetSessionId?: string) => {
    const activeSessionId = targetSessionId || cameraSessionIdRef.current || `cam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    cameraSessionIdRef.current = activeSessionId;

    // Clean up any existing live detector session first
    if (liveDetectorRef.current) {
      try {
        liveDetectorRef.current.close();
      } catch {}
      liveDetectorRef.current = null;
    }

    hasLoggedStepJRef.current = false;
    geminiStartTimeRef.current = Date.now();
    setGeminiLiveState('CONNECTING');
    setScannerState('GEMINI_TOKEN_REQUESTING');
    setGeminiErrorDetail(null);
    setStatusMessage('Inihahanda ang AI Scanner...');

    const liveDetector = new GeminiLiveDetector({
      onSynchronizedDetections: (result: SynchronizedDetectionResult) => {
        if (!isMountedRef.current) return;

        // 1. Session verification: Ignore responses from past camera sessions
        if (result.sessionId && cameraSessionIdRef.current && result.sessionId !== cameraSessionIdRef.current) {
          console.log('[DETECTION] Discarded response: camera session changed');
          return;
        }

        // 2. Sequence verification: Discard out-of-order frames
        if (result.frameId < latestAcceptedFrameIdRef.current) {
          console.log('[DETECTION] Discarded response: out-of-order frame');
          return;
        }

        // 3. Dark/unavailable frame verification (2586.mp4 regression protection)
        if (!cameraFrameAvailableRef.current) {
          console.log('[DETECTION] Discarded response: camera frame is currently dark or unavailable');
          return;
        }

        // 4. Freshness verification: Reject responses with latency > 1800ms
        if (Date.now() - result.capturedAt > 1800) {
          console.log('[DETECTION] Discarded response: stale response (>1800ms)');
          return;
        }

        latestAcceptedFrameIdRef.current = result.frameId;

        // Filter valid goat or sheep detections with real boxes
        const validDetections = (result.detections || []).filter(
          (d) =>
            (d?.species === 'goat' || d?.species === 'sheep') &&
            Array.isArray(d?.box_2d) &&
            d.box_2d.length === 4
        );

        if (validDetections.length > 0) {
          setScannerState('DETECTING');
          if (!hasLoggedStepJRef.current) {
            hasLoggedStepJRef.current = true;
            const stepJTime = Date.now() - geminiStartTimeRef.current;
            console.log(`[GeminiLive] render detection box: ${stepJTime} ms`);
          }
        }

        const rawLivestock: RawLivestockDetection[] = validDetections.map((d) => ({
          species: d.species,
          label: d.species === 'sheep' ? 'TUPA' : 'KAMBING',
          confidence: 0.95,
          box: {
            x: d.box_2d[1] / 1000,
            y: d.box_2d[0] / 1000,
            width: (d.box_2d[3] - d.box_2d[1]) / 1000,
            height: (d.box_2d[2] - d.box_2d[0]) / 1000,
          },
          rawCategory: d.species,
        }));

        const updatedTracks = trackerRef.current.update(rawLivestock, result.capturedAt);
        activeTracksLengthRef.current = updatedTracks.length;
        setActiveTracks(updatedTracks);
        if (updatedTracks.some((track) => track.consecutiveHits >= 3)) {
          startObservationRecording();
        }
        const selected = trackerRef.current.getSelectedTrack();
        setSelectedTrack(selected);
        setStatusMessage(computeDetectionStatus(updatedTracks, selected));
      },
      onDetections: () => {
        // Handled via onSynchronizedDetections for frame-freshness synchronization
      },
      onDebugUpdate: (info) => {
        if (!isMountedRef.current) return;
        setDebugInfo(info);
      },
      onStatusChange: (state, msg) => {
        if (!isMountedRef.current) return;
        if (state === 'CONNECTED') {
          setGeminiLiveState('CONNECTED');
          setScannerState('GEMINI_READY');
          setStatusMessage('Naghahanap ng kambing o tupa...');
        } else if (state === 'CONNECTING') {
          setGeminiLiveState('CONNECTING');
          setScannerState('GEMINI_CONNECTING');
          setStatusMessage(msg);
        } else if (state === 'ERROR' || state === 'CLOSED') {
          setGeminiLiveState('ERROR');
          setScannerState('GEMINI_ERROR');
          setStatusMessage(msg || 'Hindi maihanda ang AI Scanner.');
        }
      },
      onError: (errDetail: GeminiLiveErrorDetail) => {
        console.warn('[Camera] Live error:', errDetail?.message || errDetail);
        if (isMountedRef.current) {
          setGeminiLiveState('ERROR');
          setScannerState('GEMINI_ERROR');
          setGeminiErrorDetail(errDetail);
          setStatusMessage(errDetail?.userMessage || 'Hindi maihanda ang AI Scanner.');
        }
      },
    });

    liveDetectorRef.current = liveDetector;
    try {
      await liveDetector.connect(activeSessionId);
    } catch (err: any) {
      if (isMountedRef.current) {
        setGeminiLiveState('ERROR');
        setScannerState('GEMINI_ERROR');
      }
    }
  }, [computeDetectionStatus, startObservationRecording]);

  // Farmer retry action (max 3 retries, only if recoverable)
  const handleRetryGeminiLive = useCallback(() => {
    if (geminiErrorDetail && !geminiErrorDetail.isRecoverable) {
      console.warn('[Camera] Cannot retry unrecoverable configuration/authentication error.');
      return;
    }
    setGeminiRetryCount((prev) => prev + 1);
    connectGeminiLive();
  }, [connectGeminiLive, geminiErrorDetail]);

  // Start Camera Stream (Opens viewport immediately, Gemini connects asynchronously)
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    setScannerState('CAMERA_STARTING');
    setStatusMessage('Binubuksan ang camera...');
    trackerRef.current.reset();
    activeTracksLengthRef.current = 0;
    setActiveTracks([]);
    setSelectedTrack(null);

    const newSessionId = `cam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    cameraSessionIdRef.current = newSessionId;
    latestFrameIdRef.current = 0;
    latestAcceptedFrameIdRef.current = 0;
    cameraFrameAvailableRef.current = false;
    setCameraFrameAvailable(false);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Walang camera na nakita sa device.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode },
        });
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = () => {
          if (isMountedRef.current) {
            cameraFrameAvailableRef.current = true;
            setCameraFrameAvailable(true);
            setScannerState('CAMERA_READY');
          }
        };
        video.play().catch((playError) => {
          console.warn('[Camera] Mobile autoplay notice:', playError);
        });
      }

      // Camera is now active! The farmer sees video immediately.
      setIsCameraActive(true);
      setScannerState('CAMERA_READY');

      // Launch Gemini Live asynchronously in background
      connectGeminiLive(newSessionId);

    } catch (err: any) {
      console.error('[Camera] Start error:', err);
      if (!isMountedRef.current) return;
      if (err?.name === 'NotAllowedError') {
        setCameraError('Kailangan ng pahintulot (permission) para magamit ang camera.');
      } else {
        setCameraError('Hindi mabuksan ang camera. Subukan muli.');
      }
    }
  }, [facingMode, stopCameraStream, connectGeminiLive]);

  // ── Live Render Animation Loop (requestAnimationFrame) ────────────────────
  useEffect(() => {
    if (!isCameraActive || isScanning || scannerMode === 'upload') return;

    let isRunning = true;
    const tracker = trackerRef.current;
    lastRafTimeRef.current = 0;

    const renderLoop = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const container = containerRef.current;

      if (video && canvas && container && video.readyState >= 2) {
        // 2586.mp4 regression protection: If camera is pitch black or unavailable, wipe canvas immediately
        if (!cameraFrameAvailableRef.current) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          rafIdRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const displayW = Math.round(rect.width);
        const displayH = Math.round(rect.height);

        if (displayW > 0 && displayH > 0) {
          const targetW = Math.round(displayW * dpr);
          const targetH = Math.round(displayH * dpr);

          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            canvas.style.width = `${displayW}px`;
            canvas.style.height = `${displayH}px`;
          }

          const transform = computeViewportTransform(
            displayW,
            displayH,
            video.videoWidth,
            video.videoHeight
          );

          // Calculate elapsed delta time in seconds for frame-rate-independent smoothing
          const now = performance.now();
          const dtSec = lastRafTimeRef.current > 0 ? Math.min(0.12, (now - lastRafTimeRef.current) / 1000) : 1 / 60;
          lastRafTimeRef.current = now;

          // 60 FPS motion smoothing interpolation & real-time velocity dead reckoning
          tracker.step(Date.now(), dtSec);
          const currentTracks = tracker.getActiveTracks();

          renderTrackedAnimalsToCanvas(
            canvas,
            currentTracks,
            transform,
            dpr
          );

          if (currentTracks.length === 0 && activeTracksLengthRef.current > 0) {
            activeTracksLengthRef.current = 0;
            setActiveTracks([]);
            setSelectedTrack(null);
            setStatusMessage('Naghahanap ng kambing o tupa...');
          } else if (currentTracks.length > 0 && activeTracksLengthRef.current !== currentTracks.length) {
            activeTracksLengthRef.current = currentTracks.length;
            setActiveTracks(currentTracks);
            const selected = tracker.getSelectedTrack();
            setSelectedTrack(selected);
            setStatusMessage(computeDetectionStatus(currentTracks, selected));
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(renderLoop);
    };

    rafIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isRunning = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastRafTimeRef.current = 0;
    };
  }, [isCameraActive, isScanning, scannerMode, computeDetectionStatus]);

  // Live Detection Cycle (only active when Gemini Live is CONNECTED)
  const runDetectionCycle = useCallback(() => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      isScanning ||
      showResultSheet ||
      scannerMode === 'upload'
    ) {
      if (cameraFrameAvailableRef.current) {
        cameraFrameAvailableRef.current = false;
        setCameraFrameAvailable(false);
        trackerRef.current.reset();
        activeTracksLengthRef.current = 0;
        setActiveTracks([]);
        setSelectedTrack(null);
        setStatusMessage('Naghahanap ng kambing o tupa...');
        const canvas = overlayCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const frameCanvas = captureLowResFrame(video, 480);
    const lumCheck = evaluateFrameAvailability(frameCanvas);

    // 2586.mp4 regression protection: If camera is pitch black or lens is covered
    if (!lumCheck.isAvailable) {
      if (cameraFrameAvailableRef.current) {
        cameraFrameAvailableRef.current = false;
        setCameraFrameAvailable(false);
        trackerRef.current.reset();
        activeTracksLengthRef.current = 0;
        setActiveTracks([]);
        setSelectedTrack(null);
        setStatusMessage('Naghahanap ng kambing o tupa...');
        const canvas = overlayCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    // Camera has usable illuminated frames
    if (!cameraFrameAvailableRef.current) {
      cameraFrameAvailableRef.current = true;
      setCameraFrameAvailable(true);
    }

    if (geminiLiveState !== 'CONNECTED' || !liveDetectorRef.current?.isReady()) {
      return;
    }

    const frameId = ++latestFrameIdRef.current;
    const capturedAt = Date.now();
    liveDetectorRef.current.sendFrame(frameCanvas, {
      frameId,
      capturedAt,
      sessionId: cameraSessionIdRef.current,
    });
  }, [isScanning, showResultSheet, geminiLiveState, scannerMode]);

  // Gemini sampling interval: one low-resolution request at a time
  useEffect(() => {
    if (!isCameraActive || isScanning || showResultSheet || geminiLiveState !== 'CONNECTED') {
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
        detectTimerRef.current = null;
      }
      return;
    }

    // Throttled to ~1 frame per second as required by Multimodal Live API guidelines
    detectTimerRef.current = setInterval(runDetectionCycle, 1000);

    return () => {
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
        detectTimerRef.current = null;
      }
    };
  }, [isCameraActive, isScanning, showResultSheet, geminiLiveState, runDetectionCycle]);

  // GÃ¶Ã‡GÃ¶Ã‡ Camera Mount Lifecycle GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  useEffect(() => {
    isMountedRef.current = true;
    startCameraStream();

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [startCameraStream, stopCameraStream]);

  // GÃ¶Ã‡GÃ¶Ã‡ Tap to Select on Viewport GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  const handleViewportTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (showResultSheet) return;

    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || video.videoWidth === 0) return;

    const rect = container.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }

    const tapX = clientX - rect.left;
    const tapY = clientY - rect.top;

    const transform = computeViewportTransform(
      container.clientWidth,
      container.clientHeight,
      video.videoWidth,
      video.videoHeight
    );

    const tracker = trackerRef.current;
    const hitTrack = tracker.selectAtScreenCoordinates(tapX, tapY, transform);

    if (hitTrack && hitTrack.species !== 'person') {
      setSelectedTrack(hitTrack);
      setIsTrackLost(false);
      const num = hitTrack.displayNumber ? ` #${hitTrack.displayNumber}` : '';
      const label = hitTrack.species === 'sheep' ? `TUPA${num}` : `KAMBING${num}`;
      setStatusMessage(`✓ Napili: ${label}`);
    }
    // Do NOT deselect on accidental taps outside! Avoid frustrating misclicks on mobile.
  };

  // ── Camera Flip Control ────────────────────────────────────────────────────
  const handleFlipCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // ── Health Scan: Capture & Send Selected Animal to AI Vision ───────────────
  const handlePerformHealthScan = async () => {
    const video = videoRef.current;
    const selected = trackerRef.current.getSelectedTrack();

    if (!video || !selected || selected.species === 'person' || isTrackLost) {
      toast('Pumili muna ng kambing o tupa na i-scan.', 'warning');
      return;
    }

    const selectedNum = selected.displayNumber ? ` #${selected.displayNumber}` : '';
    const selectedName = selected.species === 'sheep' ? `TUPA${selectedNum}` : `KAMBING${selectedNum}`;

    setIsScanning(true);
    setStatusMessage(`Kinukunan ang napiling ${selectedName} at sinusuri gamit ang AI...`);

    try {
      // 1. Capture full-resolution video frame
      const fullFrameCanvas = captureVideoFrame(video);

      // 2. Crop the selected animal's bounding box with 15% safe padding margin
      const croppedCanvas = cropCanvasToBoundingBox(fullFrameCanvas, selected.box, 0.15);
      const dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.90);
      const blob = await canvasToBlob(croppedCanvas, 0.90);

      setCroppedImagePreview(dataUrl);
      setCroppedBlob(blob);
      setLastCapturedThumbnail(dataUrl);

      // 3. Send crop to AI Multimodal Vision API
      const result = await scanAnimalWithGemini(croppedCanvas, {
        context: 'health_scan',
        animalType: selected.species === 'sheep' ? 'sheep' : 'goat',
      });

      if (!result.success || !result.detected) {
        toast('Hindi malinaw ang kuha. Subukan muli.', 'warning');
        setIsScanning(false);
        return;
      }

      // Keep species identity from the selected local camera track.
      // AI supplies health observations; it must not reclassify GOAT as SHEEP.
      const verifiedSpecies = selected.species === 'sheep' ? 'sheep' : 'goat';
      const verifiedLabel = verifiedSpecies === 'sheep' ? 'TUPA' : 'KAMBING';
      const firstAnimal = result.animals?.[0];
      const verifiedResult: GeminiScanResult = {
        ...result,
        animals: [
          {
            id: firstAnimal?.id || `detected-${Date.now()}`,
            species: verifiedSpecies,
            label: verifiedLabel,
            boundingBox: firstAnimal?.boundingBox || {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              rawBox: [0, 0, 1000, 1000],
            },
            bodyOrientation: firstAnimal?.bodyOrientation || 'side',
            visualObservations: firstAnimal?.visualObservations || [],
            possibleHealthConcerns: firstAnimal?.possibleHealthConcerns || [],
            needsManualCheck: firstAnimal?.needsManualCheck || false,
            healthStatus: firstAnimal?.healthStatus || 'healthy',
          },
        ],
        rawResponse: result.rawResponse
          ? {
              ...result.rawResponse,
              animal_type: verifiedSpecies,
              animal_label: verifiedSpecies === 'sheep' ? 'Tupa' : 'Kambing',
            }
          : result.rawResponse,
      };

      setScanResult(verifiedResult);
      setShowResultSheet(true);

      // Auto-match preselected animal or first matching species
      if (!selectedFarmAnimalId) {
        const matchingAnimal = activeFarmAnimals.find(
          (a: Animal) => a.species?.toLowerCase() === selected.species
        );
        if (matchingAnimal) {
          setSelectedFarmAnimalId(matchingAnimal.id);
        } else if (activeFarmAnimals.length > 0) {
          setSelectedFarmAnimalId(activeFarmAnimals[0].id);
        }
      }
    } catch (err: any) {
      console.error('[Camera] Health scan error:', err);
      toast(err?.message || 'Nabigo ang pagsusuri sa kalusugan.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // ── Scanner Mode Switcher ───────────────────────────────────────────────────
  const handleSwitchMode = useCallback((mode: 'camera' | 'upload') => {
    setScannerMode(mode);
    if (mode === 'camera') {
      if (!isCameraActive && !cameraError) {
        startCameraStream();
      }
    } else {
      stopCameraStream();
    }
  }, [isCameraActive, cameraError, startCameraStream, stopCameraStream]);

  // ── Handle File Selection for Image Upload ─────────────────────────────────
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadAnalysisResult(null);
    setUploadDetections([]);
    setSelectedUploadIndex(null);
    setScanResult(null);
    setCroppedImagePreview(null);
    setCroppedBlob(null);

    try {
      const processed = await processUploadedImage(file);
      setUploadedImagePreview(processed.dataUrl);
      setUploadedBlob(processed.blob);
      setUploadedDimensions({ width: processed.width, height: processed.height });
      setLastCapturedThumbnail(processed.dataUrl);
      setScannerMode('upload');
      setStatusMessage('Hinahanap ang mga kambing o tupa sa larawan...');

      // Immediately run static AI detection to locate all goats/sheep
      setIsDetectingUpload(true);
      const detectResult = await detectUploadedAnimals(processed.dataUrl);
      setIsDetectingUpload(false);

      if (!detectResult.detectedGoatOrSheep || detectResult.detections.length === 0) {
        setUploadDetections([]);
        setSelectedUploadIndex(null);
        setStatusMessage('Walang kambing o tupa na nakita sa larawan.');
        toast('Walang kambing o tupa na nakita sa larawan.', 'warning');
      } else {
        setUploadDetections(detectResult.detections);
        if (detectResult.detections.length === 1) {
          // Exactly 1 animal: auto-select it immediately
          setSelectedUploadIndex(0);
          const single = detectResult.detections[0];
          setStatusMessage(`✓ Napili: ${single.label}`);
        } else {
          // Multiple animals: require farmer to tap one
          setSelectedUploadIndex(null);
          setStatusMessage(`${detectResult.detections.length} kambing ang nakita. Piliin ang alagang susuriin.`);
        }
      }
    } catch (err: any) {
      console.error('[Upload] Image file processing error:', err);
      setIsDetectingUpload(false);
      setUploadError(err?.message || 'Hindi maproseso ang larawan. Pumili ng JPG, PNG, o WEBP.');
      toast(err?.message || 'Hindi maproseso ang larawan.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Analyze Uploaded Image with AI (Single Selected Animal) ────────────────
  const handleScanUploadedImage = async () => {
    if (!uploadedImagePreview || isAnalyzingUpload) return;

    if (uploadDetections.length === 0) {
      toast('Walang kambing o tupa na nakita sa larawan.', 'warning');
      return;
    }

    if (selectedUploadIndex === null) {
      toast('Pumili muna ng kambing o tupa na i-scan.', 'warning');
      return;
    }

    const selectedDet = uploadDetections[selectedUploadIndex];
    if (!selectedDet) return;

    setIsAnalyzingUpload(true);
    setUploadError(null);
    setStatusMessage(`Sinusuri ang napiling ${selectedDet.species === 'sheep' ? 'tupa' : 'kambing'} gamit ang AI...`);

    try {
      const { scanResult: healthResult, croppedDataUrl, croppedBlob } =
        await scanSelectedUploadedAnimal(uploadedImagePreview, selectedDet);

      setCroppedImagePreview(croppedDataUrl);
      setCroppedBlob(croppedBlob);
      setScanResult(healthResult);
      setShowResultSheet(true);

      const raw = healthResult.rawResponse;
      const condition = (raw?.condition || 'Maayos') as 'Maayos' | 'Bantayan' | 'Kailangan ng Atensyon' | 'Kailangan ng Gamot';
      const conditionSummary = raw?.condition_summary || 'Maayos ang nakikitang tindig at pangangatawan.';
      const observations: string[] = raw?.visual_observations || (healthResult.animals?.[0]?.visualObservations) || [];
      const recommendation = healthResult.recommendation || raw?.action || 'Ipagpatuloy ang regular na pagmamasid.';

      setUploadAnalysisResult({
        success: true,
        detectedGoatOrSheep: true,
        goatCount: uploadDetections.filter((d) => d.species === 'goat').length,
        sheepCount: uploadDetections.filter((d) => d.species === 'sheep').length,
        detections: uploadDetections,
        statusBadge: 'Scan complete',
        condition,
        conditionSummary,
        observations,
        recommendation,
        rawScanResult: healthResult,
      });

      if (!selectedFarmAnimalId) {
        const match = activeFarmAnimals.find(
          (a: Animal) => a.species?.toLowerCase() === selectedDet.species
        );
        if (match) setSelectedFarmAnimalId(match.id);
        else if (activeFarmAnimals.length > 0) setSelectedFarmAnimalId(activeFarmAnimals[0].id);
      }
      toast('Tapos na ang pagsusuri sa napiling alaga.', 'success');
    } catch (err: any) {
      console.error('[Upload] Single-animal health scan error:', err);
      setUploadError(err?.message || 'Hindi masuri ang larawan. Subukan muli.');
      toast('Hindi masuri ang larawan. Subukan muli.', 'error');
    } finally {
      setIsAnalyzingUpload(false);
    }
  };

  // ── Reset Upload State ─────────────────────────────────────────────────────
  const handleResetUpload = () => {
    setUploadedImagePreview(null);
    setUploadedBlob(null);
    setUploadedDimensions(null);
    setUploadAnalysisResult(null);
    setUploadDetections([]);
    setSelectedUploadIndex(null);
    setIsDetectingUpload(false);
    setUploadError(null);
    setScanResult(null);
    setCroppedImagePreview(null);
    setCroppedBlob(null);
    setNotes('');
    setMedItemId('');
    setMedQty('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStatusMessage('Pumili ng larawan upang simulan ang pagsusuri.');
  };

  // ── Reset & Rescan ─────────────────────────────────────────────────────────
  const handleResetScan = () => {
    setShowResultSheet(false);
    setScanResult(null);
    setCroppedImagePreview(null);
    setCroppedBlob(null);
    setNotes('');
    setMedItemId('');
    setMedQty('');
    if (scannerMode === 'upload') {
      handleResetUpload();
    } else {
      setStatusMessage('Naghahanap ng kambing o tupa...');
    }
  };

  // GÃ¶Ã‡GÃ¶Ã‡ Save Health Check to Storage & Supabase Database GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡GÃ¶Ã‡
  const handleSaveHealthCheck = async () => {
    if (!scanResult || !user) {
      toast('Walang resulta ng pagsusuri na mai-save.', 'error');
      return;
    }

    if (!selectedFarmAnimalId) {
      toast('Piliin kung aling kambing o tupa sa talaan ang sinuri.', 'warning');
      return;
    }

    const animal = farmData.animals.find((a: Animal) => a.id === selectedFarmAnimalId);
    if (!animal) {
      toast('Hindi mahanap ang napiling alaga sa talaan.', 'error');
      return;
    }

    setSavingRecord(true);
    try {
      let savedImageUrl: string | null = null;
      let savedImagePath: string | null = null;

      // 1. Upload cropped animal image to Supabase Storage ('animal-screenings' bucket)
      if (croppedBlob) {
        const fileExt = 'jpg';
        const fileName = `${animal.id}_${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('animal-screenings')
          .upload(filePath, croppedBlob, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('animal-screenings')
            .getPublicUrl(filePath);
          savedImageUrl = urlData.publicUrl;
          savedImagePath = filePath;
          setLastCapturedThumbnail(savedImageUrl);
        } else {
          console.warn('[Camera] Storage upload warning:', uploadError.message);
        }
      }

      // 2. Parse Gemini findings
      const raw = scanResult.rawResponse;
      const firstAnimal = scanResult.animals?.[0];
      const condition = raw?.condition || (scanResult.success ? 'Maayos' : 'Bantayan');
      const conditionStr = raw?.condition_summary || condition;
      const observationsList = raw?.visual_observations || firstAnimal?.visualObservations || [];
      const reasonsStr = observationsList.length > 0
        ? observationsList.join('. ')
        : scanResult.recommendation || 'Maayos ang pangangatawan.';

      let riskScore = 15;
      if (condition === 'Kailangan ng Gamot' || raw?.health_status === 'needs_medication') {
        riskScore = 80;
      } else if (condition === 'Kailangan ng Atensyon' || raw?.health_status === 'needs_attention') {
        riskScore = 60;
      } else if (condition === 'Bantayan' || raw?.health_status === 'monitor') {
        riskScore = 35;
      }

      let newStatus: Animal['health_status'] = 'Healthy';
      if (riskScore >= 65) newStatus = 'Critical';
      else if (riskScore >= 45) newStatus = 'At Risk';
      else if (riskScore >= 25) newStatus = 'Monitor';

      // 3. Insert Health Record using the deployed health_records schema.
      const riskLevel = riskScore >= 65 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low';
      const newRecordPayload = {
        animal_id: animal.id,
        user_id: user.id,
        record_date: new Date().toISOString().split('T')[0],
        risk_score: riskScore,
        risk_level: riskLevel,
        reasons: `${conditionStr}. ${reasonsStr}`,
        recommendation: scanResult.recommendation || raw?.action || null,
        notes: notes.trim() || null,
        temperature: null,
        heart_rate: null,
      };

      const { data: insertedData, error: recordError } = await supabase
        .from('health_records')
        .insert([newRecordPayload])
        .select()
        .single();

      if (recordError) throw recordError;

      // 4. Update Animal current health status
      await supabase
        .from('animals')
        .update({
          health_status: newStatus,
          health_risk_score: riskScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', animal.id);

      // 5. Optional Inventory Medicine Deduction
      if (medItemId && medQty && Number(medQty) > 0) {
        const item = farmData.inventory.find((i: InventoryItem) => i.id === medItemId);
        if (item) {
          const currentStock = Number(item.quantity) || 0;
          const deductAmount = Number(medQty);
          if (deductAmount <= currentStock) {
            await supabase
              .from('inventory')
              .update({
                quantity: currentStock - deductAmount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);
          }
        }
      }

      toast(`Na-save ang Health Check ng ${animal.tag_id}!`, 'success');
      farmData.refresh();

      if (insertedData && onHealthCheckSaved) {
        onHealthCheckSaved(insertedData as HealthRecord);
      }

      // Close bottom sheet and return to live camera for the next animal
      setShowResultSheet(false);
      setScanResult(null);
      setNotes('');
      setMedItemId('');
      setMedQty('');
    } catch (err: any) {
      console.error('[Camera] Save error:', err);
      toast(err?.message || 'Nabigo ang pag-save ng Health Check.', 'error');
    } finally {
      setSavingRecord(false);
    }
  };

  // Helper metadata for risk/status badge
  const resultRiskMeta = useMemo(() => {
    if (!scanResult) return null;
    const raw = scanResult.rawResponse;
    const condition = raw?.condition || (scanResult.success ? 'Maayos' : 'Bantayan');
    let score = 15;
    if (condition === 'Kailangan ng Gamot' || raw?.health_status === 'needs_medication') score = 80;
    else if (condition === 'Kailangan ng Atensyon' || raw?.health_status === 'needs_attention') score = 60;
    else if (condition === 'Bantayan' || raw?.health_status === 'monitor') score = 35;

    return getRecordRiskMeta({ risk_score: score } as HealthRecord);
  }, [scanResult]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0B0F17',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100dvh',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* GÃ¶Ã‡GÃ¶Ã‡ TOP HEADER BAR: [Bumalik] AI Health Scanner [GÃœÃ–] [X] GÃ¶Ã‡GÃ¶Ã‡ */}
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#0F172A',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#FFFFFF',
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Bumalik"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 10,
            padding: '7px 12px',
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} />
          <span>Bumalik</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isCameraActive ? '#22C55E' : '#EF4444',
              boxShadow: isCameraActive ? '0 0 8px #22C55E' : 'none',
            }}
          />
          <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: -0.2 }}>
            AI Health Scanner
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Mga Setting"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 10,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8',
              cursor: 'pointer',
            }}
          >
            <SettingsIcon size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 10,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* GÃ¶Ã‡GÃ¶Ã‡ SCROLLABLE MODAL BODY GÃ¶Ã‡GÃ¶Ã‡ */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          {/* Hidden File Input for Native Image Picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />

          {/* Scanner Mode Toggle (Live Camera vs Upload Image) */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              backgroundColor: '#1E293B',
              padding: 4,
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => handleSwitchMode('camera')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: scannerMode === 'camera' ? '#16A34A' : 'transparent',
                color: scannerMode === 'camera' ? '#FFFFFF' : '#94A3B8',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Video size={16} />
              <span>Live Camera</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode('upload')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: scannerMode === 'upload' ? '#16A34A' : 'transparent',
                color: scannerMode === 'upload' ? '#FFFFFF' : '#94A3B8',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <UploadCloud size={16} />
              <span>Mag-upload ng Larawan</span>
            </button>
          </div>

          {/* ── CAMERA MODE CONTENT ── */}
          {scannerMode === 'camera' && (
            <>
              {/* 1. Embedded Camera Frame (4:3 aspect ratio, 20px rounded) */}
              <div
            ref={containerRef}
            onClick={handleViewportTap}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: '#000000',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              flexShrink: 0,
            }}
          >
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />

            <canvas
              ref={overlayCanvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 20,
              }}
            />

            {/* Development-Only Debug Detection Panel (Section 19) */}
            {import.meta.env.DEV && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  backgroundColor: 'rgba(0, 0, 0, 0.85)',
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(34, 197, 94, 0.5)',
                  zIndex: 35,
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  lineHeight: '1.4',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}
              >
                <div>Live: <span style={{ color: geminiLiveState === 'CONNECTED' ? '#4ADE80' : '#FBBF24', fontWeight: 'bold' }}>{geminiLiveState}</span></div>
                <div>Frames sent: {debugInfo.framesSent}</div>
                <div>Last message: {debugInfo.lastMessage}</div>
                <div>Last detection count: {debugInfo.detectionCount}</div>
                <div>Species: {debugInfo.lastSpecies}</div>
                <div>Box: {debugInfo.boxReceived ? 'RECEIVED' : 'NONE'}</div>
                <div>Parser: {debugInfo.parserStatus}</div>
                <div>Tracker: {activeTracks.length > 0 ? `ACTIVE (${activeTracks.length})` : 'IDLE'}</div>
                {activeTracks.length > 0 && (
                  <div>Track IDs: [{activeTracks.map((t) => `#${t.trackId}`).join(', ')}]</div>
                )}
              </div>
            )}

            {showGrid && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 4,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gridTemplateRows: '1fr 1fr 1fr',
                  border: '1px dashed rgba(255, 255, 255, 0.15)',
                }}
              >
                <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.15)', borderBottom: '1px dashed rgba(255, 255, 255, 0.15)' }} />
                <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.15)', borderBottom: '1px dashed rgba(255, 255, 255, 0.15)' }} />
                <div style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.15)' }} />
                <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.15)', borderBottom: '1px dashed rgba(255, 255, 255, 0.15)' }} />
                <div style={{ borderRight: '1px dashed rgba(255, 255, 255, 0.15)', borderBottom: '1px dashed rgba(255, 255, 255, 0.15)' }} />
                <div style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.15)' }} />
              </div>
            )}

            {/* AI Scanner Non-blocking Badges (Camera preview remains visible) */}
            {isCameraActive && !cameraError && !isScanning && geminiLiveState === 'CONNECTING' && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  zIndex: 25,
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: 20,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#22C55E',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Inihahanda ang AI Scanner...</span>
              </div>
            )}

            {isCameraActive && !cameraError && !isScanning && geminiLiveState === 'CONNECTED' && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  zIndex: 25,
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: 20,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#4ADE80',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid rgba(74, 222, 128, 0.35)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#22C55E',
                    boxShadow: '0 0 8px #22C55E',
                  }}
                />
                <span>AI Scanner ay handa na</span>
              </div>
            )}

            {isCameraActive && !cameraError && !isScanning && geminiLiveState === 'ERROR' && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  right: 12,
                  zIndex: 25,
                  backgroundColor: 'rgba(15, 23, 42, 0.90)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                  color: '#FFFFFF',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }}>
                  <AlertCircle size={15} color="#F87171" style={{ flexShrink: 0 }} />
                  <span>{geminiErrorDetail?.userMessage || 'Hindi maihanda ang AI Scanner.'}</span>
                </div>
                {geminiErrorDetail && !geminiErrorDetail.isRecoverable ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: '#FCA5A5',
                      whiteSpace: 'nowrap',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    Gamitin ang I-SCAN
                  </span>
                ) : geminiRetryCount < 3 ? (
                  <button
                    type="button"
                    onClick={handleRetryGeminiLive}
                    style={{
                      background: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    Subukan Ulit {geminiRetryCount > 0 ? `(${geminiRetryCount}/3)` : ''}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                    Pindutin ang I-SCAN
                  </span>
                )}
              </div>
            )}

            {cameraError && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: '#0F172A',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  color: '#FFFFFF',
                  zIndex: 35,
                  textAlign: 'center',
                  gap: 12,
                }}
              >
                <AlertCircle size={36} color="#EF4444" />
                <div style={{ fontSize: 14, fontWeight: 700, maxWidth: 280, lineHeight: 1.4 }}>{cameraError}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={startCameraStream}
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Subukan Muli
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScannerMode('upload');
                      fileInputRef.current?.click();
                    }}
                    style={{
                      background: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <UploadCloud size={15} />
                    <span>Mag-upload ng Larawan</span>
                  </button>
                </div>
              </div>
            )}

            {isScanning && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(11, 15, 23, 0.85)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 35,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  color: '#FFFFFF',
                  padding: 16,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '4px solid rgba(34, 197, 94, 0.2)',
                    borderTopColor: '#22C55E',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <div style={{ fontSize: 15, fontWeight: 700 }}>Sinusuri ang alaga...</div>
                <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                  Sinusuri ang nakikita...
                </div>
              </div>
            )}
          </div>

          {/* Active livestock count for selection decisions */}
          {(() => {
            const activeLivestock = activeTracks.filter((t) => t.species !== 'person');
            const hasMultiple = activeLivestock.length > 1;

            return (
              <>
                {/* 2. Selection / Lost / Multi-animal Prompt Card */}
                {isTrackLost ? (
                  <div
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(239, 68, 68, 0.16)',
                      borderRadius: 14,
                      padding: '10px 14px',
                      border: '1.5px solid #EF4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertCircle size={20} color="#F87171" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#FCA5A5' }}>
                          Hindi ko na makita ang napiling hayop.
                        </div>
                        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 1 }}>
                          Maaaring umalis o natakpan ang alaga
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.25)',
                        border: '1px solid #EF4444',
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: '#FFFFFF',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Pumili ulit
                    </button>
                  </div>
                ) : selectedTrack && selectedTrack.species !== 'person' ? (
                  <div
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(22, 163, 74, 0.20)',
                      borderRadius: 14,
                      padding: '10px 14px',
                      border: '1.5px solid #22C55E',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 14px rgba(34, 197, 94, 0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={20} color="#4ADE80" />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#FFFFFF' }}>
                          ✓ Napili: {selectedTrack.displayNumber ? `${selectedTrack.label} #${selectedTrack.displayNumber}` : selectedTrack.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#86EFAC', marginTop: 1 }}>
                          Napili: 1 {selectedTrack.species === 'sheep' ? 'tupa' : 'kambing'}
                        </div>
                      </div>
                    </div>
                    {hasMultiple && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.12)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          borderRadius: 8,
                          padding: '5px 10px',
                          color: '#FFFFFF',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Palitan ang Napili
                      </button>
                    )}
                  </div>
                ) : hasMultiple ? (
                  <div
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(30, 41, 59, 0.95)',
                      borderRadius: 14,
                      padding: '10px 14px',
                      border: '1.5px solid rgba(34, 197, 94, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Sparkles size={20} color="#22C55E" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>
                        Pumili ng Hayop na I-Scan
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                        {activeLivestock.length} kambing ang nakita. I-tap ang alagang nais mong suriin bago mag-scan.
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 2. Detection Status Badge */
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.90)',
                      color: '#FFFFFF',
                      padding: '8px 18px',
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      maxWidth: '100%',
                      textAlign: 'center',
                    }}
                  >
                    {activeTracks.length > 0 ? (
                      <Sparkles size={16} color="#22C55E" />
                    ) : geminiLiveState === 'ERROR' ? (
                      <AlertCircle size={16} color="#F87171" />
                    ) : (
                      <Info size={16} color="#94A3B8" />
                    )}
                    <span>{statusMessage}</span>
                  </div>
                )}

                {/* 3. Camera Controls: [Gallery] [ I-SCAN (68px) ] [Flip Camera] */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '2px 12px',
                  }}
                >
                  {/* Gallery Upload Button */}
                  <label
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(30, 41, 59, 0.9)',
                      border: lastCapturedThumbnail ? '2px solid #22C55E' : '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      overflow: 'hidden',
                      color: '#FFFFFF',
                    }}
                    title="Pumili mula sa Gallery"
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      style={{ display: 'none' }}
                      onChange={handleFileSelected}
                    />
                    {lastCapturedThumbnail ? (
                      <img
                        src={lastCapturedThumbnail}
                        alt="Thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                  </label>

                  {/* Shutter Button (68px circular button) */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      disabled={!selectedTrack || selectedTrack.species === 'person' || isTrackLost || isScanning}
                      onClick={handlePerformHealthScan}
                      aria-label={
                        selectedTrack && selectedTrack.species !== 'person'
                          ? `I-scan ang ${selectedTrack.species === 'sheep' ? 'tupa' : 'kambing'}`
                          : 'I-scan'
                      }
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        outline: 'none',
                        cursor: selectedTrack && selectedTrack.species !== 'person' && !isTrackLost && !isScanning ? 'pointer' : 'not-allowed',
                        background: selectedTrack && selectedTrack.species !== 'person' && !isTrackLost
                          ? 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)'
                          : 'rgba(51, 65, 85, 0.55)',
                        border: selectedTrack && selectedTrack.species !== 'person' && !isTrackLost
                          ? '3px solid rgba(255, 255, 255, 0.95)'
                          : '3px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: selectedTrack && selectedTrack.species !== 'person' && !isTrackLost
                          ? '0 0 20px rgba(34, 197, 94, 0.65), 0 4px 14px rgba(0, 0, 0, 0.5)'
                          : 'none',
                        opacity: selectedTrack && selectedTrack.species !== 'person' && !isTrackLost && !isScanning ? 1 : 0.60,
                        transform: isScanning ? 'scale(0.92)' : 'scale(1)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Camera
                        size={30}
                        color={selectedTrack && selectedTrack.species !== 'person' && !isTrackLost ? '#FFFFFF' : '#94A3B8'}
                        strokeWidth={2.2}
                      />
                    </button>

                    {/* Dynamic Label Below Shutter Button */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: selectedTrack && selectedTrack.species !== 'person' && !isTrackLost ? '#4ADE80' : '#94A3B8',
                        minHeight: 15,
                        textAlign: 'center',
                      }}
                    >
                      {isTrackLost
                        ? 'PUMILI ULIT'
                        : !selectedTrack || selectedTrack.species === 'person'
                        ? hasMultiple
                          ? 'PUMILI MUNA NG HAYOP'
                          : 'I-SCAN'
                        : selectedTrack.species === 'sheep'
                        ? 'I-SCAN ANG TUPA'
                        : 'I-SCAN ANG KAMBING'}
                    </span>
                  </div>

                  {/* Flip Camera Button */}
                  <button
                    type="button"
                    onClick={handleFlipCamera}
                    aria-label="I-flip ang camera"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(30, 41, 59, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      color: '#FFFFFF',
                    }}
                  >
                    <SwitchCamera size={20} />
                  </button>
                </div>
              </>
            );
          })()}

          {/* 5. Scan Result / Health Result (Rendered in the same scrollable form below camera) */}
          {scanResult && croppedImagePreview && (
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                backgroundColor: '#0F172A',
                borderRadius: 18,
                padding: 16,
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                  RESULTA NG SCAN
                </h2>
                <button
                  type="button"
                  onClick={handleResetScan}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 8,
                    padding: '5px 10px',
                    color: '#94A3B8',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={13} />
                  <span>I-scan Ulit</span>
                </button>
              </div>

              {/* Scanned thumbnail + Hayop summary */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: '#1E293B',
                  borderRadius: 12,
                  padding: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <img
                  src={croppedImagePreview}
                  alt="Scanned animal"
                  style={{
                    width: 80,
                    height: 60,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                    Hayop
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
                    {scanResult.animals?.[0]?.species === 'sheep' ? 'Tupa' : 'Kambing'}
                  </div>
                </div>
              </div>

              {/* Kalagayan Card */}
              {resultRiskMeta && (
                <div
                  style={{
                    backgroundColor: '#1E293B',
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: `1px solid ${resultRiskMeta.badgeBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                      Kalagayan
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: resultRiskMeta.color, marginTop: 2 }}>
                      {resultRiskMeta.label}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: resultRiskMeta.badgeBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <resultRiskMeta.Icon size={18} color={resultRiskMeta.color} />
                  </div>
                </div>
              )}

              {/* Napansin (Gemini visual observations) */}
              <div
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} color="#FBBF24" />
                  Napansin:
                </div>
                {(() => {
                  const raw = scanResult.rawResponse;
                  const first = scanResult.animals?.[0];
                  const obs: string[] = raw?.visual_observations || first?.visualObservations || [];
                  if (obs.length === 0) {
                    return (
                      <div style={{ fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                        {raw?.condition_summary || 'Maayos ang tindig at walang nakitang sugat o sakit.'}
                      </div>
                    );
                  }
                  return (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.55 }}>
                      {obs.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: 3 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>

              {/* Gawin (Recommendations) */}
              <div
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HeartPulse size={14} color="#4ADE80" />
                  Gawin:
                </div>
                <div style={{ fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                  {scanResult.recommendation ||
                    scanResult.rawResponse?.action ||
                    'Panatilihing malinis ang kulungan, bigyan ng sariwang tubig, at subaybayan ang pagkain.'}
                </div>
              </div>

              {/* Farm Animal Link Selector */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 5 }}>
                  I-ugnay sa Talaan ng Alaga:
                </label>
                <select
                  value={selectedFarmAnimalId}
                  onChange={(e) => setSelectedFarmAnimalId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    backgroundColor: '#1E293B',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">-- Piliin ang Alaga --</option>
                  {activeFarmAnimals.map((a: Animal) => (
                    <option key={a.id} value={a.id}>
                      {a.tag_id} {a.name ? `(${a.name})` : ''} GÃ‡Ã¶ {a.species?.toLowerCase() === 'sheep' ? 'Tupa' : 'Kambing'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Medicine Deduction */}
              {availableMedicines.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#1E293B',
                    borderRadius: 12,
                    padding: 12,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 5 }}>
                    Gamot mula sa Inventory (Opsyonal):
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                    <select
                      value={medItemId}
                      onChange={(e) => setMedItemId(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        backgroundColor: '#0F172A',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFFFFF',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    >
                      <option value="">-- Walang Gamot --</option>
                      {availableMedicines.map((m: InventoryItem) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.quantity} {m.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Dami"
                      value={medQty}
                      onChange={(e) => setMedQty(e.target.value)}
                      min="1"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        backgroundColor: '#0F172A',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFFFFF',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Save Button */}
              <button
                type="button"
                disabled={savingRecord || !selectedFarmAnimalId}
                onClick={handleSaveHealthCheck}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: 12,
                  backgroundColor: selectedFarmAnimalId ? '#16A34A' : 'rgba(51, 65, 85, 0.6)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: 14,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: selectedFarmAnimalId && !savingRecord ? 'pointer' : 'not-allowed',
                  boxShadow: selectedFarmAnimalId ? '0 4px 16px rgba(22, 163, 74, 0.4)' : 'none',
                  marginTop: 2,
                }}
              >
                {savingRecord ? (
                  <span>I-sinisave...</span>
                ) : (
                  <>
                    <Save size={16} />
                    <span>I-save ang Health Check</span>
                  </>
                )}
              </button>
            </div>
          )}
            </>
          )}

          {/* ── UPLOAD IMAGE MODE CONTENT ── */}
          {scannerMode === 'upload' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* If no image selected yet */}
              {!uploadedImagePreview && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 3',
                    backgroundColor: '#0F172A',
                    borderRadius: 20,
                    border: '2px dashed rgba(34, 197, 94, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: 24,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UploadCloud size={30} color="#4ADE80" />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
                      Pumili ng Larawan
                    </div>
                    <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 4, maxWidth: 280 }}>
                      Suportado ang JPG, JPEG, PNG, o WEBP mula sa iyong gallery o files
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{
                      backgroundColor: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 20px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                      marginTop: 4,
                    }}
                  >
                    <ImageIcon size={16} />
                    <span>Pumili mula sa Gallery</span>
                  </button>
                </div>
              )}

              {/* If image is selected */}
              {uploadedImagePreview && (
                <>
                  {/* Uploaded Image Preview Frame with Bounding Boxes */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      borderRadius: 20,
                      overflow: 'hidden',
                      backgroundColor: '#000000',
                      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <img
                      src={uploadedImagePreview}
                      alt="Uploaded Preview"
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        transform: 'none', // Strictly un-mirrored
                      }}
                    />

                    {/* Bounding Box Overlays (static, normalized coordinates) */}
                    {uploadDetections && uploadDetections.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          pointerEvents: 'auto',
                        }}
                      >
                        {uploadDetections.map((det, idx) => {
                          const isSelected = selectedUploadIndex === idx;
                          const strokeColor = isSelected ? '#22C55E' : 'rgba(255, 255, 255, 0.45)';
                          const fillColor = isSelected ? 'rgba(34, 197, 94, 0.22)' : 'rgba(0, 0, 0, 0.20)';
                          const badgeBg = isSelected ? '#16A34A' : 'rgba(30, 41, 59, 0.85)';
                          const cornerColor = isSelected ? '#4ADE80' : 'rgba(255, 255, 255, 0.7)';
                          const labelText = isSelected
                            ? `✓ NAPILI: ${det.label}`
                            : det.label;

                          const leftPct = Math.max(0, Math.min(95, det.boundingBox.x * 100));
                          const topPct = Math.max(0, Math.min(95, det.boundingBox.y * 100));
                          const widthPct = Math.max(5, Math.min(100 - leftPct, det.boundingBox.width * 100));
                          const heightPct = Math.max(5, Math.min(100 - topPct, det.boundingBox.height * 100));

                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedUploadIndex(idx)}
                              style={{
                                position: 'absolute',
                                left: `${leftPct}%`,
                                top: `${topPct}%`,
                                width: `${widthPct}%`,
                                height: `${heightPct}%`,
                                border: isSelected ? '3.5px solid #22C55E' : '2px solid rgba(255, 255, 255, 0.45)',
                                backgroundColor: fillColor,
                                boxSizing: 'border-box',
                                borderRadius: 6,
                                cursor: 'pointer',
                                opacity: selectedUploadIndex !== null && !isSelected ? 0.38 : 1.0,
                                boxShadow: isSelected ? '0 0 16px rgba(34, 197, 94, 0.75)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {/* Corners */}
                              <div style={{ position: 'absolute', top: -2, left: -2, width: 12, height: 12, borderTop: `4px solid ${cornerColor}`, borderLeft: `4px solid ${cornerColor}`, borderTopLeftRadius: 6 }} />
                              <div style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderTop: `4px solid ${cornerColor}`, borderRight: `4px solid ${cornerColor}`, borderTopRightRadius: 6 }} />
                              <div style={{ position: 'absolute', bottom: -2, left: -2, width: 12, height: 12, borderBottom: `4px solid ${cornerColor}`, borderLeft: `4px solid ${cornerColor}`, borderBottomLeftRadius: 6 }} />
                              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderBottom: `4px solid ${cornerColor}`, borderRight: `4px solid ${cornerColor}`, borderBottomRightRadius: 6 }} />

                              {/* Label Badge */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: -24,
                                  left: -2,
                                  backgroundColor: badgeBg,
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  letterSpacing: 0.5,
                                  whiteSpace: 'nowrap',
                                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
                                }}
                              >
                                {labelText}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Detecting Animals Overlay */}
                    {isDetectingUpload && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(11, 15, 23, 0.85)',
                          backdropFilter: 'blur(4px)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          color: '#FFFFFF',
                          padding: 16,
                          textAlign: 'center',
                          zIndex: 30,
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            border: '3.5px solid rgba(34, 197, 94, 0.2)',
                            borderTopColor: '#22C55E',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }}
                        />
                        <div style={{ fontSize: 15, fontWeight: 800 }}>
                          Hinahanap ang mga kambing o tupa...
                        </div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>
                          Pagtukoy sa mga hayop sa loob ng larawan
                        </div>
                      </div>
                    )}

                    {/* Detailed Analysis Overlay */}
                    {isAnalyzingUpload && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(11, 15, 23, 0.85)',
                          backdropFilter: 'blur(4px)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          color: '#FFFFFF',
                          padding: 16,
                          textAlign: 'center',
                          zIndex: 30,
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            border: '3.5px solid rgba(34, 197, 94, 0.2)',
                            borderTopColor: '#22C55E',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }}
                        />
                        <div style={{ fontSize: 15, fontWeight: 800 }}>
                          Sinusuri ang napiling alaga...
                        </div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>
                          Pagsusuri sa kalagayan at kalusugan gamit ang AI
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pre-Analysis Status & Action Buttons */}
                  {!uploadAnalysisResult && !isAnalyzingUpload && (
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      {/* Detection / Selection Card */}
                      {isDetectingUpload ? (
                        <div
                          style={{
                            backgroundColor: '#1E293B',
                            borderRadius: 14,
                            padding: '12px 16px',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          <Sparkles size={18} color="#22C55E" />
                          <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}>
                            Hinahanap ang mga kambing o tupa sa larawan...
                          </span>
                        </div>
                      ) : uploadDetections.length === 0 ? (
                        <div
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            borderRadius: 14,
                            padding: '12px 16px',
                            width: '100%',
                            border: '1.5px solid #EF4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <AlertCircle size={20} color="#F87171" />
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#FCA5A5' }}>
                                Walang kambing o tupa na nakita
                              </div>
                              <div style={{ fontSize: 11.5, color: '#EF4444', marginTop: 1 }}>
                                Subukang mag-upload ng mas malinaw na litrato
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.25)',
                              border: '1px solid #EF4444',
                              borderRadius: 8,
                              padding: '6px 12px',
                              color: '#FFFFFF',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Pumili Ulit
                          </button>
                        </div>
                      ) : selectedUploadIndex !== null ? (
                        <div
                          style={{
                            width: '100%',
                            backgroundColor: 'rgba(22, 163, 74, 0.20)',
                            borderRadius: 14,
                            padding: '12px 16px',
                            border: '1.5px solid #22C55E',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            boxShadow: '0 4px 14px rgba(34, 197, 94, 0.25)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <CheckCircle2 size={22} color="#4ADE80" />
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF' }}>
                                ✓ Napili: {uploadDetections[selectedUploadIndex].label}
                              </div>
                              <div style={{ fontSize: 11.5, color: '#86EFAC', marginTop: 2 }}>
                                Napili: 1 {uploadDetections[selectedUploadIndex].species === 'sheep' ? 'tupa' : 'kambing'}
                              </div>
                            </div>
                          </div>
                          {uploadDetections.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSelectedUploadIndex(null)}
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                borderRadius: 8,
                                padding: '6px 12px',
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Palitan ang Napili
                            </button>
                          )}
                        </div>
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            backgroundColor: 'rgba(30, 41, 59, 0.95)',
                            borderRadius: 14,
                            padding: '12px 16px',
                            border: '1.5px solid rgba(34, 197, 94, 0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <Sparkles size={20} color="#22C55E" style={{ flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#FFFFFF' }}>
                              Pumili ng Hayop na I-Scan
                            </div>
                            <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
                              {uploadDetections.length} kambing ang nakita. I-tap ang alagang nais mong suriin sa itaas bago mag-scan.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', width: '100%', gap: 10 }}>
                        <button
                          type="button"
                          disabled={selectedUploadIndex === null || isAnalyzingUpload || isDetectingUpload}
                          onClick={handleScanUploadedImage}
                          style={{
                            flex: 2,
                            backgroundColor: selectedUploadIndex !== null && !isAnalyzingUpload && !isDetectingUpload
                              ? '#16A34A'
                              : 'rgba(51, 65, 85, 0.55)',
                            color: selectedUploadIndex !== null && !isAnalyzingUpload && !isDetectingUpload
                              ? '#FFFFFF'
                              : '#94A3B8',
                            border: selectedUploadIndex !== null
                              ? '1px solid rgba(255, 255, 255, 0.3)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 12,
                            padding: '14px 20px',
                            fontSize: 14,
                            fontWeight: 800,
                            cursor: selectedUploadIndex !== null && !isAnalyzingUpload && !isDetectingUpload ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            boxShadow: selectedUploadIndex !== null ? '0 4px 14px rgba(22, 163, 74, 0.4)' : 'none',
                          }}
                        >
                          <Sparkles size={18} />
                          <span>
                            {selectedUploadIndex !== null
                              ? `I-SCAN ANG ${uploadDetections[selectedUploadIndex].label}`
                              : 'PUMILI MUNA NG HAYOP'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            color: '#94A3B8',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: 12,
                            padding: '14px 12px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                        >
                          <ImageIcon size={16} />
                          <span>Palitan</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* If analysis finished */}
                  {uploadAnalysisResult && (
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {/* Detection Summary Badge Banner */}
                      <div
                        style={{
                          backgroundColor: uploadAnalysisResult.detectedGoatOrSheep
                            ? 'rgba(22, 163, 74, 0.18)'
                            : 'rgba(239, 68, 68, 0.15)',
                          border: uploadAnalysisResult.detectedGoatOrSheep
                            ? '1px solid rgba(34, 197, 94, 0.4)'
                            : '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: 14,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {uploadAnalysisResult.detectedGoatOrSheep ? (
                            <CheckCircle2 size={22} color="#4ADE80" />
                          ) : (
                            <AlertCircle size={22} color="#EF4444" />
                          )}
                          <div>
                            <div
                              style={{
                                fontSize: 15,
                                fontWeight: 800,
                                color: uploadAnalysisResult.detectedGoatOrSheep ? '#FFFFFF' : '#FCA5A5',
                              }}
                            >
                              {uploadAnalysisResult.statusBadge}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
                              {uploadAnalysisResult.detectedGoatOrSheep
                                ? `${uploadAnalysisResult.detections.length} ${uploadAnalysisResult.detections.length === 1 ? 'alaga ang natukoy' : 'mga alaga ang natukoy'}`
                                : 'Walang natukoy na kambing o tupa'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleResetUpload}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: 8,
                            padding: '6px 12px',
                            color: '#94A3B8',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <RotateCcw size={13} />
                          <span>Mag-upload Ulit</span>
                        </button>
                      </div>

                      {/* If NOT detected goat or sheep */}
                      {!uploadAnalysisResult.detectedGoatOrSheep && (
                        <div
                          style={{
                            backgroundColor: '#1E293B',
                            borderRadius: 14,
                            padding: 16,
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                          }}
                        >
                          <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.5 }}>
                            Hindi natukoy ang kambing o tupa sa imaheng ito. Pakitiyak na:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#94A3B8', lineHeight: 1.6 }}>
                            <li>Malinaw at may sapat na liwanag ang litrato.</li>
                            <li>Nakikita ang katawan ng kambing o tupa.</li>
                            <li>Hindi tao, aso, pusa, baka, o ibang gamit ang nakatutok.</li>
                          </ul>

                          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              style={{
                                flex: 1,
                                backgroundColor: '#16A34A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: 10,
                                padding: '10px',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}
                            >
                              <ImageIcon size={15} />
                              <span>Pumili ng Ibang Larawan</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSwitchMode('camera')}
                              style={{
                                flex: 1,
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                color: '#FFFFFF',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: 10,
                                padding: '10px',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}
                            >
                              <Video size={15} />
                              <span>Bumalik sa Live Camera</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* If detected goat or sheep: Health Card */}
                      {uploadAnalysisResult.detectedGoatOrSheep && (
                        <div
                          style={{
                            backgroundColor: '#0F172A',
                            borderRadius: 16,
                            padding: 16,
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                          }}
                        >
                          {/* Kalagayan Card */}
                          {resultRiskMeta && (
                            <div
                              style={{
                                backgroundColor: '#1E293B',
                                borderRadius: 12,
                                padding: '12px 14px',
                                border: `1px solid ${resultRiskMeta.badgeBorder}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div>
                                <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                                  Kalagayan
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: resultRiskMeta.color, marginTop: 2 }}>
                                  {resultRiskMeta.label}
                                </div>
                              </div>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  backgroundColor: resultRiskMeta.badgeBg,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <resultRiskMeta.Icon size={18} color={resultRiskMeta.color} />
                              </div>
                            </div>
                          )}

                          {/* Napansin (Visual observations) */}
                          <div
                            style={{
                              backgroundColor: '#1E293B',
                              borderRadius: 12,
                              padding: '12px 14px',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <AlertTriangle size={14} color="#FBBF24" />
                              Napansin:
                            </div>
                            {uploadAnalysisResult.observations && uploadAnalysisResult.observations.length > 0 ? (
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.55 }}>
                                {uploadAnalysisResult.observations.map((item, idx) => (
                                  <li key={idx} style={{ marginBottom: 3 }}>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div style={{ fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                                {uploadAnalysisResult.conditionSummary || 'Maayos ang nakikitang tindig at pangangatawan.'}
                              </div>
                            )}
                          </div>

                          {/* Gawin (Recommendations) */}
                          <div
                            style={{
                              backgroundColor: '#1E293B',
                              borderRadius: 12,
                              padding: '12px 14px',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <HeartPulse size={14} color="#4ADE80" />
                              Gawin:
                            </div>
                            <div style={{ fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                              {uploadAnalysisResult.recommendation || 'Ipagpatuloy ang regular na pagmamasid.'}
                            </div>
                          </div>

                          {/* Optional Farm Animal Link Selector (preserve preselected if exists, never invent fake ID) */}
                          <div>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 5 }}>
                              I-ugnay sa Talaan ng Alaga:
                            </label>
                            <select
                              value={selectedFarmAnimalId}
                              onChange={(e) => setSelectedFarmAnimalId(e.target.value)}
                              style={{
                                width: '100%',
                                backgroundColor: '#1E293B',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: 10,
                                padding: '10px 12px',
                                color: '#FFFFFF',
                                fontSize: 13,
                                outline: 'none',
                              }}
                            >
                              <option value="">(Opsyonal) Walang Napiling Alaga</option>
                              {activeFarmAnimals.map((animal: Animal) => (
                                <option key={animal.id} value={animal.id}>
                                  {animal.tag_id} {animal.name ? `(${animal.name})` : ''} - {animal.species?.toLowerCase() === 'sheep' ? 'Tupa' : 'Kambing'}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Notes */}
                          <div>
                            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 5 }}>
                              Karagdagang Tala (Notes):
                            </label>
                            <textarea
                              rows={2}
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Maglagay ng karagdagang obserbasyon..."
                              style={{
                                width: '100%',
                                backgroundColor: '#1E293B',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: 10,
                                padding: '8px 12px',
                                color: '#FFFFFF',
                                fontSize: 13,
                                resize: 'none',
                                outline: 'none',
                              }}
                            />
                          </div>

                          {/* Action Buttons: Save & Switch */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                            {selectedFarmAnimalId && (
                              <button
                                type="button"
                                disabled={savingRecord}
                                onClick={handleSaveHealthCheck}
                                style={{
                                  width: '100%',
                                  backgroundColor: '#16A34A',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: 12,
                                  padding: '12px 18px',
                                  fontSize: 14,
                                  fontWeight: 800,
                                  cursor: savingRecord ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 8,
                                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                                }}
                              >
                                <Save size={16} />
                                <span>{savingRecord ? 'Itinatabi sa talaan...' : 'Itabi sa Talaan ng Alaga'}</span>
                              </button>
                            )}

                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                  flex: 1,
                                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                  color: '#94A3B8',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  borderRadius: 10,
                                  padding: '10px',
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                }}
                              >
                                <ImageIcon size={15} />
                                <span>Pumili ng Iba</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSwitchMode('camera')}
                                style={{
                                  flex: 1,
                                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                  color: '#FFFFFF',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  borderRadius: 10,
                                  padding: '10px',
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                }}
                              >
                                <Video size={15} />
                                <span>Live Camera</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* GÃ¶Ã‡GÃ¶Ã‡ SETTINGS DRAWER / MODAL GÃ¶Ã‡GÃ¶Ã‡ */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              backgroundColor: '#1E293B',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Mga Setting ng Camera
              </h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Flip Camera Option */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Palitan ang Camera</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  Kasalukuyan: {facingMode === 'environment' ? 'Likod (Rear)' : 'Harap (Front)'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleFlipCamera}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 10,
                  padding: '8px 16px',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <SwitchCamera size={16} />
                I-flip
              </button>
            </div>

            {/* Alignment Grid Option */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Alignment Grid</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>Gabay sa pag-tutok ng alaga</div>
              </div>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: '#22C55E', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





