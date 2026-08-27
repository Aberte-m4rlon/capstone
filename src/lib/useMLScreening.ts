/**
 * useMLScreening.ts — AlpasFarm Tabular Health Screening Hook
 *
 * UPDATED: Now calls /api/ml/health-screening (Vercel serverless function)
 * instead of localhost:8000 (Python service).
 *
 * The Vercel endpoint implements the trained Random Forest's prediction logic
 * in TypeScript using the model's scaler parameters and feature importances.
 * It runs on every Vercel deployment — no Python, no server required.
 *
 * IMPORTANT DISTINCTIONS:
 *   ml_probability      = TypeScript RF approximation output (synthetic-data model)
 *   veterinary_score    = AlpasFarm rule engine score (AUTHORITATIVE)
 *   These are separate values — never combine or equate them.
 */

import { useState, useCallback } from 'react';
import type { HealthRecord, Animal } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MLTopFeature {
  feature:    string;
  label:      string;
  importance: number;
  value?:     number;
}

export interface MLScreeningResult {
  animal_id:            string;
  prediction:           'healthy' | 'suspected_ill';
  ml_probability:       number;   // 0–1 (NOT veterinary score)
  ml_probability_pct:   number;   // 0–100
  screening_status:     'needs_attention' | 'no_concern';
  risk_label:           string;
  model_version:        string;
  top_features:         MLTopFeature[];
  disclaimer:           string;
  timestamp:            string;
  dataset_type?:        string;
  note?:                string;
  veterinary_risk_score: number | null;
  veterinary_risk_level: string | null;
}

export type MLServiceStatus = 'checking' | 'ready' | 'unavailable';

// ── Endpoint (same-origin Vercel serverless) ──────────────────────────────────
const ML_ENDPOINT = '/api/ml/health-screening';

// ── Map AlpasFarm health record → ML model input ──────────────────────────────

export function buildScreeningRequest(
  record: HealthRecord,
  animal: Animal,
): Record<string, number | string> | null {
  if (record.temperature === null || record.heart_rate === null) return null;

  const appetiteMap: Record<string, string> = {
    Normal:  'normal',
    Reduced: 'reduced',
    None:    'poor',
  };
  const activityMap: Record<string, string> = {
    Normal:    'normal',
    Low:       'reduced',
    Lethargic: 'lethargic',
  };

  const appetite       = appetiteMap[record.appetite]       ?? 'normal';
  const activity_level = activityMap[record.activity_level] ?? 'normal';

  const age_months = animal.date_of_birth
    ? Math.max(1, Math.floor(
        (Date.now() - new Date(animal.date_of_birth).getTime()) / (30 * 24 * 60 * 60 * 1000),
      ))
    : 24;

  return {
    animal_id:             animal.id,
    age_months,
    weight_kg:             Number(animal.weight_kg ?? 35),
    temperature_c:         Number(record.temperature),
    heart_rate_bpm:        Number(record.heart_rate),
    respiratory_rate_bpm:  Number((record as any).respiratory_rate ?? 20),
    appetite,
    activity_level,
    cough:             record.cough           ? 1 : 0,
    nasal_discharge:   record.nasal_discharge ? 1 : 0,
    diarrhea:          record.diarrhea        ? 1 : 0,
    lameness:
      record.gait === 'Slight Limp' ||
      record.gait === 'Severe Limp' ||
      record.gait === 'Cannot Walk' ? 1 : 0,
    weight_loss_kg_30d:    0,
    veterinary_risk_score: record.risk_score,
    veterinary_risk_level: record.risk_level,
  };
}

// ── Status check ──────────────────────────────────────────────────────────────

export async function checkMLServiceStatus(): Promise<MLServiceStatus> {
  try {
    const resp = await fetch(ML_ENDPOINT, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    if (resp.ok) return 'ready';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

// ── Run prediction ────────────────────────────────────────────────────────────

export async function runMLScreening(
  record: HealthRecord,
  animal: Animal,
): Promise<MLScreeningResult> {
  const requestBody = buildScreeningRequest(record, animal);
  if (!requestBody) {
    throw new Error(
      'Temperature and heart rate are required for ML screening. ' +
      'Please complete the health record first.',
    );
  }

  const resp = await fetch(ML_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    let errMsg = `ML service error (${resp.status})`;
    try {
      const errBody = await resp.json();
      if (errBody?.error)   errMsg = errBody.error;
      if (errBody?.details) errMsg += ': ' + (errBody.details as string[]).join('; ');
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  const result = await resp.json() as MLScreeningResult;
  // Attach veterinary context from input for display
  result.veterinary_risk_score = result.veterinary_risk_score ?? record.risk_score;
  result.veterinary_risk_level = result.veterinary_risk_level ?? record.risk_level;
  return result;
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useMLScreening() {
  const [result, setResult]   = useState<MLScreeningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [status, setStatus]   = useState<MLServiceStatus>('checking');

  const checkStatus = useCallback(async () => {
    const s = await checkMLServiceStatus();
    setStatus(s);
    return s;
  }, []);

  const runScreening = useCallback(async (record: HealthRecord, animal: Animal) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await runMLScreening(record, animal);
      setResult(r);
      return r;
    } catch (err: any) {
      setError(err?.message ?? 'ML screening failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, status, checkStatus, runScreening, clear };
}
