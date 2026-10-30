const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const MessageEvent = require("../src/modules/webhook/message-event.model");
const { processIncomingMessage } = require("../src/modules/webhook/message-processor");
const { setClient } = require("../src/modules/ai/gemini.service");
const { setFetch } = require("../src/modules/openwa/openwa.service");
const { seedInitialKnowledge } = require("../src/modules/knowledge/seed-data");

describe("Phase 2: End-to-End Grounded Message Processing", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await seedInitialKnowledge();
  });

  afterEach(() => {
    setClient(null);
    setFetch(null);
  });

  after(async () => {
    await MessageEvent.deleteMany({ eventKey: /^TEST_E2E_KNOWLEDGE_/ });
    await mongoose.disconnect();
  });

  it("1. Message processing retrieves knowledge and records timing telemetry", async () => {
    const testKey = "TEST_E2E_KNOWLEDGE_1_" + Date.now();
    let passedContext = "";

    // Mock Gemini to inspect the grounded context injected into the prompt
    setClient({
      models: {
        generateContent: async ({ config }) => {
          passedContext = config.systemInstruction;
          return {
            text: "Based on my profile, I specialize in Node.js, Express, and WhatsApp automation.",
          };
        },
      },
    });

    // Mock OpenWA
    let sentChatId = "";
    let sentText = "";
    setFetch(async (url, options) => {
      const body = JSON.parse(options.body);
      sentChatId = body.chatId;
      sentText = body.text;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "wa_msg_e2e" }),
      };
    });

    const incoming = {
      messageId: "wa_e2e_1",
      chatId: "919999999999@s.whatsapp.net",
      senderId: "919999999999@s.whatsapp.net",
      senderName: "Prospective Client",
      text: "What services and projects do you offer?",
      messageType: "text",
      assistantMode: "public",
      timestamp: Math.floor(Date.now() / 1000),
    };

    await processIncomingMessage(incoming, testKey);

    const record = await MessageEvent.findOne({ eventKey: testKey });
    assert.ok(record);
    assert.equal(record.status, "sent");
    assert.equal(record.mode, "public");

    // Telemetry assertions
    assert.ok(typeof record.retrievalDurationMs === "number", "Must record retrievalDurationMs");
    assert.ok(typeof record.geminiDurationMs === "number", "Must record geminiDurationMs");
    assert.ok(typeof record.openwaDurationMs === "number", "Must record openwaDurationMs");
    assert.ok(record.retrievedItems.hasProfile, "Must record retrievedItems");

    // Grounding verification: Gemini system prompt must contain the grounded knowledge base
    assert.match(passedContext, /GROUNDED KNOWLEDGE BASE/i);
    assert.match(passedContext, /DEVELOPER PROFILE/i);
    assert.match(passedContext, /DHUSHYANDH AI/i);
    // Public isolation: must NOT contain private RenewX
    assert.doesNotMatch(passedContext, /RenewX/i);

    // Verify outbound send
    assert.equal(sentChatId, "919999999999@s.whatsapp.net");
    assert.match(sentText, /WhatsApp automation/i);
  });

  it("2. Private owner /memories command returns stored memories list", async () => {
    const testKey = "TEST_E2E_KNOWLEDGE_mem_" + Date.now();
    let sentText = "";

    setFetch(async (url, options) => {
      const body = JSON.parse(options.body);
      sentText = body.text;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    });

    const configuredOwnerLid = (env.OWNER_CHAT_IDS || "").split(",")[0]?.trim() || "134613267656901@lid";

    const incoming = {
      messageId: "wa_e2e_mem",
      chatId: configuredOwnerLid,
      senderId: configuredOwnerLid,
      text: "/memories",
      assistantMode: "private",
    };

    await processIncomingMessage(incoming, testKey);

    const record = await MessageEvent.findOne({ eventKey: testKey });
    assert.ok(record);
    assert.equal(record.status, "sent");
    assert.match(sentText, /Stored Private Memories/i);
    assert.match(sentText, /cost of ₹0/i);
  });
});
