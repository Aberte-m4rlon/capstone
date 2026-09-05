import { useNavigate } from 'react-router-dom';
import { X, ShieldCheck } from 'lucide-react';
import { AlpasLogo } from './AlpasLogo';
import { GoatIcon } from './GoatIcon';
import { SidebarItem } from './SidebarItem';
import { AICloudLauncher } from './AICloudLauncher';
import { getNavItemsForRole } from './navigationConfig';

export interface AppSidebarProps {
  role: string | null;
  getBadge: (to: string) => number;
  open?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
  onOpenAICloud?: () => void;
  user?: any;
  signOut?: () => Promise<void>;
}

export function AppSidebar({
  role,
  getBadge,
  open = false,
  onClose,
  isMobile = false,
  onOpenAICloud,
  user,
}: AppSidebarProps) {
  const navigate = useNavigate();
  // Dynamic Navigation Items strictly based on active user role
  const navItems = getNavItemsForRole(role);

  const displayRoleLabel =
    role === 'super_admin'
      ? 'Super Admin'
      : role === 'system_admin'
      ? 'System Admin'
      : role === 'farm_manager'
      ? 'Farm Manager'
      : role === 'worker'
      ? 'Farm Worker'
      : 'Super Admin';

  const avatarUrl = user?.user_metadata?.avatar_url || null;
  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email ? user.email.split('@')[0] : '');
  const initials = userName
    ? userName.charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  // Desktop & Tablet Floating Capsule Navbar (Icon-only, 9999px border-radius)
  if (!isMobile) {
    return (
      <aside className="alpas-sidebar desktop-sidebar" aria-label="Main Navigation">
        <div className="alpas-sidebar-inner">
          {/* ── Top: Circular ALPASFARM Logo Container (48px) ── */}
          <div className="alpas-nav-logo-wrap">
            <button
              type="button"
              onClick={() => navigate(role === 'super_admin' ? '/super-admin' : '/dashboard')}
              className="alpas-nav-logo-btn"
              aria-label="AlpasFarm Dashboard"
            >
              <GoatIcon size={26} color="#176B35" strokeWidth={2.4} />
              <span className="alpas-nav-tooltip" role="tooltip">
                ALPASFARM
              </span>
            </button>
          </div>

          {/* ── Center: Vertical Icons List (Icon-only, hover tooltips) ── */}
          <div className="alpas-nav-scroll-area">
            <nav className="alpas-nav-list" aria-label="Primary Navigation">
              {navItems.map((item) => {
                const badgeCount =
                  item.badgeKey === 'alerts' || item.to === '/daily-alerts' || item.to === '/notifications'
                    ? getBadge('/daily-alerts') || getBadge('/notifications')
                    : getBadge(item.to);
                return (
                  <SidebarItem
                    key={`${item.to}-${item.label}`}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    badge={badgeCount}
                    onClick={onClose}
                  />
                );
              })}
            </nav>
          </div>

          {/* ── Bottom: User Profile Avatar with Subtle Green Ring (44px) ── */}
          <div className="alpas-nav-profile-wrap">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="alpas-profile-avatar-btn"
              aria-label="Aking Profile at Settings"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName || 'Avatar'}
                  className="alpas-profile-avatar-img"
                />
              ) : (
                <span className="alpas-profile-avatar-initials">{initials}</span>
              )}
              <span className="alpas-nav-tooltip" role="tooltip">
                {userName ? `${userName} · ${displayRoleLabel}` : displayRoleLabel}
              </span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Mobile Drawer Navigation (When opened via hamburger)
  return (
    <aside
      className={`alpas-sidebar mobile-drawer ${open ? 'open' : ''}`}
      aria-label="Mobile Navigation"
    >
      <div className="alpas-sidebar-inner">
        {/* Top: Mobile Drawer Brand Header */}
        <div className="alpas-sidebar-header">
          <AlpasLogo collapsed={false} />
          {onClose && (
            <button
              type="button"
              className="alpas-sidebar-close-btn"
              onClick={onClose}
              aria-label="Close navigation drawer"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Center: Scrollable Nav Items with Labels */}
        <div className="alpas-nav-scroll-area">
          <nav className="alpas-nav-list" aria-label="Main Navigation">
            {navItems.map((item) => {
              const badgeCount =
                item.badgeKey === 'alerts' || item.to === '/daily-alerts' || item.to === '/notifications'
                  ? getBadge('/daily-alerts') || getBadge('/notifications')
                  : getBadge(item.to);
              return (
                <SidebarItem
                  key={`${item.to}-${item.label}`}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  badge={badgeCount}
                  onClick={onClose}
                />
              );
            })}
          </nav>
        </div>

        {/* Bottom: Mobile Role Badge & AI Cloud Launcher */}
        <div className="alpas-sidebar-footer">
          <div className="sidebar-role-pill">
            <div className="sidebar-role-icon-wrap">
              <ShieldCheck size={16} />
            </div>
            <span className="sidebar-role-label">{displayRoleLabel}</span>
          </div>
          <AICloudLauncher onClick={onOpenAICloud} />
        </div>
      </div>
    </aside>
  );
}
