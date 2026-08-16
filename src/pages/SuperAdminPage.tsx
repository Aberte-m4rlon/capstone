/**
 * SuperAdminPage — Full system control for super_admin role.
 * Uses the service-role Supabase client (same pattern as AdminPage).
 * All permission checks are done server-side via the service key bypass + role validation.
 */
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useNavigate } from 'react-router-dom';
import {
  Users, PawPrint, ShieldAlert, ShieldCheck, RefreshCw, Trash2, BarChart3,
  CheckCircle, Mail, HeartPulse, Syringe, Crown, UserCog, Database,
  Activity, AlertTriangle, Settings, ChevronDown, ChevronRight, Pencil, X,
} from 'lucide-react';
import { FilterToolbar, FilterSearch } from '../components/FilterToolbar';
import { formatDate } from '../lib/analytics';
import { type UserRole, ALL_ROLES, getRoleLabel, SUPER_ADMIN_EMAILS_FALLBACK } from '../lib/auth';

// ── Service client (same as AdminPage) ────────────────────────────────────────
const svcClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  animal_count: number;
  health_count: number;
  farm_name: string | null;
  role: UserRole;
  is_active: boolean;
  full_name: string | null;
}

type Tab = 'dashboard' | 'users' | 'system';

// ── Role badge colours ─────────────────────────────────────────────────────────
function roleBadge(role: UserRole) {
  if (role === 'super_admin') return { bg: 'rgba(139,92,246,0.15)', color: '#7C3AED', border: 'rgba(139,92,246,0.35)', label: 'Super Admin' };
  if (role === 'system_admin') return { bg: 'rgba(217,45,32,0.12)', color: '#D92D20', border: 'rgba(217,45,32,0.25)', label: 'System Admin' };
  return { bg: 'rgba(255,106,42,0.12)', color: '#FF7A18', border: 'rgba(255,106,42,0.25)', label: 'Farm Manager' };
}

