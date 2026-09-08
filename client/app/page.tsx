"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";

export default function HomePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");

  const ROOM_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

  const go = useCallback(
    (id: string) => {
      const clean = id.trim();
      if (!ROOM_PATTERN.test(clean)) {
        setError("Room ID can only contain letters, numbers, hyphens and underscores (max 64 chars).");
        return;
      }
      router.push(`/room/${clean}`);
    },
    [router]
  );

  const createRoom = useCallback(() => {
    // Generate a short memorable ID
    const id = uuid().split("-")[0];
    go(id);
  }, [go]);

  const joinRoom = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      go(roomId);
    },
    [go, roomId]
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
      <div className="w-full max-w-md px-6">
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Collaborative Canvas
            </h1>
          </div>
          <p className="text-sm text-gray-400">
            Real-time collaborative drawing — multiple users, one canvas.
          </p>
        </div>

        {/* Create room */}
        <button
          onClick={createRoom}
          className="w-full py-3 px-6 bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold rounded-xl hover:from-violet-500 hover:to-pink-500 transition-all duration-200 shadow-lg shadow-violet-900/30 mb-4"
        >
          Create New Room
        </button>

        <div className="flex items-center gap-3 mb-4">
          <hr className="flex-1 border-white/10" />
          <span className="text-xs text-gray-500 uppercase tracking-widest">or join existing</span>
          <hr className="flex-1 border-white/10" />
        </div>

        {/* Join room */}
        <form onSubmit={joinRoom} className="space-y-3">
          <input
            type="text"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setError("");
            }}
            placeholder="Enter room ID..."
            className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/8 transition-all"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 px-6 bg-white/8 border border-white/15 text-white font-medium rounded-xl hover:bg-white/12 transition-all duration-200"
          >
            Join Room
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-8">
          Share the room URL with others to draw together.
        </p>
      </div>
    </div>
  );
}
