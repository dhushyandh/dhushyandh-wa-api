const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    ownerChatId: {
      type: String,
      required: true,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast owner task querying
taskSchema.index({ ownerChatId: 1, status: 1, priority: -1 });
taskSchema.index({ ownerChatId: 1, dueDate: 1 });

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);
