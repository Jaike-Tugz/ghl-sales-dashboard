import { defaultSettings } from "@/lib/settings-defaults";
import { EMPTY_ATTRIBUTION, type Appointment, type Dataset, type Filters, type Lead } from "@/lib/types";

export const NOW = Date.parse("2026-06-30T12:00:00Z");
export const settings = { ...defaultSettings(), reportingTimezone: "UTC" };
export const filters: Filters = { accountId: "all", from: "2026-06-01", to: "2026-06-30", granularity: "week" };

export function lead(p: Partial<Lead> & { id: string }): Lead {
  return {
    accountId: "A",
    ghlOpportunityId: `opp-${p.id}`,
    ghlContactId: `c-${p.id}`,
    name: p.id,
    contactName: p.id,
    company: null,
    email: null,
    source: "Ads",
    contactSource: null,
    attribution: { ...EMPTY_ATTRIBUTION },
    repId: "r1",
    pipelineId: "p",
    stageId: null,
    businessStage: "new_lead",
    status: "open",
    monetaryValue: 1000,
    createdAt: "2026-06-05T10:00:00Z",
    lastStageChangeAt: null,
    lastStatusChangeAt: null,
    wonAt: null,
    lostAt: null,
    lastActivityAt: null,
    ...p,
  };
}

let n = 0;
export function appt(p: Partial<Appointment> & { leadId: string; startTime: string }): Appointment {
  n++;
  return {
    id: `ap${n}`,
    accountId: "A",
    ghlAppointmentId: `g${n}`,
    ghlContactId: null,
    calendarId: null,
    repId: "r1",
    title: null,
    ghlStatus: "showed",
    endTime: null,
    bookedAt: null,
    rescheduleCount: 0,
    outcomeOverride: null,
    ...p,
  };
}

export function dataset(leads: Lead[], appointments: Appointment[] = [], extra: Partial<Dataset> = {}): Dataset {
  return {
    accounts: [
      { id: "A", name: "Account A", locationId: "LOC-A", authType: "oauth", connectionStatus: "connected", lastSuccessfulSyncAt: null, webhookStatus: "active", lastWebhookAt: null, lastError: null, lastErrorAt: null, timezone: "UTC", color: "#000" },
      { id: "B", name: "Account B", locationId: "LOC-B", authType: "oauth", connectionStatus: "connected", lastSuccessfulSyncAt: null, webhookStatus: "active", lastWebhookAt: null, lastError: null, lastErrorAt: null, timezone: "UTC", color: "#000" },
    ],
    reps: [
      { id: "r1", accountId: "A", ghlUserId: "u1", name: "Sam", email: "sam@x.com", personKey: "sam@x.com" },
      { id: "r2", accountId: "B", ghlUserId: "u9", name: "Sam", email: "sam@x.com", personKey: "sam@x.com" },
      { id: "r3", accountId: "B", ghlUserId: "u2", name: "Alex", email: "alex@x.com", personKey: "alex@x.com" },
    ],
    pipelines: [],
    stages: [],
    calendars: [],
    leads,
    appointments,
    transitions: [],
    receipts: [],
    callActivities: [],
    historyTrackedSince: null,
    ...extra,
  };
}
