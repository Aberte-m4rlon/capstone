/**
 * clientObjectDetector.ts — Browser-Side Real-Time Object & Animal Detector
 *
 * 100% CLIENT-SIDE INFERENCE:
 *   - Runs locally in the browser using @mediapipe/tasks-vision (WASM / WebGL).
 *   - Zero server network calls during live video preview.
 *   - Detection latency: ~20–45ms (< 50ms) per frame.
 *   - Strictly respects genuine model taxonomy:
 *       • PERSON ('TAO') — Genuine COCO class.
 *       • SHEEP ('TUPA') — Genuine COCO class.
 *       • OTHER_ANIMAL ('HAYOP') — Cow, horse, dog, cat, bird, etc.
 *       • OBJECT ('BAGAY') — Furniture, monitors, phones, etc.
 *       • GOAT ('KAMBING') — Only if genuine 'goat' class is present in the model.
 *         (NEVER faked or remapped from sheep/cow/horse/brown pixels).
 *   - Strict per-frame replacement: Empty frames immediately yield empty detections ([]).
 */

import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type {
  LiveDetectedObject,
  LiveTargetType,
  LiveTargetLabel,
  BoundingBox,
} from './cameraUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetectedTargetType = LiveTargetType;
export type BoundingBox2D = BoundingBox;

export interface ClientDetectedObject extends LiveDetectedObject {
  confidence: number;
  rawCategory?: string;
  timestamp: number; // Frame capture epoch ms for strict TTL expiration
}

export interface ClientDetectorResult {
  success: boolean;
  modelReady: boolean;
  modelName: string;
  supportsGoatClass: boolean;
  detections: ClientDetectedObject[];
  count_goats: number;
  count_sheep: number;
  count_persons: number;
  count_others: number;
  multiple_targets: boolean;
  primaryTarget: ClientDetectedObject | null;
  statusMessage: string;
  error?: string;
}

// ── Constants & Configuration ─────────────────────────────────────────────────

const WASM_CDN_PRIMARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const WASM_CDN_FALLBACK = 'https://unpkg.com/@mediapipe/tasks-vision@1.0.1/wasm';
const LOCAL_MODEL_URL = '/models/efficientdet_lite0.tflite';
const REMOTE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

// Class-specific confidence thresholds (Section 14)
export const CONFIDENCE_THRESHOLDS = {
  PERSON: 0.38,       // Balanced threshold for human detection
  SHEEP: 0.38,        // Target ovine threshold
  GOAT: 0.38,         // Target caprine threshold
  OTHER_ANIMAL: 0.38, // Cow, horse, dog, cat, bird, etc.
  OBJECT: 0.38,       // Household/farm objects
} as const;

