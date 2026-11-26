# Metric definitions

Implemented in `src/lib/metrics/` (pure functions, unit-tested in `tests/metrics.test.ts`).
Tooltips in the UI use the same wording (`src/lib/metrics/definitions.ts`).

## Date boundaries and timezone

- The **reporting timezone** is set in Settings (IANA name, e.g. `Australia/Sydney`).
- A range `from → to` covers **[from 00:00, to + 1 day 00:00)** local time, converted to UTC
  instants. Both end dates are inclusive; DST is handled by re-resolving the offset.
- Weekly buckets start Monday; monthly buckets are calendar months, both in the reporting timezone.
- "Previous period" = the same number of days immediately before `from`.
- Point-in-time metrics (pipeline value, pending follow-ups) ignore the date range.

## Vocabulary — kept deliberately separate

| Event | Source | Never inferred from |
|---|---|---|
| **Lead created** | opportunity `createdAt` in a pipeline marked *sales pipeline* | contact creation |
| **Entered a pipeline stage** | stage transitions (webhook / reconcile diff / snapshot) | — |
| **Call scheduled** | appointment `dateAdded` (booking time) on a sales calendar | pipeline stage |
| **Call completed** | appointment `appointmentStatus = showed` (or manual override "completed") | pipeline stage, time passing |
| **Closed won** | opportunity status became `won` (`won_at`) | stage name |
| **Revenue received** | payment transactions / manual receipts | opportunity value |

## KPIs

| KPI | Formula |
|---|---|
| New leads | count(leads with `createdAt` in range) — per opportunity, not per contact |
| Nth calls scheduled | count(sales appointments with call number N and `bookedAt` in range), excl. `invalid`. A rebooking after a no-show counts again (it is another scheduled call). Falls back to start time if GHL gave no `dateAdded`. |
| Nth calls completed | count(appointments with call number N, outcome completed, `startTime` in range) |
| Closed deals | count(leads with status won and `wonAt` in range) |
| Lost opportunities | count(status lost — plus abandoned if enabled — with `lostAt` in range) |
| Win rate (overall conversion) | closed won ÷ (closed won + closed lost), both by close date in range |
| Lead-to-close | cohort: leads created in range that are now won ÷ leads created in range. Recent cohorts are naturally low because they haven't had time to close. |
| Pipeline value | Σ value of currently **open** opportunities (point-in-time) |
| Closed-won value | Σ value of deals won in range — **booked value, not collected** |
| Collected revenue | Σ receipts with `receivedAt` in range (GHL succeeded transactions net of refunds, or manual) |
| Pending follow-ups | open leads matching ≥ 1 enabled follow-up rule now |
| No-show rate | no-shows ÷ (completed + no-shows), appointments starting in range |

A rate with a zero denominator is shown as "—", never 0%.

## Call numbering and outcomes

- Only appointments on **sales calendars** count (Integrations → calendar mapping). Unmapped
  calendars are counted until mapped, so data is never silently dropped.
- Call number: the calendar's fixed number if mapped, else **1 + completed calls before it**
  for that lead. No-shows, cancellations and reschedules never inflate the count.
- Outcome mapping (Settings): `showed → Completed`, `noshow → No-show`, `cancelled → Cancelled`,
  `invalid → excluded`, `new/confirmed` → Scheduled (or Rescheduled if moved) until
  end time + grace (default 60 min), then **Pending outcome**.
- Manual outcomes (admins/managers on the Sales Calls page) override the mapping and are
  stored only in `appointments.outcome_override` — GHL is not modified.

## Funnel

Cohort = leads created in range. Two views:

1. **Completed calls** — reached stage N if call N was completed; Closed Won if status won.
   Avg time = mean days between consecutive completion timestamps (lead creation → call 1 → …
   → won), only for leads with both timestamps.
2. **Pipeline stages** — furthest mapped business stage entered (current stage or any
   transition). Lost leads never reach Closed Won. Time in stage uses **observed** transitions
   only; reconstructed snapshots are excluded and the page shows when tracking began.

