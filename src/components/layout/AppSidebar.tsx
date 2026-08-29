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
  Scale,
  Wheat,
  History,
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

interface NavItemDef {
  to: string;
  label: string;
  icon: React.ReactNode;
  isAlerts?: boolean;
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

  // Dynamic Navigation Items based on active user role
  let navItems: NavItemDef[] = [];

  if (isSuperAdmin) {
    navItems = [
      { to: '/super-admin', label: 'Super Admin', icon: <Crown size={20} strokeWidth={2} /> },
      { to: '/activity-log', label: 'Activity Log', icon: <History size={20} strokeWidth={2} /> },
      { to: '/admin', label: 'Admin Panel', icon: <ShieldAlert size={20} strokeWidth={2} /> },
      { to: '/dashboard', label: 'Dashboard', icon: <Home size={20} strokeWidth={2} /> },
      { to: '/reports', label: 'Reports', icon: <BarChart3 size={20} strokeWidth={2} /> },
      { to: '/daily-alerts', label: 'Alerts', icon: <Bell size={20} strokeWidth={2} />, isAlerts: true },
      { to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} strokeWidth={2} /> },
    ];
  } else if (isAdmin) {
    navItems = [
      { to: '/admin', label: 'Admin Panel', icon: <ShieldAlert size={20} strokeWidth={2} /> },
      { to: '/activity-log', label: 'Activity Log', icon: <History size={20} strokeWidth={2} /> },
      { to: '/dashboard', label: 'Dashboard', icon: <Home size={20} strokeWidth={2} /> },
      { to: '/reports', label: 'Reports', icon: <BarChart3 size={20} strokeWidth={2} /> },
      { to: '/daily-alerts', label: 'Alerts', icon: <Bell size={20} strokeWidth={2} />, isAlerts: true },
      { to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} strokeWidth={2} /> },
    ];
  } else {
    // Farm Manager / Default Role Navigation
    navItems = [
      { to: '/dashboard', label: 'Dashboard', icon: <Home size={20} strokeWidth={2} /> },
      { to: '/health', label: 'Health Monitoring', icon: <HeartPulse size={20} strokeWidth={2} /> },
      { to: '/animals', label: 'Mga Hayop / Animals', icon: <GoatIcon size={20} strokeWidth={2} /> },
      { to: '/breeding', label: 'Breeding', icon: <Heart size={20} strokeWidth={2} /> },
      { to: '/inventory', label: 'Inventory', icon: <Package size={20} strokeWidth={2} /> },
      { to: '/vaccinations', label: 'Vaccine / Vaccinations', icon: <Syringe size={20} strokeWidth={2} /> },
      { to: '/weights', label: 'Weight & Growth', icon: <Scale size={20} strokeWidth={2} /> },
      { to: '/feed', label: 'Feed Management', icon: <Wheat size={20} strokeWidth={2} /> },
      { to: '/camera-screening', label: 'AI Scanner', icon: <Camera size={20} strokeWidth={2} /> },
      { to: '/reports', label: 'Reports', icon: <BarChart3 size={20} strokeWidth={2} /> },
      { to: '/daily-alerts', label: 'Alerts', icon: <Bell size={20} strokeWidth={2} />, isAlerts: true },
      { to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} strokeWidth={2} /> },
    ];
  }

  return (
    <aside
      className={`alpas-sidebar ${isMobile ? 'mobile-drawer' : 'desktop-sidebar'} ${open ? 'open' : ''}`}
      aria-label="Main Sidebar"
    >
      <div className="alpas-sidebar-inner">
        {/* ── Top: Brand Logo & Tagline (min-height 80px) ── */}
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
              const badgeCount = item.isAlerts
                ? getBadge('/daily-alerts') || getBadge('/notifications')
                : getBadge(item.to);
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

        {/* ── Bottom: AI Cloud Launcher Card ── */}
        <div className="alpas-sidebar-footer">
          <AICloudLauncher onClick={onOpenAICloud} />
        </div>
      </div>
    </aside>
  );
}

