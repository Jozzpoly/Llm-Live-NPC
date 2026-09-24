import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "./spc-next-life-context";

const fixture = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-history-choice-twin-context.json", import.meta.url),
    "utf8",
  ),
);

describe("R6 history-choice live-provider fixture boundary", () => {
  it("keeps both exact twin contexts legal and different only by resident-owned life history", () => {
    const control = sanitizeSpcNextLifeContextWithDiagnostic(fixture.control);
    const history = sanitizeSpcNextLifeContextWithDiagnostic(fixture.history);

    expect(control.diagnostic).toBeNull();
    expect(history.diagnostic).toBeNull();
    expect(control.context).not.toBeNull();
    expect(history.context).not.toBeNull();

    expect(control.context?.life.matters).toEqual([]);
    expect(history.context?.life.matters).toHaveLength(1);
    expect(history.context?.life.matters[0]).toMatchObject({
      status: "active",
      activeRun: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        counterpartyActorId: "resident.nela",
        commitment: "Tak, zostanę tutaj przy tobie jeszcze chwilę.",
      },
    });

    const controlTwin = JSON.parse(JSON.stringify(control.context));
    const historyTwin = JSON.parse(JSON.stringify(history.context));
    controlTwin.life.matters = [];
    historyTwin.life.matters = [];
    expect(historyTwin).toEqual(controlTwin);
  });
});
