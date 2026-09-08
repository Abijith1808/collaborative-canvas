import { create } from "zustand";
import type { DrawingOperation, RoomUser, Tool } from "@/realtime/protocol";

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
}

/**
 * UI-level state managed by Zustand.
 *
 * HIGH-FREQUENCY data (active pointer positions, in-progress stroke points)
 * is intentionally NOT stored here — it lives in canvas refs to avoid
 * triggering React re-renders on every pointermove event.
 */
interface CanvasStore {
  // Room
  roomId: string;
  setRoomId: (id: string) => void;

  // Self
  currentUserId: string;
  setCurrentUser: (id: string) => void;

  // Users
  users: RoomUser[];
  setUsers: (users: RoomUser[]) => void;
  addUser: (user: RoomUser) => void;
  removeUser: (userId: string) => void;
  getUserColor: (userId: string) => string;

  // Remote cursors (updated via socket, displayed as overlay)
  cursors: Record<string, CursorPosition>;
  updateCursor: (userId: string, x: number, y: number) => void;
  removeCursor: (userId: string) => void;

  // Operation history (committed operations from server)
  operations: DrawingOperation[];
  setOperations: (ops: DrawingOperation[]) => void;

  // Active tool settings
  tool: Tool;
  setTool: (tool: Tool) => void;
  color: string;
  setColor: (color: string) => void;
  brushWidth: number;
  setBrushWidth: (w: number) => void;

  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Metrics (optional debug panel)
  fps: number;
  setFps: (fps: number) => void;
  latency: number;
  setLatency: (ms: number) => void;

  // Reset (on room unmount)
  reset: () => void;
}

const DEFAULT_COLOR = "#e63946";
const DEFAULT_WIDTH = 4;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // Room
  roomId: "",
  setRoomId: (id) => set({ roomId: id }),

  // Self
  currentUserId: "",
  setCurrentUser: (id) => set({ currentUserId: id }),

  // Users
  users: [],
  setUsers: (users) => set({ users }),
  addUser: (user) =>
    set((s) => ({
      users: s.users.find((u) => u.id === user.id)
        ? s.users
        : [...s.users, user],
    })),
  removeUser: (userId) =>
    set((s) => ({ users: s.users.filter((u) => u.id !== userId) })),
  getUserColor: (userId) =>
    get().users.find((u) => u.id === userId)?.color ?? "#aaaaaa",

  // Cursors
  cursors: {},
  updateCursor: (userId, x, y) =>
    set((s) => ({ cursors: { ...s.cursors, [userId]: { userId, x, y } } })),
  removeCursor: (userId) =>
    set((s) => {
      const next = { ...s.cursors };
      delete next[userId];
      return { cursors: next };
    }),

  // Operations
  operations: [],
  setOperations: (operations) => set({ operations }),

  // Tool settings
  tool: "brush",
  setTool: (tool) => set({ tool }),
  color: DEFAULT_COLOR,
  setColor: (color) => set({ color }),
  brushWidth: DEFAULT_WIDTH,
  setBrushWidth: (brushWidth) => set({ brushWidth }),

  // Connection
  connectionStatus: "disconnected",
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  // Metrics
  fps: 0,
  setFps: (fps) => set({ fps }),
  latency: 0,
  setLatency: (latency) => set({ latency }),

  // Reset
  reset: () =>
    set({
      users: [],
      cursors: {},
      operations: [],
      connectionStatus: "disconnected",
      fps: 0,
      latency: 0,
    }),
}));
