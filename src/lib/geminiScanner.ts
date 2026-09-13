/**
 * geminiScanner.ts — AlpasFarm Google Gemini AI Livestock Scanner
 *
 * Multimodal Visual AI Engine for Caprine (Goat) & Ovine (Sheep) detection:
 *   - Google Gemini Multimodal Vision via secure server-side endpoint (/api/ai/animal-scan)
 *   - Normalized 0..1 bounding boxes with high-precision visual overlays
 *   - Multiple animal identification (Goat #1, Goat #2, Sheep #1, etc.)
 *   - ZERO FAKE TEMPERATURE: Strictly null / "Hindi nasukat" (no RGB thermal guessing)
 *   - Secure: GEMINI_API_KEY is NEVER exposed to browser code
 */

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
  label: string; // e.g. "GOAT", "SHEEP", "GOAT #1", "SHEEP #2"
  boundingBox: AnimalBoundingBox;
  bodyOrientation: string; // e.g. "harap", "tagiliran", "likod", "nakatayo", "nakahiga"
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
const MIN_SCAN_COOLDOWN_MS = 1500; // 1.5s minimum debounce/cooldown

/**
 * Returns veterinary status details for a given temperature in Celsius.
 * If null/undefined, accurately indicates temperature was not measured.
 */
export function getTemperatureStatus(temp: number | null | undefined): TemperatureStatusDetail {
  if (temp === null || temp === undefined || isNaN(temp)) {
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

  if (temp >= 40.5) {
    return {
      status: 'fever',
      label: 'High Fever / Pyrexia',
      tagalogLabel: 'Mataas na Lagnat',
      color: '#DC2626',
      badgeBg: 'rgba(220, 38, 38, 0.12)',
      badgeBorder: 'rgba(220, 38, 38, 0.35)',
      description: `Mataas ang lagnat (${temp.toFixed(1)}°C). Senyales ng impeksyon o pulmonya. Kumonsulta agad sa beterinaryo.`,
    };
  }

  if (temp >= 39.8) {
    return {
      status: 'mild_elevation',
      label: 'Mild Elevation / Warm',
      tagalogLabel: 'Medyo Mainit / Heat Stress',
      color: '#D97706',
      badgeBg: 'rgba(217, 119, 6, 0.12)',
      badgeBorder: 'rgba(217, 119, 6, 0.35)',
      description: `Bahagyang mataas ang temperatura (${temp.toFixed(1)}°C). Palamigin ang silungan at bigyan ng sariwang tubig.`,
    };
  }

  if (temp < 38.0) {
    return {
      status: 'hypothermia',
      label: 'Sub-normal / Hypothermia',
      tagalogLabel: 'Mababa ang Temperatura',
      color: '#2563EB',
      badgeBg: 'rgba(37, 99, 235, 0.12)',
      badgeBorder: 'rgba(37, 99, 235, 0.35)',
      description: `Mababa ang temperatura (${temp.toFixed(1)}°C). Posibleng may shock o dehydration. Panatilihing tuyo at mainit.`,
    };
  }

  return {
    status: 'normal',
    label: 'Normal Body Temperature',
    tagalogLabel: 'Normal na Temperatura',
    color: '#238B45',
    badgeBg: 'rgba(35, 139, 69, 0.12)',
    badgeBorder: 'rgba(35, 139, 69, 0.35)',
    description: `Normal ang temperatura (${temp.toFixed(1)}°C). Pasok sa pamantayang baseline (38.5–39.7°C).`,
  };
}

/**
 * Resize and compress image to a maximum dimension of 1280px JPEG (~0.85 quality)
 * to ensure fast upload and optimal Gemini multimodal processing.
 */
export async function optimizeImageForAI(
  input: HTMLCanvasElement | HTMLImageElement | string,
  maxDimension = 1280,
  quality = 0.85,
): Promise<string> {
  if (typeof input === 'string' && input.startsWith('data:image/')) {
    // If it's already a data URL, check size or downscale via temporary Image
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= maxDimension && height <= maxDimension && input.length < 500000) {
          resolve(input);
          return;
        }

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(input);
        }
      };
      img.onerror = () => resolve(input);
      img.src = input;
    });
  }

  let srcCanvas: HTMLCanvasElement;
  if (input instanceof HTMLCanvasElement) {
    srcCanvas = input;
  } else if (input instanceof HTMLImageElement) {
    const c = document.createElement('canvas');
    c.width = input.naturalWidth || input.width;
    c.height = input.naturalHeight || input.height;
    const ctx = c.getContext('2d');
    if (ctx) ctx.drawImage(input, 0, 0);
    srcCanvas = c;
  } else {
    return String(input);
  }

  let width = srcCanvas.width;
  let height = srcCanvas.height;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = width;
    scaledCanvas.height = height;
    const ctx = scaledCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(srcCanvas, 0, 0, width, height);
      return scaledCanvas.toDataURL('image/jpeg', quality);
    }
  }

  return srcCanvas.toDataURL('image/jpeg', quality);
}

/**
 * Scan Goat & Sheep with Google Gemini Multimodal Vision
 * Calls backend POST /api/ai/animal-scan. Never exposes API key to client.
 */
export async function scanAnimalWithGemini(
  input: HTMLCanvasElement | HTMLImageElement | string,
  options?: {
    context?: 'health_scan' | 'animal_add' | 'camera_live';
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
    const optimizedDataUrl = await optimizeImageForAI(input, 1280, 0.85);

    const res = await fetch('/api/ai/animal-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: optimizedDataUrl,
        context: options?.context || 'health_scan',
      }),
    });

    if (!res.ok) {
      let errMsg = `Server error (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.error) errMsg = errJson.error;
      } catch {
        // use fallback
      }
      throw new Error(errMsg);
    }

    const data: GeminiScanResult = await res.json();
    return data;
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
    const scanResult = await scanAnimalWithGemini(input, { context: 'health_scan' });

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
      healthRisk: primaryAnimal?.healthStatus === 'attention' ? 'moderate' : 'low',
      riskScore: primaryAnimal?.healthStatus === 'attention' ? 45 : 10,
      possibleConditions: primaryAnimal?.possibleHealthConcerns || [],
      observations: primaryAnimal?.visualObservations || [scanResult.overallMessage],
      explanation: scanResult.overallMessage,
      recommendedActions: [scanResult.recommendation],
      engine: scanResult.engine || 'google-gemini-multimodal',
      modelVersion: scanResult.modelVersion || 'gemini-2.0-flash',
      disclaimer:
        'Paunang visual screening lamang ito para sa tulong sa pagsubaybay. Hindi ito pinal na diagnosis ng beterinaryo at hindi sumusukat ng temperatura.',
      animals: scanResult.animals,
    };
  } catch (err: any) {
    // If /api/ai/animal-scan fails, fallback safely
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
      engine: 'google-gemini-multimodal',
      modelVersion: 'gemini-2.0-flash',
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
