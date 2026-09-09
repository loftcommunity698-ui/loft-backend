# LoftCommunity Backend Spec

> Reference blueprint for the LoftCommunity Express.js backend API.
> Source: `loft-backend/src/` — extracted 2026-07-23, search engine + job model refreshed 2026-08-06.

---

## 1. Overview

LoftCommunity Backend is a REST API for a job portal platform serving both job seekers and employers. It is built on Express.js with TypeScript, uses PostgreSQL via Prisma ORM, and authenticates users through self-hosted JWTs (no third-party auth provider at runtime). The system supports job listings with a Postgres full-text search engine (canonical, shared with hirehub-backend), applications with pipeline tracking, messaging with SSE push notifications, company/team management, Stripe checkout, and file uploads via UploadThing.

---

## 2. Tech Stack

| Library | Version | Purpose |
|---|---|---|
| Express | ^4.21.0 | HTTP framework |
| TypeScript | ^5 | Type system |
| tsx | ^4.7.0 | Dev runner with watch mode |
| Prisma Client | 5.22.0 | PostgreSQL ORM |
| Prisma CLI | 5.22.0 | Schema management |
| jsonwebtoken | ^9.0.2 | JWT sign/verify |
| bcryptjs | ^2.4.3 | Password hashing (12 rounds) |
| cookie | ^0.6.0 | Cookie serialization |
| cookie-parser | ^1.4.7 | Cookie parsing middleware |
| cors | ^2.8.5 | CORS middleware |
| helmet | ^8.3.0 | Security headers |
| resend | ^3.2.0 | Transactional email |
| stripe | ^14.21.0 | Payment processing |
| uploadthing | ^7.7.4 | File upload handling |
| zod | ^3.22.4 | Schema validation (dep available, mostly unused) |

---

## 3. Code Structure

```
loft-backend/
├── package.json
├── tsconfig.json
├── bun.lock
├── prisma/
│   └── schema.prisma              # Full DB schema (30 models, 16 enums)
├── scripts/
│   ├── seed-json-jobs.ts          # Bulk import jobs from JSON file
│   ├── seed-special-employers.ts  # Create 5 special employer accounts
│   └── set-admin-password.ts      # Set admin account password
├── src/
│   ├── index.ts                   # Express app entry, middleware chain, route mounting
│   ├── config/
│   │   └── env.ts                 # Environment variable access
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces (JwtUser, AuthRequest, inputs)
│   ├── middleware/
│   │   ├── auth.ts                # requireAuth, optionalAuth
│   │   └── error-handler.ts       # Global error handler
│   ├── lib/
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── auth-service.ts        # Registration, login, password reset logic
│   │   ├── jwt.ts                 # Token sign/verify, cookie creation
│   │   ├── email.ts               # Resend client + email templates
│   │   ├── logger.ts              # Structured JSON logger
│   │   ├── rate-limit.ts          # Database-backed rate limiter
│   │   ├── company.ts             # Company session helpers
│   │   ├── response.ts            # Canonical envelope helpers ({ success, data, pagination })
│   │   └── sse.ts                 # Server-Sent Events manager
│   ├── services/
│   │   ├── search.ts              # Search-engine query builder (full-text + filters + sort)
│   │   ├── jobs.ts                # Job list/CRUD with canonical sort & cursor logic
│   │   └── audit.ts               # Audit event recording
│   └── routes/
│       ├── auth.ts                # /api/auth/*
│       ├── health.ts              # /api/health/*
│       ├── jobs.ts                # /api/jobs/*
│       ├── applications.ts        # /api/applications/*
│       ├── users.ts               # /api/users/*
│       ├── notifications.ts       # /api/notifications/*
│       ├── companies.ts           # /api/companies/*
│       ├── admin.ts               # /api/admin/*
│       ├── messages.ts            # /api/messages/*
│       ├── skills.ts              # /api/skills/*
│       ├── interviews.ts          # /api/interviews/*
│       ├── payment.ts             # /api/payment/*
│       ├── contact.ts             # /api/contact/*
│       ├── uploadthing.ts         # /api/uploadthing/*
│       ├── sse.ts                 # /api/sse/*
│       ├── stats.ts               # /api/stats/*
│       └── test.ts                # /api/test/* (dev only)
└── docs/
    └── superpowers/
        └── specs/
            └── loftcommunity-backend-spec.md  # This document
```

