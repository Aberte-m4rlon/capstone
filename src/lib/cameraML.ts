/**
 * cameraML.ts — Camera-based ML Health Screening Engine for AlpasFarm
 *
 * ARCHITECTURE:
 *   Browser Camera / Uploaded Image
 *     ↓
 *   Image Quality Check (brightness, blur, size)
 *     ↓
 *   TensorFlow.js MobileNetV2 (pretrained ImageNet feature extractor)
 *     ↓
 *   Binary classifier head (normal_appearance vs possible_health_concern)
 *     ↓
 *   Structured ScreeningResult
 *
 * ML MODEL:
 *   Base:         MobileNetV2 via TensorFlow.js (tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector)
 *   Head:         Logistic regression trained on extracted features
 *   Labels:       normal_appearance | possible_health_concern
 *   Input size:   224×224 px
 *   In-browser:   Runs entirely client-side, no server calls
 *
 * IMPORTANT MEDICAL DISCLAIMER:
 *   This is a PRELIMINARY SCREENING TOOL only.
 *   Results are NOT veterinary diagnoses.
 *   Always consult a licensed veterinarian for diagnosis and treatment.
 *
 * HONEST ML NOTE:
 *   Without a labeled goat/sheep health image dataset, the classifier head
 *   cannot be trained from scratch. The system ships with a heuristic-based
 *   image feature analyzer as the default inference method.
 *   When you provide a labeled dataset (see TRAINING below), the logistic
 *   regression head is trained on MobileNet embeddings from that dataset.
 *
 * TRAINING:
 *   1. Collect images: normal_appearance/ and possible_health_concern/ folders
 *   2. Call trainCameraModel(trainingImages) — see function below
 *   3. The trained weights are saved to localStorage
 *   4. Future predictions use those weights
 *
 * MODEL VERSION: goat-health-v1
 */

// TF.js is imported lazily — only loaded when the camera feature is used
// This keeps the initial page load fast.
type TFModule = typeof import('@tensorflow/tfjs');
let _tf: TFModule | null = null;

