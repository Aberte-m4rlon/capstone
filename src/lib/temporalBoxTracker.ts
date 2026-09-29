/**
 * temporalBoxTracker.ts — Real-Time Temporal Animal Tracker & Motion Stabilizer
 *
 * Designed for AlpasFarm livestock detection camera:
 *
 * 1. TWO-POSITION ARCHITECTURE (currentBox & targetBox):
 *    - `currentBox`: The smoothly rendered box on screen.
 *    - `targetBox`: The destination determined by AI detections and velocity prediction.
 *    - Interpolates smoothly on every animation frame (60 FPS) without teleporting or jumping.
 *
 * 2. ADAPTIVE FRAME-BASED SMOOTHING:
 *    - Uses elapsed delta time (dt) for display-rate independence (60Hz / 90Hz / 120Hz).
 *    - Small displacement: Strong smoothing (eliminates jitter and breathing).
 *    - Large displacement: Fast catch-up (keeps up with running/trotting animals).
 *    - Calm dimension filtering prevents sudden ballooning or shrinking.
 *
 * 3. SHORT-TERM VELOCITY PREDICTION:
 *    - Estimates normalized velocity (vx, vy) based on observed center displacement over time.
 *    - Extrapolates motion during the ~1s window between Gemini detections with exponential damping.
 *    - Prevents the box from stopping dead and lagging behind moving animals.
 *
 * 4. PREDICTED-POSITION MATCHING & ADAPTIVE GATING:
 *    - Incoming Gemini detections match against the track's PREDICTED position, not stale last-seen center.
 *    - Matching gate expands proportionally for fast-moving animals.
 *    - Multi-factor score: IoU + center distance + size similarity + velocity alignment + species bonus.
 *    - Directional alignment and size consistency prevent track-swapping when two animals cross.
 *
 * 5. OCCLUSION GRACE PERIOD & CONTINUITY:
 *    - Uses timestamp-based grace period (2.8 seconds) to survive 2-3 missed Gemini frames.
 *    - When an animal turns, stops, or briefly passes behind another goat, it retains the SAME track ID.
 *
 * 6. DETECTION CONFIRMATION:
 *    - Filters false-positive non-livestock candidates (keyboard, laptop, chair) by requiring confirmation
 *      unless confidence is decisively high.
 *
 * 7. ROLLING SPECIES CONSENSUS:
 *    - Requires consensus votes before switching between KAMBING and TUPA, eliminating label flickering.
 *
 * 8. CLEANUP & DEDUPLICATION:
 *    - Deduplicates raw overlapping Gemini detections for the same animal.
 *    - Completely clears canvas on empty scenes. Prunes tracks when animals exit the frame.
 */

import type { BoundingBox } from './cameraUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LivestockSpecies = 'goat' | 'sheep' | 'person';
export type LivestockDisplayLabel = 'KAMBING' | 'TUPA' | 'TAO';
export type TrackState = 'candidate' | 'confirmed' | 'occluded' | 'expired';

export interface RawLivestockDetection {
  species: LivestockSpecies;
  label: LivestockDisplayLabel;
  confidence: number;
  box: BoundingBox; // Normalized [0..1] in video frame space
  rawCategory?: string;
}

export interface TrackedLivestockAnimal {
  trackId: number;
  displayNumber: number; // 1-indexed display number (e.g. KAMBING #1)
  species: LivestockSpecies;
  label: LivestockDisplayLabel;
  confidence: number;
  state: TrackState;

  /** Current smoothed bounding box [0..1] rendered on screen */
  currentBox: BoundingBox;
  /** Legacy alias pointing directly to currentBox for backward compatibility */
  box: BoundingBox;
  /** Target bounding box [0..1] from latest raw detection or motion prediction */
  targetBox: BoundingBox;

  /** Velocity in normalized screen space per second (dx/sec, dy/sec) */
  vx: number;
  vy: number;
  /** Dimension change rate per second (dw/sec, dh/sec) */
  vw: number;
  vh: number;

  /** Timestamps */
  firstSeen: number;
  lastSeen: number;
  lastConfirmedAt: number;
  lastObservedCenter: { x: number; y: number };

  /** Hit & Miss counters */
  consecutiveHits: number;
  consecutiveMisses: number;

  /** Rolling species history for voting */
  speciesHistory: LivestockSpecies[];

  /** UI interaction flags */
  isSelected: boolean;
  isTemporarilyMissed: boolean;
}

