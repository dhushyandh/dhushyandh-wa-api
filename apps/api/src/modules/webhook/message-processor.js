const env = require("../../config/env");
const logger = require("../../utils/logger");
const MessageEvent = require("./message-event.model");
const { generateReply } = require("../ai/gemini.service");
const { sendText, sendImage } = require("../openwa/openwa.service");
const { retrieveContext } = require("../context/context-retriever.service");
const { routeIncomingMessage } = require("../assistant/command-router");
const { sanitizeResponse, formatOutboundResponse } = require("../ui/response-formatter");
const {
  processPotentialMemory,
  getMemories,
  approveMemory,
  rejectMemory,
} = require("../memory/memory.service");

function parseOwnerIds() {
  return new Set(
    (env.OWNER_CHAT_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

async function getRecentConversationHistory(chatId, mode, limit = 4) {
  try {
    const pastEvents = await MessageEvent.find({
      chatId,
      mode,
      status: "sent",
      reply: { $ne: "" },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const chronological = pastEvents.reverse();
    const history = [];

    for (const event of chronological) {
      if (event.text && event.reply) {
        history.push({ role: "user", text: event.text });
        history.push({ role: "model", text: event.reply });
      }
    }

    return history;
  } catch (err) {
    logger.warn("Failed to load conversation history; proceeding without context", {
      chatId,
      error: err.message,
    });
    return [];
  }
}

async function processIncomingMessage(message, eventKey) {
  const startTime = Date.now();
  const ownerIds = parseOwnerIds();

  // Authorize owner using actual WhatsApp LID or JID
  const isOwner =
    message.assistantMode === "private" ||
    ownerIds.has(message.chatId) ||
    ownerIds.has(message.senderId);

  const mode = isOwner ? "private" : "public";
  const now = new Date();
  const lockTimeoutMs = env.LOCK_TIMEOUT_MS || 90000;
  const lockExpiresAt = new Date(now.getTime() + lockTimeoutMs);
  const outboundIdempotencyKey = `reply_${eventKey}`.slice(0, 255);

  let record;

  try {
    record = await MessageEvent.create({
      eventKey,
      chatId: message.chatId,
      senderId: message.senderId || message.chatId,
      senderName: message.senderName || "Unknown",
      text: message.text,
      mode,
      status: "processing",
      stage: "lock_acquired",
      attempts: 1,
      maxAttempts: 2,
      lockedAt: now,
      lockExpiresAt,
      stageTimestamps: {
        receivedAt: message.timestamp ? new Date(message.timestamp * 1000) : now,
        processingAt: now,
      },
      outboundIdempotencyKey,
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await MessageEvent.findOne({ eventKey });
      if (!existing) return;

      if (existing.status === "sent") {
        logger.info("Duplicate event ignored; reply already sent", {
          eventKey,
          chatId: message.chatId,
        });
        return;
      }

      if (existing.status === "failed") {
        logger.info("Duplicate event ignored; previously reached failed state", {
          eventKey,
          chatId: message.chatId,
        });
        return;
      }

      const isExpired = existing.lockExpiresAt && existing.lockExpiresAt < now;
      const canRetry = (existing.attempts || 1) < (existing.maxAttempts || 2);

      if (existing.status === "sending") {
        logger.warn(
          "Duplicate event rejected; message was in 'sending' stage. Outbound delivery is uncertain.",
          { eventKey, chatId: message.chatId }
        );
        return;
      }

      if (isExpired && canRetry && (existing.status === "processing" || existing.status === "generating")) {
        const claimed = await MessageEvent.findOneAndUpdate(
          {
            eventKey,
            lockExpiresAt: { $lt: now },
            status: { $in: ["processing", "generating"] },
          },
          {
            $set: {
              status: "processing",
              stage: "stale_recovered",
              lockedAt: now,
              lockExpiresAt,
              "stageTimestamps.processingAt": now,
            },
            $inc: { attempts: 1 },
          },
          { returnDocument: "after" }
        );

        if (claimed) {
          record = claimed;
          logger.warn("Recovered stale processing record for re-attempt", {
            eventKey,
            attempts: record.attempts,
          });
        } else {
          return;
        }
      } else {
        logger.info("Duplicate event ignored; currently being processed", {
          eventKey,
          status: existing.status,
        });
        return;
      }
    } else {
      logger.error("Failed to insert message event record", {
        eventKey,
        error: error.message,
      });
      throw error;
    }
  }

  // --- STAGE 2: KNOWLEDGE RETRIEVAL & GENERATING ---
  try {
    record.status = "generating";
    record.stage = "generating_ai";
    record.stageTimestamps.generatingAt = new Date();

    // 1. Retrieve grounded knowledge context
    const contextResult = await retrieveContext({
      text: message.text,
      mode,
      chatId: message.chatId,
    });

    record.retrievalDurationMs = contextResult.durationMs;
    record.retrievedItems = contextResult.retrievedItems;
    await record.save();

    // 2. Retrieve recent conversation history
    const history = await getRecentConversationHistory(message.chatId, mode);
    const isFirstTimeUser = mode !== "private" && history.length === 0;

    // 3. Generate response with command router or Gemini
    const geminiStart = Date.now();
    let reply = "";
    const aiMeta = {};

    const routerResult = await routeIncomingMessage({
      text: message.text,
      mode,
      chatId: message.chatId,
      isFirstTimeUser,
    });

    if (routerResult.handled) {
      reply = routerResult.reply;
      aiMeta.selectedModel = "direct_router";
      aiMeta.attempts = 1;

      if (routerResult.sendImageBefore) {
        try {
          await sendImage({
            chatId: message.chatId,
            ...routerResult.sendImageBefore,
            requestId: `${eventKey}_img`,
            idempotencyKey: `img_${record.outboundIdempotencyKey}`.slice(0, 255),
          });
        } catch (imgErr) {
          logger.warn("Failed to send preliminary image before text reply", {
            error: imgErr.message,
            chatId: message.chatId,
          });
        }
      }
    } else {
      reply = await generateReply({
        message: message.text,
        mode,
        history,
        retrievedContext: contextResult.contextText,
        requestId: eventKey,
        metadataOut: aiMeta,
      });
    }

    // Sanitize any raw technical details, ports, or secrets from outgoing reply
    reply = sanitizeResponse(reply);

    record.geminiDurationMs = Date.now() - geminiStart;
    record.primaryModel = aiMeta.primaryModel || env.GEMINI_MODEL || "gemini-3.8-flash";
    record.fallbackModel = aiMeta.fallbackModel || env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
    record.selectedModel = aiMeta.selectedModel || record.primaryModel;
    record.aiAttempts = aiMeta.attempts || 1;

    // --- STAGE 3: SENDING ---
    record.status = "sending";
    record.stage = "sending_outbound";
    record.reply = reply;
    record.stageTimestamps.sendingAt = new Date();
    await record.save();

    const openwaStart = Date.now();
    await sendText({
      chatId: message.chatId,
      text: reply,
      idempotencyKey: record.outboundIdempotencyKey,
      requestId: eventKey,
    });
    record.openwaDurationMs = Date.now() - openwaStart;

    // --- STAGE 4: SENT (COMPLETED) ---
    record.status = "sent";
    record.stage = "completed";
    record.outboundStatus = "delivered";
    record.stageTimestamps.sentAt = new Date();
    record.durationMs = Date.now() - startTime;
    await record.save();

    logger.info(`[DHUSHYANDH AI] ${mode} reply delivered successfully`, {
      eventKey,
      chatId: message.chatId,
      mode,
      retrievalDurationMs: record.retrievalDurationMs,
      geminiDurationMs: record.geminiDurationMs,
      openwaDurationMs: record.openwaDurationMs,
      totalDurationMs: record.durationMs,
    });

    // --- POST-PROCESSING: HYBRID MEMORY EXTRACTION ---
    // If in private owner mode, evaluate if any technical decision or memory should be extracted
    if (mode === "private") {
      try {
        await processPotentialMemory({ text: message.text, mode });
      } catch (memErr) {
        logger.debug("Memory extraction non-critical error", { error: memErr.message });
      }
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isUncertain = error.category === "OPENWA_UNCERTAIN_DELIVERY";

    logger.error("[DHUSHYANDH AI] Message processing lifecycle failed", {
      eventKey,
      chatId: message.chatId,
      mode,
      stage: record.stage,
      errorCategory: error.category || "UNCLASSIFIED_ERROR",
      errorMessage: error.message,
      durationMs,
    });

    try {
      record.status = "failed";
      record.stage = "failed";
      record.errorCategory = error.category || "UNCLASSIFIED_ERROR";
      record.errorCode = String(error.code || error.statusCode || "500");
      record.errorMessage = error.message;
      record.stageTimestamps.failedAt = new Date();
      record.durationMs = durationMs;
      if (error.primaryModel) record.primaryModel = error.primaryModel;
      if (error.fallbackModel) record.fallbackModel = error.fallbackModel;
      if (error.attempts) record.aiAttempts = error.attempts;

      if (isUncertain) {
        record.outboundStatus = "uncertain";
      } else if (record.status === "sending") {
        record.outboundStatus = "failed";
      }
      await record.save();

      // If all models failed or error occurred during AI generation (before sending stage),
      // send a concise temporary-unavailability response through safe failure handling.
      // Note: record.status remains strictly "failed" to never falsely mark as successful.
      const failedDuringAiGeneration =
        !record.stageTimestamps.sendingAt &&
        record.outboundStatus !== "uncertain" &&
        record.outboundStatus !== "delivered";

      if (failedDuringAiGeneration) {
        const unavailabilityNotice =
          mode === "private"
            ? [
                "⚠️ *System Notice*",
                "━━━━━━━━━━━━━━━━━━━━",
                "All configured AI models are temporarily unavailable. Please try again in a few moments.",
                "",
                "━━━━━━━━━━━━━━━━━━━━",
                "📌 *Quick Options:*",
                "1. 👨‍💻 *About Me*",
                "2. 🛠️ *Skills & Technologies*",
                "3. 🚀 *My Projects*",
                "4. 💼 *Experience & Internships*",
                "5. 📄 *Portfolio & Resume*",
                "6. 💬 *Ask Me Anything*",
                "7. 📬 *Contact & Connect*",
                "🏠 Reply *menu* for Main Menu",
              ].join("\n")
            : [
                "⚠️ *Temporary Notice*",
                "━━━━━━━━━━━━━━━━━━━━",
                "I am currently experiencing temporary technical difficulties and cannot process your message right now. Please try again shortly.",
                "",
                "━━━━━━━━━━━━━━━━━━━━",
                "📌 *Quick Options:*",
                "1. 👨‍💻 *About Me*",
                "2. 🛠️ *Skills & Technologies*",
                "3. 🚀 *My Projects*",
                "4. 💼 *Experience & Internships*",
                "5. 📄 *Portfolio & Resume*",
                "6. 💬 *Ask Me Anything*",
                "7. 📬 *Contact & Connect*",
                "🏠 Reply *menu* for Main Menu",
              ].join("\n");

        try {
          await sendText({
            chatId: message.chatId,
            text: unavailabilityNotice,
            idempotencyKey: `${record.outboundIdempotencyKey}_unavail`,
            requestId: eventKey,
          });
          logger.info("[DHUSHYANDH AI] Temporary unavailability response delivered to user", {
            eventKey,
            chatId: message.chatId,
            mode,
          });
        } catch (noticeErr) {
          logger.warn("Failed to deliver temporary unavailability response", {
            eventKey,
            error: noticeErr.message,
          });
        }
      }
    } catch (saveError) {
      logger.error("Failed to persist failed state to MongoDB", {
        eventKey,
        error: saveError.message,
      });
    }
  }
}

async function recoverStaleProcessingRecords() {
  const now = new Date();
  const lockTimeoutMs = env.LOCK_TIMEOUT_MS || 90000;
  const staleThreshold = new Date(now.getTime() - lockTimeoutMs);

  try {
    const result = await MessageEvent.updateMany(
      {
        status: { $in: ["processing", "generating"] },
        $or: [
          { lockExpiresAt: { $lt: now } },
          { lockExpiresAt: null, createdAt: { $lt: staleThreshold } },
          { lockExpiresAt: { $exists: false }, createdAt: { $lt: staleThreshold } },
        ],
      },
      {
        $set: {
          status: "failed",
          stage: "stale_timeout",
          errorCategory: "STALE_TIMEOUT",
          errorCode: "408",
          errorMessage: "Processing exceeded lock timeout without completing.",
          "stageTimestamps.failedAt": now,
        },
      }
    );

    if (result.modifiedCount > 0) {
      logger.warn(`Recovered and failed ${result.modifiedCount} stale message processing record(s)`);
    }

    return result.modifiedCount;
  } catch (err) {
    logger.error("Error during stale processing record recovery sweep", {
      error: err.message,
    });
    return 0;
  }
}

module.exports = {
  processIncomingMessage,
  recoverStaleProcessingRecords,
  getRecentConversationHistory,
};
