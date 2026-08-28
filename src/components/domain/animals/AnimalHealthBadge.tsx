import { Badge, type BadgeVariant } from '../../ui/Badge';
import { HeartPulse, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

export interface AnimalHealthBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export function AnimalHealthBadge({
  status,
  size = 'sm',
  showIcon = false,
}: AnimalHealthBadgeProps) {
  const norm = (status || 'Healthy').toLowerCase();

  let variant: BadgeVariant = 'success';
  let Icon = CheckCircle2;

  if (norm.includes('healthy') || norm.includes('good') || norm.includes('normal')) {
    variant = 'success';
    Icon = CheckCircle2;
  } else if (norm.includes('observation') || norm.includes('monitor') || norm.includes('moderate')) {
    variant = 'warning';
    Icon = AlertTriangle;
  } else if (norm.includes('sick') || norm.includes('ill') || norm.includes('critical') || norm.includes('high')) {
    variant = 'danger';
    Icon = AlertOctagon;
  } else if (norm.includes('treatment') || norm.includes('quarantine')) {
    variant = 'primary';
    Icon = HeartPulse;
  }

  return (
    <Badge
      variant={variant}
      size={size}
      dot={!showIcon}
      icon={showIcon ? <Icon size={size === 'sm' ? 12 : 14} /> : undefined}
    >
      {status || 'Healthy'}
    </Badge>
  );
}
