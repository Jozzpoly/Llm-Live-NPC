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

function keepProposal(reviewAfterSeconds = 15) {
  return {
    version: 1,
    activityDirective: { kind: "keep", reason: "stay with current method" },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds,
  };
}

function stopProposal(reviewAfterSeconds = 20) {
  return {
    version: 1,
    activityDirective: { kind: "stop", reason: "stop the current bodily activity" },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds,
  };
}

describe("SpcCognitionHost", () => {
  it("can expose five independent urgent cognition contexts concurrently without advancing a second World clock", () => {
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

  it("applies accepted activity transitions through World authority and clears inherited bodily velocity", () => {
    const { world, host } = setup();
    world.setActorVelocity("resident.mira", { x: 100, y: 0 });
    world.speak("player.jozz", "Mira, zatrzymaj się", 420, ["resident.mira"]);
    world.step();
    host.collectReadyBatches();
    const request = host.startReadyRequests().find((candidate) => candidate.residentId === "resident.mira")!;

    expect(world.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")!.velocity.x).toBeGreaterThan(0);
    const settlement = host.settle(request, stopProposal());
    expect(settlement.status).toBe("applied");

    const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === "resident.mira")!;
    const resident = world.publicSnapshot().residents.find((candidate) => candidate.id === "resident.mira")!;
    expect(actor.velocity).toEqual({ x: 0, y: 0 });
    expect(resident.activity.kind).toBe("idle");
  });

  it("makes accepted reviewAfterSeconds control the next quiet cognition deadline", () => {
    const { world, residents, host } = setup();
    world.speak("player.jozz", "Mira, zapamiętaj i pomyśl później", 420, ["resident.mira"]);
    world.step();
    host.collectReadyBatches();
    const request = host.startReadyRequests().find((candidate) => candidate.residentId === "resident.mira")!;
    const mira = residents.find((resident) => resident.profile.id === "resident.mira")!;

    const before = mira.cognitionScheduleDiagnostics().nextQuietReviewTick;
    expect(host.settle(request, keepProposal(90)).status).toBe("applied");
    const after = mira.cognitionScheduleDiagnostics().nextQuietReviewTick;

    expect(after).toBeGreaterThanOrEqual(world.tick + 5_400);
    expect(after).toBeLessThan(world.tick + 5_430);
    expect(after).not.toBe(before);
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