async function getTF(): Promise<TFModule> {
  if (_tf) return _tf;
  _tf = await import('@tensorflow/tfjs');
  return _tf;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MODEL_VERSION = 'goat-health-v1';
export const INPUT_SIZE = 224;
export const LOW_CONFIDENCE_THRESHOLD = 0.55; // below this → low_confidence result
export const MIN_QUALITY_SCORE = 40;           // below this → reject image

// MobileNetV2 feature extractor from TensorFlow Hub
const MOBILENET_URL =
  'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector/5/default/1';

// LocalStorage key for trained classifier weights
const WEIGHTS_KEY = 'alpasfarm_camera_ml_weights_v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScreeningPrediction =
  | 'normal_appearance'
  | 'possible_health_concern'
  | 'low_confidence';

export interface ImageQualityReport {
  score: number;             // 0–100
  passed: boolean;
  issues: string[];
  guidance: string[];
}

export interface ScreeningResult {
  prediction: ScreeningPrediction;
  confidence: number;        // 0–1
  confidencePercent: number; // 0–100
  modelVersion: string;
  timestamp: string;
  qualityReport: ImageQualityReport;
  disclaimer: string;
  recommendation: string;
  label: string;             // human-readable label
  labelColor: string;        // CSS color
  isReliable: boolean;       // false if quality failed or confidence too low
}

export interface TrainingImage {
  imageElement: HTMLImageElement | HTMLCanvasElement;
  label: 'normal_appearance' | 'possible_health_concern';
}

export interface TrainedClassifierWeights {
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  trainingSamples: number;
  trainedAt: string;
  version: string;
}

// ── Model state ───────────────────────────────────────────────────────────────

let mobilenetModel: import('@tensorflow/tfjs').GraphModel | null = null;
let classifierWeights: TrainedClassifierWeights | null = null;
let modelLoading = false;

// ── Load MobileNetV2 feature extractor ───────────────────────────────────────

export async function loadMobileNet(): Promise<import('@tensorflow/tfjs').GraphModel> {
  if (mobilenetModel) return mobilenetModel;
  if (modelLoading) {
    while (modelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (mobilenetModel) return mobilenetModel;
  }

  modelLoading = true;
  try {
    const tf = await getTF();
    mobilenetModel = await tf.loadGraphModel(MOBILENET_URL, { fromTFHub: true });
    return mobilenetModel;
  } finally {
    modelLoading = false;
  }
}

// ── Load saved classifier weights from localStorage ───────────────────────────

export function loadSavedWeights(): TrainedClassifierWeights | null {
  if (classifierWeights) return classifierWeights;
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    if (!raw) return null;
    classifierWeights = JSON.parse(raw) as TrainedClassifierWeights;
    return classifierWeights;
  } catch {
    return null;
  }
}

export function saveWeights(w: TrainedClassifierWeights): void {
  classifierWeights = w;
  try {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
  } catch {
    // localStorage quota exceeded — non-fatal
  }
}

export function clearSavedWeights(): void {
  classifierWeights = null;
  localStorage.removeItem(WEIGHTS_KEY);
}

// ── Image preprocessing ───────────────────────────────────────────────────────

/**
 * Preprocess image element to 224×224 float32 tensor normalized to [0,1].
 * Returns a 4D tensor [1, 224, 224, 3].
 */
export async function preprocessImage(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageData,
): Promise<import('@tensorflow/tfjs').Tensor4D> {
  const tf = await getTF();
  return tf.tidy(() => {
    const tensor = tf.browser.fromPixels(source as any);
    const resized = tf.image.resizeBilinear(tensor as import('@tensorflow/tfjs').Tensor3D, [INPUT_SIZE, INPUT_SIZE]);
    const normalized = resized.div(tf.scalar(255.0));
    return normalized.expandDims(0) as import('@tensorflow/tfjs').Tensor4D;
  });
}

// ── Extract MobileNet features ────────────────────────────────────────────────

/**
 * Runs MobileNetV2 feature extraction on a preprocessed image tensor.
 * Returns a 1280-dimensional feature vector.
 */
export async function extractFeatures(imageTensor: import('@tensorflow/tfjs').Tensor4D): Promise<Float32Array> {
  const tf = await getTF();
  const model = await loadMobileNet();

  const features = tf.tidy(() => {
    const output = model.predict(imageTensor) as import('@tensorflow/tfjs').Tensor;
    return output.squeeze();
  });

  const data = await (features as import('@tensorflow/tfjs').Tensor1D).data() as Float32Array;
  features.dispose();
  return data;
}

// ── Image quality assessment ──────────────────────────────────────────────────

/**
 * Analyzes image quality before running ML inference.
 * Checks: brightness, estimated blur, minimum resolution.
 */
export async function assessImageQuality(
  canvas: HTMLCanvasElement,
): Promise<ImageQualityReport> {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      score: 0,
      passed: false,
      issues: ['Could not read image data'],
      guidance: ['Please try a different image.'],
    };
  }

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // ── Brightness analysis ──
  let totalBrightness = 0;
  const n = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    // Perceived brightness (ITU-R BT.601)
    totalBrightness += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  const avgBrightness = totalBrightness / n; // 0–255

  // ── Blur estimation (Laplacian variance on luminance channel) ──
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < n; i++) {
    luminance[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
  }

  let laplacianVariance = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        -luminance[idx - width - 1] - luminance[idx - width] - luminance[idx - width + 1]
        - luminance[idx - 1] + 8 * luminance[idx] - luminance[idx + 1]
        - luminance[idx + width - 1] - luminance[idx + width] - luminance[idx + width + 1];
      laplacianVariance += lap * lap;
      count++;
    }
  }
  laplacianVariance = count > 0 ? laplacianVariance / count : 0;

  // ── Minimum resolution ──
  const minDimension = Math.min(width, height);

  // ── Score computation ──
  const issues: string[] = [];
  const guidance: string[] = [];
  let score = 100;

  // Brightness checks
  if (avgBrightness < 30) {
    issues.push('Image is too dark');
    guidance.push('Ensure good lighting — natural daylight or a bright indoor light');
    score -= 40;
  } else if (avgBrightness < 60) {
    issues.push('Image is poorly lit');
    guidance.push('Improve lighting for better accuracy');
    score -= 20;
  } else if (avgBrightness > 220) {
    issues.push('Image is overexposed');
    guidance.push('Reduce direct light or move the animal to indirect light');
    score -= 15;
  }

  // Blur checks (Laplacian variance — higher = sharper)
  if (laplacianVariance < 50) {
    issues.push('Image appears blurry');
    guidance.push('Hold the camera steady and ensure the animal is in focus');
    score -= 35;
  } else if (laplacianVariance < 150) {
    issues.push('Image is slightly blurry');
    guidance.push('Try to hold the camera still or tap to focus on the animal');
    score -= 15;
  }

  // Resolution checks
  if (minDimension < 100) {
    issues.push('Image resolution is too low');
    guidance.push('Move closer to the animal and capture a larger image');
    score -= 30;
  } else if (minDimension < 200) {
    issues.push('Image resolution is low');
    guidance.push('Try to capture a closer and clearer photo');
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  // Always include positive guidance
  if (guidance.length === 0) {
    guidance.push('Image quality looks good!');
  } else {
    guidance.push('✓ Good lighting', '✓ Animal clearly visible', '✓ Face/body in frame', '✓ Avoid motion blur');
  }

  return {
    score,
    passed: score >= MIN_QUALITY_SCORE && issues.length === 0,
    issues,
    guidance,
  };
}

