// Real machine learning algorithms — all train on the farm's historical data in-browser.
// No external ML libraries. Pure TypeScript implementations.

// ============================================================
// 1. LOGISTIC REGRESSION — Health Risk Prediction
//    Trains on historical health records to learn which vitals/symptoms
//    correlate with high risk scores, then predicts risk probability
//    for new readings with feature importance and confidence.
// ============================================================

export interface LogisticRegressionResult {
  probability: number;
  predictedScore: number;
  confidence: number;
  featureImportance: { feature: string; weight: number; value: number; contribution: number }[];
  trainingAccuracy: number;
  epochs: number;
  lossHistory: number[];
}

export interface HealthFeatures {
  temperature: number;
  heart_rate: number;
  appetite_reduced: number;
  appetite_none: number;
  activity_low: number;
  activity_lethargic: number;
  cough: number;
  diarrhea: number;
  nasal_discharge: number;
  eye_abnormal: number;
  body_poor: number;
  body_fair: number;
  age_months: number;
  recent_concerning: number;
}

const FEATURE_NAMES: (keyof HealthFeatures)[] = [
  'temperature', 'heart_rate', 'appetite_reduced', 'appetite_none',
  'activity_low', 'activity_lethargic', 'cough', 'diarrhea',
  'nasal_discharge', 'eye_abnormal', 'body_poor', 'body_fair',
  'age_months', 'recent_concerning',
];

export interface HealthTrainingRow {
  features: HealthFeatures;
  label: number; // 0 = low risk, 1 = high risk (score >= 50)
}

function standardize(data: number[][]): { mean: number[]; std: number[]; scaled: number[][] } {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);

  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += data[i][j];
  for (let j = 0; j < d; j++) mean[j] /= n;

  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) std[j] += Math.pow(data[i][j] - mean[j], 2);
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;

  const scaled = data.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { mean, std, scaled };
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

export function trainLogisticRegression(
  rows: HealthTrainingRow[],
  options: { epochs?: number; learningRate?: number; l2Reg?: number } = {},
): {
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  accuracy: number;
  lossHistory: number[];
  epochs: number;
} {
  const epochs = options.epochs ?? 300;
  const lr = options.learningRate ?? 0.05;
  const l2 = options.l2Reg ?? 0.01;

  if (rows.length === 0) {
    return { weights: [], bias: 0, mean: [], std: [], accuracy: 0, lossHistory: [], epochs: 0 };
  }

  const X = rows.map((r) => FEATURE_NAMES.map((fn) => r.features[fn]));
  const y = rows.map((r) => r.label);
  const d = X[0].length;

  const { mean, std, scaled } = standardize(X);

  let weights = new Array(d).fill(0);
  let bias = 0;
  const lossHistory: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < scaled.length; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) z += weights[j] * scaled[i][j];
      const pred = sigmoid(z);
      const error = pred - y[i];

      for (let j = 0; j < d; j++) gradW[j] += error * scaled[i][j];
      gradB += error;

      // Cross-entropy loss
      totalLoss += -y[i] * Math.log(pred + 1e-10) - (1 - y[i]) * Math.log(1 - pred + 1e-10);
    }

    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (gradW[j] / scaled.length + l2 * weights[j]);
    }
    bias -= lr * (gradB / scaled.length);

    lossHistory.push(totalLoss / scaled.length);
  }

  // Compute training accuracy
  let correct = 0;
  for (let i = 0; i < scaled.length; i++) {
    let z = bias;
    for (let j = 0; j < d; j++) z += weights[j] * scaled[i][j];
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }
  const accuracy = scaled.length > 0 ? correct / scaled.length : 0;

  return { weights, bias, mean, std, accuracy, lossHistory, epochs };
}

