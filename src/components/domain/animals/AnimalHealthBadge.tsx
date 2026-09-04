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

  let displayLabel = status || 'Maayos / Healthy';

  if (norm.includes('healthy') || norm.includes('good') || norm.includes('normal') || norm.includes('maayos')) {
    variant = 'success';
    Icon = CheckCircle2;
    displayLabel = 'Maayos / Healthy';
  } else if (norm.includes('observation') || norm.includes('monitor') || norm.includes('moderate') || norm.includes('bantayan')) {
    variant = 'warning';
    Icon = AlertTriangle;
    displayLabel = 'Bantayan / Under Observation';
  } else if (norm.includes('needs attention') || norm.includes('atensyon') || norm.includes('attention')) {
    variant = 'warning';
    Icon = AlertTriangle;
    displayLabel = 'Nangangailangan ng Atensyon / Needs Attention';
  } else if (norm.includes('sick') || norm.includes('ill') || norm.includes('critical') || norm.includes('high') || norm.includes('mataas')) {
    variant = 'danger';
    Icon = AlertOctagon;
    displayLabel = 'Mataas ang Risk / High Risk';
  } else if (norm.includes('treatment') || norm.includes('quarantine')) {
    variant = 'primary';
    Icon = HeartPulse;
    displayLabel = status;
  }

  return (
    <Badge
      variant={variant}
      size={size}
      dot={!showIcon}
      icon={showIcon ? <Icon size={size === 'sm' ? 12 : 14} /> : undefined}
    >
      {displayLabel}
    </Badge>
  );
}
