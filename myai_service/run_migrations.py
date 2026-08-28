"""
run_migrations.py
Runs camera_health_screenings migrations against Supabase.
Uses httpx (already in requirements.txt).
"""
import sys, os
from pathlib import Path

SUPABASE_URL = "https://bsotlxbvanpwengftfli.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzb3RseGJ2YW5wd2VuZmd0ZmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc1NjQwNSwiZXhwIjoyMTAyMzMyNDA1fQ.0goX9ebXlpmGpcHz9aNU0EHlnOGd9M7oAMnJS5BGnyU"
PROJECT_REF  = "bsotlxbvanpwengftfli"

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS camera_health_screenings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
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

ALTER TABLE camera_health_screenings ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_camera_screenings_user_id ON camera_health_screenings(user_id);
CREATE INDEX IF NOT EXISTS idx_camera_screenings_animal_id ON camera_health_screenings(animal_id);
CREATE INDEX IF NOT EXISTS idx_camera_screenings_created_at ON camera_health_screenings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_screenings_risk_level ON camera_health_screenings(risk_level);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('animal-screenings','animal-screenings',false,10485760,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;
"""

def save_sql():
    out = Path(__file__).parent / "migration_to_run.sql"
    out.write_text(MIGRATION_SQL)
    print(f"\n✅ SQL saved to: {out.resolve()}")
    print("\n👉 Paste it at:")
    print(f"   https://supabase.com/dashboard/project/{PROJECT_REF}/sql/new")

import httpx

headers = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

print(f"Testing connection to {SUPABASE_URL}...")
try:
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/animals?limit=1", headers=headers, timeout=15)
    print(f"Connection: {r.status_code}")
except Exception as e:
    print(f"No network access from this machine: {e}")
    save_sql()
    sys.exit(0)

# Check if table already exists
print("Checking if camera_health_screenings exists...")
r2 = httpx.get(f"{SUPABASE_URL}/rest/v1/camera_health_screenings?limit=1", headers=headers, timeout=10)
if r2.status_code == 200:
    print("✅ Table ALREADY EXISTS — no migration needed!")
    sys.exit(0)
print(f"Table not found ({r2.status_code}) — running migration...")

# Try Management API
r3 = httpx.post(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    headers={"Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
    json={"query": MIGRATION_SQL},
    timeout=30,
)
print(f"Management API: {r3.status_code}")
if r3.status_code in (200, 201):
    print("✅ Migration ran successfully!")
else:
    print(f"Response: {r3.text[:300]}")
    print("\n⚠ Management API needs a Personal Access Token (not service key).")
    save_sql()
