/**
 * cameraUtils.ts — Lightweight Canvas & Camera Utilities for AlpasFarm
 *
 * Provides pure browser-based frame capture, image resizing, and Blob conversion
 * without any heavy ML / TensorFlow / ONNX dependencies.
 */

/**
 * Capture current frame from a running HTML5 video element into an HTMLCanvasElement
 */
export function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, 0, 0, width, height);
  }
  return canvas;
}

/**
 * Load an uploaded File/Blob into an HTMLCanvasElement
 */
export async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Convert HTMLCanvasElement to JPEG Blob
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Nabigo ang pag-convert ng canvas sa image blob.'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Downscale and optimize an image/canvas for sending to Gemini Vision API
 * Default 1280px max dimension, 0.85 quality JPEG
 */
export async function optimizeImageForAI(
  input: HTMLCanvasElement | HTMLImageElement | string,
  maxDimension: number = 1280,
  quality: number = 0.85
): Promise<string> {
  if (typeof input === 'string' && input.startsWith('data:image/')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= maxDimension && height <= maxDimension && input.length < 500000) {
          resolve(input);
          return;
        }

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(input);
        }
      };
      img.onerror = () => resolve(input);
      img.src = input;
    });
  }

  let srcCanvas: HTMLCanvasElement;
  if (input instanceof HTMLCanvasElement) {
    srcCanvas = input;
  } else if (input instanceof HTMLImageElement) {
    const c = document.createElement('canvas');
    c.width = input.naturalWidth || input.width;
    c.height = input.naturalHeight || input.height;
    const ctx = c.getContext('2d');
    if (ctx) ctx.drawImage(input, 0, 0);
    srcCanvas = c;
  } else {
    return String(input);
  }

  let width = srcCanvas.width;
  let height = srcCanvas.height;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = width;
    scaledCanvas.height = height;
    const ctx = scaledCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(srcCanvas, 0, 0, width, height);
      return scaledCanvas.toDataURL('image/jpeg', quality);
    }
  }

  return srcCanvas.toDataURL('image/jpeg', quality);
}

/**
 * Crop a canvas to a specific normalized bounding box with padding.
 * Isolates the selected animal from background animals/objects for focused health screening.
 */
export function cropCanvasToBoundingBox(
  sourceCanvas: HTMLCanvasElement,
  bbox: { x: number; y: number; width: number; height: number },
  paddingFactor = 0.12
): HTMLCanvasElement {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  // Normalize if coordinates are on 0..1000 scale
  let nx = bbox.x > 1 ? bbox.x / 1000 : bbox.x;
  let ny = bbox.y > 1 ? bbox.y / 1000 : bbox.y;
  let nw = bbox.width > 1 ? bbox.width / 1000 : bbox.width;
  let nh = bbox.height > 1 ? bbox.height / 1000 : bbox.height;

  // Convert normalized to pixels
  const rawX = nx * sw;
  const rawY = ny * sh;
  const rawW = nw * sw;
  const rawH = nh * sh;

  // Add padding margin around animal
  const padX = rawW * paddingFactor;
  const padY = rawH * paddingFactor;

  const cropX = Math.max(0, Math.floor(rawX - padX));
  const cropY = Math.max(0, Math.floor(rawY - padY));
  const cropW = Math.min(sw - cropX, Math.ceil(rawW + padX * 2));
  const cropH = Math.min(sh - cropY, Math.ceil(rawH + padY * 2));

  // If crop is too small or invalid, return original canvas
  if (cropW < 50 || cropH < 50) {
    return sourceCanvas;
  }

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const ctx = croppedCanvas.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return croppedCanvas;
}

// ── Live Object Detection & Bounding Box Types ───────────────────────────────

export interface BoundingBox {
  x: number;       // 0.0 to 1.0 (left percentage)
  y: number;       // 0.0 to 1.0 (top percentage)
  width: number;   // 0.0 to 1.0 (width percentage)
  height: number;  // 0.0 to 1.0 (height percentage)
}

export type LiveTargetType = 'GOAT' | 'SHEEP' | 'PERSON' | 'OTHER' | 'OTHER_ANIMAL' | 'OBJECT' | 'UNCERTAIN';
export type LiveTargetLabel =
  | 'Kambing'
  | 'Tupa'
  | 'Tao'
  | 'Ibang Bagay'
  | 'Hindi Malinaw'
  | 'KAMBING'
  | 'TUPA'
  | 'TAO'
  | 'IBANG BAGAY'
  | string;

export interface LiveDetectedObject {
  type: LiveTargetType;
  label: LiveTargetLabel;
  boundingBox: BoundingBox;
}

export interface LiveObjectDetectionResult {
  success: boolean;
  detections: LiveDetectedObject[];
  count_goats: number;
  count_sheep: number;
  multiple_targets: boolean;
  status_message: string;
  error?: string;
}

/**
 * Capture a lightweight downscaled frame (default max 480px)
 * for rapid sampling during live object detection.
 */
export function captureLowResFrame(
  video: HTMLVideoElement,
  maxDimension: number = 480
): HTMLCanvasElement {
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;

  let width = vWidth;
  let height = vHeight;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, 0, 0, width, height);
  }
  return canvas;
}

/**
 * Render real-time high-contrast bounding boxes & labels to the camera overlay canvas
 */
