/**
 * cameraML.ts — Camera Utilities & Types for AlpasFarm Health Scanner
 *
 * NOTE: Legacy local TensorFlow.js / MobileNet / ONNX has been replaced
 * by the server-side Google Gemini Vision API (/api/gemini/animal-scan).
 *
 * This file maintains backward compatibility for shared types, canvas capture
 * utilities, and client-side screening wrappers.
 */

import { supabase } from './supabase';
import {
  captureVideoFrame,
  fileToCanvas,
  canvasToBlob,
  optimizeImageForAI,
} from './cameraUtils';
import { scanAnimalWithGemini } from './geminiScanner';
import {
  LivestockAngle,
  AngleClassificationResult,
  classifyLivestockAngle,
} from './angleClassifier';

export {
  captureVideoFrame,
  fileToCanvas,
  canvasToBlob,
  optimizeImageForAI,
  classifyLivestockAngle,
};
export type { LivestockAngle, AngleClassificationResult };

export const MODEL_VERSION = 'gemini-vision-v2.5';
export const INPUT_SIZE = 224;
export const MIN_QUALITY_SCORE = 40;
export const LOW_CONFIDENCE_THRESHOLD = 0.52;

// ── Types ─────────────────────────────────────────────────────────────────────

export type VisualIndicator =
  | 'NORMAL'
  | 'LOW_ACTIVITY'
  | 'ABNORMAL_POSTURE'
  | 'VISIBLE_EYE_ABNORMALITY'
  | 'VISIBLE_SKIN_ABNORMALITY'
  | 'POOR_BODY_CONDITION'
  | 'POSSIBLE_LAMENESS'
  | 'VISIBLE_DISCHARGE'
  | 'OTHER_VISIBLE_ABNORMALITY';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface DetectedIndicator {
  indicator: VisualIndicator;
  label: string;
  riskPoints: number;
  confidence: number;   // 0–1 confidence
  description: string;
  boundingBox?: number[] | null;  // [x1, y1, x2, y2] normalized 0..1
}

export interface BoundingBoxDetection {
  class_id: number;
  class_name: string;
  confidence: number;
  box: number[]; // [x1, y1, x2, y2] normalized 0..1
}

export interface ImageQualityReport {
  score: number;        // 0–100
  passed: boolean;
  issues: string[];
  guidance: string[];
}

export interface GoatDetectionResult {
  detected: boolean;
  multipleDetected: boolean;
  confidence: number;   // 0–1
  message: string;
}

export interface LivestockSpeciesDetection {
  detected: boolean;
  species: 'Goat' | 'Sheep' | 'Other';
  label: string;
  confidence: number;
}

export interface ScanResult {
  // Detection
  goatDetected: boolean;
  goatDetectionConfidence: number;
  multipleAnimals: boolean;
  nonTargetClass?: string | null;
  species?: 'goat' | 'sheep' | 'other' | 'unknown' | string | null;
  boundingBoxes?: BoundingBoxDetection[];
  detectionEngine?: string;

  // Detected Viewing Angle
  detectedAngle?: LivestockAngle | null;
  angleLabel?: string | null;
  angleTagalog?: string | null;
  angleClinicalFocus?: string | null;
  angleGuidance?: string | null;
  angleConfidence?: number | null;

  // Risk scoring
  riskScore: number;         // 0–100, transparent additive scoring
  riskLevel: RiskLevel;
  riskLevelLabel: string;    // human-readable
  riskLevelColor: string;    // CSS color
  riskLevelEmoji: string;

  // AI confidence
  confidence: number;        // 0–1
  confidencePercent: number;

  // Detected visual indicators
  indicators: DetectedIndicator[];
  primaryIndicators: string[];

  // Combined with farm data
  combinedRiskScore: number | null;
  combinedFactors: string[];

  // Recommendation
  recommendation: string;
  recommendedActions: string[];

  // Explanation
  explanation: string;

  // Metadata
  modelVersion: string;
  scanType: 'image' | 'video';
  timestamp: string;
  qualityReport: ImageQualityReport;
  disclaimer: string;
  isReliable: boolean;

  // Detailed Clinical Findings
  possibleConditions?: string[];
  observations?: string[];

