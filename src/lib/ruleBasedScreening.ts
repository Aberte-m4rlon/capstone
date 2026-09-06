/**
 * ruleBasedScreening.ts — Rule-Based Visual Camera Screening for AlpasFarm
 *
 * Lightweight client-side computer vision layer that analyzes visible characteristics
 * directly from HTML Canvas/image pixels using browser APIs (HTML Camera & Canvas,
 * RGB/HSV color space transformations, brightness/blur metrics, and spatial ROIs).
 *
 * CRITICAL SAFETY RULES:
 * 1. Visual screening tool only — NEVER claim a confirmed medical diagnosis.
 * 2. NO disease naming ("May anemia", "May pneumonia", "May sakit").
 * 3. Uses farmer-friendly observation terminology ("Posibleng may health concern",
 *    "May nakitang visual sign na kailangan bantayan", "Recommended ang manual health check").
 * 4. NEVER automatically prescribes medication or alters inventory.
 * 5. Runs alongside existing ML; does NOT replace, disable, or alter existing ML.
 */

import type { ScanResult, RiskLevel } from './cameraML';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleFindingTarget = 'eye' | 'nose' | 'mouth' | 'coat' | 'posture';
export type RuleFindingStatus = 'normal' | 'concern' | 'insufficient_info';
export type RuleSeverity = 'low' | 'moderate' | 'high';

export interface RuleFinding {
  target: RuleFindingTarget;
  targetLabel: string;            // e.g. "Mata / Talukap", "Ilong / Nguso"
  status: RuleFindingStatus;
  label: string;                  // Short farmer label
  description: string;            // Detailed farmer-friendly explanation
  severity: RuleSeverity;
  metric?: string;                // e.g. "HSV(15°, 68%, 72%)"
}

export interface RuleBasedImageQuality {
  passed: boolean;
  score: number;                  // 0 to 100
  brightness: number;             // 0 to 100
  blurScore: number;              // Laplacian variance estimation
  contrast: number;               // 0 to 100
  resolution: { width: number; height: number };
  issues: string[];
  guidance: string[];
}

export interface RuleBasedScreeningResult {
  hasConcern: boolean;
  status: 'normal' | 'concern' | 'insufficient_info';
  statusLabel: string;
  findings: RuleFinding[];
  quality: RuleBasedImageQuality;
  observations: string[];
  guidance: string[];
  timestamp: string;
}

export interface CombinedScreeningAssessment {
  overallStatus: 'normal' | 'observation' | 'concern' | 'not_target' | 'unclear';
  overallLabel: string;
  overallBadgeColor: string;
  overallBadgeBg: string;
  overallBadgeBorder: string;
  overallScore: number;           // 0 to 100

  // Independent assessments
  mlAssessment: {
    available: boolean;
    detectedAnimal: boolean;
    species: string;
    status: 'normal' | 'concern' | 'unavailable' | 'not_target';
    statusLabel: string;
    confidencePercent: number;
    riskScore: number;
    riskLevel: RiskLevel;
  };
  ruleAssessment: {
    available: boolean;
    status: 'normal' | 'concern' | 'insufficient_info';
    statusLabel: string;
    findingsCount: number;
    findings: RuleFinding[];
    qualityScore: number;
  };

  // Farmer-friendly messages
  summaryMessage: string;
  recommendationMessage: string;
  actionType: 'none' | 'manual_check' | 'rescan';
  actionLabel: string;

  // Key visual observations for display
  observations: string[];
  technicalDetails: {
    modelVersion?: string;
    detectionEngine?: string;
    imageQualityScore: number;
    brightness: number;
    contrast: number;
    blurScore: number;
    ruleFindingsSummary: string[];
  };
}

// ── Color Space Utilities ─────────────────────────────────────────────────────

/**
 * Convert RGB (0–255) to HSV:
 *   H: 0–360 degrees
 *   S: 0–1
 *   V: 0–1
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  if (diff === 0) {
    h = 0;
  } else if (max === rNorm) {
    h = ((gNorm - bNorm) / diff) % 6;
  } else if (max === gNorm) {
    h = (bNorm - rNorm) / diff + 2;
  } else {
    h = (rNorm - gNorm) / diff + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return { h, s, v };
}

// ── Image Quality Checker ─────────────────────────────────────────────────────

/**
 * Checks resolution, brightness, contrast, and blur score from canvas.
 * Returns farmer-friendly guidance in Tagalog if quality is insufficient.
 */
