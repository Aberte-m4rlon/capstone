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
          bg: 'rgba(255, 106, 42, 0.12)',
          text: 'var(--color-primary, #FF6A2A)',
          border: 'rgba(255, 106, 42, 0.28)',
          dotColor: 'var(--color-primary, #FF6A2A)',
        };
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.12)',
          text: 'var(--color-success, #10B981)',
          border: 'rgba(16, 185, 129, 0.28)',
          dotColor: 'var(--color-success, #10B981)',
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          text: 'var(--color-warning, #F59E0B)',
          border: 'rgba(245, 158, 11, 0.28)',
          dotColor: 'var(--color-warning, #F59E0B)',
        };
      case 'danger':
        return {
          bg: 'rgba(239, 68, 68, 0.12)',
          text: 'var(--color-danger, #EF4444)',
          border: 'rgba(239, 68, 68, 0.28)',
          dotColor: 'var(--color-danger, #EF4444)',
        };
      case 'info':
        return {
          bg: 'rgba(59, 130, 246, 0.12)',
          text: 'var(--color-info, #3B82F6)',
          border: 'rgba(59, 130, 246, 0.28)',
          dotColor: 'var(--color-info, #3B82F6)',
        };
      case 'default':
      case 'neutral':
      default:
        return {
          bg: 'var(--color-surface-hover, rgba(241, 245, 249, 0.9))',
          text: 'var(--color-text-secondary, #475569)',
          border: 'var(--color-border, #E2E8F0)',
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
