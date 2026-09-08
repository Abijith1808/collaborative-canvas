import { DrawingOperation, OperationStatus, Point, Tool } from "./protocol";
import { v4 as uuid } from "uuid";

/**
 * DrawingState manages the authoritative list of operations for one room.
 *
 * Design:
 * - Operations are never physically deleted; they are marked active/undone.
 * - The server assigns monotonically increasing sequence numbers so every
 *   client replays operations in the same deterministic order.
 * - Undo marks the latest active operation as "undone".
 * - Redo restores the most recently undone operation (LIFO within the undone set).
 */
export class DrawingState {
  private operations: DrawingOperation[] = [];
  private nextSequence = 1;

  /** Pending strokes: strokeId → partial operation (accumulating points) */
  private pendingStrokes: Map<string, DrawingOperation> = new Map();

  /**
   * Begin a new stroke. Returns the strokeId for reference.
   * The stroke is not added to the committed history until stroke:end.
   */
  startStroke(params: {
    strokeId: string;
    userId: string;
    tool: Tool;
    color: string;
    width: number;
    point: Point;
  }): void {
    const op: DrawingOperation = {
      id: params.strokeId,
      sequence: 0, // assigned at commit (stroke:end)
      userId: params.userId,
      type: "stroke",
      tool: params.tool,
      color: params.color,
      width: params.width,
      points: [params.point],
      status: "active",
      createdAt: Date.now(),
    };
    this.pendingStrokes.set(params.strokeId, op);
  }

  /**
   * Append points to a pending stroke.
   */
  addPoints(strokeId: string, points: Point[]): boolean {
    const stroke = this.pendingStrokes.get(strokeId);
    if (!stroke) return false;
    stroke.points.push(...points);
    return true;
  }

  /**
   * Finalise a pending stroke: assign sequence number, add to history.
   * Returns the committed operation or null if strokeId not found.
   */
  endStroke(strokeId: string): DrawingOperation | null {
    const stroke = this.pendingStrokes.get(strokeId);
    if (!stroke) return null;

    stroke.sequence = this.nextSequence++;
    this.operations.push(stroke);
    this.pendingStrokes.delete(strokeId);
    return stroke;
  }

  /**
   * Mark the latest active operation as undone.
   * Returns the updated operations list, or null if nothing to undo.
   */
  undo(): DrawingOperation[] | null {
    // Find the last active operation (highest sequence)
    for (let i = this.operations.length - 1; i >= 0; i--) {
      if (this.operations[i].status === "active") {
        this.operations[i].status = "undone";
        return this.getOperations();
      }
    }
    return null; // nothing to undo
  }

  /**
   * Restore the most recently undone operation.
   * "Most recently undone" = the undone operation with the highest sequence number.
   * Returns updated operations list or null if nothing to redo.
   */
  redo(): DrawingOperation[] | null {
    // Find the undone operation with the highest sequence number
    let candidate: DrawingOperation | null = null;
    for (const op of this.operations) {
      if (op.status === "undone") {
        if (!candidate || op.sequence > candidate.sequence) {
          candidate = op;
        }
      }
    }
    if (!candidate) return null;
    candidate.status = "active";
    return this.getOperations();
  }

  /**
   * Return a shallow copy of all committed operations.
   * Callers must not mutate the returned objects.
   */
  getOperations(): DrawingOperation[] {
    return [...this.operations];
  }

  /** Discard an incomplete pending stroke (e.g. on disconnect). */
  cancelPendingStroke(strokeId: string): void {
    this.pendingStrokes.delete(strokeId);
  }

  /** Cancel all pending strokes belonging to a user (on disconnect). */
  cancelUserStrokes(userId: string): void {
    for (const [id, op] of this.pendingStrokes) {
      if (op.userId === userId) this.pendingStrokes.delete(id);
    }
  }
}
