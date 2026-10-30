const mongoose = require("mongoose");

function getMessageEventTtlDays() {
  const envTtl = parseInt(process.env.MESSAGE_EVENT_TTL_DAYS, 10);
  return Number.isInteger(envTtl) && envTtl > 0 ? envTtl : 30;
}

const stageTimestampsSchema = new mongoose.Schema(
  {
    receivedAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    generatingAt: { type: Date, default: null },
    sendingAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { _id: false }
);

const messageEventSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    chatId: { type: String, required: true, index: true },
    senderId: { type: String, default: "" },
    senderName: { type: String, default: "Unknown" },
    text: { type: String, default: "" },
    mode: { type: String, enum: ["public", "private"], required: true, index: true },
    status: {
      type: String,
      enum: ["received", "processing", "generating", "sending", "sent", "failed"],
      default: "received",
      index: true,
    },
    stage: { type: String, default: "received" },
    attempts: { type: Number, default: 1 },
    maxAttempts: { type: Number, default: 2 },
    reply: { type: String, default: "" },
    errorCategory: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    lockedAt: { type: Date, default: null },
    lockExpiresAt: { type: Date, default: null, index: true },
    stageTimestamps: { type: stageTimestampsSchema, default: () => ({}) },
    outboundIdempotencyKey: { type: String, default: "" },
    outboundStatus: {
      type: String,
      enum: ["pending", "delivered", "uncertain", "failed"],
      default: "pending",
    },
    retrievalDurationMs: { type: Number, default: null },
    geminiDurationMs: { type: Number, default: null },
    openwaDurationMs: { type: Number, default: null },
    primaryModel: { type: String, default: "" },
    fallbackModel: { type: String, default: "" },
    selectedModel: { type: String, default: "" },
    aiAttempts: { type: Number, default: 0 },
    retrievedItems: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    durationMs: { type: Number, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + getMessageEventTtlDays() * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

// Compound index for efficient context history retrieval per chat session
messageEventSchema.index({ chatId: 1, mode: 1, status: 1, createdAt: -1 });

// Compound index for querying stale in-flight records
messageEventSchema.index({ status: 1, lockExpiresAt: 1 });

// TTL index for automatic message event retention expiration
messageEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.MessageEvent ||
  mongoose.model("MessageEvent", messageEventSchema);
