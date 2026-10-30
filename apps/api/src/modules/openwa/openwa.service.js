const env = require("../../config/env");
const logger = require("../../utils/logger");

let customFetch = null;

function setFetch(mockFetch) {
  customFetch = mockFetch;
}

function getFetch() {
  return customFetch || globalThis.fetch;
}

function classifyOpenWAError(responseStatus, responseBody = {}, isTimeout = false) {
  if (isTimeout) {
    return {
      category: "OPENWA_UNCERTAIN_DELIVERY",
      message:
        "Outbound request timed out. Message delivery state is uncertain; avoiding blind retry to prevent duplicate WhatsApp sends.",
      isTransient: false,
    };
  }

  if (responseStatus === 401 || responseStatus === 403) {
    return {
      category: "OPENWA_AUTH_ERROR",
      message: "OpenWA operator key authentication failed.",
      isTransient: false,
    };
  }

  if (responseStatus === 404 || responseStatus === 503) {
    return {
      category: "OPENWA_SESSION_DISCONNECTED",
      message:
        responseBody.message ||
        "OpenWA WhatsApp session is disconnected or not found.",
      isTransient: true,
    };
  }

  if (responseStatus === 429) {
    return {
      category: "OPENWA_RATE_LIMITED",
      message: "OpenWA rate limit exceeded.",
      isTransient: true,
    };
  }

  return {
    category: "OPENWA_SEND_FAILED",
    message:
      responseBody.message ||
      responseBody.error ||
      `OpenWA send failed with status ${responseStatus}`,
    isTransient: false,
  };
}

async function sendText({ chatId, text, idempotencyKey, requestId }) {
  const fetchImpl = getFetch();
  const baseUrl = env.OPENWA_BASE_URL || "http://127.0.0.1:2786";
  const sessionId = env.OPENWA_SESSION_ID;
  const apiKey = env.OPENWA_OPERATOR_KEY;

  if (!sessionId || !apiKey) {
    const error = new Error("OpenWA session configuration is missing");
    error.category = "OPENWA_AUTH_ERROR";
    throw error;
  }

  if (!chatId || typeof chatId !== "string" || !chatId.trim()) {
    const error = new Error("chatId is required");
    error.category = "OPENWA_INVALID_PARAM";
    throw error;
  }

  if (!text || typeof text !== "string" || !text.trim()) {
    const error = new Error("text is required");
    error.category = "OPENWA_INVALID_PARAM";
    throw error;
  }

  const endpoint = `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`;
  const startTime = Date.now();

  logger.debug("Sending outbound WhatsApp text via OpenWA", {
    requestId,
    chatId,
    idempotencyKey,
    textLength: text.length,
  });

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ chatId: chatId.trim(), text: text.trim() }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    const isTimeout =
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      err.message?.includes("timed out");
    const classification = classifyOpenWAError(0, {}, isTimeout);
    const error = new Error(classification.message);
    error.category = classification.category;
    error.originalError = err.message;
    logger.error("OpenWA send network failure", {
      requestId,
      chatId,
      errorCategory: classification.category,
      errorMessage: err.message,
    });
    throw error;
  }

  const durationMs = Date.now() - startTime;
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const classification = classifyOpenWAError(response.status, result, false);
    const error = new Error(classification.message);
    error.category = classification.category;
    error.statusCode = response.status;
    error.details = result;

    logger.error("OpenWA outbound send failed", {
      requestId,
      chatId,
      status: response.status,
      durationMs,
      errorCategory: classification.category,
    });

    throw error;
  }

  logger.info("OpenWA outbound message delivered successfully", {
    requestId,
    chatId,
    durationMs,
    idempotencyKey,
  });

  return result;
}

async function sendImage({ chatId, url, base64, mimetype = "image/png", caption, idempotencyKey, requestId }) {
  const fetchImpl = getFetch();
  const baseUrl = env.OPENWA_BASE_URL || "http://127.0.0.1:2786";
  const sessionId = env.OPENWA_SESSION_ID;
  const apiKey = env.OPENWA_OPERATOR_KEY;

  if (!sessionId || !apiKey) {
    const error = new Error("OpenWA session configuration is missing");
    error.category = "OPENWA_AUTH_ERROR";
    throw error;
  }

  if (!chatId || typeof chatId !== "string" || !chatId.trim()) {
    const error = new Error("chatId is required");
    error.category = "OPENWA_INVALID_PARAM";
    throw error;
  }

  const endpoint = `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-image`;
  const startTime = Date.now();

  const body = {
    chatId: chatId.trim(),
    ...(url ? { url } : {}),
    ...(base64 ? { base64, mimetype } : {}),
    ...(caption ? { caption } : {}),
  };

  logger.debug("Sending outbound WhatsApp image via OpenWA", {
    requestId,
    chatId,
    idempotencyKey,
  });

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    const isTimeout =
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      err.message?.includes("timed out");
    const classification = classifyOpenWAError(0, {}, isTimeout);
    const error = new Error(classification.message);
    error.category = classification.category;
    error.originalError = err.message;
    logger.error("OpenWA send image network failure", {
      requestId,
      chatId,
      errorCategory: classification.category,
      errorMessage: err.message,
    });
    throw error;
  }

  const durationMs = Date.now() - startTime;
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const classification = classifyOpenWAError(response.status, result, false);
    const error = new Error(classification.message);
    error.category = classification.category;
    error.statusCode = response.status;
    error.details = result;
    throw error;
  }

  logger.info("OpenWA outbound image delivered successfully", {
    requestId,
    chatId,
    durationMs,
    idempotencyKey,
  });

  return result;
}

async function checkOpenWAHealth() {
  const fetchImpl = getFetch();
  const baseUrl = env.OPENWA_BASE_URL || "http://127.0.0.1:2786";
  const sessionId = env.OPENWA_SESSION_ID;
  const apiKey = env.OPENWA_OPERATOR_KEY;

  if (!sessionId || !apiKey) {
    return { healthy: false, error: "Configuration missing" };
  }

  try {
    const res = await fetchImpl(
      `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      return { healthy: false, status: `HTTP ${res.status}` };
    }

    const data = await res.json().catch(() => ({}));
    return {
      healthy: true,
      status: data.status || "ready",
    };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

module.exports = {
  sendText,
  sendImage,
  checkOpenWAHealth,
  classifyOpenWAError,
  setFetch,
};
