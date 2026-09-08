"use client";

import { useCanvasStore } from "@/state/canvasStore";

export default function ConnectionStatus() {
  const { connectionStatus, fps } = useCanvasStore();

  const statusConfig = {
    connected: {
      dot: "bg-green-400",
      text: "Connected",
      textColor: "text-green-400",
    },
    reconnecting: {
      dot: "bg-yellow-400 animate-pulse",
      text: "Reconnecting...",
      textColor: "text-yellow-400",
    },
    disconnected: {
      dot: "bg-red-400",
      text: "Disconnected",
      textColor: "text-red-400",
    },
  };

  const cfg = statusConfig[connectionStatus];

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 text-xs"
      style={{
        background: "var(--toolbar-bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className={cfg.textColor}>{cfg.text}</span>
      </div>
      <div className="flex items-center gap-4 text-gray-600">
        <span>Ctrl+Z: Undo · Ctrl+Shift+Z: Redo · B: Brush · E: Eraser</span>
      </div>
    </div>
  );
}
