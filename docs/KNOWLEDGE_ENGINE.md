# DHUSHYANDH AI — Phase 2: AI Knowledge Engine

## 1. Overview & Objectives

The DHUSHYANDH AI Knowledge Engine grounds the conversational assistant in structured, persistent domain facts stored in MongoDB. Rather than relying on static system prompt text or expensive external vector databases, the Knowledge Engine retrieves context on demand with zero software licensing costs.

```
WhatsApp User Query
       │
       ▼
[Context Retriever] (Intent Detection & Keyword Extraction)
       │
       ├── Query OwnerProfile (Public / Private)
       ├── Query Projects (Keyword Matching + Public/Private Isolation)
       └── Query Approved Memories (Private Only)
       │
       ▼
[Bounded Context Builder] (Character budget: <= 3,500 chars)
       │
       ▼
[Gemini Generation] (gemini-3.8-flash with Grounded Knowledge)
       │
       ▼
Grounded Outbound WhatsApp Response
```

---

## 2. Structured Knowledge Data Models

### 2.1 OwnerProfile (`apps/api/src/modules/knowledge/owner-profile.model.js`)
Stores biographical, educational, technical, and service information about Dhushyandh.

- **Schema Fields**:
  - `name`: String (required, default `"Dhushyandh"`)
  - `tagline`: String (e.g. `"Full-Stack AI Systems Engineer & Full-Stack Developer"`)
  - `bio`: String (Public professional background)
  - `education`: Array of `{ degree, institution, year, details }`
  - `technicalSkills`: Array of `{ category, skills: [String] }` (e.g., Languages, Frameworks, AI/ML, Cloud/DevOps)
  - `experience`: Array of `{ role, company, period, description, achievements: [String] }`
  - `portfolioUrl`: String (URL)
  - `githubUrl`: String (URL)
  - `linkedinUrl`: String (URL)
  - `services`: Array of `{ title, description, deliverables: [String], active: Boolean }`
  - `professionalPreferences`: Array of `{ key, value, scope: ["public", "private"] }`
  - `availabilityStatus`: String (`"available"`, `"limited"`, `"busy"`, `"unavailable"`)
- **Indexes**:
  - `{ name: 1 }` (unique)
  - `{ "services.active": 1 }`

### 2.2 Project (`apps/api/src/modules/knowledge/project.model.js`)
Stores active, completed, and in-development projects.

- **Schema Fields**:
  - `name`: String (required)
  - `slug`: String (required, unique, slugified identifier e.g. `"dhushyandh-ai"`, `"renewx"`)
  - `description`: String (required)
  - `scope`: String (`"public"` or `"private"`, default `"public"`)
  - `category`: String (`"ai_agent"`, `"web_app"`, `"mobile_app"`, `"automation"`, `"infrastructure"`, `"client_work"`, `"internal"`)
  - `status`: String (`"concept"`, `"in_development"`, `"testing"`, `"production"`, `"completed"`, `"paused"`, `"archived"`)
  - `techStack`: Array of String (e.g., `["Node.js 22", "Express 5", "MongoDB", "Google Gemini API", "OpenWA", "Docker"]`)
  - `milestones`: Array of `{ title, description, status: ["pending", "in_progress", "completed", "delayed"], dueDate, completedDate }`
  - `currentProgress`: String
  - `blockers`: Array of String
  - `importantDecisions`: Array of `{ title, rational, decidedAt, scope: ["public", "private"] }`
  - `repositoryUrl`: String (URL, optional)
  - `deploymentUrl`: String (URL, optional)
  - `isFeatured`: Boolean (default `false`)
- **Indexes**:
  - `{ slug: 1 }` (unique)
  - `{ scope: 1, status: 1 }`
  - `{ techStack: 1 }`

---

## 3. Seed Data & Idempotent Synchronization (`seed-data.js`)

Seeding runs automatically on server startup via `seedInitialKnowledge()` in `apps/api/src/server.js`:
- Uses Mongoose `findOneAndUpdate` with `upsert: true` to prevent duplicate insertions on service reboots.
- Pre-seeds:
  1. **Dhushyandh N. Developer Profile**: Full-Stack Developer | Mobile App Developer | Freelancer. 7 verified service categories, portfolio (`https://dhushyandh.in`), GitHub (`https://github.com/dhushyandh`).
  2. **Audited & Verified Projects**: All public projects with problem solved, main features, tech stack, and verified live/repo links.
  3. **RenewX Project (Private)**: Dedicated OpenWA integration, refurbished hardware marketplace, strict isolation.
  4. **Initial Verified Memories (Private)**: Technical preferences (e.g. ₹0 additional software cost requirement, Docker Baileys container isolation, LID-first authentication).