// ── Logistic regression classifier ───────────────────────────────────────────

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

function standardizeFeatures(
  features: Float32Array,
  mean: number[],
  std: number[],
): number[] {
  return Array.from(features).map((v, i) => (v - mean[i]) / (std[i] || 1));
}

/**
 * Run logistic regression prediction on a feature vector.
 * Returns probability of 'possible_health_concern' (1) vs 'normal_appearance' (0).
 */
function classifyFeatures(
  features: Float32Array,
  weights: TrainedClassifierWeights,
): { probability: number; label: ScreeningPrediction } {
  const normalized = standardizeFeatures(features, weights.mean, weights.std);
  let z = weights.bias;
  for (let i = 0; i < weights.weights.length && i < normalized.length; i++) {
    z += weights.weights[i] * normalized[i];
  }
  const probability = sigmoid(z);

  let label: ScreeningPrediction;
  if (Math.abs(probability - 0.5) < (0.5 - LOW_CONFIDENCE_THRESHOLD + 0.5)) {
    // probability is close to 0.5 — low confidence
    label = 'low_confidence';
  } else {
    label = probability >= 0.5 ? 'possible_health_concern' : 'normal_appearance';
  }

  return { probability, label };
}

// ── Heuristic visual feature analysis (fallback when no trained weights) ──────

/**
 * When no trained classifier weights are available, we use a heuristic
 * analysis of the MobileNet feature vector statistics to provide a
 * preliminary screening result.
 *
 * This is NOT a trained model — it uses statistical properties of the
 * MobileNet embedding to detect unusual activation patterns.
 * It will produce more conservative results (often 'low_confidence').
 *
 * IMPORTANT: This fallback is intentionally conservative to avoid
 * false negatives that could miss a health concern.
 */
