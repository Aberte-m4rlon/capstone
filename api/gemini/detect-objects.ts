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

const SYSTEM_PROMPT = `You are the real-time visual object-detection engine for ALPASFARM livestock management.
Analyze the provided camera frame to detect and localize subjects with bounding boxes.

Allowed Classes:
- GOAT: Domestic goat (kambing)
- SHEEP: Domestic sheep (tupa)
- PERSON: Human person (farmer, handler, visitor)
- OTHER_ANIMAL: Non-livestock animal (dog, cat, bird, pig, chicken, cow)
- OBJECT: Inanimate physical object, farm equipment, wall, fence, vehicle
- NONE: When no prominent entity is visible

Rules:
1. Detect prominent entities in the camera frame.
2. For each detected entity, return:
   - type: One of "GOAT", "SHEEP", "PERSON", "OTHER_ANIMAL", "OBJECT"
   - label: Brief description (e.g. "goat", "sheep", "person", "dog", "fence")
   - x: Normalized top-left horizontal coordinate (0.0 to 1.0)
   - y: Normalized top-left vertical coordinate (0.0 to 1.0)
   - width: Normalized box width (0.0 to 1.0)
   - height: Normalized box height (0.0 to 1.0)
3. Coordinates must be bounded: 0.0 <= x <= 1.0, 0.0 <= y <= 1.0, x + width <= 1.0, y + height <= 1.0.
4. If multiple goats or sheep are visible, output a separate entry with bounding box for EACH individual animal.
5. If nothing distinct is visible, return an empty array for detections: [].
6. Every field in your JSON response must strictly follow the schema with valid types. NEVER return null.`;

// Clean, standard Gemini-compatible schema using Type enum with zero null types
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['GOAT', 'SHEEP', 'PERSON', 'OTHER_ANIMAL', 'OBJECT', 'NONE'],
          },
          label: {
            type: Type.STRING,
          },
          x: {
            type: Type.NUMBER,
          },
          y: {
            type: Type.NUMBER,
          },
          width: {
            type: Type.NUMBER,
          },
          height: {
            type: Type.NUMBER,
          },
        },
        required: ['type', 'label', 'x', 'y', 'width', 'height'],
      },
    },
  },
  required: ['detections'],
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

  // Priority models chain: user configured model -> gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash -> gemini-flash-latest
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
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

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
        parsed = JSON.parse(cleaned);
      }

      const validTypes = new Set(['GOAT', 'SHEEP', 'PERSON', 'OTHER_ANIMAL', 'OBJECT']);
      const rawList = Array.isArray(parsed?.detections) ? parsed.detections : [];

      const sanitizedDetections: ObjectDetectionItem[] = rawList
        .filter((d: any) => d && validTypes.has(String(d.type).toUpperCase()))
        .map((d: any) => {
          const type = String(d.type).toUpperCase() as TargetType;
          let defaultLabel: TargetLabel = 'BAGAY';
          if (type === 'GOAT') defaultLabel = 'KAMBING';
          else if (type === 'SHEEP') defaultLabel = 'TUPA';
          else if (type === 'PERSON') defaultLabel = 'TAO';
          else if (type === 'OTHER_ANIMAL') defaultLabel = 'HAYOP';

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
            label: defaultLabel,
            boundingBox: {
              x: Math.round(x * 1000) / 1000,
              y: Math.round(y * 1000) / 1000,
              width: Math.round(width * 1000) / 1000,
              height: Math.round(height * 1000) / 1000,
            },
          };
        });

      const countGoats = sanitizedDetections.filter(d => d.type === 'GOAT').length;
      const countSheep = sanitizedDetections.filter(d => d.type === 'SHEEP').length;
      const multipleTargets = (countGoats + countSheep) > 1;

      let statusMessage = 'Tinitingnan ang camera...';
      if (multipleTargets) {
        statusMessage = 'Maraming hayop ang nakita. Itapat ang camera sa isang kambing o tupa.';
      } else if (countGoats === 1) {
        statusMessage = 'KAMBING: Handa nang i-scan';
      } else if (countSheep === 1) {
        statusMessage = 'TUPA: Handa nang i-scan';
      } else {
        const person = sanitizedDetections.find(d => d.type === 'PERSON');
        const otherAnimal = sanitizedDetections.find(d => d.type === 'OTHER_ANIMAL');
        const objectItem = sanitizedDetections.find(d => d.type === 'OBJECT');
        if (person) {
          statusMessage = 'TAO: Hindi kambing o tupa';
        } else if (otherAnimal) {
          statusMessage = 'HAYOP: Hindi kambing o tupa';
        } else if (objectItem) {
          statusMessage = 'BAGAY';
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
      console.warn(`[detect-objects] Model ${model} encountered issue:`, err?.message || err);
      // Try next fallback model
      continue;
    }
  }

  console.error('[detect-objects] Lahat ng Gemini models ay nag-fail:', lastError?.message || lastError);
  return res.status(502).json({
    success: false,
    error: 'Hindi makumpleto ang scan. Subukan muli.',
    detections: [],
    count_goats: 0,
    count_sheep: 0,
    multiple_targets: false,
    status_message: 'Hindi makumpleto ang scan. Subukan muli.',
  });
}
