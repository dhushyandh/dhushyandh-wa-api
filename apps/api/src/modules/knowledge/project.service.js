const Project = require("./project.model");
const logger = require("../../utils/logger");

function extractKeywords(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

async function getProjects({ mode = "public", query = "", limit = 5 } = {}) {
  const filter = {};

  // Strict public mode filter: only public projects can be retrieved
  if (mode === "public") {
    filter.isPublic = true;
  }

  const keywords = extractKeywords(query);

  let projects = [];

  if (keywords.length > 0) {
    // Keyword match on name, techStack, tags, slug
    const regexOr = keywords.map((k) => ({
      $or: [
        { name: { $regex: k, $options: "i" } },
        { slug: { $regex: k, $options: "i" } },
        { description: { $regex: k, $options: "i" } },
        { techStack: { $regex: k, $options: "i" } },
        { tags: { $regex: k, $options: "i" } },
      ],
    }));

    projects = await Project.find({
      $and: [filter, { $or: regexOr.map((item) => item.$or).flat() }],
    })
      .limit(limit)
      .lean();
  }

  // If no specific keyword match was found or query was empty, return active projects
  if (projects.length === 0) {
    projects = await Project.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  }

  // Format projects based on access mode
  return projects.map((p) => {
    if (mode === "public") {
      return {
        name: p.name,
        slug: p.slug,
        description: p.description,
        techStack: p.techStack,
        status: p.status,
        repositoryUrl: p.repositoryUrl,
        deploymentUrl: p.deploymentUrl,
        problemSolved: p.problemSolved,
        features: p.features || [],
        deploymentStatus: p.deploymentStatus,
        liveDemoUrl: p.liveDemoUrl,
        mobileAppUrl: p.mobileAppUrl,
        category: p.category,
        // Public milestones without private internals
        milestones: (p.milestones || []).map((m) => ({ title: m.title, status: m.status })),
        currentProgress: p.currentProgress,
      };
    }
    // Private mode gets full details including blockers and important decisions
    return p;
  });
}

async function getProjectBySlug(slug, { mode = "public" } = {}) {
  const filter = { slug };
  if (mode === "public") {
    filter.isPublic = true;
  }
  const p = await Project.findOne(filter).lean();
  if (!p) return null;
  if (mode === "public") {
    return {
      name: p.name,
      slug: p.slug,
      description: p.description,
      techStack: p.techStack,
      status: p.status,
      repositoryUrl: p.repositoryUrl,
      deploymentUrl: p.deploymentUrl,
      problemSolved: p.problemSolved,
      features: p.features || [],
      deploymentStatus: p.deploymentStatus,
      liveDemoUrl: p.liveDemoUrl,
      mobileAppUrl: p.mobileAppUrl,
      category: p.category,
      milestones: (p.milestones || []).map((m) => ({ title: m.title, status: m.status })),
      currentProgress: p.currentProgress,
    };
  }
  return p;
}

async function upsertProject(projectData) {
  if (!projectData.slug && projectData.name) {
    projectData.slug = projectData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
  return Project.findOneAndUpdate(
    { slug: projectData.slug },
    { $set: projectData },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

async function updateProjectStatus(slug, status) {
  return Project.findOneAndUpdate(
    { slug },
    { $set: { status: status.toLowerCase(), updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

async function addProjectMilestone(slug, { title, status = "pending" }) {
  return Project.findOneAndUpdate(
    { slug },
    { $push: { milestones: { title: title.trim(), status } }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

async function addProjectBlocker(slug, blockerText) {
  return Project.findOneAndUpdate(
    { slug },
    { $addToSet: { blockers: blockerText.trim() }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

async function addProjectDecision(slug, { decision, title, rationale, rational }) {
  const text = decision || title || "";
  const reason = rationale || rational || "";
  return Project.findOneAndUpdate(
    { slug },
    {
      $push: {
        importantDecisions: {
          decision: text.trim(),
          rationale: reason.trim(),
          decidedAt: new Date(),
        },
      },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );
}

module.exports = {
  getProjects,
  getProjectBySlug,
  upsertProject,
  extractKeywords,
  updateProjectStatus,
  addProjectMilestone,
  addProjectBlocker,
  addProjectDecision,
};
