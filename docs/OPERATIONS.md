# DHUSHYANDH AI — Operational Runbook

## 1. Prerequisites & Services

The platform depends on three services running locally:
1. **Docker OpenWA Gateway** (`dhushyandh-ai-openwa`) on port `2786` (mapped to container internal port `2785`).
2. **MongoDB Database** running locally or on the configured MongoDB URI.
3. **DHUSHYANDH AI API Backend** running on port `5000` (`apps/api`).

> **CRITICAL RULE**: The RenewX OpenWA container (`openwa-api` on port `2785`) is a separate instance and must never be stopped, modified, or reconfigured.

---

## 2. Environment Variables Reference

Stored in `apps/api/.env`:

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Yes | `development` | Runtime environment (`development`, `production`, `test`). |
| `PORT` | Yes | `5000` | Port on which the Express API listens. |
| `MONGODB_URI` | Yes | - | MongoDB connection string. |
| `CLIENT_URL` | No | `http://localhost:5173` | Allowed CORS origin URL(s). |
| `OPENWA_BASE_URL` | Yes | `http://127.0.0.1:2786` | Base URL of the dedicated DHUSHYANDH AI OpenWA instance. |
| `OPENWA_SESSION_ID` | Yes | - | Session UUID for DHUSHYANDH AI. |
| `OPENWA_OPERATOR_KEY` | Yes | - | Session-scoped operator key for sending outbound WhatsApp messages. |
| `OPENWA_WEBHOOK_SECRET` | Yes | - | HMAC SHA-256 secret shared between OpenWA and the backend. |
| `GEMINI_API_KEY` | Yes | - | Google Gemini AI API key. |
| `GEMINI_MODEL` | Yes | `gemini-3.8-flash` | Primary Gemini model ID. |
| `GEMINI_FALLBACK_MODEL` | No | `gemini-3.5-flash-lite` | Verified secondary fallback Gemini model ID. |
| `GEMINI_TIMEOUT_MS` | No | `25000` | Timeout per Gemini generation attempt (milliseconds). |
| `GEMINI_MAX_RETRIES` | No | `2` | Maximum retry attempts for transient errors (429, 503, 504). |
| `OWNER_CHAT_IDS` | Yes | - | Comma-separated WhatsApp IDs authorized for private mode (e.g. `134613267656901@lid`). |
| `LOCK_TIMEOUT_MS` | No | `90000` | Expiration window for message processing locks (milliseconds). |
| `STALE_RECOVERY_INTERVAL_MS`| No | `60000` | Interval between background stale recovery sweeps (milliseconds). |

---

## 3. Startup & Verification Procedures

### 3.1 Start OpenWA Gateway
```powershell
cd E:\dhushyandh-ai\openwa
docker compose up -d
```
Verify OpenWA readiness:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:2786/api/health/ready"
```
Expected response: `{ "status": "ok" }`.

### 3.2 Start Backend API
```powershell
cd E:\dhushyandh-ai\apps\api
npm run dev
```

### 3.3 Verify Health Check Endpoint
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health"
```
Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-10-30T...",
  "uptime": 12.34,
  "services": {
    "database": "connected",
    "openwa": "ready"
  }
}
```

---

## 4. Maintenance & Recovery Procedures

### 4.1 Recovering Stale Processing Records
The backend runs an automated watchdog:
- **On Startup**: Performs an immediate sweep of any abandoned records in `processing` or `generating` states.
- **Every 60s**: Sweeps records whose `lockExpiresAt` has elapsed and transitions them to `status: "failed"`, `errorCategory: "STALE_TIMEOUT"`.

To run manual inspection from PowerShell:
```powershell
cd E:\dhushyandh-ai\apps\api
node -e "
const mongoose = require('mongoose');
const env = require('./src/config/env');
const { recoverStaleProcessingRecords } = require('./src/modules/webhook/message-processor');
mongoose.connect(env.MONGODB_URI).then(async () => {
  const count = await recoverStaleProcessingRecords();
  console.log('Stale records swept and updated:', count);
  await mongoose.disconnect();
});
"
```

### 4.2 Handling Upstream Gemini Outages (503 / 504)
When Google Gemini experiences temporary demand spikes:
1. The service automatically performs bounded retries with exponential backoff and jitter.
2. If all attempts fail, the event is marked `status: "failed"` with `errorCategory: "GEMINI_TRANSIENT_SERVER_ERROR"`.
3. The error is logged without crashing the process or unhandled promise rejections.
4. The system never claims to the user that a failed response was sent.

### 4.3 Log Safety & Audit
Logs are structured with timestamp, level, request ID, stage, and duration.
Sensitive data (API keys, passwords, webhook secrets, database connection URIs) are automatically redacted matching `[REDACTED]` patterns before writing to output.

### 4.4 Knowledge Seeding & Reseeding
Knowledge is automatically upserted on server boot (`src/server.js`). To manually trigger seeding or reseed without restarting the entire server:
```powershell
cd E:\dhushyandh-ai\apps\api
node -e "
const mongoose = require('mongoose');
const env = require('./src/config/env');
const { seedInitialKnowledge } = require('./src/modules/knowledge/seed-data');
mongoose.connect(env.MONGODB_URI).then(async () => {
  const result = await seedInitialKnowledge();
  console.log('Seeding result:', result);
  await mongoose.disconnect();
});
"
```

### 4.5 Inspecting Telemetry & Latency Breakdown
Every completed message records stage latencies in the MongoDB `messageevents` collection:
```powershell
cd E:\dhushyandh-ai\apps\api
node -e "
const mongoose = require('mongoose');
const env = require('./src/config/env');
const MessageEvent = require('./src/modules/webhook/message-event.model');
mongoose.connect(env.MONGODB_URI).then(async () => {
  const recent = await MessageEvent.find({ status: 'sent' }).sort({ createdAt: -1 }).limit(5);
  console.table(recent.map(r => ({
    messageId: r.messageId,
    mode: r.mode,
    retrievalMs: r.retrievalDurationMs,
    geminiMs: r.geminiDurationMs,
    openwaMs: r.openwaDurationMs,
    totalMs: r.totalDurationMs
  })));
  await mongoose.disconnect();
});
"
```

### 4.6 Inspecting Freelance Leads & Conversation States
To view pending leads directly from the database or CLI:
```powershell
cd E:\dhushyandh-ai\apps\api
node -e "
const mongoose = require('mongoose');
const env = require('./src/config/env');
const Lead = require('./src/modules/lead/lead.model');
mongoose.connect(env.MONGODB_URI).then(async () => {
  const leads = await Lead.find().sort({ createdAt: -1 }).limit(10);
  console.table(leads.map(l => ({
    id: l.leadNumber,
    name: l.name,
    service: l.serviceRequested,
    budget: l.budgetRange,
    timeline: l.expectedTimeline,
    status: l.status
  })));
  await mongoose.disconnect();
});
"
```
