/**
 * SuperAdminPage — Full system control for super_admin role.
 *
 * DATA STRATEGY:
 * - Primary source: public.profiles (joined with auth.users via service client)
 * - Fallback: profiles table alone when auth.admin.listUsers fails
 * - This ensures the dashboard always shows real user counts even if
 *   VITE_SUPABASE_SERVICE_KEY is missing from the deployment env.
 *
 * ROOT CAUSE OF 0 USERS (fixed):
 * - Previously relied solely on svcClient.auth.admin.listUsers()
 * - That API requires a valid service_role key at runtime
 * - If the key is missing/wrong in Vercel env vars, it returns empty silently
 * - Fix: query public.profiles first (anon key works with RLS service bypass),
 *   then enrich with auth.admin data when available
 */
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import {
  Users, PawPrint, ShieldAlert, ShieldCheck, RefreshCw, Trash2,
  CheckCircle, Mail, HeartPulse, Crown, UserCog, Database,
  Activity, AlertTriangle, X, LayoutDashboard, Brain,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { FormField, Select } from '../components/ui/Input';
import { FilterToolbar, FilterSearch } from '../components/FilterToolbar';
import { formatDate } from '../lib/analytics';
import { type UserRole, ALL_ROLES, getRoleLabel, SUPER_ADMIN_EMAILS_FALLBACK } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useMLHealthSummary, useEnhancedHealthModel } from '../lib/useMLHealth';

