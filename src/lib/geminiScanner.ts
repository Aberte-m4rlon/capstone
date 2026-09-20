/**
 * geminiScanner.ts — AlpasFarm Google Gemini AI Livestock Vision Scanner
 *
 * Multimodal Visual AI Engine for Caprine (Goat) & Ovine (Sheep) detection:
 *   - Google Gemini Multimodal Vision via secure server-side endpoint (/api/gemini/animal-scan)
 *   - Uses official @google/genai SDK on the server side
 *   - ZERO FAKE TEMPERATURE: Strictly null / "Hindi nasukat" (no RGB thermal guessing)
 *   - Secure: GEMINI_API_KEY is NEVER exposed to browser code
 *   - Authenticated with Supabase session token
 */

import { supabase } from './supabase';
import {
  optimizeImageForAI,
  captureLowResFrame,
  cropCanvasToBoundingBox,
  BoundingBox,
  LiveDetectedObject,
  LiveObjectDetectionResult,
  LiveTargetType,
  LiveTargetLabel,
} from './cameraUtils';

export {
  optimizeImageForAI,
  captureLowResFrame,
  cropCanvasToBoundingBox,
};

export type {
  BoundingBox,
  LiveDetectedObject,
  LiveObjectDetectionResult,
  LiveTargetType,
  LiveTargetLabel,
};

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
  visual_observations: string[];
  action: string;
  limitations: string[];
  recommendation: string;
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

export interface AnimalBoundingBox {
  x: number;      // 0..1 (horizontal position from left)
  y: number;      // 0..1 (vertical position from top)
  width: number;  // 0..1 (box width)
  height: number; // 0..1 (box height)
  rawBox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] (0-1000)
}

export interface GeminiDetectedAnimal {
  id: string;
  species: 'goat' | 'sheep';
  label: string; // e.g. "KAMBING", "TUPA"
  boundingBox: AnimalBoundingBox;
  bodyOrientation: string;
  visualObservations: string[];
  possibleHealthConcerns: string[];
  needsManualCheck: boolean;
  healthStatus: 'healthy' | 'monitor' | 'attention';
}

export interface GeminiScanResult {
  success: boolean;
  detected: boolean;
  animalCount: number;
  animals: GeminiDetectedAnimal[];
  overallMessage: string;
  recommendation: string;
  temperature: null;
  temperatureDisplay: string; // Always "Hindi nasukat"
  engine: string;
  modelVersion: string;
  error?: string;
  // Raw API response
  rawResponse?: GeminiAnimalScanResponse;
}

export interface TemperatureStatusDetail {
  status: 'normal' | 'mild_elevation' | 'fever' | 'hypothermia' | 'unknown';
  label: string;
  tagalogLabel: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  description: string;
}

// ── Backwards Compatible Types ──────────────────────────────────────────────
export interface GeminiThermalResult {
  animalDetected: boolean;
  animalType: 'Goat' | 'Sheep' | 'Other';
  nonTargetClass: string | null;
  detectionConfidence: number;
  estimatedTemperature: null; // Strictly null - RGB cannot measure temperature
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
  animals?: GeminiDetectedAnimal[];
}

// ── Concurrency & Cooldown Guard ─────────────────────────────────────────────
let isScanInProgress = false;
let lastScanTimestamp = 0;
const MIN_SCAN_COOLDOWN_MS = 1000; // 1s minimum debounce/cooldown

/**
 * Returns veterinary status details for a given temperature in Celsius.
 * In camera vision, temperature is always null / not measured.
 */
export function getTemperatureStatus(temp?: number | null): TemperatureStatusDetail {
  return {
    status: 'unknown',
    label: 'Not Measured',
    tagalogLabel: 'Hindi nasukat',
    color: '#6B7280',
    badgeBg: 'rgba(107, 114, 128, 0.10)',
    badgeBorder: 'rgba(107, 114, 128, 0.25)',
    description: 'Walang pisikal na thermometer sensor na ginamit. Hindi nasusukat ang tunay na temperatura sa ordinaryong camera.',
  };
}

export type NormalizedClass = 'goat' | 'sheep' | 'person' | 'other';

export interface NormalizedDetection {
  type: 'GOAT' | 'SHEEP' | 'PERSON' | 'OTHER';
  label: 'Kambing' | 'Tupa' | 'Tao' | 'Ibang Bagay';
  species: NormalizedClass;
}

