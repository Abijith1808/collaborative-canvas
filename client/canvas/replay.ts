import type { DrawingOperation, Point } from "@/realtime/protocol";
import { drawSmoothStroke } from "./stroke";

/**
 * Replay all active (non-undone) operations onto the canvas in sequence order.
 *
 * Points in the operation history are stored in normalised [0,1] coordinates.
 * They are denormalised to logical CSS pixel coordinates here using the
 * canvas's current CSS display size.
 *
 * This is the authoritative canvas state rebuild. Called after:
 * - room:state received (join / reconnect)
 * - history:updated received (undo / redo)
 */
export function replayToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  operations: DrawingOperation[]
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;

  const denorm = (p: Point): Point => ({ x: p.x * w, y: p.y * h });

  // Sort by authoritative server-assigned sequence number
  const sorted = [...operations].sort((a, b) => a.sequence - b.sequence);

  for (const op of sorted) {
    if (op.status !== "active") continue;
    drawSmoothStroke(ctx, op.points.map(denorm), op.tool, op.color, op.width);
  }
}
