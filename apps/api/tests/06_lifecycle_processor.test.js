const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const MessageEvent = require("../src/modules/webhook/message-event.model");
const {
  processIncomingMessage,
  recoverStaleProcessingRecords,
} = require("../src/modules/webhook/message-processor");
const { setClient } = require("../src/modules/ai/gemini.service");
const { setFetch } = require("../src/modules/openwa/openwa.service");

describe("Message Processing Lifecycle & Stale Recovery", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
  });

  afterEach(() => {
    setClient(null);
    setFetch(null);
  });

  after(async () => {
    await MessageEvent.deleteMany({ eventKey: /^TEST_LIFECYCLE_/ });
    await mongoose.disconnect();
  });

  it("16. Full message processing lifecycle transitions to sent state", async () => {
    const testKey = "TEST_LIFECYCLE_full_" + Date.now();

    // Mock Gemini
    setClient({
      models: {
        generateContent: async () => ({ text: "Lifecycle verified response" }),
      },
    });

    // Mock OpenWA
    setFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, messageId: "wa_msg_lifecycle" }),
    }));

    const incoming = {
      messageId: "wa_in_1",
      chatId: "919999999999@s.whatsapp.net",
      senderId: "919999999999@s.whatsapp.net",
      senderName: "Test User",
      text: "Testing lifecycle",
      messageType: "text",
      assistantMode: "public",
      timestamp: Math.floor(Date.now() / 1000),
    };

    await processIncomingMessage(incoming, testKey);

    const record = await MessageEvent.findOne({ eventKey: testKey });
    assert.ok(record);
    assert.equal(record.status, "sent");
    assert.equal(record.stage, "completed");
    assert.equal(record.outboundStatus, "delivered");
    assert.equal(record.reply, "Lifecycle verified response");
    assert.ok(record.stageTimestamps.receivedAt);
    assert.ok(record.stageTimestamps.processingAt);
    assert.ok(record.stageTimestamps.generatingAt);
    assert.ok(record.stageTimestamps.sendingAt);
    assert.ok(record.stageTimestamps.sentAt);
    assert.ok(record.durationMs >= 0);
  });

  it("17. Duplicate processing prevention should ignore concurrent or retransmitted events", async () => {
    const testKey = "TEST_LIFECYCLE_dup_" + Date.now();
    let geminiCalls = 0;
    let openwaCalls = 0;

    setClient({
      models: {
        generateContent: async () => {
          geminiCalls++;
          return { text: "Duplicate test reply" };
        },
      },
    });

    setFetch(async () => {
      openwaCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    });

    const incoming = {
      messageId: "wa_in_dup",
      chatId: "919999999999@s.whatsapp.net",
      text: "Testing dup suppression",
      assistantMode: "public",
    };

    // First process call
    await processIncomingMessage(incoming, testKey);
    assert.equal(geminiCalls, 1);
    assert.equal(openwaCalls, 1);

    // Second process call for same eventKey
    await processIncomingMessage(incoming, testKey);
    // Should NOT invoke Gemini or OpenWA a second time!
    assert.equal(geminiCalls, 1);
    assert.equal(openwaCalls, 1);
  });

  it("18. Recovery of stale processing records should mark expired locks as failed", async () => {
    const staleKey = "TEST_LIFECYCLE_stale_" + Date.now();

    // Create an expired lock record in 'processing' status
    const pastTime = new Date(Date.now() - 120000); // 2 minutes ago
    await MessageEvent.create({
      eventKey: staleKey,
      chatId: "919999999999@s.whatsapp.net",
      text: "Stale message",
      mode: "public",
      status: "processing",
      lockedAt: pastTime,
      lockExpiresAt: pastTime,
      createdAt: pastTime,
    });

    const recoveredCount = await recoverStaleProcessingRecords();
    assert.ok(recoveredCount >= 1);

    const staleRecord = await MessageEvent.findOne({ eventKey: staleKey });
    assert.equal(staleRecord.status, "failed");
    assert.equal(staleRecord.errorCategory, "STALE_TIMEOUT");
    assert.equal(staleRecord.errorCode, "408");
    assert.ok(staleRecord.stageTimestamps.failedAt);
  });
});
