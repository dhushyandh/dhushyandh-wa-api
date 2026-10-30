const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");

const {
  createReminder,
  processDueReminders,
  recoverStaleReminders,
} = require("../src/modules/reminder/reminder.service");
const Reminder = require("../src/modules/reminder/reminder.model");
const { setFetch } = require("../src/modules/openwa/openwa.service");

const TEST_OWNER = "134613267656901@lid";

describe("16. Reminder Recovery, Concurrency & Security Hardening", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await Reminder.deleteMany({ ownerChatId: TEST_OWNER });
      await mongoose.connection.collection("conversationstates").deleteMany({});
    }
  });

  afterEach(() => {
    setFetch(null);
  });

  // =========================================================================
  // 1. RECOVERY FROM STALE SENDING STATE (CRASH SIMULATION)
  // =========================================================================
  it("1. Stale reminder stuck in 'sending' state after crash is recovered back to 'pending'", async () => {
    const pastDue = new Date(Date.now() - 60000);
    const reminder = await createReminder({
      title: "Deploy Phase 5.2 security patches",
      dueAt: pastDue,
      ownerChatId: TEST_OWNER,
      chatId: TEST_OWNER,
    });

    // Simulate process crash while in 'sending' state with expired lock
    const expiredLock = new Date(Date.now() - 100000); // 100s ago
    await Reminder.updateOne(
      { _id: reminder._id },
      {
        $set: {
          status: "sending",
          lockedAt: expiredLock,
          lockExpiresAt: expiredLock,
          attempts: 1,
          maxAttempts: 3,
        },
      }
    );

    // Run recovery
    const recovered = await recoverStaleReminders({ lockTimeoutMs: 90000 });
    assert.equal(recovered, 1, "Exactly 1 stale reminder must be recovered");

    // Verify reminder is now 'pending' and ready for re-delivery
    const refreshed = await Reminder.findById(reminder._id);
    assert.equal(refreshed.status, "pending");
    assert.equal(refreshed.recoveryCount, 1);
    assert.equal(refreshed.attempts, 1);
    assert.ok(refreshed.lastError.includes("Recovered from stale 'sending' state"));
    assert.equal(refreshed.lockExpiresAt, null);

    // Mock successful OpenWA dispatch
    const sentCalls = [];
    setFetch(async (url, options) => {
      sentCalls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "msg_rem_recovered" }),
      };
    });

    // Verify processDueReminders successfully picks it up and delivers
    const dispatched = await processDueReminders();
    assert.equal(dispatched, 1);
    assert.equal(sentCalls.length, 1);
    assert.ok(sentCalls[0].text.includes("Deploy Phase 5.2 security patches"));

    const delivered = await Reminder.findById(reminder._id);
    assert.equal(delivered.status, "sent");
    assert.equal(delivered.attempts, 2);
  });

  // =========================================================================
  // 2. MAX ATTEMPTS EXCEEDED PERMANENTLY FAILS
  // =========================================================================
  it("2. Stale reminder exceeding maxAttempts is marked failed to prevent infinite loops", async () => {
    const pastDue = new Date(Date.now() - 60000);
    const reminder = await createReminder({
      title: "Repeated crash simulation reminder",
      dueAt: pastDue,
      ownerChatId: TEST_OWNER,
      chatId: TEST_OWNER,
    });

    // Simulate reminder that has already been attempted 3 times (maxAttempts = 3)
    const expiredLock = new Date(Date.now() - 120000);
    await Reminder.updateOne(
      { _id: reminder._id },
      {
        $set: {
          status: "sending",
          lockedAt: expiredLock,
          lockExpiresAt: expiredLock,
          attempts: 3,
          maxAttempts: 3,
        },
      }
    );

    const recovered = await recoverStaleReminders({ lockTimeoutMs: 90000 });
    assert.equal(recovered, 1);

    const failed = await Reminder.findById(reminder._id);
    assert.equal(failed.status, "failed");
    assert.ok(failed.lastError.includes("Exceeded max recovery attempts"));
  });

  // =========================================================================
  // 3. ACTIVE LEASE PROTECTION (DO NOT RECOVER NON-EXPIRED LOCKS)
  // =========================================================================
  it("3. Active (unexpired) sending lease is strictly preserved and not recovered", async () => {
    const pastDue = new Date(Date.now() - 10000);
    const reminder = await createReminder({
      title: "Active in-flight dispatch",
      dueAt: pastDue,
      ownerChatId: TEST_OWNER,
      chatId: TEST_OWNER,
    });

    // Currently locked with expiration 60 seconds into the future
    const activeLock = new Date(Date.now() + 60000);
    await Reminder.updateOne(
      { _id: reminder._id },
      {
        $set: {
          status: "sending",
          lockedAt: new Date(),
          lockExpiresAt: activeLock,
          attempts: 1,
        },
      }
    );

    const recovered = await recoverStaleReminders({ lockTimeoutMs: 90000 });
    assert.equal(recovered, 0, "Active lock must NOT be recovered");

    const unchanged = await Reminder.findById(reminder._id);
    assert.equal(unchanged.status, "sending");
  });

  // =========================================================================
  // 4. CONCURRENT WORKER ATOMICITY
  // =========================================================================
  it("4. Concurrent recovery workers atomically claim stale locks without collision", async () => {
    const pastDue = new Date(Date.now() - 60000);
    const reminder = await createReminder({
      title: "Concurrency test reminder",
      dueAt: pastDue,
      ownerChatId: TEST_OWNER,
      chatId: TEST_OWNER,
    });

    const expiredLock = new Date(Date.now() - 150000);
    await Reminder.updateOne(
      { _id: reminder._id },
      {
        $set: {
          status: "sending",
          lockedAt: expiredLock,
          lockExpiresAt: expiredLock,
          attempts: 1,
          maxAttempts: 3,
        },
      }
    );

    // Run 3 simultaneous recovery sweeps
    const [w1, w2, w3] = await Promise.all([
      recoverStaleReminders({ lockTimeoutMs: 90000 }),
      recoverStaleReminders({ lockTimeoutMs: 90000 }),
      recoverStaleReminders({ lockTimeoutMs: 90000 }),
    ]);

    const totalRecoveries = w1 + w2 + w3;
    assert.equal(totalRecoveries, 1, "Only one concurrent worker can claim the recovery");

    const result = await Reminder.findById(reminder._id);
    assert.equal(result.status, "pending");
    assert.equal(result.recoveryCount, 1);
  });

  // =========================================================================
  // 5. IDEMPOTENCY KEY PRESERVATION ACROSS RECOVERIES
  // =========================================================================
  it("5. Idempotency key is preserved throughout recovery to prevent duplicate WhatsApp dispatch", async () => {
    const pastDue = new Date(Date.now() - 60000);
    const reminder = await createReminder({
      title: "Idempotent reminder",
      dueAt: pastDue,
      ownerChatId: TEST_OWNER,
      chatId: TEST_OWNER,
    });

    const originalIdempotencyKey = reminder.idempotencyKey;
    assert.ok(originalIdempotencyKey && originalIdempotencyKey.startsWith("rem_"));

    // Simulate crash in sending
    const expiredLock = new Date(Date.now() - 100000);
    await Reminder.updateOne(
      { _id: reminder._id },
      {
        $set: {
          status: "sending",
          lockExpiresAt: expiredLock,
        },
      }
    );

    await recoverStaleReminders({ lockTimeoutMs: 90000 });

    const recovered = await Reminder.findById(reminder._id);
    assert.equal(recovered.idempotencyKey, originalIdempotencyKey, "Idempotency key must remain identical");
  });
});
