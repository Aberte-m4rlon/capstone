-- ============================================================
-- AlpasFarm — Camera Health Screenings Migration
-- Paste this entire file into:
-- https://supabase.com/dashboard/project/bsotlxbvanpwengftfli/sql/new
-- Then click "Run"
-- ============================================================

-- Step 1: Create the main table
CREATE TABLE IF NOT EXISTS camera_health_screenings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL DEFAULT auth.uid()
                        REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id           uuid REFERENCES animals(id) ON DELETE CASCADE,
  image_path          text,
  image_url           text,
  prediction          text NOT NULL DEFAULT 'low_confidence',
  confidence          numeric(5,4) NOT NULL DEFAULT 0,
  model_version       text NOT NULL DEFAULT 'goat-health-v1',
  quality_score       int NOT NULL DEFAULT 0,
  quality_issues      jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  risk_score          int,
  risk_level          text,
  indicators          jsonb,
  combined_risk_score int,
  combined_factors    jsonb,
  recommendation      text,
  goat_detected       boolean,
  scan_type           text DEFAULT 'image'
);

-- Step 2: Enable Row Level Security
ALTER TABLE camera_health_screenings ENABLE ROW LEVEL SECURITY;

-- Step 3: RLS Policies (owner-scoped)
DROP POLICY IF EXISTS "select_own_screenings" ON camera_health_screenings;
CREATE POLICY "select_own_screenings" ON camera_health_screenings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_screenings" ON camera_health_screenings;
CREATE POLICY "insert_own_screenings" ON camera_health_screenings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_screenings" ON camera_health_screenings;
CREATE POLICY "update_own_screenings" ON camera_health_screenings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_screenings" ON camera_health_screenings;
CREATE POLICY "delete_own_screenings" ON camera_health_screenings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Step 4: Indexes
CREATE INDEX IF NOT EXISTS idx_camera_screenings_user_id
  ON camera_health_screenings(user_id);
CREATE INDEX IF NOT EXISTS idx_camera_screenings_animal_id
  ON camera_health_screenings(animal_id);
CREATE INDEX IF NOT EXISTS idx_camera_screenings_created_at
  ON camera_health_screenings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_screenings_risk_level
  ON camera_health_screenings(risk_level);

-- Step 5: Storage bucket for screening images (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'animal-screenings',
  'animal-screenings',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Step 6: Storage RLS policies
DROP POLICY IF EXISTS "Users can upload their own screening images" ON storage.objects;
CREATE POLICY "Users can upload their own screening images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'animal-screenings' AND
    (storage.foldername(name))[1] = 'screenings' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can read their own screening images" ON storage.objects;
CREATE POLICY "Users can read their own screening images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'animal-screenings' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own screening images" ON storage.objects;
CREATE POLICY "Users can delete their own screening images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'animal-screenings' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Done! The camera_health_screenings table and storage bucket are ready.
