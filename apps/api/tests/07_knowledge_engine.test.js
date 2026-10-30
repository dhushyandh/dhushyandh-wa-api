const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const { seedInitialKnowledge } = require("../src/modules/knowledge/seed-data");
const { getProfile, updateProfile } = require("../src/modules/knowledge/owner-profile.service");
const { getProjects, getProjectBySlug } = require("../src/modules/knowledge/project.service");

describe("Phase 2: Knowledge Engine & Seeding", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    // Seed initial knowledge base
    await seedInitialKnowledge();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it("1. Idempotent seedInitialKnowledge should execute repeatedly without duplicate records", async () => {
    const stats1 = await seedInitialKnowledge();
    assert.equal(stats1.profileUpdated, true);
    assert.ok(stats1.projectsUpserted >= 2);
    assert.ok(stats1.memoriesUpserted >= 3);

    // Second run must be clean and not duplicate records
    const stats2 = await seedInitialKnowledge();
    assert.equal(stats2.projectsUpserted, stats1.projectsUpserted);
    assert.equal(stats2.memoriesUpserted, stats1.memoriesUpserted);
  });

  it("2. getProfile in public mode should only return public-facing fields", async () => {
    const publicProfile = await getProfile({ mode: "public" });
    assert.ok(publicProfile);
    assert.ok(publicProfile.name.startsWith("Dhushyandh"));
    assert.ok(publicProfile.technicalSkills.length > 0);
    assert.ok(publicProfile.services.length > 0);
    // Strict privacy: professionalPreferences must NOT be in public profile
    assert.equal(publicProfile.professionalPreferences, undefined);
  });

  it("3. getProfile in private mode should return full profile including preferences", async () => {
    const privateProfile = await getProfile({ mode: "private" });
    assert.ok(privateProfile);
    assert.ok(privateProfile.name.startsWith("Dhushyandh"));
    assert.ok(privateProfile.professionalPreferences);
    assert.ok(privateProfile.professionalPreferences.workStyle);
  });

  it("4. getProjects in public mode should ONLY return public projects (DHUSHYANDH AI, not RenewX)", async () => {
    const publicProjects = await getProjects({ mode: "public", query: "" });
    assert.ok(publicProjects.length >= 1);

    const hasDhushyandhAi = publicProjects.some((p) => p.slug === "dhushyandh-ai");
    const hasRenewX = publicProjects.some((p) => p.slug === "renewx");

    assert.equal(hasDhushyandhAi, true, "Public mode should include DHUSHYANDH AI");
    assert.equal(hasRenewX, false, "Public mode must NEVER include private RenewX project");
  });

  it("5. getProjects in private mode should return both public and private projects", async () => {
    const privateProjects = await getProjects({ mode: "private", query: "" });
    assert.ok(privateProjects.length >= 2);

    const hasDhushyandhAi = privateProjects.some((p) => p.slug === "dhushyandh-ai");
    const hasRenewX = privateProjects.some((p) => p.slug === "renewx");

    assert.equal(hasDhushyandhAi, true);
    assert.equal(hasRenewX, true, "Private mode must include private RenewX project");
  });

  it("6. getProjectBySlug should deny public access to private projects", async () => {
    const publicQuery = await getProjectBySlug("renewx", { mode: "public" });
    assert.equal(publicQuery, null, "Public query for private slug must return null");

    const privateQuery = await getProjectBySlug("renewx", { mode: "private" });
    assert.ok(privateQuery);
    assert.ok(privateQuery.name.startsWith("RenewX"));
  });
});
