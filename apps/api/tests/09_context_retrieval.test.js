const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const { seedInitialKnowledge } = require("../src/modules/knowledge/seed-data");
const {
  retrieveContext,
  detectIntent,
  MAX_CONTEXT_CHARACTERS,
} = require("../src/modules/context/context-retriever.service");

describe("Phase 2: Context Retrieval & Bounded Grounding", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await seedInitialKnowledge();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it("1. Intent detection correctly classifies queries", () => {
    assert.equal(detectIntent("What are your skills and technical background?"), "PROFILE_INTENT");
    assert.equal(detectIntent("How much do you charge for freelance development services?"), "SERVICES_INTENT");
    assert.equal(detectIntent("Tell me about the DHUSHYANDH AI project"), "PROJECT_DHUSHYANDH_AI");
    assert.equal(detectIntent("Tell me about the RenewX platform"), "PROJECT_RENEWX");
    assert.equal(detectIntent("What is your architectural decision on database storage?"), "MEMORY_INTENT");
    assert.equal(detectIntent("Hello there, how are you today?"), "GENERAL_INTENT");
  });

  it("2. Bounded context payload must strictly observe size limits", async () => {
    const result = await retrieveContext({
      text: "Tell me everything about your developer profile, skills, education, and all active projects",
      mode: "private",
    });

    assert.ok(result.contextText);
    assert.ok(
      result.contextText.length <= MAX_CONTEXT_CHARACTERS,
      `Context length (${result.contextText.length}) must be <= ${MAX_CONTEXT_CHARACTERS}`
    );
  });

  it("3. Public context payload must strictly isolate private projects and memories", async () => {
    const result = await retrieveContext({
      text: "Show me all projects and memories",
      mode: "public",
    });

    // Must contain public project
    assert.match(result.contextText, /DHUSHYANDH AI/);

    // Strict privacy checks
    assert.doesNotMatch(result.contextText, /RenewX/i, "Public context must NEVER mention private RenewX");
    assert.doesNotMatch(result.contextText, /VERIFIED OWNER MEMORIES/i, "Public context must NEVER include memories section");
    assert.equal(result.retrievedItems.memoriesCount, 0);
  });

  it("4. Private context payload includes private projects, decisions, and memories", async () => {
    const result = await retrieveContext({
      text: "What is my current focus and project decisions?",
      mode: "private",
    });

    assert.match(result.contextText, /RenewX/);
    assert.match(result.contextText, /VERIFIED OWNER MEMORIES/);
    assert.ok(result.retrievedItems.memoriesCount > 0);
  });

  it("5. Missing knowledge handling provides clean fallback", async () => {
    const result = await retrieveContext({
      text: "What do you know about project QuantumBlockchainAlpha?",
      mode: "public",
    });

    assert.ok(result);
    // Does not fail, gracefully provides profile context without hallucinated project blocks
    assert.doesNotMatch(result.contextText, /QuantumBlockchainAlpha/i);
  });
});
