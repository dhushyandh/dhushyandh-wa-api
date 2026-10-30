# DHUSHYANDH AI — Persistent Reminder System

## 1. Overview

The Reminder System provides scheduled notification alerts delivered to the owner's WhatsApp. It runs as an in-process background scheduler backed by MongoDB with zero external cloud dependencies or paid cron services.

---

## 2. Data Model (`apps/api/src/modules/reminder/reminder.model.js`)

- `title`: String (required, max 300 chars)
- `dueAt`: Date (required, indexed)
- `timezone`: String (default `"Asia/Kolkata"`)
- `status`: Enum (`"pending"`, `"sending"`, `"sent"`, `"failed"`, `"cancelled"`, default `"pending"`)
- `ownerChatId`: String (required, indexed)
- `chatId`: String (required)
- `targetType`: Enum (`"task"`, `"custom"`, default `"custom"`)
- `taskId`: ObjectId (optional reference to Task)
- `sentAt`: Date
- `idempotencyKey`: String (unique)
- `lastError`: String
- `createdAt` / `updatedAt`: Auto-managed timestamps

---

## 3. Reliability & Scheduling Architecture

### 3.1 In-Process Sweeper (`apps/api/src/modules/reminder/reminder.service.js`)
- Runs on a 30-second interval (`unref()` timer so Node test runners exit cleanly).
- Queries `{ status: "pending", dueAt: { $lte: new Date() } }`.
- Atomically transitions status from `"pending"` to `"sending"`. This guarantees **at-most-once delivery** and prevents concurrent workers or re-runs from duplicating notifications.
- Dispatches message using OpenWA `sendText`.
- On success: marks `"sent"`. On error: marks `"failed"`.

### 3.2 Crash Recovery
- If the server restarts during or after a scheduled reminder time, the initial startup sweep automatically discovers overdue reminders and dispatches them immediately.

---

## 4. WhatsApp Commands

- View Reminders: `/reminders`
- Cancel Reminder: `/remind cancel <title or ID>`
