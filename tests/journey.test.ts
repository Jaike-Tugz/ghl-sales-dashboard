import { describe, expect, it } from "vitest";
import { closedLabel, journeySummary, leadJourney } from "@/lib/metrics/journey";
import { needsAttention } from "@/lib/metrics/attention";
import type { PipelineStage } from "@/lib/types";
import { appt, lead, NOW } from "./fixtures";

// Stages from a real clinic pipeline.
const mk = (id: string, position: number, name: string, businessStage: PipelineStage["businessStage"]): PipelineStage => ({ id, accountId: "A", pipelineId: "p", ghlStageId: id, name, position, businessStage });
const S = {
  newLead: mk("new", 0, "New Lead 📞", "new_lead"),
  noAnswer: mk("na1", 1, "No Answer (#1) 📞", "new_lead"),
  warm: mk("warm", 3, "Warm Lead 🔥", "new_lead"),
  lost: mk("lost", 4, "Not Interested (Lost)", null),
  contacted: mk("cont", 5, "Contacted; needs Follow Up", "new_lead"),
  booked: mk("bk", 6, "Booked Appointment (In EHR) 🎊", "first_call"),
  noShow: mk("ns", 7, "No Show", "first_call"),
  showFu: mk("sfu", 8, "Show (needs Follow Up)", "first_call"),
  showNo: mk("snc", 9, "Show (Not a candidate)", "first_call"),
  surgery: mk("surg", 10, "Booked Surgery 🎉", "closing"),
};
const stages = Object.values(S);
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

describe("leadJourney", () => {
  it("reads progress from clinic stage names", () => {
    const j = (s: PipelineStage) => leadJourney(lead({ id: s.id, stageId: s.id }), s, []);
    expect(j(S.newLead)).toMatchObject({ contacted: false, booked: false });
    expect(j(S.noAnswer)).toMatchObject({ contacted: false });
    expect(j(S.warm)).toMatchObject({ contacted: true, booked: false });
    expect(j(S.lost)).toMatchObject({ contacted: true, booked: false });
    expect(j(S.booked)).toMatchObject({ booked: true, showed: false, noShow: false });
    expect(j(S.noShow)).toMatchObject({ booked: true, showed: false, noShow: true });
    expect(j(S.showFu)).toMatchObject({ booked: true, showed: true });
    expect(j(S.showNo)).toMatchObject({ showed: true, closed: false });
    expect(j(S.surgery)).toMatchObject({ contacted: true, booked: true, showed: true, closed: true });
  });

  it("counts an appointment as booked even from an early stage", () => {
    const l = lead({ id: "x", stageId: "new" });
    expect(leadJourney(l, S.newLead, [appt({ leadId: "x", startTime: ago(-1), ghlStatus: "confirmed" })]).booked).toBe(true);
    expect(leadJourney(l, S.newLead, [appt({ leadId: "x", startTime: ago(-1), ghlStatus: "cancelled" })]).booked).toBe(false);
  });
});

describe("journeySummary", () => {
  it("is cumulative, with step conversion and show rate", () => {
    const leads = [
      lead({ id: "1", stageId: "new" }),
      lead({ id: "2", stageId: "cont" }),
      lead({ id: "3", stageId: "bk" }),
      lead({ id: "4", stageId: "ns" }),
      lead({ id: "5", stageId: "sfu" }),
      lead({ id: "6", stageId: "surg" }),
    ];
    const s = journeySummary(leads, stages, []);
    expect(s.steps.map((x) => [x.label, x.count])).toEqual([["Leads", 6], ["Contacted", 5], ["Booked", 4], ["Showed", 2], ["Booked Surgery", 1]]);
    expect(s.steps[2].fromPrev).toBe(0.8);
    expect(s.noShows).toBe(1);
    expect(s.showRate).toBeCloseTo(2 / 3);
  });

  it("names the last step generically when several stages map to closing", () => {
    expect(closedLabel([...stages, mk("x", 11, "Paid", "closing")])).toBe("Closed / won");
  });
});

describe("needsAttention", () => {
  it("flags one most-urgent reason per open lead and skips lost or fresh ones", () => {
    const leads = [
      lead({ id: "fresh", stageId: "new", lastStageChangeAt: ago(1) }),
      lead({ id: "stale", stageId: "na1", lastStageChangeAt: ago(3) }),
      lead({ id: "soon", stageId: "na1", lastStageChangeAt: ago(5) }),
      lead({ id: "ns", stageId: "ns", lastStageChangeAt: ago(4) }),
      lead({ id: "fu", stageId: "sfu", lastStageChangeAt: ago(10) }),
      lead({ id: "lost", stageId: "lost", lastStageChangeAt: ago(30) }),
      lead({ id: "won", stageId: "surg", status: "won", lastStageChangeAt: ago(30) }),
      lead({ id: "ancient", stageId: "new", lastStageChangeAt: ago(200) }),
    ];
    const appts = [appt({ leadId: "soon", startTime: new Date(NOW + DAY).toISOString(), ghlStatus: "confirmed" })];
    const items = needsAttention(leads, stages, appts, NOW);
    expect(items.map((i) => [i.lead.id, i.kind])).toEqual([["soon", "upcoming"], ["stale", "not_contacted"], ["ns", "no_show"], ["fu", "follow_up"]]);
  });
});
