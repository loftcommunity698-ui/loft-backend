# LoftCommunity Backend

Express.js API for the LoftCommunity job board platform. Serves REST endpoints for auth, jobs, applications, users, admin, messaging, notifications, payments, and contact, with Swagger docs and optional Stripe integration.

## Tech Stack

- **Runtime:** Node.js + TypeScript (tsx)
- **Framework:** Express 4
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** JWT (access + refresh tokens) with bcrypt password hashing
- **Email:** Resend
- **Payments:** Stripe
- **File Uploads:** UploadThing
- **Docs:** Swagger (swagger-jsdoc + swagger-ui-express)
- **Tests:** Vitest + Supertest

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh) (package manager and dev runner)
- [PostgreSQL](https://www.postgresql.org/) 14+ (or a hosted instance such as Neon or Supabase)

## Setup

```bash
# 1. Clone and install dependencies
git clone <repo-url> loft-backend
cd loft-backend
bun install

# 2. Copy the environment template and configure your values
cp .env.example .env

# 3. Generate the Prisma client and sync the schema
bun run db:generate
bun run db:push

# 4. Seed the database with demo data
bun run db:seed

# 5. Start the dev server (default: http://localhost:4000)
bun run dev
```

Key variables in `.env`: `DATABASE_URL`, `JWT_SECRET` (generate with `openssl rand -base64 32`), `FRONTEND_URL`, `RESEND_API_KEY`, `SUPPORT_EMAIL`, and optional `STRIPE_SECRET` / `STRIPE_WEBHOOK_SECRET`.

## Scripts

| Script             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `bun run dev`      | Start dev server with hot reload (`tsx watch`)     |
| `bun run build`    | Compile TypeScript to `dist/`                      |
| `bun run start`    | Run the compiled server (`node dist/index.js`)     |
| `bun run test`     | Run the test suite (Vitest)                        |
| `bun run db:generate` | Generate the Prisma client                     |
| `bun run db:push`  | Push the Prisma schema to the database             |
| `bun run db:seed`  | Seed the database with demo data                   |
| `bun run db:studio`| Open Prisma Studio to browse the database          |

## API Overview

68 REST endpoints grouped by domain:

- **Auth** — register, login, logout, refresh, OAuth, password reset, email verification
- **Jobs** — CRUD, search/facets, saved jobs, apply, candidates, metrics
- **Applications** — status, shortlist, notes, interviews
- **Users** — profile, resume, skills, employers
- **Admin** — employer management, analytics, role bindings (RBAC)
- **Messaging** — conversations between applicants and employers
- **Notifications** — read state and preferences
- **Payments** — Stripe checkout and webhooks
- **Contact** — support/contact form submissions

Interactive API documentation is served by Swagger at **`http://localhost:4000/api/docs`**.

## Docker

Run the API plus a PostgreSQL instance with a single command:

```bash
docker-compose up
```

- API: `http://localhost:4000`
- PostgreSQL: `localhost:5432` (db `loft_community`, user/pass `postgres`)

## Deployment

The API is configured for deployment on [Render](https://render.com). Use the included `render.yaml` blueprint, or deploy the `Dockerfile` manually:

1. Create a new Web Service from the `Dockerfile`
2. Set `PORT=4000` and `healthCheckPath=/api/health`
3. Configure `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and any optional keys (`RESEND_API_KEY`, `STRIPE_SECRET`, etc.)

`KEEPALIVE_ENABLED` is set to `true` in production to ping the `/api/health` endpoint and reduce free-tier spin-down.

## Project Structure

```
src/
  routes/       # Express routers (auth, jobs, applications, ...)
  services/     # Business logic (jobs, search, audit)
  lib/          # Shared helpers (db, jwt, email, rate-limit, sse)
  middleware/   # auth, rbac, audit, error-handler
  config/       # Env config, Swagger spec
  __tests__/    # Vitest/Supertest suites
prisma/
  schema.prisma # Database schema
  seed.ts       # Demo data
```