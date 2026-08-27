/**
 * useAutoScan.ts — Automatic Goat Detection + Health Screening State Machine
 *
 * STATE MACHINE:
 *   idle
 *     ↓ camera started
 *   detecting          ← running goat detection at ~5 fps
 *     ↓ REQUIRED_STABLE_FRAMES consecutive goat detections
 *   stable             ← show "Goat detected, preparing scan..."
 *     ↓ capture best frame
 *   scanning           ← running ML health scan (cameraML.ts)
 *     ↓ result ready
 *   result             ← showing screening result
 *     ↓ SCAN_COOLDOWN_SECONDS
 *   cooldown           ← showing cooldown timer
 *     ↓ cooldown expires
 *   detecting          ← back to detection loop
 *
 * IMPORTANT:
 *   - Detection runs at DETECTION_INTERVAL_MS (not every frame)
 *   - Scanning only runs when goat is stable (REQUIRED_STABLE_FRAMES)
 *   - Same-goat protection via cooldown + stable frame reset
 *   - All thresholds are configurable constants in goatDetector.ts
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
  | 'idle'        // camera not started
  | 'loading'     // loading ML model
  | 'detecting'   // running detection loop, no goat yet
  | 'stable'      // goat stable, about to capture
  | 'scanning'    // running health scan on captured frame
  | 'result'      // showing result
  | 'cooldown'    // waiting before next scan
  | 'error';      // unrecoverable error

export interface AutoScanStatus {
  state: ScanState;
  detection: DetectionResult | null;
  result: ScanResult | null;
  capturedUrl: string | null;
  capturedCanvas: HTMLCanvasElement | null;
  cooldownRemaining: number;   // seconds
  error: string | null;
  modelReady: boolean;
  usingFallback: boolean;
  message: string;             // user-facing status message
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAutoScan(options: {
  videoRef: React.RefObject<HTMLVideoElement>;
  animalId?: string;
  animalName?: string;
  farmContext?: FarmHealthContext;
  onResult?: (result: ScanResult, canvas: HTMLCanvasElement) => void;
}) {
  const { videoRef, animalId, animalName, farmContext, onResult } = options;

  const [state, setState]                     = useState<ScanState>('idle');
  const [detection, setDetection]             = useState<DetectionResult | null>(null);
  const [result, setResult]                   = useState<ScanResult | null>(null);
  const [capturedUrl, setCapturedUrl]         = useState<string | null>(null);
  const [capturedCanvas, setCapturedCanvas]   = useState<HTMLCanvasElement | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [error, setError]                     = useState<string | null>(null);
  const [modelReady, setModelReady]           = useState(false);
  const [usingFallback, setUsingFallback]     = useState(false);

  const modelRef          = useRef<any>(null);
  const detectionTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimer     = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef       = useRef(false);        // prevent concurrent scans
  const stateRef          = useRef<ScanState>('idle');
  const mountedRef        = useRef(true);

  // Keep stateRef in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── User-facing message ─────────────────────────────────────────────────────
  function getStatusMessage(s: ScanState, det: DetectionResult | null, cd: number): string {
    switch (s) {
      case 'idle':       return 'Camera not started.';
      case 'loading':    return 'Loading AI model…';
      case 'detecting':
        if (!det || !det.detected) return 'Looking for a goat…';
        return `Goat detected — stabilizing… (${det.stableFrames}/${REQUIRED_STABLE_FRAMES})`;
      case 'stable':     return 'Goat detected — preparing automatic scan…';
      case 'scanning':   return 'Analyzing health…';
      case 'result':     return 'Screening complete.';
      case 'cooldown':   return `Next scan in ${cd}s…`;
      case 'error':      return 'An error occurred.';
      default:           return '';
    }
  }

  // ── Stop detection loop ─────────────────────────────────────────────────────
  const stopDetection = useCallback(() => {
    if (detectionTimer.current) {
      clearInterval(detectionTimer.current);
      detectionTimer.current = null;
    }
  }, []);

  // ── Start cooldown ──────────────────────────────────────────────────────────
  const startCooldown = useCallback(() => {
    if (!mountedRef.current) return;
    setState('cooldown');
    stateRef.current = 'cooldown';
    let remaining = SCAN_COOLDOWN_SECONDS;
    setCooldownRemaining(remaining);
    resetStableFrameCount();

    cooldownTimer.current = setInterval(() => {
      remaining--;
      if (!mountedRef.current) { clearInterval(cooldownTimer.current!); return; }
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(cooldownTimer.current!);
        cooldownTimer.current = null;
        if (mountedRef.current) {
          setState('detecting');
          stateRef.current = 'detecting';
        }
      }
    }, 1000);
  }, []);

  // ── Run health scan ─────────────────────────────────────────────────────────
  const runScan = useCallback(async (canvas: HTMLCanvasElement) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    stopDetection();

    if (!mountedRef.current) { scanningRef.current = false; return; }
    setState('scanning');
    stateRef.current = 'scanning';

    const url = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedUrl(url);
    setCapturedCanvas(canvas);

    try {
      const scanResult = await runHealthScan(canvas, {
        animalId, animalName, farmContext, scanType: 'image',
      });

      if (!mountedRef.current) { scanningRef.current = false; return; }
      setResult(scanResult);
      setState('result');
      stateRef.current = 'result';
      onResult?.(scanResult, canvas);

      // Auto-transition to cooldown after 6 seconds of showing result
      setTimeout(() => {
        if (mountedRef.current && stateRef.current === 'result') {
          startCooldown();
        }
      }, 6000);

    } catch (err: any) {
      if (!mountedRef.current) { scanningRef.current = false; return; }
      setError(err?.message ?? 'Scan failed');
      setState('error');
    } finally {
      scanningRef.current = false;
    }
  }, [animalId, animalName, farmContext, onResult, stopDetection, startCooldown]);

  // ── Detection loop tick ─────────────────────────────────────────────────────
  const detectionTick = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    if (stateRef.current !== 'detecting' && stateRef.current !== 'stable') return;

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

    if (det.detected && !det.isStable) {
      setState('detecting');
      stateRef.current = 'detecting';
    } else if (det.isStable && !scanningRef.current) {
      // Stable detection → capture and scan
      setState('stable');
      stateRef.current = 'stable';

      // Small delay so user sees "stable" message
      await new Promise((r) => setTimeout(r, 500));
      if (!mountedRef.current || stateRef.current !== 'stable') return;

      const canvas = captureVideoFrame(video);
      await runScan(canvas);
    } else if (!det.detected) {
      if (stateRef.current === 'stable') {
        setState('detecting');
        stateRef.current = 'detecting';
      }
    }
  }, [videoRef, runScan]);

  // ── Start scanning session ──────────────────────────────────────────────────
  const startAutoScan = useCallback(async () => {
    if (!mountedRef.current) return;

    setState('loading');
    stateRef.current = 'loading';
    setError(null);
    setResult(null);
    setCapturedUrl(null);
    setCapturedCanvas(null);
    resetStableFrameCount();

    // Load MobileNet (returns null if unavailable → fallback mode)
    const model = await loadMobileNet();
    if (!mountedRef.current) return;

    modelRef.current = model;
    setModelReady(!!model);
    setUsingFallback(!model);

    setState('detecting');
    stateRef.current = 'detecting';

    // Start detection interval
    stopDetection();
    detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
  }, [stopDetection, detectionTick]);

  // ── Stop everything ─────────────────────────────────────────────────────────
  const stopAutoScan = useCallback(() => {
    stopDetection();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    resetStableFrameCount();
    setState('idle');
    stateRef.current = 'idle';
  }, [stopDetection]);

  // ── Force re-scan ───────────────────────────────────────────────────────────
  const rescan = useCallback(() => {
    setResult(null);
    setCapturedUrl(null);
    setCapturedCanvas(null);
    setDetection(null);
    resetStableFrameCount();
    if (cooldownTimer.current) { clearInterval(cooldownTimer.current); cooldownTimer.current = null; }
    setState('detecting');
    stateRef.current = 'detecting';
    stopDetection();
    detectionTimer.current = setInterval(detectionTick, DETECTION_INTERVAL_MS);
  }, [stopDetection, detectionTick]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopDetection();
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      resetStableFrameCount();
    };
  }, [stopDetection]);

  const message = getStatusMessage(state, detection, cooldownRemaining);

  return {
    // State
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
    // Actions
    startAutoScan,
    stopAutoScan,
    rescan,
  } satisfies AutoScanStatus & {
    startAutoScan: () => void;
    stopAutoScan: () => void;
    rescan: () => void;
  };
}
