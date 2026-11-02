const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");

const { routeIncomingMessage } = require("../src/modules/assistant/command-router");
const { sanitizeResponse, formatMainMenu } = require("../src/modules/ui/response-formatter");
const { createTask, listTasks, markTaskCompleted, deleteTask } = require("../src/modules/task/task.service");
const Task = require("../src/modules/task/task.model");
const { createNote, listNotes, searchNotes, deleteNote } = require("../src/modules/note/note.service");
const Note = require("../src/modules/note/note.model");
const {
  updateProjectStatus,
  addProjectMilestone,
  addProjectBlocker,
  addProjectDecision,
  getProjectBySlug,
} = require("../src/modules/knowledge/project.service");
const Project = require("../src/modules/knowledge/project.model");
const {
  createReminder,
  processDueReminders,
  listPendingReminders,
} = require("../src/modules/reminder/reminder.service");
const Reminder = require("../src/modules/reminder/reminder.model");
const { generateDailySummary } = require("../src/modules/summary/daily-summary.service");
const { processIncomingMessage } = require("../src/modules/webhook/message-processor");
const { setFetch } = require("../src/modules/openwa/openwa.service");
const { setClient } = require("../src/modules/ai/gemini.service");
const MessageEvent = require("../src/modules/webhook/message-event.model");

const TEST_OWNER = "134613267656901@lid";
const TEST_STRANGER = "919999999999@s.whatsapp.net";

