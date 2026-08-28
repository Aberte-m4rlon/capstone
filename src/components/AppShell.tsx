import { type ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Icons, type IconName } from '../lib/icons';
import { useAuth } from '../lib/auth';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { FloatingAICloud } from './FloatingAICloud';
import { Moon, Sun } from 'lucide-react';
import type { Animal, InventoryItem, Vaccination, BreedingRecord } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

// ── Farm Manager navigation ───────────────────────────────────────────────────
// Consolidated from 18 items → 12 items across 3 logical sections.
// Removed from sidebar (still accessible inside pages):
//   /analytics       → merged into /reports (Reports & Analytics)
//   /recommendations → accessible via AI Cloud floating button
//   /daily-alerts    → merged into /notifications
//   /activity-log    → admin-level detail, removed for farmers
//   /scanner         → accessible from the Animals page header
//   /myai            → accessible via the AI Cloud floating button

const FARM_MANAGER_NAV: NavSection[] = [
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
    heading: 'Tools',
    items: [
      { to: '/daily-alerts',     label: 'Alerts',               icon: 'Bell'            },
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

// ── System Admin navigation ───────────────────────────────────────────────────
const ADMIN_NAV: NavSection[] = [
  {
    heading: 'Administration',
    items: [
      { to: '/admin', label: 'Admin Panel', icon: 'ShieldAlert' },
    ],
  },
];

// ── Super Admin navigation ────────────────────────────────────────────────────
const SUPER_ADMIN_NAV: NavSection[] = [
  {
    heading: 'System',
    items: [
      { to: '/super-admin', label: 'Overview',    icon: 'Crown'       },
      { to: '/admin',       label: 'Admin Panel', icon: 'ShieldAlert' },
    ],
  },
];

// ── Page titles ───────────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':        { title: 'Dashboard',            subtitle: 'Farm overview at a glance'                  },
  '/animals':          { title: 'Animals',               subtitle: 'Manage your goat & sheep records'           },
  '/health':           { title: 'Health Monitoring',     subtitle: 'Track and analyze animal health'            },
  '/breeding':         { title: 'Breeding',              subtitle: 'Mating, pregnancy, and kidding'             },
  '/weights':          { title: 'Weight & Growth',       subtitle: 'Track weight and predict growth'            },
  '/vaccinations':     { title: 'Vaccinations',          subtitle: 'Immunization schedule and alerts'           },
  '/feed':             { title: 'Feed Management',       subtitle: 'Feed records and efficiency'                },
  '/inventory':        { title: 'Inventory',             subtitle: 'Stock, supplies, and expiry alerts'         },
  '/reports':          { title: 'Reports & Analytics',   subtitle: 'Performance insights and exportable reports'},
  '/analytics':        { title: 'Analytics',             subtitle: 'Farm performance insights'                  },
  '/recommendations':  { title: 'Smart Recommendations', subtitle: 'AI-powered farm suggestions'                },
  '/daily-alerts':     { title: 'Daily Alerts',          subtitle: 'Planned reminders and urgent tasks'         },
  '/notifications':    { title: 'Notifications',         subtitle: 'Alerts and reminders'                       },
  '/activity-log':     { title: 'Activity Log',          subtitle: 'Complete history of all farm actions'       },
  '/myai':             { title: 'MyAI',                  subtitle: 'Local AI assistant powered by Ollama'       },
  '/camera-screening': { title: 'AI Health Scanner',     subtitle: 'ML-based preliminary health screening'      },
  '/scanner':          { title: 'QR Scanner',            subtitle: 'Scan animal QR codes'                       },
  '/admin':            { title: 'Admin Panel',           subtitle: 'Manage users and system data'               },
  '/super-admin':      { title: 'Super Admin',           subtitle: 'Full system control and user management'    },
  '/settings':         { title: 'Settings',              subtitle: 'Configure farm thresholds'                  },
};

interface SearchResult {
  type: string;
  label: string;
  sub: string;
  link: string;
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const farmData = useFarmData();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const searchRef  = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);

  // ── Dark mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [darkMode]);

  // ── Role flags ────────────────────────────────────────────────────────────
  const isAdmin       = role === 'system_admin';
  const isSuperAdmin  = role === 'super_admin';
  const isFarmManager = role === 'farm_manager';

  const navSections: NavSection[] = isSuperAdmin
    ? SUPER_ADMIN_NAV
    : isAdmin
      ? ADMIN_NAV
      : FARM_MANAGER_NAV;

  const pathKey   = Object.keys(PAGE_TITLES).find((k) => location.pathname.startsWith(k)) ?? '/dashboard';
  const pageTitle = PAGE_TITLES[pathKey] ?? { title: 'AlpasFarm', subtitle: '' };

  // ── Badges ────────────────────────────────────────────────────────────────
  const unreadNotifs = farmData.notifications.filter((n) => !n.read).length;
  const overdueVacc  = farmData.animals.filter((a) => a.vaccination_status === 'Overdue' && !a.archived).length;
  const lowStock     = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock)).length;

  function getBadge(to: string): number {
    if (to === '/notifications' || to === '/daily-alerts') return unreadNotifs;
    if (to === '/vaccinations')  return overdueVacc;
    if (to === '/inventory')     return lowStock;
    return 0;
  }

  // ── Search (farm manager only) ────────────────────────────────────────────
  useEffect(() => {
    if (!isFarmManager || !searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]); setSearchOpen(false); return;
    }
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    farmData.animals
      .filter((a) => !a.archived)
      .filter((a) => a.name.toLowerCase().includes(q) || a.tag_id.toLowerCase().includes(q) || (a.breed ?? '').toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((a: Animal) => results.push({
        type: 'Animals',
        label: `${a.name} — ${a.tag_id}`,
        sub: `${a.species} · ${a.breed ?? 'Unknown breed'}`,
        link: `/animals/${a.id}`,
      }));

    farmData.inventory
      .filter((i: InventoryItem) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((i) => results.push({ type: 'Inventory', label: i.name, sub: `${i.category} · ${i.quantity} ${i.unit}`, link: '/inventory' }));

    farmData.vaccinations
      .filter((v: Vaccination) => v.vaccine_name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((v) => {
        const animal = farmData.animals.find((a) => a.id === v.animal_id);
        results.push({ type: 'Vaccinations', label: v.vaccine_name, sub: animal ? `${animal.name} · ${v.date_given}` : v.date_given, link: '/vaccinations' });
      });

    farmData.breedingRecords
      .filter((b: BreedingRecord) => b.status.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((b) => {
        const animal = farmData.animals.find((a) => a.id === b.animal_id);
        results.push({ type: 'Breeding', label: animal ? animal.name : 'Breeding record', sub: `${b.status} · ${b.mating_date}`, link: '/breeding' });
      });

    setSearchResults(results);
    setSearchOpen(results.length > 0);
  }, [searchQuery, farmData, isFarmManager]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current  && !searchRef.current.contains(e.target  as Node)) setSearchOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current   && !notifRef.current.contains(e.target   as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard / route handlers ─────────────────────────────────────────────
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && sidebarOpen) setSidebarOpen(false); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [sidebarOpen]);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    setProfileOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  const markAllRead = async () => {
    const unread = farmData.notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', unread.map((n) => n.id));
    farmData.refresh();
  };

  const initials  = user?.email ? user.email[0].toUpperCase() : 'F';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-inner">

          {/* Logo */}
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">A</div>
            <div className="sidebar-logo-text">
              <h1>AlpasFarm</h1>
              <span>
                {isSuperAdmin ? 'System Administration' : isAdmin ? 'Admin Panel' : 'Farm Management'}
              </span>
            </div>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
              <Icons.X size={20} />
            </button>
          </div>

          {/* Sectioned nav */}
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
                      onClick={() => setSidebarOpen(false)}
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

      {/* ── Main area ── */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Icons.Menu size={20} />
            </button>
            <div className="topbar-title">
              <h2>{pageTitle.title}</h2>
              <p>{pageTitle.subtitle}</p>
            </div>
          </div>

          {/* Search — farm managers only */}
          {isFarmManager && (
            <div className="topbar-search" ref={searchRef}>
              <Icons.Search className="search-icon" size={16} />
              <input
                type="text"
                placeholder="Search animals, inventory, vaccines…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              />
              {searchOpen && (
                <div className="search-results">
                  {Object.entries(groupedResults).map(([group, items]) => (
                    <div key={group}>
                      <div className="search-group-label">{group}</div>
                      {items.map((r, i) => (
                        <div key={i} className="search-result-item"
                          onClick={() => { navigate(r.link); setSearchQuery(''); setSearchOpen(false); }}>
                          <div>
                            <div>{r.label}</div>
                            <div className="sr-sub">{r.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="topbar-actions">
            {/* Light / Dark toggle */}
            <button
              className="topbar-icon-btn"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notification bell — farm managers only */}
            {isFarmManager && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button className="topbar-icon-btn" onClick={() => setNotifOpen(!notifOpen)} aria-label="Notifications">
                  <Icons.Bell size={18} />
                  {unreadNotifs > 0 && <span className="notif-dot" />}
                </button>
                {notifOpen && (
                  <div className="profile-dropdown notif-dropdown">
                    <div className="pd-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontWeight: 700 }}>Notifications</p>
                      {unreadNotifs > 0 && (
                        <button className="btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
                      )}
                    </div>
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {farmData.notifications.length === 0 && (
                        <div className="search-empty">No notifications</div>
                      )}
                      {farmData.notifications.slice(0, 10).map((n) => (
                        <div key={n.id} className="pd-item"
                          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                          onClick={() => { if (n.link) navigate(n.link); setNotifOpen(false); }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            <span className={`badge badge-${n.priority === 'Critical' ? 'red' : n.priority === 'Warning' ? 'orange' : n.priority === 'Success' ? 'green' : 'blue'}`}>
                              {n.type}
                            </span>
                            {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)' }} />}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{n.title}</span>
                          {n.description && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{n.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="pd-item" onClick={() => { navigate('/notifications'); setNotifOpen(false); }}>
                      View all notifications
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile menu */}
            <div className="profile-menu" ref={profileRef}>
              <div
                className="profile-avatar"
                onClick={() => setProfileOpen(!profileOpen)}
                role="button"
                aria-label="User profile"
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : initials}
              </div>
              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="pd-header">
                    <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', wordBreak: 'break-all' }}>
                      {user?.email}
                    </p>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: isSuperAdmin ? 'rgba(139,92,246,0.15)' : isAdmin ? 'rgba(217,45,32,0.12)' : 'rgba(255,106,42,0.12)',
                      color: isSuperAdmin ? '#7C3AED' : isAdmin ? '#D92D20' : '#FF7A18',
                      border: isSuperAdmin ? '1px solid rgba(139,92,246,0.30)' : isAdmin ? '1px solid rgba(217,45,32,0.25)' : '1px solid rgba(255,106,42,0.25)',
                    }}>
                      {isSuperAdmin ? 'Super Administrator' : isAdmin ? 'System Administrator' : 'Farm Manager'}
                    </span>
                  </div>
                  {isFarmManager && (
                    <button className="pd-item" onClick={() => { navigate('/settings'); setProfileOpen(false); }}>
                      <Icons.Settings size={16} /> Settings
                    </button>
                  )}
                  <button className="pd-item" onClick={handleSignOut}>
                    <Icons.LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      {/* AI Cloud floating button — farm managers only */}
      {isFarmManager && <FloatingAICloud />}
    </div>
  );
}
