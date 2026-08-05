import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ComboBox } from '../components/ComboBox';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { formatDate, daysUntil, vaccinationStatusFromDue } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import { GOAT_SHEEP_VACCINES, COMMON_VETS } from '../lib/farmDefaults';
import type { Vaccination } from '../types';

const emptyForm = {
  animal_id: '',
  vaccine_name: '',
  date_given: new Date().toISOString().split('T')[0],
  next_due_date: '',
  veterinarian: '',
  notes: '',
};

export function VaccinationsPage() {
  const farmData = useFarmData();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vaccination | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Vaccination | null>(null);
  const [fStatus, setFStatus] = useState('All');

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  const filtered = useMemo(() => {
    return farmData.vaccinations
      .filter((r) => {
        if (fStatus === 'All') return true;
        const status = vaccinationStatusFromDue(r.next_due_date, farmData.settings?.vaccine_due_days ?? 30);
        return status === fStatus;
      })
      .sort((a, b) => new Date(b.date_given).getTime() - new Date(a.date_given).getTime());
  }, [farmData.vaccinations, fStatus, farmData.settings]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: activeAnimals[0]?.id ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (r: Vaccination) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id, vaccine_name: r.vaccine_name, date_given: r.date_given,
      next_due_date: r.next_due_date ?? '', veterinarian: r.veterinarian ?? '', notes: r.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select an animal.';
    if (!form.vaccine_name.trim()) e.vaccine_name = 'Vaccine name is required.';
    if (!form.date_given) e.date_given = 'Date given is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const payload = {
      animal_id: form.animal_id,
      vaccine_name: form.vaccine_name.trim(),
      date_given: form.date_given,
      next_due_date: form.next_due_date || null,
      veterinarian: form.veterinarian.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('vaccinations').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Vaccination record updated.', 'success');
      } else {
        const { error } = await supabase.from('vaccinations').insert(payload);
        if (error) throw error;
        toast('Vaccination recorded.', 'success');
      }

      // Update animal's vaccination info
      const animal = farmData.animals.find((a) => a.id === form.animal_id);
      if (animal) {
        const vaccStatus = vaccinationStatusFromDue(form.next_due_date || null, farmData.settings?.vaccine_due_days ?? 30);
        await supabase.from('animals').update({
          last_vaccine_date: form.date_given,
          next_vaccine_date: form.next_due_date || null,
          vaccination_status: vaccStatus,
        }).eq('id', form.animal_id);

        // Create notification if overdue or due soon
        if (vaccStatus === 'Overdue') {
          await createNotification(animal.user_id, 'Vaccination', `${animal.name} — Vaccination overdue`, `${form.vaccine_name} was due ${form.next_due_date}`, 'Critical', '/vaccinations');
        } else if (vaccStatus === 'Due Soon') {
          const days = form.next_due_date ? daysUntil(form.next_due_date) : null;
          await createNotification(animal.user_id, 'Vaccination', `${animal.name} — Vaccination due in ${days} days`, `${form.vaccine_name} due ${form.next_due_date}`, 'Warning', '/vaccinations');
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
      const { error } = await supabase.from('vaccinations').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Vaccination record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete record.', 'error');
    }
  };

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  // Summary stats
  const dueSoon = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon').length;
  const overdue = activeAnimals.filter((a) => a.vaccination_status === 'Overdue').length;
  const upToDate = activeAnimals.filter((a) => a.vaccination_status === 'Up to Date').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Vaccination Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} vaccination records · Due dates auto-tracked
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={activeAnimals.length === 0}>
          <Plus size={16} /> Add Vaccination
        </button>
      </div>

      {/* Summary cards */}
      <div className="kpi-grid section-gap">
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon green"><Icons.Syringe size={20} /></div></div><div className="kpi-value">{upToDate}</div><div className="kpi-label">Up to Date</div></div>
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon orange"><Icons.Clock size={20} /></div></div><div className="kpi-value">{dueSoon}</div><div className="kpi-label">Due Soon</div></div>
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon red"><Icons.AlertTriangle size={20} /></div></div><div className="kpi-value">{overdue}</div><div className="kpi-label">Overdue</div></div>
      </div>

      <div className="filter-bar">
        <select className="form-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Up to Date">Up to Date</option>
          <option value="Due Soon">Due Soon</option>
          <option value="Overdue">Overdue</option>
          <option value="None">No Due Date</option>
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon"><Icons.Syringe size={24} /></div><h4>No vaccination records</h4><p>Add a vaccination to track immunization schedules.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date Given</th><th>Animal</th><th>Vaccine</th><th>Next Due</th><th>Status</th><th>Veterinarian</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((v) => {
                  const status = vaccinationStatusFromDue(v.next_due_date, farmData.settings?.vaccine_due_days ?? 30);
                  return (
                    <tr key={v.id}>
                      <td>{formatDate(v.date_given)}</td>
                      <td style={{ fontWeight: 600 }}>{animalName(v.animal_id)}</td>
                      <td>{v.vaccine_name}</td>
                      <td>{formatDate(v.next_due_date)}</td>
                      <td><span className={`badge badge-${status === 'Up to Date' ? 'green' : status === 'Due Soon' ? 'yellow' : status === 'Overdue' ? 'red' : 'gray'}`}>{status}</span></td>
                      <td>{v.veterinarian ?? '—'}</td>
                      <td><div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}><Pencil size={15} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(v)}><Trash2 size={15} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Vaccination' : 'Add Vaccination'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
      >
        <div className="form-group"><label className="form-label">Animal <span className="req">*</span></label>
          <select className="form-select" value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })}>
            <option value="">Select animal...</option>
            {activeAnimals.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>)}
          </select>
          {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}</div>
        <div className="form-group"><label className="form-label">Vaccine Name <span className="req">*</span></label>
          <ComboBox
            value={form.vaccine_name}
            onChange={(v) => setForm({ ...form, vaccine_name: v })}
            options={GOAT_SHEEP_VACCINES}
            placeholder="Search or type vaccine name..."
          />
          {errors.vaccine_name && <div className="form-error">{errors.vaccine_name}</div>}</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date Given <span className="req">*</span></label>
            <input className="form-input" type="date" value={form.date_given} onChange={(e) => setForm({ ...form, date_given: e.target.value })} />
            {errors.date_given && <div className="form-error">{errors.date_given}</div>}</div>
          <div className="form-group"><label className="form-label">Next Due Date</label>
            <input className="form-input" type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Veterinarian</label>
          <ComboBox
            value={form.veterinarian}
            onChange={(v) => setForm({ ...form, veterinarian: v })}
            options={COMMON_VETS}
            placeholder="Search or type veterinarian name..."
          /></div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Vaccination" message="Are you sure you want to delete this vaccination record?" confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
