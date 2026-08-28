/**
 * mlHealth.ts — Enhanced ML Health Risk Prediction
 *
 * ARCHITECTURE:
 *   Veterinary Rule Engine (analytics.ts)  ←── deterministic, always runs
 *         +
 *   ML Logistic Regression (this file)     ←── statistical, trains on history
 *         ↓
 *   Combined Health Assessment             ←── shown to farmer
 *
 * MODEL:
 *   Algorithm:     Logistic Regression (gradient descent, L2 regularization)
 *   Training data: user's own historical health_records
 *   Label:         risk_score >= 50 → 1 (at-risk), else 0 (low-risk)
 *   Features:      18 features including 4 time-series trend features
 *   In-browser:    Pure TypeScript, no external dependencies
 *
 * HONEST DISCLAIMER:
 *   Labels are derived from the veterinary rule score, not from clinician
 *   annotations. The model generalizes and interpolates those rules using
 *   statistical learning. It is NOT a validated veterinary diagnostic tool.
 *   Always consult a qualified veterinarian for actual diagnoses.
 */

import type { HealthRecord, WeightRecord, Animal } from '../types';
import {
  trainLogisticRegression,
  predictHealthRisk,
  type HealthFeatures,
  type HealthTrainingRow,
  type LogisticRegressionResult,
} from './ml';
import { monthsSince } from './analytics';

// ─── Extended feature set with time-based trends ──────────────────────────────

export interface ExtendedHealthFeatures extends HealthFeatures {
  // Time-series additions (v2 features)
  temp_7d_avg: number;          // 7-day mean temperature
  temp_trend: number;           // recent temp minus 7d mean (+ = rising)
  weight_change_pct: number;    // % weight change from prev record
  recent_high_risk_count: number; // records with risk_score >= 60 in last 14 days
}

const EXTENDED_FEATURE_NAMES: (keyof ExtendedHealthFeatures)[] = [
  'temperature', 'heart_rate', 'appetite_reduced', 'appetite_none',
  'activity_low', 'activity_lethargic', 'cough', 'diarrhea',
  'nasal_discharge', 'eye_abnormal', 'body_poor', 'body_fair',
  'age_months', 'recent_concerning',
  // v2 time-based features
  'temp_7d_avg', 'temp_trend', 'weight_change_pct', 'recent_high_risk_count',
];

// ─── ML model version metadata ────────────────────────────────────────────────

export interface MLModelMeta {
  version: string;
  trainedAt: string;
  trainingSamples: number;
  features: string[];
  accuracy: number;       // training accuracy 0–1
  precision: number;      // precision on training set
  recall: number;         // recall on training set
  f1: number;             // F1 on training set
  label: string;          // description of the binary label
  disclaimer: string;
}

export interface MLHealthPrediction {
  animalId: string;
  riskProbability: number;       // 0–1 from logistic regression
  riskPercent: number;           // 0–100
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  trend: 'Improving' | 'Stable' | 'Worsening';
  topFactors: { feature: string; label: string; contribution: number; direction: 'up' | 'down' | 'neutral' }[];
  confidence: number;            // 0–100
  modelVersion: string;
  predictedAt: string;
  sufficientData: boolean;
  modelMeta: MLModelMeta | null;
  // Combined with vet rules
  vetRuleScore: number;
  combinedAssessment: 'Watch' | 'Monitor' | 'Alert' | 'Critical';
  explanation: string;
}

// ─── Feature engineering ──────────────────────────────────────────────────────

function compute7DayTempAvg(
  animalId: string,
  beforeDate: string,
  records: HealthRecord[],
): number {
  const cutoff = new Date(beforeDate);
  const weekAgo = new Date(cutoff);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recent = records.filter((r) =>
    r.animal_id === animalId &&
    r.temperature !== null &&
    new Date(r.record_date) >= weekAgo &&
    new Date(r.record_date) < cutoff,
  );

  if (recent.length === 0) return 39.0; // default normal
  const sum = recent.reduce((s, r) => s + (r.temperature ?? 39.0), 0);
  return sum / recent.length;
}

