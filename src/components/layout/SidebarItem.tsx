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
          {/* Left Icon */}
          <span
            className="alpas-nav-icon"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 22,
              height: 22,
              color: isActive ? '#FFFFFF' : 'var(--sidebar-icon-color, #475569)',
              transition: 'color 0.2s ease, transform 0.2s ease',
            }}
          >
            {icon}
          </span>

          {/* Center Label */}
          {!compact && (
            <span
              className="alpas-nav-label"
              style={{
                fontSize: '13.5px',
                fontWeight: isActive ? 700 : 600,
                color: isActive ? '#FFFFFF' : 'var(--sidebar-text-color, #334155)',
                letterSpacing: '-0.01em',
                textAlign: 'left',
                lineHeight: 1.2,
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transition: 'color 0.2s ease',
              }}
            >
              {label}
            </span>
          )}

          {/* Right Notification Badge */}
          {badge > 0 && (
            <span
              className="alpas-nav-badge"
              style={{
                minWidth: 18,
                height: 18,
                padding: '0 6px',
                borderRadius: '999px',
                background: isActive ? '#FFFFFF' : 'var(--color-danger, #EF4444)',
                color: isActive ? '#FF3D5A' : '#FFFFFF',
                fontSize: '10.5px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

