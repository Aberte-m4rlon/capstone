import { NavLink } from 'react-router-dom';
import { Icons, type IconName } from '../../lib/icons';
import { X } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

export const FARM_MANAGER_NAV: NavSection[] = [
  {
    heading: 'Main',
    items: [
      { to: '/dashboard',        label: 'Dashboard',            icon: 'LayoutDashboard' },
      { to: '/animals',          label: 'Animals',              icon: 'PawPrint'        },
      { to: '/health',           label: 'Health Monitoring',    icon: 'HeartPulse'      },
      { to: '/camera-screening', label: 'AI Health Scanner',   icon: 'Camera'          },
      { to: '/breeding',         label: 'Breeding',             icon: 'Heart'           },
      { to: '/weights',          label: 'Weight & Growth',      icon: 'Scale'           },
      { to: '/vaccinations',     label: 'Vaccinations',         icon: 'Syringe'         },
      { to: '/feed',             label: 'Feed Management',      icon: 'Wheat'           },
      { to: '/inventory',        label: 'Inventory',            icon: 'Package'         },
      { to: '/analytics',        label: 'Analytics',            icon: 'TrendingUp'      },
      { to: '/reports',          label: 'Reports',              icon: 'FileBarChart'    },
    ],
  },
  {
    heading: 'Tools & Intelligence',
    items: [
      { to: '/recommendations',  label: 'Recommendations',     icon: 'Lightbulb'       },
      { to: '/daily-alerts',     label: 'Daily Alerts',         icon: 'Bell'            },
      { to: '/notifications',    label: 'Notifications',        icon: 'ClipboardList'   },
      { to: '/scanner',          label: 'QR Scanner',           icon: 'QrCode'          },
      { to: '/activity-log',     label: 'Activity Log',         icon: 'Activity'        },
      { to: '/myai',             label: 'AI Cloud',             icon: 'Bot'             },
    ],
  },
  {
    heading: 'System',
    items: [
      { to: '/settings',         label: 'Settings',             icon: 'Settings'        },
    ],
  },
];

export const ADMIN_NAV: NavSection[] = [
  {
    heading: 'Administration',
    items: [
      { to: '/admin',            label: 'Admin Panel',          icon: 'ShieldAlert'     },
    ],
  },
  ...FARM_MANAGER_NAV,
];

export const SUPER_ADMIN_NAV: NavSection[] = [
  {
    heading: 'Administration',
    items: [
      { to: '/super-admin',      label: 'Super Admin',          icon: 'Crown'           },
      { to: '/admin',            label: 'Admin Panel',          icon: 'ShieldAlert'     },
    ],
  },
  ...FARM_MANAGER_NAV,
];

export interface AppSidebarProps {
  role: string | null;
  getBadge: (to: string) => number;
  open?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

export function AppSidebar({
  role,
  getBadge,
  open = false,
  onClose,
  isMobile = false,
}: AppSidebarProps) {
  const isSuperAdmin  = role === 'super_admin';
  const isAdmin       = role === 'system_admin';

  const navSections: NavSection[] = isSuperAdmin
    ? SUPER_ADMIN_NAV
    : isAdmin
      ? ADMIN_NAV
      : FARM_MANAGER_NAV;

  const roleSubtitle = isSuperAdmin
    ? 'System Administration'
    : isAdmin
      ? 'Admin Panel'
      : 'Farm Management';

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-inner">
        {/* Brand Header */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">A</div>
          <div className="sidebar-logo-text">
            <h1>AlpasFarm</h1>
            <span>{roleSubtitle}</span>
          </div>
          {isMobile && onClose && (
            <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {navSections.map((section) => (
            <div key={section.heading} className="nav-section">
              <div className="nav-label">{section.heading}</div>
              {section.items.map((item) => {
                const Icon = Icons[item.icon];
                const badge = getBadge(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  >
                    <Icon className="nav-icon" size={17} />
                    <span>{item.label}</span>
                    {badge > 0 && <span className="nav-badge">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
