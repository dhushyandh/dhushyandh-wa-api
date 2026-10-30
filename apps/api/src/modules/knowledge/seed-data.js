const OwnerProfile = require("./owner-profile.model");
const Project = require("./project.model");
const Memory = require("../memory/memory.model");
const logger = require("../../utils/logger");

const INITIAL_PROFILE = {
  identifier: "default_owner",
  name: "Dhushyandh N.",
  title: "Full-Stack Developer | Mobile App Developer | Freelancer",
  bio: "Dhushyandh N. is a Full-Stack Developer, Mobile App Developer and Freelancer who builds modern web applications, mobile applications, scalable backend systems and AI-powered solutions.",
  education: [
    {
      degree: "B.E. Computer Science Engineering",
      institution: "C. Abdul Hakeem College of Engineering and Technology · Anna University",
      year: "2023 - 2027",
    },
  ],
  technicalSkills: [
    {
      category: "Frontend Development",
      skills: ["React", "Next.js", "JavaScript", "TypeScript", "Tailwind CSS", "HTML5/CSS3"],
    },
    {
      category: "Mobile App Development",
      skills: ["Capacitor", "Android Builds (APK/AAB)", "Responsive Mobile Web", "Cross-Platform Apps"],
    },
    {
      category: "Backend & REST APIs",
      skills: ["Node.js (v22)", "Express 5", "REST APIs", "Webhook Architecture", "Docker"],
    },
    {
      category: "Database Systems",
      skills: ["MongoDB", "Mongoose", "PostgreSQL", "Prisma"],
    },
    {
      category: "AI & Automation",
      skills: ["Google Gemini API", "OpenWA Gateway", "Baileys Engine", "Grounded Context", "Hybrid Memory"],
    },
  ],
  experience: [
    {
      role: "Freelance Full Stack Developer",
      organization: "Independent",
      duration: "Aug 2026 - Present",
      highlights: [
        "Delivered real client web applications including the Sri Guru Coaching Centre website.",
        "Built custom full-stack solutions, e-commerce architectures, and WhatsApp automations.",
        "Developed mobile-ready architectures with Capacitor and Android Google Play packages.",
      ],
    },
    {
      role: "Full Stack Developer Intern",
      organization: "Unified Mentor Pvt. Ltd.",
      duration: "Aug 2026 - Oct 2026",
      highlights: [
        "Worked across frontend interfaces, backend services, databases, and deployment pipelines.",
      ],
    },
    {
      role: "MERN Stack Developer Intern",
      organization: "Codec Technologies",
      duration: "Feb 2026 - Mar 2026",
      highlights: [
        "Gained practical experience building React, Node.js, Express, and MongoDB applications.",
      ],
    },
  ],
  portfolioUrl: "https://dhushyandh.in",
  githubUrl: "https://github.com/dhushyandh",
  linkedinUrl: "https://linkedin.com/in/dhushyandh",
  services: [
    {
      name: "Full-Stack Web Development",
      description: "Building modern, responsive full-stack web applications using React, Next.js, Node.js, and Express.",
      deliverables: ["Modern Responsive Frontends", "Full-Stack Web Architecture", "High Performance Web Apps"],
      isPublic: true,
    },
    {
      name: "Mobile Application Development",
      description: "Developing cross-platform and mobile applications with Capacitor, React, and Android package builds.",
      deliverables: ["Android APK / AAB Builds", "Cross-Platform Mobile Apps", "Mobile-Optimized UX"],
      isPublic: true,
    },
    {
      name: "Backend and REST API Development",
      description: "Engineering secure, scalable backend architectures, REST APIs, and automated webhook pipelines.",
      deliverables: ["RESTful API Architecture", "Database Modeling & Query Tuning", "Fault-Tolerant Endpoints"],
      isPublic: true,
    },
    {
      name: "Database Design and Integration",
      description: "Designing robust relational and document database architectures with MongoDB, PostgreSQL, and Prisma.",
      deliverables: ["Schema Architecture & Indexing", "Data Validation & Integrity", "Persistent Storage Workflows"],
      isPublic: true,
    },
    {
      name: "AI Integration and Automation",
      description: "Integrating generative AI models, context grounding engines, and autonomous WhatsApp assistants.",
      deliverables: ["Gemini API Integrations", "Grounded Context Retrieval", "Automated AI Workflows"],
      isPublic: true,
    },
    {
      name: "E-commerce Application Development",
      description: "Building product discovery marketplaces, shopping flows, and storefront architectures.",
      deliverables: ["Product Catalogues & Filtering", "Cart & Checkout Flow", "Storefront Interfaces"],
      isPublic: true,
    },
    {
      name: "Custom Software Development",
      description: "Crafting tailor-made software solutions and automation tools for client operational needs.",
      deliverables: ["Custom Business Tools", "Workflow Automations", "End-to-End Delivery"],
      isPublic: true,
    },
  ],
  professionalPreferences: {
    preferredTechStack: ["React", "Node.js 22", "Express 5", "MongoDB", "Capacitor", "Gemini API", "OpenWA", "Docker"],
    workStyle: "Independent freelance developer delivering reliable, client-focused solutions",
    availability: "Open for freelance projects, custom software development, and consulting",
    communicationPreference: "WhatsApp and direct email",
  },
  isPublic: true,
};

