import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../../lib/icons';
import { Moon, Sun, Menu, Search, Bell, Settings, LogOut, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
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
  onOpenMobileNav: () => void;
  user: any;
  role: string | null;
  signOut: () => Promise<void>;
  notifications: Notification[];
  animals: Animal[];
  inventory: InventoryItem[];
  vaccinations: Vaccination[];
  breedingRecords: BreedingRecord[];
  onRefreshData?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  onOpenMobileNav,
  user,
  role,
  signOut,
  notifications = [],
  animals = [],
  inventory = [],
  vaccinations = [],
  breedingRecords = [],
  onRefreshData,
}: AppHeaderProps) {
  const navigate = useNavigate();

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

  const isAdmin       = role === 'system_admin';
  const isSuperAdmin  = role === 'super_admin';
  const isFarmManager = role === 'farm_manager' || (!isAdmin && !isSuperAdmin);

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
          type: 'Animals',
          label: `${a.name} — ${a.tag_id}`,
          sub: `${a.species} · ${a.breed ?? 'Unknown breed'}`,
          link: `/animals/${a.id}`,
        })
      );

    inventory
      .filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((i) =>
        results.push({
          type: 'Inventory',
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
          type: 'Vaccinations',
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

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', unread.map((n) => n.id));
    onRefreshData?.();
  };

  const unreadNotifs = notifications.filter((n) => !n.read).length;
  const initials  = user?.email ? user.email[0].toUpperCase() : 'F';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <header className="topbar">
      {/* Topbar Left: Menu Toggle + Title */}
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={onOpenMobileNav} aria-label="Open navigation menu">
          <Menu size={20} />
        </button>
        <div className="topbar-title">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      {/* Topbar Search */}
      <div className="topbar-search" ref={searchRef}>
        <Search className="search-icon" size={16} />
        <input
          type="text"
          placeholder="Search animals, inventory, vaccines..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
            aria-label="Clear search"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted, #64748B)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 4px',
            }}
          >
            <X size={14} />
          </button>
        )}

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
          </div>
        )}
      </div>

      {/* Topbar Right Actions */}
      <div className="topbar-actions">
        {/* Light / Dark Mode Toggle */}
        <button
          className="topbar-icon-btn"
          onClick={() => setDarkMode((d) => !d)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications Dropdown */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="topbar-icon-btn"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadNotifs > 0 && <span className="notif-dot" />}
          </button>
          {notifOpen && (
            <div className="profile-dropdown notif-dropdown">
              <div className="pd-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontWeight: 700 }}>Notifications</p>
                {unreadNotifs > 0 && (
                  <button className="btn-ghost btn-sm" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {notifications.length === 0 && (
                  <div className="search-empty">No notifications</div>
                )}
                {notifications.slice(0, 10).map((n) => (
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
                      <span
                        className={`badge badge-${
                          n.priority === 'Critical'
                            ? 'red'
                            : n.priority === 'Warning'
                            ? 'orange'
                            : n.priority === 'Success'
                            ? 'green'
                            : 'blue'
                        }`}
                      >
                        {n.type}
                      </span>
                      {!n.read && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: 'var(--color-primary, #43A047)',
                          }}
                        />
                      )}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{n.title}</span>
                    {n.description && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #667085)' }}>
                        {n.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div
                className="pd-item"
                onClick={() => {
                  navigate('/notifications');
                  setNotifOpen(false);
                }}
              >
                View all notifications
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
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              initials
            )}
          </div>
          {profileOpen && (
            <div className="profile-dropdown">
              <div className="pd-header">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary, #1F2933)', wordBreak: 'break-all' }}>
                  {user?.email}
                </p>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: isSuperAdmin
                      ? 'rgba(139,92,246,0.15)'
                      : isAdmin
                      ? 'rgba(217,45,32,0.12)'
                      : '#E8F5E9',
                    color: isSuperAdmin ? '#7C3AED' : isAdmin ? '#D92D20' : '#2E7D32',
                    border: isSuperAdmin
                      ? '1px solid rgba(139,92,246,0.30)'
                      : isAdmin
                      ? '1px solid rgba(217,45,32,0.25)'
                      : '1px solid rgba(67,160,71,0.25)',
                  }}
                >
                  {isSuperAdmin ? 'Super Administrator' : isAdmin ? 'System Administrator' : 'Farm Manager'}
                </span>
              </div>
              {isFarmManager && (
                <button
                  className="pd-item"
                  onClick={() => {
                    navigate('/settings');
                    setProfileOpen(false);
                  }}
                >
                  <Settings size={16} /> Settings
                </button>
              )}
              <button className="pd-item" onClick={handleSignOut}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
