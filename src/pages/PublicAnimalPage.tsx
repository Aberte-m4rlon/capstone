import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PawPrint, Calendar, Scale, HeartPulse, Syringe, Heart, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

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
  breeding_status: string;
  vaccination_status: string;
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
  const remMonths = months % 12;
  return remMonths > 0 ? `${years} year${years > 1 ? 's' : ''}, ${remMonths} month${remMonths > 1 ? 's' : ''}` : `${years} year${years > 1 ? 's' : ''}`;
}

function healthColor(status: string): string {
  if (status === 'Healthy') return '#10B981';
  if (status === 'Monitor') return '#3B82F6';
  if (status === 'At Risk') return '#F59E0B';
  return '#EF4444';
}

function vacColor(status: string): string {
  if (status === 'Up to Date') return '#10B981';
  if (status === 'Due Soon') return '#F59E0B';
  if (status === 'Overdue') return '#EF4444';
  return '#6B7280';
}

export function PublicAnimalPage() {
  const { id } = useParams<{ id: string }>();
  const [animal, setAnimal] = useState<PublicAnimal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-animal?id=${id}`;
    fetch(apiUrl)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load');
        }
        return res.json();
      })
      .then((data) => {
        setAnimal(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #E5E7EB', borderTopColor: '#3B82F6', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#6B7280', fontSize: 14 }}>Loading animal information...</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (error || !animal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Animal Not Found</h2>
          <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 20 }}>
            {error || 'This animal may have been removed or the QR code is invalid.'}
          </p>
          <Link to="/" style={{ color: '#3B82F6', fontSize: 14, textDecoration: 'none' }}>Go to AlpasFarm</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header banner */}
      <div style={{
        background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
        padding: '32px 20px 28px',
        color: '#fff',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, flexShrink: 0,
            }}>
              {animal.name[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{animal.name}</h1>
              <p style={{ fontSize: 14, opacity: 0.9, margin: '4px 0 0' }}>
                {animal.tag_id} · {animal.species} · {animal.sex}
              </p>
              {animal.breed && <p style={{ fontSize: 12, opacity: 0.8, margin: '2px 0 0' }}>{animal.breed}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 20px 48px' }}>
        {/* Health status banner */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `${healthColor(animal.health_status)}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <HeartPulse size={24} color={healthColor(animal.health_status)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Health Status</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: healthColor(animal.health_status) }}>{animal.health_status}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Risk Score</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: animal.health_risk_score >= 50 ? '#EF4444' : animal.health_risk_score >= 25 ? '#F59E0B' : '#10B981' }}>
              {animal.health_risk_score}/100
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
          <InfoCard icon={<Calendar size={18} color="#3B82F6" />} label="Age" value={ageLabel(animal.date_of_birth)} />
          <InfoCard icon={<Scale size={18} color="#10B981" />} label="Weight" value={animal.weight_kg ? `${animal.weight_kg} kg` : 'Not recorded'} />
          <InfoCard icon={<Heart size={18} color="#EC4899" />} label="Breeding Status" value={animal.breeding_status} />
          <InfoCard icon={<Syringe size={18} color={vacColor(animal.vaccination_status)} />} label="Vaccination" value={animal.vaccination_status} />
        </div>

        {/* Physical description */}
        {animal.color_markings && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 6 }}>
              Color & Markings
            </div>
            <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>{animal.color_markings}</p>
          </div>
        )}

        {/* Registration info */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <PawPrint size={16} color="#059669" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>AlpasFarm Registration</span>
          </div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            <div style={{ marginBottom: 4 }}><strong>Tag ID:</strong> {animal.tag_id}</div>
            <div><strong>Registered:</strong> {new Date(animal.registered_on).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: 12 }}>
            <PawPrint size={14} />
            <span>Powered by AlpasFarm — Smart Farm Management</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/" style={{ color: '#059669', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
              Visit AlpasFarm
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2937' }}>{value}</div>
    </div>
  );
}
