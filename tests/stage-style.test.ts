import { describe, expect, it } from "vitest";
import { isLostLikeStage, stageCounts, stageTone } from "@/lib/stage-style";
import type { Lead, PipelineStage } from "@/lib/types";

const stage = (id: string, position: number, name: string, businessStage: PipelineStage["businessStage"], pipelineId = "p1"): PipelineStage => ({
  id, accountId: "a", pipelineId, ghlStageId: id, name, position, businessStage,
});
const lead = (id: string, stageId: string | null, pipelineId = "p1") => ({ id, stageId, pipelineId }) as Lead;

describe("stage style", () => {
  it("greys out lost-looking stages even when mapped", () => {
    expect(isLostLikeStage("Not Interested (Lost)")).toBe(true);
    expect(isLostLikeStage("Show (Not a candidate)")).toBe(true);
    expect(isLostLikeStage("Booked Appointment")).toBe(false);
    expect(stageTone(stage("s", 0, "Show (Not a candidate)", "first_call"))).toBe("slate");
    expect(stageTone(stage("s", 0, "Booked Surgery", "closing"))).toBe("emerald");
    expect(stageTone(stage("s", 0, "Something", null))).toBe("slate");
  });

  it("counts leads per stage in pipeline order, keeping empty stages and skipping unused pipelines", () => {
    const stages = [stage("b", 1, "No Answer", "new_lead"), stage("a", 0, "New Lead", "new_lead"), stage("c", 2, "Booked", "first_call"), stage("x", 0, "Other", null, "p2")];
    const out = stageCounts([lead("1", "a"), lead("2", "a"), lead("3", "c"), lead("4", null)], stages);
    expect(out.map((c) => [c.name, c.count])).toEqual([["New Lead", 2], ["No Answer", 0], ["Booked", 1]]);
  });

  it("merges same-named stages across sub-accounts", () => {
    const stages = [stage("a1", 0, "New Lead", "new_lead"), stage("a2", 0, "New Lead ", "new_lead", "p2"), stage("b2", 1, "Won", "closing", "p2")];
    const out = stageCounts([lead("1", "a1"), lead("2", "a2", "p2"), lead("3", "b2", "p2")], stages);
    expect(out).toEqual([
      { name: "New Lead", stageIds: ["a1", "a2"], count: 2, tone: "sky" },
      { name: "Won", stageIds: ["b2"], count: 1, tone: "emerald" },
    ]);
  });
});
