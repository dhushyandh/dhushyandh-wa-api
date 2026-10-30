const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    idempotencyKey: {
      type: String,
      required: true,
    },
    event: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { versionKey: false }
);

webhookEventSchema.index(
  { idempotencyKey: 1 },
  { unique: true }
);

webhookEventSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports =
  mongoose.models.WebhookEvent ||
  mongoose.model("WebhookEvent", webhookEventSchema);