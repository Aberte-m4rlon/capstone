import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface SidebarItemProps {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  compact?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function SidebarItem({
  to,
  label,
  icon,
  badge = 0,
  compact = false,
  onClick,
  style,
}: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={label}
      className={({ isActive }) => `alpas-nav-item ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}
      style={style}
    >
      {({ isActive }) => (
        <>
          {/* Icon wrapper with optional notification badge */}
          <div className="alpas-nav-icon-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span
              className="alpas-nav-icon"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive ? '#FFFFFF' : 'var(--sidebar-icon-color, #1F2937)',
                transition: 'color 0.2s ease, transform 0.2s ease',
              }}
            >
              {icon}
            </span>

            {/* Notification Badge */}
            {badge > 0 && (
              <span
                className="alpas-nav-badge"
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -8,
                  minWidth: 17,
                  height: 17,
                  padding: '0 4px',
                  borderRadius: '999px',
                  background: 'var(--color-danger, #EF4444)',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)',
                  border: '1.5px solid var(--sidebar-card-bg, #FFFFFF)',
                  lineHeight: 1,
                  pointerEvents: 'none',
                }}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </div>

          {/* Item Label (underneath the icon in desktop visual reference) */}
          {!compact && (
            <span
              className="alpas-nav-label"
              style={{
                fontSize: '10.5px',
                fontWeight: isActive ? 700 : 600,
                color: isActive ? '#FFFFFF' : 'var(--sidebar-text-color, #475569)',
                letterSpacing: '-0.01em',
                textAlign: 'center',
                lineHeight: 1.15,
                marginTop: 4,
                wordBreak: 'break-word',
                maxWidth: '100%',
                transition: 'color 0.2s ease',
              }}
            >
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
