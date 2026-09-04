import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select } from '../components/ui/Input';
import { ComboBox } from '../components/ComboBox';
import { FilterToolbar, FilterSearch, FilterPill } from '../components/FilterToolbar';
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
  Package,
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
  inventory_item_id: '',
  deduct_quantity: 1,
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
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      openAdd();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);


  const openEdit = (r: Vaccination) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id,
      vaccine_name: r.vaccine_name,
      date_given: r.date_given,
      next_due_date: r.next_due_date ?? '',
      veterinarian: r.veterinarian ?? '',
      notes: r.notes ?? '',
      inventory_item_id: '',
      deduct_quantity: 1,
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Pumili ng hayop.';
    if (!form.vaccine_name.trim()) e.vaccine_name = 'Kailangan ang pangalan ng bakuna.';
    if (!form.date_given) e.date_given = 'Kailangan ang vaccination date.';
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
        toast('Matagumpay na na-update ang record ng bakuna.', 'success');
      } else {
        const { error } = await supabase.from('vaccinations').insert(payload);
        if (error) throw error;
        toast('Matagumpay na na-save ang record ng bakuna.', 'success');
      }
      const animal = farmData.animals.find((a) => a.id === form.animal_id);
      if (animal) {
        const vaccStatus = vaccinationStatusFromDue(form.next_due_date || null, farmData.settings?.vaccine_due_days ?? 30);
        await supabase
          .from('animals')
          .update({ last_vaccine_date: form.date_given, next_vaccine_date: form.next_due_date || null, vaccination_status: vaccStatus })
          .eq('id', form.animal_id);
        if (vaccStatus === 'Overdue') {
          await createNotification(animal.user_id, 'Vaccination', `${animal.name} — Lampas na sa schedule ng bakuna`, `${form.vaccine_name} ay dapat noong ${form.next_due_date}`, 'Critical', '/vaccinations');
        } else if (vaccStatus === 'Due Soon') {
          const days = form.next_due_date ? daysUntil(form.next_due_date) : null;
          await createNotification(animal.user_id, 'Vaccination', `${animal.name} — Bakuna sa loob ng ${days} araw`, `${form.vaccine_name} schedule sa ${form.next_due_date}`, 'Warning', '/vaccinations');
        }
      }

      // Auto-deduct inventory if an inventory item was selected
      if (!editing && form.inventory_item_id) {
        const invItem = farmData.inventory.find((i) => i.id === form.inventory_item_id);
        if (invItem) {
          const qtyToDeduct = Number(form.deduct_quantity) || 1;
          const newStock = Math.max(0, invItem.quantity - qtyToDeduct);
          await supabase.from('inventory').update({ quantity: newStock }).eq('id', invItem.id);
          await supabase.from('inventory_transactions').insert({
            inventory_item_id: invItem.id,
            type: 'CONSUMPTION',
            quantity: qtyToDeduct,
            unit: invItem.unit,
            reason: 'Vaccination',
            reference_type: 'animal',
            reference_id: form.animal_id,
            notes: `Bakuna: ${form.vaccine_name} para kay ${animal?.tag_id ?? ''} (${animal?.name ?? ''})`,
            previous_stock: invItem.quantity,
            new_stock: newStock,
            cost_per_unit: invItem.cost ?? null,
          });
          toast(`Nai-bawas ang ${qtyToDeduct} ${invItem.unit} ng ${invItem.name} sa imbentaryo.`, 'success');
        }
      }

      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hindi mai-save ang record.';
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
      toast('Matagumpay na nabura ang record ng bakuna.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Hindi mabura ang record ng bakuna.', 'error');
    }
  };

  const upToDate = activeAnimals.filter((a) => a.vaccination_status === 'Up to Date').length;
  const dueSoon = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon').length;
  const overdue = activeAnimals.filter((a) => a.vaccination_status === 'Overdue').length;

  const filterTabs = [
    { id: 'All', label: 'Lahat ng Records', count: farmData.vaccinations.length },
    { id: 'Up to Date', label: 'Up to Date', count: upToDate },
    { id: 'Due Soon', label: 'Due Soon', count: dueSoon },
    { id: 'Overdue', label: 'Lampas sa Schedule (Overdue)', count: overdue },
    { id: 'No Due Date', label: 'Walang Due Date', count: null },
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
              background: '#E8F5E9',
              border: '1px solid rgba(67, 160, 71, 0.25)',
              boxShadow: '0 4px 12px rgba(46, 125, 50, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2E7D32',
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
              Mga Bakuna
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
              Iskedyul ng bakuna, booster, at kalusugan ng hayop · {farmData.vaccinations.length} naitalang bakuna
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
          Mag-record ng Bakuna
        </button>
      </div>

      {/* ── 3 Floating Liquid Glass Statistic Cards ───────────────── */}
      <div className="mobile-stats-grid-3 dashboard-stats stats-grid kpi-grid section-gap" style={{ marginBottom: 24 }}>
        {/* Card 1: Up to Date (Warm Amber Glass) */}
        <div
          onClick={() => setFStatus(fStatus === 'Up to Date' ? 'All' : 'Up to Date')}
          className="kpi-card stat-card mobile-stats-card-3"
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
              PROTEKTADO
            </span>
          </div>
          <div className="kpi-value" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            {upToDate}
          </div>
          <div className="kpi-label" style={{ position: 'relative', zIndex: 2 }}>
            UP TO DATE / UPDATED
          </div>
          <div style={{ fontSize: 11, color: '#FFB340', marginTop: 3, fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Aktibo at napatunayang proteksyon
          </div>
        </div>

        {/* Card 2: Due Soon (Amber/Orange Glass) */}
        <div
          onClick={() => setFStatus(fStatus === 'Due Soon' ? 'All' : 'Due Soon')}
          className="kpi-card stat-card mobile-stats-card-3"
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
              MALAPIT NA
            </span>
          </div>
          <div className="kpi-value" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            {dueSoon}
          </div>
          <div className="kpi-label" style={{ position: 'relative', zIndex: 2 }}>
            DUE SOON / MALAPIT NA
          </div>
          <div style={{ fontSize: 11, color: '#FF9F0A', marginTop: 3, fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Kailangan sa loob ng {farmData.settings?.vaccine_due_days ?? 30} araw
          </div>
        </div>

        {/* Card 3: Overdue (Red Glass) */}
        <div
          onClick={() => setFStatus(fStatus === 'Overdue' ? 'All' : 'Overdue')}
          className="kpi-card stat-card mobile-stats-card-3"
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
              ALERTO
            </span>
          </div>
          <div className="kpi-value" style={{ position: 'relative', zIndex: 2, marginTop: 4 }}>
            {overdue}
          </div>
          <div className="kpi-label" style={{ position: 'relative', zIndex: 2 }}>
            OVERDUE / LAMPAS NA
          </div>
          <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 3, fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Nangangailangan ng booster dose
          </div>
        </div>
      </div>

      {/* ── Floating Liquid Glass Filter & Search Toolbar (One Row) ────── */}
      <FilterToolbar>
        <FilterSearch
          placeholder="Maghanap ng animal, ID, breed, o item..."
          value={searchQuery}
          onChange={setSearchQuery}
          minWidth={240}
        />
        {filterTabs.map((tab) => (
          <FilterPill
            key={tab.id}
            active={fStatus === tab.id}
            onClick={() => setFStatus(tab.id)}
            label={tab.label}
            count={tab.count ?? undefined}
          />
        ))}
      </FilterToolbar>

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
                background: '#E8F5E9',
                border: '1px solid rgba(67, 160, 71, 0.25)',
                boxShadow: '0 8px 24px rgba(46, 125, 50, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                color: '#2E7D32',
              }}
            >
              <Syringe size={34} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>
              Wala pang vaccination records.
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 440, margin: '8px auto 22px', lineHeight: 1.5 }}>
              {searchQuery || fStatus !== 'All'
                ? 'Walang record na tumutugma sa iyong paghahanap o filter.'
                : 'Magtala ng unang bakuna para masubaybayan ang schedule, boosters, at proteksyon sa bukid.'}
            </p>
            <button
              onClick={openAdd}
              disabled={activeAnimals.length === 0}
              style={{
                padding: '10px 24px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #43A047, #2E7D32)',
                border: '1px solid rgba(255, 255, 255, 0.30)',
                boxShadow: '0 4px 14px rgba(46, 125, 50, 0.25)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Plus size={16} /> Mag-record ng Bakuna
            </button>
          </div>
        ) : (
          /* Data Table */
          <div className="table-wrap" style={{ background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0, position: 'relative', zIndex: 2 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Petsa ng Bakuna</th>
                  <th>Hayop</th>
                  <th>Pangalan ng Bakuna</th>
                  <th>Susunod na Bakuna</th>
                  <th>Katayuan</th>
                  <th>Beterinaryo / Kawani</th>
                  <th style={{ textAlign: 'right' }}>Aksyon</th>
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
                            <Syringe size={14} color="#FF7A18" />
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>{aName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {aTag} • {aSpecies === 'Goat' ? 'Kambing' : 'Tupa'}
                            </div>
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
                                ? `${Math.abs(daysLeft)} araw nang lampas`
                                : daysLeft === 0
                                ? 'Schedule na ngayon'
                                : `${daysLeft} araw ang natitira`}
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
                          {status === 'Up to Date'
                            ? 'Up to Date'
                            : status === 'Due Soon'
                            ? 'Due Soon'
                            : status === 'Overdue'
                            ? 'Lampas na (Overdue)'
                            : 'Walang Due Date'}
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
                            title="I-edit ang Record"
                            aria-label="I-edit ang Record"
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
                            title="Burahin ang Record"
                            aria-label="Burahin ang Record"
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <ModalHeader
          title={editing ? 'I-edit ang Record ng Bakuna' : 'Mag-record ng Bakuna'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Pumili ng Hayop" required error={errors.animal_id}>
              <Select
                value={form.animal_id}
                onChange={(e) => setForm({ ...form, animal_id: e.target.value })}
                options={[
                  { value: '', label: 'Pumili ng hayop...' },
                  ...activeAnimals.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.tag_id}) — ${a.species === 'Goat' ? 'Kambing' : 'Tupa'} • ${a.breed ?? 'Standard'}`,
                  })),
                ]}
              />
            </FormField>

            <FormField label="Pangalan ng Bakuna" required error={errors.vaccine_name}>
              <ComboBox
                value={form.vaccine_name}
                onChange={(v) => setForm({ ...form, vaccine_name: v })}
                options={GOAT_SHEEP_VACCINES}
                placeholder="Maghanap o maglagay ng pangalan ng bakuna (hal. CDT, Dewormer)..."
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Vaccination Date (Petsa ng Bakuna)" required error={errors.date_given}>
                <Input
                  type="date"
                  value={form.date_given}
                  onChange={(e) => setForm({ ...form, date_given: e.target.value })}
                />
              </FormField>

              <FormField label="Next Due Date (Susunod na Iskedyul)">
                <Input
                  type="date"
                  value={form.next_due_date}
                  onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Veterinarian / Kawani">
              <ComboBox
                value={form.veterinarian}
                onChange={(v) => setForm({ ...form, veterinarian: v })}
                options={COMMON_VETS}
                placeholder="Pangalan ng beterinaryo o nag-inject..."
              />
            </FormField>

            {/* Optional Inventory Link */}
            {!editing && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Package size={15} /> I-bawas sa Imbentaryo (Deduct from Inventory)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Opsyonal</span>
                </div>
                <Select
                  value={form.inventory_item_id}
                  onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })}
                  options={[
                    { value: '', label: 'Huwag magbawas sa imbentaryo' },
                    ...farmData.inventory.map((item) => ({
                      value: item.id,
                      label: `${item.name} (${item.quantity} ${item.unit} available) — ${item.category}`,
                    })),
                  ]}
                />
                {form.inventory_item_id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Dami na ibabawas (Dose/Qty):</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.deduct_quantity}
                      onChange={(e) => setForm({ ...form, deduct_quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{
                        width: 80,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: 'rgba(0, 0, 0, 0.2)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <FormField label="Mga Tala at Dosis">
              <textarea
                className="form-textarea"
                placeholder="Hal. 2ml subcutaneous injection sa leeg. Walang masamang reaksyon."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Kanselahin
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editing ? 'I-save ang mga Pagbabago' : 'I-save ang Record'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Confirm Deletion Dialog ────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Burahin ang Record ng Bakuna"
        message="Sigurado ka bang nais mong burahin ang record na ito ng bakuna? Hindi na ito maibabalik kapag nabura."
        confirmLabel="Oo, Burahin"
        cancelLabel="Huwag Muna"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