export function checkImageQuality(canvas: HTMLCanvasElement): RuleBasedImageQuality {
  const width = canvas.width;
  const height = canvas.height;
  const issues: string[] = [];
  const guidance: string[] = [];

  // Resolution check
  if (width < 160 || height < 160) {
    issues.push('Masyadong maliit ang resolusyon ng larawan.');
    guidance.push('📷 Ilapit nang kaunti ang camera sa hayop.');
  }

  // Downsample to 128x128 for rapid pixel statistics
  const sampleW = 128;
  const sampleH = 128;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const ctx = sampleCanvas.getContext('2d');

  if (!ctx) {
    return {
      passed: true,
      score: 75,
      brightness: 50,
      blurScore: 100,
      contrast: 50,
      resolution: { width, height },
      issues: [],
      guidance: [],
    };
  }

  ctx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imgData.data;
  const totalPixels = sampleW * sampleH;

  let lumSum = 0;
  let lumSqSum = 0;
  const lumGrid: number[][] = Array.from({ length: sampleH }, () => new Array(sampleW).fill(0));

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const idx = (y * sampleW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lumGrid[y][x] = lum;
      lumSum += lum;
      lumSqSum += lum * lum;
    }
  }

  const avgLum = lumSum / totalPixels;
  const variance = Math.max(0, lumSqSum / totalPixels - avgLum * avgLum);
  const contrast = Math.min(100, Math.round((Math.sqrt(variance) / 128) * 100));
  const brightness = Math.round((avgLum / 255) * 100);

  // Brightness checks
  if (brightness < 18) {
    issues.push('Masyadong madilim ang paligid.');
    guidance.push('💡 Siguraduhing maliwanag ang lugar o buksan ang ilaw.');
  } else if (brightness > 92) {
    issues.push('Masyadong maliwanag o nasilaw ang camera.');
    guidance.push('📷 I-adjust ang anggulo para hindi masilaw ang lens.');
  }

  // Laplacian edge sharpness (blur estimate)
  let laplacianSum = 0;
  let edgeCount = 0;

  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      // 3x3 discrete Laplacian filter
      const center = lumGrid[y][x];
      const lap = Math.abs(
        lumGrid[y - 1][x] +
        lumGrid[y + 1][x] +
        lumGrid[y][x - 1] +
        lumGrid[y][x + 1] -
        4 * center
      );
      laplacianSum += lap;
      edgeCount++;
    }
  }

  const blurScore = edgeCount > 0 ? Math.round((laplacianSum / edgeCount) * 10) : 50;

  if (blurScore < 12) {
    issues.push('Malabo o gumalaw ang kuha ng camera.');
    guidance.push('📸 Hawakan nang steady ang camera habang kumukuha.');
  }

  // Quality score formula
  let score = 100;
  if (brightness < 20 || brightness > 90) score -= 35;
  else if (brightness < 30 || brightness > 80) score -= 15;

  if (blurScore < 12) score -= 40;
  else if (blurScore < 20) score -= 20;

  if (contrast < 15) score -= 20;
  if (width < 200 || height < 200) score -= 15;

  score = Math.max(10, Math.min(100, score));
  const passed = score >= 40 && issues.length <= 1;

  if (!passed && guidance.length === 0) {
    guidance.push('Subukang kumuha ng mas malinaw na larawan.');
  }

  return {
    passed,
    score,
    brightness,
    blurScore,
    contrast,
    resolution: { width, height },
    issues,
    guidance,
  };
}

// ── Region of Interest (ROI) Pixel Sampler ────────────────────────────────────

interface RegionStats {
  avgR: number;
  avgG: number;
  avgB: number;
  avgH: number;
  avgS: number;
  avgV: number;
  lumStd: number;
  edgeVariance: number;
  pixelCount: number;
}

function sampleRegion(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  canvasW: number,
  canvasH: number,
): RegionStats {
  const x0 = Math.max(0, Math.floor(startX * canvasW));
  const y0 = Math.max(0, Math.floor(startY * canvasH));
  const w = Math.max(1, Math.min(canvasW - x0, Math.floor((endX - startX) * canvasW)));
  const h = Math.max(1, Math.min(canvasH - y0, Math.floor((endY - startY) * canvasH)));

  const imgData = ctx.getImageData(x0, y0, w, h);
  const data = imgData.data;
  const count = w * h;

  let sumR = 0, sumG = 0, sumB = 0;
  let sumH = 0, sumS = 0, sumV = 0;
  let lumSum = 0, lumSqSum = 0;
  let edgeSum = 0;

  for (let i = 0; i < count; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    sumR += r;
    sumG += g;
    sumB += b;

    const { h: hue, s: sat, v: val } = rgbToHsv(r, g, b);
    sumH += hue;
    sumS += sat;
    sumV += val;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += lum;
    lumSqSum += lum * lum;

    // Fast horizontal gradient
    if (i % w < w - 1) {
      const nextR = data[idx + 4];
      const nextG = data[idx + 5];
      const nextB = data[idx + 6];
      const nextLum = 0.299 * nextR + 0.587 * nextG + 0.114 * nextB;
      edgeSum += Math.abs(lum - nextLum);
    }
  }

  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;
  const avgLum = lumSum / count;
  const lumVariance = Math.max(0, lumSqSum / count - avgLum * avgLum);

  return {
    avgR,
    avgG,
    avgB,
    avgH: sumH / count,
    avgS: sumS / count,
    avgV: sumV / count,
    lumStd: Math.sqrt(lumVariance),
    edgeVariance: edgeSum / Math.max(1, count - 1),
    pixelCount: count,
  };
}

// ── Target Anatomical Analyzers ───────────────────────────────────────────────

/**
 * 1. Eye / Inner Eyelid Mucosal Analysis
 * Inspects mucosal coloration for pallor, redness, jaundice/yellowing, or cloudiness.
 * Non-diagnostic phrasing strictly enforced.
 */
