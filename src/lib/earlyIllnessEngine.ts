/**
 * earlyIllnessEngine.ts — Hybrid Early Illness Prediction Engine for AlpasFarm
 *
 * ARCHITECTURE & DATA FUSION:
 *   1. Clinical & Physical Observations (Optional farmer inputs: temp, appetite, activity, symptoms)
 *   2. Automated Database Context (Historical weight loss %, past health records, vaccination gap, age vulnerability)
 *   3. Camera ML Computer Vision (MobileNetV2 + Cloud Run vision indicators for Goat & Sheep)
 *
 * CRITICAL CLINICAL SAFETY PRINCIPLES:
 *   - NEVER claim a definitive diagnosis (this is an early illness warning tool).
 *   - If evidence is insufficient/absent, returns 'INSUFFICIENT_EVIDENCE' instead of guessing.
 *   - Automatically detects significant risk jumps (>= 20% increase or elevation to High Risk).
 *   - Model Version: v3.1-early-illness-hybrid
 */

import type { Animal, HealthRecord, WeightRecord, Vaccination } from '../types';
import type { ScanResult } from './cameraML';
import { monthsSince } from './analytics';

export const EARLY_ILLNESS_MODEL_VERSION = 'v3.1-early-illness-hybrid';

export type EarlyIllnessRiskLevel =
  | 'Low Risk'
  | 'Moderate Risk'
  | 'High Risk'
  | 'Insufficient Evidence';

export type VetAttentionStatus =
  | 'Recommended — Urgent'
  | 'Recommended — Routine Consult'
  | 'Not Required — Monitor Regularly';

export interface PossibleHealthConcern {
  condition: string;
  severity: 'Warning' | 'Critical';
  description: string;
  action: string;
}

export interface DetectedIndicatorItem {
  name: string;
  category: 'Observation' | 'Database History' | 'Camera ML Vision';
  severity: 'normal' | 'warning' | 'critical';
  details?: string;
}

export interface FarmerObservations {
  temperature?: number | null;
  appetite?: 'Normal' | 'Reduced' | 'None' | null;
  activity_level?: 'Normal' | 'Low' | 'Lethargic' | null;
  symptoms?: string[]; // e.g. ['cough', 'diarrhea', 'nasal_discharge', 'lameness', 'pale_membrane', 'bloat', 'rough_coat', 'droopy_head']
  notes?: string | null;
}

export interface EarlyIllnessPredictionResult {
  animalId: string;
  animalName: string;
  species: string;
  timestamp: string;
  modelVersion: string;
  status: 'SUCCESS' | 'INSUFFICIENT_EVIDENCE';

  // Risk outputs
  riskScore: number;           // 0–100%
  riskLevel: EarlyIllnessRiskLevel;
  confidencePercent: number;    // 0–100%

  // Insights
  possibleConcerns: PossibleHealthConcern[];
  detectedIndicators: DetectedIndicatorItem[];
  recommendations: string[];
  veterinaryAttention: VetAttentionStatus;

  // Trend comparison
  previousRiskScore: number | null;
  riskDelta: number | null;      // current - previous
  isSignificantIncrease: boolean; // >= 20 points jump or jump to High Risk

  // Context summary
  contextSummary: {
    ageMonths: number;
    weightTrend: string;
    recentWeightLossPct: number | null;
    vaccinationStatus: string;
    hasOverdueVaccine: boolean;
    cameraScanUsed: boolean;
  };

  disclaimer: string;
}

// ─── Normal reference ranges for goats and sheep ──────────────────────────────
// Temperature: 38.5–40.0°C normal, >40.5°C fever, <38.0°C hypothermia
const NORMAL_TEMP_MIN = 38.5;
const NORMAL_TEMP_MAX = 40.0;
const HIGH_FEVER_THRESHOLD = 40.5;
const HYPOTHERMIA_THRESHOLD = 38.0;

/**
 * Predicts early illness risk for a selected animal by fusing observations,
 * database history, and camera ML results.
 */
