import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import { CognitionGrounder } from "./cognition-grounder";
import type { CognitionBatch, Vec2, WorldOccurrence } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCognitionOwner } from "./resident-cognition-owner";
import { ResidentContinuityKernel, type ResidentMatter } from "./resident-continuity-kernel";
import {
  ResidentExecutionArbitrator,
  type ResidentExecutionArbitration,
  type ResidentExecutionArbitrationChoice,
} from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority, type ResidentExecutionFocusClaim } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const REQUEST_RADIUS = 420;
const MAX_BATCH_STEPS = 180;
const MAX_TRAVEL_STEPS = 2_000;

export interface MiraCausalCommitmentSpec {
  key: "hearth" | "workshop" | "fields";
  requestText: string;
  concernId: string;
  matterId: string;
  taskId: string;
  runId: string;
  targetRegionId: "hearth" | "workshop" | "fields";
  semanticCourse: string;
}

export const MIRA_CAUSAL_COMMITMENTS: readonly MiraCausalCommitmentSpec[] = [
  {
    key: "hearth",
    requestText: "Mira, sprawdzisz palenisko zanim pójdziesz dalej?",
    concernId: "concern.mira.request.hearth",
    matterId: "matter.mira.request.hearth",
    taskId: "task.mira.request.hearth.travel",
    runId: "run.mira.request.hearth.travel",
    targetRegionId: "hearth",
    semanticCourse: "honor the accepted request to check the familiar hearth",
  },
  {
    key: "workshop",
    requestText: "Mira, zajrzysz później do warsztatu?",
    concernId: "concern.mira.request.workshop",
    matterId: "matter.mira.request.workshop",
    taskId: "task.mira.request.workshop.travel",
    runId: "run.mira.request.workshop.travel",
    targetRegionId: "workshop",
    semanticCourse: "honor the accepted request to visit the familiar workshop",
  },
  {
    key: "fields",
    requestText: "Mira, sprawdzisz też później pola?",
    concernId: "concern.mira.request.fields",
    matterId: "matter.mira.request.fields",
    taskId: "task.mira.request.fields.travel",
    runId: "run.mira.request.fields.travel",
    targetRegionId: "fields",
    semanticCourse: "honor the accepted request to check the familiar fields",
  },
] as const;

interface GroundedCommitmentIntent {
  concernId: string;
  originPerceptId: string;
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
}

export interface AcceptedCausalCommitment {
  occurrence: WorldOccurrence;
  batch: CognitionBatch;
  originPerceptId: string;
  concernId: string;
  matter: ResidentMatter;
  runId: string;
  routeRegionIds: readonly string[];
  focusClaim: ResidentExecutionFocusClaim;
}

export interface CompletedCausalCommitment {
  matterId: string;
  runId: string;
  worldTick: number;
  arbitration: ResidentExecutionArbitration;
}

/**
 * Bounded research composition for the first non-fixture multi-matter origin pressure.
 *
 * The test driver may author only external addressed World speech and deterministic
 * cognition answers. It never calls continuity `openMatter()` directly. Each matter
 * is opened here only after one exact addressed percept survived private cognition
 * parsing, an evidence-backed open concern was admitted, and a known-region travel
 * intent was grounded from the same frozen resident context.
 *
 * This is deliberately NOT a general life runtime or arbitrary language-understanding
 * claim. The deterministic proposal supplies the interpretation so this specimen can
 * isolate causal matter acquisition and concurrency. It also intentionally keeps the
 * first commitment inside Hearth while the later Workshop/Fields runs are grounded,
 * avoiding a separate stale-route/re-grounding question that must be attacked next.
 */
