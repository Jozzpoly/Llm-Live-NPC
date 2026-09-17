import { describe, expect, it } from "vitest";
import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import type { CognitionBatch, Vec2 } from "./contracts";
import { CognitionGrounder } from "./cognition-grounder";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCognitionOwner } from "./resident-cognition-owner";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const FIXED_DELTA_SECONDS = 1 / 60;
const MAX_AUTHORED_STEPS = 1_200;
const MAX_TRAVEL_STEPS = 2_000;
const MAX_REVIEW_STEPS = 180;

const A = matterSpec("a.workshop", "workshop", "go to the familiar workshop after the authored settlement walk");
const B = matterSpec("b.hearth", "hearth", "return to the familiar hearth when body time becomes available");
const C = matterSpec("c.fields", "fields", "check the familiar fields when body time becomes available");
type MatterSpec = typeof A;

describe("five-resident Mira multi-matter life composition", () => {
  it("uses higher cognition only for genuine B/C ambiguity, then returns the remaining single matter to local auto-handoff", () => {
    const composition = createFiveResidentRegionComposition({ playerStart: { x: 700, y: 700 } });
    const { world } = composition;
    const mira = composition.runtimes[MIRA_ID];
    const navigation = createFiveResidentNavigationGraph();
    const cognitionOwner = new ResidentCognitionOwner(mira, new CognitionGrounder(navigation));
    const kernel = new ResidentContinuityKernel();
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const authority = new ResidentWorldExecutionAuthority(MIRA_ID, arbitrator, world);
    const choiceOwner = new ResidentLifeChoiceOwner(mira);

    // Do not poll cognition while the authored walk is still running. Doing so would
    // itself mutate scheduler cadence and contaminate the experiment.
    const firstBatch = waitForAuthoredCompletionThenBatch(world, mira);
    expect(firstBatch.reasons.some((reason) => reason.kind === "activity_completed")).toBe(true);

    const firstAttempt = cognitionOwner.prepare(firstBatch)!;
    const firstSettlement = cognitionOwner.settleIntent(
      firstAttempt,
      travelProposal(A.targetRegionId, "continue settlement life at the workshop"),
      world.tick,
      (proposal, context) => groundTravelIntent(proposal, context, A, navigation),
    );
    expect(firstSettlement.status).toBe("applied");
    if (firstSettlement.status !== "applied") return;
    mira.scheduleAdaptiveReview(world.tick, firstSettlement.intent.reviewAfterSeconds, FIXED_DELTA_SECONDS);

    openMatterAndRun(kernel, A, world.tick, "first post-authored resident matter");
    expect(arbitrator.request(A.runId)).toEqual({ status: "acquired", runId: A.runId });

    // B/C are fixture-authored only as concurrent continuing matters. This test does
    // not promote their origin as autonomous cognition; it qualifies coexistence,
    // genuine ambiguity, semantic selection and factual body handoff.
    openMatterAndRun(kernel, B, world.tick, "second legitimate resident matter");
    openMatterAndRun(kernel, C, world.tick, "third legitimate resident matter");
    expect(arbitrator.request(B.runId)).toEqual({ status: "busy", runId: B.runId, focusedRunId: A.runId });
    expect(arbitrator.request(C.runId)).toEqual({ status: "busy", runId: C.runId, focusedRunId: A.runId });
    expect(arbitrator.deferredRunIds()).toEqual([B.runId, C.runId]);

    driveRun(world, kernel, authority, A, destination(navigation, A.targetRegionId));
    kernel.resolveMatter(A.matterId);
    expect(arbitrator.reconcile()).toEqual({ status: "choice_required", candidateRunIds: [B.runId, C.runId] });
    expect(focus.focusedRun()).toBeNull();
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: A.runId });

    const lifeAtChoice = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: [A.matterId, B.matterId, C.matterId],
    });
    expect(lifeAtChoice.body).toEqual({ focusedRunId: null, deferredRunIds: [B.runId, C.runId] });

    // Reuse the resident's scheduler instead of inventing a parallel priority loop.
    mira.scheduleAdaptiveReview(world.tick, 0.25, FIXED_DELTA_SECONDS);
    const choiceBatch = waitForReviewBatch(world, mira);
    const choiceAttempt = choiceOwner.prepare(choiceBatch, lifeAtChoice)!;
    expect(choiceAttempt.context.localActivity.kind).toBe("idle");
    expect(choiceAttempt.context.life.body.focusedRunId).toBeNull();
    expect(choiceAttempt.candidateMatterIds).toEqual([B.matterId, C.matterId]);

    const currentLife = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: [A.matterId, B.matterId, C.matterId],
    });
    const choice = choiceOwner.settle(choiceAttempt, {
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: B.matterId,
        reason: "return to the hearth before checking the fields",
        reviewAfterSeconds: 8,
      },
    }, currentLife);
    expect(choice).toMatchObject({ status: "applied", decision: { kind: "focus_matter", matterId: B.matterId } });
    if (choice.status !== "applied" || choice.decision.kind !== "focus_matter") return;

    expect(kernel.matter(choice.decision.matterId)?.activeRunId).toBe(B.runId);
    expect(arbitrator.choose(B.runId)).toEqual({ status: "acquired", runId: B.runId });
    expect(arbitrator.deferredRunIds()).toEqual([C.runId]);

    const beforeB = miraPosition(world);
    driveRun(world, kernel, authority, B, destination(navigation, B.targetRegionId));
    kernel.resolveMatter(B.matterId);
    expect(miraPosition(world)).not.toEqual(beforeB);

    // Once B finishes, one legal demand remains. No second semantic ranking is needed.
    expect(arbitrator.reconcile()).toEqual({ status: "acquired_deferred", runId: C.runId });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: B.runId });
    expect(focus.focusedRun()).toBe(C.runId);
    expect(arbitrator.deferredRunIds()).toEqual([]);

    const beforeC = miraPosition(world);
    driveRun(world, kernel, authority, C, destination(navigation, C.targetRegionId));
    kernel.resolveMatter(C.matterId);
    expect(arbitrator.reconcile()).toEqual({ status: "idle" });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: C.runId });
    expect(miraPosition(world)).not.toEqual(beforeC);

    for (const spec of [A, B, C]) {
      expect(kernel.matter(spec.matterId)?.status).toBe("resolved");
      expect(kernel.runBinding(spec.runId)).toBeNull();
    }
    expect(focus.focusedRun()).toBeNull();
    expect(authority.motionOwner()).toBeNull();
  });
});

