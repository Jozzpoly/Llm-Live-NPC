import { describe, expect, it } from "vitest";
import type { ResidentRuntime } from "./resident-runtime";
import { SpcCognitionHost } from "./spc-cognition-host";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { SpcWorldRuntime } from "./spc-world-runtime";

function setup(): { world: SpcWorldRuntime; residents: ResidentRuntime[]; host: SpcCognitionHost } {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 8_192, maxY: 8_192 },
    regions: [{ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }],
    chunkSize: 256,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addPlayer("player.jozz", { x: 500, y: 500 });
  const residents = [
    world.addResident("resident.mira", "Mira", { x: 550, y: 500 }),
    world.addResident("resident.janek", "Janek", { x: 600, y: 500 }),
    world.addResident("resident.ida", "Ida", { x: 650, y: 500 }),
    world.addResident("resident.oren", "Oren", { x: 700, y: 500 }),
    world.addResident("resident.nela", "Nela", { x: 750, y: 500 }),
  ];
  const host = new SpcCognitionHost(world, residents, createFiveResidentNavigationGraph(), 5);
  return { world, residents, host };
}

function keepProposal() {
  return {
    version: 1,
    activityDirective: { kind: "keep", reason: "stay with current method" },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 15,
  };
}

describe("SpcCognitionHost", () => {
  it("can expose five independent cognition contexts concurrently without advancing a second World clock", () => {
    const { world, host } = setup();
    const ids = ["resident.mira", "resident.janek", "resident.ida", "resident.oren", "resident.nela"];
    world.speak("player.jozz", "chodźcie wszyscy", 420, ids);
    world.step();
    const tick = world.tick;

    expect(host.collectReadyBatches()).toBe(5);
    const requests = host.startReadyRequests();
    expect(requests).toHaveLength(5);
    expect(new Set(requests.map((request) => request.residentId)).size).toBe(5);
    expect(world.tick).toBe(tick);

    for (const request of requests) {
      expect(request.context.resident.id).toBe(request.residentId);
      expect(request.context.reasons.some((reason) => reason.kind === "heard_speech")).toBe(true);
      expect(host.settle(request, keepProposal()).status).toBe("applied");
    }
    expect(world.tick).toBe(tick);
    expect(host.state().activeRequestCount).toBe(0);
  });

  it("keeps local host authority exact even if provider-visible request data is cloned or mutated", () => {
    const { world, host } = setup();
    world.speak("player.jozz", "Mira, odpowiedz", 420, ["resident.mira"]);
    world.step();
    host.collectReadyBatches();
    const request = host.startReadyRequests().find((candidate) => candidate.residentId === "resident.mira")!;
    const clone = structuredClone(request);
    clone.context.resident.name = "tampered";

    expect(host.settle(clone, keepProposal())).toEqual({ status: "rejected", reason: "unknown_host_request" });
    expect(host.state().activeRequestCount).toBeGreaterThan(0);
    expect(host.settle(request, keepProposal()).status).toBe("applied");
  });

  it("abandons one resident request without cancelling sibling cognition and requeues that resident's reasons", () => {
    const { world, host } = setup();
    world.speak("player.jozz", "Mira i Janek", 420, ["resident.mira", "resident.janek"]);
    world.step();
    host.collectReadyBatches();
    const requests = host.startReadyRequests();
    const mira = requests.find((request) => request.residentId === "resident.mira")!;
    const janek = requests.find((request) => request.residentId === "resident.janek")!;

    expect(host.abandon(mira)).toBe(true);
    expect(host.settle(janek, keepProposal()).status).toBe("applied");
    expect(host.state().activeRequestCount).toBe(requests.length - 2);

    world.step(60);
    expect(host.collectReadyBatches()).toBeGreaterThanOrEqual(1);
    expect(host.startReadyRequests().some((request) => request.residentId === "resident.mira")).toBe(true);
  });
});
