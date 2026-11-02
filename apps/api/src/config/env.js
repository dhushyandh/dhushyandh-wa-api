const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { z } = require("zod");

// Explicitly locate the .env file in apps/api if present, regardless of working directory
const appEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

if (fs.existsSync(appEnvPath)) {
  dotenv.config({ path: appEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  CLIENT_URL: z.string().url().or(z.literal("")).optional(),

  OPENWA_BASE_URL: z
    .string()
    .url("OPENWA_BASE_URL must be a valid URL")
    .default("http://127.0.0.1:2786"),

  OPENWA_SESSION_ID: z.string().min(1, "OPENWA_SESSION_ID is required"),

  OPENWA_OPERATOR_KEY: z.string().min(1, "OPENWA_OPERATOR_KEY is required"),

  OPENWA_WEBHOOK_SECRET: z.string().min(1, "OPENWA_WEBHOOK_SECRET is required"),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),

  GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.5-flash"),

  GEMINI_CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(180000),

  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),

  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  OWNER_CHAT_IDS: z.string().default(""),

  LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  REMINDER_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  STALE_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(60000),

  MESSAGE_EVENT_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

function loadConfig(envSource = process.env) {
  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const formattedErrors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(formattedErrors)
      .map(([field, errors]) => ` - ${field}: ${errors.join(", ")}`)
      .join("\n");

    const message = `[FATAL] Configuration validation failed:\n${errorMessages}`;
    const isTest =
      process.env.NODE_ENV === "test" ||
      envSource.NODE_ENV === "test" ||
      Boolean(process.env.NODE_TEST_CONTEXT);

    if (!isTest) {
      console.error(message);
      process.exit(1);
    }
    throw new Error(message);
  }

  return result.data;
}

const currentConfig = loadConfig();

module.exports = currentConfig;
module.exports.loadConfig = loadConfig;
module.exports.envSchema = envSchema;
