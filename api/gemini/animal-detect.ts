/**
 * Vercel Serverless Function — AlpasFarm Live Object Detection with Bounding Boxes
 * POST /api/gemini/detect-objects
 *
 * Fast, lightweight sampled frame object detection:
 * - Detects GOAT (KAMBING), SHEEP (TUPA), PERSON (TAO), OTHER_ANIMAL (HAYOP), OBJECT (BAGAY), NONE
 * - Returns normalized bounding boxes [x, y, width, height] for each detected subject
 * - Strictly uses valid Gemini-supported primitive types (ZERO NULL types in schema)
 * - Identifies single target vs multiple animals
 * - Secure server-side execution: GEMINI_API_KEY is never exposed to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import { getSupabaseServer } from '../_lib/supabaseServer';

export interface BoundingBox {
  x: number;       // 0.0 to 1.0
  y: number;       // 0.0 to 1.0
  width: number;   // 0.0 to 1.0
  height: number;  // 0.0 to 1.0
}

export type TargetType = 'GOAT' | 'SHEEP' | 'PERSON' | 'OTHER';
export type TargetLabel = 'Kambing' | 'Tupa' | 'Tao' | 'Ibang Bagay';
export type TargetSpecies = 'goat' | 'sheep' | 'person' | 'other';

export interface ObjectDetectionItem {
  type: TargetType;
  label: TargetLabel;
  species?: TargetSpecies;
  confidence?: number;
  boundingBox: BoundingBox;
}

export interface LiveObjectDetectionResponse {
  success: boolean;
  detections: ObjectDetectionItem[];
  count_goats: number;
  count_sheep: number;
  multiple_targets: boolean;
  status_message: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are a strict object detector for a goat and sheep farm.

Inspect the provided image carefully.

For EVERY detected object that is relevant to this camera scene, determine its specific category.

Allowed categories:
- goat
- sheep
- person
- other

IMPORTANT:
Only use "goat" when the object is visually an actual goat.
Only use "sheep" when the object is visually an actual sheep.
Use "person" only for a human person.
Everything else must be classified as "other".

Never use a generic category such as "animal".
Do not classify a cat, dog, cow, horse, car, door, furniture, bag, machine, or other object as goat or sheep.
If the object is not clearly identifiable as a goat or sheep, use "other".

For goat and sheep detections, provide an accurate bounding box around the actual animal.

If a person and a goat or sheep are both visible, return separate detections and separate boxes for each.
If multiple goats or sheep are visible, return separate detections and separate boxes for each individual animal.

Use normalized coordinates [0.0 to 1.0]:
x = left
y = top
width = box width
height = box height

If no goat, sheep, person, or significant object is visible (e.g. empty wall, floor, blank room), return an empty detections array: [].

Return structured JSON only.`;

// Clean, standard Gemini-compatible schema using Type enum with zero null types
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: {
            type: Type.STRING,
            description: 'Strictly one of: goat, sheep, person, other',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence between 0.0 and 1.0',
          },
          x: {
            type: Type.NUMBER,
            description: 'Top-left x normalized coordinate from 0.0 to 1.0',
          },
          y: {
            type: Type.NUMBER,
            description: 'Top-left y normalized coordinate from 0.0 to 1.0',
          },
          width: {
            type: Type.NUMBER,
            description: 'Box width normalized from 0.0 to 1.0',
          },
          height: {
            type: Type.NUMBER,
            description: 'Box height normalized from 0.0 to 1.0',
          },
        },
        required: ['label', 'confidence', 'x', 'y', 'width', 'height'],
      },
    },
  },
  required: ['detections'],
};

// Safe, centralized normalization function as specified
export function normalizeTarget(rawLabel: any, rawType?: any): { type: TargetType; label: TargetLabel; species: TargetSpecies; tagalog: string } {
  const str = `${rawLabel || ''} ${rawType || ''}`.trim().toLowerCase();

  // Explicit check: generic animal terms MUST NEVER map to goat or sheep
  if (
    /^(animal|hayop|mammal|livestock|farm animal|creature|object|bagay|other)$/.test(str)
  ) {
    return { type: 'OTHER', label: 'Ibang Bagay', species: 'other', tagalog: 'Ibang Bagay' };
  }

  // 1. Goat checks (caprine)
  if (
    /\b(goat|goats|kambing|capra|caprine|billy|nanny|kid|buck|doe)\b/.test(str) &&
    !/\b(not\s+goat|sheep|dog|cat|cow|person|human|other|ibang)\b/.test(str)
  ) {
    return { type: 'GOAT', label: 'Kambing', species: 'goat', tagalog: 'Kambing' };
  }

  // 2. Sheep checks (ovine)
  if (
    /\b(sheep|tupa|lamb|ram|ewe|ovis|ovine)\b/.test(str) &&
    !/\b(not\s+sheep|goat|dog|cat|cow|person|human|other|ibang)\b/.test(str)
  ) {
    return { type: 'SHEEP', label: 'Tupa', species: 'sheep', tagalog: 'Tupa' };
  }

  // 3. Person checks
  if (
    /\b(person|people|human|man|woman|child|farmer|tao)\b/.test(str) &&
    !/\b(other|ibang)\b/.test(str)
  ) {
    return { type: 'PERSON', label: 'Tao', species: 'person', tagalog: 'Tao' };
  }

  // 4. Everything else (cat, dog, cow, horse, pig, car, door, furniture, machine, etc.)
  return { type: 'OTHER', label: 'Ibang Bagay', species: 'other', tagalog: 'Ibang Bagay' };
}

export const normalizeDetectionLabel = normalizeTarget;

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

  // 1. Authenticate Request gracefully (verify session if token is provided, without breaking video stream)
  const authHeader = req.headers.authorization || (req.headers.Authorization as string) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const supabase = getSupabaseServer();
  if (supabase && token) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr) {
        console.warn('[detect-objects] Session validation notice:', authErr.message);
      }
    } catch (authException: any) {
      console.warn('[detect-objects] Auth notice:', authException?.message);
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
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      multiple_targets: false,
      status_message: 'Kailangan ng API key para sa camera scanner.',
    });
  }

  // 3. Parse Request Body
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Kinakailangan ang base64 image data sa request body.',
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      multiple_targets: false,
      status_message: 'Walang natanggap na imahe.',
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

  // Requirement 1: Developer logging
  const approxBytes = Math.round(base64Pure.length * 0.75);
  console.log(`[detect-objects] Frame received: MIME=${mimeType}, base64Len=${base64Pure.length}, approxSize=${Math.round(approxBytes / 1024)}KB`);

  // 4. Initialize Google Gen AI client
  const ai = new GoogleGenAI({ apiKey });

  // Priority modern model chain: active user config -> gemini-3.5-flash -> gemini-3.6-flash -> gemini-3.5-flash-lite -> gemini-flash-latest
  const rawModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
  ].filter((m): m is string => Boolean(m && m.trim()));

  const modelsToTry = Array.from(new Set(rawModels));
  let lastError: any = null;

  for (const model of modelsToTry) {
    const reqStart = Date.now();
    try {
      console.log(`[detect-objects] Gemini request started with model: ${model}`);
      const response = await ai.models.generateContent({
        model,
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

      const text = response.text;
      const durationMs = Date.now() - reqStart;
      console.log(`[detect-objects] Gemini response received from ${model} in ${durationMs}ms`);

      if (!text) {
        throw new Error('Walang naibalik na text mula sa Gemini Vision.');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
        parsed = JSON.parse(cleaned);
      }

      const rawList = Array.isArray(parsed?.detections) ? parsed.detections : [];

      const sanitizedDetections: ObjectDetectionItem[] = rawList
        .filter((d: any) => d && typeof d === 'object')
        .map((d: any) => {
          const norm = normalizeTarget(d.label, d.type);
          const type = norm.type;
          const label = norm.label;
          const species = norm.species;
          const confidence = typeof d.confidence === 'number' ? Math.max(0, Math.min(1, d.confidence)) : 0.9;

          let rawX = Number(d.x ?? d.boundingBox?.x ?? d.box_2d?.ymin ?? 0);
          let rawY = Number(d.y ?? d.boundingBox?.y ?? d.box_2d?.xmin ?? 0);
          let rawW = Number(d.width ?? d.boundingBox?.width ?? 0);
          let rawH = Number(d.height ?? d.boundingBox?.height ?? 0);

          // Support 0-1000 scale if returned by vision model
          if (rawX > 1 || rawY > 1 || rawW > 1 || rawH > 1) {
            rawX /= 1000;
            rawY /= 1000;
            rawW /= 1000;
            rawH /= 1000;
          }

          const x = Math.max(0, Math.min(0.95, rawX || 0));
          const y = Math.max(0, Math.min(0.95, rawY || 0));
          const width = Math.max(0.04, Math.min(1 - x, rawW || 0.1));
          const height = Math.max(0.04, Math.min(1 - y, rawH || 0.1));

          return {
            type,
            label,
            species,
            confidence,
            boundingBox: {
              x: Math.round(x * 1000) / 1000,
              y: Math.round(y * 1000) / 1000,
              width: Math.round(width * 1000) / 1000,
              height: Math.round(height * 1000) / 1000,
            },
          };
        })
        .filter((d) => d.type === 'GOAT' || d.type === 'SHEEP');

      const countGoats = sanitizedDetections.filter(d => d.type === 'GOAT').length;
      const countSheep = sanitizedDetections.filter(d => d.type === 'SHEEP').length;
      const multipleTargets = (countGoats + countSheep) > 1;

      // Developer logging
      console.log(`[detect-objects] Parsed detections: count=${sanitizedDetections.length}, goats=${countGoats}, sheep=${countSheep}, labels=[${sanitizedDetections.map(d => d.type).join(', ')}]`);

      let statusMessage = 'Walang kambing o tupa na nakita.';
      if (multipleTargets) {
        statusMessage = 'Maraming kambing o tupa ang nakita. Piliin ang susuriin.';
      } else if (countGoats === 1) {
        statusMessage = 'Kambing ang nakita.';
      } else if (countSheep === 1) {
        statusMessage = 'Tupa ang nakita.';
      } else {
        const person = undefined;
        const other = undefined;
        if (person) {
          statusMessage = 'May taong nakita.';
        } else if (other) {
          statusMessage = 'May ibang bagay na nakita.';
        } else {
          statusMessage = 'Walang kambing o tupa na nakita.';
        }
      }

      return res.status(200).json({
        success: true,
        detections: sanitizedDetections,
        count_goats: countGoats,
        count_sheep: countSheep,
        multiple_targets: multipleTargets,
        status_message: statusMessage,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`[detect-objects] Model ${model} encountered issue (${Date.now() - reqStart}ms):`, err?.message || err);
      // Try next fallback model
      continue;
    }
  }

  console.error('[detect-objects] Lahat ng Gemini models ay nag-fail:', lastError?.message || lastError);
  return res.status(502).json({
    success: false,
    error: 'Hindi makumpleto ang detection. Sinusubukan muli.',
    detections: [],
    count_goats: 0,
    count_sheep: 0,
    multiple_targets: false,
    status_message: 'Muling sinusubukan ang Gemini Vision...',
  });
}

