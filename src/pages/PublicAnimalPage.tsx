import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PawPrint, AlertCircle } from 'lucide-react';

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
  registered_on: string;
}

function ageLabel(dob: string | null): string {
  if (!dob) return 'Unknown';
  const birth = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 1) return 'Less than a month';
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years > 1 ? 's' : ''}`;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function riskColor(score: number): string {
  if (score >= 80) return '#EF4444';
  if (score >= 50) return '#F97316';
  if (score >= 25) return '#F59E0B';
  return '#10B981';
}

function riskLabel(score: number): string {
  if (score >= 80) return 'Critical Risk';
  if (score >= 50) return 'High Risk';
  if (score >= 25) return 'Moderate Risk';
  return 'Low Risk';
}

function vacBadgeColor(status: string): string {
  if (status === 'Up to Date') return '#10B981';
  if (status === 'Due Soon') return '#F59E0B';
  if (status === 'Overdue') return '#EF4444';
  return '#9CA3AF';
}

export function PublicAnimalPage() {
  const { id } = useParams<{ id: string }>();
  const [animal, setAnimal] = useState<PublicAnimal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'health' | 'weight' | 'breeding'>('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    // Call Supabase REST API directly — no Edge Function needed.
    // The animals table has RLS but the anon key can read non-archived rows
    // as long as there's a public SELECT policy. We select only safe public fields.
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const fields = [
      'id', 'tag_id', 'name', 'species', 'breed', 'sex', 'date_of_birth',
      'color_markings', 'photo_url', 'weight_kg', 'health_status',
      'health_risk_score', 'current_temperature', 'current_heart_rate',
      'breeding_status', 'last_mating_date', 'expected_kidding_date',
      'vaccination_status', 'last_vaccine_date', 'next_vaccine_date',
      'notes', 'archived', 'created_at',
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
      .then((rows: any[]) => {
        if (!rows || rows.length === 0) throw new Error('Animal not found or has been removed.');
        const row = rows[0];
        setAnimal({
          ...row,
          registered_on: row.created_at,
        });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #E5E7EB', borderTopColor: '#B91C1C', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading animal profile…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (error || !animal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F5', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Animal Not Found</h2>
          <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 20 }}>
            {error || 'This QR code may be invalid or the animal was removed.'}
          </p>
          <Link to="/" style={{ color: '#B91C1C', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Go to AlpasFarm</Link>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'health', label: 'Health' },
    { key: 'weight', label: 'Weight' },
    { key: 'breeding', label: 'Breeding' },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 480, margin: '0 auto' }}>

      {/* ── Top header ── */}
      <div style={{ background: '#fff', padding: '20px 20px 0', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: '#FEE2E2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#B91C1C', flexShrink: 0,
          }}>
            {animal.name[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1F2937', margin: 0, lineHeight: 1.2 }}>{animal.name}</h1>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>
              {animal.tag_id} · {animal.species}{animal.breed ? ` · ${animal.breed}` : ''} · {animal.sex}
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '1px 0 0' }}>
              Age: {ageLabel(animal.date_of_birth)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 16px', fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
                color: tab === t.key ? '#B91C1C' : '#9CA3AF',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid #B91C1C' : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Row 1: Health Risk + Weight */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Health Risk Card */}
            <div style={cardStyle}>
              <p style={cardTitle}>Health Risk</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 12px' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: riskColor(animal.health_risk_score),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: '#fff',
                }}>
                  {animal.health_risk_score}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1F2937', margin: 0 }}>{riskLabel(animal.health_risk_score)}</p>
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>
                    {animal.health_risk_score < 50 ? 'Within normal range' : 'Needs attention'}
                  </p>
                </div>
              </div>
              <div style={divider} />
              <StatRow label="Temperature" value={animal.current_temperature ? `${animal.current_temperature}°C` : '—'} />
              <StatRow label="Heart Rate" value={animal.current_heart_rate ? `${animal.current_heart_rate} BPM` : '—'} />
            </div>

            {/* Weight & Growth Card */}
            <div style={cardStyle}>
              <p style={cardTitle}>Weight & Growth</p>
              <div style={{ marginTop: 8 }}>
                <StatRow label="Current Weight" value={animal.weight_kg ? `${animal.weight_kg} kg` : '—'} bold />
                <StatRow label="Species" value={animal.species} />
                <StatRow label="Breed" value={animal.breed ?? 'Unknown'} />
                <StatRow label="Sex" value={animal.sex} />
                <StatRow label="Age" value={ageLabel(animal.date_of_birth)} />
              </div>
            </div>
          </div>

          {/* Row 2: Breeding + Vaccination */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Breeding Card */}
            <div style={cardStyle}>
              <p style={cardTitle}>Breeding</p>
              <div style={{ marginTop: 8 }}>
                <StatRow label="Status" value={animal.breeding_status} />
                <StatRow label="Last Mating" value={formatDate(animal.last_mating_date)} />
                <StatRow label="Expected Kidding" value={formatDate(animal.expected_kidding_date)} />
              </div>
            </div>

            {/* Vaccination Card */}
            <div style={cardStyle}>
              <p style={cardTitle}>Vaccination</p>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Status</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: `${vacBadgeColor(animal.vaccination_status)}20`,
                    color: vacBadgeColor(animal.vaccination_status),
                  }}>
                    {animal.vaccination_status}
                  </span>
                </div>
                <StatRow label="Last Vaccine" value={formatDate(animal.last_vaccine_date)} />
                <StatRow label="Next Due" value={formatDate(animal.next_vaccine_date)} />
              </div>
            </div>
          </div>

          {/* Notes Card */}
          <div style={cardStyle}>
            <p style={cardTitle}>Notes</p>
            <p style={{ fontSize: 13, color: animal.notes ? '#374151' : '#9CA3AF', margin: '8px 0 0' }}>
              {animal.notes || 'No notes recorded.'}
            </p>
          </div>

          {/* Color markings */}
          {animal.color_markings && (
            <div style={cardStyle}>
              <p style={cardTitle}>Color & Markings</p>
              <p style={{ fontSize: 13, color: '#374151', margin: '8px 0 0' }}>{animal.color_markings}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Health Tab ── */}
      {tab === 'health' && (
        <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={cardStyle}>
            <p style={cardTitle}>Current Health Status</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: riskColor(animal.health_risk_score),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {animal.health_risk_score}
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: riskColor(animal.health_risk_score), margin: 0 }}>{riskLabel(animal.health_risk_score)}</p>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0 0' }}>Health Risk Score out of 100</p>
              </div>
            </div>
            <div style={{ ...divider, marginTop: 14 }} />
            <StatRow label="Health Status" value={animal.health_status} />
            <StatRow label="Temperature" value={animal.current_temperature ? `${animal.current_temperature}°C` : 'Not recorded'} />
            <StatRow label="Heart Rate" value={animal.current_heart_rate ? `${animal.current_heart_rate} BPM` : 'Not recorded'} />
          </div>
          <div style={{ ...cardStyle, background: '#FEF3C7', border: '1px solid #FCD34D' }}>
            <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
              ⚠️ This health data is for reference only. Always consult a licensed veterinarian for medical decisions.
            </p>
          </div>
        </div>
      )}

      {/* ── Weight Tab ── */}
      {tab === 'weight' && (
        <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={cardStyle}>
            <p style={cardTitle}>Weight Information</p>
            <div style={{ marginTop: 8 }}>
              <StatRow label="Current Weight" value={animal.weight_kg ? `${animal.weight_kg} kg` : 'Not recorded'} bold />
              <StatRow label="Species" value={animal.species} />
              <StatRow label="Breed" value={animal.breed ?? 'Unknown'} />
              <StatRow label="Sex" value={animal.sex} />
              <StatRow label="Age" value={ageLabel(animal.date_of_birth)} />
            </div>
          </div>
          <div style={{ ...cardStyle, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <p style={{ fontSize: 12, color: '#1E40AF', margin: 0 }}>
              📈 Detailed weight trend charts and growth forecasts are available in the AlpasFarm management system.
            </p>
          </div>
        </div>
      )}

      {/* ── Breeding Tab ── */}
      {tab === 'breeding' && (
        <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={cardStyle}>
            <p style={cardTitle}>Breeding Status</p>
            <div style={{ marginTop: 8 }}>
              <StatRow label="Current Status" value={animal.breeding_status} bold />
              <StatRow label="Last Mating Date" value={formatDate(animal.last_mating_date)} />
              <StatRow label="Expected Kidding" value={formatDate(animal.expected_kidding_date)} />
            </div>
          </div>
          <div style={cardStyle}>
            <p style={cardTitle}>Vaccination</p>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>Status</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: `${vacBadgeColor(animal.vaccination_status)}20`,
                  color: vacBadgeColor(animal.vaccination_status),
                }}>
                  {animal.vaccination_status}
                </span>
              </div>
              <StatRow label="Last Vaccine" value={formatDate(animal.last_vaccine_date)} />
              <StatRow label="Next Due" value={formatDate(animal.next_vaccine_date)} />
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', padding: '16px 20px 32px', borderTop: '1px solid #E5E7EB', background: '#fff' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#9CA3AF', fontSize: 12, marginBottom: 6 }}>
          <PawPrint size={13} />
          <span>Powered by AlpasFarm — Smart Farm Management</span>
        </div>
        <div>
          <Link to="/" style={{ color: '#B91C1C', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Visit AlpasFarm →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '14px 16px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
};

const cardTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: '#1F2937', margin: 0,
};

const divider: React.CSSProperties = {
  height: 1, background: '#F3F4F6', margin: '10px 0',
};

function StatRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F9FAFB' }}>
      <span style={{ fontSize: 13, color: '#9CA3AF' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: '#1F2937' }}>{value}</span>
    </div>
  );
}
