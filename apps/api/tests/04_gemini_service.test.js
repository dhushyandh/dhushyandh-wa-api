const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { generateReply, setClient, resetCircuitBreaker } = require("../src/modules/ai/gemini.service");

describe("Gemini Service Reliability & Error Handling", () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  afterEach(() => {
    // Reset client to null and reset circuit breaker
    setClient(null);
    resetCircuitBreaker();
  });

  it("10. Gemini successful generation using mocked API response", async () => {
    const mockAi = {
      models: {
        generateContent: async () => ({
          text: "Mocked AI response: Hello from DHUSHYANDH AI!",
        }),
      },
    };
    setClient(mockAi);

    const reply = await generateReply({
      message: "Hello",
      mode: "public",
      requestId: "test-req-success",
    });

    assert.equal(reply, "Mocked AI response: Hello from DHUSHYANDH AI!");
  });

  it("11. Gemini timeout handling should classify and throw timeout error", async () => {
    const mockAi = {
      models: {
        generateContent: async () => {
          const err = new Error("AbortError: operation timed out");
          err.name = "AbortError";
          throw err;
        },
      },
    };
    setClient(mockAi);

    await assert.rejects(
      async () => {
        await generateReply({
          message: "Trigger timeout",
          mode: "public",
          requestId: "test-req-timeout",
        });
      },
      (err) => {
        assert.equal(err.category, "GEMINI_TIMEOUT");
        return true;
      }
    );
  });

  it("12. Gemini rate-limit handling (429) should classify transient rate limit", async () => {
    let callCount = 0;
    const mockAi = {
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            const err = new Error("429 RESOURCE_EXHAUSTED: Rate limit exceeded");
            err.status = 429;
            throw err;
          }
          return { text: "Recovered after rate limit backoff" };
        },
      },
    };
    setClient(mockAi);

    const reply = await generateReply({
      message: "Test rate limit recovery",
      mode: "public",
      requestId: "test-req-rate-limit",
    });

    assert.equal(callCount, 2);
    assert.equal(reply, "Recovered after rate limit backoff");
  });
});
