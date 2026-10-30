const { getProfile } = require("../knowledge/owner-profile.service");
const { getProjects } = require("../knowledge/project.service");
const { getMemories } = require("../memory/memory.service");
const logger = require("../../utils/logger");

const MAX_CONTEXT_CHARACTERS = 6000;

function detectIntent(text) {
  if (!text || typeof text !== "string") return "GENERAL_INTENT";
  const lower = text.toLowerCase();

  // Specific project checks first
  if (/renewx/i.test(lower)) {
    return "PROJECT_RENEWX";
  }

  if (/dhushyandh\s*ai|personal\s+ai/i.test(lower)) {
    return "PROJECT_DHUSHYANDH_AI";
  }

  if (/who\s+are\s+you|about\s+you|who\s+is\s+dhushyandh|background|skills|tech\s+stack|developer|profile|experience|education/i.test(lower)) {
    return "PROFILE_INTENT";
  }

  if (/service|hire|freelance|pricing|rate|quote|cost|contract|client|work\s+with/i.test(lower)) {
    return "SERVICES_INTENT";
  }

  if (/project|portfolio|built|github|repository|milestone|blocker|progress/i.test(lower)) {
    return "PROJECTS_GENERAL";
  }

  if (/decision|preference|style|rule|guideline|memory|remember/i.test(lower)) {
    return "MEMORY_INTENT";
  }

  if (/\b(?:mode|modes|private\s+mode|public\s+mode)\b/i.test(lower)) {
    return "MODE_INTENT";
  }

  return "GENERAL_INTENT";
}

function calculateScore(itemText, queryKeywords) {
  if (!itemText || !queryKeywords || queryKeywords.length === 0) return 0;
  const lower = itemText.toLowerCase();
  let matches = 0;
  for (const kw of queryKeywords) {
    if (lower.includes(kw)) {
      matches++;
    }
  }
  return matches;
}

