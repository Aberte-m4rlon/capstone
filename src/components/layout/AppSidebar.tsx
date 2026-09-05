import { X, ShieldCheck } from 'lucide-react';
import { AlpasLogo } from './AlpasLogo';
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
}

export function AppSidebar({
  role,
  getBadge,
  open = false,
  onClose,
  isMobile = false,
  onOpenAICloud,
}: AppSidebarProps) {
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

  return (
    <aside
      className={`alpas-sidebar ${isMobile ? 'mobile-drawer' : 'desktop-sidebar'} ${open ? 'open' : ''}`}
      aria-label="Main Sidebar"
    >
      <div className="alpas-sidebar-inner">
        {/* ── Top: Brand Logo & Tagline (min-height 76px) ── */}
        <div className="alpas-sidebar-header">
          <AlpasLogo collapsed={false} />
          {isMobile && onClose && (
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

        {/* ── Center: Vertical Navigation Container with Inner Scroll ── */}
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

        {/* ── Bottom: User Role Pill + AI Cloud Launcher Card ── */}
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
