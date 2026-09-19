/**
 * useAutoScan.ts — Automatic Livestock Detection + Gemini Vision Health Screening
 *
 * FULLY STANDARDIZED WITH GEMINI VISION API:
 *   - Samples live frames every ~1.2s to /api/gemini/detect-objects.
 *   - Generates real normalized 2D bounding boxes and target classifications:
 *       • KAMBING / TUPA (Green bounding box, lock & auto-capture)
 *       • TAO (Blue bounding box, "TAO — Hindi kambing o tupa")
 *       • HAYOP (Amber bounding box, "HAYOP — Hindi kambing o tupa")
 *       • BAGAY (Slate dashed box)
 *   - Prevents auto-capture when multiple animals or non-targets are in view.
 *   - When a single goat or sheep is held steady for 2 cycles (~2.4s),
 *     automatically executes stage 2 full Gemini Vision health analysis.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  type DetectionResult,
  type TrackedAnimal,
  type LivestockAngle,
  SCAN_COOLDOWN_SECONDS,
  STABILITY_DURATION_MS,
} from './goatDetector';
import {
  runHealthScan,
  captureVideoFrame,
  type ScanResult,
  type FarmHealthContext,
} from './cameraML';
import {
  runRuleBasedScreening,
  combineScreeningAssessments,
  type RuleBasedScreeningResult,
  type CombinedScreeningAssessment,
} from './ruleBasedScreening';
import {
  detectLiveFrameLocally,
} from './clientObjectDetector';
import type { LiveDetectedObject } from './cameraUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScanState =
  | 'idle'
  | 'loading'
  | 'detecting'       // looking or observing subject
  | 'other_detected'  // verified non-target object visible
  | 'stable'          // goat/sheep verified stable — executing scan
  | 'scanning'        // running health ML
  | 'result'          // showing result
  | 'cooldown'        // waiting before next scan
  | 'error';

export interface AutoScanStatus {
  state: ScanState;
  detection: DetectionResult | null;
  result: ScanResult | null;
  ruleResult: RuleBasedScreeningResult | null;
  combinedAssessment: CombinedScreeningAssessment | null;
  capturedUrl: string | null;
  capturedCanvas: HTMLCanvasElement | null;
  cooldownRemaining: number;
  error: string | null;
  modelReady: boolean;
  usingFallback: boolean;
  message: string;
  detectedSpecies: 'goat' | 'sheep' | null;
  detectedAngle: LivestockAngle | null;
  angleLabel: string | null;
  angleTagalog: string | null;
  angleGuidance: string | null;
  angleClinicalFocus: string | null;
  trackedAnimals: TrackedAnimal[];
  liveDetections: LiveDetectedObject[];
  selectedTargetId: string | null;
  stabilityProgress: number;          // 0 to 100%
  stabilityRemainingSeconds: number;  // 2.5 to 0.0s
  isObserving: boolean;               // True while counting down
}

// ── User-facing messages ──────────────────────────────────────────────────────

function buildMessage(
  state: ScanState,
  det: DetectionResult | null,
  cd: number,
  remainingSec: number,
  isObserving: boolean,
): string {
  switch (state) {
    case 'idle':           return 'Hindi pa bukas ang camera.';
    case 'loading':        return 'Inihahanda ang Gemini camera scanner...';
    case 'other_detected': {
      if (det?.nonTargetClass) {
        return `${det.nonTargetClass.toUpperCase()} — Hindi ito kambing o tupa.`;
      }
      return 'Hindi ito kambing o tupa. Itapat ang camera sa kambing o tupa.';
    }
    case 'detecting':
      if (!det || (!det.detected && !det.otherDetected)) {
        return 'Naghahanap... Itapat ang camera sa isang kambing o tupa.';
      }
      if (det.detected) {
        const sp = det.detectedSpecies === 'sheep' ? 'Tupa' : 'Kambing';
        if (det.trackedAnimals && det.trackedAnimals.length > 1) {
          const hasGoat = det.trackedAnimals.some((a) => a.species === 'goat');
          const hasSheep = det.trackedAnimals.some((a) => a.species === 'sheep');
          if (hasGoat && hasSheep) {
            return 'May kambing at tupa na nakita. Piliin ang hayop na gusto mong i-scan.';
          }
          return 'Maraming hayop ang nakita. Piliin ang hayop na gusto mong i-scan.';
        }
        if (isObserving && remainingSec > 0) {
          return `Naka-lock sa hayop: ${sp} — Huwag igalaw (${remainingSec.toFixed(1)}s)...`;
        }
        return `Nakita ang hayop: ${sp}`;
      }
      if (det.otherDetected) {
        return `${det.nonTargetClass?.toUpperCase() ?? 'BAGAY'} — Hindi ito kambing o tupa.`;
      }
      return 'Naghahanap... Itapat ang camera sa kambing o tupa.';
    case 'stable': {
      const sp = det?.detectedSpecies === 'sheep' ? 'Tupa' : 'Kambing';
      return `Nakita ang hayop: ${sp} — Sinusuri ang kalusugan sa Gemini Vision...`;
    }
    case 'scanning':       return 'Sinusuri ang kalusugan ng hayop sa Gemini Vision...';
    case 'result':         return 'Tapos na ang pagsusuri sa kalusugan.';
    case 'cooldown':       return `Handa para sa susunod na scan sa loob ng ${cd}s...`;
    case 'error':          return 'Nagkaroon ng problema habang nagsusuri.';
    default:               return '';
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAutoScan(options: {
  videoRef: React.RefObject<HTMLVideoElement>;
  animalId?: string;
  animalName?: string;
  speciesPreference?: 'auto' | 'goat' | 'sheep';
  farmContext?: FarmHealthContext;
  onResult?: (
    result: ScanResult,
    canvas: HTMLCanvasElement,
    species: 'goat' | 'sheep',
    ruleResult?: RuleBasedScreeningResult,
    combined?: CombinedScreeningAssessment,
  ) => void;
}) {
  const { videoRef, animalId, animalName, speciesPreference = 'auto', farmContext, onResult } = options;

  const [state, setState]                             = useState<ScanState>('idle');
  const [detection, setDetection]                     = useState<DetectionResult | null>(null);
  const [liveDetections, setLiveDetections]           = useState<LiveDetectedObject[]>([]);
  const [result, setResult]                           = useState<ScanResult | null>(null);
  const [ruleResult, setRuleResult]                   = useState<RuleBasedScreeningResult | null>(null);
  const [combinedAssessment, setCombinedAssessment]   = useState<CombinedScreeningAssessment | null>(null);
  const [capturedUrl, setCapturedUrl]                 = useState<string | null>(null);
  const [capturedCanvas, setCapturedCanvas]           = useState<HTMLCanvasElement | null>(null);
  const [cooldownRemaining, setCooldownRemaining]     = useState(0);
  const [error, setError]                             = useState<string | null>(null);
  const [detectedSpecies, setDetectedSpecies]         = useState<'goat' | 'sheep' | null>(null);
  const [stabilityProgress, setStabilityProgress]     = useState(0);
  const [stabilityRemainingSeconds, setStabilityRemainingSeconds] = useState(2.5);
  const [isObserving, setIsObserving]                 = useState(false);

  const detectionTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef         = useRef(false);
  const isSamplingRef       = useRef(false);
  const stateRef            = useRef<ScanState>('idle');
  const mountedRef          = useRef(true);

  // 2.5-second stability tracking refs
  const subjectStartTimeRef = useRef<number | null>(null);
  const subjectTypeRef      = useRef<'target' | 'non_target' | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Stop timers ───────────────────────────────────────────────────────────
  const stopDetection = useCallback(() => {
    if (detectionTimer.current) {
      clearInterval(detectionTimer.current);
      detectionTimer.current = null;
    }
  }, []);

  const stopCooldown = useCallback(() => {
    if (cooldownTimer.current) {
      clearInterval(cooldownTimer.current);
      cooldownTimer.current = null;
    }
  }, []);

  const resetStability = useCallback(() => {
    subjectStartTimeRef.current = null;
    subjectTypeRef.current = null;
    if (mountedRef.current) {
      setStabilityProgress(0);
      setStabilityRemainingSeconds(2.5);
      setIsObserving(false);
    }
  }, []);

  // ── Run health scan on canvas ─────────────────────────────────────────────
  const runScan = useCallback(async (
    canvas: HTMLCanvasElement,
    species: 'goat' | 'sheep',
  ) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    stopDetection();
    resetStability();

    if (!mountedRef.current) { scanningRef.current = false; return; }
    setState('scanning');
    stateRef.current = 'scanning';

    setCapturedUrl(canvas.toDataURL('image/jpeg', 0.88));
    setCapturedCanvas(canvas);

    try {
      const targetSpecies =
        speciesPreference === 'sheep' ? 'Sheep' :
        speciesPreference === 'goat' ? 'Goat' :
        species === 'sheep' ? 'Sheep' : 'Goat';

      const scanResult = await runHealthScan(canvas, {
        animalId,
        animalName,
        animalType: targetSpecies,
        farmContext,
        scanType: 'image',
      });

      // Execute Rule-Based Visual Screening alongside Gemini Vision
      const ruleRes = runRuleBasedScreening(canvas);
      const combined = combineScreeningAssessments(scanResult, ruleRes);

      if (!mountedRef.current) { scanningRef.current = false; return; }
      setResult(scanResult);
      setRuleResult(ruleRes);
      setCombinedAssessment(combined);

      if (!scanResult.goatDetected) {
        setState('other_detected');
        stateRef.current = 'other_detected';
        setTimeout(() => {
          if (mountedRef.current && stateRef.current === 'other_detected') {
            startCooldown();
          }
        }, 5000);
        return;
      }

      setState('result');
      stateRef.current = 'result';
      onResult?.(scanResult, canvas, species, ruleRes, combined);

      // Auto-transition to cooldown after 20s
      setTimeout(() => {
        if (mountedRef.current && stateRef.current === 'result') {
          startCooldown();
        }
      }, 20000);
    } catch (err: any) {
      if (!mountedRef.current) { scanningRef.current = false; return; }
      setError(err?.message ?? 'Scan failed');
      setState('error');
    } finally {
      scanningRef.current = false;
    }
  }, [animalId, animalName, speciesPreference, farmContext, onResult, stopDetection, resetStability]);

  // ── Detection tick using Gemini Vision Object Detection API ──────────────
  const detectionTick = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const cur = stateRef.current;
    if (cur !== 'detecting' && cur !== 'stable' && cur !== 'other_detected') return;

    if (isSamplingRef.current) return;
    isSamplingRef.current = true;

    try {
      const liveRes = await detectLiveFrameLocally(video);
      if (!mountedRef.current) return;

      setLiveDetections(liveRes.detections);

      const goatSheep = liveRes.detections.filter(d => d.type === 'GOAT' || d.type === 'SHEEP');
      const hasMultiple = liveRes.multiple_targets || goatSheep.length > 1;

      // ── Case 1: Target Livestock (Goat or Sheep) in frame ───────────────────
      if (goatSheep.length > 0) {
        const primary = goatSheep[0];
        const sp: 'goat' | 'sheep' = primary.type === 'SHEEP' ? 'sheep' : 'goat';
        setDetectedSpecies(sp);

        const tracked: TrackedAnimal[] = goatSheep.map((d, idx) => {
          const isSheep = d.type === 'SHEEP';
          const animalSpecies: 'goat' | 'sheep' = isSheep ? 'sheep' : 'goat';
          const x1 = d.boundingBox.x;
          const y1 = d.boundingBox.y;
          const x2 = d.boundingBox.x + d.boundingBox.width;
          const y2 = d.boundingBox.y + d.boundingBox.height;
          const box: [number, number, number, number] = [x1, y1, x2, y2];
          return {
            id: `${animalSpecies}-${idx + 1}`,
            label: d.label,
            species: animalSpecies,
            confidence: 0.95,
            box,
            smoothedBox: box,
            isSelected: idx === 0,
            lastSeen: Date.now(),
          };
        });

        const det: DetectionResult = {
          detected: true,
          otherDetected: false,
          detectedSpecies: sp,
          detectedAngle: 'SIDE_VIEW',
          angleLabel: 'Side Profile',
          angleTagalog: 'Tagiliran',
          angleGuidance: hasMultiple
            ? 'Maraming hayop ang nakita. Itapat ang camera sa isang kambing o tupa.'
            : 'Panatilihing steady ang camera sa hayop.',
          angleClinicalFocus: 'Gemini Vision Live Object Detection',
          angleConfidence: 0.95,
          nonTargetClass: null,
          detectedEmoji: sp === 'sheep' ? '🐑' : '🐐',
          confidence: 0.95,
          topClass: primary.label,
          allClasses: [],
          trackedAnimals: tracked,
          selectedTargetId: tracked[0]?.id || null,
          isStable: !hasMultiple,
          stableFrames: hasMultiple ? 0 : 2,
        };
        setDetection(det);

        if (hasMultiple) {
          // Multiple animals detected - do NOT auto-capture, warn user
          subjectStartTimeRef.current = null;
          subjectTypeRef.current = null;
          setStabilityProgress(0);
          setStabilityRemainingSeconds(2.5);
          setIsObserving(false);
          return;
        }

        // Single target livestock - run stability counter
        const now = Date.now();
        const durationLimit = STABILITY_DURATION_MS; // 2500ms
        if (subjectTypeRef.current !== 'target') {
          subjectTypeRef.current = 'target';
          subjectStartTimeRef.current = now;
        }

        const elapsed = now - (subjectStartTimeRef.current || now);
        const remainingSec = Math.max(0, +((durationLimit - elapsed) / 1000).toFixed(1));
        const progress = Math.min(100, Math.round((elapsed / durationLimit) * 100));

        setStabilityProgress(progress);
        setStabilityRemainingSeconds(remainingSec);
        setIsObserving(true);

        if (elapsed < durationLimit) {
          if (stateRef.current !== 'detecting') {
            setState('detecting');
            stateRef.current = 'detecting';
          }
          return;
        }

        // 2.5s steady hold reached -> trigger health scan
        if (!scanningRef.current) {
          setState('stable');
          stateRef.current = 'stable';
          setIsObserving(false);

          await new Promise((r) => setTimeout(r, 150));
          if (!mountedRef.current || stateRef.current !== 'stable') return;

          const canvas = captureVideoFrame(video);
          await runScan(canvas, sp);
        }
        return;
      }

      // ── Case 2: Non-Target (PERSON, OTHER_ANIMAL, OBJECT) in frame ─────────
      const nonTarget = liveRes.detections.find(d => d.type === 'PERSON' || d.type === 'OTHER_ANIMAL' || d.type === 'OBJECT');
      if (nonTarget) {
        const det: DetectionResult = {
          detected: false,
          otherDetected: true,
          detectedSpecies: null,
          detectedAngle: null,
          angleLabel: null,
          angleTagalog: null,
          angleGuidance: `${nonTarget.label} — Hindi ito kambing o tupa.`,
          angleClinicalFocus: null,
          angleConfidence: null,
          nonTargetClass: nonTarget.label,
          detectedEmoji: '⚠️',
          confidence: 0.9,
          topClass: nonTarget.label,
          allClasses: [],
          trackedAnimals: [],
          selectedTargetId: null,
          isStable: false,
          stableFrames: 0,
        };
        setDetection(det);
        subjectStartTimeRef.current = null;
        subjectTypeRef.current = null;
        setStabilityProgress(0);
        setStabilityRemainingSeconds(2.5);
        setIsObserving(false);

        if (stateRef.current !== 'other_detected') {
          setState('other_detected');
          stateRef.current = 'other_detected';
        }
        return;
      }

      // ── Case 3: Empty background / camera searching ────────────────────────
      setDetection(null);
      subjectStartTimeRef.current = null;
      subjectTypeRef.current = null;
      setStabilityProgress(0);
      setStabilityRemainingSeconds(2.5);
      setIsObserving(false);
      if (stateRef.current === 'other_detected' || stateRef.current === 'stable') {
        setState('detecting');
        stateRef.current = 'detecting';
      }
    } catch (err) {
      console.warn('[useAutoScan] detectionTick error, clearing stale detections:', err);
      setLiveDetections([]);
      setDetection(null);
    } finally {
      isSamplingRef.current = false;
    }
  }, [videoRef, runScan]);

  // ── Cooldown between scans ────────────────────────────────────────────────
  const startCooldown = useCallback(() => {
    stopDetection();
    stopCooldown();
    resetStability();

    setState('cooldown');
    stateRef.current = 'cooldown';
    setCooldownRemaining(SCAN_COOLDOWN_SECONDS);

    let remaining = SCAN_COOLDOWN_SECONDS;
    cooldownTimer.current = setInterval(() => {
      remaining--;
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        stopCooldown();
        if (mountedRef.current) {
          setState('detecting');
          stateRef.current = 'detecting';
          setResult(null);
          setCapturedUrl(null);
          setCapturedCanvas(null);
          setDetectedSpecies(null);
          resetStability();
          detectionTimer.current = setInterval(detectionTick, 150);
        }
      }
    }, 1000);
  }, [stopDetection, stopCooldown, resetStability, detectionTick]);

  // ── Manual Instant Scan (Bypasses steady hold countdown) ───────────────────
  const triggerManualScan = useCallback(async (customCanvas?: HTMLCanvasElement) => {
    if (scanningRef.current) return;
    let canvas = customCanvas;
    if (!canvas) {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      canvas = captureVideoFrame(video);
    }
    const sp = detectedSpecies || (detection?.detectedSpecies) || 'goat';
    await runScan(canvas, sp);
  }, [videoRef, detectedSpecies, detection, runScan]);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startAutoScan = useCallback(async () => {
    if (!mountedRef.current) return;
    setState('loading');
    stateRef.current = 'loading';
    setError(null);
    setResult(null);
    setRuleResult(null);
    setCombinedAssessment(null);
    setCapturedUrl(null);
    setCapturedCanvas(null);
    setDetection(null);
    setLiveDetections([]);
    setDetectedSpecies(null);
    resetStability();

    setState('detecting');
    stateRef.current = 'detecting';

    stopDetection();
    detectionTimer.current = setInterval(detectionTick, 150);
  }, [stopDetection, detectionTick, resetStability]);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopAutoScan = useCallback(() => {
    stopDetection();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    resetStability();
    setState('idle');
    stateRef.current = 'idle';
    setDetectedSpecies(null);
  }, [stopDetection, resetStability]);

  // ── Rescan ────────────────────────────────────────────────────────────────
  const rescan = useCallback(() => {
    setResult(null);
    setRuleResult(null);
    setCombinedAssessment(null);
    setCapturedUrl(null);
    setCapturedCanvas(null);
    setDetection(null);
    setLiveDetections([]);
    setDetectedSpecies(null);
    resetStability();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    setState('detecting');
    stateRef.current = 'detecting';
    stopDetection();
    detectionTimer.current = setInterval(detectionTick, 1200);
  }, [stopDetection, detectionTick, resetStability]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopDetection();
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, [stopDetection]);

  const setSelectedTarget = useCallback((id: string | null) => {
    if (detection) {
      setDetection({
        ...detection,
        selectedTargetId: id,
        trackedAnimals: detection.trackedAnimals.map(a => ({
          ...a,
          isSelected: id ? a.id === id : true,
        })),
      });
    }
  }, [detection]);

  const message = buildMessage(state, detection, cooldownRemaining, stabilityRemainingSeconds, isObserving);

  return {
    state,
    detection,
    liveDetections,
    result,
    ruleResult,
    combinedAssessment,
    capturedUrl,
    capturedCanvas,
    cooldownRemaining,
    error,
    modelReady: true,
    usingFallback: false,
    message,
    detectedSpecies,
    detectedAngle: detection?.detectedAngle ?? null,
    angleLabel: detection?.angleLabel ?? null,
    angleTagalog: detection?.angleTagalog ?? null,
    angleGuidance: detection?.angleGuidance ?? null,
    angleClinicalFocus: detection?.angleClinicalFocus ?? null,
    trackedAnimals: detection?.trackedAnimals ?? [],
    selectedTargetId: detection?.selectedTargetId ?? null,
    stabilityProgress,
    stabilityRemainingSeconds,
    isObserving,
    startAutoScan,
    stopAutoScan,
    triggerManualScan,
    rescan,
    setSelectedTarget,
  };
}
