const Memory = require("./memory.model");
const logger = require("../../utils/logger");

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{20,}/,
  /Bearer\s+[A-Za-z0-9\-_.]+/i,
  /(?:password|api[_\s-]?key|secret|access[_\s-]?token|private[_\s-]?key)\s*[:=]\s*["']?\S+/i,
  /mongodb(?:\+srv)?:\/\/\S+/i,
];

function containsSecret(text) {
  if (!text || typeof text !== "string") return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

const NOISE_PATTERNS = [
  /^(hi|hello|hey|yo|good\s+morning|good\s+evening|thanks|thank\s+you|ok|okay|cool|bye|goodbye|what\s+is\s+up|how\s+are\s+you)[\s!.]*$/i,
];

function isNoise(text) {
  if (!text || typeof text !== "string") return true;
  const trimmed = text.trim();
  if (trimmed.length < 8) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

async function createMemory({
  content,
  category = "other",
  scope = "private",
  source = "automatic_extraction",
  confidence = 0.9,
  importance = 3,
  approvalStatus = "approved",
  tags = [],
  projectSlug = null,
}) {
  if (!content || typeof content !== "string" || !content.trim()) {
    throw new Error("Memory content is required");
  }

  // Security check: Never store passwords, API keys, or secrets
  if (containsSecret(content)) {
    const error = new Error("Security violation: Memory content contains sensitive credentials or secrets");
    error.category = "SECURITY_REJECTED";
    logger.warn("Rejected attempt to persist secret into memory", { category });
    throw error;
  }

  // Filter noise
  if (isNoise(content) && source === "automatic_extraction") {
    logger.debug("Discarded conversational noise from memory creation", { content });
    return null;
  }

  const contentHash = Memory.hashContent(content);

  // Deduplication check
  const existing = await Memory.findOne({ contentHash });
  if (existing) {
    logger.debug("Duplicate memory detected; skipping creation", { contentHash });
    return existing;
  }

  const memory = await Memory.create({
    content: content.trim(),
    contentHash,
    category,
    scope,
    source,
    confidence,
    importance,
    approvalStatus,
    tags,
    projectSlug,
  });

  logger.info("Memory persisted successfully", {
    id: memory._id,
    category,
    scope,
    approvalStatus,
  });

  return memory;
}

async function approveMemory(id) {
  return Memory.findByIdAndUpdate(
    id,
    { $set: { approvalStatus: "approved" } },
    { returnDocument: "after" }
  );
}

async function rejectMemory(id) {
  return Memory.findByIdAndUpdate(
    id,
    { $set: { approvalStatus: "rejected" } },
    { returnDocument: "after" }
  );
}

async function getMemories({
  mode = "public",
  query = "",
  category = null,
  limit = 5,
} = {}) {
  // STRICT PRIVACY RULE: Public mode must NEVER retrieve private memories
  if (mode === "public") {
    return [];
  }

  const filter = {
    scope: "private",
    approvalStatus: "approved",
  };

  if (category) {
    filter.category = category;
  }

  let memories = [];

  if (query && typeof query === "string" && query.trim().length >= 3) {
    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s-_]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    if (keywords.length > 0) {
      const regexOr = keywords.map((k) => ({
        $or: [
          { content: { $regex: k, $options: "i" } },
          { tags: { $regex: k, $options: "i" } },
          { category: { $regex: k, $options: "i" } },
        ],
      }));

      memories = await Memory.find({
        $and: [filter, { $or: regexOr.map((i) => i.$or).flat() }],
      })
        .sort({ importance: -1, updatedAt: -1 })
        .limit(limit)
        .lean();
    }
  }

  if (memories.length === 0) {
    memories = await Memory.find(filter)
      .sort({ importance: -1, updatedAt: -1 })
      .limit(limit)
      .lean();
  }

  return memories;
}

/**
 * Evaluates owner messages for potential memory extraction.
 * Distinguishes automatic safe technical memories from approval-based personal memories.
 */
async function processPotentialMemory({ text, mode }) {
  if (mode !== "private" || !text || typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();

  // Explicit command: "remember that ...", "save note: ..."
  const explicitMatch = trimmed.match(
    /^(?:please\s+)?(?:remember\s+that|save\s+(?:this\s+)?note(?:\s*:)?|take\s+note(?:\s*:)?)\s+(.+)$/i
  );

  if (explicitMatch) {
    const content = explicitMatch[1].trim();
    // Decisions or technical facts are automatically approved
    const isTechnical = /architecture|database|model|api|stack|port|endpoint|code|test|deploy|docker/i.test(content);
    return createMemory({
      content,
      category: isTechnical ? "project_decision" : "personal_fact",
      scope: "private",
      source: "owner_statement",
      confidence: 1.0,
      importance: 4,
      approvalStatus: isTechnical ? "approved" : "pending_approval",
      tags: ["explicit_note"],
    });
  }

  // Automatic extraction for technical decisions
  const decisionMatch = trimmed.match(
    /(?:we\s+decided\s+to|i\s+have\s+decided\s+to|the\s+decision\s+is\s+to)\s+(.+)/i
  );

  if (decisionMatch) {
    const content = decisionMatch[0].trim();
    return createMemory({
      content,
      category: "project_decision",
      scope: "private",
      source: "automatic_extraction",
      confidence: 0.9,
      importance: 4,
      approvalStatus: "approved",
      tags: ["decision", "automatic"],
    });
  }

  return null;
}

module.exports = {
  createMemory,
  approveMemory,
  rejectMemory,
  getMemories,
  processPotentialMemory,
  containsSecret,
  isNoise,
};
