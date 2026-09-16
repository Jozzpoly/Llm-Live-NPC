import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";

function setupMatter(id = "matter.work") {
  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: `evidence:${id}`,
    tick: 1,
    kind: "heard",
    summary: `origin for ${id}`,
  });
  kernel.openMatter({ id, originEvidenceId: origin.id, semanticCourse: "inspect workshop" });
  return kernel;
}

describe("ResidentSemanticProviderMembrane", () => {
  it("serializes stable origin, current semantic content and resident-offered capabilities without serializing mutation authority", () => {
    const kernel = setupMatter();
    const current = kernel.recordEvidence({
      id: "evidence:matter.work:changed",
      tick: 2,
      kind: "checked_absence",
      summary: "the expected thing is not at the inspected place",
    });
    kernel.advanceSemanticContext("matter.work", current.id);

    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work", [{
      id: "local.search.remembered-area",
      summary: "Search a remembered area using local embodied perception.",
    }]);
    const cloned = structuredClone(run) as unknown as Record<string, unknown>;

    expect(cloned).toMatchObject({
      version: 3,
      providerRunId: "semantic-provider:0",
      matter: { id: "matter.work", semanticCourse: "inspect workshop" },
      originEvidence: {
        id: "evidence:matter.work",
        tick: 1,
        kind: "heard",
        summary: "origin for matter.work",
      },
      semanticEvidence: {
        id: "evidence:matter.work:changed",
        tick: 2,
        kind: "checked_absence",
      },
      localCapabilities: [{ id: "local.search.remembered-area" }],
    });
    expect(cloned).not.toHaveProperty("ticket");
    expect(cloned).not.toHaveProperty("semanticRevision");
    expect(JSON.stringify(cloned)).not.toContain("proposal:matter.work");

    expect(membrane.settle(kernel, run.providerRunId, {
      semanticCourse: "inspect the north station",
      localCapabilityId: "local.search.remembered-area",
    })).toMatchObject({
      status: "applied",
      matter: { semanticCourse: "inspect the north station" },
      localCapabilityId: "local.search.remembered-area",
    });
  });

  it("keeps origin evidence stable across later semantic revisions", () => {
    const kernel = setupMatter("matter.continuing");
    const firstPressure = kernel.recordEvidence({
      id: "evidence:pressure:1",
      tick: 2,
      kind: "blocked",
      summary: "first tactic failed",
    });
    kernel.advanceSemanticContext("matter.continuing", firstPressure.id);
    const first = new ResidentSemanticProviderMembrane().prepare(kernel, "matter.continuing");

    const secondPressure = kernel.recordEvidence({
      id: "evidence:pressure:2",
      tick: 3,
      kind: "material_reacquired",
      summary: "the sought material is visible again",
    });
    kernel.advanceSemanticContext("matter.continuing", secondPressure.id);
    const second = new ResidentSemanticProviderMembrane().prepare(kernel, "matter.continuing");

    expect(second.originEvidence).toEqual(first.originEvidence);
    expect(second.semanticEvidence).toEqual(secondPressure);
    expect(second.originEvidence.id).not.toBe(second.semanticEvidence.id);
  });

  it("accepts only an exact resident-offered local capability and keeps invalid selection retryable", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work", [{
      id: "local.search.remembered-area",
      summary: "Search a remembered area using local embodied perception.",
    }]);

    expect(membrane.settle(kernel, run.providerRunId, {
      semanticCourse: "search elsewhere",
      localCapabilityId: "local.teleport.to-hidden-object",
    })).toEqual({ status: "invalid_output", canRetry: true });
    expect(kernel.matter("matter.work")?.semanticCourse).toBe("inspect workshop");
    expect(membrane.activeLocalRunCount()).toBe(1);

    expect(membrane.settle(kernel, run.providerRunId, {
      semanticCourse: "wait and reconsider",
      localCapabilityId: null,
    })).toMatchObject({
      status: "applied",
      localCapabilityId: null,
      matter: { semanticCourse: "wait and reconsider" },
    });
  });

  it("rejects forged or replayed correlation ids because authority exists only in the local sidecar", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work");

    expect(membrane.settle(kernel, `${run.providerRunId}.forged`, { semanticCourse: "forged" })).toEqual({
      status: "local_run_rejected",
      reason: "unknown_local_run",
    });

    expect(membrane.settle(kernel, run.providerRunId, { semanticCourse: "valid" }).status).toBe("applied");
    expect(membrane.settle(kernel, run.providerRunId, { semanticCourse: "replay" })).toEqual({
      status: "local_run_rejected",
      reason: "unknown_local_run",
    });
  });

  it("allows a formatting retry only while the exact resident proposal authority is still live", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work");

    expect(membrane.settle(kernel, run.providerRunId, { wrong: "shape" })).toEqual({
      status: "invalid_output",
      canRetry: true,
    });
    expect(membrane.activeLocalRunCount()).toBe(1);
    expect(kernel.pendingSemanticProposals()).toHaveLength(1);

    expect(membrane.settle(kernel, run.providerRunId, { semanticCourse: "valid retry" })).toMatchObject({
      status: "applied",
      matter: { semanticCourse: "valid retry" },
      localCapabilityId: null,
    });
    expect(membrane.activeLocalRunCount()).toBe(0);
  });

  it("fails closed when same-matter semantic evidence changes while the provider is in flight", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work");

    const revision = kernel.recordEvidence({
      id: "evidence:new",
      tick: 2,
      kind: "heard",
      summary: "new material semantic input",
    });
    kernel.advanceSemanticContext("matter.work", revision.id);

    expect(membrane.settle(kernel, run.providerRunId, { semanticCourse: "late old answer" })).toEqual({
      status: "stale",
      reason: "semantic_authority_stale",
    });
    expect(kernel.matter("matter.work")?.semanticCourse).toBe("inspect workshop");
    expect(membrane.activeLocalRunCount()).toBe(0);
  });

  it("rejects a late provider return after matter terminalization without restoring authority", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work");

    kernel.cancelMatter("matter.work");

    expect(membrane.settle(kernel, run.providerRunId, { semanticCourse: "resurrect work" })).toEqual({
      status: "stale",
      reason: "matter_terminal",
    });
    expect(kernel.matter("matter.work")).toMatchObject({
      status: "cancelled",
      semanticCourse: "inspect workshop",
    });
    expect(membrane.settle(kernel, run.providerRunId, { semanticCourse: "second late return" })).toEqual({
      status: "local_run_rejected",
      reason: "unknown_local_run",
    });
  });

  it("abandons one exact provider attempt without changing matter meaning or killing a sibling attempt", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const first = membrane.prepare(kernel, "matter.work");
    const sibling = membrane.prepare(kernel, "matter.work");

    expect(membrane.abandon(kernel, first.providerRunId)).toEqual({
      status: "abandoned",
      providerRunId: first.providerRunId,
    });
    expect(kernel.matter("matter.work")?.semanticCourse).toBe("inspect workshop");
    expect(membrane.activeLocalRunCount()).toBe(1);

    expect(membrane.settle(kernel, sibling.providerRunId, { semanticCourse: "sibling survives" })).toMatchObject({
      status: "applied",
      matter: { semanticCourse: "sibling survives" },
    });
    expect(membrane.abandon(kernel, first.providerRunId)).toEqual({
      status: "local_run_rejected",
      reason: "unknown_local_run",
    });
  });

  it("does not offer retry for malformed output after resident authority died while transport was in flight", () => {
    const kernel = setupMatter();
    const membrane = new ResidentSemanticProviderMembrane();
    const run = membrane.prepare(kernel, "matter.work");
    kernel.resolveMatter("matter.work");

    expect(membrane.settle(kernel, run.providerRunId, { malformed: true })).toEqual({
      status: "stale",
      reason: "matter_terminal",
    });
    expect(membrane.activeLocalRunCount()).toBe(0);
  });
});