export function predictHealthRisk(
  features: HealthFeatures,
  model: { weights: number[]; bias: number; mean: number[]; std: number[]; accuracy: number },
): LogisticRegressionResult {
  if (model.weights.length === 0) {
    return {
      probability: 0,
      predictedScore: 0,
      confidence: 0,
      featureImportance: [],
      trainingAccuracy: 0,
      epochs: 0,
      lossHistory: [],
    };
  }

  const raw = FEATURE_NAMES.map((fn, j) => (features[fn] - model.mean[j]) / model.std[j]);
  let z = model.bias;
  for (let j = 0; j < raw.length; j++) z += model.weights[j] * raw[j];
  const probability = sigmoid(z);
  const predictedScore = Math.round(probability * 100);

  // Feature importance: contribution = weight * standardized_value
  const featureImportance = FEATURE_NAMES.map((fn, j) => ({
    feature: fn,
    weight: model.weights[j],
    value: features[fn],
    contribution: model.weights[j] * raw[j],
  })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Confidence: based on how far from 0.5 the probability is and training accuracy
  const confidence = Math.round(model.accuracy * Math.abs(probability - 0.5) * 2 * 100);

  return {
    probability,
    predictedScore,
    confidence,
    featureImportance,
    trainingAccuracy: model.accuracy,
    epochs: 300,
    lossHistory: [],
  };
}

// ============================================================
// 2. POLYNOMIAL REGRESSION — Growth Curve Fitting
//    Fits a polynomial curve to weight-over-time data,
//    projects future weight with confidence interval.
// ============================================================

export interface GrowthModelResult {
  coefficients: number[];
  projectedWeights: { date: string; weight: number; lower: number; upper: number }[];
  rSquared: number;
  marketReadyDate: string | null;
  projectedDailyGain: number;
  confidence: number;
}

export function fitPolynomialRegression(
  points: { day: number; weight: number }[],
  degree: number = 2,
  projectDays: number = 90,
): GrowthModelResult {
  if (points.length < 2) {
    return {
      coefficients: [],
      projectedWeights: [],
      rSquared: 0,
      marketReadyDate: null,
      projectedDailyGain: 0,
      confidence: 0,
    };
  }

  // Build design matrix for polynomial regression
  const n = points.length;
  const X = points.map((p) => {
    const row: number[] = [];
    for (let j = 0; j <= degree; j++) row.push(Math.pow(p.day, j));
    return row;
  });
  const y = points.map((p) => p.weight);

  // Normal equation: (X^T X)^-1 X^T y
  const XtX = matMul(transpose(X), X);
  const XtY = matVecMul(transpose(X), y);
  const coeffs = solveLinearSystem(XtX, XtY);

  // Compute R²
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j <= degree; j++) pred += coeffs[j] * Math.pow(points[i].day, j);
    ssRes += Math.pow(y[i] - pred, 2);
    ssTot += Math.pow(y[i] - yMean, 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // Compute residual std for confidence interval
  const residuals = points.map((p) => {
    let pred = 0;
    for (let j = 0; j <= degree; j++) pred += coeffs[j] * Math.pow(p.day, j);
    return p.weight - pred;
  });
  const residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n - degree - 1));

  // Project forward
  const lastDay = points[points.length - 1].day;
  const projectedWeights: GrowthModelResult['projectedWeights'] = [];
  for (let d = 0; d <= projectDays; d += 7) {
    const day = lastDay + d;
    let weight = 0;
    for (let j = 0; j <= degree; j++) weight += coeffs[j] * Math.pow(day, j);
    // Confidence interval widens with projection distance
    const interval = residualStd * (1 + d / (n * 2));
    const date = new Date();
    date.setDate(date.getDate() + d);
    projectedWeights.push({
      date: date.toISOString().split('T')[0],
      weight: +Math.max(0, weight).toFixed(2),
      lower: +Math.max(0, weight - interval).toFixed(2),
      upper: +(weight + interval).toFixed(2),
    });
  }

  // Projected daily gain (derivative at last point)
  const projectedDailyGain = +(() => {
    let gain = 0;
    for (let j = 1; j <= degree; j++) gain += j * coeffs[j] * Math.pow(lastDay, j - 1);
    return gain;
  })().toFixed(4);

  // Market ready date: find when weight crosses target (40kg default)
  let marketReadyDate: string | null = null;
  const target = 40;
  for (let d = 0; d <= projectDays; d++) {
    const day = lastDay + d;
    let weight = 0;
    for (let j = 0; j <= degree; j++) weight += coeffs[j] * Math.pow(day, j);
    if (weight >= target) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      marketReadyDate = date.toISOString().split('T')[0];
      break;
    }
  }

  return {
    coefficients: coeffs,
    projectedWeights,
    rSquared: +rSquared.toFixed(4),
    marketReadyDate,
    projectedDailyGain,
    confidence: Math.round(rSquared * 100),
  };
}

