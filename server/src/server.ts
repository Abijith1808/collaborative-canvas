import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { RoomManager } from "./rooms";
import { createUser } from "./users";
import {
  RoomJoinPayload,
  StrokeStartPayload,
  StrokePointsPayload,
  StrokeEndPayload,
  CursorMovePayload,
  Point,
  Tool,
} from "./protocol";

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_COLORS = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const MAX_WIDTH = 100;
const MIN_WIDTH = 1;
const MAX_POINTS_PER_BATCH = 500;
const MAX_ROOM_ID_LEN = 64;
const COORD_BOUNDS = 1e6; // generous upper bound

function isValidCoord(v: unknown): v is number {
  return typeof v === "number" && isFinite(v) && Math.abs(v) <= COORD_BOUNDS;
}

function isValidPoint(p: unknown): p is Point {
  if (typeof p !== "object" || p === null) return false;
  const pt = p as Record<string, unknown>;
  return isValidCoord(pt.x) && isValidCoord(pt.y);
}

function isValidColor(c: unknown): c is string {
  return typeof c === "string" && VALID_COLORS.test(c);
}

function isValidWidth(w: unknown): w is number {
  return typeof w === "number" && w >= MIN_WIDTH && w <= MAX_WIDTH;
}

function isValidTool(t: unknown): t is Tool {
  return t === "brush" || t === "eraser";
}

function isValidRoomId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= MAX_ROOM_ID_LEN &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const allowedOrigin = process.env.CLIENT_ORIGIN ?? "*";

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
  },
  // Limit maximum payload size to guard against oversized messages
  maxHttpBufferSize: 1e6, // 1 MB
});

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// Health endpoint (required for deployment probes)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const rooms = new RoomManager();

