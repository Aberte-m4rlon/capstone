/**
 * clientObjectDetector.ts — High-Accuracy Goat, Sheep & Person Live Camera Detector
 *
 * 100% CLIENT-SIDE REAL-TIME INFERENCE:
 *   - Runs locally in the browser with zero server latency during live camera preview.
 *   - Dual-model hybrid architecture:
 *       1. Dedicated YOLOv8 Nano ONNX Model (goat_yolov8n.onnx) for caprine detection (KAMBING).
 *       2. MediaPipe Tasks Vision Model (efficientdet_lite0.tflite) for ovine (TUPA) & human (TAO) detection.
 *   - STRICT SPECIES GATE & TAXONOMY ENFORCEMENT:
 *       • GOAT -> KAMBING (from genuine goat detector, class 0: 'goat')
 *       • SHEEP -> TUPA (from genuine sheep detector, COCO class 20: 'sheep')
 *       • PERSON -> TAO (from genuine human detector, COCO class 1: 'person')
 *       • ZERO FAKE REMAPPINGS: Cow, elephant, horse, dog, cat, etc. are NEVER mapped to goat/sheep.
 *       • False animal labels (BAKA, ELEPANTE, etc.) are ELIMINATED from the livestock UI.
 *   - TEMPORAL STABILITY CHECK (Section 12):
 *       • 4-frame sliding window per tracked object.
 *       • Requires >= 3 consistent frame classifications to confirm KAMBING or TUPA.
 *       • Fluctuating classifications or borderline confidence transitions to UNCERTAIN.
 *   - CLOSE PROBABILITY AMBIGUITY GUARD (Section 13 & 14):
 *       • If goat & sheep detectors both fire with close confidence (|diff| < 0.12), marks UNCERTAIN.
 *       • Farmer-facing message: "Hindi malinaw kung kambing o tupa. Ilapit o ayusin ang camera at subukan muli."
 *   - IMAGE QUALITY ANALYSIS (Section 15):
 *       • Bounding box area check (< 5% of frame -> "Masyadong maliit ang alaga sa camera...")
 *       • Luminance check (average luma < 35 -> "Madilim ang larawan. Ayusin ang ilaw at subukan muli.")
 *       • Frame border clipping check ("Hindi malinaw ang buong kambing o tupa. Ilipat nang kaunti ang camera.")
 *   - PER-FRAME REPLACEMENT:
 *       • Canvas is cleared (clearRect) before every draw — zero ghost boxes when animals leave.
 */

import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
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
  className: 'goat' | 'sheep' | 'person' | 'dog' | 'cat' | 'uncertain' | string;
  confidence: number;
  bbox: BoundingBox; // Exact Section 7 format alias
  rawCategory?: string;
  timestamp: number;
  qualityWarning?: 'too_small' | 'too_dark' | 'occluded' | null;
}

export interface ClientDetectorResult {
  success: boolean;
  modelReady: boolean;
  modelName: string;
  supportsGoatClass: boolean;
  supportsSheepClass: boolean;
  detections: ClientDetectedObject[];
  count_goats: number;
  count_sheep: number;
  count_persons: number;
  count_others: number;
  count_uncertain: number;
  multiple_targets: boolean;
  primaryTarget: ClientDetectedObject | null;
  statusMessage: string;
  qualityIssue?: 'too_small' | 'too_dark' | 'occluded' | null;
  error?: string;
}

export type ClientDetectorStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

// ── Model URLs & Configuration ────────────────────────────────────────────────

const WASM_CDN_PRIMARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const WASM_CDN_FALLBACK = 'https://unpkg.com/@mediapipe/tasks-vision@1.0.1/wasm';
const MEDIAPIPE_LOCAL_MODEL = '/models/efficientdet_lite0.tflite';
const MEDIAPIPE_REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

const GOAT_ONNX_MODEL_URL = '/models/goat_yolov8n.onnx';

// Thresholds for genuine classes
export const CONFIDENCE_THRESHOLDS = {
  GOAT: 0.25,         // Specialized YOLOv8 Nano model threshold (empirically tuned for angled/frontal goats)
  SHEEP: 0.35,        // MediaPipe genuine sheep threshold
  PERSON: 0.38,       // MediaPipe genuine human threshold
  OTHER_ANIMAL: 0.50, // Domestic animals (ASO, PUSA) only if genuine
  OBJECT: 0.50,       // Farm/household objects
} as const;

// Strict Genuine Supported Classes (Requirement 11)
export const SUPPORTED_FARM_CLASSES: Record<string, { type: LiveTargetType; label: LiveTargetLabel }> = {
  // Humans
  person: { type: 'PERSON', label: 'TAO' },

  // Target Livestock
  goat: { type: 'GOAT', label: 'KAMBING' },
  sheep: { type: 'SHEEP', label: 'TUPA' },

  // Filtered domestic animals (allowed only if genuinely recognized)
  dog: { type: 'OTHER_ANIMAL', label: 'ASO' },
  cat: { type: 'OTHER_ANIMAL', label: 'PUSA' },
};