export interface TrackerConfig {
  /** Minimum IoU threshold to consider a spatial match. Default: 0.12 */
  matchIouThreshold: number;
  /** Base center distance fallback (normalized). Default: 0.25 */
  baseCenterDistanceFallback: number;
  /** Velocity-scaled matching expansion factor. Default: 0.55 */
  velocityMatchExpansion: number;
  /** Maximum grace period in ms before pruning an unseen track. Default: 2800ms */
  maxTrackAgeMs: number;
  /** Maximum consecutive missed detections tolerated. Default: 4 */
  maxConsecutiveMisses: number;
  /** Velocity damping / friction per second (0.0 to 1.0). Default: 0.68 */
  velocityDampingPerSec: number;
  /** Species consensus threshold. Default: 3 */
  speciesConsensusThreshold: number;

  /** Entry & keep thresholds */
  goatEntryThreshold: number;
  goatKeepThreshold: number;
  sheepEntryThreshold: number;
  sheepKeepThreshold: number;
  personEntryThreshold: number;
  personKeepThreshold: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  matchIouThreshold: 0.12,
  baseCenterDistanceFallback: 0.25,
  velocityMatchExpansion: 0.55,
  maxTrackAgeMs: 2000, // 2.0s grace period bridges 1 missed frame while preventing lingering ghost boxes
  maxConsecutiveMisses: 2, // Prune if 2 consecutive cycles report no animal
  velocityDampingPerSec: 0.68,
  speciesConsensusThreshold: 3,
  goatEntryThreshold: 0.28,
  goatKeepThreshold: 0.18,
  sheepEntryThreshold: 0.35,
  sheepKeepThreshold: 0.22,
  personEntryThreshold: 0.50,
  personKeepThreshold: 0.35,
};

// ── 2D Geometry & Deduplication Helpers ────────────────────────────────────────

/**
 * Calculates 2D Intersection-over-Union (IoU) of two normalized bounding boxes.
 */
export function calculate2DIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const xA1 = boxA.x;
  const yA1 = boxA.y;
  const xA2 = boxA.x + boxA.width;
  const yA2 = boxA.y + boxA.height;

  const xB1 = boxB.x;
  const yB1 = boxB.y;
  const xB2 = boxB.x + boxB.width;
  const yB2 = boxB.y + boxB.height;

  const interX1 = Math.max(xA1, xB1);
  const interY1 = Math.max(yA1, yB1);
  const interX2 = Math.min(xA2, xB2);
  const interY2 = Math.min(yA2, yB2);

  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;

  const areaA = Math.max(0, boxA.width) * Math.max(0, boxA.height);
  const areaB = Math.max(0, boxB.width) * Math.max(0, boxB.height);
  const unionArea = areaA + areaB - interArea;

  if (unionArea <= 0) return 0;
  return Math.max(0, Math.min(1, interArea / unionArea));
}

/**
 * Calculates Euclidean center distance between two normalized bounding boxes.
 */
export function calculateCenterDistance(boxA: BoundingBox, boxB: BoundingBox): number {
  const cAx = boxA.x + boxA.width / 2;
  const cAy = boxA.y + boxA.height / 2;
  const cBx = boxB.x + boxB.width / 2;
  const cBy = boxB.y + boxB.height / 2;

  const dx = cAx - cBx;
  const dy = cAy - cBy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deduplicate raw livestock detections returned by Gemini Live.
 * If two detections have the same species and overlap heavily, keep the higher confidence one.
 */
export function deduplicateDetections(
  detections: RawLivestockDetection[],
  iouThreshold: number = 0.55,
  centerDistThreshold: number = 0.08
): RawLivestockDetection[] {
  if (!detections || detections.length <= 1) return detections || [];

  const kept: RawLivestockDetection[] = [];

  for (const det of detections) {
    let isDuplicate = false;
    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];
      if (existing.species !== det.species) continue;

      const iou = calculate2DIoU(existing.box, det.box);
      const dist = calculateCenterDistance(existing.box, det.box);

      if (iou >= iouThreshold || (iou >= 0.28 && dist <= centerDistThreshold)) {
        isDuplicate = true;
        if (det.confidence > existing.confidence) {
          kept[i] = det;
        }
        break;
      }
    }
    if (!isDuplicate) {
      kept.push(det);
    }
  }

  return kept;
}

// ── Coordinate Transformation Math (object-fit: cover) ────────────────────────

export interface ViewportTransform {
  scale: number;
  renderedW: number;
  renderedH: number;
  offsetX: number;
  offsetY: number;
  containerW: number;
  containerH: number;
  videoW: number;
  videoH: number;
}

