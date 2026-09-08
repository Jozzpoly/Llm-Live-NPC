import { describe, expect, it } from "vitest";
import { ExecutionDriver } from "../execution/execution-driver";
import { World } from "../world/world";
import type { FirstPresenceSemanticTransportEnvelope } from "./first-presence-semantic-api";
import {
  FirstPresenceBrowserProbe,
  createFirstPresenceBrowserProbeSpecimen
} from "./first-presence-browser-probe";

function envelope(semanticCourse: string): FirstPresenceSemanticTransportEnvelope {
  return {
    output: { semanticCourse },
    model: "browser-probe-test-model",
    gatewayLogId: "browser-probe-log",
    latencyMs: 31,
    usage: { total_tokens: 13 }
  };
}

function runUntilOutcome(
  driver: ExecutionDriver,
  probe: FirstPresenceBrowserProbe,
  maxFrames = 180
): void {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    const result = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    probe.afterExecutionFrame(result);
    if (probe.state().phase === "outcome_recorded") return;
  }
}

describe("First Presence browser live probe", () => {
  it("runs one real Red frame, holds only the NPC during pending semantic transport, then manually replaces into a factual Blue outcome", async () => {
    const world = new World(createFirstPresenceBrowserProbeSpecimen());
    let resolveTransport!: (value: FirstPresenceSemanticTransportEnvelope) => void;
    let seenInput: unknown = null;
    const probe = new FirstPresenceBrowserProbe(world, async (input) => {
      seenInput = structuredClone(input);
      return new Promise<FirstPresenceSemanticTransportEnvelope>((resolve) => {
        resolveTransport = resolve;
      });
    });
    const driver = new ExecutionDriver(world, probe.executor);

    const started = probe.start();
    expect(started.status).toBe("started");
    if (started.status !== "started") return;
    expect(probe.state()).toMatchObject({
      phase: "red_running",
      semanticCourse: "fetch Red mug",
      activeTaskRunId: started.runId,
      canStart: false
    });

    const beforeFirst = world.snapshot();
    const npcBeforeFirst = beforeFirst.entities.find((entity) => entity.id === "npc.001");
    if (!npcBeforeFirst || npcBeforeFirst.kind !== "npc") throw new Error("NPC missing before probe frame.");

    const firstFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    probe.afterExecutionFrame(firstFrame);

    const afterFirst = world.snapshot();
    const npcAfterFirst = afterFirst.entities.find((entity) => entity.id === "npc.001");
    if (!npcAfterFirst || npcAfterFirst.kind !== "npc") throw new Error("NPC missing after first probe frame.");
    expect(npcAfterFirst.position).not.toEqual(npcBeforeFirst.position);
    expect(seenInput).toEqual({
      currentSemanticCourse: "fetch Red mug",
      semanticEvidence: {
        kind: "heard",
        source: { kind: "actor", actorId: "player.jozz" },
        summary: "player.jozz said: Actually, bring me the blue mug."
      }
    });
    expect(probe.state()).toMatchObject({
      phase: "semantic_pending",
      transportStatus: "pending",
      heldRunIds: [started.runId]
    });

    const heldSteps = probe.executor.state().stepsUsed;
    const tickBeforePendingFrames = afterFirst.tick;
    const playerBeforePending = afterFirst.entities.find((entity) => entity.id === "player.jozz");
    if (!playerBeforePending || playerBeforePending.kind !== "player") {
      throw new Error("Player missing before pending frames.");
    }

    for (let frame = 0; frame < 8; frame += 1) {
      const result = driver.step({ playerControl: { moveX: 1, moveY: 0 } });
      probe.afterExecutionFrame(result);
    }

    const duringPending = world.snapshot();
    const npcDuringPending = duringPending.entities.find((entity) => entity.id === "npc.001");
    const playerDuringPending = duringPending.entities.find((entity) => entity.id === "player.jozz");
    if (!npcDuringPending || npcDuringPending.kind !== "npc" || !playerDuringPending || playerDuringPending.kind !== "player") {
      throw new Error("Actors missing during pending probe frames.");
    }
    expect(duringPending.tick).toBe(tickBeforePendingFrames + 8);
    expect(playerDuringPending.position.x).toBeGreaterThan(playerBeforePending.position.x);
    expect(npcDuringPending.position).toEqual(npcAfterFirst.position);
    expect(probe.executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: started.runId }
    });

    resolveTransport(envelope("fetch Blue mug"));
    await probe.waitForSemantic();

    expect(probe.state()).toMatchObject({
      phase: "decision_ready",
      transportStatus: "provider_returned",
      semanticCourse: "fetch Blue mug",
      heldRunIds: [started.runId],
      canResume: true,
      canReplace: true,
      model: "browser-probe-test-model",
      gatewayLogId: "browser-probe-log",
      latencyMs: 31
    });
    expect(probe.executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.runId },
      task: { targetId: "item.mug" }
    });

    const replacement = probe.replace();
    expect(replacement.status).toBe("replacement_started");
    if (replacement.status !== "replacement_started") return;
    expect(replacement.retiredRunId).toBe(started.runId);
    expect(probe.state()).toMatchObject({
      phase: "replacement_running",
      heldRunIds: [],
      activeTaskRunId: replacement.replacementRunId
    });
    expect(probe.executor.state()).toMatchObject({
      status: "running",
      task: { targetId: "item.blue-mug" }
    });

    runUntilOutcome(driver, probe);
    expect(probe.state()).toMatchObject({
      phase: "outcome_recorded",
      lastOutcomeSummary: expect.stringMatching(/^succeeded ·/)
    });

    const final = world.snapshot();
    expect(final.entities.find((entity) => entity.id === "npc.001")).toMatchObject({
      kind: "npc",
      heldItemId: "item.blue-mug"
    });
    expect(final.entities.find((entity) => entity.id === "item.blue-mug")).toMatchObject({
      kind: "item",
      heldBy: "npc.001"
    });
    expect(final.entities.find((entity) => entity.id === "item.mug")).toMatchObject({
      kind: "item",
      heldBy: null
    });

    expect(probe.state().trace.map((event) => event.kind)).toEqual([
      "experience",
      "task_started",
      "experience",
      "semantic_pending",
      "task_held",
      "semantic_commit",
      "task_superseded",
      "task_started",
      "task_outcome"
    ]);
  });

  it("keeps the exact hold after transport failure, exposes explicit retry, and resumes Red only after Owner disposition", async () => {
    const world = new World(createFirstPresenceBrowserProbeSpecimen());
    let calls = 0;
    const probe = new FirstPresenceBrowserProbe(world, async () => {
      calls += 1;
      if (calls === 1) throw new Error("synthetic browser transport failure");
      return envelope("fetch Red mug");
    });
    const driver = new ExecutionDriver(world, probe.executor);

    const started = probe.start();
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    const firstFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    probe.afterExecutionFrame(firstFrame);
    await probe.waitForSemantic();

    expect(probe.state()).toMatchObject({
      phase: "semantic_retryable",
      transportStatus: "transport_failed",
      lastError: "synthetic browser transport failure",
      heldRunIds: [started.runId],
      canRetry: true,
      canResume: false,
      canReplace: false
    });

    expect(probe.retry()).toBe(true);
    expect(probe.state()).toMatchObject({
      phase: "semantic_pending",
      transportStatus: "pending",
      heldRunIds: [started.runId]
    });
    await probe.waitForSemantic();

    expect(probe.state()).toMatchObject({
      phase: "decision_ready",
      semanticCourse: "fetch Red mug",
      heldRunIds: [started.runId],
      canResume: true,
      canReplace: true
    });
    expect(calls).toBe(2);

    const resumed = probe.resume();
    expect(resumed).toEqual({ status: "resumed", runId: started.runId });
    expect(probe.state()).toMatchObject({ phase: "resumed_running", heldRunIds: [] });

    runUntilOutcome(driver, probe);
    expect(probe.state()).toMatchObject({
      phase: "outcome_recorded",
      lastOutcomeSummary: expect.stringMatching(/^succeeded ·/)
    });
    expect(world.snapshot().entities.find((entity) => entity.id === "npc.001")).toMatchObject({
      kind: "npc",
      heldItemId: "item.mug"
    });

    const trace = probe.state().trace;
    expect(trace.filter((event) => event.kind === "task_held")).toHaveLength(1);
    const pending = trace.filter((event) => event.kind === "semantic_pending");
    expect(pending).toHaveLength(2);
    expect(pending[0]).toMatchObject({ reusedExistingHold: false });
    expect(pending[1]).toMatchObject({ reusedExistingHold: true });
    expect(
      trace.some(
        (event) => event.kind === "semantic_attempt_ended" && event.outcome === "abandoned"
      )
    ).toBe(true);
    expect(trace.some((event) => event.kind === "task_resumed")).toBe(true);
  });

  it("keeps the browser specimen extension local instead of changing the canonical P1 specimen", () => {
    const specimen = createFirstPresenceBrowserProbeSpecimen();
    expect(specimen.entities.filter((entity) => entity.id === "item.blue-mug")).toHaveLength(1);
    expect(specimen.entities.find((entity) => entity.id === "item.blue-mug")).toMatchObject({
      kind: "item",
      label: "Blue mug",
      heldBy: null
    });
  });
});
