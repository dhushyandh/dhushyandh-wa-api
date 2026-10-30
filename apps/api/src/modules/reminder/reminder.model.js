const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Reminder title is required"],
      trim: true,
      maxlength: [300, "Title cannot exceed 300 characters"],
    },
    dueAt: {
      type: Date,
      required: [true, "dueAt is required"],
      index: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    ownerChatId: {
      type: String,
      required: true,
      index: true,
    },
    chatId: {
      type: String,
      required: true,
    },
    targetType: {
      type: String,
      enum: ["task", "custom"],
      default: "custom",
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
    lastError: {
      type: String,
      default: "",
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    recoveryCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes
reminderSchema.index({ status: 1, dueAt: 1 });
reminderSchema.index({ ownerChatId: 1, status: 1 });
reminderSchema.index({ status: 1, lockExpiresAt: 1 });

module.exports = mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
