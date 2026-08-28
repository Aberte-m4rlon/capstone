import {
  Home,
  HeartPulse,
  Heart,
  Package,
  Syringe,
  Camera,
  BarChart3,
  Bell,
  Settings as SettingsIcon,
  Crown,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AlpasLogo } from './AlpasLogo';
import { GoatIcon } from './GoatIcon';
import { SidebarItem } from './SidebarItem';
import { AICloudLauncher } from './AICloudLauncher';

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
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'system_admin';

  // Base 10 navigation items strictly matching the visual reference order
  const farmNavItems = [
    { to: '/dashboard', label: 'Dashboard', icon: <Home size={22} strokeWidth={2} /> },
    { to: '/health', label: 'Health Monitoring', icon: <HeartPulse size={22} strokeWidth={2} /> },
    { to: '/animals', label: 'Mga Hayop', icon: <GoatIcon size={22} strokeWidth={2} /> },
    { to: '/breeding', label: 'Breeding', icon: <Heart size={22} strokeWidth={2} /> },
    { to: '/inventory', label: 'Inventory', icon: <Package size={22} strokeWidth={2} /> },
    { to: '/vaccinations', label: 'Vaccine', icon: <Syringe size={22} strokeWidth={2} /> },
    { to: '/camera-screening', label: 'AI Scanner', icon: <Camera size={22} strokeWidth={2} /> },
    { to: '/reports', label: 'Reports', icon: <BarChart3 size={22} strokeWidth={2} /> },
    { to: '/daily-alerts', label: 'Alerts', icon: <Bell size={22} strokeWidth={2} />, isAlerts: true },
    { to: '/settings', label: 'Settings', icon: <SettingsIcon size={22} strokeWidth={2} /> },
  ];

  // Role-specific admin items if user is Super Admin or Admin
  const adminNavItems = isSuperAdmin
    ? [
        { to: '/super-admin', label: 'Super Admin', icon: <Crown size={22} strokeWidth={2} /> },
        { to: '/admin', label: 'Admin Panel', icon: <ShieldAlert size={22} strokeWidth={2} /> },
      ]
    : isAdmin
    ? [
        { to: '/admin', label: 'Admin Panel', icon: <ShieldAlert size={22} strokeWidth={2} /> },
      ]
    : [];

  return (
    <aside className={`alpas-sidebar ${isMobile ? 'mobile-drawer' : 'desktop-sidebar'} ${open ? 'open' : ''}`}>
      <div className="alpas-sidebar-inner">
        {/* ── Top: Brand Logo & Tagline ── */}
        <div className="alpas-sidebar-header">
          <AlpasLogo collapsed={false} />
          {isMobile && onClose && (
            <button
              type="button"
              className="alpas-sidebar-close-btn"
              onClick={onClose}
              aria-label="Close navigation drawer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Center: Rounded Glassmorphism Navigation Container ── */}
        <div className="alpas-nav-pill-container">
          <nav className="alpas-nav-list" aria-label="Main Navigation">
            {/* Admin Items (if admin / super admin) */}
            {adminNavItems.length > 0 && (
              <div className="alpas-nav-group admin-group">
                {adminNavItems.map((item) => (
                  <SidebarItem
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    badge={getBadge(item.to)}
                    onClick={onClose}
                  />
                ))}
                <div className="alpas-nav-divider" />
              </div>
            )}

            {/* The 10 Primary Farm Navigation Items */}
            {farmNavItems.map((item) => {
              const badgeCount = item.isAlerts ? getBadge('/daily-alerts') || getBadge('/notifications') : getBadge(item.to);
              return (
                <SidebarItem
                  key={item.to}
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

        {/* ── Bottom: Separated Floating AI Cloud Card ── */}
        <div className="alpas-sidebar-footer">
          <AICloudLauncher onClick={onOpenAICloud} />
        </div>
      </div>
    </aside>
  );
}
