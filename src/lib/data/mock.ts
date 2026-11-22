/**
 * DEMO DATA ONLY. Deterministic, generated sample records used until real GHL
 * credentials and account mappings are configured. Every page shows a
 * "Demo data" banner while this source is active. Nothing here is a real
 * metric and none of it is ever written to Supabase.
 */
import type {
  Account,
  Appointment,
  BusinessStageKey,
  Calendar,
  Dataset,
  GhlAppointmentStatus,
  Lead,
  Pipeline,
  PipelineStage,
  RevenueReceipt,
  SalesRep,
  StageTransition,
} from "../types";

function prng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Olivia", "Liam", "Amelia", "Noah", "Isla", "Oliver", "Ava", "Jack", "Mia", "Leo", "Grace", "Harry", "Zoe", "Lucas", "Chloe", "Ethan", "Ruby", "Mason", "Ella", "James"];
const LAST = ["Smith", "Jones", "Williams", "Brown", "Taylor", "Wilson", "Nguyen", "Martin", "Clarke", "Walker", "Hall", "Young", "King", "Wright", "Scott", "Green", "Baker", "Hill", "Lee", "Adams"];
const COMPANIES = ["Northwind", "Bluegum Co", "Apex Dental", "Harbour Legal", "Summit Fitness", "Coastal Realty", "Ironbark Builders", "Lumen Clinic", "Peak Finance", "Willow Studio", null, null];
const SOURCES = ["Facebook Ads", "Google Ads", "Referral", "Website Form", "Instagram", "Webinar", "Cold Outreach"];

const ACCOUNTS: Array<Pick<Account, "id" | "name" | "locationId" | "color">> = [
  { id: "acc_1", name: "Account 1", locationId: "DEMO-LOC-0001", color: "#2a78d6" },
  { id: "acc_2", name: "Account 2", locationId: "DEMO-LOC-0002", color: "#eb6834" },
  { id: "acc_3", name: "Account 3", locationId: "DEMO-LOC-0003", color: "#1baf7a" },
  { id: "acc_4", name: "Account 4", locationId: "DEMO-LOC-0004", color: "#eda100" },
];

const REPS: Array<[string, string, string[]]> = [
  ["Sarah Mitchell", "sarah@example.com", ["acc_1", "acc_2"]],
  ["Daniel Reyes", "daniel@example.com", ["acc_1"]],
  ["Priya Shah", "priya@example.com", ["acc_2"]],
  ["Tom Becker", "tom@example.com", ["acc_3"]],
  ["Hannah Cole", "hannah@example.com", ["acc_3", "acc_4"]],
  ["Marcus Lee", "marcus@example.com", ["acc_4"]],
  ["Jess Romero", "jess@example.com", ["acc_2", "acc_4"]],
];

const STAGES: Array<[string, BusinessStageKey | null]> = [
  ["New Lead", "new_lead"],
  ["Discovery Call Booked", "first_call"],
  ["Strategy Call", "second_call"],
  ["Proposal / Closing Call", "third_call"],
  ["Won", "closing"],
  ["Lost", null],
];

const DAY = 86_400_000;

let cache: { key: string; ds: Dataset } | null = null;

export function getMockDataset(now = Date.now()): Dataset {
  // Regenerate at most hourly so relative dates stay current but stable.
  const key = String(Math.floor(now / 3_600_000));
  if (cache?.key === key) return cache.ds;
  const ds = generate(Math.floor(now / 3_600_000) * 3_600_000);
  cache = { key, ds };
  return ds;
}

