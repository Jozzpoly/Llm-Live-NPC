import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";
import { createZeroProviderLocalLifeSlice } from "./zero-provider-local-life-slice";

const MAX_LOCAL_LIFE_STEPS = 800;
const QUIET_WINDOW_TICKS = 3_600;

describe("R2 noisy-world semantic homeostasis", () => {
  it("lets Mira keep living through noisy causal perception while unresolved semantic pressure stays small and explainable", () => {
    const slice = createZeroProviderLocalLifeSlice();

    // Many first-contact speakers are physically near enough to be heard, but their
    // identities have not yet been acquired by Mira when the queued speech is
    // delivered. The same World step then supplies normal sight evidence.
    const strangerIds = Array.from({ length: 12 }, (_, index) => `player.ambient-${index}`);
    for (let index = 0; index < strangerIds.length; index += 1) {
      const id = strangerIds[index]!;
      slice.world.addPlayer(id, {
        x: 790 + (index % 4) * 18,
        y: 560 + Math.floor(index / 4) * 18,
      }, {
        maxSpeed: index === 0 ? 48_000 : 140,
      });
      slice.world.speak(id, `ambient stranger line ${index}`, 420, []);
      slice.world.emitInteraction(
        id,
        `object.ambient-${index}`,
        `ambient interaction ${index}`,
        420,
      );
    }

    const first = slice.advanceOneWorldTick();
    expect(first.status).not.toBe("blocked");
    expect(first.status).not.toBe("authority_lost");

    const firstPercepts = slice.resident.diagnostics().recentPercepts;
    expect(firstPercepts.filter((percept) =>
      percept.phenomenon === "speech"
      && percept.text?.startsWith("ambient stranger line")
    )).toHaveLength(strangerIds.length);
    expect(firstPercepts.filter((percept) =>
      percept.phenomenon === "actor_sight_enter"
      && strangerIds.includes(percept.actorId ?? "")
    ).length).toBeGreaterThanOrEqual(strangerIds.length);
    expect(firstPercepts.filter((percept) =>
      percept.phenomenon === "interaction"
      && percept.summary.startsWith("ambient interaction")
    )).toHaveLength(strangerIds.length);
    expect(slice.pendingCognitionReasons()).toEqual([]);

    const worldChangeDecisions = slice.resident.semanticPressureDecisions().filter(
      (decision) => decision.code === "world_change",
    );
    expect(worldChangeDecisions).toHaveLength(strangerIds.length);
    expect(worldChangeDecisions.every((decision) =>
      decision.disposition === "observation_only"
      && decision.cognitionReason === null
    )).toBe(true);

    // The normal participant is now privately recognized by sight. Repeated
    // unaddressed speech from that same recognized actor may be socially relevant,
    // but R2 must coalesce it into one unresolved thread rather than one reason per
    // utterance.
    for (let index = 0; index < 16; index += 1) {
      slice.playerSpeak(`background player line ${index}`, false);
      const local = slice.advanceOneWorldTick();
      expect(local.status).not.toBe("blocked");
      expect(local.status).not.toBe("authority_lost");
    }

    expect(slice.pendingCognitionReasons()).toEqual([]);
    const socialDecisions = slice.resident.semanticPressureDecisions().filter(
      (decision) => decision.code === "known_social_speech",
    );
    expect(socialDecisions).toHaveLength(16);
    expect(socialDecisions.every((decision) =>
      decision.disposition === "observation_only"
      && decision.cognitionReason === null
    )).toBe(true);

    // Real visibility churn remains perception truth but does not become a semantic
    // queue. Sight is sampled before integration, hence out -> exit -> return -> enter
    // spans three authoritative World ticks.
    const churnActor = strangerIds[0]!;
    slice.world.setActorMotionIntent(churnActor, { x: 48_000, y: 0 });
    slice.advanceOneWorldTick();
    slice.world.setActorMotionIntent(churnActor, { x: -48_000, y: 0 });
    slice.advanceOneWorldTick();
    slice.world.setActorMotionIntent(churnActor, { x: 0, y: 0 });
    slice.advanceOneWorldTick();

    const churnPercepts = slice.resident.diagnostics().recentPercepts.filter(
      (percept) => percept.actorId === churnActor,
    );
    expect(churnPercepts.some((percept) => percept.phenomenon === "actor_sight_exit")).toBe(true);
    expect(churnPercepts.filter((percept) => percept.phenomenon === "actor_sight_enter").length)
      .toBeGreaterThanOrEqual(2);
    expect(slice.pendingCognitionReasons()).toHaveLength(0);

    // One genuinely addressed contact must survive the same metabolism gate and may
    // interrupt the body locally without pretending that "Tak?" settled its meaning.
    const addressed = slice.playerSpeak("Mira, chwila!", true);
    const started = slice.advanceOneWorldTick();
    expect(started.status).toBe("interruption_started");

    const addressedDecision = slice.localDecisions().find(
      (decision) => decision.occurrenceId === addressed.id,
    );
    expect(addressedDecision).toMatchObject({
      classification: "interrupt",
      cognitionReasonSettled: false,
    });
    expect(slice.pendingCognitionReasons()).toHaveLength(1);
    expect(slice.pendingCognitionReasons()).toContainEqual(expect.objectContaining({
      id: addressedDecision?.cognitionReasonId,
      kind: "heard_speech",
      salience: 1,
    }));

    let guard = 0;
    while (slice.phase() !== "settled" && guard < MAX_LOCAL_LIFE_STEPS) {
      const step = slice.advanceOneWorldTick();
      expect(step.status).not.toBe("blocked");
      expect(step.status).not.toBe("authority_lost");
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_LOCAL_LIFE_STEPS);
    expect(slice.phase()).toBe("settled");
    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.world.materialObject(slice.objectId)?.location).toEqual({
      kind: "free",
      position: slice.destination,
    });

    const pressureAtQuiet = slice.pendingCognitionReasons();
    expect(pressureAtQuiet).toHaveLength(1);
    expect(pressureAtQuiet.some((reason) => reason.kind === "quiet_review")).toBe(false);
    const perceptCountAtQuiet = slice.resident.diagnostics().recentPercepts.length;

    for (let tick = 0; tick < QUIET_WINDOW_TICKS; tick += 1) {
      const step = slice.advanceOneWorldTick();
      expect(step.status).toBe("settled");
    }

    expect(slice.pendingCognitionReasons()).toEqual(pressureAtQuiet);
    expect(slice.resident.diagnostics().recentPercepts).toHaveLength(perceptCountAtQuiet);
    expect(slice.resident.cognitionScheduleDiagnostics().lastRequestTick).toBeNull();
  });

  it("replays the same noisy local-life campaign to the same causal/pressure end state", () => {
    const first = deterministicNoisyReplay();
    const second = deterministicNoisyReplay();

    expect(second).toEqual(first);
    expect(first.phase).toBe("settled");
    expect(first.matterStatus).toBe("resolved");
    expect(first.pendingReasons).toEqual([
      expect.objectContaining({
        kind: "heard_speech",
        salience: 1,
      }),
    ]);
    expect(first.lifecycle.some((entry) => entry.status === "pending")).toBe(true);
    expect(first.pressureDecisionCounts.observationOnly).toBeGreaterThan(0);
    expect(first.pressureDecisionCounts.unresolved).toBe(1);
  });

  it("promotes Janek checked material absence as one real discrepancy without event amplification", () => {
    const slice = createFiveResidentJanekMissingCrateSlice();

    let state = slice.stepJanek();
    let guard = 0;
    while (state.status === "running" && guard < 560) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(guard).toBeLessThan(560);
    expect(state.status).toBe("semantic_pressure");
    if (state.status !== "semantic_pressure") return;

    const pressure = slice.resident.pendingCognitionReasons();
    expect(pressure).toEqual([
      expect.objectContaining({
        id: "reason:resident.janek:checked-absence:crate.workshop.01",
        kind: "uncertainty",
        salience: 0.9,
        evidenceIds: [state.checkedAbsenceEvidence.id],
      }),
    ]);

    const original = structuredClone(pressure);
    for (let tick = 0; tick < 300; tick += 1) {
      slice.world.step();
      const repeated = slice.stepJanek();
      expect(repeated.status).toBe("semantic_pressure");
    }

    expect(slice.resident.pendingCognitionReasons()).toEqual(original);
    expect(slice.resident.semanticPressureLifecycleEvents().filter(
      (event) => event.reasonId === "reason:resident.janek:checked-absence:crate.workshop.01"
        && event.kind === "promoted",
    )).toHaveLength(1);
    expect(slice.resident.cognitionScheduleDiagnostics().lastRequestTick).toBeNull();
  });
});


