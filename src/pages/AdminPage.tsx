import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useNavigate } from 'react-router-dom';
import { Users, PawPrint, ShieldAlert, RefreshCw, Trash2, Eye, Ban, CheckCircle, BarChart3, Search } from 'lucide-react';
import { formatDate } from '../lib/analytics';

// ── Admin emails — add your email here ───────────────────────────────────────
const ADMIN_EMAILS = ['abertemarlonjr@gmail.com', 'marlonaberte00@gmail.com'];

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  animal_count: number;
  health_count: number;
  farm_name: string | null;
}

export function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalAnimals: 0, totalHealthRecords: 0, activeToday: 0 });
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);

  // Block non-admins
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Get all users via Supabase Auth admin API
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 200 });
      if (authError) throw authError;

      // Get animal counts per user
      const { data: animals } = await supabase.from('animals').select('user_id');
      const { data: health } = await supabase.from('health_records').select('user_id');
      const { data: settings } = await supabase.from('settings').select('user_id, farm_name');

      const animalMap: Record<string, number> = {};
      const healthMap: Record<string, number> = {};
      const farmMap: Record<string, string> = {};

      animals?.forEach((a: any) => { animalMap[a.user_id] = (animalMap[a.user_id] || 0) + 1; });
      health?.forEach((h: any) => { healthMap[h.user_id] = (healthMap[h.user_id] || 0) + 1; });
      settings?.forEach((s: any) => { if (s.farm_name) farmMap[s.user_id] = s.farm_name; });

      const userRows: UserRow[] = (authData?.users || []).map((u: any) => ({
        id: u.id,
        email: u.email || 'No email',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        banned_until: u.banned_until || null,
        animal_count: animalMap[u.id] || 0,
        health_count: healthMap[u.id] || 0,
        farm_name: farmMap[u.id] || null,
      }));

      setUsers(userRows);

      // Stats
      const today = new Date().toISOString().split('T')[0];
      setStats({
        totalUsers: userRows.length,
        totalAnimals: Object.values(animalMap).reduce((s, v) => s + v, 0),
        totalHealthRecords: Object.values(healthMap).reduce((s, v) => s + v, 0),
        activeToday: userRows.filter(u => u.last_sign_in_at?.startsWith(today)).length,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load users. Make sure you are an admin.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (u: UserRow) => {
    try {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) throw error;
      toast(`User ${u.email} deleted successfully.`, 'success');
      setConfirmDelete(null);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete user.', 'error');
    }
  };

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.farm_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
        <ShieldAlert size={48} color="#EF4444" />
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>You do not have admin privileges to access this page.</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={22} color="#B91C1C" /> Admin Panel
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Manage users, farms, and system data
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadUsers} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="kpi-grid section-gap">
        <div className="kpi-card">
          <div className="kpi-top"><div className="kpi-icon red"><Users size={20} /></div></div>
          <div className="kpi-value">{stats.totalUsers}</div>
          <div className="kpi-label">Total Users</div>
          <div className="kpi-delta up">{stats.activeToday} active today</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><div className="kpi-icon green"><PawPrint size={20} /></div></div>
          <div className="kpi-value">{stats.totalAnimals}</div>
          <div className="kpi-label">Total Animals</div>
          <div className="kpi-delta up">Across all farms</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><div className="kpi-icon blue"><BarChart3 size={20} /></div></div>
          <div className="kpi-value">{stats.totalHealthRecords}</div>
          <div className="kpi-label">Health Records</div>
          <div className="kpi-delta up">System-wide</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><div className="kpi-icon orange"><CheckCircle size={20} /></div></div>
          <div className="kpi-value">{users.filter(u => u.animal_count > 0).length}</div>
          <div className="kpi-label">Active Farms</div>
          <div className="kpi-delta up">With animals registered</div>
        </div>
      </div>

      {/* Search */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search by email or farm name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Users table */}
      <div className="card">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Users size={24} /></div>
            <h4>No users found</h4>
            <p>{search ? 'Try a different search term.' : 'No registered users yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Farm Name</th>
                  <th>Animals</th>
                  <th>Health Records</th>
                  <th>Registered</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isCurrentUser = u.email === user?.email;
                  const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
                  return (
                    <tr key={u.id} style={{ background: isCurrentUser ? 'var(--primary-light)' : undefined }}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {u.email}
                        {isCurrentUser && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 10 }}>You</span>}
                        {ADMIN_EMAILS.includes(u.email) && <span className="badge" style={{ marginLeft: 4, fontSize: 10, background: '#EDE9FE', color: '#7C3AED' }}>Admin</span>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{u.farm_name ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: u.animal_count > 0 ? 700 : 400 }}>{u.animal_count}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{u.health_count}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(u.created_at)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</td>
                      <td>
                        <span className={`badge badge-${isBanned ? 'red' : 'green'}`}>
                          {isBanned ? 'Banned' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-ghost btn-sm"
                            title="View user's animals"
                            disabled={u.animal_count === 0}
                            onClick={() => navigate('/animals')}
                          >
                            <Eye size={14} />
                          </button>
                          {!isCurrentUser && !ADMIN_EMAILS.includes(u.email) && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Delete user"
                              onClick={() => setConfirmDelete(u)}
                              style={{ color: '#EF4444' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#EF4444' }}>Delete User</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Are you sure you want to delete <strong>{confirmDelete.email}</strong>?
            </p>
            <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 20 }}>
              ⚠️ This will permanently delete the user and ALL their farm data ({confirmDelete.animal_count} animals, {confirmDelete.health_count} health records). This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteUser(confirmDelete)}>
                <Trash2 size={14} /> Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
