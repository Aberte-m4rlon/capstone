/**
 * useCameraScreenings.ts — React hooks + CRUD for AI Health Scanner results
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { ScanResult } from './cameraML';
import { canvasToBlob } from './cameraML';
import { createNotification } from './recommendations';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CameraScreening {
  id: string;
  user_id: string;
  animal_id: string;
  image_path: string | null;
  image_url: string | null;
  // Legacy field
  prediction: 'normal_appearance' | 'possible_health_concern' | 'low_confidence';
  confidence: number;
  model_version: string;
  quality_score: number;
  quality_issues: string[];
  notes: string | null;
  created_at: string;
  // Extended fields (may be null for old records)
  risk_score?: number | null;
  risk_level?: string | null;
  indicators?: string[] | null;
  combined_risk_score?: number | null;
  combined_factors?: string[] | null;
  recommendation?: string | null;
  goat_detected?: boolean | null;
  scan_type?: string | null;
}

export interface ScreeningSummary {
  total: number;
  possibleConcerns: number;
  highRisk: number;
  lowConfidence: number;
  lastScreeningDate: string | null;
}

const BUCKET = 'animal-screenings';

// ── Save result ───────────────────────────────────────────────────────────────

export async function saveScreeningResult(
  animalId: string,
  userId: string,
  result: ScanResult,
  canvas: HTMLCanvasElement | null,
  notes?: string,
): Promise<{ data: CameraScreening | null; error: string | null }> {
  let imagePath: string | null = null;
  let imageUrl: string | null = null;

  if (canvas) {
    try {
      const blob = await canvasToBlob(canvas);
      const fileName = `${crypto.randomUUID()}.jpg`;
      const storagePath = `screenings/${userId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
      if (!uploadError) {
        imagePath = storagePath;
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
        imageUrl = signed?.signedUrl ?? null;
      }
    } catch { /* non-fatal */ }
  }

  const finalScore = result.combinedRiskScore ?? result.riskScore;

  const { data, error } = await supabase
    .from('camera_health_screenings')
    .insert({
      user_id: userId,
      animal_id: animalId,
      image_path: imagePath,
      image_url: imageUrl,
      prediction: result.prediction,
      confidence: result.confidence,
      model_version: result.modelVersion,
      quality_score: result.qualityReport.score,
      quality_issues: result.qualityReport.issues,
      notes: notes ?? null,
      // Extended fields — stored in notes JSON fallback if column not present
      risk_score: finalScore,
      risk_level: result.riskLevel,
      indicators: result.indicators.map((i) => i.label),
      combined_risk_score: result.combinedRiskScore,
      combined_factors: result.combinedFactors,
      recommendation: result.recommendation,
      goat_detected: result.goatDetected,
      scan_type: result.scanType,
    })
    .select()
    .single();

  // If extended columns don't exist yet, retry with base columns only
  if (error && (error.message.includes('column') || error.message.includes('schema'))) {
    const { data: data2, error: error2 } = await supabase
      .from('camera_health_screenings')
      .insert({
        user_id: userId,
        animal_id: animalId,
        image_path: imagePath,
        image_url: imageUrl,
        prediction: result.prediction,
        confidence: result.confidence,
        model_version: result.modelVersion,
        quality_score: result.qualityReport.score,
        quality_issues: result.qualityReport.issues,
        notes: notes ? `${notes} | Risk:${finalScore} | ${result.riskLevelLabel}` : `Risk:${finalScore} | ${result.riskLevelLabel}`,
      })
      .select()
      .single();
    if (error2) return { data: null, error: error2.message };
    await syncScreeningToAnimalHealth(animalId, userId, result, finalScore, notes);
    return { data: data2 as CameraScreening, error: null };
  }

  if (error) return { data: null, error: error.message };
  await syncScreeningToAnimalHealth(animalId, userId, result, finalScore, notes);
  return { data: data as CameraScreening, error: null };
}

