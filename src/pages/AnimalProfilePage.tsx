import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { Icons } from '../lib/icons';
import { Modal, ConfirmDialog } from '../components/Modal';
import {
  calculateHealthRisk,
  calculateGrowth,
  calculateKiddingDate,
  ageLabel,
  formatDate,
  daysUntil,
  levelFromScore,
} from '../lib/analytics';
import { assessBreedingReadiness } from '../lib/analytics';
import { Line } from 'react-chartjs-2';
import { Plus, Pencil, Trash2, QrCode, ArrowLeft, Download, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import type { Animal, HealthStatus, Species, Sex } from '../types';

export function AnimalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<'overview' | 'health' | 'weight' | 'breeding' | 'vaccination' | 'feed' | 'history'>('overview');
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editForm, setEditForm] = useState({
    tag_id: '', name: '', species: 'Goat' as Species, breed: '', sex: 'Female' as Sex,
    date_of_birth: '', color_markings: '', weight_kg: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const animal = farmData.animals.find((a) => a.id === id);

  const animalHealth = useMemo(() => farmData.healthRecords.filter((r) => r.animal_id === id), [farmData.healthRecords, id]);
  const animalWeights = useMemo(() => farmData.weightRecords.filter((r) => r.animal_id === id), [farmData.weightRecords, id]);
  const animalBreedings = useMemo(() => farmData.breedingRecords.filter((r) => r.animal_id === id), [farmData.breedingRecords, id]);
  const animalVaccinations = useMemo(() => farmData.vaccinations.filter((r) => r.animal_id === id), [farmData.vaccinations, id]);
  const animalFeed = useMemo(() => farmData.feedRecords.filter((r) => r.animal_id === id), [farmData.feedRecords, id]);
  const animalMilk = useMemo(() => farmData.milkRecords.filter((r) => r.animal_id === id), [farmData.milkRecords, id]);

  const growth = useMemo(() => calculateGrowth(animalWeights, farmData.settings?.target_weight_kg ?? 40), [animalWeights, farmData.settings]);
  const breedingAssessment = useMemo(() => {
    if (!animal || !farmData.settings) return null;
    const lastMating = animalBreedings.sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime())[0] ?? null;
    return assessBreedingReadiness(animal, farmData.settings, lastMating);
  }, [animal, animalBreedings, farmData.settings]);

  useEffect(() => {
    if (animal) {
      setEditForm({
        tag_id: animal.tag_id, name: animal.name, species: animal.species,
        breed: animal.breed ?? '', sex: animal.sex,
        date_of_birth: animal.date_of_birth ?? '', color_markings: animal.color_markings ?? '',
        weight_kg: animal.weight_kg ? String(animal.weight_kg) : '', notes: animal.notes ?? '',
      });
    }
  }, [animal]);

  if (farmData.loading) {
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  if (!animal) {
    return (
      <div className="empty-state">
        <h4>Animal not found</h4>
        <p>This animal may have been deleted.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/animals')}>Back to Animals</button>
      </div>
    );
  }

  const healthBadge = (s: HealthStatus) =>
    s === 'Healthy' ? 'green' : s === 'Monitor' ? 'blue' : s === 'At Risk' ? 'orange' : 'red';

  const handleSaveEdit = async () => {
    if (!animal) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('animals').update({
        tag_id: editForm.tag_id.trim(), name: editForm.name.trim(),
        species: editForm.species, breed: editForm.breed.trim() || null, sex: editForm.sex,
        date_of_birth: editForm.date_of_birth || null,
        color_markings: editForm.color_markings.trim() || null,
        weight_kg: editForm.weight_kg ? Number(editForm.weight_kg) : null,
        notes: editForm.notes.trim() || null,
      }).eq('id', animal.id);
      if (error) throw error;
      toast('Animal successfully updated.', 'success');
      setEditOpen(false);
      farmData.refresh();
    } catch {
      toast('Unable to save changes. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('animals').delete().eq('id', animal.id);
      if (error) throw error;
      toast('Animal successfully deleted.', 'success');
      navigate('/animals');
    } catch {
      toast('Unable to delete animal. Please try again.', 'error');
    }
  };

  const downloadQR = async () => {
    const url = `${window.location.origin}/public/${animal.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qr-${animal.tag_id}.png`;
    link.click();
    toast('QR code downloaded.', 'success');
  };

  const printQR = () => {
    const url = `${window.location.origin}/public/${animal.id}`;
    const win = window.open('', '_blank');
    if (!win) return;
    QRCode.toDataURL(url, { width: 300, margin: 2 }).then((dataUrl) => {
      win.document.write(`<html><head><title>QR - ${animal.name}</title></head><body style="text-align:center;padding:40px;font-family:sans-serif"><h2>${animal.name} (${animal.tag_id})</h2><img src="${dataUrl}" /><p>Scan to view animal profile</p></body></html>`);
      win.document.close();
      win.print();
    });
  };

  // Weight chart data
  const weightChartData = {
    labels: animalWeights.sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime()).map((w) => formatDate(w.record_date)),
    datasets: [{
      label: 'Weight (kg)', data: animalWeights.sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime()).map((w) => Number(w.weight_kg)),
      borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.3, pointRadius: 3,
    }],
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'health', label: 'Health' },
    { key: 'weight', label: 'Weight' },
    { key: 'breeding', label: 'Breeding' },
    { key: 'vaccination', label: 'Vaccination' },
    { key: 'feed', label: 'Feed' },
    { key: 'history', label: 'History' },
  ] as const;

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/animals')}>
        <ArrowLeft size={16} /> Back to Animals
      </button>

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-photo">{animal.name[0]?.toUpperCase()}</div>
        <div className="profile-info" style={{ flex: 1 }}>
          <h2>{animal.name}</h2>
          <p>ID: {animal.tag_id} · {animal.species} · {animal.sex} · {ageLabel(animal.date_of_birth)}</p>
          {animal.breed && <p style={{ fontSize: 12, marginTop: 2 }}>{animal.breed}</p>}
        </div>
        <span className={`badge badge-${healthBadge(animal.health_status)}`} style={{ fontSize: 13, padding: '6px 14px' }}>
          {animal.health_status}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }} onClick={() => setQrOpen(true)}>
            <QrCode size={16} /> QR
          </button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }} onClick={() => setEditOpen(true)}>
            <Pencil size={16} /> Edit
          </button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid-3">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Health Risk</div>
            <div className="risk-gauge">
              <div className={`risk-circle ${levelFromScore(animal.health_risk_score).toLowerCase()}`}>
                {animal.health_risk_score}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{levelFromScore(animal.health_risk_score)} Risk</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {animal.health_risk_score >= 60 ? 'Needs attention' : 'Within normal range'}
                </div>
              </div>
            </div>
            <div className="divider" />
            <div className="stat-row"><span className="sr-label">Temperature</span><span className="sr-value">{animal.current_temperature ? `${animal.current_temperature}°C` : '—'}</span></div>
            <div className="stat-row"><span className="sr-label">Heart Rate</span><span className="sr-value">{animal.current_heart_rate ? `${animal.current_heart_rate} BPM` : '—'}</span></div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Weight & Growth</div>
            <div className="stat-row"><span className="sr-label">Current Weight</span><span className="sr-value">{growth.currentWeight ? `${growth.currentWeight} kg` : '—'}</span></div>
            <div className="stat-row"><span className="sr-label">Previous</span><span className="sr-value">{growth.previousWeight ? `${growth.previousWeight} kg` : '—'}</span></div>
            <div className="stat-row"><span className="sr-label">Change</span><span className="sr-value">{growth.weightChange !== null ? `${growth.weightChange > 0 ? '+' : ''}${growth.weightChange} kg` : '—'}</span></div>
            <div className="stat-row"><span className="sr-label">Daily Gain</span><span className="sr-value">{growth.dailyGain !== null ? `${growth.dailyGain} kg/day` : '—'}</span></div>
            <div className="stat-row"><span className="sr-label">Trend</span><span className="sr-value">{growth.trend}</span></div>
            {growth.marketReadyDate && (
              <div className="stat-row"><span className="sr-label">Market Ready</span><span className="sr-value">{formatDate(growth.marketReadyDate)}</span></div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Breeding</div>
            <div className="stat-row"><span className="sr-label">Status</span><span className="sr-value">{animal.breeding_status}</span></div>
            <div className="stat-row"><span className="sr-label">Last Mating</span><span className="sr-value">{formatDate(animal.last_mating_date)}</span></div>
            <div className="stat-row"><span className="sr-label">Expected Kidding</span><span className="sr-value">{formatDate(animal.expected_kidding_date)}</span></div>
            {breedingAssessment && (
              <div className="stat-row">
                <span className="sr-label">Readiness</span>
                <span className={`badge badge-${breedingAssessment.recommendation === 'Ready' ? 'green' : breedingAssessment.recommendation === 'Monitor' ? 'yellow' : 'gray'}`}>
                  {breedingAssessment.recommendation}
                </span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Vaccination</div>
            <div className="stat-row"><span className="sr-label">Status</span>
              <span className={`badge badge-${animal.vaccination_status === 'Up to Date' ? 'green' : animal.vaccination_status === 'Due Soon' ? 'yellow' : animal.vaccination_status === 'Overdue' ? 'red' : 'gray'}`}>
                {animal.vaccination_status}
              </span>
            </div>
            <div className="stat-row"><span className="sr-label">Last Vaccine</span><span className="sr-value">{formatDate(animal.last_vaccine_date)}</span></div>
            <div className="stat-row"><span className="sr-label">Next Due</span><span className="sr-value">{formatDate(animal.next_vaccine_date)}</span></div>
          </div>

          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Notes</div>
            <p style={{ fontSize: 13, color: animal.notes ? 'var(--text)' : 'var(--text-secondary)' }}>
              {animal.notes || 'No notes recorded.'}
            </p>
          </div>
        </div>
      )}

      {/* Health Tab */}
      {tab === 'health' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Health Records</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/health')}><Plus size={15} /> Add Record</button>
          </div>
          {animalHealth.length === 0 ? (
            <div className="empty-state"><div className="es-icon"><Icons.HeartPulse size={24} /></div><h4>No health records</h4><p>Record a health check to start early illness detection.</p></div>
          ) : (
            <div>
              {/* Early illness alerts for latest record */}
              {(() => {
                const latest = [...animalHealth].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];
                const conditions = (latest as any).detected_conditions;
                if (!conditions) return null;
                return (
                  <div style={{ margin: '0 0 14px', padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#991B1B' }}>⚠️ Early Illness Detection — Latest Record</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#7F1D1D', margin: 0 }}>{conditions}</p>
                  </div>
                );
              })()}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Temp</th><th>HR</th><th>RR</th>
                      <th>FAMACHA</th><th>Bloat</th><th>Gait</th>
                      <th>Risk</th><th>Detected Conditions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animalHealth.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.record_date)}</td>
                        <td>{r.temperature ? `${r.temperature}°C` : '—'}</td>
                        <td>{r.heart_rate ?? '—'}</td>
                        <td>{(r as any).respiratory_rate ? `${(r as any).respiratory_rate}` : '—'}</td>
                        <td>{(r as any).famacha_score ? `${(r as any).famacha_score}/5` : '—'}</td>
                        <td>{(r as any).bloat_score !== undefined ? `${(r as any).bloat_score}/3` : '—'}</td>
                        <td style={{ fontSize: 11 }}>{(r as any).gait ?? '—'}</td>
                        <td>
                          <span className={`badge badge-${r.risk_level === 'Low' ? 'green' : r.risk_level === 'Moderate' ? 'yellow' : r.risk_level === 'High' ? 'orange' : 'red'}`}>
                            {r.risk_level} ({r.risk_score})
                          </span>
                        </td>
                        <td style={{ maxWidth: 220, fontSize: 11 }}>
                          {(r as any).detected_conditions
                            ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>{(r as any).detected_conditions}</span>
                            : <span style={{ color: 'var(--text-secondary)' }}>None detected</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weight Tab */}
      {tab === 'weight' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Weight History</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/weights')}><Plus size={15} /> Add Weight</button>
          </div>
          {animalWeights.length === 0 ? (
            <div className="empty-state"><div className="es-icon"><Icons.Scale size={24} /></div><h4>No weight records</h4><p>Add a weigh-in to start tracking growth.</p></div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <Line data={weightChartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Weight</th><th>Change</th><th>Daily Gain</th></tr></thead>
                  <tbody>
                    {animalWeights.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()).map((w) => (
                      <tr key={w.id}>
                        <td>{formatDate(w.record_date)}</td>
                        <td>{w.weight_kg} kg</td>
                        <td>{w.weight_change_kg !== null ? `${w.weight_change_kg > 0 ? '+' : ''}${w.weight_change_kg} kg` : '—'}</td>
                        <td>{w.daily_gain_kg !== null ? `${w.daily_gain_kg} kg/day` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Breeding Tab */}
      {tab === 'breeding' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Breeding Records</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/breeding')}><Plus size={15} /> Add Record</button>
          </div>
          {animalBreedings.length === 0 ? (
            <div className="empty-state"><div className="es-icon"><Icons.Heart size={24} /></div><h4>No breeding records</h4><p>Add a mating record to track pregnancy.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Mating Date</th><th>Expected Kidding</th><th>Status</th><th>Days Until Kidding</th></tr></thead>
                <tbody>
                  {animalBreedings.map((b) => {
                    const days = b.expected_kidding_date ? daysUntil(b.expected_kidding_date) : null;
                    return (
                      <tr key={b.id}>
                        <td>{formatDate(b.mating_date)}</td>
                        <td>{formatDate(b.expected_kidding_date)}</td>
                        <td><span className={`badge badge-${b.status === 'Pregnant' ? 'blue' : b.status === 'Kidded' ? 'green' : 'gray'}`}>{b.status}</span></td>
                        <td>{days !== null && days >= 0 ? `${days} days` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Vaccination Tab */}
      {tab === 'vaccination' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Vaccination Records</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/vaccinations')}><Plus size={15} /> Add Vaccination</button>
          </div>
          {animalVaccinations.length === 0 ? (
            <div className="empty-state"><div className="es-icon"><Icons.Syringe size={24} /></div><h4>No vaccination records</h4><p>Add a vaccination to track immunization.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Vaccine</th><th>Date Given</th><th>Next Due</th><th>Veterinarian</th></tr></thead>
                <tbody>
                  {animalVaccinations.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 600 }}>{v.vaccine_name}</td>
                      <td>{formatDate(v.date_given)}</td>
                      <td>{formatDate(v.next_due_date)}</td>
                      <td>{v.veterinarian ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Feed Tab */}
      {tab === 'feed' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Feed Records</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/feed')}><Plus size={15} /> Add Feed Record</button>
          </div>
          {animalFeed.length === 0 ? (
            <div className="empty-state"><div className="es-icon"><Icons.Wheat size={24} /></div><h4>No feed records</h4><p>Record feed to track consumption and efficiency.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Feed Type</th><th>Quantity</th><th>Cost</th></tr></thead>
                <tbody>
                  {animalFeed.map((f) => (
                    <tr key={f.id}>
                      <td>{formatDate(f.record_date)}</td>
                      <td style={{ fontWeight: 600 }}>{f.feed_type}</td>
                      <td>{f.quantity_kg} kg</td>
                      <td>{f.cost ? `₱${f.cost}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Recent Activity</div>
          {animalHealth.length === 0 && animalWeights.length === 0 && animalVaccinations.length === 0 ? (
            <div className="empty-state"><div className="es-icon"><Icons.Activity size={24} /></div><h4>No activity yet</h4><p>Records will appear here as you add them.</p></div>
          ) : (
            <div>
              {animalHealth.slice(0, 3).map((r) => (
                <div key={r.id} className="stat-row"><span className="sr-label">Health Check — {formatDate(r.record_date)}</span><span className="sr-value">{r.risk_level} risk</span></div>
              ))}
              {animalWeights.slice(0, 3).map((w) => (
                <div key={w.id} className="stat-row"><span className="sr-label">Weight Record — {formatDate(w.record_date)}</span><span className="sr-value">{w.weight_kg} kg</span></div>
              ))}
              {animalVaccinations.slice(0, 3).map((v) => (
                <div key={v.id} className="stat-row"><span className="sr-label">Vaccination — {formatDate(v.date_given)}</span><span className="sr-value">{v.vaccine_name}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Modal */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={`QR Code — ${animal.name}`}
        footer={<><button className="btn btn-secondary" onClick={() => setQrOpen(false)}>Close</button>
        <button className="btn btn-secondary" onClick={downloadQR}><Download size={15} /> Download</button>
        <button className="btn btn-primary" onClick={printQR}><Printer size={15} /> Print</button></>}
      >
        <div className="qr-display">
          <QRCanvas value={`${window.location.origin}/public/${animal.id}`} size={240} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: 16 }}>{animal.name}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{animal.tag_id}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>Scan with any QR reader or Google Lens to view public profile</p>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Animal"
        footer={<><button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button></>}
      >
        <div className="form-row">
          <div className="form-group"><label className="form-label">Tag ID <span className="req">*</span></label>
            <input className="form-input" value={editForm.tag_id} onChange={(e) => setEditForm({ ...editForm, tag_id: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Name <span className="req">*</span></label>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Species</label>
            <select className="form-select" value={editForm.species} onChange={(e) => setEditForm({ ...editForm, species: e.target.value as Species })}><option>Goat</option><option>Sheep</option></select></div>
          <div className="form-group"><label className="form-label">Sex</label>
            <select className="form-select" value={editForm.sex} onChange={(e) => setEditForm({ ...editForm, sex: e.target.value as Sex })}><option>Female</option><option>Male</option></select></div>
          <div className="form-group"><label className="form-label">Breed</label>
            <input className="form-input" value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date of Birth</label>
            <input className="form-input" type="date" value={editForm.date_of_birth} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Weight (kg)</label>
            <input className="form-input" type="number" step="0.1" value={editForm.weight_kg} onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>
      </Modal>

      <ConfirmDialog open={confirmDelete} title="Delete Animal" message={`Are you sure you want to delete ${animal.name}? All related records will also be deleted.`} confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}

function QRCanvas({ value, size }: { value: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 2 });
    }
  }, [value, size]);
  return <canvas ref={ref} />;
}
