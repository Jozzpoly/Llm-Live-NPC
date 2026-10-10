import fixtureJson from "../evidence/r6-endogenous-standing-fulfillment-context.json?raw";
import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "./spc-next-life-context";

const fixture = JSON.parse(fixtureJson);

describe("R6 endogenous standing-fulfillment provider fixture", () => {
  it("keeps the exact factual-return reflection frame legal at the Worker boundary", () => {
    const sanitized = sanitizeSpcNextLifeContextWithDiagnostic(fixture);
    expect(sanitized.diagnostic).toBeNull();
    expect(sanitized.context).not.toBeNull();
    expect(sanitized.context?.resident.id).toBe("resident.oren");
    expect(sanitized.context?.currentRegionId).toBe("commons");
    expect(sanitized.context?.reasons).toHaveLength(1);
    expect(sanitized.context?.reasons[0]).toMatchObject({
      kind: "activity_completed",
      evidenceIds: ["task-outcome:e532948c40c51a4c:1276"],
    });
    expect(sanitized.context?.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);
    expect(sanitized.context?.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(sanitized.context?.life.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "matter-social-commitment:471529c708005f28",
        status: "active",
        activeRun: null,
        semanticIntent: {
          kind: "standing_social_commitment",
          goal: "wrócić do Neli w commons po zakończeniu sprawdzania warsztatu",
          counterpartyActorId: "resident.nela",
          commitment: "Tak. Sprawdzę warsztat i potem wrócę do ciebie tutaj.",
        },
      }),
      expect.objectContaining({
        status: "resolved",
        semanticIntent: {
          kind: "travel_region",
          goal: "return to Nela in the commons after completing the workshop check",
          targetRegionId: "commons",
        },
        lastOutcomeEvidence: expect.objectContaining({
          id: "task-outcome:e532948c40c51a4c:1276",
          kind: "task_outcome",
        }),
      }),
    ]));
  });
});