function analyzeEyeRegion(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  quality: RuleBasedImageQuality,
): RuleFinding {
  // Upper-central ROI where goat/sheep ocular region is located (Y: 20%-45%, X: 25%-75%)
  const eyeStats = sampleRegion(ctx, 0.25, 0.75, 0.20, 0.45, w, h);

  if (quality.brightness < 20 || quality.blurScore < 12) {
    return {
      target: 'eye',
      targetLabel: 'Mata / Talukap',
      status: 'insufficient_info',
      label: 'Hindi sapat ang impormasyon sa mata',
      description: 'Maaaring hindi sapat ang liwanag o kalinawan ng larawan para suriin ang bahagi ng mata.',
      severity: 'low',
    };
  }

  const { avgH, avgS, avgV } = eyeStats;

  // A. Pale / Whitish: Low saturation with elevated brightness in mucosal zone
  if (avgS < 0.22 && avgV > 0.62) {
    return {
      target: 'eye',
      targetLabel: 'Mata / Talukap',
      status: 'concern',
      label: 'Maputla ang nakitang bahagi ng mata',
      description: 'May napansing pamumutla sa nakitang bahagi ng mata o talukap. Posibleng may kaugnayan sa health concern na kailangang obserbahan.',
      severity: 'moderate',
      metric: `S:${Math.round(avgS * 100)}% V:${Math.round(avgV * 100)}%`,
    };
  }

  // B. Yellowish: Hue in yellow band (38°–65°) with notable saturation
  if (avgH >= 38 && avgH <= 65 && avgS > 0.35 && avgV > 0.35) {
    return {
      target: 'eye',
      targetLabel: 'Mata / Talukap',
      status: 'concern',
      label: 'May nakitang paninilaw sa bahagi ng mata',
      description: 'May napansing kulay dilaw sa bahagi ng mata. Recommended ang manual health check upang masuri nang personal.',
      severity: 'moderate',
      metric: `H:${Math.round(avgH)}° S:${Math.round(avgS * 100)}%`,
    };
  }

  // C. Unusually Red: Intense redness (Hue < 18 or > 342, High saturation)
  if ((avgH < 18 || avgH > 342) && avgS > 0.52 && avgV > 0.30) {
    return {
      target: 'eye',
      targetLabel: 'Mata / Talukap',
      status: 'concern',
      label: 'Matingkad o mapulang bahagi sa mata',
      description: 'May napansing kakaibang pamumula sa paligid o loob ng bahagi ng mata. Obserbahan kung may iritasyon.',
      severity: 'moderate',
      metric: `H:${Math.round(avgH)}° S:${Math.round(avgS * 100)}%`,
    };
  }

  // D. Cloudy / Bluish-white haze: Corneal cloudiness / low local contrast
  if (eyeStats.lumStd < 12 && avgV > 0.65 && avgS < 0.28) {
    return {
      target: 'eye',
      targetLabel: 'Mata / Talukap',
      status: 'concern',
      label: 'May nakitang cloudiness sa mata',
      description: 'May napansing bahagyang panlalabo o pamumuti sa ibabaw ng mata. Veterinary assessment recommended kung magpatuloy.',
      severity: 'moderate',
      metric: `Haze: Std ${Math.round(eyeStats.lumStd)}`,
    };
  }

  // Default: Normal-looking visual appearance
  return {
    target: 'eye',
    targetLabel: 'Mata / Talukap',
    status: 'normal',
    label: 'Normal ang nakitang hitsura ng mata',
    description: 'Walang nakitang kakaibang pamumutla, paninilaw, o cloudiness sa nakitang bahagi ng mata.',
    severity: 'low',
    metric: `H:${Math.round(avgH)}° S:${Math.round(avgS * 100)}%`,
  };
}

/**
 * 2. Nose / Muzzle Analysis
 * Checks for obvious discharge, excessive wetness, or discoloration.
 */
function analyzeNoseRegion(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  quality: RuleBasedImageQuality,
): RuleFinding {
  // Mid-lower central region (Y: 52%-78%, X: 36%-64%)
  const noseStats = sampleRegion(ctx, 0.36, 0.64, 0.52, 0.78, w, h);

  if (quality.brightness < 20 || quality.blurScore < 12) {
    return {
      target: 'nose',
      targetLabel: 'Ilong / Nguso',
      status: 'insufficient_info',
      label: 'Hindi sapat ang impormasyon sa ilong',
      description: 'Hindi sapat ang kalinawan o detalye ng larawan para suriin ang ilong.',
      severity: 'low',
    };
  }

  // High edge variance and high specular contrast indicate wetness/discharge or crusting
  if (noseStats.edgeVariance > 18 && noseStats.lumStd > 28) {
    return {
      target: 'nose',
      targetLabel: 'Ilong / Nguso',
      status: 'concern',
      label: 'Posibleng may discharge o basa sa ilong',
      description: 'May napansing kakaibang pagkabasa o discharge sa paligid ng nguso. Recommended ang manual health check.',
      severity: 'moderate',
      metric: `Edge:${Math.round(noseStats.edgeVariance)} Std:${Math.round(noseStats.lumStd)}`,
    };
  }

  return {
    target: 'nose',
    targetLabel: 'Ilong / Nguso',
    status: 'normal',
    label: 'Normal ang nakitang nguso at ilong',
    description: 'Walang napansing labis na discharge o kakaibang dumi sa paligid ng ilong.',
    severity: 'low',
  };
}

