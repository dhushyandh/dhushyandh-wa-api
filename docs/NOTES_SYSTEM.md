# DHUSHYANDH AI — Notes Management System

## 1. Overview

The Notes Management system allows the owner to quickly capture thoughts, architectural decisions, code snippets, and research items via WhatsApp, with persistent storage and full-text search.

---

## 2. Data Model (`apps/api/src/modules/note/note.model.js`)

- `title`: String (required, max 200 chars)
- `content`: String (required, max 5000 chars)
- `category`: String (default `"General"`)
- `tags`: Array of String
- `ownerChatId`: String (required, indexed)
- `archivedAt`: Date
- `createdAt` / `updatedAt`: Auto-managed timestamps

### Indexes
- `{ ownerChatId: 1, archivedAt: 1, createdAt: -1 }`
- `{ ownerChatId: 1, category: 1 }`
- Text index on `{ title: "text", content: "text", tags: "text" }`

---

## 3. WhatsApp Commands & Natural Language

### Creating Notes
- Command: `/note <title> | <content>`
- Natural Language:
  - `"Save this note: Need to investigate Gemini response latency"`
  - `"Save note: RenewX container must stay on port 2785"`

### Viewing Notes
- Command: `/notes` (lists last 10 active notes)
- Option `2` from Main Menu (`/menu`)
- Natural Language:
  - `"Show my notes"`

### Searching Notes
- Command: `/notes search <query>`
- Natural Language:
  - `"Search notes: latency"`
  - `"Search notes: Docker"`

### Deleting Notes
- Command: `/note delete <number or title>`