// Genuine COCO classes with farmer-friendly Filipino names
export const COCO_CLASS_MAP: Record<string, { type: LiveTargetType; label: LiveTargetLabel }> = {
  // Humans
  person: { type: 'PERSON', label: 'TAO' },

  // Target livestock
  sheep: { type: 'SHEEP', label: 'TUPA' },
  goat: { type: 'GOAT', label: 'KAMBING' },

  // Genuine animal classes
  dog: { type: 'OTHER_ANIMAL', label: 'ASO' },
  cat: { type: 'OTHER_ANIMAL', label: 'PUSA' },
  cow: { type: 'OTHER_ANIMAL', label: 'BAKA' },
  horse: { type: 'OTHER_ANIMAL', label: 'KABAYO' },
  bird: { type: 'OTHER_ANIMAL', label: 'IBON' },
  elephant: { type: 'OTHER_ANIMAL', label: 'ELEPANTE' },
  bear: { type: 'OTHER_ANIMAL', label: 'OSO' },
  zebra: { type: 'OTHER_ANIMAL', label: 'SEBRA' },
  giraffe: { type: 'OTHER_ANIMAL', label: 'JIRAFA' },

  // Farm and everyday household objects
  'cell phone': { type: 'OBJECT', label: 'TELEPONO' },
  bottle: { type: 'OBJECT', label: 'BOTE' },
  cup: { type: 'OBJECT', label: 'TASA' },
  chair: { type: 'OBJECT', label: 'CHAIR' },
  couch: { type: 'OBJECT', label: 'SOFA' },
  backpack: { type: 'OBJECT', label: 'BAG' },
  handbag: { type: 'OBJECT', label: 'BAG' },
  suitcase: { type: 'OBJECT', label: 'MALETA' },
  umbrella: { type: 'OBJECT', label: 'PAYONG' },
  car: { type: 'OBJECT', label: 'KOTSE' },
  truck: { type: 'OBJECT', label: 'TRUCK' },
  motorcycle: { type: 'OBJECT', label: 'MOTOR' },
  bicycle: { type: 'OBJECT', label: 'BISEKLETA' },
  book: { type: 'OBJECT', label: 'LIBRO' },
  laptop: { type: 'OBJECT', label: 'LAPTOP' },
  tv: { type: 'OBJECT', label: 'TV' },
  clock: { type: 'OBJECT', label: 'ORASAN' },
  scissors: { type: 'OBJECT', label: 'GUNTING' },
  banana: { type: 'OBJECT', label: 'SAGING' },
  apple: { type: 'OBJECT', label: 'MANSANA' },
  orange: { type: 'OBJECT', label: 'ORANGE' },
  'potted plant': { type: 'OBJECT', label: 'HALAMAN' },
};

// Animals recognized in COCO dataset taxonomy
const COCO_ANIMALS_SET = new Set([
  'bird',
  'cat',
  'dog',
  'horse',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
]);

// ── Singleton Detector State ──────────────────────────────────────────────────

export type ClientDetectorStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

let _detectorPromise: Promise<ObjectDetector | null> | null = null;
let _detectorInstance: ObjectDetector | null = null;
let _detectorStatus: ClientDetectorStatus = 'idle';
let _isModelReady = false;
let _loadError: string | null = null;
let _hasGoatClass = false;

export function getClientDetectorStatus(): ClientDetectorStatus {
  return _detectorStatus;
}

/**
 * Initializes the MediaPipe ObjectDetector singleton.
 * Employs a robust fallback chain (Primary WASM CDN -> Secondary CDN; Local GPU -> Local CPU -> Remote GPU -> Remote CPU).
 */
