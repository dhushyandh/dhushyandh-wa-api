const OwnerProfile = require("./owner-profile.model");
const logger = require("../../utils/logger");

async function getProfile({ mode = "public" } = {}) {
  const profile = await OwnerProfile.findOne({ identifier: "default_owner" }).lean();
  if (!profile) return null;

  if (mode === "public") {
    // Sanitize and return only approved public-facing fields
    return {
      name: profile.name,
      title: profile.title,
      bio: profile.bio,
      education: profile.education,
      technicalSkills: profile.technicalSkills,
      experience: profile.experience,
      portfolioUrl: profile.portfolioUrl,
      githubUrl: profile.githubUrl,
      linkedinUrl: profile.linkedinUrl,
      services: (profile.services || []).filter((s) => s.isPublic),
    };
  }

  // Private mode: Return complete profile including professional preferences
  return profile;
}

async function updateProfile(updates) {
  const updated = await OwnerProfile.findOneAndUpdate(
    { identifier: "default_owner" },
    { $set: updates },
    { returnDocument: "after", upsert: true }
  );
  logger.info("Owner profile updated");
  return updated;
}

module.exports = {
  getProfile,
  updateProfile,
};
