# DHUSHYANDH AI — System Architecture

## 1. Overview

DHUSHYANDH AI is an automated WhatsApp personal AI platform with distinct public and private assistant modes. It runs as a lightweight, container-friendly Node.js service paired with an OpenWA WhatsApp gateway and MongoDB for persistent state, deduplication, and context retention.

```
WhatsApp User
     │
     ▼
[OpenWA Gateway] (Baileys Engine, Port 2786)
     │  HMAC SHA-256 Webhook POST
     ▼
[DHUSHYANDH AI API] (Express 5, Node 22, Port 5000)
     ├── Webhook Intake & HMAC Verification (crypto.timingSafeEqual)
     ├── Webhook Deduplication (MongoDB WebhookEvent unique index)
     ├── Access Control & LID Resolution (Public vs. Private)
     ├── Message Processor & Atomic Lock (MessageEvent state machine)
     │       ├── Context Window History Loader (Scoped per chatId + mode)
     │       ├── Google Gemini API Client (@google/genai, gemini-3.8-flash)
     │       └── OpenWA Outbound Service (Idempotency-Key, X-API-Key)
     │
     └── [MongoDB Database] (Persistent state, deduplication, session logs)
```

---

## 2. Core Components

### 2.1 Webhook Intake (`apps/api/src/app.js`)
- Listens on `POST /api/webhooks/openwa`.
- Enforces HMAC-SHA256 signature verification over exact raw request bytes.
- Validates the `sessionId` against `OPENWA_SESSION_ID`.
- Filters out outgoing messages (`fromMe: true`), groups (`isGroup: true`), status broadcasts (`isStatusBroadcast: true`), and non-text types.
- Deduplicates incoming deliveries at the gateway layer using `WebhookEvent` model with a unique index on `idempotencyKey`.

### 2.2 Access Control & Authorization (`apps/api/src/app.js` & `message-processor.js`)
- Authenticates the owner using the configured WhatsApp Linked Identity (LID) identifier or phone number JID from `OWNER_CHAT_IDS`.
- Evaluates `from`, `chatId`, `sender`, `author`, and `participant` fields.
- Mode assignment:
  - **`private`**: Only granted to authorized owner identifiers.
  - **`public`**: Assigned to all other senders.
- User-supplied text claiming owner status is strictly treated as untrusted input.

### 2.3 Message Processing & State Machine (`message-processor.js`)
Guarantees at-most-once processing with atomic MongoDB locking:

```text
received ──► processing ──► generating ──► sending ──► sent
    │              │             │            │
    └──────────────┴─────────────┴────────────┴──► failed
```

- **Locking**: Uses `MessageEvent.create()` with unique `eventKey`.
- **Duplicate Suppression**: Re-deliveries while in-flight or already completed are suppressed without triggering duplicate WhatsApp messages.
- **Stale Lock Recovery**: Records abandoned in `processing` or `generating` beyond `LOCK_TIMEOUT_MS` (default 90s) are safely claimed or failed by the watchdog.
- **Uncertain Delivery Safety**: If a timeout occurs during outbound dispatch (`sending`), the state transitions to `failed` / `outboundStatus: uncertain` to prevent double-messaging.

### 2.4 Gemini AI Service & Model Fallback (`apps/api/src/modules/ai/gemini.service.js`)
- Utilizes the official `@google/genai` SDK with dual-model architecture:
  - **Primary Model**: `GEMINI_MODEL` (default: `gemini-3.8-flash`)
  - **Fallback Model**: `GEMINI_FALLBACK_MODEL` (default: `gemini-3.5-flash-lite`, verified live via Google GenAI)
- **Primary Retry Policy Exhaustion**: Retryable primary-model failures (429, 500, 502, 503, 504, timeout) exhaust all configured retries (`GEMINI_MAX_RETRIES = 2`) before initiating the fallback model.
- **Permanent Error Guarding**: Permanent errors (400, 401, 403, invalid keys, malformed requests) fail fast and NEVER trigger fallback attempts.
- **Context Preservation**: Grounded knowledge base, public/private system prompts, conversation history, correlation IDs, and token limits are strictly preserved across fallback attempts.
- **Telemetry & Observability**: Logs and persists `primaryModel`, `fallbackModel`, `selectedModel`, `aiAttempts`, and `geminiDurationMs` without exposing prompts, private memories, or keys.
- **Graceful Unavailability Notification**: If both primary and fallback models fail, the processor dispatches a concise unavailability notice to the WhatsApp user while strictly maintaining database `status: "failed"` (never falsely marking as successful).

