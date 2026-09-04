import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import { Users, PawPrint, ShieldAlert, RefreshCw, Trash2, BarChart3, CheckCircle, Mail, ChevronDown, ChevronRight, HeartPulse, Syringe, AlertTriangle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/Modal';
import { FilterToolbar, FilterSearch } from '../components/FilterToolbar';
import { formatDate } from '../lib/analytics';
import { type UserRole, SUPER_ADMIN_EMAILS_FALLBACK } from '../lib/auth';

// Admin emails list — kept only as a migration reference.
// Role authorization is now handled by the auth context (profiles table).
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
  role: UserRole;
}

interface FarmDetail {
  animals: any[];
  healthRecords: any[];
  weightRecords: any[];
  vaccinations: any[];
  settings: any | null;
}

export function AdminPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalUsers: 0, totalAnimals: 0, totalHealth: 0, activeFarms: 0 });
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [farmDetails, setFarmDetails] = useState<Record<string, FarmDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const isAdmin = role === 'system_admin' || role === 'super_admin';

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: authData, error } = await adminSupabase.auth.admin.listUsers({ perPage: 200 });
      if (error) throw new Error(`Auth admin error: ${error.message}`);

      const [animalsRes, healthRes, settingsRes] = await Promise.all([
        adminSupabase.from('animals').select('user_id'),
        adminSupabase.from('health_records').select('user_id'),
        adminSupabase.from('settings').select('user_id, farm_name'),
      ]);
      // profiles table may not exist yet — don't let it block the rest
      let profilesData: { id: string; role: string }[] = [];
      try {
        const pr = await adminSupabase.from('profiles').select('id, role');
        if (!pr.error && pr.data) profilesData = pr.data as any;
      } catch { /* table not yet created */ }

      const animalMap: Record<string, number> = {};
      const healthMap: Record<string, number> = {};
      const farmMap: Record<string, string> = {};
      const roleMap: Record<string, UserRole> = {};

      animalsRes.data?.forEach((a: any) => { animalMap[a.user_id] = (animalMap[a.user_id] || 0) + 1; });
      healthRes.data?.forEach((h: any) => { healthMap[h.user_id] = (healthMap[h.user_id] || 0) + 1; });
      settingsRes.data?.forEach((s: any) => { if (s.farm_name) farmMap[s.user_id] = s.farm_name; });
      profilesData.forEach((p: any) => { roleMap[p.id] = p.role as UserRole; });

      const rows: UserRow[] = (authData?.users || []).map((u: any) => {
        const emailLower = (u.email ?? '').toLowerCase();
        const isSuperEmail = SUPER_ADMIN_EMAILS_FALLBACK.includes(emailLower);
        const resolvedRole: UserRole = roleMap[u.id] ?? (isSuperEmail ? 'super_admin' : 'farm_manager');
        return {
          id: u.id,
          email: u.email || 'No email',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || null,
          animal_count: animalMap[u.id] || 0,
          health_count: healthMap[u.id] || 0,
          farm_name: farmMap[u.id] || null,
          role: resolvedRole,
        };
      });

      setUsers(rows);
      setStats({
        totalUsers: rows.length,
        totalAnimals: Object.values(animalMap).reduce((s, v) => s + v, 0),
        totalHealth: Object.values(healthMap).reduce((s, v) => s + v, 0),
        activeFarms: rows.filter(u => u.animal_count > 0).length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users.';
      setLoadError(msg);
      toast(msg, 'danger');
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
      toast(err instanceof Error ? err.message : 'Failed to delete user.', 'danger');
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await adminSupabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast(`Password reset email sent to ${email}.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send reset email.', 'danger');
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
      toast('Failed to load farm details.', 'danger');
    } finally {
      setLoadingDetail(null);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
        <ShieldAlert size={48} color="#EF4444" />
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Walang Pahintulot</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Wala kang pahintulot bilang administrator upang ma-access ang pahinang ito.</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Bumalik sa Buod ng Bukid</button>
      </div>
    );
  }

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.farm_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Role badge helper
  const roleBadgeStyle = (r: UserRole) => {
    if (r === 'super_admin') return { bg: 'rgba(139,92,246,0.15)', color: '#7C3AED', label: 'Super Admin' };
    if (r === 'system_admin') return { bg: 'rgba(217,45,32,0.12)', color: '#D92D20', label: 'System Admin' };
    return { bg: 'rgba(255,106,42,0.12)', color: '#FF7A18', label: 'Farm Manager' };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={22} color="#B91C1C" /> Admin Panel (Pamamahala ng mga User)
          </h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            Pamahalaan ang mga nakarehistrong user — naka-login bilang <strong>{user?.email}</strong>
          </p>
        </div>
        <Button variant="secondary" onClick={loadUsers} loading={loading} leftIcon={<RefreshCw size={15} />}>
          I-refresh
        </Button>
      </div>

      {/* Error banner */}
      {loadError && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', marginBottom: 16 }}>
          <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#EF4444', marginBottom: 2 }}>Pumalya ang pag-load ng mga user</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{loadError}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #475569)', marginTop: 4 }}>
              Siguraduhing tama ang <code>VITE_SUPABASE_SERVICE_KEY</code> para sa project <code>bsotlxbvanpwengftfli</code>.
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="dashboard-stats stats-grid" style={{ marginBottom: 20 }}>
        <StatCard
          icon={<Users size={20} />}
          accentColor="red"
          value={stats.totalUsers}
          label="Kabuuang mga User"
          subtext="Mga nakarehistrong account"
        />
        <StatCard
          icon={<PawPrint size={20} />}
          accentColor="green"
          value={stats.totalAnimals}
          label="Kabuuang mga Hayop"
          subtext="Sa lahat ng bukid"
        />
        <StatCard
          icon={<BarChart3 size={20} />}
          accentColor="blue"
          value={stats.totalHealth}
          label="Mga Health Record"
          subtext="Pangkalahatan sa sistema"
        />
        <StatCard
          icon={<CheckCircle size={20} />}
          accentColor="orange"
          value={stats.activeFarms}
          label="Mga Aktibong Bukid"
          subtext="May mga nakatalang alaga"
        />
      </div>

      {/* Search Filter Toolbar */}
      <FilterToolbar
        rightAction={
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', fontWeight: 600 }}>
            {filtered.length} sa {users.length} mga user
          </span>
        }
      >
        <FilterSearch
          placeholder="Maghanap ng email o bukid..."
          value={search}
          onChange={setSearch}
          minWidth={260}
        />
      </FilterToolbar>

      {/* Table */}
      <Card variant="glass" padding="none">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title="Walang nahanap na user"
            description={search ? 'Subukang maghanap ng ibang termino.' : 'Wala pang mga nakarehistrong user.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Tungkulin</th>
                  <th>Pangalan ng Bukid</th>
                  <th style={{ textAlign: 'center' }}>Mga Hayop</th>
                  <th style={{ textAlign: 'center' }}>Health Records</th>
                  <th>Petsa ng Pagrehistro</th>
                  <th>Huling Pag-login</th>
                  <th>Mga Aksyon</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isMe = u.email === user?.email;
                  const isAdminUser = ADMIN_EMAILS.includes(u.email);
                  const isExpanded = expandedUser === u.id;
                  const detail = farmDetails[u.id];
                  const animalName = (id: string) => detail?.animals.find((a: any) => a.id === id)?.name ?? id.slice(0, 8);
                  const rb = roleBadgeStyle(u.role);
                  return (
                    <>
                      <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => toggleFarmDetail(u.id)}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {u.email}
                            {isMe && <Badge variant="danger" size="sm">You</Badge>}
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: rb.bg, color: rb.color }}>
                            {rb.label}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.farm_name ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: u.animal_count > 0 ? 700 : 400 }}>{u.animal_count}</td>
                        <td style={{ textAlign: 'center' }}>{u.health_count}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{formatDate(u.created_at)}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="row-actions">
                            <Button variant="ghost" size="sm" title="Send password reset" onClick={() => sendPasswordReset(u.email)}>
                              <Mail size={14} />
                            </Button>
                            {!isMe && !isAdminUser && (
                              <Button variant="ghost" size="sm" title="Delete user" onClick={() => setConfirmDelete(u)} style={{ color: '#EF4444' }}>
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* ── Expanded farm detail row ── */}
                      {isExpanded && (
                        <tr key={`${u.id}-detail`}>
                          <td colSpan={8} style={{ background: 'var(--color-surface-elevated, rgba(255,255,255,0.03))', padding: '12px 20px' }}>
                            {loadingDetail === u.id ? (
                              <div style={{ textAlign: 'center', padding: 16 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                            ) : detail ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {/* Farm Settings */}
                                {detail.settings && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-text-secondary, #475569)', textTransform: 'uppercase', marginBottom: 6 }}>Mga Setting ng Bukid</div>
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                                      <span><strong>Bukid:</strong> {detail.settings.farm_name}</span>
                                      <span><strong>Target na Timbang:</strong> {detail.settings.target_weight_kg} kg</span>
                                      <span><strong>Gestation:</strong> {detail.settings.gestation_days} araw</span>
                                      <span><strong>Kritikal na Temp:</strong> {detail.settings.temp_critical}°C</span>
                                    </div>
                                  </div>
                                )}
                                {/* Animals */}
                                {detail.animals.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-text-secondary, #475569)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <PawPrint size={12} /> Mga Hayop ({detail.animals.filter((a: any) => !a.archived).length} aktibo)
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
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-text-secondary, #475569)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <HeartPulse size={12} /> Kamakailang Health Records
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {detail.healthRecords.slice(0, 5).map((r: any) => (
                                        <div key={r.id} style={{ fontSize: 11, display: 'flex', gap: 10, alignItems: 'center' }}>
                                          <span style={{ color: 'var(--color-text-secondary, #475569)' }}>{formatDate(r.record_date)}</span>
                                          <span style={{ fontWeight: 600 }}>{animalName(r.animal_id)}</span>
                                          <Badge variant={r.risk_level === 'Low' ? 'success' : r.risk_level === 'Moderate' ? 'warning' : 'danger'} size="sm">
                                            {r.risk_level} ({r.risk_score})
                                          </Badge>
                                          {r.detected_conditions && <span style={{ color: '#EF4444', fontSize: 10 }}>{r.detected_conditions}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Vaccinations */}
                                {detail.vaccinations.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-text-secondary, #475569)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Syringe size={12} /> Kamakailang mga Bakuna
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {detail.vaccinations.slice(0, 5).map((v: any) => (
                                        <span key={v.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#F0FDF4', color: '#15803D' }}>
                                          {animalName(v.animal_id)}: {v.vaccine_name} noong {formatDate(v.date_given)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {detail.animals.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>Wala pang naitalang datos ng bukid.</p>}
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
      </Card>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Burahin ang User"
        message={`Sigurado ka bang nais mong burahin si ${confirmDelete?.email}? Permanenteng mabubura ang user at LAHAT ng datos ng kanilang bukid (${confirmDelete?.animal_count} alagang hayop, ${confirmDelete?.health_count} health records). Hindi na ito maibabalik.`}
        confirmLabel="Burahin ang User"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
