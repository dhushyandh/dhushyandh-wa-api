const Task = require("./task.model");
const logger = require("../../utils/logger");

async function createTask({ title, description = "", priority = "medium", dueDate = null, ownerChatId }) {
  if (!title || typeof title !== "string" || !title.trim()) {
    throw new Error("Task title is required");
  }
  if (!ownerChatId) {
    throw new Error("ownerChatId is required");
  }

  const validPriorities = ["low", "medium", "high", "urgent"];
  const safePriority = validPriorities.includes(priority?.toLowerCase())
    ? priority.toLowerCase()
    : "medium";

  const task = await Task.create({
    title: title.trim(),
    description: description.trim(),
    priority: safePriority,
    dueDate: dueDate ? new Date(dueDate) : null,
    ownerChatId,
    status: "pending",
  });

  logger.info("Task created successfully", { taskId: task._id, ownerChatId, title: task.title });
  return task;
}

async function listTasks({ ownerChatId, status = "pending", priority, limit = 20 }) {
  if (!ownerChatId) throw new Error("ownerChatId is required");

  const query = { ownerChatId };
  if (status) {
    if (status === "all") {
      // no status filter
    } else {
      query.status = status;
    }
  }
  if (priority) {
    query.priority = priority.toLowerCase();
  }

  return Task.find(query)
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(limit)
    .lean();
}

async function markTaskCompleted({ identifier, ownerChatId }) {
  if (!identifier || !ownerChatId) {
    throw new Error("Task identifier and ownerChatId are required");
  }

  let task = null;

  // Check if identifier is an ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    task = await Task.findOneAndUpdate(
      { _id: identifier, ownerChatId },
      { $set: { status: "completed", completedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  // If not found by ID, search by title keyword or recent index
  if (!task) {
    // If identifier is a single digit (e.g. 1, 2, 3) representing an index in pending tasks
    const num = parseInt(identifier, 10);
    if (!isNaN(num) && num >= 1 && num <= 20) {
      const pendingList = await Task.find({ ownerChatId, status: "pending" })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(num);
      if (pendingList.length >= num) {
        const target = pendingList[num - 1];
        task = await Task.findOneAndUpdate(
          { _id: target._id, ownerChatId },
          { $set: { status: "completed", completedAt: new Date() } },
          { returnDocument: "after" }
        );
      }
    }
  }

  if (!task) {
    // Match by title substring
    task = await Task.findOneAndUpdate(
      {
        ownerChatId,
        status: { $ne: "completed" },
        title: { $regex: identifier.trim(), $options: "i" },
      },
      { $set: { status: "completed", completedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  if (task) {
    logger.info("Task marked completed", { taskId: task._id, title: task.title });
  }

  return task;
}

async function updateTask({ identifier, ownerChatId, updates = {} }) {
  if (!identifier || !ownerChatId) throw new Error("Task identifier required");

  let query = { ownerChatId };
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query._id = identifier;
  } else {
    query.title = { $regex: identifier.trim(), $options: "i" };
  }

  const allowed = {};
  if (updates.title) allowed.title = updates.title.trim();
  if (updates.description !== undefined) allowed.description = updates.description.trim();
  if (updates.priority) allowed.priority = updates.priority.toLowerCase();
  if (updates.dueDate !== undefined) allowed.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
  if (updates.status) allowed.status = updates.status.toLowerCase();

  return Task.findOneAndUpdate(query, { $set: allowed }, { returnDocument: "after" });
}

async function deleteTask({ identifier, ownerChatId }) {
  if (!identifier || !ownerChatId) throw new Error("Task identifier required");

  let query = { ownerChatId };
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query._id = identifier;
  } else {
    query.title = { $regex: identifier.trim(), $options: "i" };
  }

  return Task.findOneAndDelete(query);
}

module.exports = {
  createTask,
  listTasks,
  markTaskCompleted,
  updateTask,
  deleteTask,
};
