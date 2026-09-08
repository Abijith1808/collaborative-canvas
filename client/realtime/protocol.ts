/**
 * Client-side mirror of server/src/protocol.ts.
 * Keep in sync with the server definitions.
 */

export interface Point {
  x: number;
  y: number;
}

export type Tool = "brush" | "eraser";
export type OperationStatus = "active" | "undone";

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

export interface RoomUser {
  id: string;
  name: string;
  color: string;
  socketId: string;
}

export interface RoomState {
  roomId: string;
  users: RoomUser[];
  operations: DrawingOperation[];
}

// ─── Client → Server ──────────────────────────────────────────────────────────

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

// ─── Server → Client ──────────────────────────────────────────────────────────

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

/**
 * Typed map of all server → client events for use with socket.on().
 */
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "user:joined": (payload: UserJoinedPayload) => void;
  "user:left": (payload: UserLeftPayload) => void;
  "stroke:start": (payload: RemoteStrokeStartPayload) => void;
  "stroke:points": (payload: RemoteStrokePointsPayload) => void;
  "stroke:end": (payload: RemoteStrokeEndPayload) => void;
  "cursor:update": (payload: CursorUpdatePayload) => void;
  "history:updated": (payload: HistoryUpdatedPayload) => void;
  "server:error": (payload: ServerErrorPayload) => void;
}

/**
 * Typed map of all client → server events for use with socket.emit().
 */
export interface ClientToServerEvents {
  "room:join": (payload: RoomJoinPayload) => void;
  "stroke:start": (payload: StrokeStartPayload) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  "cursor:move": (payload: CursorMovePayload) => void;
  "history:undo": () => void;
  "history:redo": () => void;
}