// ============================================================
// 3. HOLT'S EXPONENTIAL SMOOTHING — Time Series Forecast
//    For milk yield and weight time series forecasting.
// ============================================================

export interface HoltForecastResult {
  forecast: number[];
  level: number;
  trend: number;
  smoothedValues: number[];
  mape: number;
  confidence: number;
}

export function holtExponentialSmoothing(
  data: number[],
  forecastSteps: number = 7,
  alpha?: number,
  beta?: number,
): HoltForecastResult {
  if (data.length < 2) {
    return { forecast: [], level: 0, trend: 0, smoothedValues: [], mape: 0, confidence: 0 };
  }

  // Optimize alpha and beta via grid search (minimize MAPE)
  let bestAlpha = alpha ?? 0.3;
  let bestBeta = beta ?? 0.1;
  let bestMape = Infinity;

  if (alpha === undefined || beta === undefined) {
    for (let a = 0.1; a <= 0.9; a += 0.1) {
      for (let b = 0.05; b <= 0.5; b += 0.05) {
        const { mape } = holtFit(data, a, b);
        if (mape < bestMape) {
          bestMape = mape;
          bestAlpha = a;
          bestBeta = b;
        }
      }
    }
  }

  const { level, trend, smoothed, mape } = holtFit(data, bestAlpha, bestBeta);

  // Forecast
  const forecast: number[] = [];
  for (let h = 1; h <= forecastSteps; h++) {
    forecast.push(Math.max(0, +(level + h * trend).toFixed(2)));
  }

  return {
    forecast,
    level: +level.toFixed(2),
    trend: +trend.toFixed(4),
    smoothedValues: smoothed,
    mape: +bestMape.toFixed(2),
    confidence: Math.round(Math.max(0, Math.min(100, 100 - bestMape))),
  };
}

