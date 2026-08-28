import { Badge, type BadgeVariant } from '../../ui/Badge';
import { ShieldCheck, AlertTriangle, AlertOctagon, Flame } from 'lucide-react';

export interface HealthRiskBadgeProps {
  score?: number | null;
  level?: 'Low' | 'Moderate' | 'High' | 'Critical' | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export function HealthRiskBadge({
  score,
  level,
  size = 'sm',
  showIcon = true,
}: HealthRiskBadgeProps) {
  let computedLevel = level || 'Low';
  if (typeof score === 'number') {
    if (score >= 80) computedLevel = 'Critical';
    else if (score >= 60) computedLevel = 'High';
    else if (score >= 35) computedLevel = 'Moderate';
    else computedLevel = 'Low';
  }

  const norm = computedLevel.toLowerCase();

  let variant: BadgeVariant = 'success';
  let Icon = ShieldCheck;
  let label = 'Low Risk';

  if (norm.includes('crit')) {
    variant = 'danger';
    Icon = Flame;
    label = 'Critical Risk';
  } else if (norm.includes('high')) {
    variant = 'danger';
    Icon = AlertOctagon;
    label = 'High Risk';
  } else if (norm.includes('mod') || norm.includes('medium')) {
    variant = 'warning';
    Icon = AlertTriangle;
    label = 'Moderate Risk';
  } else {
    variant = 'success';
    Icon = ShieldCheck;
    label = 'Low Risk';
  }

  return (
    <Badge
      variant={variant}
      size={size}
      icon={showIcon ? <Icon size={size === 'sm' ? 12 : 14} /> : undefined}
    >
      {score !== undefined && score !== null ? `${label} (${score}%)` : label}
    </Badge>
  );
}
