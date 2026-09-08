import { DrawingState } from "./drawing-state";
import { RoomUser, RoomState } from "./protocol";

interface Room {
  id: string;
  users: Map<string, RoomUser>;
  drawing: DrawingState;
}

/**
 * RoomManager holds all active rooms in memory.
 * Rooms are created on first join and destroyed when empty.
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  private getOrCreate(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { id: roomId, users: new Map(), drawing: new DrawingState() };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  addUser(roomId: string, user: RoomUser): void {
    const room = this.getOrCreate(roomId);
    room.users.set(user.id, user);
  }

  removeUser(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.drawing.cancelUserStrokes(userId);
    room.users.delete(userId);
    // Prune empty rooms
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  getDrawing(roomId: string): DrawingState | null {
    return this.rooms.get(roomId)?.drawing ?? null;
  }

  getUsers(roomId: string): RoomUser[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.users.values()) : [];
  }

  getUser(roomId: string, userId: string): RoomUser | undefined {
    return this.rooms.get(roomId)?.users.get(userId);
  }

  getRoomState(roomId: string): RoomState {
    const room = this.rooms.get(roomId);
    if (!room) return { roomId, users: [], operations: [] };
    return {
      roomId,
      users: Array.from(room.users.values()),
      operations: room.drawing.getOperations(),
    };
  }
}