### 3.1 Audited & Verified Projects Registry

| Project Name | Scope | Problem Solved | Key Tech Stack | Live Demo Link | Repository Link |
|---|---|---|---|---|---|
| **Sri Guru Coaching Centre** | Public | Educational coaching centre website with structured information architecture & responsive presentation | React, TypeScript, Tailwind CSS, SEO | https://srigurucoaching.in | https://github.com/dhushyandh/SriGuruCoachingCentre |
| **DHUSHYANDH AI** | Public | Autonomous WhatsApp personal assistant, task manager, and freelance lead intake | Node.js 22, Express 5, MongoDB, Gemini API, OpenWA | None (WhatsApp Bot) | https://github.com/dhushyandh |
| **ProjectManagement** | Public | Full-stack team project, task, and workflow management web application | React, Node.js, Express, MongoDB, REST API | https://projectmanage.dhushyandh.me | https://github.com/dhushyandh/ProjectManagement |
| **AI-Based Budget Utilization Monitoring** | Public | Academic AI analytics dashboard analyzing budget allocation anomalies | React, Python, Machine Learning, Fast Analytics | None (Academic) | https://github.com/dhushyandh |
| **Dhushyandh Developer Portfolio** | Public | Developer portfolio and Android mobile app (.apk/.aab) showcasing verified case studies | React, TanStack Start, TypeScript, Capacitor | https://dhushyandh.in | https://github.com/dhushyandh |
| **RenewX Crew** | **Private** | Refurbished hardware circular economy marketplace with dedicated WhatsApp gateway | React, Node.js, MongoDB, Capacitor, Docker | `https://renewx.dhushyandh.in` (Private) | `https://github.com/dhushyandh/RenewXCrew` (Private) |

---

## 4. Context Retrieval Engine (`context-retriever.service.js`)

### 4.1 Intent Detection
The retrieval pipeline inspects incoming text using regular expression keyword matching to detect the user's intent:
- `PROFILE_INTENT`: "who are you", "about you", "skills", "experience", "education", "background", "technologies".
- `SERVICES_INTENT`: "services", "hire", "freelance", "cost", "pricing", "rate", "quote", "build me", "can you create".
- `PROJECT_SPECIFIC`: Specific project identifiers (e.g., `"dhushyandh-ai"`, `"renewx"`).
- `PROJECTS_GENERAL`: "projects", "portfolio", "work", "apps", "what have you built", "showcase".
- `GENERAL_INTENT`: Queries not matching specific categories load default profile and featured projects.

### 4.2 Public vs. Private Isolation
- **Public Inquiries**:
  - `OwnerProfile` preferences strictly filter `scope: "public"`.
  - Projects filter strictly `{ scope: "public" }`. Private projects (like RenewX internal specs) are excluded.
  - Memories are completely disabled (always returns 0 memories).
- **Private Inquiries (Authorized Owner)**:
  - Loads all public and private profile preferences.
  - Loads all projects including private internal details, blockers, and architecture decisions.
  - Retrieves relevant approved memories matching the conversation topics.

### 4.3 Size Budgeting & Bounded Grounding
To prevent prompt bloat and keep Gemini execution fast and cost-free:
- **Maximum Budget**: 3,500 characters (~800 tokens).
- Content is added section-by-section. If the payload approaches the character ceiling, memories and optional project fields are truncated gracefully to guarantee essential profile facts fit within budget.

---

## 5. Telemetry & Performance Tracking

Every processed message records timing telemetry directly in `MessageEvent`:
- `retrievalDurationMs`: Context retrieval duration (MongoDB lookup + budgeting, typically 30–80 ms).
- `geminiDurationMs`: Time spent in Gemini API generation.
- `openwaDurationMs`: Time spent in OpenWA outbound dispatch.
- `retrievedItems`: Count of profile, project, and memory records injected into the prompt.
