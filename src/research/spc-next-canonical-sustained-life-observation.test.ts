import { describe, expect, it } from "vitest";
import { createFiveResidentMiraSustainedLifeSlice } from "../spc-next/five-resident-mira-sustained-life-slice";
import { captureSpcCanonicalEvidenceSnapshot } from "./spc-next-canonical-evidence-snapshot";

const MIRA_ID = "resident.mira";
const MAX_STEPS = 1_400;

describe("SPC canonical sustained-life observation", () => {
  it("observes Mira's exact active run without creating or stealing execution authority", () => {
    const slice = createFiveResidentMiraSustainedLifeSlice();

    let step = slice.advanceOneWorldTick();
    let guard = 1;
    while (step.status !== "chapter_started" && guard < MAX_STEPS) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }

    expect(guard).toBeLessThan(MAX_STEPS);
    expect(step.status).toBe("chapter_started");
    if (step.status !== "chapter_started") throw new Error(`Mira chapter did not start: ${step.status}`);

    const focusedRunBefore = slice.executionFocus.focusedRun();
    expect(focusedRunBefore).toBe(step.runId);
    expect(slice.kernel.canRunMutateWorld(step.runId)).toBe(true);

    const snapshot = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "browser-mira-sustained-life",
      residentId: MIRA_ID,
      matterId: step.matterId,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: null,
      authority: null,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      scenarioId: "browser-mira-sustained-life",
      residentPrivate: {
        residentId: MIRA_ID,
        materialKnowledge: [],
      },
      continuity: {
        matter: {
          id: step.matterId,
          status: "active",
          activeRunId: step.runId,
        },
        activeRunBinding: {
          runId: step.runId,
          matterId: step.matterId,
        },
        activeRunCanMutateWorld: true,
      },
      causalProvenance: {
        residentWorldActionFacts: [],
      },
    });

    expect(slice.executionFocus.focusedRun()).toBe(focusedRunBefore);
    expect(slice.kernel.canRunMutateWorld(step.runId)).toBe(true);
  });
});
