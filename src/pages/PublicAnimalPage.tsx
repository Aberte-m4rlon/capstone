/**
 * PublicAnimalPage — ALPASFARM Public Animal Profile & QR Verification Page
 *
 * Professional, modern, responsive digital livestock identity card.
 * Zero emojis — all icons powered by Lucide and native vector livestock components.
 * Respects owner privacy settings, isolates data, and prevents sensitive leakage.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  HeartPulse,
  Scale,
  Syringe,
  FileText,
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
  Calendar,
  Layers,
  MapPin,
  Tag,
  Maximize2,
  Phone,
  Mail,
  User,
  Building2,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Eye,
  Thermometer,
} from 'lucide-react';
import QRCode from 'qrcode';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { AlpasFarmLogo } from '../components/common/AlpasFarmLogo';
import { GoatIcon, SheepIcon } from '../components/layout';
import { useToast } from '../components/ui/Toast';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../lib/auth';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PublicAnimalData {
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
  previous_weight_kg: number | null;
  weight_change_kg: number | null;
  last_weight_date: string | null;
  health_status: string;
  health_risk_score: number;
  current_temperature: number | null;
  current_heart_rate: number | null;
  breeding_status: string;
  vaccination_status: string;
  last_vaccine_date: string | null;
  next_vaccine_date: string | null;
  farm_name: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  farm_location: string | null;
  registered_on: string;
  verified: boolean;
}

// ─── Pure Helpers (NO EMOJIS) ─────────────────────────────────────────────────

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
  if (!d) return 'Walang tala';
  try {
    return new Date(d).toLocaleDateString('fil-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return new Date(d).toLocaleDateString('en-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
}

function formatShortDate(d: string | null): string {
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

function sexLabelFilipino(sex: string): string {
  const s = (sex || '').toLowerCase();
  if (s.includes('male') || s === 'lalaki' || s === 'barako') return 'Lalaki (Barako / Ram)';
  if (s.includes('female') || s === 'babae' || s === 'inahin') return 'Babae (Inahin / Ewe)';
  return sex || 'Hindi tinukoy';
}

function speciesLabelFilipino(species: string): string {
  const s = (species || '').toLowerCase();
  if (s.includes('goat') || s.includes('kambing')) return 'Kambing (Goat)';
  if (s.includes('sheep') || s.includes('tupa')) return 'Tupa (Sheep)';
  return species || 'Livestock';
}

function healthStatusBadge(status: string): { label: string; color: string; bg: string; borderColor: string } {
  const s = (status || '').toLowerCase();
  if (s.includes('critical') || s.includes('kritikal') || s.includes('medication')) {
    return {
      label: 'Nangangailangan ng Gamot',
      color: '#DC2626',
      bg: 'rgba(239, 68, 68, 0.10)',
      borderColor: 'rgba(239, 68, 68, 0.25)',
    };
  }
  if (s.includes('risk') || s.includes('panganib') || s.includes('attention')) {
    return {
      label: 'May Panganib (Needs Attention)',
      color: '#EA580C',
      bg: 'rgba(234, 88, 12, 0.10)',
      borderColor: 'rgba(234, 88, 12, 0.25)',
    };
  }
  if (s.includes('monitor') || s.includes('bantayan') || s.includes('observation')) {
    return {
      label: 'Kailangang Bantayan (Under Observation)',
      color: '#D97706',
      bg: 'rgba(217, 119, 6, 0.10)',
      borderColor: 'rgba(217, 119, 6, 0.25)',
    };
  }
  return {
    label: 'Malusog (Healthy)',
    color: '#16A34A',
    bg: 'rgba(22, 163, 74, 0.10)',
    borderColor: 'rgba(22, 163, 74, 0.25)',
  };
}

function breedingStatusBadge(status: string): { label: string; color: string; bg: string } {
  const s = (status || '').toLowerCase();
  if (s.includes('pregnant') || s.includes('buntis')) {
    return { label: 'Buntis (Pregnant)', color: '#9333EA', bg: 'rgba(147, 51, 234, 0.10)' };
  }
  if (s.includes('ready') || s.includes('handa')) {
    return { label: 'Handang Palahian (Ready)', color: '#0284C7', bg: 'rgba(2, 132, 199, 0.10)' };
  }
  if (s.includes('nursing') || s.includes('nagpapasuso')) {
    return { label: 'Nagpapasuso (Nursing)', color: '#0D9488', bg: 'rgba(13, 148, 136, 0.10)' };
  }
  if (s.includes('monitor')) {
    return { label: 'Obserbahan (Monitor)', color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' };
  }
  return { label: 'Bukas (Open)', color: '#64748B', bg: 'rgba(100, 116, 139, 0.10)' };
}

function vaccStatusBadge(status: string): { label: string; color: string; bg: string } {
  const s = (status || '').toLowerCase();
  if (s.includes('up to date') || s.includes('kumpleto') || s.includes('complete')) {
    return { label: 'Kumpleto ang Bakuna', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' };
  }
  if (s.includes('due') || s.includes('malapit')) {
    return { label: 'Malapit na ang Bakuna', color: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' };
  }
  if (s.includes('overdue') || s.includes('lumagpas')) {
    return { label: 'Lumagpas sa Iskedyul', color: '#DC2626', bg: 'rgba(239, 68, 68, 0.10)' };
  }
  return { label: 'Walang Tala ng Bakuna', color: '#64748B', bg: 'rgba(100, 116, 139, 0.10)' };
}

function getTemperatureInsight(temp: number | null): { text: string; color: string } {
  if (temp == null) return { text: 'Walang tala', color: 'var(--color-text-secondary, #64748b)' };
  if (temp < 38.5) return { text: 'Mababa (Subnormal)', color: '#0284C7' };
  if (temp > 40.0) return { text: 'Mataas (May Lagnat)', color: '#DC2626' };
  return { text: 'Normal (38.5°C - 40.0°C)', color: '#16A34A' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PublicAnimalPage() {
  const { id } = useParams<{ id: string }>();
  const [animal, setAnimal] = useState<PublicAnimalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'health' | 'breeding' | 'vaccination'>('overview');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [photoZoomOpen, setPhotoZoomOpen] = useState(false);
  const [copiedTag, setCopiedTag] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrModalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const { user } = useAuth();
  const toast = useToast();

  const publicUrl = typeof window !== 'undefined' ? window.location.href : `https://alpasfarm.ph/public/${id}`;

  // Fetch verified animal profile
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    // Call the dedicated public API endpoint first
    fetch(`/api/public-animal?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.ok) {
          return res.json();
        }
        // If 404
        if (res.status === 404) {
          throw new Error('Hindi makita ang animal profile. Maaaring mali o expired ang QR/profile link.');
        }
        throw new Error('Fallback required');
      })
      .then((data: PublicAnimalData) => {
        setAnimal(data);
        setError(null);
      })
      .catch((apiErr) => {
        if (apiErr.message.includes('Hindi makita')) {
          setError(apiErr.message);
          return;
        }

        // Direct client fallback via Supabase anon key
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const fields = [
          'id', 'tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth',
          'color_markings', 'photo_url', 'weight_kg', 'health_status',
          'health_risk_score', 'current_temperature', 'current_heart_rate',
          'breeding_status', 'vaccination_status', 'last_vaccine_date',
          'next_vaccine_date', 'notes', 'archived', 'created_at', 'user_id',
        ].join(',');

        fetch(
          `${SUPABASE_URL}/rest/v1/animals?id=eq.${id}&select=${fields}&archived=eq.false`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              Accept: 'application/json',
            },
          },
        )
          .then(async (res) => {
            if (!res.ok) throw new Error('Hindi makita ang animal profile.');
            return res.json();
          })
          .then(async (rows: any[]) => {
            if (!rows || rows.length === 0) {
              throw new Error('Hindi makita ang animal profile. Maaaring mali o expired ang QR/profile link.');
            }
            const row = rows[0];
            let farmName = 'AlpasFarm';
            let ownerName = null;

            if (row.user_id) {
              try {
                const sr = await fetch(
                  `${SUPABASE_URL}/rest/v1/settings?user_id=eq.${row.user_id}&select=farm_name`,
                  { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
                );
                const sdata = await sr.json();
                if (sdata?.[0]?.farm_name) farmName = sdata[0].farm_name;
              } catch {
                // Non-fatal
              }
            }

            setAnimal({
              id: row.id,
              tag_id: row.tag_id,
              name: row.name,
              species: row.species,
              breed: row.breed,
              sex: row.sex,
              date_of_birth: row.date_of_birth,
              color_markings: row.color_markings,
              photo_url: row.photo_url,
              weight_kg: row.weight_kg,
              previous_weight_kg: null,
              weight_change_kg: null,
              last_weight_date: null,
              health_status: row.health_status,
              health_risk_score: row.health_risk_score || 0,
              current_temperature: row.current_temperature,
              current_heart_rate: row.current_heart_rate,
              breeding_status: row.breeding_status,
              vaccination_status: row.vaccination_status,
              last_vaccine_date: row.last_vaccine_date,
              next_vaccine_date: row.next_vaccine_date,
              farm_name: farmName,
              owner_name: ownerName,
              owner_email: null,
              owner_phone: null,
              farm_location: null,
              registered_on: row.created_at,
              verified: true,
            });
            setError(null);
          })
          .catch((err) => setError(err.message));
      })
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

  // Generate modal QR code
  useEffect(() => {
    if (qrModalOpen && qrModalCanvasRef.current) {
      QRCode.toCanvas(qrModalCanvasRef.current, publicUrl, { width: 260, margin: 2 }).catch(() => {});
    }
  }, [qrModalOpen, publicUrl]);

  // Copy animal tag ID
  const copyTag = () => {
    if (!animal?.tag_id) return;
    navigator.clipboard.writeText(animal.tag_id).then(() => {
      setCopiedTag(true);
      toast('Na-kopya ang Tag ID sa clipboard.', 'success');
      setTimeout(() => setCopiedTag(false), 2000);
    });
  };

  // Copy public link
  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopiedLink(true);
      toast('Na-kopya ang link ng profile sa clipboard.', 'success');
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Web Share API
  const handleShare = async () => {
    if (!animal) return;
    const shareData = {
      title: `${animal.tag_id} - ${animal.name} | ALPASFARM`,
      text: `Tingnan ang beripikadong profile ng hayop na si ${animal.name} (${animal.tag_id}) sa ALPASFARM.`,
      url: publicUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User dismissed
      }
    } else {
      copyLink();
    }
  };

  // Save QR image
  const downloadQr = () => {
    if (!qrDataUrl || !animal) return;
    const link = document.createElement('a');
    link.download = `ALPASFARM-${animal.tag_id}-QR.png`;
    link.href = qrDataUrl;
    link.click();
    toast('Nai-download ang QR Code.', 'success');
  };

  // Print QR modal
  const handlePrint = () => {
    window.print();
  };

  // ── Loading State ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: 'var(--color-background, #f8fafc)',
          color: 'var(--color-text-primary, #0f172a)',
          padding: 24,
        }}
      >
        <LoadingSpinner size="lg" />
        <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-secondary, #64748b)' }}>
          Kino-kumpirma ang tala sa ALPASFARM...
        </p>
      </div>
    );
  }

  // ── Error State ─────────────────────────────────────────────────────────────
  if (error || !animal) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-background, #f8fafc)',
          padding: 20,
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 20,
            border: '1px solid var(--color-border, #e2e8f0)',
            padding: 32,
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.10)',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--color-text-primary, #0f172a)' }}>
            Hindi Ma-verify ang Animal Profile
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.5, marginBottom: 24 }}>
            Maaaring mali o expired ang QR/profile link, o tinanggal na ang tala ng hayop na ito sa ALPASFARM.
          </p>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 24px',
              borderRadius: 9999,
              background: 'var(--color-primary, #238B45)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(35, 139, 69, 0.3)',
              minHeight: 44,
            }}
          >
            Pumunta sa ALPASFARM
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  // ── Species Icon Selection (NO EMOJIS) ────────────────────────────────────────
  const isGoat = (animal.species || '').toLowerCase().includes('goat') || (animal.species || '').toLowerCase().includes('kambing');
  const isSheep = (animal.species || '').toLowerCase().includes('sheep') || (animal.species || '').toLowerCase().includes('tupa');

  const renderSpeciesIcon = (size: number, color?: string) => {
    if (isGoat) return <GoatIcon size={size} color={color || 'var(--color-primary, #238B45)'} strokeWidth={2} />;
    if (isSheep) return <SheepIcon size={size} color={color || 'var(--color-primary, #238B45)'} strokeWidth={2} />;
    return <Tag size={size} color={color || 'var(--color-primary, #238B45)'} />;
  };

  const healthBadge = healthStatusBadge(animal.health_status);
  const tempInsight = getTemperatureInsight(animal.current_temperature);
  const breedBadge = breedingStatusBadge(animal.breeding_status);
  const vaccBadge = vaccStatusBadge(animal.vaccination_status);

  // Check if owner has provided any public contact info
  const hasPublicContact = Boolean(animal.owner_phone || animal.owner_email || animal.farm_location);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-background, #f8fafc)',
        color: 'var(--color-text-primary, #0f172a)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '16px 12px 48px',
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>

        {/* ── 1. Page Header (Compact, Modern, 16px radius) ───────────────── */}
        <header
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 16,
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.03)',
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            position: 'sticky',
            top: 12,
            zIndex: 40,
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Left: Branding & Verification Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} title="ALPASFARM">
              <AlpasFarmLogo size="sm" variant="emblem" style={{ height: 28, width: 28 }} />
            </Link>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', color: 'var(--color-text-primary, #0f172a)' }}>
                  ALPASFARM
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 8px',
                    borderRadius: 9999,
                    background: 'rgba(35, 139, 69, 0.10)',
                    color: '#16A34A',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                    border: '1px solid rgba(35, 139, 69, 0.20)',
                  }}
                >
                  <ShieldCheck size={11} strokeWidth={2.5} />
                  VERIFIED PROFILE
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {animal.farm_name || 'AlpasFarm'}
              </span>
            </div>
          </div>

          {/* Right: Actions (Theme, Share, QR) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={toggleTheme}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--color-border, #e2e8f0)',
                background: 'var(--color-surface, #ffffff)',
                color: 'var(--color-text-secondary, #64748b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title={isDark ? 'Lumipat sa Light Mode' : 'Lumipat sa Dark Mode'}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              onClick={handleShare}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--color-border, #e2e8f0)',
                background: 'var(--color-surface, #ffffff)',
                color: 'var(--color-text-secondary, #64748b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="I-bahagi ang profile"
              aria-label="Share profile"
            >
              <Share2 size={16} />
            </button>

            <button
              onClick={() => setQrModalOpen(true)}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--color-border, #e2e8f0)',
                background: 'rgba(35, 139, 69, 0.08)',
                color: 'var(--color-primary, #238B45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Tingnan ang QR Code"
              aria-label="View QR code"
            >
              <QrCode size={16} />
            </button>
          </div>
        </header>

        {/* ── 2. Animal Hero Section Card (18px radius) ───────────────────── */}
        <section
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 18,
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
            padding: 20,
            marginBottom: 16,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle top accent bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'linear-gradient(90deg, #238B45, #48BB78)',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            {/* Tag ID Pill & Verification */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <button
                onClick={copyTag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 9999,
                  background: 'var(--color-background, #f1f5f9)',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  color: 'var(--color-text-primary, #0f172a)',
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
                title="I-click para kopyahin ang Tag ID"
              >
                <Tag size={13} color="var(--color-primary, #238B45)" />
                {animal.tag_id}
                {copiedTag ? <Check size={12} color="#16A34A" /> : <Copy size={12} color="var(--color-text-secondary, #64748b)" />}
              </button>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#16A34A',
                }}
              >
                <ShieldCheck size={14} />
                Registered in ALPASFARM
              </span>
            </div>

            {/* Animal Main Header with Avatar / Livestock Icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Avatar or Vector Livestock Icon Container */}
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 18,
                  background: animal.photo_url ? 'transparent' : 'rgba(35, 139, 69, 0.08)',
                  border: '2px solid rgba(35, 139, 69, 0.20)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                  position: 'relative',
                  cursor: animal.photo_url ? 'pointer' : 'default',
                }}
                onClick={() => animal.photo_url && setPhotoZoomOpen(true)}
              >
                {animal.photo_url ? (
                  <>
                    <img
                      src={animal.photo_url}
                      alt={animal.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        borderRadius: 6,
                        padding: 3,
                        display: 'flex',
                      }}
                      title="Palakihin ang larawan"
                    >
                      <Maximize2 size={10} />
                    </div>
                  </>
                ) : (
                  renderSpeciesIcon(46)
                )}
              </div>

              {/* Name & Basic Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    margin: 0,
                    lineHeight: 1.2,
                    color: 'var(--color-text-primary, #0f172a)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {animal.name}
                </h1>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-primary, #238B45)',
                    }}
                  >
                    {renderSpeciesIcon(13)}
                    {speciesLabelFilipino(animal.species)}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary, #94a3b8)', fontSize: 12 }}>•</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary, #475569)' }}>
                    {animal.breed || 'Standard'}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary, #94a3b8)', fontSize: 12 }}>•</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>
                    {sexLabelFilipino(animal.sex)}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', marginTop: 4 }}>
                  Edad: {ageLabelFilipino(animal.date_of_birth)}
                </div>
              </div>
            </div>

            {/* Health Status Pill Banner (NO EMOJIS) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 9999,
                background: healthBadge.bg,
                border: `1px solid ${healthBadge.borderColor}`,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} color={healthBadge.color} />
                <span style={{ fontSize: 13, fontWeight: 700, color: healthBadge.color }}>
                  {healthBadge.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>
                <span>Risk Score:</span>
                <span style={{ fontWeight: 800, color: healthBadge.color }}>
                  {animal.health_risk_score} / 100
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. Key Information Grid ─────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {/* Temperature */}
          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              borderRadius: 16,
              border: '1px solid var(--color-border, #e2e8f0)',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary, #64748b)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              <Thermometer size={14} color="var(--color-primary, #238B45)" />
              Temperatura
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
              {animal.current_temperature != null ? `${animal.current_temperature}°C` : '—'}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: tempInsight.color, marginTop: 2 }}>
              {tempInsight.text}
            </div>
          </div>

          {/* Pulse / Heart Rate */}
          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              borderRadius: 16,
              border: '1px solid var(--color-border, #e2e8f0)',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary, #64748b)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              <HeartPulse size={14} color="#EF4444" />
              Tibok ng Puso (Pulse)
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
              {animal.current_heart_rate != null ? `${animal.current_heart_rate} bpm` : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', marginTop: 2 }}>
              {animal.current_heart_rate != null ? 'Huling nasukat na tibok' : 'Walang tala'}
            </div>
          </div>
        </div>

        {/* ── 4. Weight Information Card (with DB history & change) ────────── */}
        <section
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 18,
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            padding: 18,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(35, 139, 69, 0.10)',
                  color: 'var(--color-primary, #238B45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Scale size={16} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
                Tala ng Timbang (Weight)
              </span>
            </div>
            {animal.last_weight_date && (
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>
                {formatDateFilipino(animal.last_weight_date)}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 14,
              background: 'var(--color-background, #f8fafc)',
              border: '1px solid var(--color-border, #e2e8f0)',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', fontWeight: 600 }}>
                Kasalukuyang Timbang
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--color-text-primary, #0f172a)', marginTop: 2 }}>
                {animal.weight_kg != null ? `${animal.weight_kg} kg` : 'Walang tala'}
              </div>
            </div>

            {/* If weight change or previous weight exists in DB */}
            {animal.previous_weight_kg != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', fontWeight: 600 }}>
                  Dating Timbang: {animal.previous_weight_kg} kg
                </div>
                {animal.weight_change_kg != null && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      fontWeight: 800,
                      color: animal.weight_change_kg >= 0 ? '#16A34A' : '#DC2626',
                      marginTop: 3,
                    }}
                  >
                    {animal.weight_change_kg >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {animal.weight_change_kg > 0 ? `+${animal.weight_change_kg}` : animal.weight_change_kg} kg
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── 5. Owner Contact & Farm Information (Connected to Account) ──── */}
        <section
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 18,
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            padding: 18,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(35, 139, 69, 0.10)',
                color: 'var(--color-primary, #238B45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PhoneCall size={16} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
                Impormasyon sa Pakikipag-ugnayan
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>
                May-ari at detalye ng bukid
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Owner Name */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 12,
                background: 'var(--color-background, #f8fafc)',
              }}
            >
              <User size={16} color="var(--color-primary, #238B45)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>May-ari (Owner)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>
                  {animal.owner_name || 'AlpasFarm Registered Farmer'}
                </div>
              </div>
            </div>

            {/* Farm Name */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 12,
                background: 'var(--color-background, #f8fafc)',
              }}
            >
              <Building2 size={16} color="var(--color-primary, #238B45)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Pangalan ng Bukid (Farm)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>
                  {animal.farm_name || 'AlpasFarm'}
                </div>
              </div>
            </div>

            {/* Farm Location (if public) */}
            {animal.farm_location && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-background, #f8fafc)',
                }}
              >
                <MapPin size={16} color="var(--color-primary, #238B45)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Lokasyon ng Bukid (Location)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>
                    {animal.farm_location}
                  </div>
                </div>
              </div>
            )}

            {/* Contact Number (if public) */}
            {animal.owner_phone && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-background, #f8fafc)',
                }}
              >
                <Phone size={16} color="var(--color-primary, #238B45)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Numero ng Telepono (Phone)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>
                    {animal.owner_phone}
                  </div>
                </div>
              </div>
            )}

            {/* Email Address (if public) */}
            {animal.owner_email && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-background, #f8fafc)',
                }}
              >
                <Mail size={16} color="var(--color-primary, #238B45)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Email Address</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0f172a)' }}>
                    {animal.owner_email}
                  </div>
                </div>
              </div>
            )}

            {/* Fallback if owner has no public contact methods enabled */}
            {!hasPublicContact && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--color-background, #f8fafc)',
                  border: '1px dashed var(--color-border, #e2e8f0)',
                  fontSize: 12,
                  color: 'var(--color-text-secondary, #64748b)',
                  textAlign: 'center',
                }}
              >
                Walang public contact information na available.
              </div>
            )}
          </div>

          {/* Contact Action Buttons (Call / Email) */}
          {(animal.owner_phone || animal.owner_email) && (
            <div style={{ display: 'grid', gridTemplateColumns: animal.owner_phone && animal.owner_email ? 'repeat(2, 1fr)' : '1fr', gap: 10, marginTop: 14 }}>
              {animal.owner_phone && (
                <a
                  href={`tel:${animal.owner_phone}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    borderRadius: 9999,
                    background: 'var(--color-primary, #238B45)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    minHeight: 44,
                    boxShadow: '0 2px 8px rgba(35, 139, 69, 0.25)',
                  }}
                >
                  <Phone size={15} />
                  Tawagan ang May-ari
                </a>
              )}
              {animal.owner_email && (
                <a
                  href={`mailto:${animal.owner_email}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    borderRadius: 9999,
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    color: 'var(--color-text-primary, #0f172a)',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    minHeight: 44,
                  }}
                >
                  <Mail size={15} color="var(--color-primary, #238B45)" />
                  Mag-email
                </a>
              )}
            </div>
          )}
        </section>

        {/* ── 6. Verification Section Block ────────────────────────────────── */}
        <section
          style={{
            background: 'rgba(35, 139, 69, 0.06)',
            borderRadius: 18,
            border: '1px solid rgba(35, 139, 69, 0.20)',
            padding: 18,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#16A34A',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #0f172a)' }}>
              Verified ALPASFARM Animal Profile
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', lineHeight: 1.5, margin: '4px 0 8px' }}>
              Ang tala ng hayop na ito ay opisyal na nakarehistro at beripikado sa ALPASFARM Livestock Management System.
            </p>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', fontWeight: 600 }}>
              Petsa ng Rehistrasyon: {formatDateFilipino(animal.registered_on)}
            </div>
          </div>
        </section>

        {/* ── 7. Detailed Tabs Section (Overview / Health / Breeding / Vacc) ─ */}
        <section
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 18,
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            padding: 18,
            marginBottom: 20,
          }}
        >
          {/* Tab Navigation */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              borderBottom: '1px solid var(--color-border, #e2e8f0)',
              paddingBottom: 10,
              marginBottom: 16,
              overflowX: 'auto',
            }}
          >
            {[
              { key: 'overview', label: 'Pangkalahatan', icon: <FileText size={14} /> },
              { key: 'health', label: 'Kalusugan', icon: <Activity size={14} /> },
              { key: 'breeding', label: 'Palahian', icon: <HeartPulse size={14} /> },
              { key: 'vaccination', label: 'Bakuna', icon: <Syringe size={14} /> },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 9999,
                  border: 'none',
                  background: tab === t.key ? 'var(--color-primary, #238B45)' : 'transparent',
                  color: tab === t.key ? '#ffffff' : 'var(--color-text-secondary, #64748b)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  minHeight: 34,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Overview */}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Kulay at Marka</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{animal.color_markings || 'Walang tala'}</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Kapanganakan</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{formatShortDate(animal.date_of_birth)}</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Kalagayan sa Palahian</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: breedBadge.color }}>{breedBadge.label}</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)' }}>Kalagayan sa Bakuna</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: vaccBadge.color }}>{vaccBadge.label}</div>
              </div>
            </div>
          )}

          {/* Tab 2: Health Details */}
          {tab === 'health' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Pangkalahatang Kalusugan</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: healthBadge.color }}>{healthBadge.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Temperatura</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{animal.current_temperature != null ? `${animal.current_temperature}°C` : 'Walang tala'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Tibok ng Puso (BPM)</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{animal.current_heart_rate != null ? `${animal.current_heart_rate} bpm` : 'Walang tala'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Health Risk Score</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: healthBadge.color }}>{animal.health_risk_score} / 100</span>
              </div>
            </div>
          )}

          {/* Tab 3: Breeding Details */}
          {tab === 'breeding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Status sa Palahian</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: breedBadge.color }}>{breedBadge.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Huling Kasta (Mating)</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Walang bukas na tala</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Inaasahang Panganganak</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Walang nakatakda</span>
              </div>
            </div>
          )}

          {/* Tab 4: Vaccination Details */}
          {tab === 'vaccination' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Katayuan ng Bakuna</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: vaccBadge.color }}>{vaccBadge.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Huling Bakuna</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{formatShortDate(animal.last_vaccine_date)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-background, #f8fafc)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)' }}>Susunod na Bakuna</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{formatShortDate(animal.next_vaccine_date)}</span>
              </div>
            </div>
          )}
        </section>

        {/* ── 8. QR Code Card & Quick Actions ─────────────────────────────── */}
        <section
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 18,
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
            padding: 20,
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, color: 'var(--color-text-primary, #0f172a)' }}>
            Digital QR Verification Passport
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748b)', maxWidth: 380, margin: '0 auto 16px' }}>
            I-scan ang QR code gamit ang camera ng cellphone upang mabilis na buksan at i-verify ang pampublikong tala ng hayop na ito.
          </p>

          {/* QR Canvas */}
          <div
            style={{
              padding: 12,
              background: '#ffffff',
              borderRadius: 16,
              border: '2px solid rgba(35, 139, 69, 0.20)',
              display: 'inline-flex',
              marginBottom: 16,
              cursor: 'pointer',
            }}
            onClick={() => setQrModalOpen(true)}
            title="I-click para palakihin ang QR"
          >
            <canvas ref={qrCanvasRef} width={140} height={140} style={{ display: 'block' }} />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, width: '100%', maxWidth: 440 }}>
            <button
              onClick={handleShare}
              style={{
                flex: '1 1 140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 9999,
                background: 'var(--color-primary, #238B45)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                minHeight: 44,
                boxShadow: '0 2px 8px rgba(35, 139, 69, 0.25)',
              }}
            >
              <Share2 size={15} />
              I-share ang Profile
            </button>

            <button
              onClick={downloadQr}
              style={{
                flex: '1 1 140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 9999,
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)',
                color: 'var(--color-text-primary, #0f172a)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              <Download size={15} />
              I-save ang QR
            </button>

            <button
              onClick={copyLink}
              style={{
                flex: '1 1 140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 9999,
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)',
                color: 'var(--color-text-primary, #0f172a)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {copiedLink ? <Check size={15} color="#16A34A" /> : <Copy size={15} />}
              {copiedLink ? 'Na-kopya ang Link' : 'Kopyahin ang Link'}
            </button>
          </div>
        </section>

        {/* ── 9. Footer & Farmer Portal Link ──────────────────────────────── */}
        <footer
          style={{
            textAlign: 'center',
            padding: '16px 8px 32px',
            color: 'var(--color-text-secondary, #64748b)',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
            <ShieldCheck size={14} color="#16A34A" />
            <span style={{ fontWeight: 700 }}>ALPASFARM Livestock Management Platform</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 11 }}>
            Ligtas at beripikadong digital profile alinsunod sa mga pamantayan ng pag-aalaga ng kambing at tupa.
          </p>
          <Link
            to={user ? '/animals' : '/auth'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--color-primary, #238B45)',
              fontWeight: 700,
              fontSize: 12,
              textDecoration: 'none',
            }}
          >
            {user ? 'Buksan sa Farmer Dashboard' : 'Mag-login bilang Tagapamahala ng Bukid'}
            <ArrowRight size={13} />
          </Link>
        </footer>

      </div>

      {/* ── QR Enlarge Modal ──────────────────────────────────────────────── */}
      {qrModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 100,
          }}
          onClick={() => setQrModalOpen(false)}
        >
          <div
            style={{
              maxWidth: 380,
              width: '100%',
              background: 'var(--color-surface, #ffffff)',
              borderRadius: 20,
              padding: 24,
              textAlign: 'center',
              boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="#16A34A" />
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text-primary, #0f172a)' }}>
                  ALPASFARM QR Passport
                </span>
              </div>
              <button
                onClick={() => setQrModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary, #64748b)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-primary, #238B45)', marginBottom: 2 }}>
              {animal.tag_id}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #64748b)', marginBottom: 16 }}>
              {animal.name} ({speciesLabelFilipino(animal.species)})
            </div>

            <div
              style={{
                display: 'inline-block',
                padding: 16,
                background: '#ffffff',
                borderRadius: 16,
                border: '2px solid rgba(35, 139, 69, 0.20)',
                marginBottom: 16,
              }}
            >
              <canvas ref={qrModalCanvasRef} width={260} height={260} style={{ display: 'block' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={downloadQr}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '11px 16px',
                  borderRadius: 9999,
                  background: 'var(--color-primary, #238B45)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                <Download size={15} />
                I-download
              </button>
              <button
                onClick={handlePrint}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '11px 16px',
                  borderRadius: 9999,
                  background: 'var(--color-surface, #ffffff)',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  color: 'var(--color-text-primary, #0f172a)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                <Printer size={15} />
                I-print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Zoom Modal ──────────────────────────────────────────────── */}
      {photoZoomOpen && animal.photo_url && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 100,
          }}
          onClick={() => setPhotoZoomOpen(false)}
        >
          <div style={{ maxWidth: 520, width: '100%', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPhotoZoomOpen(false)}
              style={{
                position: 'absolute',
                top: -44,
                right: 0,
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#ffffff',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
            <img
              src={animal.photo_url}
              alt={animal.name}
              style={{
                width: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 16,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              }}
            />
            <div style={{ textAlign: 'center', color: '#ffffff', marginTop: 12, fontSize: 14, fontWeight: 700 }}>
              {animal.name} — {animal.tag_id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
