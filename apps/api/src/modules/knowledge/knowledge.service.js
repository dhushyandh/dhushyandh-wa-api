const { getProfile, updateProfile } = require("./owner-profile.service");
const { getProjects, getProjectBySlug, upsertProject } = require("./project.service");
const logger = require("../../utils/logger");

async function queryKnowledge({ query = "", mode = "public" } = {}) {
  const startTime = Date.now();

  const [profile, projects] = await Promise.all([
    getProfile({ mode }),
    getProjects({ mode, query, limit: 3 }),
  ]);

  const durationMs = Date.now() - startTime;

  logger.debug("Knowledge queried", {
    mode,
    queryLength: query.length,
    projectsFound: projects.length,
    durationMs,
  });

  return {
    profile,
    projects,
    durationMs,
  };
}

module.exports = {
  queryKnowledge,
  getProfile,
  updateProfile,
  getProjects,
  getProjectBySlug,
  upsertProject,
};
