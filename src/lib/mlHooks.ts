import { useMemo } from 'react';
import { useFarmData } from './useFarmData';
import type { HealthRecord, WeightRecord, Animal, FeedRecord, MilkRecord, BreedingRecord } from '../types';
import {
  trainLogisticRegression,
  predictHealthRisk,
  fitPolynomialRegression,
  holtExponentialSmoothing,
  detectAnomaly,
  kmeansCluster,
  trainNaiveBayesBreeding,
  predictBreedingSuccess,
  trainFeedRegression,
  predictWeightGain,
  type HealthFeatures,
  type HealthTrainingRow,
  type LogisticRegressionResult,
  type GrowthModelResult,
  type HoltForecastResult,
  type AnomalyResult,
  type ClusterResult,
  type BreedingPrediction,
  type FeedPredictionResult,
} from './ml';
import { monthsSince } from './analytics';

// ============================================================
// Hook: ML Health Risk Model
// ============================================================

export function useHealthRiskModel() {
  const farmData = useFarmData();

  return useMemo(() => {
    const records = farmData.healthRecords;
    if (records.length < 2) {
      return { model: null, canPredict: false, trainingSamples: 0, accuracy: 0 };
    }

    // Build training data from historical records
    const trainingRows: HealthTrainingRow[] = records.map((r) => {
      const animal = farmData.animals.find((a) => a.id === r.animal_id);
      const ageMonths = animal?.date_of_birth ? monthsSince(animal.date_of_birth) : 12;
      const recentConcerning = records
        .filter((rr) => rr.animal_id === r.animal_id && rr.record_date < r.record_date && rr.risk_score >= 30)
        .length;

      const features: HealthFeatures = {
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
        age_months: ageMonths,
        recent_concerning: recentConcerning,
      };

      return { features, label: r.risk_score >= 50 ? 1 : 0 };
    });

    const model = trainLogisticRegression(trainingRows, { epochs: 300, learningRate: 0.05 });
    return {
      model,
      canPredict: true,
      trainingSamples: trainingRows.length,
      accuracy: model.accuracy,
    };
  }, [farmData.healthRecords, farmData.animals]);
}

export function usePredictHealthRisk(
  features: HealthFeatures,
): LogisticRegressionResult | null {
  const { model, canPredict } = useHealthRiskModel();

  return useMemo(() => {
    if (!canPredict || !model || model.weights.length === 0) return null;
    return predictHealthRisk(features, model);
  }, [features, model, canPredict]);
}

// ============================================================
// Hook: ML Growth Prediction
// ============================================================

export function useGrowthPrediction(animalId: string | null) {
  const farmData = useFarmData();

  return useMemo(() => {
    if (!animalId) return null;
    const records = farmData.weightRecords.filter((w) => w.animal_id === animalId);
    if (records.length < 2) return null;

    const sorted = [...records].sort(
      (a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime(),
    );
    const firstDate = new Date(sorted[0].record_date).getTime();
    const points = sorted.map((r) => ({
      day: Math.round((new Date(r.record_date).getTime() - firstDate) / (1000 * 60 * 60 * 24)),
      weight: Number(r.weight_kg),
    }));

    const degree = points.length >= 4 ? 2 : 1;
    return fitPolynomialRegression(points, degree, 90);
  }, [animalId, farmData.weightRecords]);
}

// ============================================================
// Hook: ML Milk Yield Forecast
// ============================================================

export function useMilkForecast(animalId: string | null): HoltForecastResult | null {
  const farmData = useFarmData();

  return useMemo(() => {
    if (!animalId) return null;
    const records = farmData.milkRecords
      .filter((m) => m.animal_id === animalId)
      .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());
    if (records.length < 3) return null;

    const yields = records.map((r) => Number(r.yield_litres));
    return holtExponentialSmoothing(yields, 7);
  }, [animalId, farmData.milkRecords]);
}

// ============================================================
// Hook: Anomaly Detection for all animals
// ============================================================

export function useAnomalyDetection(): { animal: Animal; tempAnomaly: AnomalyResult | null; hrAnomaly: AnomalyResult | null }[] {
  const farmData = useFarmData();

  return useMemo(() => {
    return farmData.animals
      .filter((a) => !a.archived)
      .map((animal) => {
        const records = farmData.healthRecords.filter((r) => r.animal_id === animal.id);

        let tempAnomaly: AnomalyResult | null = null;
        let hrAnomaly: AnomalyResult | null = null;

        if (animal.current_temperature !== null) {
          const temps = records.map((r) => r.temperature).filter((t): t is number => t !== null);
          if (temps.length >= 3) {
            tempAnomaly = detectAnomaly(animal.current_temperature, temps, 'temperature');
          }
        }

        if (animal.current_heart_rate !== null) {
          const hrs = records.map((r) => r.heart_rate).filter((h): h is number => h !== null);
          if (hrs.length >= 3) {
            hrAnomaly = detectAnomaly(animal.current_heart_rate, hrs, 'heart_rate');
          }
        }

        return { animal, tempAnomaly, hrAnomaly };
      })
      .filter((x) => x.tempAnomaly?.isAnomaly || x.hrAnomaly?.isAnomaly);
  }, [farmData.animals, farmData.healthRecords]);
}

