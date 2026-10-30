const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const Memory = require("../src/modules/memory/memory.model");
const {
  createMemory,
  approveMemory,
  rejectMemory,
  getMemories,
  processPotentialMemory,
} = require("../src/modules/memory/memory.service");

describe("Phase 2: Hybrid Memory System", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
  });

  after(async () => {
    await Memory.deleteMany({ tags: "test_memory_suite" });
    await mongoose.disconnect();
  });

  it("1. Memory creation with deterministic contentHash", async () => {
    const memory = await createMemory({
      content: "TEST: Decision to implement Phase 2 hybrid memory architecture.",
      category: "project_decision",
      scope: "private",
      source: "owner_statement",
      importance: 4,
      tags: ["test_memory_suite"],
    });

    assert.ok(memory);
    assert.equal(memory.category, "project_decision");
    assert.ok(memory.contentHash);
    assert.equal(typeof memory.contentHash, "string");
  });

  it("2. Duplicate memory prevention should return existing record without creating duplicate", async () => {
    const content = "TEST: Duplicate check for identical memory statement.";

    const mem1 = await createMemory({
      content,
      category: "project_decision",
      tags: ["test_memory_suite"],
    });

    const mem2 = await createMemory({
      content: "   test: duplicate check for identical memory statement.   ", // Normalized variation
      category: "project_decision",
      tags: ["test_memory_suite"],
    });

    assert.equal(String(mem1._id), String(mem2._id), "Should return the existing record");
  });

  it("3. Secret scanning must reject attempts to store credentials or API keys", async () => {
    await assert.rejects(
      async () => {
        await createMemory({
          content: "Remember my API key: AIzaSyD9876543210abcdefghijklmnopq",
          category: "personal_fact",
          tags: ["test_memory_suite"],
        });
      },
      (err) => {
        assert.equal(err.category, "SECURITY_REJECTED");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await createMemory({
          content: "Save password: SuperSecretPassword123!",
          category: "personal_fact",
          tags: ["test_memory_suite"],
        });
      },
      (err) => {
        assert.equal(err.category, "SECURITY_REJECTED");
        return true;
      }
    );
  });

  it("4. Discard conversational noise from automatic memory creation", async () => {
    const noise = await createMemory({
      content: "thank you!",
      source: "automatic_extraction",
      tags: ["test_memory_suite"],
    });

    assert.equal(noise, null, "Conversational noise must not be persisted");
  });

  it("5. Approval and rejection lifecycle transitions", async () => {
    const mem = await createMemory({
      content: "TEST: Owner preference for morning status notifications.",
      category: "technical_preference",
      approvalStatus: "pending_approval",
      tags: ["test_memory_suite"],
    });

    assert.equal(mem.approvalStatus, "pending_approval");

    const approved = await approveMemory(mem._id);
    assert.equal(approved.approvalStatus, "approved");

    const rejected = await rejectMemory(mem._id);
    assert.equal(rejected.approvalStatus, "rejected");
  });

  it("6. getMemories in public mode must strictly return an empty array", async () => {
    const publicMemories = await getMemories({ mode: "public", query: "architecture" });
    assert.deepEqual(publicMemories, [], "Public mode must never retrieve private memories");
  });

  it("7. processPotentialMemory should detect explicit owner notes and decisions", async () => {
    const explicit = await processPotentialMemory({
      text: "Please remember that we are deploying with Docker on port 2786.",
      mode: "private",
    });

    assert.ok(explicit);
    assert.match(explicit.content, /deploying with Docker on port 2786/i);
    assert.equal(explicit.approvalStatus, "approved");

    // Public message should never trigger memory creation
    const publicAttempt = await processPotentialMemory({
      text: "Please remember that I like Python.",
      mode: "public",
    });
    assert.equal(publicAttempt, null);
  });
});
