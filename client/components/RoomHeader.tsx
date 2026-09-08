"use client";

import { useState } from "react";

interface Props {
  roomId: string;
}

export default function RoomHeader({ roomId }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the URL bar
    }
  };

  return (
    <header
      className="flex items-center justify-between px-4 py-3 shrink-0"
      style={{
        background: "var(--toolbar-bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
        <span className="font-semibold text-sm text-white hidden sm:block">
          Collaborative Canvas
        </span>
      </div>

      {/* Room ID + share */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)" }}
        >
          <span className="text-gray-400">Room:</span>
          <span className="font-mono font-semibold text-white">{roomId}</span>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-white/8 transition-all border border-white/10"
          title="Copy invite link"
        >
          {copied ? (
            <>
              <CheckIcon />
              <span className="hidden sm:inline">Copied!</span>
            </>
          ) : (
            <>
              <LinkIcon />
              <span className="hidden sm:inline">Share</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
