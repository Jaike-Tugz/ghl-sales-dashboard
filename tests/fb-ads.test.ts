import { describe, expect, it } from "vitest";
import { campaignSeries, FB_LEVELS, isFacebookLead } from "@/lib/metrics/fb-ads";
import { breakdownBy } from "@/lib/metrics/sources";
import { rangeFromDates } from "@/lib/time";
import { EMPTY_ATTRIBUTION, type Lead } from "@/lib/types";
import { lead } from "./fixtures";

const fb = (id: string, campaign: string, adset: string, ad: string, createdAt = "2026-06-05T10:00:00Z"): Lead =>
  lead({ id, createdAt, attribution: { ...EMPTY_ATTRIBUTION, utmSource: "facebook", utmCampaign: campaign, utmMedium: adset, utmContent: ad } });

describe("isFacebookLead", () => {
  it("recognises Facebook by UTM source, GHL medium, ad id, contact source or opportunity source", () => {
    expect(isFacebookLead(fb("1", "C", "S", "A"))).toBe(true);
    expect(isFacebookLead(lead({ id: "2", attribution: { ...EMPTY_ATTRIBUTION, medium: "facebook" } }))).toBe(true);
    expect(isFacebookLead(lead({ id: "3", attribution: { ...EMPTY_ATTRIBUTION, adId: "123" } }))).toBe(true);
    expect(isFacebookLead(lead({ id: "4", contactSource: "Facebook - EVO ICL V2" }))).toBe(true);
    expect(isFacebookLead(lead({ id: "5", source: "FB Form" }))).toBe(true);
    expect(isFacebookLead(lead({ id: "6", source: "Google Ads", attribution: { ...EMPTY_ATTRIBUTION, utmSource: "google" } }))).toBe(false);
    // "fbx" or a campaign merely mentioning facebook is not enough
    expect(isFacebookLead(lead({ id: "7", source: "Website", attribution: { ...EMPTY_ATTRIBUTION, utmSource: "fbx", utmCampaign: "facebook retargeting" } }))).toBe(false);
  });
});

describe("FB breakdown", () => {
  const leads = [fb("1", "EVO", "EVO | Ads", "EVO 8"), fb("2", "EVO", "EVO | Ads", "EVO 8"), fb("3", "CLE", "CLE | Ads", "EVO 8"), fb("4", "EVO", "EVO | Ads", "EVO 6")];

  it("groups ads and labels each with its most common campaign", () => {
    const ad = FB_LEVELS.find((l) => l.key === "ad")!;
    const rows = breakdownBy(leads, [], [], ad.get, ad.parent ?? undefined);
    expect(rows.map((r) => [r.label, r.leads, r.parent])).toEqual([["EVO 8", 3, "EVO"], ["EVO 6", 1, "EVO"]]);
  });

  it("builds one series per top campaign and folds the rest into Other", () => {
    const range = rangeFromDates("2026-06-01", "2026-06-30", "UTC");
    const many = [...leads, fb("5", "X", "s", "a"), fb("6", "Y", "s", "a", "2026-06-20T10:00:00Z"), fb("7", "Z", "s", "a", "2026-07-20T10:00:00Z")];
    const { series, data } = campaignSeries(many, { from: "2026-06-01", to: "2026-06-30", granularity: "month" }, range, "UTC", 2);
    expect(series.map((s) => s.label)).toEqual(["EVO", "CLE", "Other"]);
    expect(data).toEqual([{ bucket: data[0].bucket, s0: 3, s1: 1, s2: 2 }]);
  });
});
