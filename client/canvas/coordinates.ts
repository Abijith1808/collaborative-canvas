/**
 * Coordinate conversion utilities.
 *
 * The canvas internal resolution is scaled by devicePixelRatio (DPR) to
 * render crisp lines on high-DPI displays. CSS sets the visual size (100%
 * of the container). Internally we work in "logical" coordinates (0..cssWidth,
 * 0..cssHeight) and convert to physical pixels only in the rendering layer.
 *
 * These helpers convert from DOM event coordinates (relative to the canvas
 * element's bounding rect) into the logical coordinate space.
 */

export interface LogicalPoint {
  x: number;
  y: number;
}

/**
 * Convert a pointer event's client position to canvas logical coordinates.
 */
export function clientToLogical(
  e: PointerEvent,
  canvas: HTMLCanvasElement
): LogicalPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

/**
 * Convert a logical canvas coordinate to a physical pixel coordinate.
 * Physical = logical * dpr (used when calling ctx drawing methods).
 */
export function logicalToPhysical(
  point: LogicalPoint,
  dpr: number
): LogicalPoint {
  return { x: point.x * dpr, y: point.y * dpr };
}

/**
 * Normalise a logical point to [0,1] range relative to canvas size.
 * We store normalised coordinates in stroke operations so they remain
 * correct when the canvas is resized.
 */
export function logicalToNorm(
  point: LogicalPoint,
  canvas: HTMLCanvasElement
): LogicalPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width > 0 ? point.x / rect.width : 0,
    y: rect.height > 0 ? point.y / rect.height : 0,
  };
}

/**
 * Convert a normalised coordinate back to logical canvas space.
 */
export function normToLogical(
  point: LogicalPoint,
  canvas: HTMLCanvasElement
): LogicalPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: point.x * rect.width,
    y: point.y * rect.height,
  };
}
