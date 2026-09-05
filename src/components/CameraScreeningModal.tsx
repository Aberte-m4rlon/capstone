/**
 * CameraScreeningModal — AI Livestock Health Scanner UI
 * Full-featured: camera/upload/video, goat detection, multi-angle,
 * detailed result card, combined farm data, save to Supabase.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera, Upload, RefreshCw, Zap, AlertTriangle, CheckCircle,
  XCircle, Info, Loader2, X, ImageIcon, Video, RotateCcw,
  Heart, Activity, Eye, Layers,
} from 'lucide-react';
import {
  runHealthScan, analyzeVideoFrames, captureVideoFrame, fileToCanvas,
  loadMobileNet, type ScanResult, type FarmHealthContext,
} from '../lib/cameraML';
import { saveScreeningResult } from '../lib/useCameraScreenings';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import type { Animal } from '../types';
import { FARM_LABELS, simplifyHealthObservation } from '../lib/farmerTerminology';

interface Props {
  animalId: string;
  animalName: string;
  animalTag: string;
  animal?: Animal;
  farmContext?: FarmHealthContext;
  onClose: () => void;
  onSaved?: () => void;
}

type Step = 'capture' | 'preview' | 'analyzing' | 'result';
type Mode = 'camera' | 'upload' | 'video';
type Angle = 'SIDE' | 'FRONT' | 'REAR';
type CameraError = 'permission_denied' | 'not_available' | 'https_required' | 'unsupported' | null;

const ANGLE_LABELS: Record<Angle, string> = {
  SIDE: 'Side View',
  FRONT: 'Front View',
  REAR: 'Rear View',
};

export function CameraScreeningModal({
  animalId, animalName, animalTag, animal, farmContext, onClose, onSaved,
}: Props) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<Step>('capture');
  const [mode, setMode] = useState<Mode>('camera');
  const [cameraError, setCameraError] = useState<CameraError>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [currentAngle, setCurrentAngle] = useState<Angle>('SIDE');
  const [multiAngle, setMultiAngle] = useState(false);
  const [videoFrames, setVideoFrames] = useState<HTMLCanvasElement[]>([]);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Preload model
  useEffect(() => {
    setModelLoading(true);
    loadMobileNet().finally(() => setModelLoading(false));
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (typeof window !== 'undefined' &&
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1') {
      setCameraError('https_required'); setMode('upload'); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('unsupported'); setMode('upload'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('permission') || err?.name === 'NotAllowedError') setCameraError('permission_denied');
      else setCameraError('not_available');
      setMode('upload');
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
  }, []);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => stopCamera();
  }, [mode, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlipCamera = () => {
    stopCamera();
    setFacingMode((f) => f === 'environment' ? 'user' : 'environment');
  };

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !cameraActive) return;
    const canvas = captureVideoFrame(videoRef.current);
    const url = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedCanvas(canvas);
    setCapturedUrl(url);
    stopCamera();
    setStep('preview');
  }, [cameraActive, stopCamera]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Please select an image file.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('Image too large. Max 10MB.', 'error'); return; }
    try {
      const canvas = await fileToCanvas(file);
      setCapturedCanvas(canvas);
      setCapturedUrl(canvas.toDataURL('image/jpeg', 0.9));
      stopCamera();
      setStep('preview');
    } catch { toast('Could not load image.', 'error'); }
  }, [stopCamera, toast]);

  const handleVideoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast('Please select a video file.', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('Video too large. Max 50MB.', 'error'); return; }
    setVideoFile(file);
    setStep('analyzing');
    try {
      // Extract frames from video
      const frames = await extractVideoFrames(file, 8);
      setVideoFrames(frames);
      const scanResult = await analyzeVideoFrames(frames, {
        animalName, farmContext,
      });
      setResult(scanResult);
      setStep('result');
    } catch (err: any) {
      toast(`Video analysis failed: ${err?.message ?? 'Unknown error'}`, 'error');
      setStep('capture');
    }
  }, [animalName, farmContext, toast]);

  const handleAnalyze = useCallback(async () => {
    if (!capturedCanvas) return;
    setStep('analyzing');
    try {
      const scanResult = await runHealthScan(capturedCanvas, {
        animalId, animalName, farmContext,
        scanType: 'image',
      });
      setResult(scanResult);
      setStep('result');

      // Auto-create alert for high-risk results
      if (user && (scanResult.riskLevel === 'HIGH' || scanResult.riskLevel === 'CRITICAL')) {
        const title = scanResult.riskLevel === 'CRITICAL'
          ? `URGENT: ${animalName} requires veterinary examination`
          : `AI screening detected possible health indicators in ${animalName}`;
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'Health',
          title,
          description: `Camera screening: ${scanResult.riskLevelLabel} (${Math.round((scanResult.combinedRiskScore ?? scanResult.riskScore))}% risk). ${scanResult.primaryIndicators.slice(0, 2).join(', ')}`,
          priority: scanResult.riskLevel === 'CRITICAL' ? 'Critical' : 'Warning',
          link: `/animals/${animalId}`,
          read: false,
        });
      }
    } catch (err: any) {
      toast(`Analysis failed: ${err?.message ?? 'Unknown error'}`, 'error');
      setStep('preview');
    }
  }, [capturedCanvas, animalId, animalName, farmContext, user, toast]);

  const handleSave = useCallback(async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      const { error } = await saveScreeningResult(
        animalId, user.id, result, capturedCanvas, notes.trim() || undefined,
      );
      if (error) throw new Error(error);
      toast('Screening result saved.', 'success');
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast(`Could not save: ${err?.message ?? 'Please try again.'}`, 'error');
    } finally { setSaving(false); }
  }, [result, user, animalId, capturedCanvas, notes, toast, onSaved, onClose]);

  const handleRetake = useCallback(() => {
    setCapturedCanvas(null);
    setCapturedUrl(null);
    setResult(null);
    setNotes('');
    setVideoFile(null);
    setVideoFrames([]);
    setStep('capture');
    if (mode === 'camera') startCamera();
  }, [mode, startCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (capturedUrl && capturedUrl.startsWith('blob:')) URL.revokeObjectURL(capturedUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finalScore = result ? (result.combinedRiskScore ?? result.riskScore) : 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--glass-surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        width: '100%', maxWidth: 520,
        maxHeight: '96vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,rgba(255,106,42,0.25),rgba(255,59,48,0.15))', border: '1px solid rgba(255,106,42,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={19} color="var(--accent-orange)" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>AI Health Scanner</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{animalName} · {animalTag}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <X size={16} />
          </button>
        </div>

        {modelLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 20px', background: 'rgba(59,130,246,0.1)', borderBottom: '1px solid rgba(59,130,246,0.2)', fontSize: 12, color: '#3B82F6' }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            Loading AI model in background…
          </div>
        )}

        <div style={{ padding: '16px 20px 20px' }}>

          {/* ── CAPTURE ── */}
          {step === 'capture' && (
            <div>
              {/* Mode tabs */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 14, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
                {(['camera', 'upload', 'video'] as Mode[]).map((m) => (
                  <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: mode === m ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.2s' }}>
                    {m === 'camera' ? <Camera size={13} /> : m === 'upload' ? <Upload size={13} /> : <Video size={13} />}
                    {m === 'camera' ? 'Camera' : m === 'upload' ? 'Photo' : 'Video'}
                  </button>
                ))}
              </div>

              {/* Multi-angle toggle */}
              {mode === 'camera' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <input type="checkbox" checked={multiAngle} onChange={(e) => setMultiAngle(e.target.checked)} />
                    Multi-angle scan ({currentAngle})
                  </label>
                  {multiAngle && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['SIDE', 'FRONT', 'REAR'] as Angle[]).map((a) => (
                        <button key={a} onClick={() => setCurrentAngle(a)} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${currentAngle === a ? 'var(--accent-orange)' : 'var(--border)'}`, background: currentAngle === a ? 'rgba(255,122,24,0.15)' : 'transparent', color: currentAngle === a ? 'var(--accent-orange)' : 'var(--text-secondary)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Camera view */}
              {mode === 'camera' && (
                <>
                  {cameraError ? (
                    <CameraErrorCard error={cameraError} onSwitchUpload={() => setMode('upload')} />
                  ) : (
                    <div>
                      <div className="camera-container" style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#000', aspectRatio: '9 / 16', maxWidth: 380, margin: '0 auto', border: '1px solid var(--border)' }}>
                        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <div style={{ border: '2px dashed rgba(67,160,71,0.8)', borderRadius: 16, width: '75%', height: '65%' }} />
                        </div>
                        {/* Mandate 12: Thermal camera status pill */}
                        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, zIndex: 10 }}>
                          <Activity size={11} color="#94A3B8" />
                          <span>Thermal Camera: Hindi Nakakonekta</span>
                          <span style={{ opacity: 0.4 }}>•</span>
                          <span>Surface Temp: Hindi nasukat</span>
                        </div>
                        {multiAngle && (
                          <div style={{ position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)', background: 'rgba(46,125,50,0.9)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 999, zIndex: 10 }}>
                            Capture: {ANGLE_LABELS[currentAngle]}
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: 999, whiteSpace: 'nowrap', zIndex: 10 }}>
                          Itutok ang camera sa kambing o tupa
                        </div>
                        {/* Flip button */}
                        <button onClick={handleFlipCamera} style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 11 }} title="Magpalit ng camera">
                          <RotateCcw size={15} />
                        </button>
                      </div>
                      <div style={{ background: 'rgba(67,160,71,0.08)', border: '1px solid rgba(67,160,71,0.2)', borderRadius: 10, padding: '8px 14px', marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        Siguraduhing maliwanag · Buong katawan ng hayop · Huwag galawin ang camera
                      </div>
                      <button onClick={handleCapture} disabled={!cameraActive} style={{ width: '100%', marginTop: 12, padding: '14px', borderRadius: 12, border: 'none', background: cameraActive ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'var(--surface)', color: cameraActive ? '#fff' : 'var(--text-secondary)', fontSize: 15, fontWeight: 800, cursor: cameraActive ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: cameraActive ? '0 6px 20px rgba(255,59,48,0.35)' : 'none', transition: 'all 0.2s' }}>
                        <Camera size={18} /> Kumuha ng Litrato
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Upload photo */}
              {mode === 'upload' && (
                <div>
                  <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed rgba(255,122,24,0.4)', borderRadius: 14, padding: '44px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,122,24,0.04)', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,122,24,0.7)'; e.currentTarget.style.background = 'rgba(255,122,24,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,122,24,0.4)'; e.currentTarget.style.background = 'rgba(255,122,24,0.04)'; }}>
                    <ImageIcon size={36} color="rgba(255,122,24,0.6)" style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Pindutin para mag-upload ng litrato</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>JPG, PNG, WEBP · Hanggang 10MB</div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
              )}

              {/* Upload video */}
              {mode === 'video' && (
                <div>
                  <div onClick={() => videoInputRef.current?.click()} style={{ border: '2px dashed rgba(59,130,246,0.4)', borderRadius: 14, padding: '44px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(59,130,246,0.04)', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.7)'; e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.background = 'rgba(59,130,246,0.04)'; }}>
                    <Video size={36} color="rgba(59,130,246,0.6)" style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Mag-upload ng maikling video clip</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>MP4, MOV, WEBM · Hanggang 50MB · 5–15 segundo</div>
                    <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 8 }}>Sinusuri ang kilos, sigla, at paglakad ng hayop</div>
                  </div>
                  <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoUpload} />
                </div>
              )}
            </div>
          )}

          {/* ── PREVIEW ── */}
          {step === 'preview' && capturedUrl && (
            <div>
              <img src={capturedUrl} alt="Captured" style={{ width: '100%', borderRadius: 14, border: '1px solid var(--border)', display: 'block', maxHeight: 340, objectFit: 'contain', background: '#000' }} />
              {multiAngle && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,122,24,0.07)', border: '1px solid rgba(255,122,24,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent-orange)', fontWeight: 600 }}>
                  Anggulo: {ANGLE_LABELS[currentAngle]}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={handleRetake} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <RefreshCw size={15} /> Kumuha Ulit
                </button>
                <button onClick={handleAnalyze} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 6px 20px rgba(255,59,48,0.35)' }}>
                  <Zap size={15} /> I-scan gamit ang AI
                </button>
              </div>
            </div>
          )}

          {/* ── ANALYZING ── */}
          {step === 'analyzing' && (
            <div style={{ textAlign: 'center', padding: '44px 20px' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(255,106,42,0.2),rgba(255,59,48,0.1))', border: '2px solid rgba(255,106,42,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Loader2 size={30} color="var(--accent-orange)" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Isinasagawa ang AI Health Scan…</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Hinahanap ang kambing o tupa · Sinusuri ang visual indicators<br />
                Kinakalkula ang health status score<br />
                <span style={{ fontSize: 11, opacity: 0.7 }}>Maaaring magtagal nang ilang segundo</span>
              </div>
            </div>
          )}

          {/* ── RESULT ── */}
          {step === 'result' && result && (
            <ScanResultCard
              result={result}
              capturedUrl={capturedUrl}
              notes={notes}
              saving={saving}
              onNotesChange={setNotes}
              onSave={handleSave}
              onRetake={handleRetake}
              animalName={animalName}
            />
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Result Card ────────────────────────────────────────────────────────────────

function ScanResultCard({
  result, capturedUrl, notes, saving, onNotesChange, onSave, onRetake, animalName,
}: {
  result: ScanResult;
  capturedUrl: string | null;
  notes: string;
  saving: boolean;
  onNotesChange: (v: string) => void;
  onSave: () => void;
  onRetake: () => void;
  animalName: string;
}) {
  if (!result.goatDetected) {
    return (
      <div>
        {capturedUrl && (
          <img src={capturedUrl} alt="Scanned" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)', background: '#000', marginBottom: 14 }} />
        )}
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.4)', borderRadius: 14, padding: '22px 18px', textAlign: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <XCircle size={48} color="#EF4444" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#EF4444', marginBottom: 6 }}>
            Hindi ito kambing o tupa.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            Ang AI Health Screening ay para lamang sa mga alagang kambing at tupa. Pakiharap ang camera o mag-upload ng litrato ng kambing o tupa.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: '#EF4444', fontWeight: 700 }}>
            <AlertTriangle size={14} /> Hindi maaaring i-save ang screening dahil hindi ito kambing o tupa.
          </div>
        </div>

        <button onClick={onRetake} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px rgba(255,59,48,0.3)' }}>
          <RefreshCw size={14} /> Subukang Mag-scan Ulit
        </button>
      </div>
    );
  }

  const finalScore = result.combinedRiskScore ?? result.riskScore;
  const displayRiskLabel =
    result.riskLevel === 'CRITICAL' ? 'Mataas ang Risk / High Risk' :
    result.riskLevel === 'HIGH' ? 'Nangangailangan ng Atensyon / Needs Attention' :
    result.riskLevel === 'MODERATE' ? 'Bantayan / Under Observation' :
    'Maayos / Healthy';

  return (
    <div>
      {/* Thumbnail with Bounding Box Overlay */}
      {capturedUrl && (
        <div style={{ position: 'relative', width: '100%', maxHeight: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#000', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={capturedUrl} alt="Scanned" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} />
          
          {/* YOLO Bounding Boxes */}
          {result.boundingBoxes && result.boundingBoxes.map((b, idx) => {
            const [x1, y1, x2, y2] = b.box;
            const isTargetGoat = b.class_name === 'goat' || b.class_name === 'sheep';
            const color = isTargetGoat ? '#22C55E' : '#EF4444';
            const labelText = isTargetGoat ? (b.class_name === 'sheep' ? 'Tupa' : 'Kambing') : b.class_name.replace('_', ' ');

            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  width: `${(x2 - x1) * 100}%`,
                  height: `${(y2 - y1) * 100}%`,
                  border: `2px solid ${color}`,
                  background: isTargetGoat ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.18)',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -20,
                    left: 0,
                    background: color,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 3,
                    whiteSpace: 'nowrap',
                    textTransform: 'capitalize',
                  }}
                >
                  {labelText}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {result.multipleAnimals && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#D97706' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /> Maraming hayop ang nakita. Maaaring mabawasan ang accuracy.
        </div>
      )}

      {/* Main result */}
      <div style={{ background: `${result.riskLevelColor}10`, border: `1px solid ${result.riskLevelColor}35`, borderRadius: 14, padding: '16px', marginBottom: 12 }}>

        {/* Status header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: `${result.riskLevelColor}20`, border: `1px solid ${result.riskLevelColor}40`, flexShrink: 0 }}>
            <Activity size={24} color={result.riskLevelColor} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: result.riskLevelColor }}>{displayRiskLabel}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)' }}>
                Visual Scan
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Pagsusuri sa Kalusugan — {animalName}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: result.riskLevelColor, lineHeight: 1 }}>{finalScore}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Score ng Kalusugan</div>
          </div>
        </div>

        {/* Risk bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${finalScore}%`, borderRadius: 999, background: `linear-gradient(90deg,${result.riskLevelColor}80,${result.riskLevelColor})`, transition: 'width 0.8s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
            <span>0 — Maayos</span><span>21 — Bantayan</span><span>51 — Mataas ang Risk</span><span>76 — Kritikal</span>
          </div>
        </div>

        {/* Confidence vs risk explanation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{result.confidencePercent}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Katiyakan</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{result.qualityReport.score}/100</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Kalidad ng Litrato</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', marginBottom: 12, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
          <span>Ipinapakita ng <strong>Katiyakan ng Pagsusuri</strong> kung gaano kaklaro ang mga katangian — hindi ito tiyak na diagnosis ng sakit.</span>
        </div>

        {/* Detected indicators */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Mga Nakitang Indikasyon</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {result.indicators.map((ind, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: ind.indicator === 'NORMAL' ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.07)', border: `1px solid ${ind.indicator === 'NORMAL' ? 'rgba(22,163,74,0.2)' : 'rgba(239,68,68,0.15)'}` }}>
                {ind.indicator === 'NORMAL'
                  ? <CheckCircle size={14} color="#16A34A" />
                  : <AlertTriangle size={14} color="#EF4444" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{simplifyHealthObservation(ind.label)}</div>
                  {ind.indicator !== 'NORMAL' && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{simplifyHealthObservation(ind.description)}</div>}
                </div>
                {ind.indicator !== 'NORMAL' && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', flexShrink: 0 }}>+{ind.riskPoints} pts</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Combined factors */}
        {result.combinedFactors.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Kasama ang Datos ng Bukid</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {result.combinedFactors.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '5px 8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} color="#D97706" style={{ flexShrink: 0 }} />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation (Mandate 13 Non-diagnostic) */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {result.riskLevel !== 'LOW' ? 'POSIBLENG PROBLEMA SA KALUSUGAN AT GABAY' : 'GABAY SA PAG-AALAGA'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{simplifyHealthObservation(result.recommendation)}</div>
        </div>

        {/* Actions */}
        {result.recommendedActions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {result.recommendedActions.map((a, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 8 }}>· {simplifyHealthObservation(a)}</div>
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: '#3B82F6', lineHeight: 1.6, display: 'flex', gap: 8 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{result.disclaimer}</span>
      </div>

      {/* Notes */}
      <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Magdagdag ng tala (opsyonal)…" rows={2} style={{ width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box' }} />

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onRetake} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={14} /> I-scan Ulit
        </button>
        <button onClick={onSave} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: saving ? 'var(--surface)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: saving ? 'var(--text-secondary)' : '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: saving ? 'none' : '0 6px 20px rgba(255,59,48,0.35)', transition: 'all 0.2s' }}>
          {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Inililigtas…</> : <><CheckCircle size={15} /> I-save ang Screening</>}
        </button>
      </div>
    </div>
  );
}

// ── Camera Error ───────────────────────────────────────────────────────────────

function CameraErrorCard({ error, onSwitchUpload }: { error: CameraError; onSwitchUpload: () => void }) {
  const msgs: Record<NonNullable<CameraError>, { title: string; desc: string }> = {
    permission_denied: { title: 'Hindi Pinayagan ang Camera', desc: 'Hindi pinayagan ang access sa camera. Mag-upload na lamang ng litrato.' },
    not_available: { title: 'Walang Nakitang Camera', desc: 'Walang nakitang camera sa device na ito. Mag-upload na lamang ng litrato.' },
    https_required: { title: 'Kailangan ng HTTPS', desc: 'Kailangan ng ligtas na koneksyon (HTTPS) para sa camera. Mag-upload na lamang ng litrato.' },
    unsupported: { title: 'Hindi Suportado ang Camera', desc: 'Hindi suportado ng browser ang camera. Mag-upload na lamang ng litrato.' },
  };
  const msg = msgs[error!];
  return (
    <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '24px 20px', textAlign: 'center' }}>
      <XCircle size={32} color="#EF4444" style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{msg.title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>{msg.desc}</div>
      <button onClick={onSwitchUpload} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Upload size={14} /> Mag-upload ng Litrato
      </button>
    </div>
  );
}

// ── Video frame extractor ─────────────────────────────────────────────────────

function extractVideoFrames(file: File, frameCount: number): Promise<HTMLCanvasElement[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.preload = 'metadata';

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const frames: HTMLCanvasElement[] = [];
      const step = duration / (frameCount + 1);

      for (let i = 1; i <= frameCount; i++) {
        await new Promise<void>((res) => {
          video.currentTime = step * i;
          video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(video, 0, 0);
            frames.push(canvas);
            res();
          };
        });
      }

      URL.revokeObjectURL(url);
      resolve(frames);
    };

    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load video')); };
  });
}
