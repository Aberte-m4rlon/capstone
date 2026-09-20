import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  SwitchCamera,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  captureVideoFrame,
  identifyLivestockSpecies,
  type LivestockSpeciesDetection,
} from '../../../lib/cameraML';
import { runRuleBasedScreening } from '../../../lib/ruleBasedScreening';
import { scanAnimalWithGemini } from '../../../lib/geminiScanner';
import type { Animal } from '../../../types';

export interface InlineScanResultData {
  detectedSpecies: 'Goat' | 'Sheep' | 'Unknown';
  speciesLabelTagalog: string;
  matchedAnimal: Animal | null;
  visualObservations: string[];
  suggestedSymptoms: string[];
  healthStatus: 'healthy' | 'monitor' | 'attention';
  healthStatusLabel: string;
  notesSnippet: string;
  temperatureDisplay: string; // Strictly "Hindi nasukat"
  recommendation?: string;
  capturedImageUrl?: string;
}

export interface InlineAnimalCameraScannerProps {
  onBackToForm: () => void;
  onScanComplete: (result: InlineScanResultData) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  farmAnimals: Animal[];
  currentUserId?: string;
  isSuperAdmin?: boolean;
  triggerScanRef?: React.MutableRefObject<(() => void) | null>;
}

export function InlineAnimalCameraScanner({
  onBackToForm,
  onScanComplete,
  isScanning,
  setIsScanning,
  farmAnimals,
  currentUserId,
  isSuperAdmin = false,
  triggerScanRef,
}: InlineAnimalCameraScannerProps) {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [permissionError, setPermissionError] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveDetection, setLiveDetection] = useState<LivestockSpeciesDetection | null>(null);
  const [matchedAnimal, setMatchedAnimal] = useState<Animal | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const mlIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stop Camera Stream Completely ──────────────────────────────────────────
  const stopCameraStream = useCallback(() => {
    if (mlIntervalRef.current) {
      clearInterval(mlIntervalRef.current);
      mlIntervalRef.current = null;
    }
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = null;
    }
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
  }, []);

  // ── Match Decoded Text with User's Farm Animals ───────────────────────────
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
          if (parsed.id) candidateId = String(parsed.id);
          if (parsed.tag_id) candidateTag = String(parsed.tag_id);
        } catch {}
      }

      // UUID or Tag pattern
      if (!candidateId && !candidateTag) {
        if (/^[a-f0-9\-]{36}$/i.test(text)) {
          candidateId = text;
        } else {
          candidateTag = text;
        }
      }

      if (candidateId) {
        const found = farmAnimals.find((a) => a.id.toLowerCase() === candidateId!.toLowerCase());
        if (found) return found;
      }
      if (candidateTag) {
        const found = farmAnimals.find(
          (a) => a.tag_id.toLowerCase() === candidateTag!.toLowerCase()
        );
        if (found) return found;
      }

      return null;
    },
    [farmAnimals]
  );

  // ── Periodic QR Check using BarcodeDetector ──────────────────────────────
  const runLiveQRCheck = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    try {
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          const found = matchAnimalFromText(raw);
          if (found && isMountedRef.current) {
            setMatchedAnimal(found);
          }
        }
      }
    } catch {
      // Safe fallback
    }
  }, [matchAnimalFromText]);

  // ── Periodic Live ML Check (Goat vs Sheep Detection) ──────────────────────
  const runLiveMLCheck = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || isScanning) return;

    try {
      const canvas = captureVideoFrame(video);
      const detection = await identifyLivestockSpecies(canvas);
      if (isMountedRef.current) {
        setLiveDetection(detection);
      }
    } catch {
      // Ignore background evaluation errors
    }
  }, [isScanning]);

  // ── Start Camera Stream ───────────────────────────────────────────────────
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setPermissionError(false);
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

      if (mlIntervalRef.current) clearInterval(mlIntervalRef.current);
      mlIntervalRef.current = setInterval(runLiveMLCheck, 1000);

      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = setInterval(runLiveQRCheck, 600);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const lower = String(err?.message || err?.name || '').toLowerCase();
      if (lower.includes('notallowed') || lower.includes('permission') || err?.name === 'NotAllowedError') {
        setPermissionError(true);
      } else if (lower.includes('notfound') || lower.includes('device') || err?.name === 'NotFoundError') {
        setCameraError('Walang nakitang camera sa device na ito. Piliin na lang ang alaga sa listahan.');
      } else if (lower.includes('notreadable') || lower.includes('in use')) {
        setCameraError('Ginagamit pa ng ibang application o tab ang camera. Paki-refresh o isara ang ibang tab.');
      } else {
        setCameraError('Hindi available ang camera sa device na ito.');
      }
    }
  }, [facingMode, runLiveMLCheck, runLiveQRCheck, stopCameraStream]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // ── Trigger High-Resolution AI Scan ───────────────────────────────────────
  const handlePerformScan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || isScanning) return;

    setIsScanning(true);

    try {
      const frameCanvas = captureVideoFrame(video);
      const snapshotUrl = frameCanvas.toDataURL('image/jpeg', 0.85);

      const speciesRes = await identifyLivestockSpecies(frameCanvas);
      const ruleRes = runRuleBasedScreening(frameCanvas);

      let geminiObservations: string[] = [];
      let geminiConcerns: string[] = [];
      let geminiRec: string = '';
      let geminiStatus: 'healthy' | 'monitor' | 'attention' = 'healthy';

      try {
        const geminiRes = await scanAnimalWithGemini(frameCanvas, {
          context: 'health_scan',
          animalId: matchedAnimal?.id,
          animalTag: matchedAnimal?.tag_id,
          animalName: matchedAnimal?.name,
          animalType: matchedAnimal?.species?.toLowerCase() === 'sheep' ? 'sheep' : 'goat',
        });
        if (geminiRes.detected && geminiRes.animals && geminiRes.animals.length > 0) {
          const primary = geminiRes.animals[0];
          geminiObservations = primary.visualObservations || [];
          geminiConcerns = primary.possibleHealthConcerns || [];
          geminiRec = geminiRes.recommendation || '';
          geminiStatus = primary.healthStatus || 'monitor';
        }
      } catch {
        // Fallback to local rule evaluation
      }

      let finalMatchedAnimal = matchedAnimal;
      if (!finalMatchedAnimal && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(frameCanvas);
          if (barcodes && barcodes.length > 0) {
            finalMatchedAnimal = matchAnimalFromText(barcodes[0].rawValue);
          }
        } catch {}
      }

      const consolidatedObs: string[] = [];
      const suggestedSymptoms: string[] = [];

      if (geminiObservations.length > 0) {
        geminiObservations.forEach((obs) => {
          if (!consolidatedObs.includes(obs)) consolidatedObs.push(obs);
          const lower = obs.toLowerCase();
          if (lower.includes('ilong') || lower.includes('sipon') || lower.includes('discharge')) {
            if (!suggestedSymptoms.includes('nasal_discharge')) suggestedSymptoms.push('nasal_discharge');
          }
          if (lower.includes('mata') || lower.includes('eye')) {
            if (!suggestedSymptoms.includes('pale_membrane')) suggestedSymptoms.push('pale_membrane');
          }
          if (lower.includes('tindig') || lower.includes('pilay') || lower.includes('postura') || lower.includes('limp')) {
            if (!suggestedSymptoms.includes('lameness')) suggestedSymptoms.push('lameness');
          }
          if (lower.includes('mahina') || lower.includes('tamlay') || lower.includes('coat')) {
            if (!suggestedSymptoms.includes('rough_coat')) suggestedSymptoms.push('rough_coat');
          }
        });
      }

      if (ruleRes.hasConcern) {
        if (!consolidatedObs.includes('Napansing posibleng pagbabago sa pustura o balahibo')) {
          consolidatedObs.push('Napansing posibleng pagbabago sa pustura o balahibo');
        }
      }

      if (consolidatedObs.length === 0) {
        consolidatedObs.push('Walang nakitang obvious abnormality');
      }

      const detectedSpecies: 'Goat' | 'Sheep' | 'Unknown' = speciesRes.detected
        ? speciesRes.species === 'Sheep'
          ? 'Sheep'
          : 'Goat'
        : 'Unknown';

      const speciesTagalog =
        detectedSpecies === 'Sheep'
          ? 'Tupa'
          : detectedSpecies === 'Goat'
          ? 'Kambing'
          : 'Hindi tiyak (Kambing o Tupa)';

      const hasConcerns = ruleRes.hasConcern || geminiConcerns.length > 0 || geminiStatus === 'attention';
      const healthStatus: 'healthy' | 'monitor' | 'attention' = hasConcerns ? 'monitor' : 'healthy';
      const healthStatusLabel = hasConcerns ? 'Bantayan' : 'Maayos / Normal';

      const notesLines: string[] = [];
      notesLines.push(`[Camera Scan: ${speciesTagalog.toUpperCase()}]`);
      if (finalMatchedAnimal) {
        notesLines.push(`Alaga: ${finalMatchedAnimal.name || finalMatchedAnimal.tag_id} (${finalMatchedAnimal.tag_id})`);
      }
      notesLines.push(`Obserbasyon: ${consolidatedObs.join(', ')}`);
      if (hasConcerns) {
        notesLines.push('Paunang Puna: Posibleng health concern (Bantayan)');
      }
      notesLines.push('Temperatura: Hindi nasukat (walang thermometer sensor)');

      const scanResultData: InlineScanResultData = {
        detectedSpecies,
        speciesLabelTagalog: speciesTagalog,
        matchedAnimal: finalMatchedAnimal,
        visualObservations: consolidatedObs,
        suggestedSymptoms,
        healthStatus,
        healthStatusLabel,
        notesSnippet: notesLines.join('\n'),
        temperatureDisplay: 'Hindi nasukat',
        recommendation: geminiRec || (hasConcerns ? 'Magsagawa ng mas masusing manual check sa kulungan.' : 'Panatilihin ang regular na pagsubaybay.'),
        capturedImageUrl: snapshotUrl,
      };

      stopCameraStream();
      onScanComplete(scanResultData);
    } catch (err: any) {
      console.error('Scan evaluation failed:', err);
      const fallbackResult: InlineScanResultData = {
        detectedSpecies: 'Unknown',
        speciesLabelTagalog: 'Hindi tiyak (Kambing o Tupa)',
        matchedAnimal: matchedAnimal,
        visualObservations: ['Walang nakitang obvious abnormality'],
        suggestedSymptoms: [],
        healthStatus: 'healthy',
        healthStatusLabel: 'Maayos / Normal',
        notesSnippet: '[Camera Scan] Walang natukoy na partikular na abnormality.\nTemperatura: Hindi nasukat',
        temperatureDisplay: 'Hindi nasukat',
      };
      stopCameraStream();
      onScanComplete(fallbackResult);
    } finally {
      setIsScanning(false);
    }
  }, [
    isScanning,
    setIsScanning,
    matchedAnimal,
    matchAnimalFromText,
    stopCameraStream,
    onScanComplete,
  ]);

  useEffect(() => {
    if (triggerScanRef) {
      triggerScanRef.current = handlePerformScan;
    }
    return () => {
      if (triggerScanRef) triggerScanRef.current = null;
    };
  }, [triggerScanRef, handlePerformScan]);

  useEffect(() => {
    isMountedRef.current = true;
    startCameraStream();

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [startCameraStream, stopCameraStream]);

  if (permissionError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '24px 16px',
          background: 'rgba(239, 68, 68, 0.05)',
          borderRadius: 14,
          border: '1px solid rgba(239, 68, 68, 0.25)',
          minHeight: '280px',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <AlertCircle size={28} color="#DC2626" />
        </div>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          Payagan ang camera para magamit ang Animal Scanner
        </h4>
        <p style={{ margin: '0 0 18px 0', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, lineHeight: 1.5 }}>
          Maaaring naka-block ang camera access sa iyong browser settings o kailangan mong payagan ang browser na gumamit ng camera.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ borderRadius: 10, padding: '9px 18px', fontSize: 13, background: '#16A34A', borderColor: '#16A34A' }}
            onClick={startCameraStream}
          >
            Subukan Ulit
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ borderRadius: 10, padding: '9px 18px', fontSize: 13 }}
            onClick={onBackToForm}
          >
            Bumalik sa Form
          </button>
        </div>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '24px 16px',
          background: 'var(--surface-sunken)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          minHeight: '280px',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(217, 119, 6, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <AlertTriangle size={28} color="#D97706" />
        </div>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          {cameraError}
        </h4>
        <p style={{ margin: '0 0 18px 0', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, lineHeight: 1.5 }}>
          Maaari mo pa ring ituloy ang health check sa pamamagitan ng pagpili ng alaga mula sa opisyal na listahan.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ borderRadius: 10, padding: '9px 20px', fontSize: 13, background: '#16A34A', borderColor: '#16A34A' }}
          onClick={onBackToForm}
        >
          Bumalik sa Form
        </button>
      </div>
    );
  }

  const hasAnimalDetected = liveDetection?.detected === true;
  const isGoat = liveDetection?.species === 'Goat';
  const isSheep = liveDetection?.species === 'Sheep';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          maxHeight: 'min(50vh, 420px)',
          minHeight: '260px',
          backgroundColor: '#0F172A',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
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
            transform: 'scaleX(1)',
            WebkitTransform: 'scaleX(1)',
          }}
        />

        <button
          type="button"
          onClick={toggleFacingMode}
          title="Palitan ang Camera"
          aria-label="Palitan ang Camera"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '50%',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <SwitchCamera size={18} />
        </button>

        <div
          style={{
            position: 'absolute',
            inset: '12% 10%',
            border: hasAnimalDetected ? '2.5px solid #16A34A' : '2px dashed rgba(255, 255, 255, 0.45)',
            borderRadius: 16,
            background: hasAnimalDetected ? 'rgba(22, 163, 74, 0.08)' : 'transparent',
            pointerEvents: 'none',
            transition: 'all 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 10,
            boxShadow: hasAnimalDetected ? '0 0 16px rgba(22, 163, 74, 0.35)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            {hasAnimalDetected ? (
              <span
                style={{
                  background: '#16A34A',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '3px 10px',
                  borderRadius: 6,
                  letterSpacing: '0.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                <Sparkles size={13} />
                {isSheep ? 'SHEEP' : 'GOAT'}
              </span>
            ) : (
              <span
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 6,
                  backdropFilter: 'blur(4px)',
                }}
              >
                Itapat sa Kambing o Tupa
              </span>
            )}
          </div>

          {matchedAnimal && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                style={{
                  background: 'rgba(22, 163, 74, 0.95)',
                  color: '#FFF',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 6,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                Tag: {matchedAnimal.tag_id} ({matchedAnimal.name || matchedAnimal.species})
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: hasAnimalDetected ? 'rgba(22, 163, 74, 0.92)' : 'rgba(15, 23, 42, 0.78)',
              backdropFilter: 'blur(6px)',
              color: '#FFFFFF',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              textAlign: 'center',
            }}
          >
            {hasAnimalDetected ? (
              <>
                <CheckCircle2 size={14} color="#FFFFFF" />
                <span>{isSheep ? 'Tupa ang nakita.' : 'Kambing ang nakita.'}</span>
              </>
            ) : (
              <>
                <Info size={14} color="rgba(255,255,255,0.8)" />
                <span>Walang kambing o tupa na nakita.</span>
              </>
            )}
          </div>
        </div>

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
              gap: 12,
              zIndex: 20,
              color: '#FFFFFF',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '3.5px solid rgba(22, 163, 74, 0.25)',
                borderTopColor: '#16A34A',
                animation: 'spin 0.85s linear infinite',
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '0 20px' }}>
              Sinusuri ang kalusugan at tag ng alaga gamit ang AI...
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: 1.4,
          padding: '0 8px',
        }}
      >
        Igitna ang kambing o tupa sa berdeng kahon. Pindutin ang <strong>Kunan ng Scan</strong> kapag handa na.
      </div>
    </div>
  );
}