export function computeViewportTransform(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number
): ViewportTransform {
  if (!containerW || !containerH || !videoW || !videoH) {
    return {
      scale: 1,
      renderedW: containerW || 640,
      renderedH: containerH || 480,
      offsetX: 0,
      offsetY: 0,
      containerW: containerW || 640,
      containerH: containerH || 480,
      videoW: videoW || 640,
      videoH: videoH || 480,
    };
  }

  const scale = Math.max(containerW / videoW, containerH / videoH);
  const renderedW = videoW * scale;
  const renderedH = videoH * scale;

  const offsetX = (renderedW - containerW) / 2;
  const offsetY = (renderedH - containerH) / 2;

  return {
    scale,
    renderedW,
    renderedH,
    offsetX,
    offsetY,
    containerW,
    containerH,
    videoW,
    videoH,
  };
}

export function mapVideoBoxToScreen(
  box: BoundingBox,
  transform: ViewportTransform
): { x: number; y: number; width: number; height: number } {
  const { renderedW, renderedH, offsetX, offsetY, containerW, containerH } = transform;

  const screenX = box.x * renderedW - offsetX;
  const screenY = box.y * renderedH - offsetY;
  const screenW = box.width * renderedW;
  const screenH = box.height * renderedH;

  return {
    x: Math.max(2, Math.min(containerW - 10, screenX)),
    y: Math.max(2, Math.min(containerH - 10, screenY)),
    width: Math.max(20, Math.min(containerW, screenW)),
    height: Math.max(20, Math.min(containerH, screenH)),
  };
}

export function hitTestTrack(
  screenTapX: number,
  screenTapY: number,
  track: TrackedLivestockAnimal,
  transform: ViewportTransform,
  hitSlop: number = 24
): boolean {
  const screenBox = mapVideoBoxToScreen(track.currentBox, transform);

  // Generous mobile hit testing: ensure minimum touch target of 48x48 plus hitSlop
  const boxW = Math.max(48, screenBox.width);
  const boxH = Math.max(48, screenBox.height);
  const cx = screenBox.x + screenBox.width / 2;
  const cy = screenBox.y + screenBox.height / 2;

  const minX = cx - boxW / 2 - hitSlop;
  const maxX = cx + boxW / 2 + hitSlop;
  const minY = cy - boxH / 2 - hitSlop;
  const maxY = cy + boxH / 2 + hitSlop;

  return (
    screenTapX >= minX &&
    screenTapX <= maxX &&
    screenTapY >= minY &&
    screenTapY <= maxY
  );
}

// ── Temporal Livestock Tracker Class ──────────────────────────────────────────

export class TemporalLivestockTracker {
  private config: TrackerConfig;
  private tracks: TrackedLivestockAnimal[] = [];
  private nextTrackId: number = 1;
  private selectedTrackId: number | null = null;
  private onSelectedTrackLost?: () => void;

  constructor(config: Partial<TrackerConfig> = {}, onSelectedTrackLost?: () => void) {
    this.config = { ...DEFAULT_TRACKER_CONFIG, ...config };
    this.onSelectedTrackLost = onSelectedTrackLost;
  }

  public setSelectedTrackLostCallback(cb: () => void): void {
    this.onSelectedTrackLost = cb;
  }

  /**
   * Return all currently active, visible tracked animals.
   * Only includes confirmed tracks (or occluded confirmed tracks still within grace period).
   * Filters out unconfirmed candidates to prevent false positives.
   */
  public getActiveTracks(): TrackedLivestockAnimal[] {
    return this.tracks.filter(
      (t) =>
        t.state === 'confirmed' ||
        t.state === 'occluded' ||
        (t.state === 'candidate' && t.confidence >= 0.75)
    );
  }

  public getSelectedTrack(): TrackedLivestockAnimal | null {
    if (this.selectedTrackId === null) return null;
    return this.tracks.find((t) => t.trackId === this.selectedTrackId) || null;
  }

  public getSelectedTrackId(): number | null {
    return this.selectedTrackId;
  }

  public selectTrackById(trackId: number | null): boolean {
    if (trackId === null) {
      this.selectedTrackId = null;
      this.tracks.forEach((t) => {
        t.isSelected = false;
      });
      return true;
    }

    const found = this.tracks.find((t) => t.trackId === trackId);
    if (!found || found.species === 'person') return false;

    this.selectedTrackId = trackId;
    this.tracks.forEach((t) => {
      t.isSelected = t.trackId === trackId;
    });
    return true;
  }

  public selectAtScreenCoordinates(
    screenTapX: number,
    screenTapY: number,
    transform: ViewportTransform
  ): TrackedLivestockAnimal | null {
    let bestTrack: TrackedLivestockAnimal | null = null;
    let minArea = Infinity;

    for (const track of this.getActiveTracks()) {
      if (track.species !== 'person' && hitTestTrack(screenTapX, screenTapY, track, transform)) {
        const area = track.currentBox.width * track.currentBox.height;
        if (area < minArea) {
          minArea = area;
          bestTrack = track;
        }
      }
    }

    if (bestTrack) {
      this.selectTrackById(bestTrack.trackId);
      return bestTrack;
    }

    return null;
  }