function computeWeightChangePct(
  animalId: string,
  weightRecords: WeightRecord[],
): number {
  const sorted = [...weightRecords.filter((w) => w.animal_id === animalId)]
    .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());

  if (sorted.length < 2) return 0;
  const prev = Number(sorted[sorted.length - 2].weight_kg);
  const curr = Number(sorted[sorted.length - 1].weight_kg);
  if (prev <= 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function countRecentHighRisk(
  animalId: string,
  beforeDate: string,
  records: HealthRecord[],
  days: number = 14,
): number {
  const cutoff = new Date(beforeDate);
  const since = new Date(cutoff);
  since.setDate(since.getDate() - days);
  return records.filter(
    (r) =>
      r.animal_id === animalId &&
      r.risk_score >= 60 &&
      new Date(r.record_date) >= since &&
      new Date(r.record_date) < cutoff,
  ).length;
}

export function buildExtendedFeatures(
  record: HealthRecord,
  animal: Animal,
  allRecords: HealthRecord[],
  weightRecords: WeightRecord[],
): ExtendedHealthFeatures {
  const ageMonths = animal.date_of_birth ? monthsSince(animal.date_of_birth) : 12;
  const recentConcerning = allRecords
    .filter(
      (r) =>
        r.animal_id === record.animal_id &&
        r.record_date < record.record_date &&
        r.risk_score >= 30,
    ).length;

  const temp7dAvg = compute7DayTempAvg(record.animal_id, record.record_date, allRecords);
  const currentTemp = record.temperature ?? 39.0;
  const tempTrend = currentTemp - temp7dAvg;
  const weightChangePct = computeWeightChangePct(record.animal_id, weightRecords);
  const recentHighRisk = countRecentHighRisk(record.animal_id, record.record_date, allRecords);

  return {
    temperature: currentTemp,
    heart_rate: record.heart_rate ?? 75,
    appetite_reduced: record.appetite === 'Reduced' ? 1 : 0,
    appetite_none: record.appetite === 'None' ? 1 : 0,
    activity_low: record.activity_level === 'Low' ? 1 : 0,
    activity_lethargic: record.activity_level === 'Lethargic' ? 1 : 0,
    cough: record.cough ? 1 : 0,
    diarrhea: record.diarrhea ? 1 : 0,
    nasal_discharge: record.nasal_discharge ? 1 : 0,
    eye_abnormal: record.eye_condition !== 'Normal' ? 1 : 0,
    body_poor: record.body_condition === 'Poor' ? 1 : 0,
    body_fair: record.body_condition === 'Fair' ? 1 : 0,
    age_months: ageMonths,
    recent_concerning: recentConcerning,
    // v2 time-based
    temp_7d_avg: temp7dAvg,
    temp_trend: tempTrend,
    weight_change_pct: weightChangePct,
    recent_high_risk_count: recentHighRisk,
  };
}

// ─── Train enhanced model ─────────────────────────────────────────────────────

export interface EnhancedMLModel {
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  trainingSamples: number;
  trainedAt: string;
  version: string;
  featureNames: string[];
}

export function trainEnhancedHealthModel(
  records: HealthRecord[],
  animals: Animal[],
  weightRecords: WeightRecord[],
): EnhancedMLModel | null {
  if (records.length < 5) return null;

  // Build training rows using extended features
  const rows: (HealthTrainingRow & { extFeatures: ExtendedHealthFeatures })[] = records.map((r) => {
    const animal = animals.find((a) => a.id === r.animal_id);
    if (!animal) {
      const features: ExtendedHealthFeatures = {
        temperature: r.temperature ?? 39.0,
        heart_rate: r.heart_rate ?? 75,
        appetite_reduced: r.appetite === 'Reduced' ? 1 : 0,
        appetite_none: r.appetite === 'None' ? 1 : 0,
        activity_low: r.activity_level === 'Low' ? 1 : 0,
        activity_lethargic: r.activity_level === 'Lethargic' ? 1 : 0,
        cough: r.cough ? 1 : 0,
        diarrhea: r.diarrhea ? 1 : 0,
        nasal_discharge: r.nasal_discharge ? 1 : 0,
        eye_abnormal: r.eye_condition !== 'Normal' ? 1 : 0,
        body_poor: r.body_condition === 'Poor' ? 1 : 0,
        body_fair: r.body_condition === 'Fair' ? 1 : 0,
        age_months: 12,
        recent_concerning: 0,
        temp_7d_avg: 39.0,
        temp_trend: 0,
        weight_change_pct: 0,
        recent_high_risk_count: 0,
      };
      return { features, extFeatures: features, label: r.risk_score >= 50 ? 1 : 0 };
    }
    const ext = buildExtendedFeatures(r, animal, records, weightRecords);
    return { features: ext as HealthFeatures, extFeatures: ext, label: r.risk_score >= 50 ? 1 : 0 };
  });

  // Use time-based train/test split to prevent data leakage
  const sorted = [...rows].sort((a, b) => 0); // already time-ordered from DB
  const splitAt = Math.floor(sorted.length * 0.8);
  const trainRows = sorted.slice(0, splitAt);
  const testRows = sorted.slice(splitAt);

  if (trainRows.length < 3) {
    // Not enough for split — train on all data (note in meta)
    const base = trainLogisticRegression(rows, { epochs: 400, learningRate: 0.05, l2Reg: 0.01 });
    return {
      ...base,
      precision: base.accuracy,
      recall: base.accuracy,
      f1: base.accuracy,
      trainingSamples: rows.length,
      trainedAt: new Date().toISOString(),
      version: '2.0',
      featureNames: EXTENDED_FEATURE_NAMES as string[],
    };
  }

  const base = trainLogisticRegression(trainRows, { epochs: 400, learningRate: 0.05, l2Reg: 0.01 });

  // Evaluate on test set
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const row of testRows) {
    const raw = EXTENDED_FEATURE_NAMES.map((fn, j) =>
      (row.features[fn as keyof HealthFeatures] - base.mean[j]) / (base.std[j] || 1),
    );
    let z = base.bias;
    for (let j = 0; j < raw.length; j++) z += base.weights[j] * raw[j];
    const prob = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
    const pred = prob >= 0.5 ? 1 : 0;
    if (pred === 1 && row.label === 1) tp++;
    else if (pred === 1 && row.label === 0) fp++;
    else if (pred === 0 && row.label === 0) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  return {
    ...base,
    precision: +precision.toFixed(3),
    recall: +recall.toFixed(3),
    f1: +f1.toFixed(3),
    trainingSamples: rows.length,
    trainedAt: new Date().toISOString(),
    version: '2.0',
    featureNames: EXTENDED_FEATURE_NAMES as string[],
  };
}

// ─── Risk level from probability ──────────────────────────────────────────────

export function riskLevelFromProb(p: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
  if (p >= 0.80) return 'Critical';
  if (p >= 0.60) return 'High';
  if (p >= 0.30) return 'Moderate';
  return 'Low';
}

// ─── Human-readable feature labels ───────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  temperature: 'Body Temperature',
  heart_rate: 'Heart Rate',
  appetite_reduced: 'Reduced Appetite',
  appetite_none: 'No Appetite',
  activity_low: 'Low Activity',
  activity_lethargic: 'Lethargy',
  cough: 'Coughing',
  diarrhea: 'Diarrhea',
  nasal_discharge: 'Nasal Discharge',
  eye_abnormal: 'Eye Abnormality',
  body_poor: 'Poor Body Condition',
  body_fair: 'Fair Body Condition',
  age_months: 'Age (months)',
  recent_concerning: 'Prior Health Issues',
  temp_7d_avg: '7-Day Avg Temperature',
  temp_trend: 'Temperature Trend',
  weight_change_pct: 'Weight Change %',
  recent_high_risk_count: 'Recent High-Risk Records',
};