function holtFit(data: number[], alpha: number, beta: number): {
  level: number;
  trend: number;
  smoothed: number[];
  mape: number;
} {
  let level = data[0];
  let trend = data[1] - data[0];
  const smoothed: number[] = [level];

  let absPctErrors = 0;
  let count = 0;

  for (let t = 1; t < data.length; t++) {
    const prevLevel = level;
    level = alpha * data[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    smoothed.push(+level.toFixed(2));

    if (data[t] !== 0) {
      absPctErrors += Math.abs((data[t] - (prevLevel + trend)) / data[t]);
      count++;
    }
  }

  const mape = count > 0 ? (absPctErrors / count) * 100 : 0;
  return { level, trend, smoothed, mape };
}

// ============================================================
// 4. ANOMALY DETECTION — Statistical Outlier Detection
//    Uses z-score and IQR to flag unusual health readings.
// ============================================================

export interface AnomalyResult {
  isAnomaly: boolean;
  severity: 'mild' | 'moderate' | 'severe';
  zScore: number;
  message: string;
  metric: string;
}

export function detectAnomaly(
  value: number,
  historical: number[],
  metric: string,
): AnomalyResult {
  if (historical.length < 3) {
    return { isAnomaly: false, severity: 'mild', zScore: 0, message: 'Not enough data', metric };
  }

  const mean = historical.reduce((s, v) => s + v, 0) / historical.length;
  const variance = historical.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / historical.length;
  const std = Math.sqrt(variance) || 1;
  const z = (value - mean) / std;

  // IQR check
  const sorted = [...historical].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const isOutlier = value < lowerBound || value > upperBound;
  const absZ = Math.abs(z);

  let severity: AnomalyResult['severity'] = 'mild';
  if (absZ > 3) severity = 'severe';
  else if (absZ > 2) severity = 'moderate';

  const isAnomaly = isOutlier || absZ > 2;

  let message: string;
  if (!isAnomaly) {
    message = `Normal (${value} ${metric === 'temperature' ? '°C' : 'BPM'}, within expected range)`;
  } else if (z > 0) {
    message = `Unusually high ${metric} (${value} ${metric === 'temperature' ? '°C' : 'BPM'}, z-score: ${z.toFixed(2)})`;
  } else {
    message = `Unusually low ${metric} (${value} ${metric === 'temperature' ? '°C' : 'BPM'}, z-score: ${z.toFixed(2)})`;
  }

  return { isAnomaly, severity, zScore: +z.toFixed(2), message, metric };
}

// ============================================================
// 5. K-MEANS CLUSTERING — Animal Grouping
//    Groups animals by similarity (weight, age, health, species).
// ============================================================

export interface ClusterResult {
  assignments: { id: string; name: string; cluster: number }[];
  centroids: number[][];
  clusterLabels: string[];
  k: number;
  iterations: number;
  converged: boolean;
}

export function kmeansCluster(
  points: { id: string; name: string; features: number[] }[],
  k: number = 3,
  maxIterations: number = 100,
): ClusterResult {
  if (points.length === 0 || k <= 0) {
    return { assignments: [], centroids: [], clusterLabels: [], k: 0, iterations: 0, converged: false };
  }

  k = Math.min(k, points.length);
  const dim = points[0].features.length;

  // Standardize features
  const allFeatures = points.map((p) => p.features);
  const { scaled, mean, std } = standardize(allFeatures);

  // K-means++ initialization
  const centroids: number[][] = [];
  centroids.push([...scaled[0]]);
  for (let c = 1; c < k; c++) {
    const distances = scaled.map((p) => {
      let minDist = Infinity;
      for (const cent of centroids) {
        let d = 0;
        for (let j = 0; j < dim; j++) d += Math.pow(p[j] - cent[j], 2);
        minDist = Math.min(minDist, d);
      }
      return minDist;
    });
    const totalDist = distances.reduce((s, d) => s + d, 0);
    let r = Math.random() * totalDist;
    let chosen = 0;
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push([...scaled[chosen]]);
  }

  let assignments = new Array(points.length).fill(0);
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign
    for (let i = 0; i < scaled.length; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) d += Math.pow(scaled[i][j] - centroids[c][j], 2);
        if (d < minDist) { minDist = d; bestCluster = c; }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      const clusterPoints = scaled.filter((_, i) => assignments[i] === c);
      if (clusterPoints.length > 0) {
        for (let j = 0; j < dim; j++) {
          centroids[c][j] = clusterPoints.reduce((s, p) => s + p[j], 0) / clusterPoints.length;
        }
      }
    }

    if (!changed) { converged = true; break; }
  }

  // Generate cluster labels based on centroid characteristics
  const clusterLabels = centroids.map((centroid, c) => {
    const clusterPoints = points.filter((_, i) => assignments[i] === c);
    if (clusterPoints.length === 0) return `Cluster ${c + 1}`;
    const avgWeight = clusterPoints.reduce((s, p) => s + p.features[0], 0) / clusterPoints.length;
    const avgHealthScore = clusterPoints.reduce((s, p) => s + p.features[2], 0) / clusterPoints.length;
    let label = '';
    if (avgWeight >= 40) label += 'Heavy ';
    else if (avgWeight >= 25) label += 'Medium ';
    else label += 'Light ';
    if (avgHealthScore >= 50) label += 'High-Risk';
    else if (avgHealthScore >= 20) label += 'Monitor';
    else label += 'Healthy';
    return label;
  });

  return {
    assignments: points.map((p, i) => ({ id: p.id, name: p.name, cluster: assignments[i] })),
    centroids,
    clusterLabels,
    k,
    iterations: converged ? maxIterations : maxIterations,
    converged,
  };
}