  /**
   * Process fresh visual detections from Gemini Live.
   * Matches detections against PREDICTED track positions, updates target boxes,
   * calculates instantaneous velocities, updates species voting, and prunes stale tracks.
   */
  public update(rawDetections: RawLivestockDetection[], timestamp: number = Date.now()): TrackedLivestockAnimal[] {
    // 1. Deduplicate incoming raw detections
    const deduplicated = deduplicateDetections(rawDetections || []);

    // 2. Filter candidates by KEEP threshold
    const validDetections = deduplicated.filter((d) => {
      if (d.species === 'goat') return d.confidence >= this.config.goatKeepThreshold;
      if (d.species === 'sheep') return d.confidence >= this.config.sheepKeepThreshold;
      if (d.species === 'person') return d.confidence >= this.config.personKeepThreshold;
      return false;
    });

    // If zero detections arrived in this response, mark existing tracks as missed
    if (validDetections.length === 0) {
      for (const track of this.tracks) {
        track.consecutiveMisses++;
        track.isTemporarilyMissed = true;
        if (track.state === 'confirmed') {
          track.state = 'occluded';
        }
      }
      this.pruneStaleTracks(timestamp);
      this.updateDisplayNumbering();
      return this.getActiveTracks();
    }

    const matchedTrackIds = new Set<number>();
    const matchedRawIndices = new Set<number>();

    // 3. Compute multi-factor matching score between existing tracks and incoming detections
    interface MatchCandidate {
      trackIndex: number;
      rawIndex: number;
      score: number;
    }

    const matchCandidates: MatchCandidate[] = [];

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t];
      const dt = Math.max(0.05, Math.min(2.5, (timestamp - track.lastSeen) / 1000));

      // Calculate where this track is PREDICTED to be right now based on recent velocity
      const predCenterX = track.targetBox.x + track.targetBox.width / 2 + track.vx * dt;
      const predCenterY = track.targetBox.y + track.targetBox.height / 2 + track.vy * dt;
      const predBox: BoundingBox = {
        x: track.targetBox.x + track.vx * dt,
        y: track.targetBox.y + track.vy * dt,
        width: track.targetBox.width,
        height: track.targetBox.height,
      };

      // Adaptive matching gate: expands if the animal is moving quickly
      const animalSpeed = Math.sqrt(track.vx * track.vx + track.vy * track.vy);
      const matchingGate = this.config.baseCenterDistanceFallback + this.config.velocityMatchExpansion * Math.min(0.6, animalSpeed);

      const trackArea = Math.max(0.001, track.targetBox.width * track.targetBox.height);

