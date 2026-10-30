/**
 * Centralized WhatsApp Response Formatter
 * Formats clean, friendly, polished WhatsApp messages with clean formatting,
 * tasteful emojis, and structured, options-based interactions.
 */

// Patterns to scrub from any outgoing message
const SCRUB_PATTERNS = [
  /127\.0\.0\.1:\d{4,5}/g,
  /localhost:\d{4,5}/g,
  /:\b(2785|2786|5000|27017)\b/g,
  /host\.docker\.internal/g,
  /mongodb(?:\+srv)?:\/\/\S+/gi,
  /AIza[0-9A-Za-z-_]{20,}/g,
  /owa_k1_[0-9a-f]{32,}/gi,
  /Error:\s+[^\n]+at\s+[^\n]+/g, // Stack traces
  /\{[\s\S]*?"(stack|sessionId|operatorKey|apiSecret)"[\s\S]*?\}/gi, // Raw sensitive JSON
];

function sanitizeResponse(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;
  for (const pattern of SCRUB_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[redacted]");
  }

  // Remove excessive markdown bolding (e.g. **** or excessive **)
  cleaned = cleaned.replace(/\*{3,}/g, "*");
  // Normalize repeated empty lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

function formatMainMenu(ownerName = "Dhushyandh") {
  return [
    `👋 *Welcome back, ${ownerName}!*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `I'm *DHUSHYANDH AI*, your personal assistant.`,
    ``,
    `What would you like to do today?`,
    ``,
    `1. 📋 *My Tasks*`,
    `2. 📝 *My Notes*`,
    `3. 🚀 *My Projects*`,
    `4. ☀️ *Daily Summary*`,
    `5. 💬 *Ask AI*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply with a number (1-5) or type a command like */tasks* or */daily*.`,
  ].join("\n");
}

function formatTaskList(tasks = [], category = "Pending") {
  if (!tasks || tasks.length === 0) {
    return [
      `📋 *${category} Tasks*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `You have no ${category.toLowerCase()} tasks right now! Great job! 🎉`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:*`,
      `• Reply */task add <title>* to add a new task`,
      `• Reply *menu* for Main Menu`,
    ].join("\n");
  }

  const lines = tasks.map((t, idx) => {
    const priorityIcon =
      t.priority === "urgent"
        ? "🔴"
        : t.priority === "high"
        ? "🟠"
        : t.priority === "low"
        ? "⚪"
        : "🟡";
    const due = t.dueDate
      ? ` (Due: ${new Date(t.dueDate).toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
        })})`
      : "";
    return `${idx + 1}. ${priorityIcon} *${t.title}*${due}`;
  });

  return [
    `📋 *${category} Tasks (${tasks.length})*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply */task done <number or title>* to complete`,
    `• Reply */task add <title>* to add a new task`,
    `• Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatTaskConfirmation(task, action = "created") {
  const priorityIcon =
    task.priority === "urgent"
      ? "🔴 Urgent"
      : task.priority === "high"
      ? "🟠 High"
      : task.priority === "low"
      ? "⚪ Low"
      : "🟡 Medium";

  if (action === "completed") {
    return [
      `✅ *Task Completed!* 🎉`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*${task.title}*`,
      `Status: Completed`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:* Reply */tasks* to view your list or *menu* for Main Menu.`,
    ].join("\n");
  }

  if (action === "deleted") {
    return [
      `🗑️ *Task Deleted*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Removed: *${task.title}*`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:* Reply */tasks* to view your list or *menu* for Main Menu.`,
    ].join("\n");
  }

  return [
    `✅ *Task ${action === "created" ? "Added" : "Updated"}!*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Title:* ${task.title}`,
    `*Priority:* ${priorityIcon}`,
    task.dueDate
      ? `*Due:* ${new Date(task.dueDate).toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
        })}`
      : null,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply */tasks* to view list or */task done ${task.title}* when completed.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatNoteList(notes = []) {
  if (!notes || notes.length === 0) {
    return [
      `📝 *My Notes*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `You don't have any notes saved yet.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:*`,
      `• Reply */note <title> | <content>* to save a note`,
      `• Reply *menu* for Main Menu`,
    ].join("\n");
  }

  const lines = notes.map((n, idx) => {
    const preview = n.content.length > 60 ? n.content.slice(0, 60) + "..." : n.content;
    return `${idx + 1}. 📌 *${n.title}* [${n.category || "General"}]\n   _${preview}_`;
  });

  return [
    `📝 *Saved Notes (${notes.length})*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply */notes search <query>* to search`,
    `• Reply */note <title> | <content>* to add a note`,
    `• Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatNoteConfirmation(note, action = "created") {
  if (action === "deleted") {
    return [
      `🗑️ *Note Deleted*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Removed: *${note.title}*`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:* Reply */notes* to view notes or *menu* for Main Menu.`,
    ].join("\n");
  }

  return [
    `Saved your note ✅`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Title:* ${note.title}`,
    `*Category:* ${note.category || "General"}`,
    ``,
    `_${note.content.length > 150 ? note.content.slice(0, 150) + "..." : note.content}_`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply */notes* to view all notes or *menu* for Main Menu.`,
  ].join("\n");
}

function formatProjectList(projects = [], isPrivate = false) {
  if (!projects || projects.length === 0) {
    return [
      `🚀 *Projects*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `No projects found.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:* Reply *menu* for Main Menu.`,
    ].join("\n");
  }

  const lines = projects.map((p, idx) => {
    const statusMap = {
      production: "🟢 Live",
      in_development: "🟡 In Dev",
      testing: "🔵 Testing",
      completed: "✅ Done",
      concept: "💡 Concept",
    };
    const statusLabel = statusMap[p.status] || p.status;
    const progress = p.currentProgress ? ` — _${p.currentProgress}_` : "";
    return `${idx + 1}. 🚀 *${p.name}* (${statusLabel})${progress}`;
  });

  return [
    `🚀 *${isPrivate ? "All Projects" : "Public Portfolio"} (${projects.length})*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply */project <name>* for project details`,
    `• Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatProjectDetails(project, isPrivate = false) {
  const statusStr = (project.status || "active").toUpperCase();
  const statusIcon =
    project.status === "production"
      ? "🟢"
      : project.status === "completed"
      ? "✅"
      : "🟡";

  const sections = [
    `🚀 *${project.name}* [${statusIcon} ${statusStr}]`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎯 *Purpose:*`,
    project.problemSolved || project.description,
  ];

  if (project.features && project.features.length > 0) {
    sections.push(``, `✨ *Main Features:*`, ...project.features.map((f) => `• ${f}`));
  }

  if (project.techStack && project.techStack.length > 0) {
    sections.push(
      ``,
      `🛠️ *Technology Stack:* ${project.techStack.join(", ")}`,
      `*Tech Stack:* ${project.techStack.join(", ")}`
    );
  }

  const links = [];
  const liveUrl = project.liveDemoUrl || project.deploymentUrl;
  if (liveUrl && liveUrl.startsWith("http") && !liveUrl.includes("localhost")) {
    links.push(`🌐 Live Demo: ${liveUrl}`);
  }

  if (project.repositoryUrl && project.repositoryUrl.startsWith("http")) {
    links.push(`💻 GitHub: ${project.repositoryUrl}`);
  }

  if (project.mobileAppUrl && project.mobileAppUrl.startsWith("http")) {
    links.push(`📱 Mobile App: ${project.mobileAppUrl}`);
  }

  if (links.length > 0) {
    sections.push(``, `🔗 *Links:*`, ...links);
  }

  if (isPrivate && project.blockers && project.blockers.length > 0) {
    sections.push(``, `⚠️ *Blockers:*`, ...project.blockers.map((b) => `• ${b}`));
  }

  if (isPrivate && project.importantDecisions && project.importantDecisions.length > 0) {
    sections.push(
      ``,
      `💡 *Decisions:*`,
      ...project.importantDecisions.slice(0, 3).map((d) => `• *${d.decision || d.title}:* ${d.rationale || d.rational || ""}`)
    );
  }

  sections.push(
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    isPrivate
      ? `1. 📋 *My Tasks*\n2. 📝 *My Notes*\n3. 🚀 *My Projects*\n🏠 Reply *menu* for Main Menu`
      : `2. 🚀 *Explore Projects*\n3. 🛠️ *Development Services*\n4. 💼 *Hire / Work Together*\n🏠 Reply *menu* for Main Menu`
  );

  return sections.join("\n");
}

function formatDailySummary({ tasks = [], projects = [], reminders = [], dateStr }) {
  const pendingTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const urgentTasks = pendingTasks.filter((t) => t.priority === "urgent" || t.priority === "high");
  const now = new Date();
  const overdueTasks = pendingTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);

  const sections = [
    `☀️ *Daily Briefing — ${dateStr}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Good morning! Here is what is on your plate today:`,
  ];

  if (overdueTasks.length > 0) {
    sections.push(
      ``,
      `🚨 *Overdue Tasks (${overdueTasks.length}):*`,
      ...overdueTasks.map((t) => `• ⚠️ *${t.title}*`)
    );
  }

  if (urgentTasks.length > 0) {
    sections.push(
      ``,
      `🔥 *Top Priority Tasks (${urgentTasks.length}):*`,
      ...urgentTasks.slice(0, 5).map((t) => `• [${t.priority.toUpperCase()}] *${t.title}*`)
    );
  } else if (pendingTasks.length > 0) {
    sections.push(
      ``,
      `📋 *Pending Tasks (${pendingTasks.length}):*`,
      ...pendingTasks.slice(0, 5).map((t) => `• *${t.title}*`)
    );
  } else {
    sections.push(``, `🎉 *Tasks:* No pending tasks today! You are all caught up.`);
  }

  if (reminders && reminders.length > 0) {
    sections.push(
      ``,
      `⏰ *Today's Reminders:*`,
      ...reminders.map(
        (r) =>
          `• ${new Date(r.dueAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}: *${r.title}*`
      )
    );
  }

  if (projects && projects.length > 0) {
    const activeProjects = projects.filter(
      (p) =>
        p.status === "active" ||
        p.status === "in_progress" ||
        p.status === "in_development" ||
        p.status === "testing"
    );
    if (activeProjects.length > 0) {
      sections.push(
        ``,
        `🚀 *Active Projects Focus:*`,
        ...activeProjects.map((p) => `• *${p.name}* (${p.currentProgress || p.status})`)
      );
    }
  }

  sections.push(
    ``,
    `Have a productive day! Let me know if you need to update anything.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `1. 📋 View Tasks (/tasks)`,
    `2. 📝 View Notes (/notes)`,
    `3. 🚀 View Projects (/projects)`,
    `🏠 Reply *menu* for Main Menu`
  );
  return sections.join("\n");
}

function formatReminderConfirmation(reminder) {
  const timeStr = new Date(reminder.dueAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return [
    `⏰ *Reminder Scheduled!*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Title:* ${reminder.title}`,
    `📅 *Scheduled for:* *${timeStr}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply */reminders* to view all or *menu* for Main Menu.`,
  ].join("\n");
}

function formatPublicWelcome(ownerName = "Dhushyandh") {
  return [
    `Hey there! 👋`,
    ``,
    `Welcome to *DHUSHYANDH AI*.`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `I'm ${ownerName}'s AI assistant. How can I help you today?`,
    ``,
    `1. 👨‍💻 *About ${ownerName}*`,
    `2. 🚀 *Explore Projects*`,
    `3. 🛠️ *Development Services*`,
    `4. 💼 *Hire / Work Together*`,
    `5. 💬 *Ask a Question*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply with a number (1-5) or ask me anything directly!`,
  ].join("\n");
}

function formatAboutOwner(profile) {
  const name = profile?.name || "Dhushyandh N.";
  const title = profile?.title || "Full-Stack Developer | Mobile App Developer | Freelancer";

  return [
    `👨‍💻 *About Dhushyandh*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Meet ${name}`,
    ``,
    `*${title}*`,
    ``,
    `He builds modern websites, mobile applications, backend systems and AI-powered solutions.`,
    ``,
    `Explore his work, projects and development services.`,
    ``,
    `🛠️ *Core Skills:* React, Next.js, Node.js, Express, MongoDB, Python, Mobile App Development (Capacitor/Android)`,
    ``,
    `🌐 *Verified Links:*`,
    `• Portfolio: ${profile?.portfolioUrl || "https://dhushyandh.in"}`,
    `• GitHub: ${profile?.githubUrl || "https://github.com/dhushyandh"}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `1. 👨‍💻 About Dhushyandh`,
    `2. 🚀 Explore Projects`,
    `3. 🛠️ Development Services`,
    `4. 💼 Hire / Work Together`,
    `5. 💬 Ask a Question`,
    `🏠 Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatPublicProjects(projects = []) {
  if (!projects || projects.length === 0) {
    return [
      `🚀 *Projects*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `No public projects currently available.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:*`,
      `3. 🛠️ Development Services`,
      `4. 💼 Hire Dhushyandh`,
      `🏠 Reply *menu* for Main Menu`,
    ].join("\n");
  }

  const lines = projects.map((p, idx) => {
    const statusMap = {
      production: "🟢 Live",
      completed: "✅ Completed",
      in_development: "🟡 In Dev",
      testing: "🔵 Testing",
    };
    const status = statusMap[p.status] || `🟢 ${p.status.toUpperCase()}`;
    const desc = p.description ? `   _${p.description.slice(0, 80)}..._` : "";
    return `${idx + 1}. 🚀 *${p.name}* [${status}]\n${desc}`;
  });

  return [
    `🚀 *Featured Public Projects (${projects.length})*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply with a number (e.g. *1*) to view tech stack & links`,
    `• Reply *3* for Development Services`,
    `• Reply *4* to Hire / Work Together`,
    `• Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatServiceCatalogue(services = []) {
  if (!services || services.length === 0) {
    return [
      `🛠️ *Development Services*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Services catalogue currently being updated.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:*`,
      `4. 💼 Hire / Contact Dhushyandh`,
      `🏠 Reply *menu* for Main Menu`,
    ].join("\n");
  }

  const lines = services.map((s, idx) => {
    const delivs = s.deliverables && s.deliverables.length > 0
      ? `\n   📦 Deliverables: ${s.deliverables.slice(0, 2).join(", ")}`
      : "";
    return `${idx + 1}. 💼 *${s.name}*\n   ${s.description}${delivs}`;
  });

  return [
    `🛠️ *Available Development Services*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    ``,
    `💰 *Pricing:* Pricing depends on scope and timeline.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply *4* or type *hire* to discuss your project`,
    `• Reply *2* to explore past projects`,
    `• Reply *1* to know more about Dhushyandh`,
    `• Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatLeadConfirmation(data = {}) {
  return [
    `📋 *Please confirm your project details:*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Name:* ${data.name || "N/A"}`,
    `*Service:* ${data.serviceRequested || "Custom Engineering"}`,
    `*Requirements:*`,
    `"${data.projectDescription || "N/A"}"`,
    ``,
    `*Budget Range:* ${data.budgetRange || "Flexible"}`,
    `*Expected Timeline:* ${data.expectedTimeline || "Flexible"}`,
    data.email ? `*Email:* ${data.email}` : null,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply *yes* or *confirm* to submit to Dhushyandh`,
    `• Reply *cancel* to exit`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLeadSuccess(name = "") {
  const greeting = name ? `, ${name}` : "";
  return [
    `Thank you${greeting}! 🎉`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ Your project request has been submitted directly to Dhushyandh.`,
    `📱 He will review your requirements and reach out to you shortly via WhatsApp.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `1. 👨‍💻 About Dhushyandh`,
    `2. 🚀 Explore Projects`,
    `3. 🛠️ Development Services`,
    `🏠 Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatOwnerLeadsList(leads = [], filterLabel = "All") {
  if (!leads || leads.length === 0) {
    return [
      `💼 *Leads (${filterLabel})*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `No ${filterLabel.toLowerCase()} freelance leads found.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *Options:* Reply *menu* for Main Menu.`,
    ].join("\n");
  }

  const statusIcons = {
    new: "🆕",
    contacted: "📞",
    qualified: "⭐",
    converted: "🎉",
    rejected: "❌",
  };

  const lines = leads.map((l) => {
    const icon = statusIcons[l.status] || "📌";
    const phone = l.whatsappChatId.replace(/@.*$/, "");
    return `${icon} *#${l.leadNumber}:* *${l.name}* (+${phone})\n   Service: _${l.serviceRequested}_ [${l.status.toUpperCase()}]`;
  });

  return [
    `💼 *Freelance Leads (${filterLabel} — ${leads.length})*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply */lead <id>* to view full details`,
    `• Reply */lead status <id> <status>* to update status`,
    `• Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatOwnerLeadDetail(lead) {
  const phone = lead.whatsappChatId.replace(/@.*$/, "");
  return [
    `💼 *Lead #${lead.leadNumber} Details*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Status:* ${lead.status.toUpperCase()}`,
    `*Client Name:* ${lead.name}`,
    `*WhatsApp:* +${phone}`,
    lead.email ? `*Email:* ${lead.email}` : null,
    `*Service Requested:* ${lead.serviceRequested}`,
    ``,
    `*Project Description:*`,
    `"${lead.projectDescription}"`,
    ``,
    `*Budget Range:* ${lead.budgetRange}`,
    `*Expected Timeline:* ${lead.expectedTimeline}`,
    `*Received At:* ${new Date(lead.createdAt).toLocaleString("en-IN")}`,
    lead.notes ? `\n*Internal Notes:*\n${lead.notes}` : null,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:*`,
    `• Reply */lead status ${lead.leadNumber} <contacted|qualified|converted|rejected>*`,
    `• Reply */lead notes ${lead.leadNumber} <your notes>*`,
    `• Reply *menu* for Main Menu`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Universal Outbound Formatter
 * Ensures every outgoing message is sanitized, properly formatted,
 * decorated with appropriate emojis, and contains options-based choices.
 */
function formatOutboundResponse(text, { mode = "public" } = {}) {
  if (!text || typeof text !== "string") return "";

  let cleaned = sanitizeResponse(text);

  const hasOptions =
    /(?:📌 \*Options:\*|📌 \*Quick Options:\*|Reply with a number|Reply \*\d\*|1\. 👨‍💻|1\. 📋|1️⃣|2️⃣|\/task done|\/notes search)/i.test(
      cleaned
    );

  if (!hasOptions) {
    if (mode === "private") {
      cleaned += [
        "",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "📌 *Quick Options:*",
        "1. 📋 *My Tasks*",
        "2. 📝 *My Notes*",
        "3. 🚀 *My Projects*",
        "4. ☀️ *Daily Summary*",
        "5. 💬 *Ask AI*",
        "🏠 Reply *menu* for Main Menu",
      ].join("\n");
    } else {
      cleaned += [
        "",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "📌 *Quick Options:*",
        "1. 👨‍💻 *About Dhushyandh*",
        "2. 🚀 *Explore Projects*",
        "3. 🛠️ *Development Services*",
        "4. 💼 *Hire / Work Together*",
        "5. 💬 *Ask a Question*",
        "🏠 Reply *menu* for Main Menu",
      ].join("\n");
    }
  }

  return cleaned.trim();
}

module.exports = {
  sanitizeResponse,
  formatOutboundResponse,
  formatMainMenu,
  formatTaskList,
  formatTaskConfirmation,
  formatNoteList,
  formatNoteConfirmation,
  formatProjectList,
  formatProjectDetails,
  formatDailySummary,
  formatReminderConfirmation,
  formatPublicWelcome,
  formatAboutOwner,
  formatPublicProjects,
  formatServiceCatalogue,
  formatLeadConfirmation,
  formatLeadSuccess,
  formatOwnerLeadsList,
  formatOwnerLeadDetail,
};
