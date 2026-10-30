const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { sendText, setFetch } = require("../src/modules/openwa/openwa.service");

describe("OpenWA Outbound Reliability & Error Classification", () => {
  afterEach(() => {
    setFetch(null); // Reset mock fetch
  });

  it("13. OpenWA successful outbound request using mocked fetch", async () => {
    let capturedUrl = "";
    let capturedHeaders = {};
    let capturedBody = {};

    setFetch(async (url, options) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: "wa_msg_12345" }),
      };
    });

    const result = await sendText({
      chatId: "919999999999@s.whatsapp.net",
      text: "Test outbound text",
      idempotencyKey: "test_idem_key_1",
      requestId: "req_1",
    });

    assert.equal(result.success, true);
    assert.equal(result.messageId, "wa_msg_12345");
    assert.match(capturedUrl, /\/messages\/send-text$/);
    assert.equal(capturedHeaders["Content-Type"], "application/json");
    assert.ok(capturedHeaders["X-API-Key"]);
    assert.equal(capturedHeaders["Idempotency-Key"], "test_idem_key_1");
    assert.equal(capturedBody.chatId, "919999999999@s.whatsapp.net");
    assert.equal(capturedBody.text, "Test outbound text");
  });

  it("14. OpenWA authentication failure should throw OPENWA_AUTH_ERROR", async () => {
    setFetch(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized API key" }),
    }));

    await assert.rejects(
      async () => {
        await sendText({
          chatId: "919999999999@s.whatsapp.net",
          text: "Test auth failure",
          requestId: "req_auth_fail",
        });
      },
      (err) => {
        assert.equal(err.category, "OPENWA_AUTH_ERROR");
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  it("15. OpenWA session disconnected should throw OPENWA_SESSION_DISCONNECTED", async () => {
    setFetch(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ message: "WhatsApp session is disconnected" }),
    }));

    await assert.rejects(
      async () => {
        await sendText({
          chatId: "919999999999@s.whatsapp.net",
          text: "Test session disconnected",
          requestId: "req_disc",
        });
      },
      (err) => {
        assert.equal(err.category, "OPENWA_SESSION_DISCONNECTED");
        assert.equal(err.statusCode, 503);
        return true;
      }
    );
  });

  it("19. Uncertain outbound delivery handling on timeout", async () => {
    setFetch(async () => {
      const err = new Error("Network timeout after payload transmitted");
      err.name = "TimeoutError";
      throw err;
    });

    await assert.rejects(
      async () => {
        await sendText({
          chatId: "919999999999@s.whatsapp.net",
          text: "Test timeout delivery",
          requestId: "req_timeout",
        });
      },
      (err) => {
        assert.equal(err.category, "OPENWA_UNCERTAIN_DELIVERY");
        assert.match(err.message, /delivery state is uncertain/i);
        return true;
      }
    );
  });
});
