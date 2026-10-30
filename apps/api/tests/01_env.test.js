const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/config/env");

describe("1. Environment configuration validation", () => {
  const validEnv = {
    NODE_ENV: "test",
    PORT: "5000",
    MONGODB_URI: "mongodb://127.0.0.1:27017/test_db",
    CLIENT_URL: "http://localhost:5173",
    OPENWA_BASE_URL: "http://127.0.0.1:2786",
    OPENWA_SESSION_ID: "session-12345",
    OPENWA_OPERATOR_KEY: "op-key-test",
    OPENWA_WEBHOOK_SECRET: "wh-secret-test",
    GEMINI_API_KEY: "gemini-key-test",
    GEMINI_MODEL: "gemini-3.8-flash",
    OWNER_CHAT_IDS: "134613267656901@lid",
  };

  it("should successfully parse and validate a complete, valid configuration", () => {
    const config = loadConfig(validEnv);
    assert.equal(config.NODE_ENV, "test");
    assert.equal(config.PORT, 5000);
    assert.equal(config.OPENWA_SESSION_ID, "session-12345");
    assert.equal(config.GEMINI_MODEL, "gemini-3.8-flash");
    assert.equal(config.GEMINI_FALLBACK_MODEL, "gemini-3.5-flash-lite");
    assert.equal(config.GEMINI_TIMEOUT_MS, 25000);
    assert.equal(config.GEMINI_MAX_RETRIES, 2);
    assert.equal(config.LOCK_TIMEOUT_MS, 90000);
    assert.equal(config.MESSAGE_EVENT_TTL_DAYS, 30);
  });

  it("should fail validation if GEMINI_API_KEY is missing", () => {
    const invalidEnv = { ...validEnv };
    delete invalidEnv.GEMINI_API_KEY;

    assert.throws(() => loadConfig(invalidEnv), /GEMINI_API_KEY/);
  });

  it("should fail validation if OPENWA_SESSION_ID is missing", () => {
    const invalidEnv = { ...validEnv };
    delete invalidEnv.OPENWA_SESSION_ID;

    assert.throws(() => loadConfig(invalidEnv), /OPENWA_SESSION_ID/);
  });

  it("should fail validation if OPENWA_BASE_URL is not a valid URL", () => {
    const invalidEnv = { ...validEnv, OPENWA_BASE_URL: "invalid-url" };

    assert.throws(() => loadConfig(invalidEnv), /OPENWA_BASE_URL must be a valid URL/);
  });

  it("should fail validation if NODE_ENV is an unrecognized environment", () => {
    const invalidEnv = { ...validEnv, NODE_ENV: "invalid_env" };

    assert.throws(() => loadConfig(invalidEnv), /NODE_ENV/);
  });
});
