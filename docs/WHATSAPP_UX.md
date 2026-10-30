# DHUSHYANDH AI — WhatsApp User Experience & Formatting Standards

## 1. Investigation of OpenWA / Baileys Interactive Message Types

During Phase 3 engineering, the OpenWA HTTP gateway endpoints and Baileys multi-device capabilities were audited:

### 1.1 Verified Gateway Endpoints
- `POST /api/sessions/{sessionId}/messages/send-text` (Verified)
- `POST /api/sessions/{sessionId}/messages/send-poll` (Verified)
- `POST /api/sessions/{sessionId}/messages/send-image` (Verified)
- `POST /api/sessions/{sessionId}/messages/send-location` (Verified)
- `POST /api/sessions/{sessionId}/messages/send-contact` (Verified)
- `POST /api/sessions/{sessionId}/messages/send-sticker` (Verified)
- `POST /api/sessions/{sessionId}/messages/react` (Verified)

### 1.2 Deprecation of Legacy Buttons in Baileys
- WhatsApp Multi-Device (MD) protocol completely deprecated legacy quick-reply buttons and list messages for unofficial Baileys connections.
- Client applications attempting to craft fake raw button stanzas face silent delivery drops or device disconnections from WhatsApp's consumer servers.
- OpenWA therefore does not expose a raw `send-buttons` or `send-list` endpoint for Baileys sessions.

### 1.3 Verified UX Choice: Clean Numbered Navigation
To guarantee bulletproof 100% cross-device compatibility (Android, iPhone, WhatsApp Web, Desktop app, KaiOS), DHUSHYANDH AI utilizes **Clean Numbered Interactive Menus**:
- The user can simply reply with single digits: `1`, `2`, `3`, `4`, `5`.
- Or type intuitive commands: `/tasks`, `/notes`, `/projects`, `/daily`.

---

## 2. Formatting Policy & Sanitization Guard

All outbound WhatsApp messages pass through [`response-formatter.js`](file:///e:/dhushyandh-ai/apps/api/src/modules/ui/response-formatter.js), [`command-router.js`](file:///e:/dhushyandh-ai/apps/api/src/modules/assistant/command-router.js), and [`gemini.service.js`](file:///e:/dhushyandh-ai/apps/api/src/modules/ai/gemini.service.js):

1. **Clean Visual Hierarchy**: Uses clear bold titles (`*Title*`), bullet points (`•`), and section dividers (`━━━━━━━━━━━━━━━━━━━━`) for scannable WhatsApp reading.
2. **Tasteful Emojis**: Purposeful emojis are used on headers, status indicators, bullets, links, and options (e.g. 👋, 👨‍💻, 🚀, 💻, 📱, 🛠️, 💼, 🌐, 📋, 📝, ⏰, ☀️, 💡, 📌, ✅, 🔴, 🟡, 🟢) to make messages modern, friendly, and lively. Emojis are never stripped.
3. **Options-Based Interactions**: All messages conclude with clear, numbered action options (e.g. `1. 👨‍💻 About Dhushyandh`, `2. 🚀 Explore Projects`, `3. 🛠️ Development Services`, `4. 💼 Hire / Work Together`) and `menu` shortcuts so users never have to guess what to type next.
4. **No Infrastructure Leakage**:
   - Internal ports (`2786`, `2785`, `5000`, `27017`) are automatically sanitized.
   - Internal hostnames (`localhost`, `127.0.0.1`, `host.docker.internal`) are redacted.
   - Stack traces, raw database ObjectIds, and database connection URIs are removed.
5. **No Excessive Markdown**: Strips `****` or nested asterisks to keep formatting crisp on mobile screens.

---

## 3. Conversational UX & Context Awareness Standards

1. **Answer First**: The user's exact question must be answered directly in the very first sentence.
2. **No Unnecessary Greetings**: Avoid pleasantries, repetitive greetings, or self-introductions (e.g. no "Hey there!", "Hello I am DHUSHYANDH AI" on every message turn).
3. **Multi-Turn Continuity**:
   - Maintains conversation history across turns.
   - Avoids repeating information, definitions, or overviews previously provided.
   - For follow-up queries, answers ONLY the new question without recapping the prior topic.
4. **Mode Behavior & Testing Guidance**:
   - **Private Mode**: Granted exclusively to the verified owner identified by WhatsApp Linked Identity (LID).
   - **Public Mode**: Automatically active for all other WhatsApp senders.
   - **No Manual Switching**: Explains that modes are tied to sender identity and cannot be toggled via in-chat commands.
   - **Public Mode Testing Guidance**: To test Public Mode, the owner must send a message to the bot from a separate, non-owner WhatsApp account.