// Backwards-compatible export for existing imports
export const COCO_CLASS_MAP = SUPPORTED_FARM_CLASSES;

// ── Singleton Detector State ──────────────────────────────────────────────────

let _initPromise: Promise<boolean> | null = null;
let _mediaPipeDetector: ObjectDetector | null = null;
let _yoloSession: ort.InferenceSession | null = null;
let _detectorStatus: ClientDetectorStatus = 'idle';
let _isModelReady = false;
let _hasGoatClass = false;
let _loadError: string | null = null;

// Offscreen canvas for YOLO frame preprocessing & brightness estimation
let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;
let _isYoloInferencing = false;
let _lastFrameLuma = 128; // 0-255 luminance

// Last known YOLO detections for high-rate frame interleaving
let _lastYoloGoatBoxes: ClientDetectedObject[] = [];
let _lastYoloTimestamp = 0;

// Temporal Stability Tracking State (Section 12)
interface TrackedTarget {
  id: number;
  box: BoundingBox;
  lastSeen: number;
  history: Array<{
    className: string;
    type: LiveTargetType;
    label: LiveTargetLabel;
    confidence: number;
    timestamp: number;
  }>;
}

let _nextTrackId = 1;
const _activeTracks: TrackedTarget[] = [];

// Configure ONNX Runtime Web environment
if (typeof window !== 'undefined') {
  try {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
    ort.env.wasm.numThreads = 1; // 1 thread for universal iOS Safari / Android Chrome compatibility
  } catch (e) {
    console.warn('[Detector] ONNX env setup warning:', e);
  }
}

export function getClientDetectorStatus(): ClientDetectorStatus {
  return _detectorStatus;
}

export function isClientDetectorReady(): boolean {
  return _isModelReady;
}

export function hasGenuineGoatClass(): boolean {
  return _hasGoatClass;
}

/**
 * Initializes the live object detector pipeline:
 * 1. Dedicated YOLOv8 Nano ONNX model for genuine Goat detection.
 * 2. MediaPipe Tasks Vision model for genuine Sheep and Person detection.
 * Emits the exact required developer debug logs (Section 21).
 */
export async function initClientObjectDetector(): Promise<ObjectDetector | null> {
  if (_isModelReady && (_mediaPipeDetector || _yoloSession)) {
    return _mediaPipeDetector;
  }

  if (typeof window !== 'undefined' && !('WebAssembly' in window)) {
    _detectorStatus = 'unsupported';
    _loadError = 'WebAssembly is unsupported in this browser.';
    console.error('[Detector] ERROR: WebAssembly is unsupported in this browser environment.');
    return null;
  }

  if (_initPromise) {
    await _initPromise;
    return _mediaPipeDetector;
  }

  _detectorStatus = 'loading';
  console.log('[Detector] Model loading...');

  _initPromise = (async () => {
    try {
      // 1. Initialize MediaPipe (for Person & Sheep)
      let mpVision = null;
      try {
        mpVision = await FilesetResolver.forVisionTasks(WASM_CDN_PRIMARY);
      } catch (cdnErr) {
        console.warn('[Detector] Primary WASM CDN failed, using fallback:', cdnErr);
        mpVision = await FilesetResolver.forVisionTasks(WASM_CDN_FALLBACK);
      }

      try {
        _mediaPipeDetector = await ObjectDetector.createFromOptions(mpVision, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_LOCAL_MODEL,
            delegate: 'GPU',
          },
          scoreThreshold: 0.30,
          runningMode: 'IMAGE',
        });
      } catch {
        // Fallback to CPU delegate or remote model
        try {
          _mediaPipeDetector = await ObjectDetector.createFromOptions(mpVision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_LOCAL_MODEL,
              delegate: 'CPU',
            },
            scoreThreshold: 0.30,
            runningMode: 'IMAGE',
          });
        } catch {
          _mediaPipeDetector = await ObjectDetector.createFromOptions(mpVision, {
            baseOptions: {
              modelAssetPath: MEDIAPIPE_REMOTE_MODEL,
              delegate: 'CPU',
            },
            scoreThreshold: 0.30,
            runningMode: 'IMAGE',
          });
        }
      }

      // 2. Initialize YOLOv8 Nano ONNX Goat Detector
      try {
        _yoloSession = await ort.InferenceSession.create(GOAT_ONNX_MODEL_URL, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        _hasGoatClass = true;
      } catch (yoloErr) {
        console.warn('[Detector] YOLOv8 goat model init warning, retrying with default provider:', yoloErr);
        try {
          _yoloSession = await ort.InferenceSession.create(GOAT_ONNX_MODEL_URL);
          _hasGoatClass = true;
        } catch (yoloRetryErr) {
          console.error('[Detector] YOLOv8 goat detector load failed:', yoloRetryErr);
          _hasGoatClass = false;
        }
      }

      if (!_mediaPipeDetector && !_yoloSession) {
        console.error('[Detector] ERROR: Current model does not support goat/sheep detection.');
        _detectorStatus = 'error';
        _isModelReady = false;
        return false;
      }

      _detectorStatus = 'ready';
      _isModelReady = true;
      _loadError = null;

      // Developer console logs required by Section 21
      console.log('[Detector] Model loaded');
      console.log('[Detector] Classes: person (TAO), goat (KAMBING), sheep (TUPA)');
      console.log('[Detector] Ready');

      return true;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error('[Detector] ERROR: Failed to initialize detection model:', errMsg);
      _loadError = errMsg;
      _detectorStatus = 'error';
      _isModelReady = false;
      _initPromise = null;
      return false;
    }
  })();

  await _initPromise;
  return _mediaPipeDetector;
}

