import { describe, expect, it } from "vitest";
import { createR5MiraSemanticEscalationSlice } from "./r5-mira-semantic-escalation-slice";

describe("R6 standing continuity donor characterization", () => {
  it("shows that the existing continuity kernel can preserve an active non-body matter, but lacks a structured social-commitment meaning", () => {
    const slice = createR5MiraSemanticEscalationSlice(async () => {
      throw new Error("provider must not run in standing-continuity characterization");
    });

    const origin = slice.life.kernel.recordEvidence({
      id: "evidence.mira.r6.self-authored-speech-placeholder",
      tick: slice.world.tick,
      kind: "life_context",
      summary: "Characterization placeholder for an already-factual resident-owned social act.",
    });

    const matter = slice.life.kernel.openMatter({
      id: "matter.mira.r6.standing-social-meaning",
      originEvidenceId: origin.id,
      semanticCourse: "I committed myself to remain available to Ida for a while.",
      // Deliberately null: current ResidentMatterIntent has no structured standing
      // social/promise meaning. The kernel can preserve the matter, but the meaning
      // would currently survive only as prose.
      semanticIntent: null,
    });
    slice.life.matterScope.track(matter.id);

    const life = slice.life.currentLifeView();
    expect(life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(life.matters).toEqual([
      expect.objectContaining({
        id: matter.id,
        status: "active",
        semanticCourse: "I committed myself to remain available to Ida for a while.",
        semanticIntent: null,
        activeRun: null,
      }),
    ]);
    expect(slice.life.focus.focusedRun()).toBeNull();
    expect(slice.life.arbitrator.deferredRunIds()).toEqual([]);

    const committed = slice.life.snapshotCommittedLife();
    expect(committed.execution).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(committed.kernel.matters).toEqual([
      expect.objectContaining({
        id: matter.id,
        status: "active",
        semanticIntent: null,
        activeRunId: null,
      }),
    ]);

    // Existing continuity already supports the required persistence/body separation.
    // The missing seam is semantic: no current ResidentMatterIntent kind can say
    // "this resident now carries a standing social commitment toward actor X".
    expect(committed.kernel.matters[0]?.semanticCourse).toContain("Ida");
    expect(committed.kernel.matters[0]?.semanticIntent).toBeNull();
  });
});
