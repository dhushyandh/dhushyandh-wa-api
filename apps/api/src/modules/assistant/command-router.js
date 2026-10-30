const {
  formatMainMenu,
  formatTaskList,
  formatTaskConfirmation,
  formatNoteList,
  formatNoteConfirmation,
  formatProjectList,
  formatProjectDetails,
  formatPublicWelcome,
  formatAboutOwner,
  formatPublicProjects,
  formatServiceCatalogue,
  formatLeadConfirmation,
  formatLeadSuccess,
  formatOwnerLeadsList,
  formatOwnerLeadDetail,
} = require("../ui/response-formatter");
const {
  createTask,
  listTasks,
  markTaskCompleted,
  deleteTask,
} = require("../task/task.service");
const {
  createNote,
  listNotes,
  searchNotes,
  deleteNote,
} = require("../note/note.service");
const {
  getProjects,
  getProjectBySlug,
} = require("../knowledge/project.service");
const { getProfile } = require("../knowledge/owner-profile.service");
const {
  createReminder,
  listPendingReminders,
} = require("../reminder/reminder.service");
const { generateDailySummary } = require("../summary/daily-summary.service");
const { getMemories } = require("../memory/memory.service");
const {
  createLead,
  listLeads,
  getLeadById,
  updateLeadStatus,
  updateLeadNotes,
} = require("../lead/lead.service");
const {
  getState,
  setState,
  clearState,
} = require("../conversation/conversation-state.service");
const path = require("path");
const fs = require("fs");
const logger = require("../../utils/logger");

/**
 * Natural Language and Command Router for DHUSHYANDH AI
 * Handles both public visitor interactions (welcome menu, project explorer, lead capture)
 * and private owner commands (tasks, notes, reminders, projects, leads).
 */
