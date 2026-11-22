import type { AppSettings, BusinessStageKey, FollowUpRuleKey } from "./types";

export const BUSINESS_STAGE_ORDER: BusinessStageKey[] = [
  "new_lead",
  "first_call",
  "second_call",
  "third_call",
  "fourth_stage",
  "closing",
];

export const DEFAULT_STAGE_LABELS: Record<BusinessStageKey, string> = {
  new_lead: "New Lead",
  first_call: "First Sales Call",
  second_call: "Second Sales Call",
  third_call: "Third Sales Call",
  fourth_stage: "Fourth Stage",
  closing: "Closed Won",
};

export const FOLLOW_UP_LABELS: Record<FollowUpRuleKey, string> = {
  new_lead_no_first_call: "New lead without a first call scheduled",
  first_done_no_second: "First call completed, no second call scheduled",
  second_done_no_third: "Second call completed, no third call scheduled",
  missed_no_reschedule: "Missed appointment without a rescheduled call",
  inactive: "Lead inactive beyond threshold",
};

export function defaultSettings(): AppSettings {
  return {
    reportingTimezone: process.env.REPORTING_TIMEZONE || "UTC",
    funnelStages: BUSINESS_STAGE_ORDER.map((key, i) => ({
      key,
      label: DEFAULT_STAGE_LABELS[key],
      // The fourth business stage is optional and off until configured.
      enabled: key !== "fourth_stage",
      position: i,
    })),
    followUpRules: (
      [
        ["new_lead_no_first_call", 2],
        ["first_done_no_second", 3],
        ["second_done_no_third", 5],
        ["missed_no_reschedule", 1],
        ["inactive", 14],
      ] as const
    ).map(([key, thresholdDays]) => ({ key, label: FOLLOW_UP_LABELS[key], enabled: true, thresholdDays })),
    outcomeMapping: {
      showed: "completed",
      noshow: "no_show",
      cancelled: "cancelled",
      pastUnconfirmed: "pending_outcome",
      excludeInvalid: true,
    },
    abandonedCountsAsLost: true,
    pendingOutcomeGraceMinutes: 60,
  };
}

export function stageLabel(settings: AppSettings, key: BusinessStageKey | null | undefined): string {
  if (!key) return "Unmapped";
  return settings.funnelStages.find((s) => s.key === key)?.label ?? DEFAULT_STAGE_LABELS[key];
}

export const OUTCOME_LABELS = {
  scheduled: "Scheduled",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  pending_outcome: "Pending outcome",
} as const;
