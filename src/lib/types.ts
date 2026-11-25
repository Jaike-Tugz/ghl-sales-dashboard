/**
 * Normalised domain model shared by the mock data source, the Supabase data
 * source and the metrics engine. Every record keeps the GHL location it came
 * from (`accountId` → `ghl_accounts.location_id`) and its original GHL id, so
 * records from different sub-accounts can never collide.
 */

export type Role = "admin" | "manager" | "rep";

export type AuthType = "oauth" | "private_integration";

export type ConnectionStatus = "not_connected" | "connected" | "error" | "revoked";

/** Business-level funnel stage keys. Labels are configurable in Settings. */
export type BusinessStageKey =
  | "new_lead"
  | "first_call"
  | "second_call"
  | "third_call"
  | "fourth_stage"
  | "closing";

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

/** GHL `appointmentStatus` values as published in the official calendars spec. */
export type GhlAppointmentStatus = "new" | "confirmed" | "cancelled" | "showed" | "noshow" | "invalid";

/** Dashboard outcome vocabulary (derived; see docs/METRICS.md). */
export type CallOutcome = "scheduled" | "completed" | "no_show" | "cancelled" | "rescheduled" | "pending_outcome";

export const CALL_OUTCOMES: CallOutcome[] = [
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
  "rescheduled",
  "pending_outcome",
];

export interface Account {
  id: string;
  name: string;
  locationId: string;
  authType: AuthType;
  connectionStatus: ConnectionStatus;
  lastSuccessfulSyncAt: string | null;
  webhookStatus: "active" | "inactive" | "unavailable";
  lastWebhookAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  timezone: string | null;
  color: string;
}

export interface SalesRep {
  id: string;
  accountId: string;
  ghlUserId: string;
  name: string;
  email: string | null;
  /** Links the same human across sub-accounts (lower-cased email by default). */
  personKey: string;
}

export interface PipelineStage {
  id: string;
  accountId: string;
  pipelineId: string;
  ghlStageId: string;
  name: string;
  position: number;
  businessStage: BusinessStageKey | null;
}

export interface Pipeline {
  id: string;
  accountId: string;
  ghlPipelineId: string;
  name: string;
  isSalesPipeline: boolean;
}

export interface Calendar {
  id: string;
  accountId: string;
  ghlCalendarId: string;
  name: string;
  /** 1, 2, 3 … when this calendar is dedicated to a specific call; null = sequence rule. */
  callNumber: number | null;
  isSalesCalendar: boolean;
}

/** A lead = one opportunity in a pipeline mapped as a sales pipeline. */
export interface Lead {
  id: string;
  accountId: string;
  ghlOpportunityId: string;
  ghlContactId: string;
  name: string;
  contactName: string;
  company: string | null;
  email: string | null;
  /** Opportunity source, falling back to the contact's (e.g. "FB Form"). */
  source: string | null;
  /** Contact source as set in GHL (often the ad/campaign, e.g. "Facebook - EVO ICL V2"). */
  contactSource: string | null;
  attribution: LeadAttribution;
  repId: string | null;
  pipelineId: string;
  stageId: string | null;
  businessStage: BusinessStageKey | null;
  status: OpportunityStatus;
  monetaryValue: number;
  createdAt: string;
  lastStageChangeAt: string | null;
  lastStatusChangeAt: string | null;
  /** When status became won (from status-change history or lastStatusChangeAt). */
  wonAt: string | null;
  lostAt: string | null;
  lastActivityAt: string | null;
}

/** UTM / channel attribution from the GHL contact (first touch, last touch as fallback). */
export interface LeadAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** GHL channel fields, e.g. medium "facebook", sessionSource "Paid Social". */
  medium: string | null;
  sessionSource: string | null;
  campaign: string | null;
  /** Meta ids and lead form, from GHL's raw attribution (Facebook lead ads). */
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  formName: string | null;
}

