import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Moon,
  Sun,
  Search,
  Bell,
  Settings,
  LogOut,
  User,
  X,
  CheckCircle2,
  HeartPulse,
  Syringe,
  Heart,
  Scale,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { GoatIcon } from './GoatIcon';
import type { Animal, InventoryItem, Vaccination, BreedingRecord, Notification } from '../../types';

export interface SearchResult {
  type: string;
  label: string;
  sub: string;
  link: string;
}

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onOpenMobileNav?: () => void;
  user: any;
  role: string | null;
  signOut: () => Promise<void>;
  notifications?: Notification[];
  animals?: Animal[];
  inventory?: InventoryItem[];
  vaccinations?: Vaccination[];
  breedingRecords?: BreedingRecord[];
  onRefreshData?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  onOpenMobileNav,
  user,
  role,
  signOut,
  animals = [],
  inventory = [],
  vaccinations = [],
  breedingRecords = [],
}: AppHeaderProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    handleNotificationClick,
    markAllAsRead,
  } = useNotifications();

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

  // ── Search logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    animals
      .filter((a) => !a.archived)
      .filter((a) => a.name.toLowerCase().includes(q) || a.tag_id.toLowerCase().includes(q) || (a.breed ?? '').toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((a) =>
        results.push({
          type: 'Mga Hayop',
          label: `${a.name} — ${a.tag_id}`,
          sub: `${a.species === 'Goat' ? 'Kambing' : 'Tupa'} · ${a.breed ?? 'Walang lahi'}`,
          link: `/animals/${a.id}`,
        })
      );

    inventory
      .filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((i) =>
        results.push({
          type: 'Mga Gamit at Stock',
          label: i.name,
          sub: `${i.category} · ${i.quantity} ${i.unit}`,
          link: '/inventory',
        })
      );

    vaccinations
      .filter((v) => v.vaccine_name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((v) => {
        const animal = animals.find((a) => a.id === v.animal_id);
        results.push({
          type: 'Mga Bakuna',
          label: v.vaccine_name,
          sub: animal ? `${animal.name} · ${v.date_given}` : v.date_given,
          link: '/vaccinations',
        });
      });

    breedingRecords
      .filter((b) => b.status.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((b) => {
        const animal = animals.find((a) => a.id === b.animal_id);
        results.push({
          type: 'Breeding',
          label: animal ? animal.name : 'Breeding record',
          sub: `${b.status} · ${b.mating_date}`,
          link: '/breeding',
        });
      });

    setSearchResults(results);
    setSearchOpen(results.length > 0);
  }, [searchQuery, animals, inventory, vaccinations, breedingRecords]);

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

  const handleSignOut = async () => {
    setProfileOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  const getNotificationIcon = (type: string) => {
    const t = (type || '').toLowerCase();
    switch (t) {
      case 'health':
        return <HeartPulse size={16} color="#EF4444" />;
      case 'expiry':
        return <AlertTriangle size={16} color="#F59E0B" />;
      case 'vaccination':
      case 'vaccine':
        return <Syringe size={16} color="#238B45" />;
      case 'breeding':
        return <Heart size={16} color="#238B45" />;
      case 'weight':
        return <Scale size={16} color="#238B45" />;
      case 'inventory':
        return <Package size={16} color="#238B45" />;
      default:
        return <Bell size={16} color="#238B45" />;
    }
  };

  const initials  = user?.email ? user.email[0].toUpperCase() : 'F';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <header className="topbar">
      {/* ── Left Section: Mobile Brand / Desktop Page Heading ── */}
      <div className="topbar-left">
        {/* Mobile Header Branding: ALPASFARM (No hamburger menu) */}
        <div
          className="topbar-mobile-brand"
          onClick={() => navigate(role === 'super_admin' ? '/super-admin' : '/dashboard')}
          role="button"
          tabIndex={0}
          aria-label="AlpasFarm Home"
        >
          <div className="topbar-mobile-logo-wrap">
            <GoatIcon size={20} color="#238B45" strokeWidth={2.4} />
          </div>
          <span className="topbar-mobile-brand-title">ALPASFARM</span>
        </div>

        {/* Desktop Heading Group */}
        <div className="topbar-heading-group">
          <h1 className="topbar-title">{title}</h1>
          {subtitle && <p className="topbar-sub">{subtitle}</p>}
        </div>
      </div>

      {/* ── Center Section: Centered Responsive Global Search Bar ── */}
      <div className="topbar-center" ref={searchRef}>
        <div className="search-box">
          <Search size={17} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Maghanap ng hayop, ID, gamit, o record..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            aria-label="Global search"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setSearchOpen(false);
              }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchOpen && searchResults.length > 0 && (
          <div className="search-dropdown">
            {Object.entries(groupedResults).map(([group, items]) => (
              <div key={group} className="search-group">
                <span className="search-group-title">{group}</span>
                {items.map((res, i) => (
                  <div
                    key={i}
                    className="search-result-item"
                    onClick={() => {
                      navigate(res.link);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <span className="search-res-label">{res.label}</span>
                    <span className="search-res-sub">{res.sub}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right Section: Action Controls (Theme, Notifications, Profile) ── */}
      <div className="topbar-right">
        {/* Dark Mode Toggle */}
        <button
          type="button"
          className="topbar-icon-btn theme-toggle-btn"
          onClick={() => setDarkMode(!darkMode)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        {/* Notifications Dropdown */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="topbar-icon-btn notif-bell-btn"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
            title="Notifications"
          >
            <Bell size={19} />
            {unreadCount > 0 && (
              <span className="notif-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="profile-dropdown notif-dropdown">
              <div className="pd-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13.5, margin: 0, color: 'var(--color-text-primary)' }}>Mga Paalala</p>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {unreadCount > 0 ? `${unreadCount} bago` : 'Walang bagong paalala'}
                  </span>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAllAsRead();
                    }}
                    style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 8 }}
                  >
                    <CheckCircle2 size={13} />
                    I-marka bilang nabasa
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {notifications.length === 0 && (
                  <div className="search-empty" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    Wala pang alerts.
                  </div>
                )}
                {notifications.slice(0, 10).map((n) => {
                  const isUnread = !n.read && !n.is_read;
                  return (
                    <div
                      key={n.id}
                      className={`pd-item notif-dropdown-item ${isUnread ? 'notif-item-unread' : 'notif-item-read'}`}
                      style={{
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 3,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))',
                        background: isUnread ? 'rgba(67, 160, 71, 0.08)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      onClick={() => {
                        handleNotificationClick(n, navigate);
                        setNotifOpen(false);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          {getNotificationIcon(n.type)}
                        </div>
                        <span
                          className={`badge badge-${
                            n.priority === 'Critical' || n.priority === 'critical'
                              ? 'red'
                              : n.priority === 'Warning' || n.priority === 'high'
                              ? 'orange'
                              : n.priority === 'Success'
                              ? 'green'
                              : 'green'
                          }`}
                          style={{ fontSize: 10, padding: '1px 6px' }}
                        >
                          {n.type}
                        </span>
                        {isUnread && (
                          <span
                            className="notif-unread-dot"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#238B45',
                              flexShrink: 0,
                              marginLeft: 'auto',
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontWeight: isUnread ? 700 : 500,
                          fontSize: 12.5,
                          color: 'var(--color-text-primary, #0f172a)',
                          lineHeight: 1.3,
                        }}
                      >
                        {n.title}
                      </span>
                      {(n.description || n.message) && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-secondary, #667085)',
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {n.description || n.message}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div
                className="pd-item"
                style={{
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 12,
                  color: 'var(--color-primary, #43A047)',
                  borderTop: '1px solid var(--border-light, rgba(0,0,0,0.06))',
                  marginTop: 2,
                  padding: '10px 14px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  navigate('/notifications');
                  setNotifOpen(false);
                }}
              >
                Tingnan ang lahat ng paalala
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="profile-menu" ref={profileRef}>
          <div
            className="profile-avatar"
            onClick={() => setProfileOpen(!profileOpen)}
            role="button"
            aria-label="User profile"
            title={user?.user_metadata?.full_name || user?.email || 'User Profile'}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {profileOpen && (
            <div className="profile-dropdown">
              <div className="pd-header">
                <p>{user?.user_metadata?.full_name || user?.email || 'User'}</p>
                <span>{role ? role.replace('_', ' ').toUpperCase() : 'FARM USER'}</span>
              </div>
              <button
                type="button"
                className="pd-item"
                onClick={() => {
                  navigate('/settings');
                  setProfileOpen(false);
                }}
              >
                <User size={16} />
                <span>Aking Profile</span>
              </button>
              <button
                type="button"
                className="pd-item"
                onClick={() => {
                  navigate('/settings');
                  setProfileOpen(false);
                }}
              >
                <Settings size={16} />
                <span>Mga Setting</span>
              </button>
              <button type="button" className="pd-item text-danger" onClick={handleSignOut}>
                <LogOut size={16} />
                <span>Mag-logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