// ============================================================
// Hook: K-Means Clustering
// ============================================================

export function useAnimalClusters(): ClusterResult | null {
  const farmData = useFarmData();

  return useMemo(() => {
    const active = farmData.animals.filter((a) => !a.archived);
    if (active.length < 3) return null;

    const points = active.map((a) => ({
      id: a.id,
      name: a.name,
      features: [
        Number(a.weight_kg) || 0,
        a.date_of_birth ? monthsSince(a.date_of_birth) : 0,
        a.health_risk_score,
        a.species === 'Goat' ? 1 : 0,
      ],
    }));

    return kmeansCluster(points, Math.min(3, active.length), 100);
  }, [farmData.animals]);
}

// ============================================================
// Hook: Breeding Success Prediction
// ============================================================

export function useBreedingPrediction(
  animal: Animal | null,
): BreedingPrediction | null {
  const farmData = useFarmData();

  return useMemo(() => {
    if (!animal) return null;

    // Build training data from breeding history
    const breedingData = farmData.breedingRecords.map((r) => {
      const a = farmData.animals.find((an) => an.id === r.animal_id);
      const ageMonths = a?.date_of_birth ? monthsSince(a.date_of_birth) : 12;
      return {
        ageMonths,
        weightKg: Number(a?.weight_kg) || 30,
        healthStatus: a?.health_status ?? 'Healthy',
        species: a?.species ?? 'Goat',
        success: r.status === 'Pregnant' || r.status === 'Kidded',
      };
    });

    if (breedingData.length < 1) {
      // Use prior knowledge as fallback
      breedingData.push(
        { ageMonths: 12, weightKg: 35, healthStatus: 'Healthy', species: 'Goat', success: true },
        { ageMonths: 6, weightKg: 20, healthStatus: 'Healthy', species: 'Goat', success: false },
        { ageMonths: 18, weightKg: 40, healthStatus: 'Healthy', species: 'Goat', success: true },
        { ageMonths: 8, weightKg: 25, healthStatus: 'Monitor', species: 'Sheep', success: true },
        { ageMonths: 4, weightKg: 15, healthStatus: 'Healthy', species: 'Goat', success: false },
      );
    }

    const model = trainNaiveBayesBreeding(breedingData);
    const ageMonths = animal.date_of_birth ? monthsSince(animal.date_of_birth) : 12;
    return predictBreedingSuccess(
      ageMonths,
      Number(animal.weight_kg) || 30,
      animal.health_status,
      animal.species,
      model,
    );
  }, [animal, farmData.breedingRecords, farmData.animals]);
}

// ============================================================
// Hook: Feed-to-Weight-Gain Prediction
// ============================================================

export function useFeedPrediction(): { model: ReturnType<typeof trainFeedRegression>; predict: (feedKg: number) => FeedPredictionResult } | null {
  const farmData = useFarmData();

  return useMemo(() => {
    // Build training data: pair feed records with weight gains in same period
    const data: { feedKg: number; weightGain: number }[] = [];

    farmData.animals.filter((a) => !a.archived).forEach((animal) => {
      const feeds = farmData.feedRecords.filter((f) => f.animal_id === animal.id);
      const weights = farmData.weightRecords
        .filter((w) => w.animal_id === animal.id)
        .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());

      if (weights.length >= 2 && feeds.length > 0) {
        const totalFeed = feeds.reduce((s, f) => s + Number(f.quantity_kg), 0);
        const weightGain = Number(weights[weights.length - 1].weight_kg) - Number(weights[0].weight_kg);
        if (totalFeed > 0 && weightGain !== 0) {
          data.push({ feedKg: totalFeed, weightGain });
        }
      }
    });

    if (data.length < 2) return null;
    const model = trainFeedRegression(data);
    return {
      model,
      predict: (feedKg: number) => predictWeightGain(feedKg, model),
    };
  }, [farmData.animals, farmData.feedRecords, farmData.weightRecords]);
}

// ============================================================
// Hook: Comprehensive ML Insights for Dashboard
// ============================================================

