"use client";

import { useCanvasStore } from "@/state/canvasStore";
import { getSocket } from "@/realtime/socket";

const PRESET_COLORS = [
  "#e63946", // red
  "#2196F3", // blue
  "#4CAF50", // green
  "#FF9800", // orange
  "#9C27B0", // purple
  "#00BCD4", // cyan
  "#1a1a1a", // near-black
  "#ffffff", // white
];

const BRUSH_WIDTHS = [2, 4, 8, 16, 32];

export default function Toolbar() {
  const { tool, setTool, color, setColor, brushWidth, setBrushWidth } =
    useCanvasStore();

  const handleUndo = () => getSocket()?.emit("history:undo");
  const handleRedo = () => getSocket()?.emit("history:redo");

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 flex-wrap shrink-0"
      style={{
        background: "var(--toolbar-bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setTool("brush")}
          className={`tool-btn px-3 py-2 text-sm gap-1.5 ${tool === "brush" ? "active" : ""}`}
          title="Brush (B)"
        >
          <BrushIcon />
          <span className="hidden sm:inline text-xs text-gray-300">Brush</span>
        </button>
        <button
          onClick={() => setTool("eraser")}
          className={`tool-btn px-3 py-2 text-sm gap-1.5 ${tool === "eraser" ? "active" : ""}`}
          title="Eraser (E)"
        >
          <EraserIcon />
          <span className="hidden sm:inline text-xs text-gray-300">Eraser</span>
        </button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Color palette */}
      <div className="flex items-center gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              if (tool === "eraser") setTool("brush");
            }}
            title={c}
            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: color === c ? "white" : "transparent",
              outline: c === "#ffffff" ? "1px solid rgba(255,255,255,0.2)" : undefined,
            }}
          />
        ))}
        {/* Custom color picker */}
        <label className="w-6 h-6 rounded-full border-2 border-white/20 overflow-hidden cursor-pointer hover:scale-110 transition-transform" title="Custom color">
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              if (tool === "eraser") setTool("brush");
            }}
            className="opacity-0 w-full h-full cursor-pointer"
          />
        </label>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Stroke width */}
      <div className="flex items-center gap-2">
        {BRUSH_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setBrushWidth(w)}
            className={`flex items-center justify-center rounded-full transition-all hover:bg-white/10 w-7 h-7 ${
              brushWidth === w ? "ring-1 ring-white/40 bg-white/15" : ""
            }`}
            title={`${w}px`}
          >
            <div
              className="rounded-full bg-white"
              style={{ width: Math.min(w, 20), height: Math.min(w, 20) }}
            />
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          className="tool-btn px-3 py-2 text-xs gap-1.5 text-gray-300"
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon />
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button
          onClick={handleRedo}
          className="tool-btn px-3 py-2 text-xs gap-1.5 text-gray-300"
          title="Redo (Ctrl+Shift+Z)"
        >
          <RedoIcon />
          <span className="hidden sm:inline">Redo</span>
        </button>
      </div>

      {/* Current color preview */}
      <div className="ml-auto hidden md:flex items-center gap-2 text-xs text-gray-400">
        <div
          className="w-4 h-4 rounded-sm border border-white/20"
          style={{ backgroundColor: color }}
        />
        <span>{color}</span>
        <span className="text-gray-600">|</span>
        <span>{brushWidth}px</span>
      </div>
    </div>
  );
}

// ── Icon components ─────────────────────────────────────────────────────────

function BrushIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.08"/>
      <path d="M7.07 14.94C5.79 16.2 4 16.5 2.5 18c-1.5 1.5-2 5-.5 6.5s5-1 6.5-.5c1.5.5 1.8-1.21 3.06-2.49"/>
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20H7L3 16l10-10 7 7-1.5 1.5"/>
      <path d="M6.5 17.5l4-4"/>
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>
    </svg>
  );
}
