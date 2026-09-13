import { afterEach, describe, expect, it, vi } from "vitest";
import { World } from "../world/world";
import { createHearthSpecimen, HEARTH_RESIDENTS } from "./scene";
import { HearthHost } from "./host";
import { isCognitionContext, parseCognitionProposal } from "./contracts";
import type { CognitionContext, CognitionProposal, CognitionProvider, CognitionResponse } from "./contracts";

const hosts: HearthHost[] = [];
afterEach(() => { hosts.splice(0).forEach(h => h.dispose()); vi.useRealTimers(); });
const proposal = (patch: Partial<CognitionProposal> = {}): CognitionProposal => ({ version: 1, speech: null,
  beliefs: [], concerns: [], plan: null, reviewAfterSeconds: 300, ...patch });
const response = (p = proposal()): CognitionResponse => ({ proposal: p,
  usage: { model: "controlled-test", inputTokens: null, outputTokens: null, totalTokens: null, elapsedMs: 1 } });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function create(provider: CognitionProvider, two = false, options: ConstructorParameters<typeof HearthHost>[3] = {}) {
  const scene = createHearthSpecimen();
  scene.blockers = [];
  scene.placementSites = [];
  const place = (id: string, x: number, y: number) => { scene.entities.find(e => e.id === id)!.position = { x, y }; };
  place("player.jozz", 400, 400); place("npc.001", 500, 400); place("npc.janek", 700, 400);
  place("item.mug", 460, 430); place("item.blue-mug", 440, 390);
  const world = new World(scene);
  const host = new HearthHost(world, provider, HEARTH_RESIDENTS.slice(0, two ? 2 : 1), options);
  hosts.push(host);
  return host;
}
function advance(host: HearthHost, condition: () => boolean, ticks = 1800) {
  for (let i = 0; i < ticks && !condition(); i++) host.step();
  expect(condition(), JSON.stringify({ trace: host.trace.slice(-8), context: host.context("npc.001") })).toBe(true);
}

