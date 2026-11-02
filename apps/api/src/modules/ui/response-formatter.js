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
    `Hey there! 👋`,
    ``,
    `Welcome to *DHUSHYANDH AI*.`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `I'm the AI representation of *Dhushyandh N.* — Full-Stack Developer, Mobile App Developer & Freelancer.`,
    ``,
    `How can I help you explore my work today?`,
    ``,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply with a number (1-7) or ask any question directly!`,
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
    `📌 *Quick Options:*`,
    [
      "1. 👨‍💻 *About Me*",
      "2. 🛠️ *Skills & Technologies*",
      "3. 🚀 *My Projects*",
      "4. 💼 *Experience & Internships*",
      "5. 📄 *Portfolio & Resume*",
      "6. 💬 *Ask Me Anything*",
      "7. 📬 *Contact & Connect*",
      "🏠 Reply *menu* for Main Menu",
    ].join("\n")
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
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
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
    `I'm the AI representation of *Dhushyandh N.* — Full-Stack Developer, Mobile App Developer & Freelancer.`,
    ``,
    `How can I help you explore my work today?`,
    ``,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Options:* Reply with a number (1-7) or ask any question directly!`,
  ].join("\n");
}

function formatAboutMe(profile) {
  const name = profile?.name || "Dhushyandh N.";
  const title = profile?.title || "Full-Stack Developer | Mobile App Developer | Freelancer";

  return [
    `👨‍💻 *About Me — Meet ${name}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*${title}*`,
    ``,
    `About Dhushyandh:`,
    `"Dhushyandh N. is a Full-Stack Developer, Mobile App Developer and Freelancer who builds modern web applications, mobile applications, scalable backend systems and AI-powered solutions."`,
    ``,
    `🎓 *Education:*`,
    `• B.E. Computer Science Engineering (2023 - 2027)`,
    `  C. Abdul Hakeem College of Engineering and Technology · Anna University`,
    ``,
    `🚀 *What I Do:*`,
    `• Architect & build modern web apps with React, Next.js, Node.js & Express`,
    `• Develop cross-platform mobile apps with Capacitor & Android build pipelines`,
    `• Build scalable backend APIs, webhooks, and MongoDB/PostgreSQL databases`,
    `• Integrate generative AI models, Google Gemini, and autonomous WhatsApp bots`,
    ``,
    `🛠️ *Core Skills:* React, Next.js, Node.js, Express, MongoDB, Python, Mobile App Development (Capacitor/Android)`,
    ``,
    `🌐 *Verified Links:*`,
    `• Portfolio: ${profile?.portfolioUrl || "https://dhushyandh.in"}`,
    `• GitHub: ${profile?.githubUrl || "https://github.com/dhushyandh"}`,
    `• LinkedIn: ${profile?.linkedinUrl || "https://linkedin.com/in/dhushyandh"}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatAboutOwner(profile) {
  return formatAboutMe(profile);
}

function formatSkillsAndTechnologies(profile) {
  const techSkills = profile?.technicalSkills || [
    {
      category: "Frontend Development",
      skills: ["React", "Next.js", "JavaScript", "TypeScript", "Tailwind CSS", "HTML5/CSS3"],
    },
    {
      category: "Mobile App Development",
      skills: ["Capacitor", "Android Builds (APK/AAB)", "Responsive Mobile Web", "Cross-Platform Apps"],
    },
    {
      category: "Backend & REST APIs",
      skills: ["Node.js (v22)", "Express 5", "REST APIs", "Webhook Architecture", "Docker"],
    },
    {
      category: "Database Systems",
      skills: ["MongoDB", "Mongoose", "PostgreSQL", "Prisma"],
    },
    {
      category: "AI & Automation",
      skills: ["Google Gemini API", "OpenWA Gateway", "Baileys Engine", "Grounded Context", "Hybrid Memory"],
    },
  ];

  const categoryIcons = {
    "Frontend Development": "🌐",
    "Mobile App Development": "📱",
    "Backend & REST APIs": "⚙️",
    "Database Systems": "🗄️",
    "AI & Automation": "🤖",
  };

  const sections = [
    `🛠️ *Skills & Technologies*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Here is Dhushyandh's verified technical stack across frontend, mobile, backend, databases, and AI systems:`,
    ``,
  ];

  for (const cat of techSkills) {
    const icon = categoryIcons[cat.category] || "🔹";
    sections.push(`*${icon} ${cat.category}:*`);
    sections.push(`${cat.skills.join(" • ")}`);
    sections.push(``);
  }

  sections.push(
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `1. 👨‍💻 *About Me*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`
  );

  return sections.join("\n");
}

