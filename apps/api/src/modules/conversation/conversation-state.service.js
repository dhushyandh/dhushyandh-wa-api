const ConversationState = require("./conversation-state.model");

async function getState(chatId) {
  if (!chatId) return null;
  const state = await ConversationState.findOne({ chatId }).lean();
  if (!state) return null;

  // Check if expired
  if (state.expiresAt && new Date(state.expiresAt) < new Date()) {
    await ConversationState.deleteOne({ chatId });
    return null;
  }
  return state;
}

async function setState(chatId, { flow = "idle", step = "none", data = {} }) {
  if (!chatId) throw new Error("chatId is required");

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  return ConversationState.findOneAndUpdate(
    { chatId },
    {
      $set: {
        flow,
        step,
        data,
        expiresAt,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

async function clearState(chatId) {
  if (!chatId) return;
  return ConversationState.deleteOne({ chatId });
}

module.exports = {
  getState,
  setState,
  clearState,
};
