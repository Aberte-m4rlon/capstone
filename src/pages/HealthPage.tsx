import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { FilterToolbar, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Brain, AlertTriangle, ShieldAlert } from 'lucide-react';
import { calculateHealthRisk, formatDate, levelFromScore, type EarlyIllnessResult } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import { useHealthRiskModel } from '../lib/mlHooks';
import { useMLHealthSummary, useEarlyWarnings } from '../lib/useMLHealth';
import { EarlyWarningCard } from '../components/MLHealthPanel';
import { useNavigate } from 'react-router-dom';
import type { HealthRecord } from '../types';

const emptyForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  temperature: '',
  heart_rate: '',
  respiratory_rate: '',
  rumen_sounds: 'Normal' as 'Normal' | 'Reduced' | 'Absent' | 'Increased',
  famacha_score: '' as '' | '1' | '2' | '3' | '4' | '5',
  mucous_membrane: 'Pink' as 'Pink' | 'Pale' | 'White' | 'Red' | 'Yellow' | 'Blue',
  bloat_score: '0' as '0' | '1' | '2' | '3',
  gait: 'Normal' as 'Normal' | 'Slight Limp' | 'Severe Limp' | 'Cannot Walk',
  appetite: 'Normal' as 'Normal' | 'Reduced' | 'None',
  activity_level: 'Normal' as 'Normal' | 'Low' | 'Lethargic',
  cough: false,
  diarrhea: false,
  nasal_discharge: false,
  eye_condition: 'Normal' as 'Normal' | 'Discharge' | 'Cloudy',
  body_condition: 'Good' as 'Good' | 'Fair' | 'Poor',
  notes: '',
};

