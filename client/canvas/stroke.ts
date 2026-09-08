import type { Point, Tool } from "@/realtime/protocol";

/**
 * A stroke in progress (either local or remote).
 * Accumulates points until the stroke ends.
 */
export interface ActiveStroke {
  id: string;
  userId: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
}

/**
 * Apply quadratic bezier smoothing between consecutive points.
 * Uses midpoint interpolation to produce a smooth curve.
 *
 * This avoids the "jagged corners" of plain lineTo() while remaining
 * simple and fast — no spline fitting required.
 */
export function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  tool: Tool,
  color: string,
  width: number
): void {
  if (points.length === 0) return;

  ctx.save();

  // Eraser uses destination-out to "cut through" painted pixels
  if (tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
  }

  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();

  if (points.length === 1) {
    // Single tap: draw a dot
    const p = points[0];
    ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "rgba(0,0,0,1)" : color;
    if (tool === "eraser") ctx.globalCompositeOperation = "destination-out";
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);

  // Quadratic bezier through midpoints for smooth curves
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }

  // Draw to the last point
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);

  ctx.stroke();
  ctx.restore();
}
