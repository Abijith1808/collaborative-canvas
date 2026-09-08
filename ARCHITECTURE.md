# Architecture — Collaborative Canvas

## 1. System Overview

Collaborative Canvas is a real-time multi-user drawing application using a client-server WebSocket architecture. The server is **authoritative** for shared state: it assigns sequence numbers, manages undo/redo, and broadcasts operations to all clients in a room.

---

## 2. Architecture Diagram

```
Browser A                   Browser B                   Browser C
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  React UI            │    │  React UI            │    │  React UI            │
│  ┌────────────────┐  │    │  ┌────────────────┐  │    │  ┌────────────────┐  │
│  │  Canvas Engine │  │    │  │  Canvas Engine │  │    │  │  Canvas Engine │  │
│  │  (2 layers)    │  │    │  │  (2 layers)    │  │    │  │  (2 layers)    │  │
│  └───────┬────────┘  │    │  └───────┬────────┘  │    │  └───────┬────────┘  │
│  ┌───────▼────────┐  │    │  ┌───────▼────────┐  │    │  ┌───────▼────────┐  │
│  │ Socket.IO Clnt │  │    │  │ Socket.IO Clnt │  │    │  │ Socket.IO Clnt │  │
│  └───────┬────────┘  │    │  └───────┬────────┘  │    │  └───────┬────────┘  │
└──────────┼───────────┘    └──────────┼───────────┘    └──────────┼───────────┘
           │  WebSocket                │  WebSocket                │  WebSocket
           └───────────────────────────┼───────────────────────────┘
                                       │
                         ┌─────────────▼──────────────┐
                         │   Node.js + Socket.IO       │
                         │   ┌─────────────────────┐   │
                         │   │    Room Manager      │   │
                         │   │  ┌───────────────┐  │   │
                         │   │  │ User Manager  │  │   │
                         │   │  └───────────────┘  │   │
                         │   │  ┌───────────────┐  │   │
                         │   │  │Drawing State  │  │   │
                         │   │  │(Operation Log)│  │   │
                         │   │  └───────────────┘  │   │
                         │   └─────────────────────┘   │
                         └─────────────────────────────┘
```

---

## 3. Data Flow

### Local Drawing → Remote Sync

```
pointerdown event
       │
       ▼
beginLocalStroke()          ← render locally immediately (zero latency)
       │
       ├─── socket.emit("stroke:start", { strokeId, tool, color, width, normPoint })
       │
pointermove event (every few ms)
       │
       ▼
appendLocalPoints()         ← render locally via rAF (smooth)
pointBuffer.push(normPoint)
       │
       ├─── (every 16ms) flushPoints()
       │         │
       │         └─── socket.emit("stroke:points", { strokeId, normPoints[] })
       │
pointerup event
       │
       ▼
commitLocalStroke()         ← draw to committed canvas layer
flushPoints()               ← flush remaining buffer
       │
       └─── socket.emit("stroke:end", { strokeId })
```

### Server Processing

```
stroke:start received
       │
       ▼
Validate payload
       │
       ▼
drawing.startStroke()       ← add to pendingStrokes
       │
       ▼
socket.to(room).emit("stroke:start", ...)  ← broadcast to others

stroke:points received
       │
       ▼
drawing.addPoints()         ← accumulate in pendingStroke
       │
       ▼
socket.to(room).emit("stroke:points", ...)

stroke:end received
       │
       ▼
drawing.endStroke()         ← assign sequence number, move to committed history
       │
       ▼
socket.to(room).emit("stroke:end", { sequence })
```

### Remote Client Rendering

```
stroke:start received
       │
       ▼
startRemoteStroke()         ← create in-progress remote stroke

stroke:points received
       │
       ▼
appendRemotePoints()        ← add normalised points to remote stroke

rAF tick
       │
       ▼
liveCtx.clearRect()
denorm(remoteStroke.points) ← convert [0,1] → CSS px
drawSmoothStroke()          ← render on live canvas layer

stroke:end received
       │
       ▼
drawSmoothStroke()          ← draw to committed layer
delete remoteStroke
```

---

## 4. WebSocket Protocol

### Client → Server Events

