const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");

const { routeIncomingMessage } = require("../src/modules/assistant/command-router");
const { retrieveContext } = require("../src/modules/context/context-retriever.service");
const { generateReply, setClient, stripEmojis, SYSTEM_PROMPTS } = require("../src/modules/ai/gemini.service");
const { sanitizeResponse } = require("../src/modules/ui/response-formatter");
const MessageEvent = require("../src/modules/webhook/message-event.model");

const TEST_OWNER = "134613267656901@lid";
const TEST_VISITOR = "919876543210@s.whatsapp.net";

describe("14. Conversational UX & Response Quality", () => {
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

  afterEach(() => {
    setClient(null);
  });

  // =========================================================================
  // 1. CONCISE RESPONSES
  // =========================================================================
  it("1. Responses should be concise, direct, and under word limits", async () => {
    // Test direct deterministic router queries
    const res = await routeIncomingMessage({
      text: "how do modes work?",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(res.handled, true);
    const words = res.reply.trim().split(/\s+/).length;
    // Must be concise (under 120 words)
    assert.ok(words < 120, `Response should be under 120 words, got ${words}`);
    // Answers exact question first
    assert.ok(res.reply.toLowerCase().includes("mode behavior:"), "Must answer exact topic");
  });

  // =========================================================================
  // 2. NO UNNECESSARY GREETINGS
  // =========================================================================
  it("2. Responses to questions should not have unnecessary greetings or introductions", async () => {
    // Mode explanation should not begin with "Hey there!", "Hello", "Hi"
    const res = await routeIncomingMessage({
      text: "how can i test public mode?",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(res.handled, true);
    assert.doesNotMatch(res.reply, /^(?:hey|hello|hi|welcome)\b/i, "Should not start with pleasantries/greetings");
    assert.ok(res.reply.toLowerCase().includes("to test public mode:"), "Answers question first");
  });

  // =========================================================================
  // 3. FORMATTED, CLEAN, WITH EMOJIS AND OPTIONS-BASED OUTBOUND MESSAGES
  // =========================================================================
  it("3. Outbound messages should be formatted, clean, with emojis and options-based", async () => {
    // 3.1 stripEmojis utility is still functional as a standalone helper
    const rawWithEmojis = "Node.js and Express 🚀 are used 👋 with MongoDB 📋 and Gemini ✨";
    const cleaned = stripEmojis(rawWithEmojis);
    assert.equal(cleaned, "Node.js and Express are used with MongoDB and Gemini");

    // 3.2 generateReply preserves emojis returned from AI model (not stripped)
    const mockAi = {
      models: {
        generateContent: async () => ({
          text: "Dhushyandh specializes in Node.js, React, and Python 🚀. He builds automated AI systems ✨.",
        }),
      },
    };
    setClient(mockAi);

    const reply = await generateReply({
      message: "What are your core skills?",
      mode: "public",
      requestId: "test-emoji-preserve",
    });

    assert.match(
      reply,
      /[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u,
      "Generated reply must preserve modern emojis"
    );
    assert.ok(reply.includes("🚀"));
    assert.ok(reply.includes("Dhushyandh specializes in Node.js, React, and Python"));

    // 3.3 Outbound responses have clean formatting, emojis, and options-based choices
    const modeRes = await routeIncomingMessage({
      text: "how do modes work?",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.match(
      modeRes.reply,
      /[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u,
      "Mode explanation must contain visual emojis"
    );
    assert.ok(modeRes.reply.includes("━━━━━━━━━━━━━━━━━━━━"), "Must contain clean divider formatting");
    assert.ok(
      modeRes.reply.includes("Quick Options:") || modeRes.reply.includes("Options:"),
      "Must contain structured options"
    );
    assert.ok(modeRes.reply.includes("1. 👨‍💻 *About Me*"), "Must offer numbered interactive options");
  });

  // =========================================================================
  // 4. CORRECT PRIVATE/PUBLIC MODE EXPLANATIONS & TESTING GUIDANCE
  // =========================================================================
  it("4. Accurately explains mode behavior and public mode testing guidance", async () => {
    // 4.1 Owner asks how modes work / can I switch
    const ownerModeRes = await routeIncomingMessage({
      text: "Can I switch to public mode?",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(ownerModeRes.handled, true);
    assert.ok(ownerModeRes.reply.includes("Private Mode is automatically active for you based on verified WhatsApp LID"));
    assert.ok(ownerModeRes.reply.includes("Public Mode is automatically assigned to all other WhatsApp senders"));
    assert.ok(ownerModeRes.reply.includes("Manual mode switching is not available"));
    assert.ok(ownerModeRes.reply.includes("separate, non-owner WhatsApp account"));

    // 4.2 Owner asks how to test public mode
    const testGuidanceRes = await routeIncomingMessage({
      text: "how to test public mode?",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(testGuidanceRes.handled, true);
    assert.ok(testGuidanceRes.reply.includes("Message the bot from a separate, non-owner WhatsApp account"));
    assert.ok(testGuidanceRes.reply.includes("Private Mode is automatically authorized for your WhatsApp LID"));

    // 4.3 Public visitor asks if they can switch to private mode
    const publicModeRes = await routeIncomingMessage({
      text: "Can I switch to private mode?",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(publicModeRes.handled, true);
    assert.ok(publicModeRes.reply.includes("Public Mode is active for all standard WhatsApp visitors"));
    assert.ok(publicModeRes.reply.includes("Private Mode is restricted to the authorized owner"));
    assert.ok(publicModeRes.reply.includes("Manual mode switching is not available"));
  });

  // =========================================================================
  // 5. NO PRIVATE DATA LEAKAGE IN PUBLIC RESPONSES
  // =========================================================================
  it("5. Strictly prevents private project and memory leakage in public responses", async () => {
    // 5.1 Querying private project RenewX in public mode via command router
    const pubProjectRes = await routeIncomingMessage({
      text: "Tell me about RenewX",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(pubProjectRes.handled, true);
    assert.ok(pubProjectRes.reply.includes("I do not have access to any public project by that name"));
    assert.ok(!pubProjectRes.reply.includes("battery"), "Must not leak RenewX purpose or domain");
    assert.ok(!pubProjectRes.reply.includes("RenewX platform"), "Must not leak internal project details");

    // 5.2 Context retrieval in public mode excludes private project and memories
    const contextResult = await retrieveContext({
      text: "What are the blockers on RenewX?",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.doesNotMatch(contextResult.contextText, /renewx/i, "Context must not contain RenewX in public mode");
    assert.doesNotMatch(contextResult.contextText, /blockers/i, "Context must not contain blockers in public mode");
    assert.doesNotMatch(contextResult.contextText, /VERIFIED OWNER MEMORIES/i, "Context must not contain private memories in public mode");
  });

  // =========================================================================
  // 6. FOLLOW-UP ANSWERS DO NOT REPEAT PREVIOUS EXPLANATIONS
  // =========================================================================
  it("6. Follow-up answers maintain context and answer only the new question without repeating past overviews", async () => {
    let capturedContents = null;

    const mockAi = {
      models: {
        generateContent: async (args) => {
          capturedContents = args.contents;
          return {
            text: "DHUSHYANDH AI uses MongoDB with Mongoose for persistent data storage.",
          };
        },
      },
    };
    setClient(mockAi);

    // Multi-turn history:
    // Turn 1: User asks overview, AI answers overview
    const history = [
      {
        role: "user",
        text: "What is DHUSHYANDH AI?",
      },
      {
        role: "model",
        text: "DHUSHYANDH AI is a WhatsApp-based personal AI assistant platform with dual private and public modes.",
      },
    ];

    // Turn 2: User asks follow-up about database
    const followUpReply = await generateReply({
      message: "Which database does it use?",
      mode: "public",
      history,
      requestId: "test-follow-up",
    });

    // Verify history was properly injected into Gemini multi-turn contents
    assert.ok(Array.isArray(capturedContents));
    assert.equal(capturedContents.length, 3, "Contents should have Turn 1 User, Turn 1 Model, and Turn 2 User");
    assert.equal(capturedContents[0].parts[0].text, "What is DHUSHYANDH AI?");
    assert.equal(capturedContents[1].parts[0].text, "DHUSHYANDH AI is a WhatsApp-based personal AI assistant platform with dual private and public modes.");
    assert.equal(capturedContents[2].parts[0].text, "Which database does it use?");

    // Verify the reply answers strictly the new question and does not repeat the initial overview
    assert.ok(followUpReply.includes("MongoDB"), "Must answer the database question");
    assert.doesNotMatch(
      followUpReply,
      /dual private and public modes/i,
      "Must not repeat the initial overview already explained in Turn 1"
    );
    assert.doesNotMatch(
      followUpReply,
      /^(?:hey|hello|hi)\b/i,
      "Must not include unnecessary greeting in follow-up answer"
    );
  });
});