export function normalizeDetectionLabel(rawLabel: any, rawType?: any): NormalizedDetection {
  const str = `${rawLabel || ''} ${rawType || ''}`.trim().toLowerCase();

  // Explicit check: generic terms must NEVER map to goat or sheep
  if (
    /^(animal|hayop|mammal|livestock|farm animal|creature|object|bagay|other)$/.test(str)
  ) {
    return { type: 'OTHER', label: 'Ibang Bagay', species: 'other' };
  }

  // 1. Goat checks (caprine)
  if (
    /\b(goat|goats|kambing|capra|caprine|billy|nanny|kid|buck|doe)\b/.test(str) &&
    !/\b(not\s+goat|sheep|dog|cat|cow|person|human|other|ibang)\b/.test(str)
  ) {
    return { type: 'GOAT', label: 'Kambing', species: 'goat' };
  }

  // 2. Sheep checks (ovine)
  if (
    /\b(sheep|tupa|lamb|ram|ewe|ovis|ovine)\b/.test(str) &&
    !/\b(not\s+sheep|goat|dog|cat|cow|person|human|other|ibang)\b/.test(str)
  ) {
    return { type: 'SHEEP', label: 'Tupa', species: 'sheep' };
  }

  // 3. Person checks
  if (
    /\b(person|people|human|man|woman|child|farmer|tao)\b/.test(str) &&
    !/\b(other|ibang)\b/.test(str)
  ) {
    return { type: 'PERSON', label: 'Tao', species: 'person' };
  }

  // Everything else (cat, dog, cow, car, door, furniture, etc.) -> OTHER
  return { type: 'OTHER', label: 'Ibang Bagay', species: 'other' };
}

export const normalizeTarget = normalizeDetectionLabel;

let isDetectingLive = false;

/**
 * Fast sampled frame object detection for live camera bounding boxes
 * Calls POST /api/gemini/detect-objects. Never exposes API key to client.
 */
export async function detectLiveObjects(
  input: HTMLCanvasElement | string,
  options?: { signal?: AbortSignal }
): Promise<LiveObjectDetectionResult> {
  if (isDetectingLive) {
    return {
      success: false,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      multiple_targets: false,
      status_message: 'Tinitingnan ang camera...',
    };
  }

  isDetectingLive = true;
  const startMs = Date.now();
  try {
    const dataUrl =
      typeof input === 'string'
        ? input
        : input.toDataURL('image/jpeg', 0.70);

    const charLen = dataUrl.length;
    const approxBytes = Math.round(charLen * 0.75);
    console.log(`[GeminiScanner] Sampling frame sent to /api/gemini/detect-objects: ${Math.round(approxBytes / 1024)}KB`);

    let authHeader: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        authHeader['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // offline/fallback
    }

    const res = await fetch('/api/gemini/detect-objects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ image: dataUrl }),
      signal: options?.signal,
    });

    if (!res.ok) {
      console.warn(`[GeminiScanner] detect-objects returned HTTP ${res.status}`);
      throw new Error(`Detection HTTP ${res.status}`);
    }

    const data: LiveObjectDetectionResult = await res.json();
    if (data.detections && Array.isArray(data.detections)) {
      data.detections = data.detections.map((d: any) => {
        const norm = normalizeDetectionLabel(d.label, d.type);
        return {
          ...d,
          type: norm.type,
          label: norm.label,
        };
      });
    }
    console.log(`[GeminiScanner] Frame detection returned in ${Date.now() - startMs}ms: count=${data.detections?.length || 0}, goats=${data.count_goats}, sheep=${data.count_sheep}`);
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        detections: [],
        count_goats: 0,
        count_sheep: 0,
        multiple_targets: false,
        status_message: 'Kinansela ang pag-detect.',
      };
    }
    console.warn(`[GeminiScanner] Detection failed (${Date.now() - startMs}ms):`, err?.message);
    return {
      success: false,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      multiple_targets: false,
      status_message: 'Kumokonekta sa Gemini Vision...',
      error: err?.message,
    };
  } finally {
    isDetectingLive = false;
  }
}

/**
 * Scan Goat & Sheep with Google Gemini Multimodal Vision API
 * Calls secure backend POST /api/gemini/animal-scan. Never exposes API key to client.
 */
