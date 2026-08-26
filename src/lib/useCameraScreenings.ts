/**
 * useCameraScreenings.ts
 * React hooks for camera health screening CRUD operations via Supabase.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { ScreeningResult } from './cameraML';
import { canvasToBlob } from './cameraML';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CameraScreening {
  id: string;
  user_id: string;
  animal_id: string;
  image_path: string | null;
  image_url: string | null;
  prediction: 'normal_appearance' | 'possible_health_concern' | 'low_confidence';
  confidence: number;
  model_version: string;
  quality_score: number;
  quality_issues: string[];
  notes: string | null;
  created_at: string;
}

export interface ScreeningSummary {
  total: number;
  possibleConcerns: number;
  lowConfidence: number;
  lastScreeningDate: string | null;
}

// ── Storage bucket name ───────────────────────────────────────────────────────

const BUCKET = 'animal-screenings';

// ── Save screening result to Supabase ────────────────────────────────────────

export async function saveScreeningResult(
  animalId: string,
  userId: string,
  result: ScreeningResult,
  canvas: HTMLCanvasElement | null,
  notes?: string,
): Promise<{ data: CameraScreening | null; error: string | null }> {
  let imagePath: string | null = null;
  let imageUrl: string | null = null;

  // Upload image to Supabase Storage if canvas is provided
  if (canvas) {
    try {
      const blob = await canvasToBlob(canvas);
      const fileName = `${crypto.randomUUID()}.jpg`;
      const storagePath = `screenings/${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (!uploadError) {
        imagePath = storagePath;
        // Get a signed URL (valid 7 days) — private bucket
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
        imageUrl = signed?.signedUrl ?? null;
      }
      // If upload fails, we continue without the image — non-fatal
    } catch {
      // Non-fatal — proceed without image
    }
  }

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
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as CameraScreening, error: null };
}

// ── Hook: screenings for a specific animal ────────────────────────────────────

export function useAnimalScreenings(animalId: string | null): {
  screenings: CameraScreening[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [screenings, setScreenings] = useState<CameraScreening[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !animalId) {
      setScreenings([]);
      return;
    }
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { screenings, loading, refresh };
}

// ── Hook: all screenings for the farm ────────────────────────────────────────

export function useAllScreenings(): {
  screenings: CameraScreening[];
  summary: ScreeningSummary;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [screenings, setScreenings] = useState<CameraScreening[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setScreenings([]);
      return;
    }
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary: ScreeningSummary = {
    total: screenings.length,
    possibleConcerns: screenings.filter((s) => s.prediction === 'possible_health_concern').length,
    lowConfidence: screenings.filter((s) => s.prediction === 'low_confidence').length,
    lastScreeningDate: screenings[0]?.created_at ?? null,
  };

  return { screenings, summary, loading, refresh };
}

// ── Delete a screening ────────────────────────────────────────────────────────

export async function deleteScreening(
  screeningId: string,
  imagePath: string | null,
): Promise<{ error: string | null }> {
  // Delete from storage if image exists
  if (imagePath) {
    await supabase.storage.from(BUCKET).remove([imagePath]);
  }

  const { error } = await supabase
    .from('camera_health_screenings')
    .delete()
    .eq('id', screeningId);

  return { error: error?.message ?? null };
}

// ── Get signed URL for an existing screening image ────────────────────────────

export async function getScreeningImageUrl(imagePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(imagePath, 60 * 60 * 24); // 24h
  return data?.signedUrl ?? null;
}