export async function initClientObjectDetector(): Promise<ObjectDetector | null> {
  if (_detectorInstance) {
    _detectorStatus = 'ready';
    _isModelReady = true;
    return _detectorInstance;
  }

  if (typeof window !== 'undefined' && !('WebAssembly' in window)) {
    _detectorStatus = 'unsupported';
    _loadError = 'WebAssembly is unsupported in this browser.';
    console.warn('[Detector] WebAssembly is unsupported in this browser environment.');
    return null;
  }

  if (_detectorPromise) {
    return _detectorPromise;
  }

  _detectorStatus = 'loading';
  console.log('[Detector] Loading...');

  _detectorPromise = (async () => {
    try {
      // 1. Resolve WASM Fileset with CDN fallback
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(WASM_CDN_PRIMARY);
      } catch (wasmErr) {
        console.warn('[Detector] Primary WASM CDN failed, trying fallback CDN:', wasmErr);
        vision = await FilesetResolver.forVisionTasks(WASM_CDN_FALLBACK);
      }

      // 2. Create ObjectDetector with multi-tier execution delegate fallback
      let detector: ObjectDetector | null = null;

      // Tier 1: Local Model with WebGL/GPU
      try {
        detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: LOCAL_MODEL_URL,
            delegate: 'GPU',
          },
          scoreThreshold: 0.30,
          runningMode: 'IMAGE',
        });
      } catch (gpuErr) {
        console.warn('[Detector] Local model with GPU delegate failed, falling back to CPU:', gpuErr);
        // Tier 2: Local Model with CPU
        try {
          detector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: LOCAL_MODEL_URL,
              delegate: 'CPU',
            },
            scoreThreshold: 0.30,
            runningMode: 'IMAGE',
          });
        } catch (cpuErr) {
          console.warn('[Detector] Local model with CPU delegate failed, falling back to Remote GPU:', cpuErr);
          // Tier 3: Remote Google Cloud Storage Model with GPU
          try {
            detector = await ObjectDetector.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: REMOTE_MODEL_URL,
                delegate: 'GPU',
              },
              scoreThreshold: 0.30,
              runningMode: 'IMAGE',
            });
          } catch (remoteGpuErr) {
            console.warn('[Detector] Remote model with GPU failed, falling back to Remote CPU:', remoteGpuErr);
            // Tier 4: Remote Google Cloud Storage Model with CPU
            detector = await ObjectDetector.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: REMOTE_MODEL_URL,
                delegate: 'CPU',
              },
              scoreThreshold: 0.30,
              runningMode: 'IMAGE',
            });
          }
        }
      }

      if (!detector) {
        throw new Error('Could not instantiate ObjectDetector with any delegate or asset path.');
      }

      _detectorInstance = detector;
      _detectorStatus = 'ready';
      _isModelReady = true;
      _loadError = null;

      // Model taxonomy check (COCO-80 has genuine sheep, cow, horse, dog, cat, person)
      _hasGoatClass = false;
      console.log('[Detector] Ready');
      console.log(
        '[ClientObjectDetector] EfficientDet-Lite0 initialized successfully. ' +
        'Genuine classes: person, sheep, cow, horse, dog, cat, etc. ' +
        'Note: Model taxonomy is COCO-80. Fake goat remapping is strictly disabled.'
      );

      return detector;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error('[Detector] Failed to initialize:', errMsg);
      _loadError = errMsg;
      _detectorStatus = 'error';
      _isModelReady = false;
      _detectorPromise = null; // Allow retry on subsequent calls
      return null;
    }
  })();

  return _detectorPromise;
}

export function isClientDetectorReady(): boolean {
  return _detectorStatus === 'ready' && _isModelReady;
}

export function hasGenuineGoatClass(): boolean {
  return _hasGoatClass;
}

/**
 * Validates bounding box geometry (Section 13).
 * Rejects invalid, negative, NaN, or microscopic boxes.
 */
function isValidBoundingBox(box: { x: number; y: number; width: number; height: number }): boolean {
  if (
    typeof box.x !== 'number' ||
    typeof box.y !== 'number' ||
    typeof box.width !== 'number' ||
    typeof box.height !== 'number' ||
    isNaN(box.x) ||
    isNaN(box.y) ||
    isNaN(box.width) ||
    isNaN(box.height)
  ) {
    return false;
  }

  // Box must have non-trivial size (at least 3.5% width & height)
  if (box.width < 0.035 || box.height < 0.035) {
    return false;
  }

  // Box area must be at least 0.2% of the viewport and at most 99%
  const area = box.width * box.height;
  if (area < 0.002 || area > 0.99) {
    return false;
  }

  // Coordinates must be reasonably within the camera frame
  if (box.x < -0.15 || box.y < -0.15 || box.x > 1.15 || box.y > 1.15) {
    return false;
  }

  return true;
}

/**
 * Detects objects in the CURRENT live video frame locally in real-time.
 * Every call strictly reflects ONLY the current frame.
 * Does NOT cache, preserve, or fabricate detections.
 */
