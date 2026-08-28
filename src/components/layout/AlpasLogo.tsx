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
        flexDirection: collapsed ? 'column' : 'row',
        alignItems: 'center',
        gap: collapsed ? 4 : 10,
        textDecoration: 'none',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {/* Brand Emblem */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FF6A00 0%, #FF3D71 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(255, 106, 0, 0.35)',
        }}
      >
        <svg
          width="22"
          height="22"
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
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: 'var(--color-text-primary, #0F172A)',
            }}
          >
            <span style={{ color: '#FF6A00' }}>ALPAS</span>FARM
          </span>
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: 'var(--color-text-secondary, #64748B)',
              marginTop: 2,
              whiteSpace: 'nowrap',
            }}
          >
            Smart Farm, Healthy Herd
          </span>
        </div>
      )}
    </div>
  );
}