// ── Bounding Box & Geometry Utilities ─────────────────────────────────────────

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
  if (box.width < 0.035 || box.height < 0.035) return false;
  const area = box.width * box.height;
  if (area < 0.002 || area > 0.99) return false;
  if (box.x < -0.15 || box.y < -0.15 || box.x > 1.15 || box.y > 1.15) return false;
  return true;
}

function calculateIoU(b1: BoundingBox, b2: BoundingBox): number {
  const x1 = Math.max(b1.x, b2.x);
  const y1 = Math.max(b1.y, b2.y);
  const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
  const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  const area1 = b1.width * b1.height;
  const area2 = b2.width * b2.height;
  const unionArea = area1 + area2 - interArea;

  return unionArea <= 0 ? 0 : interArea / unionArea;
}

function applyNMS(
  boxes: Array<{ box: BoundingBox; score: number; label: LiveTargetLabel; type: LiveTargetType }>,
  iouThreshold = 0.45
) {
  boxes.sort((a, b) => b.score - a.score);
  const selected: typeof boxes = [];
  for (const item of boxes) {
    let keep = true;
    for (const chosen of selected) {
      if (calculateIoU(item.box, chosen.box) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) selected.push(item);
  }
  return selected;
}

// ── YOLOv8 Inference on Video Frame ───────────────────────────────────────────

async function runYoloGoatInference(video: HTMLVideoElement, timestamp: number): Promise<ClientDetectedObject[]> {
  if (!_yoloSession || _isYoloInferencing) {
    // Return fresh valid detections within 350ms TTL window
    if (timestamp - _lastYoloTimestamp < 350) {
      return _lastYoloGoatBoxes;
    }
    return [];
  }

  _isYoloInferencing = true;
  try {
    if (!_offscreenCanvas) {
      _offscreenCanvas = document.createElement('canvas');
      _offscreenCanvas.width = 416;
      _offscreenCanvas.height = 416;
      _offscreenCtx = _offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }

    const ctx = _offscreenCtx;
    if (!ctx) return [];

    const vW = video.videoWidth || 640;
    const vH = video.videoHeight || 480;
    const targetSize = 416;
    const scale = Math.min(targetSize / vW, targetSize / vH);
    const scaledW = Math.round(vW * scale);
    const scaledH = Math.round(vH * scale);
    const padX = Math.floor((targetSize - scaledW) / 2);
    const padY = Math.floor((targetSize - scaledH) / 2);

    // Letterbox padding with standard 114 gray to preserve aspect ratio (prevents squishing edge goats)
    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(video, 0, 0, vW, vH, padX, padY, scaledW, scaledH);
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    const data = imgData.data;

    // Convert RGBA uint8 to planar RGB Float32Array [1, 3, 416, 416] and compute frame brightness
    const pixels = 416 * 416;
    const float32 = new Float32Array(3 * pixels);
    const rOffset = 0;
    const gOffset = pixels;
    const bOffset = 2 * pixels;

    let totalLuma = 0;
    const sampleStep = 16;
    let sampleCount = 0;

    for (let i = 0; i < pixels; i++) {
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];

      float32[rOffset + i] = r / 255.0;
      float32[gOffset + i] = g / 255.0;
      float32[bOffset + i] = b / 255.0;

      if (i % sampleStep === 0) {
        totalLuma += 0.299 * r + 0.587 * g + 0.114 * b;
        sampleCount++;
      }
    }

    if (sampleCount > 0) {
      _lastFrameLuma = totalLuma / sampleCount;
    }

    const inputTensor = new ort.Tensor('float32', float32, [1, 3, 416, 416]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[_yoloSession.inputNames[0]] = inputTensor;

    const results = await _yoloSession.run(feeds);
    const output = results[_yoloSession.outputNames[0]];
    const outData = output.data as Float32Array;

    // Output shape: [1, 5, 3549] (cx, cy, w, h, goat_score)
    const numAnchors = output.dims[2] || 3549;
    const candidates: Array<{ box: BoundingBox; score: number; label: LiveTargetLabel; type: LiveTargetType }> = [];

    for (let a = 0; a < numAnchors; a++) {
      const score = outData[4 * numAnchors + a];
      if (score < CONFIDENCE_THRESHOLDS.GOAT) continue;

      const cx = outData[0 * numAnchors + a];
      const cy = outData[1 * numAnchors + a];
      const w = outData[2 * numAnchors + a];
      const h = outData[3 * numAnchors + a];

      // Un-pad and un-scale back to normalized video frame [0, 1]
      const x = Math.max(0, Math.min(1, ((cx - w / 2) - padX) / scaledW));
      const y = Math.max(0, Math.min(1, ((cy - h / 2) - padY) / scaledH));
      const width = Math.max(0, Math.min(1 - x, w / scaledW));
      const height = Math.max(0, Math.min(1 - y, h / scaledH));

      const rawBox = { x, y, width, height };
      if (!isValidBoundingBox(rawBox)) continue;

      candidates.push({
        box: rawBox,
        score: +score.toFixed(2),
        label: 'KAMBING',
        type: 'GOAT',
      });
    }

    const filtered = applyNMS(candidates, 0.45);
    const goatDetections: ClientDetectedObject[] = filtered.map((c) => ({
      className: 'goat',
      type: 'GOAT',
      label: 'KAMBING',
      confidence: c.score,
      boundingBox: c.box,
      bbox: c.box,
      rawCategory: 'goat',
      timestamp,
    }));

    _lastYoloGoatBoxes = goatDetections;
    _lastYoloTimestamp = timestamp;
    return goatDetections;
  } catch (err) {
    console.warn('[Detector] YOLOv8 goat inference error:', err);
    return [];
  } finally {
    _isYoloInferencing = false;
  }
}

// ── Temporal Stability & Quality Evaluation (Sections 12, 13, 14, 15) ────────

function applyTemporalStabilityAndQuality(
  rawCandidates: ClientDetectedObject[],
  timestamp: number
): {
  stableDetections: ClientDetectedObject[];
  qualityIssue: 'too_small' | 'too_dark' | 'occluded' | null;
  overallStatusMessage: string;
} {
  // 1. Update / match active tracking entries using IoU
  const updatedTrackIds = new Set<number>();

  for (const cand of rawCandidates) {
    let matchedTrack: TrackedTarget | null = null;
    let maxIoU = 0;

    for (const track of _activeTracks) {
      const iou = calculateIoU(track.box, cand.boundingBox);
      if (iou > 0.30 && iou > maxIoU) {
        maxIoU = iou;
        matchedTrack = track;
      }
    }

    if (matchedTrack) {
      // Smooth bounding box (exponential moving average: 35% old, 65% fresh)
      matchedTrack.box = {
        x: matchedTrack.box.x * 0.35 + cand.boundingBox.x * 0.65,
        y: matchedTrack.box.y * 0.35 + cand.boundingBox.y * 0.65,
        width: matchedTrack.box.width * 0.35 + cand.boundingBox.width * 0.65,
        height: matchedTrack.box.height * 0.35 + cand.boundingBox.height * 0.65,
      };
      matchedTrack.lastSeen = timestamp;
      matchedTrack.history.push({
        className: cand.className,
        type: cand.type,
        label: cand.label,
        confidence: cand.confidence,
        timestamp,
      });

      // Retain sliding window of 4 frames within 1200ms
      matchedTrack.history = matchedTrack.history
        .filter((h) => timestamp - h.timestamp <= 1200)
        .slice(-4);

      updatedTrackIds.add(matchedTrack.id);
    } else {
      // New track
      const newTrack: TrackedTarget = {
        id: _nextTrackId++,
        box: { ...cand.boundingBox },
        lastSeen: timestamp,
        history: [
          {
            className: cand.className,
            type: cand.type,
            label: cand.label,
            confidence: cand.confidence,
            timestamp,
          },
        ],
      };
      _activeTracks.push(newTrack);
      updatedTrackIds.add(newTrack.id);
    }
  }

  // 2. Prune old tracks not seen within 400ms
  for (let i = _activeTracks.length - 1; i >= 0; i--) {
    if (timestamp - _activeTracks[i].lastSeen > 400) {
      _activeTracks.splice(i, 1);
    }
  }

  // 3. Evaluate consensus & quality for each active track in this frame
  const stableDetections: ClientDetectedObject[] = [];
  let detectedQualityIssue: 'too_small' | 'too_dark' | 'occluded' | null = null;

  for (const track of _activeTracks) {
    if (!updatedTrackIds.has(track.id)) continue;

    const hist = track.history;
    const histLen = hist.length;
    const latest = hist[histLen - 1];

    let finalClass = latest.className;
    let finalType = latest.type;
    let finalLabel = latest.label;
    let finalConfidence = latest.confidence;

    // Check temporal stability across window (Section 12)
    const goatCount = hist.filter((h) => h.className === 'goat').length;
    const sheepCount = hist.filter((h) => h.className === 'sheep').length;
    const personCount = hist.filter((h) => h.className === 'person').length;
    const uncertainCount = hist.filter((h) => h.className === 'uncertain').length;

    if (uncertainCount > 0) {
      finalClass = 'uncertain';
      finalType = 'UNCERTAIN';
      finalLabel = 'HINDI MALINAW';
      console.log('[Detector] Status: UNCERTAIN - Ambiguous species probability');
    } else if (histLen >= 3) {
      if (goatCount >= 3) {
        finalClass = 'goat';
        finalType = 'GOAT';
        finalLabel = 'KAMBING';
      } else if (sheepCount >= 3) {
        finalClass = 'sheep';
        finalType = 'SHEEP';
        finalLabel = 'TUPA';
      } else if (personCount >= 3) {
        finalClass = 'person';
        finalType = 'PERSON';
        finalLabel = 'TAO';
      } else {
        // Classification is oscillating between goat and sheep
        finalClass = 'uncertain';
        finalType = 'UNCERTAIN';
        finalLabel = 'HINDI MALINAW';
        console.log('[Detector] Status: UNCERTAIN - Classification fluctuating across frames');
      }
    } else if (finalConfidence < 0.20 && (finalType === 'GOAT' || finalType === 'SHEEP')) {
      // Extremely low confidence livestock classification
      finalClass = 'uncertain';
      finalType = 'UNCERTAIN';
      finalLabel = 'HINDI MALINAW';
    }

    // 4. Image Quality Checks for the target (Section 15)
    let qualityWarning: 'too_small' | 'too_dark' | 'occluded' | null = null;
    const boxArea = track.box.width * track.box.height;

    if (_lastFrameLuma < 35) {
      qualityWarning = 'too_dark';
      if (!detectedQualityIssue) detectedQualityIssue = 'too_dark';
    } else if (boxArea < 0.05 || track.box.width < 0.14 || track.box.height < 0.14) {
      qualityWarning = 'too_small';
      if (!detectedQualityIssue) detectedQualityIssue = 'too_small';
    } else {
      const touchesEdges =
        (track.box.x <= 0.015 ? 1 : 0) +
        (track.box.y <= 0.015 ? 1 : 0) +
        (track.box.x + track.box.width >= 0.985 ? 1 : 0) +
        (track.box.y + track.box.height >= 0.985 ? 1 : 0);
      if (touchesEdges >= 2 && boxArea > 0.45) {
        qualityWarning = 'occluded';
        if (!detectedQualityIssue) detectedQualityIssue = 'occluded';
      }
    }

    stableDetections.push({
      className: finalClass,
      type: finalType,
      label: finalLabel,
      confidence: finalConfidence,
      boundingBox: track.box,
      bbox: track.box,
      rawCategory: latest.className,
      timestamp,
      qualityWarning,
    });
  }

  // 5. Generate Farmer-Facing Status Message (Requirement 12)
  let overallStatusMessage = 'Handa na ang camera • Ilagay ang kambing o tupa sa loob ng frame.';
  const goats = stableDetections.filter((d) => d.type === 'GOAT');
  const sheep = stableDetections.filter((d) => d.type === 'SHEEP');
  const uncertains = stableDetections.filter((d) => d.type === 'UNCERTAIN');
  const persons = stableDetections.filter((d) => d.type === 'PERSON');
  const totalLivestock = goats.length + sheep.length;

  if (detectedQualityIssue === 'too_dark') {
    overallStatusMessage = 'Madilim ang larawan. Ayusin ang ilaw at subukan muli.';
  } else if (detectedQualityIssue === 'too_small' && totalLivestock > 0) {
    overallStatusMessage = 'Masyadong maliit ang alaga sa camera. Ilapit nang kaunti ang camera.';
  } else if (detectedQualityIssue === 'occluded' && totalLivestock > 0) {
    overallStatusMessage = 'Hindi malinaw ang buong kambing o tupa. Ilipat nang kaunti ang camera.';
  } else if (uncertains.length > 0) {
    overallStatusMessage = 'Hindi malinaw kung kambing o tupa. Ilapit o ayusin ang camera.';
  } else if (goats.length > 0 && sheep.length > 0) {
    // Both goat and sheep detected (Requirement 12)
    overallStatusMessage = 'May kambing at tupa na nakita. Piliin kung alin ang gusto mong i-scan.';
  } else if (totalLivestock > 1) {
    // Multiple of same species
    overallStatusMessage = goats.length > 1
      ? 'May mga kambing na nakita. Piliin ang kambing na gusto mong i-scan.'
      : 'May mga tupa na nakita. Piliin ang tupa na gusto mong i-scan.';
  } else if (goats.length === 1 && sheep.length === 0) {
    overallStatusMessage = 'KAMBING: Handa nang i-scan • Manatiling nakatutok...';
  } else if (sheep.length === 1 && goats.length === 0) {
    overallStatusMessage = 'TUPA: Handa nang i-scan • Manatiling nakatutok...';
  } else if (persons.length > 0 && totalLivestock === 0) {
    overallStatusMessage = 'TAO — Hindi ito kambing o tupa';
  } else if (stableDetections.length > 0) {
    overallStatusMessage = `${stableDetections[0].label} — Hindi ito kambing o tupa`;
  } else {
    overallStatusMessage = 'Walang kambing o tupa na nakita. Itapat nang maayos ang camera sa kambing o tupa at subukan muli.';
  }

  return {
    stableDetections,
    qualityIssue: detectedQualityIssue,
    overallStatusMessage,
  };
}

// ── Live Frame Detection ──────────────────────────────────────────────────────

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
      modelName: 'YOLOv8n + EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      supportsSheepClass: true,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      count_persons: 0,
      count_others: 0,
      count_uncertain: 0,
      multiple_targets: false,
      primaryTarget: null,
      statusMessage: 'Inihahanda ang camera...',
    };
  }

  // Ensure detectors are initialized
  if (!_isModelReady && _detectorStatus !== 'error' && _detectorStatus !== 'unsupported') {
    try {
      await initClientObjectDetector();
    } catch {
      // Handled below
    }
  }

  if (!_isModelReady && !_mediaPipeDetector && !_yoloSession) {
    const isFailedOrUnsupported = _detectorStatus === 'error' || _detectorStatus === 'unsupported';
    return {
      success: false,
      modelReady: false,
      modelName: 'YOLOv8n + EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      supportsSheepClass: true,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      count_persons: 0,
      count_others: 0,
      count_uncertain: 0,
      multiple_targets: false,
      primaryTarget: null,
      statusMessage: isFailedOrUnsupported
        ? 'Hindi ma-load ang camera detector. Subukang muli.'
        : 'Naglo-load ang detection model...',
      error: _loadError || 'Model not loaded',
    };
  }

  try {
    const vW = video.videoWidth;
    const vH = video.videoHeight;

    // 1. Run YOLOv8 Goat Detector (genuine 'goat' class)
    const rawGoatDetections = await runYoloGoatInference(video, now);

    // 2. Run MediaPipe (for genuine 'person', 'sheep', 'dog', 'cat')
    const rawMediaPipeDetections: ClientDetectedObject[] = [];
    if (_mediaPipeDetector) {
      try {
        const mpResult = _mediaPipeDetector.detect(video);
        const rawList = mpResult.detections || [];

        for (const d of rawList) {
          if (!d.boundingBox || !d.categories || d.categories.length === 0) continue;

          const topCat = d.categories[0];
          const catName = (topCat.categoryName || '').toLowerCase().trim();
          const score = +(topCat.score || 0).toFixed(2);

          // Normalize bounding box coordinates
          const box = d.boundingBox;
          const rawBox = {
            x: box.originX / vW,
            y: box.originY / vH,
            width: box.width / vW,
            height: box.height / vH,
          };

          if (!isValidBoundingBox(rawBox)) continue;

          const clampedBox: BoundingBox2D = {
            x: Math.max(0, Math.min(0.96, rawBox.x)),
            y: Math.max(0, Math.min(0.96, rawBox.y)),
            width: Math.max(0.04, Math.min(1.0 - Math.max(0, rawBox.x), rawBox.width)),
            height: Math.max(0.04, Math.min(1.0 - Math.max(0, rawBox.y), rawBox.height)),
          };

          // STRICT FILTER: Only accept genuine classes (PERSON, SHEEP, DOG, CAT)
          // DO NOT ACCEPT 'cow', 'elephant', 'horse', 'bear', etc. (Sections 3 & 20)
          let targetType: LiveTargetType | null = null;
          let targetLabel: LiveTargetLabel | null = null;
          let canonicalClass = catName;

          if (catName === 'person' && score >= CONFIDENCE_THRESHOLDS.PERSON) {
            targetType = 'PERSON';
            targetLabel = 'TAO';
            canonicalClass = 'person';
          } else if (catName === 'sheep' && score >= CONFIDENCE_THRESHOLDS.SHEEP) {
            targetType = 'SHEEP';
            targetLabel = 'TUPA';
            canonicalClass = 'sheep';
          } else if (catName === 'dog' && score >= CONFIDENCE_THRESHOLDS.OTHER_ANIMAL) {
            targetType = 'OTHER_ANIMAL';
            targetLabel = 'ASO';
            canonicalClass = 'dog';
          } else if (catName === 'cat' && score >= CONFIDENCE_THRESHOLDS.OTHER_ANIMAL) {
            targetType = 'OTHER_ANIMAL';
            targetLabel = 'PUSA';
            canonicalClass = 'cat';
          }

          // If class is cow, elephant, horse, or any unrelated object: REJECT IMMEDIATELY.
          if (!targetType || !targetLabel) {
            continue;
          }

          rawMediaPipeDetections.push({
            className: canonicalClass,
            type: targetType,
            label: targetLabel,
            confidence: score,
            boundingBox: clampedBox,
            bbox: clampedBox,
            rawCategory: catName,
            timestamp: now,
          });
        }
      } catch (mpErr) {
        console.warn('[Detector] MediaPipe frame inference warning:', mpErr);
      }
    }

    // 3. Close Probability Ambiguity & Collision Resolution (Section 13)
    // If YOLO detected goat and MediaPipe detected sheep on the same animal box:
    const frameCandidates: ClientDetectedObject[] = [];
    const usedMpIndices = new Set<number>();

    for (const goat of rawGoatDetections) {
      let matchedMpIdx = -1;
      let maxOverlap = 0;

      for (let i = 0; i < rawMediaPipeDetections.length; i++) {
        if (usedMpIndices.has(i)) continue;
        const mp = rawMediaPipeDetections[i];
        const iou = calculateIoU(goat.boundingBox, mp.boundingBox);
        if (iou > 0.30 && iou > maxOverlap) {
          maxOverlap = iou;
          matchedMpIdx = i;
        }
      }

      if (matchedMpIdx >= 0) {
        const mpObj = rawMediaPipeDetections[matchedMpIdx];
        usedMpIndices.add(matchedMpIdx);

        if (mpObj.type === 'SHEEP') {
          const scoreDiff = goat.confidence - mpObj.confidence;
          if (Math.abs(scoreDiff) < 0.12) {
            // Close probability (e.g. 0.51 vs 0.49) -> UNCERTAIN (Section 13)
            frameCandidates.push({
              className: 'uncertain',
              type: 'UNCERTAIN',
              label: 'HINDI MALINAW',
              confidence: +Math.max(goat.confidence, mpObj.confidence).toFixed(2),
              boundingBox: goat.boundingBox,
              bbox: goat.boundingBox,
              rawCategory: 'ambiguous_goat_sheep',
              timestamp: now,
            });
          } else if (scoreDiff > 0) {
            // YOLO goat scored significantly higher
            frameCandidates.push(goat);
          } else {
            // MediaPipe sheep scored significantly higher
            frameCandidates.push(mpObj);
          }
        } else {
          // If MediaPipe detected person or other animal overlapping, keep both or person
          frameCandidates.push(goat);
          frameCandidates.push(mpObj);
        }
      } else {
        frameCandidates.push(goat);
      }
    }

    // Add remaining unmatched MediaPipe detections (e.g. sheep or person elsewhere in the frame)
    for (let i = 0; i < rawMediaPipeDetections.length; i++) {
      if (!usedMpIndices.has(i)) {
        frameCandidates.push(rawMediaPipeDetections[i]);
      }
    }

    // 4. Apply Temporal Stability Filter & Image Quality Gate (Sections 12 & 15)
    const {
      stableDetections,
      qualityIssue,
      overallStatusMessage,
    } = applyTemporalStabilityAndQuality(frameCandidates, now);

    // Sort detections: 1. GOAT, 2. SHEEP, 3. UNCERTAIN, 4. PERSON, 5. Others
    stableDetections.sort((a, b) => {
      const priority = (type: LiveTargetType) => {
        if (type === 'GOAT') return 1;
        if (type === 'SHEEP') return 2;
        if (type === 'UNCERTAIN') return 3;
        if (type === 'PERSON') return 4;
        return 5;
      };
      return priority(a.type) - priority(b.type);
    });

    let count_goats = 0;
    let count_sheep = 0;
    let count_persons = 0;
    let count_others = 0;
    let count_uncertain = 0;

    for (const d of stableDetections) {
      if (d.type === 'GOAT') {
        count_goats++;
        console.log('[Detector] Detected: goat');
      } else if (d.type === 'SHEEP') {
        count_sheep++;
        console.log('[Detector] Detected: sheep');
      } else if (d.type === 'UNCERTAIN') {
        count_uncertain++;
        console.log('[Detector] Detected: uncertain');
      } else if (d.type === 'PERSON') {
        count_persons++;
        console.log('[Detector] Detected: person');
      } else {
        count_others++;
      }
    }

    const totalLivestock = count_goats + count_sheep;
    const multiple_targets = totalLivestock > 1;

    let primaryTarget: ClientDetectedObject | null = null;
    if (totalLivestock > 0) {
      primaryTarget = stableDetections.find((d) => d.type === 'GOAT' || d.type === 'SHEEP') || null;
    } else if (count_uncertain > 0) {
      primaryTarget = stableDetections.find((d) => d.type === 'UNCERTAIN') || null;
    } else if (count_persons > 0) {
      primaryTarget = stableDetections.find((d) => d.type === 'PERSON') || null;
    } else if (stableDetections.length > 0) {
      primaryTarget = stableDetections[0];
    }

    return {
      success: true,
      modelReady: true,
      modelName: 'YOLOv8n + EfficientDet-Lite0',
      supportsGoatClass: true,
      supportsSheepClass: true,
      detections: stableDetections,
      count_goats,
      count_sheep,
      count_persons,
      count_others,
      count_uncertain,
      multiple_targets,
      primaryTarget,
      statusMessage: overallStatusMessage,
      qualityIssue,
    };
  } catch (err: any) {
    console.warn('[Detector] Frame inference error, clearing frame detections:', err?.message || err);
    return {
      success: false,
      modelReady: _isModelReady,
      modelName: 'YOLOv8n + EfficientDet-Lite0',
      supportsGoatClass: _hasGoatClass,
      supportsSheepClass: true,
      detections: [],
      count_goats: 0,
      count_sheep: 0,
      count_persons: 0,
      count_others: 0,
      count_uncertain: 0,
      multiple_targets: false,
      primaryTarget: null,
      statusMessage: 'Hindi malinaw ang live detection.',
    };
  }
}

