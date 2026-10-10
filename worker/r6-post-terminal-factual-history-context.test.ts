import fixtureJson from "../evidence/r6-post-terminal-factual-history-context.json?raw";
import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "./spc-next-life-context";

const fixture = JSON.parse(fixtureJson);
const HISTORY_MATTER_ID = "matter.janek.r6.post-terminal-friction";

describe("R6 post-terminal factual-history live-provider fixture boundary", () => {
  it("preserves one matched current reacquisition frame plus one resolved factual self-episode", () => {
    const control = sanitizeSpcNextLifeContextWithDiagnostic(fixture.control);
    const history = sanitizeSpcNextLifeContextWithDiagnostic(fixture.history);

    expect(control.diagnostic).toBeNull();
    expect(history.diagnostic).toBeNull();
    expect(control.context).not.toBeNull();
    expect(history.context).not.toBeNull();

    for (const candidate of [control.context, history.context]) {
      expect(candidate?.resident.id).toBe("resident.janek");
      expect(candidate?.currentRegionId).toBe("yard");
      expect(candidate?.self).toBeUndefined();
      expect(candidate?.reasons).toHaveLength(1);
      expect(candidate?.reasons[0]).toMatchObject({
        id: "reason:resident.janek:r6:material-reacquired",
        kind: "direct_world_change",
      });
      expect(candidate?.reasons.some((reason: any) => reason.kind === "heard_speech")).toBe(false);
      expect(candidate?.life.body).toEqual({
        focusedRunId: null,
        deferredRunIds: [],
      });
    }

    expect(control.context?.reasons[0]).toEqual(history.context?.reasons[0]);

    const controlHistory = control.context?.life.matters.filter(
      (matter: any) => matter.id === HISTORY_MATTER_ID,
    ) ?? [];
    const livedHistory = history.context?.life.matters.filter(
      (matter: any) => matter.id === HISTORY_MATTER_ID,
    ) ?? [];

    expect(controlHistory).toHaveLength(0);
    expect(livedHistory).toHaveLength(1);
    expect(livedHistory[0]).toMatchObject({
      status: "resolved",
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: "crate.r6.post-terminal",
      },
      originEvidence: null,
      semanticEvidence: null,
      lastOutcomeEvidence: {
        kind: "task_outcome",
        summary: expect.stringContaining("object_unavailable"),
        sourceRunId: "run.janek.r6.post-terminal-friction",
      },
      activeRun: null,
    });

    expect(stripHistory(control.context)).toEqual(stripHistory(history.context));
  });
});

function stripHistory(value: any) {
  const clone = JSON.parse(JSON.stringify(value));
  clone.life.matters = clone.life.matters.filter(
    (matter: any) => matter.id !== HISTORY_MATTER_ID,
  );
  return clone;
}