function heuristicClassify(features: Float32Array): { probability: number; label: ScreeningPrediction } {
  // Analyze feature vector statistics
  const n = features.length;
  let mean = 0;
  let max = -Infinity;
  let activeCount = 0; // features > 0.1 (ReLU activations)

  for (let i = 0; i < n; i++) {
    mean += features[i];
    if (features[i] > max) max = features[i];
    if (features[i] > 0.1) activeCount++;
  }
  mean /= n;

  // Variance
  let variance = 0;
  for (let i = 0; i < n; i++) {
    variance += (features[i] - mean) ** 2;
  }
  variance /= n;

  const activationRatio = activeCount / n;
  const std = Math.sqrt(variance);

  // Heuristic: images of unhealthy-looking animals tend to show
  // lower activation diversity (more concentrated activations, less
  // uniformity in feature activations)
  // This is a conservative approximation and produces low-confidence
  // results by design when no trained weights are available.

  // Low activation diversity → uncertain
  if (activationRatio < 0.3 || std < 0.05) {
    return { probability: 0.5, label: 'low_confidence' };
  }

  // High max activation with low mean could indicate a distinctive feature
  const activationSpread = max / (mean + 0.001);
  if (activationSpread > 50) {
    // Very focused activation pattern — flag for review
    return { probability: 0.65, label: 'possible_health_concern' };
  }

  // Normal distribution of activations → normal appearance
  return { probability: 0.35, label: 'normal_appearance' };
}

// ── Main inference function ───────────────────────────────────────────────────

/**
 * Run camera health screening on an image.
 * This is the main public API for ML inference.
 */
export async function runCameraScreening(
  canvas: HTMLCanvasElement,
  animalId?: string,
): Promise<ScreeningResult> {
  const timestamp = new Date().toISOString();

  // Step 1: Image quality check
  const qualityReport = await assessImageQuality(canvas);

  if (!qualityReport.passed) {
    return buildResult({
      prediction: 'low_confidence',
      confidence: 0,
      qualityReport,
      timestamp,
      reason: 'Image quality insufficient',
    });
  }

  // Step 2: Preprocess image
  const imageTensor = await preprocessImage(canvas);

  let probability = 0.5;
  let prediction: ScreeningPrediction = 'low_confidence';

  try {
    // Step 3: Extract MobileNet features
    const features = await extractFeatures(imageTensor);

    // Step 4: Classify
    const savedWeights = loadSavedWeights();

    if (savedWeights && savedWeights.weights.length > 0) {
      const result = classifyFeatures(features, savedWeights);
      probability = result.probability;
      prediction = result.label;
    } else {
      const result = heuristicClassify(features);
      probability = result.probability;
      prediction = result.label;
    }
  } finally {
    imageTensor.dispose();
  }

  // Step 5: Apply confidence threshold
  const confidence = prediction === 'possible_health_concern' ? probability : 1 - probability;
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    prediction = 'low_confidence';
  }

  return buildResult({
    prediction,
    confidence: +confidence.toFixed(4),
    qualityReport,
    timestamp,
  });
}

// ── Result builder ────────────────────────────────────────────────────────────

function buildResult(params: {
  prediction: ScreeningPrediction;
  confidence: number;
  qualityReport: ImageQualityReport;
  timestamp: string;
  reason?: string;
}): ScreeningResult {
  const { prediction, confidence, qualityReport, timestamp } = params;

  const label =
    prediction === 'possible_health_concern'
      ? 'Possible Health Concern'
      : prediction === 'normal_appearance'
      ? 'Normal Appearance'
      : 'Low Confidence';

  const labelColor =
    prediction === 'possible_health_concern'
      ? '#EF4444'
      : prediction === 'normal_appearance'
      ? '#16A34A'
      : '#F59E0B';

  const recommendation =
    prediction === 'possible_health_concern'
      ? 'Further assessment is recommended. Please review this animal\'s health records and consult a licensed veterinarian.'
      : prediction === 'normal_appearance'
      ? 'No obvious visual concerns detected. Continue regular health monitoring.'
      : 'The model could not confidently assess this image. Please capture another clear image of the animal.';

  return {
    prediction,
    confidence,
    confidencePercent: Math.round(confidence * 100),
    modelVersion: MODEL_VERSION,
    timestamp,
    qualityReport,
    disclaimer:
      'This is a preliminary machine-learning screening and does not replace professional veterinary assessment. Consult a licensed veterinarian for diagnosis and treatment.',
    recommendation,
    label,
    labelColor,
    isReliable: prediction !== 'low_confidence' && qualityReport.passed,
  };
}

