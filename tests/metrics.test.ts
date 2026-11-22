import { describe, expect, it } from "vitest";
import { buildContext, computeCallFunnel, computeFollowUps, computeKpis, computeLeaderboard, computePipelineFunnel, deriveOutcome, enrichAppointments } from "@/lib/metrics";
import { NOW, appt, dataset, filters, lead, settings } from "./fixtures";

describe("appointment outcomes", () => {
  it("maps GHL statuses and never assumes a past call happened", () => {
    const base = appt({ leadId: "x", startTime: "2026-06-29T10:00:00Z", endTime: "2026-06-29T10:30:00Z" });
    expect(deriveOutcome({ ...base, ghlStatus: "showed" }, settings, NOW)).toBe("completed");
    expect(deriveOutcome({ ...base, ghlStatus: "noshow" }, settings, NOW)).toBe("no_show");
    expect(deriveOutcome({ ...base, ghlStatus: "cancelled" }, settings, NOW)).toBe("cancelled");
    expect(deriveOutcome({ ...base, ghlStatus: "confirmed" }, settings, NOW)).toBe("pending_outcome");
    const future = { ...base, startTime: "2026-07-02T10:00:00Z", endTime: null, ghlStatus: "confirmed" as const };
    expect(deriveOutcome(future, settings, NOW)).toBe("scheduled");
    expect(deriveOutcome({ ...future, rescheduleCount: 1 }, settings, NOW)).toBe("rescheduled");
    expect(deriveOutcome({ ...base, ghlStatus: "confirmed", outcomeOverride: "completed" }, settings, NOW)).toBe("completed");
  });

  it("respects the grace period before pending outcome", () => {
    const justEnded = appt({ leadId: "x", startTime: "2026-06-30T11:00:00Z", endTime: "2026-06-30T11:30:00Z", ghlStatus: "confirmed" });
    expect(deriveOutcome(justEnded, settings, NOW)).toBe("scheduled"); // 30 min after end < 60 min grace
  });
});

describe("call numbering", () => {
  it("does not advance the call number after a no-show (rebooked first call stays first)", () => {
    const L = lead({ id: "L" });
    const ds = dataset([L], [
      appt({ leadId: "L", startTime: "2026-06-06T10:00:00Z", ghlStatus: "noshow" }),
      appt({ leadId: "L", startTime: "2026-06-08T10:00:00Z", ghlStatus: "showed" }),
      appt({ leadId: "L", startTime: "2026-06-12T10:00:00Z", ghlStatus: "cancelled" }),
      appt({ leadId: "L", startTime: "2026-06-14T10:00:00Z", ghlStatus: "showed" }),
    ]);
    const nums = enrichAppointments(ds, settings, NOW).map((a) => a.callNumber);
    expect(nums).toEqual([1, 1, 2, 2]);
  });

  it("uses an explicit calendar mapping when present and ignores non-sales calendars", () => {
    const L = lead({ id: "L" });
    const ds = dataset(
      [L],
      [
        appt({ leadId: "L", startTime: "2026-06-06T10:00:00Z", calendarId: "cal3" }),
        appt({ leadId: "L", startTime: "2026-06-07T10:00:00Z", calendarId: "onb" }),
      ],
      {
        calendars: [
          { id: "cal3", accountId: "A", ghlCalendarId: "x", name: "Closing", callNumber: 3, isSalesCalendar: true },
          { id: "onb", accountId: "A", ghlCalendarId: "y", name: "Onboarding", callNumber: null, isSalesCalendar: false },
        ],
      },
    );
    const [a, b] = enrichAppointments(ds, settings, NOW);
    expect(a.callNumber).toBe(3);
    expect(b.isSalesCall).toBe(false);
    expect(b.callNumber).toBeNull();
  });

  it("links an appointment to the lead via contact when the sync could not", () => {
    const L = lead({ id: "L", ghlContactId: "C1" });
    const ds = dataset([L], [appt({ leadId: null as unknown as string, ghlContactId: "C1", startTime: "2026-06-06T10:00:00Z" })]);
    expect(enrichAppointments(ds, settings, NOW)[0].leadId).toBe("L");
  });

  it("excludes invalid appointments", () => {
    const ds = dataset([lead({ id: "L" })], [appt({ leadId: "L", startTime: "2026-06-06T10:00:00Z", ghlStatus: "invalid" })]);
    expect(enrichAppointments(ds, settings, NOW)[0].excluded).toBe(true);
  });
});

