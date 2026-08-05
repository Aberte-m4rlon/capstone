import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { calculateKiddingDate, formatDate, daysUntil, assessBreedingReadiness } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import type { BreedingRecord } from '../types';

const emptyForm = {
  animal_id: '',
  partner_id: '',
  mating_date: new Date().toISOString().split('T')[0],
  status: 'Pregnant',
  notes: '',
};

export function BreedingPage() {
  const farmData = useFarmData();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BreedingRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BreedingRecord | null>(null);
  const [fStatus, setFStatus] = useState('All');

  const females = farmData.animals.filter((a) => !a.archived && a.sex === 'Female');
  const males = farmData.animals.filter((a) => !a.archived && a.sex === 'Male');

  const filtered = useMemo(() => {
    return farmData.breedingRecords
      .filter((r) => fStatus === 'All' || r.status === fStatus)
      .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime());
  }, [farmData.breedingRecords, fStatus]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: females[0]?.id ?? '', partner_id: males[0]?.id ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (r: BreedingRecord) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id, partner_id: r.partner_id ?? '', mating_date: r.mating_date,
      status: r.status, notes: r.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select a female animal.';
    if (!form.mating_date) e.mating_date = 'Mating date is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const gestation = farmData.settings?.gestation_days ?? 150;
    const expectedKidding = calculateKiddingDate(form.mating_date, gestation);

    const payload = {
      animal_id: form.animal_id,
      partner_id: form.partner_id || null,
      mating_date: form.mating_date,
      expected_kidding_date: expectedKidding,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('breeding_records').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Breeding record updated.', 'success');
      } else {
        const { error } = await supabase.from('breeding_records').insert(payload);
        if (error) throw error;
        toast('Breeding record saved. Expected kidding date calculated.', 'success');
      }

      // Update animal breeding status
      const animal = farmData.animals.find((a) => a.id === form.animal_id);
      if (animal) {
        await supabase.from('animals').update({
          breeding_status: form.status === 'Kidded' ? 'Open' : form.status === 'Pregnant' ? 'Pregnant' : form.status === 'Failed' ? 'Open' : 'Monitor',
          last_mating_date: form.mating_date,
          expected_kidding_date: form.status === 'Pregnant' ? expectedKidding : null,
        }).eq('id', form.animal_id);

        // Create kidding reminders
        if (form.status === 'Pregnant') {
          const daysToKidding = daysUntil(expectedKidding);
          if (daysToKidding > 0 && daysToKidding <= 30) {
            await createNotification(
              animal.user_id,
              'Breeding',
              `${animal.name} — Kidding due in ${daysToKidding} days`,
              `Expected kidding date: ${expectedKidding}`,
              daysToKidding <= 7 ? 'Critical' : 'Warning',
              `/animals/${animal.id}`,
            );
          }
        }
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
      const { error } = await supabase.from('breeding_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Breeding record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete record.', 'error');
    }
  };

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  // Breeding readiness assessments
  const readinessAssessments = useMemo(() => {
    if (!farmData.settings) return [];
    return females.map((f) => {
      const lastMating = farmData.breedingRecords
        .filter((b) => b.animal_id === f.id)
        .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime())[0] ?? null;
      return { animal: f, assessment: assessBreedingReadiness(f, farmData.settings!, lastMating) };
    }).filter((x) => x.assessment.recommendation !== 'Not Ready' || x.animal.breeding_status !== 'Pregnant');
  }, [females, farmData.breedingRecords, farmData.settings]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Breeding Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} breeding records · 150-day gestation auto-calculated
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={females.length === 0}>
          <Plus size={16} /> Add Breeding Record
        </button>
      </div>

      {/* Breeding Readiness Overview */}
      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 14 }}>Breeding Readiness</div>
        {readinessAssessments.length === 0 ? (
          <div className="empty-state"><div className="es-icon"><Icons.Heart size={24} /></div><h4>No females to assess</h4><p>Add female animals to see breeding recommendations.</p></div>
        ) : (
          <div className="grid-auto">
            {readinessAssessments.map(({ animal, assessment }) => (
              <div key={animal.id} style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{animal.name}</span>
                  <span className={`badge badge-${assessment.recommendation === 'Ready' ? 'green' : assessment.recommendation === 'Monitor' ? 'yellow' : 'gray'}`}>
                    {assessment.recommendation}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{assessment.reasons.join(' · ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="filter-bar">
        <select className="form-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Planned">Planned</option>
          <option value="Pregnant">Pregnant</option>
          <option value="Kidded">Kidded</option>
          <option value="Failed">Failed</option>
          <option value="Monitor">Monitor</option>
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon"><Icons.Heart size={24} /></div><h4>No breeding records</h4><p>Add a mating record to track pregnancy and kidding dates.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Female</th><th>Partner</th><th>Mating Date</th><th>Expected Kidding</th><th>Days Until</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((b) => {
                  const days = b.expected_kidding_date ? daysUntil(b.expected_kidding_date) : null;
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{animalName(b.animal_id)}</td>
                      <td>{b.partner_id ? animalName(b.partner_id) : '—'}</td>
                      <td>{formatDate(b.mating_date)}</td>
                      <td>{formatDate(b.expected_kidding_date)}</td>
                      <td>{days !== null && days >= 0 ? `${days} days` : '—'}</td>
                      <td><span className={`badge badge-${b.status === 'Pregnant' ? 'blue' : b.status === 'Kidded' ? 'green' : b.status === 'Failed' ? 'red' : 'gray'}`}>{b.status}</span></td>
                      <td><div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}><Pencil size={15} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(b)}><Trash2 size={15} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Breeding Record' : 'Add Breeding Record'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Record'}</button></>}
      >
        <div className="form-group"><label className="form-label">Female Animal <span className="req">*</span></label>
          <select className="form-select" value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })}>
            <option value="">Select female...</option>
            {females.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
          </select>
          {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}</div>

        <div className="form-group"><label className="form-label">Partner (Sire)</label>
          <select className="form-select" value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}>
            <option value="">Select male (optional)...</option>
            {males.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
          </select></div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Mating Date <span className="req">*</span></label>
            <input className="form-input" type="date" value={form.mating_date} onChange={(e) => setForm({ ...form, mating_date: e.target.value })} />
            {errors.mating_date && <div className="form-error">{errors.mating_date}</div>}</div>
          <div className="form-group"><label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Planned">Planned</option>
              <option value="Pregnant">Pregnant</option>
              <option value="Kidded">Kidded</option>
              <option value="Failed">Failed</option>
              <option value="Monitor">Monitor</option>
            </select></div>
        </div>

        {form.mating_date && form.status === 'Pregnant' && (
          <div className="form-hint" style={{ background: 'var(--primary-light)', padding: '10px 14px', borderRadius: 8, color: 'var(--primary-dark)' }}>
            Expected kidding date: {formatDate(calculateKiddingDate(form.mating_date, farmData.settings?.gestation_days ?? 150))}
            <br />Calculated using {farmData.settings?.gestation_days ?? 150} days gestation.
          </div>
        )}

        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Breeding Record" message="Are you sure you want to delete this breeding record?" confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