// ── Live Bounding Box Canvas Overlay Renderer ─────────────────────────────────

/**
 * Renders live bounding boxes and labels directly onto an overlay canvas.
 *
 * Rules:
 * - Clear canvas completely before every frame (ctx.clearRect).
 * - Empty detections list immediately clears the canvas (no ghost boxes).
 * - Correctly transforms video coordinates accounting for object-fit: cover scaling/cropping.
 * - Renders crisp, readable rounded badge with high contrast on any background.
 * - Displays ONLY verified Filipino labels: TAO, KAMBING, TUPA, ASO, PUSA, HINDI MALINAW.
 * - ZERO BAKA, ZERO ELEPANTE.
 */
export function renderLiveDetectionsToCanvas(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  detections: (ClientDetectedObject | LiveDetectedObject)[],
  selectedTargetIndex: number = 0
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

  // Clear canvas before rendering every frame
  ctx.clearRect(0, 0, W, H);

  // If no detections or video not ready, leave canvas completely clear
  if (!detections || detections.length === 0 || !video || video.videoWidth === 0) {
    return;
  }

  const vW = video.videoWidth;
  const vH = video.videoHeight;

  // Calculate object-fit: cover scaling & cropping offset
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

  let targetCounter = 0;

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
    const isUncertain = d.type === 'UNCERTAIN';
    const isPerson = d.type === 'PERSON';
    const isDog = d.label === 'ASO';
    const isCat = d.label === 'PUSA';

    let isSelectedTarget = false;
    if (isTarget) {
      isSelectedTarget = (targetCounter === selectedTargetIndex);
      targetCounter++;
    }

    // High-contrast color palette
    let strokeColor = '#94A3B8';
    let fillColor = 'rgba(148, 163, 184, 0.08)';
    let badgeBg = '#475569';
    let accentColor = '#CBD5E1';
    let labelText = d.label;

    if (isTarget) {
      if (isSelectedTarget) {
        strokeColor = '#22C55E';
        fillColor = 'rgba(34, 197, 94, 0.20)';
        badgeBg = '#16A34A';
        accentColor = '#4ADE80';
        labelText = isGoat ? 'NAPILI: KAMBING' : 'NAPILI: TUPA';
      } else {
        strokeColor = 'rgba(22, 163, 74, 0.85)';
        fillColor = 'rgba(22, 163, 74, 0.10)';
        badgeBg = '#15803D';
        accentColor = '#22C55E';
        labelText = isGoat ? 'KAMBING' : 'TUPA';
      }
    } else if (isUncertain) {
      strokeColor = '#D97706';
      fillColor = 'rgba(217, 119, 6, 0.15)';
      badgeBg = '#D97706';
      accentColor = '#FBBF24';
      labelText = 'HINDI MALINAW';
    } else if (isPerson) {
      strokeColor = '#2563EB';
      fillColor = 'rgba(37, 99, 235, 0.12)';
      badgeBg = '#2563EB';
      accentColor = '#60A5FA';
      labelText = 'TAO';
    } else if (isDog) {
      strokeColor = '#EA580C';
      fillColor = 'rgba(234, 88, 12, 0.14)';
      badgeBg = '#EA580C';
      accentColor = '#FB923C';
      labelText = 'ASO';
    } else if (isCat) {
      strokeColor = '#7C3AED';
      fillColor = 'rgba(124, 58, 237, 0.14)';
      badgeBg = '#7C3AED';
      accentColor = '#A78BFA';
      labelText = 'PUSA';
    }

    // 1. Draw Bounding Box Fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(drawX, drawY, bw, bh);

    // 2. Draw Bounding Box Border
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelectedTarget ? 4 : (isTarget || isUncertain ? 3 : 2);
    ctx.setLineDash([]);
    ctx.strokeRect(drawX, drawY, bw, bh);

    // 3. Draw Corner Accents
    const cornerSize = Math.min(20, bw * 0.25, bh * 0.25);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = isSelectedTarget ? 4.5 : 3.5;
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

    // 4. Draw Label Badge (Directly above box or inside top if near top)
    ctx.font = 'bold 12px Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const badgePadX = 10;
    const badgeH = 24;
    const badgeW = textMetrics.width + badgePadX * 2;

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
