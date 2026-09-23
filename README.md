# Wansiri patient booking

A Tiffany-blue clinic booking application with persistent patient records, staff sign-in, visit history, and an optional Groq search assistant.

**Deploying on Vercel? Start with [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).** It walks through creating Supabase, initializing the database, adding your first administrator, and configuring Vercel.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Supabase Postgres with prepared queries and atomic transactions
- Supabase Auth with verified server sessions and a private staff allowlist
- Zod validation, Shadcn/Radix UI components
- Optional hosted Groq `openai/gpt-oss-20b`; no local model download

This branch replaces the earlier Vinext / Cloudflare-specific deployment. It uses `next build`, which produces Vercel's required `.next/routes-manifest.json`.

## Features

- Clinic-issued HN lookup and patient identity reuse; leading zeros preserved.
- Booking time, arrival time, HN, name, DOB, sex, service/follow-up, doctor-seen, status and remarks.
- Half-hour slots with configurable clinic hours and capacity.
- Booked → waiting → diagnosed → ready to go home; cancellation and no-show history.
- Atomic patient/booking/audit writes, concurrent capacity enforcement, duplicate-retry protection, and version checks against stale edits.
- Search, filters, patient visit history and an event feed for future integrations.
- Invite-only staff access. Staff manage patients and bookings; admins also manage clinic settings and fictional example loading.
- Staff account page, password changes and sign-out. Account creation/recovery is administrator-managed in Supabase.
- Read-only AI search maps language into validated filters. Booking does not require AI.

The schedule polls every 15 seconds. Successful saves immediately display the server-confirmed record. No patient data is persisted in browser storage.

## Run

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set the Supabase values described in docs/DEPLOYMENT.md.
pnpm db:migrate # once, if not already initialized in Supabase SQL Editor
pnpm dev
```

Node 24 recommended. Keep keys and database credentials out of GitHub. Never prefix server secrets with `NEXT_PUBLIC_`.

## Check

```bash
pnpm typecheck
node scripts/test-assistant.mjs
pnpm build
# Local disposable Postgres only (setup in deployment guide):
TEST_DATABASE_URL=postgres://postgres:test-only@127.0.0.1:55439/postgres pnpm test
```

Tests exercise Postgres booking rules and route behavior using synthetic data and a test identity. Hosted Supabase login and live Groq inference must be checked after your project credentials are configured; they are not claimed as verified here.

## Code map

- `app/booking-app.tsx`: booking interface
- `app/login/`, `app/account/`, `lib/auth.ts`, `proxy.ts`: staff sessions
- `app/api/v1/[...path]/route.ts`: API/authentication/role boundary
- `lib/contracts.ts`: input validation and shared types
- `lib/service.ts`, `lib/guards.ts`: booking rules and audit events
- `lib/postgres.ts`: transaction and prepared-query adapter
- `supabase/migrations/001_clinic.sql`: fresh Postgres schema
- `lib/assistant.ts`: hosted model adapter and deterministic Quick search
- `docs/API.md`: request and event contracts

## Scope

One shared clinic dataset; no public self-registration or multiple-clinic tenancy. This creates a new database and does not import records from the earlier demo. No reminder delivery, hospital-system integration, automated discharge, or clinical diagnosis is connected. Staff access and database protections are implemented; real-patient deployment still needs the clinic's operational review and backup/data-handling configuration.

Third-party components retain their upstream licenses.
