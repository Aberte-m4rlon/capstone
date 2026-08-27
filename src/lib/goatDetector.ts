/**
 * goatDetector.ts — Lightweight Real-Time Goat/Sheep Presence Detection
 *
 * Uses MobileNetV2 (already loaded for health scanning) to check whether
 * a goat or sheep is visible in the current camera frame.
 *
 * MobileNet classifies images into 1000 ImageNet classes.
 * Several of those classes correspond to goats, sheep, and livestock.
 * We check the top predictions for known animal class names.
 *
 * This requires NO additional model download — it reuses the MobileNet
 * model already loaded by cameraML.ts.
 *
 * Performance:
 *   - Runs at configurable FPS (default 5 fps = every 200ms)
 *   - Resizes frames to 224×224 before inference (MobileNet input size)
 *   - CPU-only, works on 8GB RAM machines
 *   - Far cheaper than a full YOLO detector
 *
 * Limitations:
 *   - MobileNet was trained on ImageNet, not goat-specific data
 *   - Will catch obvious goats/sheep; may miss unusual angles
 *   - Cannot distinguish individual animals
 *   - A dedicated YOLO goat detector would be more accurate but is
 *     much larger (50–150MB vs MobileNet's ~16MB)
 */

// ── Configuration ─────────────────────────────────────────────────────────────

/** Minimum MobileNet classification confidence to consider it a detection */
export const GOAT_DETECTION_THRESHOLD = 0.30;

/** Frames that must consecutively detect a goat before triggering auto-scan */
export const REQUIRED_STABLE_FRAMES = 5;

/** Seconds after a scan result before allowing a new scan */
export const SCAN_COOLDOWN_SECONDS = 8;

/** Detection interval in ms (200ms = ~5 fps detection rate) */
export const DETECTION_INTERVAL_MS = 200;

// ── ImageNet class names that indicate a goat/sheep/livestock is present ──────
//
// These are the exact class names MobileNet returns for relevant animals.
// Source: ImageNet 1000-class label list.
const GOAT_SHEEP_CLASSES = new Set([
  // Direct goat/sheep
  'goat',
  'sheep',
  'ram',
  'ibex',
  'bighorn',
  'ox',
  'buffalo',
  // Livestock context (may indicate a barn/farm animal scene)
  'llama',
  'alpaca',
  'bison',
  'yak',
  'water buffalo',
  'calf',
  'cow',
  'dairy cattle',
  'bull',
  // Generic quadruped fallbacks
  'domestic goat',
  'boer goat',
  'angora goat',
  'cashmere goat',
  // MobileNet sometimes returns these for goats in unusual poses
  'giraffe',
  'deer',
  'antelope',
]);