describe("12. Phase 3: Personal AI Assistant, Task Management & UX", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    // Clean up test data
    await Task.deleteMany({ ownerChatId: TEST_OWNER });
    await Note.deleteMany({ ownerChatId: TEST_OWNER });
    await Reminder.deleteMany({ ownerChatId: TEST_OWNER });
  });

  after(async () => {
    await Task.deleteMany({ ownerChatId: TEST_OWNER });
    await Note.deleteMany({ ownerChatId: TEST_OWNER });
    await Reminder.deleteMany({ ownerChatId: TEST_OWNER });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  afterEach(() => {
    setFetch(null);
    setClient(null);
  });

  // --- 1. RESPONSE FORMATTING & SANITIZATION ---
  it("1. Response formatter sanitizes port numbers, internal URLs, stack traces and excessive markdown", () => {
    const rawDirtyMessage =
      "Connected to http://127.0.0.1:2786 and port :5000 with host.docker.internal. Error: test error at /app/src/index.js. ****Bold text****";
    const cleaned = sanitizeResponse(rawDirtyMessage);

    assert.ok(!cleaned.includes("127.0.0.1:2786"), "Port 2786 must be sanitized");
    assert.ok(!cleaned.includes(":5000"), "Port 5000 must be sanitized");
    assert.ok(!cleaned.includes("host.docker.internal"), "Internal hostname must be sanitized");
    assert.ok(!cleaned.includes("at /app/src/index.js"), "Stack trace must be removed");
    assert.ok(!cleaned.includes("****"), "Excessive bolding must be normalized");
  });

  // --- 2. MAIN MENU & NUMBERED NAVIGATION ---
  it("2. Main menu renders numbered navigation options and handles user option '1'", async () => {
    const menuResult = await routeIncomingMessage({
      text: "/menu",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(menuResult.handled, true);
    assert.ok(menuResult.reply.includes("DHUSHYANDH AI"));
    assert.ok(menuResult.reply.includes("1. 👨‍💻 *About Me*"));
    assert.ok(menuResult.reply.includes("2. 🛠️ *Skills & Technologies*"));
    assert.ok(menuResult.reply.includes("3. 🚀 *My Projects*"));
    assert.ok(menuResult.reply.includes("4. 💼 *Experience & Internships*"));
    assert.ok(menuResult.reply.includes("5. 📄 *Portfolio & Resume*"));
    assert.ok(menuResult.reply.includes("6. 💬 *Ask Me Anything*"));
    assert.ok(menuResult.reply.includes("7. 📬 *Contact & Connect*"));

    // User chooses option '1'
    const choice1 = await routeIncomingMessage({
      text: "1",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(choice1.handled, true);
    assert.ok(choice1.reply.includes("About Me — Meet"));
  });

  // --- 3. TASK CRUD & NATURAL LANGUAGE ---
  it("3. Task CRUD operations and natural language creation & completion", async () => {
    // 3.1 Create task via command
    const task1 = await createTask({
      title: "Write integration tests for Phase 3",
      priority: "high",
      ownerChatId: TEST_OWNER,
    });
    assert.ok(task1._id);
    assert.equal(task1.status, "pending");

    // 3.2 Natural language task creation
    const nlAdd = await routeIncomingMessage({
      text: "Remind me to finish NotifyFlow API tomorrow",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(nlAdd.handled, true);
    assert.ok(nlAdd.reply.includes("Task Added!"));
    assert.ok(nlAdd.reply.includes("NotifyFlow API"));

    // 3.3 List pending tasks
    const pending = await listTasks({ ownerChatId: TEST_OWNER, status: "pending" });
    assert.ok(pending.length >= 2);

    // 3.4 Mark task completed via natural language
    const nlDone = await routeIncomingMessage({
      text: "Mark the NotifyFlow API task as completed",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(nlDone.handled, true);
    assert.ok(nlDone.reply.includes("Task Completed!"));

    // Verify status updated in MongoDB
    const updated = await Task.findOne({ ownerChatId: TEST_OWNER, title: /NotifyFlow/ });
    assert.equal(updated.status, "completed");
    assert.ok(updated.completedAt);
  });

  // --- 4. HIGH PRIORITY TASKS FILTER ---
  it("4. High-priority tasks query filters urgent and high tasks", async () => {
    await createTask({
      title: "Fix critical production security bug",
      priority: "urgent",
      ownerChatId: TEST_OWNER,
    });

    const routeRes = await routeIncomingMessage({
      text: "What are my high-priority tasks?",
      mode: "private",
      chatId: TEST_OWNER,
    });

    assert.equal(routeRes.handled, true);
    assert.ok(routeRes.reply.includes("High & Urgent Priority Tasks"));
    assert.ok(routeRes.reply.includes("Fix critical production security bug"));
  });

  // --- 5. NOTE CRUD & NATURAL LANGUAGE ---
  it("5. Note creation, search, and natural language capture", async () => {
    // 5.1 Natural language note creation
    const nlNote = await routeIncomingMessage({
      text: "Save this note: Need to investigate Gemini response latency",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(nlNote.handled, true);
    assert.ok(nlNote.reply.includes("Saved your note ✅"));
    assert.ok(nlNote.reply.includes("Gemini response latency"));

    // 5.2 Search notes
    const searchRes = await routeIncomingMessage({
      text: "/notes search latency",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(searchRes.handled, true);
    assert.ok(searchRes.reply.includes("Saved Notes"));
    assert.ok(searchRes.reply.includes("latency"));

    // 5.3 View recent notes list
    const listRes = await routeIncomingMessage({
      text: "/notes",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(listRes.handled, true);
    assert.ok(listRes.reply.includes("Saved Notes"));
  });

  // --- 6. PROJECT MANAGEMENT UPDATES ---
  it("6. Project status, milestones, and architecture decisions", async () => {
    // Update project status
    const updatedProj = await updateProjectStatus("dhushyandh-ai", "active");
    assert.equal(updatedProj.status, "active");

    // Add milestone
    await addProjectMilestone("dhushyandh-ai", { title: "Phase 3 WhatsApp UX", status: "completed" });

    // Add decision
    await addProjectDecision("dhushyandh-ai", {
      decision: "Clean Numbered WhatsApp Menus",
      rationale: "Guarantees 100% device compatibility across all WhatsApp versions without Baileys button deprecation risks.",
    });

    const proj = await getProjectBySlug("dhushyandh-ai", { mode: "private" });
    assert.ok(proj.milestones.some((m) => m.title === "Phase 3 WhatsApp UX"));
    assert.ok(proj.importantDecisions.some((d) => d.decision === "Clean Numbered WhatsApp Menus"));

    // View project via router
    const projDetail = await routeIncomingMessage({
      text: "/project dhushyandh-ai",
      mode: "private",
      chatId: TEST_OWNER,
    });
    assert.equal(projDetail.handled, true);
    assert.ok(projDetail.reply.includes("DHUSHYANDH AI"));
    assert.ok(projDetail.reply.includes("ACTIVE"));
  });

  // --- 7. DAILY SUMMARY ---
  it("7. Daily summary aggregates pending tasks, projects and reminders", async () => {
    const summary = await generateDailySummary({ ownerChatId: TEST_OWNER });
    assert.ok(summary.includes("Daily Briefing"));
    assert.ok(summary.includes("Tasks"));
    assert.ok(summary.includes("Active Projects Focus"));
  });

  // --- 8. REMINDER PERSISTENCE, SCHEDULING & DEDUPLICATION ---
  it("8. Reminder persistence, atomic due processing and crash recovery", async () => {
    const pastDue = new Date(Date.now() - 5000); // 5 seconds in the past
    const reminder = await createReminder({
      title: "Deploy Phase 3 backend update",
      dueAt: pastDue,
      ownerChatId: TEST_OWNER,
      chatId: TEST_OWNER,
    });

    assert.equal(reminder.status, "pending");

    // Mock OpenWA outbound send
    const dispatched = [];
    setFetch(async (url, options) => {
      dispatched.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "wa_reminder_msg_1" }),
      };
    });

    // Run sweep: should process the overdue reminder
    const count = await processDueReminders();
    assert.equal(count, 1, "Should dispatch exactly 1 due reminder");
    assert.equal(dispatched.length, 1);
    assert.ok(dispatched[0].text.includes("Deploy Phase 3 backend update"));

    // Verify reminder is now marked 'sent'
    const updatedRem = await Reminder.findById(reminder._id);
    assert.equal(updatedRem.status, "sent");
    assert.ok(updatedRem.sentAt);

    // Duplicate prevention: running sweep again should find 0 due reminders
    const secondSweep = await processDueReminders();
    assert.equal(secondSweep, 0, "No duplicate reminder dispatch on subsequent sweeps");
    assert.equal(dispatched.length, 1, "Dispatched count remains 1");
  });

  // --- 9. SECURITY & PUBLIC/PRIVATE ISOLATION ---
  it("9. Public user is strictly denied access to tasks, notes, daily summary and private commands", async () => {
    const privateCommandsFromPublic = ["/tasks", "/notes", "/daily", "/remind", "/reminders", "/memories"];

    for (const cmd of privateCommandsFromPublic) {
      const res = await routeIncomingMessage({
        text: cmd,
        mode: "public",
        chatId: TEST_STRANGER,
      });

      assert.equal(res.handled, true);
      assert.ok(
        res.reply.includes("professional portfolio assistant"),
        `Command '${cmd}' must return public portfolio response to strangers`
      );
      assert.ok(!res.reply.includes("Write integration tests"), "No private tasks leaked");
      assert.ok(!res.reply.includes("Saved Notes"), "No private notes leaked");
    }
  });

  // --- 10. END-TO-END WORKFLOW & ZERO DUPLICATE OUTBOUND SENDS ---
  it("10. End-to-end message processing dispatches exactly one clean WhatsApp response", async () => {
    const sentCalls = [];
    setFetch(async (url, options) => {
      sentCalls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "mock_e2e_phase3" }),
      };
    });

    const uniqueMsgId = `phase3_e2e_${Date.now()}`;
    const eventKey = `${TEST_OWNER}:${uniqueMsgId}`;

    await processIncomingMessage(
      {
        messageId: uniqueMsgId,
        chatId: TEST_OWNER,
        senderId: TEST_OWNER,
        senderName: "Dhushyandh",
        text: "/menu",
        messageType: "text",
        assistantMode: "private",
        timestamp: Math.floor(Date.now() / 1000),
      },
      eventKey
    );

    // Exactly one outbound WhatsApp sendText must be dispatched
    assert.equal(sentCalls.length, 1);
    assert.ok(sentCalls[0].text.includes("Welcome to *DHUSHYANDH AI*"));

    // Database record must be marked 'sent'
    const record = await MessageEvent.findOne({ eventKey });
    assert.ok(record);
    assert.equal(record.status, "sent");
    assert.equal(record.selectedModel, "direct_router");
  });
});
