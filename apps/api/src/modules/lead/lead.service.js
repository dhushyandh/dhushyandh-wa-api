const Lead = require("./lead.model");
const { sendText } = require("../openwa/openwa.service");
const env = require("../../config/env");
const logger = require("../../utils/logger");

function getOwnerChatIds() {
  return (env.OWNER_CHAT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function createLead({
  name,
  whatsappChatId,
  email = "",
  serviceRequested,
  projectDescription,
  budgetRange = "Not specified",
  expectedTimeline = "Flexible",
  source = "whatsapp",
}) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Lead name is required");
  }
  if (!whatsappChatId) {
    throw new Error("whatsappChatId is required");
  }
  if (!serviceRequested || !projectDescription) {
    throw new Error("serviceRequested and projectDescription are required");
  }

  const lead = await Lead.create({
    name: name.trim(),
    whatsappChatId: whatsappChatId.trim(),
    email: email.trim(),
    serviceRequested: serviceRequested.trim(),
    projectDescription: projectDescription.trim(),
    budgetRange: budgetRange.trim() || "Not specified",
    expectedTimeline: expectedTimeline.trim() || "Flexible",
    source,
    status: "new",
  });

  logger.info("New freelance lead created successfully", {
    leadNumber: lead.leadNumber,
    name: lead.name,
    service: lead.serviceRequested,
  });

  // Dispatch private notification to verified owner(s)
  const owners = getOwnerChatIds();
  const phoneFormatted = lead.whatsappChatId.replace(/@.*$/, "");
  const notificationText = [
    `🔔 *New Freelance Lead Received!*`,
    ``,
    `*Lead #:* ${lead.leadNumber}`,
    `*Client:* ${lead.name}`,
    `*WhatsApp:* +${phoneFormatted}`,
    lead.email ? `*Email:* ${lead.email}` : null,
    `*Service:* ${lead.serviceRequested}`,
    `*Requirements:*`,
    `${lead.projectDescription}`,
    ``,
    `*Budget:* ${lead.budgetRange}`,
    `*Timeline:* ${lead.expectedTimeline}`,
    ``,
    `Reply */lead ${lead.leadNumber}* to view or manage.`,
  ]
    .filter(Boolean)
    .join("\n");

  for (const ownerId of owners) {
    try {
      await sendText({
        chatId: ownerId,
        text: notificationText,
        idempotencyKey: `lead_notify_${lead._id}_${ownerId}`.slice(0, 255),
        requestId: `notify_lead_${lead.leadNumber}`,
      });
      logger.info("Owner notified of new lead", { ownerId, leadNumber: lead.leadNumber });
    } catch (notifyErr) {
      logger.warn("Failed to dispatch lead notification to owner", {
        ownerId,
        error: notifyErr.message,
      });
    }
  }

  return lead;
}

async function listLeads({ status = null, limit = 20 } = {}) {
  const query = {};
  if (status && status !== "all") {
    query.status = status.toLowerCase();
  }
  return Lead.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

async function getLeadById(identifier) {
  if (!identifier) return null;

  const num = parseInt(identifier, 10);
  if (!isNaN(num) && String(num) === String(identifier).trim()) {
    return Lead.findOne({ leadNumber: num }).lean();
  }

  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    return Lead.findById(identifier).lean();
  }

  return Lead.findOne({
    $or: [
      { name: { $regex: identifier.trim(), $options: "i" } },
      { whatsappChatId: { $regex: identifier.trim(), $options: "i" } },
    ],
  }).lean();
}

async function updateLeadStatus(identifier, newStatus) {
  const validStatuses = ["new", "contacted", "qualified", "converted", "rejected"];
  const safeStatus = newStatus?.toLowerCase()?.trim();

  if (!validStatuses.includes(safeStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Valid: ${validStatuses.join(", ")}`);
  }

  let query = {};
  const num = parseInt(identifier, 10);
  if (!isNaN(num) && String(num) === String(identifier).trim()) {
    query = { leadNumber: num };
  } else if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query = { _id: identifier };
  } else {
    query = { name: { $regex: identifier.trim(), $options: "i" } };
  }

  return Lead.findOneAndUpdate(
    query,
    { $set: { status: safeStatus, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

async function updateLeadNotes(identifier, notesText) {
  let query = {};
  const num = parseInt(identifier, 10);
  if (!isNaN(num) && String(num) === String(identifier).trim()) {
    query = { leadNumber: num };
  } else if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    query = { _id: identifier };
  } else {
    query = { name: { $regex: identifier.trim(), $options: "i" } };
  }

  return Lead.findOneAndUpdate(
    query,
    { $set: { notes: notesText.trim(), updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

module.exports = {
  createLead,
  listLeads,
  getLeadById,
  updateLeadStatus,
  updateLeadNotes,
};
