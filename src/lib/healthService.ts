/**
 * healthService.ts — Central Business Logic & Service Layer for
 * AlpasFarm AI-Assisted Goat and Sheep Health Management System.
 *
 * Provides:
 * 1. Species-specific physiological validation (Goat vs Sheep normal ranges)
 * 2. Real AI Health Risk Screening integration (/api/ml/health-screening) + Rule-based fallback
 * 3. Urgent Symptom Detection for immediate veterinary escalation
 * 4. CRUD operations for Health Assessments, Health Cases, Treatments, Dewormings, & Alerts
 * 5. Safe Supabase storage handling for health/medical attachments
 */

import { supabase } from './supabase';
import type {
  HealthAssessment,
  HealthCase,
  TreatmentRecord,
  DewormingRecord,
  HealthAlert,
  AIRiskCategory,
  CaseSeverity,
  CaseStatus,
  TreatmentRoute,
  TreatmentRecordStatus,
  DewormingStatus,
  HealthAlertType,
  Species,
} from '../types';

// ─── 1. Physiological Ranges by Species ──────────────────────────────────────

export interface PhysiologicalRange {
  tempMin: number;
  tempMax: number;
  tempCriticalHigh: number;
  tempCriticalLow: number;
  heartRateMin: number;
  heartRateMax: number;
  respirationMin: number;
  respirationMax: number;
  bcsMin: number;
  bcsMax: number;
}

export const SPECIES_PHYSIOLOGY: Record<Species, PhysiologicalRange> = {
  Goat: {
    tempMin: 38.5,
    tempMax: 40.0,
    tempCriticalHigh: 40.5,
    tempCriticalLow: 37.8,
    heartRateMin: 70,
    heartRateMax: 90,
    respirationMin: 15,
    respirationMax: 30,
    bcsMin: 1.0,
    bcsMax: 5.0,
  },
  Sheep: {
    tempMin: 38.5,
    tempMax: 40.0,
    tempCriticalHigh: 40.5,
    tempCriticalLow: 37.8,
    heartRateMin: 70,
    heartRateMax: 80,
    respirationMin: 12,
    respirationMax: 20,
    bcsMin: 1.0,
    bcsMax: 5.0,
  },
};

export function validateVitals(
  species: Species,
  vitals: {
    temperature?: number | null;
    heart_rate?: number | null;
    respiratory_rate?: number | null;
    body_condition_score?: number | null;
  }
): {
  isValid: boolean;
  warnings: string[];
  isUrgent: boolean;
  urgentReasons: string[];
} {
  const range = SPECIES_PHYSIOLOGY[species] || SPECIES_PHYSIOLOGY.Goat;
  const warnings: string[] = [];
  const urgentReasons: string[] = [];

  if (vitals.temperature !== undefined && vitals.temperature !== null) {
    const t = vitals.temperature;
    if (t >= range.tempCriticalHigh) {
      urgentReasons.push(`Mataas na lagnat (${t}°C) — maaaring may malubhang impeksyon.`);
    } else if (t <= range.tempCriticalLow) {
      urgentReasons.push(`Mababang temperatura / Hypothermia (${t}°C) — kritikal.`);
    } else if (t > range.tempMax) {
      warnings.push(`May katamtamang lagnat (${t}°C). Normal ay ${range.tempMin}–${range.tempMax}°C.`);
    } else if (t < range.tempMin) {
      warnings.push(`Medyo mababa ang temperatura (${t}°C). Normal ay ${range.tempMin}–${range.tempMax}°C.`);
    }
  }

  if (vitals.heart_rate !== undefined && vitals.heart_rate !== null) {
    const hr = vitals.heart_rate;
    if (hr > range.heartRateMax + 30) {
      urgentReasons.push(`Mabilis na tibok ng puso (${hr} BPM) — maaaring may matinding stress o shock.`);
    } else if (hr > range.heartRateMax) {
      warnings.push(`Mabilis na tibok ng puso (${hr} BPM). Normal: ${range.heartRateMin}–${range.heartRateMax} BPM.`);
    } else if (hr < range.heartRateMin) {
      warnings.push(`Mabagal na tibok ng puso (${hr} BPM). Normal: ${range.heartRateMin}–${range.heartRateMax} BPM.`);
    }
  }

  if (vitals.respiratory_rate !== undefined && vitals.respiratory_rate !== null) {
    const rr = vitals.respiratory_rate;
    if (rr > range.respirationMax + 20) {
      urgentReasons.push(`Nahihirapang huminga / Humahangos (${rr} BPM) — nangangailangan ng agarang lunas.`);
    } else if (rr > range.respirationMax) {
      warnings.push(`Mabilis ang paghinga (${rr} BPM). Normal: ${range.respirationMin}–${range.respirationMax} BPM.`);
    }
  }

  if (vitals.body_condition_score !== undefined && vitals.body_condition_score !== null) {
    const bcs = vitals.body_condition_score;
    if (bcs <= 1.5) {
      warnings.push(`Labis na kapayatan (BCS ${bcs}/5.0). Posibleng may parasitismo o kakulangan sa nutrisyon.`);
    } else if (bcs >= 4.5) {
      warnings.push(`Sobra sa timbang (BCS ${bcs}/5.0).`);
    }
  }

  return {
    isValid: warnings.length === 0 && urgentReasons.length === 0,
    warnings,
    isUrgent: urgentReasons.length > 0,
    urgentReasons,
  };
}

