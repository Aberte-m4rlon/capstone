/**
 * Vercel Serverless Function — AlpasFarm Gemini AI Animal Scan
 * POST /api/gemini/animal-scan
 *
 * Official Google Gen AI SDK (@google/genai) integration:
 * - Detects Goat (Kambing) vs Sheep (Tupa)
 * - Identifies non-targets, poor image quality, multiple animals
 * - Observational health screening without medical diagnosis
 * - ZERO FAKE VITALS: Temperature is strictly null / not_measured
 * - Authenticated with Supabase user token
 * - Secure server-side execution: GEMINI_API_KEY is never exposed to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
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

const SYSTEM_PROMPT = `You are assisting an agricultural farm management system (ALPASFARM) in the Philippines.
Analyze the provided image of a livestock animal.
First determine whether the image contains a goat or sheep.
Do not identify unrelated objects or other animals (humans, dogs, cats, cows, pigs, chickens, vehicles, empty pens) as goats or sheep.
Do not invent observations.
Only report visible evidence.
Do not claim a confirmed medical diagnosis from a single camera image.
If the image quality is insufficient, return needs_better_image.
If the animal cannot confidently be identified as goat or sheep, return not_goat_or_sheep.
If multiple animals are visible and individual identification is unclear, return multiple_animals.
Health observations must be framed as screening observations, not veterinary diagnosis.
Do not invent temperature, pulse, or heart rate. A normal RGB camera cannot measure actual body temperature or physiological vitals. Always set temperature to null and temperature_status to "not_measured".
Observations and recommendations should be clear, practical, and farmer-friendly in Filipino/English.
Return ONLY valid JSON matching the requested schema.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    detected: {
      type: 'boolean',
      description: 'True if goat or sheep is visible, false otherwise',
    },
    animal_type: {
      type: 'string',
      enum: ['goat', 'sheep', 'unknown'],
      description: 'Species classification',
    },
    animal_label: {
      type: 'string',
      description: 'Farmer-friendly label, e.g. "Kambing", "Tupa", "Hindi kambing o tupa"',
    },
    image_quality: {
      type: 'string',
      enum: ['good', 'poor'],
      description: 'Image clarity and framing quality',
    },
    multiple_animals: {
      type: 'boolean',
      description: 'True if multiple animals are clustered in the frame',
    },
    health_status: {
      type: 'string',
      enum: ['healthy', 'monitor', 'needs_attention', 'needs_medication', 'unknown'],
      description: 'Visual health screening indicator',
    },
    observations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Visible physical observations (posture, coat, eyes, nose, movement state)',
    },
    possible_concerns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Observable physical irregularities or signs requiring attention',
    },
    recommendation: {
      type: 'string',
      description: 'Practical next step for the farmer in Filipino/English',
    },
    needs_attention: {
      type: 'boolean',
      description: 'True if farmer should inspect or monitor the animal closely',
    },
    needs_medication: {
      type: 'boolean',
      description: 'True if veterinary treatment or medication review is advisable',
    },
    temperature: {
      type: 'null',
      description: 'Must always be null. Camera cannot measure temperature.',
    },
    temperature_status: {
      type: 'string',
      enum: ['not_measured'],
      description: 'Always "not_measured"',
    },
    reason: {
      type: ['string', 'null'],
      enum: ['needs_better_image', 'not_goat_or_sheep', 'multiple_animals', null],
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
      error: 'Hindi naka-configure ang GEMINI_API_KEY sa server environment. Add GEMINI_API_KEY in Vercel: Project → Settings → Environment Variables',
      detected: false,
      animal_type: 'unknown',
      animal_label: 'Hindi tiyak',
      image_quality: 'poor',
      multiple_animals: false,
      health_status: 'unknown',
      observations: [],
      possible_concerns: [],
      recommendation: 'I-configure ang Gemini API key sa server bago mag-scan.',
      needs_attention: false,
      needs_medication: false,
      temperature: null,
      temperature_status: 'not_measured',
      reason: null,
    });
  }

  // 3. Parse and Validate Image
  const { image, animalId } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Kailangan magpadala ng base64 image data.',
    });
  }

  let mimeType = 'image/jpeg';
  let base64Pure = image;
  const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,([\s\S]+)$/);
  if (match) {
    mimeType = match[1];
    base64Pure = match[2];
  }
  base64Pure = base64Pure.replace(/\s+/g, '');

  if (base64Pure.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Walang wastong litrato na natanggap.',
    });
  }

  // 4. Initialize GoogleGenAI SDK
  const ai = new GoogleGenAI({ apiKey });

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const fallbackModels = [primaryModel, 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(
    (v, i, a) => a.indexOf(v) === i
  );

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

      const responseText = response.text || '';
      if (!responseText.trim()) {
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

      // Enforce strict business rules
      const detected = Boolean(parsed.detected);
      const isGoatOrSheep = parsed.animal_type === 'goat' || parsed.animal_type === 'sheep';
      const actualDetected = detected && isGoatOrSheep;

      let reason = parsed.reason || null;
      if (!actualDetected && !reason) {
        reason = 'not_goat_or_sheep';
      }

      const formattedResult: GeminiAnimalScanResponse = {
        success: true,
        detected: actualDetected,
        animal_type: actualDetected ? parsed.animal_type : 'unknown',
        animal_label: actualDetected
          ? parsed.animal_type === 'goat'
            ? 'Kambing'
            : 'Tupa'
          : 'Hindi kambing o tupa',
        image_quality: parsed.image_quality === 'poor' ? 'poor' : 'good',
        multiple_animals: Boolean(parsed.multiple_animals),
        health_status: actualDetected ? (parsed.health_status || 'healthy') : 'unknown',
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
      const errMsg = String(err?.message || err);
      // If error is model not found or quota, try next fallback model
      if (
        errMsg.includes('404') ||
        errMsg.includes('not found') ||
        errMsg.includes('is not supported')
      ) {
        continue;
      }
      break;
    }
  }

  // Handle errors
  const errMessage = lastError?.message || 'Hindi nakumpleto ang Gemini Vision scan.';
  let statusCode = 500;
  if (errMessage.includes('quota') || errMessage.includes('rate') || errMessage.includes('429')) {
    statusCode = 429;
  } else if (errMessage.includes('API key') || errMessage.includes('API_KEY_INVALID')) {
    statusCode = 401;
  }

  return res.status(statusCode).json({
    success: false,
    error: `Gemini API Error: ${errMessage}`,
    detected: false,
    animal_type: 'unknown',
    animal_label: 'Hindi tiyak',
    image_quality: 'poor',
    multiple_animals: false,
    health_status: 'unknown',
    observations: [],
    possible_concerns: [],
    recommendation: 'Maghintay sandali at subukan muli ang pag-scan.',
    needs_attention: false,
    needs_medication: false,
    temperature: null,
    temperature_status: 'not_measured',
    reason: null,
  });
}
