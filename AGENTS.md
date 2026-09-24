# AGENTS.md — Loft Backend (loft-api)

## Repository context

- Express 4 + TypeScript (strict) + Prisma 5 + PostgreSQL REST API. Package manager: bun.
- Server entry `src/index.ts` → `src/app.ts` mounts routes. Routes in `src/routes/`, shared lib in
  `src/lib/`, business logic in `src/services/`, env in `src/config/env.ts`.
- Scripts: `bun run dev` (tsx watch, reads `.env`), `bun run build` (tsc), `npm test` (vitest run).
- Sibling frontend: loft-frontend. Product-flow family repos: hirehub-frontend /
  hirehub-backend / kaireer.

## Mandatory standards (MUST follow)

1. **Application Notification Email** — `docs/STANDARDS/application-notification-email.md`.
   A real application submission must email the full application to the specified recipient and
   prove delivery. A submission path without that email is a **merge-blocking defect**.
   This repo already implements it (`src/lib/email.ts`, `src/lib/email-html.ts`,
   `src/routes/jobs.ts`): the `new_applicant` email goes to the job employer (pref-gated via
   `shouldSendEmail`) and to `SUPPORT_EMAIL`. Keep those invariants when touching the apply flow.
2. **Email engineering** — use the `email-engineering` skill
   (`/home/jacobp/.agents/skills/email-engineering/`): `EmailProvider` + `sendEmail({ type, recipient, data })`
   abstraction; providers are swappable leaf adapters; tables-only 600px inline-CSS HTML with
   `<img class="email-logo">` (absolute https src), dark-mode + Outlook support; never ship secrets
   in templates. This repo validates email HTML via Vitest `sharedHtmlAssertions`
   (`src/__tests__/email-html.test.ts`); the standard adds `scripts/validate_email.py` (exit 0) as
   the pre-send gate — run both.

## House style / working here

- SMTP is primary transport, EmailJS the fallback (`src/lib/email.ts`); Resend key is legacy/unused.
  App code depends only on `sendEmail({ type, recipient, data })` — do not import nodemailer/EmailJS
  outside `src/lib/email*.ts`.
- Env read centrally in `src/config/env.ts`; add items to `.env.example` (no BACKEND_ENV.md exists —
  keep vars documented in `.env.example`). Gitignored `.env` only. Never commit secrets;
  `render.yaml` declares secrets `sync:false`.
- No lint tooling in this repo; match surrounding style. Tests: `src/__tests__/` (email-html, health, jobs).
- Read `docs/STANDARDS/application-notification-email.md` before changing apply/email behavior.

## Proven cross-project implementations to port, not reinvent

- This repo IS the reference for the `new_applicant` apply-flow email. kaireer/backend
  `src/modules/email/{types,transport,email.service,render}.ts` is the `EmailProvider`/
  `EmailJSAdapter` abstraction to mirror where a provider swap is needed.
- Standards deltas to keep in mind: mandatory `validate_email.py`; `APPLICATION_NOTIFY_EMAIL`
  recipient override semantics (`SUPPORT_EMAIL` is this repo's equivalent).