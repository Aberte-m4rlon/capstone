/**
 * LiveObjectDetectionCamera.tsx — Dedicated Full-Screen "AI Health Scanner"
 *
 * Real-time object-detection mobile camera experience for AlpasFarm:
 * - Dedicated full-screen mobile camera layout (no standard app navigation while active)
 * - Top translucent bar: [←] [AI Health Scanner status] [⚙]
 * - Full-bleed live camera stream with object-fit: cover and hardware-accelerated RAF canvas
 * - Temporal stabilization & IoU tracking (zero jitter, zero flickering, grace periods, clean scene clearing)
 * - Accurate coordinate transformation for object-fit: cover mobile viewports
 * - Tap-to-select on live detection box; selection follows the persistent track
 * - Floating status pill: "Naghahanap ng kambing o tupa...", "Kambing ang nakita", "Kambing na napili", etc.
 * - Dedicated 3-element bottom camera control bar:
 *     [ Thumbnail / Gallery icon ]   ● [ Large 78px Circular Shutter (I-SCAN) ]   [ Flip Camera ]
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
} from '../../../lib/temporalBoxTracker';
import {
  detectLiveFrameLocally,
  initClientObjectDetector,
} from '../../../lib/clientObjectDetector';
import {
  captureVideoFrame,
  canvasToBlob,
  cropCanvasToBoundingBox,
  BoundingBox,
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

  // ── Elements & State Refs ──────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const rafIdRef = useRef<number | null>(null);
  const detectTimerRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);

  // ── Suppress standard app navigation while camera scanner is open ──────────
  useEffect(() => {
    document.body.classList.add('camera-scanner-active');
    return () => {
      document.body.classList.remove('camera-scanner-active');
    };
  }, []);

  // ── Camera Lifecycle State ────────────────────────────────────────────────
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showSettings, setShowSettings] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  // ── Tracking & Selection State ────────────────────────────────────────────
  const [statusMessage, setStatusMessage] = useState<string>('Naghahanap ng kambing o tupa...');
  const trackerRef = useRef<TemporalLivestockTracker>(
    new TemporalLivestockTracker({}, () => {
      // Callback when selected track drops past grace period
      setStatusMessage('Hindi na makita ang napiling alaga. Pumili ulit.');
    })
  );
  const [activeTracks, setActiveTracks] = useState<TrackedLivestockAnimal[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackedLivestockAnimal | null>(null);
  const [uncertainMode, setUncertainMode] = useState<boolean>(false);
  const [uncertainBox, setUncertainBox] = useState<BoundingBox | null>(null);

  // ── Health Scan & Result State ────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<GeminiScanResult | null>(null);
  const [croppedImagePreview, setCroppedImagePreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [lastCapturedThumbnail, setLastCapturedThumbnail] = useState<string | null>(null);
  const [showResultSheet, setShowResultSheet] = useState<boolean>(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [selectedFarmAnimalId, setSelectedFarmAnimalId] = useState<string>(preselectedAnimalId || '');

  // ── Active Animals & Medicines ────────────────────────────────────────────
  const activeFarmAnimals = useMemo(() => {
    return farmData.animals.filter((a: Animal) => !a.archived && !a.is_sold && a.status !== 'Sold');
  }, [farmData.animals]);

  // Selected registered animal entity
  const selectedAnimal = useMemo(() => {
    return activeFarmAnimals.find((a) => a.id === selectedFarmAnimalId) || null;
  }, [activeFarmAnimals, selectedFarmAnimalId]);

  // ── Formatted Farmer-Friendly Detection Status (Directive 12) ─────────────
  const computeDetectionStatus = useCallback(
    (
      tracks: TrackedLivestockAnimal[],
      _selected: TrackedLivestockAnimal | null,
      personDetected: boolean = false,
      uncertain: boolean = false
    ): string => {
      if (personDetected && tracks.length === 0) {
        return 'May taong nakita. Itutok ang camera sa kambing o tupa.';
      }
      if (uncertain && tracks.length === 0) {
        return 'Hindi matukoy ang uri ng hayop';
      }
      if (tracks.length === 0) {
        return 'Naghahanap ng kambing o tupa...';
      }
      const goats = tracks.filter((t) => t.species === 'goat').length;
      const sheep = tracks.filter((t) => t.species === 'sheep').length;

      if (goats > 0 && sheep > 0) {
        return `${goats} kambing at ${sheep} tupa na-detect.`;
      }
      if (goats > 1) {
        return `${goats} kambing na-detect.`;
      }
      if (goats === 1) {
        return 'Kambing na-detect.';
      }
      if (sheep > 1) {
        return `${sheep} tupa na-detect.`;
      }
      if (sheep === 1) {
        return 'Tupa na-detect.';
      }
      return 'Naghahanap ng kambing o tupa...';
    },
    []
  );

  // ── Stop Camera Stream (Directive 2: Clear all detection state) ────────────
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
    setUncertainMode(false);
    setUncertainBox(null);
    setIsCameraActive(false);
  }, []);

  // ── Start Camera Stream ───────────────────────────────────────────────────
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    setStatusMessage('Binubuksan ang camera...');

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
        await video.play();
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

  // ── Live Render Animation Loop (requestAnimationFrame) ────────────────────
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
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;

        if (canvas.width !== containerW || canvas.height !== containerH) {
          canvas.width = containerW;
          canvas.height = containerH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const transform = computeViewportTransform(
            containerW,
            containerH,
            video.videoWidth,
            video.videoHeight
          );

          renderTrackedAnimalsToCanvas(
            canvas,
            tracker.getActiveTracks(),
            transform
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

  // ── Live Detection Cycle (~8-9 FPS locally) ────────────────────────────────
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

      const tracker = trackerRef.current;

      // Extract detections strictly by verified classification
      const allDetections = result.detections || [];
      const personDetected = allDetections.some((d) => d.type === 'PERSON');
      const goatDetections = allDetections.filter((d) => d.type === 'GOAT');
      const sheepDetections = allDetections.filter((d) => d.type === 'SHEEP');
      const uncertainDetections = allDetections.filter((d) => d.type === 'UNCERTAIN');

      if (personDetected && goatDetections.length === 0 && sheepDetections.length === 0) {
        // Directive 2 & 12: Person in frame with no livestock -> clear boxes immediately
        tracker.reset();
        setActiveTracks([]);
        setSelectedTrack(null);
        setUncertainMode(false);
        setUncertainBox(null);
        setStatusMessage('May taong nakita. Itutok ang camera sa kambing o tupa.');
        return;
      }

      if (goatDetections.length > 0 || sheepDetections.length > 0) {
        setUncertainMode(false);
        setUncertainBox(null);

        const rawLivestock: RawLivestockDetection[] = [...goatDetections, ...sheepDetections].map((d) => ({
          species: d.type === 'SHEEP' ? 'sheep' : 'goat',
          label: d.type === 'SHEEP' ? 'TUPA' : 'KAMBING',
          confidence: d.confidence,
          box: d.boundingBox,
          rawCategory: d.rawCategory,
        }));

        // Update tracker with EMA smoothing, IoU matching, and fast eviction
        const updatedTracks = tracker.update(rawLivestock);
        setActiveTracks(updatedTracks);

        const selected = tracker.getSelectedTrack();
        setSelectedTrack(selected);

        // Update dynamic Tagalog status message
        setStatusMessage(computeDetectionStatus(updatedTracks, selected, false, false));
      } else if (uncertainDetections.length > 0) {
        // Directive 1 & 4: Species cannot be reliably determined
        tracker.reset();
        setActiveTracks([]);
        setSelectedTrack(null);
        setUncertainMode(true);
        setUncertainBox(uncertainDetections[0].boundingBox);
        setStatusMessage('Hindi matukoy ang uri ng hayop');
      } else {
        // Directive 2: Nothing detected in frame -> clear all boxes immediately
        tracker.reset();
        setActiveTracks([]);
        setSelectedTrack(null);
        setUncertainMode(false);
        setUncertainBox(null);
        setStatusMessage('Naghahanap ng kambing o tupa...');
      }
    } catch (err) {
      console.warn('[Camera] Detection cycle notice:', err);
    } finally {
      isDetectingRef.current = false;
    }
  }, [isScanning, showResultSheet, computeDetectionStatus]);

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

  // ── Camera Mount Lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    startCameraStream();

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [startCameraStream, stopCameraStream]);

  // ── Tap to Select on Viewport ─────────────────────────────────────────────
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

  // ── Camera Flip Control ───────────────────────────────────────────────────
  const handleFlipCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // ── Health Scan: Capture & Send Selected Animal to Gemini (Directive 5) ──
  const handlePerformHealthScan = async () => {
    const video = videoRef.current;
    const selected = trackerRef.current.getSelectedTrack();

    if (!video) return;

    if (!selected && !uncertainMode) {
      toast('Itutok ang camera sa kambing o tupa na susuriin.', 'warning');
      return;
    }

    setIsScanning(true);
    setStatusMessage('Kinukunan ang alaga at sinusuri gamit ang AI...');

    try {
      // 1. Capture full-resolution video frame
      const fullFrameCanvas = captureVideoFrame(video);

      // 2. Crop animal's bounding box with 15% safe padding margin, or use frame
      let croppedCanvas: HTMLCanvasElement;
      if (selected) {
        croppedCanvas = cropCanvasToBoundingBox(fullFrameCanvas, selected.box, 0.15);
      } else if (uncertainBox) {
        croppedCanvas = cropCanvasToBoundingBox(fullFrameCanvas, uncertainBox, 0.15);
      } else {
        croppedCanvas = fullFrameCanvas;
      }

      const dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.90);
      const blob = await canvasToBlob(croppedCanvas, 0.90);

      setCroppedImagePreview(dataUrl);
      setCroppedBlob(blob);
      setLastCapturedThumbnail(dataUrl);

      // 3. Send crop to Gemini Multimodal Vision API
      const result = await scanAnimalWithGemini(croppedCanvas, {
        context: 'health_scan',
        animalType: selected ? selected.species : 'goat',
      });

      if (!result.success || !result.detected) {
        toast('Hindi malinaw ang kuha. Subukan muli.', 'warning');
        setIsScanning(false);
        return;
      }

      setScanResult(result);
      setShowResultSheet(true);

      // Auto-match preselected animal or matching species from Gemini result
      const targetSpecies = (result.rawResponse?.animal_type || selected?.species || 'goat').toLowerCase();
      const matchingAnimal = activeFarmAnimals.find(
        (a: Animal) => a.species?.toLowerCase() === targetSpecies
      );
      if (matchingAnimal) {
        setSelectedFarmAnimalId(matchingAnimal.id);
      } else if (activeFarmAnimals.length > 0) {
        setSelectedFarmAnimalId(activeFarmAnimals[0].id);
      }
    } catch (err: any) {
      console.error('[Camera] Health scan error:', err);
      toast('May problema sa pagsusuri ng alaga. Subukan muli.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // ── Reset & Rescan ────────────────────────────────────────────────────────
  const handleResetScan = () => {
    setShowResultSheet(false);
    setScanResult(null);
    setCroppedImagePreview(null);
    setCroppedBlob(null);
    setStatusMessage('Naghahanap ng kambing o tupa...');
  };

  // ── Save Health Check to Storage & Supabase Database (Directive 8, 9, 10, 11, 19) ──
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
      let riskLevel = 'Low';
      if (condition === 'Kailangan ng Gamot' || raw?.health_status === 'needs_medication') {
        riskScore = 80;
        riskLevel = 'High';
      } else if (condition === 'Kailangan ng Atensyon' || raw?.health_status === 'needs_attention') {
        riskScore = 60;
        riskLevel = 'Medium';
      } else if (condition === 'Bantayan' || raw?.health_status === 'monitor') {
        riskScore = 35;
        riskLevel = 'Medium';
      }

      let newStatus: Animal['health_status'] = 'Healthy';
      if (riskScore >= 65) newStatus = 'Critical';
      else if (riskScore >= 45) newStatus = 'At Risk';
      else if (riskScore >= 25) newStatus = 'Monitor';

      // 3. Insert into camera_health_screenings (Dedicated table supporting image_path/image_url)
      if (savedImagePath) {
        try {
          await supabase.from('camera_health_screenings').insert([
            {
              user_id: user.id,
              animal_id: animal.id,
              image_path: savedImagePath,
              image_url: savedImageUrl,
              prediction: condition,
              confidence: 0.95,
              model_version: 'gemini-camera-v2',
              risk_score: riskScore,
              risk_level: riskLevel,
              recommendation: scanResult.recommendation || raw?.action || 'Ipagpatuloy ang regular na pagmamasid.',
              notes: conditionStr,
              goat_detected: animal.species?.toLowerCase() !== 'sheep',
              scan_type: 'gemini_camera',
            },
          ]);
        } catch (screenErr) {
          console.warn('[Camera] camera_health_screenings insert notice:', screenErr);
        }
      }

      // 4. Insert into health_records (Clinical table without image_path/image_url columns)
      const originTag = '[Pinagmulan: gemini_camera | AI Health Scanner]';
      const imageTag = savedImagePath ? `[Larawan: ${savedImagePath}]` : '';
      const notesParts = [originTag, imageTag, conditionStr].filter(Boolean);
      const combinedNotes = notesParts.join('\n');

      const newRecordPayload = {
        animal_id: animal.id,
        user_id: user.id,
        record_date: new Date().toISOString().split('T')[0],
        temperature: null,
        heart_rate: null,
        respiratory_rate: null,
        rumen_sounds: null,
        mucous_membrane: null,
        bloat_score: null,
        gait: null,
        famacha_score: null,
        appetite: 'Normal',
        activity_level: 'Normal',
        eye_condition: 'Normal',
        body_condition: 'Normal',
        cough: false,
        diarrhea: false,
        nasal_discharge: false,
        risk_score: riskScore,
        risk_level: riskLevel,
        reasons: reasonsStr,
        recommendation: scanResult.recommendation || raw?.action || 'Ipagpatuloy ang regular na pagmamasid.',
        notes: combinedNotes,
        detected_conditions: [`Visual Screening: ${condition}`],
      };

      const { data: insertedData, error: recordError } = await supabase
        .from('health_records')
        .insert([newRecordPayload])
        .select()
        .single();

      if (recordError) throw recordError;

      // 5. Update Animal current health status
      await supabase
        .from('animals')
        .update({
          health_status: newStatus,
          health_risk_score: riskScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', animal.id);

      toast('Na-save ang health check!', 'success');
      farmData.refresh();

      if (insertedData && onHealthCheckSaved) {
        onHealthCheckSaved(insertedData as HealthRecord);
      }

      // Close bottom sheet and return to live camera for the next animal
      setShowResultSheet(false);
      setScanResult(null);
    } catch (err: any) {
      console.error('[Camera] Save error:', err);
      toast('May problema sa pag-save ng health check. Subukan muli.', 'error');
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
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0B0F17',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      {/* ── TOP BAR: ← AI Health Scanner ⚙ ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
          paddingBottom: 14,
          paddingLeft: 16,
          paddingRight: 16,
          background: 'linear-gradient(to bottom, rgba(11, 15, 23, 0.88) 0%, rgba(11, 15, 23, 0) 100%)',
          backdropFilter: 'blur(6px)',
          color: '#FFFFFF',
        }}
      >
        {/* Back / Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Bumalik"
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '50%',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          <ArrowLeft size={20} />
        </button>

        {/* Center: Live indicator dot + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              backgroundColor: isCameraActive ? '#22C55E' : '#EF4444',
              boxShadow: isCameraActive ? '0 0 10px #22C55E' : 'none',
              animation: isCameraActive ? 'pulse 2s infinite' : 'none',
            }}
          />
          <h1 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>
            AI Health Scanner
          </h1>
        </div>

        {/* Settings button */}
        <button
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          aria-label="Mga Setting"
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '50%',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* ── CENTER VIEWPORT: Full Live Camera Feed + Overlaid Canvas ── */}
      <div
        onClick={handleViewportTap}
        style={{
          position: 'relative',
          flex: 1,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}
      >
        {/* HTML5 Live Video Element */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)',
          }}
        />

        {/* Stable RAF Overlay Canvas */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 5,
            transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)',
          }}
        />

        {/* Optional Alignment Grid */}
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

        {/* Camera Error Display */}
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
              padding: 24,
              color: '#FFFFFF',
              zIndex: 35,
              textAlign: 'center',
              gap: 12,
            }}
          >
            <AlertCircle size={44} color="#EF4444" />
            <div style={{ fontSize: 16, fontWeight: 700, maxWidth: 320 }}>
              {cameraError}
            </div>
            <button
              type="button"
              onClick={startCameraStream}
              style={{
                background: '#16A34A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: '10px 22px',
                fontSize: 14,
                fontWeight: 700,
                marginTop: 8,
                cursor: 'pointer',
              }}
            >
              Subukan Muli
            </button>
          </div>
        )}

        {/* Scanning Spinner Overlay */}
        {isScanning && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(11, 15, 23, 0.85)',
              backdropFilter: 'blur(6px)',
              zIndex: 35,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              color: '#FFFFFF',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                border: '4px solid rgba(34, 197, 94, 0.2)',
                borderTopColor: '#22C55E',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ fontSize: 17, fontWeight: 700 }}>
              Sinusuri ang napiling alaga...
            </div>
            <div style={{ fontSize: 13, color: '#94A3B8', maxWidth: 280, textAlign: 'center' }}>
              Isinusumite ang cropped image sa Gemini Vision AI para sa pagsusuri
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM CAMERA CONTROLS BAR ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(to top, rgba(11, 15, 23, 0.96) 0%, rgba(11, 15, 23, 0.75) 60%, rgba(11, 15, 23, 0) 100%)',
          gap: 12,
          pointerEvents: showResultSheet ? 'none' : 'auto',
          opacity: showResultSheet ? 0 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {/* Detection Status Pill */}
        <div
          style={{
            background: selectedTrack
              ? 'rgba(22, 163, 74, 0.92)'
              : activeTracks.length > 0
              ? 'rgba(30, 41, 59, 0.9)'
              : 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            padding: '7px 18px',
            borderRadius: 24,
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
            maxWidth: '92%',
            textAlign: 'center',
            letterSpacing: 0.1,
          }}
        >
          {selectedTrack ? (
            <CheckCircle2 size={16} color="#4ADE80" />
          ) : activeTracks.length > 0 ? (
            <Sparkles size={16} color="#22C55E" />
          ) : (
            <Info size={16} color="#94A3B8" />
          )}
          <span>{statusMessage}</span>
        </div>

        {/* 3-Element Control Bar: [Thumbnail]   ● (SCAN)   [Flip Camera] */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: 390,
            padding: '0 8px',
          }}
        >
          {/* LEFT: Captured Image Thumbnail button */}
          <button
            type="button"
            onClick={() => {
              if (lastCapturedThumbnail && scanResult) {
                setShowResultSheet(true);
              }
            }}
            disabled={!lastCapturedThumbnail}
            aria-label="Huling pagsusuri thumbnail"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'rgba(30, 41, 59, 0.85)',
              backdropFilter: 'blur(8px)',
              border: lastCapturedThumbnail
                ? '2px solid #22C55E'
                : '2px solid rgba(255, 255, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: lastCapturedThumbnail ? 'pointer' : 'default',
              padding: 0,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s ease',
            }}
          >
            {lastCapturedThumbnail ? (
              <img
                src={lastCapturedThumbnail}
                alt="Latest Capture"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <ImageIcon size={22} color="#FFFFFF" style={{ opacity: 0.65 }} />
            )}
          </button>

          {/* CENTER: Large 78px Circular Shutter / Scan Button */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <button
              type="button"
              disabled={(!selectedTrack && !uncertainMode) || isScanning}
              onClick={handlePerformHealthScan}
              aria-label={
                selectedTrack
                  ? `I-scan ang ${selectedTrack.species === 'sheep' ? 'tupa' : 'kambing'}`
                  : uncertainMode
                  ? 'I-scan ang alaga'
                  : 'I-scan'
              }
              style={{
                width: 78,
                height: 78,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                outline: 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: (selectedTrack || uncertainMode) && !isScanning ? 'pointer' : 'not-allowed',
                background: (selectedTrack || uncertainMode)
                  ? 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)'
                  : 'rgba(51, 65, 85, 0.55)',
                border: (selectedTrack || uncertainMode)
                  ? '3px solid rgba(255, 255, 255, 0.95)'
                  : '3px solid rgba(255, 255, 255, 0.2)',
                boxShadow: (selectedTrack || uncertainMode)
                  ? '0 0 24px rgba(34, 197, 94, 0.65), 0 4px 14px rgba(0, 0, 0, 0.6)'
                  : '0 2px 8px rgba(0, 0, 0, 0.3)',
                opacity: (selectedTrack || uncertainMode) && !isScanning ? 1 : 0.65,
                transform: isScanning ? 'scale(0.92)' : 'scale(1)',
              }}
            >
              <Camera
                size={34}
                color={(selectedTrack || uncertainMode) ? '#FFFFFF' : '#94A3B8'}
                strokeWidth={2.2}
              />
            </button>

            {/* Dynamic Label Below Shutter Button */}
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: '#FFFFFF',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                minHeight: 16,
              }}
            >
              {selectedTrack
                ? selectedTrack.species === 'sheep'
                  ? 'I-SCAN ANG TUPA'
                  : 'I-SCAN ANG KAMBING'
                : uncertainMode
                ? 'I-SCAN ANG ALAGA'
                : 'I-SCAN'}
            </span>
          </div>

          {/* RIGHT: Flip Camera Button */}
          <button
            type="button"
            onClick={handleFlipCamera}
            aria-label="I-flip ang camera"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'rgba(30, 41, 59, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '2px solid rgba(255, 255, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s ease',
            }}
          >
            <SwitchCamera size={22} color="#FFFFFF" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* ── AFTER SCAN: Result Bottom Sheet Overlay over Live Camera ── */}
      {showResultSheet && scanResult && croppedImagePreview && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={() => setShowResultSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '85dvh',
              backgroundColor: '#0F172A',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTop: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Drag Handle Bar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <div
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                }}
              />
            </div>

            {/* Sheet Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 20px 14px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#FFFFFF', letterSpacing: -0.2 }}>
                  Health Check
                </h2>
                <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 2 }}>
                  {selectedAnimal
                    ? `${selectedAnimal.species === 'Sheep' ? 'Tupa' : 'Kambing'} — ${selectedAnimal.tag_id}${selectedAnimal.name ? ` (${selectedAnimal.name})` : ''}`
                    : 'Pagsusuri ng Gemini Vision AI'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleResetScan}
                  title="I-scan Muli"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '50%',
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowResultSheet(false)}
                  title="Isara"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '50%',
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
            </div>

            {/* Scrollable Content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {/* Cropped Animal Preview Card */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: '#1E293B',
                  borderRadius: 14,
                  padding: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <img
                  src={croppedImagePreview}
                  alt="Scanned Animal"
                  style={{
                    width: 100,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                    Sinuring Alaga
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', marginTop: 2 }}>
                    {selectedAnimal ? `${selectedAnimal.tag_id} (${selectedAnimal.species === 'Sheep' ? 'Tupa' : 'Kambing'})` : 'Hindi nakatala'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {resultRiskMeta && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 12,
                          backgroundColor: resultRiskMeta.badgeBg,
                          border: `1px solid ${resultRiskMeta.badgeBorder}`,
                          color: resultRiskMeta.color,
                        }}
                      >
                        {resultRiskMeta.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Kalagayan Card */}
              {resultRiskMeta && (
                <div
                  style={{
                    backgroundColor: '#1E293B',
                    borderRadius: 14,
                    padding: '14px 16px',
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
                    <div style={{ fontSize: 17, fontWeight: 800, color: resultRiskMeta.color, marginTop: 2 }}>
                      {resultRiskMeta.label}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      backgroundColor: resultRiskMeta.badgeBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <resultRiskMeta.Icon size={20} color={resultRiskMeta.color} />
                  </div>
                </div>
              )}

              {/* Napansin (Observations) */}
              <div
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={15} color="#FBBF24" />
                  Mga Nakita ng AI (Visual Observations):
                </div>
                {(() => {
                  const raw = scanResult.rawResponse;
                  const first = scanResult.animals?.[0];
                  const obs: string[] = raw?.visual_observations || first?.visualObservations || [];
                  if (obs.length === 0) {
                    return (
                      <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.5 }}>
                        {raw?.condition_summary || 'Maayos ang tindig at walang nakitang sugat o sakit.'}
                      </div>
                    );
                  }
                  return (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
                      {obs.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>

              {/* Gawin (Recommended Action) */}
              <div
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HeartPulse size={15} color="#4ADE80" />
                  Gawin:
                </div>
                <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.55 }}>
                  {scanResult.recommendation ||
                    scanResult.rawResponse?.action ||
                    'Panatilihing malinis ang kulungan, bigyan ng sariwang tubig, at subaybayan ang pagkain.'}
                </div>
              </div>

              {/* Farm Animal Link Selector */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 6 }}>
                  I-ugnay sa Kambing o Tupa sa Talaan:
                </label>
                <select
                  value={selectedFarmAnimalId}
                  onChange={(e) => setSelectedFarmAnimalId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 12,
                    backgroundColor: '#1E293B',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: 14,
                    outline: 'none',
                  }}
                >
                  <option value="">-- Piliin ang Alaga --</option>
                  {activeFarmAnimals.map((a: Animal) => (
                    <option key={a.id} value={a.id}>
                      {a.tag_id} {a.name ? `(${a.name})` : ''} — {a.species?.toLowerCase() === 'sheep' ? 'Tupa' : 'Kambing'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Primary Action Button: Save Health Check */}
              <button
                type="button"
                disabled={savingRecord || !selectedFarmAnimalId}
                onClick={handleSaveHealthCheck}
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  borderRadius: 14,
                  backgroundColor: selectedFarmAnimalId ? '#16A34A' : 'rgba(51, 65, 85, 0.6)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: 15,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  cursor: selectedFarmAnimalId && !savingRecord ? 'pointer' : 'not-allowed',
                  boxShadow: selectedFarmAnimalId ? '0 4px 18px rgba(22, 163, 74, 0.45)' : 'none',
                  marginTop: 4,
                }}
              >
                {savingRecord ? (
                  <>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#FFFFFF',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    <span>Sine-save sa Records...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>I-save ang Health Check</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS DRAWER / MODAL ── */}
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
                  Kasalukuyan: {facingMode === 'environment' ? 'Rear (Likod)' : 'Front (Harap)'}
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
