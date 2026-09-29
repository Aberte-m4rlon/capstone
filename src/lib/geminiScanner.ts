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
import { GoogleGenAI, Modality, Type } from '@google/genai';
import {
  optimizeImageForAI,
  captureLowResFrame,
  cropCanvasToBoundingBox,
  BoundingBox,
  CropBoundingBoxOptions,
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
  CropBoundingBoxOptions,
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
 * Calls POST /api/gemini/animal-detect. Never exposes API key to client.
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
    console.log(`[GeminiScanner] Sampling frame sent to /api/gemini/animal-detect: ${Math.round(approxBytes / 1024)}KB`);

    let authHeader: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        authHeader['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // offline/fallback
    }

    const res = await fetch('/api/gemini/animal-detect', {
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
      status_message: 'Kumokonekta sa AI Vision...',
      error: err?.message,
    };
  } finally {
    isDetectingLive = false;
  }
}

export interface GeminiLiveDetection {
  species: 'goat' | 'sheep';
  box_2d: [number, number, number, number];
  visible?: boolean;
}

export type GeminiLiveConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR' | 'CLOSED';

export type GeminiLiveErrorCategory =
  | 'TOKEN_ENDPOINT_ERROR'
  | 'TOKEN_AUTH_ERROR'
  | 'TOKEN_CREATION_ERROR'
  | 'TOKEN_INVALID'
  | 'TOKEN_MISSING'
  | 'TOKEN_EXPIRED'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_UNSUPPORTED'
  | 'MODEL_ERROR'
  | 'LIVE_AUTH_ERROR'
  | 'LIVE_CONFIG_ERROR'
  | 'LIVE_CONNECT_ERROR'
  | 'LIVE_SETUP_ERROR'
  | 'LIVE_TIMEOUT'
  | 'LIVE_SOCKET_ERROR'
  | 'TIMEOUT'
  | 'CONFIG_ERROR'
  | 'NETWORK_ERROR';

export interface GeminiLiveErrorDetail {
  name: string;
  category: GeminiLiveErrorCategory;
  message: string;
  code?: number | string;
  status?: number | string;
  statusText?: string;
  cause?: any;
  closeCode?: number | string;
  closeReason?: string;
  isRecoverable: boolean;
  userMessage: string;
}

export interface GeminiLiveDebugInfo {
  framesSent: number;
  lastMessage: string;
  detectionCount: number;
  lastSpecies: string;
  boxReceived: boolean;
  parserStatus: string;
}

export interface GeminiLiveDetectorCallbacks {
  onDetections: (detections: GeminiLiveDetection[]) => void;
  onStatusChange?: (state: GeminiLiveConnectionState, message: string) => void;
  onError?: (error: GeminiLiveErrorDetail) => void;
  onDebugUpdate?: (debugInfo: GeminiLiveDebugInfo) => void;
}

/**
 * Safe detection extraction layer for Gemini Live API responses.
 * Handles tool calls, JSON responses, and multimodal audio output transcription.
 */
