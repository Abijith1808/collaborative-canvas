# Collaborative Canvas

A real-time collaborative drawing application where multiple users can draw simultaneously on a shared canvas. Built as a technical R&D assignment for FLAM AI.

## Repository & Live Demo

- **GitHub Repository:** https://github.com/Abijith1808/collaborative-canvas
- **Frontend Demo:** https://collaborative-canvas-flam.vercel.app  
- **Backend API:** https://collaborative-canvas-1-pyzq.onrender.com

---

## Features

- **Real-time drawing sync** — see other users' strokes appear progressively while they draw (not just after they finish)
- **Brush tool** — selectable color, adjustable width, smooth quadratic-bezier strokes
- **Eraser tool** — uses Canvas `destination-out` compositing; erases are replayable operations
- **Remote cursors** — see other users' cursor positions labeled with their name and color
- **Online user list** — shows all connected users with their unique assigned colors
- **Global undo / redo** — undoes the latest operation across *all* users, not just the local user
- **Room system** — join any room via URL (`/room/<id>`), share with others
- **Reconnect handling** — automatically rejoins room and syncs canvas state on reconnect
- **Keyboard shortcuts** — `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo, `B` brush, `E` eraser
- **DPR-aware canvas** — sharp rendering on Retina/HiDPI displays
- **Responsive** — works on desktop, laptop, and tablet

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Canvas | Raw HTML Canvas API (no drawing libraries) |
| State management | Zustand (UI state only) |
| Real-time client | Socket.IO Client v4 |
| Backend | Node.js + Express |
| Real-time server | Socket.IO Server v4 |
| Frontend deployment | Vercel |
| Backend deployment | Render |

---

## Architecture Overview

```
Browser A              Browser B
   |                      |
Canvas Engine          Canvas Engine
   |                      |
Socket.IO Client       Socket.IO Client
         \               /
          \             /
        WebSocket (Socket.IO)
                |
        Node.js Server
                |
        ┌───────┴───────┐
        │               │
    Room Manager   User Manager
        │
  Drawing State
  (Operation History + Undo/Redo)
```

- **Client** renders locally immediately for zero-latency feel.
- **Server** is authoritative: assigns sequence numbers, manages undo/redo.
- **Operations** are never deleted — `status: "active" | "undone"` determines visibility.
- Full **ARCHITECTURE.md** covers every decision in detail.

---

## Local Setup

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
git clone <repo-url>
cd collaborative-canvas
npm install --workspace=server
npm install --workspace=client
```

### Run (development)

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
# Server starts on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
# Frontend starts on http://localhost:3000
```

Then open http://localhost:3000, create a room, and open the same room URL in another tab or browser.

---

## Environment Variables

### Client (`client/.env.local`)

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_SOCKET_URL` | Backend WebSocket server URL | `http://localhost:3001` |

### Server (environment / `.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3001` |
| `CLIENT_ORIGIN` | Allowed CORS origin | `*` |

---

## How to Test Multiple Users

1. Start both server and client locally (see above).
2. Open `http://localhost:3000` in Chrome.
3. Create a room — you'll be redirected to `/room/<id>`.
4. Copy the URL.
5. Open the same URL in Firefox (or another Chrome window).
6. Both tabs should show each other in the **Online** panel.
7. Draw in one tab — strokes should appear progressively in the other tab.
8. Press `Ctrl+Z` in either tab — the latest global operation disappears from **both** tabs.

---

## WebSocket Behavior

### Events (Client → Server)

| Event | Payload | Purpose |
|---|---|---|
| `room:join` | `{ roomId, userName? }` | Join or create a room |
| `stroke:start` | `{ strokeId, tool, color, width, point }` | Begin a new stroke |
| `stroke:points` | `{ strokeId, points[] }` | Send batched points during drawing |
| `stroke:end` | `{ strokeId }` | Finalise and commit the stroke |
| `cursor:move` | `{ x, y }` | Update cursor position (normalised [0,1]) |
| `history:undo` | `{}` | Request global undo |
| `history:redo` | `{}` | Request global redo |

