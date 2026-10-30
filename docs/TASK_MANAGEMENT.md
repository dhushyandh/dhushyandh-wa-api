# DHUSHYANDH AI — Task Management System

## 1. Overview

The Task Management system enables Dhushyandh to track, update, and complete personal and technical tasks through WhatsApp with zero friction.

---

## 2. Data Model (`apps/api/src/modules/task/task.model.js`)

- `title`: String (required, max 200 chars)
- `description`: String (optional, max 1000 chars)
- `status`: Enum (`"pending"`, `"in_progress"`, `"completed"`, `"cancelled"`, default `"pending"`)
- `priority`: Enum (`"low"`, `"medium"`, `"high"`, `"urgent"`, default `"medium"`)
- `dueDate`: Date (optional)
- `ownerChatId`: String (required, indexed)
- `completedAt`: Date
- `createdAt` / `updatedAt`: Auto-managed timestamps

### Compound Indexes
- `{ ownerChatId: 1, status: 1, priority: -1 }`
- `{ ownerChatId: 1, dueDate: 1 }`

---

## 3. WhatsApp Commands & Natural Language

### Adding Tasks
- Command: `/task add <title>`
- Natural Language Examples:
  - `"Remind me to finish NotifyFlow API tomorrow"`
  - `"Add task: Review Docker container memory allocation"`
  - `"Task add Deploy Phase 3 !urgent"`

### Listing Tasks
- Command: `/tasks` (lists all pending tasks sorted by due date)
- Command: `/tasks completed` (lists recent completed tasks)
- Option `1` from Main Menu (`/menu`)
- Natural Language Examples:
  - `"Show my pending tasks"`
  - `"What are my high-priority tasks?"`

### Completing Tasks
- Command: `/task done <number or title>`
- Natural Language Examples:
  - `"Mark NotifyFlow API as completed"`
  - `"Mark task 1 as done"`
  - `"Set task API documentation done"`

### Deleting Tasks
- Command: `/task delete <number or title>`