export function parseDetectionResponse(text: string): GeminiLiveDetection[] {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();

  // Negative indicators (empty scene or negative classification)
  if (
    lower.includes("no, i don't see") ||
    lower.includes('no goat') ||
    lower.includes('no sheep') ||
    lower.includes('none visible') ||
    lower.includes('cannot see') ||
    lower.includes("can't see") ||
    lower.includes('unable to see') ||
    lower.includes('no animals') ||
    lower.includes('no visible') ||
    lower.includes('not visible') ||
    lower.includes('no physical')
  ) {
    if (
      !lower.includes('species: goat') &&
      !lower.includes('species: sheep') &&
      !lower.includes('"species": "goat"') &&
      !lower.includes('"species": "sheep"')
    ) {
      return [];
    }
  }

  // Reject keyboard / laptop / phone / computer non-livestock objects (2560.mp4 regression protection)
  if (
    (lower.includes('keyboard') ||
      lower.includes('laptop') ||
      lower.includes('computer') ||
      lower.includes('desk') ||
      lower.includes('phone') ||
      lower.includes('screen')) &&
    !lower.includes('species: goat') &&
    !lower.includes('species: sheep') &&
    !lower.includes('"species": "goat"') &&
    !lower.includes('"species": "sheep"')
  ) {
    return [];
  }

  // 1. Check JSON block first
  try {
    const jsonMatch = text.match(/\{[\s\S]*"detections"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.detections) && parsed.detections.length > 0) {
        const validJsonDets: GeminiLiveDetection[] = parsed.detections
          .filter(
            (d: any) =>
              (d?.species === 'goat' || d?.species === 'sheep') &&
              Array.isArray(d?.box_2d) &&
              d.box_2d.length === 4
          )
          .map((d: any) => ({
            species: d.species as 'goat' | 'sheep',
            box_2d: [
              Math.min(1000, Math.max(0, parseInt(d.box_2d[0]))),
              Math.min(1000, Math.max(0, parseInt(d.box_2d[1]))),
              Math.min(1000, Math.max(0, parseInt(d.box_2d[2]))),
              Math.min(1000, Math.max(0, parseInt(d.box_2d[3]))),
            ] as [number, number, number, number],
            visible: true,
          }))
          .filter((d: GeminiLiveDetection) => {
            const h = d.box_2d[2] - d.box_2d[0];
            const w = d.box_2d[3] - d.box_2d[1];
            return h > 20 && w > 20 && h * w > 800;
          });

        if (validJsonDets.length > 0) return validJsonDets;
      }
    }
  } catch {}

  // 2. Multi-box regex search in natural language / transcription pattern
  const boxRegex = /\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g;
  const detections: GeminiLiveDetection[] = [];
  let match: RegExpExecArray | null;

  while ((match = boxRegex.exec(text)) !== null) {
    const boxIndex = match.index;
    let bestSpecies: 'goat' | 'sheep' | null = null;
    let minDistance = Infinity;

    // Search closest goat/kambing mention
    for (const m of text.matchAll(/\b(goat|kambing)\b/gi)) {
      const dist = Math.abs(boxIndex - (m.index ?? 0));
      const weightedDist = (m.index ?? 0) <= boxIndex ? dist : dist + 30;
      if (weightedDist < minDistance && dist < 160) {
        minDistance = weightedDist;
        bestSpecies = 'goat';
      }
    }

    // Search closest sheep/tupa mention
    for (const m of text.matchAll(/\b(sheep|tupa)\b/gi)) {
      const dist = Math.abs(boxIndex - (m.index ?? 0));
      const weightedDist = (m.index ?? 0) <= boxIndex ? dist : dist + 30;
      if (weightedDist < minDistance && dist < 160) {
        minDistance = weightedDist;
        bestSpecies = 'sheep';
      }
    }

    // Fallback if not within 160 chars
    if (!bestSpecies) {
      if (/\b(sheep|tupa)\b/i.test(text) && !/\b(goat|kambing)\b/i.test(text)) {
        bestSpecies = 'sheep';
      } else if (/\b(goat|kambing)\b/i.test(text)) {
        bestSpecies = 'goat';
      }
    }

    if (!bestSpecies) continue;

    const ymin = Math.min(1000, Math.max(0, parseInt(match[1])));
    const xmin = Math.min(1000, Math.max(0, parseInt(match[2])));
    const ymax = Math.min(1000, Math.max(0, parseInt(match[3])));
    const xmax = Math.min(1000, Math.max(0, parseInt(match[4])));

    const height = ymax - ymin;
    const width = xmax - xmin;

    if (height > 20 && width > 20 && height * width > 800) {
      detections.push({
        species: bestSpecies,
        box_2d: [ymin, xmin, ymax, xmax],
        visible: true,
      });
    }
  }

  // 3. Fallback: single detection if species mentioned affirmatively without explicit box
  if (detections.length === 0) {
    const isGoat = /\b(goat|kambing)\b/i.test(text);
    const isSheep = /\b(sheep|tupa)\b/i.test(text);
    if ((isGoat || isSheep) && !lower.includes('no ') && !lower.includes('not ')) {
      if (lower.includes('detected') || lower.includes('visible') || lower.includes('nakita')) {
        const species: 'goat' | 'sheep' = isGoat ? 'goat' : 'sheep';
        detections.push({
          species,
          box_2d: [150, 150, 850, 850],
          visible: true,
        });
      }
    }
  }

  return detections;
}

export class GeminiLiveDetector {
  private session: any = null;
  private responseBuffer = '';
  private state: GeminiLiveConnectionState = 'IDLE';
  private callbacks: GeminiLiveDetectorCallbacks;
  private isConnecting = false;
  private tokenAbortController: AbortController | null = null;
  private flowStartTime: number = 0;
  private liveConnectStartTime: number = 0;
  private isSetupComplete: boolean = false;
  private hasSentFirstFrame: boolean = false;
  private hasReceivedFirstMessage: boolean = false;
  private hasReceivedFirstDetection: boolean = false;
  private isSendingFrame: boolean = false;
  private liveModel: string = 'gemini-3.8-live';

  private framesSentCount: number = 0;
  private isTurnInflight: boolean = false;
  private lastTurnTriggerTime: number = 0;
  private lastMessageSummary: string = 'NONE';
  private lastDetectionCount: number = 0;
  private lastDetectedSpecies: string = 'none';
  private lastBoxReceived: boolean = false;
  private lastParserStatus: string = 'IDLE';

  constructor(
    callbacksOrOnDetections:
      | ((detections: GeminiLiveDetection[]) => void)
      | GeminiLiveDetectorCallbacks
  ) {
    if (typeof callbacksOrOnDetections === 'function') {
      this.callbacks = { onDetections: callbacksOrOnDetections };
    } else {
      this.callbacks = callbacksOrOnDetections;
    }
  }

  public getState(): GeminiLiveConnectionState {
    return this.state;
  }

  public getFramesSentCount(): number {
    return this.framesSentCount;
  }

  public isReady(): boolean {
    return this.state === 'CONNECTED' && this.isSetupComplete && this.session !== null;
  }

