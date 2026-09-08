"use client";

import { useEffect, useRef, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { useCanvasStore } from "@/state/canvasStore";
import { getSocket } from "@/realtime/socket";
import {
  mountCanvas,
  unmountCanvas,
  beginLocalStroke,
  appendLocalPoints,
  commitLocalStroke,
  handleResize,
  replayOperations,
} from "@/canvas/renderer";
import { resizeCanvas } from "@/canvas/resize";
import { clientToLogical, logicalToNorm, normToLogical } from "@/canvas/coordinates";
import RemoteCursors from "./RemoteCursors";

// How often to flush buffered points to the server (ms)
const STROKE_FLUSH_INTERVAL = 16; // ~60fps network updates
// How often to send cursor position (ms)
const CURSOR_THROTTLE_INTERVAL = 50; // ~20fps for cursors

export default function DrawingCanvas() {
  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing state (not in React state — avoids re-renders)
  const isDrawing = useRef(false);
  const currentStrokeId = useRef<string | null>(null);
  const pointBuffer = useRef<{ x: number; y: number }[]>([]);

  // Cursor throttle
  const lastCursorSend = useRef(0);

  // Flush interval for batching point sends
  const flushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { tool, color, brushWidth, operations, currentUserId } = useCanvasStore();

  // ─── Mount / unmount ────────────────────────────────────────────────────────

  useEffect(() => {
    const committed = committedRef.current;
    const live = liveRef.current;
    if (!committed || !live) return;

    resizeCanvas(committed);
    resizeCanvas(live);
    mountCanvas(committed, live);

    // Replay any operations already in the store (e.g. after hot reload)
    const ops = useCanvasStore.getState().operations;
    if (ops.length > 0) replayOperations(ops);

    // Keyboard shortcuts
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        getSocket()?.emit("history:redo");
      } else if (isMod && e.key === "z") {
        e.preventDefault();
        getSocket()?.emit("history:undo");
      } else if (e.key === "b" || e.key === "B") {
        useCanvasStore.getState().setTool("brush");
      } else if (e.key === "e" || e.key === "E") {
        useCanvasStore.getState().setTool("eraser");
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Resize observer
    const observer = new ResizeObserver(() => {
      if (!committed || !live) return;
      resizeCanvas(committed);
      resizeCanvas(live);
      handleResize(useCanvasStore.getState().operations);
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      unmountCanvas();
      window.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
    };
  }, []);

  // ─── Flush point buffer to server ───────────────────────────────────────────

  const flushPoints = useCallback(() => {
    const socket = getSocket();
    if (!socket || !currentStrokeId.current || pointBuffer.current.length === 0)
      return;

    const live = liveRef.current;
    const committed = committedRef.current;
    if (!live || !committed) return;

    // Convert buffered logical points to normalised coords for wire format
    const normPoints = pointBuffer.current.map((p) =>
      logicalToNorm(p, committed)
    );
    pointBuffer.current = [];

    socket.emit("stroke:points", {
      strokeId: currentStrokeId.current,
      points: normPoints,
    });
  }, []);

  // ─── Pointer handlers ────────────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const live = liveRef.current;
      const committed = committedRef.current;
      if (!live || !committed) return;
      if (e.button !== 0 && e.pointerType !== "touch") return;

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();

      const logPoint = clientToLogical(e.nativeEvent, live);
      const normPoint = logicalToNorm(logPoint, committed);

      const strokeId = uuid();
      currentStrokeId.current = strokeId;
      isDrawing.current = true;
      pointBuffer.current = [];

      const { tool, color, brushWidth } = useCanvasStore.getState();

      beginLocalStroke({
        id: strokeId,
        userId: currentUserId,
        tool,
        color,
        width: brushWidth,
        points: [logPoint],
      });

      const socket = getSocket();
      socket?.emit("stroke:start", {
        strokeId,
        tool,
        color,
        width: brushWidth,
        point: normPoint,
      });

      // Start flush interval for this stroke
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = setInterval(flushPoints, STROKE_FLUSH_INTERVAL);
    },
    [currentUserId, flushPoints]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const live = liveRef.current;
      const committed = committedRef.current;
      if (!live || !committed || !isDrawing.current) return;
      e.preventDefault();

      const logPoint = clientToLogical(e.nativeEvent, live);
      appendLocalPoints([logPoint]);
      pointBuffer.current.push(logPoint);

      // Throttled cursor updates (separate from stroke data)
      const now = performance.now();
      if (now - lastCursorSend.current > CURSOR_THROTTLE_INTERVAL) {
        lastCursorSend.current = now;
        const normPoint = logicalToNorm(logPoint, committed);
        getSocket()?.emit("cursor:move", normPoint);
      }
    },
    []
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing.current) return;
      e.preventDefault();

      isDrawing.current = false;

      // Flush remaining buffered points
      flushPoints();
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }

      commitLocalStroke();

      const strokeId = currentStrokeId.current;
      currentStrokeId.current = null;

      if (strokeId) {
        getSocket()?.emit("stroke:end", { strokeId });
      }
    },
    [flushPoints]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only end stroke on leave if pointer is still down (e.g. drag off canvas)
      if (isDrawing.current) {
        onPointerUp(e);
      }
    },
    [onPointerUp]
  );

  const { tool: activeTool } = useCanvasStore();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-white"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      style={{ touchAction: "none" }}
    >
      {/* Committed layer: stable drawing history */}
      <canvas
        ref={committedRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 1 }}
      />
      {/* Live layer: in-progress strokes */}
      <canvas
        ref={liveRef}
        className={`absolute inset-0 w-full h-full ${
          activeTool === "eraser" ? "canvas-eraser" : "canvas-brush"
        }`}
        style={{ zIndex: 2 }}
      />
      {/* Remote cursors overlay */}
      <RemoteCursors containerRef={containerRef} />
    </div>
  );
}
