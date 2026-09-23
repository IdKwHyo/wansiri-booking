# Deploy on Vercel with Supabase

This version uses standard Next.js, Supabase Postgres, and Supabase Auth. The earlier ChatGPT Sites / Cloudflare version cannot be deployed unchanged to Vercel. This migration starts a new empty clinic; it does not import records from the hosted demo.

## 1. Create Supabase

1. Go to https://supabase.com/dashboard and create a project. Choose Singapore to keep it close to the Vercel function region configured in `vercel.json`.
2. Save your database password in your password manager.
3. Open **SQL Editor**, create a query, paste the complete contents of `supabase/migrations/001_clinic.sql`, and run it **once**. It creates the private `clinic` schema and its tables. Do not add this schema to the Data API's exposed schemas.
4. In **Authentication → Sign In / Providers**, disable **Allow new users to sign up**. Email/password sign-in remains enabled. Do not enable anonymous sign-ins.

## 2. Create your first administrator

1. In **Authentication → Users → Add user → Create new user**, enter your own email and a strong, unique temporary password. Select **Auto Confirm User**. This manual account creation does not require an email delivery service.
2. In SQL Editor, run the following, replacing the email with the exact email you just created:

```sql
INSERT INTO clinic.staff (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE lower(email) = lower('YOUR_EMAIL_HERE')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', active = true;
```

3. Confirm that an account was enabled:

```sql
SELECT u.email, s.role, s.active
FROM clinic.staff s JOIN auth.users u ON u.id=s.user_id;
```

Only approved, active staff can open records. Creating an Auth user alone does not grant clinic access. Never edit the migration to contain passwords.

For another team member, create their Auth account, then run the same INSERT with `'staff'` instead of `'admin'`. Share temporary credentials privately; they can change their password at **My account**. Staff can manage bookings and patient details. Only admins can change clinic settings or load fictional examples. Account provisioning is managed in Supabase, not through a public registration page.

To revoke access:

```sql
UPDATE clinic.staff SET active=false
WHERE user_id=(SELECT id FROM auth.users WHERE lower(email)=lower('STAFF_EMAIL_HERE'));
```

The next API request checks the staff list again. Password resets are administrator-assisted through Supabase; automatic recovery emails and invite emails are not configured by this app. If you enable those later, configure SMTP and a verified recovery flow first.

## 3. Add Vercel environment variables

Get the project URL and **publishable** key from Supabase's **Connect** dialog. Get the database connection string from **Connect → Transaction pooler** (port **6543**). Replace `[YOUR-PASSWORD]` with your database password. URL-encode special characters in the password. Keep `sslmode=require` if supplied.

| Variable | Value | Visibility |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` | Public project identifier |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your `sb_publishable_...` key | Public key; not a service-role key |
| `DATABASE_URL` | Supabase transaction-pooler connection string with password | Server-only secret |
| `GROQ_API_KEY` | Your existing Groq key | Server-only secret |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Model identifier |

No Supabase service-role key is needed. The database connection stays on the server. Keep unused `LLM_*` variables unset; they override Groq when configured.

For the first deployment, set these variables for **Production**. A Preview deployment requires its own configured database/auth project; use a separate Supabase project if you want previews to have independent data. Do not automatically attach production database credentials to untrusted PR previews. Missing configuration fails closed.

## 4. Deploy the corrected branch

Merge the `fix/vercel-supabase` pull request into the branch Vercel deploys, then deploy that commit.

Vercel project settings:

- Framework preset: **Next.js**.
- Root directory: repository root (leave blank).
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm build`.
- Output directory: **leave the override OFF** (Next.js default).
- Node.js: **24.x**.

Remove any old override containing Vinext, Wrangler, `dist`, or a custom output directory. Do not manually create `.next/routes-manifest.json`; `next build` generates it.

Open the deployed site, sign in with your admin account, and change the temporary password under **My account**. Create a fictional booking, refresh the page, edit it, and check that another approved staff account sees it. Normal booking works without a model key. If Groq is configured, test a plain-language search too.

## Local development

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill in your development Supabase values in .env.local.
# If you did not run the migration in SQL Editor:
pnpm db:migrate
pnpm dev
```

Run migrations once per database. The migration command refuses to overwrite an existing `clinic` schema. Do not commit `.env.local`.

## Verification

```bash
pnpm typecheck
node scripts/test-assistant.mjs
pnpm build
```

Database integration tests use a **disposable local Postgres instance**, not your Supabase project. They create and drop a uniquely named test database. For example:

```bash
docker run --rm --name booking-test-db -e POSTGRES_PASSWORD=test-only -p 55439:5432 -d postgres:17
TEST_DATABASE_URL=postgres://postgres:test-only@127.0.0.1:55439/postgres pnpm test
docker stop booking-test-db
```

The test user needs permission to create databases and the synthetic `anon` / `authenticated` roles. Tests cover real Postgres transactions, permissions, conflicts and simultaneous writers. Route tests inject a synthetic verified identity; they do not replace authentication in the application or test Supabase's hosted sign-in service. Test a real staff sign-in after configuring your project.

## Deployment design

- API requests verify the Supabase user via `auth.getUser()` and recheck `clinic.staff` on every request.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production. Next.js handles same-origin protections for auth server actions; API writes also enforce same-origin JSON requests.
- The private schema has RLS enabled and no grants/policies for browser roles. Database access happens in server code after authorization. Treat the database connection string as a privileged secret.
- Postgres transactions and an advisory lock serialize clinic writes, so capacity checks and settings changes cannot race across Vercel instances. This favors correctness for a single clinic; it is not a multi-tenant scheduling architecture.
- Audits store the verified Auth user ID. The UI never chooses the audit actor.
- No model can modify records. Only query text/schema/date context is sent to Groq; the text can itself contain identifiers. Use fictional data while checking the deployment and establish your clinic's data-handling requirements before real use.

Primary references:
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres-js
- https://supabase.com/docs/guides/database/connecting-to-postgres

### Database certificate verification

The app and migration script bundle the public Supabase Root 2021 CA in
`supabase/database-tls.mjs`. Supabase pooler and direct database connections trust
this CA alongside Node's public roots, with certificate and hostname verification
enabled. No additional Vercel environment variable or certificate upload is needed.
Other remote database hosts use Node's default trust store. Local test databases
retain their existing non-TLS connection.

If Supabase rotates its CA, replace the bundled public certificate with the download
from Database Settings → SSL Configuration and redeploy. The current certificate
expires on 26 April 2031. Never disable certificate verification to work around a
trust error.
