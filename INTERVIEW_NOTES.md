# Interview Notes — Collaborative Canvas

Concise answers to likely interview questions, based on the actual implementation.

---

## 1. Why did you choose Canvas API?

The Canvas API gives direct access to the GPU-accelerated 2D raster graphics pipeline. I needed:
- Per-pixel compositing for the eraser (`destination-out`)
- Sub-pixel anti-aliased curves via quadratic Bezier paths
- Full control over rendering order (important for deterministic replay)
- No overhead from a virtual scene graph (Fabric.js, Konva etc. add layers between you and the GPU)

Canvas is also what any interviewer expects for a drawing app — it demonstrates actual understanding of the API rather than "npm install drawing-library."

---

## 2. Why Socket.IO instead of native WebSockets?

Socket.IO gives three things that would take significant effort to build from scratch:
1. **Rooms** — built-in room concept maps directly to our use case
2. **Automatic reconnection** — exponential backoff, reconnect events, re-subscribe logic
3. **Transport fallback** — automatically falls back to HTTP long-polling if WebSocket is blocked (some corporate firewalls/proxies block WS)

The cost is ~50KB extra in the client bundle. For a collaborative app where real-time reliability is critical, that's a good trade.

---

## 3. How does real-time drawing work?

```
pointerdown → stroke:start emitted
pointermove → points buffered → every 16ms → stroke:points emitted
pointerup   → remaining points flushed → stroke:end emitted
```

On the remote client:
- `stroke:start` → create an in-progress stroke object
- `stroke:points` → append points; rAF redraws live layer
- `stroke:end` → commit to permanent canvas

The remote user sees strokes appear progressively, point-by-point, while the drawing user is still moving their pointer. This is the core real-time UX requirement.

---

## 4. Why don't you send the whole canvas?