function deterministicNoisyReplay() {
  const slice = createZeroProviderLocalLifeSlice();

  for (let index = 0; index < 6; index += 1) {
    const id = `player.replay-ambient-${index}`;
    slice.world.addPlayer(id, {
      x: 800 + (index % 3) * 20,
      y: 570 + Math.floor(index / 3) * 20,
    });
    slice.world.speak(id, `replay ambient speech ${index}`, 420, []);
    slice.world.emitInteraction(
      id,
      `object.replay-${index}`,
      `replay ambient interaction ${index}`,
      420,
    );
  }
  slice.advanceOneWorldTick();

  for (let index = 0; index < 8; index += 1) {
    slice.playerSpeak(`replay background player line ${index}`, false);
    slice.advanceOneWorldTick();
  }

  slice.playerSpeak("Mira, replay contact.", true);
  const started = slice.advanceOneWorldTick();
  if (started.status !== "interruption_started") {
    throw new Error(`deterministic replay failed to start contact: ${started.status}`);
  }

  let guard = 0;
  while (slice.phase() !== "settled" && guard < MAX_LOCAL_LIFE_STEPS) {
    const step = slice.advanceOneWorldTick();
    if (step.status === "blocked" || step.status === "authority_lost") {
      throw new Error(`deterministic replay local life failed: ${step.status}`);
    }
    guard += 1;
  }
  if (slice.phase() !== "settled") throw new Error("deterministic replay did not settle");

  for (let tick = 0; tick < 600; tick += 1) slice.advanceOneWorldTick();

  const decisions = slice.resident.semanticPressureDecisions();
  const matter = slice.kernel.matter(slice.mainMatterId);
  return {
    tick: slice.world.tick,
    phase: slice.phase(),
    attention: slice.attention(),
    matterStatus: matter?.status ?? null,
    matterActiveRunId: matter?.activeRunId ?? null,
    objectLocation: slice.world.materialObject(slice.objectId)?.location ?? null,
    pendingReasons: slice.pendingCognitionReasons(),
    lifecycle: slice.resident.semanticPressureLifecycleSnapshot(),
    localDecisions: slice.localDecisions(),
    pressureDecisionCounts: {
      observationOnly: decisions.filter((decision) => decision.disposition === "observation_only").length,
      unresolved: decisions.filter((decision) => decision.disposition === "unresolved").length,
    },
    pressureDecisionSignature: decisions.map((decision) => ({
      tick: decision.tick,
      evidenceId: decision.evidenceId,
      occurrenceId: decision.occurrenceId,
      disposition: decision.disposition,
      code: decision.code,
      reasonId: decision.cognitionReason?.id ?? null,
    })),
  };
}