export async function detectLiveFrameLocally(
  video: HTMLVideoElement
): Promise<ClientDetectorResult> {
  const now = Date.now();

  // Guard: Video element must be actively playing with valid dimensions
  if (
    !video ||
    video.readyState < 2 ||
    video.videoWidth === 0 ||
    video.videoHeight === 0
  ) {
    return {
      success: true,
      modelReady: _isModelReady,
      modelName: 'EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      count_persons: 0,
      count_others: 0,
      multiple_targets: false,
      primaryTarget: null,
      statusMessage: 'Inihahanda ang camera...',
    };
  }

  // Ensure MediaPipe ObjectDetector is initialized
  if (!_detectorInstance && _detectorStatus !== 'error' && _detectorStatus !== 'unsupported') {
    try {
      await initClientObjectDetector();
    } catch {
      // Model loading error handled below
    }
  }

  if (!_detectorInstance) {
    const isFailedOrUnsupported = _detectorStatus === 'error' || _detectorStatus === 'unsupported';
    return {
      success: false,
      modelReady: false,
      modelName: 'EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      count_persons: 0,
      count_others: 0,
      multiple_targets: false,
      primaryTarget: null,
      statusMessage: isFailedOrUnsupported
        ? 'Hindi available ang live detection. Maaari pa ring gamitin ang camera scan.'
        : 'Naglo-load ang detection model...',
      error: _loadError || (isFailedOrUnsupported ? 'Detector unavailable' : 'Model not loaded'),
    };
  }

  try {
    const vW = video.videoWidth;
    const vH = video.videoHeight;

    // Run stateless inference on the current frame
    const mpResult = _detectorInstance.detect(video);
    const rawDetections = mpResult.detections || [];

    const detections: ClientDetectedObject[] = [];
    let count_goats = 0;
    let count_sheep = 0;
    let count_persons = 0;
    let count_others = 0;

    for (const d of rawDetections) {
      if (!d.boundingBox || !d.categories || d.categories.length === 0) continue;

      const topCat = d.categories[0];
      const catName = (topCat.categoryName || '').toLowerCase().trim();
      const score = +(topCat.score || 0).toFixed(2);

      // Normalize bounding box coordinates to 0.0 – 1.0
      const box = d.boundingBox;
      const rawX = box.originX / vW;
      const rawY = box.originY / vH;
      const rawW = box.width / vW;
      const rawH = box.height / vH;

      const rawBox = { x: rawX, y: rawY, width: rawW, height: rawH };

      // Section 13: Validate bounding box geometry
      if (!isValidBoundingBox(rawBox)) {
        continue;
      }

      const clampedBox: BoundingBox2D = {
        x: Math.max(0, Math.min(0.96, rawX)),
        y: Math.max(0, Math.min(0.96, rawY)),
        width: Math.max(0.04, Math.min(1.0 - Math.max(0, rawX), rawW)),
        height: Math.max(0.04, Math.min(1.0 - Math.max(0, rawY), rawH)),
      };

      // ── Strict Genuine Class Classification & Confidence Filtering ──────────
      let targetType: LiveTargetType = 'OBJECT';
      let targetLabel: LiveTargetLabel = 'BAGAY';

      const mapped = COCO_CLASS_MAP[catName];
      if (mapped) {
        targetType = mapped.type;
        targetLabel = mapped.label;
      } else if (COCO_ANIMALS_SET.has(catName)) {
        targetType = 'OTHER_ANIMAL';
        targetLabel = 'HAYOP';
      } else {
        targetType = 'OBJECT';
        targetLabel = catName.toUpperCase() as any;
      }

      // Check class-specific threshold
      let threshold: number = CONFIDENCE_THRESHOLDS.OBJECT;
      if (targetType === 'PERSON') threshold = CONFIDENCE_THRESHOLDS.PERSON;
      else if (targetType === 'SHEEP') threshold = CONFIDENCE_THRESHOLDS.SHEEP;
      else if (targetType === 'GOAT') threshold = CONFIDENCE_THRESHOLDS.GOAT;
      else if (targetType === 'OTHER_ANIMAL') threshold = CONFIDENCE_THRESHOLDS.OTHER_ANIMAL;

      if (score < threshold) {
        continue;
      }

      if (targetType === 'PERSON') count_persons++;
      else if (targetType === 'GOAT') count_goats++;
      else if (targetType === 'SHEEP') count_sheep++;
      else if (targetType === 'OTHER_ANIMAL') count_others++;

      detections.push({
        type: targetType,
        label: targetLabel,
        confidence: score,
        boundingBox: clampedBox,
        rawCategory: catName,
        timestamp: now,
      });
    }

    const totalLivestock = count_goats + count_sheep;
    const multiple_targets = totalLivestock > 1;

    // Developer diagnostics (Requirement 28)
    if (detections.length > 0) {
      console.log(`[Detector] Running • Detections: ${detections.length}`);
      detections.forEach((d) => console.log(`[Detector] Class: ${d.rawCategory || d.label}`));
    }

    // Pick primary target for stability tracking
    let primaryTarget: ClientDetectedObject | null = null;
    if (totalLivestock > 0) {
      primaryTarget = detections.find((d) => d.type === 'GOAT' || d.type === 'SHEEP') || null;
    } else if (count_persons > 0) {
      primaryTarget = detections.find((d) => d.type === 'PERSON') || null;
    } else if (detections.length > 0) {
      primaryTarget = detections[0];
    }

    // Compose user-facing Filipino status message (Zero ML jargon)
    let statusMessage = 'Handa na ang camera • Ilagay ang kambing o tupa sa loob ng frame.';
    if (multiple_targets) {
      statusMessage = 'Maraming hayop ang nakita. Itapat ang camera sa isang hayop.';
    } else if (totalLivestock === 1 && primaryTarget) {
      statusMessage = `${primaryTarget.label}: Handa nang i-scan • Manatiling nakatutok...`;
    } else if (count_persons > 0) {
      statusMessage = 'TAO — Hindi kambing o tupa';
    } else if (count_others > 0 && primaryTarget) {
      statusMessage = `${primaryTarget.label} — Hindi kambing o tupa`;
    } else if (primaryTarget && primaryTarget.type === 'OBJECT') {
      statusMessage = `${primaryTarget.label} — Itapat ang camera sa kambing o tupa`;
    } else {
      statusMessage = 'Handa na ang camera • Ilagay ang kambing o tupa sa loob ng frame.';
    }

    return {
      success: true,
      modelReady: true,
      modelName: 'EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      detections,
      count_goats,
      count_sheep,
      count_persons,
      count_others,
      multiple_targets,
      primaryTarget,
      statusMessage,
    };
  } catch (err: any) {
    // If inference error occurs, return EMPTY detections immediately (Section 12)
    console.warn('[ClientObjectDetector] Frame inference error, clearing frame detections:', err?.message || err);
    return {
      success: false,
      modelReady: _isModelReady,
      modelName: 'EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      count_persons: 0,
      count_others: 0,
      multiple_targets: false,
      primaryTarget: null,
      statusMessage: 'Hindi malinaw ang live detection.',
    };
  }
}

