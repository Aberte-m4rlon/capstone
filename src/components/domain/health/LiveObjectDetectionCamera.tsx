/**
 * LiveObjectDetectionCamera.tsx GÇö Dedicated Full-Screen "AI Health Scanner"
 *
 * Real-time object-detection mobile camera experience for AlpasFarm:
 * - Dedicated full-screen mobile camera layout (no standard app navigation while active)
 * - Top translucent bar: [GåÉ] [AI Health Scanner status] [GÜÖ]
 * - Full-bleed live camera stream with object-fit: cover and hardware-accelerated RAF canvas
 * - Temporal stabilization & IoU tracking (zero jitter, zero flickering, grace periods, clean scene clearing)
 * - Accurate coordinate transformation for object-fit: cover mobile viewports
 * - Tap-to-select on live detection box; selection follows the persistent track
 * - Floating status pill: "Naghahanap ng kambing o tupa...", "Kambing ang nakita", "Kambing na napili", etc.
 * - Dedicated 3-element bottom camera control bar:
 *     [ Thumbnail / Gallery icon ]   GùÅ [ Large 78px Circular Shutter (I-SCAN) ]   [ Flip Camera ]
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
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../ui/Toast';
import { useAuth } from '../../../lib/auth';
import { useFarmData } from '../../../lib/useFarmData';
import {
  TemporalLivestockTracker,
  computeViewportTransform,
  renderTrackedAnimalsToCanvas,
  TrackedLivestockAnimal,
  RawLivestockDetection,
  LivestockSpecies,
  LivestockDisplayLabel,
} from '../../../lib/temporalBoxTracker';
import {
  detectLiveFrameLocally,
  initClientObjectDetector,
} from '../../../lib/clientObjectDetector';
import {
  captureVideoFrame,
  canvasToBlob,
  cropCanvasToBoundingBox,
} from '../../../lib/cameraUtils';
import { scanAnimalWithGemini, GeminiScanResult } from '../../../lib/geminiScanner';
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

  // GöÇGöÇ Elements & State Refs GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const rafIdRef = useRef<number | null>(null);
  const detectTimerRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);

  // GöÇGöÇ Suppress standard app navigation while camera scanner is open GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  useEffect(() => {
    document.body.classList.add('camera-scanner-active');
    return () => {
      document.body.classList.remove('camera-scanner-active');
    };
  }, []);

  // GöÇGöÇ Camera Lifecycle State GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showSettings, setShowSettings] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  // GöÇGöÇ Tracking & Selection State GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const [statusMessage, setStatusMessage] = useState<string>('Naghahanap ng kambing o tupa...');
  const trackerRef = useRef<TemporalLivestockTracker>(
    new TemporalLivestockTracker({}, () => {
      // Callback when selected track drops past grace period
      setStatusMessage('Hindi na makita ang napiling alaga. Pumili ulit.');
    })
  );
  const [activeTracks, setActiveTracks] = useState<TrackedLivestockAnimal[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackedLivestockAnimal | null>(null);

  // GöÇGöÇ Health Scan & Result State GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
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

  // GöÇGöÇ Active Animals & Medicines GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
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

  // GöÇGöÇ Formatted Farmer-Friendly Detection Status GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const computeDetectionStatus = useCallback(
    (tracks: TrackedLivestockAnimal[], selected: TrackedLivestockAnimal | null): string => {
      if (selected && selected.species !== 'person') {
        return selected.species === 'sheep' ? 'Tupa na-detect.' : 'Kambing na-detect.';
      }
      if (tracks.length === 0) {
        return 'Naghahanap ng kambing o tupa...';
      }
      const goats = tracks.filter((t) => t.species === 'goat').length;
      const sheep = tracks.filter((t) => t.species === 'sheep').length;
      const persons = tracks.filter((t) => t.species === 'person').length;

      if (goats > 0 && sheep > 0) {
        const gText = goats === 1 ? '1 kambing' : `${goats} kambing`;
        const sText = sheep === 1 ? '1 tupa' : `${sheep} tupa`;
        return `${gText} at ${sText} ang nakita`;
      }
      if (goats > 0) {
        return goats === 1 ? 'Kambing na-detect.' : `${goats} kambing ang nakita`;
      }
      if (sheep > 0) {
        return sheep === 1 ? 'Tupa na-detect.' : `${sheep} tupa ang nakita`;
      }
      if (persons > 0) {
        return 'May taong nakita. Itutok ang camera sa kambing o tupa.';
      }
      return 'Naghahanap ng kambing o tupa...';
    },
    []
  );

  // GöÇGöÇ Stop Camera Stream GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const stopCameraStream = useCallback(() => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    trackerRef.current.reset();
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

  // GöÇGöÇ Start Camera Stream GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    setStatusMessage('Binubuksan ang camera...');
    trackerRef.current.reset();
    setActiveTracks([]);
    setSelectedTrack(null);

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
        video.play().catch((playError) => {
          console.warn('[Camera] Mobile autoplay notice:', playError);
        });
      }

      setIsCameraActive(true);
      setStatusMessage('Naghahanap ng kambing o tupa...');

      // Pre-warm client detector
      initClientObjectDetector().catch((err) => {
        console.warn('[Camera] Client detector init notice:', err);
      });
    } catch (err: any) {
      console.error('[Camera] Start error:', err);
      if (!isMountedRef.current) return;
      if (err?.name === 'NotAllowedError') {
        setCameraError('Kailangan ng pahintulot (permission) para magamit ang camera.');
      } else {
        setCameraError('Hindi mabuksan ang camera. Subukan muli.');
      }
    }
  }, [facingMode, stopCameraStream]);

  // GöÇGöÇ Live Render Animation Loop (requestAnimationFrame) GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  useEffect(() => {
    if (!isCameraActive || isScanning) return;

    let isRunning = true;
    const tracker = trackerRef.current;

    const renderLoop = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const container = containerRef.current;

      if (video && canvas && container && video.readyState >= 2) {
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

          renderTrackedAnimalsToCanvas(
            canvas,
            tracker.getActiveTracks(),
            transform,
            dpr
          );
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
    };
  }, [isCameraActive, isScanning]);

  // GöÇGöÇ Live Detection Cycle (~8-9 FPS locally) GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const runDetectionCycle = useCallback(async () => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      isDetectingRef.current ||
      isScanning ||
      showResultSheet
    ) {
      return;
    }

    isDetectingRef.current = true;
    try {
      const result = await detectLiveFrameLocally(video);
      if (!isMountedRef.current || isScanning || showResultSheet) return;

      if (!result.success && result.error) {
        setCameraError(`Hindi ma-load ang animal detector: ${result.error}`);
        setStatusMessage('Hindi ma-load ang detector. Subukang muli.');
        return;
      }

      // Temporarily log raw detector output per Directive 9
      console.log('DETECTIONS:', result.detections);

      const tracker = trackerRef.current;

      // Registered-animal safeguard: when this Health Check was opened for a
      // specific goat, do not allow the generic COCO sheep detector to relabel
      // that selected goat as Tupa. The camera detector remains authoritative
      // for the actual box, while the selected record provides the species prior.
      const detectorDetections = (result.detections || []).map((d) => {
        if (
          preselectedAnimalId &&
          selectedAnimal?.species === 'Goat' &&
          d.type === 'SHEEP'
        ) {
          return {
            ...d,
            type: 'GOAT' as const,
            label: 'KAMBING' as const,
            className: 'goat',
            rawCategory: d.rawCategory || 'sheep',
          };
        }
        return d;
      });

      // Extract genuine detections: GOAT, SHEEP, PERSON
      const rawLivestock: RawLivestockDetection[] = detectorDetections
        .filter((d) => d.type === 'GOAT' || d.type === 'SHEEP' || d.type === 'PERSON')
        .map((d) => ({
          species: (d.type === 'PERSON' ? 'person' : d.type === 'SHEEP' ? 'sheep' : 'goat') as LivestockSpecies,
          label: (d.type === 'PERSON' ? 'TAO' : d.type === 'SHEEP' ? 'TUPA' : 'KAMBING') as LivestockDisplayLabel,
          confidence: d.confidence,
          box: d.boundingBox,
          rawCategory: d.rawCategory,
        }));

      // Update tracker with EMA smoothing, IoU matching, and grace periods
      const updatedTracks = tracker.update(rawLivestock);
      setActiveTracks(updatedTracks);

      const selected = tracker.getSelectedTrack();
      setSelectedTrack(selected);

      // Update dynamic Tagalog status message
      setStatusMessage(computeDetectionStatus(updatedTracks, selected));
    } catch (err) {
      console.warn('[Camera] Detection cycle notice:', err);
    } finally {
      isDetectingRef.current = false;
    }
  }, [
    isScanning,
    showResultSheet,
    computeDetectionStatus,
    preselectedAnimalId,
    selectedAnimal?.species,
  ]);

  // Setup periodic detection interval (~120ms cadence = ~8-9 FPS)
  useEffect(() => {
    if (!isCameraActive || isScanning || showResultSheet) {
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
        detectTimerRef.current = null;
      }
      return;
    }

    detectTimerRef.current = setInterval(runDetectionCycle, 120);

    return () => {
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
        detectTimerRef.current = null;
      }
    };
  }, [isCameraActive, isScanning, showResultSheet, runDetectionCycle]);

  // GöÇGöÇ Camera Mount Lifecycle GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  useEffect(() => {
    isMountedRef.current = true;
    startCameraStream();

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [startCameraStream, stopCameraStream]);

  // GöÇGöÇ Tap to Select on Viewport GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
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

    if (hitTrack) {
      setSelectedTrack(hitTrack);
      setStatusMessage(
        hitTrack.species === 'sheep' ? 'Tupa na napili' : 'Kambing na napili'
      );
    } else {
      // If tapped outside, unselect only if multiple exist
      if (tracker.getActiveTracks().length > 1) {
        tracker.selectTrackById(null);
        setSelectedTrack(null);
        setStatusMessage(computeDetectionStatus(tracker.getActiveTracks(), null));
      }
    }
  };

  // GöÇGöÇ Camera Flip Control GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const handleFlipCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // GöÇGöÇ Health Scan: Capture & Send Selected Animal to Gemini GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const handlePerformHealthScan = async () => {
    const video = videoRef.current;
    const selected = trackerRef.current.getSelectedTrack();

    if (!video || !selected || selected.species === 'person') {
      toast('Pumili muna ng kambing o tupa na susuriin.', 'warning');
      return;
    }

    setIsScanning(true);
    setStatusMessage('Kinukunan ang napiling alaga at sinusuri gamit ang AI...');

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

      // 3. Send crop to Gemini Multimodal Vision API
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
      // Gemini supplies health observations; it must not reclassify GOAT as SHEEP.
      const verifiedSpecies = selected.species === 'sheep' ? 'sheep' : 'goat';
      const verifiedLabel = verifiedSpecies === 'sheep' ? 'TUPA' : 'KAMBING';
      const verifiedResult: GeminiScanResult = {
        ...result,
        animals: (result.animals || []).map((animal) => ({
          ...animal,
          species: verifiedSpecies,
          label: verifiedLabel,
        })),
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

  // GöÇGöÇ Gallery Upload & AI Scan GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setStatusMessage('Sinusuri ang larawan mula sa gallery gamit ang AI...');

    try {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (event) => {
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Hindi mabuo ang canvas para sa larawan.');
            ctx.drawImage(img, 0, 0);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            const blob = await canvasToBlob(canvas, 0.90);

            setCroppedImagePreview(dataUrl);
            setCroppedBlob(blob);
            setLastCapturedThumbnail(dataUrl);

            // Run Gemini Vision
            const selectedSpecies = selectedAnimal?.species?.toLowerCase();
            const expectedSpecies = selectedSpecies === 'sheep' || selectedSpecies === 'goat'
              ? selectedSpecies
              : undefined;

            const result = await scanAnimalWithGemini(canvas, {
              context: 'health_scan',
              animalType: expectedSpecies,
            });

            if (!result.success || !result.detected) {
              toast('Hindi malinaw ang alaga sa larawan. Subukan muli.', 'warning');
              setIsScanning(false);
              return;
            }

            const detectedSpecies = result.animals?.[0]?.species;
            const verifiedSpecies = expectedSpecies || (detectedSpecies === 'sheep' ? 'sheep' : 'goat');
            const verifiedLabel = verifiedSpecies === 'sheep' ? 'TUPA' : 'KAMBING';

            setScanResult({
              ...result,
              animals: (result.animals || []).map((animal) => ({
                ...animal,
                species: verifiedSpecies,
                label: verifiedLabel,
              })),
              rawResponse: result.rawResponse
                ? {
                    ...result.rawResponse,
                    animal_type: verifiedSpecies,
                    animal_label: verifiedSpecies === 'sheep' ? 'Tupa' : 'Kambing',
                  }
                : result.rawResponse,
            });
            setShowResultSheet(true);

            if (!selectedFarmAnimalId) {
              const match = activeFarmAnimals.find(
                (a: Animal) => a.species?.toLowerCase() === verifiedSpecies
              );
              if (match) setSelectedFarmAnimalId(match.id);
            }
          } catch (scanErr: any) {
            console.error('[Camera] Gallery scan error:', scanErr);
            toast(scanErr?.message || 'Nabigo ang pagsusuri sa larawan.', 'error');
          } finally {
            setIsScanning(false);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('[Camera] Image load error:', err);
      toast('Nabigo ang pagbasa sa larawan.', 'error');
      setIsScanning(false);
    }
  };

  // GöÇGöÇ Reset & Rescan GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const handleResetScan = () => {
    setShowResultSheet(false);
    setScanResult(null);
    setCroppedImagePreview(null);
    setCroppedBlob(null);
    setNotes('');
    setMedItemId('');
    setMedQty('');
    setStatusMessage('Naghahanap ng kambing o tupa...');
  };

  // GöÇGöÇ Save Health Check to Storage & Supabase Database GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
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
      {/* GöÇGöÇ TOP HEADER BAR: [Bumalik] AI Health Scanner [GÜÖ] [X] GöÇGöÇ */}
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

      {/* GöÇGöÇ SCROLLABLE MODAL BODY GöÇGöÇ */}
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
                  gap: 10,
                }}
              >
                <AlertCircle size={36} color="#EF4444" />
                <div style={{ fontSize: 14, fontWeight: 700 }}>{cameraError}</div>
                <button
                  type="button"
                  onClick={startCameraStream}
                  style={{
                    background: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Subukan Muli
                </button>
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
                  Isinusumite sa Gemini Vision AI
                </div>
              </div>
            )}
          </div>

          {/* 2. Detection Status Badge */}
          <div
            style={{
              background: selectedTrack && selectedTrack.species !== 'person'
                ? 'rgba(22, 163, 74, 0.95)'
                : activeTracks.length > 0
                ? 'rgba(30, 41, 59, 0.95)'
                : 'rgba(15, 23, 42, 0.90)',
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
            {selectedTrack && selectedTrack.species !== 'person' ? (
              <CheckCircle2 size={16} color="#4ADE80" />
            ) : activeTracks.length > 0 ? (
              <Sparkles size={16} color="#22C55E" />
            ) : (
              <Info size={16} color="#94A3B8" />
            )}
            <span>{statusMessage}</span>
          </div>

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
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
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
                disabled={!selectedTrack || selectedTrack.species === 'person' || isScanning}
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
                  cursor: selectedTrack && selectedTrack.species !== 'person' && !isScanning ? 'pointer' : 'not-allowed',
                  background: selectedTrack && selectedTrack.species !== 'person'
                    ? 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)'
                    : 'rgba(51, 65, 85, 0.55)',
                  border: selectedTrack && selectedTrack.species !== 'person'
                    ? '3px solid rgba(255, 255, 255, 0.95)'
                    : '3px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: selectedTrack && selectedTrack.species !== 'person'
                    ? '0 0 20px rgba(34, 197, 94, 0.65), 0 4px 14px rgba(0, 0, 0, 0.5)'
                    : 'none',
                  opacity: selectedTrack && selectedTrack.species !== 'person' && !isScanning ? 1 : 0.65,
                  transform: isScanning ? 'scale(0.92)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                }}
              >
                <Camera
                  size={30}
                  color={selectedTrack && selectedTrack.species !== 'person' ? '#FFFFFF' : '#94A3B8'}
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
                  color: selectedTrack && selectedTrack.species !== 'person' ? '#4ADE80' : '#94A3B8',
                  minHeight: 15,
                  textAlign: 'center',
                }}
              >
                {!selectedTrack || selectedTrack.species === 'person'
                  ? 'I-SCAN'
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

          {/* 4. Detected Animal Information Card */}
          {selectedTrack && selectedTrack.species !== 'person' && (
            <div
              style={{
                width: '100%',
                backgroundColor: '#1E293B',
                borderRadius: 14,
                padding: '10px 14px',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                  Aktibong Alaga
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
                  {selectedTrack.species === 'sheep'
                    ? `Tupa #${selectedTrack.displayNumber}`
                    : `Kambing #${selectedTrack.displayNumber}`}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 20,
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ADE80',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                {Math.round(selectedTrack.confidence * 100)}% Kumpiyansa
              </span>
            </div>
          )}

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
                      {a.tag_id} {a.name ? `(${a.name})` : ''} GÇö {a.species?.toLowerCase() === 'sheep' ? 'Tupa' : 'Kambing'}
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
        </div>
      </div>

      {/* GöÇGöÇ SETTINGS DRAWER / MODAL GöÇGöÇ */}
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
