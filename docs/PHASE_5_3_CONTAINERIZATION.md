# DHUSHYANDH AI — Phase 5.3 Production Containerization Report

## 1. Executive Summary

Phase 5.3 prepares the DHUSHYANDH AI application for 24/7 production deployment in a containerized Linux or cloud environment. This phase hardens the runtime containerization, implements a unified production Docker Compose configuration, secures message retention via a 30-day MongoDB TTL index, and verifies container security, non-root execution, graceful shutdown, and zero secret leakage.

All existing application features from Phases 1 through 5.2—including private/public WhatsApp modes, knowledge engine, lead management, reminder recovery, and dual-model Gemini fallback—remain fully intact.

---

## 2. API Production Dockerfile

The API Dockerfile located at `apps/api/Dockerfile` implements an optimized multi-stage build on Alpine Linux.

### Key Architectural Characteristics:

1. **Base Image**: `node:22-alpine`
   - Official Node.js LTS Alpine image offering minimal attack surface (<180MB total uncompressed).
   - Minimal system dependencies, zero development compilers.

2. **Multi-Stage Build Pattern**:
   - **Stage 1 (`dependencies`)**: Runs `npm ci --omit=dev --ignore-scripts` to install production dependencies only. Cache is cleaned immediately (`npm cache clean --force`).
   - **Stage 2 (`runner`)**: Copies only the production `node_modules`, `package*.json`, `src/`, and `assets/` directories.

3. **Non-Root Execution**:
   - Executes strictly under standard unprivileged user `node` (`uid=1000, gid=1000`).
   - Files owned by `node:node` with read/execute permissions.

4. **PID 1 Signal Forwarding**:
   - `dumb-init` runs as PID 1 entrypoint (`ENTRYPOINT ["dumb-init", "--"]`).
   - Forwards `SIGTERM` and `SIGINT` signals reliably to Node.js, allowing the Express server to close incoming connections and gracefully disconnect MongoDB without abrupt termination.

5. **Integrated Healthcheck**:
   - Native Node.js HTTP probe calling `GET /api/health` without external curl dependency:
     ```dockerfile
     HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
       CMD node -e "fetch('http://localhost:5000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));"
     ```

6. **Context Exclusion (`.dockerignore`)**:
   - Strictly ignores `.env*`, `node_modules`, `tests`, `*.log`, `.git`, `.vscode`, coverage reports, and database backups.

---

## 3. Production Compose (`docker-compose.prod.yml`)

The production Compose configuration is defined at the repository root: `docker-compose.prod.yml`.

### Architecture & Service Isolation:

| Service | Image | Ports / Bindings | Resource Limits | Restart Policy | Stop Grace |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `api` | `dhushyandh-ai-api:production` | `127.0.0.1:5000:5000` | 512MB RAM, 1.0 CPU, 256 PIDs | `unless-stopped` | 30s |
| `openwa` | `openwa-openwa:latest` | `127.0.0.1:2786:2785` | 1024MB RAM, 1.5 CPU, 512 PIDs | `unless-stopped` | 75s |

### Security Safeguards:
- **Zero Secret Storage**: No secrets or passwords are hardcoded in the compose YAML. All values are supplied via runtime environment variables (`${VAR:?VAR is required}`).
- **Private Internal Network**: Both containers communicate over an isolated bridge network (`dhushyandh-ai-prod-net`).
- **Loopback Isolation**: OpenWA is bound strictly to `127.0.0.1:2786` and is never exposed to the public internet.
- **RenewX Isolation**: The separate RenewX OpenWA instance is completely excluded from this project's Compose specification.
- **Persistent WhatsApp Session**: The Baileys WhatsApp authentication credentials, keys, and SQLite database are mounted persistently to `./openwa/data:/app/data`.
- **Read-Only Container Filesystem**: OpenWA runs with `read_only: true` and temporary filesystem `tmpfs: /tmp` for maximum container hardening.

---

## 4. MessageEvent Retention & TTL Indexing

### Background:
During high-traffic production operation, `MessageEvent` documents record every inbound WhatsApp message, its processing stage, model selection, duration, and outbound idempotency keys. Without lifecycle management, this collection grows indefinitely.

### Implementation:
1. **Configurable Retention**:
   - Added `MESSAGE_EVENT_TTL_DAYS` (default: `30` days) to `apps/api/src/config/env.js`.
2. **Dynamic Expiration Calculation**:
   - Added `expiresAt` field to `apps/api/src/modules/webhook/message-event.model.js`:
     ```javascript
     expiresAt: {
       type: Date,
       default: () => new Date(Date.now() + getMessageEventTtlDays() * 24 * 60 * 60 * 1000),
     }
     ```
3. **MongoDB TTL Index**:
   - Defined index `{ expiresAt: 1 }` with `{ expireAfterSeconds: 0 }`.
   - MongoDB background TTL thread automatically purges expired message events.
4. **Idempotency & Duplicate Suppression Safety**:
   - WhatsApp message retransmissions cease within 24 hours.
   - The 30-day retention window provides a 30x safety margin, guaranteeing that duplicate webhook events are recognized and suppressed across the full operational window without retaining stale events permanently.

---

## 5. Verification & Testing

### Test Suite 17: MessageEvent Retention & TTL Indexing
A dedicated test suite was created at `apps/api/tests/17_message_event_retention_ttl.test.js`:
- ✅ `1. MessageEvent model defines a TTL index on 'expiresAt' with expireAfterSeconds: 0`
- ✅ `2. Newly created MessageEvent automatically calculates expiresAt to ~30 days in future`
- ✅ `3. Configurable MESSAGE_EVENT_TTL_DAYS overrides default retention window`
- ✅ `4. Duplicate events with same eventKey are rejected within the retention window`
- ✅ `5. Retention window preserves full idempotency context, timestamps and outbound tracking`
**Result**: 5/5 passed (100%).

### Image Build & Security Verification:
1. **Build Status**: Built image `dhushyandh-ai-api:production` cleanly using cached multi-stage layers.
2. **Non-Root User Check**:
   - Command: `docker run --rm dhushyandh-ai-api:production id`
   - Output: `uid=1000(node) gid=1000(node)`
3. **Secret Leakage Audit**:
   - Checked inside image for `.env*` files: zero configuration or secret files exist in the image.
4. **Healthcheck & Startup Verification**:
   - Tested container run: started Express server, connected to MongoDB, validated OpenWA ready, returned `200 OK` on `/api/health`.
5. **Graceful Shutdown**:
   - Tested `docker stop`: received `SIGTERM`, closed database pool gracefully, terminated cleanly.