export function createFiveResidentMiraCausalMultiMatterSlice() {
  const composition = createFiveResidentRegionComposition({ playerStart: { x: 700, y: 700 } });
  const { world } = composition;
  const mira = composition.runtimes[MIRA_ID];
  const navigation = createFiveResidentNavigationGraph();
  const cognitionOwner = new ResidentCognitionOwner(mira, new CognitionGrounder(navigation));
  const kernel = new ResidentContinuityKernel();
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

  // This specimen starts after authored-local activity. Recovered authority may own
  // Mira immediately because no authored walk is part of the variable under test.
  world.setResidentActivity(MIRA_ID, {
    id: "activity:mira:causal-multi-matter-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "causal multi-matter specimen idle",
  });
  world.step();

  const authority = new ResidentWorldExecutionAuthority(MIRA_ID, arbitrator, world);
  const executors = new Map<string, ResidentGroundedTravelExecutor>();
  const acceptedMatterIds = new Set<string>();

  function acceptPlayerRequest(spec: MiraCausalCommitmentSpec): AcceptedCausalCommitment {
    if (acceptedMatterIds.has(spec.matterId)) throw new Error(`commitment already accepted: ${spec.matterId}`);

    const occurrence = world.speak(PLAYER_ID, spec.requestText, REQUEST_RADIUS, [MIRA_ID]);
    world.step();
    const batch = waitForAddressedSpeechBatch(world, mira);
    const attempt = cognitionOwner.prepare(batch);
    if (!attempt) throw new Error("Mira cognition owner refused addressed commitment request");

    const originPercept = attempt.context.recentPercepts.find((percept) => percept.occurrenceId === occurrence.id);
    if (!originPercept || originPercept.phenomenon !== "speech" || !originPercept.addressed) {
      throw new Error("addressed commitment lost its exact private speech percept");
    }

    const settlement = cognitionOwner.settleIntent(
      attempt,
      commitmentProposal(spec, originPercept.id),
      world.tick,
      (proposal, context) => groundCommitment(proposal, context, spec, originPercept.id, navigation),
    );
    if (settlement.status !== "applied") {
      throw new Error(`commitment cognition did not apply: ${settlement.status}`);
    }

    const exactConcern = settlement.proposal.concerns.find((concern) => concern.id === settlement.intent.concernId);
    if (!exactConcern
      || exactConcern.status !== "open"
      || !exactConcern.evidenceIds.includes(settlement.intent.originPerceptId)) {
      throw new Error("applied commitment lost evidence-backed open concern semantics");
    }

    const origin = kernel.recordEvidence({
      id: `evidence:mira:accepted-request:${spec.key}:${originPercept.tick}`,
      tick: originPercept.tick,
      kind: "accepted_cognition_commitment",
      summary: `${exactConcern.summary}; origin occurrence ${originPercept.occurrenceId}`,
    });
    const matter = kernel.openMatter({
      id: spec.matterId,
      originEvidenceId: origin.id,
      semanticCourse: settlement.intent.semanticCourse,
    });
    kernel.bindRun({ matterId: spec.matterId, taskId: spec.taskId, runId: spec.runId });
    const focusClaim = arbitrator.request(spec.runId);
    if (focusClaim.status === "rejected") {
      throw new Error(`accepted commitment run was not authorized: ${focusClaim.reason}`);
    }

    executors.set(
      spec.runId,
      new ResidentGroundedTravelExecutor(spec.runId, settlement.intent.destination, authority, world),
    );
    acceptedMatterIds.add(spec.matterId);

    return {
      occurrence: structuredClone(occurrence),
      batch: structuredClone(batch),
      originPerceptId: originPercept.id,
      concernId: exactConcern.id,
      matter: structuredClone(matter),
      runId: spec.runId,
      routeRegionIds: [...settlement.intent.routeRegionIds],
      focusClaim: structuredClone(focusClaim),
    };
  }

  function completeFocusedMatter(matterId: string): CompletedCausalCommitment {
    const spec = MIRA_CAUSAL_COMMITMENTS.find((candidate) => candidate.matterId === matterId);
    if (!spec) throw new Error(`unknown causal commitment: ${matterId}`);
    if (focus.focusedRun() !== spec.runId) {
      throw new Error(`cannot complete unfocused commitment run: ${spec.runId}`);
    }
    const executor = executors.get(spec.runId);
    if (!executor) throw new Error(`missing executor for ${spec.runId}`);

    for (let step = 0; step < MAX_TRAVEL_STEPS; step += 1) {
      const local = executor.step();
      if (local.status === "running") {
        world.step();
        continue;
      }
      if (local.status !== "arrived") {
        throw new Error(`${spec.runId} did not reach its grounded destination: ${local.status}`);
      }
      const reconciled = kernel.reconcileRunOutcome({
        runId: spec.runId,
        tick: world.tick,
        status: "succeeded",
        summary: `${spec.runId} physically reached its cognition-grounded ${spec.targetRegionId} destination`,
      });
      if (reconciled.status !== "recorded") throw new Error(`failed to reconcile ${spec.runId}`);
      kernel.resolveMatter(spec.matterId);
      const arbitration = arbitrator.reconcile();
      authority.enforceMotionAuthority();
      return {
        matterId: spec.matterId,
        runId: spec.runId,
        worldTick: world.tick,
        arbitration: structuredClone(arbitration),
      };
    }
    throw new Error(`${spec.runId} exceeded bounded travel guard`);
  }

  return {
    world,
    mira,
    kernel,
    focus,
    arbitrator,
    authority,
    acceptPlayerRequest,
    completeFocusedMatter,
    choose(runId: string): ResidentExecutionArbitrationChoice {
      return arbitrator.choose(runId);
    },
    privateContext(): ResidentCognitionContext {
      return mira.cognitionContext({ residentId: MIRA_ID, requestedAtTick: world.tick, reasons: [] });
    },
  };
}

