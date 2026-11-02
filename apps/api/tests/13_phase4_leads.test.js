const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");

const { routeIncomingMessage } = require("../src/modules/assistant/command-router");
const { createLead, listLeads, getLeadById, updateLeadStatus, updateLeadNotes } = require("../src/modules/lead/lead.service");
const Lead = require("../src/modules/lead/lead.model");
const ConversationState = require("../src/modules/conversation/conversation-state.model");
const { getState, clearState } = require("../src/modules/conversation/conversation-state.service");
const { setFetch } = require("../src/modules/openwa/openwa.service");
const { setClient } = require("../src/modules/ai/gemini.service");
const { processIncomingMessage } = require("../src/modules/webhook/message-processor");
const MessageEvent = require("../src/modules/webhook/message-event.model");

const TEST_OWNER = "134613267656901@lid";
const TEST_VISITOR = "919876543210@s.whatsapp.net";

describe("13. Phase 4: Public AI Assistant & Freelance Lead Management", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await Lead.deleteMany({ whatsappChatId: TEST_VISITOR });
    await ConversationState.deleteMany({ chatId: TEST_VISITOR });
  });

  after(async () => {
    await Lead.deleteMany({ whatsappChatId: TEST_VISITOR });
    await ConversationState.deleteMany({ chatId: TEST_VISITOR });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  afterEach(() => {
    setFetch(null);
    setClient(null);
  });

  // --- 1. PUBLIC WELCOME MENU ---
  it("1. Public visitor receives clean welcome menu with 1-7 numbered options", async () => {
    const res = await routeIncomingMessage({
      text: "/start",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(res.handled, true);
    assert.ok(res.reply.includes("Welcome to *DHUSHYANDH AI*"));
    assert.ok(res.reply.includes("1. 👨‍💻 *About Me*"));
    assert.ok(res.reply.includes("2. 🛠️ *Skills & Technologies*"));
    assert.ok(res.reply.includes("3. 🚀 *My Projects*"));
    assert.ok(res.reply.includes("4. 💼 *Experience & Internships*"));
    assert.ok(res.reply.includes("5. 📄 *Portfolio & Resume*"));
    assert.ok(res.reply.includes("6. 💬 *Ask Me Anything*"));
    assert.ok(res.reply.includes("7. 📬 *Contact & Connect*"));
  });

  // --- 2. ABOUT DHUSHYANDH (OPTION 1) ---
  it("2. Public visitor option '1' returns verified bio, skills, and links without private data", async () => {
    const res = await routeIncomingMessage({
      text: "1",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(res.handled, true);
    assert.ok(res.reply.includes("About Dhushyandh") || res.reply.includes("About Me"));
    assert.ok(res.reply.includes("Full-Stack Developer"));
    assert.ok(res.reply.includes("Node.js"));
    assert.ok(res.reply.includes("github.com/dhushyandh"));
    assert.ok(!res.reply.includes("RenewX"), "Private internal infrastructure must not be leaked");
  });

  // --- 3. PROJECT EXPLORER (OPTION 3) ---
  it("3. Public visitor option '3' initiates project explorer and allows number selection", async () => {
    // 3.1 List projects
    const listRes = await routeIncomingMessage({
      text: "3",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(listRes.handled, true);
    assert.ok(listRes.reply.includes("Featured Public Projects"));
    assert.ok(listRes.reply.includes("DHUSHYANDH AI"));
    assert.ok(!listRes.reply.includes("RenewX"), "Private project RenewX must be excluded");

    // Verify conversation state transitioned to project_explorer
    const state = await getState(TEST_VISITOR);
    assert.ok(state);
    assert.equal(state.flow, "project_explorer");

    // 3.2 Select Project 1
    const detailRes = await routeIncomingMessage({
      text: "1",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(detailRes.handled, true);
    assert.ok(detailRes.reply.includes("DHUSHYANDH AI"));
    assert.ok(detailRes.reply.includes("Tech Stack:"));
    assert.ok(!detailRes.reply.includes("Blockers:"), "Blockers must not be exposed to public users");

    // State should now be cleared
    const clearedState = await getState(TEST_VISITOR);
    assert.equal(clearedState, null);
  });

  // --- 4. SERVICES CATALOGUE ---
  it("4. Public visitor typing 'services' returns verified development services catalogue", async () => {
    const res = await routeIncomingMessage({
      text: "services",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(res.handled, true);
    assert.ok(res.reply.includes("Available Development Services"));
    assert.ok(res.reply.includes("Full-Stack Web Development"));
    assert.ok(res.reply.includes("Mobile Application Development"));
    assert.ok(res.reply.includes("AI Integration and Automation"));
    assert.ok(res.reply.includes("Pricing depends on scope"));
  });

  // --- 5. COMPLETE CONVERSATIONAL LEAD CAPTURE FLOW ---
  it("5. Full multi-step conversational lead capture with confirmation and owner notification", async () => {
    // Mock OpenWA outbound dispatch to capture owner notification
    const outboundNotifications = [];
    setFetch(async (url, options) => {
      outboundNotifications.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "mock_lead_notify" }),
      };
    });

    // Step 0: Start lead capture
    const step0 = await routeIncomingMessage({
      text: "hire",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step0.handled, true);
    assert.ok(step0.reply.includes("What is your name?"));

    // Step 1: Name
    const step1 = await routeIncomingMessage({
      text: "Alice Smith",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step1.handled, true);
    assert.ok(step1.reply.includes("Alice Smith"));
    assert.ok(step1.reply.includes("What type of project"));

    // Step 2: Service
    const step2 = await routeIncomingMessage({
      text: "WhatsApp Bot & AI Automation",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step2.handled, true);
    assert.ok(step2.reply.includes("describe your project requirements"));

    // Step 3: Requirements
    const step3 = await routeIncomingMessage({
      text: "Need an automated customer support bot with knowledge retrieval for dental clinic",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step3.handled, true);
    assert.ok(step3.reply.includes("budget range"));

    // Step 4: Budget
    const step4 = await routeIncomingMessage({
      text: "$2,000 - $3,500",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step4.handled, true);
    assert.ok(step4.reply.includes("When would you like to get started"));

    // Step 5: Timeline
    const step5 = await routeIncomingMessage({
      text: "Next 2 weeks",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step5.handled, true);
    assert.ok(step5.reply.includes("email address"));

    // Step 6: Email
    const step6 = await routeIncomingMessage({
      text: "alice.smith@example.com",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step6.handled, true);
    assert.ok(step6.reply.includes("Please confirm your project details"));
    assert.ok(step6.reply.includes("Alice Smith"));
    assert.ok(step6.reply.includes("alice.smith@example.com"));

    // Step 7: Confirm submission
    const step7 = await routeIncomingMessage({
      text: "yes",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(step7.handled, true);
    assert.ok(step7.reply.includes("Thank you, Alice Smith! 🎉"));

    // Verify lead record created in MongoDB
    const lead = await Lead.findOne({ whatsappChatId: TEST_VISITOR });
    assert.ok(lead);
    assert.equal(lead.name, "Alice Smith");
    assert.equal(lead.email, "alice.smith@example.com");
    assert.equal(lead.serviceRequested, "WhatsApp Bot & AI Automation");
    assert.equal(lead.status, "new");
    assert.ok(lead.leadNumber >= 1);

    // Verify owner was notified via WhatsApp
    assert.equal(outboundNotifications.length, 1);
    assert.ok(outboundNotifications[0].text.includes("New Freelance Lead Received!"));
    assert.ok(outboundNotifications[0].text.includes("Alice Smith"));
    assert.ok(outboundNotifications[0].text.includes("alice.smith@example.com"));

    // Verify state was cleared
    const state = await getState(TEST_VISITOR);
    assert.equal(state, null);
  });

  // --- 6. LEAD CANCELLATION ---
  it("6. Lead collection can be cancelled at any step", async () => {
    // Start flow
    await routeIncomingMessage({ text: "hire", mode: "public", chatId: TEST_VISITOR });
    await routeIncomingMessage({ text: "Bob", mode: "public", chatId: TEST_VISITOR });

    // Cancel flow
    const cancelRes = await routeIncomingMessage({
      text: "cancel",
      mode: "public",
      chatId: TEST_VISITOR,
    });

    assert.equal(cancelRes.handled, true);
    assert.ok(cancelRes.reply.includes("cancelled"));

    const state = await getState(TEST_VISITOR);
    assert.equal(state, null);
  });

  // --- 7. OWNER LEAD MANAGEMENT COMMANDS ---
  it("7. Owner commands: /leads, /lead <id>, /lead status, /lead notes", async () => {
    const lead = await Lead.findOne({ whatsappChatId: TEST_VISITOR });
    assert.ok(lead);

    // 7.1 List all leads
    const leadsList = await routeIncomingMessage({
      text: "/leads",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(leadsList.handled, true);
    assert.ok(leadsList.reply.includes("Freelance Leads"));
    assert.ok(leadsList.reply.includes(lead.name));

    // 7.2 View lead detail
    const leadDetail = await routeIncomingMessage({
      text: `/lead ${lead.leadNumber}`,
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(leadDetail.handled, true);
    assert.ok(leadDetail.reply.includes(`Lead #${lead.leadNumber} Details`));
    assert.ok(leadDetail.reply.includes(lead.name));

    // 7.3 Update lead status to contacted
    const statusUpdate = await routeIncomingMessage({
      text: `/lead status ${lead.leadNumber} contacted`,
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(statusUpdate.handled, true);
    assert.ok(statusUpdate.reply.includes("Status Updated"));
    assert.ok(statusUpdate.reply.includes("CONTACTED"));

    // Verify status updated in database
    const updatedLead = await Lead.findById(lead._id);
    assert.equal(updatedLead.status, "contacted");

    // 7.4 Add internal owner notes
    const notesUpdate = await routeIncomingMessage({
      text: `/lead notes ${lead.leadNumber} Client prefers demo on Zoom next Monday`,
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(notesUpdate.handled, true);
    assert.ok(notesUpdate.reply.includes("Notes Updated"));
    assert.ok(notesUpdate.reply.includes("Client prefers demo"));

    const withNotes = await Lead.findById(lead._id);
    assert.ok(withNotes.notes.includes("Client prefers demo"));
  });

  // --- 8. PUBLIC / PRIVATE SECURITY ISOLATION ---
  it("8. Public visitor is strictly forbidden from accessing /leads or owner commands", async () => {
    const forbiddenCommands = ["/leads", "/leads new", "/lead 1", "/lead status 1 contacted", "/lead notes 1 secret"];

    for (const cmd of forbiddenCommands) {
      const res = await routeIncomingMessage({
        text: cmd,
        mode: "public",
        chatId: TEST_VISITOR,
      });

      assert.equal(res.handled, true);
      assert.ok(
        res.reply.includes("professional AI assistant") || res.reply.includes("professional portfolio assistant"),
        `Command '${cmd}' must be blocked for public users`
      );
      assert.ok(!res.reply.includes("Freelance Leads"), "Leads must never be shown to public users");
      assert.ok(!res.reply.includes("Alice Smith"), "Client names must never leak");
    }
  });

  // --- 9. END-TO-END PUBLIC ROUTING WITH NO DUPLICATE MESSAGES ---
  it("9. End-to-end message processor handles public welcome with zero duplicate sends", async () => {
    const outboundMessages = [];
    setFetch(async (url, options) => {
      outboundMessages.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "mock_e2e_pub" }),
      };
    });

    const uniqueMsgId = `pub_welcome_${Date.now()}`;
    const eventKey = `${TEST_VISITOR}:${uniqueMsgId}`;

    await processIncomingMessage(
      {
        messageId: uniqueMsgId,
        chatId: TEST_VISITOR,
        senderId: TEST_VISITOR,
        senderName: "Visitor",
        text: "hello",
        messageType: "text",
        assistantMode: "public",
        timestamp: Math.floor(Date.now() / 1000),
      },
      eventKey
    );

    assert.equal(outboundMessages.length, 1);
    assert.ok(outboundMessages[0].text.includes("Welcome to *DHUSHYANDH AI*"));

    const record = await MessageEvent.findOne({ eventKey });
    assert.ok(record);
    assert.equal(record.status, "sent");
    assert.equal(record.selectedModel, "direct_router");
  });
});
