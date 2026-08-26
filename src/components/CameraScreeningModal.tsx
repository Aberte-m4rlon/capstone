/**
 * CameraScreeningModal.tsx
 * Camera-based ML health screening UI for AlpasFarm.
 *
 * Supports:
 *   - Live camera capture (phone/webcam)
 *   - Image upload fallback
 *   - Image quality check before inference
 *   - Real TensorFlow.js ML inference
 *   - Result display with medical disclaimer
 *   - Save result to Supabase (DB + Storage)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera,
  Upload,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Loader2,
  X,
  ImageIcon,
} from 'lucide-react';
import {
  runCameraScreening,
  captureVideoFrame,
  fileToCanvas,
  loadMobileNet,
  type ScreeningResult,
} from '../lib/cameraML';
import { saveScreeningResult } from '../lib/useCameraScreenings';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  animalId: string;
  animalName: string;
  animalTag: string;
  onClose: () => void;
  onSaved?: () => void;
}

type Step = 'capture' | 'preview' | 'analyzing' | 'result';
type CameraError =
  | 'permission_denied'
  | 'not_available'
  | 'https_required'
  | 'unsupported'
  | null;

// ── Component ─────────────────────────────────────────────────────────────────

export function CameraScreeningModal({
  animalId,
  animalName,
  animalTag,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<Step>('capture');
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<CameraError>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [notes, setNotes] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preload model in background
  useEffect(() => {
    setModelLoading(true);
    loadMobileNet().finally(() => setModelLoading(false));
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);

    // HTTPS check (camera API requires secure context except localhost)
    if (
      typeof window !== 'undefined' &&
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setCameraError('https_required');
      setMode('upload');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('unsupported');
      setMode('upload');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // prefer back camera on phones
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('permission') || msg.includes('denied') || err?.name === 'NotAllowedError') {
        setCameraError('permission_denied');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setCameraError('not_available');
      } else {
        setCameraError('not_available');
      }
      setMode('upload');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera on mount if mode=camera
  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture photo from camera
  const handleCapture = useCallback(() => {
    if (!videoRef.current || !cameraActive) return;
    const canvas = captureVideoFrame(videoRef.current);
    const url = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedCanvas(canvas);
    setCapturedUrl(url);
    stopCamera();
    setStep('preview');
  }, [cameraActive, stopCamera]);

  // Handle uploaded file
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('Please select an image file (JPG, PNG, etc.)', 'error');
      return;
    }

    try {
      const canvas = await fileToCanvas(file);
      const url = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedCanvas(canvas);
      setCapturedUrl(url);
      stopCamera();
      setStep('preview');
    } catch {
      toast('Could not load image. Please try another file.', 'error');
    }
  }, [stopCamera, toast]);

  // Retake
  const handleRetake = useCallback(() => {
    setCapturedCanvas(null);
    setCapturedUrl(null);
    setResult(null);
    setNotes('');
    setStep('capture');
    if (mode === 'camera') {
      startCamera();
    }
  }, [mode, startCamera]);

  // Run analysis
  const handleAnalyze = useCallback(async () => {
    if (!capturedCanvas) return;
    setStep('analyzing');

    try {
      const screeningResult = await runCameraScreening(capturedCanvas, animalId);
      setResult(screeningResult);
      setStep('result');
    } catch (err: any) {
      toast(`Analysis failed: ${err?.message ?? 'Unknown error'}`, 'error');
      setStep('preview');
    }
  }, [capturedCanvas, animalId, toast]);

  // Save result
  const handleSave = useCallback(async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      const { error } = await saveScreeningResult(
        animalId,
        user.id,
        result,
        capturedCanvas,
        notes.trim() || undefined,
      );
      if (error) throw new Error(error);
      toast('Screening result saved.', 'success');
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast(`Could not save result: ${err?.message ?? 'Please try again.'}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [result, user, animalId, capturedCanvas, notes, toast, onSaved, onClose]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopCamera();
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--glass-surface)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 20,
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          width: '100%',
          maxWidth: 500,
          maxHeight: '95vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--border-light)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg,rgba(255,106,42,0.25),rgba(255,59,48,0.15))',
                border: '1px solid rgba(255,106,42,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={18} color="var(--accent-orange)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                Camera Health Screening
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {animalName} · {animalTag}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Model loading banner */}
        {modelLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 20px',
              background: 'rgba(59,130,246,0.1)',
              borderBottom: '1px solid rgba(59,130,246,0.2)',
              fontSize: 12,
              color: '#3B82F6',
            }}
          >
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            Loading ML model in background…
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '16px 20px 20px' }}>

          {/* ── CAPTURE STEP ── */}
          {step === 'capture' && (
            <div>
              {/* Mode switcher */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginBottom: 14,
                  background: 'var(--surface)',
                  borderRadius: 10,
                  padding: 4,
                  border: '1px solid var(--border)',
                }}
              >
                {(['camera', 'upload'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      background: mode === m
                        ? 'linear-gradient(135deg,#FF3B30,#FF7A18)'
                        : 'transparent',
                      color: mode === m ? '#fff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                  >
                    {m === 'camera' ? <Camera size={14} /> : <Upload size={14} />}
                    {m === 'camera' ? 'Use Camera' : 'Upload Photo'}
                  </button>
                ))}
              </div>

              {/* Camera preview */}
              {mode === 'camera' && (
                <div>
                  {cameraError ? (
                    <CameraErrorCard error={cameraError} onSwitchUpload={() => setMode('upload')} />
                  ) : (
                    <div>
                      <div
                        style={{
                          position: 'relative',
                          borderRadius: 14,
                          overflow: 'hidden',
                          background: '#000',
                          aspectRatio: '4/3',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {/* Overlay guide */}
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            style={{
                              border: '2px dashed rgba(255,122,24,0.7)',
                              borderRadius: 12,
                              width: '70%',
                              height: '70%',
                            }}
                          />
                        </div>
                        {/* Guide label */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 10,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '4px 12px',
                            borderRadius: 999,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Position animal in frame
                        </div>
                      </div>

                      {/* Camera tips */}
                      <div
                        style={{
                          background: 'rgba(255,122,24,0.07)',
                          border: '1px solid rgba(255,122,24,0.2)',
                          borderRadius: 10,
                          padding: '10px 14px',
                          marginTop: 12,
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.6,
                        }}
                      >
                        ✓ Good lighting · ✓ Animal clearly visible · ✓ Avoid motion blur
                      </div>

                      {/* Capture button */}
                      <button
                        onClick={handleCapture}
                        disabled={!cameraActive}
                        style={{
                          width: '100%',
                          marginTop: 14,
                          padding: '14px',
                          borderRadius: 12,
                          border: 'none',
                          background: cameraActive
                            ? 'linear-gradient(135deg,#FF3B30,#FF7A18)'
                            : 'var(--surface)',
                          color: cameraActive ? '#fff' : 'var(--text-secondary)',
                          fontSize: 15,
                          fontWeight: 800,
                          cursor: cameraActive ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          boxShadow: cameraActive ? '0 6px 20px rgba(255,59,48,0.35)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Camera size={18} />
                        Capture Photo
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Upload mode */}
              {mode === 'upload' && (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed rgba(255,122,24,0.4)',
                      borderRadius: 14,
                      padding: '40px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'rgba(255,122,24,0.04)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,122,24,0.7)';
                      e.currentTarget.style.background = 'rgba(255,122,24,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,122,24,0.4)';
                      e.currentTarget.style.background = 'rgba(255,122,24,0.04)';
                    }}
                  >
                    <ImageIcon size={36} color="rgba(255,122,24,0.6)" style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      Click to upload a photo
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      JPG, PNG, WEBP · Max 10MB
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── PREVIEW STEP ── */}
          {step === 'preview' && capturedUrl && (
            <div>
              <img
                src={capturedUrl}
                alt="Captured animal"
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  display: 'block',
                  maxHeight: 360,
                  objectFit: 'contain',
                  background: '#000',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <button
                  onClick={handleRetake}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <RefreshCw size={15} /> Retake
                </button>
                <button
                  onClick={handleAnalyze}
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 6px 20px rgba(255,59,48,0.35)',
                  }}
                >
                  <Zap size={15} /> Analyze
                </button>
              </div>
            </div>
          )}

          {/* ── ANALYZING STEP ── */}
          {step === 'analyzing' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,rgba(255,106,42,0.2),rgba(255,59,48,0.1))',
                  border: '2px solid rgba(255,106,42,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Loader2 size={28} color="var(--accent-orange)" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                Analyzing Image…
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Running ML health screening.<br />
                This may take a few seconds.
              </div>
            </div>
          )}

          {/* ── RESULT STEP ── */}
          {step === 'result' && result && (
            <div>
              {/* Captured image thumbnail */}
              {capturedUrl && (
                <img
                  src={capturedUrl}
                  alt="Screened"
                  style={{
                    width: '100%',
                    maxHeight: 200,
                    objectFit: 'contain',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: '#000',
                    marginBottom: 14,
                  }}
                />
              )}

              {/* Quality warning */}
              {!result.qualityReport.passed && (
                <div
                  style={{
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 12,
                    fontSize: 12,
                    color: '#D97706',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Image Quality Issues</div>
                  {result.qualityReport.issues.map((issue) => (
                    <div key={issue}>· {issue}</div>
                  ))}
                </div>
              )}

              {/* Main result card */}
              <div
                style={{
                  background: result.prediction === 'possible_health_concern'
                    ? 'rgba(239,68,68,0.08)'
                    : result.prediction === 'normal_appearance'
                    ? 'rgba(22,163,74,0.08)'
                    : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${result.prediction === 'possible_health_concern'
                    ? 'rgba(239,68,68,0.3)'
                    : result.prediction === 'normal_appearance'
                    ? 'rgba(22,163,74,0.3)'
                    : 'rgba(245,158,11,0.3)'}`,
                  borderRadius: 14,
                  padding: '16px',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  {result.prediction === 'possible_health_concern' ? (
                    <AlertTriangle size={22} color="#EF4444" />
                  ) : result.prediction === 'normal_appearance' ? (
                    <CheckCircle size={22} color="#16A34A" />
                  ) : (
                    <XCircle size={22} color="#F59E0B" />
                  )}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: result.labelColor }}>
                      {result.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Preliminary ML Screening
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 900,
                        color: result.labelColor,
                        lineHeight: 1,
                      }}
                    >
                      {result.confidencePercent}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ML Confidence</div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>Model: </span>
                    {result.modelVersion}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>Image Quality: </span>
                    {result.qualityReport.score}/100
                  </div>
                </div>

                {/* Recommendation */}
                <div
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 12,
                    color: 'var(--text)',
                    lineHeight: 1.6,
                    marginBottom: 10,
                  }}
                >
                  <strong>Recommendation:</strong> {result.recommendation}
                </div>

                {/* Low confidence specific message */}
                {result.prediction === 'low_confidence' && (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#D97706',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                    }}
                  >
                    Prediction confidence is too low for a reliable screening. Please capture another clear image of the animal.
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div
                style={{
                  background: 'rgba(59,130,246,0.07)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: 11,
                  color: '#3B82F6',
                  lineHeight: 1.6,
                  display: 'flex',
                  gap: 8,
                }}
              >
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{result.disclaimer}</span>
              </div>

              {/* Notes input */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes (optional)…"
                rows={2}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  marginBottom: 14,
                  boxSizing: 'border-box',
                }}
              />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleRetake}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <RefreshCw size={14} /> Retake
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    background: saving ? 'var(--surface)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                    color: saving ? 'var(--text-secondary)' : '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: saving ? 'none' : '0 6px 20px rgba(255,59,48,0.35)',
                    transition: 'all 0.2s',
                  }}
                >
                  {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : '💾 Save Result'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Camera error card ─────────────────────────────────────────────────────────

function CameraErrorCard({
  error,
  onSwitchUpload,
}: {
  error: CameraError;
  onSwitchUpload: () => void;
}) {
  const messages: Record<NonNullable<CameraError>, { title: string; desc: string }> = {
    permission_denied: {
      title: 'Camera Access Denied',
      desc: 'Camera access was denied. You can upload an animal photo instead.',
    },
    not_available: {
      title: 'Camera Not Available',
      desc: 'No camera was found on this device. Please upload a photo instead.',
    },
    https_required: {
      title: 'HTTPS Required',
      desc: 'Camera access requires a secure connection (HTTPS). Please upload a photo instead.',
    },
    unsupported: {
      title: 'Camera Not Supported',
      desc: 'Your browser does not support camera access. Please upload a photo instead.',
    },
  };

  const msg = messages[error!];

  return (
    <div
      style={{
        background: 'rgba(239,68,68,0.07)',
        border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: 12,
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <XCircle size={32} color="#EF4444" style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
        {msg.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
        {msg.desc}
      </div>
      <button
        onClick={onSwitchUpload}
        style={{
          padding: '10px 20px',
          borderRadius: 10,
          border: 'none',
          background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Upload size={14} /> Upload Photo Instead
      </button>
    </div>
  );
}
