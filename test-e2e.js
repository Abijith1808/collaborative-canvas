/**
 * Smoke test: simulates two clients joining the same room,
 * one drawing a stroke, and verifies the other receives it in real time.
 * Also tests undo/redo and room isolation.
 *
 * Run: node test-e2e.js
 */

const { io } = require("./client/node_modules/socket.io-client");

const SERVER = "http://localhost:3001";
const ROOM_A = "test-room-alpha";
const ROOM_B = "test-room-beta";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function connect() {
  return io(SERVER, { transports: ["websocket"], timeout: 5000 });
}

/** Connect a socket and wait for it to be ready */
function connectAndWait() {
  return new Promise((resolve, reject) => {
    const s = connect();
    const timer = setTimeout(() => reject(new Error("connect timeout")), 5000);
    s.once("connect", () => { clearTimeout(timer); resolve(s); });
    s.once("connect_error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Join a room and wait for room:state */
function joinRoom(socket, roomId, userName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("room:state timeout")), 5000);
    socket.once("room:state", (state) => { clearTimeout(timer); resolve(state); });
    socket.emit("room:join", { roomId, userName });
  });
}

/** Wait for an event with a timeout */
function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("\n=== Collaborative Canvas — Smoke Tests ===\n");

  // ── Test 1: Server health ────────────────────────────────────────────────
  console.log("TEST 1: Server connectivity");
  let s1;
  try {
    s1 = await connectAndWait();
    assert(s1.connected, "Socket connects to server");
  } catch (e) {
    assert(false, `Socket connects to server (${e.message})`);
    console.error("Cannot connect to server. Is it running on port 3001?");
    process.exit(1);
  }

  // ── Test 2: Room join + state ────────────────────────────────────────────
  console.log("\nTEST 2: Room join receives room state");
  const state1 = await joinRoom(s1, ROOM_A, "Artist Alpha");
  assert(state1.roomId === ROOM_A, "room:state received with correct roomId");
  assert(Array.isArray(state1.users), "room:state includes users array");
  assert(Array.isArray(state1.operations), "room:state includes operations array");

  // ── Test 3: Second client joins ──────────────────────────────────────────
  console.log("\nTEST 3: Second client joins and sees user:joined event");
  const s2 = await connectAndWait();

  // Register listener on s1 BEFORE s2 joins
  const userJoinedP = waitFor(s1, "user:joined");
  const state2 = await joinRoom(s2, ROOM_A, "Artist Beta");
  const userJoined = await userJoinedP;

  assert(!!userJoined, "s1 receives user:joined event");
  assert(userJoined?.user?.name === "Artist Beta", "user:joined has correct name");
  assert(state2.users.length >= 2, "s2 room:state shows both users");

  // ── Test 4: Real-time stroke sync ────────────────────────────────────────
  console.log("\nTEST 4: Stroke broadcasts in real time");
  const strokeId = "test-stroke-001";

  const strokeStartP = waitFor(s2, "stroke:start");
  s1.emit("stroke:start", {
    strokeId,
    tool: "brush",
    color: "#e63946",
    width: 4,
    point: { x: 0.1, y: 0.1 },
  });
  const sStart = await strokeStartP;
  assert(sStart?.strokeId === strokeId, "s2 receives stroke:start");
  assert(sStart?.color === "#e63946", "stroke:start has correct color");

  const strokePointsP = waitFor(s2, "stroke:points");
  s1.emit("stroke:points", {
    strokeId,
    points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }],
  });
  const sPoints = await strokePointsP;
  assert(Array.isArray(sPoints?.points), "s2 receives stroke:points");
  assert(sPoints?.points?.length === 2, "stroke:points has correct point count");

  const strokeEndP = waitFor(s2, "stroke:end");
  s1.emit("stroke:end", { strokeId });
  const sEnd = await strokeEndP;
  assert(sEnd?.strokeId === strokeId, "s2 receives stroke:end");
  assert(typeof sEnd?.sequence === "number", "stroke:end includes server sequence");

  // ── Test 5: Global undo ──────────────────────────────────────────────────
  console.log("\nTEST 5: Global undo propagates to all clients");
  const s1UndoP = waitFor(s1, "history:updated");
  const s2UndoP = waitFor(s2, "history:updated");
  s1.emit("history:undo");
  const [undoS1, undoS2] = await Promise.all([s1UndoP, s2UndoP]);

  assert(Array.isArray(undoS1?.operations), "s1 receives history:updated on undo");
  assert(Array.isArray(undoS2?.operations), "s2 receives history:updated on undo");
  const undoneOp = undoS1?.operations?.find((o) => o.id === strokeId);
  assert(undoneOp?.status === "undone", "undone operation has status 'undone'");

  // ── Test 6: Global redo ──────────────────────────────────────────────────
  console.log("\nTEST 6: Global redo propagates to all clients");
  const s1RedoP = waitFor(s1, "history:updated");
  const s2RedoP = waitFor(s2, "history:updated");
  s1.emit("history:redo");
  const [redoS1, redoS2] = await Promise.all([s1RedoP, s2RedoP]);

  const redoneOp = redoS1?.operations?.find((o) => o.id === strokeId);
  assert(redoneOp?.status === "active", "redone operation has status 'active'");
  assert(Array.isArray(redoS2?.operations), "s2 receives history:updated on redo");

  // ── Test 7: Disconnect notification ─────────────────────────────────────
  console.log("\nTEST 7: Disconnect removes user from room");
  const s2Id = s2.id;
  const userLeftP = waitFor(s1, "user:left");
  s2.disconnect();
  const userLeft = await userLeftP;
  assert(userLeft?.userId === s2Id, "s1 receives user:left when s2 disconnects");

  // ── Test 8: Room isolation ───────────────────────────────────────────────
  console.log("\nTEST 8: Room isolation (different rooms don't bleed)");
  const s3 = await connectAndWait();
  const s4 = await connectAndWait();

  await joinRoom(s3, ROOM_A);
  await joinRoom(s4, ROOM_B);

  let s4GotStroke = false;
  s4.once("stroke:start", () => { s4GotStroke = true; });

  s3.emit("stroke:start", {
    strokeId: "isolation-test",
    tool: "brush",
    color: "#0000ff",
    width: 2,
    point: { x: 0.5, y: 0.5 },
  });

  await delay(500);
  assert(!s4GotStroke, "s4 (different room) does NOT receive s3's stroke");

  // ── Test 9: Invalid payload rejection ────────────────────────────────────
  console.log("\nTEST 9: Invalid payload rejected safely");
  const errorP = waitFor(s3, "server:error");
  s3.emit("stroke:start", { strokeId: "bad", color: "not-a-color", width: 999 });
  const err = await errorP;
  assert(err?.code === "INVALID_PAYLOAD", "Server rejects invalid stroke payload");

  // ── Test 10: Reconnect receives current room state ───────────────────────
  console.log("\nTEST 10: Reconnect receives current room state");
  const s5 = await connectAndWait();
  const s5State = await joinRoom(s5, ROOM_A);
  assert(Array.isArray(s5State?.operations), "rejoining client receives operations");
  const restoredOp = s5State?.operations?.find((o) => o.id === strokeId);
  assert(restoredOp?.status === "active", "restored operation visible after reconnect");

  // ── Cleanup ───────────────────────────────────────────────────────────────
  [s1, s3, s4, s5].forEach((s) => s.disconnect());

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("✅ All tests passed!\n");
  } else {
    console.log("❌ Some tests failed\n");
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