// ─── Compute trend from probability history ───────────────────────────────────

export function computeHealthTrend(
  probHistory: number[],
): 'Improving' | 'Stable' | 'Worsening' {
  if (probHistory.length < 2) return 'Stable';
  const recent = probHistory.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const delta = last - first;
  if (delta > 0.08) return 'Worsening';
  if (delta < -0.08) return 'Improving';
  return 'Stable';
}

// ─── Full prediction ──────────────────────────────────────────────────────────

export function runMLHealthPrediction(
  record: HealthRecord,
  animal: Animal,
  allRecords: HealthRecord[],
  weightRecords: WeightRecord[],
  model: EnhancedMLModel,
): MLHealthPrediction {
  const features = buildExtendedFeatures(record, animal, allRecords, weightRecords);

  // Run inference using existing predictHealthRisk
  const result = predictHealthRisk(features as HealthFeatures, model);

  const riskLevel = riskLevelFromProb(result.probability);
  const riskPercent = Math.round(result.probability * 100);

  // Build human-readable top factors
  const topFactors = result.featureImportance
    .filter((f) => Math.abs(f.contribution) > 0.01)
    .slice(0, 5)
    .map((f) => ({
      feature: f.feature,
      label: FEATURE_LABELS[f.feature] ?? f.feature,
      contribution: +f.contribution.toFixed(3),
      direction: f.contribution > 0 ? 'up' as const : f.contribution < 0 ? 'down' as const : 'neutral' as const,
    }));

  // Compute trend from past predictions for this animal
  const animalHistory = [...allRecords]
    .filter((r) => r.animal_id === record.animal_id)
    .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime())
    .slice(-5)
    .map((r) => r.risk_score / 100);
  const trend = computeHealthTrend([...animalHistory, result.probability]);

  // Combined assessment: ML + vet rule score
  const vetScore = record.risk_score;
  const combined = Math.round(vetScore * 0.55 + riskPercent * 0.45);
  let combinedAssessment: MLHealthPrediction['combinedAssessment'] = 'Watch';
  if (combined >= 80) combinedAssessment = 'Critical';
  else if (combined >= 60) combinedAssessment = 'Alert';
  else if (combined >= 30) combinedAssessment = 'Monitor';

  // Explanation
  const topFactorNames = topFactors.slice(0, 3).map((f) => f.label).join(', ');
  let explanation = `AlpasFarm ML model (v${model.version}) assessed `;
  explanation += `${animal.name} with ${Math.round(result.probability * 100)}% illness risk probability. `;
  if (topFactors.length > 0) explanation += `Key factors: ${topFactorNames}. `;
  explanation += `Veterinary rule score: ${vetScore}/100. `;
  explanation += `Combined assessment: ${combinedAssessment}. `;
  explanation += `This is a farm management support tool, not a veterinary diagnosis. Consult a veterinarian for confirmation.`;

  const modelMeta: MLModelMeta = {
    version: model.version,
    trainedAt: model.trainedAt,
    trainingSamples: model.trainingSamples,
    features: model.featureNames,
    accuracy: +model.accuracy.toFixed(3),
    precision: model.precision,
    recall: model.recall,
    f1: model.f1,
    label: 'Binary: risk_score ≥ 50 → at-risk (1), else healthy (0)',
    disclaimer: 'Labels derived from veterinary rule engine, not clinician annotations. For farm management support only.',
  };

  return {
    animalId: record.animal_id,
    riskProbability: +result.probability.toFixed(4),
    riskPercent,
    riskLevel,
    trend,
    topFactors,
    confidence: result.confidence,
    modelVersion: model.version,
    predictedAt: new Date().toISOString(),
    sufficientData: true,
    modelMeta,
    vetRuleScore: vetScore,
    combinedAssessment,
    explanation,
  };
}

// ─── Summary for early warning list ──────────────────────────────────────────

export interface EarlyWarning {
  animal: Animal;
  latestRecord: HealthRecord;
  prediction: MLHealthPrediction;
  priority: number; // 0–100, for sorting
}

export function buildEarlyWarnings(
  animals: Animal[],
  records: HealthRecord[],
  weightRecords: WeightRecord[],
  model: EnhancedMLModel,
): EarlyWarning[] {
  const warnings: EarlyWarning[] = [];

  for (const animal of animals.filter((a) => !a.archived)) {
    const animalRecords = records
      .filter((r) => r.animal_id === animal.id)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());

    if (animalRecords.length === 0) continue;
    const latest = animalRecords[0];

    const prediction = runMLHealthPrediction(latest, animal, records, weightRecords, model);

    // Only surface animals with Moderate or higher ML risk
    if (prediction.riskProbability >= 0.30 || latest.risk_score >= 30) {
      const priority = Math.round(
        prediction.riskProbability * 60 + (latest.risk_score / 100) * 40,
      );
      warnings.push({ animal, latestRecord: latest, prediction, priority });
    }
  }

  return warnings.sort((a, b) => b.priority - a.priority);
}
