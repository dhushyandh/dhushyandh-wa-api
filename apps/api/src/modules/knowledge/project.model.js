const mongoose = require("mongoose");

const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    dueDate: { type: String },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const decisionSchema = new mongoose.Schema(
  {
    decision: { type: String, required: true },
    rationale: { type: String, default: "" },
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    techStack: [{ type: String }],
    status: {
      type: String,
      enum: ["planning", "in_progress", "active", "completed", "on_hold"],
      default: "active",
      index: true,
    },
    isPublic: { type: Boolean, default: false, index: true },
    milestones: [milestoneSchema],
    currentProgress: { type: String, default: "" },
    blockers: [{ type: String }],
    importantDecisions: [decisionSchema],
    problemSolved: { type: String, default: "" },
    features: [{ type: String }],
    deploymentStatus: { type: String, default: "" },
    liveDemoUrl: { type: String, default: "" },
    mobileAppUrl: { type: String, default: "" },
    category: { type: String, default: "" },
    repositoryUrl: { type: String, default: "" },
    deploymentUrl: { type: String, default: "" },
    tags: [{ type: String, index: true }],
  },
  { timestamps: true }
);

// Compound index for public/private project queries
projectSchema.index({ isPublic: 1, status: 1 });

module.exports =
  mongoose.models.Project || mongoose.model("Project", projectSchema);
