import express  from"express";
import { customAlphabet } from"nanoid";
import Room     from"../models/Room.js";
import Message  from"../models/Message.js";

const router   = express.Router();
const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

// POST /api/rooms — create a new room
router.post("/", async (req, res) => {
  try {
    const { name, handle } = req.body;
    if (!name || !handle)
      return res.status(400).json({ error: "name and handle are required" });

    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return res.status(400).json({ error: "Room name cannot be empty" });

    const roomId = nanoid();
    const room = await Room.create({ roomId, name: trimmed, createdBy: handle });

    res.status(201).json({
      roomId:    room.roomId,
      name:      room.name,
      createdBy: room.createdBy,
      createdAt: room.createdAt,
    });
  } catch (err) {
    console.error("[Rooms] Create error:", err.message);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// GET /api/rooms/:roomId — get room info + last 200 messages
router.get("/:roomId", async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId, isActive: true });
    if (!room) return res.status(404).json({ error: "Room not found or has been closed" });

    const messages = await Message.find({ roomId: room.roomId })
      .sort({ timestamp: 1 })
      .limit(200)
      .lean();

    res.json({
      roomId:    room.roomId,
      name:      room.name,
      createdBy: room.createdBy,
      createdAt: room.createdAt,
      messages:  messages.map(m => ({
        messageId: m._id.toString(),
        handle:    m.handle,
        text:      m.text,
        replyTo:   m.replyTo ?? null,
        timestamp: m.timestamp,
      })),
    });
  } catch (err) {
    console.error("[Rooms] Get error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/rooms/:roomId — destroy room (only creator)
router.delete("/:roomId", async (req, res) => {
  try {
    const { handle } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId, isActive: true });
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.createdBy !== handle)
      return res.status(403).json({ error: "Only the room creator can close it" });

    room.isActive = false;
    await room.save();
    await Message.deleteMany({ roomId: room.roomId });

    res.json({ ok: true });
  } catch (err) {
    console.error("[Rooms] Delete error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
