import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "./protocol";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * Returns a singleton Socket.IO connection.
 * Safe to call multiple times — returns the existing socket if already connected.
 */
export function initSocket(): AppSocket {
  if (socket) return socket;

  const url =
    process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

  socket = io(url, {
    // Use WebSocket first; fall back to long-polling only if WS is blocked
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  }) as AppSocket;

  socket.on("connect", () => {
    console.log("[socket] connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.error("[socket] connection error:", err.message);
  });

  return socket;
}

/**
 * Returns the current socket instance (or null if not yet initialised).
 */
export function getSocket(): AppSocket | null {
  return socket;
}