#### `room:join`
- **Purpose:** Join or create a room
- **Payload:** `{ roomId: string, userName?: string }`
- **Validation:** roomId must be 1–64 alphanumeric/hyphen/underscore characters
- **Response:** Server sends `room:state` to the joining client; `user:joined` to others

#### `stroke:start`
- **Purpose:** Begin a new stroke
- **Payload:** `{ strokeId: string, tool: "brush"|"eraser", color: "#RRGGBB", width: number, point: { x, y } }`
- **Validation:** color must match `#RGB|#RRGGBB`, width in [1,100], coordinates finite, strokeId non-empty string
- **Notes:** point is normalised [0,1]; strokeId is a UUID generated client-side

#### `stroke:points`
- **Purpose:** Send batched points accumulated during drawing
- **Payload:** `{ strokeId: string, points: Point[] }`
- **Validation:** 1–500 points per batch, each coordinate finite
- **Notes:** Points are normalised [0,1]; batched every 16ms via setInterval

#### `stroke:end`
- **Purpose:** Finalise a stroke; server assigns authoritative sequence number
- **Payload:** `{ strokeId: string }`

#### `cursor:move`
- **Purpose:** Update cursor position for display on remote clients
- **Payload:** `{ x: number, y: number }` — normalised [0,1]
- **Notes:** Throttled to 50ms (20fps) client-side; server does NOT store cursor state

#### `history:undo`
- **Purpose:** Request global undo (mark latest active operation as undone)
- **Payload:** `{}`

#### `history:redo`
- **Purpose:** Request global redo (restore latest undone operation)
- **Payload:** `{}`

---

### Server → Client Events

#### `room:state`
- **Purpose:** Full authoritative room state; sent on join and reconnect
- **Payload:** `{ roomId, users: User[], operations: DrawingOperation[] }`
- **Receiver:** Joining client only
- **Client behaviour:** Sets user list, replays all active operations onto canvas

#### `user:joined`
- **Purpose:** Notify room of new participant
- **Payload:** `{ user: { id, name, color, socketId } }`
- **Receiver:** All other clients in room

#### `user:left`
- **Purpose:** Notify room of departed participant
- **Payload:** `{ userId: string }`
- **Receiver:** All remaining clients in room
- **Client behaviour:** Remove user from list, remove cursor

#### `stroke:start`
- **Payload:** `{ strokeId, userId, tool, color, width, point }`
- **Receiver:** All other clients in room (sender renders locally)

#### `stroke:points`
- **Payload:** `{ strokeId, userId, points[] }`
- **Receiver:** All other clients in room

#### `stroke:end`
- **Payload:** `{ strokeId, userId, sequence }`
- **Receiver:** All other clients in room

#### `cursor:update`
- **Payload:** `{ userId, x, y }` — normalised [0,1]
- **Receiver:** All other clients in room

#### `history:updated`
- **Purpose:** Broadcast full operation list after any undo or redo
- **Payload:** `{ operations: DrawingOperation[] }`
- **Receiver:** **ALL** clients in room (including the one who requested undo/redo)
- **Client behaviour:** Clear canvas, replay all active operations

#### `server:error`
- **Payload:** `{ code: string, message: string }`
- **Receiver:** The socket that sent the invalid payload

---

## 5. State Model

### DrawingOperation

```typescript
interface DrawingOperation {
  id: string;            // UUID (client-generated)
  sequence: number;      // Server-assigned, monotonically increasing
  userId: string;        // Socket ID of the drawing user
  type: "stroke";
  tool: "brush" | "eraser";
  color: string;         // "#RRGGBB"
  width: number;         // CSS pixels
  points: Point[];       // Normalised [0,1] coordinates
  status: "active" | "undone";
  createdAt: number;     // Unix timestamp ms
}
```

### Coordinate Convention

All points stored in the operation history and sent on the wire use **normalised coordinates** (x ∈ [0,1], y ∈ [0,1] relative to canvas CSS dimensions). This ensures stored operations remain correct after window resize without requiring re-transmission.

### Room State

```typescript
interface Room {
  id: string;
  users: Map<string, RoomUser>;     // socketId → user
  drawing: DrawingState;
}
```

---

## 6. Undo / Redo Strategy

### Invariants

- There is a single global operation history per room.
- Operations are **never deleted** — only their `status` changes.
- Status is either `"active"` (visible on canvas) or `"undone"` (hidden).

