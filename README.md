# Clinic / Patient booking

A persistent clinic appointment app with a Tiffany-blue interface, patient directory, visit history, controlled natural-language search, and an optional hosted assistant.

## Stack

- React 19 + Vinext, TypeScript; Shadcn/Radix UI primitives
- Cloudflare Workers API and D1 (SQLite), generated Drizzle migrations
- Zod request validation; prepared SQL; transactional writes
- Hosted Groq GPT-OSS 20B, or a configured OpenAI-compatible model endpoint

No model is needed for normal booking. The hosted version uses Quick search by default. Flexible model interpretation requires a server-side provider key. No local model runs or model download is needed. No API keys are included.

## Functional scope

- Clinic-issued HN stored as a string, normalized to uppercase; leading zeros preserved. HN lookup fills existing details automatically.
- New booking shows the essential fields first; arrival/status/doctor details expand when needed.
- Successful booking and edit paths use two D1 round trips. The confirmed server record appears immediately, before background schedule refresh.
- A patient can have many appointments. Booking never silently overwrites their identity.
- Booking time is the appointment time. Creation timestamps are stored separately.
- Arrival time, service text, follow-up flag, case tags, doctor-seen flag, status, and remarks belong to the visit.
- Half-hour slots, clinic hours and per-slot capacity configurable. Default: 10:00–16:00, one patient per slot.
- Transactional SQL guards enforce capacity and a partial unique index prevents duplicate active patient/time bookings.
- Cancelled visits stay in history; restoring rechecks availability.
- Optimistic version checks prevent lost updates. Request IDs protect creation retries.
- Append-only events record actor and changes. `/api/v1/events` supplies a cursor for future automation consumers.
- The table refreshes every 15 seconds and after changes. This is polling, not WebSocket push.
- Records survive refreshes and deployment updates. No patient data is kept in browser storage.

## Run

Requires Node 22.13+ (Node 24 recommended) and pnpm. Preserve `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Apply local migrations, once and in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_korg.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_booking_constraints.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_rich_siren.sql
pnpm dev
```

The hosted app relies on the Sites gateway to authenticate and restrict access. All API routes require `oai-authenticated-user-id` and `oai-authenticated-user-email`. Source checkouts using the portable profile have the starter's development sign-in; managed previews do not simulate auth. For independent hosting, replace this boundary with verified sessions from your identity provider. Never expose an origin that trusts arbitrary client-provided identity headers. `.openai/hosting.json` preserves this Site's identity; remove its `project_id` only when intentionally creating a separate new Site.

## Tests

```sh
pnpm exec tsc --noEmit
node scripts/test-assistant.mjs
node tests/backend.test.mjs
```

Backend tests use the actual route handlers and Miniflare D1 with the production migrations and a synthetic test identity. They cover anonymous and cross-origin rejection, persistence/read-back, conflicts and simultaneous creation, rollback, HN identity, retries, cancelled-slot restoration, version conflicts, audit events, and parameterized search. They do not contact a real clinic or a model endpoint.

## Model integration

**Recommended hosted setup: Groq.** Create a key at https://console.groq.com/keys, then set it as the server-side secret `GROQ_API_KEY`. The default model is `openai/gpt-oss-20b`; optionally set `GROQ_MODEL` to another compatible model. The app automatically switches its default search to the cloud assistant when configured. Never put a key in frontend code, a public repository, or browser storage.

For local development, put server variables in an ignored `.dev.vars` file; see `.env.example`. For the hosted Site, configure the runtime secret and redeploy to apply it.

```text
GROQ_API_KEY=your-secret-key
GROQ_MODEL=openai/gpt-oss-20b
```

Groq provides a rate-limited free plan. Current limits and paid pricing are in its official model and rate-limit documentation; account limits govern actual availability. This app neither signs up for paid service nor upgrades a plan automatically. A 429 response shows a usage-limit message, with Quick search/manual filters still available. No API key was supplied during this build, so live model inference has not been exercised.

The server sends only the search text, date context and filter schema to the model, never patient result rows. Search text may itself identify a patient; use synthetic records while evaluating and configure provider data controls before sending clinic information. Groq offers a Zero Data Retention setting. Model filters are validated and shown before results; schema validity does not establish correct interpretation.

For another provider, set `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, and `LLM_PROTOCOL=openai`. These override the Groq shortcut. Ollama native protocol remains supported for existing custom server integrations.

The assistant is search-only in this release. Booking changes use the explicit UI. Messages/reminders, external hospital integration, clinical diagnosis, and automated discharge are not connected.

## Code map

- `app/booking-app.tsx`: booking UI, filters, dialogs and patient history
- `app/globals.css`: Tiffany theme and responsive styling
- `app/api/v1/[...path]/route.ts`: HTTP/authentication boundary
- `lib/contracts.ts`: shared validation and filter contract
- `lib/service.ts`, `lib/guards.ts`: booking rules, transactional storage and prepared queries
- `lib/assistant.ts`: conservative Quick search + server model adapter
- `db/schema.ts`, `drizzle/`: schema and append-only migration history
- `docs/API.md`: integration endpoints and event contract

## Deployment boundary

The current private Site has one shared clinic dataset for its allowed users. Staff-specific roles and additional clinic tenants are not implemented. Keep the Site private; all allowed users currently have the same permissions. Configure organizational access, retention/backups, and identity-provider requirements before using real patient data. No assertion of hospital production approval is made.

## Primary implementation references

- https://console.groq.com/docs/model/openai/gpt-oss-20b
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/your-data
- https://docs.ollama.com/capabilities/structured-outputs
- https://docs.ollama.com/api/openai-compatibility
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://orm.drizzle.team/docs/get-started/d1-new
- https://zod.dev/

Third-party components retain their upstream licenses. Use the supplied lockfile rather than upgrading packages opportunistically.