function matterSpec(suffix: string, targetRegionId: string, course: string) {
  return {
    matterId: `matter.mira.multi.${suffix}`,
    taskId: `task.mira.multi.${suffix}`,
    runId: `run.mira.multi.${suffix}`,
    targetRegionId,
    course,
  } as const;
}

function waitForAuthoredCompletionThenBatch(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  mira: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.mira"],
): CognitionBatch {
  let authoredComplete = false;
  for (let step = 0; step < MAX_AUTHORED_STEPS; step += 1) {
    world.step();
    const activity = mira.publicState().activity;
    authoredComplete ||= activity.kind === "idle" && activity.reason.includes("completed activity:mira:initial");
    if (!authoredComplete) continue;

    const batch = mira.takeCognitionBatch(world.tick);
    if (batch?.reasons.some((reason) => reason.kind === "activity_completed")) return batch;
  }
  throw new Error("Mira never produced post-authored activity-completed cognition pressure");
}

function waitForReviewBatch(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  mira: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.mira"],
): CognitionBatch {
  for (let step = 0; step < MAX_REVIEW_STEPS; step += 1) {
    const batch = mira.takeCognitionBatch(world.tick);
    if (batch) return batch;
    world.step();
  }
  throw new Error("Mira never produced a scheduler-owned review batch at the multi-matter choice boundary");
}

function openMatterAndRun(kernel: ResidentContinuityKernel, spec: MatterSpec, tick: number, summary: string) {
  const evidence = kernel.recordEvidence({
    id: `evidence:${spec.matterId}:${tick}`,
    tick,
    kind: "life_context",
    summary,
  });
  kernel.openMatter({ id: spec.matterId, originEvidenceId: evidence.id, semanticCourse: spec.course });
  kernel.bindRun({ matterId: spec.matterId, taskId: spec.taskId, runId: spec.runId });
}

function driveRun(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  kernel: ResidentContinuityKernel,
  authority: ResidentWorldExecutionAuthority,
  spec: MatterSpec,
  target: Vec2,
) {
  const executor = new ResidentGroundedTravelExecutor(spec.runId, target, authority, world);
  for (let step = 0; step < MAX_TRAVEL_STEPS; step += 1) {
    const local = executor.step();
    if (local.status === "running") {
      world.step();
      continue;
    }
    if (local.status !== "arrived") throw new Error(`${spec.runId} failed to arrive: ${local.status}`);
    expect(kernel.reconcileRunOutcome({
      runId: spec.runId,
      tick: world.tick,
      status: "succeeded",
      summary: `${spec.runId} physically arrived at ${spec.targetRegionId}`,
    }).status).toBe("recorded");
    return;
  }
  throw new Error(`${spec.runId} did not reach ${spec.targetRegionId}`);
}

function groundTravelIntent(
  proposal: ResidentCognitionProposal,
  context: ResidentCognitionContext,
  spec: MatterSpec,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
) {
  const directive = proposal.activityDirective;
  if (directive.kind !== "replace" || directive.activity.kind !== "travel") {
    return { status: "rejected" as const, detail: "travel replacement required" };
  }
  if (directive.activity.targetRegionId !== spec.targetRegionId || !context.currentRegionId) {
    return { status: "rejected" as const, detail: "unexpected or ungrounded target region" };
  }
  const known = new Set(context.knownRegions.map((region) => region.id));
  known.add(context.currentRegionId);
  const route = navigation.route(context.currentRegionId, spec.targetRegionId, known);
  const target = navigation.destinationPoint(spec.targetRegionId);
  if (!route || !target) return { status: "rejected" as const, detail: "private known-region route unavailable" };
  return {
    status: "accepted" as const,
    intent: {
      destination: target,
      routeRegionIds: [...route.regionIds],
      semanticCourse: `${directive.reason} · ${directive.activity.goal}`,
      reviewAfterSeconds: proposal.reviewAfterSeconds,
    },
  };
}

function travelProposal(targetRegionId: string, reason: string) {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason,
      activity: {
        kind: "travel",
        goal: `go to ${targetRegionId}`,
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 20,
  };
}

function destination(navigation: ReturnType<typeof createFiveResidentNavigationGraph>, regionId: string): Vec2 {
  const value = navigation.destinationPoint(regionId);
  if (!value) throw new Error(`missing destination point for ${regionId}`);
  return value;
}

function miraPosition(world: ReturnType<typeof createFiveResidentRegionComposition>["world"]) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}
