import { useEffect, type ReactNode, type HTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnEsc?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
  role?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
}

// ── Body Scroll Lock ──────────────────────────────────────────────────────────
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

// ── Main Modal Component ──────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnEsc = true,
  closeOnOverlayClick = true,
  className = '',
}: ModalProps) {
  useScrollLock(open);

  // Keyboard Escape Handler
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const getMaxWidth = (): string => {
    switch (size) {
      case 'sm': return '420px';
      case 'lg': return '720px';
      case 'xl': return '900px';
      case 'full': return '96vw';
      case 'md':
      default:   return '560px';
    }
  };

  return (
    <div
      className="alpas-modal-overlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(6, 18, 32, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className={`alpas-modal alpas-modal-${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: getMaxWidth(),
          maxHeight: 'min(90vh, calc(100dvh - 32px))',
          background: 'var(--color-surface, #FFFFFF)',
          border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
          borderRadius: 'var(--radius-2xl, 28px)',
          boxShadow: 'var(--shadow-modal, 0 24px 64px rgba(15, 23, 42, 0.20))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Modal Header */}
        {(title || subtitle) && (
          <ModalHeader onClose={onClose} subtitle={subtitle}>
            {title}
          </ModalHeader>
        )}

        {/* Modal Body */}
        <ModalBody>{children}</ModalBody>

        {/* Modal Footer */}
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </div>
    </div>
  );
}

// ── ModalHeader ───────────────────────────────────────────────────────────────
export interface ModalHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
}

export function ModalHeader({
  title,
  subtitle,
  icon,
  children,
  onClose,
  className = '',
  style,
  ...props
}: ModalHeaderProps) {
  const displayTitle = title ?? children;

  return (
    <div
      className={`alpas-modal-header ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 24px',
        borderBottom: '1px solid var(--color-border-light, rgba(226, 232, 240, 0.8))',
        position: 'sticky',
        top: 0,
        background: 'var(--color-surface, #FFFFFF)',
        zIndex: 2,
        ...style,
      }}
      {...props}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, paddingRight: 12 }}>
        {icon && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm, 10px)',
              background: 'rgba(255, 106, 42, 0.12)',
              color: 'var(--color-primary, #FF6A2A)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3
            style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--color-text-primary, #0F172A)',
              letterSpacing: '-0.01em',
            }}
          >
            {displayTitle}
          </h3>
          {subtitle && (
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '12.5px',
                color: 'var(--color-text-muted, #64748B)',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-sm, 10px)',
            background: 'var(--color-surface, rgba(148, 163, 184, 0.1))',
            border: 'none',
            color: 'var(--color-text-secondary, #475569)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// ── ModalBody ─────────────────────────────────────────────────────────────────
export function ModalBody({
  children,
  className = '',
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`alpas-modal-body ${className}`}
      style={{
        padding: '20px 24px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        flex: 1,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// ── ModalFooter ───────────────────────────────────────────────────────────────
export function ModalFooter({
  children,
  className = '',
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`alpas-modal-footer ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '10px',
        padding: '14px 24px',
        borderTop: '1px solid var(--color-border-light, rgba(226, 232, 240, 0.8))',
        background: 'var(--color-surface, #FFFFFF)',
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Reusable Confirm Dialog ───────────────────────────────────────────────────
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'primary';
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant,
  danger,
  loading = false,
}: ConfirmDialogProps) {
  const effectiveVariant = danger ? 'danger' : (variant ?? 'danger');

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={effectiveVariant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--color-text-secondary, #475569)' }}>
        {message}
      </div>
    </Modal>
  );
}
