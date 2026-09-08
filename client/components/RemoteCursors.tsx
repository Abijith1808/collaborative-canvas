"use client";

import { useRef, useEffect, RefObject } from "react";
import { useCanvasStore } from "@/state/canvasStore";
import { normToLogical } from "@/canvas/coordinates";

interface Props {
  containerRef: RefObject<HTMLDivElement>;
}

/**
 * RemoteCursors renders other users' cursor positions as an overlay on the canvas.
 *
 * Performance design:
 * - We subscribe to the Zustand cursors map (updated ~20fps from socket).
 * - We render a simple absolutely-positioned div per cursor.
 * - We do NOT use requestAnimationFrame for cursor updates — the update
 *   frequency (20fps) is low enough that direct React renders are fine.
 * - Cursor positions are stored normalised [0,1] so they remain correct
 *   after canvas resize.
 */
export default function RemoteCursors({ containerRef }: Props) {
  const { cursors, users, currentUserId } = useCanvasStore();

  const getUserColor = (userId: string) => {
    return users.find((u) => u.id === userId)?.color ?? "#aaaaaa";
  };

  const getUserName = (userId: string) => {
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  };

  const container = containerRef.current;
  const containerWidth = container?.offsetWidth ?? 1;
  const containerHeight = container?.offsetHeight ?? 1;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {Object.values(cursors)
        .filter((c) => c.userId !== currentUserId)
        .map((cursor) => {
          // Denormalise: cursor.x/y are in [0,1] range
          const x = cursor.x * containerWidth;
          const y = cursor.y * containerHeight;
          const color = getUserColor(cursor.userId);
          const name = getUserName(cursor.userId);

          return (
            <div
              key={cursor.userId}
              className="absolute transition-none"
              style={{ left: x, top: y, transform: "translate(-2px, -2px)" }}
            >
              {/* Cursor SVG */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
              >
                <path
                  d="M0 0 L0 14 L4 10 L8 18 L10 17 L6 9 L12 9 Z"
                  fill={color}
                  stroke="white"
                  strokeWidth="0.8"
                />
              </svg>
              {/* User label */}
              <div
                className="absolute top-5 left-2 px-1.5 py-0.5 rounded text-xs whitespace-nowrap font-medium"
                style={{
                  backgroundColor: color,
                  color: "white",
                  fontSize: "10px",
                  lineHeight: "1.4",
                }}
              >
                {name}
              </div>
            </div>
          );
        })}
    </div>
  );
}
