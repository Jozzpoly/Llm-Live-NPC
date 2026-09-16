import { describe, expect, it } from "vitest";
import { IDA_MESSAGE_MATTER_ID, createFiveResidentIdaMessageDeliverySlice } from "../spc-next/five-resident-ida-message-delivery-slice";
import { captureSpcCanonicalEvidenceSnapshot } from "./spc-next-canonical-evidence-snapshot";

function captureIda(slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>) {
  return captureSpcCanonicalEvidenceSnapshot({
    scenarioId: "test-ida-terminal-evidence",
    residentId: "resident.ida",
    matterId: IDA_MESSAGE_MATTER_ID,
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: null,
    authority: slice.authority,
  });
}

describe("SPC canonical outcome evidence lifecycle", () => {
  it("separates terminal live-pin cleanup from bounded historical audit evidence", () => {
    const slice = createFiveResidentIdaMessageDeliverySlice();
    const initial = captureIda(slice);
    expect(initial.continuity.matter?.status).toBe("active");
    expect(initial.continuity.lastOutcomeEvidence).toBeNull();
    expect(initial.continuity.historicalOutcomeEvidence).toBeNull();

    let deliveredId: string | null = null;
    for (let step = 0; step < 1_500; step += 1) {
      const result = slice.advanceOneWorldTick();
      if (result.status === "delivered") {
        deliveredId = result.local.occurrence.id;
        break;
      }
    }

    expect(deliveredId).not.toBeNull();
    const terminal = captureIda(slice);
    expect(terminal.continuity.matter?.status).toBe("resolved");
    expect(terminal.continuity.matter?.activeRunId).toBeNull();
    expect(terminal.continuity.activeRunCanMutateWorld).toBe(false);

    // Terminalization deliberately releases live evidence pins. The canonical
    // audit projection must not pretend that the pin still owns live authority.
    expect(terminal.continuity.lastOutcomeEvidence).toBeNull();

    // The bounded recent-evidence journal still lets the observer join the
    // terminal matter to the exact factual World outcome that caused resolution.
    expect(terminal.continuity.historicalOutcomeEvidence).toMatchObject({
      id: terminal.continuity.matter?.lastOutcomeEvidenceId,
      kind: "task_outcome",
    });
    expect(terminal.continuity.historicalOutcomeEvidence?.summary).toContain(deliveredId);
  });
});
