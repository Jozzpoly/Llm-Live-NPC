import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import type { CognitionBatch, Vec2, WorldOccurrence } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentContinuityKernel, type ResidentMatter } from "./resident-continuity-kernel";
import {
  ResidentExecutionArbitrator,
  type ResidentExecutionArbitration,
  type ResidentExecutionArbitrationChoice,
} from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority, type ResidentExecutionFocusClaim } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import {
  ResidentLifeChoiceReviewBridge,
  type ResidentLifeChoiceReviewObservation,
} from "./resident-life-choice-review-bridge";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAttempt,
} from "./resident-life-intent-owner";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const REQUEST_RADIUS = 420;
const FIXED_DELTA_SECONDS = 1 / 60;
const MAX_BATCH_STEPS = 180;
const MAX_TRAVEL_STEPS = 2_000;

export interface MiraCausalCommitmentSpec {
  key: "hearth" | "workshop" | "fields";
  requestText: string;
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
    matterId: "matter.mira.request.hearth",
    taskId: "task.mira.request.hearth.travel",
    runId: "run.mira.request.hearth.travel",
    targetRegionId: "hearth",
    semanticCourse: "honor the accepted request to check the familiar hearth",
  },
  {
    key: "workshop",
    requestText: "Mira, zajrzysz później do warsztatu?",
    matterId: "matter.mira.request.workshop",
    taskId: "task.mira.request.workshop.travel",
    runId: "run.mira.request.workshop.travel",
    targetRegionId: "workshop",
    semanticCourse: "honor the accepted request to visit the familiar workshop",
  },
  {
    key: "fields",
    requestText: "Mira, sprawdzisz też później pola?",
    matterId: "matter.mira.request.fields",
    taskId: "task.mira.request.fields.travel",
    runId: "run.mira.request.fields.travel",
    targetRegionId: "fields",
    semanticCourse: "honor the accepted request to check the familiar fields",
  },
] as const;

interface GroundedCommitmentIntent {
  originPerceptId: string;
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
}

export interface PreparedCausalLifeIntent {
  batch: CognitionBatch;
  /** Exact authority handle. Do not clone before settlement. */
  attempt: ResidentLifeIntentAttempt;
}

export interface AcceptedCausalCommitment {
  occurrence: WorldOccurrence;
  batch: CognitionBatch;
  context: ResidentLifeCognitionContext;
  originPerceptId: string;
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
  choiceReview: ResidentLifeChoiceReviewObservation;
}

export type IncrementalCausalCommitmentStep =
  | { status: "running"; matterId: string; runId: string; worldTick: number }
  | { status: "completed"; completion: CompletedCausalCommitment };

/**
 * Bounded research composition for the first non-fixture multi-matter origin pressure.
 *
 * The test driver may author only external addressed World speech and deterministic
 * cognition answers. It never calls continuity `openMatter()` directly. Each matter
 * is opened here only after one exact addressed private percept and one admitted,
 * known-region-grounded cognition intent agree on a concrete resident commitment.
 *
 * Admission is life-aware even while another recovered matter owns the body. Provider-
 * facing cognition therefore sees legacy activity only as `localActivity` and receives
 * the authoritative recovered matter/run/body projection in `life`. Preparing an
 * attempt and settling it are separate boundaries so body execution may continue while
 * higher cognition is in flight. Neither boundary grants provider/network completion
 * direct matter/run/body/World authority.
 *
 * A `ResidentMind` concern is intentionally NOT created as a second copy of the same
 * commitment. Once admitted, continuity `matter` is the durable semantic authority;
 * concerns remain a separate private uncertainty/problem representation.
 *
 * This is deliberately NOT a general life runtime or arbitrary language-understanding
 * claim. Deterministic proposals supply interpretation so the specimen can isolate
 * causal matter acquisition, concurrency and delayed cognition admission.
 */
