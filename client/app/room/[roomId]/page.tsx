"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useCanvasStore } from "@/state/canvasStore";
import { initSocket, getSocket } from "@/realtime/socket";
import { registerEventHandlers } from "@/realtime/events";
import RoomHeader from "@/components/RoomHeader";
import Toolbar from "@/components/Toolbar";
import DrawingCanvas from "@/components/DrawingCanvas";
import UserList from "@/components/UserList";
import ConnectionStatus from "@/components/ConnectionStatus";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { setRoomId, reset } = useCanvasStore();

  useEffect(() => {
    if (!roomId) return;

    setRoomId(roomId);

    // Initialize socket and wire up all event handlers
    const socket = initSocket();
    const cleanup = registerEventHandlers(socket);

    // Join the room
    socket.emit("room:join", { roomId });

    return () => {
      cleanup();
      reset();
      // Don't disconnect socket — let the singleton handle reconnects across
      // page navigations. The server will see the disconnect via socket lifecycle.
    };
  }, [roomId, setRoomId, reset]);

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--canvas-bg)" }}
    >
      {/* Top header bar */}
      <RoomHeader roomId={roomId} />

      {/* Main content: toolbar + canvas + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Toolbar + Canvas */}
        <div className="flex flex-col flex-1 min-w-0">
          <Toolbar />
          <div className="flex-1 relative min-h-0">
            <DrawingCanvas />
          </div>
        </div>

        {/* Right sidebar: online users */}
        <UserList />
      </div>

      {/* Bottom status bar */}
      <ConnectionStatus />
    </div>
  );
}
