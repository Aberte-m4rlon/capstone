/**
 * MLHealthPanel — Reusable ML health risk display component.
 * Shows ML risk probability, top factors, trend, and explanation.
 * Used in AnimalProfilePage and HealthPage early warning list.
 */
import { Brain, TrendingUp, TrendingDown, Minus, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import type { MLHealthPrediction } from '../lib/mlHealth';

// ─── Colour helpers ───────────────────────────────────────────────────────────

function riskColor(level: string): string {
  if (level === 'Critical') return '#EF4444';
  if (level === 'High') return '#F97316';
  if (level === 'Moderate') return '#F59E0B';
  return '#16A34A';
}

function riskBg(level: string): string {
  if (level === 'Critical') return 'rgba(239,68,68,0.10)';
  if (level === 'High') return 'rgba(249,115,22,0.10)';
  if (level === 'Moderate') return 'rgba(245,158,11,0.10)';
  return 'rgba(22,163,74,0.10)';
}

function combinedColor(assessment: string): string {
  if (assessment === 'Critical') return '#EF4444';
  if (assessment === 'Alert') return '#F97316';
  if (assessment === 'Monitor') return '#F59E0B';
  return '#3B82F6';
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'Worsening') return <TrendingUp size={14} color="#EF4444" />;
  if (trend === 'Improving') return <TrendingDown size={14} color="#16A34A" />;
  return <Minus size={14} color="#F59E0B" />;
}

function DirectionIcon({ dir }: { dir: 'up' | 'down' | 'neutral' }) {
  if (dir === 'up') return <span style={{ color: '#EF4444', fontSize: 11 }}>↑</span>;
  if (dir === 'down') return <span style={{ color: '#16A34A', fontSize: 11 }}>↓</span>;
  return <span style={{ color: '#94A3B8', fontSize: 11 }}>→</span>;
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  prediction: MLHealthPrediction;
  animalName: string;
  compact?: boolean;
  onRerun?: () => void;
}

export function MLHealthPanel({ prediction: p, animalName, compact = false, onRerun }: Props) {
  const pct = Math.round(p.riskProbability * 100);

  if (compact) {
    // Compact mode: small badge for tables/lists
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Brain size={13} color={riskColor(p.riskLevel)} />
        <span style={{ fontWeight: 700, fontSize: 12, color: riskColor(p.riskLevel) }}>
          {pct}%
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Risk</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TrendIcon trend={p.trend} />
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} color="#7C3AED" />
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Pagsusuri sa Kalusugan</span>
        </div>
        {onRerun && (
          <button className="btn btn-ghost btn-sm" onClick={onRerun} title="Re-run assessment">
            <RefreshCw size={13} /> Rerun
          </button>
        )}
      </div>

      {/* Risk score + trend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* ML probability ring */}
        <div style={{
          flex: '0 0 auto', padding: '16px 20px', borderRadius: 16,
          background: riskBg(p.riskLevel), border: `1px solid ${riskColor(p.riskLevel)}33`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 110,
        }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: riskColor(p.riskLevel), lineHeight: 1 }}>
            {pct}%
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: riskColor(p.riskLevel) }}>
            {p.riskLevel === 'Low' ? 'Maayos' : p.riskLevel === 'Moderate' ? 'Bantayan' : 'Kailangan ng Atensyon'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Tinatayang Risk</div>
        </div>

        {/* Trend + combined */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendIcon trend={p.trend} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Trend: {p.trend}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Batay sa kasaysayan ng health records</div>
            </div>
          </div>

          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg)', border: `1px solid ${combinedColor(p.combinedAssessment)}33`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color={combinedColor(p.combinedAssessment)} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: combinedColor(p.combinedAssessment) }}>
                Kalagayan: {p.combinedAssessment}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Pagsusuri sa bukid at vitals history
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top contributing factors */}
      {p.topFactors.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.04em' }}>
            Key Contributing Factors
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.topFactors.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                background: f.direction === 'up' ? 'rgba(239,68,68,0.06)' : f.direction === 'down' ? 'rgba(22,163,74,0.06)' : 'var(--bg)',
                border: '1px solid var(--border-light)',
              }}>
                <DirectionIcon dir={f.direction} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{f.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: f.direction === 'up' ? '#EF4444' : f.direction === 'down' ? '#16A34A' : 'var(--text-secondary)',
                }}>
                  {f.contribution > 0 ? '+' : ''}{(f.contribution * 100).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model metrics (collapsed) */}
      {p.modelMeta && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600, userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={12} /> Model Info (v{p.modelMeta.version})
          </summary>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Accuracy', value: `${(p.modelMeta.accuracy * 100).toFixed(1)}%` },
              { label: 'Precision', value: `${(p.modelMeta.precision * 100).toFixed(1)}%` },
              { label: 'Recall', value: `${(p.modelMeta.recall * 100).toFixed(1)}%` },
              { label: 'F1', value: `${(p.modelMeta.f1 * 100).toFixed(1)}%` },
              { label: 'Samples', value: String(p.modelMeta.trainingSamples) },
              { label: 'Features', value: String(p.modelMeta.features.length) },
            ].map((m) => (
              <div key={m.label} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{m.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            [Paalala] {p.modelMeta.disclaimer}
          </div>
        </details>
      )}

      {/* Farmer Advisory Box */}
      <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(67, 160, 71, 0.08)', border: '1px solid rgba(67, 160, 71, 0.25)', fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
        <strong>Paalala para sa Bukid:</strong> Regular na subaybayan ang pagkain, pag-inom, at sigla ng hayop. Kung may senyales ng panghihina, sumangguni agad sa beterinaryo.
      </div>
    </div>
  );
}

// ─── Early Warning Card ───────────────────────────────────────────────────────

interface EarlyWarningCardProps {
  animalName: string;
  tagId: string;
  prediction: MLHealthPrediction;
  onView: () => void;
}

export function EarlyWarningCard({ animalName, tagId, prediction: p, onView }: EarlyWarningCardProps) {
  const pct = Math.round(p.riskProbability * 100);
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      background: riskBg(p.riskLevel),
      border: `1px solid ${riskColor(p.riskLevel)}33`,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: riskColor(p.riskLevel),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Brain size={22} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
          {animalName}
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 6 }}>
            {tagId}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: riskColor(p.riskLevel) }}>
            {p.riskLevel} — {pct}%
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
            <TrendIcon trend={p.trend} />
            {p.trend}
          </span>
        </div>
        {p.topFactors.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
            {p.topFactors.slice(0, 3).map((f) => f.label).join(' · ')}
          </div>
        )}
      </div>
      <button className="btn btn-sm btn-secondary" onClick={onView} style={{ flexShrink: 0 }}>
        Tingnan ang Hayop
      </button>
    </div>
  );
}