/**
 * 3. Mouth / Lip Analysis
 * Conservative inspection of the lower muzzle region.
 */
function analyzeMouthRegion(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  quality: RuleBasedImageQuality,
): RuleFinding {
  // Lower muzzle ROI (Y: 68%-90%, X: 35%-65%)
  const mouthStats = sampleRegion(ctx, 0.35, 0.65, 0.68, 0.90, w, h);

  if (quality.brightness < 22 || quality.blurScore < 14) {
    return {
      target: 'mouth',
      targetLabel: 'Bibig / Labi',
      status: 'insufficient_info',
      label: 'Maaaring hindi sapat ang larawan para sa bibig',
      description: 'Hindi sapat ang detalye ng larawan upang matiyak ang kalagayan ng paligid ng bibig.',
      severity: 'low',
    };
  }

  // Obvious redness or irregular scab-like contrast around lips
  if (
    ((mouthStats.avgH < 15 || mouthStats.avgH > 345) && mouthStats.avgS > 0.45) ||
    (mouthStats.edgeVariance > 22 && mouthStats.lumStd > 32)
  ) {
    return {
      target: 'mouth',
      targetLabel: 'Bibig / Labi',
      status: 'concern',
      label: 'May napansing kakaibang pamamaga o kulay sa bibig',
      description: 'May napansing pamumula o hindi pantay na hitsura sa paligid ng bibig. I-check kung may sugat o pamamaga.',
      severity: 'moderate',
      metric: `Edge:${Math.round(mouthStats.edgeVariance)}`,
    };
  }

  return {
    target: 'mouth',
    targetLabel: 'Bibig / Labi',
    status: 'normal',
    label: 'Normal ang nakitang bahagi ng bibig',
    description: 'Walang nakitang kapansin-pansing pamamaga o sugat sa labas ng bibig.',
    severity: 'low',
  };
}

/**
 * 4. Body / Coat Uniformity Analysis
 * Detects patchy coat, discoloration, or obvious lesions without claiming diagnosis.
 */
function analyzeCoatRegion(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  quality: RuleBasedImageQuality,
): RuleFinding {
  // Broad body region (Y: 30%-75%, X: 15%-85%)
  const coatStats = sampleRegion(ctx, 0.15, 0.85, 0.30, 0.75, w, h);

  if (quality.brightness < 20 || quality.blurScore < 12) {
    return {
      target: 'coat',
      targetLabel: 'Balahibo / Katawan',
      status: 'insufficient_info',
      label: 'Hindi sapat ang detalye para sa balahibo',
      description: 'Maaaring hindi sapat ang larawan para sa pagsusuri ng balahibo.',
      severity: 'low',
    };
  }

  // High localized texture variance and standard deviation indicates coat roughness/patchiness
  if (coatStats.lumStd > 34 && coatStats.edgeVariance > 20) {
    return {
      target: 'coat',
      targetLabel: 'Balahibo / Katawan',
      status: 'concern',
      label: 'Napansing hindi pantay ang balahibo (patchy coat)',
      description: 'May napansing bahagi ng balahibo na tila hindi pantay o magaspang. I-inspect nang manual para sa kuto, garapata, o kagat.',
      severity: 'moderate',
      metric: `Std:${Math.round(coatStats.lumStd)}`,
    };
  }

  return {
    target: 'coat',
    targetLabel: 'Balahibo / Katawan',
    status: 'normal',
    label: 'Pantay ang nakitang balahibo ng katawan',
    description: 'Walang napansing malawakang pagkalagas o kapansin-pansing sugat sa nakitang bahagi ng katawan.',
    severity: 'low',
  };
}

/**
 * 5. Posture / Activity Observation
 * Simple visual heuristic regarding stance, lying down, or unusual posture.
 */
function analyzePosture(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  quality: RuleBasedImageQuality,
): RuleFinding {
  // Aspect ratio and vertical distribution of animal mass
  const topQuarter = sampleRegion(ctx, 0.20, 0.80, 0.05, 0.35, w, h);
  const bottomQuarter = sampleRegion(ctx, 0.20, 0.80, 0.65, 0.95, w, h);

  if (quality.brightness < 20 || quality.blurScore < 12) {
    return {
      target: 'posture',
      targetLabel: 'Tindig / Posture',
      status: 'insufficient_info',
      label: 'Hindi masuri ang tindig',
      description: 'Hindi sapat ang sakop ng frame para matukoy ang postura.',
      severity: 'low',
    };
  }

  // Drooping head or excessive downward concentration
  if (topQuarter.avgV < 0.25 && bottomQuarter.avgV > 0.45 && bottomQuarter.edgeVariance > 16) {
    return {
      target: 'posture',
      targetLabel: 'Tindig / Posture',
      status: 'concern',
      label: 'Napansing hindi pangkaraniwan ang posture',
      description: 'Napansing nakayuko o hindi pangkaraniwan ang tindig. Magkaroon ng manual health check upang suriin ang sigla ng hayop.',
      severity: 'moderate',
    };
  }

  return {
    target: 'posture',
    targetLabel: 'Tindig / Posture',
    status: 'normal',
    label: 'Normal ang tindig ng hayop',
    description: 'Maayos ang tindig at posisyon ng hayop habang kinukunan ng camera.',
    severity: 'low',
  };
}