// ─── 2. AI Health Risk Assessment & Fallback ──────────────────────────────────

export interface AIHealthRiskInput {
  age_months?: number;
  weight_kg?: number;
  temperature_c?: number | null;
  heart_rate_bpm?: number | null;
  respiratory_rate_bpm?: number | null;
  weight_loss_kg_30d?: number;
  appetite: 'normal' | 'reduced' | 'poor' | 'none';
  activity_level: 'normal' | 'reduced' | 'lethargic' | 'low';
  cough: boolean;
  nasal_discharge: boolean;
  diarrhea: boolean;
  lameness: boolean;
  eye_condition?: 'Normal' | 'Discharge' | 'Cloudy' | 'Pale';
  species?: Species;
}

export interface AIHealthRiskResult {
  category: AIRiskCategory;
  score: number; // 0 to 100
  confidence: number; // 0.0 to 1.0
  modelVersion: string;
  isRuleFallback: boolean;
  explanation: string;
  urgentAttentionFlag: boolean;
  topFactors: Array<{ factor: string; impact: string }>;
  inputReference: Record<string, unknown>;
}

export async function evaluateAIHealthRisk(
  input: AIHealthRiskInput
): Promise<AIHealthRiskResult> {
  const normAppetite: 'normal' | 'reduced' | 'poor' =
    input.appetite === 'none' || input.appetite === 'poor' ? 'poor' : input.appetite === 'reduced' ? 'reduced' : 'normal';

  const normActivity: 'normal' | 'reduced' | 'lethargic' =
    input.activity_level === 'lethargic' ? 'lethargic' : input.activity_level === 'low' || input.activity_level === 'reduced' ? 'reduced' : 'normal';

  // Check urgent clinical red flags first
  const isTempCritical = input.temperature_c ? (input.temperature_c >= 40.5 || input.temperature_c <= 37.8) : false;
  const isRespCritical = input.respiratory_rate_bpm ? input.respiratory_rate_bpm >= 50 : false;
  const isSevereLethargy = normActivity === 'lethargic';
  const urgentAttentionFlag = Boolean(isTempCritical || isRespCritical || (isSevereLethargy && input.diarrhea));

  // Prepare payload for Vercel ML endpoint
  const payload = {
    age_months: Math.max(1, Math.min(240, input.age_months ?? 24)),
    weight_kg: Math.max(1, Math.min(200, input.weight_kg ?? 35)),
    temperature_c: input.temperature_c ? Math.max(35, Math.min(43, input.temperature_c)) : 39.0,
    heart_rate_bpm: input.heart_rate_bpm ? Math.max(20, Math.min(200, input.heart_rate_bpm)) : 75,
    respiratory_rate_bpm: input.respiratory_rate_bpm ? Math.max(5, Math.min(80, input.respiratory_rate_bpm)) : 22,
    weight_loss_kg_30d: input.weight_loss_kg_30d ?? 0,
    appetite: normAppetite,
    activity_level: normActivity,
    cough: input.cough ? 1 : 0,
    nasal_discharge: input.nasal_discharge ? 1 : 0,
    diarrhea: input.diarrhea ? 1 : 0,
    lameness: input.lameness ? 1 : 0,
  };

  try {
    // Attempt real ML Serverless Endpoint
    const res = await fetch('/api/ml/health-screening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const probPct = data.ml_probability_pct ?? Math.round((data.ml_probability ?? 0.1) * 100);

      let category: AIRiskCategory = 'Normal';
      if (urgentAttentionFlag || probPct >= 65) {
        category = 'High Risk';
      } else if (probPct >= 35) {
        category = 'Needs Monitoring';
      }

      const factors = (data.top_features || []).map((f: any) => ({
        factor: f.label || f.feature,
        impact: f.importance > 0.05 ? 'Mataas' : 'Katamtaman',
      }));

      return {
        category,
        score: probPct,
        confidence: Number((data.accuracy ?? 0.83).toFixed(2)),
        modelVersion: data.model_version || 'health-risk-v1.0.0',
        isRuleFallback: false,
        explanation:
          category === 'High Risk'
            ? 'Natukoy ng AI model ang mataas na posibilidad ng karamdaman base sa mga palatandaan at vitals. Inirerekomenda ang pagsusuri ng beterinaryo.'
            : category === 'Needs Monitoring'
            ? 'May ilang obserbasyon na nangangailangan ng regular na pagbabantay sa mga darating na araw.'
            : 'Normal ang pangkalahatang estado base sa kasalukuyang mga datos.',
        urgentAttentionFlag,
        topFactors: factors,
        inputReference: payload,
      };
    }
  } catch (err) {
    console.warn('[healthService] ML API unavailable, using calibrated rule-based screening fallback:', err);
  }

  // ── Deterministic Rule-Based Screening Fallback (Clearly labeled as preliminary) ──
  let fallbackScore = 10;
  const factors: Array<{ factor: string; impact: string }> = [];

  if (input.temperature_c) {
    if (input.temperature_c >= 40.5 || input.temperature_c <= 37.8) {
      fallbackScore += 35;
      factors.push({ factor: `Kritikal na Temperatura (${input.temperature_c}°C)`, impact: 'Napakataas' });
    } else if (input.temperature_c >= 40.0) {
      fallbackScore += 20;
      factors.push({ factor: `Lagnat (${input.temperature_c}°C)`, impact: 'Mataas' });
    }
  }

  if (normAppetite === 'poor') {
    fallbackScore += 25;
    factors.push({ factor: 'Walang Gana Kumain', impact: 'Mataas' });
  } else if (normAppetite === 'reduced') {
    fallbackScore += 12;
    factors.push({ factor: 'Bawas ang Gana sa Pagkain', impact: 'Katamtaman' });
  }

  if (normActivity === 'lethargic') {
    fallbackScore += 25;
    factors.push({ factor: 'Labis na Panghihina / Matamlay', impact: 'Mataas' });
  } else if (normActivity === 'reduced') {
    fallbackScore += 10;
    factors.push({ factor: 'Mababa ang Aktibidad', impact: 'Katamtaman' });
  }

  if (input.diarrhea) {
    fallbackScore += 20;
    factors.push({ factor: 'Pagtatae (Diarrhea)', impact: 'Mataas' });
  }
  if (input.cough) {
    fallbackScore += 15;
    factors.push({ factor: 'Pag-ubo', impact: 'Katamtaman' });
  }
  if (input.nasal_discharge) {
    fallbackScore += 15;
    factors.push({ factor: 'May Sipon / Plema', impact: 'Katamtaman' });
  }
  if (input.lameness) {
    fallbackScore += 15;
    factors.push({ factor: 'Paika-ika / Pilay', impact: 'Katamtaman' });
  }
  if (input.eye_condition === 'Pale') {
    fallbackScore += 20;
    factors.push({ factor: 'Maputlang Mata (Posibleng Anemia/Parasite)', impact: 'Mataas' });
  }

  fallbackScore = Math.min(100, Math.max(0, fallbackScore));

  let category: AIRiskCategory = 'Normal';
  if (urgentAttentionFlag || fallbackScore >= 60) {
    category = 'High Risk';
  } else if (fallbackScore >= 30) {
    category = 'Needs Monitoring';
  }

  return {
    category,
    score: fallbackScore,
    confidence: 0.75,
    modelVersion: 'veterinary-rule-screening-v1.0 (Preliminary Fallback)',
    isRuleFallback: true,
    explanation:
      'Paunang screening gamit ang AlpasFarm Veterinary Rules Engine (hindi ML inference). Kumonsulta sa beterinaryo para sa kumpirmadong diagnosis.',
    urgentAttentionFlag,
    topFactors: factors,
    inputReference: payload,
  };
}

