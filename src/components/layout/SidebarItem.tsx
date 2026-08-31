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
      className={({ isActive }) =>
        `alpas-nav-item ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`
      }
      style={style}
    >
      {({ isActive }) => (
        <>
          {/* Left Icon with optional collapsed badge */}
          <span className="alpas-nav-icon">
            {icon}
            {badge > 0 && (
              <span className="alpas-nav-badge-collapsed">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>

          {/* Center Label (Smooth fade-in on hover) */}
          <span className="alpas-nav-label">
            {label}
          </span>

          {/* Right Notification Badge (Expanded state) */}
          {badge > 0 && (
            <span className="alpas-nav-badge-expanded">
              {badge > 99 ? '99+' : badge}
            </span>
          )}

          {/* Floating Tooltip when collapsed */}
          <span className="alpas-nav-tooltip" role="tooltip">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
