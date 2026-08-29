interface AlpasLogoProps {
  collapsed?: boolean;
  className?: string;
  onClick?: () => void;
}

export function AlpasLogo({ collapsed = false, className = '', onClick }: AlpasLogoProps) {
  return (
    <div
      onClick={onClick}
      className={`alpas-brand-logo ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        width: '100%',
        padding: '0 4px',
      }}
    >
      {/* Brand Emblem */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(67, 160, 71, 0.35)',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Stylized goat head / horns */}
          <path d="M12 21a6 6 0 0 0 6-6V9a6 6 0 0 0-12 0v6a6 6 0 0 0 6 6z" />
          <path d="M7 6C5 4 3 4 2 5c0 3 3 5 5 5" />
          <path d="M17 6c2-2 4-2 5-1 0 3-3 5-5 5" />
          <circle cx="9.5" cy="12.5" r="1" fill="#FFFFFF" />
          <circle cx="14.5" cy="12.5" r="1" fill="#FFFFFF" />
          <path d="M11 17h2" />
        </svg>
      </div>

      {/* Brand Typography */}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left', flex: 1 }}>
          <span
            style={{
              fontSize: '17px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: 'var(--color-text-primary, #1F2933)',
            }}
          >
            <span style={{ color: '#43A047' }}>ALPAS</span>
            <span style={{ color: 'var(--color-text-primary, #1F2933)' }}>FARM</span>
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: 'var(--color-text-secondary, #667085)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Smart Farm, Healthy Herd
          </span>
        </div>
      )}
    </div>
  );
}
