const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");

const { routeIncomingMessage } = require("../src/modules/assistant/command-router");
const { formatPublicWelcome, formatMainMenu, formatProjectDetails } = require("../src/modules/ui/response-formatter");
const { getProjects } = require("../src/modules/knowledge/project.service");
const { seedInitialKnowledge } = require("../src/modules/knowledge/seed-data");
const { getState, clearState } = require("../src/modules/conversation/conversation-state.service");
const { setFetch } = require("../src/modules/openwa/openwa.service");
const { setClient } = require("../src/modules/ai/gemini.service");
const { processIncomingMessage } = require("../src/modules/webhook/message-processor");
const MessageEvent = require("../src/modules/webhook/message-event.model");

const TEST_OWNER = "134613267656901@lid";
const TEST_PUBLIC_USER_1 = "919111111111@s.whatsapp.net";
const TEST_PUBLIC_USER_2 = "919222222222@s.whatsapp.net";

describe("18. Public Menu Redesign & Owner Separation Regression", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await seedInitialKnowledge();
    await MessageEvent.deleteMany({ chatId: { $in: [TEST_PUBLIC_USER_1, TEST_PUBLIC_USER_2] } });
    await clearState(TEST_PUBLIC_USER_1);
    await clearState(TEST_PUBLIC_USER_2);
  });

  after(async () => {
    await MessageEvent.deleteMany({ chatId: { $in: [TEST_PUBLIC_USER_1, TEST_PUBLIC_USER_2] } });
    await clearState(TEST_PUBLIC_USER_1);
    await clearState(TEST_PUBLIC_USER_2);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await clearState(TEST_PUBLIC_USER_1);
    await clearState(TEST_PUBLIC_USER_2);
  });

  afterEach(() => {
    setFetch(null);
    setClient(null);
  });

  // =========================================================================
  // 1. FIRST-TIME PUBLIC USERS RECEIVE 7-OPTION WELCOME MENU
  // =========================================================================
  it("1. First-time public users receive the 7-option welcome menu on greetings and start", async () => {
    const greetingSamples = ["Hi", "Hello", "Hey", "good morning", "Start", "/start"];

    for (const text of greetingSamples) {
      const res = await routeIncomingMessage({
        text,
        mode: "public",
        chatId: TEST_PUBLIC_USER_1,
        isFirstTimeUser: true,
      });

      assert.equal(res.handled, true, `Greeting '${text}' must be handled directly`);
      assert.ok(res.reply.includes("Welcome to *DHUSHYANDH AI*"), "Must include welcome header");
      assert.ok(res.reply.includes("1. 👨‍💻 *About Me*"), "Must include Option 1");
      assert.ok(res.reply.includes("2. 🛠️ *Skills & Technologies*"), "Must include Option 2");
      assert.ok(res.reply.includes("3. 🚀 *My Projects*"), "Must include Option 3");
      assert.ok(res.reply.includes("4. 💼 *Experience & Internships*"), "Must include Option 4");
      assert.ok(res.reply.includes("5. 📄 *Portfolio & Resume*"), "Must include Option 5");
      assert.ok(res.reply.includes("6. 💬 *Ask Me Anything*"), "Must include Option 6");
      assert.ok(res.reply.includes("7. 📬 *Contact & Connect*"), "Must include Option 7");

      // Verify strict absence of old generic productivity menu
      assert.ok(!res.reply.includes("My Tasks"), "Public menu must NOT contain 'My Tasks'");
      assert.ok(!res.reply.includes("My Notes"), "Public menu must NOT contain 'My Notes'");
      assert.ok(!res.reply.includes("Daily Summary"), "Public menu must NOT contain 'Daily Summary'");
      assert.ok(!res.reply.includes("Explore Projects"), "Must not use old 'Explore Projects' label");
      assert.ok(!res.reply.includes("Development Services"), "Must not use old 'Development Services' label");
      assert.ok(!res.reply.includes("Hire / Work Together"), "Must not use old 'Hire / Work Together' label");
    }
  });

  // =========================================================================
  // 2. RETURNING PUBLIC USERS REQUESTING MAIN MENU RECEIVE 7-OPTION MENU
  // =========================================================================
  it("2. Returning public users receive the 7-option menu when requesting main menu", async () => {
    const menuRequests = ["menu", "/menu", "main menu", "show menu", "open menu", "options", "quick options", "help", "/help", "home", "welcome", "back to menu"];

    for (const text of menuRequests) {
      const res = await routeIncomingMessage({
        text,
        mode: "public",
        chatId: TEST_PUBLIC_USER_1,
        isFirstTimeUser: false,
      });

      assert.equal(res.handled, true, `Main menu trigger '${text}' must be handled for returning user`);
      assert.ok(res.reply.includes("1. 👨‍💻 *About Me*"));
      assert.ok(res.reply.includes("2. 🛠️ *Skills & Technologies*"));
      assert.ok(res.reply.includes("3. 🚀 *My Projects*"));
      assert.ok(res.reply.includes("4. 💼 *Experience & Internships*"));
      assert.ok(res.reply.includes("5. 📄 *Portfolio & Resume*"));
      assert.ok(res.reply.includes("6. 💬 *Ask Me Anything*"));
      assert.ok(res.reply.includes("7. 📬 *Contact & Connect*"));

      assert.ok(!res.reply.includes("My Tasks"), "Must not contain 'My Tasks'");
      assert.ok(!res.reply.includes("My Notes"), "Must not contain 'My Notes'");
    }
  });

  // =========================================================================
  // 3. OPTION 3 OPENS VERIFIED PROJECT EXPLORER & DETAILS SHOW 7 OPTIONS
  // =========================================================================
  it("3. Option 3 opens verified project explorer and project detail renders 7 quick options", async () => {
    // 3.1 Trigger option 3
    const listRes = await routeIncomingMessage({
      text: "3",
      mode: "public",
      chatId: TEST_PUBLIC_USER_1,
      isFirstTimeUser: false,
    });

    assert.equal(listRes.handled, true);
    assert.ok(listRes.reply.includes("Featured Public Projects"));
    assert.ok(listRes.reply.includes("DHUSHYANDH AI"));
    assert.ok(listRes.reply.includes("Sri Guru Coaching Centre"));
    assert.ok(!listRes.reply.includes("RenewX"), "Private project must not leak");

    // Check that state entered project_explorer
    const state = await getState(TEST_PUBLIC_USER_1);
    assert.ok(state);
    assert.equal(state.flow, "project_explorer");

    // 3.2 Select Project 1
    const detailRes = await routeIncomingMessage({
      text: "1",
      mode: "public",
      chatId: TEST_PUBLIC_USER_1,
      isFirstTimeUser: false,
    });

    assert.equal(detailRes.handled, true);
    assert.ok(detailRes.reply.includes("DHUSHYANDH AI"));
    assert.ok(detailRes.reply.includes("*Purpose:*"));
    assert.ok(detailRes.reply.includes("*Main Features:*"));
    assert.ok(detailRes.reply.includes("*Technology Stack:*"));
    assert.ok(detailRes.reply.includes("1. 👨‍💻 *About Me*"));
    assert.ok(detailRes.reply.includes("2. 🛠️ *Skills & Technologies*"));
    assert.ok(detailRes.reply.includes("3. 🚀 *My Projects*"));
    assert.ok(detailRes.reply.includes("4. 💼 *Experience & Internships*"));
    assert.ok(detailRes.reply.includes("5. 📄 *Portfolio & Resume*"));
    assert.ok(detailRes.reply.includes("6. 💬 *Ask Me Anything*"));
    assert.ok(detailRes.reply.includes("7. 📬 *Contact & Connect*"));

    // State cleared after selection
    const clearedState = await getState(TEST_PUBLIC_USER_1);
    assert.equal(clearedState, null);
  });

  // =========================================================================
  // 4. NATURAL-LANGUAGE QUESTIONS BYPASS THE MENU
  // =========================================================================
  it("4. Natural-language questions bypass the menu to allow grounded AI handling", async () => {
    const questions = [
      "What is your experience in mobile app development?",
      "How does the WhatsApp AI assistant architecture work?",
      "Can you build a high-performance REST API with Express?",
      "Where did you complete your degree?",
    ];

    for (const q of questions) {
      const res = await routeIncomingMessage({
        text: q,
        mode: "public",
        chatId: TEST_PUBLIC_USER_1,
        isFirstTimeUser: false,
      });

      // Must NOT be intercepted by the menu router; must fall through for grounded Gemini processing
      assert.equal(
        res.handled,
        false,
        `Question '${q}' must bypass menu routing for grounded AI generation`
      );
    }
  });

  // =========================================================================
  // 5. PRIVATE OWNER MENU UNIFIED TO 7 PORTFOLIO OPTIONS & COMMANDS PRESERVED
  // =========================================================================
  it("5. Private owner commands, unified 7-option menu and /tasks commands work as expected", async () => {
    // 5.1 Owner main menu contains 7 portfolio options and zero productivity clutter
    const ownerMenu = await routeIncomingMessage({
      text: "/menu",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(ownerMenu.handled, true);
    assert.ok(ownerMenu.reply.includes("Welcome to *DHUSHYANDH AI*"));
    assert.ok(ownerMenu.reply.includes("1. 👨‍💻 *About Me*"));
    assert.ok(ownerMenu.reply.includes("2. 🛠️ *Skills & Technologies*"));
    assert.ok(ownerMenu.reply.includes("3. 🚀 *My Projects*"));
    assert.ok(ownerMenu.reply.includes("4. 💼 *Experience & Internships*"));
    assert.ok(ownerMenu.reply.includes("5. 📄 *Portfolio & Resume*"));
    assert.ok(ownerMenu.reply.includes("6. 💬 *Ask Me Anything*"));
    assert.ok(ownerMenu.reply.includes("7. 📬 *Contact & Connect*"));
    assert.ok(!ownerMenu.reply.includes("My Tasks"));
    assert.ok(!ownerMenu.reply.includes("My Notes"));
    assert.ok(!ownerMenu.reply.includes("Daily Summary"));

    // 5.2 Owner option 1 returns About Me
    const aboutRes = await routeIncomingMessage({
      text: "1",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(aboutRes.handled, true);
    assert.ok(aboutRes.reply.includes("About Me — Meet"));

    // 5.3 Owner dedicated /tasks slash command returns tasks list
    const tasksRes = await routeIncomingMessage({
      text: "/tasks",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(tasksRes.handled, true);
    assert.ok(tasksRes.reply.includes("Tasks"));

    // 5.4 Owner preview of public portfolio menu via /public
    const previewRes = await routeIncomingMessage({
      text: "/public",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(previewRes.handled, true);
    assert.ok(previewRes.reply.includes("Welcome to *DHUSHYANDH AI*"));
    assert.ok(previewRes.reply.includes("1. 👨‍💻 *About Me*"));
    assert.ok(previewRes.reply.includes("7. 📬 *Contact & Connect*"));
  });

  // =========================================================================
  // 6. END-TO-END MESSAGE PROCESSOR WITH FIRST-TIME & RETURNING LOGIC
  // =========================================================================
  it("6. End-to-end message processor delivers 7-option public menu with zero duplicate sends", async () => {
    const outboundMessages = [];
    setFetch(async (url, options) => {
      outboundMessages.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: `msg_${Date.now()}` }),
      };
    });

    // 6.1 First-time public message
    const uniqueKey1 = `first_time_${Date.now()}`;
    await processIncomingMessage(
      {
        messageId: uniqueKey1,
        chatId: TEST_PUBLIC_USER_2,
        senderId: TEST_PUBLIC_USER_2,
        senderName: "Visitor",
        text: "hello",
        messageType: "text",
        assistantMode: "public",
        timestamp: Math.floor(Date.now() / 1000),
      },
      `${TEST_PUBLIC_USER_2}:${uniqueKey1}`
    );

    assert.equal(outboundMessages.length, 1);
    assert.ok(outboundMessages[0].text.includes("Welcome to *DHUSHYANDH AI*"));
    assert.ok(outboundMessages[0].text.includes("1. 👨‍💻 *About Me*"));
    assert.ok(outboundMessages[0].text.includes("3. 🚀 *My Projects*"));
    assert.ok(outboundMessages[0].text.includes("7. 📬 *Contact & Connect*"));
    assert.ok(!outboundMessages[0].text.includes("My Tasks"));

    // 6.2 Returning public message requesting "menu"
    const uniqueKey2 = `returning_menu_${Date.now()}`;
    await processIncomingMessage(
      {
        messageId: uniqueKey2,
        chatId: TEST_PUBLIC_USER_2,
        senderId: TEST_PUBLIC_USER_2,
        senderName: "Visitor",
        text: "main menu",
        messageType: "text",
        assistantMode: "public",
        timestamp: Math.floor(Date.now() / 1000),
      },
      `${TEST_PUBLIC_USER_2}:${uniqueKey2}`
    );

    assert.equal(outboundMessages.length, 2);
    assert.ok(outboundMessages[1].text.includes("Welcome to *DHUSHYANDH AI*"));
    assert.ok(outboundMessages[1].text.includes("1. 👨‍💻 *About Me*"));
    assert.ok(outboundMessages[1].text.includes("7. 📬 *Contact & Connect*"));
    assert.ok(!outboundMessages[1].text.includes("My Tasks"));
  });
});