const INITIAL_PROJECTS = [
  {
    name: "Sri Guru Coaching Centre",
    slug: "sri-guru-coaching-centre",
    description: "A verified client website created to give an educational coaching centre a professional digital presence with clear information architecture and responsive presentation.",
    problemSolved: "Gives an educational coaching centre a structured, accessible, search-friendly online presence so prospective students and parents can understand its course offerings and contact the centre directly.",
    techStack: ["React", "TypeScript", "Tailwind CSS", "Responsive Web Design", "SEO"],
    features: [
      "Professional Coaching Centre Website",
      "Clear Information Architecture",
      "Responsive Design across Desktop, Tablet & Mobile",
      "Educational Course & Faculty Presentation",
      "Direct Student & Parent Contact Pathways",
      "Search-Friendly Foundation",
    ],
    status: "completed",
    deploymentStatus: "deployed",
    liveDemoUrl: "https://srigurucoaching.in",
    repositoryUrl: "https://github.com/dhushyandh/SriGuruCoachingCentre",
    mobileAppUrl: "",
    category: "Client · Freelance",
    isPublic: true,
    milestones: [
      {
        title: "Client requirements and information architecture",
        status: "completed",
        dueDate: "2026-06",
        completedAt: new Date("2026-06-15"),
      },
      {
        title: "Responsive website design and SEO deployment",
        status: "completed",
        dueDate: "2026-07",
        completedAt: new Date("2026-07-20"),
      },
    ],
    currentProgress: "Successfully delivered and deployed live in production.",
    blockers: [],
    importantDecisions: [
      {
        decision: "Focus on clean accessible information architecture",
        rationale: "Ensures students and parents can quickly discover course details on mobile devices.",
        decidedAt: new Date("2026-06-10"),
      },
    ],
    tags: ["freelance", "client", "react", "seo", "education"],
  },
  {
    name: "DHUSHYANDH AI",
    slug: "dhushyandh-ai",
    description: "WhatsApp-based personal AI platform with public and private assistant modes, HMAC-verified webhooks, persistent deduplication, and grounded knowledge engine.",
    problemSolved: "Eliminates reliance on complex web dashboards by providing an autonomous personal AI assistant and lead management engine directly on WhatsApp at ₹0 cloud cost.",
    techStack: ["Node.js 22", "Express 5", "MongoDB", "Mongoose", "Google Gemini 3.8 Flash", "OpenWA", "Baileys", "Docker"],
    features: [
      "Dual Public/Private Assistant Modes",
      "WhatsApp LID Owner Authentication",
      "Numbered Menus & Guided Project Explorer",
      "Multi-Step Freelance Lead Capture",
      "Instant Owner WhatsApp Push Alerts",
      "Grounded Knowledge Retrieval & Hybrid Memory",
      "Atomic Locking & Stale Record Recovery",
    ],
    status: "active",
    deploymentStatus: "deployed_local",
    liveDemoUrl: "",
    repositoryUrl: "https://github.com/dhushyandh/dhushyandh-ai",
    mobileAppUrl: "",
    category: "Product · AI Platform",
    isPublic: true,
    milestones: [
      {
        title: "Phase 1: Production Readiness, Webhook Security & Lifecycle State Machine",
        status: "completed",
        dueDate: "2026-10",
        completedAt: new Date("2026-10-30"),
      },
      {
        title: "Phase 2: Structured Knowledge Engine, Profile Grounding & Hybrid Memory",
        status: "completed",
        dueDate: "2026-10",
        completedAt: new Date("2026-10-30"),
      },
      {
        title: "Phase 3: Interactive WhatsApp UX, Tasks, Notes, Reminders",
        status: "completed",
        dueDate: "2026-10",
        completedAt: new Date("2026-10-30"),
      },
      {
        title: "Phase 4: Public Assistant & Freelance Lead Capture Pipeline",
        status: "completed",
        dueDate: "2026-10",
        completedAt: new Date("2026-10-30"),
      },
    ],
    currentProgress: "Phases 1-4 completed with 100% test pass. Production WhatsApp workflow fully active.",
    blockers: [],
    importantDecisions: [
      {
        decision: "Use Node 22 native test runner",
        rationale: "Eliminates third-party test dependencies and maintains ₹0 additional software cost.",
        decidedAt: new Date("2026-10-30"),
      },
      {
        decision: "Persistent two-level deduplication with MongoDB unique indexes",
        rationale: "Prevents duplicate WhatsApp responses upon webhook retransmissions.",
        decidedAt: new Date("2026-10-30"),
      },
      {
        decision: "Unified WhatsApp LID owner authorization",
        rationale: "Guarantees reliable owner recognition without relying on spoofable display names.",
        decidedAt: new Date("2026-10-30"),
      },
    ],
    tags: ["ai", "whatsapp", "gemini", "nodejs", "mongodb", "openwa"],
  },
  {
    name: "ProjectManagement",
    slug: "project-management",
    description: "A full-stack project management platform focused on organizing projects, tasks, and team workflows through a centralized web application.",
    problemSolved: "Provides individuals and teams with a centralized workspace to manage projects, assign tasks, and track development progress in real-time.",
    techStack: ["React", "JavaScript", "Node.js", "Express.js", "MongoDB", "REST API", "Tailwind CSS"],
    features: [
      "Centralized Project Organization",
      "Task Tracking & Status Management",
      "Full-Stack Architecture",
      "REST API Integration",
      "Persistent MongoDB Storage",
      "Responsive UI Experience",
    ],
    status: "completed",
    deploymentStatus: "deployed",
    liveDemoUrl: "https://projectmanage.dhushyandh.me",
    repositoryUrl: "https://github.com/dhushyandh/ProjectManagement",
    mobileAppUrl: "",
    category: "Personal · Full Stack",
    isPublic: true,
    milestones: [
      {
        title: "Core task management and API workflows",
        status: "completed",
        dueDate: "2025-04",
        completedAt: new Date("2025-04-20"),
      },
      {
        title: "Responsive frontend and deployment",
        status: "completed",
        dueDate: "2025-05",
        completedAt: new Date("2025-05-10"),
      },
    ],
    currentProgress: "Completed personal project deployed on the web.",
    blockers: [],
    importantDecisions: [
      {
        decision: "Full-stack separation of React client and Express API",
        rationale: "Enables modular maintenance and clean REST API practices.",
        decidedAt: new Date("2025-03-15"),
      },
    ],
    tags: ["full-stack", "mern", "react", "nodejs", "mongodb"],
  },
  {
    name: "AI-Based Budget Utilization Monitoring System",
    slug: "ai-budget-utilization-monitoring",
    description: "An AI-oriented monitoring system for analysing budget-utilization data and presenting useful insights through a web-based interface.",
    problemSolved: "Translates raw institutional financial allocations into visual tracking metrics and trend analyses to prevent budget underutilization.",
    techStack: ["React", "JavaScript", "Python", "AI", "Data Analytics", "Web Application"],
    features: [
      "Budget Allocation Tracking",
      "Financial Pattern Analytics",
      "Visual Spending Dashboards",
      "AI-Assisted Trend Interpretations",
      "Web-Based Monitoring Interface",
    ],
    status: "completed",
    deploymentStatus: "completed_academic",
    liveDemoUrl: "",
    repositoryUrl: "https://github.com/dhushyandh",
    mobileAppUrl: "",
    category: "Academic · AI",
    isPublic: true,
    milestones: [
      {
        title: "Data pipeline and budget analysis model",
        status: "completed",
        dueDate: "2026-03",
        completedAt: new Date("2026-03-30"),
      },
    ],
    currentProgress: "Completed academic AI monitoring project.",
    blockers: [],
    importantDecisions: [
      {
        decision: "Web-based dashboard with Python analytics backend",
        rationale: "Combines fast UI rendering with robust data analysis libraries.",
        decidedAt: new Date("2026-02-15"),
      },
    ],
    tags: ["ai", "python", "analytics", "react"],
  },
  {
    name: "Dhushyandh Developer Portfolio",
    slug: "dhushyandh-portfolio",
    description: "Modern personal portfolio website and mobile application showcasing verified projects, technical case studies, and engineering credentials.",
    problemSolved: "Delivers a fast, interactive digital portfolio with comprehensive case studies and mobile app download for prospective clients and recruiters.",
    techStack: ["React", "TanStack Start", "TypeScript", "Tailwind CSS", "Capacitor", "Vite"],
    features: [
      "Interactive Project Case Studies",
      "Verified Credentials & Certifications",
      "Responsive Multi-Device Layouts",
      "Android Mobile Application Package (.apk/.aab)",
      "SEO Optimization & Social OG Previews",
    ],
    status: "active",
    deploymentStatus: "deployed",
    liveDemoUrl: "https://dhushyandh.in",
    repositoryUrl: "https://github.com/dhushyandh",
    mobileAppUrl: "https://dhushyandh.in",
    category: "Portfolio & Mobile App",
    isPublic: true,
    milestones: [
      {
        title: "Portfolio website launch",
        status: "completed",
        dueDate: "2026-09",
        completedAt: new Date("2026-09-11"),
      },
      {
        title: "Android Google Play package build",
        status: "completed",
        dueDate: "2026-10",
        completedAt: new Date("2026-10-17"),
      },
    ],
    currentProgress: "Live in production at https://dhushyandh.in with Android mobile package built.",
    blockers: [],
    importantDecisions: [
      {
        decision: "Build mobile application package alongside web app using Capacitor",
        rationale: "Enables mobile presence on Android devices with shared codebase.",
        decidedAt: new Date("2026-09-15"),
      },
    ],
    tags: ["portfolio", "react", "mobile", "typescript"],
  },
  {
    name: "RenewX Crew",
    slug: "renewx",
    description: "Dedicated marketplace platform for refurbished devices with automated operational WhatsApp workflows.",
    problemSolved: "Streamlines circular economy trade-in and commerce workflows for refurbished hardware with WhatsApp automation.",
    techStack: ["React", "TypeScript", "Node.js", "Express", "MongoDB", "Capacitor", "Docker", "OpenWA"],
    features: [
      "Refurbished Marketplace UX",
      "Mobile-First Architecture",
      "WhatsApp Gateway Automation",
      "Isolated Docker Runtime",
    ],
    status: "active",
    deploymentStatus: "deployed",
    liveDemoUrl: "https://renewx.dhushyandh.in",
    repositoryUrl: "https://github.com/dhushyandh/RenewXCrew",
    mobileAppUrl: "renewX.apk",
    category: "Product · Commercial",
    isPublic: false, // PRIVATE PROJECT: Strict isolation preserved!
    milestones: [
      {
        title: "Gateway container isolation on port 2785",
        status: "completed",
        dueDate: "2026-09",
        completedAt: new Date("2026-09-15"),
      },
      {
        title: "Production operations and monitoring",
        status: "in_progress",
        dueDate: "2026-10",
      },
    ],
    currentProgress: "Running on dedicated container instance with strict isolation.",
    blockers: [],
    importantDecisions: [
      {
        decision: "Independent container instance on dedicated port 2785",
        rationale: "Ensures complete separation from personal AI platform and prevents cross-tenant interference.",
        decidedAt: new Date("2026-09-01"),
      },
    ],
    repositoryUrl: "https://github.com/dhushyandh/RenewXCrew",
    deploymentUrl: "http://localhost:2785",
    tags: ["whatsapp", "automation", "openwa", "docker", "internal"],
  },
];

