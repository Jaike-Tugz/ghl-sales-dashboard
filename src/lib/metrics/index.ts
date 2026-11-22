/**
 * The metrics engine. Every formula here is documented in docs/METRICS.md —
 * keep the two in step. All functions are pure: same dataset + settings + now
 * in, same numbers out, which is what makes them testable.
 */
import { BUSINESS_STAGE_ORDER, stageLabel } from "../settings-defaults";
import {
  bucketKey,
  bucketsBetween,
  daysBetween,
  inRange,
  localDate,
  rangeFromDates,
  type Range,
} from "../time";
import type {
  AppSettings,
  BusinessStageKey,
  CallOutcome,
  Dataset,
  Filters,
  FollowUpRuleKey,
  Lead,
  SalesRep,
} from "../types";
import { enrichAppointments, summariseByLead, type EnrichedAppointment, type LeadCallSummary } from "./calls";

export * from "./calls";

export interface MetricContext {
  ds: Dataset;
  settings: AppSettings;
  filters: Filters;
  now: number;
  range: Range;
  appts: EnrichedAppointment[];
  byLead: Map<string, LeadCallSummary>;
  leadsById: Map<string, Lead>;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** Restrict a dataset to the selected account and (optionally) rep. */
export function applyScope(ds: Dataset, filters: Pick<Filters, "accountId" | "repId">): Dataset {
  const acc = filters.accountId;
  const byAcc = <T extends { accountId: string }>(rows: T[]) => (acc === "all" ? rows : rows.filter((r) => r.accountId === acc));
  let leads = byAcc(ds.leads);
  let appointments = byAcc(ds.appointments);
  if (filters.repId) {
    const repIds = repIdsForSelection(ds.reps, filters.repId);
    leads = leads.filter((l) => l.repId && repIds.has(l.repId));
    const leadIds = new Set(leads.map((l) => l.id));
    appointments = appointments.filter((a) => (a.repId && repIds.has(a.repId)) || (a.leadId && leadIds.has(a.leadId)));
  }
  const leadIds = new Set(leads.map((l) => l.id));
  return {
    ...ds,
    accounts: acc === "all" ? ds.accounts : ds.accounts.filter((a) => a.id === acc),
    reps: byAcc(ds.reps),
    pipelines: byAcc(ds.pipelines),
    stages: byAcc(ds.stages),
    calendars: byAcc(ds.calendars),
    leads,
    appointments,
    transitions: byAcc(ds.transitions).filter((t) => leadIds.has(t.leadId)),
    receipts: byAcc(ds.receipts).filter((r) => !filters.repId || (r.leadId && leadIds.has(r.leadId))),
    callActivities: byAcc(ds.callActivities),
  };
}

/** A rep selection may be a rep row id or a cross-account person key ("person:<key>"). */
export function repIdsForSelection(reps: SalesRep[], selection: string): Set<string> {
  if (selection.startsWith("person:")) {
    const key = selection.slice(7);
    return new Set(reps.filter((r) => r.personKey === key).map((r) => r.id));
  }
  return new Set([selection]);
}

export function buildContext(ds: Dataset, settings: AppSettings, filters: Filters, now = Date.now()): MetricContext {
  const scoped = applyScope(ds, filters);
  const appts = enrichAppointments(scoped, settings, now);
  return {
    ds: scoped,
    settings,
    filters,
    now,
    range: rangeFromDates(filters.from, filters.to, settings.reportingTimezone),
    appts,
    byLead: summariseByLead(appts, now),
    leadsById: new Map(scoped.leads.map((l) => [l.id, l])),
  };
}

export const isLost = (l: Lead, s: AppSettings) => l.status === "lost" || (s.abandonedCountsAsLost && l.status === "abandoned");

const countedAppts = (ctx: MetricContext) => ctx.appts.filter((a) => !a.excluded && a.isSalesCall);

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export interface Kpis {
  newLeads: number;
  callsScheduled: Record<1 | 2 | 3, number>;
  callsCompleted: Record<1 | 2 | 3, number>;
  closedDeals: number;
  lostOpportunities: number;
  winRate: number | null;
  leadToClose: number | null;
  leadToCloseCohortSize: number;
  pipelineValue: number;
  closedWonValue: number;
  collectedRevenue: number;
  pendingFollowUps: number;
  noShowRate: number | null;
  noShows: number;
  pendingOutcomes: number;
}

export function computeKpis(ctx: MetricContext): Kpis {
  const { ds, range, settings } = ctx;
  const cohort = ds.leads.filter((l) => inRange(l.createdAt, range));
  const appts = countedAppts(ctx);
  const scheduled = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  const completed = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  let showed = 0;
  let noShows = 0;
  let pending = 0;
  for (const a of appts) {
    const n = a.callNumber as 1 | 2 | 3;
    if (n >= 1 && n <= 3 && inRange(a.bookedAt ?? a.startTime, range)) scheduled[n]++;
    if (inRange(a.startTime, range)) {
      if (a.outcome === "completed") {
        showed++;
        if (n >= 1 && n <= 3) completed[n]++;
      } else if (a.outcome === "no_show") noShows++;
      else if (a.outcome === "pending_outcome") pending++;
    }
  }
  const won = ds.leads.filter((l) => l.status === "won" && inRange(l.wonAt, range));
  const lost = ds.leads.filter((l) => isLost(l, settings) && inRange(l.lostAt, range));
  const receipts = ds.receipts.filter((r) => inRange(r.receivedAt, range));
  return {
    newLeads: cohort.length,
    callsScheduled: scheduled,
    callsCompleted: completed,
    closedDeals: won.length,
    lostOpportunities: lost.length,
    winRate: ratio(won.length, won.length + lost.length),
    leadToClose: ratio(cohort.filter((l) => l.status === "won").length, cohort.length),
    leadToCloseCohortSize: cohort.length,
    pipelineValue: ds.leads.filter((l) => l.status === "open").reduce((s, l) => s + l.monetaryValue, 0),
    closedWonValue: won.reduce((s, l) => s + l.monetaryValue, 0),
    collectedRevenue: receipts.reduce((s, r) => s + r.amount, 0),
    pendingFollowUps: computeFollowUps(ctx).length,
    noShowRate: ratio(noShows, showed + noShows),
    noShows,
    pendingOutcomes: pending,
  };
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------
export interface FunnelStep {
  key: BusinessStageKey;
  label: string;
  count: number;
  /** Share of the previous step that reached this one. */
  progression: number | null;
  dropOff: number | null;
  /** Share of the cohort (step 1) that reached this one. */
  ofCohort: number | null;
  avgDaysInPrevious: number | null;
  avgDaysSample: number;
}

export interface FunnelResult {
  basis: "calls" | "pipeline";
  cohortSize: number;
  steps: FunnelStep[];
  lost: number;
  open: number;
  leadToClose: number | null;
  /** True when part of the stage history is reconstructed rather than observed. */
  historyPartial: boolean;
  historyTrackedSince: string | null;
}

function enabledStages(settings: AppSettings) {
  return settings.funnelStages
    .filter((s) => s.enabled)
    .sort((a, b) => a.position - b.position)
    .map((s) => s.key);
}

const CALL_STAGE_NUMBER: Partial<Record<BusinessStageKey, number>> = {
  first_call: 1,
  second_call: 2,
  third_call: 3,
  fourth_stage: 4,
};

/**
 * Call-based funnel over the cohort of leads created in range. A lead has
 * "reached" a call stage only when that call number was actually completed
 * (appointment showed or manually marked completed). "Closing" = won.
 * Average time between steps uses completion timestamps, so it is always
 * computable from appointment data.
 */
export function computeCallFunnel(ctx: MetricContext): FunnelResult {
  const stages = enabledStages(ctx.settings);
  const cohort = ctx.ds.leads.filter((l) => inRange(l.createdAt, ctx.range));
  const reachedAt = (l: Lead, key: BusinessStageKey): string | null => {
    if (key === "new_lead") return l.createdAt;
    if (key === "closing") return l.status === "won" ? l.wonAt : null;
    const n = CALL_STAGE_NUMBER[key];
    const s = ctx.byLead.get(l.id);
    if (!n || !s || s.maxCompleted < n) return null;
    return s.completedAt.get(n) ?? null;
  };
  const steps = buildSteps(ctx.settings, stages, cohort, (l, k) => {
    const n = CALL_STAGE_NUMBER[k];
    if (k === "closing") return l.status === "won";
    if (k === "new_lead") return true;
    return (ctx.byLead.get(l.id)?.maxCompleted ?? 0) >= (n ?? Infinity);
  }, reachedAt);
  return finishFunnel("calls", ctx, cohort, steps, false);
}

/**
 * Pipeline-based funnel: the furthest mapped business stage each cohort lead
 * has entered (current stage or any recorded transition). Entering a pipeline
 * stage is NOT treated as a completed call. Time-in-stage uses only observed
 * transitions (webhook / reconcile diff), never reconstructed snapshots.
 */
export function computePipelineFunnel(ctx: MetricContext): FunnelResult {
  const stages = enabledStages(ctx.settings);
  const order = new Map(BUSINESS_STAGE_ORDER.map((k, i) => [k, i]));
  const cohort = ctx.ds.leads.filter((l) => inRange(l.createdAt, ctx.range));
  const transByLead = new Map<string, typeof ctx.ds.transitions>();
  for (const t of ctx.ds.transitions) {
    const list = transByLead.get(t.leadId);
    if (list) list.push(t);
    else transByLead.set(t.leadId, [t]);
  }
  for (const list of transByLead.values()) list.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));