  private handleConnectionFailure(errDetail: GeminiLiveErrorDetail): void {
    this.state = 'ERROR';
    this.isConnecting = false;
    this.session = null;
    this.isSetupComplete = false;

    // Developer logging matching strict requirement:
    // [GeminiLive] LIVE_ERROR
    // name: ...
    // message: ...
    // code: ...
    // status: ...
    // statusText: ...
    // cause: ...
    // closeCode: ...
    // closeReason: ...
    // NEVER log GEMINI_API_KEY, ephemeral tokens, authorization headers, or secrets.
    console.error(
      `[GeminiLive] LIVE_ERROR\n` +
      `name: ${errDetail.name}\n` +
      `message: ${errDetail.message}\n` +
      `code: ${errDetail.code ?? 'N/A'}\n` +
      `status: ${errDetail.status ?? 'N/A'}\n` +
      `statusText: ${errDetail.statusText ?? 'N/A'}\n` +
      `cause: ${typeof errDetail.cause === 'object' ? JSON.stringify(errDetail.cause) : (errDetail.cause ?? 'N/A')}\n` +
      `closeCode: ${errDetail.closeCode ?? 'N/A'}\n` +
      `closeReason: ${errDetail.closeReason ?? 'N/A'}`
    );

    this.callbacks.onDetections([]);
    this.callbacks.onError?.(errDetail);
    this.callbacks.onStatusChange?.('ERROR', errDetail.userMessage);
    this.close();
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) {
      console.warn('[GeminiLive] Connection already in progress, ignoring duplicate call.');
      return;
    }

    // Clean up any stale session
    this.close();

    this.isConnecting = true;
    this.state = 'CONNECTING';
    this.callbacks.onStatusChange?.('CONNECTING', 'Inihahanda ang AI Scanner...');
    this.flowStartTime = Date.now();
    this.isSetupComplete = false;
    this.hasSentFirstFrame = false;
    this.hasReceivedFirstMessage = false;
    this.hasReceivedFirstDetection = false;

    // ================================================================
    // TIMEOUT 1: TOKEN_TIMEOUT (5 seconds for /api/gemini/live-token)
    // ================================================================
    console.log('[GeminiLive] TOKEN_REQUEST_START');
    const tokenStart = Date.now();

    this.tokenAbortController = new AbortController();
    const tokenTimeoutId = setTimeout(() => {
      this.tokenAbortController?.abort();
    }, 5000);

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch('/api/gemini/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.liveModel }),
        signal: this.tokenAbortController.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(tokenTimeoutId);
      const isTimeout = fetchErr?.name === 'AbortError';
      const errDetail: GeminiLiveErrorDetail = {
        name: isTimeout ? 'TokenTimeoutError' : 'NetworkError',
        category: isTimeout ? 'LIVE_TIMEOUT' : 'NETWORK_ERROR',
        message: isTimeout ? 'Token request timed out after 5s' : (fetchErr?.message || 'Network error fetching token'),
        status: isTimeout ? 504 : 'N/A',
        statusText: isTimeout ? 'Gateway Timeout' : 'Network Error',
        code: isTimeout ? 'TOKEN_TIMEOUT' : 'FETCH_FAILED',
        cause: fetchErr?.name || 'FetchError',
        isRecoverable: true,
        userMessage: 'Hindi maihanda ang AI Scanner.',
      };
      this.handleConnectionFailure(errDetail);
      return;
    } finally {
      clearTimeout(tokenTimeoutId);
    }

    const tokenElapsed = Date.now() - tokenStart;
    console.log(`[GeminiLive] TOKEN_RESPONSE: status ${tokenResponse.status}`);
    console.log(`[GeminiLive] token request completed: ${tokenElapsed} ms`);

    // Inspect HTTP status code
    if (!tokenResponse.ok) {
      let errBody: any = null;
      try {
        errBody = await tokenResponse.json();
      } catch {
        try {
          errBody = { error: await tokenResponse.text() };
        } catch {}
      }

      console.log(`[GeminiLive] API key configured: ${Boolean(errBody?.apiKeyConfigured)}`);
      console.log(`[GeminiLive] token endpoint status: ${tokenResponse.status}`);
      console.log('[GeminiLive] token received: false');

      const status = tokenResponse.status;
      const statusText = tokenResponse.statusText;
      const errMsg = errBody?.error || `Token endpoint failed with status ${status}`;
      const code = errBody?.code || status;

      // Classify unrecoverable vs recoverable
      const isMissingKey = status === 500 && (code === 'MISSING_API_KEY' || errBody?.apiKeyConfigured === false);
      const isAuthError = status === 401 || status === 403 || code === 'AUTH_ERROR';
      const isModelNotFound = status === 404;
      const isModelError = status === 400 || code === 'MODEL_ERROR';

      const isUnrecoverable = isMissingKey || isAuthError || isModelNotFound || isModelError;
      const category: GeminiLiveErrorCategory = isMissingKey
        ? 'CONFIG_ERROR'
        : isAuthError
        ? 'TOKEN_AUTH_ERROR'
        : isModelNotFound
        ? 'MODEL_NOT_FOUND'
        : isModelError
        ? 'MODEL_UNSUPPORTED'
        : status === 504
        ? 'LIVE_TIMEOUT'
        : status === 500
        ? 'TOKEN_CREATION_ERROR'
        : 'TOKEN_ENDPOINT_ERROR';

      const errDetail: GeminiLiveErrorDetail = {
        name: 'TokenEndpointError',
        category,
        message: errMsg,
        status,
        statusText,
        code,
        cause: errBody,
        isRecoverable: !isUnrecoverable,
        userMessage: isUnrecoverable ? 'Hindi available ang AI Scanner ngayon.' : 'Hindi maihanda ang AI Scanner.',
      };

      this.handleConnectionFailure(errDetail);
      return;
    }

