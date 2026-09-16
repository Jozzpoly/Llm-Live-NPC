import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateRecoverySlice } from "./five-resident-missing-crate-recovery-slice";
import { ResidentMaterialPickupCapability } from "./resident-material-pickup-capability";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const CAPABILITY_ID = "local.material.pickup.visible-familiar-crate";
const RUN_ID = "run.janek.pickup-reacquired-crate.live-provider";

function reacquiredFixture() {
  const slice = createFiveResidentJanekMissingCrateRecoverySlice();
  let guard = 0;
  while (slice.phase() !== "awaiting_pickup_semantics" && guard < 1_500) {
    slice.advanceOneWorldTick();
    guard += 1;
  }
  expect(guard).toBeLessThan(1_500);
  expect(slice.phase()).toBe("awaiting_pickup_semantics");
  expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
    status: "active",
    semanticRevision: 4,
    activeRunId: null,
  });
  expect(slice.kernel.semanticEvidence(MATTER_ID)).toMatchObject({ kind: "material_reacquired" });
  expect(slice.materialKnowledge.observation(CRATE_ID)?.currentlyVisible).toBe(true);
  return slice;
}

function offer(slice: ReturnType<typeof reacquiredFixture>) {
  const offered = ResidentMaterialPickupCapability.offer({
    capabilityId: CAPABILITY_ID,
    summary: "Approach and pick up the familiar crate that is currently visible, using local embodied movement and World material authority.",
    matterId: MATTER_ID,
    taskId: "task.janek.pickup-reacquired-crate",
    runId: RUN_ID,
    objectId: CRATE_ID,
    kernel: slice.kernel,
    knowledge: slice.materialKnowledge,
    authority: slice.authority,
    world: slice.world,
  });
  expect(offered.status).toBe("offered");
  if (offered.status !== "offered") throw new Error(`pickup capability unavailable: ${offered.reason}`);
  return offered.capability;
}

describe("resident visible material pickup capability", () => {
  it("turns an admitted provider selection into an exact pickup run only after current legal visibility is re-grounded", () => {
    const slice = reacquiredFixture();
    const capability = offer(slice);
    const membrane = new ResidentSemanticProviderMembrane();
    const providerRun = membrane.prepare(slice.kernel, MATTER_ID, [capability.offer()]);

    expect(providerRun).toMatchObject({
      version: 3,
      originEvidence: { id: "evidence:janek:missing-crate:origin", kind: "life_context" },
      semanticEvidence: { kind: "material_reacquired" },
      localCapabilities: [{ id: CAPABILITY_ID }],
    });
    const settled = membrane.settle(slice.kernel, providerRun.providerRunId, {
      semanticCourse: "pick up the familiar workshop crate now that it is visible again",
      localCapabilityId: CAPABILITY_ID,
    });
    expect(settled).toMatchObject({
      status: "applied",
      localCapabilityId: CAPABILITY_ID,
      matter: { semanticRevision: 5, activeRunId: null },
    });
    if (settled.status !== "applied") throw new Error(`semantic settlement failed: ${settled.status}`);

    const grounded = capability.ground(CAPABILITY_ID, settled.matter.semanticRevision);
    expect(grounded.status).toBe("grounded");
    if (grounded.status !== "grounded") throw new Error(`pickup grounding failed: ${grounded.reason}`);
    expect(grounded.record).toMatchObject({
      offeredSemanticRevision: 4,
      admittedSemanticRevision: 5,
      semanticEvidenceId: slice.kernel.semanticEvidence(MATTER_ID)?.id,
      binding: { matterId: MATTER_ID, runId: RUN_ID, semanticRevision: 5 },
    });
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(true);

    let local = grounded.executor.step();
    let guard = 0;
    while (local.status === "running" && guard < 500) {
      slice.world.step();
      slice.materialKnowledge.sample();
      local = grounded.executor.step();
      guard += 1;
    }
    expect(guard).toBeLessThan(500);
    expect(local.status).toBe("succeeded");
    expect(slice.world.materialObject(CRATE_ID)?.location).toEqual({ kind: "held", actorId: "resident.janek" });
    expect(slice.authority.recentActionFacts()).toContainEqual(expect.objectContaining({
      runId: RUN_ID,
      action: { kind: "material_pickup", objectId: CRATE_ID },
      resolution: { status: "resolved", outcomeStatus: "succeeded", code: "picked_up" },
    }));
  });

  it("rejects grounding without a run if the visible object is moved away during provider latency", () => {
    const slice = reacquiredFixture();
    const capability = offer(slice);
    const membrane = new ResidentSemanticProviderMembrane();
    const providerRun = membrane.prepare(slice.kernel, MATTER_ID, [capability.offer()]);

    const crate = slice.world.materialObject(CRATE_ID);
    expect(crate?.location.kind).toBe("free");
    if (!crate || crate.location.kind !== "free") throw new Error("reacquired crate is not free");
    slice.world.addPlayer("player.racer", crate.location.position, { maxSpeed: 48_000 });
    expect(slice.world.attemptMaterialAction("player.racer", { kind: "pickup", objectId: CRATE_ID }).status).toBe("succeeded");
    slice.world.setActorMotionIntent("player.racer", { x: 48_000, y: 0 });
    slice.world.step();
    slice.world.setActorMotionIntent("player.racer", { x: 0, y: 0 });
    const racer = slice.world.publicSnapshot().actors.find((actor) => actor.id === "player.racer");
    if (!racer) throw new Error("race actor missing");
    expect(slice.world.attemptMaterialAction("player.racer", {
      kind: "place",
      objectId: CRATE_ID,
      position: racer.position,
    }).status).toBe("succeeded");

    const settled = membrane.settle(slice.kernel, providerRun.providerRunId, {
      semanticCourse: "pick up the familiar workshop crate now that it is visible again",
      localCapabilityId: CAPABILITY_ID,
    });
    expect(settled.status).toBe("applied");
    if (settled.status !== "applied") throw new Error(`semantic settlement failed: ${settled.status}`);

    const grounded = capability.ground(CAPABILITY_ID, settled.matter.semanticRevision);
    expect(grounded).toEqual({ status: "rejected", reason: "object_not_currently_visible" });
    expect(slice.kernel.matter(MATTER_ID)?.activeRunId).toBeNull();
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(false);
    expect(slice.authority.recentActionFacts()).toHaveLength(0);
    expect(slice.materialKnowledge.observation(CRATE_ID)?.currentlyVisible).toBe(false);
  });
});
