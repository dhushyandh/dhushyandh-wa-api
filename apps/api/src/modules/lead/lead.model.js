const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    leadNumber: {
      type: Number,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Lead name is required"],
      trim: true,
      maxlength: 150,
    },
    whatsappChatId: {
      type: String,
      required: [true, "WhatsApp chat ID is required"],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },
    serviceRequested: {
      type: String,
      required: [true, "Service requested is required"],
      trim: true,
      maxlength: 200,
    },
    projectDescription: {
      type: String,
      required: [true, "Project description is required"],
      trim: true,
      maxlength: 2500,
    },
    budgetRange: {
      type: String,
      trim: true,
      default: "Not specified",
      maxlength: 100,
    },
    expectedTimeline: {
      type: String,
      trim: true,
      default: "Flexible",
      maxlength: 100,
    },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "rejected"],
      default: "new",
      index: true,
    },
    source: {
      type: String,
      default: "whatsapp",
    },
    notes: {
      type: String,
      default: "",
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

// Auto-increment leadNumber before saving if not present
leadSchema.pre("save", async function () {
  if (!this.leadNumber) {
    const lastLead = await this.constructor.findOne().sort({ leadNumber: -1 }).select("leadNumber").lean();
    this.leadNumber = (lastLead?.leadNumber || 0) + 1;
  }
});

// Compound indexes
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ whatsappChatId: 1, createdAt: -1 });

module.exports = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