async function syncScreeningToAnimalHealth(
  animalId: string,
  userId: string,
  result: ScanResult,
  finalScore: number,
  notes?: string,
): Promise<void> {
  if (!animalId || animalId === 'unlinked') return;

  const scoreVal = Math.round(Number(finalScore) || 0);
  let mappedStatus: 'Healthy' | 'Monitor' | 'Needs Attention' = 'Healthy';
  let notificationPriority: 'Warning' | 'Critical' | null = null;
  let notificationMsg = '';
  const rawRisk = (result.riskLevel || '').toLowerCase();

  if (scoreVal >= 50 || rawRisk.includes('high') || rawRisk.includes('crit')) {
    mappedStatus = 'Needs Attention';
    notificationPriority = scoreVal >= 75 || rawRisk.includes('crit') ? 'Critical' : 'Warning';
    notificationMsg = 'Animal requires health attention. Perform a manual health examination. Veterinary assessment recommended.';
  } else if (scoreVal >= 25 || rawRisk.includes('mod')) {
    mappedStatus = 'Monitor';
    notificationPriority = 'Warning';
    notificationMsg = 'Animal requires monitoring.';
  }

  try {
    // 1. Update animal record
    await supabase
      .from('animals')
      .update({
        health_status: mappedStatus,
        health_risk_score: scoreVal,
      })
      .eq('id', animalId);

    // 2. Insert clinical record into health_records
    const conditionLabels = (result.indicators || []).map((i) => i.label).filter(Boolean);
    const clinicalNotes = [
      `AI Camera Health Screening (${mappedStatus} - Risk Score: ${scoreVal}/100).`,
      conditionLabels.length > 0 ? `Visual findings: ${conditionLabels.join(', ')}.` : null,
      result.recommendation ? `Recommendation: ${result.recommendation}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join(' ');

    await supabase.from('health_records').insert({
      animal_id: animalId,
      record_date: new Date().toISOString().split('T')[0],
      reasons: conditionLabels.length > 0 ? conditionLabels : ['AI Camera Health Screening'],
      notes: clinicalNotes,
      risk_level: mappedStatus === 'Needs Attention' ? 'High' : mappedStatus === 'Monitor' ? 'Moderate' : 'Low',
      risk_score: scoreVal,
      detected_conditions: conditionLabels.join(', ') || null,
    });

    // 3. Automatic alert creation based on risk tier
    if (notificationPriority && notificationMsg) {
      await createNotification(
        userId,
        'Health',
        `AI Health Monitoring: ${mappedStatus}`,
        notificationMsg,
        notificationPriority,
        `/animals/${animalId}`,
      );
    }
  } catch (syncErr) {
    console.warn('Failed to sync screening to animal record:', syncErr);
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAnimalScreenings(animalId: string | null) {
  const { user } = useAuth();
  const [screenings, setScreenings] = useState<CameraScreening[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !animalId) { setScreenings([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('camera_health_screenings')
      .select('*')
      .eq('user_id', user.id)
      .eq('animal_id', animalId)
      .order('created_at', { ascending: false });
    setScreenings((data as CameraScreening[]) ?? []);
    setLoading(false);
  }, [user, animalId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { screenings, loading, refresh };
}

export function useAllScreenings() {
  const { user } = useAuth();
  const [screenings, setScreenings] = useState<CameraScreening[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setScreenings([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('camera_health_screenings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setScreenings((data as CameraScreening[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const summary: ScreeningSummary = {
    total: screenings.length,
    possibleConcerns: screenings.filter((s) => s.prediction === 'possible_health_concern').length,
    highRisk: screenings.filter((s) => s.risk_level === 'HIGH' || s.risk_level === 'CRITICAL').length,
    lowConfidence: screenings.filter((s) => s.prediction === 'low_confidence').length,
    lastScreeningDate: screenings[0]?.created_at ?? null,
  };

  return { screenings, summary, loading, refresh };
}

export async function deleteScreening(
  screeningId: string,
  imagePath: string | null,
): Promise<{ error: string | null }> {
  if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
  const { error } = await supabase
    .from('camera_health_screenings')
    .delete()
    .eq('id', screeningId);
  return { error: error?.message ?? null };
}

export async function getScreeningImageUrl(imagePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(imagePath, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}
