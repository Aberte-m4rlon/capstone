/**
 * goatDetector.ts — Goat / Sheep / Other Object Detection
 *
 * Uses MobileNetV2's classify() output (1000 ImageNet classes) to
 * distinguish between:
 *   TARGET   → goat | sheep  → proceed to health screening
 *   OTHER    → dog, cat, person, car, etc. → block health screening
 *   NOTHING  → below threshold → "Looking for a goat or sheep..."
 *
 * Key upgrade over the previous version:
 *   - Returns `detectedSpecies` ('goat' | 'sheep' | null)
 *   - Returns `nonTargetClass` (human-readable name when OTHER detected)
 *   - `detected` only true for goat or sheep
 *   - `otherDetected` true when a non-target object is clearly seen
 *
 * THRESHOLDS (all configurable):
 *   OBJECT_DETECTION_THRESHOLD  = 0.25  minimum to consider any detection
 *   GOAT_DETECTION_THRESHOLD    = 0.25  minimum for goat/sheep
 *   REQUIRED_STABLE_FRAMES      = 5     consecutive frames needed
 *   SCAN_COOLDOWN_SECONDS       = 8     wait after result before next scan
 *   DETECTION_INTERVAL_MS       = 200   ~5 FPS detection cadence
 */

// ── Configurable constants ────────────────────────────────────────────────────

export const OBJECT_DETECTION_THRESHOLD = 0.25;
export const GOAT_DETECTION_THRESHOLD   = 0.25;   // same as object threshold
export const REQUIRED_STABLE_FRAMES     = 5;
export const SCAN_COOLDOWN_SECONDS      = 8;
export const DETECTION_INTERVAL_MS      = 200;

// ── ImageNet classes → species mapping ───────────────────────────────────────
//
// MobileNet returns comma-separated class names (e.g. "goat" or "ram, tup").
// We map each known class to 'goat', 'sheep', or 'other'.

type Species = 'goat' | 'sheep' | 'other';

interface ClassMapping {
  species: Species;
  displayName: string;   // what to show in the UI
  emoji: string;
}

