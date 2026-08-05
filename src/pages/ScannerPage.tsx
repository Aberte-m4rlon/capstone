import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { useToast } from '../lib/toast';
import { QrCode, ScanLine, Camera, CameraOff, Keyboard, PawPrint, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export function ScannerPage() {
  const navigate = useNavigate();
  const farmData = useFarmData();
  const toast = useToast();

  const [scanning, setScanning] = useState(false);
  const [manualTag, setManualTag] = useState('');
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader';

  const startScan = async () => {
    setError(null);
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {},
      );
      setScanning(true);
    } catch {
      setError('Unable to access camera. Check permissions or use manual entry.');
      setScanning(false);
    }
  };

  const stopScan = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleScan = (decoded: string) => {
    stopScan();

    // The QR contains a URL like https://domain/animals/:id or https://domain/public/:id
    const match = decoded.match(/\/(?:animals|public)\/([a-f0-9-]+)/i);
    if (match) {
      const animalId = match[1];
      const animal = farmData.animals.find((a) => a.id === animalId);
      if (animal && !animal.archived) {
        toast(`Found: ${animal.name} (${animal.tag_id})`, 'success');
        navigate(`/animals/${animalId}`);
        return;
      }
    }

    // Try matching by tag_id if the QR contained just a tag
    const byTag = farmData.animals.find((a) => a.tag_id.toLowerCase() === decoded.toLowerCase().trim());
    if (byTag) {
      toast(`Found: ${byTag.name} (${byTag.tag_id})`, 'success');
      navigate(`/animals/${byTag.id}`);
      return;
    }

    toast('No matching animal found for this QR code.', 'error');
  };

  const handleManualSearch = () => {
    if (!manualTag.trim()) return;
    const tag = manualTag.trim().toLowerCase();
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

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
      }
    };
  }, []);

  return (
    <div>
      <div className="card section-gap" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: '#D1FAE5',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <ScanLine size={32} color="#059669" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>QR Scanner</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Scan an animal's QR code with your camera to instantly open its profile.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--bg)', borderRadius: 10, padding: 4 }}>
          <button
            className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => { stopScan(); setMode('camera'); }}
          >
            <Camera size={16} /> Camera
          </button>
          <button
            className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => { stopScan(); setMode('manual'); }}
          >
            <Keyboard size={16} /> Manual Entry
          </button>
        </div>

        {/* Camera mode */}
        {mode === 'camera' && (
          <div>
            {!scanning && !error && (
              <div style={{
                border: '2px dashed var(--border)', borderRadius: 14, padding: 40,
                textAlign: 'center', background: 'var(--bg)',
              }}>
                <QrCode size={48} color="var(--text-secondary)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Press start and point your camera at the QR code on the animal's tag.
                </p>
                <button className="btn btn-primary" onClick={startScan}>
                  <Camera size={16} /> Start Camera
                </button>
              </div>
            )}

            {error && (
              <div style={{
                border: '1px solid #FCA5A5', borderRadius: 14, padding: 20,
                textAlign: 'center', background: '#FEF2F2', marginBottom: 12,
              }}>
                <AlertCircle size={32} color="#EF4444" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, color: '#991B1B', marginBottom: 12 }}>{error}</p>
                <button className="btn btn-primary btn-sm" onClick={startScan}>Try Again</button>
              </div>
            )}

            <div id={containerId} style={{
              borderRadius: 14, overflow: 'hidden', display: scanning ? 'block' : 'none',
              border: '2px solid var(--primary)',
            }} />

            {scanning && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Point at a QR code... scanning automatically.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={stopScan}>
                  <CameraOff size={15} /> Stop Camera
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manual mode */}
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
              />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                Enter the tag ID printed on the animal's ear tag or QR label.
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleManualSearch} disabled={!manualTag.trim()}>
              <PawPrint size={16} /> Find Animal
            </button>
          </div>
        )}
      </div>

      {/* Quick animal list for reference */}
      <div className="card section-gap" style={{ maxWidth: 560, margin: '16px auto 0' }}>
        <div className="card-title" style={{ marginBottom: 12, fontSize: 14 }}>All Animals — Quick Access</div>
        {farmData.animals.filter((a) => !a.archived).length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No animals registered yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {farmData.animals.filter((a) => !a.archived).map((a) => (
              <button
                key={a.id}
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/animals/${a.id}`)}
              >
                {a.name} ({a.tag_id})
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