Progression = step ÷ previous step. Drop-off = 1 − progression. Lead-to-close = won ÷ cohort.
The optional fourth business stage is enabled in Settings and appears in both views
(call 4 in the call view).

## Sales representatives

Reps are matched across sub-accounts by `person_key` (lower-cased email by default), so one
person = one row with the same definitions in every account.

| Metric | Formula |
|---|---|
| Leads assigned | leads created in range with `assignedTo` = rep |
| Calls scheduled / completed / no-shows | as the KPIs, attributed to the appointment's assigned user (fallback: the lead's rep) |
| 1→2 conversion | of the rep's cohort leads that completed call 1, share that completed call 2 |
| 2→3 conversion | of those that completed call 2, share that completed call 3 |
| Deals closed / won value | won in range |
| Collected | receipts in range for the rep's leads |
| Lead-to-close | cohort won ÷ cohort |
| Avg sales cycle | mean(`wonAt − createdAt`) days for deals won in range |

## Follow-up rules (monitoring only)

Evaluated now, for open leads, against thresholds in Settings. A lead with an upcoming
(scheduled/rescheduled) or pending-outcome appointment is not flagged for gaps.

| Rule | Fires when |
|---|---|
| New lead without a first call | no live appointment and lead age ≥ threshold |
| First call completed, no second | max completed = 1 and ≥ threshold days since call 1 |
| Second call completed, no third | max completed = 2 and ≥ threshold days since call 2 |
| Missed appointment, not rescheduled | latest appointment is no-show/cancelled, ≥ threshold days ago |
| Inactive | days since last activity (stage/status change, GHL `lastActionDate`, past appointment) ≥ threshold |

## Lead sources (UTM attribution)

Overview → **Lead sources** groups the leads created in the selected range by one dimension and
shows their outcomes as of now. It opens on **UTM medium**. Implemented in `src/lib/metrics/sources.ts`.

| Dimension | Value used |
|---|---|
| Source | contact `source` in GHL (e.g. "Facebook - EVO ICL V2"), else the opportunity source |
| UTM source / medium / campaign / content | contact attribution: first touch, falling back to last touch per field. Campaign falls back to GHL's own `campaign` field |
| Channel | GHL `sessionSource` (e.g. "Paid Social"), else `medium` (e.g. "facebook") |
| Lead form | opportunity `source` (e.g. "FB Form") |

| Column | Formula |
|---|---|
| Leads | leads created in range with that value; blank values are grouped as "(not set)" |
| Booked | those leads with at least one appointment that is not cancelled or invalid |
| Booked rate | booked ÷ leads |
| Won | status won |
| Lost | status lost/abandoned, or currently in a lost-looking stage (e.g. "Not Interested (Lost)") |

Attribution comes from `GET /contacts/{id}` (`attributionSource`, `lastAttributionSource`) and is
stored on `contacts` by migration `20261125000001_contact_attribution.sql`. The reconcile job
refetches each existing contact once to backfill it. UTMs are only present when the lead's
form or ad link carried them, so the card shows how many leads have the chosen field set.

## Lead journey and Needs attention (Overview)

Implemented in `src/lib/metrics/journey.ts` and `attention.ts`. Clinic pipelines record outcomes
in stage names, so both read the lead's **current GHL stage name** plus its appointments.

| Step | A lead counts when… |
|---|---|
| Contacted | its stage is not "New Lead"/"No Answer", or it is booked, or it is in a lost-looking stage |
| Booked | it has a non-cancelled appointment, or its stage is mapped past New Lead |
| Showed | its stage name says "Show" (not "No Show"), an appointment is marked showed, or it is past the first call |
| Last step | status won, or a stage mapped to Closing (named after that stage, e.g. "Booked Surgery") |

Steps are cumulative. Show rate = showed ÷ (showed + no-shows). The cohort is leads created in range.

**Needs attention** lists open, non-lost leads with one reason each, most urgent first:
appointment in the next 2 days; New Lead / No Answer for 2–30 days; No Show for 2–30 days with nothing
rebooked; showed 7–45 days ago with no next appointment. Older leads are treated as stale.
