import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  Syringe,
  Bug,
  Pill,
  Stethoscope,
} from 'lucide-react';
import { useFarmData } from '../../../lib/useFarmData';
import { useAuth } from '../../../lib/auth';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { acknowledgeHealthAlert, resolveHealthAlert } from '../../../lib/healthService';
import type { HealthAlert, Animal } from '../../../types';

interface HealthAlertCenterProps {
  onSelectAnimal?: (animalId: string) => void;
}

export function HealthAlertCenter({ onSelectAnimal }: HealthAlertCenterProps) {
  const { healthAlerts, animals, refresh } = useFarmData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [filterMode, setFilterMode] = useState<'unresolved' | 'all' | 'critical'>('unresolved');

  const animalMap = useMemo(() => {
    const map = new Map<string, Animal>();
    animals.forEach((a: Animal) => map.set(a.id, a));
    return map;
  }, [animals]);

  const filteredAlerts = useMemo(() => {
    return healthAlerts.filter((alert: HealthAlert) => {
      if (filterMode === 'unresolved') return !alert.is_resolved;
      if (filterMode === 'critical') return alert.severity === 'critical' && !alert.is_resolved;
      return true;
    });
  }, [healthAlerts, filterMode]);

  const handleAcknowledge = async (alertId: string) => {
    await acknowledgeHealthAlert(alertId);
    toast('Nabasang alerto.', 'info');
    await refresh();
  };

  const handleResolve = async (alertId: string) => {
    await resolveHealthAlert(alertId, user?.id);
    toast('Nalutas na ang alerto sa kalusugan.', 'success');
    await refresh();
  };

  const getAlertIcon = (type: string, severity: string) => {
    if (severity === 'critical') return <ShieldAlert size={20} color="#dc2626" />;
    if (type.includes('vaccination')) return <Syringe size={20} color="#2563eb" />;
    if (type.includes('deworming')) return <Bug size={20} color="#d97706" />;
    if (type.includes('treatment')) return <Pill size={20} color="#7c3aed" />;
    if (type.includes('vet')) return <Stethoscope size={20} color="#059669" />;
    return <AlertTriangle size={20} color="#f59e0b" />;
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--surface, #ffffff)',
        borderRadius: '16px',
        border: '1px solid var(--border, #e5e7eb)',
        boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,0.05))',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header & Filter Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bell size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text, #111827)' }}>
              Health Alert Center
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
              Mga paalala sa mapanganib na kalagayan, nakatakdang gamutan, at bakuna
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setFilterMode('unresolved')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: filterMode === 'unresolved' ? '1px solid #238B45' : '1px solid var(--border, #e5e7eb)',
              backgroundColor: filterMode === 'unresolved' ? 'rgba(35, 139, 69, 0.1)' : 'transparent',
              color: filterMode === 'unresolved' ? '#238B45' : 'var(--text-secondary, #4b5563)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Kailangan ng Aksyon ({healthAlerts.filter((a: HealthAlert) => !a.is_resolved).length})
          </button>

          <button
            onClick={() => setFilterMode('critical')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: filterMode === 'critical' ? '1px solid #dc2626' : '1px solid var(--border, #e5e7eb)',
              backgroundColor: filterMode === 'critical' ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
              color: filterMode === 'critical' ? '#dc2626' : 'var(--text-secondary, #4b5563)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Kritikal ({healthAlerts.filter((a: HealthAlert) => a.severity === 'critical' && !a.is_resolved).length})
          </button>

          <button
            onClick={() => setFilterMode('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: filterMode === 'all' ? '1px solid #374151' : '1px solid var(--border, #e5e7eb)',
              backgroundColor: filterMode === 'all' ? 'rgba(55, 65, 81, 0.1)' : 'transparent',
              color: filterMode === 'all' ? '#111827' : 'var(--text-secondary, #4b5563)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Lahat ({healthAlerts.length})
          </button>
        </div>
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--surface-muted, #f9fafb)',
            borderRadius: '12px',
            border: '1px dashed var(--border, #e5e7eb)',
          }}
        >
          <CheckCircle2 size={36} color="#238B45" style={{ margin: '0 auto 10px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #111827)' }}>
            Walang Aktibong Alerto sa Kalusugan
          </h4>
          <p style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
            Lahat ng mga alaga ay maayos o naaksyunan na ang mga naunang paalala.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredAlerts.map((alert: HealthAlert) => {
            const animal = animalMap.get(alert.animal_id);
            const isCritical = alert.severity === 'critical';

            return (
              <div
                key={alert.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: isCritical ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border, #e5e7eb)',
                  backgroundColor: isCritical
                    ? 'rgba(239, 68, 68, 0.04)'
                    : alert.is_resolved
                    ? 'var(--surface-muted, #f9fafb)'
                    : 'var(--surface, #ffffff)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 260 }}>
                  <div style={{ marginTop: 2, flexShrink: 0 }}>
                    {getAlertIcon(alert.alert_type, alert.severity)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          backgroundColor: isCritical ? '#fee2e2' : '#fef3c7',
                          color: isCritical ? '#dc2626' : '#b45309',
                          textTransform: 'uppercase',
                        }}
                      >
                        {alert.severity}
                      </span>
                      {animal && (
                        <button
                          onClick={() => {
                            if (onSelectAnimal) onSelectAnimal(animal.id);
                            else navigate(`/animals/${animal.id}`);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#238B45',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {animal.tag_id} — {animal.name} ({animal.species === 'Goat' ? 'Kambing' : 'Tupa'})
                        </button>
                      )}
                      <span style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {new Date(alert.created_at).toLocaleDateString('fil-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: 'var(--text, #1f2937)', margin: 0, lineHeight: 1.4 }}>
                      {alert.message}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {!alert.is_read && !alert.is_resolved && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      style={{
                        padding: '6px 10px',
                        fontSize: 12,
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-secondary, #4b5563)',
                      }}
                    >
                      Basahin
                    </button>
                  )}

                  {!alert.is_resolved ? (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#238B45',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <CheckCircle size={14} /> Lutasin
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={13} /> Nalutas na
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
