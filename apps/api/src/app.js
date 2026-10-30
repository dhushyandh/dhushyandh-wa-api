const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const crypto = require("crypto");
const mongoose = require("mongoose");

const env = require("./config/env");
const logger = require("./utils/logger");
const WebhookEvent = require("./modules/webhook/webhook-event.model");
const { processIncomingMessage } = require("./modules/webhook/message-processor");
const { checkOpenWAHealth } = require("./modules/openwa/openwa.service");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CLIENT_URL
      ? env.CLIENT_URL.split(",").map((url) => url.trim())
      : "http://localhost:5173",
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    name: "DHUSHYANDH AI",
    message: "WhatsApp-based Personal AI Platform API",
    version: "1.0.0",
  });
});

app.get("/api/health", async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1
      ? "connected"
      : dbState === 2
      ? "connecting"
      : "disconnected";

  const openwaCheck = await checkOpenWAHealth();

  const isHealthy = dbState === 1 && openwaCheck.healthy;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbStatus,
      openwa: openwaCheck.status || (openwaCheck.healthy ? "ready" : "unavailable"),
    },
  });
});

app.post("/api/webhooks/openwa", async (req, res, next) => {
  try {
    const secret = env.OPENWA_WEBHOOK_SECRET;

    if (!secret) {
      return res.status(503).json({
        success: false,
        message: "Webhook configuration unavailable",
      });
    }

    const signature = req.get("X-OpenWA-Signature");

    if (
      !signature ||
      !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
      !req.rawBody
    ) {
      logger.warn("Webhook rejected: missing or malformed HMAC signature header");
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const expectedSignature =
      "sha256=" +
      crypto
        .createHmac("sha256", secret)
        .update(req.rawBody)
        .digest("hex");

    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      logger.warn("Webhook rejected: HMAC signature verification failed");
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const event = req.body || {};

    // Validate expected session ID if event provides it
    if (event.sessionId && event.sessionId !== env.OPENWA_SESSION_ID) {
      logger.warn("Webhook rejected: event session ID mismatch", {
        receivedSessionId: event.sessionId,
      });
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "foreign_session",
      });
    }

    if (event.event !== "message.received") {
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "non_message_event",
      });
    }

    const message = event.data;

    // Filter non-actionable messages: self-sent, groups, status broadcasts, non-text
    if (
      !message ||
      message.fromMe ||
      message.isGroup ||
      message.isStatusBroadcast ||
      message.type !== "text"
    ) {
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "filtered_message_type",
      });
    }

    const chatId = message.chatId || message.from;
    const text = (message.body || "").trim();

    if (!chatId || !message.id || !text) {
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "missing_required_fields",
      });
    }

    const idempotencyKey =
      event.idempotencyKey ||
      `${event.sessionId || env.OPENWA_SESSION_ID}:${message.id}`;

    // Persistent webhook-level duplicate protection
    try {
      await WebhookEvent.create({
        idempotencyKey,
        event: event.event,
      });
    } catch (error) {
      if (error.code === 11000) {
        logger.info("Webhook duplicate suppressed by idempotency key", {
          idempotencyKey,
        });
        return res.status(200).json({
          success: true,
          duplicate: true,
        });
      }
      throw error;
    }

    // Owner authorization - supports WhatsApp LID and standard JID
    const ownerIds = new Set(
      (env.OWNER_CHAT_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    const isOwner =
      ownerIds.has(message.from) ||
      ownerIds.has(chatId) ||
      ownerIds.has(message.sender) ||
      ownerIds.has(message.author) ||
      ownerIds.has(message.participant);

    const incomingMessage = {
      messageId: message.id,
      chatId,
      senderId: message.from || message.sender,
      senderName: message.contact?.pushName || "Unknown",
      text,
      messageType: message.type,
      assistantMode: isOwner ? "private" : "public",
      timestamp: message.timestamp,
    };

    logger.info("Incoming WhatsApp message accepted", {
      messageId: message.id,
      chatId,
      mode: incomingMessage.assistantMode,
      textLength: text.length,
    });

    // Acknowledge OpenWA immediately with 200 OK
    res.status(200).json({
      success: true,
      received: true,
      assistantMode: incomingMessage.assistantMode,
    });

    // Asynchronous background processing with guaranteed error capture
    setImmediate(() => {
      processIncomingMessage(incomingMessage, idempotencyKey).catch(
        (error) => {
          logger.error("Unhandled error in background message processor", {
            error: error.message,
            stack: error.stack,
          });
        }
      );
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  logger.error("Unhandled express route error", {
    error: err.message,
    status: err.status || 500,
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message:
      env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

module.exports = app;
