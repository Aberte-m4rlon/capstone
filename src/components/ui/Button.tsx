import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning'
  | 'icon'
  | 'floating';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      style,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // ── Variant style mappings ──
    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case 'primary':
          return {
            background: '#238B45',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(35, 139, 69, 0.25)',
          };
        case 'secondary':
          return {
            background: 'transparent',
            color: '#176B35',
            border: '1px solid #238B45',
          };
        case 'outline':
          return {
            background: 'transparent',
            color: '#176B35',
            border: '1.5px solid #238B45',
          };
        case 'ghost':
          return {
            background: '#EAF6ED',
            color: '#176B35',
            border: 'none',
          };
        case 'danger':
          return {
            background: 'var(--color-danger, #EF4444)',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.30)',
          };
        case 'success':
          return {
            background: '#238B45',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(35, 139, 69, 0.25)',
          };
        case 'warning':
          return {
            background: 'var(--color-warning, #F59E0B)',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.30)',
          };
        case 'icon':
          return {
            background: 'var(--color-surface, #FFFFFF)',
            color: '#176B35',
            border: '1px solid rgba(35, 139, 69, 0.15)',
          };
        case 'floating':
          return {
            background: '#238B45',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '50%',
            boxShadow: '0 8px 24px rgba(35, 139, 69, 0.35)',
            padding: 0,
          };
        default:
          return {};
      }
    };

    // ── Size style mappings ──
    const getSizeStyles = (): React.CSSProperties => {
      if (variant === 'icon' || variant === 'floating') {
        switch (size) {
          case 'sm': return { width: 34, height: 34, minWidth: 34, minHeight: 34 };
          case 'lg': return { width: 48, height: 48, minWidth: 48, minHeight: 48 };
          case 'md':
          default:   return { width: 40, height: 40, minWidth: 40, minHeight: 40 };
        }
      }

      switch (size) {
        case 'sm':
          return {
            padding: '6px 14px',
            fontSize: '12px',
            borderRadius: 'var(--radius-sm, 10px)',
            minHeight: '34px',
          };
        case 'lg':
          return {
            padding: '12px 24px',
            fontSize: '15px',
            borderRadius: 'var(--radius-md, 14px)',
            minHeight: '48px',
          };
        case 'md':
        default:
          return {
            padding: '9px 18px',
            fontSize: '13.5px',
            borderRadius: 'var(--radius-md, 14px)',
            minHeight: '40px',
          };
      }
    };

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`alpas-btn alpas-btn-${variant} alpas-btn-${size} ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.6 : 1,
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          outline: 'none',
          userSelect: 'none',
          width: fullWidth ? '100%' : undefined,
          ...getVariantStyles(),
          ...getSizeStyles(),
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />
            {children && <span>{children}</span>}
          </>
        ) : (
          <>
            {leftIcon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{leftIcon}</span>}
            {children && <span>{children}</span>}
            {rightIcon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
