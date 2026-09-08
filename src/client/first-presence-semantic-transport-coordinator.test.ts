import { describe, expect, it, vi } from "vitest";
import type { P2E5ModelSemanticInput } from "../research/p2-e5-semantic-provider-authority-membrane";
import type { P2E6LocalTaskGrounder } from "../research/p2-e6-grounded-task-start-causality";
import { FirstPresenceComposition } from "../resident/first-presence-composition";
import {
  FirstPresenceDeferredSemanticOwner,
  createFirstPresenceDeferredExecution
} from "../resident/first-presence-deferred-semantics";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { FirstPresenceSemanticTransportEnvelope } from "./first-presence-semantic-api";
import {
  FirstPresenceSemanticTransportCoordinator,
  type FirstPresenceSemanticTransportProvider
} from "./first-presence-semantic-transport-coordinator";

const exactFetchLabelGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requestedLabel = match[1].trim().toLocaleLowerCase();
  const matches = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requestedLabel
  );
  if (matches.length !== 1) return null;
  return {
    taskId: `fetch:${matches[0].id}`,
    task: {
      kind: "approach-and-interact",
      actorId,
      targetId: matches[0].id
    }
  };
};

function transportEnvelope(semanticCourse: string): FirstPresenceSemanticTransportEnvelope {
  return {
    output: { semanticCourse },
    model: "test-semantic-model",
    gatewayLogId: "gateway-test-log",
    latencyMs: 23,
    usage: { total_tokens: 11 }
  };
}

function createFixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const red = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !red || red.kind !== "item") {
    throw new Error("Semantic transport coordinator fixture requires npc.001 and item.mug.");
  }

  red.position = { x: npc.position.x + 180, y: npc.position.y };
  specimen.entities.push({
    id: "item.blue-mug",
    kind: "item",
    label: "Blue mug",
    position: { x: npc.position.x - 110, y: npc.position.y },
    radius: 9,
    heldBy: null
  });

  const world = new World(specimen);
  const execution = createFirstPresenceDeferredExecution();
  const presence = new FirstPresenceComposition(
    world,
    execution.executor,
    () => ({ semanticCourse: "fetch Red mug" }),
    exactFetchLabelGrounder
  );
  const deferred = new FirstPresenceDeferredSemanticOwner(
    presence.resident,
    execution,
    presence.traceSink()
  );

  const initial = presence.receiveDirectPlayerSpeech("Bring me the red mug.");
  const matter = presence.openMatterFromEvidence(initial.id);
  const initialDecision = presence.reconsiderMatter(matter.id);
  expect(initialDecision).toMatchObject({
    status: "applied",
    matter: { semanticCourse: "fetch Red mug", semanticRevision: 2 }
  });

  const started = presence.startMatterTask(matter.id);
  expect(started.status).toBe("started");
  if (started.status !== "started") throw new Error("Red task did not start.");

  return { world, execution, presence, deferred, matter, started };
}

function advanceFromSpeech(
  presence: FirstPresenceComposition,
  matterId: string,
  text: string
): void {
  const evidence = presence.receiveDirectPlayerSpeech(text);
  presence.advanceMatterFromEvidence(matterId, evidence.id);
}

