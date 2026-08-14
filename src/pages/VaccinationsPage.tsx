import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ComboBox } from '../components/ComboBox';
import {
  Plus,
  Pencil,
  Trash2,
  Syringe,
  Clock,
  AlertTriangle,
  Search,
  Calendar,
  User,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  const animalMap = useMemo(() => {
    const map = new Map<string, typeof farmData.animals[0]>();
    farmData.animals.forEach((a) => map.set(a.id, a));
    return map;
  }, [farmData.animals]);

  const animalName = (id: string) => animalMap.get(id)?.name ?? 'Unknown';
  const animalTag = (id: string) => animalMap.get(id)?.tag_id ?? '—';
  const animalSpecies = (id: string) => animalMap.get(id)?.species ?? 'Goat';

  const filtered = useMemo(() => {
    return farmData.vaccinations
      .filter((r) => {
        const status = vaccinationStatusFromDue(r.next_due_date, farmData.settings?.vaccine_due_days ?? 30);
        if (fStatus !== 'All') {
          if (fStatus === 'No Due Date') {
            if (status !== 'None') return false;
          } else if (status !== fStatus) {
            return false;
          }
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const aName = animalName(r.animal_id).toLowerCase();
          const aTag = animalTag(r.animal_id).toLowerCase();
          const vName = r.vaccine_name.toLowerCase();
          const vet = (r.veterinarian ?? '').toLowerCase();
          if (!aName.includes(q) && !aTag.includes(q) && !vName.includes(q) && !vet.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date_given).getTime() - new Date(a.date_given).getTime());
  }, [farmData.vaccinations, fStatus, searchQuery, farmData.settings, farmData.animals]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: activeAnimals[0]?.id ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (r: Vaccination) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id,
      vaccine_name: r.vaccine_name,
      date_given: r.date_given,
      next_due_date: r.next_due_date ?? '',
      veterinarian: r.veterinarian ?? '',
      notes: r.notes ?? '',
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
      const animal = farmData.animals.find((a) => a.id === form.animal_id);
      if (animal) {
        const vaccStatus = vaccinationStatusFromDue(form.next_due_date || null, farmData.settings?.vaccine_due_days ?? 30);
        await supabase
          .from('animals')
          .update({ last_vaccine_date: form.date_given, next_vaccine_date: form.next_due_date || null, vaccination_status: vaccStatus })
          .eq('id', form.animal_id);
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

  const upToDate = activeAnimals.filter((a) => a.vaccination_status === 'Up to Date').length;
  const dueSoon = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon').length;
  const overdue = activeAnimals.filter((a) => a.vaccination_status === 'Overdue').length;

  const filterTabs = [
    { id: 'All', label: 'All Records', count: farmData.vaccinations.length },
    { id: 'Up to Date', label: 'Up to Date', count: upToDate },
    { id: 'Due Soon', label: 'Due Soon', count: dueSoon },
    { id: 'Overdue', label: 'Overdue', count: overdue },
    { id: 'No Due Date', label: 'No Due Date', count: null },
  ];

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.15), rgba(255, 122, 24, 0.15))',
              border: '1px solid rgba(255, 122, 24, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-orange)',
            }}
          >
            <Syringe size={22} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 800,
                color: 'var(--text)',
                margin: 0,
                letterSpacing: '-0.5px',
              }}
            >
              Vaccination Management
            </h1>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '13px',
                margin: 0,
                marginTop: 2,
              }}
            >
              Immunization schedule, boosters, and health protection · {farmData.vaccinations.length} total records
            </p>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={openAdd}
          disabled={activeAnimals.length === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            fontWeight: 700,
            fontSize: '13px',
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Vaccination
        </button>
      </div>

      {/* KPI Cards */}
      <div
        className="kpi-grid section-gap"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Up to Date */}
        <div
          className="kpi-card"
          onClick={() => setFStatus(fStatus === 'Up to Date' ? 'All' : 'Up to Date')}
          style={{
            cursor: 'pointer',
            borderColor: fStatus === 'Up to Date' ? 'var(--healthy)' : undefined,
          }}
        >
          <div className="kpi-top">
            <div className="kpi-icon" style={{ background: 'rgba(255, 179, 64, 0.15)', color: 'var(--healthy)' }}>
              <ShieldCheck size={20} />
            </div>
            <span className="badge badge-healthy">PROTECTED</span>
          </div>
          <div className="kpi-value">{upToDate}</div>
          <div className="kpi-label">UP TO DATE</div>
          <div style={{ fontSize: 11, color: 'var(--healthy)', marginTop: 4, fontWeight: 600 }}>
            Immunity active & verified
          </div>
        </div>

        {/* Due Soon */}
        <div
          className="kpi-card"
          onClick={() => setFStatus(fStatus === 'Due Soon' ? 'All' : 'Due Soon')}
          style={{
            cursor: 'pointer',
            borderColor: fStatus === 'Due Soon' ? 'var(--warning)' : undefined,
          }}
        >
          <div className="kpi-top">
            <div className="kpi-icon" style={{ background: 'rgba(255, 122, 24, 0.15)', color: 'var(--warning)' }}>
              <Clock size={20} />
            </div>
            <span className="badge badge-orange">UPCOMING</span>
          </div>
          <div className="kpi-value">{dueSoon}</div>
          <div className="kpi-label">DUE SOON</div>
          <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4, fontWeight: 600 }}>
            Due within {farmData.settings?.vaccine_due_days ?? 30} days
          </div>
        </div>

        {/* Overdue */}
        <div
          className="kpi-card"
          onClick={() => setFStatus(fStatus === 'Overdue' ? 'All' : 'Overdue')}
          style={{
            cursor: 'pointer',
            borderColor: fStatus === 'Overdue' ? 'var(--critical)' : undefined,
          }}
        >
          <div className="kpi-top">
            <div className="kpi-icon" style={{ background: 'rgba(255, 59, 48, 0.15)', color: 'var(--critical)' }}>
              <AlertTriangle size={20} />
            </div>
            <span className="badge badge-critical">ALERT</span>
          </div>
          <div className="kpi-value">{overdue}</div>
          <div className="kpi-label">OVERDUE</div>
          <div style={{ fontSize: 11, color: 'var(--critical)', marginTop: 4, fontWeight: 600 }}>
            Requires booster dose
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        className="card"
        style={{
          padding: '12px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Filter:
          </span>
          {filterTabs.map((tab) => {
            const isActive = fStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFStatus(tab.id)}
                className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 999,
                      background: isActive ? 'rgba(0, 0, 0, 0.25)' : 'var(--surface)',
                      fontWeight: 800,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search animal, tag, or vaccine..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: 38,
              borderRadius: 'var(--radius-pill)',
              fontSize: '12px',
            }}
          />
        </div>
      </div>

      {/* Main Records Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 'var(--radius)',
                background: 'var(--surface)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                color: 'var(--primary-orange)',
              }}
            >
              <Syringe size={30} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              No vaccination records found
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 420, margin: '8px auto 20px', lineHeight: 1.5 }}>
              {searchQuery || fStatus !== 'All'
                ? 'Try adjusting your search query or status filter to see vaccination records.'
                : 'Add your first animal vaccination to track boosters, schedules, and immunization history.'}
            </p>
            <button className="btn btn-primary" onClick={openAdd} disabled={activeAnimals.length === 0}>
              <Plus size={16} /> Add Vaccination Record
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date Given</th>
                  <th>Animal & Tag</th>
                  <th>Vaccine Details</th>
                  <th>Next Due Date</th>
                  <th>Status</th>
                  <th>Veterinarian</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const status = vaccinationStatusFromDue(v.next_due_date, farmData.settings?.vaccine_due_days ?? 30);
                  const aName = animalName(v.animal_id);
                  const aTag = animalTag(v.animal_id);
                  const aSpecies = animalSpecies(v.animal_id);
                  const daysLeft = v.next_due_date ? daysUntil(v.next_due_date) : null;

                  return (
                    <tr key={v.id}>
                      {/* Date Given */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Calendar size={14} color="var(--text-tertiary)" />
                          <span style={{ fontWeight: 600 }}>{formatDate(v.date_given)}</span>
                        </div>
                      </td>

                      {/* Animal */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: 'var(--surface)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            {aSpecies === 'Sheep' ? '🐑' : '🐐'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{aName}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{aTag}</div>
                          </div>
                        </div>
                      </td>

                      {/* Vaccine */}
                      <td>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{v.vaccine_name}</div>
                          {v.notes && (
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.notes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Next Due Date & Relative Time */}
                      <td>
                        <div>
                          <div style={{ fontWeight: 600, color: v.next_due_date ? 'var(--text)' : 'var(--text-tertiary)' }}>
                            {formatDate(v.next_due_date)}
                          </div>
                          {daysLeft !== null && (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: daysLeft < 0 ? 'var(--critical)' : daysLeft <= 14 ? 'var(--warning)' : 'var(--healthy)',
                              }}
                            >
                              {daysLeft < 0
                                ? `${Math.abs(daysLeft)} days overdue`
                                : daysLeft === 0
                                ? 'Due today'
                                : `Due in ${daysLeft} days`}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td>
                        <span
                          className={`badge ${
                            status === 'Up to Date'
                              ? 'badge-healthy'
                              : status === 'Due Soon'
                              ? 'badge-orange'
                              : status === 'Overdue'
                              ? 'badge-critical'
                              : 'badge-gray'
                          }`}
                        >
                          {status === 'Up to Date' && <CheckCircle2 size={11} />}
                          {status === 'Due Soon' && <Clock size={11} />}
                          {status === 'Overdue' && <AlertTriangle size={11} />}
                          {status === 'None' ? 'No Due Date' : status}
                        </span>
                      </td>

                      {/* Veterinarian */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: v.veterinarian ? 'var(--text)' : 'var(--text-tertiary)' }}>
                          {v.veterinarian && <User size={13} color="var(--text-tertiary)" />}
                          <span>{v.veterinarian ?? '—'}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEdit(v)}
                            title="Edit Record"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmDelete(v)}
                            title="Delete Record"
                            style={{ color: 'var(--critical)' }}
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Vaccination Record' : 'Record New Vaccination'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update Record' : 'Save Vaccination'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">
            Target Animal <span className="req">*</span>
          </label>
          <select
            className="form-select"
            value={form.animal_id}
            onChange={(e) => setForm({ ...form, animal_id: e.target.value })}
          >
            <option value="">Select animal...</option>
            {activeAnimals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.tag_id}) — {a.species} • {a.breed ?? 'Standard'}
              </option>
            ))}
          </select>
          {errors.animal_id && <div className="form-error">{errors.animal_id}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">
            Vaccine Name <span className="req">*</span>
          </label>
          <ComboBox
            value={form.vaccine_name}
            onChange={(v) => setForm({ ...form, vaccine_name: v })}
            options={GOAT_SHEEP_VACCINES}
            placeholder="Search or type vaccine name (e.g. CDT, Dewormer)..."
          />
          {errors.vaccine_name && <div className="form-error">{errors.vaccine_name}</div>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              Date Given <span className="req">*</span>
            </label>
            <input
              className="form-input"
              type="date"
              value={form.date_given}
              onChange={(e) => setForm({ ...form, date_given: e.target.value })}
            />
            {errors.date_given && <div className="form-error">{errors.date_given}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Next Booster Due Date</label>
            <input
              className="form-input"
              type="date"
              value={form.next_due_date}
              onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Administering Veterinarian / Personnel</label>
          <ComboBox
            value={form.veterinarian}
            onChange={(v) => setForm({ ...form, veterinarian: v })}
            options={COMMON_VETS}
            placeholder="Search or type veterinarian name..."
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Clinical Notes & Dosage</label>
          <textarea
            className="form-textarea"
            placeholder="e.g. 2ml subcutaneous injection in neck. No immediate adverse reaction."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </Modal>

      {/* Confirm Deletion Dialog */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Vaccination Record"
        message="Are you sure you want to delete this vaccination record? This action cannot be undone."
        confirmLabel="Delete Record"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