const INITIAL_MEMORIES = [
  {
    content: "DHUSHYANDH AI architecture strictly adheres to a target additional software cost of ₹0 by utilizing local compute, local Docker containers, and MongoDB without external vector databases or paid subscriptions.",
    category: "project_decision",
    scope: "private",
    source: "manual_seed",
    confidence: 1.0,
    importance: 5,
    approvalStatus: "approved",
    tags: ["cost", "architecture", "dhushyandh-ai", "budget"],
    projectSlug: "dhushyandh-ai",
  },
  {
    content: "The owner prefers concise, direct, technically rigorous communication with actionable bullet points over generic conversational summaries.",
    category: "technical_preference",
    scope: "private",
    source: "manual_seed",
    confidence: 0.95,
    importance: 4,
    approvalStatus: "approved",
    tags: ["preference", "communication", "owner", "style"],
  },
  {
    content: "The RenewX container runs separately on port 2785 and must never be stopped, modified, or reconfigured by DHUSHYANDH AI.",
    category: "project_decision",
    scope: "private",
    source: "manual_seed",
    confidence: 1.0,
    importance: 5,
    approvalStatus: "approved",
    tags: ["renewx", "safety", "docker", "isolation"],
    projectSlug: "renewx",
  },
];

/**
 * Idempotently seeds initial owner profile, projects, and approved memories.
 * Safe to execute repeatedly without duplicating data.
 */
