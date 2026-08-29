import { Bot, Sparkles } from 'lucide-react';

interface AICloudLauncherProps {
  onClick?: () => void;
  statusColor?: string;
  className?: string;
  compact?: boolean;
}

export function AICloudLauncher({
  onClick,
  statusColor = '#10B981',
  className = '',
  compact = false,
}: AICloudLauncherProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Dispatch global event for opening AI Cloud assistant
      window.dispatchEvent(new CustomEvent('alpas:open-ai-cloud'));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`ai-cloud-launcher-card ${className}`}
      aria-label="Open AI Cloud Assistant"
      title="AI Cloud Assistant (Online)"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
        padding: '10px 12px',
        borderRadius: '14px',
        background: 'var(--sidebar-card-bg, rgba(255, 255, 255, 0.04))',
        border: '1px solid var(--sidebar-card-border, rgba(255, 255, 255, 0.1))',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        color: 'var(--color-text-primary, #0F172A)',
        outline: 'none',
        userSelect: 'none',
      }}
    >
      {/* Left: Icon & Brand Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2))',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3B82F6',
            flexShrink: 0,
          }}
        >
          <Bot size={18} strokeWidth={2.2} />
        </div>

        {!compact && (
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #0F172A)',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              AI Cloud
            </span>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 600,
                color: 'var(--color-text-secondary, #64748B)',
                lineHeight: 1.1,
                marginTop: 2,
                whiteSpace: 'nowrap',
              }}
            >
              Assistant Ready
            </span>
          </div>
        )}
      </div>

      {/* Right: Online Status Pulse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
          }}
        />
        <Sparkles size={14} color="#3B82F6" style={{ opacity: 0.8 }} />
      </div>
    </button>
  );
}

