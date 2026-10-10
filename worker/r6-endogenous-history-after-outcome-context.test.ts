import fixtureJson from "../evidence/r6-endogenous-history-after-outcome-context.json?raw";
import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "./spc-next-life-context";

const fixture = JSON.parse(fixtureJson);

describe("R6 endogenous history-after-outcome live-provider fixture boundary", () => {
  it("preserves the exact no-fresh-command twin and its prior-life-only semantic difference", () => {
    const control = sanitizeSpcNextLifeContextWithDiagnostic(fixture.control);
    const history = sanitizeSpcNextLifeContextWithDiagnostic(fixture.history);

    expect(control.diagnostic).toBeNull();
    expect(history.diagnostic).toBeNull();
    expect(control.context).not.toBeNull();
    expect(history.context).not.toBeNull();

    for (const candidate of [control.context, history.context]) {
      expect(candidate?.currentRegionId).toBe("workshop");
      expect(candidate?.reasons).toHaveLength(1);
      expect(candidate?.reasons[0]).toMatchObject({ kind: "activity_completed" });
      expect(candidate?.reasons.some((reason: any) => reason.kind === "heard_speech")).toBe(false);
      expect(candidate?.life.body).toEqual({
        focusedRunId: null,
        deferredRunIds: [],
      });
    }

    const controlStanding = control.context?.life.matters.filter(
      (matter: any) => matter.semanticIntent?.kind === "standing_social_commitment",
    ) ?? [];
    const historyStanding = history.context?.life.matters.filter(
      (matter: any) => matter.semanticIntent?.kind === "standing_social_commitment",
    ) ?? [];
    expect(controlStanding).toHaveLength(0);
    expect(historyStanding).toHaveLength(1);
    expect(historyStanding[0]).toMatchObject({
      status: "active",
      activeRun: null,
      semanticIntent: {
        goal: "wrócić do Neli w commons po zakończeniu sprawdzania warsztatu",
        counterpartyActorId: "resident.nela",
        commitment: "Tak. Sprawdzę warsztat i potem wrócę do ciebie tutaj.",
      },
    });

    expect(stripContinuationHistory(control.context))
      .toEqual(stripContinuationHistory(history.context));
  });
});

function stripContinuationHistory(value: any) {
  const clone = JSON.parse(JSON.stringify(value));
  clone.life.matters = clone.life.matters
    .filter((matter: any) => matter.semanticIntent?.kind !== "standing_social_commitment")
    .map((matter: any) => {
      if (matter.semanticIntent?.kind !== "communicate_actor"
        || matter.semanticIntent.standingSocialCommitment === undefined) {
        return matter;
      }
      delete matter.semanticIntent.standingSocialCommitment;
      return matter;
    });
  return clone;
}