function formatExperienceAndInternships(profile) {
  const experiences = profile?.experience || [
    {
      role: "Freelance Full Stack Developer",
      organization: "Independent",
      duration: "Aug 2026 - Present",
      highlights: [
        "Delivered real client web applications including the Sri Guru Coaching Centre website.",
        "Built custom full-stack solutions, e-commerce architectures, and WhatsApp automations.",
        "Developed mobile-ready architectures with Capacitor and Android Google Play packages.",
      ],
    },
    {
      role: "Full Stack Developer Intern",
      organization: "Unified Mentor Pvt. Ltd.",
      duration: "Aug 2026 - Oct 2026",
      highlights: [
        "Worked across frontend interfaces, backend services, databases, and deployment pipelines.",
      ],
    },
    {
      role: "MERN Stack Developer Intern",
      organization: "Codec Technologies",
      duration: "Feb 2026 - Mar 2026",
      highlights: [
        "Gained practical experience building React, Node.js, Express, and MongoDB applications.",
      ],
    },
  ];

  const sections = [
    `💼 *Experience & Internships*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Dhushyandh's practical industry experience, completed client projects, and software internships:`,
    ``,
  ];

  experiences.forEach((exp, idx) => {
    sections.push(`*${idx + 1}. ${exp.role}*`);
    sections.push(`🏢 *${exp.organization}* | 📅 ${exp.duration}`);
    if (exp.highlights && exp.highlights.length > 0) {
      exp.highlights.forEach((h) => {
        sections.push(`• ${h}`);
      });
    }
    sections.push(``);
  });

  sections.push(
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`
  );

  return sections.join("\n");
}

function formatPortfolioAndResume(profile) {
  const portfolioUrl = profile?.portfolioUrl || "https://dhushyandh.in";
  const githubUrl = profile?.githubUrl || "https://github.com/dhushyandh";
  const linkedinUrl = profile?.linkedinUrl || "https://linkedin.com/in/dhushyandh";

  return [
    `📄 *Portfolio & Resume*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Explore Dhushyandh's verified portfolio, resume, code repositories, and professional profiles:`,
    ``,
    `🌐 *Live Portfolio Website:*`,
    `• ${portfolioUrl}`,
    `_(Features interactive project demos, engineering case studies, tech stack overviews, and mobile app packages)_`,
    ``,
    `💻 *GitHub Profile:*`,
    `• ${githubUrl}`,
    `_(Explore open-source repositories, system architectures, and commits)_`,
    ``,
    `💼 *LinkedIn Profile:*`,
    `• ${linkedinUrl}`,
    `_(Professional background, certifications, and network)_`,
    ``,
    `📄 *Resume / CV:*`,
    `• View and download on portfolio: ${portfolioUrl}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatAskMeAnything() {
  return [
    `💬 *Ask Me Anything!*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `I am Dhushyandh's AI avatar. You can ask me anything about his technical background, developer journey, projects, system architectures, or availability!`,
    ``,
    `💡 *Example questions to try:*`,
    `• *"What projects have you built?"*`,
    `• *"How does the WhatsApp AI assistant architecture work?"*`,
    `• *"Tell me about your mobile app development experience."*`,
    `• *"What is the Sri Guru Coaching Centre project?"*`,
    `• *"What backend and database technologies do you use?"*`,
    `• *"Are you available for freelance work?"*`,
    ``,
    `Just type your question naturally! 🚀`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`,
  ].join("\n");
}

function formatContactAndConnect(profile) {
  const portfolioUrl = profile?.portfolioUrl || "https://dhushyandh.in";
  const githubUrl = profile?.githubUrl || "https://github.com/dhushyandh";
  const linkedinUrl = profile?.linkedinUrl || "https://linkedin.com/in/dhushyandh";

  return [
    `📬 *Contact & Connect*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Interested in working together or discussing a project? Here is how to reach Dhushyandh:`,
    ``,
    `📱 *WhatsApp:* Right here in this chat!`,
    `🌐 *Portfolio:* ${portfolioUrl}`,
    `💻 *GitHub:* ${githubUrl}`,
    `💼 *LinkedIn:* ${linkedinUrl}`,
    ``,
    `💼 *Freelance Projects & Consulting:*`,
    `Dhushyandh is open for freelance projects, custom software development, mobile apps, and consulting.`,
    ``,
    `Would you like to leave your project details for Dhushyandh to review?`,
    `• Reply *hire* or *start* to start a quick project inquiry`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Quick Options:*`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
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
      `📌 *Quick Options:*`,
      `1. 👨‍💻 *About Me*`,
      `2. 🛠️ *Skills & Technologies*`,
      `3. 🚀 *My Projects*`,
      `4. 💼 *Experience & Internships*`,
      `5. 📄 *Portfolio & Resume*`,
      `6. 💬 *Ask Me Anything*`,
      `7. 📬 *Contact & Connect*`,
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
    `📌 *Quick Options:*`,
    `• Reply with a number (e.g. *1*) to view full purpose, tech stack & links`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`,
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
      `📌 *Quick Options:*`,
      `1. 👨‍💻 *About Me*`,
      `2. 🛠️ *Skills & Technologies*`,
      `3. 🚀 *My Projects*`,
      `4. 💼 *Experience & Internships*`,
      `5. 📄 *Portfolio & Resume*`,
      `6. 💬 *Ask Me Anything*`,
      `7. 📬 *Contact & Connect*`,
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
    `📌 *Quick Options:*`,
    `• Reply *7* or type *hire* to start a freelance inquiry`,
    `• Reply *3* to explore projects`,
    `• Reply *1* to know more about Dhushyandh`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
    `🏠 Reply *menu* for Main Menu`,
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
    `📌 *Quick Options:*`,
    `1. 👨‍💻 *About Me*`,
    `2. 🛠️ *Skills & Technologies*`,
    `3. 🚀 *My Projects*`,
    `4. 💼 *Experience & Internships*`,
    `5. 📄 *Portfolio & Resume*`,
    `6. 💬 *Ask Me Anything*`,
    `7. 📬 *Contact & Connect*`,
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
    cleaned += [
      "",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "📌 *Quick Options:*",
      "1. 👨‍💻 *About Me*",
      "2. 🛠️ *Skills & Technologies*",
      "3. 🚀 *My Projects*",
      "4. 💼 *Experience & Internships*",
      "5. 📄 *Portfolio & Resume*",
      "6. 💬 *Ask Me Anything*",
      "7. 📬 *Contact & Connect*",
      "🏠 Reply *menu* for Main Menu",
    ].join("\n");
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
  formatAboutMe,
  formatAboutOwner,
  formatSkillsAndTechnologies,
  formatExperienceAndInternships,
  formatPortfolioAndResume,
  formatAskMeAnything,
  formatContactAndConnect,
  formatPublicProjects,
  formatServiceCatalogue,
  formatLeadConfirmation,
  formatLeadSuccess,
  formatOwnerLeadsList,
  formatOwnerLeadDetail,
};
