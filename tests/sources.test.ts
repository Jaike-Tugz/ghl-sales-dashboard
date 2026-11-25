import { describe, expect, it } from "vitest";
import { coverage, NOT_SET, sourceBreakdown } from "@/lib/metrics/sources";
import { mapContactAttribution } from "@/lib/sync/mappers";
import { EMPTY_ATTRIBUTION, type PipelineStage } from "@/lib/types";
import { appt, lead } from "./fixtures";

const lostStage: PipelineStage = { id: "lost", accountId: "A", pipelineId: "p", ghlStageId: "lost", name: "Not Interested (Lost)", position: 4, businessStage: null };

describe("sourceBreakdown", () => {
  const leads = [
    lead({ id: "1", contactSource: "Facebook - EVO V2", attribution: { ...EMPTY_ATTRIBUTION, utmSource: "fb", utmCampaign: "EVO V2" } }),
    lead({ id: "2", contactSource: "Facebook - EVO V2", attribution: { ...EMPTY_ATTRIBUTION, utmSource: "fb", utmCampaign: "EVO V2" }, stageId: "lost" }),
    lead({ id: "3", contactSource: "Facebook - CLE V1", attribution: { ...EMPTY_ATTRIBUTION, utmSource: "fb", campaign: "CLE V1" }, status: "won" }),
    lead({ id: "4", contactSource: null, source: "FB Form" }),
  ];
  const appts = [
    appt({ leadId: "1", startTime: "2026-06-10T10:00:00Z", ghlStatus: "confirmed" }),
    appt({ leadId: "3", startTime: "2026-06-10T10:00:00Z", ghlStatus: "showed" }),
    appt({ leadId: "4", startTime: "2026-06-10T10:00:00Z", ghlStatus: "cancelled" }),
  ];

  it("groups by contact source, falling back to the opportunity source", () => {
    const rows = sourceBreakdown(leads, appts, [lostStage], "source");
    expect(rows.map((r) => [r.label, r.leads, r.booked, r.won, r.lost])).toEqual([
      ["Facebook - EVO V2", 2, 1, 0, 1],
      ["Facebook - CLE V1", 1, 1, 1, 0],
      ["FB Form", 1, 0, 0, 0],
    ]);
    expect(rows[0].bookedRate).toBe(0.5);
  });

  it("puts missing values under (not set), last, and uses GHL's campaign when utm_campaign is blank", () => {
    const rows = sourceBreakdown(leads, appts, [lostStage], "utm_campaign");
    expect(rows.map((r) => [r.label, r.leads])).toEqual([["EVO V2", 2], ["CLE V1", 1], [NOT_SET, 1]]);
    expect(coverage(leads, "utm_source")).toBe(0.75);
    expect(coverage([], "utm_source")).toBeNull();
  });
});

describe("mapContactAttribution", () => {
  it("returns null when the payload has no attribution, so stored values are kept", () => {
    expect(mapContactAttribution({ id: "c" })).toBeNull();
  });

  it("prefers first touch per field and falls back to last touch", () => {
    const row = mapContactAttribution({
      id: "c",
      attributionSource: { utmSource: "fb", utmMedium: " ", medium: "facebook", sessionSource: "Paid Social" },
      lastAttributionSource: { utmSource: "google", utmMedium: "paid_social", utmCampaign: "EVO ICL V2" },
    });
    expect(row).toMatchObject({ utm_source: "fb", utm_medium: "paid_social", utm_campaign: "EVO ICL V2", attribution_medium: "facebook", session_source: "Paid Social", utm_content: null });
    expect(row?.attribution?.first?.utmSource).toBe("fb");
  });
});
