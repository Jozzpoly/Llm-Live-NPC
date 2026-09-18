import { describe, expect, it } from "vitest";
import {
  ResidentContinuityKernel,
  type ResidentMatterIntent,
} from "./resident-continuity-kernel";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

describe("resident durable communicate-actor intent", () => {
  it("persists recipient + message meaning across continuity and life cognition without execution/contact details", () => {
    const kernel = new ResidentContinuityKernel();
    kernel.recordEvidence({
      id: "evidence:ida:accepted-message",
      tick: 40,
      kind: "accepted_cognition_commitment",
      summary: "Ida accepted responsibility to tell Janek a concrete message.",
    });

    const intent = {
      kind: "communicate_actor",
      goal: "tell Janek what Mira asked me to pass on",
      targetActorId: "resident.janek",
      text: "Mira says the field well needs checking before dusk.",
    } satisfies ResidentMatterIntent;

    const opened = kernel.openMatter({
      id: "matter.ida.message-to-janek",
      originEvidenceId: "evidence:ida:accepted-message",
      semanticCourse: "deliver the accepted message to Janek",
      semanticIntent: intent,
    });
    expect(opened.semanticIntent).toEqual(intent);

    const ticket = kernel.beginSemanticProposal(opened.id);
    const revised = {
      kind: "communicate_actor",
      goal: "deliver the same accepted message to Janek when I can physically reach him",
      targetActorId: "resident.janek",
      text: "Mira says the field well needs checking before dusk.",
    } satisfies ResidentMatterIntent;
    const committed = kernel.commitSemanticProposal(ticket, {
      semanticCourse: "find Janek from my own contact evidence and deliver the accepted message",
      semanticIntent: revised,
    });
    expect(committed.status).toBe("applied");
    if (committed.status !== "applied") return;

    const focus = new ResidentExecutionFocusAuthority(kernel);
    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      matterIds: [opened.id],
    });
    expect(life.matters[0]?.semanticIntent).toEqual(revised);
    expect(life.matters[0]).not.toHaveProperty("lastKnownPosition");
    expect(life.matters[0]).not.toHaveProperty("recipientCurrentlyVisible");
    expect(life.matters[0]).not.toHaveProperty("routeRegionIds");
  });

  it("rejects empty recipient or message instead of storing unusable social meaning", () => {
    const kernel = new ResidentContinuityKernel();
    kernel.recordEvidence({
      id: "evidence:ida:invalid-message",
      tick: 1,
      kind: "test",
      summary: "invalid message intent fixture",
    });

    expect(() => kernel.openMatter({
      id: "matter.ida.invalid-recipient",
      originEvidenceId: "evidence:ida:invalid-message",
      semanticCourse: "invalid recipient",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "tell someone",
        targetActorId: "",
        text: "hello",
      } as ResidentMatterIntent,
    })).toThrow("matter intent target actor id must be non-empty");

    expect(() => kernel.openMatter({
      id: "matter.ida.invalid-text",
      originEvidenceId: "evidence:ida:invalid-message",
      semanticCourse: "invalid text",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "tell Janek",
        targetActorId: "resident.janek",
        text: "   ",
      } as ResidentMatterIntent,
    })).toThrow("matter intent message text must be non-empty");
  });
});
