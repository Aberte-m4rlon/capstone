import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { HealthRiskBadge } from './HealthRiskBadge';
import { Thermometer, Heart, Activity, Stethoscope, ChevronRight } from 'lucide-react';
import type { Animal } from '../../../types';

export interface HealthRiskCardProps {
  animal: Animal;
  riskScore: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  vitals?: {
    temperature?: number | null;
    heartRate?: number | null;
    respirationRate?: number | null;
    famachaScore?: number | null;
  };
  symptoms?: string[];
  recommendation?: string;
  onAction?: () => void;
  onClick?: () => void;
  className?: string;
}

export function HealthRiskCard({
  animal,
  riskScore,
  riskLevel,
  vitals,
  symptoms = [],
  recommendation,
  onAction,
  onClick,
  className = '',
}: HealthRiskCardProps) {
  const isDanger = riskLevel === 'Critical' || riskLevel === 'High';

  return (
    <Card
      variant={isDanger ? 'danger' : 'warning'}
      padding="md"
      className={`alpas-health-risk-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div
          onClick={onClick}
          style={{ cursor: onClick ? 'pointer' : 'default', minWidth: 0, flex: 1 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #0F172A)',
              }}
            >
              {animal.name}
            </h4>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--color-primary, #238B45)',
                background: '#EAF6ED',
                padding: '1px 6px',
                borderRadius: 'var(--radius-xs, 6px)',
              }}
            >
              {animal.tag_id}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', marginTop: 2 }}>
            {animal.species} · {animal.breed || 'Unknown breed'} · {animal.sex}
          </div>
        </div>

        <HealthRiskBadge score={riskScore} level={riskLevel} size="md" />
      </div>

      {/* Vitals Row */}
      {vitals && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {vitals.temperature !== undefined && vitals.temperature !== null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs, 6px)',
                background: vitals.temperature > 39.8 ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface-hover, rgba(148, 163, 184, 0.1))',
                color: vitals.temperature > 39.8 ? 'var(--color-danger, #EF4444)' : 'var(--color-text-secondary, #475569)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              <Thermometer size={12} />
              {vitals.temperature}°C
            </span>
          )}

          {vitals.heartRate !== undefined && vitals.heartRate !== null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs, 6px)',
                background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.1))',
                color: 'var(--color-text-secondary, #475569)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              <Heart size={12} />
              {vitals.heartRate} bpm
            </span>
          )}

          {vitals.respirationRate !== undefined && vitals.respirationRate !== null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs, 6px)',
                background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.1))',
                color: 'var(--color-text-secondary, #475569)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              <Activity size={12} />
              {vitals.respirationRate} brpm
            </span>
          )}

          {vitals.famachaScore !== undefined && vitals.famachaScore !== null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs, 6px)',
                background: vitals.famachaScore >= 4 ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface-hover, rgba(148, 163, 184, 0.1))',
                color: vitals.famachaScore >= 4 ? 'var(--color-danger, #EF4444)' : 'var(--color-text-secondary, #475569)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              FAMACHA: {vitals.famachaScore}/5
            </span>
          )}
        </div>
      )}

      {/* Symptoms / Recommendation */}
      {(symptoms.length > 0 || recommendation) && (
        <div
          style={{
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: 'var(--color-text-secondary, #475569)',
            background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm, 10px)',
          }}
        >
          {symptoms.length > 0 && (
            <div style={{ marginBottom: recommendation ? 4 : 0 }}>
              <strong style={{ color: 'var(--color-text-primary, #0F172A)' }}>Observed: </strong>
              {symptoms.join(', ')}
            </div>
          )}
          {recommendation && (
            <div>
              <strong style={{ color: 'var(--color-primary, #238B45)' }}>Action: </strong>
              {recommendation}
            </div>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        {onClick && (
          <button
            type="button"
            onClick={onClick}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-primary, #238B45)',
              fontSize: '12.5px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 0,
            }}
          >
            <span>View Medical Record</span>
            <ChevronRight size={14} />
          </button>
        )}

        {onAction && (
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            size="sm"
            onClick={onAction}
            leftIcon={<Stethoscope size={13} />}
          >
            Log Treatment
          </Button>
        )}
      </div>
    </Card>
  );
}
