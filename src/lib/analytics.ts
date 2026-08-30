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

// ── Early Illness Detection ─────────────────────────────────────────────────
// Based on research from:
// - Langston University Goat Research Unit (normal physiological parameters)
// - Penn State Extension (meat goat health)
// - Cornell University Cooperative Extension (routine goat health care)
// - Virginia Tech Extension (monitoring livestock vital signs)
// - FAMACHA(C) system (H. contortus/barber pole worm anemia scoring)

export interface EarlyIllnessResult {
  detectedConditions: string[];
  conditionDetails: { condition: string; severity: 'Warning' | 'Critical'; description: string; action: string }[];
}

// Normal reference ranges (research-based)
// Temperature: 38.5–40.0°C (Langston Univ.), fever >40.5°C, hypothermia <38.0°C
// Heart rate: 70–90 BPM adults (Virginia Tech Extension)
// Respiratory rate: 12–20 breaths/min (Penn State Extension)
// Rumen sounds: 1–3 per minute (Cornell Extension)
// FAMACHA: 1–2 normal, 3 borderline, 4–5 anemic (FAMACHA(C) system)
// Bloat score: 0–1 normal, 2 moderate, 3 severe (Colorado State Univ.)

export function detectEarlyIllness(input: {
  temperature: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  rumen_sounds: string;
  famacha_score: number | null;
  mucous_membrane: string;
  bloat_score: number;
  gait: string;
  cough: boolean;
  diarrhea: boolean;
  nasal_discharge: boolean;
  appetite: string;
  activity_level: string;
  eye_condition: string;
  body_condition: string;
}): EarlyIllnessResult {
  const conditions: EarlyIllnessResult['conditionDetails'] = [];

  // ── 1. Pneumonia / Respiratory Disease ──────────────────────────────────
  // Key indicators: fever + rapid breathing + cough + nasal discharge
  const respScore = [
    input.cough,
    input.nasal_discharge,
    input.respiratory_rate !== null && input.respiratory_rate > 20,
    input.temperature !== null && input.temperature > 40.0,
    input.activity_level === 'Lethargic',
  ].filter(Boolean).length;

  if (respScore >= 3) {
    conditions.push({
      condition: 'Possible Pneumonia / Respiratory Disease',
      severity: respScore >= 4 ? 'Critical' : 'Warning',
      description: `Fever + rapid breathing + cough/nasal discharge detected. Respiratory rate: ${input.respiratory_rate ?? 'not recorded'} breaths/min (normal: 12–20).`,
      action: 'Isolate animal. Contact veterinarian. Antibiotics may be required.',
    });
  } else if (input.cough && input.nasal_discharge) {
    conditions.push({
      condition: 'Early Respiratory Signs',
      severity: 'Warning',
      description: 'Cough and nasal discharge present. Monitor for fever and labored breathing.',
      action: 'Monitor temperature every 12 hours. Ensure adequate ventilation.',
    });
  }

  // ── 2. Anemia / Barber Pole Worm (Haemonchus contortus) ─────────────────
  // FAMACHA(C) score 4–5 = anemia; pale/white mucous membrane
  const anemiaScore = [
    input.famacha_score !== null && input.famacha_score >= 4,
    input.mucous_membrane === 'Pale' || input.mucous_membrane === 'White',
    input.activity_level === 'Lethargic',
    input.body_condition === 'Poor',
  ].filter(Boolean).length;

  if (anemiaScore >= 2) {
    const critical = (input.famacha_score ?? 0) >= 5 || input.mucous_membrane === 'White';
    conditions.push({
      condition: 'Suspected Anemia / Barber Pole Worm Infestation',
      severity: critical ? 'Critical' : 'Warning',
      description: `FAMACHA score: ${input.famacha_score ?? 'not recorded'} (normal: 1–2). Mucous membrane: ${input.mucous_membrane}. Barber pole worm (Haemonchus contortus) is the leading cause of anemia in goats/sheep.`,
      action: critical
        ? 'Emergency deworming required. Consult veterinarian immediately. Iron supplementation may be needed.'
        : 'Administer appropriate dewormer. Recheck FAMACHA in 2 weeks.',
    });
  } else if (input.famacha_score !== null && input.famacha_score === 3) {
    conditions.push({
      condition: 'Borderline Anemia (FAMACHA 3)',
      severity: 'Warning',
      description: 'FAMACHA score of 3 indicates borderline anemia. Monitor closely for worm burden.',
      action: 'Recheck FAMACHA score in 2 weeks. Consider fecal egg count test.',
    });
  }

  // ── 3. Ruminal Bloat ────────────────────────────────────────────────────
  // Bloat score 2–3 = dangerous; absent/reduced rumen sounds + distension
  if (input.bloat_score >= 2) {
    conditions.push({
      condition: input.bloat_score === 3 ? 'Severe Bloat (Emergency)' : 'Moderate Bloat',
      severity: input.bloat_score === 3 ? 'Critical' : 'Warning',
      description: `Bloat score: ${input.bloat_score}/3. Rumen sounds: ${input.rumen_sounds}. Left flank distension may be visible. Frothy or free-gas bloat can be life-threatening.`,
      action: input.bloat_score === 3
        ? 'EMERGENCY: Walk the animal. Pass stomach tube. Contact veterinarian immediately. Can be fatal within hours.'
        : 'Restrict grazing on wet legumes. Administer anti-bloat solution. Monitor closely.',
    });
  } else if (input.rumen_sounds === 'Absent') {
    conditions.push({
      condition: 'Absent Rumen Sounds — Possible Indigestion/Bloat Risk',
      severity: 'Warning',
      description: 'Normal rumen motility is 1–3 sounds per minute (Cornell Extension). Absent sounds indicate digestive dysfunction.',
      action: 'Check for bloat. Withhold feed temporarily. Monitor and contact vet if no improvement in 4 hours.',
    });
  } else if (input.rumen_sounds === 'Reduced' && input.appetite !== 'Normal') {
    conditions.push({
      condition: 'Reduced Rumen Activity',
      severity: 'Warning',
      description: 'Reduced rumen sounds combined with reduced appetite suggests digestive disturbance.',
      action: 'Monitor for bloat. Ensure access to fresh water. Avoid sudden feed changes.',
    });
  }

  // ── 4. Fever / Systemic Infection ───────────────────────────────────────
  if (input.temperature !== null) {
    if (input.temperature > 40.5) {
      conditions.push({
        condition: 'High Fever — Possible Systemic Infection',
        severity: 'Critical',
        description: `Temperature ${input.temperature}°C exceeds critical threshold (>40.5°C). Normal range: 38.5–40.0°C (Langston University). May indicate PPR, pneumonia, or bacterial infection.`,
        action: 'Isolate animal. Contact veterinarian urgently. Check for PPR, foot-and-mouth, or pneumonia symptoms.',
      });
    } else if (input.temperature < 38.0) {
      conditions.push({
        condition: 'Hypothermia / Sub-normal Temperature',
        severity: input.temperature < 37.0 ? 'Critical' : 'Warning',
        description: `Temperature ${input.temperature}°C is below normal range (38.5–40.0°C). May indicate shock, late-stage illness, or exposure.`,
        action: 'Move animal to warm shelter. Provide blanket/heat lamp. Contact veterinarian if temperature does not rise.',
      });
    }
  }

  // ── 5. Enterotoxemia / Diarrhea ─────────────────────────────────────────
  if (input.diarrhea && (input.temperature !== null && input.temperature > 39.5)) {
    conditions.push({
      condition: 'Possible Enterotoxemia / Gastrointestinal Infection',
      severity: 'Warning',
      description: 'Diarrhea combined with fever suggests enterotoxemia (overeating disease) or gastrointestinal infection. Common in unvaccinated animals.',
      action: 'Withhold grain. Provide electrolytes. Verify CD&T vaccination status. Contact veterinarian.',
    });
  } else if (input.diarrhea && input.activity_level === 'Lethargic') {
    conditions.push({
      condition: 'Diarrhea with Lethargy',
      severity: 'Warning',
      description: 'Combination of diarrhea and lethargy may indicate dehydration or systemic illness.',
      action: 'Provide oral electrolyte solution. Monitor hydration (skin tent test). Contact vet if no improvement.',
    });
  }

  // ── 6. Lameness / Foot Rot ──────────────────────────────────────────────
  if (input.gait === 'Severe Limp' || input.gait === 'Cannot Walk') {
    conditions.push({
      condition: 'Lameness — Possible Foot Rot / Foot Scald',
      severity: input.gait === 'Cannot Walk' ? 'Critical' : 'Warning',
      description: `Gait assessment: ${input.gait}. Lameness in goats/sheep is commonly caused by foot rot (Dichelobacter nodosus), foot scald, or CAE (Caprine Arthritis-Encephalitis).`,
      action: 'Examine hooves for odor, swelling, and separation. Trim hooves. Foot bath with zinc sulfate solution. Contact vet for severe cases.',
    });
  } else if (input.gait === 'Slight Limp') {
    conditions.push({
      condition: 'Mild Lameness',
      severity: 'Warning',
      description: 'Slight limp detected. Early sign of foot scald or hoof overgrowth.',
      action: 'Inspect and trim hooves. Apply foot bath. Monitor for worsening.',
    });
  }

  // ── 7. PPR (Peste des Petits Ruminants) pattern ─────────────────────────
  // High fever + eye/nasal discharge + diarrhea + mouth sores = PPR pattern
  const pprScore = [
    input.temperature !== null && input.temperature > 40.0,
    input.nasal_discharge,
    input.eye_condition !== 'Normal',
    input.diarrhea,
    input.appetite === 'None',
  ].filter(Boolean).length;

  if (pprScore >= 4) {
    conditions.push({
      condition: 'Suspected PPR (Peste des Petits Ruminants)',
      severity: 'Critical',
      description: 'Multiple classic PPR symptoms detected: high fever, ocular/nasal discharge, diarrhea, and loss of appetite. PPR is a highly contagious and fatal viral disease in goats and sheep.',
      action: 'ISOLATE IMMEDIATELY. Report to local DA-BAI (Bureau of Animal Industry). Do NOT move animals. No cure — only prevention via vaccination.',
    });
  }

  return {
    detectedConditions: conditions.map((c) => c.condition),
    conditionDetails: conditions,
  };
}


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

