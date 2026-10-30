# DHUSHYANDH AI — Phase 4: Public AI Assistant & Freelance Lead Management

## 1. Overview

Phase 4 completes the dual-personality vision of DHUSHYANDH AI by delivering a dedicated, professional **Public Assistant** tailored for ordinary WhatsApp visitors, potential clients, and collaborators.

While the **Private Assistant** serves as Dhushyandh's personal productivity and project co-pilot, the **Public Assistant** serves as an interactive portfolio, project explorer, service catalogue, and automated lead capture engine.

```
WhatsApp Visitor (Public Mode)
              │
              ▼
    [Webhook & Access Control] ──► Identified as Public Visitor
              │
              ▼
   [Conversation State Engine] ──► Checks active flow (idle | lead_capture | project_explorer)
              │
      ┌───────┴──────────────────────────────┐
      │                                      │
[Active Flow: lead_capture]      [Active Flow: idle / project_explorer]
  • Step-by-step collection        • Public Menu (1-5)
  • Cancellation ("cancel")        • 1: About Dhushyandh
  • Summary & Confirmation         • 2: Guided Project Explorer
  • Auto-save to Lead Model        • 3: Development Services Catalogue
  • WhatsApp Owner Alert           • 4: Start Lead Capture Flow
                                   • 5: Freeform Question (Gemini AI)
```

---

## 2. Key Modules & Implementations

| Module | Location | Purpose |
| :--- | :--- | :--- |
| **Lead Model** | `apps/api/src/modules/lead/lead.model.js` | MongoDB model storing structured client enquiries with auto-incrementing `leadNumber`, validation, timestamps, and indexing. |
| **Lead Service** | `apps/api/src/modules/lead/lead.service.js` | Business logic for creating leads, dispatching immediate owner WhatsApp alerts, listing leads, and updating status/notes. |
| **Conversation State** | `apps/api/src/modules/conversation/conversation-state.model.js` | Session state machine persisting current flow and step with a 30-minute MongoDB TTL index for automatic cleanup of abandoned flows. |
| **Conversation State Service** | `apps/api/src/modules/conversation/conversation-state.service.js` | Helper methods (`getState`, `setState`, `clearState`) for reliable multi-step session orchestration. |
| **Response Formatter** | `apps/api/src/modules/ui/response-formatter.js` | Generates standardized, numbered WhatsApp messages for menus, profile summaries, project details, service catalogues, and lead summaries. |
| **Command & State Router** | `apps/api/src/modules/assistant/command-router.js` | Orchestrates public menus, project exploration, multi-step lead collection, and owner triage commands (`/leads`, `/lead <id>`). |

---

## 3. Public Assistant Capabilities

### 3.1 Welcoming Menu Navigation
When a public visitor says `hi`, `hello`, `/start`, `/menu`, or `help`, they are presented with a clean numbered menu:
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

### 3.2 Grounded Public Knowledge (Zero Hallucination)
- **Verified Facts**: Sourced exclusively from `OwnerProfile` (Dhushyandh M, B.Tech AI & Data Science, full-stack & AI automation engineer, skills in Node.js, React, Python, MongoDB, Docker, Gemini API).
- **Strict Guardrails**: Never invents credentials, client names, project completion status, prices, revenue, or testimonials. Missing information directs visitors to contact Dhushyandh directly.

### 3.3 Guided Project Explorer
- Visitors selecting Option `2` see a list of verified public projects (e.g. `1. DHUSHYANDH AI`).
- Replying with the project number returns the verified purpose, tech stack, and links.
- **Privacy Enforcement**: Private projects (e.g. RenewX) and private project fields (blockers, internal architecture notes) are strictly excluded from public queries.

### 3.4 Services Catalogue
- Visitors selecting Option `3` view verified services offered by Dhushyandh (Full-Stack Web Development, WhatsApp Bot & AI Automation, AI Application Development).
- No arbitrary prices are invented; users are guided to Option `4` to request a custom quote based on scope.

---

## 4. Freelance Lead Capture Pipeline

### 4.1 Step-by-Step Conversational State Machine
When a user selects Option `4` or expresses intent to hire, a guided 6-step flow is initiated:
1. **Name**: Captures the contact's name.
2. **Service**: Numbered choice (1. Web Dev, 2. WhatsApp Bot & AI, 3. AI Apps, 4. Other).
3. **Project Description**: Collects key requirements and goals.
4. **Budget**: Choice of budget brackets (e.g., < ₹25k, ₹25k - ₹50k, ₹50k - ₹1L, > ₹1L).
5. **Timeline**: Expected completion window (e.g. 1-2 weeks, 1 month, Flexible).
6. **Email**: Optional email address or "skip".
7. **Confirmation**: Presents formatted summary and requests confirmation (`"yes"` or `"cancel"`).

### 4.2 Lead Cancellation & Abandonment Protection
- Visitors can send `"cancel"` at any step to abort the flow immediately.
- `ConversationState` records auto-expire after 30 minutes via MongoDB TTL (`expireAfterSeconds: 0`), ensuring abandoned sessions never interfere with subsequent conversations.

### 4.3 Instant Owner WhatsApp Alert
Upon successful lead confirmation:
1. The lead record is saved in MongoDB with an auto-incrementing `leadNumber`.
2. An instant notification is dispatched directly to Dhushyandh's WhatsApp (`OWNER_CHAT_IDS`):
```text
🚨 *NEW FREELANCE LEAD #1*

👤 *Client:* Alice Smith
📱 *WhatsApp:* 919876543210@s.whatsapp.net
✉️ *Email:* alice@example.com
🛠️ *Service:* WhatsApp Bot & AI Automation
📝 *Project:* Custom AI customer service agent
💰 *Budget:* ₹50,000 - ₹1,00,000
⏱️ *Timeline:* 2-4 weeks

Reply /lead 1 to review or /lead status 1 contacted.
```

---

## 5. Owner Lead Triage Commands (Private Mode)

The owner can manage the pipeline directly from WhatsApp without logging into any dashboard:

| Command | Action | Example |
| :--- | :--- | :--- |
| `/leads` | List 10 most recent leads across all statuses | `/leads` |
| `/leads new` | Filter leads by specific status (`new`, `contacted`, `qualified`, `converted`, `rejected`) | `/leads new` |
| `/lead <id>` | View full details of a specific lead by number | `/lead 1` |
| `/lead status <id> <status>` | Update lead status | `/lead status 1 contacted` |
| `/lead notes <id> <notes>` | Append owner notes to a lead record | `/lead notes 1 Followed up via phone, meeting tomorrow` |

---

## 6. Security & Isolation

- **Owner-Only Commands**: `/leads`, `/lead`, `/tasks`, `/notes`, `/reminders`, `/summary`, and `/memories` are strictly blocked for public users and return a polite refusal.
- **HMAC & LID Validation**: Owner identity is derived strictly from verified WhatsApp LID headers, not user-controllable text.
- **Data Protection**: Public users cannot view other visitors' leads, notes, or conversation histories.
