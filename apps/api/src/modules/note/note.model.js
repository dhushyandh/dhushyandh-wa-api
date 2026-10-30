const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Note title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    content: {
      type: String,
      required: [true, "Note content is required"],
      trim: true,
      maxlength: [5000, "Content cannot exceed 5000 characters"],
    },
    category: {
      type: String,
      trim: true,
      default: "General",
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    ownerChatId: {
      type: String,
      required: true,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes
noteSchema.index({ ownerChatId: 1, archivedAt: 1, createdAt: -1 });
noteSchema.index({ ownerChatId: 1, category: 1 });
noteSchema.index({ title: "text", content: "text", tags: "text" });

module.exports = mongoose.models.Note || mongoose.model("Note", noteSchema);
