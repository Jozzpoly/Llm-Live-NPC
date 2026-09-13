import { afterEach, describe, expect, it } from "vitest";
import { World } from "../world/world";
import { HearthHost } from "./host";
import { HEARTH_RESIDENTS, createHearthSpecimen } from "./scene";
import { isCognitionContext } from "./contracts";
import type { CognitionContext, CognitionProposal, CognitionProvider, CognitionResponse } from "./contracts";

const hosts: HearthHost[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.dispose()));
const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
const proposal = (patch: Partial<CognitionProposal> = {}): CognitionProposal => ({ version: 1, speech: null,
  beliefs: [], concerns: [], plan: null, activityDisposition: null, reviewAfterSeconds: 300, ...patch });
const response = (patch: Partial<CognitionProposal> = {}): CognitionResponse => ({ proposal: proposal(patch),
  usage: { model: "controlled-continuity", inputTokens: 1, outputTokens: 1, totalTokens: 2, elapsedMs: 1 } });
function create(provider: CognitionProvider, two = false, seeJanek = false) {
  const scene = createHearthSpecimen();
  scene.blockers = []; scene.placementSites = [];
  for (const [id, x] of [["player.jozz", 400], ["npc.001", 500], ["npc.janek", 750]] as const)
    scene.entities.find(e => e.id === id)!.position = { x, y: 400 };
  if (seeJanek) {
    const mira = scene.entities.find(e => e.id === "npc.001")!;
    if (mira.kind === "npc") mira.facing = { x: 1, y: 0 };
  }
  const host = new HearthHost(new World(scene), provider, HEARTH_RESIDENTS.slice(0, two ? 2 : 1), { minimumIntervalTicks: 1 });
  hosts.push(host); return host;
}
function ticks(host: HearthHost, count: number) { for (let n = 0; n < count; n++) host.step(); }
function until(host: HearthHost, predicate: () => boolean, max = 1800) {
  for (let n = 0; n < max && !predicate(); n++) host.step();
  expect(predicate(), JSON.stringify(host.trace.slice(-8))).toBe(true);
}

