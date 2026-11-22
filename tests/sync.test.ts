import { generateKeyPairSync, createSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { closeDates, isStale, mapOpportunity, planReschedule, planTransition, type AccountRefs } from "@/lib/sync/mappers";
import { dedupeKey, isFresh, parseEnvelope, verifyGhlSignature } from "@/lib/ghl/webhook";
import { createGhlClient } from "@/lib/ghl/client";
import { toCsv } from "@/lib/csv";

const refs: AccountRefs = {
  accountId: "acc",
  pipelines: new Map([["P", "pid"]]),
  stages: new Map([["S1", { id: "s1", businessStage: "new_lead" }], ["S2", { id: "s2", businessStage: "first_call" }]]),
  reps: new Map([["U", "rep"]]),
  calendars: new Map(),
};

describe("webhook signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ type: "OpportunityCreate", locationId: "L", webhookId: "w1", timestamp: new Date().toISOString() });
  const sig = createSign("SHA256").update(body).end().sign(privateKey, "base64");

  it("accepts a valid RSA-SHA256 signature over the raw body", () => expect(verifyGhlSignature(body, sig, pem)).toBe(true));
  it("rejects a tampered body", () => expect(verifyGhlSignature(body.replace("L", "X"), sig, pem)).toBe(false));
  it("rejects a missing signature", () => expect(verifyGhlSignature(body, null, pem)).toBe(false));
  it("rejects garbage", () => expect(verifyGhlSignature(body, "not-base64!!", pem)).toBe(false));
});

describe("webhook dedupe & replay", () => {
  it("dedupes on webhookId, else body hash", () => {
    const a = '{"type":"X","webhookId":"abc"}';
    expect(dedupeKey(parseEnvelope(a), a)).toBe("wh:abc");
    const b = '{"type":"X"}';
    expect(dedupeKey(parseEnvelope(b), b)).toBe(dedupeKey(parseEnvelope(b), b));
    expect(dedupeKey(parseEnvelope(b), b)).toMatch(/^sha256:/);
  });
  it("rejects stale timestamps", () => {
    const now = Date.parse("2026-06-01T00:10:00Z");
    expect(isFresh(parseEnvelope('{"type":"X","timestamp":"2026-06-01T00:00:00Z"}'), 300, now)).toBe(false);
    expect(isFresh(parseEnvelope('{"type":"X","timestamp":"2026-06-01T00:08:00Z"}'), 300, now)).toBe(true);
  });
  it("rejects non-object bodies", () => expect(() => parseEnvelope("[1]")).toThrow());
});

describe("opportunity mapping", () => {
  const opp = { id: "O", pipelineId: "P", pipelineStageId: "S2", assignedTo: "U", status: "won", monetaryValue: 900, createdAt: "2026-01-01T00:00:00Z", lastStatusChangeAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" };
  const row = mapOpportunity(opp, refs);
  it("preserves GHL ids and resolves references within the account", () => {
    expect(row).toMatchObject({ account_id: "acc", ghl_opportunity_id: "O", pipeline_id: "pid", stage_id: "s2", rep_id: "rep", monetary_value: 900 });
  });
  it("captures won date once from lastStatusChangeAt", () => {
    expect(closeDates(null, row, "2026-03-01T00:00:00Z").won_at).toBe("2026-02-01T00:00:00.000Z");
    const existing = { id: "x", ghl_stage_id: "S2", status: "won", won_at: "2026-01-15T00:00:00.000Z", lost_at: null, ghl_updated_at: null };
    expect(closeDates(existing, row, "2026-03-01T00:00:00Z").won_at).toBe("2026-01-15T00:00:00.000Z");
  });
  it("clears close dates when re-opened", () => expect(closeDates(null, { ...row, status: "open" }, "x")).toEqual({ won_at: null, lost_at: null }));
  it("detects out-of-order (stale) updates", () => {
    expect(isStale("2026-02-02T00:00:00Z", "2026-02-01T00:00:00Z")).toBe(true);
    expect(isStale("2026-02-01T00:00:00Z", "2026-02-01T00:00:00Z")).toBe(false);
    expect(isStale(null, "2026-02-01T00:00:00Z")).toBe(false);
  });
});

describe("stage transitions", () => {
  const row = mapOpportunity({ id: "O", pipelineStageId: "S2", createdAt: "2026-01-01T00:00:00Z", lastStageChangeAt: "2026-01-05T00:00:00Z" }, refs);
  it("first sight via reconcile is a labelled snapshot", () => expect(planTransition(null, row, "reconcile", "now")?.source).toBe("snapshot"));
  it("OpportunityCreate webhook is observed", () => expect(planTransition(null, row, "webhook", "now", true)).toMatchObject({ source: "webhook", entered_at: "2026-01-01T00:00:00.000Z" }));
  it("no transition when the stage is unchanged (idempotent re-delivery)", () => {
    const existing = { id: "x", ghl_stage_id: "S2", status: "open", won_at: null, lost_at: null, ghl_updated_at: null };
    expect(planTransition(existing, row, "webhook", "now")).toBeNull();
  });
  it("records a diff found by reconciliation", () => {
    const existing = { id: "x", ghl_stage_id: "S1", status: "open", won_at: null, lost_at: null, ghl_updated_at: null };
    expect(planTransition(existing, row, "reconcile", "now")).toMatchObject({ source: "reconcile_diff", from_ghl_stage_id: "S1", to_ghl_stage_id: "S2" });
  });
});

describe("reschedules", () => {
  const existing = { id: "a", start_time: "2026-01-01T10:00:00Z", original_start_time: null, reschedule_count: 0, ghl_updated_at: null };
  it("counts a moved start time once", () => expect(planReschedule(existing, "2026-01-02T10:00:00Z", "confirmed")).toEqual({ original_start_time: "2026-01-01T10:00:00Z", reschedule_count: 1 }));
  it("does not count a re-delivered identical event", () => expect(planReschedule(existing, "2026-01-01T10:00:00.000Z", "confirmed").reschedule_count).toBe(0));
  it("does not count a cancellation as a reschedule", () => expect(planReschedule(existing, "2026-01-02T10:00:00Z", "cancelled").reschedule_count).toBe(0));
});

describe("GHL client safety", () => {
  it("sends the documented headers and retries on 429", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    let n = 0;
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), headers: init.headers as Record<string, string> });
      n++;
      if (n === 1) return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = createGhlClient("LOC", async () => "tok");
    const r = await c.get<{ ok: number }>("/opportunities/pipelines", { query: { locationId: "LOC" }, fetchImpl, maxRetries: 2 } as never);
    expect(r.ok).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://services.leadconnectorhq.com/opportunities/pipelines?locationId=LOC");
    expect(calls[0].headers).toMatchObject({ Authorization: "Bearer tok", Version: "2021-07-28" });
  });
  it("exposes no write methods", () => {
    const c = createGhlClient("LOC", async () => "tok") as unknown as Record<string, unknown>;
    expect(c.post).toBeUndefined();
    expect(c.put).toBeUndefined();
    expect(c.delete).toBeUndefined();
  });
});

describe("csv", () => {
  it("escapes and neutralises formulas", () => {
    expect(toCsv(["a", "b"], [["=SUM(A1)", 'x,"y"'], [-5, null]])).toBe(`a,b\r\n'=SUM(A1),"x,""y"""\r\n-5,\r\n`);
  });
});