  const furthest = new Map<string, number>();
  for (const l of cohort) {
    let max = order.get(l.businessStage ?? "new_lead") ?? 0;
    for (const t of transByLead.get(l.id) ?? []) if (t.toStageKey) max = Math.max(max, order.get(t.toStageKey) ?? 0);
    // "Closing" in the funnel means Closed Won; a lost lead never reaches it.
    if (l.status === "won") max = order.get("closing")!;
    else max = Math.min(max, order.get("closing")! - 1);
    furthest.set(l.id, max);
  }
  const observedEntry = (l: Lead, key: BusinessStageKey): string | null => {
    if (key === "new_lead") return l.createdAt;
    if (key === "closing") return l.status === "won" ? l.wonAt : null;
    const t = (transByLead.get(l.id) ?? []).find((x) => x.toStageKey === key && x.source !== "snapshot");
    return t?.enteredAt ?? null;
  };
  const steps = buildSteps(
    ctx.settings,
    stages,
    cohort,
    (l, k) => (furthest.get(l.id) ?? 0) >= (order.get(k) ?? 0),
    observedEntry,
  );
  const partial = ctx.ds.transitions.some((t) => t.source === "snapshot");
  return finishFunnel("pipeline", ctx, cohort, steps, partial);
}

function buildSteps(
  settings: AppSettings,
  stages: BusinessStageKey[],
  cohort: Lead[],
  reached: (l: Lead, k: BusinessStageKey) => boolean,
  reachedAt: (l: Lead, k: BusinessStageKey) => string | null,
): FunnelStep[] {
  const steps: FunnelStep[] = [];
  stages.forEach((key, i) => {
    const members = cohort.filter((l) => reached(l, key));
    const prev = steps[i - 1];
    let total = 0;
    let n = 0;
    if (i > 0) {
      const prevKey = stages[i - 1];
      for (const l of members) {
        const a = reachedAt(l, prevKey);
        const b = reachedAt(l, key);
        if (a && b && b >= a) {
          total += daysBetween(a, b);
          n++;
        }
      }
    }
    const progression = prev ? ratio(members.length, prev.count) : null;
    steps.push({
      key,
      label: stageLabel(settings, key),
      count: members.length,
      progression,
      dropOff: progression == null ? null : 1 - progression,
      ofCohort: ratio(members.length, cohort.length),
      avgDaysInPrevious: n ? total / n : null,
      avgDaysSample: n,
    });
  });
  return steps;
}