      for (let r = 0; r < validDetections.length; r++) {
        const raw = validDetections[r];
        const rawCenterX = raw.box.x + raw.box.width / 2;
        const rawCenterY = raw.box.y + raw.box.height / 2;
        const rawArea = Math.max(0.001, raw.box.width * raw.box.height);

        // Calculate spatial metrics against predicted position and current position
        const iouPred = calculate2DIoU(predBox, raw.box);
        const iouCurr = calculate2DIoU(track.currentBox, raw.box);
        const iouTarget = calculate2DIoU(track.targetBox, raw.box);
        const effIoU = Math.max(iouPred, iouCurr, iouTarget);

        const distPred = Math.sqrt((rawCenterX - predCenterX) ** 2 + (rawCenterY - predCenterY) ** 2);
        const distCurr = calculateCenterDistance(track.currentBox, raw.box);
        const distTarget = calculateCenterDistance(track.targetBox, raw.box);
        const effDist = Math.min(distPred, distCurr, distTarget);

        // Eligibility gate
        if (effIoU >= this.config.matchIouThreshold || effDist <= matchingGate) {
          let score = 0;

          // A. IoU contribution (up to 0.40)
          score += effIoU * 0.40;

          // B. Center distance contribution (up to 0.35)
          score += Math.max(0, 1 - effDist / matchingGate) * 0.35;

          // C. Bounding box size similarity (up to 0.15)
          const sizeRatio = Math.min(trackArea, rawArea) / Math.max(trackArea, rawArea);
          score += sizeRatio * 0.15;

          // D. Species consistency bonus / penalty (+0.45 / -0.30)
          if (track.species === raw.species) {
            score += 0.45;
          } else {
            score -= 0.30;
          }

          // E. Motion direction alignment (prevents track swapping when animals cross)
          if (animalSpeed > 0.08) {
            const moveVecX = rawCenterX - track.lastObservedCenter.x;
            const moveVecY = rawCenterY - track.lastObservedCenter.y;
            const dot = (moveVecX * track.vx + moveVecY * track.vy) / (animalSpeed * (Math.sqrt(moveVecX * moveVecX + moveVecY * moveVecY) || 1));
            if (dot > 0.2) {
              score += 0.15; // Moves in expected trajectory
            } else if (dot < -0.4) {
              score -= 0.15; // Sharp reversal: likely the other crossing animal
            }
          }

          matchCandidates.push({ trackIndex: t, rawIndex: r, score });
        }
      }
    }

    // Sort candidates descending by match score
    matchCandidates.sort((a, b) => b.score - a.score);

    // 4. Greedy matching
    for (const cand of matchCandidates) {
      const track = this.tracks[cand.trackIndex];
      const raw = validDetections[cand.rawIndex];

      if (matchedTrackIds.has(track.trackId) || matchedRawIndices.has(cand.rawIndex)) {
        continue;
      }

      matchedTrackIds.add(track.trackId);
      matchedRawIndices.add(cand.rawIndex);

      // Calculate instantaneous velocity
      const dt = Math.max(0.08, Math.min(2.0, (timestamp - track.lastSeen) / 1000));
      const rawCenterX = raw.box.x + raw.box.width / 2;
      const rawCenterY = raw.box.y + raw.box.height / 2;

      const instVx = Math.max(-1.5, Math.min(1.5, (rawCenterX - track.lastObservedCenter.x) / dt));
      const instVy = Math.max(-1.5, Math.min(1.5, (rawCenterY - track.lastObservedCenter.y) / dt));
      const instVw = Math.max(-0.8, Math.min(0.8, (raw.box.width - track.targetBox.width) / dt));
      const instVh = Math.max(-0.8, Math.min(0.8, (raw.box.height - track.targetBox.height) / dt));

      // Smooth velocity update
      track.vx = track.vx * 0.35 + instVx * 0.65;
      track.vy = track.vy * 0.35 + instVy * 0.65;
      track.vw = track.vw * 0.40 + instVw * 0.60;
      track.vh = track.vh * 0.40 + instVh * 0.60;

      // Update target box and observation state
      track.targetBox = { ...raw.box };
      track.lastObservedCenter = { x: rawCenterX, y: rawCenterY };
      track.lastSeen = timestamp;
      track.confidence = raw.confidence;
      track.consecutiveHits++;
      track.consecutiveMisses = 0;
      track.isTemporarilyMissed = false;
      track.state = 'confirmed';

      // Species temporal consensus voting
      track.speciesHistory.push(raw.species);
      if (track.speciesHistory.length > 5) {
        track.speciesHistory.shift();
      }

      const goatVotes = track.speciesHistory.filter((s) => s === 'goat').length;
      const sheepVotes = track.speciesHistory.filter((s) => s === 'sheep').length;
      const personVotes = track.speciesHistory.filter((s) => s === 'person').length;

      if (personVotes >= this.config.speciesConsensusThreshold && track.species !== 'person') {
        track.species = 'person';
        track.label = 'TAO';
        track.isSelected = false;
        if (this.selectedTrackId === track.trackId) {
          this.selectedTrackId = null;
        }
      } else if (goatVotes >= this.config.speciesConsensusThreshold && track.species !== 'goat') {
        track.species = 'goat';
        track.label = 'KAMBING';
      } else if (sheepVotes >= this.config.speciesConsensusThreshold && track.species !== 'sheep') {
        track.species = 'sheep';
        track.label = 'TUPA';
      }
    }

    // 5. Mark unmatched tracks as temporarily missed (grace period)
    for (const track of this.tracks) {
      if (!matchedTrackIds.has(track.trackId)) {
        track.consecutiveMisses++;
        track.isTemporarilyMissed = true;
        if (track.state === 'confirmed') {
          track.state = 'occluded';
        }
      }
    }

    // 6. Spawn new tracks for unmatched detections (Confirmation & Hysteresis Entry)
    for (let r = 0; r < validDetections.length; r++) {
      if (!matchedRawIndices.has(r)) {
        const raw = validDetections[r];

        let meetsEntry = false;
        if (raw.species === 'goat' && raw.confidence >= this.config.goatEntryThreshold) meetsEntry = true;
        else if (raw.species === 'sheep' && raw.confidence >= this.config.sheepEntryThreshold) meetsEntry = true;
        else if (raw.species === 'person' && raw.confidence >= this.config.personKeepThreshold) meetsEntry = true;

        if (!meetsEntry) continue;

        const isHighConfidence = raw.confidence >= 0.75;
        const rawCenter = { x: raw.box.x + raw.box.width / 2, y: raw.box.y + raw.box.height / 2 };

        const newTrack: TrackedLivestockAnimal = {
          trackId: this.nextTrackId++,
          displayNumber: 0,
          species: raw.species,
          label: raw.species === 'person' ? 'TAO' : raw.species === 'sheep' ? 'TUPA' : 'KAMBING',
          confidence: raw.confidence,
          state: isHighConfidence ? 'confirmed' : 'candidate',
          currentBox: { ...raw.box },
          box: { ...raw.box },
          targetBox: { ...raw.box },
          vx: 0,
          vy: 0,
          vw: 0,
          vh: 0,
          firstSeen: timestamp,
          lastSeen: timestamp,
          lastConfirmedAt: isHighConfidence ? timestamp : 0,
          lastObservedCenter: rawCenter,
          consecutiveHits: 1,
          consecutiveMisses: 0,
          speciesHistory: [raw.species],
          isSelected: false,
          isTemporarilyMissed: false,
        };

        this.tracks.push(newTrack);
      }
    }

    // 7. Prune stale tracks
    this.pruneStaleTracks(timestamp);

    // 8. Update stable display numbering
    this.updateDisplayNumbering();

    // 9. Manage single vs multi-animal selection
    const activeLivestock = this.getActiveTracks().filter((t) => t.species !== 'person');

    if (this.selectedTrackId === null) {
      // If exactly ONE confirmed livestock animal is visible, automatically select it!
      if (activeLivestock.length === 1) {
        this.selectedTrackId = activeLivestock[0].trackId;
        activeLivestock[0].isSelected = true;
      }
    } else {
      // Verify that the currently selected track is still active and confirmed
      const selectedStillActive = activeLivestock.find((t) => t.trackId === this.selectedTrackId);
      if (selectedStillActive) {
        // Enforce that only the selected track has isSelected = true
        for (const t of this.tracks) {
          t.isSelected = t.trackId === this.selectedTrackId;
        }
      } else {
        // Selected track was lost! DO NOT automatically switch to another animal.
        this.selectedTrackId = null;
        for (const t of this.tracks) {
          t.isSelected = false;
        }
        if (this.onSelectedTrackLost) {
          this.onSelectedTrackLost();
        }
      }
    }

    return this.getActiveTracks();
  }

  /**
   * Advance continuous motion smoothing and velocity extrapolation.
   * Runs at 60 FPS on requestAnimationFrame.
   *
   * @param timestamp Current timestamp in ms
   * @param dtSec Elapsed delta time in seconds since previous frame
   */
  public step(timestamp: number = Date.now(), dtSec: number = 1 / 60): void {
    const dt = Math.max(0.001, Math.min(0.12, dtSec));
    const damping = Math.pow(this.config.velocityDampingPerSec, dt);

    for (const track of this.tracks) {
      if (track.state === 'expired') continue;

      // 1. Extrapolate target position using damped velocity
      track.vx *= damping;
      track.vy *= damping;
      track.vw *= damping;
      track.vh *= damping;

      track.targetBox.x += track.vx * dt;
      track.targetBox.y += track.vy * dt;
      track.targetBox.width += track.vw * dt;
      track.targetBox.height += track.vh * dt;

      // Clamp target within screen boundaries with safe padding
      track.targetBox.x = Math.max(-0.15, Math.min(1.05, track.targetBox.x));
      track.targetBox.y = Math.max(-0.15, Math.min(1.05, track.targetBox.y));
      track.targetBox.width = Math.max(0.04, Math.min(0.96, track.targetBox.width));
      track.targetBox.height = Math.max(0.04, Math.min(0.96, track.targetBox.height));

      // 2. Adaptive Interpolation from currentBox -> targetBox
      const dx = track.targetBox.x - track.currentBox.x;
      const dy = track.targetBox.y - track.currentBox.y;
      const disp = Math.sqrt(dx * dx + dy * dy);

      // Adaptive smoothing: small displacement = high smoothing; large displacement = fast catchup
      const catchupRate = disp < 0.015 ? 9 : disp < 0.06 ? 15 : 22;
      const posAlpha = 1 - Math.exp(-catchupRate * dt);
      const dimAlpha = 1 - Math.exp(-10 * dt);

      track.currentBox.x += dx * posAlpha;
      track.currentBox.y += dy * posAlpha;
      track.currentBox.width += (track.targetBox.width - track.currentBox.width) * dimAlpha;
      track.currentBox.height += (track.targetBox.height - track.currentBox.height) * dimAlpha;

      // Keep legacy alias in sync
      track.box.x = track.currentBox.x;
      track.box.y = track.currentBox.y;
      track.box.width = track.currentBox.width;
      track.box.height = track.currentBox.height;
    }

    this.pruneStaleTracks(timestamp);
  }

  /**
   * Prune expired tracks based on time, consecutive misses, or leaving the screen.
   */
  public pruneStaleTracks(timestamp: number): void {
    const prevSelectedId = this.selectedTrackId;
    let selectedTrackStillAlive = false;

    this.tracks = this.tracks.filter((t) => {
      // 1. Unconfirmed candidates expire quickly if not verified
      if (t.state === 'candidate') {
        const isCandidateAlive = t.consecutiveMisses <= 1 && timestamp - t.lastSeen <= 1600;
        return isCandidateAlive;
      }

      // 2. Confirmed tracks enjoy grace period
      const ageMs = timestamp - t.lastSeen;
      const isAliveByTime = ageMs <= this.config.maxTrackAgeMs;
      const isAliveByMisses = t.consecutiveMisses <= this.config.maxConsecutiveMisses;

      // 3. Animal leaving frame check: If animal moved out of camera viewport and is missed
      const currCenterX = t.currentBox.x + t.currentBox.width / 2;
      const currCenterY = t.currentBox.y + t.currentBox.height / 2;
      const targetCenterX = t.targetBox.x + t.targetBox.width / 2;
      const targetCenterY = t.targetBox.y + t.targetBox.height / 2;

      const isOffScreen =
        currCenterX < 0 ||
        currCenterX > 1 ||
        currCenterY < 0 ||
        currCenterY > 1 ||
        targetCenterX < 0 ||
        targetCenterX > 1 ||
        targetCenterY < 0 ||
        targetCenterY > 1 ||
        t.currentBox.x > 1.0 ||
        t.currentBox.x + t.currentBox.width < 0.0 ||
        t.currentBox.y > 1.0 ||
        t.currentBox.y + t.currentBox.height < 0.0;

      const isAlive = isAliveByTime && isAliveByMisses && !(isOffScreen && t.consecutiveMisses >= 1);

      if (t.trackId === prevSelectedId && isAlive) {
        selectedTrackStillAlive = true;
      }
      return isAlive;
    });

    // Handle selection when selected track was pruned: DO NOT automatically transfer to another animal!
    if (prevSelectedId !== null && !selectedTrackStillAlive) {
      this.selectedTrackId = null;
      for (const t of this.tracks) {
        t.isSelected = false;
      }
      if (this.onSelectedTrackLost) {
        this.onSelectedTrackLost();
      }
    }
  }

  /**
   * Sort tracks left-to-right to maintain stable display numbering (e.g. KAMBING #1, KAMBING #2).
   */
  private updateDisplayNumbering(): void {
    const active = this.getActiveTracks().sort((a, b) => a.currentBox.x - b.currentBox.x);
    let goatNum = 1;
    let sheepNum = 1;
    let personNum = 1;

    for (const t of active) {
      if (t.species === 'goat') {
        t.displayNumber = goatNum++;
      } else if (t.species === 'sheep') {
        t.displayNumber = sheepNum++;
      } else {
        t.displayNumber = personNum++;
      }
    }
  }

  /**
   * Reset all tracks (e.g. scanner closed or switched to upload mode).
   */
  public reset(): void {
    this.tracks = [];
    this.selectedTrackId = null;
    this.nextTrackId = 1;
  }
}

