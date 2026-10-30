/**
 * Safe structured logger for DHUSHYANDH AI.
 * Redacts secrets, tokens, API keys and provides structured metadata.
 */

const SENSITIVE_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/g, // Google API keys
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  /mongodb(?:\+srv)?:\/\/[^\s"']+/gi, // Mongo connection strings
  /(?:api[_-]?key|secret|password|operator[_-]?key|token)["']?\s*[:=]\s*["']?([^"',\s]+)/gi,
];

function sanitizeString(str) {
  if (typeof str !== "string") return str;
  let sanitized = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

function sanitizeObject(obj, depth = 0) {
  if (depth > 4 || obj === null || typeof obj !== "object") {
    return typeof obj === "string" ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("key") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password") ||
      lowerKey.includes("auth") ||
      lowerKey.includes("uri")
    ) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitizeObject(value, depth + 1);
    }
  }
  return result;
}

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const sanitizedMeta = sanitizeObject(meta);

  if (process.env.NODE_ENV === "production") {
    return JSON.stringify({
      timestamp,
      level,
      message: sanitizeString(message),
      ...sanitizedMeta,
    });
  }

  // Readable format for local dev
  const metaStr =
    Object.keys(sanitizedMeta).length > 0
      ? " " + JSON.stringify(sanitizedMeta)
      : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${sanitizeString(message)}${metaStr}`;
}

const logger = {
  info(message, meta) {
    console.log(formatLog("info", message, meta));
  },
  warn(message, meta) {
    console.warn(formatLog("warn", message, meta));
  },
  error(message, meta) {
    console.error(formatLog("error", message, meta));
  },
  debug(message, meta) {
    if (process.env.NODE_ENV !== "production") {
      console.log(formatLog("debug", message, meta));
    }
  },
};

module.exports = logger;
module.exports.sanitizeString = sanitizeString;
module.exports.sanitizeObject = sanitizeObject;
