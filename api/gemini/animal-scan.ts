/**
 * Vercel Serverless Function — AlpasFarm Gemini AI Animal Scan
 * POST /api/gemini/animal-scan
 *
 * Official Google Gen AI SDK (@google/genai) integration:
 * - Detects Goat (Kambing) vs Sheep (Tupa)
 * - Identifies non-targets, poor image quality, multiple animals
 * - Observational health screening without medical diagnosis
 * - ZERO FAKE VITALS: Temperature is strictly null / not_measured (handled in server normalizer)
 * - ZERO NULLABLE-ONLY TYPES in Gemini responseSchema (fixes invalid nullable field schema error)
 * - Authenticated with Supabase user token
 * - Secure server-side execution: GEMINI_API_KEY is never exposed to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import { getSupabaseServer } from '../_lib/supabaseServer';

export interface GeminiAnimalScanResponse {
  success: boolean;
  detected: boolean;
  animal_type: 'goat' | 'sheep' | 'unknown';
  animal_label: string;
  image_quality: 'good' | 'poor';
  multiple_animals: boolean;
  health_status: 'healthy' | 'monitor' | 'needs_attention' | 'needs_medication' | 'unknown';
  observations: string[];
  possible_concerns: string[];
  recommendation: string;
  needs_attention: boolean;
  needs_medication: boolean;
  temperature: null;
  temperature_status: 'not_measured';
  reason: 'needs_better_image' | 'not_goat_or_sheep' | 'multiple_animals' | null;
  animal_id?: string | null;
  raw_model?: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are assisting an agricultural livestock farm management system (ALPASFARM) in the Philippines.
Analyze the provided image of a livestock animal for visual health screening.

Instructions:
1. First determine whether the image contains a goat (kambing) or sheep (tupa).
2. Do not identify unrelated objects, humans, or other animals (dogs, cats, pigs, birds) as goats or sheep.
3. If not a goat or sheep, set detected = false, animal_type = "UNKNOWN", health_status = "UNCLEAR", reason = "NOT_GOAT_OR_SHEEP".
4. If image is too blurry, dark, or obscured, set image_quality = "POOR", reason = "NEEDS_BETTER_IMAGE".
5. If multiple animals are visible and unclear which one is the focus, set multiple_animals = true, reason = "MULTIPLE_ANIMALS".
6. Health observations must be framed as visual screening observations (alertness, posture, coat, eyes, nose).
7. If health cannot be determined, set health_status = "UNCLEAR".
8. DO NOT invent physiological vitals. Normal camera cannot measure temperature. Always set temperature_status = "NOT_MEASURED".
9. Observations and recommendations must be practical and clear in Filipino/English.
10. Return strictly valid JSON adhering to the schema. Every field must have a valid value. NEVER return null.`;

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
    animal_label: {
      type: Type.STRING,
      description: 'Farmer-friendly label, e.g. "Kambing", "Tupa", "Hindi kambing o tupa"',
    },
    image_quality: {
      type: Type.STRING,
      enum: ['GOOD', 'POOR'],
      description: 'Image clarity and framing quality',
    },
    multiple_animals: {
      type: Type.BOOLEAN,
      description: 'True if multiple animals are clustered in the frame',
    },
    health_status: {
      type: Type.STRING,
      enum: ['HEALTHY', 'UNDER_OBSERVATION', 'NEEDS_ATTENTION', 'NEEDS_MEDICATION', 'UNCLEAR'],
      description: 'Visual health screening indicator',
    },
    observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Visible physical observations (posture, coat, eyes, nose, movement state)',
    },
    possible_concerns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Observable physical irregularities or signs requiring attention',
    },
    recommendation: {
      type: Type.STRING,
      description: 'Practical next step for the farmer in Filipino/English',
    },
    needs_attention: {
      type: Type.BOOLEAN,
      description: 'True if farmer should inspect or monitor the animal closely',
    },
    needs_medication: {
      type: Type.BOOLEAN,
      description: 'True if veterinary treatment or medication review is advisable',
    },
    temperature_status: {
      type: Type.STRING,
      enum: ['NOT_MEASURED'],
      description: 'Always NOT_MEASURED',
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
    'animal_label',
    'image_quality',
    'multiple_animals',
    'health_status',
    'observations',
    'possible_concerns',
    'recommendation',
    'needs_attention',
    'needs_medication',
    'temperature_status',
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

  // 1. Authenticate Request
  const authHeader = req.headers.authorization || (req.headers.Authorization as string) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const supabase = getSupabaseServer();
  if (supabase) {
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Hindi awtorisado: Walang authentication token.',
      });
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Hindi balidong authentication session. Mag-login muli.',
      });
    }
  }

  // 2. Validate API Key
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'Hindi naka-configure ang GEMINI_API_KEY sa server environment.',
    });
  }

  // 3. Parse Request Body
  const { image, animalId, animalType, context } = req.body || {};
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

  // 4. Initialize Google Gen AI client
  const ai = new GoogleGenAI({ apiKey });

  // Priority models chain: user configured model -> gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash -> gemini-flash-latest
  const fallbackModels = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
  ].filter((m): m is string => Boolean(m && m.trim()));

  let lastError: any = null;

  for (const modelName of fallbackModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { text: SYSTEM_PROMPT },
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
        // Strip markdown code fences if present
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

      // Map health_status to standard lowercase enum format
      let normalizedHealthStatus: 'healthy' | 'monitor' | 'needs_attention' | 'needs_medication' | 'unknown' = 'unknown';
      const rawStatus = String(parsed.health_status || '').toUpperCase();
      if (rawStatus === 'HEALTHY') normalizedHealthStatus = 'healthy';
      else if (rawStatus === 'UNDER_OBSERVATION') normalizedHealthStatus = 'monitor';
      else if (rawStatus === 'NEEDS_ATTENTION') normalizedHealthStatus = 'needs_attention';
      else if (rawStatus === 'NEEDS_MEDICATION') normalizedHealthStatus = 'needs_medication';
      else normalizedHealthStatus = 'unknown';

      const formattedResult: GeminiAnimalScanResponse = {
        success: true,
        detected: actualDetected,
        animal_type: actualDetected ? (rawType as 'goat' | 'sheep') : 'unknown',
        animal_label: actualDetected
          ? rawType === 'goat'
            ? 'Kambing'
            : 'Tupa'
          : 'Hindi kambing o tupa',
        image_quality: String(parsed.image_quality || '').toUpperCase() === 'POOR' ? 'poor' : 'good',
        multiple_animals: Boolean(parsed.multiple_animals),
        health_status: actualDetected ? normalizedHealthStatus : 'unknown',
        observations: Array.isArray(parsed.observations) ? parsed.observations : [],
        possible_concerns: Array.isArray(parsed.possible_concerns) ? parsed.possible_concerns : [],
        recommendation:
          parsed.recommendation ||
          (actualDetected
            ? 'Patuloy na obserbahan ang hayop.'
            : 'Ilapit ang camera sa isang kambing o tupa at i-scan muli.'),
        needs_attention: Boolean(parsed.needs_attention),
        needs_medication: Boolean(parsed.needs_medication),
        temperature: null, // STRICTLY null: camera cannot measure temperature
        temperature_status: 'not_measured',
        reason: reason,
        animal_id: animalId || null,
        raw_model: modelName,
      };

      return res.status(200).json(formattedResult);
    } catch (err: any) {
      lastError = err;
      console.warn(`[animal-scan] Model ${modelName} error:`, err?.message || err);
      // Try next fallback model
      continue;
    }
  }

  // Handle errors
  console.error('[animal-scan] Lahat ng Gemini models ay nag-fail:', lastError?.message || lastError);
  return res.status(502).json({
    success: false,
    error: 'Hindi makumpleto ang scan. Subukan muli.',
  });
}
