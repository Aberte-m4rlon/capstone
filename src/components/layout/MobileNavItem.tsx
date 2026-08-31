import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface MobileNavItemProps {
  to?: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  isActive?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

export function MobileNavItem({
  to,
  label,
  icon,
  badge,
  isActive = false,
  onClick,
  ariaLabel,
}: MobileNavItemProps) {
  const content = (
    <>
      <div className="mobile-nav-icon-container">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="mobile-nav-badge" aria-label={`${badge} unread notifications`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}

      </div>
      <span className="mobile-nav-label">{label}</span>
    </>
  );

  const className = `mobile-nav-item ${isActive ? 'active' : ''}`;

  if (to) {
    return (
      <Link
        to={to}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel || label}
        aria-current={isActive ? 'page' : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-label={ariaLabel || label}
    >
      {content}
    </button>
  );
}