export function createFiveResidentMiraCausalMultiMatterSlice() {
  const composition = createFiveResidentRegionComposition({ playerStart: { x: 700, y: 700 } });
  const { world } = composition;
  const mira = composition.runtimes[MIRA_ID];
  const navigation = createFiveResidentNavigationGraph();
  const lifeIntentOwner = new ResidentLifeIntentOwner(mira);
  const kernel = new ResidentContinuityKernel();
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  const choiceReviewBridge = new ResidentLifeChoiceReviewBridge(mira);

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

  function currentLife() {
    return captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: [...acceptedMatterIds].sort((a, b) => a.localeCompare(b)),
    });
  }

  function takeReadyLifeIntentAttempt(): PreparedCausalLifeIntent | null {
    // Do not consume another scheduler batch while an exact cognition attempt owns
    // the current admission authority. The existing batch must settle or abandon first.
    if (lifeIntentOwner.state().activeAttemptId !== null) return null;
    const batch = mira.takeCognitionBatch(world.tick);
    if (!batch) return null;
    const attempt = lifeIntentOwner.prepare(batch, currentLife());
    if (!attempt) {
      mira.requeueCognitionBatch(batch);
      throw new Error("Mira life intent owner refused a ready cognition batch");
    }
    return {
      batch: structuredClone(batch),
      attempt,
    };
  }

  function settlePreparedPlayerRequest(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    spec: MiraCausalCommitmentSpec,
    rawProposal: unknown,
  ): AcceptedCausalCommitment {
    if (acceptedMatterIds.has(spec.matterId)) throw new Error(`commitment already accepted: ${spec.matterId}`);

    const originPercept = prepared.attempt.context.recentPercepts.find(
      (percept) => percept.occurrenceId === occurrence.id,
    );
    if (!originPercept
      || originPercept.phenomenon !== "speech"
      || !originPercept.addressed
      || originPercept.text !== occurrence.text) {
      throw new Error("prepared commitment lost its exact addressed private speech percept");
    }

    const settlement = lifeIntentOwner.settleIntent(
      prepared.attempt,
      rawProposal,
      currentLife(),
      world.tick,
      (proposal, context) => groundCommitment(proposal, context, spec, originPercept.id, navigation),
    );
    if (settlement.status !== "applied") {
      throw new Error(`commitment cognition did not apply: ${settlement.status}`);
    }
    mira.scheduleAdaptiveReview(world.tick, settlement.proposal.reviewAfterSeconds, FIXED_DELTA_SECONDS);

    const origin = kernel.recordEvidence({
      id: `evidence:mira:accepted-request:${spec.key}:${originPercept.tick}`,
      tick: originPercept.tick,
      kind: "accepted_cognition_commitment",
      summary: `${settlement.intent.semanticCourse}; origin occurrence ${originPercept.occurrenceId}`,
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
      batch: structuredClone(prepared.batch),
      context: structuredClone(prepared.attempt.context),
      originPerceptId: originPercept.id,
      matter: structuredClone(matter),
      runId: spec.runId,
      routeRegionIds: [...settlement.intent.routeRegionIds],
      focusClaim: structuredClone(focusClaim),
    };
  }

  function waitForPreparedAddressedSpeech(): PreparedCausalLifeIntent {
    for (let step = 0; step < MAX_BATCH_STEPS; step += 1) {
      const prepared = takeReadyLifeIntentAttempt();
      if (prepared) {
        if (!prepared.batch.reasons.some((reason) => reason.kind === "heard_speech")) {
          lifeIntentOwner.abandon(prepared.attempt);
          throw new Error("unexpected non-speech cognition batch contaminated commitment admission");
        }
        return prepared;
      }
      world.step();
    }
    throw new Error("addressed commitment speech never produced a cognition attempt");
  }

  function acceptPlayerRequest(spec: MiraCausalCommitmentSpec): AcceptedCausalCommitment {
    if (acceptedMatterIds.has(spec.matterId)) throw new Error(`commitment already accepted: ${spec.matterId}`);
    const occurrence = world.speak(PLAYER_ID, spec.requestText, REQUEST_RADIUS, [MIRA_ID]);
    world.step();
    const prepared = waitForPreparedAddressedSpeech();
    return settlePreparedPlayerRequest(prepared, occurrence, spec, commitmentProposal(spec));
  }

  function finishArrivedMatter(spec: MiraCausalCommitmentSpec): CompletedCausalCommitment {
    const reconciled = kernel.reconcileRunOutcome({
      runId: spec.runId,
      tick: world.tick,
      status: "succeeded",
      summary: `${spec.runId} physically reached its cognition-grounded ${spec.targetRegionId} destination`,
    });
    if (reconciled.status !== "recorded") throw new Error(`failed to reconcile ${spec.runId}`);
    kernel.resolveMatter(spec.matterId);
    const arbitration = arbitrator.reconcile();
    const choiceReview = choiceReviewBridge.observe(arbitration, world.tick);
    authority.enforceMotionAuthority();
    return {
      matterId: spec.matterId,
      runId: spec.runId,
      worldTick: world.tick,
      arbitration: structuredClone(arbitration),
      choiceReview: structuredClone(choiceReview),
    };
  }

  function advanceFocusedMatterOneWorldTick(): IncrementalCausalCommitmentStep {
    const runId = focus.focusedRun();
    if (!runId) throw new Error("cannot advance causal execution without a focused run");
    const spec = MIRA_CAUSAL_COMMITMENTS.find((candidate) => candidate.runId === runId);
    if (!spec) throw new Error(`focused run is not a causal commitment: ${runId}`);
    const executor = executors.get(runId);
    if (!executor) throw new Error(`missing executor for ${runId}`);

    const local = executor.step();
    if (local.status === "running") {
      world.step();
      return {
        status: "running",
        matterId: spec.matterId,
        runId,
        worldTick: world.tick,
      };
    }
    if (local.status !== "arrived") {
      throw new Error(`${runId} did not reach its grounded destination: ${local.status}`);
    }
    return { status: "completed", completion: finishArrivedMatter(spec) };
  }

  function completeFocusedMatter(matterId: string): CompletedCausalCommitment {
    const spec = MIRA_CAUSAL_COMMITMENTS.find((candidate) => candidate.matterId === matterId);
    if (!spec) throw new Error(`unknown causal commitment: ${matterId}`);
    if (focus.focusedRun() !== spec.runId) {
      throw new Error(`cannot complete unfocused commitment run: ${spec.runId}`);
    }

    for (let step = 0; step < MAX_TRAVEL_STEPS; step += 1) {
      const advanced = advanceFocusedMatterOneWorldTick();
      if (advanced.status === "running") continue;
      if (advanced.completion.matterId !== matterId) {
        throw new Error(`unexpected causal commitment completed: ${advanced.completion.matterId}`);
      }
      return advanced.completion;
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
    choiceReviewBridge,
    lifeIntentOwner,
    takeReadyLifeIntentAttempt,
    settlePreparedPlayerRequest,
    acceptPlayerRequest,
    advanceFocusedMatterOneWorldTick,
    completeFocusedMatter,
    choose(runId: string): ResidentExecutionArbitrationChoice {
      const choice = arbitrator.choose(runId);
      if (choice.status === "acquired" || choice.status === "already_focused") {
        choiceReviewBridge.observe({
          status: "focused",
          runId,
          deferredRunIds: arbitrator.deferredRunIds(),
        }, world.tick);
      }
      return choice;
    },
    privateContext(): ResidentCognitionContext {
      return mira.cognitionContext({ residentId: MIRA_ID, requestedAtTick: world.tick, reasons: [] });
    },
  };
}

function commitmentProposal(spec: MiraCausalCommitmentSpec): ResidentCognitionProposal {
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
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function groundCommitment(
  proposal: ResidentCognitionProposal,
  context: ResidentLifeCognitionContext,
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
  if (!context.recentPercepts.some((percept) => (
    percept.id === originPerceptId
    && percept.phenomenon === "speech"
    && percept.addressed
  ))) {
    return { status: "rejected" as const, detail: "commitment origin is not the exact addressed private speech percept" };
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
      originPerceptId,
      destination,
      routeRegionIds: [...route.regionIds],
      semanticCourse: spec.semanticCourse,
    } satisfies GroundedCommitmentIntent,
  };
}
