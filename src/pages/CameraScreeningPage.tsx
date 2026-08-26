/**
 * CameraScreeningPage.tsx
 * Full screening history + stats for all animals.
 * Route: /camera-screening
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, AlertTriangle, CheckCircle, XCircle, RefreshCw, Loader2, Search } from 'lucide-react';
import { useAllScreenings } from '../lib/useCameraScreenings';
import { useFarmData } from '../lib/useFarmData';
import { formatDate } from '../lib/analytics';
import { CameraScreeningModal } from '../components/CameraScreeningModal';

export function CameraScreeningPage() {
  const navigate = useNavigate();
  const { screenings, summary, loading, refresh } = useAllScreenings();
  const farmData = useFarmData();
  const [search, setSearch] = useState('');
  const [filterPrediction, setFilterPrediction] = useState<'all' | 'possible_health_concern' | 'normal_appearance' | 'low_confidence'>('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  // Enrich screenings with animal name
  const enriched = screenings.map((s) => {
    const animal = farmData.animals.find((a) => a.id === s.animal_id);
    return { ...s, animalName: animal?.name ?? 'Unknown', animalTag: animal?.tag_id ?? '' };
  });

  const filtered = enriched.filter((s) => {
    const matchSearch =
      !search.trim() ||
      s.animalName.toLowerCase().includes(search.toLowerCase()) ||
      s.animalTag.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterPrediction === 'all' || s.prediction === filterPrediction;
    return matchSearch && matchFilter;
  });

  const predLabel = (p: string) => {
    if (p === 'possible_health_concern') return 'Possible Concern';
    if (p === 'normal_appearance') return 'Normal Appearance';
    return 'Low Confidence';
  };

  const predColor = (p: string) => {
    if (p === 'possible_health_concern') return '#EF4444';
    if (p === 'normal_appearance') return '#16A34A';
    return '#F59E0B';
  };

  const predIcon = (p: string) => {
    if (p === 'possible_health_concern') return <AlertTriangle size={14} color="#EF4444" />;
    if (p === 'normal_appearance') return <CheckCircle size={14} color="#16A34A" />;
    return <XCircle size={14} color="#F59E0B" />;
  };

  const activeAnimals = farmData.animals.filter((a) => !a.archived);
  const modalAnimal = activeAnimals.find((a) => a.id === selectedAnimalId);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        <SummaryCard
          label="Total Screenings"
          value={summary.total}
          color="var(--accent-orange)"
          icon={<Camera size={18} />}
        />
        <SummaryCard
          label="Possible Concerns"
          value={summary.possibleConcerns}
          color="#EF4444"
          icon={<AlertTriangle size={18} />}
        />
        <SummaryCard
          label="Low Confidence"
          value={summary.lowConfidence}
          color="#F59E0B"
          icon={<XCircle size={18} />}
        />
        <SummaryCard
          label="Last Screening"
          value={summary.lastScreeningDate ? formatDate(summary.lastScreeningDate) : '—'}
          color="#3B82F6"
          icon={<CheckCircle size={18} />}
          small
        />
      </div>

      {/* Controls */}
      <div style={{
        background: 'var(--glass-surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 200,
        }}>
          <Search size={15} color="var(--text-secondary)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by animal name or tag…"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontSize: 13, color: 'var(--text)', flex: 1,
            }}
          />
        </div>

        {/* Filter */}
        <select
          value={filterPrediction}
          onChange={(e) => setFilterPrediction(e.target.value as any)}
          style={{
            padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <option value="all">All Results</option>
          <option value="possible_health_concern">Possible Concerns</option>
          <option value="normal_appearance">Normal Appearance</option>
          <option value="low_confidence">Low Confidence</option>
        </select>

        {/* Refresh */}
        <button
          onClick={refresh}
          style={{
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>

        {/* New screening — select animal */}
        <div style={{ position: 'relative' }}>
          <select
            value={selectedAnimalId ?? ''}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedAnimalId(e.target.value);
                setShowModal(true);
              }
            }}
            style={{
              padding: '8px 14px', borderRadius: 10,
              border: 'none', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <option value="">📷 New Screening…</option>
            {activeAnimals.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.tag_id})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--glass-surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '40px', color: 'var(--text-secondary)', fontSize: 13,
          }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading screening history…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <Camera size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              No screenings found
            </div>
            <div style={{ fontSize: 13 }}>
              Run a camera screening from an animal's profile page or use the button above.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Animal', 'Result', 'Confidence', 'Model', 'Quality', 'Actions'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11,
                      letterSpacing: '0.5px', textTransform: 'uppercase' as const,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(s.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => navigate(`/animals/${s.animal_id}`)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 13, fontWeight: 700, color: 'var(--accent-orange)',
                          padding: 0,
                        }}
                      >
                        {s.animalName}
                      </button>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.animalTag}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {predIcon(s.prediction)}
                        <span style={{ fontWeight: 700, color: predColor(s.prediction) }}>
                          {predLabel(s.prediction)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: predColor(s.prediction) }}>
                      {Math.round(s.confidence * 100)}%
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {s.model_version}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {s.quality_score}/100
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => navigate(`/animals/${s.animal_id}`)}
                        style={{
                          padding: '5px 12px', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        View Animal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{
        marginTop: 16, padding: '12px 16px',
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.18)',
        borderRadius: 10, fontSize: 12, color: '#3B82F6', lineHeight: 1.6,
      }}>
        ℹ️ <strong>Camera screening is a preliminary assessment and does not replace professional veterinary diagnosis.</strong> Results are generated by an ML model and should be interpreted alongside existing health records and veterinary consultation.
      </div>

      {/* Screening modal */}
      {showModal && modalAnimal && (
        <CameraScreeningModal
          animalId={modalAnimal.id}
          animalName={modalAnimal.name}
          animalTag={modalAnimal.tag_id}
          onClose={() => { setShowModal(false); setSelectedAnimalId(null); }}
          onSaved={() => { refresh(); setShowModal(false); setSelectedAnimalId(null); }}
        />
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, color, icon, small,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div style={{
      background: 'var(--glass-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--glass-border)',
      borderRadius: 14,
      padding: '16px 18px',
      boxShadow: 'var(--shadow)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: small ? 14 : 22, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