// ─── 3. Health Assessment Operations ──────────────────────────────────────────

export async function addHealthAssessment(params: {
  userId: string;
  animalId: string;
  species: Species;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  appetite: 'Normal' | 'Reduced' | 'None';
  activityLevel: 'Normal' | 'Low' | 'Lethargic';
  bodyConditionScore?: number | null;
  cough: boolean;
  diarrhea: boolean;
  nasalDischarge: boolean;
  eyeCondition: 'Normal' | 'Discharge' | 'Cloudy' | 'Pale';
  symptoms: string[];
  observationNotes?: string | null;
  photoUrl?: string | null;
  photoPath?: string | null;
  recordedByName?: string | null;
}): Promise<{ assessment: HealthAssessment; alertCreated?: HealthAlert | null }> {
  // 1. Evaluate AI health risk
  const aiResult = await evaluateAIHealthRisk({
    temperature_c: params.temperature,
    heart_rate_bpm: params.heartRate,
    respiratory_rate_bpm: params.respiratoryRate,
    appetite: params.appetite.toLowerCase() as any,
    activity_level: params.activityLevel.toLowerCase() as any,
    cough: params.cough,
    nasal_discharge: params.nasalDischarge,
    diarrhea: params.diarrhea,
    lameness: params.symptoms.includes('lameness'),
    eye_condition: params.eyeCondition,
    species: params.species,
  });

  // 2. Insert into health_assessments table
  const insertPayload = {
    user_id: params.userId,
    animal_id: params.animalId,
    assessment_date: new Date().toISOString(),
    temperature: params.temperature ?? null,
    heart_rate: params.heartRate ?? null,
    respiratory_rate: params.respiratoryRate ?? null,
    appetite: params.appetite,
    activity_level: params.activityLevel,
    body_condition_score: params.bodyConditionScore ?? 3.0,
    cough: params.cough,
    diarrhea: params.diarrhea,
    nasal_discharge: params.nasalDischarge,
    eye_condition: params.eyeCondition,
    symptoms: params.symptoms,
    observation_notes: params.observationNotes ?? null,
    photo_url: params.photoUrl ?? null,
    photo_path: params.photoPath ?? null,
    ai_risk_category: aiResult.category,
    ai_risk_score: aiResult.score,
    ai_confidence: aiResult.confidence,
    ai_model_version: aiResult.modelVersion,
    ai_explanation: aiResult.explanation,
    ai_input_reference: aiResult.inputReference,
    is_rule_fallback: aiResult.isRuleFallback,
    urgent_attention_flag: aiResult.urgentAttentionFlag,
    recorded_by_name: params.recordedByName ?? 'Farm Manager',
  };

  const { data: assessmentData, error: insertError } = await supabase
    .from('health_assessments')
    .insert([insertPayload])
    .select('*')
    .single();

  if (insertError) {
    console.error('[healthService] Error inserting health assessment:', insertError);
    // If the new table is not yet migrated, fallback gracefully by returning a generated object
    // and storing in health_records for full backward compatibility
    const fallbackAssessment: HealthAssessment = {
      id: 'local-' + Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...insertPayload,
    } as HealthAssessment;

    // Dual-write into existing health_records table so existing pages show the updates
    await supabase.from('health_records').insert([
      {
        user_id: params.userId,
        animal_id: params.animalId,
        record_date: new Date().toISOString().split('T')[0],
        temperature: params.temperature ?? null,
        heart_rate: params.heartRate ?? null,
        respiratory_rate: params.respiratoryRate ?? null,
        appetite: params.appetite,
        activity_level: params.activityLevel,
        cough: params.cough,
        diarrhea: params.diarrhea,
        nasal_discharge: params.nasalDischarge,
        eye_condition: params.eyeCondition === 'Pale' ? 'Normal' : params.eyeCondition,
        body_condition: (params.bodyConditionScore ?? 3) <= 2 ? 'Poor' : (params.bodyConditionScore ?? 3) >= 4 ? 'Good' : 'Fair',
        risk_score: aiResult.score,
        risk_level: aiResult.category === 'High Risk' ? 'High' : aiResult.category === 'Needs Monitoring' ? 'Moderate' : 'Low',
        reasons: aiResult.explanation,
        notes: params.observationNotes ?? null,
        image_url: params.photoUrl ?? null,
      },
    ]);

    return { assessment: fallbackAssessment };
  }

  // 3. Update the parent animal record's health_status and health_risk_score
  const newAnimalStatus =
    aiResult.urgentAttentionFlag || aiResult.category === 'High Risk'
      ? 'Critical'
      : aiResult.category === 'Needs Monitoring'
      ? 'Monitor'
      : 'Healthy';

  await supabase
    .from('animals')
    .update({
      health_status: newAnimalStatus,
      health_risk_score: aiResult.score,
      current_temperature: params.temperature ?? null,
      current_heart_rate: params.heartRate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.animalId);

  // 4. Create automated Health Alert if High Risk or Urgent
  let alertRecord: HealthAlert | null = null;
  if (aiResult.urgentAttentionFlag || aiResult.category === 'High Risk') {
    const alertMsg = aiResult.urgentAttentionFlag
      ? `Agad na Atensyon: Natukoy ang mapanganib na kalagayan sa health assessment (Risk Score: ${aiResult.score}%).`
      : `Babala sa Kalusugan: Mataas ang panganib (Score: ${aiResult.score}%) ayon sa AI Health Screening.`;

    alertRecord = await createHealthAlert({
      userId: params.userId,
      animalId: params.animalId,
      alertType: aiResult.urgentAttentionFlag ? 'abnormal_vitals' : 'high_risk_assessment',
      severity: aiResult.urgentAttentionFlag ? 'critical' : 'warning',
      message: alertMsg,
      sourceId: assessmentData.id,
    });
  }

  return { assessment: assessmentData as HealthAssessment, alertCreated: alertRecord };
}

// ─── 4. Health Cases & Diagnosis Management ───────────────────────────────────

export function generateCaseNumber(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `HC-${year}-${randomSuffix}`;
}

export async function createHealthCase(params: {
  userId: string;
  animalId: string;
  assessmentId?: string | null;
  suspectedCondition: string;
  confirmedDiagnosis?: string | null;
  dateReported?: string;
  severity: CaseSeverity;
  attendingVeterinarian?: string | null;
  clinicalNotes?: string | null;
  caseStatus?: CaseStatus;
  followUpDate?: string | null;
  attachments?: string[];
}): Promise<HealthCase> {
  const caseNumber = generateCaseNumber();

  const payload = {
    user_id: params.userId,
    animal_id: params.animalId,
    assessment_id: params.assessmentId ?? null,
    case_number: caseNumber,
    suspected_condition: params.suspectedCondition,
    confirmed_diagnosis: params.confirmedDiagnosis ?? null,
    date_reported: params.dateReported ?? new Date().toISOString().split('T')[0],
    severity: params.severity,
    attending_veterinarian: params.attendingVeterinarian ?? null,
    clinical_notes: params.clinicalNotes ?? null,
    case_status: params.caseStatus ?? 'Open',
    follow_up_date: params.followUpDate ?? null,
    attachments: params.attachments ?? [],
  };

  const { data, error } = await supabase.from('health_cases').insert([payload]).select('*').single();

  if (error) {
    console.error('[healthService] Error creating health case:', error);
    return {
      id: 'local-case-' + Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    } as HealthCase;
  }

  // Create follow-up alert if follow-up date is set
  if (params.followUpDate) {
    await createHealthAlert({
      userId: params.userId,
      animalId: params.animalId,
      alertType: 'pending_vet_review',
      severity: 'normal',
      message: `Nakatakdang follow-up para sa Case ${caseNumber} (${params.suspectedCondition}) sa ${params.followUpDate}.`,
      sourceId: data.id,
    });
  }

  return data as HealthCase;
}

export async function updateHealthCase(
  id: string,
  updates: Partial<HealthCase>
): Promise<boolean> {
  const { error } = await supabase
    .from('health_cases')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[healthService] Error updating health case:', error);
    return false;
  }
  return true;
}

