import { bucketKey, bucketsBetween, inRange, localDate, type Range } from "../time";
import type { Filters, Lead } from "../types";

/** A lead that came from Facebook/Instagram ads, by UTM source, GHL channel or contact source. */
export function isFacebookLead(l: Lead): boolean {
  const a = l.attribution;
  const fb = /^(facebook|fb|instagram|ig|meta)$/i;
  return (
    (!!a.utmSource && fb.test(a.utmSource.trim())) ||
    (!!a.medium && fb.test(a.medium.trim())) ||
    !!a.adId ||
    /^(facebook|instagram|fb)\b/i.test(l.contactSource ?? "") ||
    /^(fb|facebook)\b/i.test(l.source ?? "")
  );
}

/** Ad hierarchy levels, read from the UTM template Meta fills in ({{campaign.name}}, {{adset.name}}, {{ad.name}}). */
export const FB_LEVELS = [
  { key: "campaign", label: "Campaign", get: (l: Lead) => l.attribution.utmCampaign ?? l.attribution.campaign, parent: null },
  { key: "adset", label: "Ad set", get: (l: Lead) => l.attribution.utmMedium, parent: (l: Lead) => l.attribution.utmCampaign ?? l.attribution.campaign },
  { key: "ad", label: "Ad", get: (l: Lead) => l.attribution.utmContent, parent: (l: Lead) => l.attribution.utmCampaign ?? l.attribution.campaign },
  { key: "form", label: "Lead form", get: (l: Lead) => l.attribution.formName ?? l.source, parent: null },
] as const;

export type FbLevel = (typeof FB_LEVELS)[number]["key"];

/**
 * New leads per time bucket, one series per campaign (the top `max` by volume,
 * the rest summed as "Other"). Keys are s0, s1, … so labels can contain anything.
 */
export function campaignSeries(leads: Lead[], filters: Pick<Filters, "from" | "to" | "granularity">, range: Range, timeZone: string, max = 4) {
  const camp = (l: Lead) => FB_LEVELS[0].get(l) ?? "(not set)";
  const inR = leads.filter((l) => inRange(l.createdAt, range));
  const totals = new Map<string, number>();
  for (const l of inR) totals.set(camp(l), (totals.get(camp(l)) ?? 0) + 1);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const top = ranked.slice(0, max);
  const hasOther = ranked.length > max;
  const series = [...top, ...(hasOther ? ["Other"] : [])].map((label, i) => ({ key: `s${i}`, label }));
  const keyOf = new Map(series.map((s) => [s.label, s.key]));
  const points = new Map(bucketsBetween(filters.from, filters.to, filters.granularity).map((b) => [b, Object.fromEntries([["bucket", b], ...series.map((s) => [s.key, 0])]) as Record<string, number | string>]));
  for (const l of inR) {
    const p = points.get(bucketKey(localDate(l.createdAt, timeZone), filters.granularity));
    const k = keyOf.get(camp(l)) ?? keyOf.get("Other");
    if (p && k) p[k] = (p[k] as number) + 1;
  }
  return { series, data: [...points.values()] };
}
