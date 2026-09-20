import React, { useState, useEffect } from 'react';
import { Camera, Eye, X, HeartPulse, Sparkles, Calendar, Tag } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../../ui/Modal';
import { useSignedImageUrl } from '../../../lib/useCameraScreenings';
import { formatDate } from '../../../lib/analytics';
import type { HealthRecord, Animal } from '../../../types';
import type { CameraScreening } from '../../../lib/useCameraScreenings';

/**
 * Resolves the persistent storage image path and initial URL for a health record.
 * Supports triple redundancy:
 * 1. Direct fields: record.image_path / record.image_url
 * 2. Embedded metadata: record.notes containing '[Larawan: screenings/...]'
 * 3. Matched audit row: camera_health_screenings table row for this animal on the same date
 */
export function resolveHealthImage(
  record: HealthRecord,
  screenings?: CameraScreening[]
): { path: string | null; url: string | null } {
  // 1. Check direct fields
  if (record.image_path || record.image_url) {
    return {
      path: record.image_path || null,
      url: record.image_url || null,
    };
  }

  // 2. Check embedded notes tag: [Larawan: screenings/...]
  if (record.notes && record.notes.includes('[Larawan:')) {
    const match = record.notes.match(/\[Larawan:\s*([^\]]+)\]/);
    if (match && match[1]) {
      return {
        path: match[1].trim(),
        url: null,
      };
    }
  }

  // 3. Fallback: match screening row
  if (screenings && screenings.length > 0) {
    const match = screenings.find((s) => {
      if (s.animal_id !== record.animal_id) return false;
      const sDate = s.created_at.slice(0, 10);
      return sDate === record.record_date;
    });
    if (match && (match.image_path || match.image_url)) {
      return {
        path: match.image_path || null,
        url: match.image_url || null,
      };
    }
  }

  return { path: null, url: null };
}

/**
 * HealthScanThumbnail Component
 * Displays a clean, click-to-enlarge thumbnail of the saved health check animal crop.
 */
export const HealthScanThumbnail: React.FC<{
  record: HealthRecord;
  screenings?: CameraScreening[];
  size?: number;
  fallbackIcon?: React.ReactNode;
  onClick?: (url: string, record: HealthRecord) => void;
}> = ({ record, screenings, size = 44, fallbackIcon, onClick }) => {
  const { path, url: initialUrl } = resolveHealthImage(record, screenings);
  const { url: signedUrl, loading } = useSignedImageUrl(path, initialUrl);

  const displayUrl = signedUrl || initialUrl;

  if (loading && !displayUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: 'var(--surface-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: 10,
        }}
      >
        ...
      </div>
    );
  }

  if (!displayUrl) {
    if (fallbackIcon) return <>{fallbackIcon}</>;
    return (
      <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>
        —
      </span>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(displayUrl, record);
      }}
      title="Pindutin para palakihin ang larawan ng health scan"
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1.5px solid var(--border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        background: '#111827',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.08)';
        e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
      }}
    >
      <img
        src={displayUrl}
        alt="Health Scan Crop"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: '4px 0 0 0',
          padding: '1px 3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Eye size={10} color="#FFFFFF" />
      </div>
    </div>
  );
};

/**
 * HealthScanDetailImageCard Component
 * Prominently displays the saved animal scan image inside health record detail modals.
 */
export const HealthScanDetailImageCard: React.FC<{
  record: HealthRecord;
  animal?: Animal | null;
  screenings?: CameraScreening[];
  onOpenLightbox?: (url: string) => void;
}> = ({ record, animal, screenings, onOpenLightbox }) => {
  const { path, url: initialUrl } = resolveHealthImage(record, screenings);
  const { url: signedUrl, loading } = useSignedImageUrl(path, initialUrl);
  const displayUrl = signedUrl || initialUrl;

  if (!path && !initialUrl) return null;

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          <Camera size={15} color="#16A34A" />
          <span>Nai-save na Larawan ng Alaga</span>
        </div>
        {displayUrl && (
          <button
            type="button"
            onClick={() => onOpenLightbox?.(displayUrl)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#16A34A',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 4px',
            }}
          >
            <Eye size={13} />
            <span>Palakihin</span>
          </button>
        )}
      </div>

      <div
        onClick={() => displayUrl && onOpenLightbox?.(displayUrl)}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: 240,
          background: '#0B0F19',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: displayUrl ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
      >
        {loading && !displayUrl ? (
          <div style={{ padding: '32px 0', color: 'var(--text-secondary)', fontSize: 12 }}>
            Ikinakarga ang larawan...
          </div>
        ) : displayUrl ? (
          <img
            src={displayUrl}
            alt="Health Scan Saved Animal"
            style={{
              width: '100%',
              maxHeight: 240,
              objectFit: 'contain',
              display: 'block',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          />
        ) : (
          <div style={{ padding: '32px 0', color: 'var(--text-secondary)', fontSize: 12 }}>
            Walang makitang larawan
          </div>
        )}
      </div>
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--surface-sunken)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {animal ? `${animal.species === 'Sheep' ? 'Tupa' : 'Kambing'} — ${animal.tag_id}` : 'Kambing / Tupa'}
        </span>
        <span style={{ color: '#16A34A', fontWeight: 600 }}>✓ Nakatabi sa Supabase Storage</span>
      </div>
    </div>
  );
};

