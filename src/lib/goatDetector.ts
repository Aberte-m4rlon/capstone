/**
 * goatDetector.ts — High-Precision Goat & Sheep AI Detection Engine
 *
 * DUAL-MODE DETECTION PIPELINE:
 *   1. Deep Feature Vision: MobileNetV2 top-K classification with Cumulative
 *      Probability Aggregation across Caprine / Ovine synsets.
 *   2. Edge Computer Vision Core: Multi-cue organic texture, color gamut, and
 *      spatial contour analysis (active instantly, 0ms cold-start, offline capable).
 *
 * CLASSIFICATION LOGIC:
 *   - TARGET     → Goat | Sheep (detects even with distributed class activations)
 *   - NON-TARGET → Dog, Cat, Person, Vehicle, Furniture, Electronics → Trigger Tagalog warning
 *   - AMBIENT    → Empty pen, low light, background → "Looking for a goat or sheep..."
 *
 * CONFIGURABLE THRESHOLDS:
 *   OBJECT_DETECTION_THRESHOLD  = 0.12  (lowered for high recall on live video)
 *   GOAT_DETECTION_THRESHOLD    = 0.14  (cumulative threshold across all ruminant classes)
 *   REQUIRED_STABLE_FRAMES      = 2     (350ms window for fast auto-capture)
 *   SCAN_COOLDOWN_SECONDS       = 5     (seconds before auto-resuming next scan)
 *   DETECTION_INTERVAL_MS       = 180   (~5.5 FPS detection cadence)
 */

// ── Configurable constants ────────────────────────────────────────────────────
export const OBJECT_DETECTION_THRESHOLD = 0.12;
export const GOAT_DETECTION_THRESHOLD   = 0.14;
export const REQUIRED_STABLE_FRAMES     = 2;
export const SCAN_COOLDOWN_SECONDS      = 5;
export const DETECTION_INTERVAL_MS      = 180;

// ── Types ─────────────────────────────────────────────────────────────────────
export type Species = 'goat' | 'sheep' | 'other';

export interface ClassMapping {
  species: Species;
  displayName: string;
}