export function renderLiveDetectionsToCanvas(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  detections: LiveDetectedObject[],
  selectedTargetIndex: number = 0
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Sync canvas internal resolution with display size
  if (canvas.clientWidth > 0 && canvas.clientHeight > 0 &&
      (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }

  const W = canvas.width;
  const H = canvas.height;

  // Clear canvas before rendering every frame
  ctx.clearRect(0, 0, W, H);

  // If no detections or video not ready, leave canvas completely clear
  if (!detections || detections.length === 0 || !video || video.videoWidth === 0) {
    return;
  }

  const vW = video.videoWidth;
  const vH = video.videoHeight;

  // Calculate object-fit: cover scaling & cropping offset
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (W / H > vW / vH) {
    scale = W / vW;
    offsetY = (H - vH * scale) / 2;
  } else {
    scale = H / vH;
    offsetX = (W - vW * scale) / 2;
  }

  let targetCounter = 0;

  for (const d of detections) {
    const rawBox = d.boundingBox;
    if (!rawBox) continue;

    // Convert video-normalized box [0, 1] to video pixels, then scale to canvas
    const vidX = rawBox.x * vW;
    const vidY = rawBox.y * vH;
    const vidW = rawBox.width * vW;
    const vidH = rawBox.height * vH;

    const bx = vidX * scale + offsetX;
    const by = vidY * scale + offsetY;
    const bw = Math.max(30, vidW * scale);
    const bh = Math.max(30, vidH * scale);

    // Keep box bounded within canvas
    const drawX = Math.max(2, Math.min(W - bw - 2, bx));
    const drawY = Math.max(2, Math.min(H - bh - 2, by));

    const isGoat = d.type === 'GOAT';
    const isSheep = d.type === 'SHEEP';
    const isTarget = isGoat || isSheep;
    const isUncertain = d.type === 'UNCERTAIN';
    const isPerson = d.type === 'PERSON';

    let isSelectedTarget = false;
    if (isTarget) {
      isSelectedTarget = (targetCounter === selectedTargetIndex);
      targetCounter++;
    }

    // High-contrast color palette
    let strokeColor = '#94A3B8';
    let fillColor = 'rgba(148, 163, 184, 0.08)';
    let badgeBg = '#475569';
    let accentColor = '#CBD5E1';
    let labelText = 'Ibang Bagay';

    if (isTarget) {
      if (isSelectedTarget) {
        strokeColor = '#22C55E';
        fillColor = 'rgba(34, 197, 94, 0.20)';
        badgeBg = '#16A34A';
        accentColor = '#4ADE80';
        labelText = isGoat ? 'Napiling Kambing' : 'Napiling Tupa';
      } else {
        strokeColor = 'rgba(22, 163, 74, 0.85)';
        fillColor = 'rgba(22, 163, 74, 0.10)';
        badgeBg = '#15803D';
        accentColor = '#22C55E';
        labelText = isGoat ? 'Kambing' : 'Tupa';
      }
    } else if (isUncertain) {
      strokeColor = '#D97706';
      fillColor = 'rgba(217, 119, 6, 0.15)';
      badgeBg = '#D97706';
      accentColor = '#FBBF24';
      labelText = 'Hindi Malinaw';
    } else if (isPerson) {
      strokeColor = '#2563EB';
      fillColor = 'rgba(37, 99, 235, 0.12)';
      badgeBg = '#2563EB';
      accentColor = '#60A5FA';
      labelText = 'Tao';
    } else {
      // All other items (Cat, Dog, Cow, Car, Door, Furniture, etc.) -> "Ibang Bagay"
      strokeColor = '#94A3B8';
      fillColor = 'rgba(148, 163, 184, 0.10)';
      badgeBg = '#475569';
      accentColor = '#CBD5E1';
      labelText = 'Ibang Bagay';
    }

    // 1. Draw Bounding Box Fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(drawX, drawY, bw, bh);

    // 2. Draw Bounding Box Border
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelectedTarget ? 4 : (isTarget || isUncertain ? 3 : 2);
    ctx.setLineDash([]);
    ctx.strokeRect(drawX, drawY, bw, bh);

    // 3. Draw Corner Accents
    const cornerSize = Math.min(20, bw * 0.25, bh * 0.25);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = isSelectedTarget ? 4.5 : 3.5;
    ctx.lineCap = 'round';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(drawX, drawY + cornerSize);
    ctx.lineTo(drawX, drawY);
    ctx.lineTo(drawX + cornerSize, drawY);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(drawX + bw - cornerSize, drawY);
    ctx.lineTo(drawX + bw, drawY);
    ctx.lineTo(drawX + bw, drawY + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(drawX, drawY + bh - cornerSize);
    ctx.lineTo(drawX, drawY + bh);
    ctx.lineTo(drawX + cornerSize, drawY + bh);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(drawX + bw - cornerSize, drawY + bh);
    ctx.lineTo(drawX + bw, drawY + bh);
    ctx.lineTo(drawX + bw, drawY + bh - cornerSize);
    ctx.stroke();

    // 4. Draw Label Badge (Directly above box or inside top if near top)
    ctx.font = 'bold 12px Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const badgePadX = 10;
    const badgeH = 24;
    const badgeW = textMetrics.width + badgePadX * 2;

    let labelX = Math.max(4, Math.min(W - badgeW - 4, drawX));
    let labelY = drawY - badgeH - 4;
    if (labelY < 4) {
      labelY = drawY + 4;
    }

    // Badge Shadow & Rounded Pill
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
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
    ctx.fillText(labelText, labelX + badgePadX, labelY + 16);
  }
}