function finishFunnel(basis: "calls" | "pipeline", ctx: MetricContext, cohort: Lead[], steps: FunnelStep[], partial: boolean): FunnelResult {
  const won = cohort.filter((l) => l.status === "won").length;
  return {
    basis,
    cohortSize: cohort.length,
    steps,
    lost: cohort.filter((l) => isLost(l, ctx.settings)).length,
    open: cohort.filter((l) => l.status === "open").length,
    leadToClose: ratio(won, cohort.length),
    historyPartial: partial,
    historyTrackedSince: ctx.ds.historyTrackedSince,
  };
}

// ---------------------------------------------------------------------------
// Sales calls table
// ---------------------------------------------------------------------------
export interface CallCell {
  appointmentId: string;
  date: string;
  outcome: CallOutcome;
  ghlStatus: string;
}

export interface CallRow {
  leadId: string;
  leadName: string;
  company: string | null;
  accountId: string;
  accountName: string;
  repId: string | null;
  repName: string | null;
  source: string | null;
  stage: BusinessStageKey | null;
  stageLabel: string;
  calls: Record<1 | 2 | 3, CallCell | null>;
  nextScheduled: string | null;
  lastActivity: string | null;
  value: number;
  status: Lead["status"];
}

export function lastActivityFor(l: Lead, s: LeadCallSummary | undefined, now: number): string | null {
  const candidates = [l.lastActivityAt, l.lastStageChangeAt, l.lastStatusChangeAt, l.createdAt];
  for (const a of s?.all ?? []) if (new Date(a.startTime).getTime() <= now) candidates.push(a.startTime);
  return candidates.filter(Boolean).sort().pop() ?? null;
}

