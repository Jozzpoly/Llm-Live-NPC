import { describe, expect, it } from "vitest";
import { parseCognitionProposal } from "./contracts";
import type { CognitionContext, CognitionProposal } from "./contracts";

const proposal = (patch: Partial<CognitionProposal> = {}): CognitionProposal => ({
  version: 1,
  speech: null,
  beliefs: [],
  concerns: [],
  plan: null,
  activityDisposition: null,
  reviewAfterSeconds: 300,
  ...patch,
});

function context(): CognitionContext {
  return {
    version: 1,
    resident: { id: "npc.001", name: "Mira", background: "test" },
    tick: 1, reasons: [],
    observations: [{ id: "player.jozz", label: "Jozz", kind: "player", position: { x: 0, y: 0 },
      seenAtTick: 1, visible: true, source: "sight" }],
    experiences: [], beliefs: [],
    concerns: [{ id: "shared-place", description: "shared", reason: "test", status: "open", evidenceIds: [] }],
    realization: null, suspendedRealization: null, places: [],
  };
}

describe("continuity proposal admission regression", () => {
  it("accepts continue plus a new method only when no bodily method is currently running", () => {
    const base = context();
    const candidate = proposal({
      activityDisposition: { kind: "continue", reason: "Kontynuuję tę samą sprawę nowym sposobem.", basedOnRealizationId: null },
      plan: { concernId: "shared-place", steps: [{ skill: "communicate", targetId: "player.jozz", text: "W czym mogę pomóc?", mode: "normal" }] },
    });
    expect(parseCognitionProposal(candidate, base)).not.toBeNull();

    const running: CognitionContext = structuredClone(base);
    running.realization = { id: "realization.running", concernId: "shared-place",
      steps: [{ skill: "pause", durationSeconds: 30 }], index: 0, status: "running", outcome: null };
    const conflicting = structuredClone(candidate);
    conflicting.activityDisposition!.basedOnRealizationId = running.realization.id;
    expect(parseCognitionProposal(conflicting, running)).toBeNull();

    running.realization.status = "completed";
    running.realization.index = 1;
    expect(parseCognitionProposal(conflicting, running)).not.toBeNull();
  });
});