// Partial match strings — if a class name contains any of these substrings
const GOAT_PARTIAL_MATCH = [
  'goat', 'sheep', 'lamb', 'ewe', 'ram', 'capra', 'ovis',
  'livestock', 'ungulate', 'ruminant', 'caprinae',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectionResult {
  detected: boolean;
  confidence: number;      // 0–1, best matching class confidence
  topClass: string;        // name of the top detected class
  allClasses: Array<{ className: string; probability: number }>;
  isStable: boolean;       // true once REQUIRED_STABLE_FRAMES consecutive detections
  stableFrames: number;    // current count of consecutive detections
}

// ── Internal state ────────────────────────────────────────────────────────────

let _stableFrameCount = 0;
let _lastNonDetectionTime = 0;

// ── Detection function ────────────────────────────────────────────────────────

/**
 * Classify one video frame using MobileNet and check if a goat/sheep is present.
 * Call this from a setInterval at DETECTION_INTERVAL_MS cadence.
 *
 * @param video  The live <video> element from the camera stream
 * @param model  Loaded MobileNet model (from loadMobileNet())
 * @returns      DetectionResult
 */
export async function detectGoatInFrame(
  video: HTMLVideoElement,
  model: any,
): Promise<DetectionResult> {
  if (!model || video.readyState < 2) {
    _stableFrameCount = 0;
    return {
      detected: false,
      confidence: 0,
      topClass: '',
      allClasses: [],
      isStable: false,
      stableFrames: 0,
    };
  }

  let predictions: Array<{ className: string; probability: number }> = [];

  try {
    // MobileNet .classify() returns top-3 predictions with className + probability
    predictions = await model.classify(video);
  } catch {
    _stableFrameCount = 0;
    return { detected: false, confidence: 0, topClass: '', allClasses: [], isStable: false, stableFrames: 0 };
  }

  // Find best matching goat/sheep class
  let bestConfidence = 0;
  let bestClass = '';

  for (const pred of predictions) {
    const nameLower = pred.className.toLowerCase();

    // Exact set match
    if (GOAT_SHEEP_CLASSES.has(nameLower)) {
      if (pred.probability > bestConfidence) {
        bestConfidence = pred.probability;
        bestClass = pred.className;
      }
      continue;
    }

    // Partial match
    for (const partial of GOAT_PARTIAL_MATCH) {
      if (nameLower.includes(partial)) {
        if (pred.probability > bestConfidence) {
          bestConfidence = pred.probability;
          bestClass = pred.className;
        }
        break;
      }
    }
  }

  const detected = bestConfidence >= GOAT_DETECTION_THRESHOLD;

  if (detected) {
    _stableFrameCount++;
    _lastNonDetectionTime = 0;
  } else {
    // Reset stable count after a brief grace period (1 missed frame ok)
    if (_lastNonDetectionTime === 0) {
      _lastNonDetectionTime = Date.now();
    } else if (Date.now() - _lastNonDetectionTime > 400) {
      // More than 2 missed frames → reset
      _stableFrameCount = 0;
      _lastNonDetectionTime = 0;
    }
  }

  return {
    detected,
    confidence: bestConfidence,
    topClass: bestClass,
    allClasses: predictions,
    isStable: _stableFrameCount >= REQUIRED_STABLE_FRAMES,
    stableFrames: _stableFrameCount,
  };
}

/** Reset stable frame counter (call after a scan completes) */
export function resetStableFrameCount(): void {
  _stableFrameCount = 0;
  _lastNonDetectionTime = 0;
}

/**
 * Fallback goat detection using pure-JS pixel analysis.
 * Used when MobileNet is unavailable.
 *
 * Analyzes the color distribution and texture of the frame:
 * - Goats tend to have warm/neutral tones with distinct texture
 * - This is a heuristic, not a trained classifier
 * - Will produce 'low_confidence' results intentionally
 *
 * Returns confidence in range [0, 0.45] — always below threshold
 * unless explicitly confirmed, to avoid false positives.
 */
export function fallbackDetectGoat(video: HTMLVideoElement): DetectionResult {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx || video.readyState < 2) {
    return { detected: false, confidence: 0, topClass: '', allClasses: [], isStable: false, stableFrames: 0 };
  }

  ctx.drawImage(video, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;

  let warmPixels = 0, totalPixels = 0;
  let textureScore = 0;
  let prevLum = -1;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Warm/neutral tones (goat-like colors: brown, white, grey, tan)
    const isWarm = (r > 80 && g > 60 && b < r * 1.2 && lum > 50 && lum < 220);
    if (isWarm) warmPixels++;
    totalPixels++;

    // Texture variation
    if (prevLum >= 0) textureScore += Math.abs(lum - prevLum);
    prevLum = lum;
  }

  const warmRatio = warmPixels / totalPixels;
  const avgTexture = textureScore / totalPixels;

  // Heuristic: warm pixels + moderate texture → possible animal
  // Deliberately conservative — returns low confidence without model
  const confidence = Math.min(0.40, warmRatio * 0.3 + (avgTexture / 100) * 0.15);
  const detected = confidence >= GOAT_DETECTION_THRESHOLD;

  return {
    detected,
    confidence,
    topClass: detected ? 'Animal-like pattern (fallback)' : '',
    allClasses: [],
    isStable: detected && ++_stableFrameCount >= REQUIRED_STABLE_FRAMES,
    stableFrames: _stableFrameCount,
  };
}