// ── Main Rule-Based Screening Execution ───────────────────────────────────────

/**
 * Executes the entire Rule-Based Visual Screening pipeline on an HTMLCanvasElement.
 * Pure browser-native, fast, no external network or ML dependencies.
 */
export function runRuleBasedScreening(canvas: HTMLCanvasElement): RuleBasedScreeningResult {
  const timestamp = new Date().toISOString();

  // 1. Image Quality Assessment
  const quality = checkImageQuality(canvas);

  if (!quality.passed) {
    return {
      hasConcern: false,
      status: 'insufficient_info',
      statusLabel: 'Hindi Sapat ang Larawan',
      findings: [
        {
          target: 'coat',
          targetLabel: 'Kalidad ng Larawan',
          status: 'insufficient_info',
          label: '⚠️ Hindi sapat ang kalidad ng larawan',
          description: quality.issues.join(' ') || 'Subukang kumuha ng mas malinaw na larawan.',
          severity: 'low',
        },
      ],
      quality,
      observations: [
        '⚠️ Hindi sapat ang kalidad ng larawan.',
        'Subukang kumuha ng mas malinaw na larawan.',
        ...quality.guidance,
      ],
      guidance: [
        '📷 Ilapit nang kaunti ang camera.',
        '💡 Siguraduhing maliwanag ang lugar.',
        '👁️ Itutok ang camera sa mata.',
        '🐐 Siguraduhing kita ang ulo ng hayop.',
      ],
      timestamp,
    };
  }

  // 2. Perform ROI & Pixel Analysis
  // Downsample to 256x256 for optimal performance and memory safety
  const sampleW = 256;
  const sampleH = 256;
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = sampleW;
  analysisCanvas.height = sampleH;
  const ctx = analysisCanvas.getContext('2d');

  if (!ctx) {
    return {
      hasConcern: false,
      status: 'insufficient_info',
      statusLabel: 'Canvas Context Error',
      findings: [],
      quality,
      observations: ['Hindi mabasa ang pixels sa device.'],
      guidance: ['Subukan muling buksan ang camera.'],
      timestamp,
    };
  }

  ctx.drawImage(canvas, 0, 0, sampleW, sampleH);

  // 3. Analyze visible targets
  const eyeFinding = analyzeEyeRegion(ctx, sampleW, sampleH, quality);
  const noseFinding = analyzeNoseRegion(ctx, sampleW, sampleH, quality);
  const mouthFinding = analyzeMouthRegion(ctx, sampleW, sampleH, quality);
  const coatFinding = analyzeCoatRegion(ctx, sampleW, sampleH, quality);
  const postureFinding = analyzePosture(ctx, sampleW, sampleH, quality);

  const findings: RuleFinding[] = [
    eyeFinding,
    noseFinding,
    mouthFinding,
    coatFinding,
    postureFinding,
  ];

  const concerns = findings.filter((f) => f.status === 'concern');
  const hasConcern = concerns.length > 0;

  const status: RuleBasedScreeningResult['status'] =
    hasConcern ? 'concern' : findings.every((f) => f.status === 'normal') ? 'normal' : 'insufficient_info';

  const statusLabel =
    status === 'concern'
      ? 'May Visual Sign na Napansin'
      : status === 'normal'
      ? 'Normal ang Nakitang Hitsura'
      : 'Hindi Sapat ang Impormasyon';

  const observations = findings.map((f) => `${f.targetLabel}: ${f.label}`);

  return {
    hasConcern,
    status,
    statusLabel,
    findings,
    quality,
    observations,
    guidance: [
      '📷 Ilapit nang kaunti ang camera.',
      '💡 Siguraduhing maliwanag ang lugar.',
      '👁️ Itutok ang camera sa mata.',
      '🐐 Siguraduhing kita ang ulo ng hayop.',
    ],
    timestamp,
  };
}

// ── Assessment Combiner Engine ────────────────────────────────────────────────

/**
 * Combines ML Assessment and Rule-Based Visual Screening according to the
 * user specification matrix:
 *
 * 1. Both agree on concern:
 *    -> 🔴 Mas mataas na concern
 *    -> "Parehong may nakitang health concern ang automated checks.
 *        Mag-record ng Manual Health Check at isaalang-alang ang veterinary assessment."
 *
 * 2. Both agree on normal:
 *    -> 🟢 Maayos / Normal
 *    -> "Walang nakitang malinaw na alalahanin sa automated screening.
 *        Ipagpatuloy ang regular na pagmamasid."
 *
 * 3. Disagree (one concern, one normal/unclear):
 *    -> 🟡 Needs Observation / Kailangan ng Atensyon
 *    -> "May nakitang visual sign na hindi tugma sa ibang assessment.
 *        Magkaroon ng manual health check para makumpirma."
 *
 * 4. Only ML has result:
 *    -> "ML assessment available. Visual screening could not determine enough information."
 *
 * 5. Only Rule-Based has result:
 *    -> "Visual screening result available. Ang ML assessment ay pansamantalang hindi magamit."
 *
 * 6. Non-Target (Not a Goat/Sheep):
 *    -> ⚠️ "Hindi kambing o tupa ang nakita. Pakisigurong kambing o tupa ang nasa camera."
 */
