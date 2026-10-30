const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const env = require("../src/config/env");

const { routeIncomingMessage } = require("../src/modules/assistant/command-router");
const { getProfile } = require("../src/modules/knowledge/owner-profile.service");
const { getProjects } = require("../src/modules/knowledge/project.service");
const { seedInitialKnowledge } = require("../src/modules/knowledge/seed-data");
const { setFetch, sendImage } = require("../src/modules/openwa/openwa.service");
const { setClient } = require("../src/modules/ai/gemini.service");
const { processIncomingMessage } = require("../src/modules/webhook/message-processor");
const MessageEvent = require("../src/modules/webhook/message-event.model");

const TEST_OWNER = "134613267656901@lid";
const TEST_VISITOR = "919876543210@s.whatsapp.net";

describe("15. Verified Developer Knowledge Base & Project Audit", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    // Re-seed initial knowledge to ensure the latest verified profile & projects are active in DB
    await seedInitialKnowledge();
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.collection("conversationstates").deleteMany({});
    }
  });

  afterEach(async () => {
    setFetch(null);
    setClient(null);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.collection("conversationstates").deleteMany({});
    }
  });

  // =========================================================================
  // 1. CORRECT PROFESSIONAL IDENTITY
  // =========================================================================
  it("1. Profile stores correct professional identity and introduction", async () => {
    const profile = await getProfile({ mode: "public" });
    assert.ok(profile);
    assert.equal(profile.name, "Dhushyandh N.");
    assert.equal(profile.title, "Full-Stack Developer | Mobile App Developer | Freelancer");
    assert.ok(
      profile.bio.includes("Dhushyandh N. is a Full-Stack Developer, Mobile App Developer and Freelancer")
    );
    assert.ok(profile.bio.includes("scalable backend systems and AI-powered solutions"));
    assert.equal(profile.portfolioUrl, "https://dhushyandh.in");
    assert.equal(profile.githubUrl, "https://github.com/dhushyandh");
  });

  // =========================================================================
  // 2. PROFESSIONAL SERVICE CATEGORIES
  // =========================================================================
  it("2. Profile includes all 7 verified professional service categories", async () => {
    const profile = await getProfile({ mode: "public" });
    const serviceNames = (profile.services || []).map((s) => s.name);

    assert.ok(serviceNames.includes("Full-Stack Web Development"));
    assert.ok(serviceNames.includes("Mobile Application Development"));
    assert.ok(serviceNames.includes("Backend and REST API Development"));
    assert.ok(serviceNames.includes("Database Design and Integration"));
    assert.ok(serviceNames.includes("AI Integration and Automation"));
    assert.ok(serviceNames.includes("E-commerce Application Development"));
    assert.ok(serviceNames.includes("Custom Software Development"));
  });

  // =========================================================================
  // 3. FREELANCING PROFILE & SRI GURU COACHING CENTRE LMS
  // =========================================================================
  it("3. Sri Guru Coaching Centre is stored as a completed client engagement with verified links", async () => {
    const projects = await getProjects({ mode: "public" });
    const sriGuru = projects.find((p) => p.slug === "sri-guru-coaching-centre");

    assert.ok(sriGuru, "Sri Guru Coaching Centre project must exist in public projects");
    assert.equal(sriGuru.status, "completed");
    assert.equal(sriGuru.deploymentStatus, "deployed");
    assert.equal(sriGuru.liveDemoUrl, "https://srigurucoaching.in");
    assert.equal(sriGuru.repositoryUrl, "https://github.com/dhushyandh/SriGuruCoachingCentre");
    assert.ok(sriGuru.problemSolved && sriGuru.problemSolved.length > 10);
    assert.ok(Array.isArray(sriGuru.features) && sriGuru.features.length >= 3);
    assert.ok(Array.isArray(sriGuru.techStack) && sriGuru.techStack.includes("React"));
  });

  // =========================================================================
  // 4. MANDATORY PROJECT AUDIT & LINK INTEGRITY
  // =========================================================================
  it("4. All public projects store complete schema fields with verified links", async () => {
    const publicProjects = await getProjects({ mode: "public" });
    assert.ok(publicProjects.length >= 4);

    for (const p of publicProjects) {
      assert.ok(p.name, "Every project must have a name");
      assert.ok(p.description, "Every project must have a short description");
      assert.ok(p.problemSolved, `Project ${p.name} must have problemSolved`);
      assert.ok(Array.isArray(p.techStack) && p.techStack.length > 0, `Project ${p.name} must have techStack`);
      assert.ok(Array.isArray(p.features) && p.features.length > 0, `Project ${p.name} must have features`);
      assert.ok(p.status, `Project ${p.name} must have status`);
      assert.ok(p.deploymentStatus, `Project ${p.name} must have deploymentStatus`);

      // Link integrity: no fake or localhost links in public projects
      if (p.liveDemoUrl) {
        assert.ok(p.liveDemoUrl.startsWith("https://"), `Live demo URL for ${p.name} must use HTTPS`);
        assert.doesNotMatch(p.liveDemoUrl, /localhost|127\.0\.0\.1/);
      }
      if (p.repositoryUrl) {
        assert.ok(p.repositoryUrl.startsWith("https://github.com/dhushyandh"), `Repo URL for ${p.name} must point to verified GitHub`);
      }
    }
  });

  // =========================================================================
  // 5. PUBLIC ASSISTANT BEHAVIOR & INTENT ROUTING
  // =========================================================================
  it("5. Correctly handles specific public queries with verified answers", async () => {
    // 5.1 "Who is Dhushyandh?"
    const whoRes = await routeIncomingMessage({
      text: "Who is Dhushyandh?",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(whoRes.handled, true);
    assert.ok(whoRes.reply.includes("Meet Dhushyandh N."));
    assert.ok(whoRes.reply.includes("Full-Stack Developer | Mobile App Developer | Freelancer"));
    assert.ok(whoRes.reply.includes("https://dhushyandh.in"));
    assert.ok(whoRes.reply.includes("https://github.com/dhushyandh"));
    assert.ok(whoRes.sendImageBefore, "Must trigger portfolio OG image send");

    // 5.2 "Is he a mobile app developer?"
    const mobileRes = await routeIncomingMessage({
      text: "Is he a mobile app developer?",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(mobileRes.handled, true);
    assert.ok(mobileRes.reply.includes("Mobile App Developer"));
    assert.ok(mobileRes.reply.includes("Capacitor"));
    assert.ok(mobileRes.reply.includes("https://dhushyandh.in"));

    // 5.3 "What services does he provide?"
    const servicesRes = await routeIncomingMessage({
      text: "What services does he provide?",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(servicesRes.handled, true);
    assert.ok(servicesRes.reply.includes("Full-Stack Web Development"));
    assert.ok(servicesRes.reply.includes("Mobile Application Development"));

    // 5.4 "Where can I see his work?"
    const workRes = await routeIncomingMessage({
      text: "Where can I see his work?",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(workRes.handled, true);
    assert.ok(workRes.reply.includes("Featured Public Projects"));

    // 5.5 "Can I hire him?"
    const hireRes = await routeIncomingMessage({
      text: "Can I hire him?",
      mode: "public",
      chatId: TEST_VISITOR,
    });
    assert.equal(hireRes.handled, true);
    assert.ok(hireRes.reply.includes("Dhushyandh is available for freelance projects"));
    assert.ok(hireRes.reply.includes("What is your name?"));
  });

  // =========================================================================
  // 6. DETAILED PROJECT VIEW (NOT JUST NAMES)
  // =========================================================================
  it("6. Project queries show Purpose, Main Features, Tech Stack, and Links", async () => {
    // Select project 1 from project explorer
    const publicProjects = await getProjects({ mode: "public" });
    const sriGuru = publicProjects.find((p) => p.slug === "sri-guru-coaching-centre");
    assert.ok(sriGuru);

    const { formatProjectDetails } = require("../src/modules/ui/response-formatter");
    const formatted = formatProjectDetails(sriGuru, false);

    assert.ok(formatted.includes("Sri Guru Coaching Centre"));
    assert.ok(formatted.includes("*Purpose:*"), "Must display project purpose");
    assert.ok(formatted.includes("*Main Features:*"), "Must display main features");
    assert.ok(formatted.includes("*Technology Stack:*"), "Must display technology stack");
    assert.ok(formatted.includes("https://srigurucoaching.in"), "Must display verified live demo");
    assert.ok(formatted.includes("github.com/dhushyandh"), "Must display verified GitHub link");
    assert.ok(!formatted.includes("RenewX"), "Must not leak private projects");
  });

  // =========================================================================
  // 7. OG IMAGE TRANSMISSION ON PUBLIC INTRODUCTION
  // =========================================================================
  it("7. Dispatches portfolio OG image via sendImage before sending public introduction text", async () => {
    const dispatchedCalls = [];

    setFetch(async (url, options) => {
      const body = JSON.parse(options.body);
      dispatchedCalls.push({ url, body });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: `msg_${Date.now()}` }),
      };
    });

    const testKey = "TEST_INTRO_IMAGE_" + Date.now();
    const testVisitor7 = "919876543299@s.whatsapp.net";
    const incoming = {
      messageId: "wa_intro_1",
      chatId: testVisitor7,
      senderId: testVisitor7,
      senderName: "Visitor",
      text: "Who is Dhushyandh?",
      messageType: "text",
      assistantMode: "public",
      timestamp: Math.floor(Date.now() / 1000),
    };

    await processIncomingMessage(incoming, testKey);

    // Verify two outbound calls occurred: first send-image, then send-text
    assert.ok(dispatchedCalls.length >= 2, `Expected at least 2 outbound calls (image + text), got ${dispatchedCalls.length}`);
    const imageCall = dispatchedCalls.find((c) => c.url.includes("send-image"));
    const textCall = dispatchedCalls.find((c) => c.url.includes("send-text"));

    assert.ok(imageCall, "send-image endpoint must be called");
    assert.equal(imageCall.body.chatId, testVisitor7);
    assert.equal(imageCall.body.url, "https://dhushyandh.in/og-image.png");

    assert.ok(textCall, "send-text endpoint must be called");
    assert.equal(textCall.body.chatId, testVisitor7);
    assert.ok(textCall.body.text.includes("Meet Dhushyandh N."));
    assert.ok(textCall.body.text.includes("https://dhushyandh.in"));
  });
});
