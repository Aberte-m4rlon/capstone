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
  assessBreedingReadiness,
} from '../lib/analytics';
import { Line } from 'react-chartjs-2';
import {
  ArrowLeft,
  CheckCircle2,
  QrCode,
  Camera,
  Pencil,
  Trash2,
  Plus,
  Heart,
  Scale,
  Syringe,
  Wheat,
  AlertTriangle,
  Activity,
  Package,
  DollarSign,
  Info,
  Tag,
  Pill,
  Download,
  Printer,
  HeartPulse,
  Stethoscope,
  ClipboardList,
} from 'lucide-react';
import QRCode from 'qrcode';
import type { Animal, HealthStatus, Species, Sex, TreatmentStatus, TreatmentUsageType } from '../types';
import { consumeInventoryStock, isItemExpired } from '../lib/inventoryOperations';
import { CameraScreeningModal } from '../components/CameraScreeningModal';
import { useAnimalScreenings } from '../lib/useCameraScreenings';
import { MedicationTreatmentModal } from '../components/domain/health';

// ─── Status helpers ────────────────────────────────────────────────────────────
const healthBadgeColor = (s: HealthStatus) =>
  s === 'Healthy' ? '#238B45' : s === 'Monitor' ? '#176B35' : s === 'At Risk' ? '#F59E0B' : '#EF4444';

