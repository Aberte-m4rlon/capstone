import { type ReactNode, type HTMLAttributes } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'default';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: ReactNode;
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  icon,
  className = '',
  style,
  ...props
}: BadgeProps) {
  const getVariantStyles = (): { bg: string; text: string; border: string; dotColor: string } => {
    switch (variant) {
      case 'primary':
        return {
          bg: '#E8F5E9',
          text: '#2E7D32',
          border: 'rgba(67, 160, 71, 0.30)',
          dotColor: '#43A047',
        };
      case 'success':
        return {
          bg: '#E8F5E9',
          text: '#2E7D32',
          border: 'rgba(67, 160, 71, 0.30)',
          dotColor: '#43A047',
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          text: '#D97706',
          border: 'rgba(245, 158, 11, 0.28)',
          dotColor: '#F59E0B',
        };
      case 'danger':
        return {
          bg: 'rgba(239, 68, 68, 0.12)',
          text: '#DC2626',
          border: 'rgba(239, 68, 68, 0.28)',
          dotColor: '#EF4444',
        };
      case 'info':
        return {
          bg: 'rgba(59, 130, 246, 0.12)',
          text: '#2563EB',
          border: 'rgba(59, 130, 246, 0.28)',
          dotColor: '#3B82F6',
        };
      case 'default':
      case 'neutral':
      default:
        return {
          bg: 'var(--color-surface-hover, #F0F4F1)',
          text: 'var(--color-text-secondary, #667085)',
          border: 'var(--color-border, #E5EDE6)',
          dotColor: 'var(--color-text-muted, #94A3B8)',
        };
    }
  };

  const { bg, text, border, dotColor } = getVariantStyles();

  const isSmall = size === 'sm';

  return (
    <span
      className={`alpas-badge alpas-badge-${variant} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: isSmall ? '2px 8px' : '4px 10px',
        fontSize: isSmall ? '11px' : '12px',
        fontWeight: 700,
        lineHeight: 1,
        borderRadius: 'var(--radius-pill, 9999px)',
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
      {...props}
    >
      {dot && (
        <span
          style={{
            width: isSmall ? 5 : 6,
            height: isSmall ? 5 : 6,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
