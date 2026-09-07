/**
 * PublicAnimalPage — Premium Mobile-First Digital Livestock Passport & Health Record.
 * Accessed via QR code scan at /public/:id (no authentication required).
 * Safe: only exposes non-sensitive animal fields via Supabase anon key.
 * Bilingual (Filipino / English) with full dark and light mode support.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  PawPrint,
  AlertCircle,
  HeartPulse,
  Scale,
  Heart,
  Syringe,
  FileText,
  Sparkles,
  ExternalLink,
  QrCode,
  Share2,
  Copy,
  Check,
  Moon,
  Sun,
  ShieldCheck,
  Activity,
  X,
  Download,
  Printer,
  Info,
  Baby,
  Layers,
  Home,
  Tag,
  Maximize2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { AlpasFarmLogo } from '../components/common/AlpasFarmLogo';
import { useToast } from '../components/ui/Toast';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PublicAnimal {
  id: string;
  tag_id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string;
  date_of_birth: string | null;
  color_markings: string | null;
  photo_url: string | null;
  weight_kg: number | null;
  health_status: string;
  health_risk_score: number;
  current_temperature: number | null;
  current_heart_rate: number | null;
  breeding_status: string;
  last_mating_date: string | null;
  expected_kidding_date: string | null;
  vaccination_status: string;
  last_vaccine_date: string | null;
  next_vaccine_date: string | null;
  notes: string | null;
  farm_name: string | null;
  user_id: string;
  registered_on: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ageLabelFilipino(dob: string | null): string {
  if (!dob) return 'Walang tala ng petsa';
  const birth = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 1) return 'Wala pang 1 buwan (Bisiro)';
  if (months < 12) return `${months} buwan (${months} mo)`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} taon, ${rem} buwan` : `${years} taon`;
}

function formatDateFilipino(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fil-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return new Date(d).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}

function riskColor(score: number): string {
  if (score >= 80) return '#EF4444';
  if (score >= 60) return '#F97316';
  if (score >= 30) return '#F59E0B';
  return '#16A34A';
}

function riskLabelFilipino(score: number): { text: string; sub: string } {
  if (score >= 80) return { text: 'Kritikal (Critical)', sub: 'Agarang panggagamot o tawagan ang beterinaryo' };
  if (score >= 60) return { text: 'Mataas na Panganib (High Risk)', sub: 'Kailangan ng masusing atensyon at isolation' };
  if (score >= 30) return { text: 'Katamtaman (Moderate)', sub: 'Obserbahan ang sigla, kain, at pagdumi' };
  return { text: 'Maayos / Malusog (Low Risk)', sub: 'Normal ang sigla at walang nakitang sakit' };
}

function healthStatusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'Critical':
      return { label: '🔴 Kritikal (Critical)', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
    case 'At Risk':
      return { label: '🟠 May Panganib (At Risk)', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.12)' };
    case 'Monitor':
      return { label: '🟡 Bantayan (Monitor)', color: '#D97706', bg: 'rgba(217, 119, 6, 0.12)' };
    default:
      return { label: '🟢 Malusog (Healthy)', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.12)' };
  }
}

function breedingStatusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'Pregnant':
      return { label: '🤰 Buntis (Pregnant)', color: '#9333EA', bg: 'rgba(147, 51, 234, 0.12)' };
    case 'Ready':
      return { label: '✨ Handang Palahian (Ready)', color: '#0284C7', bg: 'rgba(2, 132, 199, 0.12)' };
    case 'Nursing':
      return { label: '🍼 Nagpapasuso (Nursing)', color: '#0D9488', bg: 'rgba(13, 148, 136, 0.12)' };
    case 'Monitor':
      return { label: '🟡 Obserbahan (Monitor)', color: '#D97706', bg: 'rgba(217, 119, 6, 0.12)' };
    default:
      return { label: '⚪ Bukas / Walang Pahiwatig (Open)', color: '#64748B', bg: 'rgba(100, 116, 139, 0.12)' };
  }
}

function vaccStatusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'Up to Date':
      return { label: '💉 Kumpleto ang Bakuna', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.12)' };
    case 'Due Soon':
      return { label: '⚠️ Malapit na ang Bakuna', color: '#D97706', bg: 'rgba(217, 119, 6, 0.12)' };
    case 'Overdue':
      return { label: '❗ Lumagpas sa Iskedyul', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
    default:
      return { label: '📋 Walang Tala ng Bakuna', color: '#64748B', bg: 'rgba(100, 116, 139, 0.12)' };
  }
}

function getTemperatureInsight(temp: number | null): { text: string; color: string } {
  if (!temp) return { text: 'Walang tala', color: 'var(--color-text-secondary)' };
  if (temp < 38.5) return { text: 'Mababa (Subnormal)', color: '#0284C7' };
  if (temp > 40.0) return { text: 'Mataas (May Lagnat)', color: '#EF4444' };
  return { text: 'Normal (38.5°C - 40.0°C)', color: '#16A34A' };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PublicAnimalPage() {
  const { id } = useParams<{ id: string }>();
  const [animal, setAnimal] = useState<PublicAnimal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'health' | 'breeding' | 'vaccination' | 'passport'>('overview');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [photoZoomOpen, setPhotoZoomOpen] = useState(false);
  const [copiedTag, setCopiedTag] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrModalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const { user } = useAuth();
  const toast = useToast();

  const publicUrl = typeof window !== 'undefined' ? window.location.href : `https://alpasfarm.ph/public/${id}`;

  // Fetch animal data
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const fields = [
      'id', 'tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth',
      'color_markings', 'photo_url', 'weight_kg', 'health_status',
      'health_risk_score', 'current_temperature', 'current_heart_rate',
      'breeding_status', 'last_mating_date', 'expected_kidding_date',
      'vaccination_status', 'last_vaccine_date', 'next_vaccine_date',
      'notes', 'archived', 'created_at', 'user_id',
    ].join(',');

    fetch(
      `${SUPABASE_URL}/rest/v1/animals?id=eq.${id}&select=${fields}&archived=eq.false`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Accept': 'application/json',
        },
      },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error('Hindi ma-load ang tala ng hayop.');
        return res.json();
      })
      .then(async (rows: any[]) => {
        if (!rows || rows.length === 0) throw new Error('Hindi nahanap ang hayop o tinanggal na ang tala nito.');
        const row = rows[0];
        let farmName = 'AlpasFarm Registered';
        if (row.user_id) {
          try {
            const sr = await fetch(
              `${SUPABASE_URL}/rest/v1/settings?user_id=eq.${row.user_id}&select=farm_name`,
              { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
            );
            const sdata = await sr.json();
            if (sdata?.[0]?.farm_name) farmName = sdata[0].farm_name;
          } catch {
            // fallback to default
          }
        }
        setAnimal({ ...row, farm_name: farmName, registered_on: row.created_at });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Generate QR Code data URL for download and canvas
  useEffect(() => {
    if (!animal) return;
    QRCode.toDataURL(publicUrl, { width: 480, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});

    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, publicUrl, { width: 140, margin: 2 }).catch(() => {});
    }
  }, [animal, publicUrl, tab]);

  // Handle QR modal canvas render
  useEffect(() => {
    if (qrModalOpen && qrModalCanvasRef.current) {
      QRCode.toCanvas(qrModalCanvasRef.current, publicUrl, { width: 260, margin: 2 }).catch(() => {});
    }
  }, [qrModalOpen, publicUrl]);

  // Copy Tag ID to clipboard
  const handleCopyTag = () => {
    if (!animal) return;
    navigator.clipboard?.writeText(animal.tag_id);
    setCopiedTag(true);
    toast.success(`Na-kopya ang Tag ID: ${animal.tag_id}`);
    setTimeout(() => setCopiedTag(false), 2200);
  };

  // Share profile
  const handleShare = async () => {
    if (!animal) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${animal.name} (${animal.tag_id}) — AlpasFarm Animal Passport`,
          text: `Tingnan ang digital passport at tala sa kalusugan ni ${animal.name} (${animal.species}) sa AlpasFarm.`,
          url: publicUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    navigator.clipboard?.writeText(publicUrl);
    toast.success('Na-kopya na ang public link sa clipboard!');
  };

  // Download QR Tag image
  const handleDownloadQR = () => {
    if (!qrDataUrl || !animal) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `AlpasFarm-QR-${animal.tag_id}.png`;
    link.click();
    toast.success('Na-download na ang QR Code ng hayop!');
  };

  // ── Loading State ───────────────────────────────────────────────────────────
  if (loading) {
    return <LoadingSpinner fullScreen text="Ikinakarga ang opisyal na tala ng hayop…" />;
  }

  // ── Error State ─────────────────────────────────────────────────────────────
  if (error || !animal) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background, #F7FAF6)',
        padding: '24px 16px',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: 380,
          background: 'var(--color-surface, #FFFFFF)',
          padding: '36px 24px',
          borderRadius: 24,
          border: '1px solid var(--color-border, rgba(35, 139, 69, 0.15))',
          boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0,0,0,0.06))',
        }}>
          <div style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <AlertCircle size={36} color="#EF4444" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)', marginBottom: 8 }}>
            Hindi Nahanap ang Hayop
          </h2>
          <p style={{ color: 'var(--color-text-secondary, #50645A)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            {error ?? 'Maaaring paso na o tinanggal na ang QR code record ng hayop na ito sa database.'}
          </p>
          <Link to="/" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderRadius: 14,
            background: 'var(--color-primary-gradient, linear-gradient(135deg,#238B45,#176B35))',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(35, 139, 69, 0.3)',
          }}>
            <PawPrint size={17} /> Pumunta sa AlpasFarm
          </Link>
        </div>
      </div>
    );
  }

  // Pre-calculated statuses
  const healthBadge = healthStatusBadge(animal.health_status);
  const breedingBadge = breedingStatusBadge(animal.breeding_status);
  const vaccBadge = vaccStatusBadge(animal.vaccination_status);
  const riskInfo = riskLabelFilipino(animal.health_risk_score);
  const tempInsight = getTemperatureInsight(animal.current_temperature);

  // Breeding calculations
  let gestationProgress = 0;
  let daysRemaining = null;
  if (animal.breeding_status === 'Pregnant' && animal.last_mating_date) {
    const matingTime = new Date(animal.last_mating_date).getTime();
    const nowTime = new Date().getTime();
    const elapsedDays = Math.max(0, Math.floor((nowTime - matingTime) / (1000 * 60 * 60 * 24)));
    const totalGestation = animal.species === 'Sheep' ? 147 : 150; // days
    gestationProgress = Math.min(100, Math.round((elapsedDays / totalGestation) * 100));
    daysRemaining = Math.max(0, totalGestation - elapsedDays);
  }

  const isOwner = user && user.id === animal.user_id;

  const TABS = [
    { key: 'overview', label: 'Pangkalahatan', icon: PawPrint, sub: 'Identity' },
    { key: 'health', label: 'Kalusugan', icon: HeartPulse, sub: 'Vitals' },
    { key: 'breeding', label: 'Pagpaparami', icon: Heart, sub: 'Breeding' },
    { key: 'vaccination', label: 'Bakuna', icon: Syringe, sub: 'Vaccines' },
    { key: 'passport', label: 'QR Passport', icon: QrCode, sub: 'Pedigree' },
  ] as const;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--color-background, #F7FAF6)',
      color: 'var(--color-text-primary, #174B2A)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      paddingBottom: 110,
    }}>
      {/* ── TOP UTILITY & NAVIGATION BAR ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--color-surface, rgba(255, 255, 255, 0.88))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: 720,
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="AlpasFarm Home">
            <AlpasFarmLogo size="mobile-header" style={{ maxHeight: 28, width: 'auto' }} />
          </Link>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: 999,
            background: 'var(--color-primary-soft, #EAF6ED)',
            color: 'var(--color-primary-deep, #176B35)',
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            border: '1px solid rgba(35, 139, 69, 0.20)',
          }}>
            <ShieldCheck size={12} color="#238B45" /> Verified Tala
          </span>
        </div>

        {/* Quick Utilities */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.15))',
              background: 'var(--color-surface-elevated, #FFFFFF)',
              color: 'var(--color-text-secondary, #50645A)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title={isDark ? 'Lumipat sa Light Mode' : 'Lumipat sa Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={17} color="#F59E0B" /> : <Moon size={17} />}
          </button>

          {/* Share Button */}
          <button
            onClick={handleShare}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.15))',
              background: 'var(--color-surface-elevated, #FFFFFF)',
              color: 'var(--color-text-secondary, #50645A)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="I-share ang Profile"
            aria-label="Share profile"
          >
            <Share2 size={16} />
          </button>

          {/* QR Passport Modal Trigger */}
          <button
            onClick={() => setQrModalOpen(true)}
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              border: '1px solid var(--color-primary, #238B45)',
              background: 'var(--color-primary-soft, #EAF6ED)',
              color: 'var(--color-primary-deep, #176B35)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
            aria-label="View QR Code"
          >
            <QrCode size={15} color="#238B45" />
            <span>QR Tag</span>
          </button>
        </div>
      </header>

      {/* ── OWNER BANNER (IF AUTHENTICATED) ── */}
      {isOwner && (
        <div style={{
          maxWidth: 720,
          margin: '10px auto 0',
          padding: '0 16px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(35, 139, 69, 0.12), rgba(23, 107, 53, 0.08))',
            border: '1px solid rgba(35, 139, 69, 0.28)',
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color="#238B45" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-primary-dark, #174B2A)' }}>
                Ikaw ang nakatalang may-ari ng hayop na ito.
              </span>
            </div>
            <Link
              to={`/animals/${animal.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 800,
                color: '#FFFFFF',
                background: 'var(--color-primary, #238B45)',
                padding: '6px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              I-manage <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT CONTAINER ── */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px' }}>

        {/* ── HERO PASSPORT BANNER ── */}
        <div style={{
          background: 'var(--color-surface, #FFFFFF)',
          borderRadius: 24,
          border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
          boxShadow: 'var(--shadow-card, 0 8px 30px rgba(23, 107, 53, 0.06))',
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          {/* Hero Top Media / Cover Area */}
          <div style={{
            position: 'relative',
            height: animal.photo_url ? 240 : 160,
            background: animal.species === 'Sheep'
              ? 'linear-gradient(135deg, #1E3A8A 0%, #0369A1 50%, #0284C7 100%)'
              : 'linear-gradient(135deg, #174B2A 0%, #176B35 50%, #238B45 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {/* Background Watermark Pattern */}
            <div style={{
              position: 'absolute',
              right: -20,
              bottom: -20,
              opacity: 0.15,
              pointerEvents: 'none',
              transform: 'rotate(-10deg)',
            }}>
              <Layers size={180} color="#FFFFFF" />
            </div>

            {animal.photo_url ? (
              <>
                <img
                  src={animal.photo_url}
                  alt={animal.name}
                  onClick={() => setPhotoZoomOpen(true)}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    cursor: 'pointer',
                  }}
                />
                <button
                  onClick={() => setPhotoZoomOpen(true)}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    color: '#FFFFFF',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                  aria-label="Enlarge photo"
                >
                  <Maximize2 size={13} /> Palakihin
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#FFFFFF', zIndex: 1, padding: 16 }}>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.20)',
                  backdropFilter: 'blur(10px)',
                  border: '2px solid rgba(255, 255, 255, 0.40)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                  fontSize: 32,
                  fontWeight: 900,
                }}>
                  {animal.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', opacity: 0.9 }}>
                  {animal.species === 'Sheep' ? '🐑 Tupa (Sheep)' : '🐐 Kambing (Goat)'}
                </div>
              </div>
            )}

            {/* Official Ear Tag pill pinned inside hero cover */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(10px)',
              borderRadius: 999,
              padding: '5px 12px',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
            }}>
              <Tag size={12} color="#FCD34D" />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.5px' }}>{animal.tag_id}</span>
              <button
                onClick={handleCopyTag}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copiedTag ? '#4ADE80' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Kopyahin ang Tag ID"
                aria-label="Copy tag ID"
              >
                {copiedTag ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Hero Profile Details */}
          <div style={{ padding: '20px 20px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h1 style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: 'var(--color-text-primary, #174B2A)',
                  margin: '0 0 4px',
                  letterSpacing: '-0.5px',
                  lineHeight: 1.2,
                }}>
                  {animal.name}
                </h1>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: 'var(--color-text-secondary, #50645A)',
                  fontWeight: 600,
                }}>
                  <span>{animal.species === 'Sheep' ? '🐑 Tupa' : '🐐 Kambing'}</span>
                  <span>•</span>
                  <span>{animal.breed ?? 'Katutubo / Native'}</span>
                  <span>•</span>
                  <span>{animal.sex === 'Male' ? 'Lalaki (Barako)' : 'Babae (Inahin)'}</span>
                </div>
              </div>

              {/* Farm Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 12,
                background: 'var(--color-primary-soft, #EAF6ED)',
                border: '1px solid rgba(35, 139, 69, 0.20)',
                color: 'var(--color-primary-deep, #176B35)',
                fontSize: 12,
                fontWeight: 700,
              }}>
                <Home size={14} />
                <span>{animal.farm_name}</span>
              </div>
            </div>

            {/* Quick Status Chips */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: healthBadge.bg,
                color: healthBadge.color,
                border: `1px solid ${healthBadge.color}33`,
              }}>
                <HeartPulse size={13} /> {healthBadge.label}
              </span>

              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: breedingBadge.bg,
                color: breedingBadge.color,
                border: `1px solid ${breedingBadge.color}33`,
              }}>
                <Heart size={13} /> {breedingBadge.label}
              </span>

              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: vaccBadge.bg,
                color: vaccBadge.color,
                border: `1px solid ${vaccBadge.color}33`,
              }}>
                <Syringe size={13} /> {vaccBadge.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── QUICK VITALS & METRICS HIGHLIGHTS (NO "ULO") ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}>
          {/* 1. Timbang (Weight) */}
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            padding: '16px 14px',
            borderRadius: 20,
            border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
            boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary, #50645A)' }}>
                Timbang (Weight)
              </span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'rgba(35, 139, 69, 0.12)',
                color: '#238B45',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Scale size={16} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-text-primary, #174B2A)', lineHeight: 1.1 }}>
                {animal.weight_kg ? `${animal.weight_kg} kg` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted, #78877F)', marginTop: 4, fontWeight: 600 }}>
                Huling naitalang timbang
              </div>
            </div>
          </div>

          {/* 2. Temperatura (Temperature) */}
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            padding: '16px 14px',
            borderRadius: 20,
            border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
            boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary, #50645A)' }}>
                Temperatura
              </span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.10)',
                color: tempInsight.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <HeartPulse size={16} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: tempInsight.color, lineHeight: 1.1 }}>
                {animal.current_temperature ? `${animal.current_temperature}°C` : '—'}
              </div>
              <div style={{ fontSize: 11, color: tempInsight.color, marginTop: 4, fontWeight: 700 }}>
                {tempInsight.text}
              </div>
            </div>
          </div>

          {/* 3. Bilis ng Puso (Heart Rate) */}
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            padding: '16px 14px',
            borderRadius: 20,
            border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
            boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary, #50645A)' }}>
                Pintig ng Puso
              </span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'rgba(2, 132, 199, 0.12)',
                color: '#0284C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Activity size={16} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-text-primary, #174B2A)', lineHeight: 1.1 }}>
                {animal.current_heart_rate ? `${animal.current_heart_rate} bpm` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted, #78877F)', marginTop: 4, fontWeight: 600 }}>
                {animal.current_heart_rate ? 'Normal: 70-90 bpm' : 'Walang tala ng BPM'}
              </div>
            </div>
          </div>

          {/* 4. Health Risk Score (0-100) */}
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            padding: '16px 14px',
            borderRadius: 20,
            border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
            boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary, #50645A)' }}>
                Risk Score
              </span>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: `${riskColor(animal.health_risk_score)}18`,
                color: riskColor(animal.health_risk_score),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ShieldCheck size={16} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: riskColor(animal.health_risk_score), lineHeight: 1.1 }}>
                  {animal.health_risk_score}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted, #78877F)', fontWeight: 700 }}>/ 100</span>
              </div>
              <div style={{ fontSize: 11, color: riskColor(animal.health_risk_score), marginTop: 4, fontWeight: 800 }}>
                {animal.health_risk_score < 30 ? 'Mababa (Malusog)' : animal.health_risk_score < 60 ? 'Katamtaman' : 'Mataas na Panganib'}
              </div>
            </div>
          </div>
        </div>

        {/* ── GESTATION PROGRESS (IF PREGNANT) ── */}
        {animal.breeding_status === 'Pregnant' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.08), rgba(126, 34, 206, 0.04))',
            border: '1px solid rgba(147, 51, 234, 0.25)',
            borderRadius: 20,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Heart size={16} color="#9333EA" />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#9333EA' }}>
                  Pagbubuntis (Gestation Progress)
                </span>
              </div>
              {daysRemaining !== null && (
                <span style={{ fontSize: 11, fontWeight: 800, color: '#9333EA', background: 'rgba(147, 51, 234, 0.15)', padding: '2px 8px', borderRadius: 999 }}>
                  {daysRemaining} araw na lang
                </span>
              )}
            </div>

            <div style={{
              width: '100%',
              height: 10,
              background: 'rgba(147, 51, 234, 0.15)',
              borderRadius: 999,
              overflow: 'hidden',
              margin: '8px 0',
            }}>
              <div style={{
                width: `${gestationProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #A855F7, #9333EA)',
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--color-text-secondary, #50645A)', marginTop: 4 }}>
              <span>Kasta: {formatDateFilipino(animal.last_mating_date)}</span>
              <span>Inaasahang Panganganak: {formatDateFilipino(animal.expected_kidding_date)}</span>
            </div>
          </div>
        )}

        {/* ── SEGMENTED NAVIGATION TABS ── */}
        <div style={{
          display: 'flex',
          gap: 6,
          background: 'var(--color-surface, #FFFFFF)',
          padding: 6,
          borderRadius: 18,
          border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
          boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))',
          marginBottom: 16,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: '1 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '9px 12px',
                  borderRadius: 12,
                  border: 'none',
                  background: active ? 'var(--color-primary-gradient, linear-gradient(135deg,#238B45,#176B35))' : 'transparent',
                  color: active ? '#FFFFFF' : 'var(--color-text-secondary, #50645A)',
                  cursor: 'pointer',
                  fontWeight: active ? 800 : 600,
                  fontSize: 12.5,
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: PANGKALAHATAN (OVERVIEW & IDENTITY) ── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Identity Details Card */}
            <div style={{
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: 22,
              padding: '20px 18px',
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
              boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0,0,0,0.04))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <PawPrint size={18} color="#238B45" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)' }}>
                  Opisyal na Pagkakakilanlan (Identity)
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <DetailRow label="Pangalan ng Hayop" value={animal.name} bold />
                <DetailRow
                  label="Ear Tag ID"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#176B35' }}>
                      {animal.tag_id}
                      <button
                        onClick={handleCopyTag}
                        style={{ background: 'none', border: 'none', color: '#238B45', cursor: 'pointer', padding: 0 }}
                        title="Kopyahin"
                      >
                        {copiedTag ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                      </button>
                    </span>
                  }
                />
                <DetailRow label="Uri ng Hayop (Species)" value={animal.species === 'Sheep' ? '🐑 Tupa (Sheep)' : '🐐 Kambing (Goat)'} />
                <DetailRow label="Lahi (Breed)" value={animal.breed ?? 'Katutubo / Hindi natukoy'} />
                <DetailRow label="Kasarian (Sex)" value={animal.sex === 'Male' ? 'Lalaki (Barako / Buck)' : 'Babae (Inahin / Doe)'} />
                <DetailRow label="Edad (Age)" value={ageLabelFilipino(animal.date_of_birth)} />
                <DetailRow label="Petsa ng Kapanganakan" value={formatDateFilipino(animal.date_of_birth)} />
                <DetailRow label="Kulay at Marka (Markings)" value={animal.color_markings ?? 'Walang nakatalang natatanging marka'} />
                <DetailRow label="Petsa ng Pagkarehistro" value={formatDateFilipino(animal.registered_on)} />
                <DetailRow label="Rehistradong Sakahan" value={animal.farm_name ?? 'AlpasFarm'} bold />
              </div>
            </div>

            {/* Notes / Tagapangalaga Observation */}
            {animal.notes && (
              <div style={{
                background: 'var(--color-surface, #FFFFFF)',
                borderRadius: 20,
                padding: '18px 18px',
                border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <FileText size={16} color="var(--color-text-secondary, #50645A)" />
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)' }}>
                    Tala ng Tagapag-alaga (Notes)
                  </span>
                </div>
                <p style={{
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: 'var(--color-text-secondary, #50645A)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}>
                  {animal.notes}
                </p>
              </div>
            )}

            {/* Verification Disclaimer */}
            <div style={{
              background: 'var(--color-warning-bg, rgba(245, 158, 11, 0.10))',
              border: '1px solid var(--color-warning, rgba(245, 158, 11, 0.25))',
              borderRadius: 16,
              padding: '12px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
              <Info size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #50645A)', margin: 0, lineHeight: 1.5 }}>
                <strong>Paalala sa Publiko:</strong> Ang talaang ito ay opisyal na pinapamahalaan ng may-ari ng sakahan sa pamamagitan ng AlpasFarm Livestock Management. Sumangguni sa rehistradong beterinaryo para sa pormal na sertipikasyon ng kalusugan.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB 2: KALUSUGAN (HEALTH & VITALS) ── */}
        {tab === 'health' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Risk Assessment Card */}
            <div style={{
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: 22,
              padding: '20px 18px',
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
              boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0,0,0,0.04))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <HeartPulse size={18} color={riskColor(animal.health_risk_score)} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)' }}>
                  Pagsusuri sa Kalusugan (Health Assessment)
                </h3>
              </div>

              {/* Score Dial & Explanation */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '16px',
                borderRadius: 16,
                background: 'var(--color-background, #F7FAF6)',
                border: '1px solid var(--color-border, rgba(35, 139, 69, 0.10))',
                marginBottom: 16,
              }}>
                <div style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: riskColor(animal.health_risk_score),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  color: '#FFFFFF',
                  boxShadow: `0 4px 16px ${riskColor(animal.health_risk_score)}44`,
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{animal.health_risk_score}</span>
                  <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 700 }}>/ 100</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: riskColor(animal.health_risk_score) }}>
                    {riskInfo.text}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #50645A)', marginTop: 4, lineHeight: 1.4 }}>
                    {riskInfo.sub}
                  </div>
                </div>
              </div>

              {/* Vitals Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <DetailRow label="Pangkalahatang Katayuan" value={healthBadge.label} bold />
                <DetailRow
                  label="Temperatura ng Katawan"
                  value={animal.current_temperature ? `${animal.current_temperature}°C (${tempInsight.text})` : 'Walang tala'}
                />
                <DetailRow
                  label="Tibok ng Puso (Heart Rate)"
                  value={animal.current_heart_rate ? `${animal.current_heart_rate} bpm` : 'Walang tala'}
                />
                <DetailRow
                  label="Kasalukuyang Timbang"
                  value={animal.weight_kg ? `${animal.weight_kg} kg` : 'Walang tala'}
                />
              </div>
            </div>

            {/* Medical Disclaimer */}
            <div style={{
              background: 'var(--color-primary-soft, #EAF6ED)',
              border: '1px solid rgba(35, 139, 69, 0.25)',
              borderRadius: 16,
              padding: '14px 16px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
              <ShieldCheck size={18} color="#238B45" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12.5, color: 'var(--color-text-primary, #174B2A)', margin: 0, lineHeight: 1.5 }}>
                <strong>Paalala ng AlpasFarm:</strong> Ang mga pagsusuring ito ay batay sa pinakahuling talaan ng bukid at non-diagnostic early illness screening. Kumonsulta palagi sa lisensyadong beterinaryo para sa reseta at pagpapagamot.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB 3: PAGPAPARAMI (BREEDING) ── */}
        {tab === 'breeding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: 22,
              padding: '20px 18px',
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
              boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0,0,0,0.04))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Heart size={18} color="#9333EA" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)' }}>
                  Katayuan sa Pagpaparami (Reproduction & Breeding)
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <DetailRow label="Kasalukuyang Katayuan" value={breedingBadge.label} bold />
                <DetailRow label="Huling Petsa ng Pagpapakasta" value={formatDateFilipino(animal.last_mating_date)} />
                <DetailRow label="Inaasahang Petsa ng Panganganak" value={formatDateFilipino(animal.expected_kidding_date)} />
                {daysRemaining !== null && (
                  <DetailRow
                    label="Natitirang Araw Bago Manganak"
                    value={<span style={{ color: '#9333EA', fontWeight: 800 }}>{daysRemaining} araw</span>}
                  />
                )}
                <DetailRow label="Klasipikasyon" value={animal.sex === 'Female' ? 'Inahin (Breeding Female)' : 'Barako (Breeding Male)'} />
              </div>
            </div>

            {/* Educational Breeding Box */}
            <div style={{
              background: 'var(--color-background, #F7FAF6)',
              borderRadius: 18,
              padding: '14px 16px',
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Baby size={15} color="#238B45" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #174B2A)' }}>
                  Karagdagang Gabay sa Pagpaparami
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #50645A)', margin: 0, lineHeight: 1.5 }}>
                Ang karaniwang tagal ng pagbubuntis ng kambing at tupa ay humigit-kumulang 147 hanggang 150 araw (humigit-kumulang 5 buwan). Siguraduhing may sapat na nutrisyon at malinis na koral ang inahin bago manganak.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB 4: BAKUNA AT GAMUTAN (VACCINATION & PREVENTIVE CARE) ── */}
        {tab === 'vaccination' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: 22,
              padding: '20px 18px',
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
              boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0,0,0,0.04))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Syringe size={18} color="#238B45" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)' }}>
                  Iskedyul ng Bakuna at Pampurga
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <DetailRow label="Katayuan ng Bakuna" value={vaccBadge.label} bold />
                <DetailRow label="Huling Petsa ng Bakuna" value={formatDateFilipino(animal.last_vaccine_date)} />
                <DetailRow label="Susunod na Iskedyul" value={formatDateFilipino(animal.next_vaccine_date)} />
              </div>
            </div>

            {/* Deworming and Prevention Advisory */}
            <div style={{
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: 20,
              padding: '16px 18px',
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
            }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 800, color: 'var(--color-text-primary, #174B2A)' }}>
                Mahahalagang Bakuna sa Pilipinas
              </h4>
              <ul style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12.5,
                color: 'var(--color-text-secondary, #50645A)',
                lineHeight: 1.6,
              }}>
                <li>Hemorrhagic Septicemia (Hemosep) — kada 6 hanggang 12 buwan.</li>
                <li>Clostridial Diseases (Enterotoxemia / Pulpy Kidney) — taunan.</li>
                <li>Regular na pampurga (Deworming) batay sa FAMACHA eye screening.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── TAB 5: DIGITAL QR PASSPORT & CERTIFICATE ── */}
        {tab === 'passport' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Printable Ear Tag Certificate Card */}
            <div style={{
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: 24,
              padding: '24px 20px',
              border: '2px dashed var(--color-border, rgba(35, 139, 69, 0.25))',
              boxShadow: 'var(--shadow-card, 0 8px 30px rgba(0,0,0,0.04))',
              textAlign: 'center',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 999,
                background: 'var(--color-primary-soft, #EAF6ED)',
                color: 'var(--color-primary-deep, #176B35)',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: 16,
              }}>
                <ShieldCheck size={14} color="#238B45" /> Opisyal na Ear Tag QR Code
              </div>

              {/* QR Canvas */}
              <div style={{
                display: 'inline-block',
                padding: 12,
                borderRadius: 18,
                background: '#FFFFFF',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                border: '1px solid rgba(0,0,0,0.06)',
                marginBottom: 16,
              }}>
                <canvas ref={qrCanvasRef} style={{ display: 'block', borderRadius: 8 }} />
              </div>

              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-text-primary, #174B2A)', marginBottom: 2 }}>
                {animal.name}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#176B35', letterSpacing: '0.5px' }}>
                TAG: {animal.tag_id}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #50645A)', marginTop: 4 }}>
                {animal.species} · {animal.breed ?? 'Native'} · {animal.farm_name}
              </div>

              {/* Action Buttons for QR */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                marginTop: 20,
                flexWrap: 'wrap',
              }}>
                <button
                  onClick={handleDownloadQR}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 18px',
                    borderRadius: 12,
                    background: 'var(--color-primary-gradient, linear-gradient(135deg,#238B45,#176B35))',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(35, 139, 69, 0.25)',
                  }}
                >
                  <Download size={15} /> I-download ang Larawan
                </button>

                <button
                  onClick={() => setQrModalOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 18px',
                    borderRadius: 12,
                    background: 'var(--color-surface-elevated, #FFFFFF)',
                    color: 'var(--color-text-primary, #174B2A)',
                    border: '1px solid var(--color-border, rgba(35, 139, 69, 0.20))',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <QrCode size={15} /> Palakihin ang QR
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── STICKY BOTTOM ACTION BAR ── */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'var(--color-surface, rgba(255, 255, 255, 0.92))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-border, rgba(35, 139, 69, 0.12))',
        padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      }}>
        <div style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {/* Share Profile */}
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.20))',
              background: 'var(--color-surface-elevated, #FFFFFF)',
              color: 'var(--color-text-primary, #174B2A)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <Share2 size={16} color="#238B45" />
            <span>I-share ang Profile</span>
          </button>

          {/* Download QR Tag */}
          <button
            onClick={handleDownloadQR}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '12px 14px',
              borderRadius: 14,
              border: 'none',
              background: 'var(--color-primary-gradient, linear-gradient(135deg,#238B45,#176B35))',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(35, 139, 69, 0.30)',
            }}
          >
            <Download size={16} />
            <span>I-save ang QR</span>
          </button>

          {/* Home or Manage link */}
          <Link
            to={isOwner ? `/animals/${animal.id}` : '/'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              borderRadius: 14,
              border: '1px solid var(--color-border, rgba(35, 139, 69, 0.15))',
              background: 'var(--color-surface-elevated, #FFFFFF)',
              color: 'var(--color-text-secondary, #50645A)',
              textDecoration: 'none',
            }}
            title={isOwner ? 'I-manage ang Hayop' : 'AlpasFarm Home'}
            aria-label="AlpasFarm Home or Manage"
          >
            {isOwner ? <ExternalLink size={18} color="#238B45" /> : <Home size={18} />}
          </Link>
        </div>
      </footer>

      {/* ── MODAL: HIGH-RES QR CODE PASSPORT ── */}
      {qrModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            borderRadius: 28,
            padding: '24px 20px',
            maxWidth: 380,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            position: 'relative',
          }}>
            <button
              onClick={() => setQrModalOpen(false)}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: 'var(--color-background, #F3F4F6)',
                color: 'var(--color-text-secondary, #50645A)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Isara ang modal"
            >
              <X size={18} />
            </button>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'var(--color-primary-soft, #EAF6ED)',
              color: 'var(--color-primary-deep, #176B35)',
              marginBottom: 12,
            }}>
              <ShieldCheck size={14} color="#238B45" /> Opisyal na AlpasFarm QR
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 900, color: 'var(--color-text-primary, #174B2A)', margin: '0 0 4px' }}>
              {animal.name}
            </h3>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#176B35', marginBottom: 16 }}>
              TAG: {animal.tag_id}
            </div>

            <div style={{
              display: 'inline-block',
              padding: 12,
              borderRadius: 20,
              background: '#FFFFFF',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              border: '1px solid rgba(0,0,0,0.08)',
              marginBottom: 16,
            }}>
              <canvas ref={qrModalCanvasRef} style={{ display: 'block', borderRadius: 8 }} />
            </div>

            <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #50645A)', margin: '0 0 18px', lineHeight: 1.5 }}>
              I-scan ang QR code gamit ang camera ng cellphone para makita ang live record ng hayop na ito.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleDownloadQR}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '11px',
                  borderRadius: 12,
                  background: 'var(--color-primary-gradient, linear-gradient(135deg,#238B45,#176B35))',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Download size={15} /> I-save ang QR
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--color-border, rgba(35, 139, 69, 0.20))',
                  background: 'var(--color-surface-elevated, #FFFFFF)',
                  color: 'var(--color-text-primary, #174B2A)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Printer size={15} /> I-print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PHOTO LIGHTBOX ZOOM ── */}
      {photoZoomOpen && animal.photo_url && (
        <div
          onClick={() => setPhotoZoomOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 220,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setPhotoZoomOpen(false)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="Isara ang larawan"
          >
            <X size={22} />
          </button>
          <img
            src={animal.photo_url}
            alt={animal.name}
            style={{
              maxWidth: '100%',
              maxHeight: '90vh',
              borderRadius: 16,
              objectFit: 'contain',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Helper Row Component ─────────────────────────────────────────────────────
function DetailRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '8px 0',
      borderBottom: '1px solid var(--color-border-light, rgba(35, 139, 69, 0.07))',
      gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--color-text-secondary, #50645A)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontWeight: bold ? 800 : 600,
        color: 'var(--color-text-primary, #174B2A)',
        textAlign: 'right',
        wordBreak: 'break-word',
      }}>
        {value}
      </span>
    </div>
  );
}
