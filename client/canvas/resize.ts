/**
 * Canvas resize handler.
 *
 * Resizes the canvas backing store to match the current CSS display size
 * multiplied by devicePixelRatio so lines remain sharp on Retina/HiDPI
 * displays.
 *
 * After resizing we scale the 2D context so drawing commands can use
 * CSS pixel coordinates directly.
 */
export function resizeCanvas(canvas: HTMLCanvasElement): {
  dpr: number;
  cssWidth: number;
  cssHeight: number;
} {
  const dpr = window.devicePixelRatio ?? 1;
  const cssWidth = canvas.offsetWidth;
  const cssHeight = canvas.offsetHeight;

  // Only resize if dimensions actually changed (avoids expensive redraws)
  if (
    canvas.width !== Math.round(cssWidth * dpr) ||
    canvas.height !== Math.round(cssHeight * dpr)
  ) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }

  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Reset any existing transform, then apply DPR scale
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { dpr, cssWidth, cssHeight };
}
