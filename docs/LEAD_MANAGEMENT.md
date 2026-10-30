# DHUSHYANDH AI — Freelance Lead Management & Pipeline Specification

## 1. Overview

The Freelance Lead Management system converts inbound public WhatsApp inquiries into structured client leads. It pairs a conversational state machine for visitors with instant private WhatsApp alerts and triage commands for the owner.

---

## 2. Lead Data Model (`apps/api/src/modules/lead/lead.model.js`)

```javascript
const leadSchema = new mongoose.Schema(
  {
    leadNumber: { type: Number, unique: true }, // Auto-incrementing identifier (e.g. 1, 2, 3...)
    name: { type: String, required: true, trim: true, maxlength: 100 },
    whatsappChatId: { type: String, required: true, index: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    serviceRequested: { type: String, required: true },
    projectDescription: { type: String, required: true, maxlength: 3000 },
    budgetRange: { type: String, default: "Flexible" },
    expectedTimeline: { type: String, default: "Flexible" },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "rejected"],
      default: "new",
      index: true,
    },
    source: { type: String, default: "whatsapp" },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);
```

---

## 3. Conversational Lead Capture State Machine

The flow uses `ConversationState` (`apps/api/src/modules/conversation/conversation-state.model.js`) to track visitor progress:

```
[idle] ──(Option 4 / "hire")──► [lead_capture: step 1 (name)]
                                      │
                                      ▼
                                [lead_capture: step 2 (service)]
                                      │
                                      ▼
                                [lead_capture: step 3 (description)]
                                      │
                                      ▼
                                [lead_capture: step 4 (budget)]
                                      │
                                      ▼
                                [lead_capture: step 5 (timeline)]
                                      │
                                      ▼
                                [lead_capture: step 6 (email)]
                                      │
                                      ▼
                                [lead_capture: step 7 (confirm)] ──("yes")──► Lead Saved & Owner Alerted
                                      │                                       State Cleared (idle)
                                      ├──("cancel")──► State Cleared (idle)
```

### 3.1 Step Details
1. **Name**: "Awesome! Let's get your project details to Dhushyandh. First, what is your name?"
2. **Service**: Numbered options:
   - 1. Web Development
   - 2. WhatsApp Bot & AI Automation
   - 3. AI Application Development
   - 4. Other
3. **Description**: "Briefly describe your project, problem, or key requirements."
4. **Budget**: Numbered brackets:
   - 1. < ₹25,000 ($300)
   - 2. ₹25,000 - ₹50,000 ($300 - $600)
   - 3. ₹50,000 - ₹1,00,000 ($600 - $1,200)
   - 4. > ₹1,00,000 ($1,200+)
   - 5. Flexible / Not sure yet
5. **Timeline**: Numbered options:
   - 1. Urgent (< 2 weeks)
   - 2. 1 month
   - 3. 2-3 months
   - 4. Flexible
6. **Email**: "What is your email address? (Reply with your email, or reply 'skip' to use WhatsApp only):"
7. **Confirmation**: Presents formatted summary with prompt:
   - Reply **"yes"** to submit.
   - Reply **"cancel"** to discard.

### 3.2 Abandonment & TTL Cleanup
- The `ConversationState` schema includes an indexed `expiresAt` date set to 30 minutes after last interaction.
- MongoDB's native TTL worker automatically purges expired states, preventing dead locks or unexpected resumes if a user messages days later.

---

## 4. Instant Owner Notification

When a visitor confirms their submission (`"yes"`), the backend immediately persists the lead and dispatches a formatted alert to `OWNER_CHAT_IDS` (e.g. `134613267656901@lid`):

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

## 5. Owner Pipeline Triage (WhatsApp Commands)

The owner can inspect and manage leads directly within WhatsApp:

### 5.1 Listing Leads
- Command: `/leads`
- Output:
```text
📋 *FREELANCE LEADS*

1. [#1] Alice Smith — WhatsApp Bot & AI Automation [new] (10m ago)
2. [#2] Bob Johnson — Full-Stack Web Development [contacted] (2h ago)

Reply /lead <id> to view details or /lead status <id> <status> to update.
```

### 5.2 Filtering by Status
- Command: `/leads new` or `/leads qualified`

### 5.3 Viewing Full Lead Details
- Command: `/lead 1`
- Output:
```text
📋 *LEAD #1*
👤 *Client:* Alice Smith
📱 *WhatsApp:* 919876543210@s.whatsapp.net
✉️ *Email:* alice@example.com
🛠️ *Service:* WhatsApp Bot & AI Automation
📝 *Description:* Custom AI customer service agent
💰 *Budget:* ₹50,000 - ₹1,00,000
⏱️ *Timeline:* 2-4 weeks
📊 *Status:* new
📅 *Received:* Oct 30, 2026

*Notes:*
Followed up via WhatsApp.
```

### 5.4 Updating Status
- Command: `/lead status 1 contacted`
- Valid statuses: `new`, `contacted`, `qualified`, `converted`, `rejected`

### 5.5 Appending Notes
- Command: `/lead notes 1 Client has existing Node.js backend`
