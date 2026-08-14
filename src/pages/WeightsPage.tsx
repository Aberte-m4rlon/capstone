import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, TrendingUp, Brain } from 'lucide-react';
import { calculateGrowth, formatDate, daysBetween } from '../lib/analytics';
import { useGrowthPrediction } from '../lib/mlHooks';
import { Line } from 'react-chartjs-2';
import type { WeightRecord } from '../types';

const emptyForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  weight_kg: '',
  notes: '',
};

export function WeightsPage() {
  const farmData = useFarmData();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WeightRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WeightRecord | null>(null);
  const [fAnimal, setFAnimal] = useState('All');
  const mlGrowth = useGrowthPrediction(fAnimal !== 'All' ? fAnimal : null);

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  const filtered = useMemo(() => {
    return farmData.weightRecords
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.weightRecords, fAnimal]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: activeAnimals[0]?.id ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (r: WeightRecord) => {
    setEditing(r);
    setForm({ animal_id: r.animal_id, record_date: r.record_date, weight_kg: String(r.weight_kg), notes: r.notes ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select an animal.';
    if (!form.weight_kg || isNaN(Number(form.weight_kg)) || Number(form.weight_kg) <= 0)
      e.weight_kg = 'Please enter a valid weight greater than 0.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    // Calculate previous weight, change, daily gain
    const animalWeights = farmData.weightRecords
      .filter((r) => r.animal_id === form.animal_id && (!editing || r.id !== editing.id))
      .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());

    const previousWeight = animalWeights.length > 0 ? Number(animalWeights[animalWeights.length - 1].weight_kg) : null;
    const currentWeight = Number(form.weight_kg);
    const weightChange = previousWeight !== null ? +(currentWeight - previousWeight).toFixed(2) : null;
    let dailyGain: number | null = null;
    if (previousWeight !== null && animalWeights.length > 0) {
      const prev = animalWeights[animalWeights.length - 1];
      const days = daysBetween(prev.record_date, form.record_date);
      if (days > 0) dailyGain = +((currentWeight - previousWeight) / days).toFixed(4);
    }

    const payload = {
      animal_id: form.animal_id,
      record_date: form.record_date,
      weight_kg: currentWeight,
      previous_weight_kg: previousWeight,
      weight_change_kg: weightChange,
      daily_gain_kg: dailyGain,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('weight_records').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Weight record updated.', 'success');
      } else {
        const { error } = await supabase.from('weight_records').insert(payload);
        if (error) throw error;
        toast('Weight record saved. Growth calculated.', 'success');
      }

      // Update animal's current weight
      await supabase.from('animals').update({ weight_kg: currentWeight }).eq('id', form.animal_id);

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
      const { error } = await supabase.from('weight_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Weight record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete record.', 'error');
    }
  };

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  // Growth summary per animal
  const growthSummaries = useMemo(() => {
    return activeAnimals.map((a) => {
      const records = farmData.weightRecords.filter((w) => w.animal_id === a.id);
      const growth = calculateGrowth(records, farmData.settings?.target_weight_kg ?? 40);
      return { animal: a, growth };
    }).filter((x) => x.growth.currentWeight > 0);
  }, [activeAnimals, farmData.weightRecords, farmData.settings]);

  // Chart data for selected animal
  const chartData = useMemo(() => {
    const records = fAnimal !== 'All'
      ? farmData.weightRecords.filter((w) => w.animal_id === fAnimal).sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime())
      : [];
    return {
      labels: records.map((r) => formatDate(r.record_date)),
      datasets: [{
        label: 'Weight (kg)', data: records.map((r) => Number(r.weight_kg)),
        borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.3, pointRadius: 3,
      }],
    };
  }, [farmData.weightRecords, fAnimal]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Weight & Growth Tracking</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} weight records · Daily gain and growth trends auto-calculated
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={activeAnimals.length === 0}>
          <Plus size={16} /> Record Weight
        </button>
      </div>

      {/* Growth summaries */}
      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 14 }}>Growth Summary</div>
        {growthSummaries.length === 0 ? (
          <div className="empty-state"><div className="es-icon"><Icons.Scale size={24} /></div><h4>No weight data yet</h4><p>Record weigh-ins to see growth predictions.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Animal</th><th>Current</th><th>Previous</th><th>Change</th><th>Daily Gain</th><th>Trend</th><th>Days to Target</th></tr></thead>
              <tbody>
                {growthSummaries.map(({ animal, growth }) => (
                  <tr key={animal.id}>
                    <td style={{ fontWeight: 600 }}>{animal.name}</td>
                    <td>{growth.currentWeight} kg</td>
                    <td>{growth.previousWeight !== null ? `${growth.previousWeight} kg` : '—'}</td>
                    <td style={{ color: growth.weightChange !== null && growth.weightChange > 0 ? 'var(--healthy)' : growth.weightChange !== null && growth.weightChange < 0 ? 'var(--critical)' : 'inherit' }}>
                      {growth.weightChange !== null ? `${growth.weightChange > 0 ? '+' : ''}${growth.weightChange} kg` : '—'}
                    </td>
                    <td>{growth.dailyGain !== null ? `${growth.dailyGain} kg/day` : '—'}</td>
                    <td><span className={`badge badge-${growth.trend === 'Good' ? 'green' : growth.trend === 'Declining' ? 'red' : growth.trend === 'Slow' ? 'yellow' : 'gray'}`}>{growth.trend}</span></td>
                    <td>{growth.daysToTarget !== null ? `${growth.daysToTarget} days` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fAnimal !== 'All' && chartData.labels.length > 0 && (
        <div className="card section-gap">
          <div className="card-title" style={{ marginBottom: 14 }}>Weight Chart — {animalName(fAnimal)}</div>
          <Line data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
      )}

      {/* ML Growth Prediction */}
      {mlGrowth && (
        <div className="card section-gap" style={{ borderLeft: '3px solid #FF7A18' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Brain size={18} color="#FF7A18" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>ML Growth Prediction — Polynomial Regression</span>
            <span className="badge" style={{ background: 'rgba(255, 122, 24, 0.15)', color: '#FF9F0A', border: '1px solid rgba(255, 122, 24, 0.25)' }}>R² = {mlGrowth.rSquared.toFixed(3)}</span>
            <span className="badge" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#FFB340', border: '1px solid rgba(255, 159, 10, 0.25)' }}>{mlGrowth.confidence}% confidence</span>
          </div>
          <div className="grid-4">
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Projected Daily Gain</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: mlGrowth.projectedDailyGain > 0 ? 'var(--healthy)' : 'var(--critical)' }}>{mlGrowth.projectedDailyGain} kg/day</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>30-Day Projection</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{mlGrowth.projectedWeights[Math.min(4, mlGrowth.projectedWeights.length - 1)]?.weight ?? '—'} kg</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Market Ready Date</div>
              <div style={{ fontSize: 16, fontWeight: 700, paddingTop: 4 }}>{mlGrowth.marketReadyDate ?? 'Already at target'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Model Fit (R²)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: mlGrowth.rSquared >= 0.7 ? 'var(--healthy)' : mlGrowth.rSquared >= 0.4 ? 'var(--warning)' : 'var(--critical)' }}>{mlGrowth.rSquared.toFixed(3)}</div>
            </div>
          </div>
          {mlGrowth.projectedWeights.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Projected Growth Curve with Confidence Interval</div>
              <Line
                data={{
                  labels: mlGrowth.projectedWeights.map((p) => p.date),
                  datasets: [
                    { label: 'Projected Weight', data: mlGrowth.projectedWeights.map((p) => p.weight), borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)', fill: false, tension: 0.3, pointRadius: 2 },
                    { label: 'Upper Bound', data: mlGrowth.projectedWeights.map((p) => p.upper), borderColor: 'rgba(59,130,246,0.3)', borderDash: [5, 5], fill: false, tension: 0.3, pointRadius: 0 },
                    { label: 'Lower Bound', data: mlGrowth.projectedWeights.map((p) => p.lower), borderColor: 'rgba(59,130,246,0.3)', borderDash: [5, 5], fill: false, tension: 0.3, pointRadius: 0 },
                  ],
                }}
                options={{ responsive: true, plugins: { legend: { display: true, labels: { font: { size: 10 } } } }, scales: { y: { beginAtZero: true } } }}
              />
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            This model fits a polynomial curve to your weight history and projects forward 90 days. The dashed lines show the confidence interval based on historical variance.
          </p>
        </div>
      )}

      <div className="filter-bar">
        <select className="form-select" value={fAnimal} onChange={(e) => setFAnimal(e.target.value)}>
          <option value="All">All Animals</option>
          {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon"><Icons.Scale size={24} /></div><h4>No weight records</h4><p>Record a weigh-in to start tracking growth.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Animal</th><th>Weight</th><th>Previous</th><th>Change</th><th>Daily Gain</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.record_date)}</td>
                    <td style={{ fontWeight: 600 }}>{animalName(w.animal_id)}</td>
                    <td>{w.weight_kg} kg</td>
                    <td>{w.previous_weight_kg !== null ? `${w.previous_weight_kg} kg` : '—'}</td>
                    <td>{w.weight_change_kg !== null ? `${w.weight_change_kg > 0 ? '+' : ''}${w.weight_change_kg} kg` : '—'}</td>
                    <td>{w.daily_gain_kg !== null ? `${w.daily_gain_kg} kg/day` : '—'}</td>
                    <td><div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(w)}><Pencil size={15} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(w)}><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Weight Record' : 'Record Weight'}
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
          <div className="form-group"><label className="form-label">Weight (kg) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} placeholder="35.5" />
            {errors.weight_kg && <div className="form-error">{errors.weight_kg}</div>}</div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Weight Record" message="Are you sure you want to delete this weight record?" confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
