# DHUSHYANDH AI — Public Assistant & Interaction Specification

## 1. Overview

The Public Assistant is the outward-facing interface of DHUSHYANDH AI. Designed for prospective clients, recruiters, and developer peers, it provides grounded knowledge about Dhushyandh M, interactive project exploration, service overviews, and conversational freelance lead capture.

---

## 2. Conversation Flow & Navigation

To provide maximum reliability across all WhatsApp clients (Android, iOS, WhatsApp Web, Desktop), DHUSHYANDH AI utilizes **Clean Numbered Menus** rather than deprecated interactive buttons.

### 2.1 Welcome Menu Trigger
- Triggers on: `/start`, `/menu`, `hi`, `hello`, `hey`, `help`, or unhandled introductory messages.
- Formatted output:
```text
Hey there! 👋

Welcome to DHUSHYANDH AI.
I'm Dhushyandh's AI assistant. How can I help you today?

1. About Dhushyandh
2. Explore Projects
3. Development Services
4. Hire / Work Together
5. Ask a Question

Reply with a number (1-5) to get started!
```

### 2.2 Option 1: About Dhushyandh
- **Data Source**: MongoDB `OwnerProfile` collection.
- **Displayed Facts**:
  - Full Name: Dhushyandh N.
  - Headline: Full-Stack Developer | Mobile App Developer | Freelancer
  - Bio: Dhushyandh N. is a Full-Stack Developer, Mobile App Developer and Freelancer who builds modern web applications, mobile applications, scalable backend systems and AI-powered solutions.
  - Portfolio Website: https://dhushyandh.in
  - GitHub Profile: https://github.com/dhushyandh
- **Portfolio OG Image Dispatch**:
  - On triggering Option 1 / "Who is Dhushyandh?", the backend automatically transmits the verified portfolio OG image (`apps/api/assets/og-image.png` / `https://dhushyandh.in/og-image.png`) via OpenWA `sendImage` before delivering the text message.
- **Strict Privacy Rule**: Private phone numbers, internal operational notes, and personal preferences are strictly omitted.

### 2.3 Option 2: Guided Project Explorer
- **Initiation**: Displays verified public projects with numbered selection:
```text
🚀 *Featured Public Projects*

1. *Sri Guru Coaching Centre* [COMPLETED]
2. *DHUSHYANDH AI* [ACTIVE]
3. *ProjectManagement* [COMPLETED]
4. *AI-Based Budget Utilization Monitoring System* [COMPLETED]
5. *Dhushyandh Developer Portfolio* [ACTIVE]

Reply with a number (e.g. *1*) to view tech stack & links, or *3* for services.
```
- **Project Detail**: Selecting a project returns:
  1. Project name
  2. Purpose (problem solved)
  3. Main features list
  4. Technology stack
  5. Verified live demo and GitHub repository links
- **Security Barrier**: Private projects (e.g. RenewX) are completely excluded from database queries (`isPublic: true` filter).

### 2.4 Option 3: Development Services Catalogue
- **Data Source**: `OwnerProfile.services`.
- Verified Categories (7 Total):
  1. Full-Stack Web Development
  2. Mobile Application Development
  3. Backend and REST API Development
  4. Database Design and Integration
  5. AI Integration and Automation
  6. E-commerce Application Development
  7. Custom Software Development

1. *Full-Stack Web Development*
   Modern, scalable web applications built with React, Node.js, and MongoDB.

2. *WhatsApp Bot & AI Automation*
   Reliable WhatsApp bots, multi-agent workflows, and AI assistants.

3. *AI Application Development*
   Custom Gemini integrations, grounded RAG pipelines, and intelligent automations.

💡 Interested in working together? Reply *4* to get in touch or request a quote!
```

### 2.5 Option 4: Hire / Work Together
- Transitions the user session into the `lead_capture` conversational state machine (see `docs/LEAD_MANAGEMENT.md`).

### 2.6 Option 5: Ask a Question
- Prompts the visitor to ask any freeform question about Dhushyandh's skills, projects, or background.
- Routed to Google Gemini with grounded public context injection.

---

## 3. Strict Grounding & Anti-Hallucination Guardrails

The public assistant adheres to strict zero-hallucination policies:
1. **No Invented Qualifications**: Only degrees and certifications in `OwnerProfile` are stated.
2. **No Invented Pricing**: Development pricing is project-dependent; requests for prices trigger the requirements capture flow (Option 4).
3. **No Fabricated References**: Only authorized public projects and links are mentioned; no unverified client names or revenue figures are disclosed.
4. **Knowledge Gaps**: If asked a question outside the verified knowledge base, the assistant explicitly states:
   > *"I don't have that verified information in Dhushyandh's profile yet. Please leave your enquiry via Option 4 so Dhushyandh can answer you directly."*
