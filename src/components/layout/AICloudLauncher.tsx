import { Bot } from 'lucide-react';

interface AICloudLauncherProps {
  onClick?: () => void;
  statusColor?: string;
  className?: string;
  compact?: boolean;
}

export function AICloudLauncher({
  onClick,
  statusColor = '#22C55E',
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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: compact ? 64 : 84,
        height: compact ? 64 : 76,
        padding: compact ? '8px' : '10px 8px 8px',
        borderRadius: '20px',
        background: 'var(--sidebar-card-bg, rgba(255, 255, 255, 0.88))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--sidebar-card-border, rgba(226, 232, 240, 0.8))',
        boxShadow: 'var(--sidebar-card-shadow, 0 8px 24px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04))',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        color: 'var(--color-text-primary, #1F2937)',
        outline: 'none',
      }}
    >
      {/* Online Status Dot */}
      <span
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColor,
          boxShadow: `0 0 8px ${statusColor}`,
          border: '1.5px solid var(--sidebar-card-bg, #FFFFFF)',
        }}
      />

      {/* Robot AI Icon Container */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '12px',
          background: 'rgba(59, 130, 246, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3B82F6',
          transition: 'transform 0.2s ease',
        }}
      >
        <Bot size={20} strokeWidth={2.2} />
      </div>

      {/* Label */}
      {!compact && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-primary, #1F2937)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          AI Cloud
        </span>
      )}
    </button>
  );
}