describe("First Presence semantic transport coordinator", () => {
  it("settles the exact local attempt from bounded transport output but never chooses a mechanical disposition", async () => {
    const { execution, presence, deferred, matter, started } = createFixture();
    advanceFromSpeech(presence, matter.id, "Actually, bring me the blue mug.");

    const inputs: P2E5ModelSemanticInput[] = [];
    const coordinator = new FirstPresenceSemanticTransportCoordinator(deferred, async (input) => {
      inputs.push(structuredClone(input));
      return transportEnvelope("fetch Blue mug");
    });

    const result = await coordinator.reconsider(matter.id);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toEqual({
      currentSemanticCourse: "fetch Red mug",
      semanticEvidence: {
        kind: "heard",
        source: { kind: "actor", actorId: "player.jozz" },
        summary: "player.jozz said: Actually, bring me the blue mug."
      }
    });
    expect(result).toMatchObject({
      status: "provider_returned",
      matterId: matter.id,
      heldRunId: started.binding.runId,
      reusedExistingHold: false,
      settlement: {
        status: "applied",
        matter: { semanticCourse: "fetch Blue mug", semanticRevision: 4 }
      },
      diagnostics: {
        model: "test-semantic-model",
        gatewayLogId: "gateway-test-log",
        latencyMs: 23,
        usage: { total_tokens: 11 }
      }
    });

    // Semantic settlement is deliberately not mechanical policy. The old Red
    // run remains exact and held until a separate caller chooses resume/replace.
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.binding.runId },
      task: { targetId: "item.mug" }
    });
  });

  it("abandons only the exact attempt on transport failure, preserves the hold, then retries through a new attempt that reuses it", async () => {
    const { execution, presence, deferred, matter, started } = createFixture();
    advanceFromSpeech(presence, matter.id, "Wait — keep the red mug after all.");

    let calls = 0;
    const coordinator = new FirstPresenceSemanticTransportCoordinator(deferred, async () => {
      calls += 1;
      if (calls === 1) throw new Error("synthetic network failure");
      return transportEnvelope("fetch Red mug");
    });

    const failed = await coordinator.reconsider(matter.id);
    expect(failed).toMatchObject({
      status: "transport_failed",
      matterId: matter.id,
      heldRunId: started.binding.runId,
      reusedExistingHold: false,
      error: "synthetic network failure",
      abandonment: {
        status: "abandoned",
        residentAuthority: "released"
      }
    });
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    const retry = await coordinator.reconsider(matter.id);
    expect(retry).toMatchObject({
      status: "provider_returned",
      matterId: matter.id,
      heldRunId: started.binding.runId,
      reusedExistingHold: true,
      settlement: {
        status: "applied",
        matter: { semanticCourse: "fetch Red mug" }
      }
    });
    expect(calls).toBe(2);
    expect(deferred.state().heldRuns).toHaveLength(1);
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.binding.runId }
    });

    if (retry.status !== "provider_returned" || retry.settlement.status !== "applied") return;
    expect(deferred.resumeHeldTask(matter.id, retry.settlement)).toMatchObject({
      status: "released",
      hold: { runId: started.binding.runId }
    });
    expect(deferred.state().heldRuns).toEqual([]);
  });

  it("rejects a duplicate same-matter coordinator call before a second transport request exists", async () => {
    const { presence, deferred, matter } = createFixture();
    advanceFromSpeech(presence, matter.id, "Actually, bring me the blue mug.");

    let resolveFirst!: (value: FirstPresenceSemanticTransportEnvelope) => void;
    let transportCalls = 0;
    const transport: FirstPresenceSemanticTransportProvider = async () => {
      transportCalls += 1;
      return new Promise<FirstPresenceSemanticTransportEnvelope>((resolve) => {
        resolveFirst = resolve;
      });
    };
    const coordinator = new FirstPresenceSemanticTransportCoordinator(deferred, transport);

    const first = coordinator.reconsider(matter.id);
    const duplicate = await coordinator.reconsider(matter.id);

    expect(duplicate).toEqual({
      status: "not_started",
      begin: { status: "rejected", reason: "matter_attempt_pending" }
    });
    expect(transportCalls).toBe(1);

    resolveFirst(transportEnvelope("fetch Blue mug"));
    await expect(first).resolves.toMatchObject({
      status: "provider_returned",
      settlement: { status: "applied" }
    });
  });

  it("lets newer grounded evidence supersede an in-flight transport attempt while reusing one mechanical hold and rejecting the late old response", async () => {
    const { presence, deferred, matter, started } = createFixture();
    advanceFromSpeech(presence, matter.id, "Actually, bring me the blue mug.");

    const resolvers: Array<(value: FirstPresenceSemanticTransportEnvelope) => void> = [];
    const transport: FirstPresenceSemanticTransportProvider = async () =>
      new Promise<FirstPresenceSemanticTransportEnvelope>((resolve) => {
        resolvers.push(resolve);
      });
    const coordinator = new FirstPresenceSemanticTransportCoordinator(deferred, transport);

    const oldRun = coordinator.reconsider(matter.id);
    expect(resolvers).toHaveLength(1);

    advanceFromSpeech(presence, matter.id, "Correction: keep the red mug instead.");
    const currentRun = coordinator.reconsider(matter.id);
    expect(resolvers).toHaveLength(2);
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [
        {
          matterId: matter.id,
          heldRunId: started.binding.runId,
          reusedExistingHold: true
        }
      ],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    // The newer response wins resident authority because its exact attempt is
    // current. Returning the old network response afterwards cannot resurrect
    // the provider attempt that was causally superseded during the newer begin.
    resolvers[1](transportEnvelope("fetch Red mug"));
    const current = await currentRun;
    expect(current).toMatchObject({
      status: "provider_returned",
      reusedExistingHold: true,
      settlement: {
        status: "applied",
        matter: { semanticCourse: "fetch Red mug" }
      }
    });

    resolvers[0](transportEnvelope("fetch Blue mug"));
    const old = await oldRun;
    expect(old).toMatchObject({
      status: "provider_returned",
      settlement: { status: "attempt_rejected", reason: "unknown_attempt" }
    });
    expect(presence.resident.matter(matter.id)).toMatchObject({
      semanticCourse: "fetch Red mug",
      activeTaskRunId: started.binding.runId
    });
    expect(deferred.state().heldRuns).toHaveLength(1);

    const trace = presence.trace();
    expect(trace.filter((event) => event.kind === "task_held")).toHaveLength(1);
    expect(
      trace.some(
        (event) =>
          event.kind === "semantic_attempt_ended" &&
          event.outcome === "superseded" &&
          event.reason === "semantic_revision_changed"
      )
    ).toBe(true);
  });

  it("does not disguise a resident settlement invariant exception as a transport failure", async () => {
    const { presence, deferred, matter } = createFixture();
    advanceFromSpeech(presence, matter.id, "Actually, bring me the blue mug.");

    const settle = vi.spyOn(deferred, "settle").mockImplementation(() => {
      throw new Error("synthetic resident settlement invariant");
    });
    const coordinator = new FirstPresenceSemanticTransportCoordinator(deferred, async () =>
      transportEnvelope("fetch Blue mug")
    );

    await expect(coordinator.reconsider(matter.id)).rejects.toThrow(
      "synthetic resident settlement invariant"
    );
    expect(settle).toHaveBeenCalledTimes(1);
    expect(deferred.state().pendingAttempts).toHaveLength(1);
  });
});