// ── Component ──────────────────────────────────────────────────────────────────
export function SuperAdminPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [stats, setStats] = useState({ totalUsers: 0, totalAnimals: 0, totalHealth: 0, activeFarms: 0, superAdmins: 0, sysAdmins: 0, farmManagers: 0 });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editRoleUser, setEditRoleUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('farm_manager');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserRow | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  const isSuperAdmin = role === 'super_admin';

  useEffect(() => {
    if (isSuperAdmin) loadUsers();
  }, [isSuperAdmin]);

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, textAlign: 'center', padding: 24 }}>
        <ShieldAlert size={52} color="#EF4444" />
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 360 }}>
          This area requires Super Administrator privileges. Contact your administrator if you believe this is an error.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: authData, error } = await svcClient.auth.admin.listUsers({ perPage: 500 });
      if (error) throw error;

      const [animalsRes, healthRes, settingsRes, profilesRes] = await Promise.all([
        svcClient.from('animals').select('user_id'),
        svcClient.from('health_records').select('user_id'),
        svcClient.from('settings').select('user_id, farm_name'),
        svcClient.from('profiles').select('id, role, full_name, is_active'),
      ]);

      const animalMap: Record<string, number> = {};
      const healthMap: Record<string, number> = {};
      const farmMap: Record<string, string> = {};
      const profileMap: Record<string, { role: UserRole; is_active: boolean; full_name: string | null }> = {};

      animalsRes.data?.forEach((a: any) => { animalMap[a.user_id] = (animalMap[a.user_id] || 0) + 1; });
      healthRes.data?.forEach((h: any) => { healthMap[h.user_id] = (healthMap[h.user_id] || 0) + 1; });
      settingsRes.data?.forEach((s: any) => { if (s.farm_name) farmMap[s.user_id] = s.farm_name; });
      profilesRes.data?.forEach((p: any) => {
        profileMap[p.id] = { role: p.role as UserRole, is_active: p.is_active, full_name: p.full_name };
      });

      const rows: UserRow[] = (authData?.users || []).map((u: any) => {
        const prof = profileMap[u.id];
        // Determine role: profile table > SUPER_ADMIN_EMAILS fallback
        let resolvedRole: UserRole = prof?.role ?? 'farm_manager';
        if (!prof && SUPER_ADMIN_EMAILS_FALLBACK.includes((u.email ?? '').toLowerCase())) {
          resolvedRole = 'super_admin';
        }
        return {
          id: u.id,
          email: u.email || 'No email',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || null,
          animal_count: animalMap[u.id] || 0,
          health_count: healthMap[u.id] || 0,
          farm_name: farmMap[u.id] || null,
          role: resolvedRole,
          is_active: prof?.is_active ?? true,
          full_name: prof?.full_name ?? null,
        };
      });

      setUsers(rows);
      setStats({
        totalUsers: rows.length,
        totalAnimals: Object.values(animalMap).reduce((s, v) => s + v, 0),
        totalHealth: Object.values(healthMap).reduce((s, v) => s + v, 0),
        activeFarms: rows.filter(u => u.animal_count > 0).length,
        superAdmins: rows.filter(u => u.role === 'super_admin').length,
        sysAdmins: rows.filter(u => u.role === 'system_admin').length,
        farmManagers: rows.filter(u => u.role === 'farm_manager').length,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load users.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Role change ────────────────────────────────────────────────────────────
  const handleRoleChange = async () => {
    if (!editRoleUser || !newRole) return;

    // Safety: prevent removing the last super admin
    if (editRoleUser.role === 'super_admin' && newRole !== 'super_admin') {
      const superAdminCount = users.filter(u => u.role === 'super_admin').length;
      if (superAdminCount <= 1) {
        toast('Cannot remove the last Super Administrator. Create another one first.', 'error');
        return;
      }
    }

    // Safety: prevent self-demotion
    if (editRoleUser.id === user?.id && newRole !== 'super_admin') {
      toast('You cannot change your own Super Admin role.', 'error');
      return;
    }

    setSavingRole(true);
    try {
      const { error } = await svcClient
        .from('profiles')
        .upsert({ id: editRoleUser.id, role: newRole, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
      toast(`Role updated to ${getRoleLabel(newRole)} for ${editRoleUser.email}.`, 'success');
      setEditRoleUser(null);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update role.', 'error');
    } finally {
      setSavingRole(false);
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const toggleActive = async (u: UserRow) => {
    if (u.id === user?.id) { toast('You cannot deactivate your own account.', 'error'); return; }
    if (u.role === 'super_admin') {
      const activeSupers = users.filter(x => x.role === 'super_admin' && x.is_active).length;
      if (activeSupers <= 1 && u.is_active) {
        toast('Cannot deactivate the last active Super Administrator.', 'error');
        return;
      }
    }
    try {
      const { error } = await svcClient
        .from('profiles')
        .upsert({ id: u.id, is_active: !u.is_active, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
      toast(`Account ${!u.is_active ? 'activated' : 'deactivated'}.`, 'success');
      loadUsers();
    } catch (err) {
      toast('Failed to update account status.', 'error');
    }
  };

  // ── Delete user ────────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    if (confirmDeleteUser.id === user?.id) { toast('You cannot delete your own account.', 'error'); return; }
    if (confirmDeleteUser.role === 'super_admin') {
      const superCount = users.filter(u => u.role === 'super_admin').length;
      if (superCount <= 1) { toast('Cannot delete the last Super Administrator.', 'error'); return; }
    }
    try {
      const { error } = await svcClient.auth.admin.deleteUser(confirmDeleteUser.id);
      if (error) throw error;
      toast(`User ${confirmDeleteUser.email} deleted.`, 'success');
      setConfirmDeleteUser(null);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete user.', 'error');
    }
  };

  const sendReset = async (email: string) => {
    try {
      const { error } = await svcClient.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast(`Password reset sent to ${email}.`, 'success');
    } catch (err) {
      toast('Failed to send reset email.', 'error');
    }
  };

  // ── Filters ────────────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.farm_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' as const, transition: 'all 0.18s',
    background: tab === t ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
    boxShadow: tab === t ? '0 4px 12px rgba(255,59,48,0.30)' : 'none',
  });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', width: '100%', minWidth: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', margin: 0 }}>
            <Crown size={22} color="#7C3AED" /> Super Admin Panel
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Full system control — logged in as <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadUsers} disabled={loading}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--glass-surface)', backdropFilter: 'var(--glass-blur-sm)', WebkitBackdropFilter: 'var(--glass-blur-sm)', border: '1px solid var(--glass-border)', borderRadius: 999, padding: 5, width: 'fit-content', flexWrap: 'wrap' }}>
        {(['dashboard', 'users', 'system'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>
            {t === 'dashboard' ? '📊 Dashboard' : t === 'users' ? '👥 User Management' : '⚙️ System'}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <>
          {/* KPI row */}
          <div className="kpi-grid section-gap">
            {[
              { icon: <Users size={18} />, color: 'blue', value: stats.totalUsers, label: 'Total Users' },
              { icon: <Crown size={18} />, color: 'red', value: stats.superAdmins, label: 'Super Admins' },
              { icon: <ShieldCheck size={18} />, color: 'orange', value: stats.sysAdmins, label: 'System Admins' },
              { icon: <PawPrint size={18} />, color: 'green', value: stats.totalAnimals, label: 'Total Animals' },
              { icon: <HeartPulse size={18} />, color: 'blue', value: stats.totalHealth, label: 'Health Records' },
              { icon: <CheckCircle size={18} />, color: 'orange', value: stats.activeFarms, label: 'Active Farms' },
            ].map((s, i) => (
              <div key={i} className="kpi-card">
                <div className="kpi-top"><div className={`kpi-icon ${s.color}`}>{s.icon}</div></div>
                <div className="kpi-value">{loading ? '—' : s.value}</div>
                <div className="kpi-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Role breakdown */}
          <div className="card section-gap">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCog size={16} color="var(--accent-orange)" /> Role Distribution
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { role: 'super_admin' as UserRole, count: stats.superAdmins },
                { role: 'system_admin' as UserRole, count: stats.sysAdmins },
                { role: 'farm_manager' as UserRole, count: stats.farmManagers },
              ].map(({ role: r, count }) => {
                const b = roleBadge(r);
                return (
                  <div key={r} style={{ flex: '1 1 160px', padding: '16px 20px', borderRadius: 14, background: b.bg, border: `1px solid ${b.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: b.color, lineHeight: 1 }}>{loading ? '—' : count}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{b.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent users */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="var(--accent-orange)" /> Recent Registrations
            </div>
            {loading ? <div className="loading-center"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Email</th><th>Role</th><th>Farm</th><th>Registered</th><th>Last Login</th></tr></thead>
                  <tbody>
                    {[...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8).map(u => {
                      const b = roleBadge(u.role);
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{u.email}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontSize: 11, fontWeight: 700 }}>
                              {b.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.farm_name ?? '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(u.created_at)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── USER MANAGEMENT TAB ── */}
      {tab === 'users' && (
        <>
          <FilterToolbar rightAction={
            <span style={{ fontSize: 12, color: 'var(--filter-secondary)', fontWeight: 600 }}>{filtered.length} / {users.length} users</span>
          }>
            <FilterSearch placeholder="Search email, name, farm..." value={search} onChange={setSearch} minWidth={220} />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{ background: 'var(--filter-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--filter-text)', cursor: 'pointer', outline: 'none' }}
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="system_admin">System Admin</option>
              <option value="farm_manager">Farm Manager</option>
            </select>
          </FilterToolbar>

          <div className="card">
            {loading ? <div className="loading-center"><div className="spinner" /></div> : filtered.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Users size={24} /></div><h4>No users found</h4><p>Try a different filter.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th><th>Role</th><th>Status</th><th>Farm</th><th>Animals</th><th>Last Login</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => {
                      const b = roleBadge(u.role);
                      const isMe = u.id === user?.id;
                      const isExpanded = expandedUser === u.id;
                      return (
                        <>
                          <tr key={u.id} style={{ cursor: 'pointer', opacity: u.is_active ? 1 : 0.55 }} onClick={() => setExpandedUser(isExpanded ? null : u.id)}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.full_name || u.email}</div>
                                  {u.full_name && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>}
                                  {isMe && <span className="badge badge-blue" style={{ fontSize: 10 }}>You</span>}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontSize: 11, fontWeight: 700 }}>
                                {b.label}
                              </span>
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: u.is_active ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.10)', color: u.is_active ? '#16A34A' : '#EF4444', border: u.is_active ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(239,68,68,0.25)' }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                                {u.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.farm_name ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: u.animal_count > 0 ? 700 : 400 }}>{u.animal_count}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</td>
                            <td onClick={e => e.stopPropagation()}>
                              <div className="row-actions">
                                <button className="btn btn-ghost btn-sm" title="Change role" onClick={() => { setEditRoleUser(u); setNewRole(u.role); }}><UserCog size={13} /></button>
                                <button className="btn btn-ghost btn-sm" title={u.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(u)} style={{ color: u.is_active ? '#F59E0B' : '#16A34A' }}>{u.is_active ? <X size={13} /> : <CheckCircle size={13} />}</button>
                                <button className="btn btn-ghost btn-sm" title="Send password reset" onClick={() => sendReset(u.email)}><Mail size={13} /></button>
                                {!isMe && u.role !== 'super_admin' && (
                                  <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setConfirmDeleteUser(u)} style={{ color: '#EF4444' }}><Trash2 size={13} /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${u.id}-exp`}>
                              <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 20px' }}>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
                                  <span><strong>User ID:</strong> <code style={{ fontSize: 11, opacity: 0.7 }}>{u.id.slice(0, 16)}…</code></span>
                                  <span><strong>Registered:</strong> {formatDate(u.created_at)}</span>
                                  <span><strong>Health Records:</strong> {u.health_count}</span>
                                  {u.farm_name && <span><strong>Farm:</strong> {u.farm_name}</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── SYSTEM TAB ── */}
      {tab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* System health */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color="var(--accent-orange)" /> System Health
            </div>
            {[
              { label: 'Authentication', status: 'Operational', ok: true },
              { label: 'Database', status: 'Connected', ok: true },
              { label: 'AI Service', status: 'See AI Cloud', ok: null },
              { label: 'Application', status: 'Operational', ok: true },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: s.ok === null ? '#F59E0B' : s.ok ? '#16A34A' : '#EF4444' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
                  {s.status}
                </span>
              </div>
            ))}
          </div>

          {/* Role management info */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color="var(--accent-orange)" /> Role Hierarchy
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { role: 'super_admin' as UserRole, desc: 'Full system access. Manages all users, roles, and system settings.' },
                { role: 'system_admin' as UserRole, desc: 'Manages registered users and views farm data system-wide.' },
                { role: 'farm_manager' as UserRole, desc: 'Manages their own farm — animals, health, breeding, inventory, and more.' },
              ].map(({ role: r, desc }) => {
                const b = roleBadge(r);
                return (
                  <div key={r} style={{ padding: '12px 16px', borderRadius: 12, background: b.bg, border: `1px solid ${b.border}` }}>
                    <div style={{ fontWeight: 700, color: b.color, fontSize: 13, marginBottom: 4 }}>{b.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Database migration note */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} color="var(--accent-orange)" /> Database Migration Required
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
              To enable full Super Admin features, run this SQL migration in your Supabase dashboard:
            </p>
            <pre style={{ fontSize: 11, padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', overflowX: 'auto', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{`-- 1. Add super_admin to the role CHECK constraint
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('farm_manager', 'system_admin', 'super_admin'));

-- 2. Promote your account to super_admin
update public.profiles
  set role = 'super_admin'
  where id = (
    select id from auth.users
    where email = 'marlonaberte00@gmail.com'
  );

-- 3. Allow super_admin to manage all profiles (for role assignment)
create policy "Super admin manages profiles"
  on public.profiles for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );`}</pre>
          </div>
        </div>
      )}

      {/* ── Role change modal ── */}
      {editRoleUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCog size={18} color="var(--accent-orange)" /> Change Role
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {editRoleUser.email}
            </p>
            <div className="form-group">
              <label className="form-label">Current Role</label>
              <div style={{ fontSize: 13, fontWeight: 700, color: roleBadge(editRoleUser.role).color, marginBottom: 14 }}>
                {roleBadge(editRoleUser.role).label}
              </div>
              <label className="form-label">New Role <span className="req">*</span></label>
              <select className="form-select" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {newRole === 'super_admin' && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={14} color="#7C3AED" style={{ flexShrink: 0, marginTop: 1 }} />
                Super Admin has full access to AlpasFarm and system administration. Only grant this to trusted users.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditRoleUser(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRoleChange} disabled={savingRole || newRole === editRoleUser.role}>
                {savingRole ? 'Saving…' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {confirmDeleteUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 8 }}><Trash2 size={18} /> Delete User</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>Delete <strong>{confirmDeleteUser.email}</strong>?</p>
            <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 20 }}>⚠️ This permanently deletes the user and ALL their farm data. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDeleteUser(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteUser}><Trash2 size={14} /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