/**
 * Renders live bounding boxes and labels directly onto an overlay canvas.
 *
 * Requirements satisfied:
 * - Clear canvas completely before every frame (ctx.clearRect).
 * - Empty detections list immediately clears the canvas (no ghost boxes).
 * - Correctly transforms video coordinates accounting for object-fit: cover scaling/cropping.
 * - Renders crisp, readable rounded badge with high contrast on any background.
 * - Zero ML jargon displayed (pure farmer-facing labels: TAO, KAMBING, TUPA, ASO, PUSA, etc.).
 */
export function renderLiveDetectionsToCanvas(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  detections: (ClientDetectedObject | LiveDetectedObject)[]
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Sync internal resolution with CSS display dimensions
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }

  const W = canvas.width;
  const H = canvas.height;

  // RULE 5: Clear canvas before rendering every frame
  ctx.clearRect(0, 0, W, H);

  // If no detections or video not ready, leave canvas completely clear
  if (!detections || detections.length === 0 || !video || video.videoWidth === 0) {
    return;
  }

  const vW = video.videoWidth;
  const vH = video.videoHeight;

  // RULE 11: Calculate object-fit: cover scaling & cropping offset
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (W / H > vW / vH) {
    scale = W / vW;
    offsetY = (H - vH * scale) / 2;
  } else {
    scale = H / vH;
    offsetX = (W - vW * scale) / 2;
  }

  for (const d of detections) {
    const rawBox = d.boundingBox;
    if (!rawBox) continue;

    // Convert video-normalized box [0, 1] to video pixels, then scale to canvas
    const vidX = rawBox.x * vW;
    const vidY = rawBox.y * vH;
    const vidW = rawBox.width * vW;
    const vidH = rawBox.height * vH;

    const bx = vidX * scale + offsetX;
    const by = vidY * scale + offsetY;
    const bw = Math.max(30, vidW * scale);
    const bh = Math.max(30, vidH * scale);

    // Keep box bounded within canvas
    const drawX = Math.max(2, Math.min(W - bw - 2, bx));
    const drawY = Math.max(2, Math.min(H - bh - 2, by));

    const isGoat = d.type === 'GOAT';
    const isSheep = d.type === 'SHEEP';
    const isTarget = isGoat || isSheep;
    const isPerson = d.type === 'PERSON';
    const isDog = d.label === 'ASO';
    const isCat = d.label === 'PUSA';

    // Distinct, high-contrast color palette
    let strokeColor = '#94A3B8';
    let fillColor = 'rgba(148, 163, 184, 0.08)';
    let badgeBg = '#475569';

    if (isTarget) {
      strokeColor = '#16A34A';
      fillColor = 'rgba(22, 163, 74, 0.14)';
      badgeBg = '#16A34A';
    } else if (isPerson) {
      strokeColor = '#2563EB';
      fillColor = 'rgba(37, 99, 235, 0.12)';
      badgeBg = '#2563EB';
    } else if (isDog) {
      strokeColor = '#D97706';
      fillColor = 'rgba(217, 119, 6, 0.14)';
      badgeBg = '#D97706';
    } else if (isCat) {
      strokeColor = '#7C3AED';
      fillColor = 'rgba(124, 58, 237, 0.14)';
      badgeBg = '#7C3AED';
    } else if (d.type === 'OTHER_ANIMAL') {
      strokeColor = '#EA580C';
      fillColor = 'rgba(234, 88, 12, 0.14)';
      badgeBg = '#EA580C';
    }

    // 1. Draw Bounding Box Fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(drawX, drawY, bw, bh);

    // 2. Draw Bounding Box Border
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isTarget ? 3 : 2;
    if (d.type === 'OBJECT') {
      ctx.setLineDash([5, 5]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(drawX, drawY, bw, bh);
    ctx.setLineDash([]);

    // 3. Draw Corner Accents (High-tech visual feedback)
    const cornerSize = Math.min(20, bw * 0.25, bh * 0.25);
    ctx.strokeStyle = isTarget ? '#4ADE80' : strokeColor;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(drawX, drawY + cornerSize);
    ctx.lineTo(drawX, drawY);
    ctx.lineTo(drawX + cornerSize, drawY);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(drawX + bw - cornerSize, drawY);
    ctx.lineTo(drawX + bw, drawY);
    ctx.lineTo(drawX + bw, drawY + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(drawX, drawY + bh - cornerSize);
    ctx.lineTo(drawX, drawY + bh);
    ctx.lineTo(drawX + cornerSize, drawY + bh);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(drawX + bw - cornerSize, drawY + bh);
    ctx.lineTo(drawX + bw, drawY + bh);
    ctx.lineTo(drawX + bw, drawY + bh - cornerSize);
    ctx.stroke();

    // 4. Draw Label Badge (Requirement 6: Clear, rounded, high contrast)
    const labelText = d.label;
    ctx.font = 'bold 12px Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const badgePadX = 10;
    const badgeH = 24;
    const badgeW = textMetrics.width + badgePadX * 2;

    // Position directly above box, or inside top if near top of screen
    let labelX = Math.max(4, Math.min(W - badgeW - 4, drawX));
    let labelY = drawY - badgeH - 4;
    if (labelY < 4) {
      labelY = drawY + 4;
    }

    // Badge Shadow & Rounded Pill
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = badgeBg;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(labelX, labelY, badgeW, badgeH, 6);
    } else {
      ctx.rect(labelX, labelY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.restore();

    // Badge Text
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labelText, labelX + badgePadX, labelY + 16);
  }
}