---

## 4. App Setup & Middleware Chain

Entry: `src/index.ts`

Middleware is applied in this exact order:

```
1. cors({ origin: FRONTEND_URL, credentials: true })
2. helmet()
3. cookieParser()
4. express.json({ limit: '10mb' })
5. Route mounting (17 route groups)
6. errorHandler() — final catch-all
```

Route mounts:

| Mount Path | Router Module | Condition |
|---|---|---|
| `/api/auth` | `routes/auth.ts` | Always |
| `/api/health` | `routes/health.ts` | Always |
| `/api/jobs` | `routes/jobs.ts` | Always |
| `/api/applications` | `routes/applications.ts` | Always |
| `/api/users` | `routes/users.ts` | Always |
| `/api/notifications` | `routes/notifications.ts` | Always |
| `/api/companies` | `routes/companies.ts` | Always |
| `/api/admin` | `routes/admin.ts` | Always |
| `/api/messages` | `routes/messages.ts` | Always |
| `/api/skills` | `routes/skills.ts` | Always |
| `/api/interviews` | `routes/interviews.ts` | Always |
| `/api/payment` | `routes/payment.ts` | Always |
| `/api/contact` | `routes/contact.ts` | Always |
| `/api/uploadthing` | `routes/uploadthing.ts` | Always |
| `/api/sse` | `routes/sse.ts` | Always |
| `/api/stats` | `routes/stats.ts` | Always |
| `/api/test` | `routes/test.ts` | `env.isDev` only |

Graceful shutdown: SIGTERM and SIGINT handlers close the HTTP server with a 10-second forced exit timeout.

---

## 5. Authentication

### JWT Token Flow

Tokens are signed using `jsonwebtoken` with `env.jwtSecret`. The secret is required in production (throws if missing); a hardcoded `"dev-secret-change-in-production"` is used in development.

### Token Payload Structure (`JwtUser`)

```typescript
{
  userId: string      // Numeric user DB id as string
  clerkId: string     // Unique user identifier (e.g., "local_1721...", "oauth_google_...")
  email: string
  isEmployer: boolean
  isApplicant: boolean
  companyId?: number  // Set when user has company membership
  companyRole?: "ADMIN" | "EMPLOYER"  // Set when user has company membership
}
```

Token expiry: **15 minutes**.

### Cookie Configuration

```
Cookie name:   auth-token
httpOnly:      true
secure:        true (production only)
sameSite:      "lax"
path:          "/"
maxAge:        900 seconds (15 minutes)
```

### Token Extraction

`extractToken()` checks two sources in order:
1. `req.cookies["auth-token"]` (cookie)
2. `Authorization: Bearer <token>` header

### Auth Middleware

- **`requireAuth`**: Extracts token, verifies it, attaches `req.user`. Returns `401` on failure.
- **`optionalAuth`**: Extracts token if present, attaches `req.user` if valid. Always calls `next()`.

### OAuth Flow

`POST /api/auth/oauth` — Frontend handles the OAuth UI (Google only currently), then sends `{ provider, accessToken }` to the backend. The backend verifies the token with Google's tokeninfo/userinfo endpoint, finds or creates the user, and returns a JWT cookie.

OAuth users are created with `emailVerified: true` (pre-verified). New OAuth users default to `isApplicant: true`.

### Registration & Login

- **Registration**: Hashes password with bcrypt (12 rounds), generates a `clerkId` in the format `local_<timestamp>_<random>`, creates a verification token (24h expiry), creates a welcome notification, sets JWT cookie immediately.
- **Login**: Validates credentials, sets JWT cookie.
- **Password Reset**: Generates a 32-byte hex token stored in `VerificationToken` (1h expiry), emails a link to the frontend.
- **Password Update**: Validates token, hashes new password, deletes the token.

### ClerkId Convention

