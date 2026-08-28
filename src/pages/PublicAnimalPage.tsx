/**
 * PublicAnimalPage — Mobile-first read-only animal profile.
 * Accessed via QR code scan at /public/:id (no auth required).
 * Supports both light and dark themes, respects system preference.
 * Safe: only exposes non-sensitive animal fields via anon key.
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PawPrint, AlertCircle, HeartPulse, Scale, Heart, Syringe, FileText, ArrowLeft, Sparkles, ExternalLink } from 'lucide-react';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

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
function ageLabel(dob: string | null): string {
  if (!dob) return 'Unknown';
  const birth = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 1) return 'Less than a month';
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years !== 1 ? 's' : ''}`;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function riskColor(score: number): string {
  if (score >= 80) return '#EF4444';
  if (score >= 60) return '#F97316';
  if (score >= 30) return '#F59E0B';
  return '#16A34A';
}

function riskLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High Risk';
  if (score >= 30) return 'Moderate';
  return 'Low Risk';
}

function healthStatusColor(status: string): string {
  if (status === 'Critical') return '#EF4444';
  if (status === 'At Risk') return '#F97316';
  if (status === 'Monitor') return '#3B82F6';
  return '#16A34A';
}

function vaccColor(status: string): string {
  if (status === 'Overdue') return '#EF4444';
  if (status === 'Due Soon') return '#F59E0B';
  if (status === 'Up to Date') return '#FF7A18';
  return '#9CA3AF';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PublicAnimalPage() {
  const { id } = useParams<{ id: string }>();
  const [animal, setAnimal] = useState<PublicAnimal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'health' | 'breeding'>('overview');

  // Detect system dark mode preference
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  // Also check AlpasFarm's saved theme
  const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

  // Theme tokens
  const T = {
    bg: isDark ? '#0D1B2A' : '#F5F7FA',
    card: isDark ? '#132135' : '#FFFFFF',
    border: isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB',
    text: isDark ? '#F1F5F9' : '#1F2937',
    textSec: isDark ? '#94A3B8' : '#6B7280',
    nav: isDark ? 'rgba(13,27,42,0.96)' : 'rgba(255,255,255,0.96)',
    tabActive: '#FF7A18',
    divider: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6',
    headerBg: isDark ? '#0F1E2F' : '#FFFFFF',
    warning: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7',
    warningBorder: isDark ? 'rgba(245,158,11,0.35)' : '#FCD34D',
    warningText: isDark ? '#FCD34D' : '#92400E',
    info: isDark ? 'rgba(59,130,246,0.12)' : '#EFF6FF',
    infoBorder: isDark ? 'rgba(59,130,246,0.30)' : '#BFDBFE',
    infoText: isDark ? '#93C5FD' : '#1E40AF',
  };

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
        if (!res.ok) throw new Error('Failed to load animal data');
        return res.json();
      })
      .then(async (rows: any[]) => {
        if (!rows || rows.length === 0) throw new Error('Animal not found or has been removed.');
        const row = rows[0];
        let farmName = 'AlpasFarm';
        if (row.user_id) {
          try {
            const sr = await fetch(
              `${SUPABASE_URL}/rest/v1/settings?user_id=eq.${row.user_id}&select=farm_name`,
              { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
            );
            const sdata = await sr.json();
            if (sdata?.[0]?.farm_name) farmName = sdata[0].farm_name;
          } catch { /* use default */ }
        }
        setAnimal({ ...row, farm_name: farmName, registered_on: row.created_at });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <LoadingSpinner fullScreen text="Loading animal profile…" />;
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !animal) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: '20px 16px' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <AlertCircle size={52} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 8 }}>Animal Not Found</h2>
          <p style={{ color: T.textSec, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            {error ?? 'This QR code may be invalid or the animal record was removed.'}
          </p>
          <Link to="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '11px 22px', borderRadius: 10, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
            color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}>
            <PawPrint size={15} /> Go to AlpasFarm
          </Link>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'overview', label: 'Overview', icon: PawPrint },
    { key: 'health', label: 'Health', icon: HeartPulse },
    { key: 'breeding', label: 'Breeding', icon: Heart },
  ] as const;

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 520, margin: '0 auto' }}>

      {/* ── Sticky Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: T.nav, backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PawPrint size={16} color="#fff" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FF7A18' }}>AlpasFarm</span>
        </Link>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
          background: 'rgba(255,122,24,0.15)', color: '#FF7A18', letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>
          QR View
        </span>
      </nav>

      {/* ── Animal Header Card ── */}
      <div style={{ background: T.headerBg, borderBottom: `1px solid ${T.border}`, padding: '18px 16px 0' }}>

        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {animal.photo_url ? (
            <img src={animal.photo_url} alt={animal.name}
              style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: `2px solid ${T.border}` }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(255,59,48,0.20), rgba(255,122,24,0.15))',
              border: `2px solid rgba(255,122,24,0.30)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 900, color: '#FF7A18', flexShrink: 0,
            }}>
              {animal.name[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: 0, lineHeight: 1.1 }}>{animal.name}</h1>
            <p style={{ fontSize: 12, color: T.textSec, margin: '4px 0 0', lineHeight: 1.4 }}>
              {animal.tag_id} · {animal.species}{animal.breed ? ` · ${animal.breed}` : ''} · {animal.sex}
            </p>
            <p style={{ fontSize: 12, color: T.textSec, margin: '2px 0 0' }}>Age: {ageLabel(animal.date_of_birth)}</p>
          </div>
        </div>

        {/* Status badges row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: `${healthStatusColor(animal.health_status)}18`,
            border: `1px solid ${healthStatusColor(animal.health_status)}44`,
            color: healthStatusColor(animal.health_status),
          }}>
            <HeartPulse size={11} /> {animal.health_status}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: `${vaccColor(animal.vaccination_status)}18`,
            border: `1px solid ${vaccColor(animal.vaccination_status)}44`,
            color: vaccColor(animal.vaccination_status),
          }}>
            <Syringe size={11} /> {animal.vaccination_status}
          </span>
          {animal.farm_name && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,122,24,0.10)', border: '1px solid rgba(255,122,24,0.25)',
              color: '#FF7A18',
            }}>
              <PawPrint size={11} /> {animal.farm_name}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 14px', fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? T.tabActive : T.textSec,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? `2px solid ${T.tabActive}` : '2px solid transparent',
              whiteSpace: 'nowrap', transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
          <style>{`div::-webkit-scrollbar{display:none}`}</style>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '14px 14px 100px' }}>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Quick stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Weight', value: animal.weight_kg ? `${animal.weight_kg}kg` : '—', icon: Scale, color: '#3B82F6' },
                { label: 'Temp', value: animal.current_temperature ? `${animal.current_temperature}°C` : '—', icon: HeartPulse, color: riskColor(animal.health_risk_score) },
                { label: 'HR', value: animal.current_heart_rate ? `${animal.current_heart_rate}bpm` : '—', icon: Heart, color: '#EC4899' },
              ].map((s) => (
                <div key={s.label} style={{ background: T.card, borderRadius: 14, padding: '12px 10px', border: `1px solid ${T.border}`, textAlign: 'center' }}>
                  <s.icon size={18} color={s.color} style={{ margin: '0 auto 5px' }} />
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Health Risk */}
            <div style={{ background: T.card, borderRadius: 16, padding: '14px 16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <HeartPulse size={15} color={riskColor(animal.health_risk_score)} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Health Risk</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
                  background: `conic-gradient(${riskColor(animal.health_risk_score)} ${animal.health_risk_score * 3.6}deg, ${isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6'} 0deg)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', inset: 5, borderRadius: '50%', background: T.card,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column',
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: riskColor(animal.health_risk_score), lineHeight: 1 }}>{animal.health_risk_score}</span>
                    <span style={{ fontSize: 8, color: T.textSec }}>/ 100</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: riskColor(animal.health_risk_score) }}>{riskLabel(animal.health_risk_score)}</div>
                  <div style={{ fontSize: 12, color: T.textSec, marginTop: 3 }}>
                    {animal.health_risk_score < 30 ? 'Animal appears healthy' : animal.health_risk_score < 60 ? 'Monitor closely' : 'Veterinary attention recommended'}
                  </div>
                </div>
              </div>
            </div>

            {/* Identity card */}
            <div style={{ background: T.card, borderRadius: 16, padding: '14px 16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <PawPrint size={15} color="#FF7A18" />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Identity</span>
              </div>
              <Row label="Species" value={animal.species} T={T} />
              <Row label="Breed" value={animal.breed ?? 'Unknown'} T={T} />
              <Row label="Sex" value={animal.sex} T={T} />
              <Row label="Age" value={ageLabel(animal.date_of_birth)} T={T} />
              <Row label="Tag ID" value={animal.tag_id} T={T} bold />
              {animal.color_markings && <Row label="Markings" value={animal.color_markings} T={T} />}
            </div>

            {/* Notes */}
            {animal.notes && (
              <div style={{ background: T.card, borderRadius: 16, padding: '14px 16px', border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <FileText size={15} color={T.textSec} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Notes</span>
                </div>
                <p style={{ fontSize: 13, color: T.textSec, margin: 0, lineHeight: 1.6 }}>{animal.notes}</p>
              </div>
            )}

            {/* Vet disclaimer */}
            <div style={{ background: T.warning, border: `1px solid ${T.warningBorder}`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 12, color: T.warningText, margin: 0, lineHeight: 1.5 }}>
                [Paalala] Health data shown here is for reference only. Always consult a licensed veterinarian (beterinaryo) for medical decisions.
              </p>
            </div>
          </div>
        )}

        {/* HEALTH */}
        {tab === 'health' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: T.card, borderRadius: 16, padding: '16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <HeartPulse size={15} color={riskColor(animal.health_risk_score)} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Current Health</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, padding: '12px', background: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB', borderRadius: 12 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                  background: riskColor(animal.health_risk_score),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: '#fff',
                  boxShadow: `0 6px 20px ${riskColor(animal.health_risk_score)}44`,
                }}>
                  {animal.health_risk_score}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: riskColor(animal.health_risk_score) }}>{riskLabel(animal.health_risk_score)}</div>
                  <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>Health Risk Score (0–100)</div>
                </div>
              </div>
              <Row label="Health Status" value={animal.health_status} T={T} bold />
              <Row label="Temperature" value={animal.current_temperature ? `${animal.current_temperature}°C` : 'Not recorded'} T={T} />
              <Row label="Heart Rate" value={animal.current_heart_rate ? `${animal.current_heart_rate} BPM` : 'Not recorded'} T={T} />
            </div>

            <div style={{ background: T.warning, border: `1px solid ${T.warningBorder}`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 12, color: T.warningText, margin: 0, lineHeight: 1.5 }}>
                [Paalala] These values reflect the last recorded health check. They do not replace a professional veterinary examination.
              </p>
            </div>

            <div style={{ background: T.info, border: `1px solid ${T.infoBorder}`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 12, color: T.infoText, margin: 0, lineHeight: 1.5 }}>
                Full health records, ML risk analysis, and trend charts are available in the AlpasFarm management system.
              </p>
            </div>
          </div>
        )}

        {/* BREEDING */}
        {tab === 'breeding' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: T.card, borderRadius: 16, padding: '16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Heart size={15} color="#EC4899" />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Breeding</span>
              </div>
              <Row label="Status" value={animal.breeding_status} T={T} bold />
              <Row label="Last Mating" value={formatDate(animal.last_mating_date)} T={T} />
              <Row label="Expected Kidding" value={formatDate(animal.expected_kidding_date)} T={T} />
            </div>

            <div style={{ background: T.card, borderRadius: 16, padding: '16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Syringe size={15} color="#FF7A18" />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Vaccination</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${T.divider}` }}>
                <span style={{ fontSize: 13, color: T.textSec }}>Status</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: `${vaccColor(animal.vaccination_status)}18`,
                  color: vaccColor(animal.vaccination_status),
                }}>
                  {animal.vaccination_status}
                </span>
              </div>
              <Row label="Last Vaccine" value={formatDate(animal.last_vaccine_date)} T={T} />
              <Row label="Next Due" value={formatDate(animal.next_vaccine_date)} T={T} />
            </div>

            <div style={{ background: T.card, borderRadius: 16, padding: '16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Scale size={15} color="#3B82F6" />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Weight</span>
              </div>
              <Row label="Current Weight" value={animal.weight_kg ? `${animal.weight_kg} kg` : 'Not recorded'} T={T} bold />
              <Row label="Species" value={animal.species} T={T} />
              <Row label="Breed" value={animal.breed ?? 'Unknown'} T={T} />
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky bottom CTA ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 520,
        background: T.nav, backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${T.border}`,
        padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/" style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '11px 0', borderRadius: 12,
            background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
            color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(255,59,48,0.30)',
          }}>
            <Sparkles size={14} /> Open AlpasFarm
          </Link>
          <a
            href={`https://capstone-delta-jet.vercel.app/login`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 16px', borderRadius: 12,
              background: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
              border: `1px solid ${T.border}`,
              color: T.textSec, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> Manage
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────
function Row({ label, value, T, bold }: { label: string; value: string; T: Record<string, string>; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${T.divider}` }}>
      <span style={{ fontSize: 13, color: T.textSec }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: T.text, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