### Undo

1. Find the operation with the highest sequence number that has `status === "active"`.
2. Set its status to `"undone"`.
3. Broadcast `history:updated` with the full operation list.
4. All clients replay the canvas from scratch using only `"active"` operations.

### Redo

1. Find the operation with the highest sequence number that has `status === "undone"`.
2. Set its status to `"active"`.
3. Broadcast `history:updated`.
4. All clients replay.

### Semantic Implications

- Undo is **global** — it undoes the most recent operation across all users.
- If User A undoes, they might undo User B's stroke (if B drew after A).
- This is intentional and documented: the assignment explicitly requires global undo.
- An alternative (per-user undo stacks) would require different history semantics and is noted as a future improvement.

### Canvas Replay

After undo/redo, the committed canvas is fully cleared and rebuilt:

```
operations (sorted by sequence)
     │
     ▼
filter: status === "active"
     │
     ▼
for each operation:
  denorm(points) → logical px
  drawSmoothStroke(ctx, points, ...)
```

This O(n) replay is acceptable for typical session lengths. For long sessions (1000+ strokes), periodic snapshotting would reduce replay time.

---

## 7. Conflict Resolution

### Mechanism

The server assigns monotonically increasing sequence numbers at `stroke:end` time (when the stroke is committed). This is the key invariant:

> **No two committed operations share the same sequence number.**

Even if two clients send `stroke:end` simultaneously, they are processed sequentially by the Node.js event loop. The first to arrive gets sequence N, the second gets N+1.

### Determinism

All clients replay using:
```
sort(operations, by: sequence ASC)
```

Because every client has the same sorted list and applies operations in the same order, the final canvas state is **identical on all clients** regardless of local network timing.

### Overlapping Strokes

Overlapping strokes are not errors — they are treated as normal sequential operations. If User A's red stroke gets seq 100 and User B's blue stroke gets seq 101, the replay always renders 100 before 101, so blue paints over red. This is deterministic and matches what a user would expect from "draw order."

---

## 8. Performance Decisions

### Two-Layer Canvas

The canvas is split into:
- **Committed layer** — stable; only redrawn on undo/redo/reconnect
- **Live layer** — cleared and redrawn every rAF tick; shows in-progress strokes

This avoids replaying the full history on every `stroke:points` batch from a remote user.

### requestAnimationFrame

The live layer render loop runs inside `requestAnimationFrame`. Pointer events write to a buffer; the rAF callback reads the buffer and renders. This decouples the input rate (potentially 240Hz on modern devices) from the render rate (60Hz) and avoids redundant clears.

### Point Batching

`pointermove` events fire at up to 240Hz. Sending one WebSocket message per event would saturate the network. Instead:

- Points are accumulated in a buffer array.
- A `setInterval` at 16ms (≈60fps) flushes the buffer via `socket.emit("stroke:points", ...)`.
- This reduces message count by ~4x on a 60Hz display and ~16x on a 240Hz display.

### Cursor Throttle

Cursor positions are sent at most every 50ms (20fps) via a timestamp comparison. Cursor updates do not affect drawing quality so a lower frequency is acceptable.

### No React State for Drawing

Pointer coordinates and in-progress stroke points are kept in module-level variables and `useRef` — not in React state. This is critical: putting `pointermove` data into React state would trigger a re-render on every pointer event (potentially hundreds per second), causing the UI to jank.

React state only holds: selected tool, color, width, user list, connection status.

### DPR-Aware Canvas

```
canvas.width  = Math.round(element.offsetWidth  * devicePixelRatio)
canvas.height = Math.round(element.offsetHeight * devicePixelRatio)
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
```

Drawing commands then use CSS pixel values (e.g. `lineTo(100, 50)`) and the context transform scales them automatically to physical pixels. This produces sharp lines on Retina displays without any changes to drawing code.

### Smooth Strokes

Strokes use quadratic Bezier curves through midpoints rather than plain `lineTo`. This eliminates visible corners at low frame rates and produces strokes that look hand-drawn rather than polygonal. The algorithm:

```
moveTo(points[0])
for i in 1..n-2:
  mid = midpoint(points[i], points[i+1])
  quadraticCurveTo(points[i], mid)
lineTo(points[n-1])
```

---

