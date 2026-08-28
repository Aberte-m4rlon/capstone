import { Badge, type BadgeVariant } from '../../ui/Badge';

export interface AnimalStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function AnimalStatusBadge({ status, size = 'sm' }: AnimalStatusBadgeProps) {
  const norm = (status || 'Active').toLowerCase();

  let variant: BadgeVariant = 'neutral';
  let label = status || 'Active';

  if (norm.includes('active') || norm.includes('lactating') || norm.includes('breeding')) {
    variant = 'success';
  } else if (norm.includes('pregnant') || norm.includes('weaned') || norm.includes('growing')) {
    variant = 'primary';
  } else if (norm.includes('quarantined') || norm.includes('isolated')) {
    variant = 'warning';
  } else if (norm.includes('sold') || norm.includes('archived')) {
    variant = 'neutral';
  } else if (norm.includes('deceased') || norm.includes('culled')) {
    variant = 'danger';
  }

  return (
    <Badge variant={variant} size={size} dot>
      {label}
    </Badge>
  );
}
