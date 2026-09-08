import { RoomUser } from "./protocol";

// User colors assigned round-robin for visual distinction.
const USER_COLORS = [
  "#E63946", // red
  "#2196F3", // blue
  "#4CAF50", // green
  "#FF9800", // orange
  "#9C27B0", // purple
  "#00BCD4", // cyan
  "#FF5722", // deep orange
  "#795548", // brown
  "#607D8B", // blue grey
  "#F06292", // pink
];

let colorIndex = 0;
let userCounter = 0;

/**
 * Create a new user object for a socket connection.
 */
export function createUser(socketId: string, preferredName?: string): RoomUser {
  const idx = colorIndex % USER_COLORS.length;
  colorIndex++;
  userCounter++;

  return {
    id: socketId, // using socketId as userId for simplicity
    name: preferredName?.trim().slice(0, 24) || `Artist ${userCounter}`,
    color: USER_COLORS[idx],
    socketId,
  };
}