// Full ImageNet synset → species map
// Source: ImageNet 1000-class labels (https://gist.github.com/yrevar/942d3a0ac09ec9e5eb3a)
const CLASS_MAP: Record<string, ClassMapping> = {
  // ── GOAT (n02416519, n02417914) ──────────────────────────────────────────
  'goat':           { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },
  'ibex':           { species: 'goat',  displayName: 'Goat (Ibex)',  emoji: '🐐' },
  'domestic goat':  { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },
  'boer goat':      { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },
  'angora goat':    { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },
  'cashmere goat':  { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },
  'nanny':          { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },
  'billy':          { species: 'goat',  displayName: 'Goat',  emoji: '🐐' },

  // ── SHEEP (n10588074, n02412080) ─────────────────────────────────────────
  'sheep':          { species: 'sheep', displayName: 'Sheep', emoji: '🐑' },
  'ram':            { species: 'sheep', displayName: 'Sheep (Ram)', emoji: '🐑' },
  'tup':            { species: 'sheep', displayName: 'Sheep', emoji: '🐑' },
  'ewe':            { species: 'sheep', displayName: 'Sheep (Ewe)', emoji: '🐑' },
  'lamb':           { species: 'sheep', displayName: 'Sheep (Lamb)', emoji: '🐑' },
  'bighorn':        { species: 'sheep', displayName: 'Sheep (Bighorn)', emoji: '🐑' },
  'merino':         { species: 'sheep', displayName: 'Sheep (Merino)', emoji: '🐑' },

  // ── NON-TARGET (shown in "not a goat/sheep" message) ─────────────────────
  'dog':            { species: 'other', displayName: 'Dog',    emoji: '🐕' },
  'cat':            { species: 'other', displayName: 'Cat',    emoji: '🐈' },
  'person':         { species: 'other', displayName: 'Person', emoji: '🧑' },
  'man':            { species: 'other', displayName: 'Person', emoji: '🧑' },
  'woman':          { species: 'other', displayName: 'Person', emoji: '🧑' },
  'human':          { species: 'other', displayName: 'Person', emoji: '🧑' },
  'face':           { species: 'other', displayName: 'Person', emoji: '🧑' },
  'cow':            { species: 'other', displayName: 'Cow',    emoji: '🐄' },
  'cattle':         { species: 'other', displayName: 'Cow',    emoji: '🐄' },
  'bull':           { species: 'other', displayName: 'Cow',    emoji: '🐄' },
  'calf':           { species: 'other', displayName: 'Calf',   emoji: '🐄' },
  'horse':          { species: 'other', displayName: 'Horse',  emoji: '🐴' },
  'pony':           { species: 'other', displayName: 'Horse',  emoji: '🐴' },
  'chicken':        { species: 'other', displayName: 'Chicken', emoji: '🐔' },
  'rooster':        { species: 'other', displayName: 'Chicken', emoji: '🐔' },
  'hen':            { species: 'other', displayName: 'Chicken', emoji: '🐔' },
  'bird':           { species: 'other', displayName: 'Bird',   emoji: '🐦' },
  'pig':            { species: 'other', displayName: 'Pig',    emoji: '🐖' },
  'hog':            { species: 'other', displayName: 'Pig',    emoji: '🐖' },
  'car':            { species: 'other', displayName: 'Car',    emoji: '🚗' },
  'truck':          { species: 'other', displayName: 'Vehicle', emoji: '🚛' },
  'motorcycle':     { species: 'other', displayName: 'Motorcycle', emoji: '🏍️' },
  'bicycle':        { species: 'other', displayName: 'Bicycle', emoji: '🚲' },
  'chair':          { species: 'other', displayName: 'Object', emoji: '🪑' },
  'table':          { species: 'other', displayName: 'Object', emoji: '🪑' },
  'llama':          { species: 'other', displayName: 'Llama',  emoji: '🦙' },
  'alpaca':         { species: 'other', displayName: 'Alpaca', emoji: '🦙' },
  'deer':           { species: 'other', displayName: 'Deer',   emoji: '🦌' },
  'elephant':       { species: 'other', displayName: 'Elephant', emoji: '🐘' },
  'giraffe':        { species: 'other', displayName: 'Giraffe', emoji: '🦒' },
  'zebra':          { species: 'other', displayName: 'Zebra',  emoji: '🦓' },
};