The `clerkId` field is a legacy name from a prior Clerk integration. It serves as the primary user-facing identifier throughout the codebase. Format conventions:
- Local credentials: `local_<timestamp>_<random7chars>`
- OAuth: `oauth_<provider>_<timestamp>_<random7chars>`
- Test/E2E: `e2e_applicant_<timestamp>`, `e2e_employer_<timestamp>`
- Seed special employers: `local_sp_<timestamp>_<random7chars>`

---

## 6. Authorization

### Role-Based Checks

| Check | Implementation | Where Used |
|---|---|---|
| **Authenticated user** | `requireAuth` middleware | Most routes |
| **Employer** | `user.isEmployer === true` (from DB) | Job create/update/delete, application management |
| **Applicant** | `user.isApplicant === true` (from DB) | Profile management, job applications |
| **Company Member** | `companyMemberships.length > 0` | Application viewing, job management |
| **Company Admin** | `companyMemberships[0].role === "ADMIN"` | Admin routes, job moderation |
| **Global Admin** | Email in `ADMIN_EMAILS` env OR `CompanyMember` with `ADMIN` role on companyId=1 | Full admin panel access |

### Admin Authorization Pattern

Admin routes in `routes/admin.ts` use a local `requireAdmin()` function that checks two paths:
1. User email is in the `ADMIN_EMAILS` environment variable (comma-separated list)
2. User has a `CompanyMember` record with `role: "ADMIN"` for `companyId: 1`

### Company Membership Authorization

`lib/company.ts` provides helpers:
- `getCompanySession(user)` — Looks up the first company membership for a user
- `requireAdmin(user)` — Requires company membership with ADMIN role
- `requireCompanyMember(user)` — Requires any company membership

### Authorization Per Route Group

- **Jobs**: Employer-only for create/update/delete. Owner or company member for management.
- **Applications**: Owner (employer) or company member for viewing/modifying. Applicant sees only their own.
- **Messages**: Rate-limited per user. Job-context messaging restricted to INTERVIEW/OFFERED application status.
- **Admin**: All routes require admin check.
- **Notifications**: Users can only read/update their own.
- **Companies**: Employer profile management, company job listing requires membership.

---

## 7. API Endpoints

### Auth (`/api/auth`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| POST | `/register` | No | Register new account, sets JWT cookie | Yes: 5/min per IP |
| POST | `/login` | No | Login with email/password, sets JWT cookie | Yes: 5/min per IP |
| POST | `/logout` | No | Clear auth cookie | No |
| GET | `/me` | Yes | Get current authenticated user | No |
| POST | `/oauth` | No | OAuth login (Google) | No |
| GET | `/verify-email?token=` | No | Verify email with token | No |
| POST | `/verify-email` | No | Resend verification email | No |
| POST | `/reset-password` | No | Request password reset email | Yes: 3/min per IP |
| POST | `/update-password` | No | Update password with reset token | No |
| GET | `/session` | Optional | Session check for frontend (returns user email or null) | No |

### Health (`/api/health`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/` | No | Health check with DB connection test | No |

### Jobs (`/api/jobs`)

