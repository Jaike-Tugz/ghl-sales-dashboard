# GHL Multi-Account Sales Call Tracker

**Live:** https://ghl-sales-dashboard-omega.vercel.app (demo data until Supabase and GHL are connected)

A Next.js dashboard that consolidates up to N GoHighLevel sub-accounts (four to start) into one
sales-call reporting system: KPIs, call-based and pipeline-based funnels, a sales-calls table,
rep leaderboards, analytics, follow-up monitoring and sync health.

No n8n, Zapier or Make. GHL is read through its official API v2 and webhooks, and **nothing is
ever written back to GHL**.

```bash
npm install
npm run dev          # http://localhost:3000 — runs on labelled DEMO data until Supabase is configured
npm test             # 56 unit tests: metrics, timezones, sync idempotency, webhook signatures, crypto
npm run typecheck
```

| Doc | Contents |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Supabase, env vars, connecting the four sub-accounts, Vercel deployment |
| [docs/GHL_INTEGRATION.md](docs/GHL_INTEGRATION.md) | Verified endpoints, scopes, webhook events, rate limits, **limitations** |
| [docs/METRICS.md](docs/METRICS.md) | Every KPI formula, timezone/date-boundary rules, funnel and follow-up logic |
| [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md) | Integration test checklist for go-live |
| [.env.example](.env.example) | All environment variables |

## Architecture

```
GHL sub-accounts ──webhooks──▶ /api/webhooks/ghl ─┐  verify RSA sig → store (dedupe) → apply
       ▲                                          │
       └──read-only API◀── /api/cron/reconcile ───┤  every 15 min: re-read + upsert + diff
                           /api/cron/retry-webhooks  failed events, exponential back-off
                                                  ▼
                              Supabase Postgres (RLS)  ◀── service role (server only)
                                                  │
                    user session (anon key + RLS) ▼
         Next.js server components → metrics engine (pure TS) → pages, charts, CSV
```

| Layer | Where | Notes |
|---|---|---|
| UI | `src/app/(dashboard)/*`, `src/components/*` | Next 16 App Router, Tailwind v4, shadcn/ui, Recharts, Lucide. Global account + date filters live in the URL, so every page, chart and export agrees. |
| Metrics | `src/lib/metrics/` | Pure functions over a normalised `Dataset` — same code for demo and live data. |
| Data access | `src/lib/data/` | Live: reads via the **user's** Supabase session so RLS decides rows. Demo: deterministic generator that mirrors RLS for the admin/manager/rep personas. |
| Auth / RBAC | `src/proxy.ts`, `src/lib/auth/viewer.ts`, SQL policies | Supabase Auth; roles admin / manager / rep enforced in the database. |
| GHL | `src/lib/ghl/` | Read-only client (GET only), OAuth + private-integration tokens, webhook verification. |
| Sync | `src/lib/sync/` | Pure mappers (tested) + idempotent upserts, stage-transition capture, reconciliation. |
| Schema | `supabase/migrations/` | Tables, unique keys per location, RLS, column-level grants. `supabase/tests/rls_check.sql` proves isolation. |

### Database (summary)

| Table | Purpose / key constraint |
|---|---|
| `user_profiles`, `user_account_access` | Roles; manager ↔ account access |
| `ghl_accounts` | One row per sub-account; `location_id` UNIQUE; health fields |
| `ghl_credentials`, `oauth_states` | Encrypted tokens; RLS on with **no** policies (service role only) |
| `sales_reps` | GHL users; UNIQUE (account_id, ghl_user_id); `person_key` joins people across accounts; `user_id` links a login |
| `pipelines`, `pipeline_stages`, `calendars` | Synced reference data + dashboard mappings (sales pipeline, business stage, call number) |
| `contacts`, `opportunities`, `appointments`, `call_activities` | GHL records; UNIQUE (account_id, ghl_*_id); soft delete |
| `stage_transitions` | Observed/reconstructed stage history; UNIQUE (opportunity, to_stage, entered_at) |
| `revenue_receipts` | Collected money (GHL payments or manual), separate from opportunity value |
| `webhook_events` | Raw events; UNIQUE `dedupe_key`; status/attempts/next_attempt_at |
| `sync_runs`, `sync_logs` | Reconciliation history and errors |
| `app_settings`, `follow_up_rules` | Timezone, funnel stages, outcome mapping, thresholds |

### Roles

| | Admin | Manager | Sales rep |
|---|:-:|:-:|:-:|
| See accounts | all | assigned | those where they are a linked GHL user |
| See leads/calls | all | all in assigned accounts | only their own |
| Record call outcomes | ✓ | ✓ (own accounts) | — |
| Integrations page | ✓ edit | view | — |
| Settings & users | ✓ | view | view |

The first sign-up becomes admin; later sign-ups are inactive until an admin assigns them.

## Security notes

- GHL tokens never reach the browser: OAuth codes are exchanged server-side, tokens are
  AES-256-GCM encrypted, PIT tokens stay in env vars (only an env var *name* is stored, and
  only `GHL_PIT_*` names can be read).
- The browser only ever holds the Supabase anon key; every read is subject to RLS, and
  authenticated users can write only dashboard-owned columns (column-level grants).
- Webhooks: RSA signature, replay window, dedupe. Cron: bearer secret, constant-time compare.
- CSV exports neutralise spreadsheet formula injection.
