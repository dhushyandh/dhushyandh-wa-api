const crypto = require("crypto");
const Reminder = require("./reminder.model");
const { sendText } = require("../openwa/openwa.service");
const logger = require("../../utils/logger");
const env = require("../../config/env");

let schedulerTimer = null;

async function createReminder({
  title,
  dueAt,
  timezone = "Asia/Kolkata",
  ownerChatId,
  chatId,
  targetType = "custom",
  taskId = null,
}) {
  if (!title || typeof title !== "string" || !title.trim()) {
    throw new Error("Reminder title is required");
  }
  if (!dueAt || isNaN(new Date(dueAt).getTime())) {
    throw new Error("A valid dueAt timestamp is required");
  }
  if (!ownerChatId || !chatId) {
    throw new Error("ownerChatId and chatId are required");
  }

  const dueDate = new Date(dueAt);
  const idempotencyKey = `rem_${crypto.randomBytes(12).toString("hex")}`;

  const reminder = await Reminder.create({
    title: title.trim(),
    dueAt: dueDate,
    timezone,
    ownerChatId,
    chatId,
    targetType,
    taskId,
    status: "pending",
    idempotencyKey,
  });

  logger.info("Reminder scheduled successfully", {
    reminderId: reminder._id,
    dueAt: dueDate.toISOString(),
    title: reminder.title,
  });

  return reminder;
}

async function listPendingReminders({ ownerChatId }) {
  if (!ownerChatId) throw new Error("ownerChatId is required");
  return Reminder.find({ ownerChatId, status: "pending" })
    .sort({ dueAt: 1 })
    .limit(20)
    .lean();
}

async function cancelReminder({ identifier, ownerChatId }) {
  if (!identifier || !ownerChatId) throw new Error("Identifier required");

  let query = { ownerChatId, status: "pending" };
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query._id = identifier;
  } else {
    query.title = { $regex: identifier.trim(), $options: "i" };
  }

  return Reminder.findOneAndUpdate(
    query,
    { $set: { status: "cancelled" } },
    { returnDocument: "after" }
  );
}

/**
 * Recovers reminders stuck in 'sending' state due to unexpected process crashes or unhandled timeouts.
 * Atomically re-queues expired locks back to 'pending' if under maxAttempts,
 * or marks them 'failed' if maxAttempts is exceeded.
 */
async function recoverStaleReminders({ lockTimeoutMs = env.REMINDER_LOCK_TIMEOUT_MS || 90000 } = {}) {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - lockTimeoutMs);

  // Find candidate reminders stuck in 'sending' state past lock expiration
  const staleCandidates = await Reminder.find({
    status: "sending",
    $or: [
      { lockExpiresAt: { $lt: now } },
      { lockExpiresAt: null, updatedAt: { $lt: staleThreshold } },
      { lockExpiresAt: { $exists: false }, updatedAt: { $lt: staleThreshold } },
    ],
  }).limit(20);

  if (!staleCandidates || staleCandidates.length === 0) return 0;

  let recoveredCount = 0;

  for (const item of staleCandidates) {
    const maxAttempts = item.maxAttempts || 3;
    const currentAttempts = item.attempts || 1;

    if (currentAttempts < maxAttempts) {
      // Re-queue to pending so processDueReminders can safely dispatch
      const reSummary = `Recovered from stale 'sending' state after crash (recovery #${(item.recoveryCount || 0) + 1})`;
      const updated = await Reminder.findOneAndUpdate(
        {
          _id: item._id,
          status: "sending",
          $or: [
            { lockExpiresAt: { $lt: now } },
            { lockExpiresAt: null },
            { lockExpiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            status: "pending",
            lastError: reSummary,
            lockExpiresAt: null,
            lockedAt: null,
          },
          $inc: { recoveryCount: 1 },
        },
        { returnDocument: "after" }
      );

      if (updated) {
        recoveredCount++;
        logger.warn("Recovered stale reminder back to pending status", {
          reminderId: item._id,
          attempts: updated.attempts,
          recoveryCount: updated.recoveryCount,
        });
      }
    } else {
      // Exceeded maxAttempts: permanently fail to prevent infinite loops
      const failSummary = `Exceeded max recovery attempts (${maxAttempts}) after repeated process crashes`;
      const updated = await Reminder.findOneAndUpdate(
        {
          _id: item._id,
          status: "sending",
          $or: [
            { lockExpiresAt: { $lt: now } },
            { lockExpiresAt: null },
            { lockExpiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            status: "failed",
            lastError: failSummary,
            lockExpiresAt: null,
          },
        },
        { returnDocument: "after" }
      );

      if (updated) {
        recoveredCount++;
        logger.error("Marked stale reminder permanently failed after exceeding maxAttempts", {
          reminderId: item._id,
          attempts: updated.attempts,
          maxAttempts,
        });
      }
    }
  }

  return recoveredCount;
}

/**
 * Sweeps and processes reminders that are due right now.
 * Atomically marks status 'sending' with a lease timeout to guarantee at-most-once delivery.
 */
async function processDueReminders() {
  const now = new Date();
  const lockTimeoutMs = env.REMINDER_LOCK_TIMEOUT_MS || 90000;
  const lockExpiresAt = new Date(now.getTime() + lockTimeoutMs);

  // Find due reminders
  const dueList = await Reminder.find({
    status: "pending",
    dueAt: { $lte: now },
  }).limit(10);

  if (!dueList || dueList.length === 0) return 0;

  let dispatchedCount = 0;

  for (const item of dueList) {
    // Atomic claim: status pending -> sending with lease time
    const claimed = await Reminder.findOneAndUpdate(
      { _id: item._id, status: "pending" },
      {
        $set: {
          status: "sending",
          lockedAt: now,
          lockExpiresAt,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after" }
    );

    if (!claimed) continue; // Concurrently claimed by another worker

    try {
      const messageText = `⏰ *Reminder:* ${claimed.title}\n\nScheduled for: ${claimed.dueAt.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: claimed.timezone || "Asia/Kolkata",
      })}`;

      await sendText({
        chatId: claimed.chatId,
        text: messageText,
        idempotencyKey: claimed.idempotencyKey,
        requestId: `reminder_${claimed._id}`,
      });

      claimed.status = "sent";
      claimed.sentAt = new Date();
      claimed.lockExpiresAt = null;
      await claimed.save();
      dispatchedCount++;

      logger.info("Reminder sent successfully", {
        reminderId: claimed._id,
        chatId: claimed.chatId,
      });
    } catch (sendErr) {
      claimed.status = "failed";
      claimed.lastError = sendErr.message;
      claimed.lockExpiresAt = null;
      await claimed.save();

      logger.error("Failed to deliver reminder", {
        reminderId: claimed._id,
        error: sendErr.message,
      });
    }
  }

  return dispatchedCount;
}

function startReminderScheduler(intervalMs = 30000) {
  if (schedulerTimer) return;

  // Run immediate recovery and overdue sweeps from previous downtime
  recoverStaleReminders()
    .then(() => processDueReminders())
    .catch((err) =>
      logger.warn("Initial reminder recovery sweep error", { error: err.message })
    );

  schedulerTimer = setInterval(async () => {
    try {
      await recoverStaleReminders();
      await processDueReminders();
    } catch (err) {
      logger.error("Reminder scheduler tick error", { error: err.message });
    }
  }, intervalMs);

  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}

function stopReminderScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  createReminder,
  listPendingReminders,
  cancelReminder,
  processDueReminders,
  recoverStaleReminders,
  startReminderScheduler,
  stopReminderScheduler,
};
