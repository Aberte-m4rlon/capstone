/**
 * Vercel Serverless Function — AlpasFarm Gemini AI Animal Scanner
 * POST /api/ai/animal-scan
 *
 * Uses Google Gemini Multimodal Vision API (gemini-2.0-flash / gemini-1.5-flash)
 * to perform high-precision visual screening of goats and sheep:
 *   1. Multimodal animal detection (Goat / Sheep / Non-target rejection)
 *   2. Normalized bounding boxes [ymin, xmin, ymax, xmax] (0-1000 integer range)
 *   3. Multi-animal tracking (Goat #1, Goat #2, Sheep #1, etc.)
 *   4. Visual body orientation & observable clinical signs
 *   5. ZERO FAKE TEMPERATURE: Strictly null / "Hindi nasukat" (no RGB thermal guessing)
 *   6. Secure server-side execution: GEMINI_API_KEY never exposed to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as https from 'https';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

export interface BoundingBoxNormalized {
  x: number;      // 0..1
  y: number;      // 0..1
  width: number;  // 0..1
  height: number; // 0..1
  rawBox: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
}

export interface DetectedAnimal {
  id: string;
  species: 'goat' | 'sheep';
  label: string;
  boundingBox: BoundingBoxNormalized;
  bodyOrientation: string;
  visualObservations: string[];
  possibleHealthConcerns: string[];
  needsManualCheck: boolean;
  healthStatus: 'healthy' | 'monitor' | 'attention';
}

export interface AnimalScanResult {
  success: boolean;
  detected: boolean;
  animalCount: number;
  animals: DetectedAnimal[];
  overallMessage: string;
  recommendation: string;
  temperature: null;
  temperatureDisplay: string;
  engine: string;
  modelVersion: string;
  error?: string;
}

// ── HTTPS Helper ──────────────────────────────────────────────────────────────
function httpsPost(
  hostname: string,
  path: string,
  headers: Record<string, string | number>,
  body: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Normalize Bounding Box Coordinates ────────────────────────────────────────
function normalizeBox(raw: any): BoundingBoxNormalized {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      rawBox: [100, 100, 900, 900],
    };
  }

  // Gemini returns [ymin, xmin, ymax, xmax] in 0-1000 integers
  const ymin = Math.max(0, Math.min(1000, Number(raw[0]) || 0));
  const xmin = Math.max(0, Math.min(1000, Number(raw[1]) || 0));
  const ymax = Math.max(ymin, Math.min(1000, Number(raw[2]) || 1000));
  const xmax = Math.max(xmin, Math.min(1000, Number(raw[3]) || 1000));

  const x = Math.max(0, Math.min(1, xmin / 1000));
  const y = Math.max(0, Math.min(1, ymin / 1000));
  const width = Math.max(0.02, Math.min(1 - x, (xmax - xmin) / 1000));
  const height = Math.max(0.02, Math.min(1 - y, (ymax - ymin) / 1000));

  return {
    x,
    y,
    width,
    height,
    rawBox: [ymin, xmin, ymax, xmax],
  };
}

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
      error: 'Method not allowed. Use POST.',
    });
  }

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    return res.status(503).json({
      success: false,
      error: 'Hindi naka-configure ang GEMINI_API_KEY sa server environment (.env).',
      detected: false,
      animalCount: 0,
      animals: [],
      temperature: null,
      temperatureDisplay: 'Hindi nasukat',
    });
  }

  const { image } = req.body || {};

  if (!image || typeof image !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Kailangan magpadala ng base64 image data.',
    });
  }

  // Parse MIME type and base64
  let mimeType = 'image/jpeg';
  let base64Pure = image;
  const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
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

  // Visual Analysis Prompt with Structured JSON Output
  const prompt = `You are the AlpasFarm Senior AI Livestock Vision Specialist in the Philippines.
Analyze this camera image of a farm pen or pasture.
Your tasks:
1. Detect if any GOAT or SHEEP is present in the image.
   - ONLY recognize 'goat' or 'sheep'.
   - If the subject is a human (tao), dog (aso), cat (pusa), cow, pig, chicken, vehicle, empty pen, or object, set detected=false, animal_count=0, and animals=[].
2. For EVERY goat or sheep visible:
   - Provide an individual bounding box [ymin, xmin, ymax, xmax] normalized on a 0 to 1000 integer scale (e.g. [120, 150, 780, 850]).
   - Do NOT combine multiple animals into one bounding box. List each one separately.
   - Identify visible body orientation: "harap" (facing camera), "tagiliran" (side profile), "likod" (rear), "nakatayo" (standing), or "nakahiga" (lying down).
   - Record visual observations in Tagalog/English (e.g. "Alertong postura", "Malinis ang mga mata at ilong", "Makintab at pantay ang balahibo").
   - Record any observable abnormal visual signs ONLY when clearly observable (e.g. "May sipon o discharge sa ilong", "May pamumula sa paligid ng mata", "May sugat sa bibig"). If healthy, leave as an empty array [].
   - Do NOT make definitive disease diagnoses. Use observable visual descriptions.
   - Set health_status: "healthy" (normal appearance), "monitor" (slight visible irregularity), or "attention" (clear visible lesions, discharge, or severe posture change).
3. CRITICAL MANDATES:
   - DO NOT invent or estimate body temperature. Ordinary RGB cameras cannot measure temperature.
   - DO NOT invent heart rate or pulse.
   - Keep observations and recommendations practical for Filipino goat and sheep farmers.`;

  const structuredSchema = {
    type: 'OBJECT',
    properties: {
      detected: { type: 'BOOLEAN' },
      animal_count: { type: 'INTEGER' },
      animals: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            species: { type: 'STRING', enum: ['goat', 'sheep'] },
            label: { type: 'STRING' },
            bounding_box: {
              type: 'ARRAY',
              items: { type: 'INTEGER' },
              description: '[ymin, xmin, ymax, xmax] normalized 0 to 1000',
            },
            body_orientation: { type: 'STRING' },
            visual_observations: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            possible_health_concerns: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            needs_manual_check: { type: 'BOOLEAN' },
            health_status: { type: 'STRING', enum: ['healthy', 'monitor', 'attention'] },
          },
          required: ['species', 'label', 'bounding_box', 'visual_observations', 'health_status'],
        },
      },
      overall_message: { type: 'STRING' },
      recommendation: { type: 'STRING' },
    },
    required: ['detected', 'animal_count', 'animals', 'overall_message', 'recommendation'],
  };

  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    try {
      const path = `/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Pure,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 32,
          topP: 0.9,
          responseMimeType: 'application/json',
          responseSchema: structuredSchema,
        },
      };

      const resHttp = await httpsPost(
        GEMINI_HOST,
        path,
        {
          'Content-Type': 'application/json',
          'User-Agent': 'AlpasFarm-AI-Scanner/2.0',
        },
        JSON.stringify(payload),
      );

      if (resHttp.status !== 200) {
        lastError = new Error(`Gemini HTTP ${resHttp.status}: ${resHttp.text.slice(0, 300)}`);
        continue;
      }

      const rawJson = JSON.parse(resHttp.text);
      const textOutput = rawJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textOutput) {
        lastError = new Error('Empty response from Gemini vision model.');
        continue;
      }

      const parsed = JSON.parse(textOutput);
      const isDetected = Boolean(parsed.detected);
      const rawAnimals: any[] = Array.isArray(parsed.animals) ? parsed.animals : [];

      let goatCount = 0;
      let sheepCount = 0;

      const formattedAnimals: DetectedAnimal[] = isDetected
        ? rawAnimals.map((a: any, idx: number) => {
            const rawSpecies = (a.species || '').toLowerCase();
            const species: 'goat' | 'sheep' = rawSpecies === 'sheep' ? 'sheep' : 'goat';

            if (species === 'sheep') sheepCount++;
            else goatCount++;

            const animalIndex = species === 'sheep' ? sheepCount : goatCount;
            const fallbackLabel =
              rawAnimals.length > 1
                ? `${species === 'sheep' ? 'SHEEP' : 'GOAT'} #${animalIndex}`
                : species === 'sheep' ? 'SHEEP' : 'GOAT';

            return {
              id: `animal-${idx + 1}`,
              species,
              label: a.label || fallbackLabel,
              boundingBox: normalizeBox(a.bounding_box),
              bodyOrientation: a.body_orientation || 'nakatayo',
              visualObservations: Array.isArray(a.visual_observations) ? a.visual_observations : [],
              possibleHealthConcerns: Array.isArray(a.possible_health_concerns) ? a.possible_health_concerns : [],
              needsManualCheck: Boolean(a.needs_manual_check || (a.possible_health_concerns && a.possible_health_concerns.length > 0)),
              healthStatus: a.health_status || 'healthy',
            };
          })
        : [];

      const result: AnimalScanResult = {
        success: true,
        detected: isDetected && formattedAnimals.length > 0,
        animalCount: formattedAnimals.length,
        animals: formattedAnimals,
        overallMessage:
          parsed.overall_message ||
          (isDetected && formattedAnimals.length > 0
            ? `${formattedAnimals.length} ${formattedAnimals.length > 1 ? 'hayop' : formattedAnimals[0].species === 'sheep' ? 'tupa' : 'kambing'} ang natukoy.`
            : 'Walang nakitang kambing o tupa sa litrato.'),
        recommendation:
          parsed.recommendation ||
          (isDetected
            ? 'Ipagpatuloy ang regular na pagsubaybay sa kalusugan ng kawan.'
            : 'Iposisyon nang maayos ang camera sa gitna ng kambing o tupa.'),
        temperature: null, // Strictly null
        temperatureDisplay: 'Hindi nasukat',
        engine: 'google-gemini-multimodal',
        modelVersion: model,
      };

      return res.status(200).json(result);
    } catch (err: any) {
      lastError = err;
    }
  }

  return res.status(500).json({
    success: false,
    error: lastError?.message || 'Hindi nagtagumpay ang pagsusuri ng Gemini AI.',
    detected: false,
    animalCount: 0,
    animals: [],
    temperature: null,
    temperatureDisplay: 'Hindi nasukat',
  });
}
