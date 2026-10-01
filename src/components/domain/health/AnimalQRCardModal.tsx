import React, { useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Printer,
  Download,
  QrCode,
  ShieldCheck,
  Tag,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import type { Animal } from '../../../types';

interface AnimalQRCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  animal: Animal | null;
}

export function AnimalQRCardModal({
  isOpen,
  onClose,
  animal,
}: AnimalQRCardModalProps) {
  const toast = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The official QR code encodes the verified animal profile URL
  const qrUrl = animal ? `${window.location.origin}/animals/${animal.id}` : '';
  const publicQrUrl = animal ? `${window.location.origin}/public/${animal.id}` : '';

  useEffect(() => {
    if (canvasRef.current && animal && qrUrl) {
      QRCode.toCanvas(canvasRef.current, qrUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      });
    }
  }, [qrUrl, animal, isOpen]);

  if (!isOpen || !animal) return null;

  const downloadQR = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast('Hindi ma-download ang QR code.', 'error');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `AlpasFarm_QR_${animal.tag_id}_${animal.name.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Na-download ang opisyal na QR Code PNG!', 'success');
  };

  const printPassportCard = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast('Hindi mai-print ang QR code.', 'error');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`<!DOCTYPE html><html><head>
      <title>QR Tag Card — ${animal.name} (${animal.tag_id})</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .passport-card {
          width: 340px;
          border: 2px solid #238B45;
          border-radius: 20px;
          padding: 28px 24px;
          text-align: center;
          background: #ffffff;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .brand {
          font-size: 20px;
          font-weight: 900;
          color: #238B45;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }
        .subbrand {
          font-size: 11px;
          text-transform: uppercase;
          color: #6b7280;
          font-weight: 700;
          letter-spacing: 1px;
          margin-bottom: 16px;
        }
        .qr-wrapper {
          display: inline-block;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 12px;
          border-radius: 14px;
          margin-bottom: 14px;
        }
        .tag-pill {
          display: inline-block;
          background: #111827;
          color: #ffffff;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 1px;
          padding: 4px 14px;
          border-radius: 999px;
          margin-bottom: 8px;
        }
        .name {
          font-size: 20px;
          font-weight: 800;
          color: #111827;
          margin-bottom: 4px;
        }
        .meta {
          font-size: 13px;
          color: #4b5563;
          margin-bottom: 16px;
        }
        .notice {
          font-size: 10px;
          color: #9ca3af;
          border-top: 1px solid #e5e7eb;
          padding-top: 10px;
          line-height: 1.4;
        }
        @media print {
          body { padding: 0; }
          .passport-card { border-color: #000; box-shadow: none; }
        }
      </style>
    </head><body>
      <div class="passport-card">
        <div class="brand">AlpasFarm</div>
        <div class="subbrand">AI-Assisted Goat & Sheep Management</div>
        <div class="qr-wrapper">
          <img src="${dataUrl}" style="width:200px;height:200px;display:block;" />
        </div>
        <div>
          <span class="tag-pill">${animal.tag_id}</span>
        </div>
        <div class="name">${animal.name}</div>
        <div class="meta">
          ${animal.species === 'Goat' ? 'Kambing' : 'Tupa'} · ${animal.breed || 'Standard'} · ${animal.sex === 'Female' ? 'Babae' : 'Lalaki'}
        </div>
        <div class="notice">
          I-scan ang QR code na ito upang buksan ang opisyal na rekord ng kalusugan sa AlpasFarm system.
        </div>
      </div>
    </body></html>`);

    win.document.close();
    setTimeout(() => {
      win.print();
    }, 350);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--surface, #ffffff)',
          borderRadius: '20px',
          border: '1px solid var(--border, #e5e7eb)',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                backgroundColor: 'rgba(35, 139, 69, 0.12)',
                color: '#238B45',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCode size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text, #111827)' }}>
                Animal QR Identification
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
                {animal.tag_id} — {animal.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary, #9ca3af)',
              padding: 6,
              borderRadius: '8px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content & QR Card Preview */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            ref={printRef}
            style={{
              background: 'var(--surface, #ffffff)',
              border: '2px dashed var(--border, #d1d5db)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '320px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: '#238B45', letterSpacing: 1, marginBottom: 2 }}>
              ALPASFARM ID
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
              Tag ID: <strong>{animal.tag_id}</strong>
            </div>

            {/* Rendered Canvas for downloading/printing */}
            <div
              style={{
                background: '#ffffff',
                padding: '12px',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                marginBottom: 14,
              }}
            >
              <canvas
                id="animal-qr-canvas"
                ref={canvasRef}
                style={{ width: 200, height: 200, display: 'block', borderRadius: 8 }}
              />
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text, #111827)', marginBottom: 2 }}>
              {animal.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary, #4b5563)', marginBottom: 12 }}>
              {animal.species === 'Goat' ? 'Kambing' : 'Tupa'} · {animal.breed || 'Standard'} · {animal.sex === 'Female' ? 'Babae' : 'Lalaki'}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#238B45', background: 'rgba(35, 139, 69, 0.08)', padding: '4px 10px', borderRadius: 999 }}>
              <ShieldCheck size={13} />
              <span>Opisyal na Tag ng Alaga</span>
            </div>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary, #6b7280)', maxWidth: 320 }}>
            Ang QR code na ito ay maaaring ilakip sa ear tag o kulungan. Kapag na-scan ng camera, direktang bubuksan ang talaan ng kalusugan ng alaga.
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border, #e5e7eb)',
            backgroundColor: 'var(--surface-muted, #f9fafb)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={downloadQR}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={15} /> I-download ang PNG
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={printPassportCard}
            style={{
              backgroundColor: '#238B45',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Printer size={15} /> I-print ang Tag Card
          </Button>
        </div>
      </div>
    </div>
  );
}
