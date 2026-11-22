# Setup, connecting the four sub-accounts, and deployment

## 1. Local development (demo data)

```bash
npm install
npm run dev
```

With no Supabase variables, the app runs on **generated demo data** with a banner on every
page. Use the user menu (top right) to view as an admin, a manager (Accounts 1–2) or a rep.

## 2. Supabase

Use a **new, dedicated Supabase project** (not one shared with another app — this schema has its own
`user_profiles` and auth trigger).

1. Create the project. Note the Project URL, `anon` key and `service_role` key
   (Project Settings → API).
2. Apply the schema — either:
   - `supabase link --project-ref <ref>` then `supabase db push`, or
   - SQL Editor → paste `supabase/migrations/20261122000001_sales_dashboard_schema.sql` → Run.
3. Run `supabase/tests/rls_check.sql` in the SQL Editor. It must end with
   `RLS CHECK PASSED` (it rolls itself back).
4. Authentication → URL Configuration: set Site URL to your deployment URL and add
   `https://<domain>/auth/callback` to redirect URLs.

## 3. Environment variables

Copy `.env.example` to `.env.local` (dev) and fill in. Generate secrets with:

```bash
openssl rand -base64 32
```

```bash
openssl rand -hex 32
```

The first is `CREDENTIALS_ENCRYPTION_KEY`, the second `CRON_SECRET`. Never put any of these in a
form, a commit or a chat — only in `.env.local` / Vercel environment variables.

Start the app, open `/login`, choose **Sign up**. **The first account becomes the admin.**

## 4. Connecting the four GHL sub-accounts

### Recommended: one private OAuth marketplace app (gives webhooks)

1. GHL Marketplace developer portal → **Create app** → *Private* app, distribution *Sub-account*.
2. **Scopes** — tick exactly the read-only scopes in
   [GHL_INTEGRATION.md](GHL_INTEGRATION.md#scopes-all-read-only).
3. **Redirect URL**: `https://<your-domain>/api/ghl/oauth/callback`
   (for local testing, `http://localhost:3000/api/ghl/oauth/callback`).
4. **Webhook URL**: `https://<your-domain>/api/webhooks/ghl` and subscribe to the events listed
   in GHL_INTEGRATION.md. (Webhooks need a public HTTPS URL — use the Vercel deployment.)
5. Create a client ID/secret → set `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, and `APP_URL`
   in the environment. Redeploy.
6. In the dashboard → **Integrations → Add a sub-account** for each of the four:
   name + **Location ID** (GHL sub-account → Settings → Business Profile, or the
   `/location/<id>/` part of the URL), auth = *OAuth*.
7. Click **Connect with GHL** on each card, pick that sub-account, approve. The callback rejects
   the token if you pick a different location than the card's.
8. Click **Sync now** on each card. Pipelines, stages, calendars and users load.
9. **Map each account** (same card):
   - tick the pipeline(s) that are *sales pipelines*;
   - map each GHL stage to a business stage (New Lead, First/Second/Third Sales Call,
     Fourth Stage, Closing/Won) — leave non-sales stages unmapped;
   - tick the sales calendars and, if a calendar is used for a specific call
     (e.g. "Discovery Call" = call 1), set its call number; otherwise leave *By sequence*.
   - **Save mappings**, then **Sync now** again so only sales pipelines are pulled.
10. Settings → set the **reporting timezone**, funnel labels (enable the fourth stage if
    needed), outcome mapping and follow-up thresholds.
11. Settings → Users: when teammates sign up, activate them, set role, tick manager accounts,
    and link reps to their GHL user identities (one person may be linked in several accounts).

### Alternative: Private Integration tokens (no webhooks)

1. In each sub-account: Settings → Private Integrations → create a token with the read scopes.
2. Add it to the server environment as `GHL_PIT_ACCOUNT_1` … `GHL_PIT_ACCOUNT_4` (Vercel →
   Settings → Environment Variables) and redeploy.
3. Integrations → Add sub-account with auth *Private integration token* and the env var
   **name** (e.g. `GHL_PIT_ACCOUNT_1`). The card shows whether the variable is present.
4. Sync, then map as above. These accounts refresh on every reconciliation run only.

You can mix both: the architecture has no fixed account count — add a fifth row whenever needed.

## 5. Deploying to Vercel

1. Import the `ghl-sales-dashboard` repo in Vercel (vercel.com/new). Leave Root Directory
   empty; the framework preset is detected as Next.js. It deploys and runs on demo data
   with no environment variables, so you can do this first and add variables later.
2. Add every variable from `.env.example` for Production (and Preview if wanted).
   `APP_URL` = the production URL.
3. Deploy. `vercel.json` registers two crons:
   - `/api/cron/reconcile` every 15 min (`maxDuration` 300 s),
   - `/api/cron/retry-webhooks` every 5 min.
   Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
   **Hobby plans only run crons daily** — use Pro, or call the endpoints from another
   scheduler with that header.
4. Update the GHL app's redirect and webhook URLs to the production domain.
5. Check `/api/health` returns `{"ok":true,"dataSource":"supabase"}`, then work through
   [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md).

### Production environment variables

| Variable | Required | Notes |
|---|:-:|---|
| `APP_URL` | ✓ | Public base URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | Public by design (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Server only. Never prefix with `NEXT_PUBLIC_` |
| `CREDENTIALS_ENCRYPTION_KEY` | ✓ | 32 bytes base64. Rotating it requires reconnecting OAuth accounts |
| `CRON_SECRET` | ✓ | |
| `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET` | OAuth | |
| `GHL_PIT_*` | PIT | One per account using private integration |
| `GHL_OAUTH_SCOPES` | – | Defaults to the documented read-only set |
| `GHL_SYNC_PAYMENTS` | – | `true` to import collected revenue from GHL Payments |
| `GHL_WEBHOOK_PUBLIC_KEY`, `GHL_WEBHOOK_MAX_AGE_SECONDS` | – | Only if GHL rotates its key / to tune replay window |
| `REPORTING_TIMEZONE`, `NEXT_PUBLIC_CURRENCY` | – | Defaults; timezone is then editable in Settings |