The Jobs API implements the canonical search-engine contract shared with hirehub-backend (converged 2026-08-06): full-text Postgres search, combined filters, keyset pagination, and a uniform `{ success, data, pagination }` envelope.

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/tags/search` | No | Tag autocomplete. Params: q (returns matching tags ordered by frequency) | No |
| GET | `/facets` | No | Facet counts for category, seniority, location, remote | No |
| GET | `/` | No | Search/list jobs. Params: search, location, category, seniority, remote, salaryMin, salaryMax, featured, sort, take, cursor | No |
| GET | `/:id` | No | Get single job by id (string cuid) | No |
| POST | `/` | Yes (Employer) | Create job listing | No |
| PATCH | `/:id` | Yes (Employer) | Update job (owner only) | No |
| DELETE | `/:id` | Yes (Employer) | Delete job (owner only) | No |
| POST | `/:id/apply` | Yes | Apply to job (applicant). Cover letter max 5000 chars | No |
| GET | `/:id/candidates` | Yes (Employer) | List candidates with match scores. Params: sort (matchScore, date) | No |
| GET | `/:id/metrics` | Yes (Employer) | Job application metrics (owner only) | No |
| POST | `/:id/report` | Yes | Report a job | No |

#### Search Engine Contract

- **Search field** — `search` runs a Postgres full-text query (`websearch_to_tsquery` + `ts_rank`) over 9 columns: title, company, description, tags, category, seniority, location, requirements, responsibilities.
- **Combined filters** — `search`, `location`, `category`, `seniority`, `remote`, `salaryMin`, `salaryMax`, `featured`, and `sort` compose into a single SQL query. All filter values match the canonical hirehub vocabulary (e.g. `seniority` in `entry, junior, mid, senior, lead, executive`; `remote` is `"true"`/`"false"`).
- **Sorting** — `sort` accepts `recent` (default), `relevance` (uses `ts_rank`, exposes a `rank` field on results), `salary_high`, `salary_low`, `remote_first`. Default is always `recent`; `rank` is only returned when `sort=relevance` is explicitly requested.
- **Pagination** — Keyset (cursor) pagination: `take` (default 12, max 100), `cursor` encodes the last row's sort tuple (`id`, `postedDate`, `salaryMax`, `remote`, or `rank`). Response includes `pagination: { total, cursor }`; next-page query uses `cursor`.
- **Envelope** — Every list response is `{ success: true, data: Job[], pagination: { total, cursor } }`; errors are `{ success: false, message }` with appropriate status codes.
- **Job payload** — Canonical Job fields: `id, title, company, companyLogo, location, remote, salaryMin, salaryMax, currency, tags, category, seniority, description, requirements, responsibilities, postedDate, expiresAt, featured, employerId, createdAt, updatedAt`.

### Applications (`/api/applications`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/` | Yes | List applications (scope varies by role). Params: jobId, status | No |
| GET | `/:id` | Yes | Get single application detail | No |
| POST | `/:id/interviews` | Yes (Employer) | Schedule interview for application | No |
| PATCH | `/:id/notes` | Yes (Employer) | Update employer notes | No |
| PATCH | `/:id/shortlist` | Yes (Employer) | Toggle shortlist status | No |
| PATCH | `/:id/status` | Yes (Employer) | Update application status (sends email notification) | No |

### Users (`/api/users`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/profile` | Yes | Get full user profile with skills and resume | No |
| PATCH | `/profile` | Yes | Update user profile (personal info + professional info) | No |
| GET | `/skills` | Yes | Get user's skills list | No |
| POST | `/skills` | Yes | Add skill to profile | No |
| DELETE | `/skills?skillId=` | Yes | Remove skill from profile | No |
| POST | `/role` | Yes | Switch user role (EMPLOYER or JOB_SEEKER) | No |
| POST | `/resume` | Yes | Upload/resume metadata (fileUrl from UploadThing) | No |
| GET | `/saved-jobs` | Yes | List saved jobs | No |
| POST | `/saved-jobs` | Yes | Save a job (max 100) | No |
| DELETE | `/saved-jobs?jobId=` | Yes | Unsave a job | No |
| GET | `/notifications` | Yes | Get notification preferences | No |
| PATCH | `/notifications` | Yes | Update notification preferences | No |

### Notifications (`/api/notifications`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/` | Yes | List notifications. Params: unreadOnly, limit (default 50) | No |
| PATCH | `/` | Yes | Mark notifications read (bulk by IDs or markAllRead) | No |
| POST | `/` | Yes | Create notification (admin/server-side use) | No |
| PATCH | `/:id` | Yes | Update single notification (mark read/unread) | No |

### Companies (`/api/companies`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/profile` | Yes | Get employer profile | No |
| PATCH | `/profile` | Yes | Update/create employer profile | No |
| GET | `/jobs` | Yes (Company Member) | List company jobs. Params: status, assignedToMe | No |

### Admin (`/api/admin`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/analytics` | Yes (Admin) | Platform-wide analytics (user counts, application stats, hire rate) | No |
| GET | `/employers` | Yes (Admin) | List all company members for companyId=1 | No |
| POST | `/employers` | Yes (Admin) | Add employer to company | No |
| PATCH | `/employers/:id` | Yes (Admin) | Update employer role | No |
| DELETE | `/employers/:id` | Yes (Admin) | Remove employer from company (protects last admin) | No |
| GET | `/company` | Yes (Admin) | Get company info (slug: "loft-community") | No |
| PATCH | `/company` | Yes (Admin) | Update company info | No |
| GET | `/jobs` | Yes (Admin) | List all jobs for moderation. Params: status, limit | No |
| PATCH | `/jobs` | Yes (Admin) | Moderate job (approve/reject/flag) | No |
| GET | `/applications` | Yes (Admin) | List all applications with stats. Params: status, search, page, limit | No |
| GET | `/applications/:id` | Yes (Admin) | Full application detail (admin view) | No |

