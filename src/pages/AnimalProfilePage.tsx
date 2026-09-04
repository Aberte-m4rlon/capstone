import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../lib/auth';
import { Icons } from '../lib/icons';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select, FormField } from '../components/ui/Input';
import {
  calculateGrowth,
  ageLabel,
  formatDate,
  daysUntil,
  levelFromScore,
} from '../lib/analytics';
import { assessBreedingReadiness } from '../lib/analytics';
import { Line } from 'react-chartjs-2';
import { Plus, Pencil, Trash2, QrCode, ArrowLeft, Download, Printer, Activity, Heart, Scale, Syringe, Wheat, AlertTriangle, Camera, Sparkles, Tag, CheckCircle2, Package } from 'lucide-react';
import QRCode from 'qrcode';
import type { Animal, HealthStatus, Species, Sex } from '../types';
import { useAnimalMLPrediction, useAnimalRiskHistory } from '../lib/useMLHealth';
import { MLHealthPanel } from '../components/MLHealthPanel';
import { CameraScreeningModal } from '../components/CameraScreeningModal';
import { ScreeningHistoryPanel } from '../components/ScreeningHistoryPanel';
import { useAnimalScreenings } from '../lib/useCameraScreenings';
import { MLScreeningPanel } from '../components/MLScreeningPanel';

// ─── Status helpers ────────────────────────────────────────────────────────────
const healthBadgeColor = (s: HealthStatus) =>
  s === 'Healthy' ? '#16A34A' : s === 'Monitor' ? '#3B82F6' : s === 'At Risk' ? '#F59E0B' : '#EF4444';

const healthBadgeBg = (s: HealthStatus) =>
  s === 'Healthy' ? 'rgba(22,163,74,0.15)' : s === 'Monitor' ? 'rgba(59,130,246,0.15)' : s === 'At Risk' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';

const riskColor = (score: number) => {
  if (score >= 70) return '#EF4444';
  if (score >= 45) return '#F59E0B';
  if (score >= 20) return '#3B82F6';
  return '#16A34A';
};

const vaccBadgeColor = (s: string) =>
  s === 'Up to Date' ? '#FF7A18' : s === 'Due Soon' ? '#F59E0B' : s === 'Overdue' ? '#EF4444' : '#8AA0B8';

// ─── Reusable StatRow ──────────────────────────────────────────────────────────
function StatRow({ label, value, valueStyle }: { label: string; value: React.ReactNode; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--border-light)',
      gap: 12, minWidth: 0,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textAlign: 'right', minWidth: 0, wordBreak: 'break-word', ...valueStyle }}>
        {value}
      </span>
    </div>
  );
}

// ─── Glass Card ───────────────────────────────────────────────────────────────
function GlassCard({
  children, style, gridSpan,
}: { children: React.ReactNode; style?: React.CSSProperties; gridSpan?: number }) {
  return (
    <div style={{
      background: 'var(--glass-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '20px 22px',
      position: 'relative' as const,
      overflow: 'hidden',
      minWidth: 0,
      gridColumn: gridSpan ? `span ${gridSpan}` : undefined,
      ...style,
    }}>
      {/* Specular highlight */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'var(--glass-border-specular)', pointerEvents: 'none',
      }} />
      {children}
    </div>
  );
}