describe("First Hearth integrated resident loop", () => {
  it("starts two private minds without a player prompt and advances one shared world clock", async () => {
    const calls: CognitionContext[] = [];
    const host = create(async c => { calls.push(c); return response(); }, true);
    host.step(); await flush(); host.step();
    expect(host.world.tick).toBe(2);
    expect(calls.map(c => c.resident.name)).toEqual(["Mira", "Janek"]);
    expect(calls.every(isCognitionContext)).toBe(true);
    expect(calls[0].concerns[0].id).toBe("shared-place");
    expect(calls[1].concerns[0].id).toBe("settle-in");
    expect(calls[0].experiences.find(e => e.kind === "background")?.text).not.toBe(calls[1].experiences.find(e => e.kind === "background")?.text);
    calls[0].resident.name = "Changed outside host";
    expect(host.context("npc.001").resident.name).toBe("Mira");
  });

  it("executes both deliveries in order and separates physical completion from satisfying the concern", async () => {
    const host = create(async () => response(proposal({ plan: { concernId: "shared-place", steps: [
      { skill: "deliver", targetId: "item.mug", recipientId: "player.jozz" },
      { skill: "deliver", targetId: "item.blue-mug", recipientId: "player.jozz" },
      { skill: "pause", durationSeconds: 1 }
    ] } })));
    host.step(); await flush(); host.step();
    advance(host, () => host.context("npc.001").realization?.status === "completed");
    const state = host.world.snapshot();
    const player = state.entities.find(e => e.id === "player.jozz")!;
    for (const id of ["item.mug", "item.blue-mug"]) {
      const item = state.entities.find(e => e.id === id)!;
      expect(item).toMatchObject({ heldBy: null });
      expect(Math.hypot(item.position.x - player.position.x, item.position.y - player.position.y)).toBeLessThanOrEqual(54);
    }
    expect(host.trace.filter(t => t.kind === "step").map(t => t.detail)).toEqual(["deliver (1/3)", "deliver (2/3)", "pause (3/3)"]);
    expect(host.context("npc.001").concerns[0].status).toBe("open");
  });

  it("keeps travelling while cognition is pending and does not replay a plan that finished during that thought", async () => {
    let release!: (r: CognitionResponse) => void;
    let calls = 0;
    const plan = { concernId: "shared-place", steps: [{ skill: "travel" as const, targetId: "workshop" }] };
    const host = create(async () => ++calls === 1 ? response(proposal({ plan, reviewAfterSeconds: 1 }))
      : new Promise(resolve => { release = resolve; }), false, { minimumIntervalTicks: 1 });
    host.step(); await flush(); host.step();
    for (let i = 0; i < 32; i++) host.step();
    await flush();
    const before = host.world.snapshot().entities.find(e => e.id === "npc.001")!.position;
    for (let i = 0; i < 20; i++) host.step();
    expect(host.world.snapshot().entities.find(e => e.id === "npc.001")!.position).not.toEqual(before);
    expect(host.state().pending).toBe(true);
    advance(host, () => host.context("npc.001").realization?.status === "completed");
    release(response(proposal({ plan }))); await flush(); host.step();
    expect(host.trace.some(t => t.kind === "plan_stale")).toBe(true);
    expect(host.trace.filter(t => t.kind === "step")).toHaveLength(1);
  });

  it("advances beyond gathering all matching items, and a blocked search asks for judgement without closing its concern", async () => {
    const gathered = create(async () => response(proposal({ plan: { concernId: "shared-place", steps: [
      { skill: "gather", description: { itemType: "mug" }, quantity: "all", recipientId: "player.jozz" },
      { skill: "pause", durationSeconds: 1 }
    ] } })));
    gathered.step(); await flush(); gathered.step();
    advance(gathered, () => gathered.context("npc.001").realization?.status === "completed", 2400);
    expect(gathered.trace.filter(t => t.kind === "step").map(t => t.detail)).toEqual(["gather (1/2)", "pause (2/2)"]);
    const blocked = create(async () => response(proposal({ plan: { concernId: "shared-place", steps: [
      { skill: "gather", description: { itemType: "hammer", color: "blue" }, quantity: "one", recipientId: "player.jozz" }
    ] } })));
    blocked.step(); await flush(); blocked.step();
    advance(blocked, () => blocked.context("npc.001").realization?.status === "blocked", 2400);
    expect(blocked.context("npc.001").concerns[0].status).toBe("open");
    expect(blocked.trace.some(t => t.kind === "requested" && t.detail.includes("innego sposobu"))).toBe(true);
  });

  it("lets a heard new instruction supersede a late answer and wake a long review interval", async () => {
    let release!: (r: CognitionResponse) => void;
    const contexts: CognitionContext[] = [];
    const host = create(c => { contexts.push(c); return contexts.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(response()); },
      false, { minimumIntervalTicks: 1 });
    host.step(); await flush();
    await host.speak("Mira, zmieniłem zdanie. Zaczekaj.");
    release(response(proposal({ speech: { text: "Nieaktualna odpowiedź", mode: "normal" } })));
    await flush(); host.step(); await flush(); host.step();
    expect(host.trace.some(t => t.kind === "stale")).toBe(true);
    expect(host.state().conversation.some(l => l.text.includes("Nieaktualna"))).toBe(false);
    expect(contexts).toHaveLength(2);
    expect(contexts[1].experiences.some(e => e.text.includes("zmieniłem zdanie"))).toBe(true);
    await host.speak("A teraz opowiedz, co zauważyłaś."); host.step(); await flush();
    expect(contexts).toHaveLength(3);
  });

  it("cannot receive remote speech or use hidden world revisions to reject its pending thought", async () => {
    let release!: (r: CognitionResponse) => void;
    const host = create(() => new Promise(resolve => { release = resolve; }));
    host.step(); await flush();
    // Existing physical body far beyond both hearing and vision; no resident model attached.
    for (let i = 0; i < 105; i++) host.world.stepWithActorControls({ moveX: 0, moveY: 0 }, [{ actorId: "npc.janek", moveX: 1, moveY: 0 }], 1 / 30);
    host.world.speak("npc.janek", "Sekret poza zasięgiem", "quiet");
    const before = host.context("npc.001");
    expect(before.experiences.some(e => e.text.includes("Sekret"))).toBe(false);
    release(response(proposal({ speech: { text: "Nadal jestem tutaj.", mode: "normal" } })));
    await flush(); host.step();
    expect(host.trace.filter(t => t.kind === "accepted")).toHaveLength(1);
    expect(host.trace.filter(t => t.kind === "stale")).toHaveLength(0);
  });

  it("allows an mistaken statement and subjective satisfaction without fabricating a delivered item", async () => {
    const host = create(async () => response(proposal({ speech: { text: "Już wszystko dostarczyłam.", mode: "normal" },
      concerns: [{ ...HEARTH_RESIDENTS[0].concerns[0], status: "satisfied" }] })));
    const before = host.world.snapshot().entities.find(e => e.id === "item.mug");
    host.step(); await flush(); host.step();
    expect(host.context("npc.001").concerns[0].status).toBe("satisfied");
    expect(host.context("npc.001").realization).toBeNull();
    expect(host.world.snapshot().entities.find(e => e.id === "item.mug")).toEqual(before);
    expect(host.state().conversation.some(l => l.text.includes("Już wszystko"))).toBe(true);
  });

  it("bounds a non-cooperative provider and ignores late settlements after disposal", async () => {
    vi.useFakeTimers();
    let release!: (r: CognitionResponse) => void;
    const host = create((_c, signal) => new Promise(resolve => { release = resolve; expect(signal.aborted).toBe(false); }), false, { deadlineMs: 100 });
    host.step(); await flush();
    await vi.advanceTimersByTimeAsync(101); host.step();
    expect(host.state().pending).toBe(false);
    expect(host.state().error).toContain("zbyt długo");
    host.dispose();
    release(response(proposal({ speech: { text: "Spóźnione", mode: "normal" } }))); await flush(); host.step();
    expect(host.state().conversation.some(l => l.text.includes("Spóźnione"))).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("private cognition admission", () => {
  it("rejects extra hidden payloads, ungrounded sources and a plan on a newly closed concern", () => {
    const host = create(async () => response());
    const context = host.context("npc.001");
    expect(isCognitionContext(context)).toBe(true);
    expect(isCognitionContext({ ...context, fullWorld: host.world.snapshot() })).toBe(false);
    expect(isCognitionContext({ ...context, observations: [{ ...context.observations[0], secret: "Janek's memory" }] })).toBe(false);
    expect(parseCognitionProposal(proposal({ beliefs: [{ id: "guess", claim: "Janek zabrał kubek", confidence: "tentative", evidenceIds: ["someone-elses-event"] }] }), context)).toBeNull();
    expect(parseCognitionProposal(proposal({ concerns: [{ ...context.concerns[0], status: "abandoned" }],
      plan: { concernId: "shared-place", steps: [{ skill: "pause", durationSeconds: 1 }] } }), context)).toBeNull();
    expect(parseCognitionProposal(proposal({ beliefs: [{ id: "guess", claim: "Może kubek jest w domku", confidence: "tentative", evidenceIds: [] }] }), context)).not.toBeNull();
  });
});