export async function scanAnimalWithGemini(
  input: HTMLCanvasElement | HTMLImageElement | string,
  options?: {
    context?: 'health_scan' | 'animal_add' | 'camera_live';
    animalId?: string;
    animalTag?: string;
    animalName?: string;
    farmId?: string;
    animalType?: 'goat' | 'sheep';
    targetBoundingBox?: BoundingBox;
  },
): Promise<GeminiScanResult> {
  const now = Date.now();
  if (isScanInProgress) {
    throw new Error('Kasalukuyan pang sini-scan ang nakaraang litrato. Maghintay sandali.');
  }
  if (now - lastScanTimestamp < MIN_SCAN_COOLDOWN_MS) {
    const waitMs = MIN_SCAN_COOLDOWN_MS - (now - lastScanTimestamp);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  isScanInProgress = true;
  lastScanTimestamp = Date.now();

  try {
    let scanInput = input;
    if (input instanceof HTMLCanvasElement && options?.targetBoundingBox) {
      scanInput = cropCanvasToBoundingBox(input, options.targetBoundingBox);
    }
    const optimizedDataUrl = await optimizeImageForAI(scanInput, 1280, 0.85);

    // Get current auth session token
    let authHeader: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        authHeader['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // Local or offline mode fallback
    }

    const res = await fetch('/api/gemini/animal-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({
        image: optimizedDataUrl,
        animalId: options?.animalId,
        animalTag: options?.animalTag,
        animalName: options?.animalName,
        farmId: options?.farmId,
        animalType: options?.animalType,
        context: options?.context || 'health_scan',
      }),
    });

    if (!res.ok) {
      let errMsg = `Server error (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.error) errMsg = errJson.error;
      } catch {
        // fallback
      }
      throw new Error(errMsg);
    }

    const apiData: GeminiAnimalScanResponse = await res.json();

    // Map into standard GeminiScanResult structure
    const isSheep = apiData.animal_type === 'sheep';
    const speciesLabel = apiData.animal_type === 'sheep' ? 'TUPA' : 'KAMBING';
    const healthStatusMapped: 'healthy' | 'monitor' | 'attention' =
      apiData.health_status === 'needs_attention' || apiData.health_status === 'needs_medication'
        ? 'attention'
        : apiData.health_status === 'monitor'
        ? 'monitor'
        : 'healthy';

    const obsList: string[] = Array.isArray(apiData.visual_observations) && apiData.visual_observations.length > 0
      ? apiData.visual_observations
      : Array.isArray(apiData.observations)
      ? apiData.observations.map((o: any) => typeof o === 'string' ? o : `${o.category} — ${o.finding}`)
      : [];

    const detectedAnimals: GeminiDetectedAnimal[] = apiData.detected
      ? [
          {
            id: 'animal-1',
            species: isSheep ? 'sheep' : 'goat',
            label: speciesLabel,
            boundingBox: options?.targetBoundingBox
              ? {
                  x: options.targetBoundingBox.x,
                  y: options.targetBoundingBox.y,
                  width: options.targetBoundingBox.width,
                  height: options.targetBoundingBox.height,
                  rawBox: [
                    Math.round(options.targetBoundingBox.y * 1000),
                    Math.round(options.targetBoundingBox.x * 1000),
                    Math.round((options.targetBoundingBox.y + options.targetBoundingBox.height) * 1000),
                    Math.round((options.targetBoundingBox.x + options.targetBoundingBox.width) * 1000),
                  ],
                }
              : {
                  x: 0.1,
                  y: 0.1,
                  width: 0.8,
                  height: 0.8,
                  rawBox: [100, 100, 900, 900],
                },
            bodyOrientation: 'nakatayo',
            visualObservations: obsList,
            possibleHealthConcerns: apiData.possible_concerns || [],
            needsManualCheck: apiData.needs_attention || apiData.needs_medication,
            healthStatus: healthStatusMapped,
          },
        ]
      : [];

    let overallMsg = apiData.recommendation;
    if (!apiData.detected) {
      if (apiData.reason === 'needs_better_image') {
        overallMsg = 'Hindi malinaw ang larawan. Ilapit at itutok ang camera sa buong hayop.';
      } else if (apiData.reason === 'multiple_animals') {
        overallMsg = 'Maraming hayop ang nakita. Mag-scan ng isang kambing o tupa lamang.';
      } else {
        overallMsg = 'Hindi kambing o tupa ang nakita. Ilapit ang camera sa isang kambing o tupa.';
      }
    }

    return {
      success: apiData.success,
      detected: apiData.detected,
      animalCount: detectedAnimals.length,
      animals: detectedAnimals,
      overallMessage: overallMsg,
      recommendation: apiData.recommendation,
      temperature: null,
      temperatureDisplay: 'Hindi nasukat',
      engine: 'gemini-vision-api',
      modelVersion: apiData.raw_model || 'gemini-2.5-flash',
      rawResponse: apiData,
    };
  } finally {
    isScanInProgress = false;
  }
}

/**
 * Backwards-compatible scan wrapper for existing code.
 * Routes safely through the serverless backend, guaranteeing zero fake temperature.
 */
export async function scanGoatTemperature(
  input: HTMLCanvasElement | string,
  options?: {
    animalType?: string;
    animalId?: string;
    farmContext?: any;
    apiKey?: string;
    notes?: string;
  },
): Promise<GeminiThermalResult> {
  try {
    const scanResult = await scanAnimalWithGemini(input, {
      context: 'health_scan',
      animalId: options?.animalId,
    });

    const primaryAnimal = scanResult.animals?.[0];
    const isSheep =
      primaryAnimal?.species === 'sheep' ||
      (options?.animalType && options.animalType.toLowerCase() === 'sheep');

    return {
      animalDetected: scanResult.detected,
      animalType: scanResult.detected ? (isSheep ? 'Sheep' : 'Goat') : 'Other',
      nonTargetClass: scanResult.detected ? null : 'Non-target / Walang hayop',
      detectionConfidence: scanResult.detected ? 0.95 : 0.1,
      estimatedTemperature: null, // Strictly null - no fake temperature
      temperatureStatus: null,
      temperatureDisplay: 'Hindi nasukat',
      temperatureConfidence: 0,
      thermalIndicators: [
        'Walang pisikal na thermometer sensor na ginamit. Hindi nasusukat ang tunay na temperatura sa ordinaryong camera.',
      ],
      healthRisk: primaryAnimal?.healthStatus === 'attention' ? 'high' : primaryAnimal?.healthStatus === 'monitor' ? 'moderate' : 'low',
      riskScore: primaryAnimal?.healthStatus === 'attention' ? 60 : primaryAnimal?.healthStatus === 'monitor' ? 30 : 10,
      possibleConditions: primaryAnimal?.possibleHealthConcerns || [],
      observations: primaryAnimal?.visualObservations || [scanResult.overallMessage],
      explanation: scanResult.overallMessage,
      recommendedActions: [scanResult.recommendation],
      engine: 'gemini-vision-api',
      modelVersion: scanResult.modelVersion,
      disclaimer:
        'Paunang visual screening lamang ito para sa tulong sa pagsubaybay. Hindi ito pinal na diagnosis ng beterinaryo at hindi sumusukat ng temperatura.',
      animals: scanResult.animals,
    };
  } catch (err: any) {
    return {
      animalDetected: false,
      animalType: 'Other',
      nonTargetClass: null,
      detectionConfidence: 0,
      estimatedTemperature: null,
      temperatureStatus: null,
      temperatureDisplay: 'Hindi nasukat',
      temperatureConfidence: 0,
      thermalIndicators: [],
      healthRisk: 'low',
      riskScore: 0,
      possibleConditions: [],
      observations: ['Hindi matagumpay ang pagsusuri: ' + (err?.message || 'Error')],
      explanation: err?.message || 'Hindi nakumpleto ang pagsusuri.',
      recommendedActions: ['I-scan muli ang hayop nang may maayos na liwanag.'],
      engine: 'gemini-vision-api',
      modelVersion: 'gemini-3.6-flash',
      disclaimer: 'Paunang visual screening lamang ito.',
      animals: [],
    };
  }
}

// ── Deprecated Frontend Key Handlers (Maintained for Type Safety) ────────────
export function getStoredGeminiApiKey(): string | null {
  return null; // Keys are securely managed on the server only
}

export function saveGeminiApiKey(_key: string): void {
  // No-op: API keys must remain strictly on the backend
}

export function hasGeminiApiKey(): boolean {
  return true; // Server-managed
}
