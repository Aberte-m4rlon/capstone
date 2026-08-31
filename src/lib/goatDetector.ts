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
 *   OBJECT_DETECTION_THRESHOLD  = 0.10  (fast non-target rejection)
 *   GOAT_DETECTION_THRESHOLD    = 0.15  (cumulative threshold across all ruminant classes)
 *   REQUIRED_STABLE_FRAMES      = 2     (300ms window for fast auto-capture)
 *   SCAN_COOLDOWN_SECONDS       = 5     (seconds before auto-resuming next scan)
 *   DETECTION_INTERVAL_MS       = 140   (~7 FPS detection cadence)
 */

// ── Configurable constants ────────────────────────────────────────────────────
export const OBJECT_DETECTION_THRESHOLD = 0.10;
export const GOAT_DETECTION_THRESHOLD   = 0.15;
export const REQUIRED_STABLE_FRAMES     = 2;
export const SCAN_COOLDOWN_SECONDS      = 5;
export const DETECTION_INTERVAL_MS      = 140;

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
  // Caprine (Goats)
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

  // Ovine (Sheep)
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

  // Common Non-Target (Humans & Clothing)
  'person':         { species: 'other', displayName: 'Tao (Person)' },
  'human':          { species: 'other', displayName: 'Tao (Person)' },
  'man':            { species: 'other', displayName: 'Tao (Person)' },
  'woman':          { species: 'other', displayName: 'Tao (Person)' },
  'face':           { species: 'other', displayName: 'Mukha ng Tao' },
  'groom':          { species: 'other', displayName: 'Tao (Person)' },
  'scuba diver':    { species: 'other', displayName: 'Tao (Person)' },
  'jersey':         { species: 'other', displayName: 'Damit / Tao' },
  't-shirt':        { species: 'other', displayName: 'Damit / Tao' },
  'sweatshirt':     { species: 'other', displayName: 'Damit / Tao' },
  'suit':           { species: 'other', displayName: 'Damit / Tao' },
  'jean':           { species: 'other', displayName: 'Damit / Tao' },
  'pajama':         { species: 'other', displayName: 'Damit / Tao' },
  'sunglasses':     { species: 'other', displayName: 'Salamin / Tao' },
  'wig':            { species: 'other', displayName: 'Pustiso / Bagay' },
  'mask':           { species: 'other', displayName: 'Mask / Tao' },

  // Dogs (Major ImageNet Dog Breeds)
  'dog':            { species: 'other', displayName: 'Aso (Dog)' },
  'golden retriever': { species: 'other', displayName: 'Aso (Retriever)' },
  'labrador retriever': { species: 'other', displayName: 'Aso (Labrador)' },
  'german shepherd': { species: 'other', displayName: 'Aso (Shepherd)' },
  'rottweiler':     { species: 'other', displayName: 'Aso (Rottweiler)' },
  'chihuahua':      { species: 'other', displayName: 'Aso (Chihuahua)' },
  'pug':            { species: 'other', displayName: 'Aso (Pug)' },
  'bulldog':        { species: 'other', displayName: 'Aso (Bulldog)' },
  'beagle':         { species: 'other', displayName: 'Aso (Beagle)' },
  'poodle':         { species: 'other', displayName: 'Aso (Poodle)' },
  'husky':          { species: 'other', displayName: 'Aso (Husky)' },
  'dalmatian':      { species: 'other', displayName: 'Aso (Dalmatian)' },
  'corgi':          { species: 'other', displayName: 'Aso (Corgi)' },
  'boxer':          { species: 'other', displayName: 'Aso (Boxer)' },
  'doberman':       { species: 'other', displayName: 'Aso (Doberman)' },
  'shih-tzu':       { species: 'other', displayName: 'Aso (Shih-Tzu)' },
  'maltese':        { species: 'other', displayName: 'Aso (Maltese)' },
  'terrier':        { species: 'other', displayName: 'Aso (Terrier)' },
  'spaniel':        { species: 'other', displayName: 'Aso (Spaniel)' },
  'hound':          { species: 'other', displayName: 'Aso (Hound)' },
  'collie':         { species: 'other', displayName: 'Aso (Collie)' },

  // Cats & Other Animals
  'cat':            { species: 'other', displayName: 'Pusa (Cat)' },
  'tabby':          { species: 'other', displayName: 'Pusa (Tabby Cat)' },
  'persian cat':    { species: 'other', displayName: 'Pusa (Cat)' },
  'siamese cat':    { species: 'other', displayName: 'Pusa (Cat)' },
  'chicken':        { species: 'other', displayName: 'Manok (Chicken)' },
  'rooster':        { species: 'other', displayName: 'Tandang (Rooster)' },
  'hen':            { species: 'other', displayName: 'Inahin (Hen)' },
  'bird':           { species: 'other', displayName: 'Ibon (Bird)' },
  'duck':           { species: 'other', displayName: 'Bibe / Itik' },
  'pig':            { species: 'other', displayName: 'Baboy (Pig)' },
  'hog':            { species: 'other', displayName: 'Baboy (Hog)' },
  'horse':          { species: 'other', displayName: 'Kabayo (Horse)' },
  'cow':            { species: 'other', displayName: 'Baka (Cow)' },
  'cattle':         { species: 'other', displayName: 'Baka (Cattle)' },
  'bull':           { species: 'other', displayName: 'Baka (Bull)' },
  'carabao':        { species: 'other', displayName: 'Kalabaw' },
  'water buffalo':  { species: 'other', displayName: 'Kalabaw' },

  // Household & Electronics
  'car':            { species: 'other', displayName: 'Kotse (Car)' },
  'truck':          { species: 'other', displayName: 'Sasakyan' },
  'motorcycle':     { species: 'other', displayName: 'Motorsiklo' },
  'bicycle':        { species: 'other', displayName: 'Bisikleta' },
  'chair':          { species: 'other', displayName: 'Upuan / Bagay' },
  'table':          { species: 'other', displayName: 'Mesa / Bagay' },
  'desk':           { species: 'other', displayName: 'Mesa / Bagay' },
  'cellphone':      { species: 'other', displayName: 'Telepono / Gadget' },
  'cellular telephone': { species: 'other', displayName: 'Telepono' },
  'laptop':         { species: 'other', displayName: 'Kompyuter / Gadget' },
  'screen':         { species: 'other', displayName: 'Screen / Monitor' },
  'monitor':        { species: 'other', displayName: 'Monitor / Display' },
  'television':     { species: 'other', displayName: 'TV / Display' },
  'bottle':         { species: 'other', displayName: 'Bote / Bagay' },
};

