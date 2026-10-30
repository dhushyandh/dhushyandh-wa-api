const mongoose = require("mongoose");

const technicalSkillGroupSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    skills: [{ type: String, required: true }],
  },
  { _id: false }
);

const serviceItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    deliverables: [{ type: String }],
    isPublic: { type: Boolean, default: true },
  },
  { _id: false }
);

const experienceItemSchema = new mongoose.Schema(
  {
    role: { type: String, required: true },
    organization: { type: String, required: true },
    duration: { type: String, required: true },
    highlights: [{ type: String }],
  },
  { _id: false }
);

const educationItemSchema = new mongoose.Schema(
  {
    degree: { type: String, required: true },
    institution: { type: String, required: true },
    year: { type: String },
  },
  { _id: false }
);

const ownerProfileSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, unique: true, default: "default_owner" },
    name: { type: String, required: true, default: "Dhushyandh" },
    title: { type: String, required: true, default: "Full-Stack Developer & AI Systems Engineer" },
    bio: { type: String, default: "" },
    education: [educationItemSchema],
    technicalSkills: [technicalSkillGroupSchema],
    experience: [experienceItemSchema],
    portfolioUrl: { type: String, default: "" },
    githubUrl: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    services: [serviceItemSchema],
    professionalPreferences: {
      preferredTechStack: [{ type: String }],
      workStyle: { type: String, default: "Asynchronous, detail-oriented, test-driven" },
      availability: { type: String, default: "Open for freelance & contract engineering" },
      communicationPreference: { type: String, default: "WhatsApp & Email" },
    },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.OwnerProfile ||
  mongoose.model("OwnerProfile", ownerProfileSchema);
