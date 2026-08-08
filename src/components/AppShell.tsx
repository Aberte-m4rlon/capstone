import { type ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Icons, type IconName } from '../lib/icons';
import { useAuth } from '../lib/auth';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { AIAssistantPanel } from './AIAssistantPanel';
import { Moon, Sun } from 'lucide-react';
import { ADMIN_EMAILS } from '../pages/AdminPage';
import type { Animal, InventoryItem, Vaccination, BreedingRecord } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { to: '/animals', label: 'Animals', icon: 'PawPrint' },
  { to: '/scanner', label: 'QR Scanner', icon: 'ScanLine' },
  { to: '/health', label: 'Health Monitoring', icon: 'HeartPulse' },
  { to: '/breeding', label: 'Breeding', icon: 'Heart' },
  { to: '/weights', label: 'Weight & Growth', icon: 'Scale' },
  { to: '/vaccinations', label: 'Vaccinations', icon: 'Syringe' },
  { to: '/feed', label: 'Feed Management', icon: 'Wheat' },
  { to: '/inventory', label: 'Inventory', icon: 'Package' },
  { to: '/analytics', label: 'Analytics', icon: 'Activity' },
  { to: '/reports', label: 'Reports', icon: 'FileBarChart' },
  { to: '/recommendations', label: 'Smart Recommendations', icon: 'Lightbulb' },
  { to: '/activity-log', label: 'Activity Log', icon: 'ClipboardList' },
  { to: '/notifications', label: 'Notifications', icon: 'Bell' },
  { to: '/settings', label: 'Settings', icon: 'Settings' },
  { to: '/admin', label: 'Admin Panel', icon: 'ShieldAlert' },
];

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Farm overview at a glance' },
  '/animals': { title: 'Animals', subtitle: 'Manage your goat & sheep records' },
  '/health': { title: 'Health Monitoring', subtitle: 'Track and analyze animal health' },
  '/breeding': { title: 'Breeding', subtitle: 'Mating, pregnancy, and kidding' },
  '/weights': { title: 'Weight & Growth', subtitle: 'Track weight and predict growth' },
  '/vaccinations': { title: 'Vaccinations', subtitle: 'Immunization schedule and alerts' },
  '/feed': { title: 'Feed Management', subtitle: 'Feed records and efficiency' },
  '/inventory': { title: 'Inventory', subtitle: 'Stock, supplies, and expiry alerts' },
  '/analytics': { title: 'Analytics', subtitle: 'Farm performance insights' },
  '/reports': { title: 'Reports', subtitle: 'Generate and export farm reports' },
  '/recommendations': { title: 'Smart Recommendations', subtitle: 'AI-powered farm assistant' },
  '/notifications': { title: 'Notifications', subtitle: 'Alerts and reminders' },
  '/activity-log': { title: 'Activity Log', subtitle: 'Complete history of all farm actions' },
  '/admin': { title: 'Admin Panel', subtitle: 'Manage users and system data' },
  '/settings': { title: 'Settings', subtitle: 'Configure farm thresholds' },
};

