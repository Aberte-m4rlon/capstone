/**
 * LiveObjectDetectionCamera.tsx — Dedicated Full-Screen "AI Health Scanner"
 *
 * Real-time object-detection camera experience for AlpasFarm:
 * - Dedicated full-screen livestock detection UI (Top Bar, Full Live Feed, Floating HUD, Scan Control)
 * - Real-time client-side detection (YOLOv8n for Goat + MediaPipe for Sheep & Person)
 * - Temporal stabilization & IoU tracking via TemporalLivestockTracker (zero jitter, zero flickering)
 * - Accurate coordinate transformation for object-fit: cover viewports
 * - Tap-to-select on the camera viewport with persistent track following
 * - Invokes Gemini Vision ONLY upon tapping "Suriin ang Napili"
 * - Separate, uncluttered post-scan Health Result sheet with image persistence to Supabase
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  SwitchCamera,
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
  isClientDetectorReady,
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
  const { user, profile } = useAuth();
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

  // ── Camera Lifecycle State ────────────────────────────────────────────────
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showSettings, setShowSettings] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  // ── Tracking & Selection State ────────────────────────────────────────────
  const trackerRef = useRef<TemporalLivestockTracker>(
    new TemporalLivestockTracker({}, () => {
      // Callback when selected track leaves the scene
      setStatusMessage('Hindi na makita ang napiling alaga. Pumili ulit.');
    })
  );
  const [activeTracks, setActiveTracks] = useState<TrackedLivestockAnimal[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackedLivestockAnimal | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Naghahanap ng kambing o tupa...');

  // ── Health Scan & Result State ────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<GeminiScanResult | null>(null);
  const [croppedImagePreview, setCroppedImagePreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedFarmAnimalId, setSelectedFarmAnimalId] = useState<string>(preselectedAnimalId || '');
  const [medItemId, setMedItemId] = useState<string>('');
  const [medQty, setMedQty] = useState<string>('');

  // ── Active Animals & Medicines ────────────────────────────────────────────
  const activeFarmAnimals = useMemo(() => {
    return farmData.animals.filter((a: Animal) => !a.archived && !a.is_sold && a.status !== 'Sold');
  }, [farmData.animals]);

  const availableMedicines = useMemo(() => {
    return farmData.inventory.filter(
      (item: InventoryItem) => (item.quantity ?? 0) > 0 && item.category?.toLowerCase().includes('med')
    );
  }, [farmData.inventory]);

  // ── Stop Camera Stream ────────────────────────────────────────────────────
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
    if (!isCameraActive || isScanning || scanResult) return;

    let isRunning = true;
    const tracker = trackerRef.current;

    const renderLoop = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const container = containerRef.current;

      if (video && canvas && container && video.videoWidth > 0) {
        const transform = computeViewportTransform(
          container.clientWidth,
          container.clientHeight,
          video.videoWidth,
          video.videoHeight
        );

        // Smoothly interpolate boxes towards targets
        tracker.interpolate(0.25);
        const tracks = tracker.getActiveTracks();

        // Render high-contrast stable boxes to canvas
        renderTrackedAnimalsToCanvas(canvas, tracks, transform);
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
  }, [isCameraActive, isScanning, !!scanResult]);

  // ── Live Detection Cycle (~10 FPS locally) ─────────────────────────────────
  const runDetectionCycle = useCallback(async () => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      isDetectingRef.current ||
      isScanning ||
      scanResult
    ) {
      return;
    }

    isDetectingRef.current = true;
    try {
      const result = await detectLiveFrameLocally(video);
      if (!isMountedRef.current || isScanning || scanResult) return;

      const tracker = trackerRef.current;

      // Extract only genuine goat and sheep detections
      const rawLivestock: RawLivestockDetection[] = (result.detections || [])
        .filter((d) => d.type === 'GOAT' || d.type === 'SHEEP')
        .map((d) => ({
          species: d.type === 'SHEEP' ? 'sheep' : 'goat',
          label: d.type === 'SHEEP' ? 'TUPA' : 'KAMBING',
          confidence: d.confidence,
          box: d.boundingBox,
          rawCategory: d.rawCategory,
        }));

      // Update tracker with EMA smoothing, IoU matching, and grace periods
      const updatedTracks = tracker.update(rawLivestock);
      setActiveTracks(updatedTracks);

      const selected = tracker.getSelectedTrack();
      setSelectedTrack(selected);

      // Update farmer-friendly status message
      if (updatedTracks.length === 0) {
        if (result.count_persons > 0) {
          setStatusMessage('May taong nakita.');
        } else if (result.count_uncertain > 0) {
          setStatusMessage('Hindi malinaw kung kambing o tupa. Ilapit ang camera.');
        } else {
          setStatusMessage('Walang kambing o tupa na nakita.');
        }
      } else if (updatedTracks.length === 1) {
        const single = updatedTracks[0];
        setStatusMessage(
          single.species === 'sheep'
            ? 'Tupa ang nakita. Handa nang suriin.'
            : 'Kambing ang nakita. Handa nang suriin.'
        );
      } else {
        if (selected) {
          setStatusMessage(
            `Napili: ${selected.species === 'sheep' ? 'Tupa' : 'Kambing'} #${selected.displayNumber}. Handa nang suriin.`
          );
        } else {
          setStatusMessage('Maraming alaga ang nakita. Pindutin ang kahon ng alaga na susuriin.');
        }
      }
    } catch (err) {
      console.warn('[Camera] Detection cycle notice:', err);
    } finally {
      isDetectingRef.current = false;
    }
  }, [isScanning, scanResult]);

  // Setup periodic detection interval (~120ms cadence = ~8-9 FPS)
  useEffect(() => {
    if (!isCameraActive || isScanning || scanResult) {
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
  }, [isCameraActive, isScanning, scanResult, runDetectionCycle]);

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
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const tapX = clientX - rect.left;
    const tapY = clientY - rect.top;

    const transform = computeViewportTransform(
      container.clientWidth,
      container.clientHeight,
      video.videoWidth,
      video.videoHeight
    );

    const hit = trackerRef.current.selectAtScreenCoordinates(tapX, tapY, transform);
    if (hit) {
      setSelectedTrack(hit);
      setActiveTracks(trackerRef.current.getActiveTracks());
      setStatusMessage(
        `Napili: ${hit.species === 'sheep' ? 'Tupa' : 'Kambing'} #${hit.displayNumber}. Handa nang suriin.`
      );
    }
  };

  // ── Perform Health Scan with Gemini Vision ────────────────────────────────
  const handlePerformHealthScan = async () => {
    const video = videoRef.current;
    const selected = trackerRef.current.getSelectedTrack();

    if (!video || video.videoWidth === 0 || !selected) {
      toast('Pumili muna ng kambing o tupa sa camera.', 'warning');
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

      // 3. Send crop to Gemini Multimodal Vision API
      const result = await scanAnimalWithGemini(croppedCanvas, {
        context: 'health_scan',
        animalType: selected.species,
      });

      if (!result.success || !result.detected) {
        toast('Hindi malinaw ang kuha. Subukan muli.', 'warning');
        setIsScanning(false);
        return;
      }

      setScanResult(result);

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

  // ── Reset & Rescan ────────────────────────────────────────────────────────
  const handleResetScan = () => {
    setScanResult(null);
    setCroppedImagePreview(null);
    setCroppedBlob(null);
    setNotes('');
    setMedItemId('');
    setMedQty('');
    setStatusMessage('Naghahanap ng kambing o tupa...');
  };

  // ── Save Health Check to Storage & Supabase Database ───────────────────────
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

      // 3. Insert Health Record
      const newRecordPayload = {
        animal_id: animal.id,
        user_id: user.id,
        record_date: new Date().toISOString().split('T')[0],
        risk_score: riskScore,
        status: newStatus,
        detected_conditions: conditionStr,
        reasons: reasonsStr,
        notes: notes.trim() || undefined,
        recommendations: scanResult.recommendation || raw?.action,
        temperature: null,
        heart_rate: null,
        respiratory_rate: null,
        weight: animal.weight_kg ?? null,
        image_url: savedImageUrl,
        image_path: savedImagePath,
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

      onClose();
    } catch (err: any) {
      console.error('[Camera] Save error:', err);
      toast(err?.message || 'Nabigo ang pag-save ng Health Check.', 'error');
    } finally {
      setSavingRecord(false);
    }
  };

  // ── Render Clean Health Result Modal ──────────────────────────────────────
  if (scanResult && croppedImagePreview) {
    const raw = scanResult.rawResponse;
    const firstAnimal = scanResult.animals?.[0];
    const condition = raw?.condition || (scanResult.success ? 'Maayos' : 'Bantayan');
    let riskScore = 15;
    if (condition === 'Kailangan ng Gamot' || raw?.health_status === 'needs_medication') {
      riskScore = 80;
    } else if (condition === 'Kailangan ng Atensyon' || raw?.health_status === 'needs_attention') {
      riskScore = 60;
    } else if (condition === 'Bantayan' || raw?.health_status === 'monitor') {
      riskScore = 35;
    }

    const mockRecord: Partial<HealthRecord> = { risk_score: riskScore };
    const meta = getRecordRiskMeta(mockRecord as HealthRecord);
    const StatusIcon = meta.Icon;
    const observationsList = raw?.visual_observations || firstAnimal?.visualObservations || [];

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#0F172A',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          color: '#F8FAFC',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(15, 23, 42, 0.95)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={handleResetScan}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 38,
                height: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={18} />
            </button>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Resulta ng Pagsusuri
              </h2>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                Gemini Vision AI Health Analysis
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: 6,
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Selected Animal Crop Card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: '#1E293B',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ position: 'relative', width: '100%', maxHeight: 320, backgroundColor: '#000000', display: 'flex', justifyContent: 'center' }}>
              <img
                src={croppedImagePreview}
                alt="Selected Animal Crop"
                style={{ maxHeight: 320, width: 'auto', objectFit: 'contain' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(6px)',
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#4ADE80',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Check size={14} />
                Litrato ng Napiling Alaga
              </div>
            </div>

            {/* Health Status Pill */}
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div>
                <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  Kalagayan
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <StatusIcon size={20} color={meta.color} />
                  <span style={{ fontSize: 18, fontWeight: 800, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
              </div>
              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  backgroundColor: meta.badgeBg,
                  border: `1px solid ${meta.badgeBorder}`,
                  fontSize: 12,
                  fontWeight: 700,
                  color: meta.color,
                }}
              >
                Risk Score: {riskScore}
              </div>
            </div>
          </div>

          {/* Observations & Actions */}
          <div style={{ backgroundColor: '#1E293B', borderRadius: 14, padding: 18, border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Napansin sa Alaga:
              </h3>
              {observationsList.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18, color: '#F1F5F9', fontSize: 14, lineHeight: 1.6 }}>
                  {observationsList.map((obs: string, idx: number) => (
                    <li key={idx}>{obs}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: '#F1F5F9', fontSize: 14 }}>
                  {scanResult.overallMessage || 'Walang nakitang abnormal na palatandaan.'}
                </p>
              )}
            </div>

            {(scanResult.recommendation || raw?.action) && (
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 12 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#4ADE80', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Gawin / Rekomendasyon:
                </h3>
                <p style={{ margin: 0, color: '#F1F5F9', fontSize: 13.5, lineHeight: 1.5 }}>
                  {scanResult.recommendation || raw?.action}
                </p>
              </div>
            )}
          </div>

          {/* Select Matching Animal in Inventory */}
          <div style={{ backgroundColor: '#1E293B', borderRadius: 14, padding: 18, border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>
              I-ugnay sa Kambing o Tupa sa Talaan:
            </label>
            <select
              value={selectedFarmAnimalId}
              onChange={(e) => setSelectedFarmAnimalId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
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

            {/* Notes */}
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                Karagdagang Tala (Opsyonal):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hal. Binigyan ng sariwang damo, pinainom ng bitamina..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#FFFFFF',
                  fontSize: 13,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button
              type="button"
              onClick={handleResetScan}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: 12,
                backgroundColor: '#334155',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={18} />
              I-scan Muli
            </button>
            <button
              type="button"
              disabled={savingRecord || !selectedFarmAnimalId}
              onClick={handleSaveHealthCheck}
              style={{
                flex: 2,
                padding: '14px',
                borderRadius: 12,
                background: selectedFarmAnimalId ? '#16A34A' : '#475569',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: selectedFarmAnimalId ? 'pointer' : 'not-allowed',
                boxShadow: selectedFarmAnimalId ? '0 4px 14px rgba(22, 163, 74, 0.4)' : 'none',
              }}
            >
              <Save size={18} />
              {savingRecord ? 'Inililigtas...' : 'I-save ang Health Check'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Full-Screen Live Camera Screen ───────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0B0F17',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* ── TOP BAR: ← AI Health Scanner ⚙ ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(to bottom, rgba(11, 15, 23, 0.85) 0%, rgba(11, 15, 23, 0) 100%)',
          color: '#FFFFFF',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Bumalik"
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isCameraActive ? '#22C55E' : '#EF4444',
              boxShadow: isCameraActive ? '0 0 10px #22C55E' : 'none',
            }}
          />
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>
            AI Health Scanner
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          aria-label="Mga Setting"
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
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
              zIndex: 30,
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
              zIndex: 30,
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
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '4px solid rgba(34, 197, 94, 0.2)',
                borderTopColor: '#22C55E',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Sinusuri ang napiling alaga...
            </div>
            <div style={{ fontSize: 12.5, color: '#94A3B8', maxWidth: 280, textAlign: 'center' }}>
              Isinusumite ang cropped image sa Gemini Vision AI para sa pagsusuri
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM HUD: Status Pill & Capture Control ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 20px 28px',
          background: 'linear-gradient(to top, rgba(11, 15, 23, 0.95) 0%, rgba(11, 15, 23, 0.6) 70%, rgba(11, 15, 23, 0) 100%)',
          gap: 14,
        }}
      >
        {/* Floating Detection Status Pill */}
        <div
          style={{
            background: selectedTrack
              ? 'rgba(22, 163, 74, 0.92)'
              : activeTracks.length > 0
              ? 'rgba(30, 41, 59, 0.88)'
              : 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            padding: '7px 18px',
            borderRadius: 22,
            fontSize: 12.5,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            maxWidth: '92%',
            textAlign: 'center',
          }}
        >
          {selectedTrack ? (
            <CheckCircle2 size={15} color="#4ADE80" />
          ) : activeTracks.length > 0 ? (
            <Sparkles size={15} color="#22C55E" />
          ) : (
            <Info size={15} color="#94A3B8" />
          )}
          <span>{statusMessage}</span>
        </div>

        {/* Primary Health Scan Action Button */}
        <button
          type="button"
          disabled={!selectedTrack || isScanning}
          onClick={handlePerformHealthScan}
          style={{
            width: '100%',
            maxWidth: 380,
            padding: '15px 24px',
            borderRadius: 16,
            background: selectedTrack
              ? 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)'
              : 'rgba(51, 65, 85, 0.65)',
            border: selectedTrack
              ? '1px solid rgba(255, 255, 255, 0.25)'
              : '1px solid rgba(255, 255, 255, 0.08)',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            cursor: selectedTrack ? 'pointer' : 'not-allowed',
            boxShadow: selectedTrack
              ? '0 6px 20px rgba(34, 197, 94, 0.45)'
              : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <Sparkles size={20} />
          <span>
            {selectedTrack
              ? `Suriin ang Napiling ${selectedTrack.species === 'sheep' ? 'Tupa' : 'Kambing'}`
              : 'Pumili ng Kambing o Tupa'}
          </span>
        </button>
      </div>

      {/* ── SETTINGS DRAWER / MODAL ── */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 40,
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
              padding: '24px 20px',
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

            {/* Switch Camera */}
            <button
              type="button"
              onClick={() => {
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                setShowSettings(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SwitchCamera size={18} color="#22C55E" />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Palitan ang Camera</span>
              </div>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>
                {facingMode === 'environment' ? 'Rear (Likod)' : 'Front (Harap)'}
              </span>
            </button>

            {/* Toggle Grid */}
            <button
              type="button"
              onClick={() => setShowGrid((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Ipakita ang Grid Lines</span>
              <span style={{ fontSize: 12, color: showGrid ? '#22C55E' : '#94A3B8', fontWeight: 700 }}>
                {showGrid ? 'Naka-on' : 'Naka-off'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveObjectDetectionCamera;
