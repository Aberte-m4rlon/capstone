import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  ScanLine,
  SwitchCamera,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Activity,
  PawPrint,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { supabase } from '../../../lib/supabase';
import {
  captureVideoFrame,
  identifyLivestockSpecies,
  type LivestockSpeciesDetection,
} from '../../../lib/cameraML';
import { runRuleBasedScreening } from '../../../lib/ruleBasedScreening';
import type { Animal } from '../../../types';

interface AnimalCameraScanModalProps {
  open: boolean;
  onClose: () => void;
  onAnimalFound: (animal: Animal) => void;
  onManualSelectRequest: () => void;
  farmAnimals: Animal[];
  currentUserId?: string;
  isSuperAdmin?: boolean;
}

const CONTAINER_ID = 'manual-health-qr-scanner-box';

export function AnimalCameraScanModal({
  open,
  onClose,
  onAnimalFound,
  onManualSelectRequest,
  farmAnimals,
  currentUserId,
  isSuperAdmin = false,
}: AnimalCameraScanModalProps) {
  const [scanState, setScanState] = useState<'starting' | 'scanning' | 'error' | 'success'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  // Real-time ML Species & Visual Screening status
  const [mlDetection, setMlDetection] = useState<LivestockSpeciesDetection | null>(null);
  const [visualConcernNotice, setVisualConcernNotice] = useState<string | null>(null);
  const [ambiguousNotice, setAmbiguousNotice] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isMountedRef = useRef(true);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);
  const scanStateRef = useRef<'starting' | 'scanning' | 'error' | 'success'>('starting');
  const mlIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep refs for callbacks so startScanner and runLiveMLCheck don't cause infinite re-render cycles
  const handleDecodedRef = useRef<(text: string) => void>(() => {});
  const runLiveMLCheckRef = useRef<() => void>(() => {});

  // Sync scanStateRef with scanState
  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  // ── Stop Scanner safely ───────────────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (mlIntervalRef.current) {
      clearInterval(mlIntervalRef.current);
      mlIntervalRef.current = null;
    }

    if (scannerRef.current) {
      try {
        const s = scannerRef.current;
        scannerRef.current = null;
        const state = s.getState();
        // State 2 = SCANNING, State 3 = PAUSED
        if (state === 2 || state === 3) {
          await s.stop();
        }
        s.clear();
      } catch {
        // Safe ignore
      }
    }

    const container = document.getElementById(CONTAINER_ID);
    if (container) {
      container.innerHTML = '';
    }

    isStoppingRef.current = false;
  }, []);

  // ── Process Decoded QR Code ───────────────────────────────────────────────
  const handleDecoded = useCallback(
    async (decodedText: string) => {
      const raw = decodedText.trim();
      if (!raw) return;

      // Extract Animal ID or Tag ID
      let candidateId: string | null = null;
      let candidateTag: string | null = null;

      // 1. URL pattern: /animals/:uuid or /public/:uuid
      const urlMatch = raw.match(/\/(?:animals|public)\/([a-f0-9\-]{36})/i);
      if (urlMatch) {
        candidateId = urlMatch[1];
      } else {
        // Try absolute URL parse
        try {
          const parsedUrl = new URL(raw);
          const pathMatch = parsedUrl.pathname.match(/\/(?:animals|public)\/([a-f0-9\-]{36})/i);
          if (pathMatch) {
            candidateId = pathMatch[1];
          }
        } catch {
          // Not a URL, continue
        }
      }

      // 2. JSON pattern: {"id": "...", "tag_id": "..."}
      if (!candidateId && raw.startsWith('{') && raw.endsWith('}')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.id) candidateId = String(parsed.id);
          if (parsed.tag_id) candidateTag = String(parsed.tag_id);
        } catch {
          // Not JSON
        }
      }

      // 3. Fallback raw string as candidate tag or UUID
      if (!candidateId && !candidateTag) {
        if (/^[a-f0-9\-]{36}$/i.test(raw)) {
          candidateId = raw;
        } else {
          candidateTag = raw;
        }
      }

      // Check against authenticated user's farm animals (Strict Data Isolation)
      let matchedAnimal: Animal | undefined;
      if (candidateId) {
        matchedAnimal = farmAnimals.find((a) => a.id.toLowerCase() === candidateId!.toLowerCase());
      }
      if (!matchedAnimal && candidateTag) {
        matchedAnimal = farmAnimals.find(
          (a) => a.tag_id.toLowerCase() === candidateTag!.toLowerCase()
        );
      }

      if (matchedAnimal) {
        // SUCCESS: Animal belongs to current user's farm
        scanStateRef.current = 'success';
        setScanState('success');
        await stopScanner();
        onAnimalFound(matchedAnimal);
        return;
      }

      // Animal was not found in current farm — verify if it exists in another farm (Multi-Tenant security)
      try {
        let query = supabase.from('animals').select('id, user_id, tag_id');
        if (candidateId) {
          query = query.eq('id', candidateId);
        } else if (candidateTag) {
          query = query.ilike('tag_id', candidateTag);
        }

        const { data: foreignAnimal } = await query.maybeSingle();

        if (foreignAnimal && currentUserId && foreignAnimal.user_id !== currentUserId && !isSuperAdmin) {
          setErrorMessage('Hindi available ang hayop na ito sa iyong bukid.');
          return;
        }

        if (foreignAnimal) {
          // If super admin or matching animal not yet refreshed in local state
          const refreshedMatch = farmAnimals.find((a) => a.id === foreignAnimal.id);
          if (refreshedMatch) {
            scanStateRef.current = 'success';
            setScanState('success');
            await stopScanner();
            onAnimalFound(refreshedMatch);
            return;
          }
        }

        if (candidateId || (candidateTag && candidateTag.length >= 3)) {
          setErrorMessage('Hindi makita ang animal ID sa system.');
        } else {
          setErrorMessage('Hindi valid na ALPASFARM QR Code.');
        }
      } catch {
        setErrorMessage('Hindi makita ang animal ID sa system.');
      }
    },
    [farmAnimals, currentUserId, isSuperAdmin, onAnimalFound, stopScanner]
  );

  handleDecodedRef.current = handleDecoded;

  // ── Run periodic ML species identification on video frame ────────────────
  const runLiveMLCheck = useCallback(async () => {
    if (!open || scanStateRef.current !== 'scanning') return;
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const videoEl = container.querySelector('video') as HTMLVideoElement | null;
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return;

    try {
      const frameCanvas = captureVideoFrame(videoEl);

      // Run species identification (Goat / Sheep / Other)
      const speciesResult = await identifyLivestockSpecies(frameCanvas);
      if (isMountedRef.current) {
        setMlDetection(speciesResult);

        // If camera clearly sees a goat or sheep but no QR has been read:
        if (speciesResult.detected) {
          setAmbiguousNotice(true);
        } else {
          setAmbiguousNotice(false);
        }
      }

      // Run rule-based visual quality & symptom screening
      const ruleResult = runRuleBasedScreening(frameCanvas);

      if (isMountedRef.current) {
        if (ruleResult.hasConcern) {
          setVisualConcernNotice(
            'May posibleng health concern. Para sa mas maayos na pagsusuri, magsagawa ng manual health check.'
          );
        } else {
          setVisualConcernNotice(null);
        }
      }
    } catch {
      // Safe ignore ML frame evaluation errors
    }
  }, [open]);

  runLiveMLCheckRef.current = runLiveMLCheck;

  // ── Start Camera Scanner ──────────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    setErrorMessage(null);
    setPermissionError(false);
    scanStateRef.current = 'starting';
    setScanState('starting');
    setMlDetection(null);
    setVisualConcernNotice(null);
    setAmbiguousNotice(false);

    // Stop and clear previous instance if exists
    if (scannerRef.current) {
      try {
        const s = scannerRef.current;
        scannerRef.current = null;
        const st = s.getState();
        if (st === 2 || st === 3) await s.stop();
        s.clear();
      } catch {}
    }

    // Wait for modal DOM transition
    await new Promise((r) => setTimeout(r, 120));
    if (!isMountedRef.current) {
      isStartingRef.current = false;
      return;
    }

    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
      setErrorMessage('Hindi mai-load ang camera viewfinder.');
      scanStateRef.current = 'error';
      setScanState('error');
      isStartingRef.current = false;
      return;
    }

    container.innerHTML = '';
    container.style.width = '100%';
    container.style.minHeight = '280px';

    try {
      // Progressive camera configs: mobile ideal facingMode -> exact -> desktop fallback -> any video track
      const cameraConfigs = selectedCameraId
        ? [{ deviceId: { exact: selectedCameraId } }]
        : [
            { facingMode: { ideal: facingMode } },
            { facingMode: facingMode },
            { facingMode: { ideal: facingMode === 'environment' ? 'user' : 'environment' } },
            { facingMode: facingMode === 'environment' ? 'user' : 'environment' },
            {},
          ];

      let started = false;
      let lastError: any = null;

      for (const cameraConfig of cameraConfigs) {
        if (!isMountedRef.current) break;
        try {
          const scanner = new Html5Qrcode(CONTAINER_ID, {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            verbose: false,
          });
          scannerRef.current = scanner;

          // Per-candidate 4s timeout to prevent hanging on unsupported constraints
          await Promise.race([
            scanner.start(
              cameraConfig,
              {
                fps: 15,
                qrbox: { width: 250, height: 250 },
                disableFlip: false,
              },
              (decoded) => handleDecodedRef.current(decoded),
              () => {
                // scanning frame callback
              }
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Camera init timeout')), 4000)
            ),
          ]);

          started = true;
          break;
        } catch (err: any) {
          lastError = err;
          if (scannerRef.current) {
            try {
              scannerRef.current.clear();
            } catch {}
            scannerRef.current = null;
          }
          if (container) container.innerHTML = '';
        }
      }

      if (!started) {
        throw lastError || new Error('Hindi mabuksan ang camera.');
      }

      if (isMountedRef.current) {
        scanStateRef.current = 'scanning';
        setScanState('scanning');

        // Asynchronously discover available cameras without blocking initial video render
        try {
          Html5Qrcode.getCameras()
            .then((devices) => {
              if (isMountedRef.current && devices && devices.length > 0) {
                setCameras(devices);
              }
            })
            .catch(() => {});
        } catch {}

        // Start live ML frame checks every 1.5 seconds
        if (mlIntervalRef.current) clearInterval(mlIntervalRef.current);
        mlIntervalRef.current = setInterval(() => {
          runLiveMLCheckRef.current();
        }, 1500);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err || '');
      const lower = msg.toLowerCase();

      if (lower.includes('permission') || lower.includes('notallowed') || err?.name === 'NotAllowedError') {
        setPermissionError(true);
        setErrorMessage('Naka-block ang camera access sa browser. Pindutin ang camera o lock icon sa address bar para i-allow, o piliin na lang ang hayop sa listahan.');
      } else if (lower.includes('notfound') || lower.includes('device')) {
        setErrorMessage('Walang nakitang camera sa device na ito. Pwede mong piliin ang hayop sa listahan.');
      } else if (
        lower.includes('notreadable') ||
        lower.includes('already in use') ||
        lower.includes('could not start')
      ) {
        setErrorMessage('Ginagamit pa ng ibang application o tab ang camera. Pwede mong piliin ang hayop sa listahan.');
      } else if (lower.includes('timeout')) {
        setErrorMessage('Masyadong matagal magbukas ang camera sa browser. Pwede mong piliin ang hayop sa listahan o subukan ulit.');
      } else {
        setErrorMessage('Hindi mabuksan ang camera sa device na ito. Pwede mong piliin ang hayop sa listahan.');
      }
      scanStateRef.current = 'error';
      setScanState('error');
      scannerRef.current = null;
    } finally {
      isStartingRef.current = false;
    }
  }, [facingMode, selectedCameraId]);

  // Switch facing mode (environment <-> user)
  const toggleFacingMode = async () => {
    await stopScanner();
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setSelectedCameraId(null);
  };

  // Mount/Unmount lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    if (open) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [open, startScanner, stopScanner]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-scan-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#0F172A',
          color: '#F8FAFC',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#1E293B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(22, 163, 74, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4ADE80',
              }}
            >
              <Camera size={20} />
            </div>
            <div>
              <h3
                id="camera-scan-title"
                style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#F8FAFC' }}
              >
                Mag-scan ng Hayop
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
                I-scan ang QR Code o Animal ID ng kambing o tupa para awtomatikong makuha ang impormasyon nito.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body / Camera Viewport */}
        <div
          style={{
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* Viewfinder Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              maxWidth: 360,
              background: '#020617',
              borderRadius: 16,
              overflow: 'hidden',
              border: '2px solid rgba(34, 197, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* HTML5 Qrcode Target Box */}
            <div
              id={CONTAINER_ID}
              style={{
                width: '100%',
                height: '100%',
              }}
            />

            {/* Scanning Corner Frame Overlay */}
            {scanState === 'scanning' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: 220,
                    height: 220,
                    border: '2px dashed rgba(74, 222, 128, 0.8)',
                    borderRadius: 16,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      width: 20,
                      height: 20,
                      borderTop: '3px solid #22C55E',
                      borderLeft: '3px solid #22C55E',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 20,
                      height: 20,
                      borderTop: '3px solid #22C55E',
                      borderRight: '3px solid #22C55E',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      width: 20,
                      height: 20,
                      borderBottom: '3px solid #22C55E',
                      borderLeft: '3px solid #22C55E',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      right: 4,
                      width: 20,
                      height: 20,
                      borderBottom: '3px solid #22C55E',
                      borderRight: '3px solid #22C55E',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Starting Spinner */}
            {scanState === 'starting' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#020617',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  color: '#94A3B8',
                  fontSize: 13,
                  padding: 20,
                  textAlign: 'center',
                  zIndex: 5,
                }}
              >
                <ScanLine size={32} color="#22C55E" style={{ animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                <span>Binubuksan ang camera...</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onManualSelectRequest();
                  }}
                  style={{
                    marginTop: 6,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#E2E8F0',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '7px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>Matagal magbukas? Pumili sa listahan</span>
                </button>
              </div>
            )}

            {/* Error Viewport Overlay */}
            {scanState === 'error' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#020617',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  textAlign: 'center',
                  gap: 12,
                  zIndex: 6,
                }}
              >
                <AlertCircle size={36} color="#EF4444" />
                <p style={{ margin: 0, fontSize: 13, color: '#FCA5A5', lineHeight: 1.4, maxWidth: 280 }}>
                  {errorMessage || 'Hindi ma-access ang camera sa device na ito.'}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startScanner}
                    style={{ color: '#F8FAFC', borderColor: 'rgba(255,255,255,0.2)' }}
                  >
                    Subukan Ulit
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onManualSelectRequest();
                    }}
                    style={{ background: '#16A34A', color: '#FFFFFF' }}
                  >
                    Pumili sa Listahan
                  </Button>
                </div>
              </div>
            )}

            {/* Camera switch toggle button */}
            {scanState === 'scanning' && cameras.length > 1 && (
              <button
                type="button"
                onClick={toggleFacingMode}
                title="Palitan ang camera"
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 10,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              >
                <SwitchCamera size={14} />
                <span>Palitan</span>
              </button>
            )}
          </div>

          {/* Bottom Guidance */}
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>
              Hanapin ang QR Code o Animal ID
            </span>
          </div>

          {/* Real-time ML Species Status */}
          {mlDetection && scanState === 'scanning' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 10,
                background: mlDetection.detected
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
                border: mlDetection.detected
                  ? '1px solid rgba(34, 197, 94, 0.3)'
                  : '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 12,
                color: mlDetection.detected ? '#4ADE80' : '#FCA5A5',
                fontWeight: 700,
              }}
            >
              <PawPrint size={14} />
              <span>{mlDetection.label}</span>
            </div>
          )}

          {/* Ambiguous Visual Notice: Goat/Sheep seen, but no QR tag */}
          {ambiguousNotice && scanState === 'scanning' && (
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(217, 119, 6, 0.12)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FCD34D', fontSize: 12 }}>
                <HelpCircle size={16} style={{ flexShrink: 0 }} />
                <span>Kambing o tupa ang nakita, pero hindi matukoy kung aling registered animal.</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onManualSelectRequest();
                }}
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 12,
                  background: '#D97706',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  borderRadius: 8,
                }}
              >
                Pumili ng Hayop
              </Button>
            </div>
          )}

          {/* Rule-based screening guidance */}
          {visualConcernNotice && scanState === 'scanning' && (
            <div
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#FBBF24',
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              <Activity size={14} style={{ flexShrink: 0 }} />
              <span>{visualConcernNotice}</span>
            </div>
          )}

          {/* Dynamic Error Banner (e.g. invalid QR, animal belongs to another farm) */}
          {errorMessage && scanState === 'scanning' && (
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#FCA5A5',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, color: '#EF4444' }} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#1E293B',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose();
              onManualSelectRequest();
            }}
            style={{ color: '#CBD5E1', borderColor: 'rgba(255, 255, 255, 0.15)' }}
          >
            Pumili Manually
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
            style={{ background: '#334155', color: '#FFFFFF', fontWeight: 700 }}
          >
            Isara
          </Button>
        </div>
      </div>
    </div>
  );
}
