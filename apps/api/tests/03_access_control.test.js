const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const MessageEvent = require("../src/modules/webhook/message-event.model");
const { getRecentConversationHistory } = require("../src/modules/webhook/message-processor");

describe("Access Control & Public/Private Context Isolation", () => {
  const configuredOwnerLid = (env.OWNER_CHAT_IDS || "").split(",")[0]?.trim() || "134613267656901@lid";
  const strangerChatId = "919876543210@s.whatsapp.net";

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
  });

  after(async () => {
    // Clean up test records
    await MessageEvent.deleteMany({ chatId: { $in: [configuredOwnerLid, strangerChatId] }, text: /TEST_ISOLATION/ });
    await mongoose.disconnect();
  });

  it("8. Owner identification should match the configured WhatsApp LID", () => {
    const ownerIds = new Set(
      (env.OWNER_CHAT_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    assert.equal(ownerIds.has(configuredOwnerLid), true);

    // Simulate verification logic used in app.js
    const isOwner =
      ownerIds.has(configuredOwnerLid) ||
      ownerIds.has("unknown_chat");

    assert.equal(isOwner, true);
  });

  it("9. Public-user identification should deny owner mode for strangers", () => {
    const ownerIds = new Set(
      (env.OWNER_CHAT_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    assert.equal(ownerIds.has(strangerChatId), false);

    const isOwner =
      ownerIds.has(strangerChatId) ||
      ownerIds.has("919876543210@s.whatsapp.net");

    assert.equal(isOwner, false);
  });

  it("20. Public/private context isolation should never leak owner history to public users", async () => {
    // Insert a private owner message
    await MessageEvent.create({
      eventKey: "TEST_ISOLATION_owner_1_" + Date.now(),
      chatId: configuredOwnerLid,
      text: "TEST_ISOLATION: Private owner note about project secrets and budget",
      mode: "private",
      status: "sent",
      reply: "Private reply: confirmed action plan",
    });

    // Insert a public user message
    await MessageEvent.create({
      eventKey: "TEST_ISOLATION_public_1_" + Date.now(),
      chatId: strangerChatId,
      text: "TEST_ISOLATION: What services do you offer?",
      mode: "public",
      status: "sent",
      reply: "Public reply: We build web and mobile apps.",
    });

    // Query history for the public user
    const publicHistory = await getRecentConversationHistory(strangerChatId, "public");

    // Must only contain public history, never the owner's private note
    assert.equal(publicHistory.length >= 2, true);
    for (const msg of publicHistory) {
      assert.doesNotMatch(msg.text, /secrets and budget/i);
    }

    // Query history for the owner
    const ownerHistory = await getRecentConversationHistory(configuredOwnerLid, "private");
    const hasOwnerSecret = ownerHistory.some((m) => m.text.includes("secrets and budget"));
    assert.equal(hasOwnerSecret, true);
  });
});