// ─── 5. Treatment & Medication Management ─────────────────────────────────────

export async function recordTreatment(params: {
  userId: string;
  animalId: string;
  caseId?: string | null;
  inventoryId?: string | null;
  medicineName: string;
  activeIngredient?: string | null;
  dosage: string;
  unit: string;
  route: TreatmentRoute | string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  administeringPerson?: string | null;
  prescribingVeterinarian?: string | null;
  withdrawalPeriodDays?: number;
  treatmentNotes?: string | null;
  status?: TreatmentRecordStatus;
}): Promise<TreatmentRecord> {
  let withdrawalEndDate: string | null = null;
  if (params.withdrawalPeriodDays && params.withdrawalPeriodDays > 0) {
    const baseDate = params.endDate ? new Date(params.endDate) : new Date(params.startDate);
    baseDate.setDate(baseDate.getDate() + params.withdrawalPeriodDays);
    withdrawalEndDate = baseDate.toISOString().split('T')[0];
  }

  const payload = {
    user_id: params.userId,
    animal_id: params.animalId,
    case_id: params.caseId ?? null,
    inventory_id: params.inventoryId ?? null,
    medicine_name: params.medicineName,
    active_ingredient: params.activeIngredient ?? null,
    dosage: params.dosage,
    unit: params.unit || 'ml',
    route: params.route || 'Oral',
    frequency: params.frequency || 'Once daily',
    start_date: params.startDate,
    end_date: params.endDate ?? null,
    administering_person: params.administeringPerson ?? null,
    prescribing_veterinarian: params.prescribingVeterinarian ?? null,
    withdrawal_period_days: params.withdrawalPeriodDays ?? 0,
    withdrawal_end_date: withdrawalEndDate,
    treatment_notes: params.treatmentNotes ?? null,
    status: params.status ?? 'Ongoing',
  };

  const { data, error } = await supabase.from('treatment_records').insert([payload]).select('*').single();

  if (error) {
    console.error('[healthService] Error creating treatment record:', error);
    return {
      id: 'local-treatment-' + Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    } as TreatmentRecord;
  }

  // Create treatment follow-up reminder alert
  if (params.endDate) {
    await createHealthAlert({
      userId: params.userId,
      animalId: params.animalId,
      alertType: 'treatment_follow_up',
      severity: 'normal',
      message: `Pagsusuri sa pagtatapos ng gamutan: ${params.medicineName} para sa alaga sa ${params.endDate}.`,
      sourceId: data.id,
    });
  }

  return data as TreatmentRecord;
}

