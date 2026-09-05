import { useNavigate } from 'react-router-dom';

interface AlpasLogoProps {
  collapsed?: boolean;
  className?: string;
  onClick?: () => void;
}

export function AlpasLogo({ collapsed = false, className = '', onClick }: AlpasLogoProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`alpas-brand-logo ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
        cursor: 'pointer',
        userSelect: 'none',
        width: '100%',
        padding: '0 4px',
      }}
      title="AlpasFarm Dashboard"
    >
      {/* Brand Emblem */}
      <div className="alpas-logo-emblem">
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

      {/* Brand Typography (Hidden when collapsed on desktop, smooth fade on hover) */}
      <div className="alpas-logo-text">
        <span
          style={{
            fontSize: '16.5px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: '#174B2A',
          }}
        >
          <span style={{ color: '#238B45' }}>ALPAS</span>
          <span style={{ color: '#174B2A' }}>FARM</span>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.01em',
            color: '#50645A',
            marginTop: 2,
            whiteSpace: 'nowrap',
          }}
        >
          Smart Farm Management
        </span>
      </div>
    </div>
  );
}