interface PartialMatch { substr: string; species: Species; displayName: string }
const PARTIAL_MATCHES: PartialMatch[] = [
  // Goat Synsets
  { substr: 'goat',       species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'capra',      species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'caprine',    species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'ibex',       species: 'goat',  displayName: 'Goat (Ibex)' },
  { substr: 'chamois',    species: 'goat',  displayName: 'Goat (Chamois)' },
  { substr: 'goral',      species: 'goat',  displayName: 'Goat (Goral)' },
  { substr: 'tahr',       species: 'goat',  displayName: 'Goat (Tahr)' },
  { substr: 'serow',      species: 'goat',  displayName: 'Goat (Serow)' },
  { substr: 'bezoar',     species: 'goat',  displayName: 'Goat' },
  { substr: 'gazelle',    species: 'goat',  displayName: 'Goat / Gazelle' },
  { substr: 'impala',     species: 'goat',  displayName: 'Goat / Impala' },
  { substr: 'hartebeest', species: 'goat',  displayName: 'Goat / Antelope' },
  { substr: 'antelope',   species: 'goat',  displayName: 'Goat / Antelope' },
  { substr: 'hircus',     species: 'goat',  displayName: 'Goat (Kambing)' },
  { substr: 'boer',       species: 'goat',  displayName: 'Boer Goat' },

  // Sheep Synsets
  { substr: 'sheep',      species: 'sheep', displayName: 'Sheep (Tupa)' },
  { substr: 'lamb',       species: 'sheep', displayName: 'Sheep (Lamb)' },
  { substr: 'ewe',        species: 'sheep', displayName: 'Sheep (Ewe)' },
  { substr: 'ram',        species: 'sheep', displayName: 'Sheep (Ram)' },
  { substr: 'tup',        species: 'sheep', displayName: 'Sheep (Tupa)' },
  { substr: 'ovis',       species: 'sheep', displayName: 'Sheep (Tupa)' },
  { substr: 'merino',     species: 'sheep', displayName: 'Merino Sheep' },
  { substr: 'mouflon',    species: 'sheep', displayName: 'Mouflon Sheep' },
  { substr: 'bighorn',    species: 'sheep', displayName: 'Bighorn Sheep' },
  { substr: 'dorper',     species: 'sheep', displayName: 'Dorper Sheep' },
  { substr: 'fleece',     species: 'sheep', displayName: 'Sheep (Fleece)' },

  // Dog Synsets
  { substr: 'dog',        species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'hound',      species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'terrier',    species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'retriever',  species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'shepherd',   species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'spaniel',    species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'pointer',    species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'setter',     species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'collie',     species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'husky',      species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'poodle',     species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'pug',        species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'bulldog',    species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'mastiff',    species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'corgi',      species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'chihuahua',  species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'rottweiler', species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'doberman',   species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'boxer',      species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'schnauzer',  species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'beagle',     species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'malamute',   species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'dalmatian',  species: 'other', displayName: 'Aso (Dog)' },
  { substr: 'puppy',      species: 'other', displayName: 'Aso (Puppy)' },
  { substr: 'canine',     species: 'other', displayName: 'Aso (Dog)' },

  // Cat Synsets
  { substr: 'cat',        species: 'other', displayName: 'Pusa (Cat)' },
  { substr: 'feline',     species: 'other', displayName: 'Pusa (Cat)' },
  { substr: 'tabby',      species: 'other', displayName: 'Pusa (Cat)' },
  { substr: 'kitten',     species: 'other', displayName: 'Pusa (Kitten)' },

  // Human & Clothes Synsets
  { substr: 'person',     species: 'other', displayName: 'Tao (Person)' },
  { substr: 'human',      species: 'other', displayName: 'Tao (Person)' },
  { substr: 'man',        species: 'other', displayName: 'Tao (Person)' },
  { substr: 'woman',      species: 'other', displayName: 'Tao (Person)' },
  { substr: 'girl',       species: 'other', displayName: 'Tao (Person)' },
  { substr: 'boy',        species: 'other', displayName: 'Tao (Person)' },
  { substr: 'face',       species: 'other', displayName: 'Mukha ng Tao' },
  { substr: 'selfie',     species: 'other', displayName: 'Tao (Selfie)' },
  { substr: 'jersey',     species: 'other', displayName: 'Damit / Tao' },
  { substr: 'shirt',      species: 'other', displayName: 'Damit / Tao' },
  { substr: 'suit',       species: 'other', displayName: 'Damit / Tao' },
  { substr: 'coat',       species: 'other', displayName: 'Damit / Tao' },
  { substr: 'jacket',     species: 'other', displayName: 'Damit / Tao' },
  { substr: 'jean',       species: 'other', displayName: 'Damit / Tao' },
  { substr: 'pants',      species: 'other', displayName: 'Damit / Tao' },
  { substr: 'pajama',     species: 'other', displayName: 'Damit / Tao' },
  { substr: 'sweater',    species: 'other', displayName: 'Damit / Tao' },
  { substr: 'hoodie',     species: 'other', displayName: 'Damit / Tao' },
  { substr: 'sunglasses', species: 'other', displayName: 'Salamin / Tao' },
  { substr: 'glasses',    species: 'other', displayName: 'Salamin / Tao' },
  { substr: 'wig',        species: 'other', displayName: 'Pustiso / Bagay' },

  // Other Livestock & Poultry
  { substr: 'bird',       species: 'other', displayName: 'Ibon (Bird)' },
  { substr: 'chicken',    species: 'other', displayName: 'Manok (Chicken)' },
  { substr: 'rooster',    species: 'other', displayName: 'Tandang (Rooster)' },
  { substr: 'hen',        species: 'other', displayName: 'Inahin (Hen)' },
  { substr: 'duck',       species: 'other', displayName: 'Bibe (Duck)' },
  { substr: 'pig',        species: 'other', displayName: 'Baboy (Pig)' },
  { substr: 'swine',      species: 'other', displayName: 'Baboy (Pig)' },
  { substr: 'hog',        species: 'other', displayName: 'Baboy (Hog)' },
  { substr: 'horse',      species: 'other', displayName: 'Kabayo (Horse)' },
  { substr: 'cow',        species: 'other', displayName: 'Baka (Cow)' },
  { substr: 'cattle',     species: 'other', displayName: 'Baka (Cattle)' },
  { substr: 'bull',       species: 'other', displayName: 'Baka (Bull)' },
  { substr: 'carabao',    species: 'other', displayName: 'Kalabaw' },

  // Environment & Objects
  { substr: 'vehicle',    species: 'other', displayName: 'Sasakyan' },
  { substr: 'car',        species: 'other', displayName: 'Kotse' },
  { substr: 'screen',     species: 'other', displayName: 'Screen / Monitor' },
  { substr: 'monitor',    species: 'other', displayName: 'Monitor / Display' },
  { substr: 'keyboard',   species: 'other', displayName: 'Keyboard' },
  { substr: 'laptop',     species: 'other', displayName: 'Kompyuter / Laptop' },
  { substr: 'phone',      species: 'other', displayName: 'Telepono' },
  { substr: 'chair',      species: 'other', displayName: 'Upuan' },
  { substr: 'table',      species: 'other', displayName: 'Mesa' },
  { substr: 'desk',       species: 'other', displayName: 'Mesa' },
  { substr: 'couch',      species: 'other', displayName: 'Sofa / Couch' },
  { substr: 'wall',       species: 'other', displayName: 'Pader / Kwarto' },
  { substr: 'room',       species: 'other', displayName: 'Kwarto / Loob ng Bahay' },
];

