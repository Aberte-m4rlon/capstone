/**
 * useMLScreening.ts — AlpasFarm Tabular Health Screening Hook
 *
 * Calls the local Python ML service (myai_service) to run the trained
 * Random Forest model on an animal's health record data.
 *
 * IMPORTANT DISTINCTIONS:
 *   ml_probability      = Random Forest output (synthetic-data model)
 *   veterinary_score    = AlpasFarm rule engine score (AUTHORITATIVE)
 *   These are separate values — never combine or equate them.
 *
 * The ML service runs locally at http://localhost:8000
 * It requires the myai_service to be running with the trained model.
 *
 * ARCHITECTURE:
 *   Animal health record
 *     ↓
 *   This hook (browser → localhost:8000)
 *     ↓
 *   Python Random Forest model
 *     ↓
 *   MLScreeningResult
 *     ↓
 *   Displayed alongside (NOT replacing) the veterinary rule score
 */

import { useState, useCallback } from 'react';
import type { HealthRecord, Animal } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MLTopFeature {
  feature: string;
  label: string;
  importance: number;
}

export interface MLScreeningResult {
  animal_id: string;
  prediction: 'healthy' | 'suspected_ill';
  ml_probability: number;           // 0–1 from model (NOT veterinary score)
  ml_probability_pct: number;       // 0–100
  screening_status: 'needs_attention' | 'no_concern';
  risk_label: string;               // "Needs Attention" | "No Obvious Concern"
  model_version: string;
  top_features: MLTopFeature[];
  disclaimer: string;
  timestamp: string;
  dataset_type: string;
  // Returned for traceability — from AlpasFarm rule engine
  veterinary_risk_score: number | null;
  veterinary_risk_level: string | null;
  note: string;
}

export type MLServiceStatus = 'checking' | 'ready' | 'unavailable' | 'no_model';

const ML_SERVICE_URL = 'http://localhost:8000';

// ── Build screening request from existing health record ───────────────────────

export function buildScreeningRequest(
  record: HealthRecord,
  animal: Animal,
): Record<string, number | string> | null {
  // temperature and heart_rate are required — skip if missing
  if (record.temperature === null || record.heart_rate === null) return null;

  // Map AlpasFarm fields to ML model fields
  const appetiteMap: Record<string, string> = {
    'Normal': 'normal',
    'Reduced': 'reduced',
    'None': 'poor',    // AlpasFarm 'None' maps to model 'poor'
  };
  const activityMap: Record<string, string> = {
    'Normal': 'normal',
    'Low': 'reduced',
    'Lethargic': 'lethargic',
  };

  const appetite       = appetiteMap[record.appetite]      ?? 'normal';
  const activity_level = activityMap[record.activity_level] ?? 'normal';

  // Age in months
  const age_months = animal.date_of_birth
    ? Math.max(1, Math.floor(
        (Date.now() - new Date(animal.date_of_birth).getTime()) / (30 * 24 * 60 * 60 * 1000)
      ))
    : 24;  // default if unknown

  return {
    animal_id:            animal.id,
    age_months,
    weight_kg:            Number(animal.weight_kg ?? 35),
    temperature_c:        Number(record.temperature),
    heart_rate_bpm:       Number(record.heart_rate),
    respiratory_rate_bpm: Number(record.respiratory_rate ?? 20),
    appetite,
    activity_level,
    cough:             record.cough            ? 1 : 0,
    nasal_discharge:   record.nasal_discharge  ? 1 : 0,
    diarrhea:          record.diarrhea         ? 1 : 0,
    lameness:          record.gait === 'Slight Limp' || record.gait === 'Severe Limp' || record.gait === 'Cannot Walk' ? 1 : 0,
    weight_loss_kg_30d: 0,   // not stored in health records, default 0
    veterinary_risk_score: record.risk_score,
    veterinary_risk_level: record.risk_level,
  };
}

// ── Check ML service availability ────────────────────────────────────────────

export async function checkMLServiceStatus(): Promise<MLServiceStatus> {
  try {
    const resp = await fetch(`${ML_SERVICE_URL}/api/ml/health-model/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return 'unavailable';
    const data = await resp.json();
    if (data.status === 'ready') return 'ready';
    return 'no_model';
  } catch {
    return 'unavailable';
  }
}

// ── Run ML screening for a single record ─────────────────────────────────────

export async function runMLScreening(
  record: HealthRecord,
  animal: Animal,
): Promise<MLScreeningResult> {
  const requestBody = buildScreeningRequest(record, animal);
  if (!requestBody) {
    throw new Error(
      'Temperature and heart rate are required for ML screening. ' +
      'Please complete the health record first.'
    );
  }

  const resp = await fetch(`${ML_SERVICE_URL}/api/ml/health-screening`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'Unknown error' }));
    if (resp.status === 503) {
      throw new Error(
        'ML service is unavailable. Start the MyAI service and ensure the model is trained.'
      );
    }
    throw new Error(err.detail ?? `ML service error (${resp.status})`);
  }

  return resp.json() as Promise<MLScreeningResult>;
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useMLScreening() {
  const [result, setResult]     = useState<MLScreeningResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [status, setStatus]     = useState<MLServiceStatus>('checking');

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
