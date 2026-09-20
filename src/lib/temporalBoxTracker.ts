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

export type LivestockSpecies = 'goat' | 'sheep';
export type LivestockDisplayLabel = 'KAMBING' | 'TUPA';

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
  firstSeen: number;
  lastSeen: number;
  consecutiveHits: number;
  consecutiveMisses: number;
  speciesHistory: LivestockSpecies[];
  isSelected: boolean;
}

export interface TrackerConfig {
  /** EMA smoothing factor for bounding box coordinates (0.0 to 1.0). Default: 0.38 */
  smoothingAlpha: number;
  /** Minimum IoU threshold to consider a match between frames. Default: 0.25 */
  matchIouThreshold: number;
  /** Maximum normalized center distance fallback if IoU is 0 (fast move). Default: 0.18 */
  maxCenterDistanceFallback: number;
  /** Number of missed frames tolerated before pruning a track. Default: 3 */
  maxConsecutiveMisses: number;
  /** Maximum duration in ms before pruning an unseen track. Default: 800ms */
  maxTrackAgeMs: number;
  /** Number of consecutive consistent species classifications required to change label. Default: 3 */
  speciesConsensusThreshold: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  smoothingAlpha: 0.38,
  matchIouThreshold: 0.25,
  maxCenterDistanceFallback: 0.18,
  maxConsecutiveMisses: 3,
  maxTrackAgeMs: 800,
  speciesConsensusThreshold: 3,
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
    if (!found) return false;

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
      if (hitTestTrack(screenTapX, screenTapY, track, transform)) {
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
   * 1. Match fresh detections with existing tracks using 2D IoU.
   * 2. Fall back to center distance for fast movement.
   * 3. Apply Exponential Moving Average (EMA) to smooth box coords.
   * 4. Enforce species consensus before switching label.
   * 5. Manage grace period for missed tracks.
   * 6. Prune stale tracks and notify if selected track is lost.
   */
  public update(rawDetections: RawLivestockDetection[], timestamp: number = Date.now()): TrackedLivestockAnimal[] {
    const matchedTrackIds = new Set<number>();
    const matchedRawIndices = new Set<number>();

    // 1. Calculate cost matrix (IoU) between all existing tracks and raw detections
    const matchCandidates: {
      trackIndex: number;
      rawIndex: number;
      iou: number;
      distance: number;
    }[] = [];

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t];
      for (let r = 0; r < rawDetections.length; r++) {
        const raw = rawDetections[r];
        const iou = calculate2DIoU(track.box, raw.box);
        const distance = calculateCenterDistance(track.box, raw.box);

        if (iou >= this.config.matchIouThreshold) {
          matchCandidates.push({ trackIndex: t, rawIndex: r, iou, distance });
        } else if (distance <= this.config.maxCenterDistanceFallback) {
          // Low IoU due to rapid move, but close center distance
          matchCandidates.push({ trackIndex: t, rawIndex: r, iou: 0.1, distance });
        }
      }
    }

    // Sort greedy matches: highest IoU first, then lowest center distance
    matchCandidates.sort((a, b) => b.iou - a.iou || a.distance - b.distance);

    // 2. Perform greedy matching
    for (const cand of matchCandidates) {
      const track = this.tracks[cand.trackIndex];
      const raw = rawDetections[cand.rawIndex];

      if (matchedTrackIds.has(track.trackId) || matchedRawIndices.has(cand.rawIndex)) {
        continue;
      }

      matchedTrackIds.add(track.trackId);
      matchedRawIndices.add(cand.rawIndex);

      // ── Update Track with EMA Smoothing ──
      const alpha = this.config.smoothingAlpha;
      track.targetBox = { ...raw.box };

      // EMA smoothing formula: smoothed = previous + alpha * (target - previous)
      track.box = {
        x: track.box.x + alpha * (raw.box.x - track.box.x),
        y: track.box.y + alpha * (raw.box.y - track.box.y),
        width: track.box.width + alpha * (raw.box.width - track.box.width),
        height: track.box.height + alpha * (raw.box.height - track.box.height),
      };

      track.confidence = raw.confidence;
      track.lastSeen = timestamp;
      track.consecutiveHits++;
      track.consecutiveMisses = 0;

      // ── Species Temporal Consensus ──
      track.speciesHistory.push(raw.species);
      if (track.speciesHistory.length > 5) {
        track.speciesHistory.shift();
      }

      // Check if majority of recent frames agree on species
      const goatVotes = track.speciesHistory.filter((s) => s === 'goat').length;
      const sheepVotes = track.speciesHistory.filter((s) => s === 'sheep').length;

      if (goatVotes >= this.config.speciesConsensusThreshold && track.species !== 'goat') {
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
      }
    }

