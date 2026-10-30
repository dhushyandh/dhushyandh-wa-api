const Note = require("./note.model");
const logger = require("../../utils/logger");

async function createNote({ title, content, category = "General", tags = [], ownerChatId }) {
  if (!title || typeof title !== "string" || !title.trim()) {
    throw new Error("Note title is required");
  }
  if (!content || typeof content !== "string" || !content.trim()) {
    throw new Error("Note content is required");
  }
  if (!ownerChatId) {
    throw new Error("ownerChatId is required");
  }

  const note = await Note.create({
    title: title.trim(),
    content: content.trim(),
    category: category ? category.trim() : "General",
    tags: Array.isArray(tags) ? tags.map((t) => t.trim().toLowerCase()) : [],
    ownerChatId,
  });

  logger.info("Note created successfully", { noteId: note._id, title: note.title });
  return note;
}

async function listNotes({ ownerChatId, limit = 10, includeArchived = false }) {
  if (!ownerChatId) throw new Error("ownerChatId is required");

  const query = { ownerChatId };
  if (!includeArchived) {
    query.archivedAt = null;
  }

  return Note.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

async function searchNotes({ ownerChatId, query }) {
  if (!ownerChatId || !query || typeof query !== "string") {
    return [];
  }

  const term = query.trim();
  // Case-insensitive regex search across title, content, and category
  return Note.find({
    ownerChatId,
    archivedAt: null,
    $or: [
      { title: { $regex: term, $options: "i" } },
      { content: { $regex: term, $options: "i" } },
      { category: { $regex: term, $options: "i" } },
      { tags: { $in: [term.toLowerCase()] } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
}

async function archiveNote({ identifier, ownerChatId }) {
  if (!identifier || !ownerChatId) throw new Error("Identifier required");

  let query = { ownerChatId };
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query._id = identifier;
  } else {
    query.title = { $regex: identifier.trim(), $options: "i" };
  }

  return Note.findOneAndUpdate(query, { $set: { archivedAt: new Date() } }, { returnDocument: "after" });
}

async function deleteNote({ identifier, ownerChatId }) {
  if (!identifier || !ownerChatId) throw new Error("Identifier required");

  let query = { ownerChatId };
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query._id = identifier;
  } else {
    query.title = { $regex: identifier.trim(), $options: "i" };
  }

  return Note.findOneAndDelete(query);
}

module.exports = {
  createNote,
  listNotes,
  searchNotes,
  archiveNote,
  deleteNote,
};