function waitForAddressedSpeechBatch(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  mira: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.mira"],
): CognitionBatch {
  for (let step = 0; step < MAX_BATCH_STEPS; step += 1) {
    const batch = mira.takeCognitionBatch(world.tick);
    if (batch) {
      if (!batch.reasons.some((reason) => reason.kind === "heard_speech")) {
        throw new Error("unexpected non-speech cognition batch contaminated commitment admission");
      }
      return batch;
    }
    world.step();
  }
  throw new Error("addressed commitment speech never produced a cognition batch");
}

function commitmentProposal(spec: MiraCausalCommitmentSpec, originPerceptId: string): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: `accept the addressed ${spec.key} request as a continuing commitment`,
      activity: {
        kind: "travel",
        goal: spec.semanticCourse,
        targetActorId: null,
        targetRegionId: spec.targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [{
      id: spec.concernId,
      summary: spec.semanticCourse,
      priority: 0.6,
      status: "open",
      evidenceIds: [originPerceptId],
    }],
    reviewAfterSeconds: 30,
  };
}

function groundCommitment(
  proposal: ResidentCognitionProposal,
  context: ResidentCognitionContext,
  spec: MiraCausalCommitmentSpec,
  originPerceptId: string,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
) {
  const directive = proposal.activityDirective;
  if (directive.kind !== "replace"
    || directive.activity.kind !== "travel"
    || directive.activity.targetRegionId !== spec.targetRegionId
    || !context.currentRegionId) {
    return { status: "rejected" as const, detail: "expected known-region travel commitment" };
  }

  const concern = proposal.concerns.find((candidate) => candidate.id === spec.concernId);
  if (!concern || concern.status !== "open" || !concern.evidenceIds.includes(originPerceptId)) {
    return { status: "rejected" as const, detail: "commitment requires exact evidence-backed open concern" };
  }
  if (!context.recentPercepts.some((percept) => percept.id === originPerceptId && percept.addressed)) {
    return { status: "rejected" as const, detail: "commitment origin is not an addressed private percept" };
  }

  const known = new Set(context.knownRegions.map((region) => region.id));
  known.add(context.currentRegionId);
  const route = navigation.route(context.currentRegionId, spec.targetRegionId, known);
  const destination = navigation.destinationPoint(spec.targetRegionId);
  if (!route || !destination) {
    return { status: "rejected" as const, detail: "commitment target lacks resident-known route/destination" };
  }

  return {
    status: "accepted" as const,
    intent: {
      concernId: spec.concernId,
      originPerceptId,
      destination,
      routeRegionIds: [...route.regionIds],
      semanticCourse: spec.semanticCourse,
    } satisfies GroundedCommitmentIntent,
  };
}
