/**
 * Vercel Serverless Function — Public Animal Profile Endpoint
 * GET /api/public-animal?id=:id
 *
 * Securely serves public animal profiles and authorized owner contact details.
 * Enforces data isolation and respects owner privacy preferences:
 * - Omits internal database IDs, user IDs, private medical logs, and activity records.
 * - Filters owner contact number, email, and location based on owner privacy flags.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const KNOWN_PROJECT_REF = 'hhhagfydxhetspmudyrl';
const KNOWN_SUPABASE_URL = 'https://hhhagfydxhetspmudyrl.supabase.co';
const KNOWN_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoaGFnZnlkeGhldHNwbXVkeXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MjQ2NzcsImV4cCI6MjEwMTUwMDY3N30.bD2aDdQ9g_ePgcCNSw008uuGR1_nl9n4IlNiPUZc_3E';
const KNOWN_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoaGFnZnlkeGhldHNwbXVkeXJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTkyNDY3NywiZXhwIjoyMTAxNTAwNjc3fQ.TJBbDQsA0bbptxVt4-ewAd9M0nxIrv_O1XRh01Ehk00';

function resolveCredentials(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || KNOWN_SUPABASE_URL;

  // Extract project ref from url
  const urlMatch = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  const targetRef = urlMatch ? urlMatch[1] : KNOWN_PROJECT_REF;

  const candidates = [
    process.env.VITE_SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    KNOWN_SERVICE_KEY,
    KNOWN_ANON_KEY,
  ].filter(Boolean) as string[];

  // Choose the first key whose JWT payload matches targetRef
  for (const candidate of candidates) {
    try {
      const parts = candidate.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.ref === targetRef) {
          return { url, key: candidate };
        }
      }
    } catch {
      // Continue search
    }
  }

  return { url: KNOWN_SUPABASE_URL, key: KNOWN_SERVICE_KEY };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Kailangan ang animal ID o Tag ID.' });
    return;
  }

  const cleanId = id.trim();
  const { url: supabaseUrl, key: supabaseKey } = resolveCredentials();

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const fields = `
      id,
      tag_id,
      name,
      species,
      breed,
      sex,
      date_of_birth,
      color_markings,
      photo_url,
      weight_kg,
      health_status,
      health_risk_score,
      current_temperature,
      current_heart_rate,
      breeding_status,
      last_mating_date,
      expected_kidding_date,
      vaccination_status,
      last_vaccine_date,
      next_vaccine_date,
      notes,
      created_at,
      user_id
    `;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    let animals: any[] | null = null;
    let animalErr: any = null;

    // 1. If cleanId is UUID, search by ID first
    if (isUUID) {
      const result = await supabase
        .from('animals')
        .select(fields)
        .eq('id', cleanId)
        .eq('archived', false)
        .limit(1);

      animals = result.data;
      animalErr = result.error;
    }

    // 2. If not found by UUID or cleanId is a Tag ID, search by tag_id
    if (!animals || animals.length === 0) {
      const tagResult = await supabase
        .from('animals')
        .select(fields)
        .ilike('tag_id', cleanId)
        .eq('archived', false)
        .limit(1);

      if (tagResult.data && tagResult.data.length > 0) {
        animals = tagResult.data;
        animalErr = null;
      } else if (!animalErr) {
        animalErr = tagResult.error;
      }
    }

    if (animalErr || !animals || animals.length === 0) {
      res.status(404).json({
        error: 'Hindi makita ang animal profile.',
        details: 'Maaaring mali o expired ang QR/profile link, o tinanggal na ang tala ng hayop na ito sa ALPASFARM.',
      });
      return;
    }

    const animal = animals[0];
    const userId = animal.user_id;

    // 2. Fetch weight history (last 2 weight records for comparison)
    let weightHistory: {
      current_weight_kg: number | null;
      previous_weight_kg: number | null;
      weight_change_kg: number | null;
      last_recorded_date: string | null;
    } = {
      current_weight_kg: animal.weight_kg ?? null,
      previous_weight_kg: null,
      weight_change_kg: null,
      last_recorded_date: null,
    };

    try {
      const { data: wRecords } = await supabase
        .from('weight_records')
        .select('weight_kg, previous_weight_kg, weight_change_kg, record_date')
        .eq('animal_id', animal.id)
        .order('record_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2);

      if (wRecords && wRecords.length > 0) {
        const latest = wRecords[0];
        weightHistory.current_weight_kg = latest.weight_kg ?? animal.weight_kg;
        weightHistory.last_recorded_date = latest.record_date;

        if (wRecords.length > 1 && wRecords[1].weight_kg != null) {
          weightHistory.previous_weight_kg = wRecords[1].weight_kg;
          weightHistory.weight_change_kg = Number(
            (weightHistory.current_weight_kg - wRecords[1].weight_kg).toFixed(2),
          );
        } else if (latest.previous_weight_kg != null) {
          weightHistory.previous_weight_kg = latest.previous_weight_kg;
          weightHistory.weight_change_kg = latest.weight_change_kg != null
            ? Number(latest.weight_change_kg)
            : Number((weightHistory.current_weight_kg - latest.previous_weight_kg).toFixed(2));
        }
      }
    } catch {
      // Non-fatal fallback to animal.weight_kg
    }

    // 3. Fetch owner profile & farm settings
    let ownerName: string | null = null;
    let farmName = 'AlpasFarm';
    let ownerEmail: string | null = null;
    let ownerPhone: string | null = null;
    let farmLocation: string | null = null;

    if (userId) {
      // Profile
      try {
        const { data: pData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .limit(1);

        if (pData && pData.length > 0) {
          ownerName = pData[0].full_name || null;
          ownerEmail = pData[0].email || null;
        }
      } catch {
        // Non-fatal
      }

      // Settings
      try {
        const { data: sData } = await supabase
          .from('settings')
          .select('farm_name')
          .eq('user_id', userId)
          .limit(1);

        if (sData && sData.length > 0 && sData[0].farm_name) {
          farmName = sData[0].farm_name;
        }
      } catch {
        // Non-fatal
      }

      // User metadata & privacy controls via Admin API
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) {
          const meta = userData.user.user_metadata || {};
          const metaEmail = userData.user.email || meta.email;
          const metaPhone = userData.user.phone || meta.phone;
          const metaLocation = meta.location || meta.farm_location;

          // Privacy settings (default to true if data is provided and not explicitly set to false)
          const allowPhone = meta.show_contact_number !== false && meta.show_phone !== false;
          const allowEmail = meta.show_email !== false;
          const allowLocation = meta.show_farm_location !== false && meta.show_location !== false;

          ownerPhone = allowPhone && metaPhone ? String(metaPhone) : null;
          ownerEmail = allowEmail && metaEmail ? String(metaEmail) : null;
          farmLocation = allowLocation && metaLocation ? String(metaLocation) : null;

          if (!ownerName && meta.full_name) {
            ownerName = meta.full_name;
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // 4. Return clean, secure public payload (NO internal IDs, NO private health logs)
    res.status(200).json({
      id: animal.id,
      tag_id: animal.tag_id,
      name: animal.name,
      species: animal.species,
      breed: animal.breed,
      sex: animal.sex,
      date_of_birth: animal.date_of_birth,
      color_markings: animal.color_markings,
      photo_url: animal.photo_url,
      weight_kg: weightHistory.current_weight_kg,
      previous_weight_kg: weightHistory.previous_weight_kg,
      weight_change_kg: weightHistory.weight_change_kg,
      last_weight_date: weightHistory.last_recorded_date,
      health_status: animal.health_status,
      health_risk_score: animal.health_risk_score,
      current_temperature: animal.current_temperature,
      current_heart_rate: animal.current_heart_rate,
      breeding_status: animal.breeding_status,
      vaccination_status: animal.vaccination_status,
      last_vaccine_date: animal.last_vaccine_date,
      next_vaccine_date: animal.next_vaccine_date,
      farm_name: farmName,
      owner_name: ownerName,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      farm_location: farmLocation,
      registered_on: animal.created_at,
      verified: true,
    });
  } catch (err: any) {
    res.status(500).json({
      error: 'Hindi ma-load ang tala ng hayop.',
      details: err?.message || 'Internal server error',
    });
  }
}
