import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Sparkles, Activity, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';

export interface EarlyIllnessHeroProps {
  healthyCount: number;
  moderateCount: number;
  criticalCount: number;
  totalAnimals: number;
  onRunPrediction: () => void;
  predicting?: boolean;
  lastEvaluated?: string;
  className?: string;
}

export function EarlyIllnessHero({
  healthyCount,
  moderateCount,
  criticalCount,
  totalAnimals,
  onRunPrediction,
  predicting = false,
  lastEvaluated,
  className = '',
}: EarlyIllnessHeroProps) {
  const healthyPct = totalAnimals > 0 ? Math.round((healthyCount / totalAnimals) * 100) : 0;
  const modPct = totalAnimals > 0 ? Math.round((moderateCount / totalAnimals) * 100) : 0;
  const critPct = totalAnimals > 0 ? Math.round((criticalCount / totalAnimals) * 100) : 0;

  return (
    <Card
      variant="elevated"
      padding="lg"
      className={`alpas-early-illness-hero ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(255, 106, 42, 0.08) 0%, rgba(255, 59, 48, 0.04) 100%)',
        border: '1px solid rgba(255, 106, 42, 0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Badge variant="primary" size="sm" icon={<Sparkles size={12} />}>
                AI Cloud Analytics
              </Badge>
              {lastEvaluated && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)' }}>
                  Evaluated {lastEvaluated}
                </span>
              )}
            </div>
            <h3
              style={{
                margin: '0 0 4px 0',
                fontSize: '20px',
                fontWeight: 800,
                color: 'var(--color-text-primary, #0F172A)',
                letterSpacing: '-0.02em',
              }}
            >
              Early Illness Prediction System
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '13.5px',
                color: 'var(--color-text-secondary, #475569)',
                maxWidth: '600px',
                lineHeight: 1.5,
              }}
            >
              Predictive health screening powered by animal vitals, environmental factors, and historical clinical data.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={onRunPrediction}
            loading={predicting}
            leftIcon={<RefreshCw size={15} />}
          >
            Run Predictive Scan
          </Button>
        </div>

        {/* Risk Distribution Bar */}
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              height: 10,
              width: '100%',
              borderRadius: 'var(--radius-pill, 999px)',
              background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.15))',
              display: 'flex',
              overflow: 'hidden',
              marginBottom: 10,
            }}
          >
            <div style={{ width: `${healthyPct}%`, background: 'var(--color-success, #10B981)', transition: 'width 0.4s ease' }} title={`Healthy: ${healthyPct}%`} />
            <div style={{ width: `${modPct}%`, background: 'var(--color-warning, #F59E0B)', transition: 'width 0.4s ease' }} title={`Moderate Risk: ${modPct}%`} />
            <div style={{ width: `${critPct}%`, background: 'var(--color-danger, #EF4444)', transition: 'width 0.4s ease' }} title={`Critical Risk: ${critPct}%`} />
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12.5px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-success, #10B981)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success, #10B981)' }} />
              <span>{healthyCount} Healthy ({healthyPct}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning, #F59E0B)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-warning, #F59E0B)' }} />
              <span>{moderateCount} Moderate ({modPct}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-danger, #EF4444)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger, #EF4444)' }} />
              <span>{criticalCount} Critical / High ({critPct}%)</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