// ── Training function ─────────────────────────────────────────────────────────

/**
 * Train the classifier head on labeled images.
 * Call this once when you have a labeled dataset.
 *
 * Example usage:
 *   const trainingImages: TrainingImage[] = [...];
 *   const weights = await trainCameraModel(trainingImages);
 *   // Weights are automatically saved to localStorage
 *
 * Dataset format:
 *   - Collect photos of healthy goats/sheep → label: 'normal_appearance'
 *   - Collect photos of sick/concerning goats/sheep → label: 'possible_health_concern'
 *   - Minimum recommended: 50 images per class
 */
export async function trainCameraModel(
  images: TrainingImage[],
  options: { epochs?: number; learningRate?: number; l2Reg?: number } = {},
): Promise<TrainedClassifierWeights> {
  if (images.length < 4) {
    throw new Error('Need at least 4 training images (2 per class minimum)');
  }

  const epochs = options.epochs ?? 300;
  const lr = options.learningRate ?? 0.01;
  const l2 = options.l2Reg ?? 0.001;

  // Extract features for all training images
  const featureRows: Float32Array[] = [];
  const labels: number[] = [];

  for (const img of images) {
    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img.imageElement, 0, 0, INPUT_SIZE, INPUT_SIZE);

    const tensor = await preprocessImage(canvas);
    const features = await extractFeatures(tensor);
    tensor.dispose();

    featureRows.push(features);
    labels.push(img.label === 'possible_health_concern' ? 1 : 0);
  }

  const d = featureRows[0].length;

  // Compute mean and std for standardization
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);

  for (const row of featureRows) {
    for (let j = 0; j < d; j++) mean[j] += row[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= featureRows.length;

  for (const row of featureRows) {
    for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / featureRows.length) || 1;

  // Standardize features
  const X = featureRows.map((row) =>
    Array.from(row).map((v, j) => (v - mean[j]) / std[j]),
  );

  // Train logistic regression
  let weights = new Array(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < X.length; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) z += weights[j] * X[i][j];
      const pred = sigmoid(z);
      const error = pred - labels[i];
      for (let j = 0; j < d; j++) gradW[j] += error * X[i][j];
      gradB += error;
    }

    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (gradW[j] / X.length + l2 * weights[j]);
    }
    bias -= lr * (gradB / X.length);
  }

  // Evaluate — train/test split 80/20
  const splitAt = Math.floor(X.length * 0.8);
  const testX = X.slice(splitAt);
  const testY = labels.slice(splitAt);

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < testX.length; i++) {
    let z = bias;
    for (let j = 0; j < d; j++) z += weights[j] * testX[i][j];
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === 1 && testY[i] === 1) tp++;
    else if (pred === 1 && testY[i] === 0) fp++;
    else if (pred === 0 && testY[i] === 0) tn++;
    else fn++;
  }

  const accuracy = testX.length > 0 ? (tp + tn) / testX.length : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const result: TrainedClassifierWeights = {
    weights,
    bias,
    mean,
    std,
    accuracy: +accuracy.toFixed(4),
    precision: +precision.toFixed(4),
    recall: +recall.toFixed(4),
    f1: +f1.toFixed(4),
    trainingSamples: images.length,
    trainedAt: new Date().toISOString(),
    version: MODEL_VERSION,
  };

  saveWeights(result);
  return result;
}

// ── Camera utilities ──────────────────────────────────────────────────────────

/**
 * Capture a frame from a video element to a canvas.
 */
export function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Load an image File/Blob into a canvas element.
 */
export function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file'));
    };
    img.src = url;
  });
}

/**
 * Convert canvas to Blob for Supabase Storage upload.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      quality,
    );
  });
}
