import { describe, expect, it } from "vitest";
import type { P2E6LocalTaskGrounder } from "../research/p2-e6-grounded-task-start-causality";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { FirstPresenceComposition } from "./first-presence-composition";
import {
  FirstPresenceDeferredSemanticOwner,
  createFirstPresenceDeferredExecution
} from "./first-presence-deferred-semantics";

const fetchGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requested = match[1].trim().toLocaleLowerCase();
  const targets = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requested
  );
  if (targets.length !== 1) return null;
  return {
    taskId: `fetch:${targets[0].id}`,
    task: { kind: "approach-and-interact", actorId, targetId: targets[0].id }
  };
};

describe("First Presence deferred diagnostic observability", () => {
  it("reading state does not consume a resident-revoked local provider attempt or erase its causal stale result", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const red = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !red || red.kind !== "item") {
      throw new Error("Deferred observability fixture requires npc.001 and item.mug.");
    }
    red.position = { x: npc.position.x + 180, y: npc.position.y };

    const world = new World(specimen);
    const execution = createFirstPresenceDeferredExecution();
    const presence = new FirstPresenceComposition(
      world,
      execution.executor,
      () => ({ semanticCourse: "fetch Red mug" }),
      fetchGrounder
    );
    const deferred = new FirstPresenceDeferredSemanticOwner(presence.resident, execution);

    const initial = presence.receiveDirectPlayerSpeech("Bring me the red mug.");
    const matter = presence.openMatterFromEvidence(initial.id);
    expect(presence.reconsiderMatter(matter.id)).toMatchObject({
      status: "applied",
      matter: { semanticCourse: "fetch Red mug", semanticRevision: 2 }
    });
    const started = presence.startMatterTask(matter.id);
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    const firstCorrection = presence.receiveDirectPlayerSpeech("Actually, reconsider that red mug.");
    presence.advanceMatterFromEvidence(matter.id, firstCorrection.id);
    const first = deferred.beginReconsideration(matter.id);
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;

    const newerCorrection = presence.receiveDirectPlayerSpeech("Newer correction: reconsider again.");
    presence.advanceMatterFromEvidence(matter.id, newerCorrection.id);
    expect(presence.resident.pendingSemanticProposals()).toEqual([]);

    // Diagnostic reads must be observational. The old attempt is no longer a
    // pending resident authority, but merely inspecting state must not consume
    // its still-local provider handle or change how a late response is classified.
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    expect(deferred.settle(first.attempt, { semanticCourse: "fetch Red mug" })).toEqual({
      status: "stale",
      reason: "semantic_revision_changed"
    });
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.binding.runId }
    });
  });
});
