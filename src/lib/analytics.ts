import type {
  Animal,
  HealthRecord,
  WeightRecord,
  Settings,
  RiskLevel,
  HealthStatus,
  FeedRecord,
  MilkRecord,
  BreedingRecord,
} from '../types';

export interface HealthRiskResult {
  score: number;
  level: RiskLevel;
  healthStatus: HealthStatus;
  reasons: string[];
  recommendation: string;
}

const DEFAULT_SETTINGS: Settings = {
  id: '',
  user_id: '',
  farm_name: 'AlpasFarm',
  target_weight_kg: 40,
  gestation_days: 150,
  temp_critical: 40,
  heart_rate_high: 90,
  expiry_warning_days: 15,
  vaccine_due_days: 30,
  breeding_min_age_months: 8,
  breeding_min_weight_kg: 25,
  created_at: '',
  updated_at: '',
};

export function levelFromScore(score: number): RiskLevel {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

export function statusFromScore(score: number): HealthStatus {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'At Risk';
  if (score >= 30) return 'Monitor';
  return 'Healthy';
}

export function calculateHealthRisk(
  input: {
    temperature: number | null;
    heart_rate: number | null;
    appetite: string;
    activity_level: string;
    cough: boolean;
    diarrhea: boolean;
    nasal_discharge: boolean;
    eye_condition: string;
    body_condition: string;
  },
  animal: Pick<Animal, 'species' | 'date_of_birth'>,
  recentRecords: HealthRecord[],
  settings: Settings = DEFAULT_SETTINGS,
): HealthRiskResult {
  let score = 0;
  const reasons: string[] = [];

  const temp = input.temperature;
  const hr = input.heart_rate;

  if (temp !== null && temp !== undefined) {
    if (temp >= settings.temp_critical) {
      score += 35;
      reasons.push(`Elevated temperature (${temp}°C)`);
    } else if (temp >= settings.temp_critical - 0.5) {
      score += 18;
      reasons.push(`Borderline high temperature (${temp}°C)`);
    } else if (temp < 36.5) {
      score += 20;
      reasons.push(`Low temperature (${temp}°C)`);
    }
  }

  if (hr !== null && hr !== undefined) {
    if (hr > settings.heart_rate_high + 15) {
      score += 25;
      reasons.push(`Rapid heart rate (${hr} BPM)`);
    } else if (hr > settings.heart_rate_high) {
      score += 15;
      reasons.push(`Elevated heart rate (${hr} BPM)`);
    } else if (hr < 50) {
      score += 15;
      reasons.push(`Low heart rate (${hr} BPM)`);
    }
  }

  if (input.appetite === 'None') {
    score += 15;
    reasons.push('No appetite');
  } else if (input.appetite === 'Reduced') {
    score += 8;
    reasons.push('Reduced appetite');
  }

  if (input.activity_level === 'Lethargic') {
    score += 15;
    reasons.push('Lethargic');
  } else if (input.activity_level === 'Low') {
    score += 8;
    reasons.push('Low activity');
  }

  const symptomFlags = [
    input.cough && 'Coughing',
    input.diarrhea && 'Diarrhea',
    input.nasal_discharge && 'Nasal discharge',
    input.eye_condition !== 'Normal' && `Eye: ${input.eye_condition.toLowerCase()}`,
  ].filter(Boolean) as string[];

  symptomFlags.forEach((s) => {
    score += 10;
    reasons.push(s);
  });

  if (input.body_condition === 'Poor') {
    score += 15;
    reasons.push('Poor body condition');
  } else if (input.body_condition === 'Fair') {
    score += 6;
    reasons.push('Fair body condition');
  }

  // Age factor: very young or old animals are more vulnerable
  if (animal.date_of_birth) {
    const ageMonths = monthsSince(animal.date_of_birth);
    if (ageMonths < 3) {
      score += 10;
      reasons.push('Young animal (higher vulnerability)');
    } else if (ageMonths > 96) {
      score += 8;
      reasons.push('Senior animal');
    }
  }

  // Recent illness history: multiple recent concerning records increase risk
  const recentConcerning = recentRecords.filter(
    (r) => r.risk_score >= 30,
  ).length;
  if (recentConcerning >= 3) {
    score += 12;
    reasons.push('Recurring health concerns in recent records');
  } else if (recentConcerning >= 1) {
    score += 5;
    reasons.push('Previous recent health concern');
  }

  // Species baseline: sheep tend to be slightly more sensitive
  if (animal.species === 'Sheep') {
    score += 3;
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  // Combined critical rule
  if (
    temp !== null &&
    temp >= settings.temp_critical &&
    hr !== null &&
    hr > settings.heart_rate_high &&
    symptomFlags.length >= 2
  ) {
    score = Math.max(score, 85);
  }

  const level = levelFromScore(score);
  const healthStatus = statusFromScore(score);

  let recommendation: string;
  switch (level) {
    case 'Critical':
      recommendation =
        'Isolate the animal immediately and schedule a veterinary assessment. This is a decision-support suggestion, not a veterinary diagnosis.';
      break;
    case 'High':
      recommendation =
        'Monitor closely and contact a veterinarian for evaluation. Decision-support suggestion only.';
      break;
    case 'Moderate':
      recommendation =
        'Keep monitoring and record follow-up checks. Consult a veterinarian if symptoms persist. Decision-support suggestion only.';
      break;
    default:
      recommendation =
        'Animal appears healthy. Continue regular monitoring. Decision-support suggestion only.';
  }

  return { score, level, healthStatus, reasons, recommendation };
}

export function monthsSince(dateStr: string): number {
  const birth = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

export function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function ageLabel(dateOfBirth: string | null): string {
  if (!dateOfBirth) return 'Unknown';
  const months = monthsSince(dateOfBirth);
  if (months < 0) return 'Unknown';
  if (months < 1) return 'Less than 1 month';
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} ${remMonths === 1 ? 'month' : 'months'}`;
  if (remMonths === 0) return `${years} ${years === 1 ? 'year' : 'years'}`;
  return `${years} ${years === 1 ? 'year' : 'years'} ${remMonths} ${remMonths === 1 ? 'month' : 'months'}`;
}

export interface GrowthPrediction {
  currentWeight: number;
  previousWeight: number | null;
  weightChange: number | null;
  dailyGain: number | null;
  trend: 'Good' | 'Slow' | 'Stable' | 'Declining' | 'Insufficient';
  averageDailyGain: number | null;
  projectedWeight30: number | null;
  daysToTarget: number | null;
  marketReadyDate: string | null;
  enoughData: boolean;
}

export function calculateGrowth(
  records: WeightRecord[],
  targetWeight: number = 40,
): GrowthPrediction {
  const sorted = [...records].sort(
    (a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime(),
  );

  if (sorted.length === 0) {
    return {
      currentWeight: 0,
      previousWeight: null,
      weightChange: null,
      dailyGain: null,
      trend: 'Insufficient',
      averageDailyGain: null,
      projectedWeight30: null,
      daysToTarget: null,
      marketReadyDate: null,
      enoughData: false,
    };
  }

  const latest = sorted[sorted.length - 1];
  const currentWeight = Number(latest.weight_kg);
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const previousWeight = previous ? Number(previous.weight_kg) : null;
  const weightChange = previousWeight !== null ? +(currentWeight - previousWeight).toFixed(2) : null;

  let dailyGain: number | null = null;
  if (previous) {
    const days = daysBetween(previous.record_date, latest.record_date);
    if (days > 0) {
      dailyGain = +((currentWeight - Number(previous.weight_kg)) / days).toFixed(4);
    }
  }

  // Average daily gain across all records
  let averageDailyGain: number | null = null;
  if (sorted.length >= 2) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalDays = daysBetween(first.record_date, last.record_date);
    if (totalDays > 0) {
      averageDailyGain = +(
        (Number(last.weight_kg) - Number(first.weight_kg)) / totalDays
      ).toFixed(4);
    }
  }

  let trend: GrowthPrediction['trend'] = 'Stable';
  if (dailyGain === null) {
    trend = 'Insufficient';
  } else if (dailyGain > 0.15) {
    trend = 'Good';
  } else if (dailyGain > 0.03) {
    trend = 'Slow';
  } else if (dailyGain < 0) {
    trend = 'Declining';
  }

  const projectedWeight30 =
    averageDailyGain !== null ? +(currentWeight + averageDailyGain * 30).toFixed(2) : null;

  let daysToTarget: number | null = null;
  let marketReadyDate: string | null = null;
  if (averageDailyGain !== null && averageDailyGain > 0 && currentWeight < targetWeight) {
    daysToTarget = Math.ceil((targetWeight - currentWeight) / averageDailyGain);
    const d = new Date();
    d.setDate(d.getDate() + daysToTarget);
    marketReadyDate = d.toISOString().split('T')[0];
  }

  return {
    currentWeight,
    previousWeight,
    weightChange,
    dailyGain,
    trend,
    averageDailyGain,
    projectedWeight30,
    daysToTarget,
    marketReadyDate,
    enoughData: sorted.length >= 2,
  };
}

export function calculateKiddingDate(
  matingDate: string,
  gestationDays: number = 150,
): string {
  const d = new Date(matingDate);
  d.setDate(d.getDate() + gestationDays);
  return d.toISOString().split('T')[0];
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface InventoryStatus {
  status: 'OK' | 'Low Stock' | 'Out of Stock' | 'Expiring Soon' | 'Expired';
  daysToExpiry: number | null;
  label: string;
  color: 'green' | 'orange' | 'red' | 'blue' | 'gray';
}

export function inventoryStatus(
  item: { quantity: number; minimum_stock: number; expiry_date: string | null },
  warningDays: number = 15,
): InventoryStatus {
  const qty = Number(item.quantity);
  const min = Number(item.minimum_stock);

  let daysToExpiry: number | null = null;
  if (item.expiry_date) {
    daysToExpiry = daysUntil(item.expiry_date);
  }

  if (daysToExpiry !== null && daysToExpiry < 0) {
    return { status: 'Expired', daysToExpiry, label: 'Expired', color: 'red' };
  }
  if (qty <= 0) {
    return { status: 'Out of Stock', daysToExpiry, label: 'Out of stock', color: 'red' };
  }
  if (daysToExpiry !== null && daysToExpiry <= warningDays) {
    return {
      status: 'Expiring Soon',
      daysToExpiry,
      label: `Expires in ${daysToExpiry} ${daysToExpiry === 1 ? 'day' : 'days'}`,
      color: 'orange',
    };
  }
  if (qty <= min) {
    return { status: 'Low Stock', daysToExpiry, label: 'Low stock', color: 'orange' };
  }
  return { status: 'OK', daysToExpiry, label: 'In stock', color: 'green' };
}

export function vaccinationStatusFromDue(
  nextDueDate: string | null,
  dueDays: number = 30,
): 'Up to Date' | 'Due Soon' | 'Overdue' | 'None' {
  if (!nextDueDate) return 'None';
  const days = daysUntil(nextDueDate);
  if (days < 0) return 'Overdue';
  if (days <= dueDays) return 'Due Soon';
  return 'Up to Date';
}

export interface BreedingAssessment {
  recommendation: 'Ready' | 'Not Ready' | 'Monitor';
  reasons: string[];
}

export function assessBreedingReadiness(
  animal: Animal,
  settings: Settings,
  lastMating: BreedingRecord | null,
): BreedingAssessment {
  const reasons: string[] = [];

  if (animal.sex !== 'Female') {
    return { recommendation: 'Not Ready', reasons: ['Breeding readiness applies to females.'] };
  }

  if (animal.breeding_status === 'Pregnant') {
    return { recommendation: 'Not Ready', reasons: ['Already pregnant.'] };
  }

  let ready = true;

  if (animal.date_of_birth) {
    const ageMonths = monthsSince(animal.date_of_birth);
    if (ageMonths < settings.breeding_min_age_months) {
      reasons.push(`Too young (${ageMonths} months, minimum ${settings.breeding_min_age_months})`);
      ready = false;
    }
  }

  if (animal.weight_kg !== null && Number(animal.weight_kg) < settings.breeding_min_weight_kg) {
    reasons.push(
      `Underweight (${animal.weight_kg} kg, minimum ${settings.breeding_min_weight_kg} kg)`,
    );
    ready = false;
  }

  if (animal.health_status === 'At Risk' || animal.health_status === 'Critical') {
    reasons.push(`Health status is ${animal.health_status}`);
    ready = false;
  }

  if (lastMating) {
    const daysSinceMating = daysBetween(lastMating.mating_date, new Date().toISOString());
    if (daysSinceMating < settings.gestation_days + 60 && lastMating.status !== 'Kidded') {
      reasons.push('Recent breeding — allow recovery time');
      ready = false;
    }
  }

  if (ready) {
    reasons.push('Healthy, mature, and weight meets minimum');
    return { recommendation: 'Ready', reasons };
  }

  // Monitor if close
  if (animal.health_status === 'Monitor') {
    return { recommendation: 'Monitor', reasons };
  }

  return { recommendation: 'Not Ready', reasons };
}

export interface FeedEfficiency {
  score: number;
  label: string;
  totalFeedKg: number;
  totalCost: number;
  weightGain: number | null;
}

export function calculateFeedEfficiency(
  feedRecords: FeedRecord[],
  weightRecords: WeightRecord[],
): FeedEfficiency {
  const totalFeedKg = feedRecords.reduce((s, r) => s + Number(r.quantity_kg), 0);
  const totalCost = feedRecords.reduce((s, r) => s + Number(r.cost), 0);

  let weightGain: number | null = null;
  if (weightRecords.length >= 2) {
    const sorted = [...weightRecords].sort(
      (a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime(),
    );
    weightGain = Number(sorted[sorted.length - 1].weight_kg) - Number(sorted[0].weight_kg);
  }

  let score = 50;
  if (weightGain !== null && totalFeedKg > 0) {
    const feedConversionRatio = totalFeedKg / Math.max(weightGain, 0.1);
    // Lower FCR = better. Typical good FCR for goats ~ 5-8
    if (feedConversionRatio < 5) score = 95;
    else if (feedConversionRatio < 7) score = 85;
    else if (feedConversionRatio < 10) score = 70;
    else if (feedConversionRatio < 15) score = 55;
    else score = 40;
  } else if (weightGain !== null && weightGain > 0) {
    score = 70;
  }

  let label: string;
  if (score >= 80) label = 'Excellent growth efficiency';
  else if (score >= 60) label = 'Good efficiency';
  else if (score >= 40) label = 'Monitor feed efficiency';
  else label = 'Poor efficiency — review feed plan';

  return { score, label, totalFeedKg, totalCost, weightGain };
}

export interface MilkForecast {
  average: number;
  current: number;
  trend: 'Up' | 'Down' | 'Stable' | 'Insufficient';
  forecastNextMonth: number | null;
  enoughData: boolean;
}

export function calculateMilkForecast(
  records: MilkRecord[],
): MilkForecast {
  if (records.length === 0) {
    return { average: 0, current: 0, trend: 'Insufficient', forecastNextMonth: null, enoughData: false };
  }
  const sorted = [...records].sort(
    (a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime(),
  );
  const yields = sorted.map((r) => Number(r.yield_litres));
  const average = +(yields.reduce((s, y) => s + y, 0) / yields.length).toFixed(2);
  const current = yields[yields.length - 1];

  let trend: MilkForecast['trend'] = 'Stable';
  let forecastNextMonth: number | null = null;

  if (yields.length >= 3) {
    const firstHalf = yields.slice(0, Math.ceil(yields.length / 2));
    const secondHalf = yields.slice(Math.ceil(yields.length / 2));
    const firstAvg = firstHalf.reduce((s, y) => s + y, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, y) => s + y, 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;

    if (diff > 0.1) trend = 'Up';
    else if (diff < -0.1) trend = 'Down';

    // Linear forecast: project trend forward
    forecastNextMonth = +(current + diff).toFixed(2);
    if (forecastNextMonth < 0) forecastNextMonth = 0;
  }

  return { average, current, trend, forecastNextMonth, enoughData: yields.length >= 3 };
}
