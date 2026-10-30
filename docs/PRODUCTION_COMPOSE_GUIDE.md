# DHUSHYANDH AI — Production Compose & Operations Guide

This guide provides operational instructions for deploying, managing, and maintaining the containerized DHUSHYANDH AI application using Docker Compose.

---

## 1. Architecture & Service Topology

DHUSHYANDH AI production deployment consists of two containerized services isolated within a private Docker bridge network:

```
[ Inbound WhatsApp ]
        │
        ▼
┌────────────────────────────────┐         ┌────────────────────────────────┐
│      dhushyandh-ai-openwa      │         │       dhushyandh-ai-api        │
│   (OpenWA / Baileys Gateway)   │◄───────►│       (Node.js 22 LTS)         │
│  Port: 127.0.0.1:2786 (Host)   │         │    Port: 127.0.0.1:5000 (Host) │
│  Internal: openwa:2785         │         │    Internal: api:5000          │
│  Data: ./openwa/data           │         │    Non-Root: node (uid 1000)   │
└────────────────────────────────┘         └────────────────────────────────┘
                ▲                                          ▲
                │                                          │
       [ Local SQLite DB ]                        [ MongoDB Atlas (Cloud) ]
       [ Baileys Auth Session ]                   [ Google Gemini AI APIs ]
```

### Constraints & Security Guarantees:
- **RenewX Isolation**: The separate RenewX OpenWA instance runs independently on port `2785` and is **never** included, modified, or affected.
- **Session Preservation**: WhatsApp session keys are persisted in `./openwa/data/baileys` and SQLite databases. Containers can be stopped and upgraded without losing pairing.
- **Zero Public Exposure of OpenWA**: OpenWA binds strictly to `127.0.0.1:2786` on the host, preventing unauthorized external access.

---

## 2. Environment Configuration

Production secrets must **never** be committed to Git. Create an environment file on your production host (e.g., `/etc/dhushyandh-ai/prod.env` or root `.env` with `chmod 600`):

```bash
# =============================================================================
# DHUSHYANDH AI — Production Environment Variables Template
# =============================================================================

NODE_ENV=production
PORT=5000

# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?compressors=zlib

# Gemini API & Fallback
GEMINI_API_KEY=<your-production-gemini-api-key>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_MS=25000
GEMINI_MAX_RETRIES=2

# OpenWA WhatsApp Gateway
OPENWA_BASE_URL=http://openwa:2785
OPENWA_SESSION_ID=<your-session-uuid>
OPENWA_OPERATOR_KEY=<your-secret-operator-key>
OPENWA_WEBHOOK_SECRET=<your-webhook-hmac-secret>

# Owner WhatsApp LID Access (Private Mode)
OWNER_CHAT_IDS=134613267656901@lid

# Concurrency & Lock Timeouts (in milliseconds)
LOCK_TIMEOUT_MS=90000
REMINDER_LOCK_TIMEOUT_MS=90000
STALE_RECOVERY_INTERVAL_MS=60000

# Retention Lifecycle (in days)
MESSAGE_EVENT_TTL_DAYS=30
```

---

## 3. Operations & Lifecycle Commands

### Build Images
Build the production API container:
```bash
docker compose -f docker-compose.prod.yml build
```

### Start Services
Start both services in detached mode:
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Inspect Container Health & Status
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output:
```
NAME                   IMAGE                         STATUS                    PORTS
dhushyandh-ai-api      dhushyandh-ai-api:production  Up (healthy)              127.0.0.1:5000->5000/tcp
dhushyandh-ai-openwa   openwa-openwa:latest          Up (healthy)              127.0.0.1:2786->2785/tcp
```

### Test API Healthcheck Directly
```bash
curl -f http://127.0.0.1:5000/api/health
```

Expected JSON response (HTTP 200 OK):
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-10-30T10:46:43.790Z",
  "uptime": 120.45,
  "services": {
    "database": "connected",
    "openwa": "ready"
  }
}
```

### Stream Live Logs
```bash
# View combined logs
docker compose -f docker-compose.prod.yml logs -f

# View API logs only
docker compose -f docker-compose.prod.yml logs -f api

# View OpenWA logs only
docker compose -f docker-compose.prod.yml logs -f openwa
```

### Restart a Single Service
```bash
# Safely restart the API service without affecting OpenWA
docker compose -f docker-compose.prod.yml restart api
```

### Graceful Shutdown
Stops all containers with appropriate drainage windows (30s for API, 75s for OpenWA):
```bash
docker compose -f docker-compose.prod.yml down
```

---

## 4. Database Backup & Non-Destructive Restoration

### Automated Database Backup
Run the automated backup script:
```bash
node scripts/backup-mongodb.js
```
- Automatically uses `mongodump` (native or via official `mongo:latest` Docker image).
- Stores timestamped archives outside Git in `%USERPROFILE%/mongodb-backups/dhushyandh-ai/` or configured `BACKUP_ROOT_DIR`.
- Never overwrites previous backups.
- Automatically prunes archives older than 14 days.

### Safe Non-Destructive Test Restoration (Sandbox DB)
Before performing any production restore, verify backup integrity in a safe sandbox database without touching production collections:

```bash
# Native mongorestore into temporary database "test_restore_verify"
mongorestore --uri="<MONGODB_URI>" \
  --gzip \
  --nsInclude="test.*" \
  --nsRename="test.*:test_restore_verify.*" \
  --dir="/path/to/backup_directory"
```

Or via Docker:
```bash
docker run --rm \
  -v "/path/to/backup_directory:/backup_target" \
  mongo:latest \
  mongorestore --uri="<MONGODB_URI>" \
    --gzip \
    --nsInclude="test.*" \
    --nsRename="test.*:test_restore_verify.*" \
    --dir=/backup_target
```

#### Verifying Sandbox Restorations:
1. Connect using `mongosh "<MONGODB_URI>"`.
2. Inspect `use test_restore_verify` and run `show collections`.
3. Check document counts across collections (`ownerprofiles`, `projects`, `memories`, `leads`, `reminders`).
4. Drop the sandbox database once verified:
   ```javascript
   db.dropDatabase();
   ```

### Emergency Disaster Recovery Restoration (Overwrites Production)
> [!CAUTION]
> The `--drop` flag permanently deletes and replaces production collections with the backup data. Use only during catastrophic disaster recovery.

```bash
mongorestore --uri="<MONGODB_URI>" --gzip --drop --dir="/path/to/backup_directory"
```

---

## 5. Maintenance & Security Rules

1. **WhatsApp Session Persistence**:
   - The directory `./openwa/data` holds all active Baileys encryption keys and tokens.
   - Do **NOT** delete, wipe, or execute `docker compose down -v` with named volumes.
   - Always ensure permissions for `./openwa/data` permit container writes.

2. **RenewX Isolation**:
   - RenewX runs on port 2785 independently.
   - Never map DHUSHYANDH AI to host port 2785. Port 2786 is strictly reserved for DHUSHYANDH AI.

3. **Log Sanitization**:
   - All logs produced by Express and OpenWA are sanitized.
   - Webhook HMAC signatures, API keys, and authorization bearer tokens are automatically redacted.
