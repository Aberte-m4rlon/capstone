/**
 * Vercel Serverless Function — AlpasFarm Gemini Livestock Health Scanner
 * POST /api/ai/scan-temperature
 *
 * NOTE: Standard RGB cameras cannot measure physiological body temperature.
 * Temperature is strictly returned as `null` ("Hindi nasukat").
 *
 * Evaluates goat/sheep images for:
 *   1. Animal verification (Goat / Sheep / Non-target)
 *   2. Observable visual health indicators (eyes, nose, stance, coat)
 *   3. Overall health status & actionable Tagalog/English recommendations
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as https from 'https';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

export interface GeminiThermalScanResult {
  animalDetected: boolean;
  animalType: 'Goat' | 'Sheep' | 'Other';
  nonTargetClass: string | null;
  detectionConfidence: number;
  estimatedTemperature: null; // Strictly null - no fake temperature
  temperatureStatus: null;
  temperatureDisplay: string;
  temperatureConfidence: number;
  thermalIndicators: string[];
  healthRisk: 'low' | 'moderate' | 'high' | 'critical';
  riskScore: number;
  possibleConditions: string[];
  observations: string[];
  explanation: string;
  recommendedActions: string[];
  engine: string;
  modelVersion: string;
  disclaimer: string;
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

// ── Call Gemini Vision API ────────────────────────────────────────────────────
async function callGeminiVision(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  speciesHint?: string,
  notes?: string,
): Promise<GeminiThermalScanResult> {
  let lastError: any = null;

  const prompt = `You are an expert caprine and ovine veterinary diagnostician in the Philippines.
Analyze this camera image of a goat or sheep.
Your primary tasks:
1. Verify if the animal is a Goat, Sheep, or Non-target (human, dog, cat, empty pen, object).
2. Examine observable visual clinical signs:
   - Eyes & Conjunctiva: Alertness, eye clarity, tearing, crusting.
   - Muzzle & Nostrils: Dryness, discharge, lesion.
   - Respiration & Posture: Flank movement, body posture, standing vs recumbent.
   - Coat & Demeanor: Roughness, hair standing, alert vs lethargic.
3. MANDATE: Ordinary camera RGB images CANNOT measure body temperature. Do NOT guess or invent temperature values. Temperature is NOT measured.
4. User Context: Species hint: ${speciesHint || 'Auto'}. Notes: ${notes || 'None'}.

Return ONLY a strict JSON object:
{
  "animalDetected": boolean,
  "animalType": "Goat" | "Sheep" | "Other",
  "nonTargetClass": string or null,
  "detectionConfidence": number between 0.0 and 1.0,
  "healthRisk": "low" | "moderate" | "high" | "critical",
  "riskScore": number between 0 and 100,
  "possibleConditions": [ "observable condition or issue" ],
  "observations": [ "clinical observation in Tagalog/English" ],
  "explanation": "Summary explanation in Tagalog for Filipino farmers explaining the visual health status. Explicitly state that temperature was not measured without a physical sensor.",
  "recommendedActions": [ "Action 1 in Tagalog/English", "Action 2" ]
}`;

  for (const model of GEMINI_MODELS) {
    try {
      const path = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const requestPayload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
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
        },
      };

      const response = await httpsPost(
        GEMINI_HOST,
        path,
        {
          'Content-Type': 'application/json',
          'User-Agent': 'AlpasFarm-AI-Scanner/2.0',
        },
        JSON.stringify(requestPayload),
      );

      if (response.status === 200) {
        const parsed = JSON.parse(response.text);
        const candidateText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          const cleanedText = candidateText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const result = JSON.parse(cleanedText);

          return {
            animalDetected: Boolean(result.animalDetected),
            animalType: result.animalType || (speciesHint === 'Sheep' ? 'Sheep' : 'Goat'),
            nonTargetClass: result.nonTargetClass || null,
            detectionConfidence: Number(result.detectionConfidence) || 0.9,
            estimatedTemperature: null, // Strictly null
            temperatureStatus: null,
            temperatureDisplay: 'Hindi nasukat',
            temperatureConfidence: 0,
            thermalIndicators: [
              'Walang pisikal na thermometer sensor na ginamit. Hindi nasusukat ang tunay na temperatura sa ordinaryong camera.',
            ],
            healthRisk: result.healthRisk || 'low',
            riskScore: Number(result.riskScore) || 10,
            possibleConditions: Array.isArray(result.possibleConditions) ? result.possibleConditions : [],
            observations: Array.isArray(result.observations) ? result.observations : [],
            explanation:
              result.explanation ||
              'Maayos ang pangkalahatang kalagayan ng hayop. Paalala: Hindi nasusukat ang temperatura mula sa ordinaryong camera.',
            recommendedActions: Array.isArray(result.recommendedActions) ? result.recommendedActions : ['Ipagpatuloy ang regular na pagsubaybay.'],
            engine: 'google-gemini-vision',
            modelVersion: model,
            disclaimer: 'Paunang visual screening lamang ito. Gumamit ng veterinary thermometer para sa tumpak na temperatura at kumonsulta sa lisensyadong beterinaryo.',
          };
        }
      } else {
        lastError = new Error(`Gemini API returned status ${response.status}: ${response.text.slice(0, 300)}`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed to process the image.');
}

// ── Vercel Handler ────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gemini-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { image, animalType, notes } = req.body || {};

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing base64 image data in request body.' });
    }

    const serverApiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GEMINI_API_KEY;

    if (!serverApiKey) {
      return res.status(503).json({
        error: 'Hindi naka-configure ang GEMINI_API_KEY sa server environment (.env).',
        estimatedTemperature: null,
        temperatureDisplay: 'Hindi nasukat',
      });
    }

    let mimeType = 'image/jpeg';
    let base64Pure = image;
    const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
    if (match) {
      mimeType = match[1];
      base64Pure = match[2];
    }
    base64Pure = base64Pure.replace(/\s+/g, '');

    const scanResult = await callGeminiVision(
      serverApiKey,
      base64Pure,
      mimeType,
      animalType,
      notes,
    );

    return res.status(200).json(scanResult);
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Server error while running Gemini scan.',
      estimatedTemperature: null,
      temperatureDisplay: 'Hindi nasukat',
    });
  }
}