    // 4. Create new tracks for unmatched raw detections
    for (let r = 0; r < rawDetections.length; r++) {
      if (!matchedRawIndices.has(r)) {
        const raw = rawDetections[r];
        const newTrack: TrackedLivestockAnimal = {
          trackId: this.nextTrackId++,
          displayNumber: 0, // re-assigned below
          species: raw.species,
          label: raw.species === 'sheep' ? 'TUPA' : 'KAMBING',
          confidence: raw.confidence,
          box: { ...raw.box },
          targetBox: { ...raw.box },
          firstSeen: timestamp,
          lastSeen: timestamp,
          consecutiveHits: 1,
          consecutiveMisses: 0,
          speciesHistory: [raw.species],
          isSelected: false,
        };

        // If no animal is currently selected and this is the first animal in the scene,
        // auto-select it for seamless farmer experience
        if (this.tracks.length === 0 && this.selectedTrackId === null) {
          newTrack.isSelected = true;
          this.selectedTrackId = newTrack.trackId;
        }

        this.tracks.push(newTrack);
      }
    }

    // 5. Prune tracks that exceed max consecutive misses or age limit
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

    // 6. Handle lost selected track
    if (prevSelectedId !== null && !selectedTrackStillAlive) {
      this.selectedTrackId = null;
      if (this.tracks.length > 0) {
        // Auto-select another visible animal if available
        this.tracks[0].isSelected = true;
        this.selectedTrackId = this.tracks[0].trackId;
      } else if (this.onSelectedTrackLost) {
        this.onSelectedTrackLost();
      }
    }

    // 7. Stable display ordering and numbering (e.g. KAMBING #1, KAMBING #2)
    // Sort left-to-right to give predictable numbering
    const sortedTracks = [...this.tracks].sort((a, b) => a.box.x - b.box.x);
    let goatNum = 1;
    let sheepNum = 1;

    for (const t of sortedTracks) {
      if (t.species === 'goat') {
        t.displayNumber = goatNum++;
      } else {
        t.displayNumber = sheepNum++;
      }
    }

    return [...this.tracks];
  }

  /**
   * Advance interpolation on requestAnimationFrame between detection cycles.
   * Smoothly drives the box toward the targetBox.
   */
  public interpolate(stepAlpha: number = 0.20): void {
    for (const track of this.tracks) {
      track.box.x += stepAlpha * (track.targetBox.x - track.box.x);
      track.box.y += stepAlpha * (track.targetBox.y - track.box.y);
      track.box.width += stepAlpha * (track.targetBox.width - track.box.width);
      track.box.height += stepAlpha * (track.targetBox.height - track.box.height);
    }
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
  transform: ViewportTransform
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Sync internal resolution with CSS display dimensions
  if (
    canvas.clientWidth > 0 &&
    canvas.clientHeight > 0 &&
    (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)
  ) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }

  const W = canvas.width;
  const H = canvas.height;

  // 1. Clear entire canvas before drawing
  ctx.clearRect(0, 0, W, H);

  // 2. If no tracks, leave canvas completely clear (empty scene must clear)
  if (!tracks || tracks.length === 0) {
    return;
  }

  const multipleAnimals = tracks.length > 1;

  for (const track of tracks) {
    const screenBox = mapVideoBoxToScreen(track.box, transform);
    const { x, y, width: bw, height: bh } = screenBox;

    const isSelected = track.isSelected;
    const isGoat = track.species === 'goat';

    // Color theme
    let strokeColor = isSelected ? '#22C55E' : 'rgba(22, 163, 74, 0.85)';
    let fillColor = isSelected ? 'rgba(34, 197, 94, 0.20)' : 'rgba(22, 163, 74, 0.08)';
    let cornerColor = isSelected ? '#4ADE80' : '#22C55E';
    let badgeBg = isSelected ? '#16A34A' : '#15803D';
    let labelText = isSelected
      ? isGoat
        ? multipleAnimals ? `✓ NAPILING KAMBING #${track.displayNumber}` : '✓ NAPILING KAMBING'
        : multipleAnimals ? `✓ NAPILING TUPA #${track.displayNumber}` : '✓ NAPILING TUPA'
      : multipleAnimals
      ? `${track.label} #${track.displayNumber}`
      : track.label;

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
}

