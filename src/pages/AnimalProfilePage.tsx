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
import { Plus, Pencil, Trash2, QrCode, ArrowLeft, Download, Printer, Activity, Heart, Scale, Syringe, Wheat, AlertTriangle, Camera, Sparkles, Tag, CheckCircle2, Package, DollarSign } from 'lucide-react';
import QRCode from 'qrcode';
import type { Animal, HealthStatus, Species, Sex, TreatmentStatus, TreatmentUsageType } from '../types';
import { isMedicineCategory, isDewormerCategory, isSupplementCategory, consumeInventoryStock, isItemExpired } from '../lib/inventoryOperations';
import { useAnimalMLPrediction, useAnimalRiskHistory } from '../lib/useMLHealth';
import { MLHealthPanel } from '../components/MLHealthPanel';
import { CameraScreeningModal } from '../components/CameraScreeningModal';
import { ScreeningHistoryPanel } from '../components/ScreeningHistoryPanel';
import { useAnimalScreenings } from '../lib/useCameraScreenings';
import { MLScreeningPanel } from '../components/MLScreeningPanel';

// ─── Status helpers ────────────────────────────────────────────────────────────
const healthBadgeColor = (s: HealthStatus) =>
  s === 'Healthy' ? '#238B45' : s === 'Monitor' ? '#176B35' : s === 'At Risk' ? '#F59E0B' : '#EF4444';

const healthBadgeBg = (s: HealthStatus) =>
  s === 'Healthy' ? '#EAF6ED' : s === 'Monitor' ? '#DDF0E2' : s === 'At Risk' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';

const riskColor = (score: number) => {
  if (score >= 70) return '#EF4444';
  if (score >= 45) return '#F59E0B';
  if (score >= 20) return '#176B35';
  return '#238B45';
};