### Events (Server → Client)

| Event | Payload | Purpose |
|---|---|---|
| `room:state` | Full room state | Sent on join/reconnect |
| `user:joined` | `{ user }` | New user connected |
| `user:left` | `{ userId }` | User disconnected |
| `stroke:start` | Remote stroke start payload | Broadcast to room |
| `stroke:points` | Remote stroke points | Broadcast to room |
| `stroke:end` | `{ strokeId, userId, sequence }` | Stroke committed |
| `cursor:update` | `{ userId, x, y }` | Cursor position broadcast |
| `history:updated` | `{ operations[] }` | Full history after undo/redo |
| `server:error` | `{ code, message }` | Validation/server error |

---

## Undo / Redo Behavior

Global undo/redo is **server-authoritative**:

1. Operations are stored in a single ordered list sorted by sequence number.
2. **Undo**: marks the latest `active` operation as `undone` (regardless of who drew it).
3. **Redo**: restores the `undone` operation with the highest sequence number.
4. After undo/redo, the server broadcasts `history:updated` with the complete operation list.
5. **All** connected clients clear their canvas and replay from the authoritative history.

This means if User A undoes, User B's latest stroke might be removed — that's intentional global undo behaviour.

---

## Conflict Resolution

Simultaneous strokes are handled by server-assigned sequence numbers:

- The server uses a monotonically incrementing counter (`nextSequence`).
- Even if two clients send `stroke:end` at the same millisecond, they receive different sequence numbers.
- Canvas replay always sorts by sequence, producing **deterministic and identical** results on all clients.

---

## Performance Decisions

| Decision | Rationale |
|---|---|
| `requestAnimationFrame` for live layer | Decouples pointer event rate from render rate |
| 16ms point batching (stroke:points) | ~60fps network updates without per-event messages |
| 50ms cursor throttle | Cursors don't need 60fps; 20fps is smooth enough |
| No React state for drawing | Avoids re-renders on every pointermove |
| Two canvas layers | Avoids full replay on every remote point batch |
| Normalised coordinates on wire | Coordinates remain correct after resize without re-sending |

---

## Known Limitations

1. **No persistence** — canvas state is in-memory; restarting the server loses all drawings.
2. **Single server** — no horizontal scaling or Redis pub/sub for multi-instance deployments.
3. **No auth** — room IDs are the only access control.
4. **Full replay on undo** — replaying all operations is O(n) in stroke count. For very large sessions, snapshotting would help.
5. **Mobile touch** — basic touch support via `pointerEvents`; multi-touch gestures (zoom/pan) not implemented.
6. **No room persistence** — empty rooms are garbage collected; returning to an empty room loses history.

---

## Future Improvements

- Persist drawings to a database (PostgreSQL + operation log)
- Canvas snapshotting every N operations to speed up replay
- Redis pub/sub for horizontal scaling
- Per-user undo (separate user undo stacks as an alternative mode)
- Zoom and pan
- Shape tools (rectangle, circle, line)
- Image upload / paste
- Export canvas as PNG/SVG
- Auth and named rooms

---

## Deployment Details

### Frontend (Vercel)
```bash
cd client
npm run build   # verify locally first
# Push to GitHub → connect Vercel → set NEXT_PUBLIC_SOCKET_URL env var
```

### Backend (Render)
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `PORT`, `CLIENT_ORIGIN`
- WebSockets: supported natively (no proxy config needed)

---

## Time Spent

| Phase | Time |
|---|---|
| Architecture & planning | 1h |
| Canvas engine (local drawing) | 2h |
| Socket.IO server | 1.5h |
| Real-time sync + cursors | 2h |
| Undo/redo implementation | 1.5h |
| Room system | 1h |
| UI polish & responsive | 1.5h |
| Documentation | 1.5h |
| Testing & debugging | 2h |
| **Total** | **~14h** |
