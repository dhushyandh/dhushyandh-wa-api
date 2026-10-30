const { listTasks } = require("../task/task.service");
const { getProjects } = require("../knowledge/project.service");
const { listPendingReminders } = require("../reminder/reminder.service");
const { formatDailySummary } = require("../ui/response-formatter");

async function generateDailySummary({ ownerChatId, date = new Date() }) {
  if (!ownerChatId) throw new Error("ownerChatId is required");

  const [tasks, projects, reminders] = await Promise.all([
    listTasks({ ownerChatId, status: "all", limit: 30 }),
    getProjects({ mode: "private" }),
    listPendingReminders({ ownerChatId }),
  ]);

  const dateStr = date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return formatDailySummary({
    tasks,
    projects,
    reminders,
    dateStr,
  });
}

module.exports = {
  generateDailySummary,
};
