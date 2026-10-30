const mongoose = require("mongoose");
const crypto = require("crypto");

const memorySchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    contentHash: { type: String, required: true, unique: true, index: true },
    category: {
      type: String,
      enum: [
        "project_decision",
        "technical_preference",
        "personal_fact",
        "work_style",
        "task_context",
        "other",
      ],
      default: "other",
      index: true,
    },
    scope: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      index: true,
    },
    source: {
      type: String,
      enum: ["owner_statement", "automatic_extraction", "manual_seed"],
      default: "automatic_extraction",
    },
    confidence: { type: Number, min: 0, max: 1, default: 0.9 },
    importance: { type: Number, min: 1, max: 5, default: 3 },
    approvalStatus: {
      type: String,
      enum: ["approved", "pending_approval", "rejected"],
      default: "approved",
      index: true,
    },
    tags: [{ type: String, index: true }],
    projectSlug: { type: String, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

// Compound index for retrieval queries
memorySchema.index({ scope: 1, approvalStatus: 1, importance: -1 });

// Static helper to generate deterministic content hash
memorySchema.statics.hashContent = function (content) {
  if (!content || typeof content !== "string") return "";
  const normalized = content.trim().toLowerCase().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex");
};

module.exports =
  mongoose.models.Memory || mongoose.model("Memory", memorySchema);
