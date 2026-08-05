import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { useToast } from '../lib/toast';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { QrCode, ScanLine, Camera, CameraOff, Keyboard, PawPrint, AlertCircle, CheckCircle } from 'lucide-react';

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

    // Match URL pattern: /animals/:uuid or /public/:uuid
    const urlMatch = decoded.match(/\/(?:animals|public)\/([a-f0-9\-]{36})/i);
    const animalId = urlMatch ? urlMatch[1] : null;

    if (animalId) {
      const animal = farmData.animals.find((a) => a.id === animalId);
      if (animal) {
        setLastResult(animal.name);
        toast(`Found: ${animal.name} (${animal.tag_id})`, 'success');
        setTimeout(() => navigate(`/animals/${animalId}`), 600);
        return;
      }
    }

    // Try raw tag_id match
    const byTag = farmData.animals.find(
      (a) => a.tag_id.toLowerCase() === decoded.trim().toLowerCase(),
    );
    if (byTag) {
      setLastResult(byTag.name);
      toast(`Found: ${byTag.name} (${byTag.tag_id})`, 'success');
      setTimeout(() => navigate(`/animals/${byTag.id}`), 600);
      return;
    }

    if (isMounted.current) {
      setErrorMsg(`QR scanned but no matching animal found.\nDecoded: "${decoded.slice(0, 60)}"`);
      setScanState('error');
    }
  }, [farmData.animals, navigate, stopScanner, toast]);

  // ── Start scanner ────────────────────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    setErrorMsg('');
    setLastResult(null);
    setScanState('starting');

    // Small delay so the container div is guaranteed in DOM
    await new Promise((r) => setTimeout(r, 120));

    if (!isMounted.current) return;

    try {
      const scanner = new Html5Qrcode(CONTAINER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        (decoded) => handleDecoded(decoded),
        () => { /* ignore scan errors (not-found frames) */ },
      );

      if (isMounted.current) setScanState('scanning');
    } catch (err) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
        setErrorMsg('Camera permission denied. Please allow camera access in your browser settings, then try again.');
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('device')) {
        setErrorMsg('No camera found on this device. Use Manual Entry instead.');
      } else {
        setErrorMsg(`Could not start camera: ${msg}`);
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
      toast(`Found: ${animal.name} (${animal.tag_id})`, 'success');
      navigate(`/animals/${animal.id}`);
    } else {
      toast('No animal found with that tag ID or name.', 'error');
    }
  };

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  return (
    <div>
      <div className="card section-gap" style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: '#D1FAE5',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <ScanLine size={32} color="#059669" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>QR Code Scanner</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Scan an animal's QR tag to instantly open its profile.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--bg)', borderRadius: 10, padding: 4 }}>
          <button
            className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => switchMode('camera')}
          >
            <Camera size={15} /> Camera
          </button>
          <button
            className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => switchMode('manual')}
          >
            <Keyboard size={15} /> Manual Entry
          </button>
        </div>

        {/* ── CAMERA MODE ── */}
        {mode === 'camera' && (
          <div>
            {/* Success flash */}
            {lastResult && (
              <div style={{
                background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 10,
                padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <CheckCircle size={20} color="#059669" />
                <span style={{ fontWeight: 700, color: '#065F46' }}>Found: {lastResult} — navigating…</span>
              </div>
            )}

            {/* Error state */}
            {scanState === 'error' && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10,
                padding: '14px 16px', marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <AlertCircle size={20} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>Scanner Error</p>
                    <p style={{ fontSize: 12, color: '#7F1D1D', whiteSpace: 'pre-line' }}>{errorMsg}</p>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={startScanner}>
                  <Camera size={14} /> Try Again
                </button>
              </div>
            )}

            {/* Idle state — show start button */}
            {scanState === 'idle' && !lastResult && (
              <div style={{
                border: '2px dashed var(--border)', borderRadius: 14, padding: '36px 20px',
                textAlign: 'center', background: 'var(--bg)', marginBottom: 12,
              }}>
                <QrCode size={52} color="var(--text-secondary)" style={{ margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
                  Press Start and point your camera at the animal's QR code tag.
                </p>
                <button className="btn btn-primary" onClick={startScanner}>
                  <Camera size={16} /> Start Camera
                </button>
              </div>
            )}

            {/* Starting state */}
            {scanState === 'starting' && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                Starting camera…
              </div>
            )}

            {/* Scanner container — always in DOM, html5-qrcode needs it to exist */}
            <div
              id={CONTAINER_ID}
              style={{
                borderRadius: 14,
                border: scanState === 'scanning' ? '3px solid #059669' : 'none',
                display: scanState === 'scanning' ? 'block' : 'none',
                background: '#000',
                width: '100%',
                minHeight: 300,
                position: 'relative',
              }}
            />

            {/* Scanning controls */}
            {scanState === 'scanning' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Scanning… point camera at a QR code.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={stopScanner}>
                  <CameraOff size={14} /> Stop Camera
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── MANUAL MODE ── */}
        {mode === 'manual' && (
          <div>
            <div className="form-group">
              <label className="form-label">Tag ID or Animal Name</label>
              <input
                className="form-input"
                placeholder="e.g. GOAT-001 or Bella"
                value={manualTag}
                onChange={(e) => setManualTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                autoFocus
              />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                Enter the tag ID printed on the ear tag or QR label. Press Enter or tap Find.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleManualSearch}
              disabled={!manualTag.trim()}
            >
              <PawPrint size={16} /> Find Animal
            </button>
          </div>
        )}
      </div>

      {/* Quick access list */}
      <div className="card section-gap" style={{ maxWidth: 540, margin: '16px auto 0' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          All Animals — Quick Access
        </div>
        {activeAnimals.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No animals registered yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activeAnimals.map((a) => (
              <button
                key={a.id}
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/animals/${a.id}`)}
              >
                <PawPrint size={13} /> {a.name}
                <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>({a.tag_id})</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