### 2.5 OpenWA Outbound Service (`apps/api/src/modules/openwa/openwa.service.js`)
- Dispatches HTTP requests to `POST /api/sessions/{sessionId}/messages/send-text`.
- Authentication via session-scoped operator key in `X-API-Key` header.
- Enforces `Idempotency-Key` header to prevent duplicate message transmission in OpenWA.
- Never logs sensitive keys or credentials.

### 2.6 Knowledge Engine (`apps/api/src/modules/knowledge`)
- Persistent MongoDB models: `OwnerProfile` and `Project`.
- Seed data on startup (`seed-data.js`): Real facts for Dhushyandh, DHUSHYANDH AI (public), RenewX (private), and initial verified memories.
- Keyword and slug-based project lookups with public/private scope filtering.

### 2.7 Hybrid Memory System (`apps/api/src/modules/memory`)
- Persistent MongoDB model: `Memory` with SHA-256 `contentHash` deduplication.
- Dual-path capture:
  - **Automatic**: Safe non-sensitive technical decisions (`status: "approved"`).
  - **Approval-based**: Personal preferences or facts (`status: "pending_approval"`).
- Security scanner rejects credentials and API keys.
- Conversational noise filter discards greetings and filler text.
- WhatsApp owner command: `/memories` returns active records.

### 2.8 Context Retriever & Grounding (`apps/api/src/modules/context`)
- Dynamically classifies user intent (`PROFILE_INTENT`, `SERVICES_INTENT`, `PROJECT_SPECIFIC`, `PROJECTS_GENERAL`).
- Retrieves relevant profile, project, and memory records.
- Strict public/private isolation prevents private project or memory leaks to strangers.
- Bounded context budgeting ensures payload stays within 3,500 characters.

### 2.9 Personal Assistant & WhatsApp UX Engine (`apps/api/src/modules/`)
- **Task Management** (`modules/task/`): MongoDB `Task` model supporting full CRUD, priority sorting, due dates, and completion tracking.
- **Notes System** (`modules/note/`): MongoDB `Note` model with multi-field text search for technical ideas and snippets.
- **Persistent Reminders** (`modules/reminder/`): MongoDB `Reminder` model with in-process sweeper, atomic state locking, and Asia/Kolkata timezone support.
- **Daily Briefing** (`modules/summary/`): Generates consolidated morning updates combining pending tasks, active projects, and reminders.
- **Command & NL Router** (`modules/assistant/`): High-efficiency router executing deterministic requests in < 20ms without invoking Gemini API.
- **Response Formatter & Guard** (`modules/ui/`): Centralized sanitizer scrubbing ports, internal hostnames, stack traces, and formatting concise messages (< 120 words).

### 2.10 Public Lead & Conversation State Engine (`apps/api/src/modules/`)
- **Lead Model & Management** (`modules/lead/`): MongoDB `Lead` model tracking incoming client requirements, service requested, budget, timeline, and triage status (`new`, `contacted`, `qualified`, `converted`, `rejected`).
- **Owner Push Alerts**: Dispatches an instant WhatsApp notification to the owner (`OWNER_CHAT_IDS`) upon lead submission without polling.
- **Conversation State Machine** (`modules/conversation/`): MongoDB `ConversationState` model orchestrating multi-step public flows (`idle`, `lead_capture`, `project_explorer`). Includes a 30-minute MongoDB TTL index on `expiresAt` for automatic cleanup of abandoned sessions.
- **Public Menus & Navigation**: Clean numbered WhatsApp menus (1-5) providing 100% reliable cross-device compatibility across Android, iOS, and Web.

---

## 3. Data Flow & Context Isolation

1. **Public Chat Isolation**: Conversation context queries filter strictly by `{ chatId, mode: "public", status: "sent" }`. A public user never sees another user's conversation, private projects, or owner notes.
2. **Private Chat Isolation**: Queries filter strictly by `{ chatId: ownerLid, mode: "private", status: "sent" }`.
3. **Context Window**: Loads the last 4 completed conversation turns (8 messages) dynamically to keep context focused and API token usage minimal.
4. **Telemetry & Latency Profiling**: `MessageEvent` tracks `retrievalDurationMs`, `geminiDurationMs`, `openwaDurationMs`, and `retrievedItems`.
5. **Zero Cloud/SaaS Overhead**: No external vector databases, message queues, or Redis instances are required; MongoDB compound indexes provide ₹0 additional infrastructure cost.