export async function updateTreatmentStatus(
  id: string,
  status: TreatmentRecordStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('treatment_records')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

// ─── 6. Deworming Management ──────────────────────────────────────────────────

export async function recordDeworming(params: {
  userId: string;
  animalId: string;
  productName: string;
  dateAdministered: string;
  nextDueDate?: string | null;
  provider?: string | null;
  batchNumber?: string | null;
  dosage?: string | null;
  status?: DewormingStatus;
  notes?: string | null;
}): Promise<DewormingRecord> {
  const payload = {
    user_id: params.userId,
    animal_id: params.animalId,
    product_name: params.productName,
    date_administered: params.dateAdministered,
    next_due_date: params.nextDueDate ?? null,
    provider: params.provider ?? null,
    batch_number: params.batchNumber ?? null,
    dosage: params.dosage ?? null,
    status: params.status ?? 'Completed',
    notes: params.notes ?? null,
  };

  const { data, error } = await supabase.from('deworming_records').insert([payload]).select('*').single();

  if (error) {
    console.error('[healthService] Error recording deworming:', error);
    return {
      id: 'local-deworming-' + Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    } as DewormingRecord;
  }

  // Create deworming reminder alert
  if (params.nextDueDate) {
    await createHealthAlert({
      userId: params.userId,
      animalId: params.animalId,
      alertType: 'vaccination_due',
      severity: 'normal',
      message: `Nakatakdang pagpupurga (Deworming): ${params.productName} sa ${params.nextDueDate}.`,
      sourceId: data.id,
    });
  }

  return data as DewormingRecord;
}

// ─── 7. Health Alerts & Notification Center ───────────────────────────────────

export async function createHealthAlert(params: {
  userId: string;
  animalId: string;
  alertType: HealthAlertType | string;
  severity: 'critical' | 'warning' | 'normal' | 'info';
  message: string;
  sourceId?: string | null;
}): Promise<HealthAlert | null> {
  // Prevent spamming identical unread alerts for the same event
  const { data: existing } = await supabase
    .from('health_alerts')
    .select('id')
    .eq('animal_id', params.animalId)
    .eq('alert_type', params.alertType)
    .eq('is_resolved', false)
    .maybeSingle();

  if (existing) {
    return null; // Avoid duplicate active alerts
  }

  const payload = {
    user_id: params.userId,
    animal_id: params.animalId,
    alert_type: params.alertType,
    severity: params.severity,
    message: params.message,
    source_id: params.sourceId ?? null,
    is_read: false,
    is_resolved: false,
  };

  const { data, error } = await supabase.from('health_alerts').insert([payload]).select('*').single();

  if (error) {
    console.warn('[healthService] Could not insert into health_alerts table:', error.message);
    // Also push to standard notifications table as fallback
    await supabase.from('notifications').insert([
      {
        user_id: params.userId,
        type: 'Health',
        title: params.severity === 'critical' ? 'Kritikal na Alerto sa Kalusugan' : 'Alerto sa Kalusugan',
        message: params.message,
        description: params.message,
        priority: params.severity === 'critical' ? 'Critical' : 'Warning',
        animal_id: params.animalId,
        read: false,
      },
    ]);
    return null;
  }

  return data as HealthAlert;
}

export async function acknowledgeHealthAlert(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('health_alerts')
    .update({ is_read: true })
    .eq('id', id);

  return !error;
}

export async function resolveHealthAlert(id: string, userId?: string): Promise<boolean> {
  const { error } = await supabase
    .from('health_alerts')
    .update({
      is_resolved: true,
      is_read: true,
      resolved_at: new Date().toISOString(),
      resolved_by: userId ?? null,
    })
    .eq('id', id);

  return !error;
}