export function combineScreeningAssessments(
  mlResult: ScanResult | null,
  ruleResult: RuleBasedScreeningResult | null,
  options: { mlFailedOrUnavailable?: boolean } = {},
): CombinedScreeningAssessment {
  const { mlFailedOrUnavailable = false } = options;

  // ── Case 6: Non-Target detected by ML ───────────────────────────────────────
  if (mlResult && !mlResult.goatDetected) {
    return {
      overallStatus: 'not_target',
      overallLabel: 'Hindi Kambing o Tupa',
      overallBadgeColor: '#DC2626',
      overallBadgeBg: 'rgba(220, 38, 38, 0.1)',
      overallBadgeBorder: 'rgba(220, 38, 38, 0.3)',
      overallScore: 0,
      mlAssessment: {
        available: true,
        detectedAnimal: false,
        species: 'Iba / Non-Target',
        status: 'not_target',
        statusLabel: 'Hindi Kambing o Tupa',
        confidencePercent: mlResult.confidencePercent || 0,
        riskScore: 0,
        riskLevel: 'LOW',
      },
      ruleAssessment: {
        available: Boolean(ruleResult),
        status: 'insufficient_info',
        statusLabel: 'Hindi Masuri',
        findingsCount: 0,
        findings: [],
        qualityScore: ruleResult?.quality.score ?? 50,
      },
      summaryMessage: '⚠️ Hindi kambing o tupa ang nakita. Pakisigurong kambing o tupa ang nasa camera.',
      recommendationMessage: 'Ang camera screening ay nakalaan lamang para sa mga kambing at tupa. Itutok ang camera sa kambing o tupa bago mag-scan.',
      actionType: 'rescan',
      actionLabel: 'Subukang Mag-scan Ulit',
      observations: ['Hindi kambing o tupa ang nakita sa camera.'],
      technicalDetails: {
        modelVersion: mlResult.modelVersion,
        detectionEngine: mlResult.detectionEngine,
        imageQualityScore: mlResult.qualityReport.score,
        brightness: ruleResult?.quality.brightness ?? 50,
        contrast: ruleResult?.quality.contrast ?? 50,
        blurScore: ruleResult?.quality.blurScore ?? 50,
        ruleFindingsSummary: [],
      },
    };
  }

  // ── Determine independent states ───────────────────────────────────────────
  const mlAvailable = Boolean(mlResult && !mlFailedOrUnavailable);
  const mlHasConcern = mlAvailable && (
    mlResult!.riskLevel === 'HIGH' ||
    mlResult!.riskLevel === 'CRITICAL' ||
    mlResult!.riskLevel === 'MODERATE' ||
    mlResult!.riskScore >= 25
  );

  const ruleAvailable = Boolean(ruleResult && ruleResult.quality.passed);
  const ruleHasConcern = ruleAvailable && ruleResult!.hasConcern;
  const ruleUnclear = !ruleAvailable || ruleResult?.status === 'insufficient_info';

  const mlStatusLabel = !mlAvailable
    ? 'Hindi Magamit ang ML'
    : mlHasConcern
    ? 'Posibleng Health Concern'
    : 'Walang Malinaw na Alalahanin';

  const ruleStatusLabel = !ruleAvailable
    ? 'Hindi Sapat ang Larawan'
    : ruleHasConcern
    ? 'May Nakitang Visual Sign'
    : 'Normal ang Nakitang Hitsura';

  const ruleFindings = ruleResult?.findings || [];
  const concernFindings = ruleFindings.filter((f) => f.status === 'concern');

  // ── Case 5: Only Rule-Based has result (ML unavailable or failed) ────────────
  if (!mlAvailable && ruleAvailable && ruleResult) {
    const status = ruleHasConcern ? 'observation' : 'normal';
    return {
      overallStatus: status,
      overallLabel: ruleHasConcern ? 'Kailangan ng Atensyon' : 'Maayos / Normal',
      overallBadgeColor: ruleHasConcern ? '#D97706' : '#16A34A',
      overallBadgeBg: ruleHasConcern ? 'rgba(217, 119, 6, 0.1)' : 'rgba(22, 163, 74, 0.1)',
      overallBadgeBorder: ruleHasConcern ? 'rgba(217, 119, 6, 0.3)' : 'rgba(22, 163, 74, 0.3)',
      overallScore: ruleHasConcern ? 45 : 10,
      mlAssessment: {
        available: false,
        detectedAnimal: true,
        species: 'Kambing / Tupa',
        status: 'unavailable',
        statusLabel: 'Pansamantalang Hindi Magamit',
        confidencePercent: 0,
        riskScore: 0,
        riskLevel: 'LOW',
      },
      ruleAssessment: {
        available: true,
        status: ruleHasConcern ? 'concern' : 'normal',
        statusLabel: ruleStatusLabel,
        findingsCount: concernFindings.length,
        findings: ruleFindings,
        qualityScore: ruleResult.quality.score,
      },
      summaryMessage: ruleHasConcern
        ? 'May nakitang visual sign sa larawan. Ang ML assessment ay pansamantalang hindi magamit.'
        : 'Normal ang nakitang visual appearance. Ang ML assessment ay pansamantalang hindi magamit.',
      recommendationMessage: ruleHasConcern
        ? 'Magkaroon ng Manual Health Check upang masuri nang personal ang hayop.'
        : 'Ipagpatuloy ang regular na pagmamasid sa kawan.',
      actionType: 'manual_check',
      actionLabel: 'Manual Health Check',
      observations: ruleResult.observations,
      technicalDetails: {
        imageQualityScore: ruleResult.quality.score,
        brightness: ruleResult.quality.brightness,
        contrast: ruleResult.quality.contrast,
        blurScore: ruleResult.quality.blurScore,
        ruleFindingsSummary: ruleResult.observations,
      },
    };
  }

  // ── Case 4: Only ML has result (Rule-based is insufficient/blurry) ───────────
  if (mlAvailable && (!ruleAvailable || ruleUnclear)) {
    const status = mlHasConcern ? 'observation' : 'normal';
    return {
      overallStatus: status,
      overallLabel: mlHasConcern ? 'Kailangan ng Atensyon' : 'Maayos / Normal',
      overallBadgeColor: mlHasConcern ? '#D97706' : '#16A34A',
      overallBadgeBg: mlHasConcern ? 'rgba(217, 119, 6, 0.1)' : 'rgba(22, 163, 74, 0.1)',
      overallBadgeBorder: mlHasConcern ? 'rgba(217, 119, 6, 0.3)' : 'rgba(22, 163, 74, 0.3)',
      overallScore: mlResult!.riskScore,
      mlAssessment: {
        available: true,
        detectedAnimal: true,
        species: mlResult!.species === 'sheep' ? 'Tupa' : 'Kambing',
        status: mlHasConcern ? 'concern' : 'normal',
        statusLabel: mlStatusLabel,
        confidencePercent: mlResult!.confidencePercent,
        riskScore: mlResult!.riskScore,
        riskLevel: mlResult!.riskLevel,
      },
      ruleAssessment: {
        available: false,
        status: 'insufficient_info',
        statusLabel: 'Hindi Sapat ang Larawan',
        findingsCount: 0,
        findings: ruleFindings,
        qualityScore: ruleResult?.quality.score ?? mlResult!.qualityReport.score,
      },
      summaryMessage: mlHasConcern
        ? 'May nakitang posibleng alalahanin sa ML assessment. Hindi sapat ang impormasyon sa larawan para sa kumpletong visual screening.'
        : 'Walang nakitang malinaw na alalahanin sa ML assessment. Hindi sapat ang impormasyon sa larawan para sa kumpletong visual screening.',
      recommendationMessage: mlHasConcern
        ? 'Magkaroon ng Manual Health Check upang makumpirma ang kalagayan.'
        : 'Subukang kumuha ng mas malinaw na larawan para sa visual screening.',
      actionType: 'manual_check',
      actionLabel: 'Manual Health Check',
      observations: mlResult!.observations || [],
      technicalDetails: {
        modelVersion: mlResult!.modelVersion,
        detectionEngine: mlResult!.detectionEngine,
        imageQualityScore: mlResult!.qualityReport.score,
        brightness: ruleResult?.quality.brightness ?? 50,
        contrast: ruleResult?.quality.contrast ?? 50,
        blurScore: ruleResult?.quality.blurScore ?? 50,
        ruleFindingsSummary: ['Hindi sapat ang detalye ng larawan para sa rule-based screening.'],
      },
    };
  }

  // ── Both ML and Rule-Based have valid results ───────────────────────────────
  const finalScore = Math.round(
    ((mlResult?.riskScore ?? 15) * 0.55) + (ruleHasConcern ? 40 : 10) * 0.45
  );

  // Case 1: Both Agree on Concern (ML Concern + Rule Concern)
  if (mlHasConcern && ruleHasConcern) {
    return {
      overallStatus: 'concern',
      overallLabel: 'Mas Mataas na Concern',
      overallBadgeColor: '#DC2626',
      overallBadgeBg: 'rgba(220, 38, 38, 0.1)',
      overallBadgeBorder: 'rgba(220, 38, 38, 0.3)',
      overallScore: Math.max(65, finalScore),
      mlAssessment: {
        available: true,
        detectedAnimal: true,
        species: mlResult!.species === 'sheep' ? 'Tupa' : 'Kambing',
        status: 'concern',
        statusLabel: 'Posibleng Health Concern',
        confidencePercent: mlResult!.confidencePercent,
        riskScore: mlResult!.riskScore,
        riskLevel: mlResult!.riskLevel,
      },
      ruleAssessment: {
        available: true,
        status: 'concern',
        statusLabel: 'May Nakitang Visual Sign',
        findingsCount: concernFindings.length,
        findings: ruleFindings,
        qualityScore: ruleResult!.quality.score,
      },
      summaryMessage: 'Parehong may nakitang health concern ang automated checks.',
      recommendationMessage: 'Mag-record ng Manual Health Check at isaalang-alang ang veterinary assessment.',
      actionType: 'manual_check',
      actionLabel: 'Mag-record ng Manual Health Check',
      observations: [
        ...concernFindings.map((f) => `${f.targetLabel}: ${f.label}`),
        ...(mlResult?.observations || []).slice(0, 2),
      ],
      technicalDetails: {
        modelVersion: mlResult!.modelVersion,
        detectionEngine: mlResult!.detectionEngine,
        imageQualityScore: ruleResult!.quality.score,
        brightness: ruleResult!.quality.brightness,
        contrast: ruleResult!.quality.contrast,
        blurScore: ruleResult!.quality.blurScore,
        ruleFindingsSummary: ruleResult!.observations,
      },
    };
  }

  // Case 2: Both Agree on Normal (ML Normal + Rule Normal)
  if (!mlHasConcern && !ruleHasConcern) {
    return {
      overallStatus: 'normal',
      overallLabel: 'Maayos / Walang Alalahanin',
      overallBadgeColor: '#16A34A',
      overallBadgeBg: 'rgba(220, 38, 38, 0.1)',
      overallBadgeBorder: 'rgba(22, 163, 74, 0.3)',
      overallScore: Math.min(15, finalScore),
      mlAssessment: {
        available: true,
        detectedAnimal: true,
        species: mlResult!.species === 'sheep' ? 'Tupa' : 'Kambing',
        status: 'normal',
        statusLabel: 'Walang Malinaw na Alalahanin',
        confidencePercent: mlResult!.confidencePercent,
        riskScore: mlResult!.riskScore,
        riskLevel: mlResult!.riskLevel,
      },
      ruleAssessment: {
        available: true,
        status: 'normal',
        statusLabel: 'Normal ang Nakitang Hitsura',
        findingsCount: 0,
        findings: ruleFindings,
        qualityScore: ruleResult!.quality.score,
      },
      summaryMessage: 'Walang nakitang malinaw na alalahanin sa automated screening.',
      recommendationMessage: 'Ipagpatuloy ang regular na pagpapakain, malinis na inumin, at pagmamasid sa kawan.',
      actionType: 'none',
      actionLabel: 'Maayos ang Kalagayan',
      observations: [
        'Normal ang nakitang visual appearance sa camera screening.',
        'Wala ring napansing kakaibang indicators sa ML assessment.',
      ],
      technicalDetails: {
        modelVersion: mlResult!.modelVersion,
        detectionEngine: mlResult!.detectionEngine,
        imageQualityScore: ruleResult!.quality.score,
        brightness: ruleResult!.quality.brightness,
        contrast: ruleResult!.quality.contrast,
        blurScore: ruleResult!.quality.blurScore,
        ruleFindingsSummary: ruleResult!.observations,
      },
    };
  }

  // Case 3: Disagree (ML says concern but Rule says normal, OR Rule says concern but ML says normal)
  return {
    overallStatus: 'observation',
    overallLabel: 'Kailangan ng Atensyon',
    overallBadgeColor: '#D97706',
    overallBadgeBg: 'rgba(217, 119, 6, 0.1)',
    overallBadgeBorder: 'rgba(217, 119, 6, 0.3)',
    overallScore: Math.max(35, Math.min(60, finalScore)),
    mlAssessment: {
      available: true,
      detectedAnimal: true,
      species: mlResult!.species === 'sheep' ? 'Tupa' : 'Kambing',
      status: mlHasConcern ? 'concern' : 'normal',
      statusLabel: mlStatusLabel,
      confidencePercent: mlResult!.confidencePercent,
      riskScore: mlResult!.riskScore,
      riskLevel: mlResult!.riskLevel,
    },
    ruleAssessment: {
      available: true,
      status: ruleHasConcern ? 'concern' : 'normal',
      statusLabel: ruleStatusLabel,
      findingsCount: concernFindings.length,
      findings: ruleFindings,
      qualityScore: ruleResult!.quality.score,
    },
    summaryMessage: 'May nakitang visual sign na hindi tugma sa ibang assessment.',
    recommendationMessage: 'Magkaroon ng manual health check para makumpirma ang tunay na kalagayan.',
    actionType: 'manual_check',
    actionLabel: 'Manual Health Check',
    observations: [
      ruleHasConcern
        ? `Visual Sign: ${concernFindings.map((f) => f.label).join(', ')}`
        : 'Normal ang nakitang hitsura sa visual rule check.',
      mlHasConcern
        ? `ML Observation: ${mlResult?.primaryIndicators?.join(', ') || 'Possible health indicator'}`
        : 'Walang nakitang alalahanin sa ML model.',
    ],
    technicalDetails: {
      modelVersion: mlResult!.modelVersion,
      detectionEngine: mlResult!.detectionEngine,
      imageQualityScore: ruleResult!.quality.score,
      brightness: ruleResult!.quality.brightness,
      contrast: ruleResult!.quality.contrast,
      blurScore: ruleResult!.quality.blurScore,
      ruleFindingsSummary: ruleResult!.observations,
    },
  };
}