/**
 * HealthScanLightboxModal Component
 * Enlarged high-resolution view of the saved animal health check crop with full clinical breakdown.
 */
export const HealthScanLightboxModal: React.FC<{
  open: boolean;
  onClose: () => void;
  record: HealthRecord | null;
  animal: Animal | null;
  imageUrl: string | null;
}> = ({ open, onClose, record, animal, imageUrl }) => {
  if (!open || !imageUrl) return null;

  // Determine Tagalog status badge
  const isMed = record?.reasons?.includes('Gamot') || record?.notes?.includes('Ginagamot');
  const isConcern =
    record?.risk_level === 'High' ||
    record?.risk_level === 'Critical' ||
    Boolean(record?.detected_conditions);
  const isMon = record?.risk_level === 'Moderate';

  const kalagayanLabel = isMed
    ? 'Kailangan ng Gamot'
    : isConcern
    ? 'Kailangan ng Atensyon'
    : isMon
    ? 'Bantayan'
    : 'Maayos';

  const badgeColor = isMed
    ? '#DC2626'
    : isConcern
    ? '#EA580C'
    : isMon
    ? '#D97706'
    : '#16A34A';

  const badgeBg = isMed
    ? 'rgba(220, 38, 38, 0.12)'
    : isConcern
    ? 'rgba(234, 88, 12, 0.12)'
    : isMon
    ? 'rgba(217, 119, 6, 0.12)'
    : 'rgba(22, 163, 74, 0.12)';

  const cleanNotes = record?.notes
    ? record.notes.replace(/\[Larawan:\s*[^\]]+\]/g, '').trim()
    : '';

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={18} color="#16A34A" />
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            Larawan ng Health Scan — {animal ? animal.tag_id : 'Kambing / Tupa'}
          </span>
        </div>
      </ModalHeader>

      <ModalBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Main Cropped Image Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#0B0F19',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)',
              maxHeight: 420,
            }}
          >
            <img
              src={imageUrl}
              alt="Health Scan Crop"
              style={{
                width: '100%',
                maxHeight: 420,
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(4px)',
                color: '#FFFFFF',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Camera size={12} />
              <span>Na-save mula sa Camera Health Check</span>
            </div>
          </div>

          {/* Animal and Record Details Breakdown */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {/* Animal Info Card */}
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
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Kambing / Tupa
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                {animal ? (
                  <>
                    {animal.species === 'Sheep' ? 'Tupa' : 'Kambing'} — {animal.tag_id}
                    {animal.name && animal.name !== animal.tag_id ? ` (${animal.name})` : ''}
                  </>
                ) : (
                  'Hindi Tukoy'
                )}
              </div>
              {record && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Petsa ng Check: <strong>{formatDate(record.record_date)}</strong>
                </div>
              )}
            </div>

            {/* Kalagayan Badge Card */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Kalagayan (Status)
              </div>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 800,
                    color: badgeColor,
                    background: badgeBg,
                    border: `1px solid ${badgeColor}33`,
                  }}
                >
                  {kalagayanLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Clinical Findings & Recommendations */}
          {record && (
            <div
              style={{
                background: 'var(--surface-sunken)',
                padding: '14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 3 }}>
                  Mga Napansin sa Kalusugan (Observations)
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                  {record.detected_conditions ? (
                    <span style={{ color: '#EA580C', fontWeight: 600 }}>
                      {record.detected_conditions}
                      {record.reasons ? ` — ${record.reasons}` : ''}
                    </span>
                  ) : record.reasons ? (
                    record.reasons
                  ) : (
                    'Normal / Walang nakitang sintomas ng sakit'
                  )}
                </div>
              </div>

              {record.recommendation && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 3 }}>
                    Rekomendasyon / Hakbang (Action)
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                    {record.recommendation}
                  </div>
                </div>
              )}

              {cleanNotes && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 3 }}>
                    Mga Karagdagang Tala (Notes)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                    {cleanNotes}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 8 }}
          >
            Isara
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
