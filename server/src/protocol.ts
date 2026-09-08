/**
 * Shared protocol types for the WebSocket event schema.
 * This file is duplicated (conceptually) on the client side under client/realtime/protocol.ts.
 * Keep both in sync when modifying the event contract.
 */

export interface Point {
  x: number;
  y: number;
}

export type Tool = "brush" | "eraser";
export type OperationStatus = "active" | "undone";

/**
 * A complete drawing operation (stroke).
 * sequence is assigned by the server to establish authoritative ordering.
 */
export interface DrawingOperation {
  id: string;
  sequence: number;
  userId: string;
  type: "stroke";
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  status: OperationStatus;
  createdAt: number;
}

/**
 * Represents a user connected to a room.
 */
export interface RoomUser {
  id: string;
  name: string;
  color: string;
  socketId: string;
}

/**
 * Full room state sent to a client on join.
 */
export interface RoomState {
  roomId: string;
  users: RoomUser[];
  operations: DrawingOperation[];
}

// ─── Client → Server events ──────────────────────────────────────────────────

export interface RoomJoinPayload {
  roomId: string;
  userName?: string;
}

export interface StrokeStartPayload {
  strokeId: string;
  tool: Tool;
  color: string;
  width: number;
  point: Point;
}

export interface StrokePointsPayload {
  strokeId: string;
  points: Point[];
}

export interface StrokeEndPayload {
  strokeId: string;
}

export interface CursorMovePayload {
  x: number;
  y: number;
}

// ─── Server → Client events ──────────────────────────────────────────────────

export interface UserJoinedPayload {
  user: RoomUser;
}

export interface UserLeftPayload {
  userId: string;
}

export interface RemoteStrokeStartPayload {
  strokeId: string;
  userId: string;
  tool: Tool;
  color: string;
  width: number;
  point: Point;
}

export interface RemoteStrokePointsPayload {
  strokeId: string;
  userId: string;
  points: Point[];
}

export interface RemoteStrokeEndPayload {
  strokeId: string;
  userId: string;
  sequence: number;
}

export interface CursorUpdatePayload {
  userId: string;
  x: number;
  y: number;
}

export interface HistoryUpdatedPayload {
  operations: DrawingOperation[];
}

export interface ServerErrorPayload {
  code: string;
  message: string;
}