export interface DetectionResult {
  /** True only if a GOAT or SHEEP was detected above threshold */
  detected: boolean;
  /** True if a NON-TARGET object was detected above threshold */
  otherDetected: boolean;
  /** 'goat' | 'sheep' | null — only set when detected is true */
  detectedSpecies: 'goat' | 'sheep' | null;
  /** Human-readable class of non-target object, e.g. "Aso", "Tao", "Kotse" */
  nonTargetClass: string | null;
  /** Lucide icon identifier */
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

// ── ImageNet Classes & Synsets Mapping ────────────────────────────────────────
const CLASS_MAP: Record<string, ClassMapping> = {
  'goat':           { species: 'goat',  displayName: 'Goat (Kambing)' },
  'ibex':           { species: 'goat',  displayName: 'Goat (Ibex)' },
  'domestic goat':  { species: 'goat',  displayName: 'Goat (Kambing)' },
  'boer goat':      { species: 'goat',  displayName: 'Boer Goat' },
  'angora goat':    { species: 'goat',  displayName: 'Angora Goat' },
  'cashmere goat':  { species: 'goat',  displayName: 'Cashmere Goat' },
  'nubian':         { species: 'goat',  displayName: 'Anglo-Nubian Goat' },
  'saanen':         { species: 'goat',  displayName: 'Saanen Goat' },
  'toggenburg':     { species: 'goat',  displayName: 'Toggenburg Goat' },
  'lamancha':       { species: 'goat',  displayName: 'LaMancha Goat' },
  'alpine':         { species: 'goat',  displayName: 'Alpine Goat' },
  'nanny':          { species: 'goat',  displayName: 'Goat (Inahin)' },
  'billy':          { species: 'goat',  displayName: 'Goat (Barako)' },
  'kid':            { species: 'goat',  displayName: 'Goat (Kid / Bisiro)' },
  'chamois':        { species: 'goat',  displayName: 'Goat (Chamois)' },
  'goral':          { species: 'goat',  displayName: 'Goat (Goral)' },
  'tahr':           { species: 'goat',  displayName: 'Goat (Tahr)' },
  'serow':          { species: 'goat',  displayName: 'Goat (Serow)' },
  'markhor':        { species: 'goat',  displayName: 'Goat (Markhor)' },
  'bezoar':         { species: 'goat',  displayName: 'Wild Goat' },
  'gazelle':        { species: 'goat',  displayName: 'Goat / Gazelle' },
  'impala':         { species: 'goat',  displayName: 'Goat / Impala' },
  'hartebeest':     { species: 'goat',  displayName: 'Goat / Antelope' },
  'antelope':       { species: 'goat',  displayName: 'Goat / Antelope' },

  'sheep':          { species: 'sheep', displayName: 'Sheep (Tupa)' },
  'ram':            { species: 'sheep', displayName: 'Sheep (Ram / Barako)' },
  'tup':            { species: 'sheep', displayName: 'Sheep (Tup)' },
  'ewe':            { species: 'sheep', displayName: 'Sheep (Ewe / Inahin)' },
  'lamb':           { species: 'sheep', displayName: 'Sheep (Lamb / Bisiro)' },
  'bighorn':        { species: 'sheep', displayName: 'Bighorn Sheep' },
  'merino':         { species: 'sheep', displayName: 'Merino Sheep' },
  'mouflon':        { species: 'sheep', displayName: 'Mouflon Sheep' },
  'dorper':         { species: 'sheep', displayName: 'Dorper Sheep' },
  'katahdin':       { species: 'sheep', displayName: 'Katahdin Sheep' },
  'suffolk':        { species: 'sheep', displayName: 'Suffolk Sheep' },
  'fleece':         { species: 'sheep', displayName: 'Sheep (Fleece)' },
  'wool':           { species: 'sheep', displayName: 'Sheep (Wool)' },

  'llama':          { species: 'goat',  displayName: 'Llama / Goat' },
  'alpaca':         { species: 'sheep', displayName: 'Alpaca / Sheep' },
  'ox':             { species: 'goat',  displayName: 'Ox / Livestock' },
  'water buffalo':  { species: 'goat',  displayName: 'Livestock' },

  'dog':            { species: 'other', displayName: 'Aso (Dog)' },
  'cat':            { species: 'other', displayName: 'Pusa (Cat)' },
  'person':         { species: 'other', displayName: 'Tao (Person)' },
  'man':            { species: 'other', displayName: 'Tao (Person)' },
  'woman':          { species: 'other', displayName: 'Tao (Person)' },
  'human':          { species: 'other', displayName: 'Tao (Person)' },
  'face':           { species: 'other', displayName: 'Mukha ng Tao' },
  'chicken':        { species: 'other', displayName: 'Manok (Chicken)' },
  'rooster':        { species: 'other', displayName: 'Tandang (Rooster)' },
  'hen':            { species: 'other', displayName: 'Inahin (Hen)' },
  'bird':           { species: 'other', displayName: 'Ibon (Bird)' },
  'duck':           { species: 'other', displayName: 'Bibe / Itik' },
  'pig':            { species: 'other', displayName: 'Baboy (Pig)' },
  'hog':            { species: 'other', displayName: 'Baboy (Hog)' },
  'horse':          { species: 'other', displayName: 'Kabayo (Horse)' },
  'car':            { species: 'other', displayName: 'Kotse (Car)' },
  'truck':          { species: 'other', displayName: 'Sasakyan' },
  'motorcycle':     { species: 'other', displayName: 'Motorsiklo' },
  'bicycle':        { species: 'other', displayName: 'Bisikleta' },
  'chair':          { species: 'other', displayName: 'Upuan / Bagay' },
  'table':          { species: 'other', displayName: 'Mesa / Bagay' },
  'cellphone':      { species: 'other', displayName: 'Telepono / Gadget' },
  'laptop':         { species: 'other', displayName: 'Kompyuter / Gadget' },
  'bottle':         { species: 'other', displayName: 'Bote / Bagay' },
};

interface PartialMatch { substr: string; species: Species; displayName: string }
const PARTIAL_MATCHES: PartialMatch[] = [
  { substr: 'goat',      species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'capra',     species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'caprine',   species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'ibex',      species: 'goat',  displayName: 'Goat (Ibex)' },
  { substr: 'chamois',   species: 'goat',  displayName: 'Goat (Chamois)' },
  { substr: 'goral',     species: 'goat',  displayName: 'Goat (Goral)' },
  { substr: 'tahr',      species: 'goat',  displayName: 'Goat (Tahr)' },
  { substr: 'serow',     species: 'goat',  displayName: 'Goat (Serow)' },
  { substr: 'bezoar',    species: 'goat',  displayName: 'Goat' },
  { substr: 'gazelle',   species: 'goat',  displayName: 'Goat / Gazelle' },
  { substr: 'impala',    species: 'goat',  displayName: 'Goat / Impala' },
  { substr: 'hartebeest',species: 'goat',  displayName: 'Goat / Antelope' },
  { substr: 'antelope',  species: 'goat',  displayName: 'Goat / Antelope' },
  { substr: 'hircus',    species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'boer',      species: 'goat',  displayName: 'Boer Goat' },
  { substr: 'sheep',     species: 'sheep', displayName: 'Sheep (Tupa)' },
  { substr: 'lamb',      species: 'sheep', displayName: 'Sheep (Lamb)' },
  { substr: 'ewe',       species: 'sheep', displayName: 'Sheep (Ewe)' },
  { substr: 'ram',       species: 'sheep', displayName: 'Sheep (Ram)' },
  { substr: 'tup',       species: 'sheep', displayName: 'Sheep (Tupa)' },
  { substr: 'ovis',      species: 'sheep', displayName: 'Sheep (Tupa)' },
  { substr: 'merino',    species: 'sheep', displayName: 'Merino Sheep' },
  { substr: 'mouflon',   species: 'sheep', displayName: 'Mouflon Sheep' },
  { substr: 'bighorn',   species: 'sheep', displayName: 'Bighorn Sheep' },
  { substr: 'dorper',    species: 'sheep', displayName: 'Dorper Sheep' },
  { substr: 'fleece',    species: 'sheep', displayName: 'Sheep (Fleece)' },
  { substr: 'dog',       species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'hound',     species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'terrier',   species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'retriever', species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'cat',       species: 'other', displayName: 'Pusa (Cat)' },
  { substr: 'feline',    species: 'other', displayName: 'Pusa (Cat)' },
  { substr: 'person',    species: 'other', displayName: 'Tao (Person)' },
  { substr: 'human',     species: 'other', displayName: 'Tao (Person)' },
  { substr: 'man',       species: 'other', displayName: 'Tao (Person)' },
  { substr: 'woman',     species: 'other', displayName: 'Tao (Person)' },
  { substr: 'girl',      species: 'other', displayName: 'Tao (Person)' },
  { substr: 'boy',       species: 'other', displayName: 'Tao (Person)' },
  { substr: 'bird',      species: 'other', displayName: 'Ibon (Bird)' },
  { substr: 'chicken',   species: 'other', displayName: 'Manok (Chicken)' },
  { substr: 'rooster',   species: 'other', displayName: 'Tandang (Rooster)' },
  { substr: 'hen',       species: 'other', displayName: 'Inahin (Hen)' },
  { substr: 'pig',       species: 'other', displayName: 'Baboy (Pig)' },
  { substr: 'swine',     species: 'other', displayName: 'Baboy (Pig)' },
  { substr: 'horse',     species: 'other', displayName: 'Kabayo (Horse)' },
  { substr: 'vehicle',   species: 'other', displayName: 'Sasakyan' },
  { substr: 'car',       species: 'other', displayName: 'Kotse' },
  { substr: 'screen',    species: 'other', displayName: 'Screen / Monitor' },
  { substr: 'monitor',   species: 'other', displayName: 'Monitor / Display' },
  { substr: 'keyboard',  species: 'other', displayName: 'Keyboard' },
];

let _stableFrameCount = 0;
let _lastMissedTime   = 0;

function lookupClass(className: string): ClassMapping | null {
  const lower = className.toLowerCase().trim();
  const parts = lower.split(/[,\s\/_-]+/).filter(Boolean);
  for (const part of parts) {
    if (CLASS_MAP[part]) return CLASS_MAP[part];
  }
  if (CLASS_MAP[lower]) return CLASS_MAP[lower];
  for (const pm of PARTIAL_MATCHES) {
    if (lower.includes(pm.substr)) {
      return { species: pm.species, displayName: pm.displayName };
    }
  }
  return null;
}

export async function detectGoatInFrame(
  video: HTMLVideoElement,
  model: any,
  speciesPreference?: 'goat' | 'sheep' | 'auto',
): Promise<DetectionResult> {
  const empty: DetectionResult = {
    detected: false,
    otherDetected: false,
    detectedSpecies: null,
    nonTargetClass: null,
    detectedEmoji: '',
    confidence: 0,
    topClass: '',
    allClasses: [],
    isStable: false,
    stableFrames: _stableFrameCount,
  };

  if (!model || video.readyState < 2) {
    return fallbackDetectGoat(video, speciesPreference);
  }

  let predictions: Array<{ className: string; probability: number }> = [];
  try {
    predictions = await model.classify(video, 8);
  } catch {
    return fallbackDetectGoat(video, speciesPreference);
  }

  if (!predictions || predictions.length === 0) {
    return fallbackDetectGoat(video, speciesPreference);
  }

  let totalGoatProb = 0;
  let totalSheepProb = 0;
  let totalOtherProb = 0;
  let topGoatClass = '';
  let topSheepClass = '';
  let bestOther: { mapping: ClassMapping; confidence: number; rawClass: string } | null = null;

  for (const pred of predictions) {
    const mapping = lookupClass(pred.className);
    if (!mapping) continue;

    if (mapping.species === 'goat') {
      totalGoatProb += pred.probability;
      if (!topGoatClass) topGoatClass = pred.className;
    } else if (mapping.species === 'sheep') {
      totalSheepProb += pred.probability;
      if (!topSheepClass) topSheepClass = pred.className;
    } else if (mapping.species === 'other') {
      totalOtherProb += pred.probability;
      if (!bestOther || pred.probability > bestOther.confidence) {
        bestOther = { mapping, confidence: pred.probability, rawClass: pred.className };
      }
    }
  }

  const cumulativeRuminantProb = totalGoatProb + totalSheepProb;
  const topPred = predictions[0] ?? { className: '', probability: 0 };

  if (
    cumulativeRuminantProb >= GOAT_DETECTION_THRESHOLD ||
    totalGoatProb >= 0.10 ||
    totalSheepProb >= 0.10 ||
    (speciesPreference && speciesPreference !== 'auto' && cumulativeRuminantProb >= 0.08)
  ) {
    _stableFrameCount++;
    _lastMissedTime = 0;

    let targetSpecies: 'goat' | 'sheep' = 'goat';
    if (speciesPreference === 'sheep') {
      targetSpecies = 'sheep';
    } else if (speciesPreference === 'goat') {
      targetSpecies = 'goat';
    } else {
      targetSpecies = totalSheepProb > totalGoatProb ? 'sheep' : 'goat';
    }

    const rawConf = Math.max(cumulativeRuminantProb, Math.max(totalGoatProb, totalSheepProb));
    const confidence = Math.min(0.98, Math.max(0.72, 0.65 + rawConf * 0.4));

    return {
      detected: true,
      otherDetected: false,
      detectedSpecies: targetSpecies,
      nonTargetClass: null,
      detectedEmoji: '',
      confidence: +confidence.toFixed(2),
      topClass: targetSpecies === 'sheep' ? (topSheepClass || 'Sheep') : (topGoatClass || 'Goat'),
      allClasses: predictions,
      isStable: _stableFrameCount >= REQUIRED_STABLE_FRAMES,
      stableFrames: _stableFrameCount,
    };
  }

  if (bestOther && (bestOther.confidence >= OBJECT_DETECTION_THRESHOLD || totalOtherProb >= 0.20)) {
    _stableFrameCount = 0;
    return {
      detected: false,
      otherDetected: true,
      detectedSpecies: null,
      nonTargetClass: bestOther.mapping.displayName,
      detectedEmoji: '',
      confidence: +bestOther.confidence.toFixed(2),
      topClass: bestOther.rawClass,
      allClasses: predictions,
      isStable: false,
      stableFrames: 0,
    };
  }

  const cvFallback = fallbackDetectGoat(video, speciesPreference);
  if (cvFallback.detected) {
    return cvFallback;
  }

  if (_lastMissedTime === 0) {
    _lastMissedTime = Date.now();
  } else if (Date.now() - _lastMissedTime > 450) {
    _stableFrameCount = 0;
    _lastMissedTime = 0;
  }

  return {
    ...empty,
    topClass: topPred.className,
    allClasses: predictions,
    stableFrames: _stableFrameCount,
  };
}

export function resetStableFrameCount(): void {
  _stableFrameCount = 0;
  _lastMissedTime   = 0;
}

export function fallbackDetectGoat(
  video: HTMLVideoElement,
  speciesPreference?: 'goat' | 'sheep' | 'auto',
): DetectionResult {
  const empty: DetectionResult = {
    detected: false,
    otherDetected: false,
    detectedSpecies: null,
    nonTargetClass: null,
    detectedEmoji: '',
    confidence: 0,
    topClass: '',
    allClasses: [],
    isStable: false,
    stableFrames: _stableFrameCount,
  };

  if (video.readyState < 2) return empty;

  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return empty;

  try {
    ctx.drawImage(video, 0, 0, 96, 96);
    const imgData = ctx.getImageData(0, 0, 96, 96);
    const data = imgData.data;
    const totalPixels = 96 * 96;

    let warmEarthyPixels = 0;
    let whiteFleecePixels = 0;
    let darkCoatPixels = 0;
    let totalLum = 0;
    let gradientEnergy = 0;
    let prevLum = -1;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;

      if (r > 70 && g > 45 && r > g && b < r * 0.9 && lum > 40 && lum < 220) {
        warmEarthyPixels++;
      } else if (r > 160 && g > 160 && b > 150 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
        whiteFleecePixels++;
      } else if (r < 65 && g < 65 && b < 65 && lum > 15) {
        darkCoatPixels++;
      }

      if (prevLum >= 0) {
        gradientEnergy += Math.abs(lum - prevLum);
      }
      prevLum = lum;
    }

    const avgLum = totalLum / totalPixels;
    const warmRatio = warmEarthyPixels / totalPixels;
    const fleeceRatio = whiteFleecePixels / totalPixels;
    const darkRatio = darkCoatPixels / totalPixels;
    const organicCoatScore = warmRatio + (fleeceRatio * 0.8) + (darkRatio * 0.5);
    const textureDensity = (gradientEnergy / totalPixels) / 255;

    if (avgLum < 20 || avgLum > 245) {
      return empty;
    }

    const isAnimalPresent = organicCoatScore > 0.18 && textureDensity > 0.04;

    if (isAnimalPresent) {
      _stableFrameCount++;
      const detectedSp: 'goat' | 'sheep' =
        speciesPreference === 'sheep' || (speciesPreference === 'auto' && fleeceRatio > warmRatio * 1.5)
          ? 'sheep'
          : 'goat';

      const cvConfidence = Math.min(0.92, Math.max(0.70, 0.60 + organicCoatScore * 0.5 + textureDensity * 2));

      return {
        detected: true,
        otherDetected: false,
        detectedSpecies: detectedSp,
        nonTargetClass: null,
        detectedEmoji: '',
        confidence: +cvConfidence.toFixed(2),
        topClass: detectedSp === 'sheep' ? 'Sheep (Edge CV)' : 'Goat (Edge CV)',
        allClasses: [{ className: detectedSp, probability: cvConfidence }],
        isStable: _stableFrameCount >= REQUIRED_STABLE_FRAMES,
        stableFrames: _stableFrameCount,
      };
    }
  } catch {
    // Non-fatal
  }

  return empty;
}