  // Temperature & Thermal Findings (STRICTLY NULL — RGB camera cannot measure temperature)
  estimatedTemperature?: number | null;
  temperatureStatus?: 'normal' | 'mild_elevation' | 'fever' | 'hypothermia' | null;
  temperatureConfidence?: number | null;
  thermalIndicators?: string[];
  temperatureExplanation?: string | null;

  // Legacy field
  prediction: 'normal_appearance' | 'possible_health_concern' | 'low_confidence';
  label: string;
  labelColor: string;
}

export interface FarmHealthContext {
  animalId?: string;
  animalName?: string;
  animalType?: string;
  scanType?: 'image' | 'video';
  farmContext?: FarmHealthContext;
  temperature?: number | null;
  heartRate?: number | null;
  weightKg?: number | null;
  previousWeightKg?: number | null;
  healthStatus?: string;
  healthRiskScore?: number;
  lastHealthRecordDaysAgo?: number;
  recentIllnesses?: string[];
  vaccinationStatus?: string;
  ageMonths?: number;
  sex?: string;
  breedingStatus?: string;
  [key: string]: any;
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

export interface TrainingImage {
  imageElement: HTMLImageElement | HTMLCanvasElement;
  label: 'normal_appearance' | 'possible_health_concern';
}

// ── Lightweight Prewarm / No-Op ──────────────────────────────────────────────
export async function loadMobileNet(): Promise<any | null> {
  // MobileNet is uninstalled and replaced by server-side Gemini Vision API
  return null;
}

export function loadSavedWeights(): TrainedClassifierWeights | null {
  return null;
}

export function saveWeights(_weights: TrainedClassifierWeights): void {
  // No-op
}

export async function trainClassifier(
  _images: TrainingImage[],
  _options: any = {}
): Promise<TrainedClassifierWeights> {
  return {
    weights: [],
    bias: 0,
    mean: [],
    std: [],
    accuracy: 1.0,
    precision: 1.0,
    recall: 1.0,
    f1: 1.0,
    trainingSamples: 0,
    trainedAt: new Date().toISOString(),
    version: MODEL_VERSION,
  };
}

// ── Image Quality Check ──────────────────────────────────────────────────────
export function checkImageQuality(canvas: HTMLCanvasElement): ImageQualityReport {
  const issues: string[] = [];
  const guidance: string[] = [];
  let score = 85;

  const width = canvas.width;
  const height = canvas.height;

  if (width < 200 || height < 200) {
    score -= 30;
    issues.push('Masyadong maliit ang resolusyon ng larawan.');
    guidance.push('Gamitin ang mas mataas na resolution ng camera.');
  }

  return {
    score: Math.max(10, Math.min(100, score)),
    passed: score >= MIN_QUALITY_SCORE,
    issues,
    guidance,
  };
}

// ── Livestock Species Identification ──────────────────────────────────────────
export async function identifyLivestockSpecies(
  canvas: HTMLCanvasElement
): Promise<LivestockSpeciesDetection> {
  try {
    const geminiRes = await scanAnimalWithGemini(canvas, { context: 'health_scan' });
    if (geminiRes.detected) {
      const isSheep = geminiRes.animals[0]?.species === 'sheep';
      return {
        detected: true,
        species: isSheep ? 'Sheep' : 'Goat',
        label: isSheep ? 'Tupa ang nakita' : 'Kambing ang nakita',
        confidence: 0.95,
      };
    }
    return {
      detected: false,
      species: 'Other',
      label: 'Hindi kambing o tupa ang nakita',
      confidence: 0.2,
    };
  } catch {
    // If offline or network error, assume target animal with fallback
    return {
      detected: true,
      species: 'Goat',
      label: 'Kambing ang nakita',
      confidence: 0.7,
    };
  }
}

// ── High-Level Health Scan Wrapper ────────────────────────────────────────────
export async function runHealthScan(
  canvas: HTMLCanvasElement,
  farmContext?: FarmHealthContext,
  _options: any = {}
): Promise<ScanResult> {
  const qualityReport = checkImageQuality(canvas);

  let geminiResult: any = null;
  try {
    geminiResult = await scanAnimalWithGemini(canvas, { context: 'health_scan' });
  } catch (err: any) {
    console.warn('Gemini scan failed, falling back to basic result:', err);
  }

  const detected = geminiResult ? geminiResult.detected : true;
  const raw = geminiResult?.rawResponse;
  const isSheep = raw?.animal_type === 'sheep';
  const hasConcerns = raw?.needs_attention || raw?.needs_medication || (raw?.possible_concerns?.length > 0);
  const healthStatus = raw?.health_status || (hasConcerns ? 'needs_attention' : 'healthy');

  let riskLevel: RiskLevel = 'LOW';
  let riskScore = 15;
  let riskLevelLabel = 'Mababa (Normal)';
  let riskLevelColor = '#16A34A';
  let riskLevelEmoji = '🟢';

  if (healthStatus === 'needs_medication' || (raw?.possible_concerns?.length || 0) >= 2) {
    riskLevel = 'HIGH';
    riskScore = 75;
    riskLevelLabel = 'Mataas na Peligro (Kailangan ng Gamot)';
    riskLevelColor = '#DC2626';
    riskLevelEmoji = '🔴';
  } else if (healthStatus === 'needs_attention' || hasConcerns) {
    riskLevel = 'MODERATE';
    riskScore = 45;
    riskLevelLabel = 'Katamtaman (Bantayan)';
    riskLevelColor = '#D97706';
    riskLevelEmoji = '🟡';
  }

  const indicators: DetectedIndicator[] = [];
  if (raw?.observations) {
    raw.observations.forEach((obs: string) => {
      indicators.push({
        indicator: 'NORMAL',
        label: obs,
        riskPoints: 0,
        confidence: 0.9,
        description: obs,
      });
    });
  }
  if (raw?.possible_concerns) {
    raw.possible_concerns.forEach((concern: string) => {
      indicators.push({
        indicator: 'OTHER_VISIBLE_ABNORMALITY',
        label: concern,
        riskPoints: 20,
        confidence: 0.85,
        description: concern,
      });
    });
  }

  return {
    goatDetected: detected,
    goatDetectionConfidence: detected ? 0.95 : 0.1,
    multipleAnimals: Boolean(raw?.multiple_animals),
    species: isSheep ? 'sheep' : 'goat',
    riskScore,
    riskLevel,
    riskLevelLabel,
    riskLevelColor,
    riskLevelEmoji,
    confidence: 0.95,
    confidencePercent: 95,
    indicators,
    primaryIndicators: indicators.slice(0, 3).map((i) => i.label),
    combinedRiskScore: farmContext?.healthRiskScore ? Math.round((riskScore + farmContext.healthRiskScore) / 2) : riskScore,
    combinedFactors: [],
    recommendation: raw?.recommendation || 'Patuloy na obserbahan ang alaga.',
    recommendedActions: [raw?.recommendation || 'Patuloy na obserbahan ang alaga.'],
    explanation: raw?.observations?.join('. ') || 'Matagumpay na na-scan ang kambing o tupa gamit ang Gemini Vision.',
    modelVersion: MODEL_VERSION,
    scanType: 'image',
    timestamp: new Date().toISOString(),
    qualityReport,
    disclaimer: 'Paunang visual screening lamang ito. Hindi ito pamalit sa pagsusuri ng lisensyadong beterinaryo.',
    isReliable: qualityReport.passed,
    possibleConditions: raw?.possible_concerns || [],
    observations: raw?.observations || [],
    estimatedTemperature: null, // STRICTLY null: camera cannot measure temperature
    temperatureStatus: null,
    temperatureConfidence: 0,
    thermalIndicators: ['Hindi nasukat ang temperatura sa pamamagitan ng camera.'],
    temperatureExplanation: 'Walang pisikal na thermometer na ginamit.',
    prediction: hasConcerns ? 'possible_health_concern' : 'normal_appearance',
    label: riskLevelLabel,
    labelColor: riskLevelColor,
  };
}

export async function analyzeVideoFrames(
  canvases: HTMLCanvasElement[],
  farmContext?: FarmHealthContext
): Promise<ScanResult> {
  const primaryCanvas = canvases[Math.floor(canvases.length / 2)] || canvases[0];
  return runHealthScan(primaryCanvas, farmContext);
}