export const EMPTY_ATTRIBUTION: LeadAttribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  medium: null,
  sessionSource: null,
  campaign: null,
  campaignId: null,
  adSetId: null,
  adId: null,
  formName: null,
};

export interface Appointment {
  id: string;
  accountId: string;
  ghlAppointmentId: string;
  ghlContactId: string | null;
  leadId: string | null;
  calendarId: string | null;
  repId: string | null;
  title: string | null;
  ghlStatus: GhlAppointmentStatus;
  startTime: string;
  endTime: string | null;
  bookedAt: string | null;
  rescheduleCount: number;
  /** Manually recorded outcome (dashboard only — never written to GHL). */
  outcomeOverride: CallOutcome | null;
}

export interface StageTransition {
  id: string;
  accountId: string;
  leadId: string;
  fromStageKey: BusinessStageKey | null;
  toStageKey: BusinessStageKey | null;
  enteredAt: string;
  /** "webhook" / "reconcile_diff" are observed; "snapshot" is reconstructed from lastStageChangeAt. */
  source: "webhook" | "reconcile_diff" | "snapshot";
}

export interface RevenueReceipt {
  id: string;
  accountId: string;
  leadId: string | null;
  ghlContactId: string | null;
  amount: number;
  receivedAt: string;
  source: "ghl_payments" | "manual";
}

export interface CallActivity {
  id: string;
  accountId: string;
  ghlMessageId: string;
  ghlContactId: string | null;
  leadId: string | null;
  repId: string | null;
  direction: "inbound" | "outbound";
  callStatus: string | null;
  durationSeconds: number | null;
  occurredAt: string;
}

export interface FunnelStageConfig {
  key: BusinessStageKey;
  label: string;
  enabled: boolean;
  position: number;
}

export interface FollowUpRule {
  key: FollowUpRuleKey;
  label: string;
  enabled: boolean;
  thresholdDays: number;
}

export type FollowUpRuleKey =
  | "new_lead_no_first_call"
  | "first_done_no_second"
  | "second_done_no_third"
  | "missed_no_reschedule"
  | "inactive";

export interface OutcomeMapping {
  /** How each GHL appointment status maps to the dashboard vocabulary. */
  showed: CallOutcome;
  noshow: CallOutcome;
  cancelled: CallOutcome;
  /** Applied to new/confirmed once the end time has passed. */
  pastUnconfirmed: CallOutcome;
  /** Exclude `invalid` appointments from every count. */
  excludeInvalid: boolean;
}

export interface AppSettings {
  reportingTimezone: string;
  funnelStages: FunnelStageConfig[];
  followUpRules: FollowUpRule[];
  outcomeMapping: OutcomeMapping;
  /** Count `abandoned` opportunities as lost. */
  abandonedCountsAsLost: boolean;
  /** Minutes after an appointment's end before it becomes "pending outcome". */
  pendingOutcomeGraceMinutes: number;
}

export interface Dataset {
  accounts: Account[];
  reps: SalesRep[];
  pipelines: Pipeline[];
  stages: PipelineStage[];
  calendars: Calendar[];
  leads: Lead[];
  appointments: Appointment[];
  transitions: StageTransition[];
  receipts: RevenueReceipt[];
  callActivities: CallActivity[];
  /** Earliest moment from which stage history was observed (not reconstructed). */
  historyTrackedSince: string | null;
}

export interface Viewer {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** Account ids a manager may see; admins see all; reps see their own accounts. */
  accountIds: string[] | "all";
  /** For reps: the sales_rep row ids linked to this user. */
  repIds: string[];
  isDemo: boolean;
}

export interface Filters {
  accountId: string | "all";
  from: string; // YYYY-MM-DD in reporting timezone (inclusive)
  to: string; // YYYY-MM-DD in reporting timezone (inclusive)
  repId?: string;
  stage?: BusinessStageKey;
  outcome?: CallOutcome;
  q?: string;
  granularity: "day" | "week" | "month";
}