export function predictEarlyIllness(params: {
  animal: Animal;
  observations?: FarmerObservations;
  pastHealthRecords?: HealthRecord[];
  weightRecords?: WeightRecord[];
  vaccinations?: Vaccination[];
  cameraResult?: ScanResult | null;
}): EarlyIllnessPredictionResult {
  const {
    animal,
    observations = {},
    pastHealthRecords = [],
    weightRecords = [],
    vaccinations = [],
    cameraResult = null,
  } = params;

  const now = new Date().toISOString();
  const ageMonths = animal.date_of_birth ? monthsSince(animal.date_of_birth) : 18;

  // 1. Analyze Database History Context
  // Sort weight records newest first
  const animalWeights = weightRecords
    .filter((w) => w.animal_id === animal.id)
    .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());

  let recentWeightLossPct: number | null = null;
  let weightTrend = 'Stable';
  if (animalWeights.length >= 2) {
    const latestWeight = animalWeights[0].weight_kg;
    const prevWeight = animalWeights[1].weight_kg;
    if (prevWeight > 0) {
      recentWeightLossPct = +(((latestWeight - prevWeight) / prevWeight) * 100).toFixed(1);
      if (recentWeightLossPct < -5) weightTrend = `Loss (${recentWeightLossPct}%)`;
      else if (recentWeightLossPct > 2) weightTrend = `Gain (+${recentWeightLossPct}%)`;
    }
  }

  // Check vaccination & deworming
  const animalVaccines = vaccinations.filter((v) => v.animal_id === animal.id);
  const hasOverdueVaccine =
    animal.vaccination_status === 'Overdue' ||
    animalVaccines.some((v) => v.next_due_date && new Date(v.next_due_date) < new Date());

  // Past health records & previous risk score
  const animalPastHealth = pastHealthRecords
    .filter((h) => h.animal_id === animal.id)
    .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  const previousRecord = animalPastHealth[0] ?? null;
  const previousRiskScore = previousRecord ? previousRecord.risk_score : null;

  // 2. Extract Farmer Observations
  const temp = observations.temperature ?? null;
  const appetite = observations.appetite ?? null;
  const activity = observations.activity_level ?? null;
  const symptoms = observations.symptoms ?? [];

  const hasObsTemp = temp !== null && !isNaN(temp) && temp > 0;
  const hasObsAppetite = appetite !== null && appetite !== undefined;
  const hasObsActivity = activity !== null && activity !== undefined;
  const hasObsSymptoms = symptoms.length > 0;
  const hasFarmerObservations = hasObsTemp || hasObsAppetite || hasObsActivity || hasObsSymptoms;

  // 3. Extract Camera ML Signals
  const hasCameraScan = !!cameraResult && cameraResult.goatDetected;

  // 4. Check for Insufficient Evidence
  // If no observations entered, no camera scan, and no previous records exist
  if (!hasFarmerObservations && !hasCameraScan) {
    return {
      animalId: animal.id,
      animalName: animal.name,
      species: animal.species,
      timestamp: now,
      modelVersion: EARLY_ILLNESS_MODEL_VERSION,
      status: 'INSUFFICIENT_EVIDENCE',
      riskScore: 0,
      riskLevel: 'Insufficient Evidence',
      confidencePercent: 0,
      possibleConcerns: [],
      detectedIndicators: [],
      recommendations: [
        'Insufficient evidence to evaluate health status.',
        'Please enter at least one observation (temperature, appetite, activity, or symptoms) or run a camera health scan.',
      ],
      veterinaryAttention: 'Not Required — Monitor Regularly',
      previousRiskScore,
      riskDelta: null,
      isSignificantIncrease: false,
      contextSummary: {
        ageMonths,
        weightTrend,
        recentWeightLossPct,
        vaccinationStatus: animal.vaccination_status,
        hasOverdueVaccine,
        cameraScanUsed: false,
      },
      disclaimer:
        'This is a preliminary screening tool and does not replace professional veterinary diagnosis. Always consult a licensed veterinarian for definitive diagnosis.',
    };
  }

  // 5. Multi-Signal Hybrid Scoring Engine
  let rawScore = 0;
  const detectedIndicators: DetectedIndicatorItem[] = [];
  const possibleConcerns: PossibleHealthConcern[] = [];
  const recommendations: string[] = [];

  // ── A. Temperature Analysis ──
  if (hasObsTemp && temp !== null) {
    if (temp >= HIGH_FEVER_THRESHOLD) {
      rawScore += 35;
      detectedIndicators.push({
        name: `High Fever (${temp}°C)`,
        category: 'Observation',
        severity: 'critical',
        details: `Temperature is above safe threshold (${HIGH_FEVER_THRESHOLD}°C).`,
      });
      possibleConcerns.push({
        condition: 'High Fever / Systemic Infection Risk',
        severity: 'Critical',
        description: `High body temperature (${temp}°C) indicates active systemic infection, pneumonia, or inflammatory response.`,
        action: 'Isolate animal immediately, provide fresh water and shade, and contact a veterinarian.',
      });
    } else if (temp > NORMAL_TEMP_MAX) {
      rawScore += 18;
      detectedIndicators.push({
        name: `Elevated Temperature (${temp}°C)`,
        category: 'Observation',
        severity: 'warning',
        details: `Slight fever above normal range (${NORMAL_TEMP_MIN}–${NORMAL_TEMP_MAX}°C).`,
      });
    } else if (temp < HYPOTHERMIA_THRESHOLD) {
      rawScore += 30;
      detectedIndicators.push({
        name: `Hypothermia (${temp}°C)`,
        category: 'Observation',
        severity: 'critical',
        details: `Sub-normal temperature below ${HYPOTHERMIA_THRESHOLD}°C.`,
      });
      possibleConcerns.push({
        condition: 'Hypothermia / Severe Weakness',
        severity: 'Critical',
        description: `Sub-normal temperature (${temp}°C) is a sign of shock, starvation, or late-stage illness.`,
        action: 'Provide warm bedding, shelter from draft, and contact a veterinarian urgently.',
      });
    } else {
      detectedIndicators.push({
        name: `Normal Temperature (${temp}°C)`,
        category: 'Observation',
        severity: 'normal',
      });
    }
  }

  // ── B. Appetite & Activity Analysis ──
  if (appetite === 'None') {
    rawScore += 25;
    detectedIndicators.push({
      name: 'Loss of Appetite (Anorexia / Walang Gana)',
      category: 'Observation',
      severity: 'critical',
      details: 'Animal refuses to feed.',
    });
  } else if (appetite === 'Reduced') {
    rawScore += 12;
    detectedIndicators.push({
      name: 'Reduced Appetite (Bawas ang Pagkain)',
      category: 'Observation',
      severity: 'warning',
    });
  }

  if (activity === 'Lethargic') {
    rawScore += 25;
    detectedIndicators.push({
      name: 'Severe Lethargy (Lethargic / Nakahiga)',
      category: 'Observation',
      severity: 'critical',
      details: 'Animal is unresponsive or unable to stand.',
    });
  } else if (activity === 'Low') {
    rawScore += 12;
    detectedIndicators.push({
      name: 'Sluggish / Low Activity (Mabagal Kumilos)',
      category: 'Observation',
      severity: 'warning',
    });
  }

  // ── C. Specific Symptom Clusters ──
  const hasCough = symptoms.includes('cough');
  const hasNasal = symptoms.includes('nasal_discharge');
  const hasDiarrhea = symptoms.includes('diarrhea');
  const hasLameness = symptoms.includes('lameness');
  const hasPaleMembrane = symptoms.includes('pale_membrane');
  const hasBloat = symptoms.includes('bloat');
  const hasRoughCoat = symptoms.includes('rough_coat');
  const hasDroopyHead = symptoms.includes('droopy_head');

  if (hasCough || hasNasal) {
    const isSevere = hasCough && hasNasal;
    rawScore += isSevere ? 25 : 12;
    detectedIndicators.push({
      name: isSevere ? 'Respiratory Signs (Cough + Nasal Discharge)' : hasCough ? 'Coughing' : 'Nasal Discharge',
      category: 'Observation',
      severity: isSevere || (temp && temp > NORMAL_TEMP_MAX) ? 'critical' : 'warning',
    });

    if (isSevere || (temp && temp > NORMAL_TEMP_MAX)) {
      possibleConcerns.push({
        condition: 'Possible Respiratory Problem (Needs Checking)',
        severity: temp && temp >= HIGH_FEVER_THRESHOLD ? 'Critical' : 'Warning',
        description: 'Combined cough, nasal discharge, or fever is strongly associated with respiratory infection.',
        action: 'Keep in dry, well-ventilated shelter. Monitor breathing rate and consult a veterinarian if coughing persists.',
      });
    }
  }

  if (hasDiarrhea) {
    rawScore += 20;
    detectedIndicators.push({
      name: 'Diarrhea / Scours (Pagtatae)',
      category: 'Observation',
      severity: 'warning',
    });
    possibleConcerns.push({
      condition: 'Possible Gastrointestinal Issue / Dehydration Risk',
      severity: temp && temp > NORMAL_TEMP_MAX ? 'Critical' : 'Warning',
      description: 'Diarrhea can rapidly cause dehydration and electrolyte imbalance in ruminants.',
      action: 'Provide clean water with electrolytes. Separate from other animals. Check recent feed quality.',
    });
  }

  if (hasPaleMembrane) {
    rawScore += 22;
    detectedIndicators.push({
      name: 'Pale Eye/Gum Membrane (Anemia / Barber Pole Worm Sign)',
      category: 'Observation',
      severity: 'critical',
      details: 'Mucous membranes appear pale or white.',
    });
    possibleConcerns.push({
      condition: 'Possible Parasite/Worm Risk & Anemia Signs (Needs Checking)',
      severity: 'Critical',
      description: 'Pale membranes indicate significant red blood cell loss, most commonly caused by gastrointestinal parasites.',
      action: 'Perform FAMACHA eye check. Administer appropriate dewormer and consult vet for iron support.',
    });
  }

  if (hasBloat) {
    rawScore += 25;
    detectedIndicators.push({
      name: 'Abdominal Distension / Bloat (Kabag sa Tiyan)',
      category: 'Observation',
      severity: 'critical',
    });
    possibleConcerns.push({
      condition: 'Possible Bloat / Digestive Disturbance Risk',
      severity: 'Critical',
      description: 'Distended left flank or tight rumen requires urgent attention to prevent respiratory compromise.',
      action: 'Keep animal standing and gently walk. Avoid wet legume feed. Pass stomach tube or contact vet if distension is severe.',
    });
  }

  if (hasLameness) {
    rawScore += 15;
    detectedIndicators.push({
      name: 'Limping / Lameness (Pilay / Sakit sa Paa)',
      category: 'Observation',
      severity: 'warning',
    });
    possibleConcerns.push({
      condition: 'Possible Hoof Problem / Lameness Risk',
      severity: 'Warning',
      description: 'Lameness indicates possible hoof rot, overgrown hooves, joint infection, or trauma.',
      action: 'Inspect and trim hooves. Clean any wet mud or debris. Apply antiseptic hoof spray if foul odor is detected.',
    });
  }

  if (hasRoughCoat) {
    rawScore += 8;
    detectedIndicators.push({
      name: 'Rough / Scruffy Coat (Magaspang na Balhibo)',
      category: 'Observation',
      severity: 'warning',
    });
  }

  if (hasDroopyHead) {
    rawScore += 12;
    detectedIndicators.push({
      name: 'Droopy Head / Isolation (Nakabitin ang Ulo / Malayo sa Kawan)',
      category: 'Observation',
      severity: 'warning',
    });
  }

  // ── D. Automated Database Context Factors ──
  if (recentWeightLossPct !== null && recentWeightLossPct <= -5) {
    const isMajorLoss = recentWeightLossPct <= -10;
    rawScore += isMajorLoss ? 20 : 10;
    detectedIndicators.push({
      name: `Historical Weight Drop (${recentWeightLossPct}%)`,
      category: 'Database History',
      severity: isMajorLoss ? 'critical' : 'warning',
      details: `Lost weight compared to previous record (${animalWeights[1]?.weight_kg} kg → ${animalWeights[0]?.weight_kg} kg).`,
    });
  }

  if (hasOverdueVaccine) {
    rawScore += 8;
    detectedIndicators.push({
      name: 'Overdue Preventive Care / Deworming',
      category: 'Database History',
      severity: 'warning',
      details: 'Animal has pending or overdue vaccinations/deworming.',
    });
  }

  if (ageMonths < 6) {
    // Young kids/lambs are more vulnerable to sudden disease
    if (rawScore > 10) rawScore += 8;
    detectedIndicators.push({
      name: `Young Age Vulnerability (${ageMonths} mos)`,
      category: 'Database History',
      severity: 'normal',
      details: 'Young ruminants have higher vulnerability to infections and dehydration.',
    });
  }

  // ── E. Camera ML Computer Vision Signals ──
  if (hasCameraScan && cameraResult) {
    const camIndicators = cameraResult.indicators || [];
    const isConcern = cameraResult.prediction === 'possible_health_concern' || cameraResult.riskLevel === 'HIGH' || cameraResult.riskLevel === 'CRITICAL';

    if (isConcern) {
      rawScore += Math.min(30, Math.round((cameraResult.riskScore || 40) * 0.4));
      detectedIndicators.push({
        name: `Camera ML: Visual Concern Detected (${cameraResult.riskLevelLabel})`,
        category: 'Camera ML Vision',
        severity: cameraResult.riskScore >= 60 ? 'critical' : 'warning',
        details: `${Math.round(cameraResult.confidence * 100)}% visual ML confidence.`,
      });
    } else {
      detectedIndicators.push({
        name: `Camera ML: Normal Visual Appearance (${Math.round(cameraResult.confidence * 100)}%)`,
        category: 'Camera ML Vision',
        severity: 'normal',
      });
    }

    camIndicators.forEach((ci) => {
      if (ci.indicator !== 'NORMAL') {
        detectedIndicators.push({
          name: `Camera ML: ${ci.label}`,
          category: 'Camera ML Vision',
          severity: ci.riskPoints >= 15 ? 'critical' : 'warning',
          details: ci.description,
        });
      }
    });
  }

  // 6. Calculate Final Risk Score & Risk Level
  const finalScore = Math.min(100, Math.max(5, rawScore));
  let riskLevel: EarlyIllnessRiskLevel = 'Low Risk';
  if (finalScore >= 65) riskLevel = 'High Risk';
  else if (finalScore >= 35) riskLevel = 'Moderate Risk';

  // 7. Calculate Confidence Percentage
  // Confidence grows with multiple independent data sources
  let dataPointsCount = 0;
  if (hasObsTemp) dataPointsCount += 2;
  if (hasObsAppetite) dataPointsCount += 1;
  if (hasObsActivity) dataPointsCount += 1;
  if (hasObsSymptoms) dataPointsCount += symptoms.length;
  if (animalWeights.length >= 2) dataPointsCount += 1;
  if (hasCameraScan) dataPointsCount += 2;

  const confidencePercent = Math.min(95, Math.max(50, 45 + dataPointsCount * 7));

  // 8. Determine Veterinary Attention Recommendation
  let veterinaryAttention: VetAttentionStatus = 'Not Required — Monitor Regularly';
  if (riskLevel === 'High Risk' || finalScore >= 65 || possibleConcerns.some((c) => c.severity === 'Critical')) {
    veterinaryAttention = 'Recommended — Urgent';
  } else if (riskLevel === 'Moderate Risk' || finalScore >= 35 || possibleConcerns.length > 0) {
    veterinaryAttention = 'Recommended — Routine Consult';
  }

  // 9. Generate Tailored Recommendations
  if (veterinaryAttention === 'Recommended — Urgent') {
    recommendations.push('Contact a licensed veterinarian immediately for physical examination and diagnosis.');
    recommendations.push('Isolate the animal in a clean, quiet, and well-ventilated recovery pen to prevent transmission.');
    recommendations.push('Provide continuous access to clean fresh water with oral rehydration salts/electrolytes.');
    recommendations.push('Record temperature and vital signs every 6 to 12 hours.');
  } else if (veterinaryAttention === 'Recommended — Routine Consult') {
    recommendations.push('Monitor the animal closely over the next 24–48 hours for any worsening symptoms.');
    recommendations.push('Verify deworming and vaccination schedule against farm health records.');
    recommendations.push('Offer high-quality forage and clean water in an uncrowded pen.');
    recommendations.push('Consult your farm veterinarian if appetite does not return to normal within 24 hours.');
  } else {
    recommendations.push('Animal appears healthy and shows low illness indicators.');
    recommendations.push('Maintain regular feeding, clean water, and scheduled preventive care.');
    recommendations.push('Re-screen in 7–14 days as part of routine herd health monitoring.');
  }

  // 10. Check for Significant Risk Jump
  const riskDelta = previousRiskScore !== null ? finalScore - previousRiskScore : null;
  const isSignificantIncrease =
    (riskDelta !== null && riskDelta >= 20) ||
    (previousRecord && previousRecord.risk_level === 'Low' && (riskLevel === 'Moderate Risk' || riskLevel === 'High Risk'));

  return {
    animalId: animal.id,
    animalName: animal.name,
    species: animal.species,
    timestamp: now,
    modelVersion: EARLY_ILLNESS_MODEL_VERSION,
    status: 'SUCCESS',
    riskScore: finalScore,
    riskLevel,
    confidencePercent,
    possibleConcerns,
    detectedIndicators,
    recommendations,
    veterinaryAttention,
    previousRiskScore,
    riskDelta,
    isSignificantIncrease,
    contextSummary: {
      ageMonths,
      weightTrend,
      recentWeightLossPct,
      vaccinationStatus: animal.vaccination_status,
      hasOverdueVaccine,
      cameraScanUsed: hasCameraScan,
    },
    disclaimer:
      'This assessment is an ML-powered early warning screening tool and NOT a definitive veterinary diagnosis. Always consult a licensed veterinarian for clinical confirmation and prescription medication.',
  };
}