### Messages (`/api/messages`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/` | Yes | List messages/conversations. Params: jobId | No |
| POST | `/` | Yes | Send message (max 5000 chars). Requires INTERVIEW/OFFERED status for job-context messaging | Yes: 30/min per user+IP |
| POST | `/:id/read` | Yes | Mark message as read (receiver only) | No |

### Skills (`/api/skills`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/search?q=` | No | Search skills by name. Min 1 char, max 10 results | No |

### Interviews (`/api/interviews`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| PATCH | `/:id` | Yes (Employer) | Update interview details (status, notes, feedback, rating, etc.) | No |

### Payment (`/api/payment`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/` | No | List Stripe prices (top 3) | No |
| POST | `/` | No | Create Stripe checkout session (subscription mode) | No |

### Contact (`/api/contact`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| POST | `/` | No | Send contact form email to support | No |

### UploadThing (`/api/uploadthing`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| `*` | `/*` | No | UploadThing route handler (resume uploads: PDF, max 8MB, 1 file) | No |

### SSE (`/api/sse`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| GET | `/subscribe` | Yes (JWT via cookie/header) | Establish SSE connection | Yes: 20/min per IP |

### Stats (`/api/stats`)

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| POST | `/visit` | No | Increment visitor counter (in-memory) | No |
| GET | `/visitors` | No | Get current visitor count | No |

### Test (`/api/test`) — Dev Only

| Method | Path | Auth Required | Description | Rate Limited |
|---|---|---|---|---|
| POST | `/setup` | No | Seed E2E test data (applicant, employer, company, job, message) | No |
| POST | `/teardown` | No | Remove E2E test data | No |

---

## 8. Rate Limiting

### Implementation

Database-backed using the `RateLimit` Prisma model. Each rate limit entry stores:
- `key`: Unique identifier (e.g., `register:192.168.1.1`)
- `count`: Request count in current window
- `windowStart`: When the current window began
- `expiresAt`: When the entry expires (auto-cleaned)

On each check, expired entries are deleted (`DELETE WHERE expiresAt < now`), then the counter is upserted. If the count exceeds the limit, the request is rejected with `429`. On any database error, the request is allowed through (fail-open).

### Rate Limits

| Key Pattern | Limit | Window | Endpoints |
|---|---|---|---|
| `register:<ip>` | 5 requests | 60s | `POST /api/auth/register` |
| `login:<ip>` | 5 requests | 60s | `POST /api/auth/login` |
| `reset:<ip>` | 3 requests | 60s | `POST /api/auth/reset-password` |
| `msg:<clerkId>:<ip>` | 30 requests | 60s | `POST /api/messages` |
| `sse:<ip>` | 20 requests | 60s | `GET /api/sse/subscribe` |

---

## 9. Real-time (SSE)

### Connection Flow

1. Client sends `GET /api/sse/subscribe` with JWT token
2. Server verifies token, looks up user in DB
3. Rate limit check (20/min per IP)
4. `addClient(clerkId, res)` registers the response
5. Headers set: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
6. Initial keepalive comment sent: `:\n\n`
7. Keepalive interval: every 30 seconds (`:keepalive\n\n`)
8. On client disconnect, response is removed from the clients map

### Event Types

| Event | Payload | Triggered By |
|---|---|---|
| `new_message` | Full message object with sender/receiver info | `POST /api/messages` (send) |

### Constraints

- **Max connections per user**: 5 (additional attempts return `429`)
- **Storage**: In-memory `Map<string, Set<Response>>`
- **Cleanup**: Automatic on connection close

---

## 10. Email System

### Resend Integration