export interface HealthRiskResult {
  score: number;
  level: RiskLevel;
  healthStatus: HealthStatus;
  reasons: string[];
  recommendation: string;
  earlyIllness: EarlyIllnessResult;
}

export function calculateHealthRisk(
  input: {
    temperature: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    rumen_sounds: string;
    famacha_score: number | null;
    mucous_membrane: string;
    bloat_score: number;
    gait: string;
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

  // Temperature (38.5–40.0°C normal — Langston Univ.)
  if (temp !== null) {
    if (temp > 40.5)        { score += 40; reasons.push(`High fever (${temp}°C)`); }
    else if (temp >= 40.0)  { score += 30; reasons.push(`Elevated temperature (${temp}°C)`); }
    else if (temp >= 39.5)  { score += 15; reasons.push(`Borderline high temperature (${temp}°C)`); }
    else if (temp < 37.0)   { score += 30; reasons.push(`Hypothermia (${temp}°C)`); }
    else if (temp < 38.0)   { score += 18; reasons.push(`Low temperature (${temp}°C)`); }
  }

  // Heart rate (70–90 BPM normal — Virginia Tech)
  if (hr !== null) {
    if (hr > settings.heart_rate_high + 20)  { score += 25; reasons.push(`Rapid heart rate (${hr} BPM)`); }
    else if (hr > settings.heart_rate_high)  { score += 15; reasons.push(`Elevated heart rate (${hr} BPM)`); }
    else if (hr < 50)                        { score += 15; reasons.push(`Low heart rate (${hr} BPM)`); }
  }

  // Respiratory rate (12–20 breaths/min normal — Penn State)
  if (input.respiratory_rate !== null) {
    if (input.respiratory_rate > 40)       { score += 25; reasons.push(`Severe tachypnea (${input.respiratory_rate} breaths/min)`); }
    else if (input.respiratory_rate > 20)  { score += 15; reasons.push(`Elevated respiratory rate (${input.respiratory_rate} breaths/min)`); }
    else if (input.respiratory_rate < 10)  { score += 15; reasons.push(`Low respiratory rate (${input.respiratory_rate} breaths/min)`); }
  }

  // FAMACHA score (1–2 normal, 3 borderline, 4–5 anemic — FAMACHA(C) system)
  if (input.famacha_score !== null) {
    if (input.famacha_score === 5)       { score += 30; reasons.push('FAMACHA 5 — severe anemia'); }
    else if (input.famacha_score === 4)  { score += 20; reasons.push('FAMACHA 4 — anemic'); }
    else if (input.famacha_score === 3)  { score += 10; reasons.push('FAMACHA 3 — borderline anemia'); }
  }

  // Mucous membrane color
  if (input.mucous_membrane === 'White')        { score += 25; reasons.push('White mucous membranes — severe anemia'); }
  else if (input.mucous_membrane === 'Pale')    { score += 15; reasons.push('Pale mucous membranes — anemia risk'); }
  else if (input.mucous_membrane === 'Red')     { score += 15; reasons.push('Red/injected mucous membranes — fever/toxemia'); }
  else if (input.mucous_membrane === 'Yellow')  { score += 20; reasons.push('Yellow mucous membranes — jaundice'); }
  else if (input.mucous_membrane === 'Blue')    { score += 35; reasons.push('Cyanotic mucous membranes — oxygen deprivation'); }

  // Bloat score (Colorado State Univ.)
  if (input.bloat_score === 3)       { score += 40; reasons.push('Severe bloat (score 3/3)'); }
  else if (input.bloat_score === 2)  { score += 20; reasons.push('Moderate bloat (score 2/3)'); }
  else if (input.bloat_score === 1)  { score += 8;  reasons.push('Mild bloat (score 1/3)'); }

  // Rumen sounds (1–3/min normal — Cornell)
  if (input.rumen_sounds === 'Absent')       { score += 20; reasons.push('Absent rumen sounds'); }
  else if (input.rumen_sounds === 'Reduced') { score += 10; reasons.push('Reduced rumen sounds'); }

  // Gait / Lameness
  if (input.gait === 'Cannot Walk')        { score += 30; reasons.push('Unable to walk'); }
  else if (input.gait === 'Severe Limp')   { score += 18; reasons.push('Severe lameness'); }
  else if (input.gait === 'Slight Limp')   { score += 8;  reasons.push('Mild lameness'); }

  // Appetite
  if (input.appetite === 'None')           { score += 15; reasons.push('No appetite'); }
  else if (input.appetite === 'Reduced')   { score += 8;  reasons.push('Reduced appetite'); }

  // Activity
  if (input.activity_level === 'Lethargic') { score += 15; reasons.push('Lethargic'); }
  else if (input.activity_level === 'Low')  { score += 8;  reasons.push('Low activity'); }

  // Symptoms
  const symptomFlags = [
    input.cough && 'Coughing',
    input.diarrhea && 'Diarrhea',
    input.nasal_discharge && 'Nasal discharge',
    input.eye_condition !== 'Normal' && `Eye: ${input.eye_condition.toLowerCase()}`,
  ].filter(Boolean) as string[];
  symptomFlags.forEach((s) => { score += 10; reasons.push(s); });

  // Body condition
  if (input.body_condition === 'Poor')       { score += 15; reasons.push('Poor body condition'); }
  else if (input.body_condition === 'Fair')  { score += 6;  reasons.push('Fair body condition'); }

  // Age
  if (animal.date_of_birth) {
    const ageMonths = monthsSince(animal.date_of_birth);
    if (ageMonths < 3)    { score += 10; reasons.push('Young animal (higher vulnerability)'); }
    else if (ageMonths > 96) { score += 8; reasons.push('Senior animal'); }
  }

  // Recurring history
  const recentConcerning = recentRecords.filter((r) => r.risk_score >= 30).length;
  if (recentConcerning >= 3)      { score += 12; reasons.push('Recurring health concerns'); }
  else if (recentConcerning >= 1) { score += 5;  reasons.push('Previous health concern'); }

  // Species
  if (animal.species === 'Sheep') score += 3;

  // Combined critical rule
  if (temp !== null && temp > 40.5 && hr !== null && hr > settings.heart_rate_high && symptomFlags.length >= 2) {
    score = Math.max(score, 85);
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  const level = levelFromScore(score);
  const healthStatus = statusFromScore(score);
  const earlyIllness = detectEarlyIllness(input);

  let recommendation: string;
  const criticalCondition = earlyIllness.conditionDetails.find((c) => c.severity === 'Critical');
  if (criticalCondition) {
    recommendation = `URGENT: ${criticalCondition.action} (Decision-support only — consult a veterinarian.)`;
  } else if (level === 'Critical') {
    recommendation = 'Isolate the animal immediately and schedule a veterinary assessment. Decision-support only.';
  } else if (level === 'High') {
    recommendation = 'Monitor closely and contact a veterinarian. Decision-support only.';
  } else if (level === 'Moderate') {
    recommendation = 'Keep monitoring. Consult a veterinarian if symptoms persist. Decision-support only.';
  } else {
    recommendation = 'Animal appears healthy. Continue regular monitoring.';
  }

  return { score, level, healthStatus, reasons, recommendation, earlyIllness };
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
  weightGainKg: number;
  fcr: number | null;
  efficiencyRating: 'High' | 'Moderate' | 'Low' | 'Insufficient Data';
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
    weightGain = Number((Number(sorted[sorted.length - 1].weight_kg) - Number(sorted[0].weight_kg)).toFixed(2));
  }

  const fcr = (weightGain !== null && weightGain > 0 && totalFeedKg > 0)
    ? Number((totalFeedKg / weightGain).toFixed(2))
    : null;

  let efficiencyRating: 'High' | 'Moderate' | 'Low' | 'Insufficient Data' = 'Insufficient Data';
  let score = 50;

  if (fcr !== null) {
    if (fcr < 5) {
      score = 95;
      efficiencyRating = 'High';
    } else if (fcr < 8) {
      score = 80;
      efficiencyRating = 'High';
    } else if (fcr < 12) {
      score = 65;
      efficiencyRating = 'Moderate';
    } else {
      score = 40;
      efficiencyRating = 'Low';
    }
  } else if (weightGain !== null && weightGain > 0) {
    score = 70;
    efficiencyRating = 'Moderate';
  }

  let label: string;
  if (score >= 80) label = 'Excellent growth efficiency';
  else if (score >= 60) label = 'Good efficiency';
  else if (score >= 40) label = 'Monitor feed efficiency';
  else label = 'Poor efficiency — review feed plan';

  return {
    score,
    label,
    totalFeedKg,
    totalCost,
    weightGain,
    weightGainKg: weightGain ?? 0,
    fcr,
    efficiencyRating,
  };
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