interface SearchResult {
  type: string;
  label: string;
  sub: string;
  link: string;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const farmData = useFarmData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Dark mode — persist in localStorage
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [darkMode]);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  // Admin sees only Admin Panel; regular users see everything except Admin Panel
  const visibleNav = isAdmin
    ? [{ to: '/admin', label: 'Admin Panel', icon: 'ShieldAlert' as IconName }]
    : NAV.filter(item => item.to !== '/admin');

  const pathKey = Object.keys(PAGE_TITLES).find((k) => location.pathname.startsWith(k)) ?? '/dashboard';
  const pageTitle = PAGE_TITLES[pathKey] ?? { title: 'AlpasFarm', subtitle: '' };

  // Compute nav badges
  const unreadNotifs = farmData.notifications.filter((n) => !n.read).length;
  const overdueVacc = farmData.animals.filter((a) => a.vaccination_status === 'Overdue' && !a.archived).length;
  const lowStock = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock)).length;

  // Search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    farmData.animals
      .filter((a) => !a.archived)
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tag_id.toLowerCase().includes(q) ||
          (a.breed ?? '').toLowerCase().includes(q),
      )
      .slice(0, 5)
      .forEach((a: Animal) => {
        results.push({
          type: 'Animals',
          label: `${a.name} — ${a.tag_id}`,
          sub: `${a.species} · ${a.breed ?? 'Unknown breed'}`,
          link: `/animals/${a.id}`,
        });
      });

    farmData.inventory
      .filter(
        (i: InventoryItem) =>
          i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q),
      )
      .slice(0, 3)
      .forEach((i) => {
        results.push({
          type: 'Inventory',
          label: i.name,
          sub: `${i.category} · ${i.quantity} ${i.unit}`,
          link: '/inventory',
        });
      });

    farmData.vaccinations
      .filter((v: Vaccination) => v.vaccine_name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((v) => {
        const animal = farmData.animals.find((a) => a.id === v.animal_id);
        results.push({
          type: 'Vaccinations',
          label: v.vaccine_name,
          sub: animal ? `${animal.name} · ${v.date_given}` : v.date_given,
          link: '/vaccinations',
        });
      });

    farmData.breedingRecords
      .filter((b: BreedingRecord) => b.status.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((b) => {
        const animal = farmData.animals.find((a) => a.id === b.animal_id);
        results.push({
          type: 'Breeding',
          label: animal ? animal.name : 'Breeding record',
          sub: `${b.status} · ${b.mating_date}`,
          link: '/breeding',
        });
      });

    setSearchResults(results);
    setSearchOpen(results.length > 0);
  }, [searchQuery, farmData]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const markAllRead = async () => {
    const unread = farmData.notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unread.map((n) => n.id));
    farmData.refresh();
  };

  const initials = user?.email ? user.email[0].toUpperCase() : 'F';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-inner">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">A</div>
            <div className="sidebar-logo-text">
              <h1>AlpasFarm</h1>
              <span>Farm Management</span>
            </div>
          </div>
          <nav className="nav-section">
            <div className="nav-label">Main Menu</div>
            {visibleNav.map((item) => {
              const Icon = Icons[item.icon];
              let badge = 0;
              if (item.to === '/notifications') badge = unreadNotifs;
              if (item.to === '/vaccinations') badge = overdueVacc;
              if (item.to === '/inventory') badge = lowStock;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? (item.to === '/dashboard' ? 'active' : isActive ? 'active' : '') : ''}`
                  }
                >
                  <Icon className="nav-icon" size={18} />
                  <span>{item.label}</span>
                  {badge > 0 && <span className="nav-badge">{badge}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="mobile-toggle" onClick={() => setSidebarOpen(true)}>
            <Icons.Menu size={20} />
          </button>
          <div className="topbar-title">
            <h2>{pageTitle.title}</h2>
            <p>{pageTitle.subtitle}</p>
          </div>
          <div className="topbar-search" ref={searchRef}>
            <Icons.Search className="search-icon" size={16} />
            <input
              type="text"
              placeholder="Search animals, inventory, vaccines..."
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
                      <div
                        key={i}
                        className="search-result-item"
                        onClick={() => {
                          navigate(r.link);
                          setSearchQuery('');
                          setSearchOpen(false);
                        }}
                      >
                        <div>
                          <div>{r.label}</div>
                          <div className="sr-sub">{r.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {searchResults.length === 0 && (
                  <div className="search-empty">No results for "{searchQuery}"</div>
                )}
              </div>
            )}
          </div>
          {/* Dark / Light mode toggle */}
          <button
            className="topbar-icon-btn"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            style={{ color: '#fff', opacity: 0.9, flexShrink: 0 }}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div ref={notifRef} style={{ position: 'relative' }}>
            <button className="topbar-icon-btn" onClick={() => setNotifOpen(!notifOpen)}>
              <Icons.Bell size={18} />
              {unreadNotifs > 0 && <span className="notif-dot" />}
            </button>
            {notifOpen && (
              <div className="profile-dropdown" style={{ right: 0, minWidth: 320 }}>
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
                    <div
                      key={n.id}
                      className="pd-item"
                      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                      onClick={() => {
                        if (n.link) navigate(n.link);
                        setNotifOpen(false);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                        <span className={`badge badge-${n.priority === 'Critical' ? 'red' : n.priority === 'Warning' ? 'orange' : n.priority === 'Success' ? 'green' : 'blue'}`}>
                          {n.type}
                        </span>
                        {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)' }} />}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{n.title}</span>
                      {n.description && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{n.description}</span>}
                    </div>
                  ))}
                </div>
                <div className="pd-item" onClick={() => { navigate('/notifications'); setNotifOpen(false); }}>
                  View all notifications
                </div>
              </div>
            )}
          </div>
          <div className="profile-menu" ref={profileRef}>
            <div className="profile-avatar" onClick={() => setProfileOpen(!profileOpen)}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : initials}
            </div>
            {profileOpen && (
              <div className="profile-dropdown">
                <div className="pd-header">
                  <p>{user?.email}</p>
                  <span>Farmer</span>
                </div>
                <button className="pd-item" onClick={() => { navigate('/settings'); setProfileOpen(false); }}>
                  <Icons.Settings size={16} /> Settings
                </button>
                <button className="pd-item" onClick={handleSignOut}>
                  <Icons.LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      {/* AI Assistant FAB — hide for admins */}
      {!isAdmin && (
        <button className="ai-fab" onClick={() => setAssistantOpen(true)} aria-label="Open AI assistant">
          <Icons.Lightbulb size={20} />
        </button>
      )}
      {!isAdmin && <AIAssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />}
    </div>
  );
}