async function retrieveContext({ text, mode = "public", chatId = null }) {
  const startTime = Date.now();
  const intent = detectIntent(text);

  const [profile, projects, memories] = await Promise.all([
    getProfile({ mode }),
    getProjects({ mode, query: text, limit: 3 }),
    getMemories({ mode, query: text, limit: 3 }),
  ]);

  const dbQueryDurationMs = Date.now() - startTime;

  // Build structured grounded text sections with character budget
  const sections = [];
  let currentLength = 0;

  function addSection(header, body) {
    if (!body || body.trim() === "") return;
    const sectionText = `\n[${header}]\n${body.trim()}\n`;
    if (currentLength + sectionText.length <= MAX_CONTEXT_CHARACTERS) {
      sections.push(sectionText);
      currentLength += sectionText.length;
    }
  }

  // 1. Profile Information
  if (profile) {
    let profileBody = `Name: ${profile.name}\nTitle: ${profile.title}\nBio: ${profile.bio || "Full-stack developer & AI systems engineer."}`;

    if (profile.technicalSkills && profile.technicalSkills.length > 0) {
      const skillsSummary = profile.technicalSkills
        .map((g) => `${g.category}: ${g.skills.join(", ")}`)
        .join("; ");
      profileBody += `\nTechnical Skills: ${skillsSummary}`;
    }

    if (intent === "SERVICES_INTENT" && profile.services && profile.services.length > 0) {
      const servicesSummary = profile.services
        .map((s) => `* ${s.name}: ${s.description}`)
        .join("\n");
      profileBody += `\nAvailable Services:\n${servicesSummary}`;
    }

    if (mode === "private" && profile.professionalPreferences) {
      const prefs = profile.professionalPreferences;
      profileBody += `\nPreferences: Work style - ${prefs.workStyle}; Availability - ${prefs.availability}`;
    }

    addSection("DEVELOPER PROFILE", profileBody);
  }

  // 2. Project Information
  if (projects && projects.length > 0) {
    const includedBlocks = [];
    for (const p of projects) {
      let block = `Project: ${p.name} (${p.status})\nDescription: ${p.description}\nTech Stack: ${(p.techStack || []).join(", ")}`;
      if (p.problemSolved) {
        block += `\nProblem Solved: ${p.problemSolved}`;
      }
      if (p.features && p.features.length > 0) {
        block += `\nKey Features: ${p.features.join("; ")}`;
      }
      const live = p.liveDemoUrl || p.deploymentUrl;
      if (live && live.startsWith("http") && !live.includes("localhost")) {
        block += `\nLive URL: ${live}`;
      }
      if (p.repositoryUrl && p.repositoryUrl.startsWith("http")) {
        block += `\nGitHub: ${p.repositoryUrl}`;
      }
      if (p.currentProgress) {
        block += `\nProgress: ${p.currentProgress}`;
      }
      if (p.milestones && p.milestones.length > 0) {
        const msList = p.milestones.map((m) => `${m.title} [${m.status}]`).join(", ");
        block += `\nMilestones: ${msList}`;
      }
      if (mode === "private") {
        if (p.blockers && p.blockers.length > 0) {
          block += `\nBlockers: ${p.blockers.join("; ")}`;
        }
        if (p.importantDecisions && p.importantDecisions.length > 0) {
          const decs = p.importantDecisions.map((d) => d.decision).join("; ");
          block += `\nDecisions: ${decs}`;
        }
      }

      if (currentLength + block.length + 50 <= MAX_CONTEXT_CHARACTERS) {
        includedBlocks.push(block);
        currentLength += block.length + 2;
      }
    }

    if (includedBlocks.length > 0) {
      sections.push(`\n[PROJECT CONTEXT]\n${includedBlocks.join("\n\n")}\n`);
    }
  }

  // 3. Memories (Only in private mode)
  if (mode === "private" && memories && memories.length > 0) {
    const includedMemories = [];
    for (const m of memories) {
      const line = `* [${m.category}] ${m.content}`;
      if (currentLength + line.length + 50 <= MAX_CONTEXT_CHARACTERS) {
        includedMemories.push(line);
        currentLength += line.length + 2;
      }
    }
    if (includedMemories.length > 0) {
      sections.push(`\n[VERIFIED OWNER MEMORIES]\n${includedMemories.join("\n")}\n`);
    }
  }

  // 4. Assistant Modes & Access Control
  if (intent === "MODE_INTENT" || /\b(?:mode|modes)\b/i.test(text)) {
    const modeInfo = [
      "Private Mode: Enabled exclusively for the authorized owner authenticated via WhatsApp Linked Identity (LID). Grants access to personal productivity, tasks, notes, reminders, and private project context.",
      "Public Mode: Enabled for all other WhatsApp senders. Grants access to developer profile, public projects, service catalogue, and freelance lead capture.",
      "Mode Switching: Mode switching cannot be performed manually from the current chat. It is strictly determined by sender authorization.",
      "Public Mode Testing: To test Public Mode, the owner must message the bot from a separate, non-owner WhatsApp account.",
    ].join("\n");
    addSection("ASSISTANT MODES & ACCESS CONTROL", modeInfo);
  }

  const groundedContext = sections.join("\n").trim();
  const totalDurationMs = Date.now() - startTime;

  logger.debug("Context retrieval completed", {
    mode,
    intent,
    projectsCount: projects.length,
    memoriesCount: memories.length,
    contextLength: groundedContext.length,
    dbQueryDurationMs,
    totalDurationMs,
  });

  return {
    contextText: groundedContext,
    intent,
    retrievedItems: {
      hasProfile: Boolean(profile),
      projects: projects.map((p) => p.name),
      memoriesCount: memories.length,
    },
    durationMs: totalDurationMs,
    dbQueryDurationMs,
  };
}

module.exports = {
  retrieveContext,
  detectIntent,
  calculateScore,
  MAX_CONTEXT_CHARACTERS,
};