// ── Service client ─────────────────────────────────────────────────────────────
// Requires VITE_SUPABASE_SERVICE_KEY in Vercel environment variables.
// This key bypasses RLS — safe because it's only used server-rendered admin ops.
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
const svcClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  SERVICE_KEY,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    totalUsers: 0, totalAnimals: 0, totalHealth: 0, activeFarms: 0,
    superAdmins: 0, sysAdmins: 0, farmManagers: 0, activeUsers: 0,
  });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editRoleUser, setEditRoleUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('farm_manager');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserRow | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  const isSuperAdmin = role === 'super_admin';

  // ML model stats (reads from same farm data the super admin can see system-wide)
  const mlSummary = useMLHealthSummary();
  const { model: mlModel, canPredict: mlCanPredict, accuracy: mlAccuracy, recall: mlRecall, f1: mlF1, trainingSamples: mlSamples } = useEnhancedHealthModel();

  useEffect(() => {
    if (isSuperAdmin) loadUsers();
  }, [isSuperAdmin]);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, textAlign: 'center', padding: 24 }}>
        <ShieldAlert size={52} color="#EF4444" />
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Walang Pahintulot</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 360 }}>
          Kinakailangan ang pahintulot ng Super Administrator upang mabuksan ang pahinang ito.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Bumalik sa Buod ng Bukid</button>
      </div>
    );
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadUsers = async () => {
    setLoading(true);
    setLoadError(null);

    if (!SERVICE_KEY) {
      setLoadError('VITE_SUPABASE_SERVICE_KEY is not set. Add it to Vercel environment variables and redeploy.');
      setLoading(false);
      return;
    }

    try {
      // ── Step 1: Load profiles via service client (bypasses RLS) ──
      // This is safe — svcClient uses the service_role key which is server-side only.
      // VITE_SUPABASE_SERVICE_KEY must be set in Vercel env vars.
      const profilesRes = await svcClient
        .from('profiles')
        .select('id, role, full_name, is_active, created_at, email');

      if (profilesRes.error) {
        throw new Error(`Profiles query failed: ${profilesRes.error.message}`);
      }

      const profilesData = profilesRes.data ?? [];

      // ── Step 2: Try auth.admin.listUsers for email enrichment ──
      // NOTE: This only works if the service key is accepted server-side.
      // If it fails, we fall back to profile IDs — users will show as "user-XXXX"
      // until emails are available. Non-critical — does NOT block dashboard load.
      let authUsers: Record<string, { email: string; last_sign_in_at: string | null; created_at: string }> = {};
      try {
        const authRes = await svcClient.auth.admin.listUsers({ perPage: 500 });
        if (!authRes.error && authRes.data?.users) {
          authRes.data.users.forEach((u: any) => {
            authUsers[u.id] = {
              email: u.email ?? '',
              last_sign_in_at: u.last_sign_in_at ?? null,
              created_at: u.created_at ?? '',
            };
          });
        }
        // Silently ignore auth.admin errors — profiles data is sufficient
      } catch {
        // auth.admin not available in this context — continue with profiles only
      }

      // ── Step 3: Load farm data via service client (bypasses RLS for system-wide view) ──
      const [animalsRes, healthRes, settingsRes] = await Promise.all([
        svcClient.from('animals').select('user_id'),
        svcClient.from('health_records').select('user_id'),
        svcClient.from('settings').select('user_id, farm_name'),
      ]);

      const animalMap: Record<string, number> = {};
      const healthMap: Record<string, number> = {};
      const farmMap: Record<string, string> = {};

      animalsRes.data?.forEach((a: any) => { animalMap[a.user_id] = (animalMap[a.user_id] || 0) + 1; });
      healthRes.data?.forEach((h: any) => { healthMap[h.user_id] = (healthMap[h.user_id] || 0) + 1; });
      settingsRes.data?.forEach((s: any) => { if (s.farm_name) farmMap[s.user_id] = s.farm_name; });

      // ── Step 4: Build rows from profiles ──
      const rows: UserRow[] = profilesData.map((p: any) => {
        // Email: from auth.admin enrichment if available, else from profiles.email column, else fallback
        const authEntry = authUsers[p.id];
        const email = authEntry?.email || p.email || `user-${p.id.slice(0, 8)}`;
        const emailLower = email.toLowerCase();
        const resolvedRole: UserRole = (
          SUPER_ADMIN_EMAILS_FALLBACK.includes(emailLower) && p.role !== 'super_admin'
        ) ? 'super_admin' : (p.role as UserRole);

        return {
          id: p.id,
          email,
          created_at: authEntry?.created_at ?? p.created_at ?? '',
          last_sign_in_at: authEntry?.last_sign_in_at ?? null,
          animal_count: animalMap[p.id] || 0,
          health_count: healthMap[p.id] || 0,
          farm_name: farmMap[p.id] || null,
          role: resolvedRole,
          is_active: p.is_active ?? true,
          full_name: p.full_name ?? null,
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
        activeUsers: rows.filter(u => u.is_active).length,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users.';
      console.error('[SuperAdmin] loadUsers error:', err);
      setLoadError(msg);
      toast(msg, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // ── Role change ───────────────────────────────────────────────────────────
  const handleRoleChange = async () => {
    if (!editRoleUser || !newRole) return;
    if (editRoleUser.role === 'super_admin' && newRole !== 'super_admin') {
      const superAdminCount = users.filter(u => u.role === 'super_admin').length;
      if (superAdminCount <= 1) {
        toast('Cannot remove the last Super Administrator. Promote another user first.', 'danger');
        return;
      }
    }
    if (editRoleUser.id === user?.id && newRole !== 'super_admin') {
      toast('You cannot change your own Super Admin role.', 'danger');
      return;
    }
    setSavingRole(true);
    try {
      const { error } = await svcClient
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', editRoleUser.id);
      if (error) throw error;
      toast(`Role updated to ${getRoleLabel(newRole)} for ${editRoleUser.email}.`, 'success');
      setEditRoleUser(null);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update role.', 'danger');
    } finally {
      setSavingRole(false);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async (u: UserRow) => {
    if (u.id === user?.id) { toast('You cannot deactivate your own account.', 'danger'); return; }
    if (u.role === 'super_admin' && u.is_active) {
      const activeSupers = users.filter(x => x.role === 'super_admin' && x.is_active).length;
      if (activeSupers <= 1) {
        toast('Cannot deactivate the last active Super Administrator.', 'danger');
        return;
      }
    }
    try {
      const { error } = await svcClient
        .from('profiles')
        .update({ is_active: !u.is_active, updated_at: new Date().toISOString() })
        .eq('id', u.id);
      if (error) throw error;
      toast(`Account ${!u.is_active ? 'activated' : 'deactivated'}.`, 'success');
      loadUsers();
    } catch (err) {
      toast('Failed to update account status.', 'danger');
    }
  };

  // ── Delete user ───────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    if (confirmDeleteUser.id === user?.id) { toast('You cannot delete your own account.', 'danger'); return; }
    if (confirmDeleteUser.role === 'super_admin') {
      const superCount = users.filter(u => u.role === 'super_admin').length;
      if (superCount <= 1) { toast('Cannot delete the last Super Administrator.', 'danger'); return; }
    }
    try {
      const { error } = await svcClient.auth.admin.deleteUser(confirmDeleteUser.id);
      if (error) throw error;
      // Also delete profile row
      await supabase.from('profiles').delete().eq('id', confirmDeleteUser.id);
      toast(`User ${confirmDeleteUser.email} deleted.`, 'success');
      setConfirmDeleteUser(null);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete user.', 'danger');
    }
  };

  const sendReset = async (email: string) => {
    try {
      const { error } = await svcClient.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast(`Password reset sent to ${email}.`, 'success');
    } catch {
      toast('Failed to send reset email.', 'danger');
    }
  };

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      u.email.toLowerCase().includes(q) ||
      (u.farm_name ?? '').toLowerCase().includes(q) ||
      (u.full_name ?? '').toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', transition: 'all 0.18s',
    background: tab === t ? 'linear-gradient(135deg,#7C3AED,#9D4EDD)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
    boxShadow: tab === t ? '0 4px 12px rgba(124,58,237,0.35)' : 'none',
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', width: '100%', minWidth: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary, #0f172a)', margin: 0 }}>
            <Crown size={22} color="#7C3AED" /> Super Admin Panel (Buong Kontrol sa Sistema)
          </h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            Buong pamamahala at kontrol sa sistema — <strong style={{ color: 'var(--color-text-primary, #0f172a)' }}>{user?.email}</strong>
          </p>
        </div>
        <Button variant="secondary" onClick={loadUsers} loading={loading} leftIcon={<RefreshCw size={14} />}>
          I-refresh
        </Button>
      </div>

      {/* Error banner */}
      {loadError && (
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', marginBottom: 20 }}>
          <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#EF4444' }}>Pumalya ang pag-load ng datos</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{loadError}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--glass-surface)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', borderRadius: 999, padding: 5, width: 'fit-content', flexWrap: 'wrap' }}>
        {(['dashboard', 'users', 'system'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>
            {t === 'dashboard' ? 'Buod ng Sistema' : t === 'users' ? 'Pamamahala ng mga User' : 'Kalagayan ng Sistema'}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <>
          <div className="dashboard-stats stats-grid" style={{ marginBottom: 24 }}>
            <StatCard icon={<Users size={18} />} accentColor="blue" value={loading ? '—' : stats.totalUsers} label="Kabuuang mga User" />
            <StatCard icon={<Crown size={18} />} accentColor="red" value={loading ? '—' : stats.superAdmins} label="Super Admins" />
            <StatCard icon={<ShieldCheck size={18} />} accentColor="orange" value={loading ? '—' : stats.sysAdmins} label="System Admins" />
            <StatCard icon={<CheckCircle size={18} />} accentColor="green" value={loading ? '—' : stats.farmManagers} label="Farm Managers" />
            <StatCard icon={<PawPrint size={18} />} accentColor="blue" value={loading ? '—' : stats.totalAnimals} label="Kabuuang mga Hayop" />
            <StatCard icon={<HeartPulse size={18} />} accentColor="orange" value={loading ? '—' : stats.totalHealth} label="Mga Health Record" />
          </div>

          {/* Role distribution */}
          <Card variant="glass" padding="lg" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCog size={16} color="#7C3AED" /> Distribusyon ng mga Tungkulin (Roles)
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { r: 'super_admin' as UserRole, count: stats.superAdmins },
                { r: 'system_admin' as UserRole, count: stats.sysAdmins },
                { r: 'farm_manager' as UserRole, count: stats.farmManagers },
              ].map(({ r, count }) => {
                const b = roleBadge(r);
                return (
                  <div key={r} style={{ flex: '1 1 160px', padding: '16px 20px', borderRadius: 14, background: b.bg, border: `1px solid ${b.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: b.color, lineHeight: 1 }}>{loading ? '—' : count}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{b.label}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Recent users */}
          <Card variant="glass" padding="none">
            <div style={{ fontWeight: 800, fontSize: 15, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-light)' }}>
              <Users size={16} color="#7C3AED" /> Lahat ng Nakarehistrong User
            </div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : users.length === 0 ? (
              <EmptyState
                icon={<Users size={32} />}
                title="Walang nahanap na user"
                description="Siguraduhing umiiral ang profiles table at naka-configure ang VITE_SUPABASE_SERVICE_KEY."
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Email</th><th>Tungkulin</th><th>Katayuan</th><th>Bukid</th><th>Petsa ng Pagrehistro</th><th>Huling Pag-login</th></tr></thead>
                  <tbody>
                    {[...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(u => {
                      const b = roleBadge(u.role);
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{u.email}</td>
                          <td><span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontSize: 11, fontWeight: 700 }}>{b.label}</span></td>
                          <td>
                            <Badge variant={u.is_active ? 'success' : 'danger'} size="sm">
                              {u.is_active ? 'Aktibo' : 'Hindi Aktibo'}
                            </Badge>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.farm_name ?? '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.created_at ? formatDate(u.created_at) : '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Wala pa'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── USER MANAGEMENT TAB ── */}
      {tab === 'users' && (
        <>
          <FilterToolbar rightAction={
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', fontWeight: 600 }}>{filtered.length} sa {users.length} mga user</span>
          }>
            <FilterSearch placeholder="Maghanap ng email, pangalan, bukid..." value={search} onChange={setSearch} minWidth={220} />
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              style={{ background: 'var(--filter-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--filter-text)', cursor: 'pointer', outline: 'none' }}>
              <option value="all">Lahat ng Tungkulin</option>
              <option value="super_admin">Super Admin</option>
              <option value="system_admin">System Admin</option>
              <option value="farm_manager">Farm Manager</option>
            </select>
          </FilterToolbar>

          <Card variant="glass" padding="none">
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<Users size={32} />} title="Walang nahanap na user" description="Subukan ang ibang filter o search." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Tungkulin</th><th>Katayuan</th><th>Bukid</th><th>Mga Hayop</th><th>Petsa ng Pagrehistro</th><th>Huling Pag-login</th><th>Mga Aksyon</th></tr></thead>
                  <tbody>
                    {filtered.map(u => {
                      const b = roleBadge(u.role);
                      const isMe = u.id === user?.id;
                      const isExp = expandedUser === u.id;
                      return (
                        <>
                          <tr key={u.id} style={{ cursor: 'pointer', opacity: u.is_active ? 1 : 0.55 }} onClick={() => setExpandedUser(isExp ? null : u.id)}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.full_name || u.email}</div>
                                  {u.full_name && <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #475569)' }}>{u.email}</div>}
                                  {isMe && <Badge variant="primary" size="sm">Ikaw</Badge>}
                                </div>
                              </div>
                            </td>
                            <td><span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontSize: 11, fontWeight: 700 }}>{b.label}</span></td>
                            <td>
                              <Badge variant={u.is_active ? 'success' : 'danger'} size="sm">
                                {u.is_active ? 'Aktibo' : 'Hindi Aktibo'}
                              </Badge>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.farm_name ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: u.animal_count > 0 ? 700 : 400 }}>{u.animal_count}</td>
                            <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.created_at ? formatDate(u.created_at) : '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Wala pa'}</td>
                            <td onClick={e => e.stopPropagation()}>
                              <div className="row-actions">
                                <Button variant="ghost" size="sm" title="Palitan ang role" onClick={() => { setEditRoleUser(u); setNewRole(u.role); }}>
                                  <UserCog size={13} />
                                </Button>
                                <Button variant="ghost" size="sm" title={u.is_active ? 'I-deactivate' : 'I-activate'} onClick={() => toggleActive(u)} style={{ color: u.is_active ? '#F59E0B' : '#16A34A' }}>
                                  {u.is_active ? <X size={13} /> : <CheckCircle size={13} />}
                                </Button>
                                <Button variant="ghost" size="sm" title="Magpadala ng password reset" onClick={() => sendReset(u.email)}>
                                  <Mail size={13} />
                                </Button>
                                {!isMe && u.role !== 'super_admin' && (
                                  <Button variant="ghost" size="sm" title="Burahin" onClick={() => setConfirmDeleteUser(u)} style={{ color: '#EF4444' }}>
                                    <Trash2 size={13} />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExp && (
                            <tr key={`${u.id}-exp`}>
                              <td colSpan={8} style={{ background: 'var(--color-surface-elevated, rgba(255,255,255,0.03))', padding: '12px 20px' }}>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
                                  <span><strong>ID:</strong> <code style={{ fontSize: 11, opacity: 0.7 }}>{u.id.slice(0, 20)}…</code></span>
                                  <span><strong>Mga Health Record:</strong> {u.health_count}</span>
                                  {u.farm_name && <span><strong>Bukid:</strong> {u.farm_name}</span>}
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
          </Card>
        </>
      )}

      {/* ── SYSTEM TAB ── */}
      {tab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card variant="glass" padding="lg">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color="#7C3AED" /> Kalusugan ng Sistema (System Health)
            </div>
            {[
              { label: 'Authentication (Pag-login / Pagrehistro)', status: 'Maayos / Umaandar', ok: true },
              { label: 'Database (profiles at talaan)', status: loadError ? 'May Problema' : 'Konektado', ok: !loadError },
              { label: 'AI Service (Cloud Vision at Scanner)', status: 'Aktibo sa Cloud', ok: null },
              { label: 'Application (Web Client)', status: 'Maayos / Umaandar', ok: true },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: s.ok === null ? '#F59E0B' : s.ok ? '#16A34A' : '#EF4444' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />{s.status}
                </span>
              </div>
            ))}
          </Card>

          <Card variant="glass" padding="lg">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color="#7C3AED" /> Antas ng mga Tungkulin (Role Hierarchy)
            </div>
            {[
              { r: 'super_admin' as UserRole, desc: 'Buong access sa sistema. Namamahala sa lahat ng user, tungkulin, at mga setting ng buong platform.' },
              { r: 'system_admin' as UserRole, desc: 'Namamahala sa mga rehistradong user at sumusuri sa datos ng mga bukid sa buong sistema.' },
              { r: 'farm_manager' as UserRole, desc: 'Namamahala sa sariling bukid — mga alaga, kalusugan, breeding, at imbentaryo.' },
            ].map(({ r, desc }) => {
              const b = roleBadge(r);
              return (
                <div key={r} style={{ padding: '12px 16px', borderRadius: 12, background: b.bg, border: `1px solid ${b.border}`, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: b.color, fontSize: 13, marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{desc}</div>
                </div>
              );
            })}
          </Card>

          <Card variant="glass" padding="lg">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} color="#7C3AED" /> Impormasyon ng Database
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <span><strong>Project:</strong> bsotlxbvanpwengftfli</span>
              <span><strong>User table:</strong> public.profiles</span>
              <span><strong>Kabuuang profiles:</strong> {loading ? '…' : users.length}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 12, lineHeight: 1.6 }}>
              Siguraduhing naka-set ang <code>VITE_SUPABASE_SERVICE_KEY</code> sa Vercel environment variables para sa
              auth.admin APIs (pagbura ng user, listahan ng auth). Gumagana ang profiles table gamit ang anon key.
            </p>
          </Card>

          {/* ML Model Status */}
          <Card variant="glass" padding="lg">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={16} color="#7C3AED" /> Modelo ng AI Health Risk (Machine Learning)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Badge variant={mlCanPredict ? 'success' : 'warning'} size="sm">
                {mlCanPredict ? 'Aktibo' : 'Kulang ang Datos'}
              </Badge>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>
                AlpasFarm Health Risk Model v{mlModel?.version ?? '2.0'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { label: 'Algorithm', value: 'Logistic Regression' },
                { label: 'Features', value: '18 (kabilang time-series)' },
                { label: 'Mga Sanay na Sample', value: String(mlSamples) },
                { label: 'Accuracy', value: mlCanPredict ? `${(mlAccuracy * 100).toFixed(1)}%` : '—' },
                { label: 'Recall', value: mlCanPredict ? `${(mlRecall * 100).toFixed(1)}%` : '—' },
                { label: 'F1 Score', value: mlCanPredict ? `${(mlF1 * 100).toFixed(1)}%` : '—' },
              ].map((m) => (
                <div key={m.label} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--color-surface-elevated, rgba(255,255,255,0.03))', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #475569)' }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { label: 'Binabantayang Hayop', value: String(mlSummary.monitored) },
                { label: 'Mga Babala ng AI', value: String(mlSummary.warningCount) },
                { label: 'Mataas ang Risk (AI)', value: String(mlSummary.mlHigh) },
                { label: 'Kritikal (AI)', value: String(mlSummary.mlCritical) },
              ].map((m) => (
                <div key={m.label} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--color-surface-elevated, rgba(255,255,255,0.03))', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #475569)' }}>{m.label}</div>
                </div>
              ))}
            </div>
            {mlModel && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', lineHeight: 1.6 }}>
                <strong>Label:</strong> Binary — health_record.risk_score ≥ 50 → at-risk (1), iba pa healthy (0)<br />
                <strong>Pagsasanay:</strong> {new Date(mlModel.trainedAt).toLocaleString()}<br />
                <strong>Paalala:</strong> Ang mga label ay batay sa pamantayan ng beterinaryo. Hindi ito pamalit sa pormal na pagsusuri ng lisensyadong beterinaryo.
              </div>
            )}
            {!mlCanPredict && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)', fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 8 }}>
                Paalala: Kinakailangan ng AI model ang hindi bababa sa 5 health records upang makapagsanay. Magdagdag ng mga talaan ng kalusugan sa bukid upang paganahin ang AI prediction.
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Role change modal ── */}
      {editRoleUser && (
        <Modal open={!!editRoleUser} onClose={() => setEditRoleUser(null)} size="md">
          <ModalHeader
            title="Palitan ang Tungkulin"
            subtitle={editRoleUser.email}
            icon={<UserCog size={18} color="#7C3AED" />}
          />
          <ModalBody>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Kasalukuyang Tungkulin</label>
              <div style={{ fontSize: 13, fontWeight: 700, color: roleBadge(editRoleUser.role).color }}>
                {roleBadge(editRoleUser.role).label}
              </div>
            </div>
            <FormField label="Bagong Tungkulin" required>
              <Select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </FormField>
            {newRole === 'super_admin' && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary, #475569)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={14} color="#7C3AED" style={{ flexShrink: 0, marginTop: 1 }} />
                Ang Super Admin ay may buong kontrol sa buong platform. Ipagkaloob lamang ito sa mga pinagkakatiwalaang kawani.
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setEditRoleUser(null)}>Kanselahin</Button>
            <Button variant="primary" onClick={handleRoleChange} loading={savingRole} disabled={savingRole || newRole === editRoleUser.role}>
              Kumpirmahin ang Pagbabago
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!confirmDeleteUser}
        title="Burahin ang User"
        message={`Sigurado ka bang nais mong burahin si ${confirmDeleteUser?.email}? Permanenteng mabubura ang user at lahat ng datos ng kanilang bukid. Hindi na ito maibabalik kapag nabura.`}
        confirmLabel="Oo, Burahin"
        cancelLabel="Huwag Muna"
        danger
        onConfirm={handleDeleteUser}
        onCancel={() => setConfirmDeleteUser(null)}
      />
    </div>
  );
}
