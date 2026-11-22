# GoHighLevel integration reference

Every endpoint, header, scope and webhook event below was checked against GHL's
official OpenAPI specs and docs in
[github.com/GoHighLevel/highlevel-api-docs](https://github.com/GoHighLevel/highlevel-api-docs)
(`apps/*.json`, `docs/oauth/*`, `docs/webhook events/*`, snapshot of June 2026).
Nothing here is guessed. If GHL changes something, update `src/lib/ghl/*` and this file together.

**The integration is read-only.** `src/lib/ghl/client.ts` exposes only `get()`; any other
method throws before a request is sent. The only POST to GHL is `/oauth/token`
(exchanging/refreshing *our own* tokens), which changes no CRM data.

## Base URL and headers

| | |
|---|---|
| Base URL | `https://services.leadconnectorhq.com` |
| Auth | `Authorization: Bearer <location access token>` |
| `Version` header | `2021-07-28` (contacts, opportunities, users, locations, payments) · `2021-04-15` (calendars) |

## Authentication options

| Option | How | Webhooks | Use when |
|---|---|---|---|
| **OAuth marketplace app** (recommended) | Create a *private* app in the GHL Marketplace developer portal, install it on each sub-account via **Integrations → Connect with GHL**. Authorise URL `https://marketplace.gohighlevel.com/v2/oauth/chooselocation`, token `POST /oauth/token` with `user_type=Location`. | Yes | Near-real-time updates |
| **Private Integration token** | Sub-account → Settings → Private Integrations → create token with the read scopes below. Put it in a server env var named `GHL_PIT_*`; enter only the *name* on the Integrations page. | No (marketplace webhooks require an app) | Quick start / fallback; data refreshes on each reconciliation run |

OAuth tokens expire (≈24 h, `expires_in`) and are refreshed automatically 5 minutes early
or on a 401. Refresh tokens are single-use, so refreshes are serialised per account.
Tokens are stored AES-256-GCM encrypted in `ghl_credentials`, which no browser session can read.

## Scopes (all read-only)

| Scope | Used for |
|---|---|
| `locations.readonly` | `GET /locations/{locationId}` — timezone, companyId |
| `users.readonly` | `GET /users/search?companyId=&locationId=` — sales reps |
| `opportunities.readonly` | `GET /opportunities/pipelines`, `GET /opportunities/search`, `GET /opportunities/{id}`; Opportunity* webhooks |
| `contacts.readonly` | `GET /contacts/{contactId}`; Contact* webhooks |
| `calendars.readonly` | `GET /calendars/` |
| `calendars/events.readonly` | `GET /calendars/events`; Appointment* webhooks |
| `conversations/message.readonly` | Inbound/OutboundMessage webhooks (call records) |
| `payments/transactions.readonly` | *Optional* — `GET /payments/transactions` for collected revenue (`GHL_SYNC_PAYMENTS=true`) |

## Endpoints used

| Endpoint | Version | Notes |
|---|---|---|
| `GET /locations/{locationId}` | 2021-07-28 | Verifies the token belongs to the expected location |
| `GET /users/search` | 2021-07-28 | `companyId` is required by the spec; paged with `skip`/`limit` |
| `GET /opportunities/pipelines?locationId=` | 2021-07-28 | Pipelines + stages |
| `GET /opportunities/search?location_id=&pipeline_id=&status=all&limit=100` | 2021-07-28 | Cursor paging with `meta.startAfter` + `meta.startAfterId`; response embeds a contact summary |
| `GET /opportunities/{id}` | 2021-07-28 | Hydrates webhook payloads (which lack `lastStatusChangeAt`/`lastStageChangeAt`) |
| `GET /contacts/{contactId}` | 2021-07-28 | Only for contacts referenced by opportunities and not yet fetched |
| `GET /calendars/?locationId=` | 2021-04-15 | |
| `GET /calendars/events?locationId=&calendarId=&startTime=&endTime=` | 2021-04-15 | Epoch ms; one of calendarId/userId/groupId required; queried in 31-day windows |
| `GET /payments/transactions?altId=&altType=location` | 2021-07-28 | Optional |

Deliberately **not** used: `GET /contacts/` and `GET /users/` (marked deprecated in the spec),
and `POST /contacts/search` (its request body is not described in the spec — contacts are
instead taken from opportunity search results + `GET /contacts/{id}`).

## Rate limits

Official: **100 requests / 10 s** and **200,000 / day** per app per location. The client paces
each location to ~8 req/s, pauses when `X-RateLimit-Remaining` ≤ 2, honours `Retry-After`, and
retries 429/5xx with exponential back-off + jitter (max 5 retries).

## Webhooks

Configure in the marketplace app: **Webhook URL** `https://<your-domain>/api/webhooks/ghl`,
and subscribe to these events:

| Event | Effect |
|---|---|
| `ContactCreate`, `ContactUpdate`, `ContactDelete` | Upsert / soft-delete contact |
| `OpportunityCreate`, `OpportunityUpdate`, `OpportunityStageUpdate`, `OpportunityStatusUpdate`, `OpportunityMonetaryValueUpdate`, `OpportunityAssignedToUpdate` | Hydrate via `GET /opportunities/{id}`, upsert, record stage transition, capture won/lost date |
| `OpportunityDelete` | Soft-delete |
| `AppointmentCreate`, `AppointmentUpdate` | Upsert appointment; a moved start time increments `reschedule_count` |
| `AppointmentDelete` | Soft-delete |
| `InboundMessage`, `OutboundMessage` | Only `messageType: "CALL"` → `call_activities` (duration, callStatus) |
| `AppInstall` / `AppUninstall` (payload `type` may be `INSTALL`/`UNINSTALL`) | Webhook status / mark account revoked and delete tokens |

**Verification** (`docs/oauth/WebhookAuthentication.md`): header `x-wh-signature` is an
RSA-SHA256 signature (base64) over the raw body, verified with GHL's published public key
(embedded in `src/lib/ghl/webhook.ts`; override with `GHL_WEBHOOK_PUBLIC_KEY` if GHL rotates it).
Requests with a missing/invalid signature get 401.

**Replay & duplicates:** payload `timestamp` must be within `GHL_WEBHOOK_MAX_AGE_SECONDS`
(default 300). Each event is stored in `webhook_events` with a UNIQUE `dedupe_key` (`webhookId`,
or SHA-256 of the body if absent) *before* processing, so a re-delivered event is acknowledged
as `duplicate` and never processed twice. All record writes are additionally upserts on
`(account_id, ghl_id)` with an `updatedAt` staleness guard, so even a replay that slipped
through could not create a duplicate lead or roll a record back.

**Failures:** a failed event is marked `failed` with `next_attempt_at` (1, 2, 4 … min, capped at
6 h) and retried by `/api/cron/retry-webhooks`; after 8 attempts it becomes `dead` and is
visible on the Integrations page. Scheduled reconciliation still repairs the data.

## Reconciliation

`/api/cron/reconcile` (every 15 min in `vercel.json`) re-reads each active account:
location → users → pipelines/stages → calendars → opportunities (sales pipelines) → missing
contacts → appointments (sales calendars, `appointment_lookback_days` back /
`appointment_lookahead_days` ahead, default 120/60) → optional payments. Stage changes it
discovers are stored as `reconcile_diff` transitions. Every run is logged in `sync_runs` /
`sync_logs`, and the account's `last_successful_sync_at` / `last_error` drive the health UI.

> Vercel Hobby only allows daily crons. On Hobby, change the schedule or trigger the endpoint
> from another scheduler with the `Authorization: Bearer $CRON_SECRET` header.

## Limitations — what GHL does not give us

| Need | Reality | How the app handles it |
|---|---|---|
| Historical stage changes | No API for an opportunity's stage history | Observed from webhooks/reconciliation from the day you connect. First-seen opportunities get one `snapshot` transition (current stage at `lastStageChangeAt`), labelled as reconstructed and excluded from time-in-stage averages. The Funnel page says so. |
| "Which call is this?" | Appointments have no call-number concept | Per-calendar mapping (Integrations) or the sequence rule (call N advances only after a completed call). |
| Call outcome | `appointmentStatus`: new, confirmed, cancelled, showed, noshow, invalid | Configurable mapping (Settings). Past `new`/`confirmed` = **Pending outcome**, never assumed completed. Managers can record an outcome in the dashboard (stored only in our DB). |
| "Rescheduled" | Not a GHL status | Detected when an existing appointment's start time changes (`reschedule_count`). |
| Appointment ↔ opportunity link | Appointments reference a contact only | Linked to the contact's most recent opportunity created on/before the appointment. |
| Won date | Only `lastStatusChangeAt` | Captured once when the status first becomes won (overwritten if re-opened). |
| Collected revenue | Opportunity value ≠ money received | Shown separately; sourced from GHL Payments transactions (succeeded, live, net of refunds) or manual receipts. Transactions reference a contact, so they are attributed to that contact's won lead. |
| Webhooks with Private Integration tokens | Not supported | Reconciliation only. |
| Historical data before first sync | Appointments outside the look-back window aren't fetched | Increase `appointment_lookback_days` per account for a one-off backfill. |
