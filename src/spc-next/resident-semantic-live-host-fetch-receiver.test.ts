import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentSemanticLiveHost, type SemanticFetch } from "./resident-semantic-live-host";

function setupMatter() {
  const kernel = new ResidentContinuityKernel();
  const evidence = kernel.recordEvidence({
    id: "evidence:fetch-receiver",
    tick: 1,
    kind: "checked_absence",
    summary: "The familiar object is absent from the remembered place.",
  });
  kernel.openMatter({
    id: "matter.fetch-receiver",
    originEvidenceId: evidence.id,
    semanticCourse: "reconsider what to do next",
  });
  return kernel;
}

describe("ResidentSemanticLiveHost native-fetch receiver boundary", () => {
  it("invokes a receiver-sensitive fetch with globalThis rather than the host instance", async () => {
    const kernel = setupMatter();
    const receiverSensitiveFetch = async function (
      this: unknown,
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      const run = JSON.parse(String(init?.body ?? "{}")) as { providerRunId?: string };
      return new Response(JSON.stringify({
        ok: true,
        providerRunId: run.providerRunId,
        decision: {
          semanticCourse: "search the remembered area",
          localCapabilityId: null,
        },
      }), { status: 200 });
    } as SemanticFetch;

    const host = new ResidentSemanticLiveHost(
      kernel,
      undefined,
      "/api/spc-next/semantic",
      receiverSensitiveFetch,
    );

    const arrival = await host.requestMatter("matter.fetch-receiver");
    expect(arrival).toMatchObject({
      status: "decision",
      decision: {
        semanticCourse: "search the remembered area",
        localCapabilityId: null,
      },
    });
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(1);
  });
});