- Client: `new Resend(env.resendApiKey)` — only initialized if API key is set
- Sender: `LoftCommunity <noreply@loftcommunity.com>`
- If Resend is not configured, emails are silently skipped with a warning log

### Email Preference Checking

`shouldSendEmail(clerkId, type)` checks `NotificationPreference` before sending:
- `"applicationUpdates"` → `prefs.applicationUpdates`
- `"newMessages"` → `prefs.newMessages`

Defaults to `true` if no preference record exists.

### Email Templates

All templates use inline HTML with the brand color `#10b981` (emerald-500). They use `escapeHtml()` to prevent XSS in template variables.

| Template | Subject | Trigger |
|---|---|---|
| `applicationSubmitted` | "Application Submitted - {jobTitle}" | Not sent from backend (client-side) |
| `statusUpdate` | "Application Status Update - {jobTitle}" | `PATCH /api/applications/:id/status` |
| `newMessage` | "New Message from {senderName}" | `POST /api/messages` |
| `newApplicant` | "New Applicant for {jobTitle}" | Not sent from backend (planned) |

Password reset emails are sent directly via `sendEmail()` with custom HTML from `auth-service.ts`.

### HTML Pattern

```html
<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #10b981;">{Title}</h1>
    <p>{Body}</p>
    <a href="{url}"
       style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
      {CTA Text}
    </a>
  </body>
</html>
```

---

## 11. Error Handling

### Global Error Handler (`middleware/error-handler.ts`)

Catches all unhandled errors. Response shape:

```json
{
  "error": "Error message string",
  "stack": "...stack trace..."  // Only in development mode
}
```

Status code is read from `err.status` or `err.statusCode`, defaulting to `500`. All 5xx errors are logged via the structured logger.

### Route-Level Error Handling

Each route wraps its logic in try/catch blocks and returns:
- Specific error messages for known failures (missing fields, unauthorized, not found)
- `"Internal server error"` for unexpected errors
- Status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 429 (rate limited), 500 (server error), 503 (service unavailable)

### Auth Error Pattern

Authorization errors throw objects with `status` property:
```typescript
throw Object.assign(new Error("Unauthorized"), { status: 401 })
throw Object.assign(new Error("Forbidden: admin role required"), { status: 403 })
```

---

## 12. External Integrations

### Stripe (Payments)

- **Client**: `new Stripe(env.stripeSecret, { typescript: true, apiVersion: "2023-10-16" })`
- **Endpoints**: `GET /api/payment` (list prices), `POST /api/payment` (create checkout session)
- **Mode**: Subscription only
- **Success URL**: `${FRONTEND_URL}/billing?session_id={CHECKOUT_SESSION_ID}`
- **Cancel URL**: `${FRONTEND_URL}/billing`
- **Note**: No webhook handler exists. No subscription management, no customer portal. No auth required on payment endpoints.

### Jobicy (Remote Jobs) — Removed

The Jobicy aggregation integration was removed during the 2026-08-06 search-engine convergence. Jobs now come exclusively from the local `Job` table via the canonical search contract; the old `GET /api/jobs/remote` route and Jobicy conversion/caching code no longer exist.

### UploadThing (File Uploads)

- **Route Handler**: `createRouteHandler` from `uploadthing/express`
- **Endpoint**: `resumeUploader` — PDF only, max 8MB, max 1 file
- **Middleware**: No-op (returns empty object)
- **On Upload**: Returns `{ fileUrl: file.ufsUrl }`
- **Usage**: Frontend uploads via UploadThing, then stores the URL via `POST /api/users/resume`

### Resend (Email)

- See §10 Email System above.

---

## 13. Database Access

### Prisma Client Singleton (`lib/db.ts`)

```typescript
const db = globalThis.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
})
if (process.env.NODE_ENV !== "production") globalThis.prisma = db
```

The `globalThis.prisma` pattern prevents multiple Prisma Client instances during hot-reload in development.

### Database Connection Test

```typescript
async function testDbConnection() {
  await db.$queryRaw`SELECT 1`
  return true/false
}
```

Used by the health endpoint.

### Schema Overview

30 models across these domains:

| Domain | Models |
|---|---|
| Auth | User, Account, Session, VerificationToken |
| Profile | UserProfile, Education, WorkExperience, LanguageSkill |
| Resume | Resume |
| Employer | EmployerProfile, Company, CompanyMember |
| Jobs | Job, JobApplication, Interview |
| Skills | Skill, UserSkill |
| Messaging | Message |
| Notifications | Notification, NotificationPreference |
| English Test | EnglishTestQuestion, EnglishTestResult |
| Reports | Report |
| Saved | SavedJob |
| Infrastructure | RateLimit, CacheEntry, RefreshToken, Role, RoleBinding, AuditEvent |

The `Job` model uses the canonical job model (string `cuid` id, flat `category`/`seniority` strings, `tags`/`requirements`/`responsibilities` arrays, `postedDate`/`expiresAt`); canonical fields are identical to hirehub-backend's, with relations adapted per backend (loft `employerId → User.clerkId`, hirehub `→ User.id`) — see `loftcommunity-data-model.md`.

### Key Enums

| Enum | Values |
|---|---|
| EnglishLevel | BEGINNER, ELEMENTARY, INTERMEDIATE, UPPER_INTERMEDIATE, ADVANCED, NATIVE |
| LanguageProficiency | BEGINNER, ELEMENTARY, INTERMEDIATE, ADVANCED, NATIVE |
| QuestionType | READING, WRITING, LISTENING, SPEAKING, GRAMMAR, VOCABULARY, MULTIPLE_CHOICE |
| QuestionDifficulty | EASY, MEDIUM, HARD |
| TestCategory | GRAMMAR, VOCABULARY, READING, WRITING, LISTENING, SPEAKING, COMPREHENSION |
| TestType | PLACEMENT, CERTIFICATION, SKILLS_ASSESSMENT |
| ApplicationStatus | PENDING, REVIEWING, SHORTLISTED, INTERVIEW, OFFERED, HIRED, REJECTED, WITHDRAWN |
| InterviewType | PHONE, VIDEO, ONSITE, TECHNICAL, FINAL |
| InterviewStatus | SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED |
| CompanyRole | ADMIN, EMPLOYER |
| CompanySize | STARTUP, SMALL, MEDIUM, LARGE, ENTERPRISE |
| HiringMode | STANDARD, EXPRESS, URGENT |
| AvailabilityType | IMMEDIATELY, TWO_WEEKS, ONE_MONTH, TWO_MONTHS, NOT_AVAILABLE |
| SkillLevel | EXPERT, INTERMEDIATE, BEGINNER |
| NotificationType | APPLICATION_RECEIVED, APPLICATION_SHORTLISTED, APPLICATION_REJECTED, JOB_RECOMMENDED, JOB_EXPIRED, PROFILE_VIEWED, MESSAGE, ENGLISH_TEST_INVITE, INTERVIEW_SCHEDULED |
| ReportStatus | PENDING, REVIEWED, RESOLVED, DISMISSED |

The Job search surface uses plain strings (`sort` = recent/relevance/salary_high/salary_low/remote_first; `seniority` = entry/junior/mid/senior/lead/executive) rather than enums — no `JobType`/`ExperienceLevel`/`WorkMode`/`JobStatus`/`SalaryPeriod` enums remain.

---

## 14. Scripts

### `scripts/seed-json-jobs.ts`

Bulk imports jobs from a JSON file (`../loft_commmunity/client/src/data/jobs.json`). Requires at least one `EmployerProfile` and one `Company` to exist. Deduplicates via `slug`, which predates the canonical Job model — after convergence the `Job` model has no `slug` column, so this script needs updating to the canonical fields (id via cuid, `category`/`seniority` strings, `postedDate`/`expiresAt`) before reuse.

Run: `npx tsx scripts/seed-json-jobs.ts`

### `scripts/seed-special-employers.ts`

Creates 5 employer accounts with hardcoded emails and passwords:
- `special1@loftcommunity.com` through `special5@loftcommunity.com`
- Adds them as EMPLOYER members of the "loft-community" company
- Updates password if user already exists
- Prints recommended `ADMIN_EMAILS` env value

Run: `npx tsx scripts/seed-special-employers.ts`

### `scripts/set-admin-password.ts`