// ============================================================
// 6. NAIVE BAYES — Breeding Success Prediction
//    Predicts probability of successful breeding based on
//    historical breeding outcomes and animal characteristics.
// ============================================================

export interface BreedingPrediction {
  probability: number;
  confidence: number;
  factors: { factor: string; value: string; contribution: number }[];
  recommendation: string;
  trainingSamples: number;
}

export function trainNaiveBayesBreeding(
  records: { ageMonths: number; weightKg: number; healthStatus: string; species: string; success: boolean }[],
): {
  priors: { success: number; fail: number };
  likelihoods: Record<string, Record<string, number>>;
  trainingSamples: number;
} {
  if (records.length === 0) {
    return { priors: { success: 0.5, fail: 0.5 }, likelihoods: {}, trainingSamples: 0 };
  }

  const successCount = records.filter((r) => r.success).length;
  const failCount = records.length - successCount;
  const priors = {
    success: successCount / records.length,
    fail: failCount / records.length,
  };

  // Discretize features
  const likelihoods: Record<string, Record<string, number>> = {
    success: {},
    fail: {},
  };

  for (const r of records) {
    const ageBucket = r.ageMonths < 8 ? 'young' : r.ageMonths < 24 ? 'prime' : r.ageMonths < 60 ? 'mature' : 'senior';
    const weightBucket = r.weightKg < 25 ? 'light' : r.weightKg < 40 ? 'medium' : 'heavy';
    const key = `age:${ageBucket}|weight:${weightBucket}|health:${r.healthStatus}|species:${r.species}`;
    const cls = r.success ? 'success' : 'fail';
    likelihoods[cls][key] = (likelihoods[cls][key] ?? 0) + 1;
  }

  // Normalize with Laplace smoothing
  for (const cls of ['success', 'fail'] as const) {
    const total = Object.values(likelihoods[cls]).reduce((s, v) => s + v, 0) || 1;
    for (const key in likelihoods[cls]) {
      likelihoods[cls][key] = (likelihoods[cls][key] + 1) / (total + Object.keys(likelihoods[cls]).length);
    }
  }

  return { priors, likelihoods, trainingSamples: records.length };
}

export function predictBreedingSuccess(
  ageMonths: number,
  weightKg: number,
  healthStatus: string,
  species: string,
  model: ReturnType<typeof trainNaiveBayesBreeding>,
): BreedingPrediction {
  const ageBucket = ageMonths < 8 ? 'young' : ageMonths < 24 ? 'prime' : ageMonths < 60 ? 'mature' : 'senior';
  const weightBucket = weightKg < 25 ? 'light' : weightKg < 40 ? 'medium' : 'heavy';
  const key = `age:${ageBucket}|weight:${weightBucket}|health:${healthStatus}|species:${species}`;

  const pSuccess = model.priors.success * (model.likelihoods.success[key] ?? 1 / (model.trainingSamples + 1));
  const pFail = model.priors.fail * (model.likelihoods.fail[key] ?? 1 / (model.trainingSamples + 1));
  const probability = pSuccess / (pSuccess + pFail);

  const factors = [
    { factor: 'Age', value: `${ageMonths} months (${ageBucket})`, contribution: ageBucket === 'prime' ? 0.2 : ageBucket === 'mature' ? 0.1 : -0.1 },
    { factor: 'Weight', value: `${weightKg} kg (${weightBucket})`, contribution: weightBucket === 'medium' ? 0.15 : weightBucket === 'heavy' ? 0.1 : -0.1 },
    { factor: 'Health', value: healthStatus, contribution: healthStatus === 'Healthy' ? 0.25 : healthStatus === 'Monitor' ? 0 : -0.2 },
    { factor: 'Species', value: species, contribution: species === 'Goat' ? 0.05 : 0 },
  ];

  let recommendation: string;
  if (probability >= 0.7) recommendation = 'High probability of successful breeding. Proceed with breeding.';
  else if (probability >= 0.5) recommendation = 'Moderate probability. Monitor closely and ensure optimal conditions.';
  else if (probability >= 0.3) recommendation = 'Lower probability. Consider waiting for better conditions.';
  else recommendation = 'Low probability. Address health or maturity issues before breeding.';

  return {
    probability: +probability.toFixed(2),
    confidence: Math.round(Math.abs(probability - 0.5) * 200),
    factors,
    recommendation,
    trainingSamples: model.trainingSamples,
  };
}