async function routeIncomingMessage({ text, mode, chatId }) {
  if (!text || typeof text !== "string") {
    return { handled: false };
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // =========================================================================
  // 1. ACTIVE CONVERSATION STATE HANDLING (GUIDED FLOWS)
  // =========================================================================
  const activeState = await getState(chatId);

  // 1.1 Lead Capture Flow
  if (activeState && activeState.flow === "lead_capture") {
    if (/^(cancel|exit|abort|stop)$/i.test(raw)) {
      await clearState(chatId);
      return {
        handled: true,
        reply: "Lead inquiry cancelled. Let me know if there's anything else I can help you with! 👋",
      };
    }

    const { step, data = {} } = activeState;

    if (step === "name") {
      data.name = raw;
      await setState(chatId, { flow: "lead_capture", step: "service", data });
      return {
        handled: true,
        reply: `Nice to meet you, *${data.name}*! 👋\n\nWhat type of project or service do you need?\n_(e.g. Full-Stack Web App, WhatsApp Bot, AI Integration, Backend API)_`,
      };
    }

    if (step === "service") {
      data.serviceRequested = raw;
      await setState(chatId, { flow: "lead_capture", step: "requirements", data });
      return {
        handled: true,
        reply: `Got it! Can you briefly describe your project requirements or what you are looking to build?`,
      };
    }

    if (step === "requirements") {
      data.projectDescription = raw;
      await setState(chatId, { flow: "lead_capture", step: "budget", data });
      return {
        handled: true,
        reply: `What is your expected budget range for this project?\n_(Optional — reply with an amount like '$1,000 - $2,000', or type 'skip')_`,
      };
    }

    if (step === "budget") {
      data.budgetRange = /^(skip|none|no|na)$/i.test(raw) ? "Flexible / Not specified" : raw;
      await setState(chatId, { flow: "lead_capture", step: "timeline", data });
      return {
        handled: true,
        reply: `When would you like to get started with the project?\n_(Optional — e.g. 'Immediately', 'Next 2 weeks', or 'skip')_`,
      };
    }

    if (step === "timeline") {
      data.expectedTimeline = /^(skip|none|no|na)$/i.test(raw) ? "Flexible" : raw;
      await setState(chatId, { flow: "lead_capture", step: "email", data });
      return {
        handled: true,
        reply: `Would you like to share your email address so Dhushyandh can send documentation or project proposals?\n_(Optional — reply with your email, or 'skip')_`,
      };
    }

    if (step === "email") {
      data.email = /^(skip|none|no|na)$/i.test(raw) ? "" : raw;
      await setState(chatId, { flow: "lead_capture", step: "confirm", data });
      return {
        handled: true,
        reply: formatLeadConfirmation(data),
      };
    }

    if (step === "confirm") {
      if (/^(yes|confirm|submit|yep|sure|y)$/i.test(raw)) {
        await createLead({
          name: data.name,
          whatsappChatId: chatId,
          email: data.email,
          serviceRequested: data.serviceRequested,
          projectDescription: data.projectDescription,
          budgetRange: data.budgetRange,
          expectedTimeline: data.expectedTimeline,
          source: "whatsapp",
        });
        await clearState(chatId);
        return {
          handled: true,
          reply: formatLeadSuccess(data.name),
        };
      } else if (/^(no|cancel|abort)$/i.test(raw)) {
        await clearState(chatId);
        return {
          handled: true,
          reply: "Lead inquiry cancelled. Feel free to reach out anytime!",
        };
      } else {
        return {
          handled: true,
          reply: "Please reply *yes* to submit your project request to Dhushyandh, or *cancel* to abort.",
        };
      }
    }
  }

  // 1.2 Project Explorer Flow
  if (activeState && activeState.flow === "project_explorer") {
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1) {
      const publicProjects = await getProjects({ mode: "public" });
      if (publicProjects && publicProjects.length >= num) {
        const selected = publicProjects[num - 1];
        await clearState(chatId);
        return {
          handled: true,
          reply: formatProjectDetails(selected, false),
        };
      }
    }
    await clearState(chatId);
  }

  // =========================================================================
  // 2. PUBLIC MODE ROUTING & NUMBERED MENU
  // =========================================================================
  if (mode !== "private") {
    // 2.1 Public Welcome Menu
    if (/^(\/start|\/menu|menu|hi|hello|hey|help)$/i.test(raw)) {
      return {
        handled: true,
        reply: formatPublicWelcome("Dhushyandh"),
      };
    }

    // 2.2 Option 1: About Dhushyandh / Who is Dhushyandh
    if (
      raw === "1" ||
      /^(about|about dhushyandh|who is dhushyandh|meet dhushyandh|tell me about dhushyandh)\??$/i.test(lower)
    ) {
      const profile = await getProfile({ mode: "public" });
      const ogImagePath = path.join(__dirname, "../../../assets/og-image.png");
      let base64 = "";
      try {
        if (fs.existsSync(ogImagePath)) {
          base64 = fs.readFileSync(ogImagePath).toString("base64");
        }
      } catch (err) {
        logger.warn("Could not read local og-image.png", { error: err.message });
      }

      return {
        handled: true,
        sendImageBefore: {
          url: "https://dhushyandh.in/og-image.png",
          base64: base64 || undefined,
          mimetype: "image/png",
        },
        reply: formatAboutOwner(profile),
      };
    }

    // 2.2.1 Mobile App Developer Query
    if (/is\s+he\s+a\s+mobile\s+app\s+developer|mobile\s+app\s+developer|does\s+he\s+build\s+mobile\s+apps/i.test(lower)) {
      return {
        handled: true,
        reply: [
          "📱 *Mobile Application Development*",
          "━━━━━━━━━━━━━━━━━━━━",
          "Yes! Dhushyandh N. is an experienced Mobile App Developer as well as a Full-Stack Developer. 🚀",
          "",
          "He builds cross-platform mobile applications using Capacitor, React, and Android build pipelines. He has developed mobile packages for the Dhushyandh Portfolio app and mobile-ready commerce architectures.",
          "",
          "🌐 Portfolio: https://dhushyandh.in",
          "💻 GitHub: https://github.com/dhushyandh",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "📌 *Options:*",
          "1. 👨‍💻 *About Dhushyandh*",
          "2. 🚀 *Explore Projects*",
          "3. 🛠️ *Development Services*",
          "4. 💼 *Hire for a Mobile App*",
          "🏠 Reply *menu* for Main Menu",
        ].join("\n"),
      };
    }

    // 2.3 Option 2: Explore Projects / Where can I see his work
    if (
      raw === "2" ||
      /^(explore projects|projects|portfolio|show (?:his )?projects|where can i see (?:his )?work|see (?:his )?work)\??$/i.test(lower)
    ) {
      const projects = await getProjects({ mode: "public" });
      await setState(chatId, { flow: "project_explorer", step: "select", data: {} });
      return {
        handled: true,
        reply: formatPublicProjects(projects),
      };
    }

    // 2.4 Option 3: Development Services / What services does he provide
    if (
      raw === "3" ||
      /^(services|development services|what services does he provide|what services are available)\??$/i.test(lower)
    ) {
      const profile = await getProfile({ mode: "public" });
      return {
        handled: true,
        reply: formatServiceCatalogue(profile?.services || []),
      };
    }

    // 2.5 Option 4: Hire / Work Together / Can I hire him
    if (
      raw === "4" ||
      /^(hire|work together|contact|lead|quote|can i hire him|how to hire him)\??$/i.test(lower)
    ) {
      await setState(chatId, { flow: "lead_capture", step: "name", data: {} });
      return {
        handled: true,
        reply: [
          "💼 *Hire Dhushyandh / Start a Project*",
          "━━━━━━━━━━━━━━━━━━━━",
          "Dhushyandh is available for freelance projects, custom software development, mobile apps, and consulting. 🚀",
          "",
          "Let's get a few quick details about your project to get started:",
          "",
          "1️⃣ *What is your name?*",
          "_(You can type 'cancel' at any time to exit)_",
        ].join("\n"),
      };
    }

    // 2.6 Option 5: Ask a Question
    if (raw === "5") {
      return {
        handled: true,
        reply: [
          "💬 *Ask AI Anything*",
          "━━━━━━━━━━━━━━━━━━━━",
          "Feel free to ask me anything about Dhushyandh's skills, technical stack, or public projects! Just type your question directly.",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "📌 *Options:*",
          "1. 👨‍💻 *About Dhushyandh*",
          "2. 🚀 *Explore Projects*",
          "3. 🛠️ *Development Services*",
          "4. 💼 *Hire / Work Together*",
          "🏠 Reply *menu* for Main Menu",
        ].join("\n"),
      };
    }

    // 2.7 Block private owner commands from public users
    if (/^\/(task|tasks|note|notes|daily|remind|reminders|memories|lead|leads)\b/i.test(raw)) {
      return {
        handled: true,
        reply: [
          "👋 *Hello! Welcome to DHUSHYANDH AI.*",
          "━━━━━━━━━━━━━━━━━━━━",
          "I am Dhushyandh's professional portfolio assistant. I can answer questions about his skills, projects, and development services.",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "📌 *Options:*",
          "1. 👨‍💻 *About Dhushyandh*",
          "2. 🚀 *Explore Projects*",
          "3. 🛠️ *Development Services*",
          "4. 💼 *Hire / Work Together*",
          "🏠 Reply *menu* for Main Menu",
        ].join("\n"),
      };
    }

    // 2.8 Mode questions in public mode
    if (
      /(?:switch|change)\s+(?:to\s+)?(?:public|private)\s+mode/i.test(lower) ||
      /how\s+do\s+(?:the\s+)?(?:public\s+and\s+private\s+)?modes\s+work/i.test(lower) ||
      /what\s+is\s+private\s+mode/i.test(lower) ||
      /can\s+i\s+(?:switch|access)\s+(?:to\s+)?private\s+mode/i.test(lower)
    ) {
      return {
        handled: true,
        reply: [
          "🔒 *Mode Behavior:*",
          "━━━━━━━━━━━━━━━━━━━━",
          "1. 🌐 *Public Mode:* Public Mode is active for all standard WhatsApp visitors to explore projects, review services, and submit inquiries.",
          "2. 🔐 *Private Mode:* Private Mode is restricted to the authorized owner via verified WhatsApp LID authorization.",
          "",
          "_Manual mode switching is not available. Visitors in Public Mode can explore projects, review services, or submit freelance inquiries._",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "📌 *Options:*",
          "1. 👨‍💻 *About Dhushyandh*",
          "2. 🚀 *Explore Projects*",
          "3. 🛠️ *Development Services*",
          "4. 💼 *Hire / Work Together*",
          "🏠 Reply *menu* for Main Menu",
        ].join("\n"),
      };
    }

    // 2.9 Strict privacy guard for unlisted/private project queries
    if (/\brenewx\b/i.test(lower)) {
      return {
        handled: true,
        reply: [
          "🔒 *Project Privacy Notice*",
          "━━━━━━━━━━━━━━━━━━━━",
          "I do not have access to any public project by that name. You can explore verified public projects by typing 2 or 'projects'.",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "📌 *Options:*",
          "1. 👨‍💻 *About Dhushyandh*",
          "2. 🚀 *Explore Projects*",
          "3. 🛠️ *Development Services*",
          "4. 💼 *Hire / Work Together*",
          "🏠 Reply *menu* for Main Menu",
        ].join("\n"),
      };
    }

    // For other questions, let grounded Gemini handle it
    return { handled: false };
  }

  // =========================================================================
  // 3. PRIVATE OWNER MODE DIRECT ROUTING
  // =========================================================================

  // 3.1 MAIN MENU
  if (/^(\/menu|\/start|menu|options|help)$/i.test(raw)) {
    return { handled: true, reply: formatMainMenu("Dhushyandh") };
  }

  // 3.2 MENU NUMERIC CHOICES
  if (raw === "1") {
    const tasks = await listTasks({ ownerChatId: chatId, status: "pending" });
    return { handled: true, reply: formatTaskList(tasks, "Pending") };
  }
  if (raw === "2") {
    const notes = await listNotes({ ownerChatId: chatId, limit: 10 });
    return { handled: true, reply: formatNoteList(notes) };
  }
  if (raw === "3") {
    const projects = await getProjects({ mode: "private" });
    return { handled: true, reply: formatProjectList(projects, true) };
  }
  if (raw === "4") {
    const summary = await generateDailySummary({ ownerChatId: chatId });
    return { handled: true, reply: summary };
  }
  if (raw === "5") {
    return {
      handled: true,
      reply:
        "💬 *Ask AI Anything*\n\nYou can chat with me about architecture, code, ideas, or ask questions about your projects. Just send a message normally!",
    };
  }

  // 3.3 DAILY SUMMARY
  if (/^(\/daily|\/summary|daily\s+summary)$/i.test(raw) || lower === "show what i need to finish today") {
    const summary = await generateDailySummary({ ownerChatId: chatId });
    return { handled: true, reply: summary };
  }

  // 3.4 TASKS COMMANDS & NATURAL LANGUAGE

  // High-priority tasks
  if (
    lower.includes("high-priority tasks") ||
    lower.includes("high priority tasks") ||
    lower.includes("urgent tasks")
  ) {
    const highTasks = await listTasks({ ownerChatId: chatId, status: "pending", priority: "high" });
    const urgentTasks = await listTasks({ ownerChatId: chatId, status: "pending", priority: "urgent" });
    const combined = [...urgentTasks, ...highTasks];
    return { handled: true, reply: formatTaskList(combined, "High & Urgent Priority") };
  }

  // Completed tasks
  if (/^\/tasks\s+completed$/i.test(raw) || lower === "show my completed tasks" || lower === "show completed tasks") {
    const completed = await listTasks({ ownerChatId: chatId, status: "completed" });
    return { handled: true, reply: formatTaskList(completed, "Completed") };
  }

  // Pending tasks list
  if (
    /^(\/tasks|tasks)$/i.test(raw) ||
    lower === "show my tasks" ||
    lower === "show pending tasks" ||
    lower === "show my pending tasks"
  ) {
    const tasks = await listTasks({ ownerChatId: chatId, status: "pending" });
    return { handled: true, reply: formatTaskList(tasks, "Pending") };
  }

  // Mark Task Done
  const doneMatch =
    raw.match(/^\/task\s+done\s+(.+)$/i) ||
    raw.match(/^(?:mark|set)\s+(?:the\s+)?task\s+(.+?)\s+(?:as\s+)?(?:done|completed)$/i) ||
    raw.match(/^mark\s+(.+?)\s+(?:as\s+)?(?:done|completed)$/i);

  if (doneMatch) {
    let query = doneMatch[1].trim();
    query = query.replace(/^the\s+/i, "").replace(/\s+task$/i, "").trim();
    const completedTask = await markTaskCompleted({ identifier: query, ownerChatId: chatId });
    if (!completedTask) {
      return {
        handled: true,
        reply: `⚠️ Could not find a pending task matching: *"${query}"*.\n\nType */tasks* to see your current list.`,
      };
    }
    return { handled: true, reply: formatTaskConfirmation(completedTask, "completed") };
  }

  // Add Task Command & Natural Language
  const addMatch =
    raw.match(/^\/task\s+add\s+(.+)$/i) ||
    raw.match(/^add\s+task\s+(.+)$/i) ||
    raw.match(/^(?:please\s+)?remind\s+me\s+to\s+(.+?)(?:\s+(?:tomorrow|today|next week))?$/i);

  if (addMatch && !lower.startsWith("/remind ")) {
    let title = addMatch[1].trim();
    let priority = "medium";
    let dueDate = null;

    if (/\b(urgent|high|low)\b/i.test(title)) {
      const pMatch = title.match(/\b(urgent|high|low)\b/i);
      priority = pMatch[1].toLowerCase();
    }

    if (lower.includes("tomorrow")) {
      dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      dueDate.setHours(18, 0, 0, 0);
    } else if (lower.includes("today")) {
      dueDate = new Date();
      dueDate.setHours(20, 0, 0, 0);
    }

    title = title.replace(/\s+(?:tomorrow|today|next week)$/i, "").trim();

    const task = await createTask({
      title,
      priority,
      dueDate,
      ownerChatId: chatId,
    });
    return { handled: true, reply: formatTaskConfirmation(task, "created") };
  }

  // Delete Task
  const delTaskMatch = raw.match(/^\/task\s+delete\s+(.+)$/i);
  if (delTaskMatch) {
    const target = delTaskMatch[1].trim();
    const deleted = await deleteTask({ identifier: target, ownerChatId: chatId });
    if (!deleted) {
      return { handled: true, reply: `⚠️ Task not found matching: *"${target}"*` };
    }
    return { handled: true, reply: formatTaskConfirmation(deleted, "deleted") };
  }

  // 3.5 NOTES COMMANDS & NATURAL LANGUAGE

  // Search notes
  const searchMatch = raw.match(/^\/notes\s+search\s+(.+)$/i) || raw.match(/^search\s+notes\s+(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    const results = await searchNotes({ ownerChatId: chatId, query });
    if (results.length === 0) {
      return { handled: true, reply: `🔍 No notes found matching: *"${query}"*` };
    }
    return { handled: true, reply: formatNoteList(results) };
  }

  // View notes
  if (/^(\/notes|notes)$/i.test(raw) || lower === "show my notes") {
    const notes = await listNotes({ ownerChatId: chatId, limit: 10 });
    return { handled: true, reply: formatNoteList(notes) };
  }

  // Add note
  const addNoteMatch =
    raw.match(/^\/note(?:\s+add)?\s+([^|]+)(?:\|\s*(.+))?$/i) ||
    raw.match(/^save(?:\s+this)?\s+note\s*:\s*(.+)$/i);

  if (addNoteMatch) {
    let title = "";
    let content = "";
    let category = "General";

    if (raw.toLowerCase().startsWith("save")) {
      const noteBody = addNoteMatch[1].trim();
      title = noteBody.length > 50 ? noteBody.slice(0, 50) + "..." : noteBody;
      content = noteBody;
      if (lower.includes("gemini") || lower.includes("api") || lower.includes("renewx") || lower.includes("bug")) {
        category = "Technical";
      }
    } else {
      title = addNoteMatch[1].trim();
      content = addNoteMatch[2] ? addNoteMatch[2].trim() : title;
    }

    const note = await createNote({
      title,
      content,
      category,
      ownerChatId: chatId,
    });
    return { handled: true, reply: formatNoteConfirmation(note, "created") };
  }

  // Delete note
  const delNoteMatch = raw.match(/^\/note\s+delete\s+(.+)$/i);
  if (delNoteMatch) {
    const target = delNoteMatch[1].trim();
    const deleted = await deleteNote({ identifier: target, ownerChatId: chatId });
    if (!deleted) {
      return { handled: true, reply: `⚠️ Note not found matching: *"${target}"*` };
    }
    return { handled: true, reply: formatNoteConfirmation(deleted, "deleted") };
  }

  // 3.6 PROJECTS COMMANDS

  // View all projects
  if (/^(\/projects|projects)$/i.test(raw) || lower === "show my projects") {
    const projects = await getProjects({ mode: "private" });
    return { handled: true, reply: formatProjectList(projects, true) };
  }

  // View specific project
  const projectDetailMatch =
    raw.match(/^\/project\s+([a-zA-Z0-9-_]+)$/i) ||
    raw.match(/^(?:what\s+is\s+the\s+)?status\s+of\s+([a-zA-Z0-9-_]+)\??$/i);

  if (projectDetailMatch) {
    const slug = projectDetailMatch[1].trim().toLowerCase();
    const project = await getProjectBySlug(slug, { mode: "private" });
    if (project) {
      return { handled: true, reply: formatProjectDetails(project, true) };
    }
  }

  // 3.7 REMINDERS COMMANDS
  if (/^(\/reminders|reminders)$/i.test(raw)) {
    const pending = await listPendingReminders({ ownerChatId: chatId });
    if (pending.length === 0) {
      return {
        handled: true,
        reply: "⏰ *Reminders*\n\nYou have no active reminders scheduled.\n\nTo schedule one: */remind <title> in <X> mins*",
      };
    }
    const lines = pending.map((r, i) => {
      const time = new Date(r.dueAt).toLocaleString("en-IN", {
        dateStyle: "short",
        timeStyle: "short",
      });
      return `${i + 1}. *${r.title}* — ${time}`;
    });
    return {
      handled: true,
      reply: `⏰ *Active Reminders (${pending.length})*\n\n${lines.join("\n")}`,
    };
  }

  // 3.8 MEMORIES COMMAND
  if (/^(\/memories|show\s+memories)$/i.test(raw)) {
    const mems = await getMemories({ mode: "private", limit: 10 });
    if (mems.length === 0) {
      return { handled: true, reply: "You currently have no stored memories in the knowledge base." };
    }
    const lines = mems.map((m, idx) => `${idx + 1}. [${m.category}] ${m.content}`);
    return { handled: true, reply: `Stored Private Memories (${mems.length}):\n\n${lines.join("\n\n")}` };
  }

  // 3.9 OWNER LEADS MANAGEMENT COMMANDS

  // /leads or /leads new
  if (/^\/leads(\s+new)?$/i.test(raw)) {
    const isNewOnly = Boolean(raw.match(/^\/leads\s+new$/i));
    const leads = await listLeads({ status: isNewOnly ? "new" : "all" });
    return {
      handled: true,
      reply: formatOwnerLeadsList(leads, isNewOnly ? "New" : "All"),
    };
  }

  // /lead status <id> <status>
  const leadStatusMatch = raw.match(/^\/lead\s+status\s+(\S+)\s+(\S+)$/i);
  if (leadStatusMatch) {
    const id = leadStatusMatch[1].trim();
    const newStatus = leadStatusMatch[2].trim();
    try {
      const updated = await updateLeadStatus(id, newStatus);
      if (!updated) {
        return { handled: true, reply: `⚠️ Lead not found matching: *"${id}"*` };
      }
      return {
        handled: true,
        reply: `✅ *Lead #${updated.leadNumber} Status Updated!*\n\nClient: *${updated.name}*\nNew Status: *${updated.status.toUpperCase()}*`,
      };
    } catch (err) {
      return { handled: true, reply: `⚠️ Error: ${err.message}` };
    }
  }

  // /lead notes <id> <notes...>
  const leadNotesMatch = raw.match(/^\/lead\s+notes\s+(\S+)\s+(.+)$/i);
  if (leadNotesMatch) {
    const id = leadNotesMatch[1].trim();
    const notesText = leadNotesMatch[2].trim();
    const updated = await updateLeadNotes(id, notesText);
    if (!updated) {
      return { handled: true, reply: `⚠️ Lead not found matching: *"${id}"*` };
    }
    return {
      handled: true,
      reply: `✅ *Notes Updated for Lead #${updated.leadNumber}*\n\n_${updated.notes}_`,
    };
  }

  // /lead <id> (details)
  const leadDetailMatch = raw.match(/^\/lead\s+(\S+)$/i);
  if (leadDetailMatch) {
    const id = leadDetailMatch[1].trim();
    const lead = await getLeadById(id);
    if (!lead) {
      return { handled: true, reply: `⚠️ Lead not found matching: *"${id}"*` };
    }
    return {
      handled: true,
      reply: formatOwnerLeadDetail(lead),
    };
  }

  // 3.10 PRIVATE/PUBLIC MODE EXPLANATIONS & TESTING GUIDANCE
  if (
    /how\s+(?:can|do|to)?\s*(?:i\s+)?test\s+public\s+mode/i.test(lower) ||
    /^(?:how\s+to\s+test\s+public\s+mode|test\s+public\s+mode)\??$/i.test(lower)
  ) {
    return {
      handled: true,
      reply: [
        "🔍 *To test Public Mode:*",
        "━━━━━━━━━━━━━━━━━━━━",
        "📱 Message the bot from a separate, non-owner WhatsApp account.",
        "",
        "Because Private Mode is automatically authorized for your WhatsApp LID, you cannot switch modes from this account. A separate account will experience the public welcome menu, project explorer, service catalogue, and lead capture flow.",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "📌 *Quick Options:*",
        "1. 📋 *My Tasks*",
        "2. 📝 *My Notes*",
        "3. 🚀 *My Projects*",
        "4. ☀️ *Daily Summary*",
        "🏠 Reply *menu* for Main Menu",
      ].join("\n"),
    };
  }

  if (
    /(?:switch|change)\s+(?:to\s+)?(?:public|private)\s+mode/i.test(lower) ||
    /how\s+do\s+(?:the\s+)?(?:public\s+and\s+private\s+)?modes\s+work/i.test(lower) ||
    /^(?:switch\s+to\s+public\s+mode|can\s+i\s+switch\s+modes|how\s+do\s+i\s+switch\s+modes|how\s+do\s+modes\s+work|explain\s+modes)$/i.test(lower)
  ) {
    return {
      handled: true,
      reply: [
        "🔒 *Mode Behavior:*",
        "━━━━━━━━━━━━━━━━━━━━",
        "1. 🔐 *Private Mode (Active):* Private Mode is automatically active for you based on verified WhatsApp LID authorization.",
        "2. 🌐 *Public Mode:* Public Mode is automatically assigned to all other WhatsApp senders.",
        "",
        "_Manual mode switching is not available because modes are determined strictly by sender identity._",
        "",
        "💡 To test Public Mode, send a message to this bot from a separate, non-owner WhatsApp account.",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "📌 *Quick Options:*",
        "1. 📋 *My Tasks*",
        "2. 📝 *My Notes*",
        "3. 🚀 *My Projects*",
        "4. ☀️ *Daily Summary*",
        "🏠 Reply *menu* for Main Menu",
      ].join("\n"),
    };
  }

  // Not a deterministic command -> Let Gemini AI process with grounded context!
  return { handled: false };
}

module.exports = {
  routeIncomingMessage,
};