export function HealthPage() {
  const farmData = useFarmData();
  const toast = useToast();
  const mlModel = useHealthRiskModel();
  const mlSummary = useMLHealthSummary();
  const { warnings } = useEarlyWarnings();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HealthRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HealthRecord | null>(null);
  const [fRisk, setFRisk] = useState('All');
  const [fAnimal, setFAnimal] = useState('All');
  const [lastIllnessResult, setLastIllnessResult] = useState<EarlyIllnessResult | null>(null);

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  const filtered = useMemo(() => {
    return farmData.healthRecords
      .filter((r) => fRisk === 'All' || r.risk_level === fRisk)
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.healthRecords, fRisk, fAnimal]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: activeAnimals[0]?.id ?? '' });
    setErrors({});
    setLastIllnessResult(null);
    setModalOpen(true);
  };

  const openEdit = (r: HealthRecord) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id,
      record_date: r.record_date,
      temperature: r.temperature ? String(r.temperature) : '',
      heart_rate: r.heart_rate ? String(r.heart_rate) : '',
      respiratory_rate: (r as any).respiratory_rate ? String((r as any).respiratory_rate) : '',
      rumen_sounds: (r as any).rumen_sounds ?? 'Normal',
      famacha_score: (r as any).famacha_score ? String((r as any).famacha_score) as any : '',
      mucous_membrane: (r as any).mucous_membrane ?? 'Pink',
      bloat_score: String((r as any).bloat_score ?? 0) as any,
      gait: (r as any).gait ?? 'Normal',
      appetite: r.appetite,
      activity_level: r.activity_level,
      cough: r.cough,
      diarrhea: r.diarrhea,
      nasal_discharge: r.nasal_discharge,
      eye_condition: r.eye_condition,
      body_condition: r.body_condition,
      notes: r.notes ?? '',
    });
    setErrors({});
    setLastIllnessResult(null);
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select an animal.';
    if (form.temperature && (isNaN(Number(form.temperature)) || Number(form.temperature) < 30 || Number(form.temperature) > 45))
      e.temperature = 'Temperature must be between 30–45°C.';
    if (form.heart_rate && (isNaN(Number(form.heart_rate)) || Number(form.heart_rate) < 20 || Number(form.heart_rate) > 200))
      e.heart_rate = 'Heart rate must be between 20–200 BPM.';
    if (form.respiratory_rate && (isNaN(Number(form.respiratory_rate)) || Number(form.respiratory_rate) < 5 || Number(form.respiratory_rate) > 100))
      e.respiratory_rate = 'Respiratory rate must be between 5–100 breaths/min.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const animal = farmData.animals.find((a) => a.id === form.animal_id);
    if (!animal) { toast('Please select a valid animal.', 'error'); setSaving(false); return; }

    const recentRecords = farmData.healthRecords
      .filter((r) => r.animal_id === form.animal_id)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())
      .slice(0, 5);

    const riskInput = {
      temperature: form.temperature ? Number(form.temperature) : null,
      heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
      respiratory_rate: form.respiratory_rate ? Number(form.respiratory_rate) : null,
      rumen_sounds: form.rumen_sounds,
      famacha_score: form.famacha_score ? Number(form.famacha_score) : null,
      mucous_membrane: form.mucous_membrane,
      bloat_score: Number(form.bloat_score),
      gait: form.gait,
      appetite: form.appetite,
      activity_level: form.activity_level,
      cough: form.cough,
      diarrhea: form.diarrhea,
      nasal_discharge: form.nasal_discharge,
      eye_condition: form.eye_condition,
      body_condition: form.body_condition,
    };

    const riskResult = calculateHealthRisk(riskInput, animal, recentRecords, farmData.settings ?? undefined);
    setLastIllnessResult(riskResult.earlyIllness);

    const payload = {
      animal_id: form.animal_id,
      record_date: form.record_date,
      temperature: riskInput.temperature,
      heart_rate: riskInput.heart_rate,
      respiratory_rate: riskInput.respiratory_rate,
      rumen_sounds: form.rumen_sounds,
      famacha_score: riskInput.famacha_score,
      mucous_membrane: form.mucous_membrane,
      bloat_score: Number(form.bloat_score),
      gait: form.gait,
      appetite: form.appetite,
      activity_level: form.activity_level,
      cough: form.cough,
      diarrhea: form.diarrhea,
      nasal_discharge: form.nasal_discharge,
      eye_condition: form.eye_condition,
      body_condition: form.body_condition,
      risk_score: riskResult.score,
      risk_level: riskResult.level,
      reasons: riskResult.reasons.join('; ') || null,
      recommendation: riskResult.recommendation,
      detected_conditions: riskResult.earlyIllness.detectedConditions.join('; ') || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('health_records').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Health record updated.', 'success');
      } else {
        const { error } = await supabase.from('health_records').insert(payload);
        if (error) throw error;
        toast('Health record saved. Risk score and illness detection calculated.', 'success');
      }
      await supabase.from('animals').update({
        health_status: riskResult.healthStatus,
        health_risk_score: riskResult.score,
        current_temperature: riskInput.temperature,
        current_heart_rate: riskInput.heart_rate,
      }).eq('id', form.animal_id);

      if (riskResult.score >= 60) {
        await createNotification(animal.user_id, 'Health',
          `${animal.name}: ${riskResult.level} health risk (${riskResult.score})`,
          riskResult.reasons.join('; '), riskResult.score >= 80 ? 'Critical' : 'Warning', `/animals/${animal.id}`);
      }
      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('health_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Health record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch { toast('Unable to delete record.', 'error'); }
  };

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Health Monitoring</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} health records · Early illness detection active
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={activeAnimals.length === 0}>
          <Plus size={16} /> Record Health Check
        </button>
      </div>

      {/* Early Illness Detection Result Banner */}
      {lastIllnessResult && lastIllnessResult.conditionDetails.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {lastIllnessResult.conditionDetails.map((c, i) => (
            <div key={i} style={{
              background: c.severity === 'Critical' ? '#FEF2F2' : '#FFFBEB',
              border: `1px solid ${c.severity === 'Critical' ? '#FCA5A5' : '#FCD34D'}`,
              borderRadius: 12, padding: '14px 16px', marginBottom: 8,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <ShieldAlert size={20} color={c.severity === 'Critical' ? '#EF4444' : '#F59E0B'} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: c.severity === 'Critical' ? '#991B1B' : '#92400E', margin: 0 }}>
                  {c.condition}
                </p>
                <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0' }}>{c.description}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: c.severity === 'Critical' ? '#B91C1C' : '#B45309', margin: 0 }}>
                  → {c.action}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ML Model Status */}
      {mlModel.canPredict && (
        <div className="card section-gap" style={{ marginBottom: 16, borderLeft: '3px solid #7C3AED' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Brain size={18} color="#7C3AED" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>AlpasFarm ML Health Model v2.0 — Logistic Regression</span>
            <span className="badge" style={{ background: '#EDE9FE', color: '#7C3AED' }}>Active</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Accuracy: <strong>{Math.round(mlSummary.modelAccuracy * 100)}%</strong>
              {' '}· Samples: <strong>{mlSummary.trainingSamples}</strong>
              {' '}· 18 features (incl. 7-day trends)
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            ⚠️ Farm management support tool only. Not a veterinary diagnostic system. Consult a qualified veterinarian for confirmation.
          </div>
        </div>
      )}

      {/* ML Health KPIs */}
      <div className="kpi-grid section-gap" style={{ marginBottom: 16 }}>
        {[
          { label: 'Monitored', value: mlSummary.monitored, color: 'blue' },
          { label: 'Healthy', value: mlSummary.healthy, color: 'green' },
          { label: 'At Risk', value: mlSummary.atRisk, color: 'orange' },
          { label: 'High Risk', value: mlSummary.highRisk, color: 'red' },
          { label: 'Critical', value: mlSummary.critical, color: 'red' },
        ].map((s) => (
          <div key={s.label} className="kpi-card">
            <div className="kpi-top"><div className={`kpi-icon ${s.color}`}><Icons.HeartPulse size={18} /></div></div>
            <div className="kpi-value">{s.value}</div>
            <div className="kpi-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ML Early Warning Section */}
      {warnings.length > 0 && (
        <div className="card section-gap" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={16} color="#F97316" />
            <span style={{ fontWeight: 800, fontSize: 14 }}>⚡ Early Warning — ML Risk Detection</span>
            <span className="badge badge-orange" style={{ fontSize: 11 }}>{warnings.length} animals</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {warnings.slice(0, 6).map((w) => (
              <EarlyWarningCard
                key={w.animal.id}
                animalName={w.animal.name}
                tagId={w.animal.tag_id}
                prediction={w.prediction}
                onView={() => navigate(`/animals/${w.animal.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      <FilterToolbar>
        <FilterSelect
          value={fAnimal}
          onChange={setFAnimal}
          options={[
            { value: 'All', label: 'All Animals' },
            ...activeAnimals.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
          ]}
          ariaLabel="Filter Animal"
          minWidth={160}
        />
        <FilterSelect
          value={fRisk}
          onChange={setFRisk}
          options={[
            { value: 'All', label: 'All Risk Levels' },
            { value: 'Low', label: 'Low' },
            { value: 'Moderate', label: 'Moderate' },
            { value: 'High', label: 'High' },
            { value: 'Critical', label: 'Critical' },
          ]}
          ariaLabel="Filter Risk Level"
        />
      </FilterToolbar>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.HeartPulse size={24} /></div>
            <h4>No health records</h4>
            <p>Record a health check to start early illness detection.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Animal</th><th>Temp</th><th>HR</th><th>RR</th><th>FAMACHA</th><th>Risk Score</th><th>Risk Level</th><th>Detected Conditions</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.record_date)}</td>
                    <td style={{ fontWeight: 600 }}>{animalName(r.animal_id)}</td>
                    <td>{r.temperature ? `${r.temperature}°C` : '—'}</td>
                    <td>{r.heart_rate ?? '—'}</td>
                    <td>{(r as any).respiratory_rate ? `${(r as any).respiratory_rate}` : '—'}</td>
                    <td>{(r as any).famacha_score ?? '—'}</td>
                    <td><span style={{ fontWeight: 700 }}>{r.risk_score}</span></td>
                    <td><span className={`badge badge-${r.risk_level === 'Low' ? 'green' : r.risk_level === 'Moderate' ? 'yellow' : r.risk_level === 'High' ? 'orange' : 'red'}`}>{r.risk_level}</span></td>
                    <td style={{ maxWidth: 220, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {(r as any).detected_conditions
                        ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>{(r as any).detected_conditions}</span>
                        : <span style={{ color: 'var(--text-secondary)' }}>None detected</span>}
                    </td>
                    <td><div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Pencil size={15} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(r)}><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Health Check Form Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Health Record' : 'Record Health Check — Early Illness Detection'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Analysing...' : 'Save & Detect'}</button></>}
      >
        {/* Animal + Date */}
        <div className="form-row">
          <div className="form-group"><label className="form-label">Animal <span className="req">*</span></label>
            <select className="form-select" value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })}>
              <option value="">Select animal...</option>
              {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
            </select>
            {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}
          </div>
          <div className="form-group"><label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} />
          </div>
        </div>

        {/* Vital Signs section */}
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>
          📊 Vital Signs
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Temperature (°C)</label>
            <input className="form-input" type="number" step="0.1" value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })} placeholder="38.5–40.0" />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Normal: 38.5–40.0°C</div>
            {errors.temperature && <div className="form-error">{errors.temperature}</div>}
          </div>
          <div className="form-group"><label className="form-label">Heart Rate (BPM)</label>
            <input className="form-input" type="number" value={form.heart_rate}
              onChange={(e) => setForm({ ...form, heart_rate: e.target.value })} placeholder="70–90" />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Normal: 70–90 BPM</div>
            {errors.heart_rate && <div className="form-error">{errors.heart_rate}</div>}
          </div>
          <div className="form-group"><label className="form-label">Respiratory Rate</label>
            <input className="form-input" type="number" value={form.respiratory_rate}
              onChange={(e) => setForm({ ...form, respiratory_rate: e.target.value })} placeholder="12–20" />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Normal: 12–20 breaths/min</div>
            {errors.respiratory_rate && <div className="form-error">{errors.respiratory_rate}</div>}
          </div>
        </div>

        {/* New clinical parameters section */}
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>
          🔬 Early Illness Parameters (Research-Based)
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">FAMACHA Score
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>Eye membrane color (worm/anemia)</span>
            </label>
            <select className="form-select" value={form.famacha_score} onChange={(e) => setForm({ ...form, famacha_score: e.target.value as any })}>
              <option value="">Not assessed</option>
              <option value="1">1 — Red (Healthy)</option>
              <option value="2">2 — Red-Pink (Normal)</option>
              <option value="3">3 — Pink (Borderline)</option>
              <option value="4">4 — Pink-White (Anemic)</option>
              <option value="5">5 — White (Severely Anemic)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Mucous Membrane Color
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>Gum/eye color</span>
            </label>
            <select className="form-select" value={form.mucous_membrane} onChange={(e) => setForm({ ...form, mucous_membrane: e.target.value as any })}>
              <option value="Pink">Pink (Normal)</option>
              <option value="Pale">Pale (Mild anemia)</option>
              <option value="White">White (Severe anemia)</option>
              <option value="Red">Red (Fever/Toxemia)</option>
              <option value="Yellow">Yellow (Jaundice)</option>
              <option value="Blue">Blue (Oxygen deprivation)</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Rumen Sounds
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>Normal: 1–3/min</span>
            </label>
            <select className="form-select" value={form.rumen_sounds} onChange={(e) => setForm({ ...form, rumen_sounds: e.target.value as any })}>
              <option value="Normal">Normal (1–3 per min)</option>
              <option value="Increased">Increased (&gt;3/min)</option>
              <option value="Reduced">Reduced (&lt;1/min)</option>
              <option value="Absent">Absent (None heard)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Bloat Score
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>Rumen distension</span>
            </label>
            <select className="form-select" value={form.bloat_score} onChange={(e) => setForm({ ...form, bloat_score: e.target.value as any })}>
              <option value="0">0 — None (Normal)</option>
              <option value="1">1 — Mild</option>
              <option value="2">2 — Moderate</option>
              <option value="3">3 — Severe (Emergency)</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Gait / Lameness</label>
            <select className="form-select" value={form.gait} onChange={(e) => setForm({ ...form, gait: e.target.value as any })}>
              <option value="Normal">Normal</option>
              <option value="Slight Limp">Slight Limp</option>
              <option value="Severe Limp">Severe Limp</option>
              <option value="Cannot Walk">Cannot Walk</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Appetite</label>
            <select className="form-select" value={form.appetite} onChange={(e) => setForm({ ...form, appetite: e.target.value as any })}>
              <option>Normal</option><option>Reduced</option><option>None</option>
            </select>
          </div>
        </div>

        {/* Existing parameters */}
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>
          🩺 Clinical Observations
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Activity Level</label>
            <select className="form-select" value={form.activity_level} onChange={(e) => setForm({ ...form, activity_level: e.target.value as any })}>
              <option>Normal</option><option>Low</option><option>Lethargic</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Body Condition</label>
            <select className="form-select" value={form.body_condition} onChange={(e) => setForm({ ...form, body_condition: e.target.value as any })}>
              <option>Good</option><option>Fair</option><option>Poor</option>
            </select>
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Eye Condition</label>
            <select className="form-select" value={form.eye_condition} onChange={(e) => setForm({ ...form, eye_condition: e.target.value as any })}>
              <option>Normal</option><option>Discharge</option><option>Cloudy</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Cough</label>
            <select className="form-select" value={form.cough ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, cough: e.target.value === 'yes' })}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Diarrhea</label>
            <select className="form-select" value={form.diarrhea ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, diarrhea: e.target.value === 'yes' })}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Nasal Discharge</label>
          <select className="form-select" value={form.nasal_discharge ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, nasal_discharge: e.target.value === 'yes' })}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div style={{ background: '#EDE9FE', padding: '10px 14px', borderRadius: 8, fontSize: 12, color: '#5B21B6' }}>
          🧠 Saving will automatically calculate health risk score, run early illness detection across 7 disease patterns, and update the animal's health status.
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Health Record"
        message="Are you sure you want to delete this health record?"
        confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