// ============================================================
// 7. LINEAR REGRESSION — Feed-to-Weight-Gain Prediction
//    Predicts expected weight gain from feed amount using
//    ordinary least squares regression.
// ============================================================

export interface FeedPredictionResult {
  predictedGain: number;
  rSquared: number;
  slope: number;
  intercept: number;
  confidence: number;
  recommendation: string;
}

export function trainFeedRegression(
  data: { feedKg: number; weightGain: number }[],
): { slope: number; intercept: number; rSquared: number } {
  if (data.length < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  const n = data.length;
  const sumX = data.reduce((s, d) => s + d.feedKg, 0);
  const sumY = data.reduce((s, d) => s + d.weightGain, 0);
  const sumXY = data.reduce((s, d) => s + d.feedKg * d.weightGain, 0);
  const sumX2 = data.reduce((s, d) => s + d.feedKg * d.feedKg, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (const d of data) {
    const pred = slope * d.feedKg + intercept;
    ssRes += Math.pow(d.weightGain - pred, 2);
    ssTot += Math.pow(d.weightGain - yMean, 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope: +slope.toFixed(4), intercept: +intercept.toFixed(4), rSquared: +rSquared.toFixed(4) };
}

export function predictWeightGain(
  feedKg: number,
  model: { slope: number; intercept: number; rSquared: number },
): FeedPredictionResult {
  const predictedGain = +(model.slope * feedKg + model.intercept).toFixed(2);
  const confidence = Math.round(model.rSquared * 100);

  let recommendation: string;
  if (model.slope <= 0) {
    recommendation = 'No positive correlation between feed and weight gain found. Review feed quality.';
  } else if (model.rSquared < 0.3) {
    recommendation = 'Weak correlation. Feed amount alone doesn\'t explain weight gain well — consider health, breed, and other factors.';
  } else if (predictedGain > 0) {
    recommendation = `Expected weight gain of ${predictedGain} kg from ${feedKg} kg of feed. Feed conversion ratio: ${(feedKg / Math.max(predictedGain, 0.1)).toFixed(1)}.`;
  } else {
    recommendation = 'Based on current data, this feed amount may not produce positive weight gain.';
  }

  return { predictedGain, rSquared: model.rSquared, slope: model.slope, intercept: model.intercept, confidence, recommendation };
}

// ============================================================
// MATRIX UTILITIES
// ============================================================

function transpose(m: number[][]): number[][] {
  return m[0].map((_, j) => m.map((row) => row[j]));
}

function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length, cols = b[0].length, inner = b.length;
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < inner; k++) sum += a[i][k] * b[k][j];
      return sum;
    }),
  );
}

function matVecMul(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((s, val, j) => s + val * v[j], 0));
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Gaussian elimination with partial pivoting
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    // Eliminate
    for (let r = col + 1; r < n; r++) {
      const factor = aug[r][col] / (aug[col][col] || 1e-10);
      for (let c = col; c <= n; c++) aug[r][c] -= factor * aug[col][c];
    }
  }

  // Back-substitute
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) sum -= aug[i][j] * x[j];
    x[i] = sum / (aug[i][i] || 1e-10);
  }
  return x;
}
