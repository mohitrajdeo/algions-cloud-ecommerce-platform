# Cloud Deployment & CI/CD – E-Commerce Platform
**ALGIONS AI LABS PRIVATE LIMITED | Advanced Individual Project Assessment**
* **Candidate Name:** Mohit Raj Deo
* **Registration Number:** 12323329
* **Internship Role:** DevOps & Cloud Engineering
* **Assigned Project:** Cloud Deployment & CI/CD – E-Commerce Platform
* **Live Deployment URL:** [https://al-ecommerce.mohitrajdeo.in](https://al-ecommerce.mohitrajdeo.in)
* **Demo Video Link:** [https://al-video.mohitrajdeo.in](https://al-video.mohitrajdeo.in)
* **GitHub Repository:** [https://al-github.mohitrajdeo.in](https://al-github.mohitrajdeo.in)

---

## 1. System Architecture Overview

The system is designed as a resilient, observable microservice implementing an idempotent Product & Order Processing API, containerized via multi-stage Docker builds, orchestrated with PostgreSQL via Docker Compose, and deployed with zero-downtime healthcheck probes.

```mermaid
flowchart TD
    Client["Client / Load Balancer / Ingress"] -->|"HTTPS (Port 443 / 8080)"| Gateway["Reverse Proxy / API Gateway"]
    
    subgraph Container_Cluster ["Docker Orchestration (Bridge Network: ecommerce_net)"]
        Gateway -->|"Proxy Pass"| AppNode["E-Commerce API Node (Express / Node 20 Non-Root)"]
        
        AppNode -->|"Liveness Probe"| Healthz["/healthz (200 OK)"]
        AppNode -->|"Readiness Probe"| Readyz["/readyz (DB Ping)"]
        AppNode -->|"Idempotent Writes & Locks"| DB[("PostgreSQL 16 (ecommerce_db)")]
        
        DB --> Vol[("Persistent Storage: ecommerce_pgdata")]
    end

    subgraph Operations_Tools ["Observability & Disaster Recovery"]
        AppNode -.->|"JSON Telemetry"| Stdout["Structured Log Stream"]
        DB -.->|"pg_dump"| BackupScript["scripts/backup.sh"]
        BackupScript -.-> LocalBackups["./backups/*.sql"]
        LocalBackups -.-> RestoreScript["scripts/restore.sh"]
    end
```

---

## 2. Technical Scope & Domain Implementation

### Core Capabilities
1. **Product Catalog & Search:** Query real-time inventory with full-text search parameters (`GET /api/products?q=compute`).
2. **Idempotent Order Creation:** Every checkout requires a mandatory `Idempotency-Key` header. Duplicate network transmissions return the existing confirmed order without duplicate billing or double-decrementing stock (`POST /api/orders`).
3. **Negative Stock Prevention:** Strict transactional inventory locking ensures orders exceeding available units are rejected with `409 Conflict`.
4. **Administrative Stock Auditing:** Protected updates (`POST /api/admin/products/:id/stock`) requiring `x-admin-key`, appending all actions to persistent audit logs (`GET /api/admin/audit-logs`).
5. **Observability Probes:** Native Kubernetes/Docker `/healthz` (liveness) and `/readyz` (database connectivity readiness) endpoints.

---

## 3. Containerization & Orchestration

### Multi-Stage Secure Dockerfile
* **Base Image:** `node:20-alpine` (Minimal attack surface and low CVE footprint).
* **Least Privilege:** Executes under unprivileged `node` user (UID 1000). Root execution is explicitly prohibited.
* **Init Process:** Utilizes `dumb-init` for deterministic signal forwarding (SIGTERM/SIGINT) and orphan process reaping.
* **Built-in Healthcheck:** Container monitors internal state every 15s via `curl -f http://localhost:8080/healthz`.

### Local Orchestration with Docker Compose
To launch the complete isolated production stack (API + PostgreSQL + Healthchecks + Storage Volume):

```bash
docker compose up -d --build
```

Verify service status:
```bash
docker compose ps
```

---

## 4. Port Map & Environment Configuration

### Port Allocations
| Service | Internal Port | Host Port | Purpose |
| :--- | :---: | :---: | :--- |
| `api` | `8080` | `8080` | E-Commerce REST API & Health Probes |
| `db` | `5432` | `5432` | PostgreSQL 16 Database Service |

### Environment Variables (`.env.example`)
| Variable | Description | Example Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment tier | `production` |
| `PORT` | HTTP listener port | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://ecommerce_user:secure_production_password_2026@localhost:5432/ecommerce_db` |
| `ADMIN_API_KEY` | Secret token for administrative updates | `algions-secret-key-2026` |

---

## 5. API Verification & Testing Runbook

### 1. Liveness & Readiness Checks
```bash
# Liveness Probe
curl -i http://localhost:8080/healthz

# Readiness Probe
curl -i http://localhost:8080/readyz
```

### 2. View Seed Products
```bash
curl -s http://localhost:8080/api/products | jq .
```

### 3. Create an Order (Idempotency Key Demonstration)
```bash
# First Attempt: Creates order and decrements stock
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_demo_001" \
  -d '{"productId": "prod_001", "quantity": 2}'

# Second Attempt: Immediate duplicate request returns existing order (HTTP 200) without double-decrementing
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_demo_001" \
  -d '{"productId": "prod_001", "quantity": 2}'
```

### 4. Negative Stock Prevention Drill
```bash
# Attempt to order 9999 units (exceeds inventory) -> Returns HTTP 409 Conflict
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_overlimit" \
  -d '{"productId": "prod_001", "quantity": 9999}'
```

### 5. Administrative Stock Update
```bash
curl -i -X POST http://localhost:8080/api/admin/products/prod_001/stock \
  -H "Content-Type: application/json" \
  -H "x-admin-key: algions-secret-key-2026" \
  -d '{"stock": 100}'
```

---

## 6. Automated CI/CD Pipeline

The repository integrates a GitHub Actions CI workflow ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
1. **Automated Unit & Concurrency Testing:** Executes the native test suite on every pull request and push to `main`:
   ```bash
   npm test
   ```
2. **Container Build & Image Digest:** Builds a multi-platform Docker image, tagging with commit SHA and verifying build integrity.
3. **Secret Scan & Linter:** Checks that no credentials or `.env` files are accidentally committed.

---

## 7. Disaster Recovery & Rollback Procedures

### Automated Database Backup
Execute the automated backup utility to create a timestamped SQL snapshot:
```bash
# Linux / macOS
./scripts/backup.sh

# Windows PowerShell
.\scripts\backup.ps1
```

### Database Restoration
Restore the database from an emergency backup snapshot:
```bash
# Linux / macOS
./scripts/restore.sh ./backups/ecommerce_backup_YYYYMMDD_HHMMSS.sql

# Windows PowerShell
.\scripts\restore.ps1 -File .\backups\ecommerce_backup_YYYYMMDD_HHMMSS.sql
```

### Production Rollback Procedure
If a breaking deployment or container anomaly is detected:
1. Identify the prior known-stable Git commit or Docker tag (e.g. `algions/ecommerce-platform:v1.0.0`).
2. Roll back container image in `docker-compose.yml`:
   ```bash
   docker compose down
   # Switch image tag or revert git commit
   git revert HEAD --no-edit
   docker compose up -d
   ```
3. Verify readiness probe:
   ```bash
   curl -f http://localhost:8080/readyz
   ```
