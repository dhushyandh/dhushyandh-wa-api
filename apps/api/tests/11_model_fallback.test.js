const { describe, it, beforeEach, afterEach, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const {
  generateReply,
  setClient,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  tripCircuitBreaker,
} = require("../src/modules/ai/gemini.service");
const { processIncomingMessage } = require("../src/modules/webhook/message-processor");
const { setFetch } = require("../src/modules/openwa/openwa.service");
const MessageEvent = require("../src/modules/webhook/message-event.model");

describe("11. Gemini Model Fallback & Resilience System", () => {
  const primaryModelName = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const fallbackModelName = env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    resetCircuitBreaker();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.collection("conversationstates").deleteMany({});
    }
  });

  afterEach(() => {
    setClient(null);
    setFetch(null);
    resetCircuitBreaker();
  });

  it("1. Primary model succeeds directly on first attempt", async () => {
    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          return { text: "Direct primary response" };
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    const reply = await generateReply({
      message: "Hello assistant",
      mode: "public",
      requestId: "test-primary-success",
      metadataOut: meta,
      backoffBaseMs: 5,
    });

    assert.equal(reply, "Direct primary response");
    assert.deepEqual(modelCalls, [primaryModelName]);
    assert.equal(meta.selectedModel, primaryModelName);
    assert.equal(meta.isFallback, false);
    assert.equal(meta.attempts, 1);
    assert.equal(getCircuitBreakerStatus().isOpen, false);
  });

  it("2. Primary 503 UNAVAILABLE fast-fails and fallback succeeds without repeating slow requests", async () => {
    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          if (model === primaryModelName) {
            const err = new Error("503 UNAVAILABLE: The model is overloaded");
            err.status = 503;
            throw err;
          }
          return { text: "Recovered via fallback model on 503" };
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    const reply = await generateReply({
      message: "What services do you offer?",
      mode: "public",
      requestId: "test-primary-503-fallback",
      metadataOut: meta,
      backoffBaseMs: 5,
    });

    assert.equal(reply, "Recovered via fallback model on 503");
    // For 503 capacity errors, primary avoids repeating slow requests: exactly 1 attempt before fallback
    const primaryCalls = modelCalls.filter((m) => m === primaryModelName);
    const fallbackCalls = modelCalls.filter((m) => m === fallbackModelName);

    assert.equal(primaryCalls.length, 1, "Primary model should fast-fail on 503 without repeating slow requests");
    assert.equal(fallbackCalls.length, 1, "Fallback model should be invoked and succeed on attempt 1");
    assert.equal(meta.selectedModel, fallbackModelName);
    assert.equal(meta.isFallback, true);
    // Circuit breaker was tripped into cooldown
    assert.equal(getCircuitBreakerStatus().isOpen, true);
  });

  it("3. Primary 504 DEADLINE_EXCEEDED preserves safe transient retries then fallback succeeds", async () => {
    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          if (model === primaryModelName) {
            const err = new Error("504 DEADLINE_EXCEEDED: Deadline expired");
            err.status = 504;
            throw err;
          }
          return { text: "Recovered via fallback model on 504" };
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    const reply = await generateReply({
      message: "Tell me about your architecture",
      mode: "private",
      requestId: "test-primary-504-fallback",
      metadataOut: meta,
      backoffBaseMs: 5,
    });

    assert.equal(reply, "Recovered via fallback model on 504");
    const primaryCalls = modelCalls.filter((m) => m === primaryModelName);
    const fallbackCalls = modelCalls.filter((m) => m === fallbackModelName);

    assert.equal(primaryCalls.length, 3, "Primary should safely retry transient timeouts before fallback");
    assert.equal(fallbackCalls.length, 1, "Fallback model should succeed");
    assert.equal(meta.selectedModel, fallbackModelName);
  });

  it("4. Both primary and fallback models fail (allModelsFailed)", async () => {
    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          const err = new Error(`503 UNAVAILABLE: ${model} is down`);
          err.status = 503;
          throw err;
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    await assert.rejects(
      async () => {
        await generateReply({
          message: "Test both models down",
          mode: "public",
          requestId: "test-both-models-fail",
          metadataOut: meta,
          backoffBaseMs: 5,
        });
      },
      (err) => {
        assert.equal(err.allModelsFailed, true);
        assert.equal(err.primaryModel, primaryModelName);
        assert.equal(err.fallbackModel, fallbackModelName);
        return true;
      }
    );

    const primaryCalls = modelCalls.filter((m) => m === primaryModelName);
    const fallbackCalls = modelCalls.filter((m) => m === fallbackModelName);

    assert.equal(primaryCalls.length, 1, "Primary fast-fails on 503 capacity error");
    assert.equal(fallbackCalls.length, 1, "Fallback fast-fails on 503 capacity error without repeating");
    assert.equal(meta.selectedModel, null);
    assert.equal(meta.errorClassification, "GEMINI_TRANSIENT_SERVER_ERROR");
  });

  it("5. Permanent 401 AUTH error does NOT fallback and does NOT retry", async () => {
    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          const err = new Error("401 API key not valid. Please pass a valid API key.");
          err.status = 401;
          throw err;
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    await assert.rejects(
      async () => {
        await generateReply({
          message: "Test 401 auth rejection",
          mode: "public",
          requestId: "test-401-permanent",
          metadataOut: meta,
          backoffBaseMs: 5,
        });
      },
      (err) => {
        assert.equal(err.category, "GEMINI_PERMANENT_AUTH_ERROR");
        return true;
      }
    );

    assert.equal(modelCalls.length, 1, "Must fail immediately without retrying on 401");
    assert.equal(modelCalls[0], primaryModelName);
    assert.equal(meta.selectedModel, null);
  });

  it("6. Grounded knowledge context is strictly preserved during fallback", async () => {
    let capturedInstruction = null;
    const mockAi = {
      models: {
        generateContent: async ({ model, config }) => {
          if (model === primaryModelName) {
            const err = new Error("504 DEADLINE_EXCEEDED");
            err.status = 504;
            throw err;
          }
          capturedInstruction = config.systemInstruction;
          return { text: "Fallback answered using preserved grounding context" };
        },
      },
    };
    setClient(mockAi);

    const testGroundedContext = "TEST PROFILE: Dhushyandh has 5+ years experience in Full-Stack Node.js and AI.";
    const reply = await generateReply({
      message: "Tell me about Dhushyandh's experience",
      mode: "public",
      retrievedContext: testGroundedContext,
      requestId: "test-grounding-preserved",
      backoffBaseMs: 5,
    });

    assert.equal(reply, "Fallback answered using preserved grounding context");
    assert.ok(capturedInstruction, "System instruction should be passed to fallback model");
    assert.ok(
      capturedInstruction.includes("GROUNDED KNOWLEDGE BASE:"),
      "Grounded knowledge base header must be present in fallback instruction"
    );
    assert.ok(
      capturedInstruction.includes(testGroundedContext),
      "Exact grounded context must be present in fallback model prompt"
    );
  });

  it("7. Public/private mode isolation is strictly preserved during fallback", async () => {
    const instructions = {};
    const mockAi = {
      models: {
        generateContent: async ({ model, config }) => {
          if (model === primaryModelName) {
            const err = new Error("503 UNAVAILABLE");
            err.status = 503;
            throw err;
          }
          instructions[config.systemInstruction.includes("private personal assistant") ? "private" : "public"] =
            config.systemInstruction;
          return { text: "Mode response" };
        },
      },
    };
    setClient(mockAi);

    // Run public mode fallback
    await generateReply({
      message: "Public question",
      mode: "public",
      requestId: "test-public-isolation",
      backoffBaseMs: 5,
    });

    // Reset circuit breaker between runs so private mode also starts clean
    resetCircuitBreaker();

    // Run private mode fallback
    await generateReply({
      message: "Private task",
      mode: "private",
      requestId: "test-private-isolation",
      backoffBaseMs: 5,
    });

    assert.ok(instructions.public.includes("public WhatsApp assistant"));
    assert.ok(!instructions.public.includes("private personal assistant"));

    assert.ok(instructions.private.includes("private personal assistant"));
    assert.ok(!instructions.private.includes("public WhatsApp assistant"));
  });

  it("8. Message processor ensures zero duplicate outbound WhatsApp sends on fallback", async () => {
    const outboundCalls = [];
    setFetch(async (url, options) => {
      outboundCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "mock_openwa_msg_123" }),
      };
    });

    // Mock Gemini: primary fails, fallback succeeds
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          if (model === primaryModelName) {
            const err = new Error("503 UNAVAILABLE");
            err.status = 503;
            throw err;
          }
          return { text: "Final valid response from fallback model" };
        },
      },
    };
    setClient(mockAi);

    const uniqueMsgId = `test_fallback_dedup_${Date.now()}`;
    const eventKey = `919876543210@s.whatsapp.net:${uniqueMsgId}`;
    const incoming = {
      messageId: uniqueMsgId,
      chatId: "919876543210@s.whatsapp.net",
      senderId: "919876543210@s.whatsapp.net",
      senderName: "Test Public User",
      text: "What services can you build?",
      messageType: "text",
      assistantMode: "public",
      timestamp: Math.floor(Date.now() / 1000),
    };
    await processIncomingMessage(incoming, eventKey);

    // Verify outbound message was delivered exactly ONCE
    assert.equal(outboundCalls.length, 1, "Only one outbound WhatsApp sendText must be dispatched");
    assert.equal(outboundCalls[0].body.text, "Final valid response from fallback model");

    // Verify database record has fallback telemetry
    const record = await MessageEvent.findOne({ eventKey });
    assert.ok(record);
    assert.equal(record.status, "sent");
    assert.equal(record.selectedModel, fallbackModelName);
  });

  it("9. Message processor sends concise unavailability response when all models fail without falsely marking sent", async () => {
    const outboundCalls = [];
    setFetch(async (url, options) => {
      outboundCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "mock_openwa_unavail_123" }),
      };
    });

    // Mock Gemini: both models fail
    const mockAi = {
      models: {
        generateContent: async () => {
          const err = new Error("503 UNAVAILABLE: All models overloaded");
          err.status = 503;
          throw err;
        },
      },
    };
    setClient(mockAi);

    const uniqueMsgId = `test_all_fail_${Date.now()}`;
    const eventKey = `919876543210@s.whatsapp.net:${uniqueMsgId}`;
    const incoming = {
      messageId: uniqueMsgId,
      chatId: "919876543210@s.whatsapp.net",
      senderId: "919876543210@s.whatsapp.net",
      senderName: "Test Public User",
      text: "Can you respond right now?",
      messageType: "text",
      assistantMode: "public",
      timestamp: Math.floor(Date.now() / 1000),
    };
    await processIncomingMessage(incoming, eventKey);

    // Verify unavailability notification was dispatched once
    assert.equal(outboundCalls.length, 1, "Unavailability notice must be dispatched exactly once");
    assert.ok(
      outboundCalls[0].body.text.includes("temporary technical difficulties"),
      "Public unavailability response must be sent"
    );

    // Verify database record is marked 'failed', NOT 'sent'
    const record = await MessageEvent.findOne({ eventKey });
    assert.ok(record);
    assert.equal(record.status, "failed", "Database status must be failed, NOT sent");
    assert.equal(record.errorCategory, "GEMINI_TRANSIENT_SERVER_ERROR");
  });

  it("10. Circuit breaker routes directly to fallback when primary model is in cooldown", async () => {
    // Manually trip the circuit breaker into cooldown
    tripCircuitBreaker("PRIMARY_CAPACITY_EXHAUSTED", 180000);
    assert.equal(getCircuitBreakerStatus().isOpen, true);

    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          return { text: "Direct fallback response while in cooldown" };
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    const reply = await generateReply({
      message: "Quick question during cooldown",
      mode: "public",
      requestId: "test-circuit-breaker-cooldown",
      metadataOut: meta,
      backoffBaseMs: 5,
    });

    assert.equal(reply, "Direct fallback response while in cooldown");
    // Primary model must NOT have been called at all
    assert.deepEqual(modelCalls, [fallbackModelName]);
    assert.equal(meta.selectedModel, fallbackModelName);
    assert.equal(meta.isFallback, true);
    assert.equal(meta.circuitBreakerEngaged, true);
  });

  it("11. Circuit breaker recovers and resets to healthy closed state on primary model success", async () => {
    // Trip the circuit breaker with a tiny 20ms cooldown
    tripCircuitBreaker("TEST_COOLDOWN_RECOVERY", 20);
    assert.equal(getCircuitBreakerStatus().isOpen, true);

    // Wait for the 20ms cooldown to expire
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(getCircuitBreakerStatus().isOpen, false);

    const modelCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          modelCalls.push(model);
          return { text: "Primary recovered successfully" };
        },
      },
    };
    setClient(mockAi);

    const meta = {};
    const reply = await generateReply({
      message: "Testing recovery after cooldown",
      mode: "public",
      requestId: "test-recovery-success",
      metadataOut: meta,
      backoffBaseMs: 5,
    });

    assert.equal(reply, "Primary recovered successfully");
    assert.deepEqual(modelCalls, [primaryModelName]);
    assert.equal(meta.selectedModel, primaryModelName);
    assert.equal(meta.isFallback, false);
    assert.equal(meta.circuitBreakerEngaged, false);
    assert.equal(getCircuitBreakerStatus().isOpen, false);
  });
});
