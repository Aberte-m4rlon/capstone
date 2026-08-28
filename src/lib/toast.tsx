import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

import { Check, X as XIcon, AlertTriangle, Info as InfoIcon } from 'lucide-react';

// ── Icon per type ─────────────────────────────────────────────────────────────
function ToastIcon({ type }: { type: ToastType }) {
  const bg = type === 'success' ? '#16A34A'
    : type === 'error' ? '#DC2626'
    : type === 'warning' ? '#D97706'
    : '#2563EB';

  return (
    <span style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: '50%',
      flexShrink: 0,
      background: bg,
      color: '#fff',
    }}>
      {type === 'success' && <Check size={13} strokeWidth={3} />}
      {type === 'error' && <XIcon size={13} strokeWidth={3} />}
      {type === 'warning' && <AlertTriangle size={13} strokeWidth={3} />}
      {type === 'info' && <InfoIcon size={13} strokeWidth={3} />}
    </span>
  );
}

// ── Single Toast item ─────────────────────────────────────────────────────────
function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const accentColor =
    t.type === 'success' ? '#16A34A'
    : t.type === 'error' ? '#DC2626'
    : t.type === 'warning' ? '#D97706'
    : '#2563EB';

  return (
    <div
      onClick={onRemove}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 14,
        minWidth: 280,
        maxWidth: 'calc(100vw - 40px)',
        cursor: 'pointer',
        // Opaque backgrounds — fully readable in both light and dark mode
        background: 'var(--toast-bg, #1a1a2e)',
        border: `1px solid ${accentColor}55`,
        borderLeft: `4px solid ${accentColor}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
        // Animation
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1), opacity 0.28s ease',
        willChange: 'transform, opacity',
      }}
      role="alert"
      aria-live="polite"
    >
      <ToastIcon type={t.type} />
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.5,
        color: 'var(--toast-text, #f1f5f9)',
        flex: 1,
        wordBreak: 'break-word',
      }}>
        {t.message}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--toast-text-secondary, #94a3b8)',
          fontSize: 16,
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
          marginTop: -1,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/*
        Toast container — top-right on desktop, full-width at top on mobile.
        z-index 9500: above modals (9999 for camera modal) but below
        the camera modal overlay. Standard toasts should be 9500+.
        Positioned above the AI Cloud FAB (z-index ~100).
      */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9500,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 'min(400px, calc(100vw - 32px))',
          width: 'max-content',
          pointerEvents: 'none', // let clicks pass through the container
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={t} onRemove={() => remove(t.id)} />
          </div>
        ))}
      </div>

      {/* Theme-aware CSS variables injected once */}
      <style>{`
        /* Dark mode (default) */
        :root {
          --toast-bg: #0f172a;
          --toast-text: #f1f5f9;
          --toast-text-secondary: #94a3b8;
        }
        /* Light mode overrides */
        [data-theme="light"] {
          --toast-bg: #ffffff;
          --toast-text: #0f172a;
          --toast-text-secondary: #64748b;
        }
        @media (max-width: 480px) {
          /* On very small screens, stretch toast to nearly full width */
          .toast-container-inner {
            width: calc(100vw - 32px) !important;
            min-width: unset !important;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
