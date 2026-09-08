import type { AppSocket } from "./socket";
import { useCanvasStore } from "@/state/canvasStore";
import {
  replayOperations,
  startRemoteStroke,
  appendRemotePoints,
  endRemoteStroke,
} from "@/canvas/renderer";

/**
 * Register all server→client event handlers on the given socket.
 * Returns a cleanup function that removes the listeners.
 *
 * Separated from socket.ts so it can be tested independently
 * and so the room page can set up/tear down handlers on mount/unmount.
 */
export function registerEventHandlers(socket: AppSocket): () => void {
  const store = useCanvasStore.getState;

  // ── room:state ─────────────────────────────────────────────────────────────
  // Received on initial join and after reconnect.
  socket.on("room:state", (state) => {
    const { setUsers, setOperations, setConnectionStatus, setCurrentUser } =
      useCanvasStore.getState();
    setCurrentUser(socket.id ?? "");
    setUsers(state.users);
    setOperations(state.operations);
    setConnectionStatus("connected");
    // Replay the authoritative canvas state
    replayOperations(state.operations);
  });

  // ── user:joined ────────────────────────────────────────────────────────────
  socket.on("user:joined", ({ user }) => {
    useCanvasStore.getState().addUser(user);
  });

  // ── user:left ─────────────────────────────────────────────────────────────
  socket.on("user:left", ({ userId }) => {
    useCanvasStore.getState().removeUser(userId);
    useCanvasStore.getState().removeCursor(userId);
  });

  // ── stroke:start ───────────────────────────────────────────────────────────
  socket.on("stroke:start", (payload) => {
    startRemoteStroke(payload);
  });

  // ── stroke:points ──────────────────────────────────────────────────────────
  socket.on("stroke:points", (payload) => {
    appendRemotePoints(payload);
  });

  // ── stroke:end ─────────────────────────────────────────────────────────────
  socket.on("stroke:end", (payload) => {
    endRemoteStroke(payload);
    // Update local operation list with the finalized sequence
    const ops = useCanvasStore.getState().operations;
    // We don't have the full op here; the next history:updated or room:state
    // reconciles. For now, just tag the stroke as finalized.
    // (Server will have committed it; our local render already looks correct.)
  });

  // ── cursor:update ──────────────────────────────────────────────────────────
  socket.on("cursor:update", (payload) => {
    useCanvasStore.getState().updateCursor(payload.userId, payload.x, payload.y);
  });

  // ── history:updated ────────────────────────────────────────────────────────
  // Triggered after any undo or redo. We receive the full authoritative
  // operation list and replay the canvas from scratch.
  socket.on("history:updated", ({ operations }) => {
    useCanvasStore.getState().setOperations(operations);
    replayOperations(operations);
  });

  // ── server:error ───────────────────────────────────────────────────────────
  socket.on("server:error", ({ code, message }) => {
    console.error(`[server error] ${code}: ${message}`);
  });

  // ── connection lifecycle ───────────────────────────────────────────────────
  const handleConnect = () => {
    useCanvasStore.getState().setConnectionStatus("connected");
    // Re-join the room after reconnect
    const { roomId } = useCanvasStore.getState();
    if (roomId) {
      socket.emit("room:join", { roomId });
    }
  };

  const handleDisconnect = () => {
    useCanvasStore.getState().setConnectionStatus("disconnected");
  };

  const handleReconnecting = () => {
    useCanvasStore.getState().setConnectionStatus("reconnecting");
  };

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleDisconnect);
  socket.io.on("reconnect_attempt", handleReconnecting);

  // Return cleanup
  return () => {
    socket.off("room:state");
    socket.off("user:joined");
    socket.off("user:left");
    socket.off("stroke:start");
    socket.off("stroke:points");
    socket.off("stroke:end");
    socket.off("cursor:update");
    socket.off("history:updated");
    socket.off("server:error");
    socket.off("connect", handleConnect);
    socket.off("disconnect", handleDisconnect);
    socket.io.off("reconnect_attempt", handleReconnecting);
  };
}
