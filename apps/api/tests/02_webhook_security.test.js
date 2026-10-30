const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const app = require("../src/app");
const WebhookEvent = require("../src/modules/webhook/webhook-event.model");
const { setClient } = require("../src/modules/ai/gemini.service");
const { setFetch } = require("../src/modules/openwa/openwa.service");

describe("Webhook Security & Intake Filtering", () => {
  let server;
  let baseUrl;

  before(async () => {
    // Mock external services so background processing doesn't invoke real APIs during intake tests
    setClient({
      models: {
        generateContent: async () => ({ text: "Mocked test response" }),
      },
    });
    setFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }));

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    setClient(null);
    setFetch(null);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  function generateSignature(bodyString, secret = env.OPENWA_WEBHOOK_SECRET) {
    return (
      "sha256=" +
      crypto.createHmac("sha256", secret).update(Buffer.from(bodyString)).digest("hex")
    );
  }

  it("2. Valid webhook signature should be accepted", async () => {
    const payload = JSON.stringify({
      event: "ping",
      sessionId: env.OPENWA_SESSION_ID,
    });
    const sig = generateSignature(payload);

    const res = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": sig,
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.ignored, true);
  });

  it("3. Invalid webhook signature should be rejected with 401", async () => {
    const payload = JSON.stringify({ event: "ping" });
    const wrongSig = "sha256=" + "f".repeat(64);

    const res = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": wrongSig,
      },
      body: payload,
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Invalid webhook signature/i);
  });

  it("4. Duplicate webhook event should be detected and suppressed", async () => {
    const uniqueMsgId = "test_dup_" + Date.now();
    const payload = JSON.stringify({
      event: "message.received",
      sessionId: env.OPENWA_SESSION_ID,
      data: {
        id: uniqueMsgId,
        from: "919999999999@s.whatsapp.net",
        chatId: "919999999999@s.whatsapp.net",
        body: "First attempt",
        type: "text",
        fromMe: false,
        isGroup: false,
      },
    });
    const sig = generateSignature(payload);

    // First delivery
    const res1 = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": sig,
      },
      body: payload,
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.received, true);

    // Second delivery (duplicate)
    const res2 = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": sig,
      },
      body: payload,
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.duplicate, true);

    // Clean up test webhook event record
    await WebhookEvent.deleteOne({ idempotencyKey: `${env.OPENWA_SESSION_ID}:${uniqueMsgId}` });
  });

  it("5. Incoming text message parsing should extract all relevant fields", async () => {
    const msgId = "test_parse_" + Date.now();
    const payload = JSON.stringify({
      event: "message.received",
      sessionId: env.OPENWA_SESSION_ID,
      data: {
        id: msgId,
        from: "918888888888@s.whatsapp.net",
        chatId: "918888888888@s.whatsapp.net",
        body: "   Hello assistant!   ",
        type: "text",
        fromMe: false,
        isGroup: false,
        timestamp: 1730000000,
        contact: { pushName: "Alice" },
      },
    });
    const sig = generateSignature(payload);

    const res = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": sig,
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.received, true);
    assert.equal(data.assistantMode, "public");

    await WebhookEvent.deleteOne({ idempotencyKey: `${env.OPENWA_SESSION_ID}:${msgId}` });
  });

  it("6. Outgoing messages (fromMe=true) should be filtered out", async () => {
    const payload = JSON.stringify({
      event: "message.received",
      sessionId: env.OPENWA_SESSION_ID,
      data: {
        id: "test_fromMe_" + Date.now(),
        from: "918888888888@s.whatsapp.net",
        body: "Outgoing message from bot",
        type: "text",
        fromMe: true,
        isGroup: false,
      },
    });
    const sig = generateSignature(payload);

    const res = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": sig,
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ignored, true);
  });

  it("7. Group messages (isGroup=true) should be filtered out", async () => {
    const payload = JSON.stringify({
      event: "message.received",
      sessionId: env.OPENWA_SESSION_ID,
      data: {
        id: "test_group_" + Date.now(),
        from: "123456789-987654@g.us",
        body: "Group chat message",
        type: "text",
        fromMe: false,
        isGroup: true,
      },
    });
    const sig = generateSignature(payload);

    const res = await fetch(`${baseUrl}/api/webhooks/openwa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenWA-Signature": sig,
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ignored, true);
  });
});
