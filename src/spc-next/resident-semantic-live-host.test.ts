import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import {
  ResidentSemanticLiveHost,
  type ResidentSemanticLiveArrival,
  type SemanticFetch,
} from "./resident-semantic-live-host";

function setupMatter(id = "matter.work") {
  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: `evidence:${id}`,
    tick: 1,
    kind: "checked_absence",
    summary: `origin for ${id}`,
  });
  kernel.openMatter({ id, originEvidenceId: origin.id, semanticCourse: "inspect workshop" });
  return kernel;
}

function successFetch(course: string): SemanticFetch {
  return async (_input, init) => {
    const run = JSON.parse(String(init?.body ?? "{}")) as { providerRunId?: string };
    return new Response(JSON.stringify({
      ok: true,
      providerRunId: run.providerRunId,
      decision: { semanticCourse: course },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function mismatchFetch(): SemanticFetch {
  return async () => new Response(JSON.stringify({
    ok: true,
    providerRunId: "semantic-provider:forged",
    decision: { semanticCourse: "forged answer" },
  }), { status: 200 });
}

function decisionArrival(arrival: ResidentSemanticLiveArrival) {
  expect(arrival.status).toBe("decision");
  if (arrival.status !== "decision") throw new Error(`expected decision arrival, got ${arrival.status}`);
  return arrival;
}

describe("ResidentSemanticLiveHost transport/admission boundary", () => {
  it("keeps a successful provider return inert until an explicit cognition tick admits it", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("search north workshop"));
    const before = kernel.matter("matter.work")!;

    const arrival = decisionArrival(await host.requestMatter("matter.work"));

    expect(arrival).toMatchObject({
      version: 1,
      arrivalId: "semantic-arrival:0",
      providerRunId: "semantic-provider:0",
      status: "decision",
      decision: { semanticCourse: "search north workshop" },
    });
    expect(kernel.matter("matter.work")).toEqual(before);
    expect(kernel.pendingSemanticProposals()).toHaveLength(1);
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.recentAdmissions()).toEqual([]);

    const admitted = host.admit(arrival, 42);
    expect(admitted).toMatchObject({
      status: "applied",
      admissionTick: 42,
      settlement: {
        matter: {
          semanticCourse: "search north workshop",
          semanticRevision: before.semanticRevision + 1,
        },
      },
    });
    expect(host.pendingProviderAttempts()).toBe(0);
    expect(host.pendingArrivals()).toBe(0);
    expect(host.recentAdmissions()).toEqual([expect.objectContaining({
      sequence: 0,
      arrivalId: arrival.arrivalId,
      providerRunId: arrival.providerRunId,
      admissionTick: 42,
      arrivalStatus: "decision",
      outcomeStatus: "applied",
    })]);
  });

  it("evaluates staleness at admission, so new resident evidence after arrival defeats the old answer", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("late old strategy"));
    const arrival = decisionArrival(await host.requestMatter("matter.work"));

    const newer = kernel.recordEvidence({
      id: "evidence:newer",
      tick: 7,
      kind: "heard",
      summary: "new local evidence arrived after transport response",
    });
    kernel.advanceSemanticContext("matter.work", newer.id);
    const beforeAdmission = kernel.matter("matter.work")!;

    expect(host.admit(arrival, 8)).toEqual({
      status: "stale",
      admissionTick: 8,
      settlement: { status: "stale", reason: "semantic_authority_stale" },
    });
    expect(kernel.matter("matter.work")).toEqual(beforeAdmission);
    expect(kernel.matter("matter.work")?.semanticCourse).toBe("inspect workshop");
    expect(host.pendingProviderAttempts()).toBe(0);
    expect(host.recentAdmissions()[0]).toMatchObject({
      admissionTick: 8,
      outcomeStatus: "stale",
      detail: "semantic_authority_stale",
    });
  });

  it("cannot resurrect a matter terminalized after provider arrival but before admission", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("resurrected strategy"));
    const arrival = decisionArrival(await host.requestMatter("matter.work"));

    kernel.cancelMatter("matter.work");

    expect(host.admit(arrival, 9)).toEqual({
      status: "stale",
      admissionTick: 9,
      settlement: { status: "stale", reason: "matter_terminal" },
    });
    expect(kernel.matter("matter.work")).toMatchObject({
      status: "cancelled",
      semanticCourse: "inspect workshop",
    });
  });

  it("defers exact-attempt abandonment for transport failure until the explicit admission boundary", async () => {
    const kernel = setupMatter();
    const fetcher: SemanticFetch = async () => { throw new Error("offline"); };
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", fetcher);
    const before = kernel.matter("matter.work")!;

    const arrival = await host.requestMatter("matter.work");
    expect(arrival).toMatchObject({ status: "provider_error", code: "network" });
    expect(kernel.matter("matter.work")).toEqual(before);
    expect(kernel.pendingSemanticProposals()).toHaveLength(1);
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(1);

    expect(host.admit(arrival, 10)).toMatchObject({
      status: "provider_error",
      admissionTick: 10,
      code: "network",
      abandonment: { status: "abandoned", providerRunId: arrival.providerRunId },
    });
    expect(kernel.matter("matter.work")).toEqual(before);
    expect(kernel.pendingSemanticProposals()).toHaveLength(0);
    expect(host.pendingProviderAttempts()).toBe(0);
  });

  it("rejects cloned or forged arrivals even when providerRunId is known, while the original remains admissible", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("valid strategy"));
    const arrival = decisionArrival(await host.requestMatter("matter.work"));
    const cloned = structuredClone(arrival);

    expect(host.admit(cloned, 11)).toEqual({
      status: "arrival_rejected",
      reason: "unknown_arrival",
    });
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(1);
    expect(kernel.matter("matter.work")?.semanticCourse).toBe("inspect workshop");

    expect(host.admit(arrival, 12).status).toBe("applied");
    expect(kernel.matter("matter.work")?.semanticCourse).toBe("valid strategy");
  });

  it("makes admission one-shot and records the exact simulation tick once", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("accepted once"));
    const arrival = decisionArrival(await host.reviewMatter("matter.work"));

    expect(host.admit(arrival, 13).status).toBe("applied");
    expect(host.admit(arrival, 14)).toEqual({
      status: "arrival_rejected",
      reason: "already_admitted",
    });
    expect(host.recentAdmissions()).toHaveLength(1);
    expect(host.recentAdmissions()[0]?.admissionTick).toBe(13);
  });

  it("keeps sibling attempts exact: admitting one can make the other stale but cannot silently consume it", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("shared provider answer"));
    const first = decisionArrival(await host.requestMatter("matter.work"));
    const sibling = decisionArrival(await host.requestMatter("matter.work"));

    expect(host.pendingProviderAttempts()).toBe(2);
    expect(host.pendingArrivals()).toBe(2);

    expect(host.admit(first, 20).status).toBe("applied");
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(1);

    expect(host.admit(sibling, 21)).toEqual({
      status: "stale",
      admissionTick: 21,
      settlement: { status: "stale", reason: "semantic_authority_stale" },
    });
    expect(host.pendingProviderAttempts()).toBe(0);
    expect(host.pendingArrivals()).toBe(0);
    expect(host.recentAdmissions().map((entry) => entry.outcomeStatus)).toEqual(["applied", "stale"]);
  });

  it("treats correlation mismatch as inert transport evidence until admission abandons the exact local attempt", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", mismatchFetch());
    const arrival = await host.requestMatter("matter.work");

    expect(arrival).toMatchObject({
      status: "provider_error",
      code: "correlation_mismatch",
      providerRunId: "semantic-provider:0",
    });
    expect(kernel.pendingSemanticProposals()).toHaveLength(1);
    expect(host.pendingProviderAttempts()).toBe(1);

    expect(host.admit(arrival, 30)).toMatchObject({
      status: "provider_error",
      admissionTick: 30,
      code: "correlation_mismatch",
      abandonment: { status: "abandoned" },
    });
    expect(kernel.pendingSemanticProposals()).toHaveLength(0);
  });

  it("rejects invalid admission ticks before consuming arrival authority", async () => {
    const kernel = setupMatter();
    const host = new ResidentSemanticLiveHost(kernel, undefined, "/semantic", successFetch("later"));
    const arrival = decisionArrival(await host.requestMatter("matter.work"));

    expect(() => host.admit(arrival, -1)).toThrow(/admission tick/);
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.admit(arrival, 31).status).toBe("applied");
  });
});