export interface MLInsights {
  healthModel: { accuracy: number; trainingSamples: number; canPredict: boolean } | null;
  anomalies: { animal: Animal; tempAnomaly: AnomalyResult | null; hrAnomaly: AnomalyResult | null }[];
  clusters: ClusterResult | null;
  feedPrediction: { rSquared: number; slope: number; canPredict: boolean } | null;
  growthPredictions: { animalId: string; animalName: string; model: GrowthModelResult | null }[];
  milkForecasts: { animalId: string; animalName: string; forecast: HoltForecastResult | null }[];
  breedingPredictions: { animal: Animal; prediction: BreedingPrediction | null }[];
  totalInsights: number;
}

export function useMLInsights(): MLInsights {
  const farmData = useFarmData();
  const healthModelHook = useHealthRiskModel();
  const anomalies = useAnomalyDetection();
  const clusters = useAnimalClusters();
  const feedPred = useFeedPrediction();

  return useMemo(() => {
    const activeAnimals = farmData.animals.filter((a) => !a.archived);

    const growthPredictions = activeAnimals.map((a) => {
      const records = farmData.weightRecords.filter((w) => w.animal_id === a.id);
      if (records.length < 2) return { animalId: a.id, animalName: a.name, model: null };
      const sorted = [...records].sort((x, y) => new Date(x.record_date).getTime() - new Date(y.record_date).getTime());
      const firstDate = new Date(sorted[0].record_date).getTime();
      const points = sorted.map((r) => ({
        day: Math.round((new Date(r.record_date).getTime() - firstDate) / (1000 * 60 * 60 * 24)),
        weight: Number(r.weight_kg),
      }));
      return { animalId: a.id, animalName: a.name, model: fitPolynomialRegression(points, points.length >= 4 ? 2 : 1, 90) };
    });

    const milkForecasts = activeAnimals
      .filter((a) => a.sex === 'Female')
      .map((a) => {
        const records = farmData.milkRecords
          .filter((m) => m.animal_id === a.id)
          .sort((x, y) => new Date(x.record_date).getTime() - new Date(y.record_date).getTime());
        if (records.length < 3) return { animalId: a.id, animalName: a.name, forecast: null };
        return { animalId: a.id, animalName: a.name, forecast: holtExponentialSmoothing(records.map((r) => Number(r.yield_litres)), 7) };
      });

    const breedingData = farmData.breedingRecords.map((r) => {
      const animal = farmData.animals.find((a) => a.id === r.animal_id);
      return {
        ageMonths: animal?.date_of_birth ? monthsSince(animal.date_of_birth) : 12,
        weightKg: Number(animal?.weight_kg) || 30,
        healthStatus: animal?.health_status ?? 'Healthy',
        species: animal?.species ?? 'Goat',
        success: r.status === 'Pregnant' || r.status === 'Kidded',
      };
    });

    const breedingPredictions = activeAnimals
      .filter((a) => a.sex === 'Female' && a.breeding_status !== 'Pregnant')
      .map((animal) => {
        const trainingData = breedingData.length >= 1 ? breedingData : [
          { ageMonths: 12, weightKg: 35, healthStatus: 'Healthy', species: 'Goat', success: true },
          { ageMonths: 6, weightKg: 20, healthStatus: 'Healthy', species: 'Goat', success: false },
          { ageMonths: 18, weightKg: 40, healthStatus: 'Healthy', species: 'Goat', success: true },
        ];
        const model = trainNaiveBayesBreeding(trainingData);
        return {
          animal,
          prediction: predictBreedingSuccess(
            animal.date_of_birth ? monthsSince(animal.date_of_birth) : 12,
            Number(animal.weight_kg) || 30,
            animal.health_status,
            animal.species,
            model,
          ),
        };
      });

    const totalInsights =
      (healthModelHook.canPredict ? 1 : 0) +
      anomalies.length +
      (clusters ? 1 : 0) +
      (feedPred ? 1 : 0) +
      growthPredictions.filter((g) => g.model).length +
      milkForecasts.filter((m) => m.forecast).length +
      breedingPredictions.filter((b) => b.prediction).length;

    return {
      healthModel: {
        accuracy: healthModelHook.accuracy,
        trainingSamples: healthModelHook.trainingSamples,
        canPredict: healthModelHook.canPredict,
      },
      anomalies,
      clusters,
      feedPrediction: feedPred ? { rSquared: feedPred.model.rSquared, slope: feedPred.model.slope, canPredict: true } : null,
      growthPredictions,
      milkForecasts,
      breedingPredictions,
      totalInsights,
    };
  }, [farmData, healthModelHook, anomalies, clusters, feedPred]);
}
