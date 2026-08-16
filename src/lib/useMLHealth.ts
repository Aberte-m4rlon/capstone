/**
 * useMLHealth.ts — React hooks for enhanced ML health risk prediction.
 *
 * Trains the enhanced logistic regression model on the user's historical
 * health records (with time-series features) and exposes prediction functions.
 */
import { useMemo } from 'react';
import { useFarmData } from './useFarmData';
import {
  trainEnhancedHealthModel,
  runMLHealthPrediction,
  buildEarlyWarnings,
  type EnhancedMLModel,
  type MLHealthPrediction,
  type EarlyWarning,
} from './mlHealth';
import type { HealthRecord } from '../types';

// ── Train the enhanced health risk model ──────────────────────────────────────

export function useEnhancedHealthModel(): {
  model: EnhancedMLModel | null;
  canPredict: boolean;
  trainingSamples: number;
  accuracy: number;
  recall: number;
  f1: number;
} {
  const farmData = useFarmData();

  return useMemo(() => {
    const records = farmData.healthRecords;
    if (records.length < 5) {
      return { model: null, canPredict: false, trainingSamples: records.length, accuracy: 0, recall: 0, f1: 0 };
    }

    const model = trainEnhancedHealthModel(records, farmData.animals, farmData.weightRecords);
    if (!model) {
      return { model: null, canPredict: false, trainingSamples: records.length, accuracy: 0, recall: 0, f1: 0 };
    }

    return {
      model,
      canPredict: true,
      trainingSamples: model.trainingSamples,
      accuracy: model.accuracy,
      recall: model.recall,
      f1: model.f1,
    };
  }, [farmData.healthRecords, farmData.animals, farmData.weightRecords]);
}

// ── Predict for a single animal's latest record ───────────────────────────────

export function useAnimalMLPrediction(animalId: string | null): MLHealthPrediction | null {
  const farmData = useFarmData();
  const { model } = useEnhancedHealthModel();

  return useMemo(() => {
    if (!animalId || !model) return null;

    const animal = farmData.animals.find((a) => a.id === animalId);
    if (!animal) return null;

    const animalRecords = farmData.healthRecords
      .filter((r) => r.animal_id === animalId)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());

    if (animalRecords.length === 0) return null;

    return runMLHealthPrediction(
      animalRecords[0],
      animal,
      farmData.healthRecords,
      farmData.weightRecords,
      model,
    );
  }, [animalId, model, farmData.healthRecords, farmData.animals, farmData.weightRecords]);
}

// ── Predict for a specific health record ─────────────────────────────────────

export function useRecordMLPrediction(record: HealthRecord | null): MLHealthPrediction | null {
  const farmData = useFarmData();
  const { model } = useEnhancedHealthModel();

  return useMemo(() => {
    if (!record || !model) return null;

    const animal = farmData.animals.find((a) => a.id === record.animal_id);
    if (!animal) return null;

    return runMLHealthPrediction(
      record,
      animal,
      farmData.healthRecords,
      farmData.weightRecords,
      model,
    );
  }, [record, model, farmData.healthRecords, farmData.animals, farmData.weightRecords]);
}

// ── Early warning list for all animals ───────────────────────────────────────

export function useEarlyWarnings(): {
  warnings: EarlyWarning[];
  canPredict: boolean;
  modelAccuracy: number;
  trainingSamples: number;
} {
  const farmData = useFarmData();
  const { model, canPredict, accuracy, trainingSamples } = useEnhancedHealthModel();

  const warnings = useMemo(() => {
    if (!model) return [];
    return buildEarlyWarnings(
      farmData.animals,
      farmData.healthRecords,
      farmData.weightRecords,
      model,
    );
  }, [model, farmData.animals, farmData.healthRecords, farmData.weightRecords]);

  return { warnings, canPredict, modelAccuracy: accuracy, trainingSamples };
}

// ── Risk probability history for a single animal (for trend chart) ───────────

export function useAnimalRiskHistory(animalId: string | null): {
  dates: string[];
  probabilities: number[];
  riskScores: number[];
} {
  const farmData = useFarmData();
  const { model } = useEnhancedHealthModel();

  return useMemo(() => {
    if (!animalId || !model) return { dates: [], probabilities: [], riskScores: [] };

    const animal = farmData.animals.find((a) => a.id === animalId);
    if (!animal) return { dates: [], probabilities: [], riskScores: [] };

    const sorted = [...farmData.healthRecords.filter((r) => r.animal_id === animalId)]
      .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());

    const dates: string[] = [];
    const probabilities: number[] = [];
    const riskScores: number[] = [];

    for (const record of sorted) {
      const pred = runMLHealthPrediction(record, animal, farmData.healthRecords, farmData.weightRecords, model);
      dates.push(record.record_date);
      probabilities.push(Math.round(pred.riskProbability * 100));
      riskScores.push(record.risk_score);
    }

    return { dates, probabilities, riskScores };
  }, [animalId, model, farmData.healthRecords, farmData.animals, farmData.weightRecords]);
}

// ── Dashboard summary stats ───────────────────────────────────────────────────

export function useMLHealthSummary() {
  const farmData = useFarmData();
  const { warnings, canPredict, modelAccuracy, trainingSamples } = useEarlyWarnings();

  return useMemo(() => {
    const active = farmData.animals.filter((a) => !a.archived);

    const monitored = active.length;
    const healthy = active.filter((a) => a.health_status === 'Healthy').length;
    const atRisk = active.filter((a) => a.health_status === 'Monitor' || a.health_status === 'At Risk').length;
    const highRisk = active.filter((a) => a.health_risk_score >= 60).length;
    const critical = active.filter((a) => a.health_status === 'Critical').length;

    const mlCritical = warnings.filter((w) => w.prediction.riskLevel === 'Critical').length;
    const mlHigh = warnings.filter((w) => w.prediction.riskLevel === 'High').length;

    return {
      monitored, healthy, atRisk, highRisk, critical,
      mlCritical, mlHigh,
      canPredict,
      modelAccuracy,
      trainingSamples,
      warningCount: warnings.length,
      topWarnings: warnings.slice(0, 5),
    };
  }, [farmData.animals, warnings, canPredict, modelAccuracy, trainingSamples]);
}