const healthBadgeBg = (s: HealthStatus) =>
  s === 'Healthy' ? '#EAF6ED' : s === 'Monitor' ? '#DDF0E2' : s === 'At Risk' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';

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
          background: 'linear-gradient(135deg, rgba(35,139,69,0.18), rgba(23,107,53,0.12))',
          border: '1px solid rgba(35,139,69,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={16} color="#238B45" />
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

  // Farmer-first tab navigation (strictly 7 modules)
  const [tab, setTab] = useState<'overview' | 'health' | 'breeding' | 'vaccination' | 'inventory' | 'feed' | 'report'>('overview');
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cameraScreeningOpen, setCameraScreeningOpen] = useState(false);
  const [administerModalOpen, setAdministerModalOpen] = useState(false);

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
  const animalSale = useMemo(() => {
    return (farmData.sales || []).find((s) => s.animal_id === id) ?? null;
  }, [farmData.sales, id]);
  const isSold = Boolean(animalSale || animal?.status === 'Sold' || animal?.is_sold || animal?.archived);

  const growth = useMemo(() => calculateGrowth(animalWeights, farmData.settings?.target_weight_kg ?? 40), [animalWeights, farmData.settings]);
  const breedingAssessment = useMemo(() => {
    if (!animal || !farmData.settings) return null;
    const lastMating = animalBreedings.sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime())[0] ?? null;
    return assessBreedingReadiness(animal, farmData.settings, lastMating);
  }, [animal, animalBreedings, farmData.settings]);

  // Keep camera screening hook active in background
  const { screenings: animalScreenings, refresh: refreshScreenings } = useAnimalScreenings(animal?.id ?? null);

  const animalInventoryUsage = useMemo(() => {
    return farmData.inventoryTransactions
      .filter((tx) => tx.reference_type === 'animal' && tx.reference_id === animal?.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [farmData.inventoryTransactions, animal?.id]);

  // ─── Real-Data Driven Health Status ("Kalagayan ng Hayop") ───────────────────
  // Hierarchy:
  // 1. "Kailangan ng Gamot" - active medication or ongoing clinical treatment
  // 2. "Kailangan ng Atensyon" - health concern detected or critical/high risk
  // 3. "Bantayan" - under observation or moderate risk
  // 4. "Maayos" - healthy with no active concerns
  const sortedHealth = useMemo(() => {
    return [...animalHealth].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [animalHealth]);

  const latestHealthRecord = sortedHealth[0] ?? null;

  const activeMedicine = useMemo(() => {
    const activeTx = animalInventoryUsage.find((tx) =>
      tx.reason?.includes('Kasalukuyang Ginagamot') ||
      tx.reason?.includes('Kailangan ng Gamot') ||
      tx.notes?.includes('Katayuan: Kasalukuyang Ginagamot') ||
      tx.notes?.includes('Katayuan: Kailangan ng Gamot')
    );
    if (activeTx) {
      const match = activeTx.notes?.match(/Gamot:\s*([^|]+)/);
      const dosageMatch = activeTx.notes?.match(/Dosis:\s*([^|]+)/);
      const freqMatch = activeTx.notes?.match(/Dalas:\s*([^|]+)/);
      return {
        name: match ? match[1].trim() : activeTx.reason || 'Gamot',
        dosage: dosageMatch ? dosageMatch[1].trim() : `${activeTx.quantity} ${activeTx.unit}`,
        frequency: freqMatch ? freqMatch[1].trim() : 'Araw-araw',
        status: 'Kasalukuyang Ginagamot',
      };
    }
    if (latestHealthRecord && latestHealthRecord.reasons?.includes('Gamot')) {
      return {
        name: latestHealthRecord.reasons.replace('Gamot / Lunas:', '').trim(),
        dosage: 'Ayon sa reseta',
        frequency: 'Araw-araw',
        status: 'Kasalukuyang Ginagamot',
      };
    }
    return null;
  }, [animalInventoryUsage, latestHealthRecord]);

  const farmerStatus = useMemo(() => {
    const isUnderTreatment = Boolean(activeMedicine) ||
      animal?.health_status === 'Critical' ||
      (latestHealthRecord?.reasons?.includes('Kasalukuyang Ginagamot') ?? false) ||
      (latestHealthRecord?.reasons?.includes('Kailangan ng Gamot') ?? false);

    if (isUnderTreatment) {
      return {
        label: 'Kailangan ng Gamot' as const,
        color: '#DC2626',
        bg: 'rgba(220, 38, 38, 0.12)',
        borderColor: '#DC2626',
        description: 'Kasalukuyang may gamot o lunas na ibinibigay sa hayop.',
        Icon: Pill,
      };
    }

    const hasDetectedConditions = Boolean(latestHealthRecord && (latestHealthRecord as any).detected_conditions);
    const hasHealthConcern = animal?.health_status === 'At Risk' ||
      latestHealthRecord?.risk_level === 'High' ||
      (latestHealthRecord?.risk_score ?? 0) >= 50 ||
      hasDetectedConditions;

    if (hasHealthConcern) {
      return {
        label: 'Kailangan ng Atensyon' as const,
        color: '#EA580C',
        bg: 'rgba(234, 88, 12, 0.12)',
        borderColor: '#EA580C',
        description: 'May napansing kondisyon na nangangailangan ng atensyon o obserbasyon.',
        Icon: AlertTriangle,
      };
    }

    const isObserving = animal?.health_status === 'Monitor' ||
      latestHealthRecord?.risk_level === 'Moderate' ||
      (latestHealthRecord?.risk_score ?? 0) >= 25;

    if (isObserving) {
      return {
        label: 'Bantayan' as const,
        color: '#D97706',
        bg: 'rgba(217, 119, 6, 0.12)',
        borderColor: '#D97706',
        description: 'Nasa ilalim ng masusing pagmamasid ang hayop.',
        Icon: Activity,
      };
    }

    return {
      label: 'Maayos' as const,
      color: '#16A34A',
      bg: 'rgba(22, 163, 74, 0.12)',
      borderColor: '#16A34A',
      description: 'Walang nakitang kailangang aksyunan sa pinakahuling check.',
      Icon: CheckCircle2,
    };
  }, [animal?.health_status, activeMedicine, latestHealthRecord]);

  // Latest check date
  const hulingCheckDate = useMemo(() => {
    const dates: Date[] = [];
    if (latestHealthRecord?.record_date) {
      dates.push(new Date(latestHealthRecord.record_date));
    }
    if (animalScreenings[0]?.created_at) {
      dates.push(new Date(animalScreenings[0].created_at));
    }
    if (dates.length === 0) return 'Wala pang check';
    dates.sort((a, b) => b.getTime() - a.getTime());
    return formatDate(dates[0].toISOString());
  }, [latestHealthRecord, animalScreenings]);

  // Latest weight (preserving weight records without separate tab)
  const latestWeight = useMemo(() => {
    if (animalWeights.length > 0) {
      const sorted = [...animalWeights].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
      return sorted[0].weight_kg;
    }
    return animal?.weight_kg || null;
  }, [animalWeights, animal?.weight_kg]);

  // Observations
  const latestObservations = useMemo(() => {
    if (latestHealthRecord) {
      const obs = (latestHealthRecord as any).detected_conditions || latestHealthRecord.reasons || latestHealthRecord.notes;
      if (obs && !obs.includes('Gamot / Lunas:')) return obs;
    }
    if (animalScreenings[0]?.notes) {
      return animalScreenings[0].notes;
    }
    return 'Walang naitalang karamdaman';
  }, [latestHealthRecord, animalScreenings]);

  // Reminders
  const activeReminders = useMemo(() => {
    const list: string[] = [];
    if (animal?.next_vaccine_date) {
      list.push(`Nakatakdang bakuna sa ${formatDate(animal.next_vaccine_date)}`);
    }
    if (animal?.expected_kidding_date && animal.breeding_status === 'Pregnant') {
      const days = daysUntil(animal.expected_kidding_date);
      list.push(`Inaasahang ${animal.species === 'Goat' ? 'manganak' : 'magluwal'} sa ${formatDate(animal.expected_kidding_date)}${days !== null && days >= 0 ? ` (${days} araw na lang)` : ''}`);
    }
    if (activeMedicine) {
      list.push(`Gamot: ${activeMedicine.name} (${activeMedicine.dosage}) — ${activeMedicine.frequency}`);
    }
    return list;
  }, [animal, activeMedicine]);

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
      toast('Matagumpay na na-update ang impormasyon ng hayop.', 'success');
      setEditOpen(false);
      farmData.refresh();
    } catch {
      toast('Hindi mai-save ang mga pagbabago. Pakisubukan muli.', 'error');
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
      toast('Matagumpay na nabura ang hayop.', 'success');
      navigate('/animals');
    } catch {
      toast('Hindi mabura ang hayop. Pakisubukan muli.', 'error');
    }
  };

  const downloadQR = async () => {
    const url = `${window.location.origin}/public/${animal.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qr-${animal.tag_id}.png`;
    link.click();
    toast('Na-download ang QR code.', 'success');
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
          <div class="meta">${animal.species === 'Goat' ? 'Kambing' : 'Tupa'}${animal.breed ? ` · ${animal.breed}` : ''} · ${animal.sex === 'Female' ? 'Babae' : 'Lalaki'}</div>
          <div class="hint">I-scan ang QR code na ito upang makita ang profile ng hayop.</div>
        </div>
      </body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 300);
    });
  };

  // Weight chart for the Ulat / Reports tab
  const sortedWeights = [...animalWeights].sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());
  const weightChartData = {
    labels: sortedWeights.map((w) => formatDate(w.record_date)),
    datasets: [{
      label: 'Timbang (kg)',
      data: sortedWeights.map((w) => Number(w.weight_kg)),
      borderColor: '#238B45',
      backgroundColor: 'rgba(35, 139, 69, 0.15)',
      fill: true, tension: 0.3, pointRadius: 4,
      pointBackgroundColor: '#238B45',
    }],
  };

  // Farmer-first navigation modules
  const tabs = [
    { key: 'overview', label: 'Buod ng Hayop' },
    { key: 'health', label: 'Kalusugan' },
    { key: 'breeding', label: 'Breeding' },
    { key: 'vaccination', label: 'Mga Bakuna' },
    { key: 'inventory', label: 'Mga Gamot at Gamit' },
    { key: 'feed', label: 'Pakain' },
    { key: 'report', label: 'Ulat' },
  ] as const;

  const StatusIcon = farmerStatus.Icon;

  return (
    <>
      {/* Ambient background glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-120px', left: '-80px', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(35,139,69,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-100px', right: '-60px', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(23,107,53,0.05) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Page wrapper */}
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
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--color-primary, #238B45)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <ArrowLeft size={15} /> Bumalik sa mga Hayop
        </button>

        {/* ── Animal Header (Identity + Farmer Health Status) ── */}
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
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'flex', flexWrap: 'wrap' as const, gap: '4px 8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-primary, #238B45)', fontWeight: 700 }}>{animal.tag_id}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span>{animal.species === 'Goat' ? 'Kambing' : 'Tupa'}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span>{animal.sex === 'Female' ? 'Babae' : 'Lalaki'}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span>{ageLabel(animal.date_of_birth)}</span>
                {animal.breed && <><span style={{ opacity: 0.4 }}>•</span><span>{animal.breed}</span></>}
              </div>

              {/* Status + actions row */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10, marginTop: 4 }}>
                <StatusBadge
                  label={farmerStatus.label}
                  color={farmerStatus.color}
                  bg={farmerStatus.bg}
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
                {/* Action buttons — strictly farmer-facing labels */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <ActionBtn icon={<QrCode size={14} />} label="QR" onClick={() => setQrOpen(true)} variant="neutral" />
                  {!isSold && (
                    <ActionBtn icon={<Camera size={14} />} label="Health Check" onClick={() => setCameraScreeningOpen(true)} variant="green" />
                  )}
                  {!isSold && (
                    <ActionBtn icon={<Pencil size={14} />} label="I-edit" onClick={() => setEditOpen(true)} variant="neutral" />
                  )}
                  <ActionBtn icon={<Trash2 size={14} />} label="Burahin" onClick={() => setConfirmDelete(true)} variant="red" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab Navigation (Farmer-First 7 Modules) ── */}
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

        {/* 1. BUOD NG HAYOP (OVERVIEW) */}
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
                  <CardTitle icon={DollarSign} title="Detalye ng Pagbebenta" />
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
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Timbang noong Nabenta</div>
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
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Halagang Natanggap</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#238B45', marginTop: 2 }}>
                      ₱{(animalSale?.amount_received !== undefined && animalSale?.amount_received !== null ? animalSale.amount_received : (animalSale?.selling_price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Petsa ng Pagbebenta</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginTop: 2 }}>
                      {animalSale?.sale_date ? formatDate(animalSale.sale_date) : '—'}
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* CARD 1: KALAGAYAN NG HAYOP (Real-data farmer status) */}
            <GlassCard>
              <CardTitle icon={HeartPulse} title="Kalagayan ng Hayop" />
              <div style={{
                background: farmerStatus.bg,
                border: `1.5px solid ${farmerStatus.borderColor}44`,
                borderRadius: 14,
                padding: '16px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  flexShrink: 0,
                }}>
                  <StatusIcon size={26} color={farmerStatus.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: farmerStatus.color, lineHeight: 1.2 }}>
                    ● {farmerStatus.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, lineHeight: 1.4, fontWeight: 500 }}>
                    {farmerStatus.description}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <StatRow label="Huling Health Check" value={hulingCheckDate} />
                <StatRow
                  label="Kasalukuyang Gamot"
                  value={activeMedicine ? activeMedicine.name : 'Wala'}
                  valueStyle={activeMedicine ? { color: '#DC2626', fontWeight: 800 } : {}}
                />
              </div>

              {activeMedicine && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                  fontSize: 12,
                }}>
                  <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: 2 }}>
                    May gamot na ibinibigay:
                  </div>
                  <div style={{ color: 'var(--text)' }}>
                    <strong>{activeMedicine.name}</strong> — {activeMedicine.dosage} ({activeMedicine.frequency})
                  </div>
                  <button
                    onClick={() => setTab('inventory')}
                    style={{
                      marginTop: 8,
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(220, 38, 38, 0.35)',
                      background: '#fff',
                      color: '#DC2626',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Tingnan ang Gamot
                  </button>
                </div>
              )}
            </GlassCard>

            {/* CARD 2: MAHALAGANG IMPORMASYON */}
            <GlassCard>
              <CardTitle icon={Info} title="Mahalagang Impormasyon" />
              <StatRow label="Animal ID" value={animal.tag_id} />
              <StatRow label="Pangalan" value={animal.name} />
              <StatRow label="Uri" value={animal.species === 'Goat' ? 'Kambing' : 'Tupa'} />
              <StatRow label="Lahi" value={animal.breed || '—'} />
              <StatRow label="Kasarian" value={animal.sex === 'Female' ? 'Babae' : 'Lalaki'} />
              <StatRow label="Edad" value={ageLabel(animal.date_of_birth)} />
              <StatRow
                label="Timbang"
                value={latestWeight ? `${latestWeight} kg` : 'Hindi nakatala'}
                valueStyle={{ color: '#238B45', fontWeight: 800 }}
              />
              <StatRow
                label="Kalagayan"
                value={<StatusBadge label={farmerStatus.label} color={farmerStatus.color} bg={farmerStatus.bg} />}
              />
            </GlassCard>

            {/* CARD 3: KALUSUGAN AT MGA PAALALA */}
            <GlassCard>
              <CardTitle icon={Activity} title="Kalusugan at Mga Paalala" />
              {!isSold && (
                <button
                  onClick={() => setCameraScreeningOpen(true)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #238B45, #176B35)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 14,
                    boxShadow: '0 4px 14px rgba(35,139,69,0.3)',
                  }}
                >
                  <Camera size={15} /> Health Check
                </button>
              )}

              <StatRow label="Huling Pagsusuri" value={hulingCheckDate} />
              <StatRow label="Mga Napansin" value={latestObservations} />
              <StatRow label="Kasalukuyang Gamot" value={activeMedicine ? activeMedicine.name : 'Wala'} />

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Mga Paalala
                </div>
                {activeReminders.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeReminders.map((rem, idx) => (
                      <div key={idx} style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#238B45', fontWeight: 800 }}>•</span>
                        {rem}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Walang aktibong paalala sa ngayon.
                  </div>
                )}
              </div>
            </GlassCard>

            {/* CARD 4: MGA TALA / NOTES (Spans 3 cols on desktop) */}
            <GlassCard gridSpan={3}>
              <CardTitle icon={ClipboardList} title="Mga Tala (Notes)" />
              <p style={{
                fontSize: 14, color: animal.notes ? 'var(--text)' : 'var(--text-secondary)',
                lineHeight: 1.7, margin: 0, fontStyle: animal.notes ? 'normal' : 'italic',
              }}>
                {animal.notes || 'Walang naitalang karagdagang tala para sa hayop na ito.'}
              </p>
            </GlassCard>

          </div>
        )}

        {/* 2. KALUSUGAN TAB (Clean farmer health table, no technical ML metrics) */}
        {tab === 'health' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={HeartPulse} title="Kalusugan ng Hayop" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {!isSold && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setCameraScreeningOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Camera size={15} /> Health Check
                  </button>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate('/health')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Stethoscope size={15} /> Manual Health Check
                </button>
              </div>
            </div>

            {/* Kalagayan Card Banner */}
            <div style={{
              background: farmerStatus.bg,
              border: `1.5px solid ${farmerStatus.borderColor}44`,
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <StatusIcon size={24} color={farmerStatus.color} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: farmerStatus.color }}>
                    Kalagayan: {farmerStatus.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 2 }}>
                    {farmerStatus.description}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Huling Check: <strong>{hulingCheckDate}</strong>
              </div>
            </div>

            {/* Table of Health Records */}
            {animalHealth.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><HeartPulse size={24} /></div>
                <h4>Bagong hayop ito o wala pang health record</h4>
                <p>Magsagawa ng Health Check gamit ang camera o magtala ng manu-manong pagsusuri.</p>
                {!isSold && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 12 }}
                    onClick={() => setCameraScreeningOpen(true)}
                  >
                    <Camera size={14} /> Magsagawa ng Health Check
                  </button>
                )}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Petsa (Date)</th>
                      <th>Temperatura</th>
                      <th>Gana sa Pagkain</th>
                      <th>Sigla at Galaw</th>
                      <th>Kalagayan</th>
                      <th>Mga Napansin at Tala</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHealth.map((r) => {
                      // Format record-specific friendly status
                      const isMed = r.reasons?.includes('Gamot') || r.notes?.includes('Ginagamot');
                      const isConcern = r.risk_level === 'High' || r.risk_level === 'Critical' || Boolean((r as any).detected_conditions);
                      const isMon = r.risk_level === 'Moderate';
                      const recLabel = isMed ? 'Kailangan ng Gamot' : isConcern ? 'Kailangan ng Atensyon' : isMon ? 'Bantayan' : 'Maayos';
                      const recColor = isMed ? '#DC2626' : isConcern ? '#EA580C' : isMon ? '#D97706' : '#16A34A';
                      const recBg = isMed ? 'rgba(220, 38, 38, 0.12)' : isConcern ? 'rgba(234, 88, 12, 0.12)' : isMon ? 'rgba(217, 119, 6, 0.12)' : 'rgba(22, 163, 74, 0.12)';

                      return (
                        <tr key={r.id}>
                          <td>{formatDate(r.record_date)}</td>
                          <td>{r.temperature ? `${r.temperature}°C` : 'Hindi nasukat'}</td>
                          <td>{r.appetite ?? 'Normal'}</td>
                          <td>{r.activity_level ?? 'Normal'}</td>
                          <td>
                            <StatusBadge label={recLabel} color={recColor} bg={recBg} />
                          </td>
                          <td style={{ maxWidth: 300, fontSize: 12 }}>
                            {(r as any).detected_conditions ? (
                              <span style={{ color: '#EA580C', fontWeight: 600 }}>{(r as any).detected_conditions}</span>
                            ) : r.reasons ? (
                              <span>{r.reasons}</span>
                            ) : r.notes ? (
                              <span style={{ color: 'var(--text-secondary)' }}>{r.notes}</span>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)' }}>Normal / Walang problema</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        )}

        {/* 3. BREEDING TAB */}
        {tab === 'breeding' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Heart} title="Talaan ng Pagpaparami (Breeding)" />
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/breeding')}>
                <Plus size={15} /> Magdagdag ng Record
              </button>
            </div>
            {animalBreedings.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><Heart size={24} /></div>
                <h4>Walang talaan ng breeding</h4>
                <p>Magtala ng pagpaparis upang masubaybayan ang inaasahang panganganak.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Petsa ng Pagpaparis</th>
                      <th>Inaasahang Panganganak</th>
                      <th>Katayuan</th>
                      <th>Natitirang Araw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animalBreedings.map((b) => {
                      const days = b.expected_kidding_date ? daysUntil(b.expected_kidding_date) : null;
                      return (
                        <tr key={b.id}>
                          <td>{formatDate(b.mating_date)}</td>
                          <td>{formatDate(b.expected_kidding_date)}</td>
                          <td>
                            <span className={`badge badge-${b.status === 'Pregnant' ? 'blue' : b.status === 'Kidded' ? 'green' : 'gray'}`}>
                              {b.status === 'Pregnant' ? 'Buntis' : b.status === 'Kidded' ? 'Nanganak na' : b.status}
                            </span>
                          </td>
                          <td>{days !== null && days >= 0 ? `${days} araw` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        )}

        {/* 4. VACCINATION TAB */}
        {tab === 'vaccination' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Syringe} title="Mga Bakuna ng Hayop" />
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/vaccinations')}>
                <Plus size={15} /> Magdagdag ng Bakuna
              </button>
            </div>
            {animalVaccinations.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><Syringe size={24} /></div>
                <h4>Walang talaan ng bakuna</h4>
                <p>Magtala ng bakuna upang mapanatiling ligtas ang hayop sa mga sakit.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pangalan ng Bakuna</th>
                      <th>Petsa ng Pagbigay</th>
                      <th>Susunod na Bakuna</th>
                      <th>Beterinaryo / Nagbakuna</th>
                    </tr>
                  </thead>
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

        {/* 5. INVENTORY & MEDICATION TAB (MGA GAMOT AT GAMIT) */}
        {tab === 'inventory' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <CardTitle icon={Package} title="Mga Gamot at Gamit mula sa Imbentaryo" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary, #238B45)' }}>
                  {animalInventoryUsage.length} naitalang gamit
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus size={14} />}
                  onClick={() => {
                    if (isSold) {
                      toast('Hindi maaaring bigyan ng gamot ang nabentang hayop.', 'error');
                      return;
                    }
                    setAdministerModalOpen(true);
                  }}
                  disabled={isSold}
                >
                  Bigyan ng Gamot / Gamit
                </Button>
              </div>
            </div>

            {/* Active Medication Card */}
            {activeMedicine && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1.5px solid rgba(220, 38, 38, 0.35)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontWeight: 800, fontSize: 14 }}>
                  <Pill size={18} /> Kasalukuyang Gamot: {activeMedicine.name}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>
                  Dosis: <strong>{activeMedicine.dosage}</strong> • Dalas: <strong>{activeMedicine.frequency}</strong> • Katayuan: <span style={{ color: '#DC2626', fontWeight: 700 }}>{activeMedicine.status}</span>
                </div>
              </div>
            )}

            {animalInventoryUsage.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><Package size={24} /></div>
                <h4>Walang gamit o gamot na naitala</h4>
                <p>Kusang maitatala rito ang mga bakuna, gamot, o supplies na ibinawas mula sa imbentaryo para kay {animal.name}.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Petsa (Date)</th>
                      <th>Dami / Yunit</th>
                      <th>Gamot o Gamit</th>
                      <th>Detalye / Tala</th>
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

        {/* 6. FEED TAB (PAKAIN) */}
        {tab === 'feed' && (
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
              <CardTitle icon={Wheat} title="Pakain at Konsumo" />
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/feed')}>
                <Plus size={15} /> Magtala ng Pakain
              </button>
            </div>
            {animalFeed.length === 0 ? (
              <div className="empty-state">
                <div className="es-icon"><Wheat size={24} /></div>
                <h4>Walang talaan ng pakain</h4>
                <p>Magtala ng konsumo sa pagkain upang masubaybayan ang gastos at nutrisyon.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Petsa (Date)</th>
                      <th>Uri ng Pagkain</th>
                      <th>Dami (Quantity)</th>
                      <th>Halaga (Cost)</th>
                    </tr>
                  </thead>
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

        {/* 7. ULAT TAB (WEIGHT HISTORY & ANIMAL SUMMARY REPORTS) */}
        {tab === 'report' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Weight Progression Chart & Full Weight Records (Preserved here without standalone main tab) */}
            <GlassCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
                <CardTitle icon={Scale} title="Kasaysayan ng Timbang (Weight History)" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {animalWeights.length} naitalang timbang
                </span>
              </div>
              {animalWeights.length === 0 ? (
                <div className="empty-state">
                  <div className="es-icon"><Scale size={24} /></div>
                  <h4>Walang talaan ng timbang</h4>
                  <p>Maaaring maglagay ng timbang tuwing nag-e-edit ng hayop o kapag nagtitimbang sa bukid.</p>
                </div>
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
                      <thead>
                        <tr>
                          <th>Petsa</th>
                          <th>Timbang</th>
                          <th>Pagbabago</th>
                          <th>Dagdag bawat Araw</th>
                          <th>Mga Tala</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...animalWeights].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()).map((w) => {
                          return (
                            <tr key={w.id}>
                              <td>{formatDate(w.record_date)}</td>
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

            {/* Summary Statistics of all Records */}
            <GlassCard>
              <CardTitle icon={ClipboardList} title="Buod ng mga Naitala sa Hayop" />
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
                marginBottom: 16,
              }}>
                <div style={{ padding: '14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Health Checks</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginTop: 4 }}>{animalHealth.length}</div>
                </div>
                <div style={{ padding: '14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Talaan ng Timbang</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#238B45', marginTop: 4 }}>{animalWeights.length}</div>
                </div>
                <div style={{ padding: '14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bakuna</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginTop: 4 }}>{animalVaccinations.length}</div>
                </div>
                <div style={{ padding: '14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Nagamit na Gamot</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#DC2626', marginTop: 4 }}>{animalInventoryUsage.length}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={downloadQR} leftIcon={<Download size={15} />}>
                  I-download ang QR Code
                </Button>
                <Button variant="secondary" onClick={printQR} leftIcon={<Printer size={15} />}>
                  I-print ang QR Code
                </Button>
              </div>
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
            <QRCanvas value={`${window.location.origin}/public/${animal.id}`} size={240} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 2px' }}>{animal.name}</p>
              <p style={{ color: 'var(--color-primary, #238B45)', fontSize: 13, fontWeight: 600, margin: 0 }}>{animal.tag_id}</p>
              <p style={{ color: 'var(--color-text-secondary, #64748B)', fontSize: 12, marginTop: 6 }}>I-scan gamit ang cellphone camera upang makita ang hayop</p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setQrOpen(false)}>Isara</Button>
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

      {/* ── Camera Screening Modal (Cleaned result, no technical scores) ── */}
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
              .filter((r) => (r as any).detected_conditions)
              .slice(0, 3)
              .map((r) => (r as any).detected_conditions!)
              .filter(Boolean),
            vaccinationStatus: animal.vaccination_status,
            ageMonths: animal.date_of_birth
              ? Math.floor((Date.now() - new Date(animal.date_of_birth).getTime()) / (30 * 86400000))
              : undefined,
            sex: animal.sex,
            breedingStatus: animal.breeding_status,
          }}
          onClose={() => setCameraScreeningOpen(false)}
          onSaved={() => { refreshScreenings(); farmData.refresh(); setCameraScreeningOpen(false); }}
        />
      )}

      {/* ── Administer Medicine / Inventory Modal ── */}
      <MedicationTreatmentModal
        open={administerModalOpen}
        onClose={() => setAdministerModalOpen(false)}
        preselectedAnimalId={animal.id}
        onSuccess={() => {
          farmData.refresh();
        }}
      />
    </>
  );
}

// ─── Action Button ─────────────────────────────────────────────────────────────
function ActionBtn({ icon, label, onClick, variant }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  variant: 'neutral' | 'green' | 'red';
}) {
  const colors = {
    neutral: { base: 'var(--surface)', border: 'var(--border)', text: 'var(--text-secondary)', hover: 'var(--surface-hover)' },
    green: { base: '#EAF6ED', border: 'rgba(35,139,69,0.35)', text: '#176B35', hover: '#DDF0E2' },
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
