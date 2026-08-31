/**
 * useAutoScan.ts — Automatic Goat/Sheep Detection + Health Screening
 *
 * 2.5-SECOND STABILITY & VERIFICATION PIPELINE:
 *   - When the camera is pointed at an object or animal, the system initiates a
 *     smooth 2.5-second (2500ms) observation timer.
 *   - During this 2.5s window:
 *       • Shows live countdown (2.5s -> 0.0s) & progress percentage (0% -> 100%).
 *       • Confirms whether the subject is a Goat/Sheep or Non-Target (Person/Dog/Cat/Object).
 *       • If moved away before 2.5s, the timer cleanly resets.
 *   - ONLY after holding steady for 2.5 full seconds:
 *       • Goat / Sheep -> Executes full AI Health Screening scan.
 *       • Non-Target (Tao, Aso, Pusa, Bagay) -> Displays verified non-target card.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  detectGoatInFrame,
  fallbackDetectGoat,
  resetStableFrameCount,
  SCAN_COOLDOWN_SECONDS,
  DETECTION_INTERVAL_MS,
  STABILITY_DURATION_MS,
  type DetectionResult,
} from './goatDetector';
import {
  loadMobileNet,
  runHealthScan,
  captureVideoFrame,
  type ScanResult,
  type FarmHealthContext,
} from './cameraML';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScanState =
  | 'idle'
  | 'loading'
  | 'detecting'       // looking or observing subject
  | 'other_detected'  // verified non-target object visible after 2.5s
  | 'stable'          // goat/sheep verified stable for 2.5s — executing scan
  | 'scanning'        // running health ML
  | 'result'          // showing result
  | 'cooldown'        // waiting before next scan
  | 'error';

export interface AutoScanStatus {
  state: ScanState;
  detection: DetectionResult | null;
  result: ScanResult | null;
  capturedUrl: string | null;
  capturedCanvas: HTMLCanvasElement | null;
  cooldownRemaining: number;
  error: string | null;
  modelReady: boolean;
  usingFallback: boolean;
  message: string;
  detectedSpecies: 'goat' | 'sheep' | null;
  stabilityProgress: number;          // 0 to 100%
  stabilityRemainingSeconds: number;  // 2.5 to 0.0s
  isObserving: boolean;               // True while counting down 2.5s
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
    case 'idle':           return 'Camera not started.';
    case 'loading':        return 'Loading AI detection model...';
    case 'other_detected': {
      const obj = det?.nonTargetClass ?? 'Bagay / Ibang Hayop';
      return `Hindi ito kambing o tupa (${obj}). Pakitapat ang camera sa goat o sheep.`;
    }
    case 'detecting':
      if (!det || (!det.detected && !det.otherDetected)) {
        return 'Naghahanap ng kambing o tupa...';
      }
      if (det.detected) {
        const sp = det.detectedSpecies === 'sheep' ? 'Tupa (Sheep)' : 'Kambing (Goat)';
        const conf = Math.round(det.confidence * 100);
        if (isObserving && remainingSec > 0) {
          return `Na-detect: ${sp} (${conf}%) — Pinagmamasdan (${remainingSec.toFixed(1)}s)... Panatilihing steady`;
        }
        return `Na-detect: ${sp} (${conf}%) — Kinukumpirma ang hayop...`;
      }
      if (det.otherDetected) {
        if (isObserving && remainingSec > 0) {
          return `Sinusuri kung ano ang nasa camera (${remainingSec.toFixed(1)}s)... Panatilihing nakatutok`;
        }
        const obj = det.nonTargetClass ?? 'Bagay / Ibang Hayop';
        return `Hindi ito kambing o tupa (${obj}).`;
      }
      return 'Naghahanap ng kambing o tupa...';
    case 'stable': {
      const sp = det?.detectedSpecies === 'sheep' ? 'Tupa (Sheep)' : 'Kambing (Goat)';
      const conf = Math.round((det?.confidence || 0.9) * 100);
      return `Kumpirmado: ${sp} (${conf}%) — Isinasagawa ang AI Health Screening...`;
    }
    case 'scanning':       return 'Isinasagawa ang AI Health Screening...';
    case 'result':         return 'Kumpleto ang pagsusuri.';
    case 'cooldown':       return `Maghahanap ng panibagong hayop sa loob ng ${cd}s...`;
    case 'error':          return 'May naganap na error sa pagsusuri.';
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
  onResult?: (result: ScanResult, canvas: HTMLCanvasElement, species: 'goat' | 'sheep') => void;
}) {
  const { videoRef, animalId, animalName, speciesPreference = 'auto', farmContext, onResult } = options;

  const [state, setState]               = useState<ScanState>('idle');
  const [detection, setDetection]       = useState<DetectionResult | null>(null);
  const [result, setResult]             = useState<ScanResult | null>(null);
  const [capturedUrl, setCapturedUrl]   = useState<string | null>(null);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [error, setError]               = useState<string | null>(null);
  const [modelReady, setModelReady]     = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [detectedSpecies, setDetectedSpecies] = useState<'goat' | 'sheep' | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [stabilityRemainingSeconds, setStabilityRemainingSeconds] = useState(2.5);
  const [isObserving, setIsObserving]   = useState(false);

  const modelRef           = useRef<any>(null);
  const detectionTimer     = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef        = useRef(false);
  const stateRef           = useRef<ScanState>('idle');
  const mountedRef         = useRef(true);

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

  // ── Cooldown between scans ────────────────────────────────────────────────
  const startCooldown = useCallback(() => {
    stopDetection();
    stopCooldown();
    resetStableFrameCount();
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
          detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
        }
      }
    }, 1000);
  }, [stopDetection, stopCooldown, resetStability]);

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

      if (!mountedRef.current) { scanningRef.current = false; return; }
      setResult(scanResult);

      if (!scanResult.goatDetected) {
        setState('other_detected');
        stateRef.current = 'other_detected';
        // Auto-cooldown after 5s to allow retrying
        setTimeout(() => {
          if (mountedRef.current && stateRef.current === 'other_detected') {
            startCooldown();
          }
        }, 5000);
        return;
      }

      setState('result');
      stateRef.current = 'result';
      onResult?.(scanResult, canvas, species);

      // Auto-transition to cooldown after 7 s
      setTimeout(() => {
        if (mountedRef.current && stateRef.current === 'result') {
          startCooldown();
        }
      }, 7000);
    } catch (err: any) {
      if (!mountedRef.current) { scanningRef.current = false; return; }
      setError(err?.message ?? 'Scan failed');
      setState('error');
    } finally {
      scanningRef.current = false;
    }
  }, [animalId, animalName, farmContext, onResult, stopDetection, startCooldown, resetStability]);

  // ── Detection tick with 2.5s Steady Hold Verification ─────────────────────
  const detectionTick = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const cur = stateRef.current;
    if (cur !== 'detecting' && cur !== 'stable' && cur !== 'other_detected') return;

    let det: DetectionResult;
    if (modelRef.current) {
      try {
        det = await detectGoatInFrame(video, modelRef.current);
      } catch {
        det = fallbackDetectGoat(video);
      }
    } else {
      det = fallbackDetectGoat(video);
    }

    if (!mountedRef.current) return;
    setDetection(det);

    const now = Date.now();
    const durationLimit = STABILITY_DURATION_MS; // 2500ms

    // ── Case 1: Target Livestock (Goat or Sheep) in frame ───────────────────
    if (det.detected) {
      const sp = det.detectedSpecies!;
      setDetectedSpecies(sp);

      // Reset timer if we were previously observing something else
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

      // If under 2.5 seconds, keep observing steadily
      if (elapsed < durationLimit) {
        if (stateRef.current !== 'detecting') {
          setState('detecting');
          stateRef.current = 'detecting';
        }
        return;
      }

      // ── 2.5s Completed & Verified → Trigger Health Scan ──────────────────
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

    // ── Case 2: Non-Target Object (Person, Dog, Cat, Object) in frame ───────
    if (det.otherDetected && !det.detected) {
      // Reset timer if we were previously observing something else
      if (subjectTypeRef.current !== 'non_target') {
        subjectTypeRef.current = 'non_target';
        subjectStartTimeRef.current = now;
      }

      const elapsed = now - (subjectStartTimeRef.current || now);
      const remainingSec = Math.max(0, +((durationLimit - elapsed) / 1000).toFixed(1));
      const progress = Math.min(100, Math.round((elapsed / durationLimit) * 100));

      setStabilityProgress(progress);
      setStabilityRemainingSeconds(remainingSec);
      setIsObserving(true);

      // If under 2.5 seconds, keep observing steadily before making statement
      if (elapsed < durationLimit) {
        if (stateRef.current !== 'detecting') {
          setState('detecting');
          stateRef.current = 'detecting';
        }
        return;
      }

      // ── 2.5s Completed & Verified → Confirm Non-Target Card ──────────────
      if (stateRef.current !== 'other_detected') {
        setState('other_detected');
        stateRef.current = 'other_detected';
        setIsObserving(false);
      }
      return;
    }

    // ── Case 3: Empty background / camera moved away ────────────────────────
    subjectStartTimeRef.current = null;
    subjectTypeRef.current = null;
    setStabilityProgress(0);
    setStabilityRemainingSeconds(2.5);
    setIsObserving(false);

    if (stateRef.current === 'other_detected' || stateRef.current === 'stable') {
      setState('detecting');
      stateRef.current = 'detecting';
    }
  }, [videoRef, runScan]);

  // ── Manual Instant Scan (Bypasses 2.5s countdown) ─────────────────────────
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
    setCapturedUrl(null);
    setCapturedCanvas(null);
    setDetection(null);
    setDetectedSpecies(null);
    resetStableFrameCount();
    resetStability();

    const model = await loadMobileNet();
    if (!mountedRef.current) return;

    modelRef.current = model;
    setModelReady(!!model);
    setUsingFallback(!model);
    setState('detecting');
    stateRef.current = 'detecting';

    stopDetection();
    detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
  }, [stopDetection, detectionTick, resetStability]);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopAutoScan = useCallback(() => {
    stopDetection();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    resetStableFrameCount();
    resetStability();
    setState('idle');
    stateRef.current = 'idle';
    setDetectedSpecies(null);
  }, [stopDetection, resetStability]);

  // ── Rescan ────────────────────────────────────────────────────────────────
  const rescan = useCallback(() => {
    setResult(null);
    setCapturedUrl(null);
    setCapturedCanvas(null);
    setDetection(null);
    setDetectedSpecies(null);
    resetStableFrameCount();
    resetStability();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    setState('detecting');
    stateRef.current = 'detecting';
    stopDetection();
    detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
  }, [stopDetection, detectionTick, resetStability]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopDetection();
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      resetStableFrameCount();
    };
  }, [stopDetection]);

  const message = buildMessage(state, detection, cooldownRemaining, stabilityRemainingSeconds, isObserving);

  return {
    state,
    detection,
    result,
    capturedUrl,
    capturedCanvas,
    cooldownRemaining,
    error,
    modelReady,
    usingFallback,
    message,
    detectedSpecies,
    stabilityProgress,
    stabilityRemainingSeconds,
    isObserving,
    startAutoScan,
    stopAutoScan,
    rescan,
    triggerManualScan,
  } satisfies AutoScanStatus & {
    startAutoScan: () => void;
    stopAutoScan: () => void;
    rescan: () => void;
    triggerManualScan: (customCanvas?: HTMLCanvasElement) => Promise<void>;
  };
}
