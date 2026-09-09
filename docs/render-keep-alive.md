# Render Keep-Alive Setup

## The Problem

Render's free tier spins down a web service after **15 minutes of inactivity**. When a
new request arrives, the service takes **30-60 seconds** to cold start (boot Bun, connect
to Postgres, run Express startup, etc.). This makes the API feel slow on first visit.

The API exposes a health check at:

- `GET /api/health` — checks the DB connection (`SELECT 1`), returns `200/503`

## The Solution

Ping `https://loft-backend-cl1n.onrender.com/api/health` every **10 minutes** so the
service never falls below the inactivity threshold.

> **Important:** the inbound ping must come from *outside* the service. A spun-down
> Render instance is fully terminated — timers running inside the container cannot wake
> it. Use one of the external schedulers below (or the included GitHub Actions workflow)
> for reliability. The in-process pinger is a useful supplement, not a replacement.

## Layers (use as many as you like)

### 1. In-process pinger (supplement)

The server self-pings from the moment it boots, keeping a running instance warm between
external pings. Enabled via env:

```
KEEPALIVE_ENABLED=true
KEEPALIVE_URL="https://loft-backend-cl1n.onrender.com/api/health"
KEEPALIVE_INTERVAL_MIN=10
```

- Implemented in `src/lib/keepalive.ts`, started from `src/index.ts`.
- Logs each ping as `Keepalive ping -> ... [200]`.
- **Cannot** wake a spun-down instance on its own.

### 2. GitHub Actions (free, external) — recommended primary

The repo includes `.github/workflows/keep-alive.yml`, which `curl`s the health endpoint
every 10 minutes. GitHub Actions is free and requires no extra accounts.

- Override the target with a repository secret: `KEEPALIVE_URL` (defaults to the Render URL).
- Run it manually anytime from the **Actions** tab (`workflow_dispatch`).
- Caveat: GitHub disables scheduled workflows after ~60 days of no repo activity; a commit
  re-enables them.

### 3. Free external ping services

| Service | URL | Min interval |
|---------|-----|--------------|
| cron-job.org | https://cron-job.org | 1 minute |
| UptimeRobot | https://uptimerobot.com | 5 minutes |
| becron | https://becron.com | 5 minutes |

Setup for cron-job.org:

1. Create a free account, click **"Create new cron job"**.
2. **URL:** `https://loft-backend-cl1n.onrender.com/api/health`
3. **Request method:** GET
4. **Execution schedule:** every 10 minutes
5. (optional) Add your email for downtime alerts.

### 4. Render cron (paid, ~$1/mo minimum)

Render cron jobs have **no free tier**. A blueprint example exists (commented out) in
`render.yaml`. If you're paying for it anyway, upgrading the web service to Render's
**Starter** plan (~$7/mo) removes spin-down entirely — usually the better choice.

## Reasoning: self-ping alone does not work

A free Render instance that has spun down has no running process, so a `setInterval`
self-ping cannot fire. The self-pinger only prevents *future* spin-down once the instance
is awake. For wake-up capability you must have an **external** scheduler that issues an
inbound HTTP request — that is exactly what layers 2 and 3 provide.

## One-shot script

For schedulers that can run a command (Render cron, a container, a Uptime Kuma probe),
the repo ships a one-shot pinger:

```
bun run keepalive            # reads PING_URL or KEEPALIVE_URL
# or, in the production image:
node dist/scripts/keepalive.js
```

It exits `0` on a healthy `200` response and `1` otherwise, so it wires directly into any
cron/cronitor-style alerting.