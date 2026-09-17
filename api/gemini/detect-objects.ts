/**
 * Vercel Serverless Function — AlpasFarm Live Object Detection with Bounding Boxes
 * POST /api/gemini/detect-objects
 *
 * Fast, lightweight sampled frame object detection:
 * - Detects GOAT (KAMBING), SHEEP (TUPA), PERSON (TAO), OTHER_ANIMAL (HAYOP), OBJECT (BAGAY)
 * - Returns normalized bounding boxes [x, y, width, height] for each detected subject
 * - Identifies single target vs multiple animals
 * - Zero developer jargon returned to frontend
 * - Secure server-side execution: GEMINI_API_KEY is never exposed to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { getSupabaseServer } from '../_lib/supabaseServer';

export interface BoundingBox {
  x: number;       // 0.0 to 1.0
  y: number;       // 0.0 to 1.0
  width: number;   // 0.0 to 1.0
  height: number;  // 0.0 to 1.0
}

export type TargetType = 'GOAT' | 'SHEEP' | 'PERSON' | 'OTHER_ANIMAL' | 'OBJECT';
export type TargetLabel = 'KAMBING' | 'TUPA' | 'TAO' | 'HAYOP' | 'BAGAY';

export interface ObjectDetectionItem {
  type: TargetType;
  label: TargetLabel;
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

const SYSTEM_PROMPT = `You are the live object-detection vision engine for ALPASFARM (Philippines).
Analyze the camera frame to visually detect and localize subjects with bounding boxes.

Allowed Classes and Labels:
- GOAT -> label "KAMBING"
- SHEEP -> label "TUPA"
- PERSON -> label "TAO"
- OTHER_ANIMAL -> label "HAYOP" (dogs, cats, chickens, birds, pigs, cattle)
- OBJECT -> label "BAGAY" (furniture, vehicles, phones, equipment, walls, pens)

Rules:
1. Detect prominent subjects in the image.
2. For each detected subject, provide a tight bounding box with normalized coordinates between 0.0 and 1.0:
   - x: top-left horizontal coordinate (0.0 = left edge, 1.0 = right edge)
   - y: top-left vertical coordinate (0.0 = top edge, 1.0 = bottom edge)
   - width: box width (0.0 to 1.0)
   - height: box height (0.0 to 1.0)
   Coordinates must be within bounds: x >= 0, y >= 0, x + width <= 1.0, y + height <= 1.0.
3. If there are multiple goats or sheep, draw a separate bounding box around EACH individual animal. Never combine multiple animals into one large box.
4. Count the number of goats in count_goats and sheep in count_sheep.
5. If count_goats + count_sheep > 1, set multiple_targets = true.
6. For status_message, provide a concise Tagalog status for the farmer:
   - If 1 goat: "KAMBING: Handa nang i-scan"
   - If 1 sheep: "TUPA: Handa nang i-scan"
   - If multiple goats/sheep: "Maraming hayop ang nakita. Itapat ang camera sa isang kambing o tupa."
   - If person: "TAO: Hindi kambing o tupa"
   - If other animal: "HAYOP: Hindi kambing o tupa"
   - If object: "BAGAY"
   - If nothing prominent: "Tinitingnan ang camera..."
7. Return ONLY valid JSON adhering strictly to the schema.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    detections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['GOAT', 'SHEEP', 'PERSON', 'OTHER_ANIMAL', 'OBJECT'],
          },
          label: {
            type: 'string',
            enum: ['KAMBING', 'TUPA', 'TAO', 'HAYOP', 'BAGAY'],
          },
          boundingBox: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'Normalized top-left x (0.0 to 1.0)' },
              y: { type: 'number', description: 'Normalized top-left y (0.0 to 1.0)' },
              width: { type: 'number', description: 'Normalized width (0.0 to 1.0)' },
              height: { type: 'number', description: 'Normalized height (0.0 to 1.0)' },
            },
            required: ['x', 'y', 'width', 'height'],
          },
        },
        required: ['type', 'label', 'boundingBox'],
      },
    },
    count_goats: { type: 'integer' },
    count_sheep: { type: 'integer' },
    multiple_targets: { type: 'boolean' },
    status_message: { type: 'string' },
  },
  required: ['detections', 'count_goats', 'count_sheep', 'multiple_targets', 'status_message'],
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

  // 4. Initialize Google Gen AI client
  const ai = new GoogleGenAI({ apiKey });

  // Priority models for fast object detection
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-2.0-flash',
  ].filter((m): m is string => Boolean(m && m.trim()));

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
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
      if (!text) {
        throw new Error('Walang naibalik na text mula sa Gemini Vision.');
      }

      const parsed = JSON.parse(text);

      // Clamp coordinates to valid range [0.0, 1.0]
      const sanitizedDetections: ObjectDetectionItem[] = (parsed.detections || []).map((d: any) => {
        const rawBox = d.boundingBox || {};
        const x = Math.max(0, Math.min(1, Number(rawBox.x) || 0));
        const y = Math.max(0, Math.min(1, Number(rawBox.y) || 0));
        const width = Math.max(0.02, Math.min(1 - x, Number(rawBox.width) || 0.1));
        const height = Math.max(0.02, Math.min(1 - y, Number(rawBox.height) || 0.1));

        return {
          type: d.type || 'OBJECT',
          label: d.label || 'BAGAY',
          boundingBox: {
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            width: Math.round(width * 1000) / 1000,
            height: Math.round(height * 1000) / 1000,
          },
        };
      });

      return res.status(200).json({
        success: true,
        detections: sanitizedDetections,
        count_goats: Number(parsed.count_goats) || 0,
        count_sheep: Number(parsed.count_sheep) || 0,
        multiple_targets: Boolean(parsed.multiple_targets),
        status_message: parsed.status_message || 'Tinitingnan ang camera...',
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`[detect-objects] Model ${model} failed, trying next fallback:`, err?.message || err);
    }
  }

  console.error('[detect-objects] Lahat ng Gemini models ay nag-fail:', lastError);
  return res.status(502).json({
    success: false,
    error: `Hindi makakonekta sa Gemini Vision: ${lastError?.message || 'Unknown error'}`,
    detections: [],
    count_goats: 0,
    count_sheep: 0,
    multiple_targets: false,
    status_message: 'Tinitingnan ang camera...',
  });
}
