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

/* ─── Reusable Liquid Glass Style Tokens ─────────────────────────────────── */
const liquidGlassCard: React.CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.035))',
  backdropFilter: 'blur(32px) saturate(180%)',
  WebkitBackdropFilter: 'blur(32px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.20)',
  borderRadius: 24,
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1px 0 rgba(255, 255, 255, 0.04), 0 20px 50px rgba(0, 0, 0, 0.20)',
  transition: 'transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease, background 250ms ease',
  overflow: 'hidden',
};

const specularHighlight: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.20), transparent 28%, transparent 70%, rgba(255, 255, 255, 0.06))',
  pointerEvents: 'none',
  zIndex: 1,
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
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 26,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(255, 106, 42, 0.22), rgba(255, 59, 48, 0.10))',
              border: '1px solid rgba(255, 106, 42, 0.35)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.30), 0 8px 20px rgba(255, 106, 42, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FF6A2A',
            }}
          >
            <Syringe size={24} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: 900,
                color: 'var(--text)',
                margin: 0,
                letterSpacing: '-0.6px',
                lineHeight: 1.2,
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
                fontWeight: 500,
              }}
            >
              Immunization schedule, boosters, and disease resistance · {farmData.vaccinations.length} records logged
            </p>
          </div>
        </div>

        {/* ── Add Vaccination — Floating Liquid Glass Pill ─────────── */}
        <button
          onClick={openAdd}
          disabled={activeAnimals.length === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 26px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.92), rgba(255, 106, 42, 0.84))',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.30)',
            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 10px 30px rgba(255, 80, 30, 0.25)',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '13px',
            letterSpacing: '0.2px',
            cursor: activeAnimals.length === 0 ? 'not-allowed' : 'pointer',
            opacity: activeAnimals.length === 0 ? 0.5 : 1,
            transition: 'transform 200ms ease, box-shadow 200ms ease',
          }}
          onMouseEnter={(e) => {
            if (activeAnimals.length > 0) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.45), 0 14px 36px rgba(255, 80, 30, 0.35)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 10px 30px rgba(255, 80, 30, 0.25)';
          }}
        >
          <Plus size={16} strokeWidth={2.8} />
          Add Vaccination
        </button>
      </div>

      {/* ── 3 Floating Liquid Glass Statistic Cards ───────────────── */}
      <div
        className="kpi-grid section-gap"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Card 1: Up to Date (Warm Amber Glass) */}
        <div
          onClick={() => setFStatus(fStatus === 'Up to Date' ? 'All' : 'Up to Date')}
          style={{
            ...liquidGlassCard,
            padding: '20px 22px',
            cursor: 'pointer',
            background: fStatus === 'Up to Date'
              ? 'linear-gradient(135deg, rgba(255, 179, 64, 0.24), rgba(255, 122, 24, 0.08))'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.035))',
            borderColor: fStatus === 'Up to Date' ? 'rgba(255, 179, 64, 0.45)' : 'rgba(255, 255, 255, 0.20)',
            boxShadow: fStatus === 'Up to Date'
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.40), 0 20px 50px rgba(255, 179, 64, 0.20)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.30), 0 18px 45px rgba(0, 0, 0, 0.20)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={specularHighlight} />
          <div className="kpi-top" style={{ position: 'relative', zIndex: 2 }}>
            <div
              className="kpi-icon"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 179, 64, 0.25), rgba(255, 122, 24, 0.08))',
                border: '1px solid rgba(255, 179, 64, 0.35)',
                color: '#FFB340',
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#FFB340',
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255, 179, 64, 0.15)',
                border: '1px solid rgba(255, 179, 64, 0.30)',
                letterSpacing: '0.6px',
              }}
            >
              PROTECTED
            </span>
          </div>
          <div className="kpi-value" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            {upToDate}
          </div>
          <div className="kpi-label" style={{ position: 'relative', zIndex: 2 }}>
            UP TO DATE
          </div>
          <div style={{ fontSize: 11, color: '#FFB340', marginTop: 3, fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Immunity active & verified
          </div>
        </div>

        {/* Card 2: Due Soon (Amber/Orange Glass) */}
        <div
          onClick={() => setFStatus(fStatus === 'Due Soon' ? 'All' : 'Due Soon')}
          style={{
            ...liquidGlassCard,
            padding: '20px 22px',
            cursor: 'pointer',
            background: fStatus === 'Due Soon'
              ? 'linear-gradient(135deg, rgba(255, 159, 10, 0.24), rgba(255, 106, 42, 0.08))'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.035))',
            borderColor: fStatus === 'Due Soon' ? 'rgba(255, 159, 10, 0.45)' : 'rgba(255, 255, 255, 0.20)',
            boxShadow: fStatus === 'Due Soon'
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.40), 0 20px 50px rgba(255, 159, 10, 0.20)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.30), 0 18px 45px rgba(0, 0, 0, 0.20)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={specularHighlight} />
          <div className="kpi-top" style={{ position: 'relative', zIndex: 2 }}>
            <div
              className="kpi-icon"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 159, 10, 0.25), rgba(255, 106, 42, 0.08))',
                border: '1px solid rgba(255, 159, 10, 0.35)',
                color: '#FF9F0A',
              }}
            >
              <Clock size={22} />
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#FF9F0A',
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255, 159, 10, 0.15)',
                border: '1px solid rgba(255, 159, 10, 0.30)',
                letterSpacing: '0.6px',
              }}
            >
              UPCOMING
            </span>
          </div>
          <div className="kpi-value" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            {dueSoon}
          </div>
          <div className="kpi-label" style={{ position: 'relative', zIndex: 2 }}>
            DUE SOON
          </div>
          <div style={{ fontSize: 11, color: '#FF9F0A', marginTop: 3, fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Due within {farmData.settings?.vaccine_due_days ?? 30} days
          </div>
        </div>

        {/* Card 3: Overdue (Red Glass) */}
        <div
          onClick={() => setFStatus(fStatus === 'Overdue' ? 'All' : 'Overdue')}
          style={{
            ...liquidGlassCard,
            padding: '20px 22px',
            cursor: 'pointer',
            background: fStatus === 'Overdue'
              ? 'linear-gradient(135deg, rgba(255, 59, 48, 0.26), rgba(217, 45, 32, 0.08))'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.035))',
            borderColor: fStatus === 'Overdue' ? 'rgba(255, 59, 48, 0.50)' : 'rgba(255, 255, 255, 0.20)',
            boxShadow: fStatus === 'Overdue'
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.40), 0 20px 50px rgba(255, 59, 48, 0.22)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.30), 0 18px 45px rgba(0, 0, 0, 0.20)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={specularHighlight} />
          <div className="kpi-top" style={{ position: 'relative', zIndex: 2 }}>
            <div
              className="kpi-icon"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.25), rgba(217, 45, 32, 0.08))',
                border: '1px solid rgba(255, 59, 48, 0.35)',
                color: '#FF3B30',
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#FF3B30',
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255, 59, 48, 0.15)',
                border: '1px solid rgba(255, 59, 48, 0.30)',
                letterSpacing: '0.6px',
              }}
            >
              ALERT
            </span>
          </div>
          <div className="kpi-value" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            {overdue}
          </div>
          <div className="kpi-label" style={{ position: 'relative', zIndex: 2 }}>
            OVERDUE
          </div>
          <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 3, fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Requires booster dose
          </div>
        </div>
      </div>

      {/* ── Floating Liquid Glass Filter & Search Capsule Panel ────── */}
      <div
        style={{
          ...liquidGlassCard,
          borderRadius: 20,
          padding: '12px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={specularHighlight} />
        
        {/* Quick Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative', zIndex: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Filter:
          </span>
          {filterTabs.map((tab) => {
            const isActive = fStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFStatus(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  background: isActive
                    ? 'linear-gradient(135deg, #FF3B30, #FF6A2A)'
                    : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  border: isActive
                    ? '1px solid rgba(255, 255, 255, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: isActive ? '0 4px 16px rgba(255, 80, 30, 0.30)' : 'none',
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
                      background: isActive ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.12)',
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

        {/* Real-time Glass Search Input */}
        <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px', maxWidth: 360, zIndex: 2 }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search animal, tag, or vaccine..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 38px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.03))',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: 'var(--text)',
              fontSize: '12px',
              fontWeight: 500,
              outline: 'none',
              transition: 'all 200ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#FF6A2A';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 106, 42, 0.25)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* ── Main Liquid Glass Table Card ──────────────────────────── */}
      <div style={{ ...liquidGlassCard, padding: 0 }}>
        <div style={specularHighlight} />

        {filtered.length === 0 ? (
          /* Empty State */
          <div style={{ padding: '70px 24px', textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 22,
                background: 'linear-gradient(135deg, rgba(255, 106, 42, 0.22), rgba(255, 59, 48, 0.10))',
                border: '1px solid rgba(255, 106, 42, 0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.30), 0 10px 30px rgba(255, 106, 42, 0.20)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                color: '#FF6A2A',
              }}
            >
              <Syringe size={34} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>
              No vaccination records found
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 440, margin: '8px auto 22px', lineHeight: 1.5 }}>
              {searchQuery || fStatus !== 'All'
                ? 'Try adjusting your search query or status filter to see matching records.'
                : 'Add your first animal vaccination to automatically track schedules, boosters, and resistance.'}
            </p>
            <button
              onClick={openAdd}
              disabled={activeAnimals.length === 0}
              style={{
                padding: '10px 24px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #FF3B30, #FF6A2A)',
                border: '1px solid rgba(255, 255, 255, 0.30)',
                boxShadow: '0 8px 24px rgba(255, 80, 30, 0.25)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Plus size={16} /> Add Vaccination Record
            </button>
          </div>
        ) : (
          /* Data Table */
          <div className="table-wrap" style={{ background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0, position: 'relative', zIndex: 2 }}>
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
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              background: 'linear-gradient(135deg, rgba(255, 106, 42, 0.18), rgba(255, 59, 48, 0.08))',
                              border: '1px solid rgba(255, 106, 42, 0.30)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 15,
                              flexShrink: 0,
                            }}
                          >
                            {aSpecies === 'Sheep' ? '🐑' : '🐐'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>{aName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{aTag}</div>
                          </div>
                        </div>
                      </td>

                      {/* Vaccine */}
                      <td>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{v.vaccine_name}</div>
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
                                color: daysLeft < 0 ? '#FF3B30' : daysLeft <= 14 ? '#FF9F0A' : '#FFB340',
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
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.14)',
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmDelete(v)}
                            title="Delete Record"
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: 'rgba(255, 59, 48, 0.12)',
                              border: '1px solid rgba(255, 59, 48, 0.28)',
                              color: '#FF3B30',
                            }}
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

      {/* ── Add / Edit Modal ───────────────────────────────────────── */}
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

      {/* ── Confirm Deletion Dialog ────────────────────────────────── */}
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
