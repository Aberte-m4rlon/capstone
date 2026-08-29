import { type ReactNode } from 'react';
import { Card } from './Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export type StatCardStatus = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface StatCardProps {
  title?: string;
  label?: string;
  value: string | number;
  description?: string;
  subtitle?: string;
  subtext?: string;
  icon?: ReactNode;
  status?: StatCardStatus;
  accentColor?: string;
  statusColor?: string;
  change?: string | number;
  changeType?: 'warning' | 'neutral' | 'positive' | 'negative' | string;
  trend?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  title,
  label,
  value,
  description,
  subtitle,
  subtext,
  icon,
  status = 'default',
  accentColor,
  statusColor,
  change,
  changeType,
  trend,
  loading = false,
  onClick,
  className = '',
}: StatCardProps) {
  const displayTitle = title ?? label ?? '';
  const displayDesc = description ?? subtitle ?? subtext;

  const colorInput = accentColor ?? statusColor;

  // ── Status styling ──
  const effectiveStatus = colorInput 
    ? (colorInput === 'red' || colorInput === 'danger' ? 'danger' 
       : colorInput === 'green' || colorInput === 'success' || colorInput === 'positive' ? 'success'
       : colorInput === 'orange' || colorInput === 'warning' ? 'warning'
       : colorInput === 'blue' || colorInput === 'info' ? 'info'
       : colorInput === 'primary' || colorInput === 'accent' ? 'primary' : 'default')
    : status;

  const effectiveTrend = trend ?? (change ? {
    value: change,
    isPositive: changeType === 'positive' || (typeof change === 'string' && change.startsWith('+')),
    label: undefined,
  } : undefined);

  const getStatusStyles = () => {
    switch (effectiveStatus) {
      case 'primary':
        return {
          iconBg: 'rgba(255, 106, 42, 0.14)',
          iconColor: 'var(--color-primary, #FF6A2A)',
          badgeBorder: 'rgba(255, 106, 42, 0.25)',
        };
      case 'danger':
        return {
          iconBg: 'rgba(239, 68, 68, 0.14)',
          iconColor: 'var(--color-danger, #EF4444)',
          badgeBorder: 'rgba(239, 68, 68, 0.25)',
        };
      case 'warning':
        return {
          iconBg: 'rgba(245, 158, 11, 0.14)',
          iconColor: 'var(--color-warning, #F59E0B)',
          badgeBorder: 'rgba(245, 158, 11, 0.25)',
        };
      case 'success':
        return {
          iconBg: 'rgba(16, 185, 129, 0.14)',
          iconColor: 'var(--color-success, #10B981)',
          badgeBorder: 'rgba(16, 185, 129, 0.25)',
        };
      case 'info':
        return {
          iconBg: 'rgba(59, 130, 246, 0.14)',
          iconColor: 'var(--color-info, #3B82F6)',
          badgeBorder: 'rgba(59, 130, 246, 0.25)',
        };
      case 'default':
      default:
        return {
          iconBg: 'rgba(255, 106, 42, 0.10)',
          iconColor: 'var(--color-primary, #FF6A2A)',
          badgeBorder: 'var(--color-border, rgba(226, 232, 240, 0.8))',
        };
    }
  };

  const { iconBg, iconColor } = getStatusStyles();

  return (
    <Card
      variant={onClick ? 'interactive' : 'default'}
      padding="md"
      onClick={onClick}
      className={`alpas-stat-card ${className}`}
    >
      <div className="alpas-stat-header">
        <div className="alpas-stat-info">
          <span className="alpas-stat-title">
            {displayTitle}
          </span>
          {loading ? (
            <div className="alpas-stat-loading" />
          ) : (
            <div className="alpas-stat-value">
              {value}
            </div>
          )}
        </div>

        {icon && (
          <div
            className="alpas-stat-icon"
            style={{
              background: iconBg,
              color: iconColor,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      {(displayDesc || effectiveTrend) && (
        <div className="alpas-stat-footer">
          {effectiveTrend && (
            <span
              className={`alpas-stat-trend ${effectiveTrend.isPositive ? 'trend-positive' : 'trend-negative'}`}
            >
              {effectiveTrend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {effectiveTrend.value}
            </span>
          )}
          {displayDesc && (
            <span className="alpas-stat-desc">
              {displayDesc}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
