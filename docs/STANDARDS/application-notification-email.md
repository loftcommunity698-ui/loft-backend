# STANDARD: Application Notification Email (MUST)

> Cross-project standard. Applies to **every** HireHub-family project (frontend, backend, and any
> future app that accepts applications or candidates). Copy this file into each project's
> `docs/STANDARDS/` and reference it from that repo's `AGENTS.md`. Do not weaken it; you may only
> extend sections marked *Project wiring*.

> **Proven reference implementations (the user's own production code):** loft-backend
> (`src/lib/email.ts`, `src/lib/email-html.ts`, `src/routes/jobs.ts:236-255`) implements the
> `new_applicant` apply-flow email end-to-end; kaireer-backend
> (`src/modules/email/{types,transport,email.service,render}.ts`) implements the `EmailProvider`/
> `EmailJSAdapter` abstraction. Port their patterns rather than reinventing. Deltas the standard
> intentionally adds beyond them: a new-application→employer email in every project (kaireer lacks
> it) and mandatory `validate_email.py` (neither runs it).

## Status

- **MUST** — mandatory. A feature that accepts an application/candidate is **not complete** until the
  application information email described here is delivered and proven.
- Supersedes any README/handoff language like "Email: send application to employer" that is not
  backed by implemented, tested, documented code. An aspiration is not a requirement; this standard is.

## 1. The rule

When a candidate submits an application, the application **must** be emailed in full to a specified
recipient, and the send **must** be proven to have succeeded.

> "Specified recipient" = a configured application-inbox address (env var, see §3) **or** the owner of
> the submitted-to job/listing (the natural employer contact). Wording may be adjusted per project
> (§5), but the delivery requirement never disappears.

## 2. Scope — where the rule fires

The rule fires on **every real application submission path** in the app:

- The canonical REST/mutation path that creates the application record as a result of a user action
  (e.g., frontend `ApplyJobForm` → `POST /applications` → backend `ApplicationsService.create`).
- Any future equivalent path (mobile client, admin-assisted apply, bulk import that represents a real
  submission) **must** also fire it.

The rule does **not** fire on:

- Demo/seed/bot data (backend `demo.seed.ts`, `demo-bot.ts`) — these create synthetic records
  directly through Prisma and must never generate real email.
- Test fixtures that create applications via Prisma directly.

**Enforcement:** a test asserts that dispositioning a real submission produces the email (mocked
delivery) AND a live send to the configured inbox is a manual/CI acceptance step (see §6). If a new
submission path is added without the email, that is a **merge-blocking** defect.

## 3. Recipient targeting (project wiring)

Priority order:

1. `APPLICATION_NOTIFY_EMAIL` — app-inbox override; wins when set.
2. Job/listing owner email — resolved from the record that owns the target (e.g.,
   `Application.job.employerId → User.email`).

No schema change is required for this standard; both targets already exist on the HireHub data model.
Recipient resolution must be deterministic and logged at `warn` when skipped.

## 4. Email content — MUST render the full application

Every application-notification email contains, at minimum:

| Field | Source |
|---|---|
| Candidate name / email / phone | Application record |
| Cover letter | Application record |
| Portfolio URL | `portfolioUrl` — safe link (https only) |
| Resume | hosted https URL or path resolved to an https URL |
| Screening answers (Q&A) | `ScreeningAnswer + question.prompt` when screening exists |
| Screening score | `ScreeningResult` when present |
| Job title / company / location | owning Job |

Rendering rules (from the `email-engineering` skill — all MUST):

- HTML-escape every user-supplied value; safe-link every URL.
- Tables-only 600px shell, inline CSS, zero `var()`, `bgcolor` pairing, bulletproof CTA.
- Dark-mode + Outlook `[data-ogsc]` support; hidden preheader.
- Brand logo as `<img class="email-logo">` with an absolute `https://` `src` (hosted, not data-URI in prod).
- Pass `scripts/validate_email.py` (exit 0) for every generated template.
- HTML < 102 KB; images < 200 KB.

## 5. Delivery semantics — MUST be proven, never silent

- Sends are **fire-and-forget** (`.catch(() => {})`) so a provider failure never fails the application
  submission itself — **but** a failure/skip **must** be logged:
  - provider error → `logger.error({ to, type, error }, 'Application email failed')`
  - no recipient resolved / no key configured → `logger.warn('Application email skipped', { to, reason })`
- "Successfully sent" is asserted by **both**:
  1. **Automated:** unit/trigger test mocks the provider and asserts `emails.send` called with rendered
     HTML containing applicant name, cover letter, and resume https URL.
  2. **Live:** with a real provider key and `APPLICATION_NOTIFY_EMAIL` set, a real submission lands in
     that inbox and is acknowledged.

## 6. Verification commands (project wiring)

```bash
# Run the email-QA gate on every rendered template
python3 /home/jacobp/.agents/skills/email-engineering/scripts/validate_email.py \
  --file out/application-email.html \
  --config /home/jacobp/.agents/skills/email-engineering/schemas/email-data/notification.json \
  --text out/application-email.txt

# Frontend gates
npm run lint && npm run test:run && npm run build

# Backend gates
npm run build && npm test
```

## 7. Acceptance criteria (definition of done)

- [ ] Every real submission path fires the application email (§2) — a missing path is a blocking bug.
- [ ] Full application payload rendered and escaped (§4).
- [ ] Sent to `APPLICATION_NOTIFY_EMAIL` or job owner (§3).
- [ ] Mock test asserts delivery; live send confirmed to the configured inbox (§5).
- [ ] Template passes `validate_email.py`; logo is hosted `<img class="email-logo">` (§4).
- [ ] This standard is present in `docs/STANDARDS/` and referenced from `AGENTS.md` of the repo.

## 8. Cross-project adherence

- This file (or a faithful copy) **must** be placed in every project that accepts applications.
- Each such repo's `AGENTS.md` **must** list this standard among its top-level rules so any coding
  agent/contributor is bound by it.
- When a new project is scaffolded, checklist its submission flow against §2–§7 before claiming parity.