async function seedInitialKnowledge() {
  const stats = { profileUpdated: false, projectsUpserted: 0, memoriesUpserted: 0 };

  try {
    // 1. Seed Owner Profile (upsert by identifier)
    await OwnerProfile.findOneAndUpdate(
      { identifier: INITIAL_PROFILE.identifier },
      { $set: INITIAL_PROFILE },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    stats.profileUpdated = true;

    // 2. Seed Projects (upsert by slug)
    for (const proj of INITIAL_PROJECTS) {
      await Project.findOneAndUpdate(
        { slug: proj.slug },
        { $set: proj },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      stats.projectsUpserted++;
    }

    // 3. Seed Memories (upsert by contentHash)
    for (const mem of INITIAL_MEMORIES) {
      const contentHash = Memory.hashContent(mem.content);
      await Memory.findOneAndUpdate(
        { contentHash },
        { $set: { ...mem, contentHash } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      stats.memoriesUpserted++;
    }

    logger.info("Initial knowledge seeding completed successfully", stats);
    return stats;
  } catch (error) {
    logger.error("Failed to seed initial knowledge base", { error: error.message });
    throw error;
  }
}

module.exports = {
  INITIAL_PROFILE,
  INITIAL_PROJECTS,
  INITIAL_MEMORIES,
  seedInitialKnowledge,
};
