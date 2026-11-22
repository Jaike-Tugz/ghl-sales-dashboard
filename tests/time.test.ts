import { describe, expect, it } from "vitest";
import { bucketKey, bucketsBetween, inRange, localDate, rangeFromDates, startOfLocalDay } from "@/lib/time";

describe("timezone boundaries", () => {
  it("UTC midnight", () => expect(new Date(startOfLocalDay("2026-06-01", "UTC")).toISOString()).toBe("2026-06-01T00:00:00.000Z"));
  it("Sydney midnight (AEST, +10)", () => expect(new Date(startOfLocalDay("2026-06-01", "Australia/Sydney")).toISOString()).toBe("2026-05-31T14:00:00.000Z"));
  it("Sydney midnight in DST (AEDT, +11)", () => expect(new Date(startOfLocalDay("2026-01-15", "Australia/Sydney")).toISOString()).toBe("2026-01-14T13:00:00.000Z"));
  it("New York across spring-forward", () => {
    expect(new Date(startOfLocalDay("2026-03-08", "America/New_York")).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(new Date(startOfLocalDay("2026-03-09", "America/New_York")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
  it("range is inclusive of the end date and half-open", () => {
    const r = rangeFromDates("2026-06-01", "2026-06-30", "Australia/Sydney");
    expect(inRange("2026-06-30T13:59:59Z", r)).toBe(true); // 23:59:59 Sydney on 30 Jun
    expect(inRange("2026-06-30T14:00:00Z", r)).toBe(false); // 00:00 Sydney on 1 Jul
    expect(inRange("2026-05-31T13:59:59Z", r)).toBe(false);
  });
  it("local date of an instant", () => expect(localDate("2026-06-30T15:00:00Z", "Australia/Sydney")).toBe("2026-07-01"));
  it("weekly buckets start on Monday", () => {
    expect(bucketKey("2026-11-22", "week")).toBe("2026-11-16");
    expect(bucketsBetween("2026-11-01", "2026-11-30", "month")).toEqual(["2026-11"]);
  });
});