// ── Overlay Canvas Renderer ───────────────────────────────────────────────────

/**
 * Render tracked livestock bounding boxes & badges to the camera overlay canvas.
 * Clears completely before every frame. Zero ghost boxes when animals leave.
 */
export function renderTrackedAnimalsToCanvas(
  canvas: HTMLCanvasElement | null,
  tracks: TrackedLivestockAnimal[],
  transform: ViewportTransform,
  dpr: number = 1
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = transform.containerW;
  const H = transform.containerH;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Clear entire canvas before drawing
  ctx.clearRect(0, 0, W, H);

  // 2. If no tracks, leave canvas completely clear
  if (!tracks || tracks.length === 0) {
    ctx.restore();
    return;
  }

  const hasSelectedLivestock = tracks.some((t) => t.isSelected && t.species !== 'person');

  for (const track of tracks) {
    const screenBox = mapVideoBoxToScreen(track.currentBox, transform);
    const { x, y, width: bw, height: bh } = screenBox;

    const isSelected = track.isSelected;
    const isGoat = track.species === 'goat';
    const isSheep = track.species === 'sheep';
    const isPerson = track.species === 'person';

    // Opacity: secondary/muted if another livestock is selected
    const isDimmed = hasSelectedLivestock && !isSelected;
    ctx.globalAlpha = isDimmed ? 0.38 : 1.0;

    // Color theme
    let strokeColor = isSelected ? '#22C55E' : isDimmed ? 'rgba(255, 255, 255, 0.55)' : 'rgba(22, 163, 74, 0.90)';
    let fillColor = isSelected ? 'rgba(34, 197, 94, 0.22)' : isDimmed ? 'rgba(0, 0, 0, 0.12)' : 'rgba(22, 163, 74, 0.08)';
    let cornerColor = isSelected ? '#4ADE80' : isDimmed ? 'rgba(255, 255, 255, 0.70)' : '#22C55E';
    let badgeBg = isSelected ? '#16A34A' : isDimmed ? 'rgba(30, 41, 59, 0.85)' : '#15803D';

    if (isPerson) {
      strokeColor = 'rgba(59, 130, 246, 0.85)';
      fillColor = 'rgba(59, 130, 246, 0.10)';
      cornerColor = '#60A5FA';
      badgeBg = '#2563EB';
    } else if (isSheep) {
      strokeColor = isSelected ? '#10B981' : isDimmed ? 'rgba(255, 255, 255, 0.55)' : 'rgba(16, 185, 129, 0.90)';
      fillColor = isSelected ? 'rgba(16, 185, 129, 0.22)' : isDimmed ? 'rgba(0, 0, 0, 0.12)' : 'rgba(16, 185, 129, 0.08)';
      cornerColor = isSelected ? '#34D399' : isDimmed ? 'rgba(255, 255, 255, 0.70)' : '#10B981';
      badgeBg = isSelected ? '#059669' : isDimmed ? 'rgba(30, 41, 59, 0.85)' : '#047857';
    }

    let labelText = '';
    if (isPerson) {
      const sameSpeciesCount = tracks.filter((t) => t.species === 'person').length;
      if (sameSpeciesCount > 1 && track.displayNumber > 0) {
        labelText = `TAO #${track.displayNumber}`;
      } else {
        labelText = 'TAO';
      }
    } else if (isSelected) {
      if (isGoat) {
        labelText = track.displayNumber > 0 ? `✓ NAPILI: KAMBING #${track.displayNumber}` : '✓ NAPILING KAMBING';
      } else if (isSheep) {
        labelText = track.displayNumber > 0 ? `✓ NAPILI: TUPA #${track.displayNumber}` : '✓ NAPILING TUPA';
      } else {
        labelText = '✓ NAPILING HAYOP';
      }
    } else {
      const sameSpeciesCount = tracks.filter((t) => t.species === track.species).length;
      if (sameSpeciesCount > 1 && track.displayNumber > 0) {
        if (isGoat) labelText = `KAMBING #${track.displayNumber}`;
        else if (isSheep) labelText = `TUPA #${track.displayNumber}`;
        else labelText = `HAYOP #${track.displayNumber}`;
      } else {
        if (isGoat) labelText = 'KAMBING';
        else if (isSheep) labelText = 'TUPA';
        else labelText = 'HAYOP';
      }
    }

    // 1. Draw Bounding Box Fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, bw, bh);

    // 2. Draw Bounding Box Border (with subtle glow if selected)
    ctx.save();
    if (isSelected) {
      ctx.shadowColor = 'rgba(34, 197, 94, 0.75)';
      ctx.shadowBlur = 12;
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 3.5 : isDimmed ? 1.8 : 2.5;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, bw, bh);
    ctx.restore();

    // 3. Draw Corner Accents
    const cornerSize = Math.min(22, bw * 0.25, bh * 0.25);
    ctx.strokeStyle = cornerColor;
    ctx.lineWidth = isSelected ? 4.5 : isDimmed ? 2.5 : 3.5;
    ctx.lineCap = 'round';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + bw - cornerSize, y);
    ctx.lineTo(x + bw, y);
    ctx.lineTo(x + bw, y + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + bh - cornerSize);
    ctx.lineTo(x, y + bh);
    ctx.lineTo(x + cornerSize, y + bh);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + bw - cornerSize, y + bh);
    ctx.lineTo(x + bw, y + bh);
    ctx.lineTo(x + bw, y + bh - cornerSize);
    ctx.stroke();

    // 4. Draw Label Badge (Directly above box or inside if near top)
    ctx.font = isSelected
      ? 'bold 12.5px Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif'
      : 'bold 11px Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const badgePadX = 10;
    const badgeH = 26;
    const badgeW = textMetrics.width + badgePadX * 2;

    let labelX = Math.max(4, Math.min(W - badgeW - 4, x));
    let labelY = y - badgeH - 4;
    if (labelY < 4) {
      labelY = y + 4; // draw inside top of box if at top edge
    }

    // Badge Shadow & Rounded Pill
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = badgeBg;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(labelX, labelY, badgeW, badgeH, 6);
    } else {
      ctx.rect(labelX, labelY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.restore();

    // Badge Text
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labelText, labelX + badgePadX, labelY + 17);

    // Reset alpha
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}