const vaccBadgeColor = (s: string) =>
  s === 'Up to Date' ? '#238B45' : s === 'Due Soon' ? '#F59E0B' : s === 'Overdue' ? '#EF4444' : '#78877F';

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
  const { user, profile } = useAuth();
  const toast = useToast();
  const isSuperAdmin = profile?.role === 'super_admin';

  const [tab, setTab] = useState<'overview' | 'health' | 'weight' | 'breeding' | 'vaccination' | 'inventory' | 'feed' | 'history' | 'camera'>('overview');
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cameraScreeningOpen, setCameraScreeningOpen] = useState(false);
  const [administerModalOpen, setAdministerModalOpen] = useState(false);
  const [administerItemId, setAdministerItemId] = useState('');
  const [administerQty, setAdministerQty] = useState('');
  const [administerDosage, setAdministerDosage] = useState('');
  const [administerFrequency, setAdministerFrequency] = useState('Once daily');
  const [administerStartDate, setAdministerStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [administerEndDate, setAdministerEndDate] = useState('');
  const [administerStatus, setAdministerStatus] = useState<TreatmentStatus>('Kasalukuyang Ginagamot');
  const [administerUsageType, setAdministerUsageType] = useState<TreatmentUsageType>('Medication');
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
  const animalSale = useMemo(() => {
    return (farmData.sales || []).find((s) => s.animal_id === id) ?? null;
  }, [farmData.sales, id]);
  const isSold = Boolean(animalSale || animal?.status === 'Sold' || animal?.is_sold);

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

  const lastScreening = animalScreenings[0] ?? null;
  const lastScreeningDate = useMemo(() => {
    if (!lastScreening?.created_at) return 'No scan recorded';
    const isToday = new Date(lastScreening.created_at).toDateString() === new Date().toDateString();
    return isToday ? 'Today' : formatDate(lastScreening.created_at);
  }, [lastScreening]);

  const riskTrendInfo = useMemo(() => {
    if (animalScreenings.length >= 2) {
      const curr = animalScreenings[0].risk_score ?? 0;
      const prev = animalScreenings[1].risk_score ?? 0;
      if (curr > prev + 5) {
        return {
          trend: 'Increasing' as const,
          color: '#DC2626',
          bg: 'rgba(220, 38, 38, 0.1)',
          warning: 'Health risk has increased across recent screenings. Recommend closer monitoring.',
        };
      }
      if (curr < prev - 5) {
        return {
          trend: 'Decreasing' as const,
          color: '#238B45',
          bg: '#EAF6ED',
          warning: null,
        };
      }
      return {
        trend: 'Stable' as const,
        color: '#238B45',
        bg: '#EAF6ED',
        warning: null,
      };
    }
    if (animalScreenings.length === 1) {
      return {
        trend: 'Stable' as const,
        color: '#238B45',
        bg: '#EAF6ED',
        warning: null,
      };
    }
    return {
      trend: 'No screening yet' as const,
      color: '#64748B',
      bg: 'rgba(100, 116, 139, 0.1)',
      warning: null,
    };
  }, [animalScreenings]);

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

  const isUnauthorized = Boolean(animal && user && !isSuperAdmin && animal.user_id !== user.id);

  if (!animal || isUnauthorized) {
    return (
      <div className="empty-state">
        <h4>Hindi Nahanap ang Hayop o Walang Pahintulot</h4>
        <p>Ang hayop na ito ay maaaring nabura na o pag-aari ng ibang bukid.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/animals')}>
          Bumalik sa Listahan ng mga Hayop
        </button>
      </div>
    );
  }

  const handleSaveEdit = async () => {
    if (!animal || !user) return;
    setSaving(true);
    try {
      let query = supabase.from('animals').update({
        tag_id: editForm.tag_id.trim(), name: editForm.name.trim(),
        species: editForm.species, breed: editForm.breed.trim() || null, sex: editForm.sex,
        date_of_birth: editForm.date_of_birth || null,
        color_markings: editForm.color_markings.trim() || null,
        weight_kg: editForm.weight_kg !== '' && editForm.weight_kg !== null && Number(editForm.weight_kg) > 0 ? Number(editForm.weight_kg) : null,
        notes: editForm.notes.trim() || null,
      }).eq('id', animal.id);

      if (!isSuperAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { error } = await query;
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
    if (!animal || !user) return;
    try {
      let query = supabase.from('animals').delete().eq('id', animal.id);
      if (!isSuperAdmin) {
        query = query.eq('user_id', user.id);
      }
      const { error } = await query;
      if (error) throw error;
      toast('Animal successfully deleted.', 'success');
      navigate('/animals');
    } catch {
      toast('Unable to delete animal. Please try again.', 'error');
    }
  };

  const handleAdministerInventory = async () => {
    if (!administerItemId || !animal || !user) return;
    if (animal.user_id !== user.id && !isSuperAdmin) {
      toast('Walang pahintulot na gumamit ng gamot sa hayop na ito.', 'error');
      return;
    }

    const item = farmData.inventory.find((i) => i.id === administerItemId);
    if (!item) {
      toast('Pumili ng gamot o supply mula sa imbentaryo.', 'error');
      return;
    }
    if (item.user_id !== user.id && !isSuperAdmin) {
      toast('Walang pahintulot sa gamot o supply na ito.', 'error');
      return;
    }

    const qty = Number(administerQty);
    if (!administerQty || isNaN(qty) || qty <= 0) {
      toast('Maglagay ng wastong dami (quantity).', 'error');
      return;
    }
    if (qty > Number(item.quantity)) {
      toast(`❌ Hindi sapat ang stock ng gamot. Available lang: ${item.quantity} ${item.unit}.`, 'error');
      return;
    }

    if (item.expiry_date && isItemExpired(item.expiry_date)) {
      toast(`⚠️ Expired na ang gamot na ito noong ${item.expiry_date}. Hindi maaaring ibigay sa hayop.`, 'error');
      return;
    }

    setAdministerSaving(true);
    try {
      // 1. Consume from Inventory & write to inventory_transactions ledger atomically
      const consumeRes = await consumeInventoryStock({
        userId: user.id,
        isSuperAdmin,
        item,
        quantity: qty,
        usageType: administerUsageType === 'Deworming' ? 'deworming' : 'medication',
        animalId: animal.id,
        animalTag: animal.tag_id,
        animalName: animal.name,
        referenceType: 'animal',
        referenceId: animal.id,
        reason: `${administerUsageType} — ${administerStatus}: ${administerReason || item.name}`,
        notes: `Gamot: ${item.name} (${qty} ${item.unit}). Dosis: ${administerDosage || `${qty} ${item.unit}`}, Dalas: ${administerFrequency}. Simula: ${administerStartDate}${
          administerEndDate ? `, Hanggang: ${administerEndDate}` : ''
        }. Katayuan: ${administerStatus}. ${administerNotes}`.trim(),
      });

      if (!consumeRes.success) {
        toast(consumeRes.error || 'Hindi sapat ang stock sa imbentaryo.', 'error');
        setAdministerSaving(false);
        return;
      }

      // 2. Insert into health_records for full clinical history & dashboard tracking
      const isCompleted = administerStatus === 'Tapos na ang Gamot';
      const isCritical = administerStatus === 'Kailangan ng Gamot' || administerStatus === 'Kasalukuyang Ginagamot';
      const { error: healthErr } = await supabase.from('health_records').insert({
        user_id: user.id,
        animal_id: animal.id,
        record_date: administerStartDate,
        reasons: `Gamot / Lunas: ${item.name} (${administerStatus})`,
        recommendation: `Katayuan ng Gamot: ${administerStatus}. Dalas: ${administerFrequency}.`,
        notes: `Uri: ${administerUsageType} | Gamot: ${item.name} | Dami: ${qty} ${item.unit} | Dosis: ${administerDosage || `${qty} ${item.unit}`} | Dalas: ${administerFrequency} | Katayuan: ${administerStatus} | Simula: ${administerStartDate}${
          administerEndDate ? ` | Hanggang: ${administerEndDate}` : ''
        } | Dahilan: ${administerReason || 'Pangangasiwa ng Gamot'} | Tala: ${administerNotes}`.trim(),
        risk_level: isCompleted ? 'Low' : isCritical ? 'Moderate' : 'Low',
        risk_score: isCompleted ? 5 : isCritical ? 60 : 20,
      });
      if (healthErr) throw healthErr;

      // 3. Synchronize animal's health_status
      let newHealthStatus: HealthStatus | null = null;
      if (isCompleted) {
        newHealthStatus = 'Healthy';
      } else if (isCritical) {
        newHealthStatus = 'Critical';
      }

      if (newHealthStatus) {
        let animalUpdate = supabase.from('animals').update({ health_status: newHealthStatus }).eq('id', animal.id);
        if (!isSuperAdmin) {
          animalUpdate = animalUpdate.eq('user_id', user.id);
        }
        await animalUpdate;
      }

      toast(`Nai-save ang ${administerUsageType}! Nabawasan ng ${qty} ${item.unit} ang ${item.name} sa imbentaryo.`, 'success');
      setAdministerModalOpen(false);
      setAdministerItemId('');
      setAdministerQty('');
      setAdministerDosage('');
      setAdministerFrequency('Once daily');
      setAdministerStartDate(new Date().toISOString().split('T')[0]);
      setAdministerEndDate('');
      setAdministerStatus('Kasalukuyang Ginagamot');
      setAdministerUsageType('Medication');
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
        .brand{font-size:16px;font-weight:900;color:#238B45;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:6px}
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
      borderColor: '#238B45',
      backgroundColor: 'rgba(35, 139, 69, 0.15)',
      fill: true, tension: 0.3, pointRadius: 4,
      pointBackgroundColor: '#238B45',
    }],
  };

  const animalInventoryUsage = useMemo(() => {
    return farmData.inventoryTransactions
      .filter((tx) => tx.reference_type === 'animal' && tx.reference_id === animal?.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [farmData.inventoryTransactions, animal?.id]);

  const tabs = [
    { key: 'overview', label: 'Buod ng Hayop' },
    { key: 'health', label: 'Kalusugan' },
    { key: 'weight', label: 'Timbang' },
    { key: 'breeding', label: 'Breeding' },
    { key: 'vaccination', label: 'Mga Bakuna' },
    { key: 'inventory', label: 'Mga Gamot at Stock' },
    { key: 'feed', label: 'Pakain' },
    { key: 'history', label: 'Mga Record' },
    { key: 'camera', label: 'AI Health Scanner' },
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
          <ArrowLeft size={15} /> Bumalik sa mga Hayop
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
              background: 'linear-gradient(135deg, #238B45, #176B35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900, color: '#fff',
              boxShadow: '0 8px 24px rgba(35,139,69,0.35)',
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
                <span style={{ color: 'var(--color-primary, #238B45)', fontWeight: 700 }}>{animal.tag_id}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{animal.species === 'Goat' ? 'Kambing' : 'Tupa'}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{animal.sex === 'Female' ? 'Babae' : 'Lalaki'}</span>
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
                {isSold && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    background: '#EAF6ED',
                    color: '#238B45',
                    border: '1px solid #C7E9C0',
                    fontWeight: 700,
                    fontSize: 13,
                  }}>
                    <CheckCircle2 size={14} /> Nabenta
                  </span>
                )}
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <ActionBtn icon={<QrCode size={14} />} label="QR" onClick={() => setQrOpen(true)} variant="neutral" />
                  {!isSold && (
                    <ActionBtn icon={<Camera size={14} />} label="AI Health Scan" onClick={() => navigate(`/camera-screening?animalId=${animal.id}`)} variant="orange" />
                  )}
                  {!isSold && (
                    <ActionBtn icon={<Pencil size={14} />} label="I-edit" onClick={() => setEditOpen(true)} variant="orange" />
                  )}
                  <ActionBtn icon={<Trash2 size={14} />} label="Burahin" onClick={() => setConfirmDelete(true)} variant="red" />
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
                    ? 'linear-gradient(135deg, #238B45, #176B35)'
                    : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--text-secondary)',
                  boxShadow: tab === t.key ? '0 4px 14px rgba(35,139,69,0.35)' : 'none',
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

            {/* Sales Details Card if Sold */}
            {isSold && (
              <GlassCard gridSpan={3} style={{ border: '1px solid #C7E9C0', background: 'linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <CardTitle icon={DollarSign} title="Detalye ng Pagbebenta (Sale Details)" />
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    backgroundColor: '#EAF6ED',
                    color: '#238B45',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    <CheckCircle2 size={14} /> Nabenta na ang hayop na ito
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 16,
                  paddingTop: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Timbang Bago Ibenta</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', marginTop: 2 }}>
                      {animalSale?.sold_weight || animal.weight_kg || '—'} kg
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Presyo ng Pagbebenta</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#238B45', marginTop: 2 }}>
                      ₱{(animalSale?.selling_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Presyo bawat Kilo</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginTop: 2 }}>
                      {animalSale?.price_per_kg ? `₱${animalSale.price_per_kg.toFixed(2)}/kg` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bumibili</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginTop: 2 }}>
                      {animalSale?.buyer_name || 'Hindi tinukoy'}
                      {animalSale?.buyer_contact && (
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                          {animalSale.buyer_contact}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Katayuan ng Bayad</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginTop: 2 }}>
                      {animalSale?.payment_status || 'Bayad na'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Petsa ng Pagbebenta</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginTop: 2 }}>
                      {animalSale?.sale_date ? formatDate(animalSale.sale_date) : '—'}
                    </div>
                  </div>
                </div>
                {animalSale?.notes && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #E5E7EB', fontSize: 12, color: '#4B5563' }}>
                    <strong>Mga Tala sa Benta:</strong> {animalSale.notes}
                  </div>
                )}
              </GlassCard>
            )}

            {/* Health Risk Card */}
            <GlassCard>
              <CardTitle icon={Activity} title="AI Health Risk Status" />
              {/* Score ring */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
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
                    <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.5px' }}>/ 100</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor, marginBottom: 2 }}>
                    {animal.health_status || `${levelFromScore(animal.health_risk_score)} Risk`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {animal.health_risk_score >= 50 ? 'Needs Attention' : animal.health_risk_score >= 25 ? 'Requires Monitoring' : 'Healthy / Low Risk'}
                  </div>
                </div>
              </div>

              {/* Status details & trend */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <StatRow label="Health Status" value={animal.health_status} />
                <StatRow label="AI Risk Score" value={`${animal.health_risk_score ?? 0} / 100`} />
                <StatRow label="Last AI Screening" value={lastScreeningDate} />
                <StatRow
                  label="Risk Trend"
                  value={riskTrendInfo.trend}
                  valueStyle={{ color: riskTrendInfo.color, fontWeight: 800 }}
                />
              </div>

              {/* Risk Trend Warning Banner if Increasing */}
              {riskTrendInfo.warning && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  color: '#DC2626',
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}>
                  {riskTrendInfo.warning}
                </div>
              )}

              {/* Vitals with strict transparency */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Vital Signs (Sensor Status)
                </div>
                <StatRow label="Temperature" value={animal.current_temperature ? `${animal.current_temperature}°C` : 'Not measured'} />
                <StatRow label="Heart Rate" value={animal.current_heart_rate ? `${animal.current_heart_rate} BPM` : 'Not measured'} />
                <StatRow label="Respiratory Rate" value="Not measured" />
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
                    <strong>Pagsusuri sa Kalusugan</strong> — Magdagdag ng kahit 5 health records upang makita ang kumpletong pagsusuri sa hayop na ito.
                  </span>
                </div>
              )}
            </GlassCard>

            {/* Health Risk History Chart */}
            {riskDates.length >= 2 && (
              <GlassCard gridSpan={2}>
                <CardTitle icon={Activity} title="Kasaysayan ng Kalusugan (Health Trend)" />
                <div style={{ height: 200 }}>
                  <Line
                    data={{
                      labels: riskDates.map(d => {
                        const date = new Date(d);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }),
                      datasets: [
                        {
                          label: 'Tinatayang Risk',
                          data: riskProbs,
                          borderColor: '#238B45',
                          backgroundColor: 'rgba(35, 139, 69, 0.15)',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 4,
                          pointBackgroundColor: '#238B45',
                        },
                        {
                          label: 'Pagsusuri sa Bukid',
                          data: riskScores,
                          borderColor: '#176B35',
                          backgroundColor: 'transparent',
                          borderDash: [5, 5],
                          tension: 0.4,
                          pointRadius: 3,
                          pointBackgroundColor: '#176B35',
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
                valueStyle={growth.weightChange !== null ? { color: growth.weightChange >= 0 ? '#238B45' : '#EF4444' } : {}}
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
                  color={animal.breeding_status === 'Pregnant' ? '#176B35' : animal.breeding_status === 'Open' ? '#50645A' : '#78877F'}
                  bg={animal.breeding_status === 'Pregnant' ? '#EAF6ED' : animal.breeding_status === 'Open' ? '#F4FAF5' : 'rgba(120,135,127,0.12)'}
                />
              } />
              <StatRow label="Last Mating" value={formatDate(animal.last_mating_date)} />
              <StatRow label="Expected Kidding" value={formatDate(animal.expected_kidding_date)} />
              {breedingAssessment && (
                <StatRow label="Readiness" value={
                  <StatusBadge
                    label={breedingAssessment.recommendation}
                    color={breedingAssessment.recommendation === 'Ready' ? '#238B45' : breedingAssessment.recommendation === 'Monitor' ? '#176B35' : '#78877F'}
                    bg={breedingAssessment.recommendation === 'Ready' ? '#EAF6ED' : breedingAssessment.recommendation === 'Monitor' ? '#DDF0E2' : 'rgba(120,135,127,0.12)'}
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
                const predLabel = latest.prediction === 'possible_health_concern' ? 'Posibleng May Karamdaman' : latest.prediction === 'normal_appearance' ? 'Maayos ang Hitsura' : 'Mababang Kalidad ng Litrato';
                return (
                  <div>
                    <StatRow label="Huling Pagsusuri" value={formatDate(latest.created_at)} />
                    <StatRow label="Resulta" value={<span style={{ fontWeight: 700, color: predColor }}>{predLabel}</span>} />
                    <StatRow label="Kabuuang Pagsusuri" value={`${animalScreenings.length} beses`} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => setCameraScreeningOpen(true)}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 9, border: 'none',
                          background: 'linear-gradient(135deg,#238B45,#176B35)',
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
                    Wala pang screening. Mag-screen ng kalusugan gamit ang camera.
                  </div>
                  <button
                    onClick={() => setCameraScreeningOpen(true)}
                    style={{
                      padding: '9px 16px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg,#238B45,#176B35)',
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 4px 14px rgba(35,139,69,0.3)',
                    }}
                  >
                    <Camera size={14} /> Suriin ang Hayop
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
                <Sparkles size={15} /> Suriin ang Kalusugan
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
              <CardTitle icon={Scale} title="Kasaysayan ng Timbang (Weight History)" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {animalWeights.length} talaan ng timbang
              </span>
            </div>
            {animalWeights.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.Scale size={24} /></div><h4>No weight records</h4><p>Add a weigh-in to start tracking growth.</p></div>
            ) : (
              <>
                <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', padding: '4px 0' }}>
                  <Line data={weightChartData} options={{
                    responsive: true,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(6,18,32,0.92)', bodyColor: '#fff', titleColor: '#238B45' } },
                    scales: {
                      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' as any } },
                      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' as any } },
                    },
                  }} />
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Record Type</th><th>Weight</th><th>Change</th><th>Daily Gain</th><th>Notes</th></tr></thead>
                    <tbody>
                      {[...animalWeights].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()).map((w) => {
                        const isInitial = w.previous_weight_kg === null || Boolean(w.notes && w.notes.toLowerCase().includes('initial'));
                        return (
                          <tr key={w.id}>
                            <td>{formatDate(w.record_date)}</td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: isInitial ? 'rgba(35, 139, 69, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                                  color: isInitial ? '#238B45' : 'var(--text-secondary)',
                                }}
                              >
                                {isInitial ? 'Initial Weight' : 'Weight Update'}
                              </span>
                            </td>
                            <td><strong>{w.weight_kg} kg</strong></td>
                            <td style={{ color: w.weight_change_kg !== null && w.weight_change_kg < 0 ? '#EF4444' : w.weight_change_kg !== null && w.weight_change_kg > 0 ? '#238B45' : 'inherit', fontWeight: 600 }}>
                              {w.weight_change_kg !== null ? `${w.weight_change_kg > 0 ? '+' : ''}${w.weight_change_kg} kg` : '—'}
                            </td>
                            <td>{w.daily_gain_kg !== null ? `${w.daily_gain_kg} kg/day` : '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.notes || '—'}</td>
                          </tr>
                        );
                      })}
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
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary, #238B45)' }}>
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
              const predLabel = latest.prediction === 'possible_health_concern' ? 'Posibleng May Karamdaman' : latest.prediction === 'normal_appearance' ? 'Maayos ang Hitsura' : 'Mababang Kalidad ng Litrato';
              return (
                <GlassCard style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                    <CardTitle icon={Camera} title="Huling Pagsusuri sa Camera" />
                    <button
                      onClick={() => setCameraScreeningOpen(true)}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg,#238B45,#176B35)',
                        color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 14px rgba(35,139,69,0.3)',
                      }}
                    >
                      <Camera size={14} /> Magsagawa ng Pagsusuri
                    </button>
                  </div>
                  <StatRow label="Petsa" value={formatDate(latest.created_at)} />
                  <StatRow label="Resulta" value={<span style={{ fontWeight: 700, color: predColor }}>{predLabel}</span>} />
                  <StatRow label="Kalidad ng Litrato" value={`${latest.quality_score}/100`} />
                  {latest.notes && <StatRow label="Mga Tala" value={latest.notes} />}
                  <div style={{
                    marginTop: 12, padding: '10px 12px',
                    background: 'rgba(35,139,69,0.08)',
                    border: '1px solid rgba(35,139,69,0.20)',
                    borderRadius: 8, fontSize: 11, color: '#176B35', lineHeight: 1.6,
                  }}>
                    Ang camera screening ay paunang gabay lamang sa pagmamasid sa bukid at hindi opisyal na diagnosis ng beterinaryo.
                  </div>
                </GlassCard>
              );
            })()}

            {/* If no screenings, show prompt */}
            {animalScreenings.length === 0 && (
              <GlassCard style={{ marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <Camera size={36} color="var(--color-primary, #238B45)" style={{ marginBottom: 12, opacity: 0.7 }} />
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                    No Camera Screenings Yet
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                    Mag-screen ng kalusugan gamit ang camera ng cellphone o mag-upload ng litrato ni {animal.name}.
                  </div>
                  <button
                    onClick={() => setCameraScreeningOpen(true)}
                    style={{
                      padding: '10px 24px', borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg,#238B45,#176B35)',
                      color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      boxShadow: '0 6px 20px rgba(35,139,69,0.35)',
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
              <p style={{ color: 'var(--color-primary, #238B45)', fontSize: 13, fontWeight: 600, margin: 0 }}>{animal.tag_id}</p>
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
        <ModalHeader title="I-edit ang Hayop" onClose={() => setEditOpen(false)} />
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
                    <Tag size={16} color="var(--color-primary, #238B45)" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-primary, #238B45)', letterSpacing: '0.02em' }}>
                      {editForm.tag_id || '—'}
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
                    Rehistradong ID
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', marginTop: -2 }}>
                  Ang Animal ID ay permanente at hindi maaaring baguhin nang manu-mano.
                </span>
              </div>
              <FormField label="Pangalan" required>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <FormField label="Species">
                <Select
                  value={editForm.species}
                  onChange={(e) => setEditForm({ ...editForm, species: e.target.value as Species })}
                  options={[{ value: 'Goat', label: 'Goat / Kambing' }, { value: 'Sheep', label: 'Sheep / Tupa' }]}
                />
              </FormField>
              <FormField label="Sex">
                <Select
                  value={editForm.sex}
                  onChange={(e) => setEditForm({ ...editForm, sex: e.target.value as Sex })}
                  options={[{ value: 'Female', label: 'Female / Babae' }, { value: 'Male', label: 'Male / Lalaki' }]}
                />
              </FormField>
              <FormField label="Breed">
                <Input value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Birth Date">
                <Input type="date" value={editForm.date_of_birth} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} />
              </FormField>
              <FormField label="Weight (kg) (Optional)" helperText="Maaaring laktawan kung wala pang timbang">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.weight_kg}
                  onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })}
                  placeholder="Opsyonal (hal. 35.5)"
                />
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
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Kanselahin</Button>
          <Button variant="primary" onClick={handleSaveEdit} loading={saving}>I-save ang Pagbabago</Button>
        </ModalFooter>
      </Modal>

      {/* ── Confirm Delete ── */}
      <ConfirmDialog
        open={confirmDelete}
        title="Burahin ang Hayop"
        message={`Sigurado ka bang nais mong burahin si ${animal.name} (${animal.tag_id})? Mabubura din ang lahat ng kaugnay na talaan nito sa bukid. Hindi na ito maibabalik kapag nabura.`}
        confirmLabel="Oo, Burahin"
        cancelLabel="Huwag Muna"
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <FormField label="Uri ng Paggamot (Usage Type)" required>
                <Select
                  value={administerUsageType}
                  onChange={(e) => setAdministerUsageType(e.target.value as TreatmentUsageType)}
                  options={[
                    { value: 'Medication', label: 'Gamot (Medication)' },
                    { value: 'Deworming', label: 'Purga (Deworming)' },
                    { value: 'Supplement', label: 'Bitamina / Suplemento' },
                    { value: 'Treatment', label: 'Iba pang Paggamot' },
                  ]}
                />
              </FormField>

              <FormField label="Katayuan ng Gamot (Status)" required>
                <Select
                  value={administerStatus}
                  onChange={(e) => setAdministerStatus(e.target.value as TreatmentStatus)}
                  options={[
                    { value: 'Kasalukuyang Ginagamot', label: 'Kasalukuyang Ginagamot (Active)' },
                    { value: 'Kailangan ng Gamot', label: 'Kailangan ng Gamot (Pending)' },
                    { value: 'Tapos na ang Gamot', label: 'Tapos na ang Gamot (Completed)' },
                    { value: 'Hindi pa Nabibigyan', label: 'Hindi pa Nabibigyan' },
                    { value: 'Bantayan', label: 'Bantayan (Monitor)' },
                  ]}
                />
              </FormField>
            </div>

            <FormField label="Pumili ng Gamot mula sa Imbentaryo" required>
              <select
                className="form-select"
                value={administerItemId}
                onChange={(e) => setAdministerItemId(e.target.value)}
              >
                <option value="">-- Piliin ang Item mula sa Imbentaryo --</option>
                {farmData.inventory
                  .filter((i) =>
                    administerUsageType === 'Deworming'
                      ? isDewormerCategory(i.category) || isMedicineCategory(i.category)
                      : isMedicineCategory(i.category) || isSupplementCategory(i.category) || i.category === 'Supplies'
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id} disabled={Number(i.quantity) <= 0 || (!!i.expiry_date && isItemExpired(i.expiry_date))}>
                      {i.name} ({i.category}) — Available: {i.quantity} {i.unit}
                      {Number(i.quantity) <= 0 ? ' (Out of stock)' : ''}
                      {i.expiry_date && isItemExpired(i.expiry_date) ? ' (Expired)' : ''}
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
                  const expired = sel.expiry_date && isItemExpired(sel.expiry_date);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        Kasalukuyang stock: <strong style={{ color: expired ? '#EF4444' : '#238B45' }}>{sel.quantity} {sel.unit}</strong>
                      </span>
                      {sel.expiry_date && (
                        <span style={{ color: expired ? '#EF4444' : 'var(--text-secondary)' }}>
                          Expiry: {formatDate(sel.expiry_date)} {expired && '(Expired)'}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <FormField label="Dami na Ibabawas sa Stock (Qty)" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={administerQty}
                  onChange={(e) => setAdministerQty(e.target.value)}
                  placeholder="Hal. 2"
                />
              </FormField>

              <FormField label="Dosis (Dosage Text)">
                <Input
                  value={administerDosage}
                  onChange={(e) => setAdministerDosage(e.target.value)}
                  placeholder="Hal. 2 ml subcutaneous, 1 tablet"
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <FormField label="Dalas (Frequency)">
                <Select
                  value={administerFrequency}
                  onChange={(e) => setAdministerFrequency(e.target.value)}
                  options={[
                    { value: 'Once only', label: 'Isang beses lang' },
                    { value: 'Once daily', label: 'Kada araw (Once daily)' },
                    { value: 'Twice daily', label: 'Dalawang beses kada araw (Twice daily)' },
                    { value: 'Every 3 days', label: 'Kada 3 araw' },
                    { value: 'Weekly', label: 'Kada linggo (Weekly)' },
                  ]}
                />
              </FormField>

              <FormField label="Dahilan / Karamdaman" required>
                <Input
                  value={administerReason}
                  onChange={(e) => setAdministerReason(e.target.value)}
                  placeholder="Hal. Lagnat, Ubo, Bulate, Bitamina"
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <FormField label="Petsa ng Simula (Start Date)" required>
                <Input
                  type="date"
                  value={administerStartDate}
                  onChange={(e) => setAdministerStartDate(e.target.value)}
                />
              </FormField>

              <FormField label="Petsa ng Pagtatapos (End Date / Duration)">
                <Input
                  type="date"
                  value={administerEndDate}
                  onChange={(e) => setAdministerEndDate(e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Karagdagang Tala (Notes)">
              <textarea
                className="form-textarea"
                value={administerNotes}
                onChange={(e) => setAdministerNotes(e.target.value)}
                placeholder="Hal. Ibinigay matapos kumain. Bantayan kung may reaksyon..."
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
    orange: { base: '#EAF6ED', border: 'rgba(35,139,69,0.35)', text: '#176B35', hover: '#DDF0E2' },
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
