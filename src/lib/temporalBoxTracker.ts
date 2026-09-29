/**
 * temporalBoxTracker.ts — Real-Time Temporal Stabilization & Tracking Engine
 *
 * Designed for AlpasFarm livestock detection camera:
 * 1. TEMPORAL STABILITY:
 *    Applies Exponential Moving Average (EMA) smoothing on x, y, width, and height.
 *    Eliminates bounding box jitter, visual shaking, flickering, and frame-to-frame jumping.
 *
 * 2. TRACKING THE SAME ANIMAL:
 *    Uses 2D Intersection-over-Union (IoU) with center-distance fallback to match
 *    incoming detections to existing tracks across consecutive frames.
 *    Assigns persistent track IDs (e.g. 1, 2, 3...).
 *
 * 3. STABLE SPECIES LABELS:
 *    Maintains a rolling species history window. Requires consensus (>= 3 consecutive
 *    frames) before transitioning a label between KAMBING and TUPA.
 *
 * 4. SHORT TRACK GRACE PERIOD:
 *    Tolerates 2-3 missed frames (up to ~800ms) for motion blur, detector frame skip,
 *    or brief occlusion, preventing boxes from disappearing and reappearing instantly.
 *
 * 5. EMPTY SCENE CLEARANCE:
 *    When no goats or sheep are detected or camera points away, stale tracks are
 *    promptly pruned, ensuring zero ghost boxes linger on screen.
 *
 * 6. SELECTION PERSISTENCE:
 *    Farmer can tap an animal's bounding box to select it. The selection locks to the
 *    track ID and follows that specific animal as it moves across the screen.
 *    If the tracked animal leaves the scene, prompts the farmer to re-select.
 *
 * 7. ACCURATE COORDINATE TRANSFORMS (object-fit: cover):
 *    Translates normalized [0..1] video coordinates to display container/canvas pixel coordinates,
 *    correcting for aspect ratio differences, cropping offsets, and device scaling.
 */

import type { BoundingBox } from './cameraUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LivestockSpecies = 'goat' | 'sheep' | 'person';
export type LivestockDisplayLabel = 'KAMBING' | 'TUPA' | 'TAO';

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
  /** Current smoothed bounding box [0..1] in video space */
  box: BoundingBox;
  /** Target bounding box [0..1] from latest raw detection */
  targetBox: BoundingBox;
  /** Velocity estimate (change in center per second) */
  vx: number;
  vy: number;
  firstSeen: number;
  lastSeen: number;
  consecutiveHits: number;
  consecutiveMisses: number;
  speciesHistory: LivestockSpecies[];
  isSelected: boolean;
  isTemporarilyMissed?: boolean;
}

export interface TrackerConfig {
  /** EMA smoothing factor for bounding box coordinates (0.0 to 1.0). Default: 0.35 */
  smoothingAlpha: number;
  /** Minimum IoU threshold to consider a match between frames. Default: 0.15 */
  matchIouThreshold: number;
  /** Maximum normalized center distance fallback if IoU is 0 (fast move). Default: 0.28 */
  maxCenterDistanceFallback: number;
  /** Number of missed frames tolerated before pruning a track. Default: 3 */
  maxConsecutiveMisses: number;
  /** Maximum duration in ms before pruning an unseen track. Default: 3000ms (3.0s grace period) */
  maxTrackAgeMs: number;
  /** Number of consecutive consistent species classifications required to change label. Default: 3 */
  speciesConsensusThreshold: number;
  /** Entry threshold to start tracking a new goat detection. Default: 0.28 */
  goatEntryThreshold: number;
  /** Keep threshold to maintain an existing goat track. Default: 0.20 */
  goatKeepThreshold: number;
  /** Entry threshold to start tracking a new sheep detection. Default: 0.35 */
  sheepEntryThreshold: number;
  /** Keep threshold to maintain an existing sheep track. Default: 0.25 */
  sheepKeepThreshold: number;
  /** Entry threshold for person detection. Default: 0.50 */
  personEntryThreshold: number;
  /** Keep threshold for person detection. Default: 0.35 */
  personKeepThreshold: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  smoothingAlpha: 0.35,
  matchIouThreshold: 0.15,
  maxCenterDistanceFallback: 0.28,
  maxConsecutiveMisses: 3,
  maxTrackAgeMs: 3000, // 3000ms grace period so 1-2 missed frames do not drop tracks
  speciesConsensusThreshold: 3,
  goatEntryThreshold: 0.28,
  goatKeepThreshold: 0.20,
  sheepEntryThreshold: 0.35,
  sheepKeepThreshold: 0.25,
  personEntryThreshold: 0.50,
  personKeepThreshold: 0.35,
};

