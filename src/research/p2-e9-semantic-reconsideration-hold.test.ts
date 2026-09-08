import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";

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
    task: { kind: "approach-and-interact", actorId, targetId: matches[0].id }
  };
};

describe("P2-E9 semantic reconsideration hold causality", () => {
  it("prevents the semantically superseded exact run from completing while reconsideration is unresolved without freezing the World", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    const player = specimen.entities.find((entity) => entity.kind === "player");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item" || !player) {
      throw new Error("P2-E9 fixture requires canonical NPC, mug and player.");
    }

    // One ordinary executor frame would immediately interact with the mug.
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const startBoundary = new P2E6GroundedTaskStartBoundary();
    const holdBoundary = new P2E9SemanticReconsiderationHoldBoundary();
    const holdAwareExecutor = new P2E9HoldAwareExecutor(executor, holdBoundary);
    const driver = new ExecutionDriver(world, holdAwareExecutor);
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([[npc.id, resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === npc.id;

    const origin = communication.speak(
      { speakerId: player.id, text: "Bring me the Red mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E9 fixture requires grounded origin speech.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });
    const prepared = startBoundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      npc.id,
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const started = startBoundary.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate,
      { kind: "cognition" }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    const revision = communication.speak(
      { speakerId: player.id, text: "Actually, leave the Red mug alone." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!revision) throw new Error("P2-E9 fixture requires grounded revision speech.");
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);

    const armed = holdBoundary.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;
    expect(armed.hold).toMatchObject({
      matterId: matter.id,
      runId: started.executorRun.runId,
      taskSemanticRevision: started.binding.semanticRevision,
      reconsiderationSemanticRevision: ticket.semanticRevision,
      semanticEvidenceId: revision.id,
      proposalId: ticket.proposalId
    });

    const before = world.snapshot();
    const frame = driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    const after = world.snapshot();

    // The shared present continues; only the causally affected executor run is held.
    expect(after.tick).toBe(before.tick + 1);
    expect(after.entities.find((entity) => entity.id === player.id)?.position.x).toBeGreaterThan(
      before.entities.find((entity) => entity.id === player.id)?.position.x ?? -Infinity
    );

    // The superseded task must not cross its mechanical outcome boundary yet.
    expect(after.entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect(frame.executorActionResult).toBeNull();
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.executorRun.runId },
      task: { targetId: mug.id }
    });
    expect(resident.taskBinding(started.executorRun.runId)).toMatchObject({
      matterId: matter.id,
      semanticRevision: started.binding.semanticRevision
    });
    expect(
      resident.recentEvidence().filter((evidence) => evidence.kind === "task_outcome")
    ).toHaveLength(0);
  });
});
