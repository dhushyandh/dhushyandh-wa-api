# DHUSHYANDH AI — Phase 2: Hybrid Memory System

## 1. Overview

The DHUSHYANDH AI Memory System provides long-term, cross-conversation context retention for the authorized owner without storing temporary conversational noise or sensitive credentials.

```
Incoming Owner Message
       │
       ├── Explicit Owner Command: /memories
       │         └── Returns list of stored memories via WhatsApp
       │
       ├── Safety Checks (Secret Scanner & Noise Filter)
       │         ├── Contains API keys / Passwords? ──► REJECT
       │         └── Conversational noise / Chitchat? ──► DISCARD
       │
       └── Extraction Classifier
                 ├── Safe Technical Decision / Project Context
                 │         └── Persist as "approved" (Automatic Memory)
                 │
                 └── Sensitive Personal Preference / Fact
                           └── Persist as "pending_approval" (Approval Memory)
```

---

## 2. Memory Data Model (`apps/api/src/modules/memory/memory.model.js`)

### Schema Specification
- `content`: String (trimmed, required, max 1,000 characters).
- `contentHash`: String (SHA-256 hash of normalized content, indexed for unique deduplication).
- `category`: Enum:
  - `"technical_preference"`
  - `"project_decision"`
  - `"personal_preference"`
  - `"personal_fact"`
  - `"architecture_rule"`
  - `"workflow"`
  - `"other"`
- `scope`: Enum:
  - `"private"` (default, visible only to authorized owner)
  - `"public"` (visible to all users, highly restricted)
- `source`: Enum:
  - `"automatic_extraction"`
  - `"user_explicit"`
  - `"system_seed"`
- `confidence`: Number (0.0 to 1.0, default 0.9).
- `importance`: Number (1 to 5 scale, 5 being critical).
- `approvalStatus`: Enum:
  - `"approved"`: Fully active, included in context retrieval.
  - `"pending_approval"`: Awaiting owner confirmation before grounding.
  - `"rejected"`: Rejected by owner, excluded from retrieval.
- `projectSlug`: String (optional relation to specific project).
- `tags`: Array of String (indexed for keyword matching).
- `createdAt` / `updatedAt`: Automatic Mongoose timestamps.

### Database Indexes
- `{ contentHash: 1 }` (unique, ensures strict deduplication)
- `{ scope: 1, approvalStatus: 1, importance: -1 }` (fast query path for retrieval)
- `{ tags: 1 }`
- `{ projectSlug: 1 }`

---

## 3. Security & Safety Rules

### 3.1 Secret & Credential Scanning
Before creating any memory, the content is scanned against regex patterns:
- Google API keys: `/AIza[0-9A-Za-z-_]{20,}/`
- Bearer tokens: `/Bearer\s+[A-Za-z0-9\-_.]+/i`
- Passwords & secrets: `/(?:password|api[_\s-]?key|secret|access[_\s-]?token|private[_\s-]?key)\s*[:=]\s*["']?\S+/i`
- Database URIs: `/mongodb(?:\+srv)?:\/\/\S+/i`

If any secret pattern matches, the operation throws a `SECURITY_REJECTED` error, logs an alert, and rejects persistence.

### 3.2 Conversational Noise Filtering
Conversational greetings, acknowledgments, and filler messages are filtered out and discarded:
- E.g., `"ok"`, `"thanks"`, `"hello"`, `"cool"`, `"bye"`.
- Content shorter than 8 characters is discarded as noise.

---

## 4. Hybrid Extraction Architecture

### 4.1 Automatic Extraction
- Non-sensitive technical decisions (e.g., `"Decided to use Express 5 for backend routing"`, `"Note: All WhatsApp outbound calls must pass Idempotency-Key header"`).
- Automatically saved with `approvalStatus: "approved"` and `source: "automatic_extraction"`.

### 4.2 Approval-Based Extraction
- Sensitive personal facts and subjective preferences (e.g., personal habits, family details, private opinions).
- Saved with `approvalStatus: "pending_approval"`.
- A proposed memory must receive owner approval before it is injected into the AI context window.

---

## 5. WhatsApp Memory Commands

The authorized owner can inspect and manage memories directly through WhatsApp:
- `/memories` or `/memory`: Returns the list of active memories, categorized with approval status and importance.
- Responses to strangers attempting `/memories` in public mode are strictly refused and isolated.
