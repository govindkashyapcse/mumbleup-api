import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema({
  roomId:    { type: String, required: true, unique: true, index: true },
  name:      { type: String, required: true, maxlength: 60 },
  createdBy: { type: String, required: true },
  createdAt: { type: Number, default: () => Date.now() },
  isActive:  { type: Boolean, default: true },
});

const Room = mongoose.model("Room", RoomSchema);
export default Room;