describe("resident continuity across actual execution and delayed judgement", () => {
  it("hears another resident's acknowledgement without throwing away a correct pending accompaniment", async () => {
    let janek!: (value: CognitionResponse) => void;
    const host = create(c => c.resident.id === "npc.janek" ? new Promise(resolve => { janek = resolve; }) : Promise.resolve(response()), true);
    host.step(); await flush(); host.step();
    host.world.speak("npc.001", "Jozz, ja tutaj zaczekam.");
    janek(response({ plan: { concernId: "settle-in", steps: [{ skill: "accompany", targetId: "player.jozz", durationSeconds: 120 }] },
      activityDisposition: { kind: "replace", reason: "Idę razem z Jozzem.", basedOnRealizationId: null } }));
    await flush(); host.step();
    const context = host.context("npc.janek");
    expect(context.experiences.some(e => e.text.includes("ja tutaj zaczekam"))).toBe(true);
    expect(context.realization?.steps[0].skill).toBe("accompany");
    expect(host.trace.filter(t => t.actorId === "npc.janek" && t.kind === "stale")).toHaveLength(0);
    const before = host.world.snapshot().entities.find(e => e.id === "npc.janek")!.position.x;
    ticks(host, 20);
    expect(host.world.snapshot().entities.find(e => e.id === "npc.janek")!.position.x).toBeLessThan(before);
  });

  it("keeps a current activity unless replacement is explicitly judged, then suspends and resumes its progress", async () => {
    const requests: CognitionContext[] = [];
    const replies: Array<(value: CognitionResponse) => void> = [];
    const host = create(c => { requests.push(c); return new Promise(resolve => replies.push(resolve)); });
    host.step(); await flush();
    replies.shift()!(response({ plan: { concernId: "shared-place", steps: [{ skill: "pause", durationSeconds: 10 }] }, reviewAfterSeconds: 1 }));
    await flush(); host.step(); ticks(host, 40); await flush();
    const original = host.context("npc.001").realization!;
    replies.shift()!(response({ plan: { concernId: "shared-place", steps: [{ skill: "travel", targetId: "workshop" }] } }));
    await flush(); host.step(); await flush();
    expect(host.context("npc.001").realization?.id).toBe(original.id);
    replies.shift()!(response({ activityDisposition: { kind: "suspend", reason: "Krótka przerwa, potem dokończę odpoczynek.", basedOnRealizationId: original.id },
      plan: { concernId: "shared-place", steps: [{ skill: "pause", durationSeconds: 1 }] } }));
    await flush(); host.step();
    const suspendedAt = host.world.tick;
    expect(host.context("npc.001").suspendedRealization?.id).toBe(original.id);
    until(host, () => host.context("npc.001").realization?.status === "completed"); await flush();
    // Time continues even while the resident is thinking about resuming.
    ticks(host, 80);
    replies.shift()!(response({ activityDisposition: { kind: "resume", reason: "Wracam do przerwanego odpoczynku.", basedOnRealizationId: original.id } }));
    await flush(); host.step();
    expect(host.context("npc.001").realization?.id).toBe(original.id);
    expect(host.context("npc.001").suspendedRealization).toBeNull();
    const resumedAt = host.world.tick;
    until(host, () => host.context("npc.001").realization?.status === "completed");
    expect(host.world.tick - resumedAt).toBeGreaterThan(240);
    expect(host.world.tick - resumedAt + suspendedAt - 2).toBeGreaterThanOrEqual(298);
    expect(requests.every(isCognitionContext)).toBe(true);
  });

  it("travels to an actually perceived recipient before saying a carried message exactly once", async () => {
    let calls = 0;
    const host = create(async () => ++calls === 1 ? response({
      plan: { concernId: "shared-place", steps: [{ skill: "communicate", targetId: "npc.janek", text: "Spotkajmy się w warsztacie.", mode: "quiet" }] }
    }) : response(), false, true);
    const spoken: Array<{ distance: number; tick: number }> = [];
    host.world.onOccurrence((event, snapshot) => {
      if (event.type !== "speech.spoken" || event.text !== "Spotkajmy się w warsztacie.") return;
      const other = snapshot.entities.find(e => e.id === "npc.janek")!;
      spoken.push({ tick: event.tick, distance: Math.hypot(event.position.x - other.position.x, event.position.y - other.position.y) });
    });
    host.step(); await flush(); host.step();
    expect(spoken).toHaveLength(0);
    until(host, () => host.context("npc.001").realization?.status === "completed");
    ticks(host, 60);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].distance).toBeLessThanOrEqual(80);
    expect(host.context("npc.001").experiences.some(e => e.kind === "said" && e.text.includes("Po dotarciu"))).toBe(true);
  });

  it("resumes a partly completed collection without collecting its delivered member again", async () => {
    const replies: Array<(value: CognitionResponse) => void> = [];
    const host = create(() => new Promise(resolve => replies.push(resolve)));
    const drops: string[] = [];
    host.world.onOccurrence(event => {
      if (event.type === "item.dropped" && event.actorId === "npc.001") drops.push(event.entityId);
    });
    host.step(); await flush();
    replies.shift()!(response({ plan: { concernId: "shared-place", steps: [
      { skill: "gather", description: { itemType: "mug" }, quantity: "all", recipientId: "player.jozz" }
    ] }, reviewAfterSeconds: 1 }));
    await flush(); host.step();
    until(host, () => drops.length === 1); await flush();
    const original = host.context("npc.001").realization!;
    replies.shift()!(response({ activityDisposition: { kind: "suspend", reason: "Na chwilę przerwę zbieranie.", basedOnRealizationId: original.id },
      plan: { concernId: "shared-place", steps: [{ skill: "pause", durationSeconds: 1 }] } }));
    await flush(); host.step();
    // Settle any already-due review during the temporary pause before requesting resume
    // from its completed boundary. An older response is intentionally not a new decision.
    await flush();
    if (replies.length) { replies.shift()!(response()); await flush(); host.step(); }
    until(host, () => host.context("npc.001").realization?.status === "completed"); await flush();
    replies.shift()!(response({ activityDisposition: { kind: "resume", reason: "Dokończę zbieranie pozostałych kubków.", basedOnRealizationId: original.id } }));
    await flush(); host.step();
    expect(host.context("npc.001").realization?.id).toBe(original.id);
    until(host, () => host.context("npc.001").realization?.status === "completed", 3000);
    expect(drops).toHaveLength(2);
    expect(new Set(drops).size).toBe(2);
  });

  it("reconsiders an old self-report after body completion instead of admitting it beside a rejected old plan", async () => {
    let release!: (value: CognitionResponse) => void;
    let calls = 0;
    const host = create(async () => ++calls === 1 ? response({ plan: { concernId: "shared-place", steps: [{ skill: "travel", targetId: "workshop" }] }, reviewAfterSeconds: 1 })
      : new Promise(resolve => { release = resolve; }));
    host.step(); await flush(); host.step(); ticks(host, 32); await flush();
    until(host, () => host.context("npc.001").realization?.status === "completed");
    release(response({ speech: { text: "Dopiero ruszam w drogę.", mode: "normal" },
      beliefs: [{ id: "current-progress", claim: "Wciąż jestem przed podróżą.", confidence: "expected", evidenceIds: [] }] }));
    await flush(); host.step();
    expect(host.context("npc.001").beliefs).toHaveLength(0);
    expect(host.state().conversation.some(e => e.text.includes("Dopiero ruszam"))).toBe(false);
    expect(host.researchState().trace.some(e => e.stage === "cognition.settlement" && JSON.stringify(e.data).includes("Dopiero ruszam"))).toBe(true);
  });

  it("restores acquired source identity cited by a pending thought after the working window rolls over", async () => {
    let release!: (value: CognitionResponse) => void;
    let captured!: CognitionContext;
    const host = create(c => { captured = c; return new Promise(resolve => { release = resolve; }); });
    host.step(); await flush();
    const source = captured.experiences.find(e => e.subjectId)!;
    expect(source).toBeDefined();
    for (let n = 0; n < 160; n++) { host.world.speak("npc.001", "Własna próba dźwięku " + n); host.step(); }
    expect(host.context("npc.001").experiences.some(e => e.id === source.id)).toBe(false);
    release(response({ beliefs: [{ id: "earlier-evidence", claim: "Pamiętam wcześniejsze własne spostrzeżenie.", confidence: "tentative", evidenceIds: [source.id] }] }));
    await flush(); host.step();
    expect(host.context("npc.001").experiences.find(e => e.id === source.id)).toEqual(source);
    expect(isCognitionContext(host.context("npc.001"))).toBe(true);
    expect(host.context("npc.001").experiences.length).toBeLessThanOrEqual(128);
  });

  it("recovers from a transient cognition failure while the local body keeps working", async () => {
    let calls = 0;
    const host = create(async () => {
      if (++calls === 1) return response({ plan: { concernId: "shared-place", steps: [{ skill: "travel", targetId: "workshop" }] }, reviewAfterSeconds: 1 });
      if (calls === 2) throw new Error("Przejściowa awaria");
      return response();
    });
    host.step(); await flush(); host.step(); ticks(host, 32); await flush(); host.step();
    expect(host.state().error).toBe("Przejściowa awaria");
    const before = host.world.snapshot().entities.find(e => e.id === "npc.001")!.position;
    ticks(host, 20);
    expect(host.world.snapshot().entities.find(e => e.id === "npc.001")!.position).not.toEqual(before);
    ticks(host, 90); await flush(); host.step();
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(host.state().error).toBeNull();
    expect(host.trace.some(e => e.kind === "accepted")).toBe(true);
  });

  it("closing the only reason for a running method cannot leave a ghost body plan", async () => {
    let calls = 0;
    const host = create(async c => ++calls === 1 ? response({ plan: { concernId: "shared-place", steps: [{ skill: "travel", targetId: "workshop" }] }, reviewAfterSeconds: 1 })
      : response({ concerns: [{ ...c.concerns[0], status: "abandoned" }] }));
    host.step(); await flush(); host.step(); ticks(host, 32); await flush(); host.step();
    expect(host.context("npc.001").realization?.status).toBe("interrupted");
    const position = host.world.snapshot().entities.find(e => e.id === "npc.001")!.position;
    ticks(host, 30);
    expect(host.world.snapshot().entities.find(e => e.id === "npc.001")!.position).toEqual(position);
  });

  it("isolates failed observers from committed actions and other private listeners", () => {
    const host = create(async () => response());
    host.world.onOccurrence(() => { throw new Error("broken research observer"); });
    let delivered = 0;
    host.world.onOccurrence(() => { delivered++; });
    expect(() => host.world.speak("player.jozz", "Słychać mnie.")).not.toThrow();
    host.step();
    expect(delivered).toBe(1);
    expect(host.context("npc.001").experiences.some(e => e.text.includes("Słychać mnie"))).toBe(true);
    expect(host.researchState().observerErrors[0].message).toContain("broken research");
    const exported = host.researchState();
    exported.residents[0].context.beliefs.push({ id: "god-edit", claim: "Omniscient", confidence: "expected", evidenceIds: [] });
    expect(host.context("npc.001").beliefs).toHaveLength(0);
  });

  it("keeps the other resident's identity in an execution result about reaching Mira", async () => {
    const host = create(async c => response(c.resident.id === "npc.janek" ? {
      plan: { concernId: "settle-in", steps: [{ skill: "travel", targetId: "npc.001" }] }
    } : {}), true);
    host.step(); await flush(); host.step();
    until(host, () => host.context("npc.janek").realization?.status === "completed");
    const result = host.context("npc.janek").realization!.outcome!;
    expect(result).toMatch(/^Janek /u);
    expect(result).toMatch(/do: Mira\.$/u);
  });
});
