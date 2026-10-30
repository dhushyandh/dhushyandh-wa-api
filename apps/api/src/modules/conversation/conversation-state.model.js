const mongoose = require("mongoose");

const conversationStateSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    flow: {
      type: String,
      enum: ["idle", "lead_capture", "project_explorer"],
      default: "idle",
      index: true,
    },
    step: {
      type: String,
      default: "none",
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes TTL
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ConversationState ||
  mongoose.model("ConversationState", conversationStateSchema);