// ─── Card Title ───────────────────────────────────────────────────────────────
function CardTitle({ icon: Icon, title }: { icon?: React.ComponentType<any>; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      {Icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(255,106,42,0.25), rgba(255,59,48,0.15))',
          border: '1px solid rgba(255,106,42,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={15} color="var(--accent-orange)" />
        </div>
      )}
      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>{title}</span>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 11px', borderRadius: 999,
      background: bg, border: `1px solid ${color}44`,
      fontSize: 12, fontWeight: 700, color, whiteSpace: 'nowrap' as const,
      letterSpacing: '0.3px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function AnimalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<'overview' | 'health' | 'weight' | 'breeding' | 'vaccination' | 'inventory' | 'feed' | 'history' | 'camera'>('overview');
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cameraScreeningOpen, setCameraScreeningOpen] = useState(false);
  const [administerModalOpen, setAdministerModalOpen] = useState(false);
  const [administerItemId, setAdministerItemId] = useState('');
  const [administerQty, setAdministerQty] = useState('');
  const [administerReason, setAdministerReason] = useState('');
  const [administerNotes, setAdministerNotes] = useState('');
  const [administerSaving, setAdministerSaving] = useState(false);

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

  // ── ML hooks must be at top level, before any early returns (Rules of Hooks) ──
  const mlPrediction = useAnimalMLPrediction(animal?.id ?? null);
  const { dates: riskDates, probabilities: riskProbs, riskScores } = useAnimalRiskHistory(animal?.id ?? null);
  const { screenings: animalScreenings, refresh: refreshScreenings } = useAnimalScreenings(animal?.id ?? null);

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
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/animals')}>
          Back to Animals
        </button>
      </div>
    );
  }

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

  const handleAdministerInventory = async () => {
    if (!administerItemId || !animal) return;
    const item = farmData.inventory.find((i) => i.id === administerItemId);
    if (!item) {
      toast('Pumili ng gamot o supply mula sa imbentaryo.', 'error');
      return;
    }
    const qty = Number(administerQty);
    if (!administerQty || isNaN(qty) || qty <= 0) {
      toast('Maglagay ng wastong dami (quantity).', 'error');
      return;
    }
    if (qty > Number(item.quantity)) {
      toast(`Kulang ang stock. Kasalukuyang natitira: ${item.quantity} ${item.unit}.`, 'error');
      return;
    }

    setAdministerSaving(true);
    try {
      const prevStock = Number(item.quantity);
      const newStock = Math.max(0, prevStock - qty);

      // 1. Deduct from inventory
      const { error: invErr } = await supabase
        .from('inventory')
        .update({ quantity: newStock })
        .eq('id', item.id);
      if (invErr) throw invErr;

      // 2. Insert into inventory_transactions with animal reference
      const { error: txErr } = await supabase.from('inventory_transactions').insert({
        inventory_item_id: item.id,
        type: 'CONSUMPTION',
        quantity: qty,
        unit: item.unit,
        reason: administerReason || 'Pangangasiwa ng Gamot / Supply',
        notes: `Ibinigay kay ${animal.tag_id} (${animal.name || 'Walang Pangalan'}). ${administerNotes || ''}`.trim(),
        previous_stock: prevStock,
        new_stock: newStock,
        cost_per_unit: item.cost ?? null,
        reference_type: 'animal',
        reference_id: animal.id,
      });
      if (txErr) throw txErr;

      // 3. Insert into health_records for full clinical history
      const { error: healthErr } = await supabase.from('health_records').insert({
        animal_id: animal.id,
        record_date: new Date().toISOString().split('T')[0],
        reasons: [`Ibinigay na Gamot / Supply: ${item.name}`],
        notes: `Dami: ${qty} ${item.unit}. Dahilan: ${administerReason || 'Gamot / Suporta'}. ${administerNotes || ''}`.trim(),
        risk_level: 'Low',
        risk_score: 0,
      });
      if (healthErr) throw healthErr;

      toast(`Matagumpay na naitala ang ${qty} ${item.unit} ng ${item.name} para kay ${animal.name || animal.tag_id}!`, 'success');
      setAdministerModalOpen(false);
      setAdministerItemId('');
      setAdministerQty('');
      setAdministerReason('');
      setAdministerNotes('');
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hindi mai-save ang paggamit ng gamot.', 'error');
    } finally {
      setAdministerSaving(false);
    }
  };

  const downloadQR = async () => {
    const url = `${window.location.origin}/public/${animal.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
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
    QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } }).then((dataUrl) => {
      win.document.write(`<!DOCTYPE html><html><head><title>QR — ${animal.name}</title><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
        .card{border:2px solid #000;border-radius:16px;padding:28px 24px;max-width:300px;width:100%;text-align:center}
        .brand{font-size:16px;font-weight:900;color:#FF7A18;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:6px}
        img{width:220px;height:220px;margin:14px auto;display:block;border-radius:8px}
        .name{font-size:22px;font-weight:900;color:#1F2937;margin:8px 0 4px}
        .tag{font-size:13px;color:#6B7280;margin-bottom:3px}
        .meta{font-size:12px;color:#9CA3AF;margin-bottom:14px}
        .hint{font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:12px;margin-top:4px;line-height:1.5}
        @media print{body{padding:0}.card{border-color:#000;page-break-inside:avoid}}
      </style></head><body>
        <div class="card">
          <div class="brand">AlpasFarm</div>
          <img src="${dataUrl}" alt="QR Code" />
          <div class="name">${animal.name}</div>
          <div class="tag">${animal.tag_id}</div>
          <div class="meta">${animal.species}${animal.breed ? ` · ${animal.breed}` : ''} · ${animal.sex}</div>
          <div class="hint">Scan this QR code with your phone camera or Google Lens to view this animal's profile.</div>
        </div>
      </body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 300);
    });
  };

  // Weight chart
  const sortedWeights = [...animalWeights].sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());
  const weightChartData = {
    labels: sortedWeights.map((w) => formatDate(w.record_date)),
    datasets: [{
      label: 'Weight (kg)',
      data: sortedWeights.map((w) => Number(w.weight_kg)),
      borderColor: '#FF7A18',
      backgroundColor: 'rgba(255,122,24,0.08)',
      fill: true, tension: 0.3, pointRadius: 4,
      pointBackgroundColor: '#FF7A18',
    }],
  };

  const animalInventoryUsage = useMemo(() => {
    return farmData.inventoryTransactions
      .filter((tx) => tx.reference_type === 'animal' && tx.reference_id === animal?.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [farmData.inventoryTransactions, animal?.id]);

  const tabs = [
    { key: 'overview', label: 'Buod (Overview)' },
    { key: 'health', label: 'Kalusugan (Health)' },
    { key: 'weight', label: 'Timbang (Weight)' },
    { key: 'breeding', label: 'Pagpaparami (Breeding)' },
    { key: 'vaccination', label: 'Bakuna (Vaccination)' },
    { key: 'inventory', label: 'Gamit at Imbentaryo' },
    { key: 'feed', label: 'Pakain (Feed)' },
    { key: 'history', label: 'Kasaysayan (History)' },
    { key: 'camera', label: 'Camera Screening' },
  ] as const;

  const scoreColor = riskColor(animal.health_risk_score);

  return (
    <>
      {/* Ambient background glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-120px', left: '-80px', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,106,42,0.07) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-100px', right: '-60px', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,48,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Page wrapper — prevents horizontal overflow */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>

        {/* ── Back button ── */}
        <button
          onClick={() => navigate('/animals')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill)', padding: '7px 16px',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
            cursor: 'pointer', marginBottom: 20, transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--accent-orange)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <ArrowLeft size={15} /> Back to Animals
        </button>

        {/* ── Animal Header ── */}
        <div style={{
          background: 'var(--glass-surface)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow)',
          padding: 'clamp(18px, 3vw, 28px)',
          marginBottom: 16,
          position: 'relative' as const,
          overflow: 'hidden',
        }}>
          {/* Specular top line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'var(--glass-border-specular)' }} />

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 'clamp(14px,2.5vw,24px)',
            flexWrap: 'wrap' as const, width: '100%', minWidth: 0,
          }}>
            {/* Avatar */}
            <div style={{
              width: 'clamp(56px,8vw,72px)', height: 'clamp(56px,8vw,72px)',
              borderRadius: 'var(--radius)',
              background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900, color: '#fff',
              boxShadow: '0 8px 24px rgba(255,59,48,0.35)',
              flexShrink: 0, border: '1px solid rgba(255,255,255,0.25)',
              letterSpacing: '-1px',
            }}>
              {animal.name[0]?.toUpperCase()}
            </div>

            {/* Info block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                fontSize: 'clamp(22px,3.5vw,32px)', fontWeight: 900, color: 'var(--text)',
                letterSpacing: '-0.7px', margin: '0 0 4px', lineHeight: 1.1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
              }}>
                {animal.name}
              </h1>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'flex', flexWrap: 'wrap' as const, gap: '4px 8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{animal.tag_id}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{animal.species}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{animal.sex}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{ageLabel(animal.date_of_birth)}</span>
                {animal.breed && <><span style={{ opacity: 0.4 }}>·</span><span>{animal.breed}</span></>}
              </div>

              {/* Status + actions row */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10, marginTop: 8 }}>
                <StatusBadge
                  label={animal.health_status}
                  color={healthBadgeColor(animal.health_status)}
                  bg={healthBadgeBg(animal.health_status)}
                />
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <ActionBtn icon={<QrCode size={14} />} label="QR" onClick={() => setQrOpen(true)} variant="neutral" />
                  <ActionBtn icon={<Camera size={14} />} label="Screen" onClick={() => setCameraScreeningOpen(true)} variant="orange" />
                  <ActionBtn icon={<Pencil size={14} />} label="Edit" onClick={() => setEditOpen(true)} variant="orange" />
                  <ActionBtn icon={<Trash2 size={14} />} label="Delete" onClick={() => setConfirmDelete(true)} variant="red" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div style={{
          width: '100%', maxWidth: '100%', boxSizing: 'border-box',
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as any,
          marginBottom: 16,
        }}>
          <div style={{
            display: 'inline-flex', gap: 4, minWidth: 'max-content',
            background: 'var(--glass-surface)',
            backdropFilter: 'var(--glass-blur-sm)',
            WebkitBackdropFilter: 'var(--glass-blur-sm)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-pill)',
            padding: 5,
            boxShadow: 'var(--shadow-sm)',
          }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '8px 18px', borderRadius: 'var(--radius-pill)',
                  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' as const,
                  cursor: 'pointer', border: 'none', transition: 'all 0.2s ease',
                  background: tab === t.key
                    ? 'linear-gradient(135deg, #FF3B30, #FF7A18)'
                    : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--text-secondary)',
                  boxShadow: tab === t.key ? '0 4px 14px rgba(255,59,48,0.35)' : 'none',
                  letterSpacing: tab === t.key ? '0.2px' : '0',
                }}
                onMouseEnter={(e) => { if (tab !== t.key) e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { if (tab !== t.key) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ── */}

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 18,
            width: '100%', minWidth: 0,
          }} className="ap-grid">

            {/* Health Risk Card */}
            <GlassCard>
              <CardTitle icon={Activity} title="Health Risk" />
              {/* Score ring */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
                  background: `conic-gradient(${scoreColor} ${animal.health_risk_score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 20px ${scoreColor}44`,
                  position: 'relative' as const,
                }}>
                  <div style={{
                    position: 'absolute', inset: 6, borderRadius: '50%',
                    background: 'var(--bg)', display: 'flex', flexDirection: 'column' as const,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{animal.health_risk_score}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.5px' }}>SCORE</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor, marginBottom: 2 }}>
                    {levelFromScore(animal.health_risk_score)} Risk
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {animal.health_risk_score >= 60 ? 'Needs immediate attention' : 'Within normal range'}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
                <StatRow label="Temperature" value={animal.current_temperature ? `${animal.current_temperature}°C` : '—'} />
                <StatRow label="Heart Rate" value={animal.current_heart_rate ? `${animal.current_heart_rate} BPM` : '—'} />
              </div>
            </GlassCard>

            {/* ML Health Assessment Card */}
            <GlassCard gridSpan={2}>
              {mlPrediction ? (
                <MLHealthPanel
                  prediction={mlPrediction}
                  animalName={animal.name}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <AlertTriangle size={16} color="#F59E0B" />
                  <span>
                    <strong>ML Health Assessment</strong> — Add at least 5 health records to enable the ML risk model for this animal.
                  </span>
                </div>
              )}
            </GlassCard>

            {/* ML Risk Probability History Chart */}
            {riskDates.length >= 2 && (
              <GlassCard gridSpan={2}>
                <CardTitle icon={Activity} title="Health Risk Trend (ML Probability vs Vet Score)" />
                <div style={{ height: 200 }}>
                  <Line
                    data={{
                      labels: riskDates.map(d => {
                        const date = new Date(d);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }),
                      datasets: [
                        {
                          label: 'ML Risk %',
                          data: riskProbs,
                          borderColor: '#7C3AED',
                          backgroundColor: 'rgba(124,58,237,0.1)',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 4,
                          pointBackgroundColor: '#7C3AED',
                        },
                        {
                          label: 'Vet Rule Score',
                          data: riskScores,
                          borderColor: '#F97316',
                          backgroundColor: 'transparent',
                          borderDash: [5, 5],
                          tension: 0.4,
                          pointRadius: 3,
                          pointBackgroundColor: '#F97316',
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 } } },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
                      },
                      scales: {
                        y: { min: 0, max: 100, ticks: { font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
                        x: { ticks: { font: { size: 10 } }, grid: { display: false } },
                      },
                    }}
                  />
                </div>
              </GlassCard>
            )}

            {/* Weight & Growth Card */}
            <GlassCard>
              <CardTitle icon={Scale} title="Weight & Growth" />
              <StatRow label="Current Weight" value={growth.currentWeight ? `${growth.currentWeight} kg` : '—'} />
              <StatRow label="Previous Weight" value={growth.previousWeight ? `${growth.previousWeight} kg` : '—'} />
              <StatRow
                label="Change"
                value={growth.weightChange !== null
                  ? `${growth.weightChange > 0 ? '+' : ''}${growth.weightChange} kg`
                  : '—'}
                valueStyle={growth.weightChange !== null ? { color: growth.weightChange >= 0 ? '#FF7A18' : '#EF4444' } : {}}
              />
              <StatRow label="Daily Gain" value={growth.dailyGain !== null ? `${growth.dailyGain} kg/day` : '—'} />
              <StatRow label="Trend" value={growth.trend || 'Insufficient data'} />
              {growth.marketReadyDate && (
                <StatRow label="Market Ready" value={formatDate(growth.marketReadyDate)} />
              )}
            </GlassCard>

            {/* Breeding Card */}
            <GlassCard>
              <CardTitle icon={Heart} title="Breeding" />
              <StatRow label="Status" value={
                <StatusBadge
                  label={animal.breeding_status}
                  color={animal.breeding_status === 'Pregnant' ? '#3B82F6' : animal.breeding_status === 'Open' ? '#FF7A18' : '#8AA0B8'}
                  bg={animal.breeding_status === 'Pregnant' ? 'rgba(59,130,246,0.15)' : animal.breeding_status === 'Open' ? 'rgba(255,122,24,0.15)' : 'rgba(138,160,184,0.12)'}
                />
              } />
              <StatRow label="Last Mating" value={formatDate(animal.last_mating_date)} />
              <StatRow label="Expected Kidding" value={formatDate(animal.expected_kidding_date)} />
              {breedingAssessment && (
                <StatRow label="Readiness" value={
                  <StatusBadge
                    label={breedingAssessment.recommendation}
                    color={breedingAssessment.recommendation === 'Ready' ? '#FF7A18' : breedingAssessment.recommendation === 'Monitor' ? '#F59E0B' : '#8AA0B8'}
                    bg={breedingAssessment.recommendation === 'Ready' ? 'rgba(255,122,24,0.15)' : breedingAssessment.recommendation === 'Monitor' ? 'rgba(245,158,11,0.15)' : 'rgba(138,160,184,0.12)'}
                  />
                } />
              )}
            </GlassCard>

            {/* Vaccination Card */}
            <GlassCard>
              <CardTitle icon={Syringe} title="Vaccination" />
              <StatRow label="Status" value={
                <StatusBadge
                  label={animal.vaccination_status}
                  color={vaccBadgeColor(animal.vaccination_status)}
                  bg={`${vaccBadgeColor(animal.vaccination_status)}22`}
                />
              } />
              <StatRow label="Last Vaccine" value={formatDate(animal.last_vaccine_date)} />
              <StatRow label="Next Due" value={formatDate(animal.next_vaccine_date)} />
            </GlassCard>

            {/* Inventory Usage Mini-Card */}
            <GlassCard>
              <CardTitle icon={Package} title="Gamit at Imbentaryo" />
              <StatRow label="Nagamit na Gamot/Dosis" value={`${animalInventoryUsage.length} tala`} />
              <StatRow
                label="Kabuuang Halaga"
                value={`₱${animalInventoryUsage.reduce((sum, tx) => sum + (tx.quantity * (tx.cost_per_unit || 0)), 0).toFixed(2)}`}
              />
              <button
                onClick={() => setTab('inventory')}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '7px',
                  borderRadius: 8,
                  border: '1px solid var(--border-light)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tingnan ang Talaan ng Gamit
              </button>
            </GlassCard>

            {/* Notes Card — spans 2 cols on desktop */}
            <GlassCard style={{ gridColumn: 'span 2' }}>
              <CardTitle title="Notes" />
              <p style={{
                fontSize: 14, color: animal.notes ? 'var(--text)' : 'var(--text-secondary)',
                lineHeight: 1.7, margin: 0, fontStyle: animal.notes ? 'normal' : 'italic',
              }}>
                {animal.notes || 'No notes recorded for this animal.'}
              </p>
            </GlassCard>

            {/* Camera Screening summary card */}
            <GlassCard>
              <CardTitle icon={Camera} title="Camera Health Screening" />
              {animalScreenings.length > 0 ? (() => {
                const latest = animalScreenings[0];
                const predColor = latest.prediction === 'possible_health_concern' ? '#EF4444' : latest.prediction === 'normal_appearance' ? '#16A34A' : '#F59E0B';
                const predLabel = latest.prediction === 'possible_health_concern' ? 'Possible Health Concern' : latest.prediction === 'normal_appearance' ? 'Normal Appearance' : 'Low Confidence';
                return (
                  <div>
                    <StatRow label="Last Screening" value={formatDate(latest.created_at)} />
                    <StatRow label="Result" value={<span style={{ fontWeight: 700, color: predColor }}>{predLabel}</span>} />
                    <StatRow label="Confidence" value={`${Math.round(latest.confidence * 100)}%`} />
                    <StatRow label="Total Screenings" value={animalScreenings.length} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => setCameraScreeningOpen(true)}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 9, border: 'none',
                          background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                          color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}
                      >
                        <Camera size={12} /> New Screening
                      </button>
                      <button
                        onClick={() => setTab('camera')}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 9,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        View History
                      </button>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ textAlign: 'center', paddingTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                    No screenings yet. Run a preliminary ML health screening using the camera.
                  </div>
                  <button
                    onClick={() => setCameraScreeningOpen(true)}
                    style={{
                      padding: '9px 16px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 4px 14px rgba(255,59,48,0.3)',
                    }}
                  >
                    <Camera size={14} /> Run Screening
                  </button>
                </div>
              )}
            </GlassCard>

          </div>
        )}

        {/* HEALTH TAB */}
        {tab === 'health' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Activity} title="Early Illness & Health Records" />
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/health')}>
                <Sparkles size={15} /> Run Early Illness Prediction
              </button>
            </div>
            {animalHealth.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><Icons.HeartPulse size={24} /></div>
                <h4>No health records</h4>
                <p>Record a health check to start early illness detection.</p>
              </div>
            ) : (
              <>
                {(() => {
                  const latest = [...animalHealth].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];
                  const conditions = (latest as any).detected_conditions;
                  return (
                    <>
                      {conditions && (
                        <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 12, display: 'flex', gap: 10 }}>
                          <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', marginBottom: 3 }}>Early Illness Detection — Latest Record</div>
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{conditions}</p>
                          </div>
                        </div>
                      )}
                      {/* ML Health Screening — uses trained Random Forest model */}
                      <div style={{ marginBottom: 16 }}>
                        <MLScreeningPanel record={latest} animal={animal} />
                      </div>
                    </>
                  );
                })()}
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>Temp</th><th>Appetite</th><th>Activity</th>
                        <th>Risk Score</th><th>Detected Concerns / Reasons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {animalHealth.map((r) => (
                        <tr key={r.id}>
                          <td>{formatDate(r.record_date)}</td>
                          <td>{r.temperature ? `${r.temperature}°C` : '—'}</td>
                          <td>{r.appetite ?? '—'}</td>
                          <td>{r.activity_level ?? '—'}</td>
                          <td>
                            <span className={`badge badge-${r.risk_level === 'Low' ? 'green' : r.risk_level === 'Moderate' ? 'yellow' : r.risk_level === 'High' ? 'orange' : 'red'}`}>
                              {r.risk_level} ({r.risk_score}%)
                            </span>
                          </td>
                          <td style={{ maxWidth: 260, fontSize: 11 }}>
                            {(r as any).detected_conditions
                              ? <span style={{ color: '#EF4444', fontWeight: 600 }}>{(r as any).detected_conditions}</span>
                              : r.reasons
                              ? <span style={{ color: 'var(--text-secondary)' }}>{r.reasons}</span>
                              : <span style={{ color: 'var(--text-secondary)' }}>None</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </GlassCard>
        )}

        {/* WEIGHT TAB */}
        {tab === 'weight' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Scale} title="Weight History" />
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/weights')}><Plus size={15} /> Add Weight</button>
            </div>
            {animalWeights.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Scale size={24} /></div><h4>No weight records</h4><p>Add a weigh-in to start tracking growth.</p></div>
            ) : (
              <>
                <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', padding: '4px 0' }}>
                  <Line data={weightChartData} options={{
                    responsive: true,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(6,18,32,0.92)', bodyColor: '#fff', titleColor: '#FF7A18' } },
                    scales: {
                      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' as any } },
                      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' as any } },
                    },
                  }} />
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Weight</th><th>Change</th><th>Daily Gain</th></tr></thead>
                    <tbody>
                      {[...animalWeights].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()).map((w) => (
                        <tr key={w.id}>
                          <td>{formatDate(w.record_date)}</td>
                          <td><strong>{w.weight_kg} kg</strong></td>
                          <td style={{ color: w.weight_change_kg !== null && w.weight_change_kg < 0 ? '#EF4444' : 'inherit' }}>
                            {w.weight_change_kg !== null ? `${w.weight_change_kg > 0 ? '+' : ''}${w.weight_change_kg} kg` : '—'}
                          </td>
                          <td>{w.daily_gain_kg !== null ? `${w.daily_gain_kg} kg/day` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </GlassCard>
        )}

        {/* BREEDING TAB */}
        {tab === 'breeding' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Heart} title="Breeding Records" />
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
          </GlassCard>
        )}

        {/* VACCINATION TAB */}
        {tab === 'vaccination' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Syringe} title="Vaccination Records" />
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
          </GlassCard>
        )}

        {/* FEED TAB */}
        {tab === 'feed' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Wheat} title="Feed Records" />
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
          </GlassCard>
        )}

        {/* INVENTORY USAGE TAB */}
        {tab === 'inventory' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <CardTitle icon={Package} title="Gamit at Supplies mula sa Imbentaryo (Inventory Usage)" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary, #FF6A2A)' }}>
                  {animalInventoryUsage.length} naitalang paggamit
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus size={14} />}
                  onClick={() => setAdministerModalOpen(true)}
                >
                  Bigyan ng Gamot / Gamit
                </Button>
              </div>
            </div>

            {animalInventoryUsage.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><Package size={24} /></div>
                <h4>Walang gamit na naitala</h4>
                <p>Kusang maitatala rito ang mga bakuna, gamot, o supplies na ibinawas mula sa imbentaryo para kay {animal.name}.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Petsa (Date)</th>
                      <th>Dami / Yunit</th>
                      <th>Uri / Dahilan</th>
                      <th>Detalye (Notes)</th>
                      <th>Halaga (Cost)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animalInventoryUsage.map((tx) => (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.created_at)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {tx.quantity} {tx.unit}
                        </td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: 11 }}>
                            {tx.reason || tx.type}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {tx.notes || '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: '#10B981' }}>
                          {tx.cost_per_unit ? `₱${(tx.quantity * tx.cost_per_unit).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <GlassCard>
            <CardTitle icon={Activity} title="Recent Activity" />
            {animalHealth.length === 0 && animalWeights.length === 0 && animalVaccinations.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Activity size={24} /></div><h4>No activity yet</h4><p>Records will appear here as you add them.</p></div>
            ) : (
              <div>
                {animalHealth.slice(0, 3).map((r) => (
                  <StatRow key={r.id} label={`Health Check — ${formatDate(r.record_date)}`} value={
                    <StatusBadge
                      label={`${r.risk_level} risk`}
                      color={riskColor(r.risk_score)}
                      bg={`${riskColor(r.risk_score)}22`}
                    />
                  } />
                ))}
                {animalWeights.slice(0, 3).map((w) => (
                  <StatRow key={w.id} label={`Weight Record — ${formatDate(w.record_date)}`} value={`${w.weight_kg} kg`} />
                ))}
                {animalVaccinations.slice(0, 3).map((v) => (
                  <StatRow key={v.id} label={`Vaccination — ${formatDate(v.date_given)}`} value={v.vaccine_name} />
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* CAMERA SCREENING TAB */}
        {tab === 'camera' && (
          <div>
            {/* Latest screening summary + run button */}
            {animalScreenings.length > 0 && (() => {
              const latest = animalScreenings[0];
              const predColor = latest.prediction === 'possible_health_concern' ? '#EF4444' : latest.prediction === 'normal_appearance' ? '#16A34A' : '#F59E0B';
              const predLabel = latest.prediction === 'possible_health_concern' ? 'Possible Health Concern' : latest.prediction === 'normal_appearance' ? 'Normal Appearance' : 'Low Confidence';
              return (
                <GlassCard style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                    <CardTitle icon={Camera} title="Latest Camera Screening" />
                    <button
                      onClick={() => setCameraScreeningOpen(true)}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                        color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 14px rgba(255,59,48,0.3)',
                      }}
                    >
                      <Camera size={14} /> Run New Screening
                    </button>
                  </div>
                  <StatRow label="Date" value={formatDate(latest.created_at)} />
                  <StatRow label="Result" value={<span style={{ fontWeight: 700, color: predColor }}>{predLabel}</span>} />
                  <StatRow label="ML Confidence" value={`${Math.round(latest.confidence * 100)}%`} />
                  <StatRow label="Model" value={latest.model_version} />
                  <StatRow label="Image Quality Score" value={`${latest.quality_score}/100`} />
                  {latest.notes && <StatRow label="Notes" value={latest.notes} />}
                  <div style={{
                    marginTop: 12, padding: '10px 12px',
                    background: 'rgba(59,130,246,0.07)',
                    border: '1px solid rgba(59,130,246,0.18)',
                    borderRadius: 8, fontSize: 11, color: '#3B82F6', lineHeight: 1.6,
                  }}>
                    Camera screening is a preliminary assessment only. It does not replace professional veterinary diagnosis.
                  </div>
                </GlassCard>
              );
            })()}

            {/* If no screenings, show prompt */}
            {animalScreenings.length === 0 && (
              <GlassCard style={{ marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <Camera size={36} color="var(--accent-orange)" style={{ marginBottom: 12, opacity: 0.7 }} />
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                    No Camera Screenings Yet
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                    Run a preliminary ML health screening using your phone camera or by uploading a photo of {animal.name}.
                  </div>
                  <button
                    onClick={() => setCameraScreeningOpen(true)}
                    style={{
                      padding: '10px 24px', borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                      color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      boxShadow: '0 6px 20px rgba(255,59,48,0.35)',
                    }}
                  >
                    <Camera size={16} /> Start Camera Screening
                  </button>
                </div>
              </GlassCard>
            )}

            {/* Screening history */}
            <GlassCard>
              <ScreeningHistoryPanel
                animalId={animal.id}
                animalName={animal.name}
              />
            </GlassCard>
          </div>
        )}

        {/* Spacing at bottom */}
        <div style={{ height: 40 }} />
      </div>

      {/* ── Responsive grid CSS ── */}
      <style>{`
        .ap-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
        @media (max-width: 1100px) {
          .ap-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .ap-grid > div[style*="span 2"] {
            grid-column: span 2 !important;
          }
        }
        @media (max-width: 640px) {
          .ap-grid {
            grid-template-columns: 1fr !important;
          }
          .ap-grid > div[style*="span 2"],
          .ap-grid > div[style*="span 3"] {
            grid-column: span 1 !important;
          }
        }
        /* Hide scrollbar on tab nav */
        div[style*="overflow-x: auto"]::-webkit-scrollbar { display: none; }
        div[style*="overflow-x: auto"] { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── QR Modal ── */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} size="sm">
        <ModalHeader title={`QR Code — ${animal.name}`} onClose={() => setQrOpen(false)} />
        <ModalBody>
          <div className="qr-display" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <QRCanvas value={`https://capstone-delta-jet.vercel.app/public/${animal.id}`} size={240} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 2px' }}>{animal.name}</p>
              <p style={{ color: 'var(--color-primary, #FF6A2A)', fontSize: 13, fontWeight: 600, margin: 0 }}>{animal.tag_id}</p>
              <p style={{ color: 'var(--color-text-secondary, #64748B)', fontSize: 12, marginTop: 6 }}>Scan to view public animal profile</p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setQrOpen(false)}>Close</Button>
          <Button variant="secondary" onClick={downloadQR} leftIcon={<Download size={15} />}>Download</Button>
          <Button variant="primary" onClick={printQR} leftIcon={<Printer size={15} />}>Print</Button>
        </ModalFooter>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} size="md">
        <ModalHeader title="Edit Animal" onClose={() => setEditOpen(false)} />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  Animal ID (Tag)
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 14px',
                    borderRadius: 'var(--radius-md, 12px)',
                    background: 'var(--color-surface-elevated, rgba(255, 255, 255, 0.06))',
                    border: '1.5px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                    minHeight: 44,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag size={16} color="#FF6A00" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-primary, #FF6A00)', letterSpacing: '0.02em' }}>
                      {editForm.tag_id}
                    </span>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#10B981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    <CheckCircle2 size={12} color="#10B981" />
                    Registered ID
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', marginTop: -2 }}>
                  Animal ID is permanent and cannot be manually changed.
                </span>
              </div>
              <FormField label="Name" required>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <FormField label="Species">
                <Select
                  value={editForm.species}
                  onChange={(e) => setEditForm({ ...editForm, species: e.target.value as Species })}
                  options={[{ value: 'Goat', label: 'Goat' }, { value: 'Sheep', label: 'Sheep' }]}
                />
              </FormField>
              <FormField label="Sex">
                <Select
                  value={editForm.sex}
                  onChange={(e) => setEditForm({ ...editForm, sex: e.target.value as Sex })}
                  options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]}
                />
              </FormField>
              <FormField label="Breed">
                <Input value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Date of Birth">
                <Input type="date" value={editForm.date_of_birth} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} />
              </FormField>
              <FormField label="Weight (kg)">
                <Input type="number" step="0.1" value={editForm.weight_kg} onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                className="form-textarea"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveEdit} loading={saving}>Save Changes</Button>
        </ModalFooter>
      </Modal>

      {/* ── Confirm Delete ── */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Animal"
        message={`Are you sure you want to delete ${animal.name}? All related records will also be deleted.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* ── Camera Screening Modal ── */}
      {cameraScreeningOpen && (
        <CameraScreeningModal
          animalId={animal.id}
          animalName={animal.name}
          animalTag={animal.tag_id}
          animal={animal}
          farmContext={{
            temperature: animal.current_temperature ?? undefined,
            heartRate: animal.current_heart_rate ?? undefined,
            weightKg: animal.weight_kg ? Number(animal.weight_kg) : undefined,
            previousWeightKg: animalWeights.length > 1
              ? Number(animalWeights.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[1]?.weight_kg)
              : undefined,
            healthStatus: animal.health_status,
            healthRiskScore: animal.health_risk_score,
            lastHealthRecordDaysAgo: animalHealth.length > 0
              ? Math.round((Date.now() - new Date(animalHealth[0].record_date).getTime()) / 86400000)
              : undefined,
            recentIllnesses: animalHealth
              .filter((r) => r.detected_conditions)
              .slice(0, 3)
              .map((r) => r.detected_conditions!)
              .filter(Boolean),
            vaccinationStatus: animal.vaccination_status,
            ageMonths: animal.date_of_birth
              ? Math.floor((Date.now() - new Date(animal.date_of_birth).getTime()) / (30 * 86400000))
              : undefined,
            sex: animal.sex,
            breedingStatus: animal.breeding_status,
          }}
          onClose={() => setCameraScreeningOpen(false)}
          onSaved={() => { refreshScreenings(); setCameraScreeningOpen(false); }}
        />
      )}

      {/* ── Administer Medicine / Inventory Modal ── */}
      <Modal open={administerModalOpen} onClose={() => setAdministerModalOpen(false)} size="md">
        <ModalHeader
          title={`Bigyan ng Gamot / Gamit mula sa Imbentaryo (${animal.tag_id})`}
          onClose={() => setAdministerModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Pumili ng Gamot o Supply mula sa Imbentaryo" required>
              <select
                className="form-select"
                value={administerItemId}
                onChange={(e) => setAdministerItemId(e.target.value)}
              >
                <option value="">-- Piliin ang Item mula sa Imbentaryo --</option>
                {farmData.inventory
                  .filter((i) => Number(i.quantity) > 0)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.category}) — Natitira: {i.quantity} {i.unit}
                    </option>
                  ))}
              </select>
            </FormField>

            {administerItemId && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--surface-light, rgba(255,255,255,0.05))',
                  border: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                {(() => {
                  const sel = farmData.inventory.find((i) => i.id === administerItemId);
                  if (!sel) return null;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Kasalukuyang stock: <strong>{sel.quantity} {sel.unit}</strong></span>
                      {sel.cost && <span>Halaga: ₱{sel.cost} / {sel.unit}</span>}
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <FormField label="Dami na Ibibigay (Quantity)" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={administerQty}
                  onChange={(e) => setAdministerQty(e.target.value)}
                  placeholder="Hal. 5, 10, 1"
                />
              </FormField>

              <FormField label="Dahilan / Karamdaman" required>
                <Input
                  value={administerReason}
                  onChange={(e) => setAdministerReason(e.target.value)}
                  placeholder="Hal. Lagnat, Ubo, Bitamina"
                />
              </FormField>
            </div>

            <FormField label="Karagdagang Tala (Notes / Dosina)">
              <textarea
                className="form-textarea"
                value={administerNotes}
                onChange={(e) => setAdministerNotes(e.target.value)}
                placeholder="Hal. 2ml intramuscular, ibinigay matapos kumain..."
                style={{ minHeight: 70 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setAdministerModalOpen(false)}>
            Kanselahin
          </Button>
          <Button
            variant="primary"
            onClick={handleAdministerInventory}
            loading={administerSaving}
            leftIcon={<Package size={14} />}
          >
            Itala at Bawasan ang Imbentaryo
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

// ─── Action Button ─────────────────────────────────────────────────────────────
function ActionBtn({ icon, label, onClick, variant }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  variant: 'neutral' | 'orange' | 'red';
}) {
  const colors = {
    neutral: { base: 'var(--surface)', border: 'var(--border)', text: 'var(--text-secondary)', hover: 'var(--surface-hover)' },
    orange: { base: 'rgba(255,106,42,0.12)', border: 'rgba(255,106,42,0.35)', text: '#FF7A18', hover: 'rgba(255,106,42,0.22)' },
    red: { base: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', text: '#EF4444', hover: 'rgba(239,68,68,0.20)' },
  }[variant];

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '7px 14px', borderRadius: 'var(--radius-pill)',
        background: colors.base, border: `1px solid ${colors.border}`,
        color: colors.text, fontSize: 13, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' as const,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.hover; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = colors.base; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon} {label}
    </button>
  );
}

// ─── QR Canvas ────────────────────────────────────────────────────────────────
function QRCanvas({ value, size }: { value: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 2 });
    }
  }, [value, size]);
  return <canvas ref={ref} />;
}