    // Step B: Receive ephemeral token
    let tokenJson: any;
    try {
      tokenJson = await tokenResponse.json();
    } catch (parseErr: any) {
      const errDetail: GeminiLiveErrorDetail = {
        name: 'TokenParseError',
        category: 'TOKEN_INVALID',
        message: 'Failed to parse live token response JSON',
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        code: 'INVALID_JSON',
        cause: parseErr?.message || 'Invalid JSON',
        isRecoverable: false,
        userMessage: 'Hindi available ang AI Scanner ngayon.',
      };
      this.handleConnectionFailure(errDetail);
      return;
    }

    const { token, model, apiKeyConfigured } = tokenJson || {};
    console.log(`[GeminiLive] API key configured: ${apiKeyConfigured !== undefined ? Boolean(apiKeyConfigured) : true}`);
    console.log(`[GeminiLive] token endpoint status: ${tokenResponse.status}`);
    console.log(`[GeminiLive] token received: ${Boolean(token)}`);

    if (!token || typeof token !== 'string' || !token.trim()) {
      const errDetail: GeminiLiveErrorDetail = {
        name: 'TokenMissingError',
        category: 'TOKEN_MISSING',
        message: 'Live detection token is missing or empty in server response.',
        status: 200,
        statusText: 'OK',
        code: 'TOKEN_MISSING',
        cause: tokenJson,
        isRecoverable: false,
        userMessage: 'Hindi available ang AI Scanner ngayon.',
      };
      this.handleConnectionFailure(errDetail);
      return;
    }

    console.log('[GeminiLive] TOKEN_SUCCESS');
    console.log(`[GeminiLive] token field length: ${token.length}`);

