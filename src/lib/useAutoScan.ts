/**
 * useAutoScan.ts — Automatic Goat/Sheep Detection + Health Screening
 *
 * STATE MACHINE:
 *
 *   idle
 *     ↓ startAutoScan()
 *   loading        ← loading MobileNet model
 *     ↓
 *   detecting      ← running detection at ~5 FPS
 *     ↓ goat/sheep stable (REQUIRED_STABLE_FRAMES)
 *   stable         ← "Goat detected — preparing scan..."
 *     ↓ auto-capture
 *   scanning       ← running health ML
 *     ↓
 *   result         ← showing result (6 s)
 *     ↓
 *   cooldown       ← SCAN_COOLDOWN_SECONDS
 *     ↓
 *   detecting      ← loop
 *
 *   ALSO:
 *   detecting → other_detected  when non-goat/sheep is seen
 *   other_detected → detecting  when it leaves
 *
 * KEY UPGRADE:
 *   - Distinguishes goat vs sheep vs other object
 *   - Shows "Dog detected — this is not a goat or sheep" for non-targets
 *   - Health scan only runs for goat or sheep
 *   - Saves species ('goat'|'sheep') with the screening result
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  detectGoatInFrame,
  fallbackDetectGoat,
  resetStableFrameCount,
  SCAN_COOLDOWN_SECONDS,
  DETECTION_INTERVAL_MS,
  REQUIRED_STABLE_FRAMES,
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
  | 'detecting'       // looking for goat/sheep
  | 'other_detected'  // non-target object visible
  | 'stable'          // goat/sheep stable — about to capture
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
}

// ── User-facing messages ──────────────────────────────────────────────────────

function buildMessage(
  state: ScanState,
  det: DetectionResult | null,
  cd: number,
): string {
  switch (state) {
    case 'idle':           return 'Camera not started.';
    case 'loading':        return 'Loading AI detection model…';
    case 'other_detected': {
      const obj = det?.nonTargetClass ?? 'Object';
      return `${obj} detected — this is not a goat or sheep.`;
    }
    case 'detecting':
      if (!det || (!det.detected && !det.otherDetected)) {
        return 'Looking for a goat or sheep…';
      }
      if (det.detected) {
        const sp = det.detectedSpecies === 'sheep' ? 'Sheep' : 'Goat';
        return `${sp} detected — stabilizing… (${det.stableFrames}/${REQUIRED_STABLE_FRAMES})`;
      }
      return 'Looking for a goat or sheep…';
    case 'stable': {
      const sp = det?.detectedSpecies === 'sheep' ? 'Sheep' : 'Goat';
      return `${sp} detected — preparing automatic scan…`;
    }
    case 'scanning':       return 'Analyzing health…';
    case 'result':         return 'Screening complete.';
    case 'cooldown':       return `Looking for another animal in ${cd}s…`;
    case 'error':          return 'An error occurred.';
    default:               return '';
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAutoScan(options: {
  videoRef: React.RefObject<HTMLVideoElement>;
  animalId?: string;
  animalName?: string;
  farmContext?: FarmHealthContext;
  onResult?: (result: ScanResult, canvas: HTMLCanvasElement, species: 'goat' | 'sheep') => void;
}) {
  const { videoRef, animalId, animalName, farmContext, onResult } = options;

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

  const modelRef       = useRef<any>(null);
  const detectionTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef    = useRef(false);
  const stateRef       = useRef<ScanState>('idle');
  const mountedRef     = useRef(true);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Stop detection loop ──────────────────────────────────────────────────
  const stopDetection = useCallback(() => {
    if (detectionTimer.current) {
      clearInterval(detectionTimer.current);
      detectionTimer.current = null;
    }
  }, []);

  // ── Cooldown ─────────────────────────────────────────────────────────────
  const startCooldown = useCallback(() => {
    if (!mountedRef.current) return;
    setState('cooldown');
    stateRef.current = 'cooldown';
    let rem = SCAN_COOLDOWN_SECONDS;
    setCooldownRemaining(rem);
    resetStableFrameCount();
    setDetectedSpecies(null);

    cooldownTimer.current = setInterval(() => {
      rem--;
      if (!mountedRef.current) { clearInterval(cooldownTimer.current!); return; }
      setCooldownRemaining(rem);
      if (rem <= 0) {
        clearInterval(cooldownTimer.current!);
        cooldownTimer.current = null;
        if (mountedRef.current) {
          setState('detecting');
          stateRef.current = 'detecting';
        }
      }
    }, 1000);
  }, []);

  // ── Health scan ──────────────────────────────────────────────────────────
  const runScan = useCallback(async (
    canvas: HTMLCanvasElement,
    species: 'goat' | 'sheep',
  ) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    stopDetection();

    if (!mountedRef.current) { scanningRef.current = false; return; }
    setState('scanning');
    stateRef.current = 'scanning';

    setCapturedUrl(canvas.toDataURL('image/jpeg', 0.85));
    setCapturedCanvas(canvas);

    try {
      const scanResult = await runHealthScan(canvas, {
        animalId,
        animalName,
        farmContext,
        scanType: 'image',
      });

      if (!mountedRef.current) { scanningRef.current = false; return; }
      setResult(scanResult);
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
  }, [animalId, animalName, farmContext, onResult, stopDetection, startCooldown]);

  // ── Detection tick ────────────────────────────────────────────────────────
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

    // ── Non-target object (dog, cat, person, car…) ──────────────────────
    if (det.otherDetected && !det.detected) {
      if (stateRef.current !== 'other_detected') {
        setState('other_detected');
        stateRef.current = 'other_detected';
      }
      return;
    }

    // ── No detection ─────────────────────────────────────────────────────
    if (!det.detected) {
      if (stateRef.current === 'other_detected' || stateRef.current === 'stable') {
        setState('detecting');
        stateRef.current = 'detecting';
      }
      return;
    }

    // ── Goat or sheep detected ────────────────────────────────────────────
    const sp = det.detectedSpecies!;
    setDetectedSpecies(sp);

    if (!det.isStable) {
      // Still building stable frames
      if (stateRef.current !== 'detecting') {
        setState('detecting');
        stateRef.current = 'detecting';
      }
      return;
    }

    // ── Stable → capture and scan ─────────────────────────────────────────
    if (!scanningRef.current) {
      setState('stable');
      stateRef.current = 'stable';

      await new Promise((r) => setTimeout(r, 250));
      if (!mountedRef.current || stateRef.current !== 'stable') return;

      const canvas = captureVideoFrame(video);
      await runScan(canvas, sp);
    }
  }, [videoRef, runScan]);

  // ── Manual Instant Scan ───────────────────────────────────────────────────
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

    const model = await loadMobileNet();
    if (!mountedRef.current) return;

    modelRef.current = model;
    setModelReady(!!model);
    setUsingFallback(!model);
    setState('detecting');
    stateRef.current = 'detecting';

    stopDetection();
    detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
  }, [stopDetection, detectionTick]);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopAutoScan = useCallback(() => {
    stopDetection();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    resetStableFrameCount();
    setState('idle');
    stateRef.current = 'idle';
    setDetectedSpecies(null);
  }, [stopDetection]);

  // ── Rescan ────────────────────────────────────────────────────────────────
  const rescan = useCallback(() => {
    setResult(null);
    setCapturedUrl(null);
    setCapturedCanvas(null);
    setDetection(null);
    setDetectedSpecies(null);
    resetStableFrameCount();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    setState('detecting');
    stateRef.current = 'detecting';
    stopDetection();
    detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
  }, [stopDetection, detectionTick]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopDetection();
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      resetStableFrameCount();
    };
  }, [stopDetection]);

  const message = buildMessage(state, detection, cooldownRemaining);

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