## 9. Reconnection Strategy

1. Socket.IO is configured with `reconnectionAttempts: 10` and exponential backoff.
2. On `reconnect_attempt`, the client sets `connectionStatus = "reconnecting"` (shown in UI).
3. On `connect` (which fires after a successful reconnect), the client re-emits `room:join`.
4. The server responds with `room:state` containing the authoritative operation history.
5. The client calls `replayOperations()` to rebuild the canvas from the server state.
6. Any in-progress stroke that was interrupted by the disconnect is discarded — the server already cleaned it up via `cancelUserStrokes()` on disconnect.

The user sees: `Reconnecting...` → `Connected` with their drawing restored.

---

## 10. Scaling Discussion

The current implementation is a single-server prototype. It can handle tens of concurrent users per room comfortably. Here is how it could evolve:

### Current Limitations

- All room state is in-memory on one process.
- One Socket.IO server means one Node.js process.
- No persistence — restarting the server loses all drawings.

### Horizontal Scaling

To run multiple server instances behind a load balancer:

```
Clients
   │
Load Balancer (e.g. nginx / AWS ALB)
   │   (sticky sessions required for Socket.IO)
   ├── Server A
   ├── Server B
   └── Server C
         │
    Redis Pub/Sub  ←──── shared event bus
         │
   Shared state layer (Redis or DB)
```

**Sticky sessions** are required because Socket.IO's HTTP polling fallback needs multiple requests from the same client to hit the same server. WebSocket connections are inherently sticky (single TCP connection).

**Redis Adapter** (`@socket.io/redis-adapter`) lets Socket.IO broadcast to rooms across multiple server instances. Events published by Server A are delivered to Server B's clients via Redis.

### Room Sharding

For very high scale:
- Assign each room to a specific server based on roomId hash.
- Route room:join requests to the correct shard.
- Eliminates cross-server broadcasts for most operations.

### Persistence

- Store operations in PostgreSQL (append-only log table indexed by roomId + sequence).
- On room:join, read historical operations from DB, not in-memory.
- Rooms can survive server restarts and be opened days later.

### Snapshotting

- After N operations, render the committed canvas to a PNG and store it.
- New clients load the snapshot + only the operations since the snapshot.
- Reduces replay time from O(all operations) to O(operations since last snapshot).

### Rate Limiting

- Limit `stroke:points` batches per client per second (e.g. max 120 batches/sec = ~1 every 8ms).
- Reject `stroke:start` if a client already has too many pending strokes.
- Prevents malicious or buggy clients from flooding the server.

### Backpressure

- Monitor Socket.IO's `socket.conn.bufferedAmount`.
- If a client's outbound buffer is full, throttle incoming `stroke:points` events for that room.

### Large Room Strategies

For rooms with 100+ users:
- Send stroke:points only to clients within a viewport of the drawing area (spatial partitioning).
- Use binary protocol (e.g. `msgpack`) instead of JSON to reduce payload size.
- Compact the operation log by merging sequential same-user strokes.

---

## 11. Trade-offs

| Decision | Trade-off |
|---|---|
| Global undo (vs per-user) | Simpler server logic, surprising UX (undoing another user's work) |
| In-memory state (vs DB) | Fast, simple, no persistence across restarts |
| Full replay on undo (vs delta) | Simple, correct, O(n) cost per undo |
| JSON protocol (vs binary) | Human-readable, debuggable, ~2-3x larger than binary |
| Socket.IO (vs raw WS) | Reconnect/room support built-in, adds ~50KB client bundle |
| Normalised coordinates | Correct after resize; requires denorm on every draw call |
| No auth | Simpler, acceptable for a prototype/demo |
| Two canvas layers | Avoids full replay on remote stroke updates; extra compositing cost |

### What Was Intentionally NOT Implemented

- **Database persistence** — not required for the prototype; adds significant complexity
- **Per-user undo** — assignment explicitly requires global undo
- **Auth/access control** — not in scope
- **Zoom/pan** — outside core drawing requirements
- **Shape tools** — kept out to focus on core real-time collaboration
- **Binary protocol** — JSON is debuggable and fast enough for this scale
- **Canvas snapshotting** — unnecessary for typical demo-scale operation counts
- **Rate limiting** — should be added before production exposure to the internet
