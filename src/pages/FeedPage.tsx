import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Brain, TrendingUp } from 'lucide-react';
import { formatDate } from '../lib/analytics';
import { calculateFeedEfficiency, calculateMilkForecast } from '../lib/analytics';
import { useMilkForecast, useFeedPrediction } from '../lib/mlHooks';
import type { FeedRecord, MilkRecord } from '../types';

const emptyForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  feed_type: '',
  quantity_kg: '',
  cost: '',
  notes: '',
};

const emptyMilkForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  yield_litres: '',
  notes: '',
};

export function FeedPage() {
  const farmData = useFarmData();
  const toast = useToast();
  const feedPred = useFeedPrediction();

  const [modalOpen, setModalOpen] = useState(false);
  const [milkModalOpen, setMilkModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeedRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [milkForm, setMilkForm] = useState(emptyMilkForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FeedRecord | null>(null);
  const [tab, setTab] = useState<'feed' | 'milk'>('feed');
  const [fAnimal, setFAnimal] = useState('All');

  const activeAnimals = farmData.animals.filter((a) => !a.archived);
  const females = activeAnimals.filter((a) => a.sex === 'Female');

  const filteredFeed = useMemo(() => {
    return farmData.feedRecords
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.feedRecords, fAnimal]);

  const filteredMilk = useMemo(() => {
    return farmData.milkRecords
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.milkRecords, fAnimal]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: activeAnimals[0]?.id ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (r: FeedRecord) => {
    setEditing(r);
    setForm({ animal_id: r.animal_id, record_date: r.record_date, feed_type: r.feed_type, quantity_kg: String(r.quantity_kg), cost: String(r.cost), notes: r.notes ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select an animal.';
    if (!form.feed_type.trim()) e.feed_type = 'Feed type is required.';
    if (!form.quantity_kg || isNaN(Number(form.quantity_kg)) || Number(form.quantity_kg) < 0) e.quantity_kg = 'Quantity must be 0 or more.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      animal_id: form.animal_id, record_date: form.record_date, feed_type: form.feed_type.trim(),
      quantity_kg: Number(form.quantity_kg), cost: form.cost ? Number(form.cost) : 0,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('feed_records').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Feed record updated.', 'success');
      } else {
        const { error } = await supabase.from('feed_records').insert(payload);
        if (error) throw error;
        toast('Feed record saved.', 'success');
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
      const { error } = await supabase.from('feed_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Feed record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete record.', 'error');
    }
  };

  // Milk handlers
  const openMilkAdd = () => {
    setMilkForm({ ...emptyMilkForm, animal_id: females[0]?.id ?? '' });
    setErrors({});
    setMilkModalOpen(true);
  };

  const handleMilkSave = async () => {
    const e: Record<string, string> = {};
    if (!milkForm.animal_id) e.animal_id = 'Please select an animal.';
    if (!milkForm.yield_litres || isNaN(Number(milkForm.yield_litres)) || Number(milkForm.yield_litres) < 0) e.yield_litres = 'Yield must be 0 or more.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('milk_records').insert({
        animal_id: milkForm.animal_id, record_date: milkForm.record_date,
        yield_litres: Number(milkForm.yield_litres), notes: milkForm.notes.trim() || null,
      });
      if (error) throw error;
      toast('Milk record saved.', 'success');
      setMilkModalOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMilkDelete = async (r: MilkRecord) => {
    try {
      const { error } = await supabase.from('milk_records').delete().eq('id', r.id);
      if (error) throw error;
      toast('Milk record deleted.', 'success');
      farmData.refresh();
    } catch {
      toast('Unable to delete record.', 'error');
    }
  };

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  // Feed efficiency per animal
  const feedEfficiency = useMemo(() => {
    return activeAnimals.map((a) => {
      const feeds = farmData.feedRecords.filter((f) => f.animal_id === a.id);
      const weights = farmData.weightRecords.filter((w) => w.animal_id === a.id);
      if (feeds.length === 0) return null;
      return { animal: a, efficiency: calculateFeedEfficiency(feeds, weights) };
    }).filter(Boolean) as { animal: typeof activeAnimals[0]; efficiency: ReturnType<typeof calculateFeedEfficiency> }[];
  }, [activeAnimals, farmData.feedRecords, farmData.weightRecords]);

  // Milk forecast per animal
  const milkForecasts = useMemo(() => {
    return females.map((a) => {
      const records = farmData.milkRecords.filter((m) => m.animal_id === a.id);
      if (records.length === 0) return null;
      return { animal: a, forecast: calculateMilkForecast(records) };
    }).filter(Boolean) as { animal: typeof females[0]; forecast: ReturnType<typeof calculateMilkForecast> }[];
  }, [females, farmData.milkRecords]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Feed Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Track feed, efficiency, and milk production
          </p>
        </div>
        {tab === 'feed'
          ? <button className="btn btn-primary" onClick={openAdd} disabled={activeAnimals.length === 0}><Plus size={16} /> Record Feed</button>
          : <button className="btn btn-primary" onClick={openMilkAdd} disabled={females.length === 0}><Plus size={16} /> Record Milk</button>
        }
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'feed' ? 'active' : ''}`} onClick={() => setTab('feed')}>Feed Records</button>
        <button className={`tab ${tab === 'milk' ? 'active' : ''}`} onClick={() => setTab('milk')}>Milk Production</button>
      </div>

      {tab === 'feed' && (
        <>
          {/* Feed efficiency summary */}
          <div className="card section-gap">
            <div className="card-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={16} color="#FF7A18" /> Feed Efficiency & ML Feed-to-Gain Regression
            </div>
            {feedEfficiency.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Wheat size={24} /></div><h4>No feed data yet</h4><p>Record feed to see efficiency scores.</p></div>
            ) : (
              <div className="grid-auto">
                {feedEfficiency.map(({ animal, efficiency }) => (
                  <div key={animal.id} style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{animal.name}</span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: efficiency.score >= 80 ? 'var(--healthy)' : efficiency.score >= 60 ? 'var(--info)' : efficiency.score >= 40 ? 'var(--warning)' : 'var(--critical)' }}>{efficiency.score}/100</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{efficiency.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Total feed: {efficiency.totalFeedKg} kg · Cost: ₱{efficiency.totalCost}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {feedPred && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} color="#FF7A18" /> ML Feed-to-Weight-Gain Model
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>R²</span> <span style={{ fontWeight: 700 }}>{feedPred.model.rSquared.toFixed(3)}</span></div>
                  <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Slope</span> <span style={{ fontWeight: 700 }}>{feedPred.model.slope} kg/kg</span></div>
                  <div><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Confidence</span> <span style={{ fontWeight: 700, color: feedPred.model.rSquared >= 0.5 ? 'var(--healthy)' : 'var(--warning)' }}>{Math.round(feedPred.model.rSquared * 100)}%</span></div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Linear regression trained on your feed + weight data. Predicts expected weight gain from feed amount.</p>
              </div>
            )}
          </div>

          <div className="filter-bar">
            <select className="form-select" value={fAnimal} onChange={(e) => setFAnimal(e.target.value)}>
              <option value="All">All Animals</option>
              {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
            </select>
          </div>

          <div className="card">
            {filteredFeed.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Wheat size={24} /></div><h4>No feed records</h4><p>Record feed to track consumption and efficiency.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Animal</th><th>Feed Type</th><th>Quantity</th><th>Cost</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredFeed.map((f) => (
                      <tr key={f.id}>
                        <td>{formatDate(f.record_date)}</td>
                        <td style={{ fontWeight: 600 }}>{animalName(f.animal_id)}</td>
                        <td>{f.feed_type}</td>
                        <td>{f.quantity_kg} kg</td>
                        <td>{f.cost ? `₱${f.cost}` : '—'}</td>
                        <td><div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(f)}><Pencil size={15} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(f)}><Trash2 size={15} /></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'milk' && (
        <>
          {/* Milk forecast */}
          <div className="card section-gap">
            <div className="card-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={16} color="#3B82F6" /> ML Milk Yield Forecast — Holt's Exponential Smoothing
            </div>
            {milkForecasts.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Milk size={24} /></div><h4>No milk records yet</h4><p>Record daily milk yield to see forecasts.</p></div>
            ) : (
              <div className="grid-auto">
                {milkForecasts.map(({ animal, forecast }) => (
                  <div key={animal.id} style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{animal.name}</div>
                    <div className="stat-row"><span className="sr-label">Current</span><span className="sr-value">{forecast.current} L/day</span></div>
                    <div className="stat-row"><span className="sr-label">Average</span><span className="sr-value">{forecast.average} L/day</span></div>
                    <div className="stat-row"><span className="sr-label">Trend</span><span className="sr-value">{forecast.trend}</span></div>
                    <div className="stat-row"><span className="sr-label">Next Month Forecast</span><span className="sr-value">{forecast.forecastNextMonth !== null ? `${forecast.forecastNextMonth} L/day` : 'Not enough data yet'}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            {filteredMilk.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Milk size={24} /></div><h4>No milk records</h4><p>Record daily milk yield to track production.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Animal</th><th>Yield (L)</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredMilk.map((m) => (
                      <tr key={m.id}>
                        <td>{formatDate(m.record_date)}</td>
                        <td style={{ fontWeight: 600 }}>{animalName(m.animal_id)}</td>
                        <td>{m.yield_litres} L</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => handleMilkDelete(m)}><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Feed Record' : 'Record Feed'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
      >
        <div className="form-group"><label className="form-label">Animal <span className="req">*</span></label>
          <select className="form-select" value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })}>
            <option value="">Select animal...</option>
            {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
          </select>
          {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}</div>
        <div className="form-group"><label className="form-label">Feed Type <span className="req">*</span></label>
          <input className="form-input" value={form.feed_type} onChange={(e) => setForm({ ...form, feed_type: e.target.value })} placeholder="Rice bran, grass, pellets..." />
          {errors.feed_type && <div className="form-error">{errors.feed_type}</div>}</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Quantity (kg) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.1" value={form.quantity_kg} onChange={(e) => setForm({ ...form, quantity_kg: e.target.value })} />
            {errors.quantity_kg && <div className="form-error">{errors.quantity_kg}</div>}</div>
          <div className="form-group"><label className="form-label">Cost (₱)</label>
            <input className="form-input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal open={milkModalOpen} onClose={() => setMilkModalOpen(false)} title="Record Milk Yield"
        footer={<><button className="btn btn-secondary" onClick={() => setMilkModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleMilkSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
      >
        <div className="form-group"><label className="form-label">Animal <span className="req">*</span></label>
          <select className="form-select" value={milkForm.animal_id} onChange={(e) => setMilkForm({ ...milkForm, animal_id: e.target.value })}>
            <option value="">Select female...</option>
            {females.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
          </select>
          {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label>
            <input className="form-input" type="date" value={milkForm.record_date} onChange={(e) => setMilkForm({ ...milkForm, record_date: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Yield (Litres) <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={milkForm.yield_litres} onChange={(e) => setMilkForm({ ...milkForm, yield_litres: e.target.value })} />
            {errors.yield_litres && <div className="form-error">{errors.yield_litres}</div>}</div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={milkForm.notes} onChange={(e) => setMilkForm({ ...milkForm, notes: e.target.value })} /></div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Feed Record" message="Are you sure you want to delete this feed record?" confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
