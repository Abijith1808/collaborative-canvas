/**
 * renderer.ts — Central canvas rendering engine.
 *
 * Two-layer architecture:
 *   [committed canvas]  — stable committed drawing history
 *   [live canvas]       — in-progress strokes (local + remote), redrawn per rAF
 *
 * Coordinate convention:
 *   - Wire format (stored in operations, sent over socket): normalised [0,1]
 *   - Rendering: logical CSS-pixel coords (committed canvas CSS width/height)
 *
 * The renderer denormalises wire-format points before drawing, so the canvas
 * content is always correct regardless of window size. After a resize, calling
 * replayOperations() re-renders everything at the new resolution.
 */

import type {
  DrawingOperation,
  Point,
  RemoteStrokeStartPayload,
  RemoteStrokePointsPayload,
  RemoteStrokeEndPayload,
} from "@/realtime/protocol";
import type { ActiveStroke } from "./stroke";
import { drawSmoothStroke } from "./stroke";
import { replayToCanvas } from "./replay";
import { resizeCanvas } from "./resize";

// ─── Canvas references ────────────────────────────────────────────────────────

let committedCanvas: HTMLCanvasElement | null = null;
let committedCtx: CanvasRenderingContext2D | null = null;
let liveCanvas: HTMLCanvasElement | null = null;
let liveCtx: CanvasRenderingContext2D | null = null;

// ─── Active strokes ───────────────────────────────────────────────────────────

/** The local user's current stroke (null when not drawing). Points in logical px. */
let localStroke: ActiveStroke | null = null;

/**
 * Remote strokes that are in-progress (strokeId → stroke).
 * Points are stored as normalised [0,1]; denormalised on render.
 */
const remoteStrokes: Map<string, ActiveStroke> = new Map();

// ─── rAF state ────────────────────────────────────────────────────────────────

let rafHandle: number | null = null;
let liveDirty = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a normalised point [0,1] to logical canvas pixel coordinates.
 */
function denorm(p: Point): Point {
  const w = committedCanvas?.offsetWidth ?? 1;
  const h = committedCanvas?.offsetHeight ?? 1;
  return { x: p.x * w, y: p.y * h };
}

function denormPoints(points: Point[]): Point[] {
  return points.map(denorm);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function mountCanvas(
  committed: HTMLCanvasElement,
  live: HTMLCanvasElement
): void {
  committedCanvas = committed;
  committedCtx = committed.getContext("2d");
  liveCanvas = live;
  liveCtx = live.getContext("2d");
  startRenderLoop();
}

export function unmountCanvas(): void {
  if (rafHandle !== null) cancelAnimationFrame(rafHandle);
  rafHandle = null;
  committedCanvas = null;
  committedCtx = null;
  liveCanvas = null;
  liveCtx = null;
  localStroke = null;
  remoteStrokes.clear();
}

export function handleResize(operations: DrawingOperation[]): void {
  if (committedCanvas) resizeCanvas(committedCanvas);
  if (liveCanvas) resizeCanvas(liveCanvas);
  if (committedCtx && committedCanvas) {
    replayToCanvas(committedCtx, committedCanvas, operations);
  }
  liveDirty = true;
}

// ─── Local drawing (logical px coords) ────────────────────────────────────────

export function beginLocalStroke(stroke: ActiveStroke): void {
  localStroke = stroke;
  liveDirty = true;
}

export function appendLocalPoints(points: Point[]): void {
  if (!localStroke) return;
  localStroke.points.push(...points);
  liveDirty = true;
}

export function commitLocalStroke(): void {
  if (!localStroke || !committedCtx) {
    localStroke = null;
    return;
  }
  drawSmoothStroke(
    committedCtx,
    localStroke.points, // already logical px
    localStroke.tool,
    localStroke.color,
    localStroke.width
  );
  localStroke = null;
  liveDirty = true;
}

// ─── Remote drawing (normalised [0,1] coords from server) ──────────────────────

export function startRemoteStroke(payload: RemoteStrokeStartPayload): void {
  remoteStrokes.set(payload.strokeId, {
    id: payload.strokeId,
    userId: payload.userId,
    tool: payload.tool,
    color: payload.color,
    width: payload.width,
    points: [payload.point], // normalised
  });
  liveDirty = true;
}

export function appendRemotePoints(payload: RemoteStrokePointsPayload): void {
  const stroke = remoteStrokes.get(payload.strokeId);
  if (!stroke) return;
  stroke.points.push(...payload.points); // normalised
  liveDirty = true;
}

export function endRemoteStroke(payload: RemoteStrokeEndPayload): void {
  const stroke = remoteStrokes.get(payload.strokeId);
  if (!stroke || !committedCtx) {
    remoteStrokes.delete(payload.strokeId);
    return;
  }
  // Commit to permanent layer using denormalised coords
  drawSmoothStroke(
    committedCtx,
    denormPoints(stroke.points),
    stroke.tool,
    stroke.color,
    stroke.width
  );
  remoteStrokes.delete(payload.strokeId);
  liveDirty = true;
}

// ─── History replay ───────────────────────────────────────────────────────────

export function replayOperations(operations: DrawingOperation[]): void {
  if (!committedCtx || !committedCanvas) return;
  remoteStrokes.clear();
  // replayToCanvas handles denormalisation internally via the canvas dimensions
  replayToCanvas(committedCtx, committedCanvas, operations);
  liveDirty = true;
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function startRenderLoop(): void {
  if (rafHandle !== null) cancelAnimationFrame(rafHandle);

  const loop = () => {
    if (liveDirty && liveCtx && liveCanvas) {
      liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);

      // Render in-progress remote strokes (denormalise for display)
      for (const stroke of remoteStrokes.values()) {
        drawSmoothStroke(
          liveCtx,
          denormPoints(stroke.points),
          stroke.tool,
          stroke.color,
          stroke.width
        );
      }

      // Render local in-progress stroke (already in logical px)
      if (localStroke) {
        drawSmoothStroke(
          liveCtx,
          localStroke.points,
          localStroke.tool,
          localStroke.color,
          localStroke.width
        );
      }

      liveDirty = false;
    }

    rafHandle = requestAnimationFrame(loop);
  };

  rafHandle = requestAnimationFrame(loop);
}
