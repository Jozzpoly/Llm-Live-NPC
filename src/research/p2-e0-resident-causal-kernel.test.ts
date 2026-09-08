import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

function openMatter(
  kernel: P2E0ResidentCausalKernel,
  id: string,
  semanticCourse: string,
  actorId = "player.jozz"
) {
  const origin = kernel.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId },
    summary: `${actorId} opened ${id}`
  });
  return kernel.openMatter({ id, originEvidenceId: origin.id, semanticCourse });
}

describe("P2-E0 resident causal kernel", () => {
  it("keeps an unresolved matter alive independently of a semantic proposal lifecycle", () => {
    const kernel = new P2E0ResidentCausalKernel();
    const opened = openMatter(kernel, "matter.mug", "fetch blue mug");

    const ticket = kernel.beginSemanticProposal(opened.id);

    expect(kernel.matter(opened.id)).toEqual(opened);
    expect(kernel.pendingSemanticProposals()).toEqual([ticket]);

    const result = kernel.commitSemanticProposal(ticket, { semanticCourse: "fetch red mug" });

    expect(result.status).toBe("applied");
    expect(kernel.matter(opened.id)).toMatchObject({
      id: opened.id,
      status: "active",
      semanticCourse: "fetch red mug",
      semanticRevision: 2
    });
    expect(kernel.pendingSemanticProposals()).toEqual([]);
  });

  it("does not stale a semantic proposal merely because related physical evidence arrived", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.mug", "fetch blue mug");
    const ticket = kernel.beginSemanticProposal("matter.mug");

    const physicalChange = kernel.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.pickup.41" },
      summary: "Bob picked up the red mug while cognition was pending.",
      matterId: "matter.mug"
    });

    expect(physicalChange.matterId).toBe("matter.mug");
    expect(kernel.matter("matter.mug")?.semanticRevision).toBe(ticket.semanticRevision);

    expect(
      kernel.commitSemanticProposal(ticket, {
        semanticCourse: "Jozz revised the requested object to the red mug"
      })
    ).toMatchObject({ status: "applied" });
  });

  it("stales an older proposal when newer semantic input advances the same matter", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.mug", "fetch blue mug");
    const oldTicket = kernel.beginSemanticProposal("matter.mug");

    const supersedingSpeech = kernel.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "No, blue after all.",
      matterId: "matter.mug"
    });
    const advanced = kernel.advanceSemanticContext("matter.mug", supersedingSpeech.id);

    expect(advanced.semanticRevision).toBe(oldTicket.semanticRevision + 1);
    expect(kernel.commitSemanticProposal(oldTicket, { semanticCourse: "fetch red mug" })).toEqual({
      status: "stale",
      reason: "semantic_revision_changed"
    });
    expect(kernel.matter("matter.mug")?.semanticCourse).toBe("fetch blue mug");
  });

  it("scopes semantic invalidation to the matter that actually changed", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.mug", "fetch mug");
    openMatter(kernel, "matter.lantern", "help Bob with lantern", "player.bob");
    const mugTicket = kernel.beginSemanticProposal("matter.mug");

    const bobRevision = kernel.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.bob" },
      summary: "Actually leave the lantern where it is.",
      matterId: "matter.lantern"
    });
    kernel.advanceSemanticContext("matter.lantern", bobRevision.id);

    expect(
      kernel.commitSemanticProposal(mugTicket, { semanticCourse: "place mug by clarified crate" })
    ).toMatchObject({ status: "applied" });
  });

  it("allows only one same-revision semantic proposal to win causal authority", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.mug", "fetch mug");

    const first = kernel.beginSemanticProposal("matter.mug");
    const second = kernel.beginSemanticProposal("matter.mug");
    expect(second.semanticRevision).toBe(first.semanticRevision);

    expect(kernel.commitSemanticProposal(first, { semanticCourse: "fetch red mug" })).toMatchObject({
      status: "applied"
    });
    expect(kernel.commitSemanticProposal(second, { semanticCourse: "fetch blue mug" })).toEqual({
      status: "stale",
      reason: "semantic_revision_changed"
    });
    expect(kernel.matter("matter.mug")?.semanticCourse).toBe("fetch red mug");
  });

  it("preserves a suspended matter through an interrupt and makes it resumable after the interrupt resolves", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.jozz", "place mug by crate");
    openMatter(kernel, "matter.bob", "help Bob with lantern", "player.bob");

    const clarification = kernel.beginSemanticProposal("matter.jozz");
    const suspended = kernel.suspendMatter("matter.jozz", "matter.bob");

    expect(suspended).toMatchObject({
      status: "suspended",
      suspendedByMatterId: "matter.bob",
      semanticCourse: "place mug by crate"
    });
    expect(kernel.canResumeMatter("matter.jozz")).toBe(false);

    // Activity/focus suspension is not itself a semantic supersession. A
    // clarification computed for the same semantic revision may still land
    // while the matter waits behind the interrupt.
    expect(
      kernel.commitSemanticProposal(clarification, {
        semanticCourse: "place mug by the north crate"
      })
    ).toMatchObject({ status: "applied" });
    expect(kernel.matter("matter.jozz")?.status).toBe("suspended");

    kernel.resolveMatter("matter.bob");
    expect(kernel.canResumeMatter("matter.jozz")).toBe(true);
    expect(kernel.resumeMatter("matter.jozz")).toBe(true);
    expect(kernel.matter("matter.jozz")).toMatchObject({
      status: "active",
      suspendedByMatterId: null,
      semanticCourse: "place mug by the north crate"
    });
  });

  it("keeps task/run causality and returns mechanical outcome as evidence without auto-resolving the matter", () => {
    const kernel = new P2E0ResidentCausalKernel();
    const opened = openMatter(kernel, "matter.mug", "fetch red mug");

    expect(kernel.bindTask(opened.id, { taskId: "task.fetch-red", runId: 41 })).toEqual({
      matterId: opened.id,
      taskId: "task.fetch-red",
      runId: 41,
      semanticRevision: opened.semanticRevision
    });
    expect(kernel.taskBinding(41)?.matterId).toBe(opened.id);

    const outcome = kernel.recordTaskOutcome({
      runId: 41,
      status: "succeeded",
      code: "picked_up_item",
      message: "NPC picked up the red mug."
    });

    expect(outcome).toMatchObject({
      kind: "task_outcome",
      source: { kind: "task", runId: 41 },
      matterId: opened.id
    });
    expect(kernel.taskBinding(41)).toBeNull();
    expect(kernel.matter(opened.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch red mug",
      semanticRevision: 1,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: outcome.id
    });
  });

  it("retains the semantic revision that grounded a task even after the matter is revised", () => {
    const kernel = new P2E0ResidentCausalKernel();
    const opened = openMatter(kernel, "matter.mug", "fetch blue mug");
    const binding = kernel.bindTask(opened.id, { taskId: "task.fetch-blue", runId: 52 });

    expect(binding).toMatchObject({ semanticRevision: opened.semanticRevision });

    const revision = kernel.beginSemanticProposal(opened.id);
    expect(kernel.commitSemanticProposal(revision, { semanticCourse: "fetch red mug" })).toMatchObject({
      status: "applied"
    });

    expect(kernel.taskBinding(52)).toMatchObject({
      matterId: opened.id,
      taskId: "task.fetch-blue",
      runId: 52,
      semanticRevision: opened.semanticRevision
    });
    expect(kernel.matter(opened.id)?.semanticRevision).toBe(opened.semanticRevision + 1);
  });

  it("refuses to overwrite the causal interrupt of a matter that is already suspended", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.a", "A");
    openMatter(kernel, "matter.b", "B", "player.bob");
    openMatter(kernel, "matter.c", "C", "player.carol");

    kernel.suspendMatter("matter.a", "matter.b");

    expect(() => kernel.suspendMatter("matter.a", "matter.c")).toThrow();
    expect(kernel.matter("matter.a")?.suspendedByMatterId).toBe("matter.b");
  });

  it("refuses a suspended matter as a new active interruptor so interruption cycles cannot form", () => {
    const kernel = new P2E0ResidentCausalKernel();
    openMatter(kernel, "matter.a", "A");
    openMatter(kernel, "matter.b", "B", "player.bob");

    kernel.suspendMatter("matter.a", "matter.b");

    expect(() => kernel.suspendMatter("matter.b", "matter.a")).toThrow();
    expect(kernel.matter("matter.b")?.status).toBe("active");
  });

  it("bounds retained recent evidence without turning the probe into a long-term memory store", () => {
    const kernel = new P2E0ResidentCausalKernel(2);

    kernel.recordEvidence({
      kind: "observed",
      source: { kind: "world" },
      summary: "first"
    });
    const second = kernel.recordEvidence({
      kind: "observed",
      source: { kind: "world" },
      summary: "second"
    });
    const third = kernel.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "third"
    });

    expect(kernel.recentEvidence().map((entry) => entry.id)).toEqual([second.id, third.id]);
  });
});
