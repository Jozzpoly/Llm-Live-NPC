import { describe, expect, it, vi } from "vitest";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";

describe("five-resident unified living runtime", () => {
  it("keeps five asynchronous provider completions inert until the next World admission boundary", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body)) as {
        resident: { id: string };
        currentRegionId: string | null;
        reasons: Array<{ id: string }>;
        knownRegions: Array<{ id: string }>;
      };
      const originReasonId = context.reasons[0]?.id;
      if (!originReasonId) throw new Error("fixture request lacks cognition reason");
      const targetRegionId = context.knownRegions.find(
        (region) => region.id !== context.currentRegionId,
      )?.id;
      if (!targetRegionId) throw new Error("fixture request lacks alternate known region");

      return new Response(JSON.stringify({
        ok: true,
        originReasonId,
        proposal: {
          version: 1,
          commitmentDecision: {
            kind: "accept",
            reason: "open one bounded resident-owned chapter from this exact pressure",
            intent: {
              kind: "travel",
              goal: `go to familiar ${targetRegionId}`,
              targetActorId: null,
              targetRegionId,
              targetPosition: null,
              text: null,
            },
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: 60,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const living = new FiveResidentUnifiedLivingRuntime({
      fetcher,
      maxConcurrentCognition: 5,
    });

    let guard = 0;
    while (living.lifeRuntime.claimedResidentIds().length < 5 && guard < 1_500) {
      living.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(1_500);
    while (living.world.tick < 2_400) living.advanceOneWorldTick();

    // This boundary starts any ready provider work, but no provider callback may
    // directly materialize resident life.
    living.advanceOneWorldTick();
    expect(living.diagnostics().providerRequestCount).toBeGreaterThan(0);

    await flushMicrotasks();

    const afterArrival = living.diagnostics();
    expect(afterArrival.providerInboxCount).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalled();
    for (const residentId of afterArrival.claimedResidentIds) {
      expect(living.life(residentId)?.matterScope.matterIds()).toEqual([]);
    }

    // Exact next World boundary consumes the inert arrivals.
    living.advanceOneWorldTick();
    const matterIds = new Map(
      living.lifeRuntime.claimedResidentIds().map((residentId) => [
        residentId,
        living.life(residentId)?.matterScope.matterIds() ?? [],
      ]),
    );
    expect([...matterIds.values()].flat().length).toBeGreaterThan(0);
    expect(living.diagnostics().recentProviderEvents.some(
      (event) => event.status === "admitted",
    )).toBe(true);

    // At least the admitted first wave must become factual World outcomes.
    const firstWave = new Map(
      [...matterIds.entries()].map(([residentId, ids]) => [residentId, [...ids]]),
    );
    guard = 0;
    while (!firstWaveResolved(living, firstWave) && guard < 5_000) {
      living.advanceOneWorldTick();
      await flushMicrotasks();
      guard += 1;
    }
    expect(guard).toBeLessThan(5_000);
    expect(firstWaveResolved(living, firstWave)).toBe(true);
  });

  it("hard-stops upstream traffic even if a live resident has more semantic pressure", async () => {
    // This must be a literal PHYSICAL network-call ceiling, not a count of
    // successful admissions, rendered diagnostics, retries or settled reasons.
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: "global_limit",
    }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }));
    const living = new FiveResidentUnifiedLivingRuntime({
      fetcher: upstream,
      maxUpstreamRequests: 1,
      maxConcurrentCognition: 5,
    });

    // No manual player input, extra NPC matters, simulated provider response
    // that opens a new run, or bypass of the genuine unified scheduling path.
    while (living.world.tick < 2_300) living.advanceOneWorldTick();
    await flushMicrotasks();
    const before = living.diagnostics();
    expect(before.providerHardBudget).toMatchObject({
      maxUpstreamRequests: 1,
      upstreamRequestsStarted: 1,
      exhausted: true,
    });
    expect(upstream).toHaveBeenCalledTimes(1);

    // The World and the local brain keep ticking after budget exhaustion.
    const oldTick = living.world.tick;
    for (let i = 0; i < 360; i += 1) {
      living.advanceOneWorldTick();
      await flushMicrotasks();
    }
    expect(living.world.tick).toBe(oldTick + 360);
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
    expect(living.diagnostics().providerHardBudget.exhausted).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("keeps the genuine World running in manual mode with ZERO network until one explicitly selected resident press", async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      ok: false, code: "global_limit",
    }), { status: 429, headers: { "content-type": "application/json" } }));
    const living = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual",
      fetcher: upstream,
      maxConcurrentCognition: 1,
      maxUpstreamRequests: 1,
    });

    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    expect(living.lifeRuntime.claimedResidentIds()).toHaveLength(5);
    expect(living.diagnostics().providerRequestCount).toBe(0);
    expect(upstream).not.toHaveBeenCalled();
    // Only an explicit deliberate selection can consume existing private pressure.
    const decisions = living.lifeRuntime.claimedResidentIds().map((id) => ({
      id, status: living.requestOneResidentCognition(id),
    }));
    const chosen = decisions.find((entry) => entry.status === "started");
    expect(chosen).toBeDefined();
    expect(decisions.filter((entry) => entry.status === "started")).toHaveLength(1);
    expect(living.diagnostics().providerHardBudget).toMatchObject({
      maxUpstreamRequests: 1, upstreamRequestsStarted: 1, exhausted: true,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(living.diagnostics().recentProviderEvents.filter(
      (event) => event.status === "request_started",
    )).toHaveLength(1);
    expect(living.diagnostics().recentProviderEvents.find(
      (event) => event.status === "request_started",
    )?.residentId).toBe(chosen!.id);

    await flushMicrotasks();
    for (let step = 0; step < 1200; step++) {
      living.advanceOneWorldTick();
      if (step % 40 === 0) await flushMicrotasks();
    }
    expect(living.diagnostics().providerRequestCount).toBe(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(living.requestOneResidentCognition(chosen!.id)).toBe("budget_exhausted");
    expect(living.world.tick).toBe(3_800);
  });

  it("manual selection leaves other residents' genuine queued private reasons untouched", async () => {
    const calledResidents: string[] = [];
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body)) as { resident: { id: string } };
      calledResidents.push(context.resident.id);
      return Response.json({ ok: false, code: "global_limit" }, { status: 429 });
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual",
      maxConcurrentCognition: 5,
      maxUpstreamRequests: 1,
      fetcher: upstream,
    });

    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    expect(upstream).not.toHaveBeenCalled();
    // Collect real, previously earned five-resident reasons before choosing.
    // The old implementation inadvertently dispatched (then abandoned) peers.
    expect(living.cognition.collectReadyBatches()).toBeGreaterThanOrEqual(2);
    const before = living.diagnostics().cognition;
    expect(before.queuedResidents).toContain("resident.mira");
    const unselected = before.queuedResidents.filter(id => id !== "resident.mira");
    expect(unselected.length).toBeGreaterThan(0);
    expect(before.inFlightResidents).toEqual([]);

    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    expect(calledResidents).toEqual(["resident.mira"]);
    expect(upstream).toHaveBeenCalledTimes(1);
    const after = living.diagnostics().cognition;
    expect(after.queuedResidents).toEqual(unselected);
    expect(after.inFlightResidents).toEqual(["resident.mira"]);
    expect(after.activeRequestCount).toBe(1);
    expect(after.retryNotBeforeTick).toEqual({});
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);

    await flushMicrotasks();
    living.advanceOneWorldTick();
    expect(living.diagnostics().cognition.queuedResidents).toEqual(unselected);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("only a deliberate button request forwards an actually heard player utterance from the shared World", async () => {
    const forwarded: Array<{ resident: { id: string }, reasons: Array<{ kind: string }> }> = [];
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      forwarded.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ok:false,code:"global_limit"}), {
        status:429, headers:{"content-type":"application/json"},
      });
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      composition: createFiveResidentRegionComposition({ playerStart: { x: 1000, y: 700 } }),
      providerDispatchMode: "manual",
      maxUpstreamRequests: 1,
      fetcher: upstream,
    });
    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    const playerSpeech = living.world.speak(
      "player.jozz", "Mira, czy możemy chwilę porozmawiać?", 420, ["resident.mira"],
    );
    expect(playerSpeech.kind).toBe("speech");
    living.advanceOneWorldTick();
    expect(upstream).not.toHaveBeenCalled();
    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]!.resident.id).toBe("resident.mira");
    expect(forwarded[0]!.reasons.some((reason) => reason.kind === "heard_speech")).toBe(true);
    // Nothing else can be triggered by the next ticks or a second press.
    await flushMicrotasks();
    for(let i=0;i<500;i++) living.advanceOneWorldTick();
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(living.requestOneResidentCognition("resident.mira")).toBe("budget_exhausted");
  });

  it("admits a single explicitly chosen private speech response into the SAME World after manual press", async () => {
    const intendedText = "Słyszę cię. Chętnie porozmawiam.";
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body)) as {
        resident: {id:string}; reasons: Array<{id:string;kind:string}>;
      };
      expect(context.resident.id).toBe("resident.mira");
      const heard = context.reasons.find((r) => r.kind === "heard_speech");
      expect(heard).toBeDefined();
      return Response.json({
        ok: true,
        originReasonId: heard!.id,
        proposal: {
          version: 1,
          commitmentDecision: {
            kind: "accept",
            reason: "I truly heard addressed player speech and choose one reply.",
            intent: {
              kind: "communicate",
              goal: "reply to the actually heard player",
              targetActorId: "player.jozz",
              targetRegionId: null,
              targetPosition: null,
              text: intendedText,
            },
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: 30,
        },
      });
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      composition: createFiveResidentRegionComposition({ playerStart: { x: 1000, y: 700 } }),
      providerDispatchMode: "manual",
      maxUpstreamRequests: 1,
      fetcher: upstream,
    });
    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    living.world.speak("player.jozz", "Mira, porozmawiaj ze mną.", 420, ["resident.mira"]);
    living.advanceOneWorldTick();
    const heardReasonId = living.life("resident.mira")!.resident.pendingCognitionReasons()
      .find(reason => reason.kind === "heard_speech")?.id;
    expect(heardReasonId).toBeTruthy();
    expect(upstream).not.toHaveBeenCalled();
    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    await flushMicrotasks();
    // Provider completion is inert until the next World boundary.
    expect(living.life("resident.mira")!.matterScope.matterIds()).toEqual([]);
    living.advanceOneWorldTick();
    const accepted = living.diagnostics().recentProviderEvents.find(
      e => e.status === "admitted" && e.residentId === "resident.mira",
    );
    expect(accepted?.admittedChoice).toMatchObject({
      kind: "accept",
      originReasonId: heardReasonId,
      matterId: expect.any(String),
      runId: expect.any(String),
    });
    const acceptedMatterId = accepted?.admittedChoice?.matterId;
    expect(acceptedMatterId).toBeTruthy();
    expect(living.life("resident.mira")!.currentLifeView().matters.find(
      matter => matter.id === acceptedMatterId,
    )).toMatchObject({ status: "active" });
    let factual = false;
    for(let tick=0; tick<300; tick++) {
      living.advanceOneWorldTick();
      if (living.world.diagnostics().recentOccurrences.some(o =>
        o.kind === "speech" && o.actorId === "resident.mira" && o.text === intendedText
      )) { factual = true; break; }
    }
    expect(factual).toBe(true);
    expect(living.diagnostics().recentProviderEvents.find(
      e => e.status === "admitted" && e.residentId === "resident.mira",
    )?.admittedChoice?.matterId).toBe(acceptedMatterId);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(living.diagnostics().providerHardBudget.exhausted).toBe(true);
  });

  it("keeps a deliberate decline as a valid cognition choice, NOT a World success", async () => {
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body)) as {
        resident: { id: string }; reasons: Array<{ id: string; kind: string }>;
      };
      expect(context.resident.id).toBe("resident.mira");
      const ownOrigin = context.reasons.find(reason => reason.kind === "activity_completed");
      expect(ownOrigin).toBeDefined();
      return Response.json({
        ok: true, originReasonId: ownOrigin!.id,
        proposal: {
          version: 1,
          commitmentDecision: { kind: "decline", reason: "I choose not to take new work." },
          beliefs: [], concerns: [], reviewAfterSeconds: 60,
        },
      });
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual", maxUpstreamRequests: 1, fetcher: upstream,
    });
    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    const life = living.life("resident.mira")!;
    const origin = life.resident.pendingCognitionReasons().find(
      reason => reason.kind === "activity_completed",
    );
    expect(origin).toBeDefined();
    const before = living.world.publicSnapshot().actors.find(
      actor => actor.id === "resident.mira",
    )!.position;
    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    await flushMicrotasks();
    expect(living.diagnostics().recentProviderEvents.some(e => e.admittedChoice)).toBe(false);
    living.advanceOneWorldTick();
    const admitted = living.diagnostics().recentProviderEvents.find(
      e => e.residentId === "resident.mira" && e.status === "admitted",
    );
    expect(admitted?.admittedChoice).toEqual({
      originReasonId: origin!.id, kind: "decline", matterId: null, runId: null,
    });
    expect(life.matterScope.matterIds()).toEqual([]);
    for (let i = 0; i < 360; i++) living.advanceOneWorldTick();
    expect(living.world.publicSnapshot().actors.find(
      actor => actor.id === "resident.mira",
    )!.position).toEqual(before);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("refuses a completed manual model answer when its actual private World-speech reason was locally invalidated in flight", async () => {
    const gate: { release?: (response: Response) => void } = {};
    const captured: Array<{
      resident: { id: string };
      reasons: Array<{ id: string; kind: string }>;
    }> = [];
    const upstream = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      captured.push(JSON.parse(String(init?.body)));
      return new Promise<Response>((resolve) => { gate.release = resolve; });
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      composition: createFiveResidentRegionComposition({ playerStart: { x: 1000, y: 700 } }),
      providerDispatchMode: "manual",
      maxUpstreamRequests: 1,
      fetcher: upstream,
    });
    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    const actualSpeech = living.world.speak(
      "player.jozz", "Mira, czy rozmawiamy?", 420, ["resident.mira"],
    );
    expect(actualSpeech.kind).toBe("speech");
    living.advanceOneWorldTick();
    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(captured[0]?.resident.id).toBe("resident.mira");
    const heard = captured[0]?.reasons.find((reason) => reason.kind === "heard_speech");
    expect(heard).toBeDefined();
    if (!heard || !gate.release) throw new Error("no in-flight private speech request");

    // Independently model a local settlement WHILE the real transport is pending.
    // This is a deliberately controlled local fact, not a claim of emergent agency.
    const mira = living.life("resident.mira")!;
    expect(mira.resident.invalidateSemanticPressure(
      heard.id, living.world.tick, "resident-local reason no longer needs judgement",
    )).toBe(true);

    gate.release(Response.json({
      ok: true,
      originReasonId: heard.id,
      proposal: {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "answer the privately heard player",
          intent: {
            kind: "communicate",
            goal: "reply to heard address",
            targetActorId: "player.jozz",
            targetRegionId: null,
            targetPosition: null,
            text: "Mogę porozmawiać.",
          },
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
    }));
    await flushMicrotasks();
    expect(living.diagnostics().providerInboxCount).toBe(1);
    expect(mira.matterScope.matterIds()).toEqual([]);
    living.advanceOneWorldTick();

    expect(living.diagnostics().recentProviderEvents.some(
      (event) => event.residentId === "resident.mira"
        && event.status === "admitted"
        && event.detail.includes("stale: semantic_pressure_changed_during_request"),
    )).toBe(true);
    expect(mira.matterScope.matterIds()).toEqual([]);
    expect(living.diagnostics().recentProviderEvents.some(e => e.admittedChoice)).toBe(false);
    expect(mira.resident.pendingCognitionReasons().some(
      (reason) => reason.id === heard.id,
    )).toBe(false);
    for (let tick = 0; tick < 120; tick += 1) living.advanceOneWorldTick();
    expect(living.world.diagnostics().recentOccurrences.some(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === "resident.mira"
        && occurrence.text === "Mogę porozmawiać.",
    )).toBe(false);
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects manual invocation in automatic mode rather than granting a second provider path", () => {
    const living = new FiveResidentUnifiedLivingRuntime({
      fetcher: vi.fn(async () => Response.json({ok:false,code:"global_limit"},{status:429})),
    });
    expect(() => living.requestOneResidentCognition("resident.janek")).toThrow(
      /manual cognition cannot be invoked/,
    );
  });

  it("does not permit silently disabling the finite upstream request ceiling", () => {
    expect(() => new FiveResidentUnifiedLivingRuntime({
      fetcher: vi.fn(),
      maxUpstreamRequests: 0,
    })).toThrow(/positive safe integer/);
    expect(() => new FiveResidentUnifiedLivingRuntime({
      fetcher: vi.fn(),
      maxUpstreamRequests: Number.POSITIVE_INFINITY,
    })).toThrow(/positive safe integer/);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function firstWaveResolved(
  living: FiveResidentUnifiedLivingRuntime,
  firstWave: ReadonlyMap<string, readonly string[]>,
): boolean {
  for (const [residentId, matterIds] of firstWave) {
    const life = living.life(residentId as Parameters<typeof living.life>[0]);
    if (!life) return false;
    for (const matterId of matterIds) {
      if (life.kernel.matter(matterId)?.status !== "resolved") return false;
    }
  }
  return true;
}
