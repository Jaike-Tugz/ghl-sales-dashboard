# Integration testing checklist

Automated (run before every deploy):

- [ ] `npm test` — 56 unit tests: KPI formulas, funnels, call numbering, follow-ups, account
      isolation in the metrics layer, timezone/DST boundaries, webhook RSA verification,
      dedupe/replay, stale-update guard, reschedule counting, stage transitions, read-only
      client, retry on 429, CSV escaping, token encryption.
- [ ] `npm run typecheck` and `npm run build`.
- [ ] `supabase/tests/rls_check.sql` in the SQL Editor → `RLS CHECK PASSED`.

Manual, against a real GHL sub-account (use a test sub-account first if you have one):

## Authentication
- [ ] First sign-up becomes admin; a second sign-up lands on "awaiting approval" and sees no data.
- [ ] Signed-out visit to `/` redirects to `/login`.
- [ ] OAuth: Connect → choose the matching sub-account → card shows *Connected* with scopes.
- [ ] OAuth: choosing the wrong sub-account is rejected with a clear message.
- [ ] Token refresh: set `ghl_credentials.expires_at` to the past (SQL) → Sync now still succeeds and `expires_at` moves forward.
- [ ] PIT: card shows the env var as ✓ set; removing it shows ✗ missing and sync fails with a clear error.
- [ ] `select * from ghl_credentials` as an authenticated user fails; stored tokens start with `v1.`.

## Webhooks
- [ ] Create an opportunity in GHL → appears within seconds; `webhook_events` row `processed`.
- [ ] Move its stage → a `webhook` row in `stage_transitions`; the Calls page does **not** show a completed call.
- [ ] Book an appointment, mark it *Showed* in GHL → First call completed increments.
- [ ] Reschedule an appointment → outcome shows *Rescheduled*, `reschedule_count = 1`.
- [ ] Mark an opportunity Won → Closed deals and Closed-won value update; Collected revenue does not.
- [ ] POST to `/api/webhooks/ghl` with a bad/missing `x-wh-signature` → 401, nothing stored.
- [ ] Re-send an identical signed payload → response `duplicate`, no second row, no change.
- [ ] Payload with a timestamp older than 5 minutes → 400.
- [ ] Webhook from an unknown location → stored as `ignored`.
- [ ] Force a processing failure (e.g. temporarily revoke a mapping) → `failed` then retried by `/api/cron/retry-webhooks`.

## Reconciliation & duplicates
- [ ] Run Sync now twice in a row → second run reports only `updated`/`unchanged`; row counts identical.
- [ ] Disable webhooks, change data in GHL, run reconcile → changes appear; stage change recorded as `reconcile_diff`.
- [ ] `curl /api/cron/reconcile` without the bearer secret → 401.
- [ ] Two accounts containing records with identical GHL ids never overwrite each other (covered in rls_check.sql).
- [ ] Rate limits: a full sync of the largest account completes without 429 failures (check `sync_runs.counts.api_requests`).

## Account isolation & roles
- [ ] Manager assigned to Account 1 sees only Account 1 in the selector, pages and CSVs.
- [ ] Rep linked to their GHL user sees only their own leads/calls, including via CSV export URLs.
- [ ] Manager cannot see Integrations edit controls or Settings → Users; rep cannot open `/integrations`.
- [ ] Changing `?account=` to an account the user cannot see falls back to their visible accounts.

## Metric accuracy (spot-check against GHL)
- [ ] For one account and one week, count opportunities created in GHL's pipeline view = New leads.
- [ ] Count appointments with status Showed on the sales calendars = calls completed (sum of 1st/2nd/3rd + any 4th).
- [ ] Count Won in GHL for the month = Closed deals; Σ value = Closed-won value.
- [ ] Set the reporting timezone to a non-UTC zone; an appointment at 23:30 local lands on the correct local day.
- [ ] Record a manual outcome on a "Pending outcome" call → KPI updates; GHL appointment unchanged.
- [ ] Follow-ups: lower a threshold in Settings → matching leads appear; raise it → they disappear.

## UI
- [ ] Every page renders at 390 px (phone), 768 px and 1440 px without horizontal page scroll.
- [ ] Light and dark mode readable; charts keep legends; empty states appear for an empty range.
- [ ] CSV exports open in Excel/Sheets with correct columns and respect current filters.