describe("KPIs", () => {
  const leads = [
    lead({ id: "won", status: "won", wonAt: "2026-06-20T00:00:00Z", monetaryValue: 5000 }),
    lead({ id: "lost", status: "lost", lostAt: "2026-06-21T00:00:00Z" }),
    lead({ id: "aband", status: "abandoned", lostAt: "2026-06-22T00:00:00Z" }),
    lead({ id: "open", monetaryValue: 2000 }),
    lead({ id: "old", createdAt: "2026-05-01T00:00:00Z", status: "won", wonAt: "2026-06-02T00:00:00Z", monetaryValue: 3000 }),
  ];
  const appts = [
    appt({ leadId: "won", startTime: "2026-06-06T10:00:00Z", bookedAt: "2026-06-05T12:00:00Z", ghlStatus: "showed" }),
    appt({ leadId: "won", startTime: "2026-06-10T10:00:00Z", bookedAt: "2026-06-06T12:00:00Z", ghlStatus: "showed" }),
    appt({ leadId: "open", startTime: "2026-06-07T10:00:00Z", bookedAt: "2026-05-30T12:00:00Z", ghlStatus: "noshow" }),
  ];
  const ds = dataset(leads, appts, {
    receipts: [{ id: "r", accountId: "A", leadId: "won", ghlContactId: null, amount: 2500, receivedAt: "2026-06-25T00:00:00Z", source: "ghl_payments" }],
  });
  const k = computeKpis(buildContext(ds, settings, filters, NOW));

  it("counts leads by creation date only", () => expect(k.newLeads).toBe(4));
  it("counts scheduled by booking date and completed by start date", () => {
    expect(k.callsScheduled[1]).toBe(1); // the no-show was booked in May
    expect(k.callsCompleted[1]).toBe(1);
    expect(k.callsCompleted[2]).toBe(1);
  });
  it("counts won by won date (includes a May lead won in June)", () => expect(k.closedDeals).toBe(2));
  it("counts abandoned as lost when configured", () => expect(k.lostOpportunities).toBe(2));
  it("win rate = won / (won + lost)", () => expect(k.winRate).toBeCloseTo(2 / 4));
  it("lead-to-close is a cohort metric", () => expect(k.leadToClose).toBeCloseTo(1 / 4));
  it("keeps closed-won value separate from collected revenue", () => {
    expect(k.closedWonValue).toBe(8000);
    expect(k.collectedRevenue).toBe(2500);
  });
  it("pipeline value only includes open opportunities", () => expect(k.pipelineValue).toBe(2000));
  it("no-show rate = no-shows / (completed + no-shows)", () => expect(k.noShowRate).toBeCloseTo(1 / 3));
  it("returns null, not 0, for rates with no denominator", () => {
    const empty = computeKpis(buildContext(dataset([]), settings, filters, NOW));
    expect(empty.winRate).toBeNull();
    expect(empty.noShowRate).toBeNull();
  });
});

