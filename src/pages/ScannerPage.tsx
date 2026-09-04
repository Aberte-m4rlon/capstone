import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { useToast } from '../components/ui/Toast';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { QrCode, ScanLine, Camera, CameraOff, Keyboard, PawPrint, AlertCircle, CheckCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, FormField } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

const CONTAINER_ID = 'qr-scanner-container';

type ScanState = 'idle' | 'starting' | 'scanning' | 'error';

export function ScannerPage() {
  const navigate = useNavigate();
  const farmData = useFarmData();
  const toast = useToast();

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [manualTag, setManualTag] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isMounted = useRef(true);

  // ── Stop scanner helper ──────────────────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState();
      // state 2 = SCANNING, state 3 = PAUSED
      if (state === 2 || state === 3) {
        await scannerRef.current.stop();
      }
      scannerRef.current.clear();
    } catch {
      // ignore stop errors
    }
    scannerRef.current = null;
    if (isMounted.current) setScanState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  // ── Handle a decoded QR result ───────────────────────────────────────────────
  const handleDecoded = useCallback((decoded: string) => {
    stopScanner();
    setLastResult('Nahanap!');

    // Match URL pattern: /animals/:uuid or /public/:uuid
    const urlMatch = decoded.match(/\/(?:animals|public)\/([a-f0-9\-]{36})/i);
    const animalId = urlMatch ? urlMatch[1] : null;

    if (animalId) {
      // Check if we have this animal in local data
      const animal = farmData.animals.find((a) => a.id === animalId);
      if (animal) {
        setLastResult(animal.name);
        toast(`Nahanap: ${animal.name} (${animal.tag_id})`, 'success');
        setTimeout(() => navigate(`/animals/${animalId}`), 600);
        return;
      }
      // Animal not in local data — navigate anyway (they may be logged in as different user)
      setLastResult('Nahanap ang hayop');
      toast('Na-scan ang QR code — binubuksan ang profile…', 'success');
      setTimeout(() => navigate(`/animals/${animalId}`), 600);
      return;
    }

    // If it's a full URL from this app, extract the path and navigate
    try {
      const parsed = new URL(decoded);
      const path = parsed.pathname;
      const pathMatch = path.match(/\/(?:animals|public)\/([a-f0-9\-]{36})/i);
      if (pathMatch) {
        const id = pathMatch[1];
        const animal = farmData.animals.find((a) => a.id === id);
        setLastResult(animal ? animal.name : 'Nahanap ang hayop');
        toast(animal ? `Nahanap: ${animal.name}` : 'Na-scan ang QR code!', 'success');
        setTimeout(() => navigate(`/animals/${id}`), 600);
        return;
      }
    } catch {
      // Not a valid URL — try tag_id match
    }

    // Try raw tag_id match
    const byTag = farmData.animals.find(
      (a) => a.tag_id.toLowerCase() === decoded.trim().toLowerCase(),
    );
    if (byTag) {
      setLastResult(byTag.name);
      toast(`Nahanap: ${byTag.name} (${byTag.tag_id})`, 'success');
      setTimeout(() => navigate(`/animals/${byTag.id}`), 600);
      return;
    }

    if (isMounted.current) {
      setLastResult(null);
      setErrorMsg(`Na-scan ang QR ngunit walang tumutugmang hayop sa bukid.\nNa-scan na detalye: "${decoded.slice(0, 80)}"\n\nSiguraduhing sa AlpasFarm galing ang QR code na ito.`);
      setScanState('error');
    }
  }, [farmData.animals, navigate, stopScanner, toast]);

  // ── Start scanner ────────────────────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    setErrorMsg('');
    setLastResult(null);
    setScanState('starting');

    const container = document.getElementById(CONTAINER_ID);
    if (container) {
      container.style.display = 'block';
      container.style.width = '100%';
      container.style.minHeight = '320px';
      container.style.height = '320px';
      container.style.maxWidth = '100%';
    }

    await new Promise((r) => setTimeout(r, 120));

    if (!isMounted.current) return;

    try {
      const scanner = new Html5Qrcode(CONTAINER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      const cameraConfigs = [
        { facingMode: 'environment' },
        { facingMode: { ideal: 'environment' } },
        { facingMode: 'user' },
        { facingMode: { ideal: 'user' } },
      ] as const;

      let lastError: unknown;
      for (const cameraConfig of cameraConfigs) {
        try {
          await scanner.start(
            cameraConfig,
            {
              fps: 15,
              qrbox: { width: 260, height: 260 },
              aspectRatio: 1.0,
              disableFlip: false,
            },
            (decoded) => handleDecoded(decoded),
            () => { /* ignore scan errors (not-found frames) */ },
          );
          if (isMounted.current) setScanState('scanning');
          return;
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError ?? new Error('Hindi mabuksan ang camera sa device na ito.');
    } catch (err) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();

      if (lower.includes('permission') || lower.includes('notallowed')) {
        setErrorMsg('Hindi pinahintulutan ang kamera. Pakibigyan ng camera access sa browser settings at subukang muli.');
      } else if (lower.includes('notreadable') || lower.includes('already in use') || lower.includes('device in use') || lower.includes('could not start video source')) {
        setErrorMsg('Ginagamit pa ng ibang application o tab ang camera. Isara muna ang ibang app at subukan muli.');
      } else if (lower.includes('notfound') || lower.includes('device')) {
        setErrorMsg('Walang nakitang camera sa device na ito. Gamitin ang Manwal na Paghahanap.');
      } else {
        setErrorMsg(`Hindi mabuksan ang camera: ${msg}`);
      }
      setScanState('error');
      scannerRef.current = null;
    }
  }, [handleDecoded]);

  // ── Switch modes ─────────────────────────────────────────────────────────────
  const switchMode = (m: 'camera' | 'manual') => {
    stopScanner();
    setScanState('idle');
    setErrorMsg('');
    setLastResult(null);
    setMode(m);
  };

  // ── Manual search ─────────────────────────────────────────────────────────────
  const handleManualSearch = () => {
    const tag = manualTag.trim().toLowerCase();
    if (!tag) return;
    const animal = farmData.animals.find(
      (a) => a.tag_id.toLowerCase() === tag || a.name.toLowerCase() === tag,
    );
    if (animal) {
      toast(`Nahanap: ${animal.name} (${animal.tag_id})`, 'success');
      navigate(`/animals/${animal.id}`);
    } else {
      toast('Walang alagang hayop na nahanap sa tag ID o pangalang iyon.', 'danger');
    }
  };

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  return (
    <div>
      <Card variant="glass" padding="lg" style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: 'rgba(5, 150, 105, 0.12)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <ScanLine size={32} color="#059669" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>QR Code Scanner ng mga Hayop</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>
            I-scan ang QR tag ng alaga upang agad mabuksan ang profile nito.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--color-surface-elevated, rgba(0,0,0,0.06))', borderRadius: 10, padding: 4 }}>
          <Button
            variant={mode === 'camera' ? 'primary' : 'ghost'}
            size="sm"
            style={{ flex: 1 }}
            onClick={() => switchMode('camera')}
            leftIcon={<Camera size={15} />}
          >
            Kamera (Camera)
          </Button>
          <Button
            variant={mode === 'manual' ? 'primary' : 'ghost'}
            size="sm"
            style={{ flex: 1 }}
            onClick={() => switchMode('manual')}
            leftIcon={<Keyboard size={15} />}
          >
            I-type ang Tag (Manual)
          </Button>
        </div>

        {/* ── CAMERA MODE ── */}
        {mode === 'camera' && (
          <div>
            {/* Success flash */}
            {lastResult && (
              <div style={{
                background: 'rgba(5, 150, 105, 0.12)', border: '1px solid rgba(5, 150, 105, 0.3)', borderRadius: 10,
                padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <CheckCircle size={20} color="#059669" />
                <span style={{ fontWeight: 700, color: '#059669' }}>Nahanap: {lastResult} — binubuksan…</span>
              </div>
            )}

            {/* Error state */}
            {scanState === 'error' && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10,
                padding: '14px 16px', marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <AlertCircle size={20} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>Problema sa Scanner</p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', whiteSpace: 'pre-line' }}>{errorMsg}</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" style={{ marginTop: 12 }} onClick={startScanner} leftIcon={<Camera size={14} />}>
                  Subukan Muli
                </Button>
              </div>
            )}

            {/* Idle state — show start button */}
            {scanState === 'idle' && !lastResult && (
              <div style={{
                border: '2px dashed var(--border-light, rgba(255,255,255,0.15))', borderRadius: 14, padding: '36px 20px',
                textAlign: 'center', background: 'var(--color-surface-elevated, rgba(0,0,0,0.03))', marginBottom: 12,
              }}>
                <QrCode size={52} color="var(--color-text-secondary, #475569)" style={{ margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)', marginBottom: 18 }}>
                  Pindutin ang Buksan ang Camera at itutok sa QR code tag ng alagang hayop.
                </p>
                <Button variant="primary" onClick={startScanner} leftIcon={<Camera size={16} />}>
                  Buksan ang Camera
                </Button>
              </div>
            )}

            {/* Starting state */}
            {scanState === 'starting' && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-secondary, #475569)', fontSize: 13 }}>
                <LoadingSpinner text="Binubuksan ang camera…" />
              </div>
            )}

            {/* Scanner container — always in DOM, html5-qrcode needs it to exist */}
            <div
              id={CONTAINER_ID}
              style={{
                borderRadius: 14,
                border: scanState === 'scanning' ? '3px solid #FF7A18' : 'none',
                boxShadow: scanState === 'scanning' ? '0 0 25px rgba(255, 122, 24, 0.35)' : 'none',
                display: scanState === 'starting' || scanState === 'scanning' ? 'block' : 'none',
                background: '#000',
                width: '100%',
                minHeight: 300,
                position: 'relative',
              }}
            />

            {/* Scanning controls */}
            {scanState === 'scanning' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 10 }}>
                  Nagsusuri... itutok ang camera sa QR code ng hayop.
                </p>
                <Button variant="secondary" size="sm" onClick={stopScanner} leftIcon={<CameraOff size={14} />}>
                  Isara ang Camera
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── MANUAL MODE ── */}
        {mode === 'manual' && (
          <div>
            <FormField label="Tag ID o Pangalan ng Hayop" hint="I-type ang tag ID sa ear tag o pangalan ng alaga. Pindutin ang Hanapin o i-Enter.">
              <Input
                placeholder="Hal. GOAT-001 o Bella"
                value={manualTag}
                onChange={(e) => setManualTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                autoFocus
              />
            </FormField>
            <Button
              variant="primary"
              onClick={handleManualSearch}
              disabled={!manualTag.trim()}
              leftIcon={<PawPrint size={16} />}
              style={{ marginTop: 12 }}
            >
              Hanapin ang Hayop
            </Button>
          </div>
        )}
      </Card>

      {/* Quick access list */}
      <Card variant="glass" padding="md" style={{ maxWidth: 540, margin: '16px auto 0' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Mabilisang Pagpili ng Hayop (Quick Access)
        </div>
        {activeAnimals.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Wala pang nakarehistrong hayop.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activeAnimals.map((a) => (
              <Button
                key={a.id}
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/animals/${a.id}`)}
                leftIcon={<PawPrint size={13} />}
              >
                {a.name}
                <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>({a.tag_id})</span>
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
