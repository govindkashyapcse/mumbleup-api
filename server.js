require("dotenv").config();
const http      = require("http");
const express   = require("express");
const cors      = require("cors");
const WebSocket = require("ws");
const mongoose  = require("mongoose");
const dns = require("node:dns/promises");

dns.setServers(["1.1.1.1", "1.0.0.1"]);

const { publisher, subscriber, connectRedis } = require("./redisClient");
const { createSession, getSession, deleteSession, getActiveCount } = require("./sessionManager");
const Room    = require("./models/Room");
const Message = require("./models/Message");
const roomsRouter = require("./routes/rooms");

const PORT        = process.env.PORT;
const MONGODB_URI = process.env.MONGO_URI;
const CHANNEL_PREFIX = "mumbleup:room:";
const MAX_MSG_LEN    = 500;

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/api/rooms", roomsRouter);
app.get("/health", (_, res) => res.json({ status: "ok", activeUsers: getActiveCount() }));

// ── HTTP + WS ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: "/ws" });

// ws → { sessionId, handle, roomId | null }
const clients = new Map();

// roomId → Set<ws>  (local fan-out index)
const roomClients = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function roomActiveCount(roomId) {
  return roomClients.get(roomId)?.size ?? 0;
}

function joinRoomLocally(ws, roomId) {
  if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
  roomClients.get(roomId).add(ws);
  clients.get(ws).roomId = roomId;
}

function leaveRoomLocally(ws) {
  const meta = clients.get(ws);
  if (!meta?.roomId) return;
  const set = roomClients.get(meta.roomId);
  if (set) { set.delete(ws); if (set.size === 0) roomClients.delete(meta.roomId); }
  meta.roomId = null;
}

// ── Redis fan-out ─────────────────────────────────────────────────────────────
async function setupRedisSubscriber() {
  // psubscribe lets us catch all room channels without tracking subscriptions
  await subscriber.psubscribe(`${CHANNEL_PREFIX}*`, (err) => {
    if (err) console.error("[Redis] psubscribe error:", err);
    else console.log(`[Redis] psubscribed to ${CHANNEL_PREFIX}*`);
  });

  subscriber.on("pmessage", (_pattern, channel, raw) => {
    const roomId = channel.slice(CHANNEL_PREFIX.length);
    const set    = roomClients.get(roomId);
    if (!set) return;

    const data = raw; // already stringified
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
wss.on("connection", (ws, req) => {
  const { sessionId, handle } = createSession();
  clients.set(ws, { sessionId, handle, roomId: null });

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(`[WS] Connected: ${handle} (${ip})`);

  sendTo(ws, { type: "welcome", handle, sessionId, timestamp: Date.now() });

  // ── Incoming ──
  ws.on("message", async (raw) => {
    const meta = clients.get(ws);
    if (!meta) return;

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch {
      return sendTo(ws, { type: "error", text: "Invalid JSON" });
    }

    switch (msg.type) {

      // ── Join a room ──
      case "join_room": {
        const { roomId } = msg;
        if (!roomId) return sendTo(ws, { type: "error", text: "roomId required" });

        const room = await Room.findOne({ roomId, isActive: true });
        if (!room) return sendTo(ws, { type: "error", text: "Room not found or has been closed" });

        // Leave previous room first
        if (meta.roomId && meta.roomId !== roomId) {
          const prevId = meta.roomId;
          leaveRoomLocally(ws);
          publisher.publish(`${CHANNEL_PREFIX}${prevId}`, JSON.stringify({
            type: "leave", handle: meta.handle,
            activeUsers: roomActiveCount(prevId), timestamp: Date.now(),
          }));
        }

        joinRoomLocally(ws, roomId);

        // Fetch history from MongoDB
        const history = await Message.find({ roomId })
          .sort({ timestamp: 1 }).limit(200).lean();

        sendTo(ws, {
          type: "room_joined",
          roomId:    room.roomId,
          roomName:  room.name,
          createdBy: room.createdBy,
          activeUsers: roomActiveCount(roomId),
          timestamp: Date.now(),
        });

        sendTo(ws, {
          type: "history",
          messages: history.map(m => ({
            messageId: m._id.toString(),
            handle:    m.handle,
            text:      m.text,
            replyTo:   m.replyTo ?? null,
            timestamp: m.timestamp,
          })),
        });

        // Announce join to room
        publisher.publish(`${CHANNEL_PREFIX}${roomId}`, JSON.stringify({
          type: "join", handle: meta.handle,
          activeUsers: roomActiveCount(roomId), timestamp: Date.now(),
        }));

        console.log(`[WS] ${meta.handle} joined room ${roomId}`);
        break;
      }

      // ── Chat message ──
      case "chat": {
        if (!meta.roomId) return sendTo(ws, { type: "error", text: "Join a room first" });

        const text = (msg.text || "").trim().slice(0, MAX_MSG_LEN);
        if (!text) return;

        getSession(meta.sessionId);

        // Validate replyTo if present
        let replyTo = null;
        if (msg.replyTo?.messageId) {
          const ref = await Message.findById(msg.replyTo.messageId).lean();
          if (ref && ref.roomId === meta.roomId) {
            replyTo = {
              messageId: ref._id.toString(),
              handle:    ref.handle,
              text:      ref.text.slice(0, 120),
            };
          }
        }

        // Persist to MongoDB
        const saved = await Message.create({
          roomId:    meta.roomId,
          handle:    meta.handle,
          text,
          replyTo,
          timestamp: Date.now(),
        });

        // Broadcast via Redis
        publisher.publish(`${CHANNEL_PREFIX}${meta.roomId}`, JSON.stringify({
          type:      "chat",
          messageId: saved._id.toString(),
          roomId:    meta.roomId,
          handle:    meta.handle,
          text,
          replyTo,
          timestamp: saved.timestamp,
        }));
        break;
      }

      case "ping":
        sendTo(ws, { type: "pong", timestamp: Date.now() });
        break;

      default:
        sendTo(ws, { type: "error", text: "Unknown message type" });
    }
  });

  // ── Disconnect ──
  ws.on("close", () => {
    const meta = clients.get(ws);
    if (!meta) return;

    const { handle, sessionId, roomId } = meta;
    leaveRoomLocally(ws);
    deleteSession(sessionId);
    clients.delete(ws);

    if (roomId) {
      publisher.publish(`${CHANNEL_PREFIX}${roomId}`, JSON.stringify({
        type: "leave", handle,
        activeUsers: roomActiveCount(roomId), timestamp: Date.now(),
      }));
    }
    console.log(`[WS] Disconnected: ${handle}`);
  });

  ws.on("error", (err) => console.error(`[WS] Error:`, err.message));
});

// Boot
(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("[MongoDB] Connected");

    await connectRedis();
    await setupRedisSubscriber();

    // server.listen(PORT, () => {
    //   console.log(`[Server] MumbleUp v2 on http://localhost:${PORT}`);
    // });
  } catch (err) {
    console.error("[Boot] Failed:", err);
    process.exit(1);
  }
})();

process.on("SIGTERM", () => {
  wss.close(() => server.close(() => mongoose.disconnect().then(() => process.exit(0))));
});


module.exports = server;