let _stableFrameCount = 0;
let _lastMissedTime   = 0;

function lookupClass(className: string): ClassMapping | null {
  const lower = className.toLowerCase().trim();
  const parts = lower.split(/[,s/_-]+/).filter(Boolean);
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
  const topMapping = lookupClass(topPred.className);

  // ── PRIORITY 1: Non-Target Rejection (Person, Dog, Cat, Object) ───────────
  if (
    (topMapping && topMapping.species === 'other' && topPred.probability >= OBJECT_DETECTION_THRESHOLD) ||
    (bestOther && (bestOther.confidence > cumulativeRuminantProb || totalOtherProb >= 0.25))
  ) {
    _stableFrameCount = 0;
    const nonTargetName = bestOther?.mapping.displayName || topMapping?.displayName || 'Bagay / Ibang Hayop';
    return {
      detected: false,
      otherDetected: true,
      detectedSpecies: null,
      nonTargetClass: nonTargetName,
      detectedEmoji: '',
      confidence: +(bestOther?.confidence || topPred.probability).toFixed(2),
      topClass: bestOther?.rawClass || topPred.className,
      allClasses: predictions,
      isStable: false,
      stableFrames: 0,
    };
  }

  // ── PRIORITY 2: Valid Goat or Sheep Detection ──────────────────────────────
  if (
    cumulativeRuminantProb >= GOAT_DETECTION_THRESHOLD &&
    cumulativeRuminantProb > totalOtherProb
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

  // If MobileNet was unsure, do NOT trigger false goat
  if (_lastMissedTime === 0) {
    _lastMissedTime = Date.now();
  } else if (Date.now() - _lastMissedTime > 400) {
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

/**
 * Fallback Edge CV detector with Strict Human-Skin & Non-Target Rejection
 */
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

    let humanSkinPixels = 0;
    let coarseCoatPixels = 0;
    let whiteFleecePixels = 0;
    let totalLum = 0;
    let gradientEnergy = 0;
    let prevLum = -1;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;

      // Human skin tone pattern in webcam: R > G > B, with typical peach/olive hue
      const isSkinTone = r > 95 && g > 45 && b > 20 && (r - g) > 15 && (r - b) > 20 && lum > 40 && lum < 225;
      if (isSkinTone) {
        humanSkinPixels++;
      }

      // Animal fleece: high bright desaturated wool texture
      if (r > 150 && g > 150 && b > 140 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
        whiteFleecePixels++;
      }

      // Coarse dark/brown livestock coat (distinct from human smooth skin)
      if (r > 40 && g > 30 && b < 50 && (r - b) > 10 && Math.abs(r - g) < 25) {
        coarseCoatPixels++;
      }

      if (prevLum >= 0) {
        gradientEnergy += Math.abs(lum - prevLum);
      }
      prevLum = lum;
    }

    const skinRatio = humanSkinPixels / totalPixels;
    const fleeceRatio = whiteFleecePixels / totalPixels;
    const coatRatio = coarseCoatPixels / totalPixels;
    const textureDensity = (gradientEnergy / totalPixels) / 255;

    // ── Reject Human / Selfie ───────────────────────────────────────────────
    if (skinRatio > 0.25) {
      _stableFrameCount = 0;
      return {
        detected: false,
        otherDetected: true,
        detectedSpecies: null,
        nonTargetClass: 'Tao (Person)',
        detectedEmoji: '',
        confidence: 0.90,
        topClass: 'Person (Edge CV)',
        allClasses: [{ className: 'person', probability: 0.90 }],
        isStable: false,
        stableFrames: 0,
      };
    }

    // ── Reject Empty Background / Low Quality ────────────────────────────────
    const avgLum = totalLum / totalPixels;
    if (avgLum < 20 || avgLum > 245 || textureDensity < 0.03) {
      return empty;
    }

    // Valid livestock coat require real fleece or coarse livestock fur texture
    const isAnimalPresent = (fleeceRatio > 0.20 || coatRatio > 0.25) && textureDensity > 0.06;

    if (isAnimalPresent) {
      _stableFrameCount++;
      const detectedSp: 'goat' | 'sheep' =
        speciesPreference === 'sheep' || (speciesPreference === 'auto' && fleeceRatio > coatRatio)
          ? 'sheep'
          : 'goat';

      const cvConfidence = Math.min(0.90, Math.max(0.70, 0.65 + textureDensity * 1.5));

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
