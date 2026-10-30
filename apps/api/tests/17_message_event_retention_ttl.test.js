const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const MessageEvent = require("../src/modules/webhook/message-event.model");

describe("17. MessageEvent Retention & TTL Indexing", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    // Ensure all indexes are synced on the collection
    await MessageEvent.syncIndexes();
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await MessageEvent.deleteMany({ chatId: "test-ttl-chat@s.whatsapp.net" });
    }
  });

  // =========================================================================
  // 1. INDEX SPECIFICATION & CORRECTNESS
  // =========================================================================
  it("1. MessageEvent model defines a TTL index on 'expiresAt' with expireAfterSeconds: 0", async () => {
    const indexes = await MessageEvent.collection.indexes();
    const ttlIndex = indexes.find(
      (idx) => idx.key && idx.key.expiresAt === 1 && typeof idx.expireAfterSeconds === "number"
    );

    assert.ok(ttlIndex, "TTL index on expiresAt must exist in MongoDB indexes");
    assert.equal(ttlIndex.expireAfterSeconds, 0, "expireAfterSeconds must be exactly 0");

    // Also verify eventKey unique index is preserved
    const eventKeyIndex = indexes.find((idx) => idx.key && idx.key.eventKey === 1);
    assert.ok(eventKeyIndex, "eventKey index must exist");
    assert.equal(eventKeyIndex.unique, true, "eventKey index must remain unique");
  });

  // =========================================================================
  // 2. EXPIRATION BEHAVIOR & DEFAULT CALCULATION
  // =========================================================================
  it("2. Newly created MessageEvent automatically calculates expiresAt to ~30 days in future", async () => {
    const beforeTime = Date.now();
    const doc = await MessageEvent.create({
      eventKey: `test_event_${Date.now()}_default`,
      chatId: "test-ttl-chat@s.whatsapp.net",
      senderId: "test-sender@s.whatsapp.net",
      mode: "public",
      status: "received",
      text: "Test retention calculation",
    });

    assert.ok(doc.expiresAt instanceof Date, "expiresAt must be a valid Date object");

    const expectedMs = 30 * 24 * 60 * 60 * 1000;
    const diff = doc.expiresAt.getTime() - beforeTime;

    // Difference should be 30 days (+/- 5000ms execution buffer)
    assert.ok(
      Math.abs(diff - expectedMs) < 5000,
      `Expected expiresAt to be ~30 days from now, got diff of ${diff}ms vs expected ${expectedMs}ms`
    );
  });

  it("3. Configurable MESSAGE_EVENT_TTL_DAYS overrides default retention window", async () => {
    const originalEnv = process.env.MESSAGE_EVENT_TTL_DAYS;
    try {
      process.env.MESSAGE_EVENT_TTL_DAYS = "14";

      const beforeTime = Date.now();
      const doc = await MessageEvent.create({
        eventKey: `test_event_${Date.now()}_custom_ttl`,
        chatId: "test-ttl-chat@s.whatsapp.net",
        senderId: "test-sender@s.whatsapp.net",
        mode: "public",
        status: "received",
        text: "Custom 14-day retention test",
      });

      const expectedMs = 14 * 24 * 60 * 60 * 1000;
      const diff = doc.expiresAt.getTime() - beforeTime;

      assert.ok(
        Math.abs(diff - expectedMs) < 5000,
        `Expected expiresAt to be ~14 days, got diff ${diff}ms vs expected ${expectedMs}ms`
      );
    } finally {
      if (originalEnv !== undefined) {
        process.env.MESSAGE_EVENT_TTL_DAYS = originalEnv;
      } else {
        delete process.env.MESSAGE_EVENT_TTL_DAYS;
      }
    }
  });

  // =========================================================================
  // 3. DUPLICATE SUPPRESSION PRESERVATION
  // =========================================================================
  it("4. Duplicate events with same eventKey are rejected within the retention window", async () => {
    const sharedKey = `dup_key_test_${Date.now()}`;

    // First insert succeeds
    const firstDoc = await MessageEvent.create({
      eventKey: sharedKey,
      chatId: "test-ttl-chat@s.whatsapp.net",
      senderId: "test-sender@s.whatsapp.net",
      mode: "public",
      status: "sent",
      text: "First attempt",
      outboundIdempotencyKey: `out_${sharedKey}`,
    });

    assert.equal(firstDoc.eventKey, sharedKey);

    // Second insert with identical eventKey must throw duplicate key error (code 11000)
    await assert.rejects(
      async () => {
        await MessageEvent.create({
          eventKey: sharedKey,
          chatId: "test-ttl-chat@s.whatsapp.net",
          senderId: "test-sender@s.whatsapp.net",
          mode: "public",
          status: "received",
          text: "Retransmitted duplicate attempt",
        });
      },
      (err) => {
        assert.ok(err.code === 11000 || /duplicate key/i.test(err.message));
        return true;
      }
    );
  });

  // =========================================================================
  // 4. IDEMPOTENCY KEY AND AUDIT PRESERVATION
  // =========================================================================
  it("5. Retention window preserves full idempotency context, timestamps and outbound tracking", async () => {
    const key = `audit_key_${Date.now()}`;
    const now = new Date();

    const doc = await MessageEvent.create({
      eventKey: key,
      chatId: "test-ttl-chat@s.whatsapp.net",
      senderId: "test-sender@s.whatsapp.net",
      mode: "private",
      status: "sent",
      stage: "sent",
      attempts: 1,
      reply: "Automated response safely delivered",
      outboundIdempotencyKey: `out_${key}`,
      outboundStatus: "delivered",
      stageTimestamps: {
        receivedAt: now,
        processingAt: now,
        generatingAt: now,
        sendingAt: now,
        sentAt: now,
      },
      primaryModel: "gemini-3.8-flash",
      selectedModel: "gemini-3.8-flash",
      durationMs: 450,
    });

    const retrieved = await MessageEvent.findOne({ eventKey: key }).lean();
    assert.ok(retrieved, "Event must be queryable");
    assert.equal(retrieved.status, "sent");
    assert.equal(retrieved.outboundIdempotencyKey, `out_${key}`);
    assert.equal(retrieved.outboundStatus, "delivered");
    assert.ok(retrieved.expiresAt > new Date(), "Event must remain unexpired");
    assert.equal(retrieved.primaryModel, "gemini-3.8-flash");
    assert.equal(retrieved.durationMs, 450);
  });
});