Sets the password for the admin account. Reads `ADMIN_EMAIL` (default: `admin@loftcommunity.com`) and `ADMIN_PASSWORD` (default: `Admin123!`) from environment.

Run: `ADMIN_EMAIL=admin@loftcommunity.com ADMIN_PASSWORD=secret npx tsx scripts/set-admin-password.ts`

---

## 15. Conventions

| Area | Convention |
|---|---|
| **Logger** | `createLogger("context")` returns `{ info, warn, error, debug }` with JSON output |
| **Error responses** | `{ error: "message" }` for generic, `{ success: false, message: "msg" }` for auth |
| **Success responses** | `{ success: true, ...data }` or direct data object |
| **Route files** | One file per domain, exported as default `Router()` |
| **Auth lookups** | Always by `email` from JWT, not by `clerkId` (except in `company.ts` and `sse.ts`) |
| **Slug resolution** | Jobs use `/:id` (string cuid) — slug-based route resolution was removed with the canonical Job model |
| **Pagination** | Jobs use keyset/cursor pagination (`take`, `cursor`, `pagination: { total, cursor }`); legacy `page`/`limit` remains on other list routes |
| **Timestamps** | `Date` objects in Prisma, serialized to ISO strings in JSON responses |
| **Validation** | Manual `if (!field)` checks, not Zod schemas (Zod is a dependency but unused in routes) |
| **Company ID** | Hardcoded `companyId: 1` for the Loft Community company throughout admin routes |
| **Notification creation** | Created inline in route handlers, not via a separate service |
| **Email sending** | Called inline in route handlers with `shouldSendEmail()` preference check |

---

## 16. Known Gaps

1. **No `/api/billing` routes**: The frontend expects billing-related endpoints (subscription management, customer portal, plan details) but only `POST /api/payment` (checkout creation) and `GET /api/payment` (list prices) exist. There are no routes for:
   - Managing existing subscriptions
   - Stripe Customer Portal
   - Webhook handling
   - Cancel/pause subscription
   - Invoice history

2. **Limited unit tests**: The backend has minimal test coverage with only `src/__tests__/health.test.ts` (2 tests) and `src/__tests__/jobs.test.ts` (7 tests). There is no test framework configured in `package.json` (no test script), though Jest tests exist. The E2E setup/teardown endpoints in `routes/test.ts` (dev-only) are separate infrastructure.

3. **`prisma db push` instead of migrations**: The `package.json` scripts use `prisma db push` which directly syncs the schema to the database without generating versioned migration files. This means no rollback capability and no migration history.

4. **`clerkId` naming legacy**: The `clerkId` field on `User` is a leftover from a prior Clerk authentication integration. Despite the name, Clerk is not used — the field serves as the primary user identifier with custom prefixes (`local_`, `oauth_`).

5. **No auth on payment endpoints**: `GET /api/payment` and `POST /api/payment` have no `requireAuth` middleware. Anyone can list prices and create checkout sessions.

6. **No webhook handler for Stripe**: Checkout sessions are created but there's no endpoint to receive Stripe webhooks to fulfill subscriptions.

7. **Admin route inconsistency**: Admin routes use a local `requireAdmin()` function within the route file rather than the reusable `requireAdmin()` in `lib/company.ts`. The local version checks `ADMIN_EMAILS` env while the lib version only checks company membership.

8. **Contact form has no rate limiting**: The `POST /api/contact` endpoint has no rate limiting, making it susceptible to email flooding.

9. **No password hashing verification on OAuth user creation**: OAuth users are created without a `hashedPassword`, which means `loginUser()` will return "Invalid email or password" for OAuth-created users attempting credential login.

10. **Stats routes are in-memory**: The visitor counter in `routes/stats.ts` resets on server restart and is not persisted.

11. **`/api/uploadthing` has no auth**: The UploadThing route handler doesn't verify authentication, though the middleware is a no-op and actual auth is handled by UploadThing's own system.

12. **Unused Zod dependency**: Zod is listed in `package.json` but is not used in any route for request validation. All validation is manual.

13. **`scripts/seed-json-jobs.ts` is stale**: The seed script still references `Job.slug` for dedup, which no longer exists after the canonical Job model convergence — it must be updated before reuse.
