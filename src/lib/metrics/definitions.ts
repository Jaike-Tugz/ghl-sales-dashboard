/**
 * Plain-language KPI definitions shown in the UI (info tooltips) and mirrored
 * in docs/METRICS.md. "In range" = within [from 00:00, to+1 00:00) in the
 * reporting timezone.
 */
export const KPI_DEFINITIONS = {
  newLeads: "Opportunities created in a sales pipeline in range (one per opportunity, not per contact).",
  callsScheduled: "Sales-calendar appointments for this call number BOOKED in range (by GHL dateAdded). A rebooking after a no-show counts again. Invalid appointments excluded.",
  callsCompleted: "Appointments for this call number whose START is in range and whose status is showed (or manually marked completed).",
  closedDeals: "Opportunities whose status became won in range (won_at).",
  lostOpportunities: "Opportunities whose status became lost (and abandoned, if enabled in Settings) in range.",
  winRate: "Closed won ÷ (closed won + closed lost), both counted by close date in range.",
  leadToClose: "Cohort metric: of leads created in range, the share whose opportunity is now won.",
  pipelineValue: "Sum of monetary value of currently OPEN opportunities. Point-in-time; not date-filtered.",
  closedWonValue: "Sum of opportunity value for deals won in range. Booked value — NOT collected revenue.",
  collectedRevenue: "Payments actually received in range: succeeded GHL payment transactions (net of refunds) or manually recorded receipts.",
  pendingFollowUps: "Open leads matching at least one enabled follow-up rule right now.",
  noShowRate: "No-shows ÷ (completed + no-shows) for sales appointments starting in range.",
} as const;