describe("funnels", () => {
  it("call funnel is based on completed calls, not pipeline stage", () => {
    const L1 = lead({ id: "1", businessStage: "third_call" }); // in third-call stage but no calls done
    const L2 = lead({ id: "2" });
    const ds = dataset([L1, L2], [appt({ leadId: "2", startTime: "2026-06-06T10:00:00Z" })]);
    const ctx = buildContext(ds, settings, filters, NOW);
    const calls = computeCallFunnel(ctx).steps;
    expect(calls.find((s) => s.key === "first_call")!.count).toBe(1);
    expect(calls.find((s) => s.key === "third_call")!.count).toBe(0);
    const pipe = computePipelineFunnel(ctx).steps;
    expect(pipe.find((s) => s.key === "third_call")!.count).toBe(1);
  });

  it("computes progression, drop-off and average days between steps", () => {
    const L = lead({ id: "L", createdAt: "2026-06-01T00:00:00Z" });
    const M = lead({ id: "M", createdAt: "2026-06-01T00:00:00Z" });
    const ds = dataset([L, M], [appt({ leadId: "L", startTime: "2026-06-03T00:00:00Z" })]);
    const f = computeCallFunnel(buildContext(ds, settings, filters, NOW));
    const first = f.steps[1];
    expect(first.progression).toBeCloseTo(0.5);
    expect(first.dropOff).toBeCloseTo(0.5);
    expect(first.avgDaysInPrevious).toBeCloseTo(2);
  });

  it("a lost lead never reaches the won stage in the pipeline funnel", () => {
    const L = lead({ id: "L", status: "lost", businessStage: "closing" });
    const f = computePipelineFunnel(buildContext(dataset([L]), settings, filters, NOW));
    expect(f.steps.find((s) => s.key === "closing")!.count).toBe(0);
  });
});

describe("account isolation & rep merging", () => {
  it("filters every collection to the selected account", () => {
    const ds = dataset([lead({ id: "a" }), lead({ id: "b", accountId: "B", repId: "r3" })]);
    const ctx = buildContext(ds, settings, { ...filters, accountId: "B" }, NOW);
    expect(ctx.ds.leads.map((l) => l.id)).toEqual(["b"]);
    expect(ctx.ds.reps.every((r) => r.accountId === "B")).toBe(true);
  });

  it("merges the same person across sub-accounts by person key", () => {
    const ds = dataset([lead({ id: "a", repId: "r1" }), lead({ id: "b", accountId: "B", repId: "r2" }), lead({ id: "c", accountId: "B", repId: "r3" })]);
    const board = computeLeaderboard(buildContext(ds, settings, filters, NOW));
    expect(board.find((r) => r.key === "person:sam@x.com")!.leadsAssigned).toBe(2);
    expect(board).toHaveLength(2);
  });
});

describe("follow-ups", () => {
  it("flags new leads with no first call after the threshold", () => {
    const ds = dataset([lead({ id: "L", createdAt: "2026-06-20T00:00:00Z" }), lead({ id: "fresh", createdAt: "2026-06-30T00:00:00Z" })]);
    const items = computeFollowUps(buildContext(ds, settings, filters, NOW));
    expect(items.map((i) => i.leadId)).toContain("L");
    expect(items.map((i) => i.leadId)).not.toContain("fresh");
  });

  it("flags a missed call with nothing rebooked, but not when a future call exists", () => {
    const ds = dataset(
      [lead({ id: "miss" }), lead({ id: "rebooked" })],
      [
        appt({ leadId: "miss", startTime: "2026-06-20T10:00:00Z", ghlStatus: "noshow" }),
        appt({ leadId: "rebooked", startTime: "2026-06-20T10:00:00Z", ghlStatus: "noshow" }),
        appt({ leadId: "rebooked", startTime: "2026-07-03T10:00:00Z", ghlStatus: "confirmed" }),
      ],
    );
    const items = computeFollowUps(buildContext(ds, settings, filters, NOW));
    expect(items.find((i) => i.leadId === "miss")?.rule).toBe("missed_no_reschedule");
    expect(items.find((i) => i.leadId === "rebooked")).toBeUndefined();
  });

  it("ignores closed leads", () => {
    const ds = dataset([lead({ id: "L", createdAt: "2026-06-01T00:00:00Z", status: "won", wonAt: "2026-06-10T00:00:00Z" })]);
    expect(computeFollowUps(buildContext(ds, settings, filters, NOW))).toHaveLength(0);
  });
});
