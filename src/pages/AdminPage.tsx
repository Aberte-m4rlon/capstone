import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useNavigate } from 'react-router-dom';
import { Users, PawPrint, ShieldAlert, RefreshCw, Trash2, BarChart3, Search, CheckCircle, Mail, ChevronDown, ChevronRight, HeartPulse, Scale, Syringe } from 'lucide-react';
import { formatDate } from '../lib/analytics';

export const ADMIN_EMAILS = ['marlonaberte00@gmail.com'];

const adminSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  animal_count: number;
  health_count: number;
  farm_name: string | null;
}

interface FarmDetail {
  animals: any[];
  healthRecords: any[];
  weightRecords: any[];
  vaccinations: any[];
  settings: any | null;
}

export function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalAnimals: 0, totalHealth: 0, activeFarms: 0 });
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [farmDetails, setFarmDetails] = useState<Record<string, FarmDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: authData, error } = await adminSupabase.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;

      const { data: animals } = await adminSupabase.from('animals').select('user_id');
      const { data: health } = await adminSupabase.from('health_records').select('user_id');
      const { data: settings } = await adminSupabase.from('settings').select('user_id, farm_name');

      const animalMap: Record<string, number> = {};
      const healthMap: Record<string, number> = {};
      const farmMap: Record<string, string> = {};

      animals?.forEach((a: any) => { animalMap[a.user_id] = (animalMap[a.user_id] || 0) + 1; });
      health?.forEach((h: any) => { healthMap[h.user_id] = (healthMap[h.user_id] || 0) + 1; });
      settings?.forEach((s: any) => { if (s.farm_name) farmMap[s.user_id] = s.farm_name; });

      const rows: UserRow[] = (authData?.users || []).map((u: any) => ({
        id: u.id,
        email: u.email || 'No email',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        animal_count: animalMap[u.id] || 0,
        health_count: healthMap[u.id] || 0,
        farm_name: farmMap[u.id] || null,
      }));

      setUsers(rows);
      const today = new Date().toISOString().split('T')[0];
      setStats({
        totalUsers: rows.length,
        totalAnimals: Object.values(animalMap).reduce((s, v) => s + v, 0),
        totalHealth: Object.values(healthMap).reduce((s, v) => s + v, 0),
        activeFarms: rows.filter(u => u.animal_count > 0).length,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load users.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await adminSupabase.auth.admin.deleteUser(confirmDelete.id);
      if (error) throw error;
      toast(`User ${confirmDelete.email} deleted.`, 'success');
      setConfirmDelete(null);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete user.', 'error');
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await adminSupabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast(`Password reset email sent to ${email}.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send reset email.', 'error');
    }
  };

  const toggleFarmDetail = async (userId: string) => {
    if (expandedUser === userId) { setExpandedUser(null); return; }
    setExpandedUser(userId);
    if (farmDetails[userId]) return; // already loaded
    setLoadingDetail(userId);
    try {
      const [aRes, hRes, wRes, vRes, sRes] = await Promise.all([
        adminSupabase.from('animals').select('id,name,tag_id,species,breed,sex,weight_kg,health_status,health_risk_score,vaccination_status,breeding_status,archived').eq('user_id', userId).order('name'),
        adminSupabase.from('health_records').select('id,animal_id,record_date,risk_level,risk_score,detected_conditions').eq('user_id', userId).order('record_date', { ascending: false }).limit(20),
        adminSupabase.from('weight_records').select('id,animal_id,record_date,weight_kg').eq('user_id', userId).order('record_date', { ascending: false }).limit(20),
        adminSupabase.from('vaccinations').select('id,animal_id,vaccine_name,date_given,vaccination_status:next_due_date').eq('user_id', userId).order('date_given', { ascending: false }).limit(20),
        adminSupabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
      ]);
      setFarmDetails(prev => ({
        ...prev,
        [userId]: {
          animals: aRes.data || [],
          healthRecords: hRes.data || [],
          weightRecords: wRes.data || [],
          vaccinations: vRes.data || [],
          settings: sRes.data,
        },
      }));
    } catch (err) {
      toast('Failed to load farm details.', 'error');
    } finally {
      setLoadingDetail(null);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
        <ShieldAlert size={48} color="#EF4444" />
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>You do not have admin privileges.</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.farm_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={22} color="#B91C1C" /> Admin Panel
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Manage registered users — logged in as <strong>{user?.email}</strong>
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadUsers} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="kpi-grid section-gap">
        {[
          { icon: <Users size={20}/>, color: 'red', value: stats.totalUsers, label: 'Total Users', sub: 'Registered accounts' },
          { icon: <PawPrint size={20}/>, color: 'green', value: stats.totalAnimals, label: 'Total Animals', sub: 'Across all farms' },
          { icon: <BarChart3 size={20}/>, color: 'blue', value: stats.totalHealth, label: 'Health Records', sub: 'System-wide' },
          { icon: <CheckCircle size={20}/>, color: 'orange', value: stats.activeFarms, label: 'Active Farms', sub: 'With animals registered' },
        ].map((s, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-top"><div className={`kpi-icon ${s.color}`}>{s.icon}</div></div>
            <div className="kpi-value">{s.value}</div>
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-delta up">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search email or farm name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          {filtered.length} of {users.length} users
        </span>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Users size={24} /></div>
            <h4>No users found</h4>
            <p>{search ? 'Try a different search.' : 'No registered users yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Farm Name</th>
                  <th style={{ textAlign: 'center' }}>Animals</th>
                  <th style={{ textAlign: 'center' }}>Health Records</th>
                  <th>Registered</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isMe = u.email === user?.email;
                  const isAdminUser = ADMIN_EMAILS.includes(u.email);
                  const isExpanded = expandedUser === u.id;
                  const detail = farmDetails[u.id];
                  const animalName = (id: string) => detail?.animals.find((a: any) => a.id === id)?.name ?? id.slice(0, 8);
                  return (
                    <>
                      <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => toggleFarmDetail(u.id)}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {u.email}
                            {isMe && <span className="badge badge-red" style={{ fontSize: 10 }}>You</span>}
                            {isAdminUser && <span className="badge" style={{ fontSize: 10, background: '#EDE9FE', color: '#7C3AED' }}>Admin</span>}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.farm_name ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: u.animal_count > 0 ? 700 : 400 }}>{u.animal_count}</td>
                        <td style={{ textAlign: 'center' }}>{u.health_count}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(u.created_at)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="row-actions">
                            <button className="btn btn-ghost btn-sm" title="Send password reset" onClick={() => sendPasswordReset(u.email)}><Mail size={14} /></button>
                            {!isMe && !isAdminUser && (
                              <button className="btn btn-ghost btn-sm" title="Delete user" onClick={() => setConfirmDelete(u)} style={{ color: '#EF4444' }}><Trash2 size={14} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* ── Expanded farm detail row ── */}
                      {isExpanded && (
                        <tr key={`${u.id}-detail`}>
                          <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 20px' }}>
                            {loadingDetail === u.id ? (
                              <div style={{ textAlign: 'center', padding: 16 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                            ) : detail ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {/* Farm Settings */}
                                {detail.settings && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>Farm Settings</div>
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                                      <span><strong>Farm:</strong> {detail.settings.farm_name}</span>
                                      <span><strong>Target Weight:</strong> {detail.settings.target_weight_kg} kg</span>
                                      <span><strong>Gestation:</strong> {detail.settings.gestation_days} days</span>
                                      <span><strong>Temp Critical:</strong> {detail.settings.temp_critical}°C</span>
                                    </div>
                                  </div>
                                )}
                                {/* Animals */}
                                {detail.animals.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <PawPrint size={12} /> Animals ({detail.animals.filter((a: any) => !a.archived).length} active)
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {detail.animals.filter((a: any) => !a.archived).map((a: any) => (
                                        <span key={a.id} style={{
                                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                          background: a.health_status === 'Critical' ? '#FEE2E2' : a.health_status === 'At Risk' ? '#FFEDD5' : a.health_status === 'Monitor' ? '#EFF6FF' : '#F0FDF4',
                                          color: a.health_status === 'Critical' ? '#991B1B' : a.health_status === 'At Risk' ? '#C2410C' : a.health_status === 'Monitor' ? '#1D4ED8' : '#15803D',
                                        }}>
                                          {a.name} ({a.tag_id}) · {a.species} · {a.health_status}
                                          {a.weight_kg ? ` · ${a.weight_kg}kg` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Recent Health Records */}
                                {detail.healthRecords.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <HeartPulse size={12} /> Recent Health Records
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {detail.healthRecords.slice(0, 5).map((r: any) => (
                                        <div key={r.id} style={{ fontSize: 11, display: 'flex', gap: 10, alignItems: 'center' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>{formatDate(r.record_date)}</span>
                                          <span style={{ fontWeight: 600 }}>{animalName(r.animal_id)}</span>
                                          <span className={`badge badge-${r.risk_level === 'Low' ? 'green' : r.risk_level === 'Moderate' ? 'yellow' : r.risk_level === 'High' ? 'orange' : 'red'}`} style={{ fontSize: 10 }}>{r.risk_level} ({r.risk_score})</span>
                                          {r.detected_conditions && <span style={{ color: '#EF4444', fontSize: 10 }}>{r.detected_conditions}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Vaccinations */}
                                {detail.vaccinations.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Syringe size={12} /> Recent Vaccinations
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {detail.vaccinations.slice(0, 5).map((v: any) => (
                                        <span key={v.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#F0FDF4', color: '#15803D' }}>
                                          {animalName(v.animal_id)}: {v.vaccine_name} on {formatDate(v.date_given)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {detail.animals.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No farm data recorded yet.</p>}
                              </div>
                            ) : null}
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

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#EF4444' }}>Delete User</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Delete <strong>{confirmDelete.email}</strong>?
            </p>
            <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 20 }}>
              ⚠️ This will permanently delete the user and ALL their data ({confirmDelete.animal_count} animals, {confirmDelete.health_count} health records). Cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}><Trash2 size={14} /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
