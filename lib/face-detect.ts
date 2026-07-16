/**
 * Face detection using @vladmandic/face-api (TensorFlow.js).
 *
 * COLD START: models (~5 MB) load on first use, cached in IndexedDB by
 * face-api internally. Subsequent detections are instant.
 *
 * DETECTIONS: returns array of { box, score, landmarks } from SSD Mobilenet
 * v1. Score < 0.5 is noise — caller should filter.
 */
import * as faceapi from "@vladmandic/face-api";

let loaded = false;
let loading: Promise<void> | null = null;

// Public path where model files are served (copied to public/ dir).
const MODEL_URL = "/models";

export async function loadModels(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      loaded = true;
    } catch (err) {
      loading = null; // Allow retry on next call.
      throw err;
    }
  })();
  return loading;
}

export interface FaceResult {
  box: { x: number; y: number; width: number; height: number };
  score: number;
  landmarks: { x: number; y: number }[];
  expressions: Record<string, number>;
  age?: number;
  gender?: string;
}

export async function detectFaces(input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<FaceResult[]> {
  if (!loaded) await loadModels();
  const detections = await faceapi
    .detectAllFaces(input)
    .withFaceLandmarks()
    .withFaceExpressions();

  return detections.map((d) => ({
    box: d.detection.box,
    score: d.detection.score,
    landmarks: d.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
    expressions: d.expressions.asSortedArray().reduce(
      (acc, item) => ({ ...acc, [item.expression]: item.probability }),
      {} as Record<string, number>,
    ),
  }));
}

export function drawDetections(
  canvas: HTMLCanvasElement,
  detections: FaceResult[],
  sourceWidth: number,
  sourceHeight: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scaleX = canvas.width / sourceWidth;
  const scaleY = canvas.height / sourceHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const d of detections) {
    const x = d.box.x * scaleX;
    const y = d.box.y * scaleY;
    const w = d.box.width * scaleX;
    const h = d.box.height * scaleY;

    // Bounding box — electric cobalt.
    ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    // Label background.
    const topExpr = Object.entries(d.expressions).sort((a, b) => b[1] - a[1])[0];
    const label = topExpr ? `${topExpr[0]} ${(topExpr[1] * 100).toFixed(0)}%` : `${(d.score * 100).toFixed(0)}%`;
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
    ctx.fillRect(x, y - 24, ctx.measureText(label).width + 16, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(label, x + 8, y - 8);

    // Landmarks as subtle dots.
    for (const lm of d.landmarks) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.5)";
      ctx.beginPath();
      ctx.arc(lm.x * scaleX, lm.y * scaleY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
