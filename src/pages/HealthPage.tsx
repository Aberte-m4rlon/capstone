import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Brain } from 'lucide-react';
import { calculateHealthRisk, formatDate, levelFromScore } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import { useHealthRiskModel } from '../lib/mlHooks';
import type { HealthRecord } from '../types';

const emptyForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  temperature: '',
  heart_rate: '',
  appetite: 'Normal',
  activity_level: 'Normal',
  cough: false,
  diarrhea: false,
  nasal_discharge: false,
  eye_condition: 'Normal',
  body_condition: 'Good',
  notes: '',
};

export function HealthPage() {
  const farmData = useFarmData();
  const toast = useToast();
  const mlModel = useHealthRiskModel();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HealthRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HealthRecord | null>(null);
  const [fRisk, setFRisk] = useState('All');
  const [fAnimal, setFAnimal] = useState('All');

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
    setModalOpen(true);
  };

  const openEdit = (r: HealthRecord) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id, record_date: r.record_date,
      temperature: r.temperature ? String(r.temperature) : '', heart_rate: r.heart_rate ? String(r.heart_rate) : '',
      appetite: r.appetite, activity_level: r.activity_level, cough: r.cough, diarrhea: r.diarrhea,
      nasal_discharge: r.nasal_discharge, eye_condition: r.eye_condition, body_condition: r.body_condition,
      notes: r.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select an animal.';
    if (form.temperature && (isNaN(Number(form.temperature)) || Number(form.temperature) < 30 || Number(form.temperature) > 45))
      e.temperature = 'Temperature should be between 30 and 45°C.';
    if (form.heart_rate && (isNaN(Number(form.heart_rate)) || Number(form.heart_rate) < 20 || Number(form.heart_rate) > 200))
      e.heart_rate = 'Heart rate should be between 20 and 200 BPM.';
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

    const riskResult = calculateHealthRisk(
      {
        temperature: form.temperature ? Number(form.temperature) : null,
        heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
        appetite: form.appetite, activity_level: form.activity_level,
        cough: form.cough, diarrhea: form.diarrhea, nasal_discharge: form.nasal_discharge,
        eye_condition: form.eye_condition, body_condition: form.body_condition,
      },
      animal,
      recentRecords,
      farmData.settings ?? undefined,
    );

    const payload = {
      animal_id: form.animal_id,
      record_date: form.record_date,
      temperature: form.temperature ? Number(form.temperature) : null,
      heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
      appetite: form.appetite, activity_level: form.activity_level,
      cough: form.cough, diarrhea: form.diarrhea, nasal_discharge: form.nasal_discharge,
      eye_condition: form.eye_condition, body_condition: form.body_condition,
      risk_score: riskResult.score, risk_level: riskResult.level,
      reasons: riskResult.reasons.join('; ') || null,
      recommendation: riskResult.recommendation,
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
        toast('Health record saved. Risk score calculated.', 'success');
      }

      // Update animal health status + vitals
      const animalUpdate: Record<string, unknown> = {
        health_status: riskResult.healthStatus,
        health_risk_score: riskResult.score,
        current_temperature: form.temperature ? Number(form.temperature) : null,
        current_heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
      };
      await supabase.from('animals').update(animalUpdate).eq('id', form.animal_id);

      // Create notification if high risk
      if (riskResult.score >= 60) {
        await createNotification(
          animal.user_id,
          'Health',
          `${animal.name}: ${riskResult.level} health risk (${riskResult.score})`,
          riskResult.reasons.join('; '),
          riskResult.score >= 80 ? 'Critical' : 'Warning',
          `/animals/${animal.id}`,
        );
      }

      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save record.';
      toast(msg, 'error');
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
    } catch {
      toast('Unable to delete record.', 'error');
    }
  };

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Health Monitoring</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} health records · Risk scores calculated automatically
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={activeAnimals.length === 0}>
          <Plus size={16} /> Record Health Check
        </button>
      </div>

      {activeAnimals.length === 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="empty-state">
            <div className="es-icon"><Icons.PawPrint size={24} /></div>
            <h4>Add an animal first</h4>
            <p>You need at least one animal before recording health checks.</p>
          </div>
        </div>
      )}

      {/* ML Model Status */}
      {mlModel.canPredict && (
        <div className="card section-gap" style={{ marginBottom: 16, borderLeft: '3px solid #7C3AED' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Brain size={18} color="#7C3AED" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>AI Health Risk Model — Logistic Regression</span>
            <span className="badge" style={{ background: '#EDE9FE', color: '#7C3AED' }}>Trained</span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Model Accuracy</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: mlModel.accuracy >= 0.7 ? 'var(--healthy)' : mlModel.accuracy >= 0.5 ? 'var(--warning)' : 'var(--critical)' }}>
                {Math.round(mlModel.accuracy * 100)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Training Samples</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{mlModel.trainingSamples}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Algorithm</div>
              <div style={{ fontSize: 14, fontWeight: 600, paddingTop: 4 }}>Logistic Regression</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>14 features · 300 epochs · L2 reg</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            This model was trained on your historical health records. It learns patterns between vitals, symptoms, and risk outcomes to predict risk probability for new readings.
          </p>
        </div>
      )}

      <div className="filter-bar">
        <select className="form-select" value={fAnimal} onChange={(e) => setFAnimal(e.target.value)}>
          <option value="All">All Animals</option>
          {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
        </select>
        <select className="form-select" value={fRisk} onChange={(e) => setFRisk(e.target.value)}>
          <option value="All">All Risk Levels</option>
          <option value="Low">Low</option>
          <option value="Moderate">Moderate</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.HeartPulse size={24} /></div>
            <h4>No health records</h4>
            <p>Record a health check to start tracking and get risk predictions.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Animal</th><th>Temp</th><th>HR</th><th>Risk Score</th><th>Risk Level</th><th>Reasons</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.record_date)}</td>
                    <td style={{ fontWeight: 600 }}>{animalName(r.animal_id)}</td>
                    <td>{r.temperature ? `${r.temperature}°C` : '—'}</td>
                    <td>{r.heart_rate ?? '—'}</td>
                    <td><span style={{ fontWeight: 700 }}>{r.risk_score}</span></td>
                    <td><span className={`badge badge-${r.risk_level === 'Low' ? 'green' : r.risk_level === 'Moderate' ? 'yellow' : r.risk_level === 'High' ? 'orange' : 'red'}`}>{r.risk_level}</span></td>
                    <td style={{ maxWidth: 250, fontSize: 11, color: 'var(--text-secondary)' }}>{r.reasons ?? '—'}</td>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Health Record' : 'Record Health Check'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Record'}</button></>}
      >
        <div className="form-group"><label className="form-label">Animal <span className="req">*</span></label>
          <select className="form-select" value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })}>
            <option value="">Select animal...</option>
            {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
          </select>
          {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}</div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Date <span className="req">*</span></label>
            <input className="form-input" type="date" value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Temperature (°C)</label>
            <input className="form-input" type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} placeholder="39.0" />
            {errors.temperature && <div className="form-error">{errors.temperature}</div>}</div>
        </div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Heart Rate (BPM)</label>
            <input className="form-input" type="number" value={form.heart_rate} onChange={(e) => setForm({ ...form, heart_rate: e.target.value })} placeholder="75" />
            {errors.heart_rate && <div className="form-error">{errors.heart_rate}</div>}</div>
          <div className="form-group"><label className="form-label">Appetite</label>
            <select className="form-select" value={form.appetite} onChange={(e) => setForm({ ...form, appetite: e.target.value })}>
              <option>Normal</option><option>Reduced</option><option>None</option>
            </select></div>
        </div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Activity Level</label>
            <select className="form-select" value={form.activity_level} onChange={(e) => setForm({ ...form, activity_level: e.target.value })}>
              <option>Normal</option><option>Low</option><option>Lethargic</option>
            </select></div>
          <div className="form-group"><label className="form-label">Body Condition</label>
            <select className="form-select" value={form.body_condition} onChange={(e) => setForm({ ...form, body_condition: e.target.value })}>
              <option>Good</option><option>Fair</option><option>Poor</option>
            </select></div>
        </div>

        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Eye Condition</label>
            <select className="form-select" value={form.eye_condition} onChange={(e) => setForm({ ...form, eye_condition: e.target.value })}>
              <option>Normal</option><option>Discharge</option><option>Cloudy</option>
            </select></div>
          <div className="form-group"><label className="form-label">Cough</label>
            <select className="form-select" value={form.cough ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, cough: e.target.value === 'yes' })}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select></div>
          <div className="form-group"><label className="form-label">Diarrhea</label>
            <select className="form-select" value={form.diarrhea ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, diarrhea: e.target.value === 'yes' })}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select></div>
        </div>

        <div className="form-group"><label className="form-label">Nasal Discharge</label>
          <select className="form-select" value={form.nasal_discharge ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, nasal_discharge: e.target.value === 'yes' })}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select></div>

        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

        <div className="form-hint" style={{ background: 'var(--primary-light)', padding: '10px 14px', borderRadius: 8, color: 'var(--primary-dark)' }}>
          The system will automatically calculate a health risk score and update the animal's health status after saving.
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Health Record" message="Are you sure you want to delete this health record?" confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