// Partial string matches for class names not in the map above
interface PartialMatch { substr: string; species: Species; displayName: string; emoji: string }
const PARTIAL_MATCHES: PartialMatch[] = [
  // Goat substrings
  { substr: 'goat',  species: 'goat',  displayName: 'Goat',   emoji: '🐐' },
  { substr: 'capra', species: 'goat',  displayName: 'Goat',   emoji: '🐐' },
  { substr: 'caprine', species: 'goat', displayName: 'Goat',  emoji: '🐐' },
  // Sheep substrings
  { substr: 'sheep', species: 'sheep', displayName: 'Sheep',  emoji: '🐑' },
  { substr: 'lamb',  species: 'sheep', displayName: 'Sheep',  emoji: '🐑' },
  { substr: 'ewe',   species: 'sheep', displayName: 'Sheep',  emoji: '🐑' },
  { substr: ' ram',  species: 'sheep', displayName: 'Sheep',  emoji: '🐑' },
  { substr: 'ovis',  species: 'sheep', displayName: 'Sheep',  emoji: '🐑' },
  { substr: 'merino',species: 'sheep', displayName: 'Sheep',  emoji: '🐑' },
  // Non-target substrings
  { substr: 'dog',   species: 'other', displayName: 'Dog',    emoji: '🐕' },
  { substr: 'cat',   species: 'other', displayName: 'Cat',    emoji: '🐈' },
  { substr: 'person',species: 'other', displayName: 'Person', emoji: '🧑' },
  { substr: 'human', species: 'other', displayName: 'Person', emoji: '🧑' },
  { substr: 'cow',   species: 'other', displayName: 'Cow',    emoji: '🐄' },
  { substr: 'cattle',species: 'other', displayName: 'Cow',    emoji: '🐄' },
  { substr: 'horse', species: 'other', displayName: 'Horse',  emoji: '🐴' },
  { substr: 'bird',  species: 'other', displayName: 'Bird',   emoji: '🐦' },
  { substr: 'chick', species: 'other', displayName: 'Chicken',emoji: '🐔' },
  { substr: 'pig',   species: 'other', displayName: 'Pig',    emoji: '🐖' },
  { substr: 'car',   species: 'other', displayName: 'Car',    emoji: '🚗' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectionResult {
  /** True only if a GOAT or SHEEP was detected above threshold */
  detected: boolean;
  /** True if a NON-TARGET object was detected above threshold */
  otherDetected: boolean;
  /** 'goat' | 'sheep' | null — only set when detected is true */
  detectedSpecies: 'goat' | 'sheep' | null;
  /** Human-readable class of non-target object, e.g. "Dog", "Person" */
  nonTargetClass: string | null;
  /** Emoji for the detected class */
  detectedEmoji: string;
  /** Confidence 0–1 */
  confidence: number;
  /** Raw MobileNet top class name */
  topClass: string;
  /** All MobileNet top predictions */
  allClasses: Array<{ className: string; probability: number }>;
  /** True once REQUIRED_STABLE_FRAMES consecutive goat/sheep detections */
  isStable: boolean;
  /** Current stable frame count */
  stableFrames: number;
}

// ── Internal state ────────────────────────────────────────────────────────────

let _stableFrameCount  = 0;
let _lastMissedTime    = 0;

// ── Class lookup ──────────────────────────────────────────────────────────────

function lookupClass(className: string): ClassMapping | null {
  const lower = className.toLowerCase().trim();

  // 1. Exact map lookup (check each word in comma-separated class name)
  const parts = lower.split(/[,\s]+/).filter(Boolean);
  for (const part of parts) {
    if (CLASS_MAP[part]) return CLASS_MAP[part];
  }

  // 2. Full string exact lookup
  if (CLASS_MAP[lower]) return CLASS_MAP[lower];

  // 3. Partial substring match
  for (const pm of PARTIAL_MATCHES) {
    if (lower.includes(pm.substr)) {
      return { species: pm.species, displayName: pm.displayName, emoji: pm.emoji };
    }
  }

  return null;
}

// ── Main detection function ───────────────────────────────────────────────────

/**
 * Classify one video frame using MobileNet and determine:
 *   - Is this a goat? → detected = true, detectedSpecies = 'goat'
 *   - Is this a sheep? → detected = true, detectedSpecies = 'sheep'
 *   - Is this something else? → otherDetected = true, nonTargetClass = 'Dog'
 *   - Nothing confident? → all false
 */
export async function detectGoatInFrame(
  video: HTMLVideoElement,
  model: any,
): Promise<DetectionResult> {
  const empty: DetectionResult = {
    detected: false, otherDetected: false,
    detectedSpecies: null, nonTargetClass: null,
    detectedEmoji: '', confidence: 0,
    topClass: '', allClasses: [],
    isStable: false, stableFrames: _stableFrameCount,
  };

  if (!model || video.readyState < 2) {
    _stableFrameCount = 0;
    return empty;
  }

  let predictions: Array<{ className: string; probability: number }> = [];
  try {
    predictions = await model.classify(video, 5); // top-5 predictions
  } catch {
    _stableFrameCount = 0;
    return empty;
  }

  // Find the best matching class across all top-5 predictions
  let bestGoatSheep: { mapping: ClassMapping; confidence: number; rawClass: string } | null = null;
  let bestOther:     { mapping: ClassMapping; confidence: number; rawClass: string } | null = null;

  for (const pred of predictions) {
    if (pred.probability < OBJECT_DETECTION_THRESHOLD) continue;
    const mapping = lookupClass(pred.className);
    if (!mapping) continue;

    if (mapping.species === 'goat' || mapping.species === 'sheep') {
      if (!bestGoatSheep || pred.probability > bestGoatSheep.confidence) {
        bestGoatSheep = { mapping, confidence: pred.probability, rawClass: pred.className };
      }
    } else if (mapping.species === 'other') {
      if (!bestOther || pred.probability > bestOther.confidence) {
        bestOther = { mapping, confidence: pred.probability, rawClass: pred.className };
      }
    }
  }

  const topPred = predictions[0] ?? { className: '', probability: 0 };

  // ── Decision: goat/sheep wins if confidence >= threshold ─────────────────
  if (bestGoatSheep && bestGoatSheep.confidence >= GOAT_DETECTION_THRESHOLD) {
    _stableFrameCount++;
    _lastMissedTime = 0;
    return {
      detected: true,
      otherDetected: false,
      detectedSpecies: bestGoatSheep.mapping.species as 'goat' | 'sheep',
      nonTargetClass: null,
      detectedEmoji: bestGoatSheep.mapping.emoji,
      confidence: bestGoatSheep.confidence,
      topClass: bestGoatSheep.rawClass,
      allClasses: predictions,
      isStable: _stableFrameCount >= REQUIRED_STABLE_FRAMES,
      stableFrames: _stableFrameCount,
    };
  }

  // ── Reset stable counter (with grace period for 1 missed frame) ───────────
  if (_lastMissedTime === 0) {
    _lastMissedTime = Date.now();
  } else if (Date.now() - _lastMissedTime > 400) {
    _stableFrameCount = 0;
    _lastMissedTime = 0;
  }

  // ── Other object detected ─────────────────────────────────────────────────
  if (bestOther && bestOther.confidence >= OBJECT_DETECTION_THRESHOLD) {
    return {
      detected: false,
      otherDetected: true,
      detectedSpecies: null,
      nonTargetClass: bestOther.mapping.displayName,
      detectedEmoji: bestOther.mapping.emoji,
      confidence: bestOther.confidence,
      topClass: bestOther.rawClass,
      allClasses: predictions,
      isStable: false,
      stableFrames: 0,
    };
  }

  // ── Nothing recognizable ──────────────────────────────────────────────────
  return {
    ...empty,
    topClass: topPred.className,
    allClasses: predictions,
    stableFrames: _stableFrameCount,
  };
}

/** Reset stable frame counter — call after a scan completes or goat leaves */
export function resetStableFrameCount(): void {
  _stableFrameCount = 0;
  _lastMissedTime   = 0;
}

/** Fallback pixel-analysis detection when MobileNet is unavailable */
export function fallbackDetectGoat(video: HTMLVideoElement): DetectionResult {
  const empty: DetectionResult = {
    detected: false, otherDetected: false,
    detectedSpecies: null, nonTargetClass: null,
    detectedEmoji: '', confidence: 0,
    topClass: '', allClasses: [],
    isStable: false, stableFrames: _stableFrameCount,
  };

  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx || video.readyState < 2) return empty;

  ctx.drawImage(video, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;

  let warm = 0, total = 0, texScore = 0, prevLum = -1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (r > 80 && g > 60 && b < r * 1.2 && lum > 50 && lum < 220) warm++;
    total++;
    if (prevLum >= 0) texScore += Math.abs(lum - prevLum);
    prevLum = lum;
  }

  const confidence = Math.min(0.38, (warm / total) * 0.3 + (texScore / total / 100) * 0.15);
  // Fallback never crosses GOAT_DETECTION_THRESHOLD to avoid false positives on non-goats
  return { ...empty, confidence, stableFrames: _stableFrameCount };
}
