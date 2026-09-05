/**
 * ScreeningHistoryPanel.tsx
 * Shows camera screening history for a specific animal or all animals.
 */
import { useState } from 'react';
import { Camera, AlertTriangle, CheckCircle, XCircle, Trash2, Eye, Loader2 } from 'lucide-react';
import { useAnimalScreenings, deleteScreening, getScreeningImageUrl, type CameraScreening } from '../lib/useCameraScreenings';
import { useToast } from '../lib/toast';
import { formatDate } from '../lib/analytics';

interface Props {
  animalId: string;
  animalName: string;
}

export function ScreeningHistoryPanel({ animalId, animalName }: Props) {
  const { screenings, loading, refresh } = useAnimalScreenings(animalId);
  const toast = useToast();
  const [viewingImage, setViewingImage] = useState<{ url: string; label: string } | null>(null);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleViewImage = async (screening: CameraScreening) => {
    if (!screening.image_path) return;
    setLoadingImageId(screening.id);
    try {
      const url = await getScreeningImageUrl(screening.image_path);
      if (url) {
        setViewingImage({ url, label: `${animalName} · ${formatDate(screening.created_at)}` });
      } else {
        toast('Could not load image.', 'error');
      }
    } finally {
      setLoadingImageId(null);
    }
  };

  const handleDelete = async (screening: CameraScreening) => {
    if (!confirm('Delete this screening record?')) return;
    setDeletingId(screening.id);
    const { error } = await deleteScreening(screening.id, screening.image_path);
    setDeletingId(null);
    if (error) {
      toast('Could not delete screening. Please try again.', 'error');
    } else {
      toast('Screening deleted.', 'success');
      refresh();
    }
  };

  const predIcon = (p: string) => {
    if (p === 'possible_health_concern') return <AlertTriangle size={14} color="#EF4444" />;
    if (p === 'normal_appearance') return <CheckCircle size={14} color="#16A34A" />;
    return <XCircle size={14} color="#F59E0B" />;
  };

  const predLabel = (p: string) => {
    if (p === 'possible_health_concern') return 'Posibleng May Karamdaman';
    if (p === 'normal_appearance') return 'Maayos ang Hitsura';
    return 'Mababang Kalidad';
  };

  const predColor = (p: string) => {
    if (p === 'possible_health_concern') return '#EF4444';
    if (p === 'normal_appearance') return '#16A34A';
    return '#F59E0B';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, padding: '16px 0' }}>
        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading screenings…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg,rgba(255,106,42,0.2),rgba(255,59,48,0.12))',
          border: '1px solid rgba(255,106,42,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Camera size={14} color="var(--accent-orange)" />
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
          Camera Screening History
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700,
          padding: '2px 8px', borderRadius: 999,
          background: 'rgba(255,122,24,0.12)', color: 'var(--accent-orange)',
          border: '1px solid rgba(255,122,24,0.25)',
        }}>
          {screenings.length}
        </span>
      </div>

      {screenings.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '24px 12px',
          color: 'var(--text-secondary)', fontSize: 13,
          background: 'var(--surface)', borderRadius: 10,
          border: '1px solid var(--border)',
        }}>
          <Camera size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>No camera screenings yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Run a screening from the Overview tab.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {screenings.map((s) => (
            <div
              key={s.id}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${s.prediction === 'possible_health_concern' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              {/* Icon */}
              <div style={{ flexShrink: 0 }}>{predIcon(s.prediction)}</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: predColor(s.prediction) }}>
                    {predLabel(s.prediction)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {formatDate(s.created_at)}
                </div>
                {s.notes && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                    {s.notes}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {s.image_path && (
                  <button
                    onClick={() => handleViewImage(s)}
                    disabled={loadingImageId === s.id}
                    style={{
                      width: 30, height: 30, borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--glass-surface)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-secondary)',
                    }}
                    title="View image"
                  >
                    {loadingImageId === s.id
                      ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Eye size={13} />}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.id}
                  style={{
                    width: 30, height: 30, borderRadius: 7,
                    border: '1px solid rgba(239,68,68,0.2)',
                    background: 'rgba(239,68,68,0.06)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#EF4444',
                  }}
                  title="Delete screening"
                >
                  {deletingId === s.id
                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image viewer modal */}
      {viewingImage && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setViewingImage(null)}
        >
          <div style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}>
            <img
              src={viewingImage.url}
              alt={viewingImage.label}
              style={{
                maxWidth: '100%', maxHeight: '70vh',
                borderRadius: 14, border: '2px solid rgba(255,255,255,0.15)',
                display: 'block', margin: '0 auto',
              }}
            />
            <div style={{ color: '#fff', fontSize: 13, marginTop: 10, opacity: 0.7 }}>
              {viewingImage.label}
            </div>
            <button
              onClick={() => setViewingImage(null)}
              style={{
                marginTop: 12, padding: '8px 24px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