// ─── Socket event handlers ────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  /** Which room this socket is in. Set on room:join. */
  let currentRoomId: string | null = null;
  /** This socket's user object. Set on room:join. */
  let userId: string | null = null;

  // ── room:join ──────────────────────────────────────────────────────────────
  socket.on("room:join", (payload: unknown) => {
    try {
      if (typeof payload !== "object" || payload === null) {
        return emitError("INVALID_PAYLOAD", "room:join payload must be an object");
      }
      const { roomId, userName } = payload as RoomJoinPayload;

      if (!isValidRoomId(roomId)) {
        return emitError(
          "INVALID_ROOM_ID",
          "Room ID must be 1–64 alphanumeric characters (hyphens/underscores allowed)"
        );
      }

      // Leave previous room if re-joining
      if (currentRoomId) {
        leaveRoom(currentRoomId);
      }

      const user = createUser(socket.id, userName);
      userId = user.id;
      currentRoomId = roomId;

      rooms.addUser(roomId, user);
      socket.join(roomId);

      // Send authoritative room state to the joining client
      socket.emit("room:state", rooms.getRoomState(roomId));

      // Broadcast user arrival to everyone else
      socket.to(roomId).emit("user:joined", { user });

      console.log(`[room:join] ${user.name} (${socket.id}) → room ${roomId}`);
    } catch (err) {
      console.error("[room:join] error:", err);
      emitError("SERVER_ERROR", "Failed to join room");
    }
  });

  // ── stroke:start ───────────────────────────────────────────────────────────
  socket.on("stroke:start", (payload: unknown) => {
    if (!assertInRoom()) return;
    try {
      const p = payload as StrokeStartPayload;
      if (
        typeof p.strokeId !== "string" ||
        !p.strokeId ||
        !isValidTool(p.tool) ||
        !isValidColor(p.color) ||
        !isValidWidth(p.width) ||
        !isValidPoint(p.point)
      ) {
        return emitError("INVALID_PAYLOAD", "Invalid stroke:start payload");
      }

      const drawing = rooms.getDrawing(currentRoomId!);
      if (!drawing) return;

      drawing.startStroke({
        strokeId: p.strokeId,
        userId: userId!,
        tool: p.tool,
        color: p.color,
        width: p.width,
        point: p.point,
      });

      // Broadcast to everyone else in the room (sender renders locally)
      socket.to(currentRoomId!).emit("stroke:start", {
        strokeId: p.strokeId,
        userId: userId!,
        tool: p.tool,
        color: p.color,
        width: p.width,
        point: p.point,
      });
    } catch (err) {
      console.error("[stroke:start] error:", err);
      emitError("SERVER_ERROR", "Failed to process stroke:start");
    }
  });

  // ── stroke:points ──────────────────────────────────────────────────────────
  socket.on("stroke:points", (payload: unknown) => {
    if (!assertInRoom()) return;
    try {
      const p = payload as StrokePointsPayload;
      if (
        typeof p.strokeId !== "string" ||
        !Array.isArray(p.points) ||
        p.points.length === 0 ||
        p.points.length > MAX_POINTS_PER_BATCH ||
        !p.points.every(isValidPoint)
      ) {
        return emitError("INVALID_PAYLOAD", "Invalid stroke:points payload");
      }

      const drawing = rooms.getDrawing(currentRoomId!);
      if (!drawing) return;

      drawing.addPoints(p.strokeId, p.points);

      socket.to(currentRoomId!).emit("stroke:points", {
        strokeId: p.strokeId,
        userId: userId!,
        points: p.points,
      });
    } catch (err) {
      console.error("[stroke:points] error:", err);
      emitError("SERVER_ERROR", "Failed to process stroke:points");
    }
  });

  // ── stroke:end ─────────────────────────────────────────────────────────────
  socket.on("stroke:end", (payload: unknown) => {
    if (!assertInRoom()) return;
    try {
      const p = payload as StrokeEndPayload;
      if (typeof p.strokeId !== "string" || !p.strokeId) {
        return emitError("INVALID_PAYLOAD", "Invalid stroke:end payload");
      }

      const drawing = rooms.getDrawing(currentRoomId!);
      if (!drawing) return;

      const committed = drawing.endStroke(p.strokeId);
      if (!committed) return; // stroke not found (already ended or never started)

      socket.to(currentRoomId!).emit("stroke:end", {
        strokeId: committed.id,
        userId: committed.userId,
        sequence: committed.sequence,
      });
    } catch (err) {
      console.error("[stroke:end] error:", err);
      emitError("SERVER_ERROR", "Failed to process stroke:end");
    }
  });

  // ── cursor:move ────────────────────────────────────────────────────────────
  socket.on("cursor:move", (payload: unknown) => {
    if (!assertInRoom()) return;
    const p = payload as CursorMovePayload;
    if (!isValidCoord(p?.x) || !isValidCoord(p?.y)) return;

    socket.to(currentRoomId!).emit("cursor:update", {
      userId: userId!,
      x: p.x,
      y: p.y,
    });
  });

  // ── history:undo ───────────────────────────────────────────────────────────
  socket.on("history:undo", () => {
    if (!assertInRoom()) return;
    try {
      const drawing = rooms.getDrawing(currentRoomId!);
      if (!drawing) return;

      const operations = drawing.undo();
      if (!operations) return; // nothing to undo

      // Broadcast updated operation list to the entire room (including sender)
      io.to(currentRoomId!).emit("history:updated", { operations });
    } catch (err) {
      console.error("[history:undo] error:", err);
      emitError("SERVER_ERROR", "Failed to undo");
    }
  });

  // ── history:redo ───────────────────────────────────────────────────────────
  socket.on("history:redo", () => {
    if (!assertInRoom()) return;
    try {
      const drawing = rooms.getDrawing(currentRoomId!);
      if (!drawing) return;

      const operations = drawing.redo();
      if (!operations) return; // nothing to redo

      io.to(currentRoomId!).emit("history:updated", { operations });
    } catch (err) {
      console.error("[history:redo] error:", err);
      emitError("SERVER_ERROR", "Failed to redo");
    }
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} — ${reason}`);
    if (currentRoomId && userId) {
      leaveRoom(currentRoomId);
    }
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function emitError(code: string, message: string) {
    socket.emit("server:error", { code, message });
  }

  function assertInRoom(): boolean {
    if (!currentRoomId || !userId) {
      emitError("NOT_IN_ROOM", "You must join a room first");
      return false;
    }
    return true;
  }

  function leaveRoom(roomId: string) {
    if (!userId) return;
    rooms.removeUser(roomId, userId);
    socket.to(roomId).emit("user:left", { userId });
    socket.leave(roomId);
    currentRoomId = null;
    console.log(`[leave] ${userId} left room ${roomId}`);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10);
httpServer.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] Allowed origin: ${allowedOrigin}`);
});