// ── 2D Geometry & IoU Helpers ─────────────────────────────────────────────────

/**
 * Calculates 2D Intersection-over-Union (IoU) of two normalized bounding boxes.
 * Both boxes must have { x, y, width, height } in [0..1].
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
 * If two detections have the same species and overlap heavily (IoU >= 0.60, or IoU >= 0.35 with close center distance <= 0.08),
 * treat them as the same physical animal and keep the higher-confidence candidate.
 */
export function deduplicateDetections(
  detections: RawLivestockDetection[],
  iouThreshold: number = 0.60,
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

      if (iou >= iouThreshold || (iou >= 0.35 && dist <= centerDistThreshold)) {
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

/**
 * Compute the object-fit: cover scale and cropping offsets given video resolution
 * and display container dimensions.
 */
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

  // Cover fills the container by scaling up to match the larger dimension
  const scale = Math.max(containerW / videoW, containerH / videoH);
  const renderedW = videoW * scale;
  const renderedH = videoH * scale;

  // Offsets center the video crop inside the container
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

/**
 * Transform normalized video box [0..1] to pixel coordinates on the overlay canvas/container.
 */
export function mapVideoBoxToScreen(
  box: BoundingBox,
  transform: ViewportTransform
): { x: number; y: number; width: number; height: number } {
  const { renderedW, renderedH, offsetX, offsetY, containerW, containerH } = transform;

  const screenX = box.x * renderedW - offsetX;
  const screenY = box.y * renderedH - offsetY;
  const screenW = box.width * renderedW;
  const screenH = box.height * renderedH;

  // Clamp safely to canvas bounds so badges and borders remain visible
  return {
    x: Math.max(2, Math.min(containerW - 10, screenX)),
    y: Math.max(2, Math.min(containerH - 10, screenY)),
    width: Math.max(20, Math.min(containerW, screenW)),
    height: Math.max(20, Math.min(containerH, screenH)),
  };
}

/**
 * Hit-test: Check if a screen click/tap (clientX, clientY) relative to the container
 * falls inside a tracked animal's bounding box.
 */
export function hitTestTrack(
  screenTapX: number,
  screenTapY: number,
  track: TrackedLivestockAnimal,
  transform: ViewportTransform,
  hitSlop: number = 12
): boolean {
  const screenBox = mapVideoBoxToScreen(track.box, transform);

  const minX = screenBox.x - hitSlop;
  const maxX = screenBox.x + screenBox.width + hitSlop;
  const minY = screenBox.y - hitSlop;
  const maxY = screenBox.y + screenBox.height + hitSlop;

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

  /**
   * Set callback for when the selected track disappears past grace period.
   */
  public setSelectedTrackLostCallback(cb: () => void): void {
    this.onSelectedTrackLost = cb;
  }

  /**
   * Get all currently active tracked animals.
   */
  public getActiveTracks(): TrackedLivestockAnimal[] {
    return [...this.tracks];
  }

  /**
   * Get the currently selected tracked animal, if any.
   */
  public getSelectedTrack(): TrackedLivestockAnimal | null {
    if (this.selectedTrackId === null) return null;
    return this.tracks.find((t) => t.trackId === this.selectedTrackId) || null;
  }

  /**
   * Get the ID of the selected track.
   */
  public getSelectedTrackId(): number | null {
    return this.selectedTrackId;
  }

  /**
   * Set track selection by track ID.
   */
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

  /**
   * Attempt to select a track via screen click/tap coordinates.
   * Returns true if an animal was selected, false if tapped empty space.
   */
  public selectAtScreenCoordinates(
    screenTapX: number,
    screenTapY: number,
    transform: ViewportTransform
  ): TrackedLivestockAnimal | null {
    // If multiple tracks overlap, select the smallest/closest one to tap center
    let bestTrack: TrackedLivestockAnimal | null = null;
    let minArea = Infinity;

    for (const track of this.tracks) {
      if (track.species !== 'person' && hitTestTrack(screenTapX, screenTapY, track, transform)) {
        const area = track.box.width * track.box.height;
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
   * Update tracker with fresh detections from the current frame.
   *
   * Flow:
   * 1. Filter candidates by KEEP threshold.
   * 2. If no valid detections, manage grace period (do NOT instantly wipe).
   * 3. Match candidates with existing tracks using 2D IoU / center distance.
   * 4. Apply formula-accurate EMA smoothing: smoothed = previous * 0.6 + current * 0.4.
   * 5. Hysteresis entry check: unmatched candidates only spawn new tracks if >= ENTRY threshold.
   * 6. Enforce species consensus and non-selectable person rules.
   * 7. Prune stale tracks that exceed 450ms grace period or 3 consecutive misses.
   * 8. Assign stable display numbers.
   */
  public update(rawDetections: RawLivestockDetection[], timestamp: number = Date.now()): TrackedLivestockAnimal[] {
    // 0. Deduplicate incoming raw detections to prevent duplicate boxes for the same animal
    const deduplicated = deduplicateDetections(rawDetections || []);

    // Filter candidates: Must meet species KEEP threshold
    const validDetections = deduplicated.filter((d) => {
      if (d.species === 'goat') return d.confidence >= this.config.goatKeepThreshold;
      if (d.species === 'sheep') return d.confidence >= this.config.sheepKeepThreshold;
      if (d.species === 'person') return d.confidence >= this.config.personKeepThreshold;
      return false;
    });

    // When no candidates meet keep threshold in this response:
    // Tolerate grace period (up to 3 misses / 3000ms) to bridge detector frame skips or momentary occlusion
    if (validDetections.length === 0) {
      for (const track of this.tracks) {
        track.consecutiveMisses++;
        track.isTemporarilyMissed = true;
      }
      this.pruneStaleTracks(timestamp);
      return [...this.tracks];
    }

    const matchedTrackIds = new Set<number>();
    const matchedRawIndices = new Set<number>();

    // 1. Calculate cost matrix incorporating species matching, IoU, and velocity-predicted center distance
    const matchCandidates: {
      trackIndex: number;
      rawIndex: number;
      score: number;
      iou: number;
      distance: number;
    }[] = [];

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t];
      const dt = Math.max(0.1, (timestamp - track.lastSeen) / 1000);
      const predCenterX = (track.box.x + track.box.width / 2) + track.vx * dt;
      const predCenterY = (track.box.y + track.box.height / 2) + track.vy * dt;

      for (let r = 0; r < validDetections.length; r++) {
        const raw = validDetections[r];
        const rawCenterX = raw.box.x + raw.box.width / 2;
        const rawCenterY = raw.box.y + raw.box.height / 2;

        const iou = calculate2DIoU(track.box, raw.box);
        const centerDist = calculateCenterDistance(track.box, raw.box);
        const predDist = Math.sqrt((rawCenterX - predCenterX) ** 2 + (rawCenterY - predCenterY) ** 2);
        const effDist = Math.min(centerDist, predDist);

        if (iou >= this.config.matchIouThreshold || effDist <= this.config.maxCenterDistanceFallback) {
          let score = 0;
          // Species consistency bonus: prefer matching same species to avoid track label flapping
          if (track.species === raw.species) score += 0.50;
          score += iou * 0.40;
          score += Math.max(0, (1 - effDist / this.config.maxCenterDistanceFallback)) * 0.30;

          matchCandidates.push({ trackIndex: t, rawIndex: r, score, iou, distance: effDist });
        }
      }
    }

    // Sort greedy matches: highest match score first
    matchCandidates.sort((a, b) => b.score - a.score);

    // 2. Perform greedy matching
    for (const cand of matchCandidates) {
      const track = this.tracks[cand.trackIndex];
      const raw = validDetections[cand.rawIndex];

      if (matchedTrackIds.has(track.trackId) || matchedRawIndices.has(cand.rawIndex)) {
        continue;
      }

      matchedTrackIds.add(track.trackId);
      matchedRawIndices.add(cand.rawIndex);

      // Velocity estimation for motion prediction
      const dt = Math.max(0.1, (timestamp - track.lastSeen) / 1000);
      const newCenterX = raw.box.x + raw.box.width / 2;
      const newCenterY = raw.box.y + raw.box.height / 2;
      const oldCenterX = track.box.x + track.box.width / 2;
      const oldCenterY = track.box.y + track.box.height / 2;
      const instantVx = (newCenterX - oldCenterX) / dt;
      const instantVy = (newCenterY - oldCenterY) / dt;

      track.vx = track.vx * 0.4 + instantVx * 0.6;
      track.vy = track.vy * 0.4 + instantVy * 0.6;

      // Update Track with EMA Smoothing
      const alpha = this.config.smoothingAlpha;
      track.targetBox = { ...raw.box };

      track.box = {
        x: track.box.x * (1 - alpha) + raw.box.x * alpha,
        y: track.box.y * (1 - alpha) + raw.box.y * alpha,
        width: track.box.width * (1 - alpha) + raw.box.width * alpha,
        height: track.box.height * (1 - alpha) + raw.box.height * alpha,
      };

      track.confidence = raw.confidence;
      track.lastSeen = timestamp;
      track.consecutiveHits++;
      track.consecutiveMisses = 0;
      track.isTemporarilyMissed = false;

      // Species Temporal Consensus
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

    // 3. Increment missed count for unmatched tracks
    for (const track of this.tracks) {
      if (!matchedTrackIds.has(track.trackId)) {
        track.consecutiveMisses++;
        track.isTemporarilyMissed = true;
      }
    }

    // 4. Create new tracks for unmatched raw detections (HYSTERESIS ENTRY CHECK)
    for (let r = 0; r < validDetections.length; r++) {
      if (!matchedRawIndices.has(r)) {
        const raw = validDetections[r];

        let meetsEntry = false;
        if (raw.species === 'goat' && raw.confidence >= this.config.goatEntryThreshold) meetsEntry = true;
        else if (raw.species === 'sheep' && raw.confidence >= this.config.sheepEntryThreshold) meetsEntry = true;
        else if (raw.species === 'person' && raw.confidence >= this.config.personEntryThreshold) meetsEntry = true;

        if (!meetsEntry) {
          continue;
        }

        const newTrack: TrackedLivestockAnimal = {
          trackId: this.nextTrackId++,
          displayNumber: 0,
          species: raw.species,
          label: raw.species === 'person' ? 'TAO' : raw.species === 'sheep' ? 'TUPA' : 'KAMBING',
          confidence: raw.confidence,
          box: { ...raw.box },
          targetBox: { ...raw.box },
          vx: 0,
          vy: 0,
          firstSeen: timestamp,
          lastSeen: timestamp,
          consecutiveHits: 1,
          consecutiveMisses: 0,
          speciesHistory: [raw.species],
          isSelected: false,
          isTemporarilyMissed: false,
        };

        if (this.selectedTrackId === null && raw.species !== 'person') {
          newTrack.isSelected = true;
          this.selectedTrackId = newTrack.trackId;
        }

        this.tracks.push(newTrack);
      }
    }

    // 5. Prune tracks that exceed max consecutive misses or grace age limit
    this.pruneStaleTracks(timestamp);

    // 6. Stable display ordering and numbering (e.g. KAMBING #1, KAMBING #2)
    const sortedTracks = [...this.tracks].sort((a, b) => a.box.x - b.box.x);
    let goatNum = 1;
    let sheepNum = 1;
    let personNum = 1;

    for (const t of sortedTracks) {
      if (t.species === 'goat') {
        t.displayNumber = goatNum++;
      } else if (t.species === 'sheep') {
        t.displayNumber = sheepNum++;
      } else {
        t.displayNumber = personNum++;
      }
    }

    return [...this.tracks];
  }

  /**
   * Prune stale tracks that exceed max consecutive misses or grace age limit.
   */
  public pruneStaleTracks(timestamp: number): void {
    const prevSelectedId = this.selectedTrackId;
    let selectedTrackStillAlive = false;

    this.tracks = this.tracks.filter((t) => {
      const isAlive =
        t.consecutiveMisses <= this.config.maxConsecutiveMisses &&
        timestamp - t.lastSeen <= this.config.maxTrackAgeMs;

      if (t.trackId === prevSelectedId && isAlive) {
        selectedTrackStillAlive = true;
      }
      return isAlive;
    });

    // Handle lost selected track
    if (prevSelectedId !== null && !selectedTrackStillAlive) {
      this.selectedTrackId = null;
      const livestockTracks = this.tracks.filter((t) => t.species !== 'person');
      if (livestockTracks.length > 0) {
        livestockTracks[0].isSelected = true;
        this.selectedTrackId = livestockTracks[0].trackId;
      } else if (this.onSelectedTrackLost) {
        this.onSelectedTrackLost();
      }
    }
  }

  /**
   * Advance interpolation on requestAnimationFrame between detection cycles.
   * Smoothly drives the box toward the targetBox and cleans up expired tracks.
   */
  public step(timestamp: number = Date.now(), lerpAlpha: number = 0.18): void {
    for (const track of this.tracks) {
      track.box.x += lerpAlpha * (track.targetBox.x - track.box.x);
      track.box.y += lerpAlpha * (track.targetBox.y - track.box.y);
      track.box.width += lerpAlpha * (track.targetBox.width - track.box.width);
      track.box.height += lerpAlpha * (track.targetBox.height - track.box.height);
    }
    this.pruneStaleTracks(timestamp);
  }

  /**
   * Legacy alias for step()
   */
  public interpolate(stepAlpha: number = 0.18): void {
    this.step(Date.now(), stepAlpha);
  }

  /**
   * Clear all tracks immediately (e.g. camera turned off or mode reset).
   */
  public reset(): void {
    this.tracks = [];
    this.selectedTrackId = null;
    this.nextTrackId = 1;
  }
}

// ── Overlay Canvas Renderer ───────────────────────────────────────────────────

/**
 * Render tracked livestock bounding boxes & labels to the camera overlay canvas.
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

  // 1. Clear entire canvas before drawing (Directive 6)
  ctx.clearRect(0, 0, W, H);

  // 2. If no tracks, leave canvas completely clear (empty scene must clear)
  if (!tracks || tracks.length === 0) {
    ctx.restore();
    return;
  }

  for (const track of tracks) {
    const screenBox = mapVideoBoxToScreen(track.box, transform);
    const { x, y, width: bw, height: bh } = screenBox;

    const isSelected = track.isSelected;
    const isGoat = track.species === 'goat';
    const isSheep = track.species === 'sheep';
    const isPerson = track.species === 'person';

    // Color theme
    let strokeColor = isSelected ? '#22C55E' : 'rgba(22, 163, 74, 0.90)';
    let fillColor = isSelected ? 'rgba(34, 197, 94, 0.18)' : 'rgba(22, 163, 74, 0.08)';
    let cornerColor = isSelected ? '#4ADE80' : '#22C55E';
    let badgeBg = isSelected ? '#16A34A' : '#15803D';

    if (isPerson) {
      strokeColor = 'rgba(59, 130, 246, 0.85)';
      fillColor = 'rgba(59, 130, 246, 0.10)';
      cornerColor = '#60A5FA';
      badgeBg = '#2563EB';
    } else if (isSheep) {
      strokeColor = isSelected ? '#10B981' : 'rgba(16, 185, 129, 0.90)';
      fillColor = isSelected ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.08)';
      cornerColor = isSelected ? '#34D399' : '#10B981';
      badgeBg = isSelected ? '#059669' : '#047857';
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
        labelText = '✓ NAPILING KAMBING';
      } else if (isSheep) {
        labelText = '✓ NAPILING TUPA';
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

    // 2. Draw Bounding Box Border
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 3.5 : 2.5;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, bw, bh);

    // 3. Draw Corner Accents
    const cornerSize = Math.min(22, bw * 0.25, bh * 0.25);
    ctx.strokeStyle = cornerColor;
    ctx.lineWidth = isSelected ? 4.5 : 3.5;
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
      : 'bold 11.5px Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif';
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
  }

  ctx.restore();
}

