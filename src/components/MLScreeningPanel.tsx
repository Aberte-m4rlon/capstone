/**
 * MLScreeningPanel.tsx
 * Displays the tabular ML health screening result alongside (NOT replacing)
 * the existing AlpasFarm veterinary rule engine score.
 *
 * Architecture:
 *   Veterinary rule engine (authoritative) ← unchanged
 *   +
 *   ML screening (this panel)             ← additional early-warning tool
 *   =
 *   Combined health overview              ← shown to the farmer
 */
import { useState, useEffect } from 'react';
import { Brain, Loader2, AlertTriangle, CheckCircle, Info, Zap, WifiOff } from 'lucide-react';
import {
  useMLScreening,
  type MLScreeningResult,
  type MLServiceStatus,
} from '../lib/useMLScreening';
import type { HealthRecord, Animal } from '../types';

// ── Colour helpers ────────────────────────────────────────────────────────────

function statusColor(s: MLScreeningResult['screening_status'] | undefined): string {
  if (s === 'needs_attention') return '#EF4444';
  return '#238B45';
}

function statusBg(s: MLScreeningResult['screening_status'] | undefined): string {
  if (s === 'needs_attention') return 'rgba(239,68,68,0.10)';
  return '#EAF6ED';
}

function statusBorder(s: MLScreeningResult['screening_status'] | undefined): string {
  if (s === 'needs_attention') return 'rgba(239,68,68,0.30)';
  return 'rgba(35,139,69,0.25)';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  record: HealthRecord;
  animal: Animal;
  /** If true, auto-runs on mount */
  autoRun?: boolean;
  compact?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MLScreeningPanel({ record, animal, autoRun = false, compact = false }: Props) {
  const { result, loading, error, status, checkStatus, runScreening } = useMLScreening();
  const [serviceChecked, setServiceChecked] = useState(false);

  useEffect(() => {
    checkStatus().then((s) => {
      setServiceChecked(true);
      if (autoRun && s === 'ready') {
        runScreening(record, animal);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compact badge (for lists/tables) ─────────────────────────────────────
  if (compact && result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Brain size={13} color={statusColor(result.screening_status)} />
        <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(result.screening_status) }}>
          {result.ml_probability_pct}%
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Risk</span>
      </div>
    );
  }

  // ── Service unavailable ───────────────────────────────────────────────────
  if (serviceChecked && status !== 'ready' && !loading && !result) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <WifiOff size={14} color="var(--text-secondary)" />
        <div>
          <strong style={{ color: 'var(--text)' }}>Pansamantalang Hindi Magamit</strong>
          <div style={{ marginTop: 2 }}>
            Kasalukuyang inaayos ang health screening service.
          </div>
        </div>
      </div>
    );
  }

  // ── Run button (not yet run) ──────────────────────────────────────────────
  if (!result && !loading && !error) {
    return (
      <button
        onClick={() => runScreening(record, animal)}
        disabled={status !== 'ready'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', borderRadius: 10, border: 'none',
          background: status === 'ready'
            ? 'linear-gradient(135deg, rgba(35,139,69,0.18), rgba(35,139,69,0.08))'
            : 'var(--surface)',
          borderWidth: 1, borderStyle: 'solid',
          borderColor: status === 'ready' ? 'rgba(35,139,69,0.35)' : 'var(--border)',
          color: status === 'ready' ? '#238B45' : 'var(--text-secondary)',
          fontSize: 13, fontWeight: 700, cursor: status === 'ready' ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
        }}
      >
        <Brain size={15} />
        Suriin ang Kalusugan
      </button>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
        Sinusuri ang kalusugan…
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 10,
        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
        fontSize: 12, color: '#EF4444',
      }}>
        <strong>ML Screening Error:</strong> {error}
        <button
          onClick={() => runScreening(record, animal)}
          style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#EF4444', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (!result) return null;

  const col    = statusColor(result.screening_status);
  const bg     = statusBg(result.screening_status);
  const border = statusBorder(result.screening_status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={17} color="#238B45" />
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Pagsusuri sa Kalusugan</span>
        </div>
        <button
          onClick={() => runScreening(record, animal)}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(35,139,69,0.3)', background: 'rgba(35,139,69,0.08)', color: '#238B45', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Zap size={11} /> Re-run
        </button>
      </div>

      {/* Main result */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {result.screening_status === 'needs_attention'
            ? <AlertTriangle size={20} color={col} />
            : <CheckCircle size={20} color={col} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: col }}>{result.risk_label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Resulta: {result.prediction === 'suspected_ill' ? 'Kailangan ng Atensyon' : 'Maayos'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: col, lineHeight: 1 }}>
              {result.ml_probability_pct}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Tinatayang Risk</div>
          </div>
        </div>

        {/* Important distinction box */}
        <div style={{
          background: 'var(--surface)', borderRadius: 8, padding: '8px 10px',
          fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10,
        }}>
          Ang pagsusuring ito ay gabay lamang para sa pag-aalaga sa bukid at hindi opisyal na diagnosis ng beterinaryo.
          {result.veterinary_risk_score !== null && result.veterinary_risk_score !== undefined && (
            <span> · Vet score: <strong style={{ color: 'var(--text)' }}>{result.veterinary_risk_score}/100</strong></span>
          )}
        </div>

        {/* Top features */}
        {result.top_features.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Mga Salik na Nakaapekto
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.top_features.slice(0, 4).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: col, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{f.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {(f.importance * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{
        display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 9,
        background: 'rgba(35,139,69,0.08)', border: '1px solid rgba(35,139,69,0.20)',
        fontSize: 11, color: '#176B35', lineHeight: 1.55,
      }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{result.disclaimer}</span>
      </div>
    </div>
  );
}
