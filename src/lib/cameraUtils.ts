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

// ── Live Object Detection & Bounding Box Types ───────────────────────────────

export interface BoundingBox {
  x: number;       // 0.0 to 1.0 (left percentage)
  y: number;       // 0.0 to 1.0 (top percentage)
  width: number;   // 0.0 to 1.0 (width percentage)
  height: number;  // 0.0 to 1.0 (height percentage)
}

export type LiveTargetType = 'GOAT' | 'SHEEP' | 'PERSON' | 'OTHER_ANIMAL' | 'OBJECT';
export type LiveTargetLabel = 'KAMBING' | 'TUPA' | 'TAO' | 'HAYOP' | 'BAGAY';

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
