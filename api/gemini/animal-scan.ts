/**
 * Vercel Serverless Function — AlpasFarm Gemini AI Animal Scan
 * POST /api/gemini/animal-scan
 *
 * Official Google Gen AI SDK (@google/genai) integration:
 * - Specific Animal Focus: Analyzes only the selected/detected animal (e.g. GOAT-001 - Kambing)
 * - Visual Evidence Only: Strict prohibition on hallucinated vitals (temperature, heart rate, respiration count) or internal diseases
 * - Structured Status ("Kalagayan"): Maayos, Bantayan, Kailangan ng Atensyon, Kailangan ng Gamot + explanatory summary
 * - Dynamic Detailed Observations ("Napansin"): Categorized findings (Mata, Ilong, Bibig, Paghinga, Tindig, Balahibo/Balat, Galaw/Asal)
 * - Actionable Advice ("Gawin"): Concrete next steps in farmer-friendly Tagalog
 * - ZERO FAKE VITALS: Temperature is strictly null / not_measured
 * - ZERO NULLABLE-ONLY TYPES in Gemini responseSchema
 * - Multi-model fallback chain (gemini-3.6-flash -> gemini-3.5-flash-lite -> gemini-flash-latest -> gemini-3.5-flash)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import { getSupabaseServer } from '../_lib/supabaseServer';

export interface StructuredObservation {
  category: string;
  finding: string;
  visibility: 'visible' | 'limited' | 'not_visible';
}

export interface GeminiAnimalScanResponse {
  success: boolean;
  detected: boolean;
  animal_type: 'goat' | 'sheep' | 'unknown';
  animal_label: string;
  condition: 'Maayos' | 'Bantayan' | 'Kailangan ng Atensyon' | 'Kailangan ng Gamot';
  condition_summary: string;
  observations: StructuredObservation[];
  visual_observations: string[]; // Formatted strings ("Mata — ...", "Ilong — ...")
  action: string;
  limitations: string[];
  recommendation: string; // Action alias for backward-compatibility
  image_quality: 'good' | 'poor';
  multiple_animals: boolean;
  health_status: 'healthy' | 'monitor' | 'needs_attention' | 'needs_medication' | 'unknown';
  possible_concerns: string[];
  needs_attention: boolean;
  needs_medication: boolean;
  temperature: null;
  temperature_status: 'not_measured';
  reason: 'needs_better_image' | 'not_goat_or_sheep' | 'multiple_animals' | null;
  animal_id?: string | null;
  raw_model?: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are an expert livestock visual health screening AI assistant for ALPASFARM (Philippines).
You analyze images of goats (kambing) and sheep (tupa) for visual health screening.

STRICT VISUAL SCREENING RULES:
1. TARGET ANIMAL FOCUS:
   - Analyze ONLY the single target animal specified or centered in the frame.
   - If other animals or objects are visible in the background, DO NOT describe them as if they belong to this animal.
   - Do NOT say "may dalawang magkatabing hayop" or describe other animals. Focus strictly on the single target goat or sheep.
2. VISUAL EVIDENCE ONLY:
   - Analyze ONLY what is visibly supported by the provided image.
   - Do NOT invent symptoms, vital signs, or internal disease.
   - A normal RGB camera CANNOT measure body temperature, heart rate, respiration rate, rumen sounds, or blood counts.
   - NEVER claim an exact temperature. Always state that temperature cannot be measured by ordinary camera.
   - Do NOT diagnose medical conditions (e.g., pneumonia, parasites, dehydration, fever, pregnancy, anemia, worms).
   - If a feature cannot be clearly seen (e.g. eyes obscured, tail hidden), state: "Hindi matiyak mula sa larawan."
3. STATUS & KALAGAYAN:
   - Allowed statuses:
     * "Maayos" — walang malinaw na nakitang kakaibang senyales sa larawan.
     * "Bantayan" — may ilang nakikitang bagay sa itsura ng kambing o tupa na kailangan obserbahan.
     * "Kailangan ng Atensyon" — may nakitang senyales na dapat masusing obserbahan at kung kinakailangan ay ipasuri sa beterinaryo.
     * "Kailangan ng Gamot" — STRICT WARNING: Do NOT assign this from a visual screening image alone unless severe trauma or veterinary treatment record is already established.
4. OBSERVATIONS (NAPANSIN):
   - Provide detailed observations for key visible body areas:
     * Mata (eyes: clear, discharge, swelling, or obscured)
     * Ilong (nose: clear, nasal discharge, crusting, or obscured)
     * Bibig (mouth: normal, drooling, lesions, or obscured)
     * Paghinga (breathing: visible effort/panting or calm/unremarkable from still image)
     * Tindig (posture/stance: standing alert, balanced, hunched, or lying down)
     * Balahibo/Balat (coat/skin: smooth, rough, bare patches, visible external wounds)
     * Galaw/Asal (alertness/behavior: alert, calm, or limited evaluation from still image)
   - Every observation must have category, finding in farmer-friendly Tagalog, and visibility (visible, limited, not_visible).
5. GAWIN (ACTION):
   - Provide concrete, practical, farmer-friendly next steps in Tagalog.
   - For Maayos: "Ipagpatuloy ang regular na pagmamasid at normal na pag-aalaga."
   - For Bantayan: "Obserbahan muli ang alaga sa susunod na oras o araw. Magsagawa ulit ng health check kung may pagbabago."
   - For Kailangan ng Atensyon: "Ihiwalay muna para mas madaling obserbahan at kumonsulta sa beterinaryo kapag may karagdagang sintomas."
   - Do NOT prescribe specific pharmaceutical medications from image analysis alone.
6. SPECIES & REJECTIONS:
   - If the image contains something other than a goat or sheep (e.g. human, dog, cat, car, furniture), set detected = false, animal_type = "UNKNOWN", reason = "NOT_GOAT_OR_SHEEP".
   - If image is excessively blurry or dark, set image_quality = "POOR", reason = "NEEDS_BETTER_IMAGE".
7. OUTPUT FORMAT:
   - Return valid JSON matching the schema exactly. All fields are required. Never return null.`;

// Strict Gemini schema using Type enum with zero null types
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detected: {
      type: Type.BOOLEAN,
      description: 'True if goat or sheep is visible, false otherwise',
    },
    animal_type: {
      type: Type.STRING,
      enum: ['GOAT', 'SHEEP', 'UNKNOWN'],
      description: 'Species classification',
    },
    condition: {
      type: Type.STRING,
      enum: ['Maayos', 'Bantayan', 'Kailangan ng Atensyon', 'Kailangan ng Gamot'],
      description: 'Farmer-facing condition status. IMPORTANT: Do NOT assign Kailangan ng Gamot from visual inspection alone.',
    },
    condition_summary: {
      type: Type.STRING,
      description: 'Short explanatory sentence of the condition status in Tagalog, e.g. "Bantayan — may ilang nakikitang bagay na dapat obserbahan sa kambing."',
    },
    observations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: 'Category name: Mata, Ilong, Bibig, Paghinga, Tindig, Balahibo/Balat, Galaw/Asal, etc.',
          },
          finding: {
            type: Type.STRING,
            description: 'Visual finding in Tagalog. Say "Hindi matiyak mula sa larawan" if not clearly visible.',
          },
          visibility: {
            type: Type.STRING,
            enum: ['visible', 'limited', 'not_visible'],
            description: 'Whether the body part is visible',
          },
        },
        required: ['category', 'finding', 'visibility'],
      },
      description: 'Category-specific physical observations of ONLY the target animal',
    },
    action: {
      type: Type.STRING,
      description: 'Farmer-friendly actionable next steps ("Gawin") in Tagalog',
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Sensory and camera limitations, including that RGB cameras cannot measure temperature',
    },
    image_quality: {
      type: Type.STRING,
      enum: ['GOOD', 'POOR'],
      description: 'Image clarity and framing quality',
    },
    multiple_animals: {
      type: Type.BOOLEAN,
      description: 'True if multiple animals are visible in the image',
    },
    reason: {
      type: Type.STRING,
      enum: ['NONE', 'NEEDS_BETTER_IMAGE', 'NOT_GOAT_OR_SHEEP', 'MULTIPLE_ANIMALS', 'UNCLEAR'],
      description: 'Rejection or clarification reason if not a normal single animal scan',
    },
  },
  required: [
    'detected',
    'animal_type',
    'condition',
    'condition_summary',
    'observations',
    'action',
    'limitations',
    'image_quality',
    'multiple_animals',
    'reason',
  ],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Gamitin ang POST.',
    });
  }

  // 1. Authenticate with Supabase User Token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Walang valid authentication token.',
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const supabase = getSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Hindi valid o nag-expire na ang token.',
    });
  }

  // 2. Check GEMINI_API_KEY
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[animal-scan] Error: GEMINI_API_KEY is not defined in environment variables.');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: Walang Gemini API key.',
    });
  }

  // 3. Parse Request Body
  const {
    image,
    animalId,
    animalTag,
    animalName,
    animalType,
    context,
  } = req.body || {};

  if (!image || typeof image !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Kinakailangan ang base64 image data sa request body.',
    });
  }

  // Clean data URL prefix if present
  let mimeType = 'image/jpeg';
  let base64Pure = image;
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Pure = match[2];
  }

  // Developer logging
  const approxBytes = Math.round(base64Pure.length * 0.75);
  const targetTag = animalTag || animalId || '';
  const targetName = animalName && animalName !== targetTag ? animalName : '';
  const targetSpecies = animalType === 'sheep' ? 'Tupa (Sheep)' : 'Kambing (Goat)';
  const targetIdentifier = [targetSpecies, targetTag, targetName ? `(${targetName})` : ''].filter(Boolean).join(' — ');

  console.log(`[animal-scan] Request: target="${targetIdentifier}", MIME=${mimeType}, size=${Math.round(approxBytes / 1024)}KB`);

  // 4. Initialize Google Gen AI client
  const ai = new GoogleGenAI({ apiKey });

  // Priority modern model chain
  const rawFallbackModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.5-flash',
  ].filter((m): m is string => Boolean(m && m.trim()));

  const fallbackModels = Array.from(new Set(rawFallbackModels));
  let lastError: any = null;

  const userPrompt = `${SYSTEM_PROMPT}

TARGET ANIMAL INFORMATION:
- Selected Animal: ${targetIdentifier || 'Kambing o Tupa'}
- Specific Task: Perform visual health screening ONLY for this specific selected animal.
- DO NOT describe background animals, other livestock, people, or unrelated objects.
- Inspect visible anatomical areas: Mata, Ilong, Bibig, Paghinga, Tindig, Balahibo/Balat, Galaw/Asal.
- Give a farmer-friendly Tagalog summary for "condition_summary" and actionable advice for "action".`;

  for (const modelName of fallbackModels) {
    try {
      console.log(`[animal-scan] Starting Gemini analysis with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { text: userPrompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Pure,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      });

      const responseText = response.text;
      if (!responseText || !responseText.trim()) {
        throw new Error('Walang sagot mula sa Gemini Vision API.');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const cleaned = responseText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
        parsed = JSON.parse(cleaned);
      }

      // Enforce strict business rules and map to server response format
      const detected = Boolean(parsed.detected);
      const rawType = String(parsed.animal_type || '').toLowerCase();
      const isGoatOrSheep = rawType === 'goat' || rawType === 'sheep';
      const actualDetected = detected && isGoatOrSheep;

      let reason: 'needs_better_image' | 'not_goat_or_sheep' | 'multiple_animals' | null = null;
      const rawReason = String(parsed.reason || '').toUpperCase();
      if (rawReason === 'NEEDS_BETTER_IMAGE') reason = 'needs_better_image';
      else if (rawReason === 'NOT_GOAT_OR_SHEEP') reason = 'not_goat_or_sheep';
      else if (rawReason === 'MULTIPLE_ANIMALS') reason = 'multiple_animals';
      else if (!actualDetected) reason = 'not_goat_or_sheep';

      // Condition status mapping (Maayos, Bantayan, Kailangan ng Atensyon, Kailangan ng Gamot)
      const rawCondition = String(parsed.condition || 'Maayos');
      let condition: 'Maayos' | 'Bantayan' | 'Kailangan ng Atensyon' | 'Kailangan ng Gamot' = 'Maayos';
      if (rawCondition === 'Kailangan ng Gamot') condition = 'Kailangan ng Gamot';
      else if (rawCondition === 'Kailangan ng Atensyon') condition = 'Kailangan ng Atensyon';
      else if (rawCondition === 'Bantayan') condition = 'Bantayan';
      else condition = 'Maayos';

      // Map condition to legacy health_status enum for backward compatibility
      let normalizedHealthStatus: 'healthy' | 'monitor' | 'needs_attention' | 'needs_medication' | 'unknown' = 'healthy';
      if (!actualDetected) normalizedHealthStatus = 'unknown';
      else if (condition === 'Kailangan ng Gamot') normalizedHealthStatus = 'needs_medication';
      else if (condition === 'Kailangan ng Atensyon') normalizedHealthStatus = 'needs_attention';
      else if (condition === 'Bantayan') normalizedHealthStatus = 'monitor';
      else normalizedHealthStatus = 'healthy';

      const structuredObservations: StructuredObservation[] = Array.isArray(parsed.observations)
        ? parsed.observations.map((o: any) => ({
            category: String(o?.category || 'Pangkalahatan'),
            finding: String(o?.finding || 'Walang nakitang abnormalidad'),
            visibility: (['visible', 'limited', 'not_visible'].includes(o?.visibility) ? o.visibility : 'visible') as any,
          }))
        : [];

      // Create human-readable bullet observation list for simple string consumers
      const visualObservationsList = structuredObservations.map((o) => `${o.category} — ${o.finding}`);

      const conditionSummary = parsed.condition_summary || (
        condition === 'Bantayan'
          ? `Bantayan — may ilang nakikitang bagay sa itsura ng ${rawType === 'sheep' ? 'tupa' : 'kambing'} na kailangan obserbahan.`
          : condition === 'Kailangan ng Atensyon'
          ? `Kailangan ng Atensyon — may nakitang senyales na dapat masusing obserbahan at kung kinakailangan ay ipasuri sa beterinaryo.`
          : condition === 'Kailangan ng Gamot'
          ? `Kailangan ng Gamot — may nakitang senyales na nangangailangan ng gamot o agarang pagsusuri ng beterinaryo.`
          : `Maayos — walang malinaw na nakitang kakaibang senyales sa larawan.`
      );

      const action = parsed.action || (
        condition === 'Kailangan ng Gamot'
          ? 'Kumonsulta sa lisensyadong beterinaryo para sa tamang reseta at gamot kung kinakailangan.'
          : condition === 'Kailangan ng Atensyon'
          ? 'Ihiwalay muna para mas madaling obserbahan at kumonsulta sa beterinaryo kapag may karagdagang sintomas.'
          : condition === 'Bantayan'
          ? `Obserbahan muli ang ${targetTag || 'alaga'} sa susunod na oras o araw. Magsagawa ulit ng health check kung may pagbabago.`
          : 'Ipagpatuloy ang regular na pagmamasid at normal na pag-aalaga.'
      );

      const limitations: string[] = Array.isArray(parsed.limitations) && parsed.limitations.length > 0
        ? parsed.limitations
        : [
            'Ang ordinaryong camera ay hindi nakakapagsukat ng temperatura ng katawan ng alaga.',
            'Ang resulta ay visual screening lamang at hindi kapalit ng pormal na pagsusuri ng lisensyadong beterinaryo.',
          ];

      const formattedResult: GeminiAnimalScanResponse = {
        success: true,
        detected: actualDetected,
        animal_type: actualDetected ? (rawType as 'goat' | 'sheep') : 'unknown',
        animal_label: actualDetected
          ? rawType === 'goat'
            ? 'Kambing'
            : 'Tupa'
          : 'Hindi kambing o tupa',
        condition,
        condition_summary: conditionSummary,
        observations: structuredObservations,
        visual_observations: visualObservationsList,
        action,
        limitations,
        recommendation: action,
        image_quality: String(parsed.image_quality || '').toUpperCase() === 'POOR' ? 'poor' : 'good',
        multiple_animals: Boolean(parsed.multiple_animals),
        health_status: normalizedHealthStatus,
        possible_concerns: condition !== 'Maayos' ? [conditionSummary] : [],
        needs_attention: condition === 'Kailangan ng Atensyon' || condition === 'Kailangan ng Gamot',
        needs_medication: condition === 'Kailangan ng Gamot',
        temperature: null, // STRICTLY null: ordinary RGB camera cannot measure temperature
        temperature_status: 'not_measured',
        reason,
        animal_id: animalId || null,
        raw_model: modelName,
      };

      return res.status(200).json(formattedResult);
    } catch (err: any) {
      lastError = err;
      console.warn(`[animal-scan] Model ${modelName} error:`, err?.message || err);
      continue;
    }
  }

  // Handle errors
  console.error('[animal-scan] Lahat ng Gemini models ay nag-fail:', lastError?.message || lastError);
  return res.status(502).json({
    success: false,
    error: 'Hindi makumpleto ang scan sa kasalukuyan. Subukan muli.',
  });
}