export function buildCallRows(ctx: MetricContext): CallRow[] {
  const accounts = new Map(ctx.ds.accounts.map((a) => [a.id, a.name]));
  const reps = new Map(ctx.ds.reps.map((r) => [r.id, r.name]));
  const { filters, range } = ctx;
  const q = filters.q?.trim().toLowerCase();
  const rows: CallRow[] = [];
  for (const l of ctx.ds.leads) {
    const s = ctx.byLead.get(l.id);
    const activeInRange = inRange(l.createdAt, range) || (s?.all ?? []).some((a) => inRange(a.startTime, range));
    if (!activeInRange) continue;
    if (filters.stage && l.businessStage !== filters.stage) continue;
    if (filters.outcome && !(s?.all ?? []).some((a) => a.outcome === filters.outcome && inRange(a.startTime, range))) continue;
    if (q && ![l.contactName, l.name, l.company, l.email].some((v) => v?.toLowerCase().includes(q))) continue;
    const cell = (n: 1 | 2 | 3): CallCell | null => {
      const a = s?.calls.get(n);
      return a ? { appointmentId: a.id, date: a.startTime, outcome: a.outcome, ghlStatus: a.ghlStatus } : null;
    };
    rows.push({
      leadId: l.id,
      leadName: l.contactName || l.name,
      company: l.company,
      accountId: l.accountId,
      accountName: accounts.get(l.accountId) ?? "—",
      repId: l.repId,
      repName: l.repId ? reps.get(l.repId) ?? null : null,
      source: l.source,
      stage: l.businessStage,
      stageLabel: l.status === "won" ? "Closed Won" : isLost(l, ctx.settings) ? "Closed Lost" : stageLabel(ctx.settings, l.businessStage),
      calls: { 1: cell(1), 2: cell(2), 3: cell(3) },
      nextScheduled: s?.nextScheduled?.startTime ?? null,
      lastActivity: lastActivityFor(l, s, ctx.now),
      value: l.monetaryValue,
      status: l.status,
    });
  }
  return rows.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

// ---------------------------------------------------------------------------
// Rep leaderboard
// ---------------------------------------------------------------------------
export interface RepPerformance {
  key: string; // "person:<personKey>"
  name: string;
  accountNames: string[];
  repIds: string[];
  leadsAssigned: number;
  callsScheduled: number;
  callsCompleted: number;
  noShows: number;
  secondCallConversion: number | null;
  thirdCallConversion: number | null;
  dealsClosed: number;
  closedWonValue: number;
  collectedRevenue: number;
  leadToClose: number | null;
  avgSalesCycleDays: number | null;
}

export function computeLeaderboard(ctx: MetricContext): RepPerformance[] {
  const { ds, range } = ctx;
  const accounts = new Map(ds.accounts.map((a) => [a.id, a.name]));
  const people = new Map<string, SalesRep[]>();
  for (const r of ds.reps) {
    const list = people.get(r.personKey);
    if (list) list.push(r);
    else people.set(r.personKey, [r]);
  }
  const apptsCounted = countedAppts(ctx);
  const leadRep = new Map(ds.leads.map((l) => [l.id, l.repId]));
  const out: RepPerformance[] = [];
  for (const [personKey, reps] of people) {
    const ids = new Set(reps.map((r) => r.id));
    const leads = ds.leads.filter((l) => l.repId && ids.has(l.repId));
    const cohort = leads.filter((l) => inRange(l.createdAt, range));
    const mine = apptsCounted.filter((a) => {
      const rep = a.repId ?? (a.leadId ? leadRep.get(a.leadId) : null);
      return rep != null && ids.has(rep);
    });
    const completedFirst = cohort.filter((l) => (ctx.byLead.get(l.id)?.maxCompleted ?? 0) >= 1);
    const completedSecond = cohort.filter((l) => (ctx.byLead.get(l.id)?.maxCompleted ?? 0) >= 2);
    const completedThird = cohort.filter((l) => (ctx.byLead.get(l.id)?.maxCompleted ?? 0) >= 3);
    const won = leads.filter((l) => l.status === "won" && inRange(l.wonAt, range));
    const leadIds = new Set(leads.map((l) => l.id));
    const cycles = won.filter((l) => l.wonAt).map((l) => daysBetween(l.createdAt, l.wonAt!));
    out.push({
      key: `person:${personKey}`,
      name: reps[0].name,
      accountNames: [...new Set(reps.map((r) => accounts.get(r.accountId) ?? "—"))],
      repIds: [...ids],
      leadsAssigned: cohort.length,
      callsScheduled: mine.filter((a) => inRange(a.bookedAt ?? a.startTime, range)).length,
      callsCompleted: mine.filter((a) => a.outcome === "completed" && inRange(a.startTime, range)).length,
      noShows: mine.filter((a) => a.outcome === "no_show" && inRange(a.startTime, range)).length,
      secondCallConversion: ratio(completedSecond.length, completedFirst.length),
      thirdCallConversion: ratio(completedThird.length, completedSecond.length),
      dealsClosed: won.length,
      closedWonValue: won.reduce((s, l) => s + l.monetaryValue, 0),
      collectedRevenue: ds.receipts
        .filter((r) => r.leadId && leadIds.has(r.leadId) && inRange(r.receivedAt, range))
        .reduce((s, r) => s + r.amount, 0),
      leadToClose: ratio(cohort.filter((l) => l.status === "won").length, cohort.length),
      avgSalesCycleDays: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    });
  }
  return out.sort((a, b) => b.closedWonValue - a.closedWonValue || b.dealsClosed - a.dealsClosed || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Time series & breakdowns
// ---------------------------------------------------------------------------
export interface SeriesPoint {
  bucket: string;
  newLeads: number;
  callsScheduled: number;
  callsCompleted: number;
  noShows: number;
  dealsWon: number;
  wonValue: number;
  collected: number;
}

export function computeSeries(ctx: MetricContext): SeriesPoint[] {
  const tz = ctx.settings.reportingTimezone;
  const g = ctx.filters.granularity;
  const points = new Map<string, SeriesPoint>(
    bucketsBetween(ctx.filters.from, ctx.filters.to, g).map((b) => [
      b,
      { bucket: b, newLeads: 0, callsScheduled: 0, callsCompleted: 0, noShows: 0, dealsWon: 0, wonValue: 0, collected: 0 },
    ]),
  );
  const at = (iso: string | null) => (iso && inRange(iso, ctx.range) ? points.get(bucketKey(localDate(iso, tz), g)) : undefined);
  for (const l of ctx.ds.leads) {
    const p = at(l.createdAt);
    if (p) p.newLeads++;
    if (l.status === "won") {
      const w = at(l.wonAt);
      if (w) {
        w.dealsWon++;
        w.wonValue += l.monetaryValue;
      }
    }
  }
  for (const a of countedAppts(ctx)) {
    const b = at(a.bookedAt ?? a.startTime);
    if (b) b.callsScheduled++;
    const s = at(a.startTime);
    if (s && a.outcome === "completed") s.callsCompleted++;
    if (s && a.outcome === "no_show") s.noShows++;
  }
  for (const r of ctx.ds.receipts) {
    const p = at(r.receivedAt);
    if (p) p.collected += r.amount;
  }
  return [...points.values()];
}

export interface Breakdown {
  key: string;
  label: string;
  leads: number;
  won: number;
  wonValue: number;
  collected: number;
  conversion: number | null;
}

export function breakdownBy(ctx: MetricContext, dim: "account" | "source" | "rep"): Breakdown[] {
  const accounts = new Map(ctx.ds.accounts.map((a) => [a.id, a.name]));
  const reps = new Map(ctx.ds.reps.map((r) => [r.id, r]));
  const keyOf = (l: Lead): [string, string] => {
    if (dim === "account") return [l.accountId, accounts.get(l.accountId) ?? "—"];
    if (dim === "source") return [l.source || "(unknown)", l.source || "(unknown)"];
    const r = l.repId ? reps.get(l.repId) : undefined;
    return r ? [r.personKey, r.name] : ["(unassigned)", "Unassigned"];
  };
  const map = new Map<string, Breakdown>();
  const get = (l: Lead) => {
    const [key, label] = keyOf(l);
    let b = map.get(key);
    if (!b) {
      b = { key, label, leads: 0, won: 0, wonValue: 0, collected: 0, conversion: null };
      map.set(key, b);
    }
    return b;
  };
  const cohortWon = new Map<string, number>();
  for (const l of ctx.ds.leads) {
    if (inRange(l.createdAt, ctx.range)) {
      const b = get(l);
      b.leads++;
      if (l.status === "won") cohortWon.set(b.key, (cohortWon.get(b.key) ?? 0) + 1);
    }
    if (l.status === "won" && inRange(l.wonAt, ctx.range)) {
      const b = get(l);
      b.won++;
      b.wonValue += l.monetaryValue;
    }
  }
  for (const r of ctx.ds.receipts) {
    if (!inRange(r.receivedAt, ctx.range)) continue;
    const l = r.leadId ? ctx.leadsById.get(r.leadId) : undefined;
    if (l) get(l).collected += r.amount;
    else if (dim === "account") {
      const key = r.accountId;
      const b = map.get(key) ?? { key, label: accounts.get(key) ?? "—", leads: 0, won: 0, wonValue: 0, collected: 0, conversion: null };
      b.collected += r.amount;
      map.set(key, b);
    }
  }
  for (const b of map.values()) b.conversion = ratio(cohortWon.get(b.key) ?? 0, b.leads);
  return [...map.values()].sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads);
}

export function averageTimeToClose(ctx: MetricContext): { days: number | null; sample: number } {
  const won = ctx.ds.leads.filter((l) => l.status === "won" && l.wonAt && inRange(l.wonAt, ctx.range));
  if (!won.length) return { days: null, sample: 0 };
  return { days: won.reduce((s, l) => s + daysBetween(l.createdAt, l.wonAt!), 0) / won.length, sample: won.length };
}

/** Compare the selected period with the immediately preceding one of equal length. */
export function previousPeriod(filters: Filters): Filters {
  const len = Math.round(daysBetween(`${filters.from}T00:00:00Z`, `${filters.to}T00:00:00Z`)) + 1;
  const to = new Date(Date.parse(`${filters.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (len - 1) * 86_400_000).toISOString().slice(0, 10);
  return { ...filters, from, to };
}

// ---------------------------------------------------------------------------
// Follow-ups (monitoring only — nothing is sent or written to GHL)
// ---------------------------------------------------------------------------
export interface FollowUpItem {
  leadId: string;
  leadName: string;
  accountId: string;
  accountName: string;
  repName: string | null;
  stageLabel: string;
  lastActivity: string | null;
  daysInactive: number;
  rule: FollowUpRuleKey;
  reasons: FollowUpRuleKey[];
  recommendedAction: string;
}

const RULE_PRIORITY: FollowUpRuleKey[] = [
  "missed_no_reschedule",
  "second_done_no_third",
  "first_done_no_second",
  "new_lead_no_first_call",
  "inactive",
];

const RECOMMENDED: Record<FollowUpRuleKey, string> = {
  new_lead_no_first_call: "Contact the lead and book the first sales call",
  first_done_no_second: "Book the second sales call",
  second_done_no_third: "Book the third sales call",
  missed_no_reschedule: "Reach out and reschedule the missed call",
  inactive: "Re-engage the lead or close the opportunity",
};

export function computeFollowUps(ctx: MetricContext): FollowUpItem[] {
  const rules = new Map(ctx.settings.followUpRules.filter((r) => r.enabled).map((r) => [r.key, r.thresholdDays]));
  const accounts = new Map(ctx.ds.accounts.map((a) => [a.id, a.name]));
  const reps = new Map(ctx.ds.reps.map((r) => [r.id, r.name]));
  const out: FollowUpItem[] = [];
  for (const l of ctx.ds.leads) {
    if (l.status !== "open") continue;
    const s = ctx.byLead.get(l.id);
    const hasUpcoming = !!s?.nextScheduled || (s?.all ?? []).some((a) => a.outcome === "pending_outcome");
    const last = lastActivityFor(l, s, ctx.now);
    const daysInactive = last ? daysBetween(last, ctx.now) : daysBetween(l.createdAt, ctx.now);
    const reasons: FollowUpRuleKey[] = [];
    const over = (key: FollowUpRuleKey, since: string | null | undefined) =>
      rules.has(key) && since != null && daysBetween(since, ctx.now) >= (rules.get(key) ?? Infinity);

    const live = (s?.all ?? []).filter((a) => a.outcome !== "cancelled" || a.rescheduleCount > 0);
    if (!live.length && !hasUpcoming && over("new_lead_no_first_call", l.createdAt)) reasons.push("new_lead_no_first_call");
    if (s && !hasUpcoming) {
      if (s.maxCompleted === 1 && over("first_done_no_second", s.completedAt.get(1))) reasons.push("first_done_no_second");
      if (s.maxCompleted === 2 && over("second_done_no_third", s.completedAt.get(2))) reasons.push("second_done_no_third");
      const latest = s.all[s.all.length - 1];
      if (latest && (latest.outcome === "no_show" || latest.outcome === "cancelled") && over("missed_no_reschedule", latest.startTime))
        reasons.push("missed_no_reschedule");
    }
    if (!hasUpcoming && over("inactive", last)) reasons.push("inactive");
    if (!reasons.length) continue;
    const rule = RULE_PRIORITY.find((r) => reasons.includes(r))!;
    out.push({
      leadId: l.id,
      leadName: l.contactName || l.name,
      accountId: l.accountId,
      accountName: accounts.get(l.accountId) ?? "—",
      repName: l.repId ? reps.get(l.repId) ?? null : null,
      stageLabel: stageLabel(ctx.settings, l.businessStage),
      lastActivity: last,
      daysInactive: Math.floor(daysInactive),
      rule,
      reasons,
      recommendedAction: RECOMMENDED[rule],
    });
  }
  return out.sort((a, b) => RULE_PRIORITY.indexOf(a.rule) - RULE_PRIORITY.indexOf(b.rule) || b.daysInactive - a.daysInactive);
}