export function ScanResultCard({
  result,
  farmAnimals,
}: {
  result: InlineScanResultData;
  farmAnimals: Animal[];
}) {
  const isHealthy = result.healthStatus === 'healthy';

  return (
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, color: '#16A34A' }}>
          <CheckCircle2 size={18} />
          <span>✓ Kambing o Tupa na Nakita</span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 6,
            background: '#16A34A',
            color: '#FFFFFF',
            letterSpacing: '0.5px',
          }}
        >
          {result.detectedSpecies === 'Sheep' ? 'SHEEP' : result.detectedSpecies === 'Goat' ? 'GOAT' : 'LIVESTOCK'}
        </span>
      </div>

      <div
        style={{
          background: 'var(--surface-sunken)',
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {result.matchedAnimal ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              {result.matchedAnimal.name || result.matchedAnimal.tag_id}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Tag: <strong>{result.matchedAnimal.tag_id}</strong> • Uri: {result.matchedAnimal.species === 'Sheep' ? 'Tupa' : 'Kambing'}
              {result.matchedAnimal.breed ? ` • Lahi: ${result.matchedAnimal.breed}` : ''}
              {result.matchedAnimal.weight_kg ? ` • Timbang: ${result.matchedAnimal.weight_kg} kg` : ''}
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {result.speciesLabelTagalog}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Hindi awtomatikong natukoy ang tag ng indibidwal na alaga. Maaari mong piliin ang kambing o tupa mula sa iyong listahan pagbalik sa form.
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Kalagayan:</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 6,
              background: isHealthy ? 'rgba(22, 163, 74, 0.12)' : 'rgba(217, 119, 6, 0.12)',
              color: isHealthy ? '#16A34A' : '#D97706',
              border: `1px solid ${isHealthy ? 'rgba(22, 163, 74, 0.25)' : 'rgba(217, 119, 6, 0.25)'}`,
            }}
          >
            {result.healthStatusLabel}
          </span>
        </div>

        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Napansing Obserbasyon:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.visualObservations.map((obs, idx) => (
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
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>Hindi nasukat</span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Paalala: Manual check recommended. Pindutin ang <strong>Magpatuloy</strong> upang ilagay ang mga datos sa form.
        </div>
      </div>
    </div>
  );
}
