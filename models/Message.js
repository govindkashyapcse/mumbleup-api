const mongoose = require("mongoose");

const ReplySchema = new mongoose.Schema({
  messageId: String,
  handle:    String,
  text:      String,   // truncated preview (max 120 chars)
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  roomId:    { type: String, required: true, index: true },
  handle:    { type: String, required: true },
  text:      { type: String, required: true, maxlength: 500 },
  replyTo:   { type: ReplySchema, default: null },
  timestamp: { type: Number, default: () => Date.now() },
});

// Compound index for efficient room history queries
MessageSchema.index({ roomId: 1, timestamp: 1 });

module.exports = mongoose.model("Message", MessageSchema);