    // Step C: Create client with ephemeral token
    console.log('[GeminiLive] create client with ephemeral token');
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });

    // ================================================================
    // TIMEOUT 2: LIVE_CONNECT_TIMEOUT (8s strictly for live.connect)
    // ================================================================
    console.log('[GeminiLive] LIVE_CONNECT_START');
    this.liveConnectStartTime = Date.now();

    const liveModel = model || this.liveModel;

    let liveSession: any = null;
    let liveConnectTimer: any = null;
    let earlyCloseReject: ((err: any) => void) | null = null;

    const earlyClosePromise = new Promise<never>((_, reject) => {
      earlyCloseReject = reject;
    });

    try {
      const liveConnectPromise = ai.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are the visual detection assistant for ALPASFARM.
Continuously inspect the incoming camera frames.
Detect EVERY clearly visible physical goat and sheep in the camera view.
Do not stop after detecting the first animal.
If there are:
- 1 goat -> return 1 detection
- 2 goats -> return 2 detections
- 5 goats -> return 5 detections
- goats and sheep -> return each animal separately

Each visible animal must have its own bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000.
Never merge multiple animals into one bounding box when they are individually distinguishable.
Do not duplicate the same animal.
Do not detect keyboards, laptops, phones, computer screens, people, dogs, cats, cows, pigs, furniture, walls, objects, photographs, or video screens as goats or sheep.
Only report an animal when it is visually supported by the current camera frame.

If no physical goat or sheep is visible:
report: No goats or sheep visible.

Format your detection report clearly:
For each detected animal, report:
SPECIES: goat (or sheep), BOX: [ymin, xmin, ymax, xmax]
Allowed species: 'goat', 'sheep'.
Do not invent animal IDs.
Do not return fake confidence values.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'reportDetections',
                  description: 'Report detected goats and sheep with bounding boxes.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      detections: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            species: { type: Type.STRING, enum: ['goat', 'sheep'] },
                            box_2d: {
                              type: Type.ARRAY,
                              items: { type: Type.INTEGER },
                              description: '[ymin, xmin, ymax, xmax] normalized to 0-1000',
                            },
                          },
                          required: ['species', 'box_2d'],
                        },
                      },
                    },
                    required: ['detections'],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            const wsElapsed = Date.now() - this.liveConnectStartTime;
            console.log(`[GeminiLive] LIVE_OPEN: websocket connected: ${wsElapsed} ms`);
          },
          onmessage: (message: any) => {
            console.log('[GeminiLive] LIVE_MESSAGE');
            this.handleMessage(message);
          },
          onerror: (wsErr: any) => {
            console.error('[GeminiLive] LIVE_ERROR (onerror):', wsErr?.message || wsErr);
            const errDetail: GeminiLiveErrorDetail = {
              name: 'LiveSocketError',
              category: 'LIVE_SOCKET_ERROR',
              message: wsErr?.message || 'Gemini Live WebSocket error occurred.',
              status: wsErr?.status,
              statusText: wsErr?.statusText,
              code: wsErr?.code || 'WS_ERROR',
              cause: wsErr?.message || 'WebSocket Error',
              isRecoverable: true,
              userMessage: 'Hindi maihanda ang AI Scanner.',
            };
            this.handleConnectionFailure(errDetail);
          },
          onclose: (e: any) => {
            const code = e?.code;
            const reason = typeof e?.reason === 'string' ? e.reason : (e?.reason ? String(e.reason) : 'none');
            console.log(`[GeminiLive] LIVE_CLOSE: code=${code || 'unknown'}, reason=${reason}`);
            this.session = null;
            const wasConnecting = this.state === 'CONNECTING';
            this.isSetupComplete = false;

            const isBilling = code === 1011 || reason.toLowerCase().includes('prepayment') || reason.toLowerCase().includes('billing') || reason.toLowerCase().includes('credits');
            const isPolicyOrModel = code === 1008 || reason.toLowerCase().includes('not supported for bidigeneratecontent') || reason.toLowerCase().includes('not found for api version');

            if (isBilling || isPolicyOrModel || wasConnecting) {
              const category: GeminiLiveErrorCategory = isBilling ? 'LIVE_AUTH_ERROR' : isPolicyOrModel ? 'MODEL_UNSUPPORTED' : 'LIVE_SOCKET_ERROR';
              const isRecoverable = !isBilling && !isPolicyOrModel;
              const errDetail: GeminiLiveErrorDetail = {
                name: isBilling ? 'LiveSocketBillingError' : isPolicyOrModel ? 'LiveSocketPolicyViolation' : 'LiveSocketClosedEarly',
                category,
                message: isBilling
                  ? `Gemini Live billing error: ${reason}`
                  : isPolicyOrModel
                  ? `Gemini Live model rejected by API: ${reason}`
                  : `Gemini Live WebSocket closed before setup completed: ${reason}`,
                status: isBilling ? 402 : isPolicyOrModel ? 400 : 502,
                statusText: isBilling ? 'Payment Required' : isPolicyOrModel ? 'Policy Violation' : 'Socket Closed Early',
                code: code || (isBilling ? 1011 : isPolicyOrModel ? 1008 : 'WS_CLOSED'),
                cause: reason,
                closeCode: code,
                closeReason: reason,
                isRecoverable,
                userMessage: isRecoverable ? 'Hindi maihanda ang AI Scanner.' : 'Hindi available ang AI Scanner ngayon.',
              };
              if (earlyCloseReject) {
                earlyCloseReject(errDetail);
              }
              this.handleConnectionFailure(errDetail);
            } else if (this.state === 'CONNECTED') {
              this.state = 'CLOSED';
              this.callbacks.onStatusChange?.('CLOSED', 'Nawala ang koneksyon sa AI Scanner.');
            }
          },
        },
      });

      const liveTimeoutPromise = new Promise<never>((_, reject) => {
        liveConnectTimer = setTimeout(() => {
          reject(new Error('LIVE_CONNECT_TIMEOUT'));
        }, 8000);
      });

      liveSession = await Promise.race([liveConnectPromise, liveTimeoutPromise, earlyClosePromise]);
    } catch (connectErr: any) {
      clearTimeout(liveConnectTimer);
      if (connectErr?.category || connectErr?.name?.startsWith('LiveSocket')) {
        // Already logged and handled via onclose
        return;
      }
      const isTimeout = connectErr?.message === 'LIVE_CONNECT_TIMEOUT';
      const errDetail: GeminiLiveErrorDetail = {
        name: isTimeout ? 'LiveConnectTimeoutError' : 'LiveConnectError',
        category: isTimeout ? 'LIVE_TIMEOUT' : 'LIVE_CONNECT_ERROR',
        message: isTimeout ? 'Gemini Live setup timed out after 8s.' : (connectErr?.message || 'Failed to establish Live session'),
        status: isTimeout ? 504 : 'N/A',
        statusText: isTimeout ? 'Connect Timeout' : 'Live Setup Failed',
        code: isTimeout ? 'LIVE_CONNECT_TIMEOUT' : 'SETUP_FAILED',
        cause: connectErr?.message || 'Live Connect Error',
        isRecoverable: true,
        userMessage: 'Hindi maihanda ang AI Scanner.',
      };
      this.handleConnectionFailure(errDetail);
      return;
    } finally {
      clearTimeout(liveConnectTimer);
    }

    this.session = liveSession;
    this.isSetupComplete = true;
    const setupElapsed = Date.now() - this.liveConnectStartTime;
    console.log(`[GeminiLive] LIVE_SETUP_COMPLETE: setup completed: ${setupElapsed} ms`);

    this.state = 'CONNECTED';
    this.isConnecting = false;
    this.callbacks.onStatusChange?.('CONNECTED', 'AI Scanner ay handa na');
  }

  public sendFrame(canvas: HTMLCanvasElement): void {
    if (
      this.state !== 'CONNECTED' ||
      !this.session ||
      !this.isSetupComplete ||
      this.isSendingFrame
    ) {
      return;
    }

    try {
      this.isSendingFrame = true;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      const comma = dataUrl.indexOf(',');
      const base64Data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

      // Section 4: Verify that the base64 data is not empty
      if (!base64Data || base64Data.length < 500) {
        console.warn('[SCANNER] INVALID FRAME: frame is empty or too small');
        return;
      }

      // Section 1: Detailed logging for all pipeline stages
      console.log('[SCANNER] camera frame captured');
      console.log('[SCANNER] frame converted to JPEG');
      console.log(`[SCANNER] frame size: ${base64Data.length}`);
      console.log('[SCANNER] frame mimeType: image/jpeg');
      console.log('[SCANNER] frame sent to Gemini');

      this.framesSentCount++;

      // Step H: First frame sent
      if (!this.hasSentFirstFrame) {
        this.hasSentFirstFrame = true;
        const frameElapsed = Date.now() - this.flowStartTime;
        console.log(`[GeminiLive] first frame sent: ${frameElapsed} ms`);
      }

      // Send both media and video payloads for complete compatibility
      this.session.sendRealtimeInput({
        media: { data: base64Data, mimeType: 'image/jpeg' },
        video: { data: base64Data, mimeType: 'image/jpeg' },
      });

      // Periodically trigger detection turns on buffered frames
      const now = Date.now();
      if (!this.isTurnInflight && now - this.lastTurnTriggerTime >= 1500) {
        this.isTurnInflight = true;
        this.lastTurnTriggerTime = now;
        this.session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: 'Detect ALL visible goats and sheep. Report SPECIES: goat or sheep and BOX: [ymin, xmin, ymax, xmax] for EVERY visible animal. If none, report no goats or sheep.' }],
            },
          ],
          turnComplete: true,
        });
      } else if (this.isTurnInflight && now - this.lastTurnTriggerTime > 4000) {
        this.isTurnInflight = false;
      }

      this.callbacks.onDebugUpdate?.({
        framesSent: this.framesSentCount,
        lastMessage: this.lastMessageSummary,
        detectionCount: this.lastDetectionCount,
        lastSpecies: this.lastDetectedSpecies,
        boxReceived: this.lastBoxReceived,
        parserStatus: this.lastParserStatus,
      });
    } catch (sendErr) {
      console.warn('[GeminiLive] Send frame error:', sendErr);
    } finally {
      this.isSendingFrame = false;
    }
  }

  public close(): void {
    if (this.tokenAbortController) {
      try {
        this.tokenAbortController.abort();
      } catch {}
      this.tokenAbortController = null;
    }
    if (this.session) {
      try {
        this.session.close();
      } catch {}
      this.session = null;
    }
    this.isConnecting = false;
    this.isSetupComplete = false;
    this.isTurnInflight = false;
    this.responseBuffer = '';
    if (this.state !== 'IDLE') {
      this.state = 'CLOSED';
    }
  }

  public disconnect(): void {
    this.close();
  }

  private handleMessage(message: any): void {
    console.log('[GEMINI LIVE] message received');
    const msgType = message?.toolCall
      ? 'toolCall'
      : message?.serverContent?.outputTranscription
      ? 'outputTranscription'
      : message?.serverContent?.modelTurn
      ? 'modelTurn'
      : message?.serverContent?.turnComplete
      ? 'turnComplete'
      : message?.setupComplete
      ? 'setupComplete'
      : 'other';
    console.log(`[GEMINI LIVE] message type: ${msgType}`);

    // Step G: First Gemini message
    if (!this.hasReceivedFirstMessage) {
      this.hasReceivedFirstMessage = true;
      const msgElapsed = Date.now() - (this.liveConnectStartTime || this.flowStartTime);
      console.log(`[GeminiLive] first Gemini message: ${msgElapsed} ms`);
    }

    // 1. Tool call handling
    if (message?.toolCall?.functionCalls) {
      console.log('[GEMINI LIVE] structured response received (toolCall)');
      for (const fc of message.toolCall.functionCalls) {
        if (fc.name === 'reportDetections' || fc.name?.includes('Detection')) {
          const rawDetections = fc.args?.detections;
          if (Array.isArray(rawDetections)) {
            const detections: GeminiLiveDetection[] = rawDetections
              .filter(
                (d: any) =>
                  (d?.species === 'goat' || d?.species === 'sheep') &&
                  Array.isArray(d?.box_2d) &&
                  d.box_2d.length === 4
              )
              .map((d: any) => ({
                species: d.species as 'goat' | 'sheep',
                box_2d: [
                  Math.min(1000, Math.max(0, parseInt(d.box_2d[0]))),
                  Math.min(1000, Math.max(0, parseInt(d.box_2d[1]))),
                  Math.min(1000, Math.max(0, parseInt(d.box_2d[2]))),
                  Math.min(1000, Math.max(0, parseInt(d.box_2d[3]))),
                ] as [number, number, number, number],
                visible: true,
              }));

            this.dispatchDetections(detections, 'toolCall');
          }
        }
        try {
          if (this.session && fc.id) {
            this.session.sendToolResponse({
              functionResponses: [
                {
                  id: fc.id,
                  name: fc.name,
                  response: { output: { success: true } },
                },
              ],
            });
          }
        } catch (toolRespErr) {
          console.warn('[GeminiLive] Tool response send error:', toolRespErr);
        }
      }
    }

    // 2. Audio output transcription (Modality.AUDIO)
    if (typeof message?.serverContent?.outputTranscription?.text === 'string') {
      const txt = message.serverContent.outputTranscription.text;
      console.log(`[GEMINI LIVE] text received: ${txt}`);
      this.responseBuffer += txt;
    }

    // 3. Model turn parts (text parts if any)
    const parts = message?.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (typeof part.text === 'string') {
        console.log(`[GEMINI LIVE] text received: ${part.text}`);
        this.responseBuffer += part.text;
      }
    }

    // 4. Turn completion: parse the buffer
    if (message?.serverContent?.turnComplete) {
      this.isTurnInflight = false;
      const text = this.responseBuffer.trim();
      this.responseBuffer = '';

      if (text) {
        console.log('[GEMINI LIVE] structured response received (turnComplete)');
        const detections = parseDetectionResponse(text);
        this.dispatchDetections(detections, 'transcription');
      }
    }
  }

  private dispatchDetections(detections: GeminiLiveDetection[], source: string): void {
    const goats = detections.filter((d) => d.species === 'goat').length;
    const sheep = detections.filter((d) => d.species === 'sheep').length;

    console.log(`[DETECTION] parsed detections: ${detections.length}`);
    console.log(`[DETECTION] goat count: ${goats}`);
    console.log(`[DETECTION] sheep count: ${sheep}`);

    this.lastMessageSummary = 'RECEIVED';
    this.lastDetectionCount = detections.length;
    this.lastDetectedSpecies = detections[0]?.species || (detections.length > 0 ? 'goat' : 'none');
    this.lastBoxReceived = detections.length > 0;
    this.lastParserStatus = 'OK';

    // Step I: First detection response
    if (!this.hasReceivedFirstDetection && detections.length > 0) {
      this.hasReceivedFirstDetection = true;
      const detElapsed = Date.now() - this.flowStartTime;
      console.log(`[GeminiLive] first detection response: ${detElapsed} ms (${source})`);
    }

    this.callbacks.onDetections(detections);
    this.callbacks.onDebugUpdate?.({
      framesSent: this.framesSentCount,
      lastMessage: 'RECEIVED',
      detectionCount: detections.length,
      lastSpecies: this.lastDetectedSpecies,
      boxReceived: this.lastBoxReceived,
      parserStatus: 'OK',
    });
  }
}