Sending the canvas as a screenshot (PNG) on every `stroke:end` would:
- Be 50–500KB per message (vs a few bytes for points)
- Not support progressive rendering (you'd see nothing until the stroke finishes)
- Make undo/redo impossible (you can't "un-paint" a merged bitmap)

Operations are the source of truth. The canvas is just a rendering of those operations.

---

## 5. How do you reduce network traffic?

Two mechanisms:

**Point batching:** `pointermove` can fire at 240Hz. Instead of one WebSocket message per event, I buffer points in an array and flush them every 16ms via `setInterval`. This reduces message count by 4–16x depending on input device.

**Cursor throttle:** Cursor positions are sent at most every 50ms (20fps). Cursor updates don't need 60fps — human perception can't distinguish 20fps from 60fps for remote cursors.

---

## 6. How do remote cursors work?

1. On `pointermove`, if not throttled, client emits `cursor:move` with normalised `{x, y}` (0..1 range).
2. Server broadcasts `cursor:update` to all other room members.
3. Clients store cursor positions in Zustand state (`cursors` map: `userId → {x, y}`).
4. `RemoteCursors` component reads from Zustand and renders absolutely-positioned divs at `x * containerWidth, y * containerHeight`.

Normalised coordinates ensure cursors appear at the correct position regardless of each user's window size.

---

## 7. How does global undo work?

The server maintains an ordered list of `DrawingOperation` objects with `status: "active" | "undone"`.

On undo:
1. Server finds the operation with the highest sequence number where `status === "active"`.
2. Sets `status = "undone"`.
3. Broadcasts `history:updated` with the complete operation list to all room clients.
4. All clients clear their canvas and replay only `"active"` operations in sequence order.

The key insight: the canvas is not a bitmap with permanent pixels. It's a **rendering** of an operation log. Undo changes the log; replay regenerates the rendering.

---

## 8. What happens if User A undoes User B's drawing?

It depends on draw order. If User B's stroke is the most recent global operation, User A's undo will remove it. This is the documented semantics: **global undo** operates on the global timeline, not per-user timelines.

This can be surprising UX. The alternative would be per-user undo stacks — each user can only undo their own operations. That requires more complex server state (separate undo stacks per user). I documented this as a future improvement but implemented global undo as specified in the assignment.

---

## 9. How do you resolve simultaneous drawing?

The server processes Socket.IO events on a single-threaded Node.js event loop. Even if two clients send `stroke:end` at the same millisecond, they arrive sequentially at the server. The first gets sequence N, the second gets N+1.

All clients sort operations by sequence number before replaying, so they produce identical canvas state. The "winner" of the ordering is whoever's packet arrived first at the server — but both strokes are always visible. There is no data loss.

---

## 10. Why is the server authoritative?

If clients assigned their own sequence numbers, two clients could assign the same number (race condition), leading to different replay results on different clients (canvas divergence). The server's single event loop is the serialisation point that guarantees unique, ordered sequences.

This is the same reason databases have a single write master or use consensus protocols like Raft — distributed systems need a way to agree on "what happened first."

---

## 11. What happens if the client disconnects?

1. Socket.IO detects the disconnect and fires the `disconnect` event on the server.
2. Server calls `rooms.removeUser()`, which:
   - Cancels any pending (uncommitted) strokes from that user
   - Removes the user from the room user list
3. Server broadcasts `user:left` to remaining clients.
4. Other clients remove the user from their UI and discard their cursor.

The canvas is unaffected — all committed strokes remain in history.

---

## 12. How does reconnect work?

Socket.IO client has `reconnectionAttempts: 10` with exponential backoff. On each attempt:
- Client shows "Reconnecting..." in the connection status bar

On successful reconnect:
1. Socket fires `connect` event
2. Client handler re-emits `room:join` with the current roomId
3. Server responds with `room:state` (full authoritative state)
4. Client replays all operations onto a cleared canvas

The user's in-progress stroke (if any) is lost, but all committed history is restored.

---

## 13. How do you maintain performance?

**Local drawing:** Pointer events write to a ref-based buffer; `requestAnimationFrame` reads the buffer and renders. No React re-renders on pointermove.

**Two canvas layers:** The committed layer (full history) is only redrawn on undo/redo. The live layer (in-progress strokes) is cleared and redrawn every rAF. This avoids replaying the full history on every remote point batch.

**Point batching:** 16ms flush interval reduces WebSocket messages by 4–16x.

**DPR-aware:** Sharp on Retina displays without increasing drawing complexity.

---

## 14. How does devicePixelRatio affect Canvas?

A CSS 300×300 canvas on a 2x Retina display has 600×600 physical pixels. If you set `canvas.width = 300`, you get 1 canvas pixel per 4 physical pixels — blurry lines.

Fix:
```js
const dpr = window.devicePixelRatio;
canvas.width = cssWidth * dpr;   // physical pixel size
canvas.height = cssHeight * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale all drawing by dpr
```

Now `lineTo(100, 50)` draws at physical pixel (200, 100) on a 2x display — sharp.

---

## 15. Why shouldn't pointermove update React state?

`pointermove` fires at up to 240 events/second. Each React state update triggers a component re-render + virtual DOM diff + possible DOM update. At 240Hz, that's 240 renders/second — which would cause severe UI jank, especially on lower-end hardware.

Drawing state (current stroke points, live canvas) is kept in:
- Module-level variables (the renderer)
- `useRef` (canvas DOM refs, drawing flags)

React state only holds UI state that changes at human interaction speed: selected tool, color, brush width, user list, connection status.

---

## 16. How would you scale this to 1,000 users?

**Short term (100 users/room):** The current architecture can likely handle this — Node.js event loop is fast.

**For 1,000 users across many rooms:**
1. Multiple Node.js instances behind a load balancer with **sticky sessions** (required for Socket.IO polling fallback)
2. **Redis Adapter** (`@socket.io/redis-adapter`) for cross-instance room broadcasts
3. **Persist operations to PostgreSQL** so rooms survive server restarts and new instances can serve state

**For 1,000 users in one room:**
- Spatial partitioning: only broadcast strokes to clients whose viewport overlaps the drawing area
- Binary protocol (msgpack) to reduce bandwidth
- Server-side operation log compaction

---

## 17. What are the current limitations?

1. **No persistence** — drawings are lost on server restart
2. **Single server** — no horizontal scaling
3. **Global undo surprises** — undo can remove another user's stroke
4. **Full replay on undo** — O(n) in operation count
5. **No auth** — room ID is the only access control
6. **Mobile multi-touch** — no zoom/pan gestures
7. **No rate limiting** — malicious client could flood the server
8. **Room lifecycle** — empty rooms are GC'd; history is lost

---

## 18. What would you improve with another week?

1. **PostgreSQL persistence** — append-only operation log, room snapshots
2. **Per-user undo option** — as an alternative mode alongside global undo
3. **Canvas snapshotting** — PNG snapshot every 100 operations for fast reconnect
4. **Rate limiting** — protect against malicious clients
5. **Shape tools** — rectangle, circle, line with similar operation-based model
6. **Mobile zoom/pan** — pinch-to-zoom with canvas transform
7. **Better mobile UI** — floating toolbar for small screens
8. **E2E tests** — Playwright test suite for the multi-user scenarios

---

## 19. How would you add rectangle drawing?

The operation model already supports it — just add a new operation type:

```typescript
type DrawingOperation = 
  | { type: "stroke"; ... }
  | { type: "rect"; x: number; y: number; width: number; height: number; color: string; fill: boolean; ... }
```

The renderer's `replayToCanvas` would handle `type === "rect"` by calling `ctx.strokeRect()` or `ctx.fillRect()`. Undo/redo require no changes — they operate on the operation status, not the type.

For real-time sync, rectangles are simpler than strokes: `mousedown` sends `rect:start`, `mousemove` updates the preview on the live layer locally (no network needed until `mouseup`), `mouseup` commits the final rectangle via `rect:end`.

---

## 20. How would you persist drawings?

**Schema:**
```sql
CREATE TABLE operations (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  user_id TEXT,
  type TEXT,
  tool TEXT,
  color TEXT,
  width REAL,
  points JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON operations(room_id, sequence);
```

**On stroke:end:** `INSERT INTO operations ...`
**On undo/redo:** `UPDATE operations SET status = ... WHERE id = ...`
**On room:join:** `SELECT * FROM operations WHERE room_id = $1 ORDER BY sequence`

For large rooms, add snapshotting: periodically render the canvas to a PNG, store it in S3, and record a `snapshot_sequence`. New clients load the snapshot + only operations with `sequence > snapshot_sequence`.