function generate(now: number): Dataset {
  const rand = prng(20261122);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const iso = (t: number) => new Date(t).toISOString();

  const accounts: Account[] = ACCOUNTS.map((a, i) => ({
    ...a,
    authType: "oauth",
    connectionStatus: "connected",
    lastSuccessfulSyncAt: iso(now - (i + 1) * 7 * 60_000),
    webhookStatus: i === 2 ? "inactive" : "active",
    lastWebhookAt: i === 2 ? iso(now - 3 * DAY) : iso(now - (i + 2) * 60_000),
    lastError: i === 2 ? "Demo: no webhook received in 72h — check the app is still installed" : null,
    lastErrorAt: i === 2 ? iso(now - 3 * DAY) : null,
    timezone: "UTC",
  }));

  const reps: SalesRep[] = [];
  for (const [name, email, accs] of REPS) {
    for (const acc of accs) {
      reps.push({ id: `rep_${acc}_${email.split("@")[0]}`, accountId: acc, ghlUserId: `demo-user-${email.split("@")[0]}-${acc}`, name, email, personKey: email });
    }
  }

  const pipelines: Pipeline[] = [];
  const stages: PipelineStage[] = [];
  const calendars: Calendar[] = [];
  for (const a of accounts) {
    const pid = `pipe_${a.id}`;
    pipelines.push({ id: pid, accountId: a.id, ghlPipelineId: `demo-pipeline-${a.id}`, name: "Sales Pipeline", isSalesPipeline: true });
    STAGES.forEach(([name, bk], i) =>
      stages.push({ id: `stg_${a.id}_${i}`, accountId: a.id, pipelineId: pid, ghlStageId: `demo-stage-${a.id}-${i}`, name, position: i, businessStage: bk }),
    );
    calendars.push(
      { id: `cal_${a.id}_1`, accountId: a.id, ghlCalendarId: `demo-cal-${a.id}-1`, name: "Discovery Call", callNumber: 1, isSalesCalendar: true },
      { id: `cal_${a.id}_2`, accountId: a.id, ghlCalendarId: `demo-cal-${a.id}-2`, name: "Strategy Session", callNumber: null, isSalesCalendar: true },
      { id: `cal_${a.id}_x`, accountId: a.id, ghlCalendarId: `demo-cal-${a.id}-x`, name: "Onboarding (not sales)", callNumber: null, isSalesCalendar: false },
    );
  }

  const leads: Lead[] = [];
  const appointments: Appointment[] = [];
  const transitions: StageTransition[] = [];
  const receipts: RevenueReceipt[] = [];
  const historySince = now - 200 * DAY;
  let n = 0;

  for (const a of accounts) {
    const accReps = reps.filter((r) => r.accountId === a.id);
    const volume = 220 + Math.floor(rand() * 120);
    const stage = (i: number) => stages.find((s) => s.accountId === a.id && s.position === i)!;
    for (let i = 0; i < volume; i++) {
      n++;
      const created = now - Math.floor(Math.pow(rand(), 1.1) * 240 * DAY) - Math.floor(rand() * DAY);
      const rep = rand() < 0.94 ? pick(accReps) : null;
      const first = pick(FIRST);
      const last = pick(LAST);
      const leadId = `lead_${n}`;
      const contactId = `demo-contact-${n}`;
      const value = Math.round((1500 + rand() * 13500) / 50) * 50;
      let cursor = created;
      let completed = 0;
      let currentStage = 0;
      let status: Lead["status"] = "open";
      let statusAt: number | null = null;
      const lead: Lead = {
        id: leadId,
        accountId: a.id,
        ghlOpportunityId: `demo-opp-${n}`,
        ghlContactId: contactId,
        name: `${first} ${last} — Opportunity`,
        contactName: `${first} ${last}`,
        company: pick(COMPANIES),
        email: `${first}.${last}${n}@example.com`.toLowerCase(),
        source: pick(SOURCES),
        repId: rep?.id ?? null,
        pipelineId: `pipe_${a.id}`,
        stageId: null,
        businessStage: null,
        status: "open",
        monetaryValue: value,
        createdAt: iso(created),
        lastStageChangeAt: null,
        lastStatusChangeAt: null,
        wonAt: null,
        lostAt: null,
        lastActivityAt: null,
      };
      const moveTo = (pos: number, at: number) => {
        const from = stage(currentStage).businessStage;
        currentStage = pos;
        if (at < now) {
          transitions.push({ id: `tr_${transitions.length}`, accountId: a.id, leadId, fromStageKey: from, toStageKey: stage(pos).businessStage, enteredAt: iso(at), source: at > historySince ? "webhook" : "snapshot" });
        }
      };
      const progressRates = [0.78, 0.62, 0.55];
      for (let call = 1; call <= 3 && status === "open"; call++) {
        if (rand() > progressRates[call - 1]) break;
        let attempts = 0;
        while (attempts < 3) {
          attempts++;
          const booked = cursor + Math.floor((0.2 + rand() * 2.5) * DAY);
          const start = booked + Math.floor((1 + rand() * 6) * DAY);
          if (booked > now) break;
          if (call === 1 && attempts === 1) moveTo(1, booked);
          const future = start > now;
          const r = rand();
          let st: GhlAppointmentStatus;
          if (future) st = r < 0.7 ? "confirmed" : "new";
          else if (r < 0.7) st = "showed";
          else if (r < 0.84) st = "noshow";
          else if (r < 0.93) st = "cancelled";
          else st = "confirmed"; // past and unconfirmed → pending outcome
          const calId = call === 1 ? `cal_${a.id}_1` : `cal_${a.id}_2`;
          appointments.push({
            id: `appt_${appointments.length}`,
            accountId: a.id,
            ghlAppointmentId: `demo-appt-${appointments.length}`,
            ghlContactId: contactId,
            leadId,
            calendarId: calId,
            repId: rep?.id ?? null,
            title: call === 1 ? "Discovery Call" : `Sales Call ${call}`,
            ghlStatus: st,
            startTime: iso(start),
            endTime: iso(start + 45 * 60_000),
            bookedAt: iso(booked),
            rescheduleCount: future && rand() < 0.15 ? 1 : 0,
            outcomeOverride: null,
          });
          cursor = start;
          if (future || st === "confirmed") {
            attempts = 99;
            status = "open";
            call = 99;
            break;
          }
          if (st === "showed") {
            completed = call;
            if (call < 3) moveTo(call + 1, start + Math.floor(rand() * 2 * 3_600_000));
            break;
          }
          if (rand() < 0.45) break; // gave up after a missed call
        }
        if (completed < call) break;
      }
      // Outcome
      if (completed === 3 && cursor < now) {
        const close = cursor + Math.floor((0.5 + rand() * 6) * DAY);
        if (close < now) {
          status = rand() < 0.62 ? "won" : "lost";
          statusAt = close;
        }
      } else if (cursor + 30 * DAY < now && rand() < 0.55) {
        status = rand() < 0.85 ? "lost" : "abandoned";
        statusAt = cursor + Math.floor((10 + rand() * 20) * DAY);
      }
      if (status === "won") moveTo(4, statusAt!);
      if (status === "lost" || status === "abandoned") moveTo(5, statusAt!);
      const stg = stage(currentStage);
      lead.stageId = stg.id;
      lead.businessStage = stg.businessStage;
      lead.status = status;
      lead.lastStatusChangeAt = statusAt ? iso(statusAt) : null;
      lead.wonAt = status === "won" ? iso(statusAt!) : null;
      lead.lostAt = status === "lost" || status === "abandoned" ? iso(statusAt!) : null;
      const lastT = transitions.filter((t) => t.leadId === leadId).pop();
      lead.lastStageChangeAt = lastT?.enteredAt ?? null;
      lead.lastActivityAt = iso(Math.min(now, Math.max(cursor, statusAt ?? 0, created)));
      leads.push(lead);
      if (status === "won") {
        // Collected revenue is deliberately different from closed value.
        const paid = rand();
        if (paid < 0.75) {
          const portion = paid < 0.5 ? 1 : 0.5;
          receipts.push({ id: `rcpt_${receipts.length}`, accountId: a.id, leadId, ghlContactId: contactId, amount: Math.round(value * portion), receivedAt: iso(Math.min(now, statusAt! + Math.floor(rand() * 10 * DAY))), source: "ghl_payments" });
        }
      }
    }
  }

  return {
    accounts,
    reps,
    pipelines,
    stages,
    calendars,
    leads,
    appointments,
    transitions,
    receipts,
    callActivities: [],
    historyTrackedSince: iso(historySince),
  };
}