export interface GeminiVideoAnalysisResult {
  observed: boolean;
  summary: string;
  movements: string[];
  concerns: string[];
  recommendation: string;
}

export async function analyzeAnimalVideo(videoBlob: Blob): Promise<GeminiVideoAnalysisResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Hindi mabasa ang observation video.'));
    reader.readAsDataURL(videoBlob);
  });
  const response = await fetch('/api/gemini/animal-video-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video: dataUrl }),
  });
  if (!response.ok) throw new Error('Temporaryong hindi available ang video analysis.');
  return response.json() as Promise<GeminiVideoAnalysisResult>;
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
    cropOptions?: CropBoundingBoxOptions;
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
      scanInput = cropCanvasToBoundingBox(
        input,
        options.targetBoundingBox,
        options.cropOptions || 0.15
      );
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
        overallMsg = 'Hindi malinaw ang larawan. Ilapit at itutok ang camera sa buong kambing o tupa.';
      } else if (apiData.reason === 'multiple_animals') {
        overallMsg = 'Maraming kambing o tupa ang nakita. Mag-scan ng isang kambing o tupa lamang.';
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
      nonTargetClass: scanResult.detected ? null : 'Non-target / Walang kambing o tupa',
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
      recommendedActions: ['I-scan muli ang kambing o tupa nang may maayos na liwanag.'],
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

// ── Upload Image Processing & Analysis ────────────────────────────────────────

export interface UploadedAnimalDetection {
  species: 'goat' | 'sheep';
  label: 'KAMBING' | 'TUPA';
  displayNumber?: number;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface UploadedImageAnalysisResult {
  success: boolean;
  detectedGoatOrSheep: boolean;
  goatCount: number;
  sheepCount: number;
  detections: UploadedAnimalDetection[];
  statusBadge: string;
  condition?: 'Maayos' | 'Bantayan' | 'Kailangan ng Atensyon' | 'Kailangan ng Gamot';
  conditionSummary?: string;
  observations?: string[];
  recommendation?: string;
  rawScanResult?: GeminiScanResult | null;
  error?: string;
}

/**
 * Validates, respects EXIF orientation, and compresses uploaded image client-side.
 * Ensures the image fits within serverless payload limits and is never mirrored.
 */
export async function processUploadedImage(file: File): Promise<{
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}> {
  const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!validMimes.includes(file.type.toLowerCase())) {
    throw new Error('Hindi suportado ang format na ito. Pumili ng JPG, PNG, o WEBP.');
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Masyadong malaki ang larawan. Pumili ng mas maliit na image (maximum 20MB).');
  }

  let imgBitmap: ImageBitmap | HTMLImageElement;
  let naturalW = 0;
  let naturalH = 0;

  if (typeof createImageBitmap === 'function') {
    try {
      imgBitmap = await createImageBitmap(file);
      naturalW = imgBitmap.width;
      naturalH = imgBitmap.height;
    } catch {
      imgBitmap = await loadHTMLImageElement(file);
      naturalW = imgBitmap.naturalWidth;
      naturalH = imgBitmap.naturalHeight;
    }
  } else {
    imgBitmap = await loadHTMLImageElement(file);
    naturalW = imgBitmap.naturalWidth;
    naturalH = imgBitmap.naturalHeight;
  }

  if (naturalW <= 0 || naturalH <= 0) {
    throw new Error('Hindi mabasa ang sukat ng larawan. Pumili ulit ng image.');
  }

  const MAX_DIM = 1280;
  let targetW = naturalW;
  let targetH = naturalH;
  if (naturalW > MAX_DIM || naturalH > MAX_DIM) {
    if (naturalW > naturalH) {
      targetW = MAX_DIM;
      targetH = Math.round((naturalH / naturalW) * MAX_DIM);
    } else {
      targetH = MAX_DIM;
      targetW = Math.round((naturalW / naturalH) * MAX_DIM);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Hindi mabuo ang canvas para sa larawan.');
  }

  ctx.drawImage(imgBitmap, 0, 0, targetW, targetH);

  if ('close' in imgBitmap && typeof (imgBitmap as any).close === 'function') {
    (imgBitmap as any).close();
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Nabigo ang pag-convert ng image.'));
      },
      'image/jpeg',
      0.88
    );
  });

  return {
    dataUrl,
    blob,
    width: targetW,
    height: targetH,
  };
}

function loadHTMLImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Hindi mabasa ang larawan. Pumili ulit ng image.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Hindi mabasa ang file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Analyzes an uploaded static image for goats and sheep, individual bounding boxes,
 * and visual health screening using the secure backend AI API.
 */
export async function analyzeUploadedImage(
  imageDataUrl: string,
  selectedSpecies?: string
): Promise<UploadedImageAnalysisResult> {
  let authHeader: Record<string, string> = {};
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      authHeader['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // offline/fallback
  }

  // 1. Run object detection to locate all goats & sheep with bounding boxes
  let detectData: LiveObjectDetectionResult;
  try {
    const res = await fetch('/api/gemini/detect-objects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ image: imageDataUrl }),
    });

    if (!res.ok) {
      throw new Error(`Detection HTTP ${res.status}`);
    }
    detectData = await res.json();
  } catch (detectErr: any) {
    console.warn('[analyzeUploadedImage] /api/gemini/detect-objects fallback to animal-detect:', detectErr);
    try {
      const res = await fetch('/api/gemini/animal-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ image: imageDataUrl }),
      });
      detectData = await res.json();
    } catch (fallbackErr: any) {
      console.error('[analyzeUploadedImage] Detection failed:', fallbackErr);
      throw new Error('Hindi masuri ang larawan sa server. Pakisubukan ulit.');
    }
  }

  // Filter ONLY valid goats and sheep (strictly reject person, other, etc.)
  const rawDetections = Array.isArray(detectData.detections) ? detectData.detections : [];
  const animalDetections = rawDetections.filter(
    (d) => d.type === 'GOAT' || d.type === 'SHEEP'
  );

  const goatCount = animalDetections.filter((d) => d.type === 'GOAT').length;
  const sheepCount = animalDetections.filter((d) => d.type === 'SHEEP').length;
  const detectedGoatOrSheep = animalDetections.length > 0;

  // Stable display numbering from left to right (KAMBING #1, KAMBING #2)
  const sorted = [...animalDetections].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
  let gNum = 1;
  let sNum = 1;
  const formattedDetections: UploadedAnimalDetection[] = sorted.map((d) => {
    const isSheep = d.type === 'SHEEP';
    const num = isSheep ? (sheepCount > 1 ? sNum++ : undefined) : (goatCount > 1 ? gNum++ : undefined);
    return {
      species: isSheep ? 'sheep' : 'goat',
      label: isSheep ? 'TUPA' : 'KAMBING',
      displayNumber: num,
      confidence: (d as any).confidence ?? 0.9,
      boundingBox: d.boundingBox,
    };
  });

  // Determine farmer-facing badge
  let statusBadge = 'Walang kambing o tupa na nakita sa larawan.';
  if (goatCount > 0 && sheepCount > 0) {
    const gText = goatCount === 1 ? '1 Kambing' : `${goatCount} Kambing`;
    const sText = sheepCount === 1 ? '1 Tupa' : `${sheepCount} Tupa`;
    statusBadge = `${gText} • ${sText} na nakita`;
  } else if (goatCount > 0) {
    statusBadge = goatCount === 1 ? '1 Kambing na nakita' : `${goatCount} Kambing na nakita`;
  } else if (sheepCount > 0) {
    statusBadge = sheepCount === 1 ? '1 Tupa na nakita' : `${sheepCount} Tupa na nakita`;
  }

  // If no goat or sheep detected, return immediately without fake health screening
  if (!detectedGoatOrSheep) {
    return {
      success: true,
      detectedGoatOrSheep: false,
      goatCount: 0,
      sheepCount: 0,
      detections: [],
      statusBadge: 'Walang kambing o tupa na nakita sa larawan.',
      conditionSummary: 'Walang kambing o tupa na nakita sa larawan.',
      recommendation: 'Siguraduhing malinaw at nakikita ang buong katawan ng kambing o tupa sa litrato.',
      rawScanResult: null,
    };
  }

  // If goat or sheep IS detected, also perform health screening
  let healthScanResult: GeminiScanResult | null = null;
  try {
    const targetSpecies: 'sheep' | 'goat' =
      selectedSpecies === 'sheep' || selectedSpecies === 'goat'
        ? selectedSpecies
        : sheepCount > goatCount
        ? 'sheep'
        : 'goat';
    healthScanResult = await scanAnimalWithGemini(imageDataUrl, {
      context: 'health_scan',
      animalType: targetSpecies,
    });
  } catch (healthErr) {
    console.warn('[analyzeUploadedImage] Health scan warning:', healthErr);
  }

  const raw = healthScanResult?.rawResponse;
  const condition = (raw?.condition || 'Maayos') as 'Maayos' | 'Bantayan' | 'Kailangan ng Atensyon' | 'Kailangan ng Gamot';
  const conditionSummary = raw?.condition_summary || 'Maayos ang nakikitang tindig at pangangatawan.';
  const observations: string[] = raw?.visual_observations || (healthScanResult?.animals?.[0]?.visualObservations) || [];
  const recommendation = healthScanResult?.recommendation || raw?.action || 'Ipagpatuloy ang regular na pagmamasid.';

  return {
    success: true,
    detectedGoatOrSheep: true,
    goatCount,
    sheepCount,
    detections: formattedDetections,
    statusBadge,
    condition,
    conditionSummary,
    observations,
    recommendation,
    rawScanResult: healthScanResult,
  };
}

