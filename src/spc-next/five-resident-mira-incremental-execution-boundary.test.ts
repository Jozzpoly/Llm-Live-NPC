import { describe, expect, it } from "vitest";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";

const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const MIRA_ID = "resident.mira";

describe("Mira causal incremental execution boundary", () => {
  it("advances the exact focused executor one World tick at a time without surrendering run authority", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    const advance = (slice as unknown as {
      advanceFocusedMatterOneWorldTick?: () => { status: string; runId?: string };
    }).advanceFocusedMatterOneWorldTick;

    // RED boundary: the causal specimen currently exposes only an all-the-way-to-
    // completion helper, so cognition cannot yet be interleaved with real execution.
    expect(typeof advance).toBe("function");
    if (!advance) return;

    const before = miraPosition(slice);
    for (let step = 0; step < 4; step += 1) {
      const result = advance();
      expect(result).toMatchObject({ status: "running", runId: WORKSHOP.runId });
      expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
      expect(slice.kernel.canRunMutateWorld(WORKSHOP.runId)).toBe(true);
    }
    const after = miraPosition(slice);
    expect(after).not.toEqual(before);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.1);
  });
});

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}
