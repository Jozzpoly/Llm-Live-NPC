import type {
  ProposedActivity,
  ResidentCognitionContext,
  ResidentCognitionProposal,
} from "./cognition-contract";
import type { CognitionBatch, ResidentPercept, Vec2, WorldOccurrence } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import {
  ResidentContinuityKernel,
  type ResidentKernelEvidence,
  type ResidentMatter,
  type ResidentMatterIntent,
} from "./resident-continuity-kernel";
import {
  ResidentExecutionArbitrator,
  type ResidentExecutionArbitration,
  type ResidentExecutionArbitrationChoice,
  type ResidentExecutionArbitrationRequest,
} from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority, type ResidentExecutionFocusClaim } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import {
  ResidentLifeChoiceReviewBridge,
  type ResidentLifeChoiceReviewObservation,
} from "./resident-life-choice-review-bridge";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import {
  captureResidentLifeCognitionView,
  type ResidentLifeCognitionView,
} from "./resident-life-cognition-view";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAdmission,
  type ResidentLifeIntentAttempt,
} from "./resident-life-intent-owner";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const REQUEST_RADIUS = 420;
const FIXED_DELTA_SECONDS = 1 / 60;
const MAX_BATCH_STEPS = 180;
const MAX_TRAVEL_STEPS = 2_000;
const INTERRUPTION_HOLD_TICKS = 12;
const INTERRUPTION_RESPONSE = "Tak?";

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

export interface GroundedCausalCommitmentIntent {
  originPerceptId: string;
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
  semanticIntent: ResidentMatterIntent;
}

type CausalCommitmentProposal = ResidentCognitionProposal | ResidentLifeIntentProposal;

interface CausalCommitmentIdentity {
  matterId: string;
  taskId: string;
  runId: string;
  evidenceKey: string;
}

interface GroundedCommitmentAuthority {
  attempt: ResidentLifeIntentAttempt;
  occurrenceId: string;
  identity: CausalCommitmentIdentity;
  proposal: CausalCommitmentProposal;
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
  focusClaim: ResidentExecutionArbitrationRequest;
}

export interface CompletedCausalCommitment {
  matterId: string;
  runId: string;
  worldTick: number;
  outcomeEvidence: ResidentKernelEvidence;
  arbitration: ResidentExecutionArbitration;
  choiceReview: ResidentLifeChoiceReviewObservation;
}

export type IncrementalCausalCommitmentStep =
  | { status: "running"; matterId: string; runId: string; worldTick: number }
  | { status: "completed"; completion: CompletedCausalCommitment };

export interface MiraCausalInterruptionSnapshot {
  status: "active" | "completed";
  originPerceptId: string;
  interruptMatterId: string;
  interruptRunId: string;
  mainMatterId: string;
  mainRunId: string;
  responseOccurrenceId: string | null;
  remainingHoldTicks: number;
}

export type MiraCausalInterruptionStep =
  | { status: "responded"; interruption: MiraCausalInterruptionSnapshot }
  | { status: "holding"; interruption: MiraCausalInterruptionSnapshot }
  | { status: "resumed"; interruption: MiraCausalInterruptionSnapshot };

interface ActiveMiraCausalInterruption {
  originPerceptId: string;
  addressedDirection: Vec2 | null;
  interruptMatterId: string;
  interruptRunId: string;
  mainMatterId: string;
  mainRunId: string;
  mainRunBinding: NonNullable<ReturnType<ResidentContinuityKernel["runBinding"]>>;
  responseOccurrenceId: string | null;
  remainingHoldTicks: number;
  responded: boolean;
}

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
 * Resident-life-native commitment proposals are interpreted independently from body
 * activity directives: `accept` selects only a bounded semantic intent. The older
 * activityDirective path remains solely as compatibility for deterministic fixtures.
 * Both paths converge only after extracting semantic travel meaning, before one shared
 * current-region/known-route grounding boundary and one exact capability materializer.
 *
 * Provider meaning and local execution grounding deliberately have different lifetimes:
 * a semantic target may remain valid across model latency while body/region state moves.
 * Immediately before a run is admitted, the selected target is therefore re-grounded
 * against current resident-local region knowledge rather than reusing an old route from
 * the provider frame.
 *
 * Grounding and continuity materialization are separate authority steps. A successfully
 * grounded intent is an exact one-shot capability: cloning the object cannot open a
 * matter or bind a run. This lets async provider admission remain semantic while the
 * local composition alone owns the later transition into durable resident life.
 *
 * Durable resident meaning is copied from the admitted semantic proposal, while route
 * and destination remain local execution-method details. A later review can therefore
 * recover what the resident committed to without preserving one stale route.
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
  const groundedTargetRegionIds = new Map<string, string>();
  const runMatterIds = new Map<string, string>();
  const acceptedMatterIds = new Set<string>();
  const groundedCommitmentAuthority = new WeakMap<GroundedCausalCommitmentIntent, GroundedCommitmentAuthority>();
  let activeInterruption: ActiveMiraCausalInterruption | null = null;

  function currentLife() {
    return captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: [...acceptedMatterIds].sort((a, b) => a.localeCompare(b)),
    });
  }

  function currentLifeView(): ResidentLifeCognitionView {
    return structuredClone(currentLife());
  }

  function currentGroundingContext(batch: CognitionBatch): ResidentCognitionContext {
    return mira.cognitionContext({
      residentId: MIRA_ID,
      requestedAtTick: world.tick,
      reasons: structuredClone(batch.reasons),
    });
  }

  function exactPrivateSpeechPercept(prepared: PreparedCausalLifeIntent, occurrence: WorldOccurrence) {
    const originPercept = prepared.attempt.context.recentPercepts.find(
      (percept) => percept.occurrenceId === occurrence.id,
    );
    if (!originPercept
      || originPercept.phenomenon !== "speech"
      || originPercept.text !== occurrence.text) {
      return null;
    }
    return originPercept;
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

  function groundPreparedPlayerRequest(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    spec: MiraCausalCommitmentSpec,
    proposal: ResidentCognitionProposal,
    providerContext: ResidentLifeCognitionContext,
  ): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
    return groundPreparedPlayerProposal(
      prepared,
      occurrence,
      legacyCommitmentIdentity(spec),
      proposal,
      providerContext,
      groundLegacyCommitment,
    );
  }

  function groundPreparedPrivateSpeechCommitment(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    proposal: ResidentLifeIntentProposal,
    providerContext: ResidentLifeCognitionContext,
  ): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
    return groundPreparedPlayerProposal(
      prepared,
      occurrence,
      causalCommitmentIdentity(occurrence),
      proposal,
      providerContext,
      groundLifeCommitment,
    );
  }

  function groundPreparedPlayerCommitmentRequest(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    proposal: ResidentLifeIntentProposal,
    providerContext: ResidentLifeCognitionContext,
  ): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
    return groundPreparedPrivateSpeechCommitment(prepared, occurrence, proposal, providerContext);
  }

  function groundPreparedPlayerProposal<Proposal extends CausalCommitmentProposal>(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    identity: CausalCommitmentIdentity,
    proposal: Proposal,
    providerContext: ResidentLifeCognitionContext,
    ground: (
      proposal: Proposal,
      providerContext: ResidentLifeCognitionContext,
      groundingContext: ResidentCognitionContext,
      originPerceptId: string,
      navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
    ) => ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent>,
  ): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
    if (acceptedMatterIds.has(identity.matterId)) {
      return { status: "rejected", detail: `commitment already accepted: ${identity.matterId}` };
    }
    const originPercept = exactPrivateSpeechPercept(prepared, occurrence);
    if (!originPercept) {
      return { status: "rejected", detail: "prepared commitment lost its exact private speech percept" };
    }

    const grounded = ground(
      proposal,
      providerContext,
      currentGroundingContext(prepared.batch),
      originPercept.id,
      navigation,
    );
    if (grounded.status !== "accepted") return grounded;

    const intent = Object.freeze({
      originPerceptId: grounded.intent.originPerceptId,
      destination: Object.freeze({ ...grounded.intent.destination }),
      routeRegionIds: Object.freeze([...grounded.intent.routeRegionIds]),
      semanticCourse: grounded.intent.semanticCourse,
      semanticIntent: Object.freeze({ ...grounded.intent.semanticIntent }),
    }) satisfies GroundedCausalCommitmentIntent;
    groundedCommitmentAuthority.set(intent, {
      attempt: prepared.attempt,
      occurrenceId: occurrence.id,
      identity: { ...identity },
      proposal,
    });
    return { status: "accepted", intent };
  }

  function materializeAdmittedPlayerRequest(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    spec: MiraCausalCommitmentSpec,
    proposal: ResidentCognitionProposal,
    intent: GroundedCausalCommitmentIntent,
  ): AcceptedCausalCommitment {
    return materializeAdmittedPlayerProposal(
      prepared,
      occurrence,
      legacyCommitmentIdentity(spec),
      proposal,
      intent,
    );
  }

  function materializeAdmittedPrivateSpeechCommitment(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    proposal: ResidentLifeIntentProposal,
    intent: GroundedCausalCommitmentIntent,
  ): AcceptedCausalCommitment {
    return materializeAdmittedPlayerProposal(
      prepared,
      occurrence,
      causalCommitmentIdentity(occurrence),
      proposal,
      intent,
    );
  }

  function materializeAdmittedPlayerCommitmentRequest(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    proposal: ResidentLifeIntentProposal,
    intent: GroundedCausalCommitmentIntent,
  ): AcceptedCausalCommitment {
    return materializeAdmittedPrivateSpeechCommitment(prepared, occurrence, proposal, intent);
  }

  function materializeAdmittedPlayerProposal(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    identity: CausalCommitmentIdentity,
    proposal: CausalCommitmentProposal,
    intent: GroundedCausalCommitmentIntent,
  ): AcceptedCausalCommitment {
    const groundingAuthority = groundedCommitmentAuthority.get(intent);
    if (!groundingAuthority
      || groundingAuthority.attempt !== prepared.attempt
      || groundingAuthority.occurrenceId !== occurrence.id
      || !sameCommitmentIdentity(groundingAuthority.identity, identity)
      || groundingAuthority.proposal !== proposal) {
      throw new Error("grounded commitment intent lacks exact admitted grounding authority");
    }
    if (acceptedMatterIds.has(identity.matterId)) {
      groundedCommitmentAuthority.delete(intent);
      throw new Error(`commitment already accepted: ${identity.matterId}`);
    }
    const originPercept = exactPrivateSpeechPercept(prepared, occurrence);
    if (!originPercept || originPercept.id !== intent.originPerceptId) {
      groundedCommitmentAuthority.delete(intent);
      throw new Error("grounded commitment intent lost its exact causal origin");
    }

    mira.scheduleAdaptiveReview(world.tick, proposal.reviewAfterSeconds, FIXED_DELTA_SECONDS);
    const origin = kernel.recordEvidence({
      id: `evidence:mira:accepted-${identity.evidenceKey}:${originPercept.tick}`,
      tick: originPercept.tick,
      kind: "accepted_cognition_commitment",
      summary: `${intent.semanticCourse}; origin occurrence ${originPercept.occurrenceId}`,
    });
    const matter = kernel.openMatter({
      id: identity.matterId,
      originEvidenceId: origin.id,
      semanticCourse: intent.semanticCourse,
      semanticIntent: intent.semanticIntent,
    });
    kernel.bindRun({
      matterId: identity.matterId,
      taskId: identity.taskId,
      runId: identity.runId,
    });
    const focusClaim = arbitrator.request(identity.runId);
    if (focusClaim.status === "rejected") {
      throw new Error(`accepted commitment run was not authorized: ${focusClaim.reason}`);
    }
    if (focusClaim.status === "deferred") {
      // The body can be free while older legal demands remain deliberately unresolved.
      // Joining that ambiguity changes higher-life choice pressure even though no run
      // gains execution focus yet.
      choiceReviewBridge.observe(arbitrator.reconcile(), world.tick);
    }

    executors.set(
      identity.runId,
      new ResidentGroundedTravelExecutor(identity.runId, intent.destination, authority, world),
    );
    groundedTargetRegionIds.set(identity.runId, intent.semanticIntent.targetRegionId);
    runMatterIds.set(identity.runId, identity.matterId);
    acceptedMatterIds.add(identity.matterId);
    groundedCommitmentAuthority.delete(intent);

    return {
      occurrence: structuredClone(occurrence),
      batch: structuredClone(prepared.batch),
      context: structuredClone(prepared.attempt.context),
      originPerceptId: originPercept.id,
      matter: structuredClone(matter),
      runId: identity.runId,
      routeRegionIds: [...intent.routeRegionIds],
      focusClaim: structuredClone(focusClaim),
    };
  }

  function settlePreparedPlayerRequest(
    prepared: PreparedCausalLifeIntent,
    occurrence: WorldOccurrence,
    spec: MiraCausalCommitmentSpec,
    rawProposal: unknown,
  ): AcceptedCausalCommitment {
    if (acceptedMatterIds.has(spec.matterId)) throw new Error(`commitment already accepted: ${spec.matterId}`);

    const settlement = lifeIntentOwner.settleIntent(
      prepared.attempt,
      rawProposal,
      currentLife(),
      world.tick,
      (proposal, providerContext) => groundPreparedPlayerRequest(
        prepared,
        occurrence,
        spec,
        proposal,
        providerContext,
      ),
    );
    if (settlement.status !== "applied") {
      throw new Error(`commitment cognition did not apply: ${settlement.status}`);
    }
    return materializeAdmittedPlayerRequest(
      prepared,
      occurrence,
      spec,
      settlement.proposal,
      settlement.intent,
    );
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
    return settlePreparedPlayerRequest(prepared, occurrence, spec, legacyCommitmentProposal(spec));
  }

  function exactAddressedSpeechPercept(occurrence: WorldOccurrence): ResidentPercept | null {
    if (occurrence.kind !== "speech" || !occurrence.addressedActorIds.includes(MIRA_ID)) return null;
    const percepts = world.residentDiagnostics(MIRA_ID).recentPercepts;
    return percepts.find((percept) => (
      percept.occurrenceId === occurrence.id
      && percept.phenomenon === "speech"
      && percept.addressed
    )) ?? null;
  }

  function interruptionSnapshot(
    active: ActiveMiraCausalInterruption,
    status: MiraCausalInterruptionSnapshot["status"],
  ): MiraCausalInterruptionSnapshot {
    return {
      status,
      originPerceptId: active.originPerceptId,
      interruptMatterId: active.interruptMatterId,
      interruptRunId: active.interruptRunId,
      mainMatterId: active.mainMatterId,
      mainRunId: active.mainRunId,
      responseOccurrenceId: active.responseOccurrenceId,
      remainingHoldTicks: active.remainingHoldTicks,
    };
  }

  function beginAddressedInterruption(occurrence: WorldOccurrence): MiraCausalInterruptionSnapshot {
    if (activeInterruption) throw new Error("Mira already has an active addressed interruption");

    const percept = exactAddressedSpeechPercept(occurrence);
    if (!percept) {
      throw new Error("addressed interruption requires an exact private addressed speech percept");
    }
    const mainRunId = focus.focusedRun();
    if (!mainRunId) throw new Error("addressed interruption requires a focused resident run");
    const mainMatterId = runMatterIds.get(mainRunId);
    if (!mainMatterId) throw new Error("addressed interruption requires a causal commitment run");
    const mainMatter = kernel.matter(mainMatterId);
    const mainRunBinding = kernel.runBinding(mainRunId);
    if (!mainMatter || mainMatter.status !== "active" || mainMatter.activeRunId !== mainRunId || !mainRunBinding) {
      throw new Error("focused causal commitment is not interruptible");
    }

    const causalId = occurrence.id;
    const interruptMatterId = `matter.mira.interrupt.${causalId}`;
    const interruptRunId = `run.mira.interrupt.${causalId}.semantic-1`;
    if (acceptedMatterIds.has(interruptMatterId) || kernel.matter(interruptMatterId)) {
      throw new Error(`addressed interruption already materialized: ${interruptMatterId}`);
    }

    const evidence = kernel.recordEvidence({
      id: `evidence:mira:interrupt:${causalId}:${percept.tick}`,
      tick: percept.tick,
      kind: "player_addressed_speech",
      summary: `Addressed speech interrupted Mira: ${percept.text ?? percept.summary}`,
    });
    kernel.openMatter({
      id: interruptMatterId,
      originEvidenceId: evidence.id,
      semanticCourse: "briefly acknowledge the addressed player, then return to the interrupted commitment",
    });
    kernel.bindRun({
      matterId: interruptMatterId,
      taskId: `task.mira.interrupt.${causalId}.semantic-1`,
      runId: interruptRunId,
    });
    acceptedMatterIds.add(interruptMatterId);

    kernel.suspendMatter(mainMatterId, interruptMatterId);
    const focusClaim = arbitrator.claimInterruption(interruptRunId);
    if (focusClaim.status !== "acquired") {
      throw new Error(`interrupt run failed to acquire resident body: ${focusClaim.status}`);
    }
    authority.enforceMotionAuthority();

    activeInterruption = {
      originPerceptId: percept.id,
      addressedDirection: percept.spatial.kind === "directional"
        && Math.hypot(percept.spatial.direction.x, percept.spatial.direction.y) > 1e-9
        ? { ...percept.spatial.direction }
        : null,
      interruptMatterId,
      interruptRunId,
      mainMatterId,
      mainRunId,
      mainRunBinding: structuredClone(mainRunBinding),
      responseOccurrenceId: null,
      remainingHoldTicks: INTERRUPTION_HOLD_TICKS,
      responded: false,
    };
    return interruptionSnapshot(activeInterruption, "active");
  }

  function advanceAddressedInterruptionOneWorldTick(): MiraCausalInterruptionStep {
    const active = activeInterruption;
    if (!active) throw new Error("Mira has no active addressed interruption");

    if (!active.responded) {
      const effects = [
        { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
        ...(active.addressedDirection
          ? [{ kind: "look" as const, direction: { ...active.addressedDirection } }]
          : []),
        {
          kind: "speech" as const,
          text: INTERRUPTION_RESPONSE,
          radius: REQUEST_RADIUS,
          addressedActorIds: [PLAYER_ID],
        },
      ];
      const applied = authority.apply({ runId: active.interruptRunId, effects });
      if (applied.status !== "applied") {
        throw new Error(`interrupt response execution failed: ${applied.status}`);
      }
      const response = applied.occurrences.find((candidate) => candidate.kind === "speech");
      if (!response) throw new Error("interrupt response did not create a World speech occurrence");
      active.responded = true;
      active.responseOccurrenceId = response.id;
      world.step();
      return {
        status: "responded",
        interruption: interruptionSnapshot(active, "active"),
      };
    }

    if (active.remainingHoldTicks > 0) {
      active.remainingHoldTicks -= 1;
      world.step();
      return {
        status: "holding",
        interruption: interruptionSnapshot(active, "active"),
      };
    }

    const reconciled = kernel.reconcileRunOutcome({
      runId: active.interruptRunId,
      tick: world.tick,
      status: "succeeded",
      summary: `acknowledged addressed player via ${active.responseOccurrenceId ?? "speech"}`,
    });
    if (reconciled.status !== "recorded") {
      throw new Error("interrupt response factual reconciliation failed");
    }
    kernel.resolveMatter(active.interruptMatterId);
    authority.enforceMotionAuthority();

    if (!kernel.resumeMatter(active.mainMatterId)) {
      throw new Error("interrupted causal commitment failed to resume");
    }
    const bindingAfterResume = kernel.runBinding(active.mainRunId);
    if (JSON.stringify(bindingAfterResume) !== JSON.stringify(active.mainRunBinding)) {
      throw new Error("interrupted causal run binding changed across interruption");
    }
    const resumedFocus = arbitrator.restoreInterrupted(active.mainRunId);
    if (resumedFocus.status !== "acquired") {
      throw new Error(`resumed causal run failed to reacquire resident body: ${resumedFocus.status}`);
    }

    const completed = interruptionSnapshot(active, "completed");
    activeInterruption = null;
    world.step();
    return { status: "resumed", interruption: completed };
  }

  function semanticRevisionExecutionIdentity(matter: ResidentMatter) {
    return {
      taskId: `task.mira.regrounded.${matter.id}.semantic-${matter.semanticRevision}`,
      runId: `run.mira.regrounded.${matter.id}.semantic-${matter.semanticRevision}`,
    };
  }

  function regroundCurrentTravelExecution(matterId: string): string | null {
    const before = kernel.matter(matterId);
    if (!before || before.status !== "active" || before.semanticIntent?.kind !== "travel_region") {
      return null;
    }
    if (before.activeRunId && kernel.canRunMutateWorld(before.activeRunId)) {
      return before.activeRunId;
    }

    if (before.activeRunId) {
      const staleRunId = before.activeRunId;
      kernel.retireRun(staleRunId);
      executors.delete(staleRunId);
      groundedTargetRegionIds.delete(staleRunId);
      runMatterIds.delete(staleRunId);
    }

    const matter = kernel.matter(matterId);
    if (!matter || matter.status !== "active" || matter.semanticIntent?.kind !== "travel_region") {
      return null;
    }
    const groundingContext = mira.cognitionContext({
      residentId: MIRA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    });
    const currentRegionId = groundingContext.currentRegionId;
    if (!currentRegionId) return null;
    const known = new Set(groundingContext.knownRegions.map((region) => region.id));
    known.add(currentRegionId);
    const targetRegionId = matter.semanticIntent.targetRegionId;
    const route = navigation.route(currentRegionId, targetRegionId, known);
    const destination = navigation.destinationPoint(targetRegionId);
    if (!route || !destination) return null;

    const identity = semanticRevisionExecutionIdentity(matter);
    kernel.bindRun({
      matterId,
      taskId: identity.taskId,
      runId: identity.runId,
    });
    const claim = arbitrator.request(identity.runId);
    if (claim.status === "rejected") {
      kernel.retireRun(identity.runId);
      throw new Error(`re-grounded commitment run was not authorized: ${claim.reason}`);
    }

    executors.set(
      identity.runId,
      new ResidentGroundedTravelExecutor(identity.runId, destination, authority, world),
    );
    groundedTargetRegionIds.set(identity.runId, targetRegionId);
    runMatterIds.set(identity.runId, matterId);
    return identity.runId;
  }

  function refreshStaleDeferredExecutions(excludeMatterId: string): void {
    for (const matterId of [...acceptedMatterIds].sort((a, b) => a.localeCompare(b))) {
      if (matterId === excludeMatterId) continue;
      const matter = kernel.matter(matterId);
      if (!matter || matter.status !== "active") continue;
      if (matter.activeRunId && kernel.canRunMutateWorld(matter.activeRunId)) continue;
      regroundCurrentTravelExecution(matterId);
    }
  }

  function finishArrivedMatter(matterId: string, runId: string): CompletedCausalCommitment {
    const groundedTargetRegionId = groundedTargetRegionIds.get(runId);
    if (!groundedTargetRegionId) {
      throw new Error(`missing run-bound grounded target for ${runId}`);
    }

    // Rebuild any semantically stale deferred execution while this factual run still
    // owns the body. New demands therefore become deferred behind the current run,
    // preserving explicit choice_required semantics if several matters need rebinding.
    refreshStaleDeferredExecutions(matterId);

    const reconciled = kernel.reconcileRunOutcome({
      runId,
      tick: world.tick,
      status: "succeeded",
      summary: `${runId} physically reached its cognition-grounded ${groundedTargetRegionId} destination`,
    });
    if (reconciled.status !== "recorded") throw new Error(`failed to reconcile ${runId}`);
    executors.delete(runId);
    groundedTargetRegionIds.delete(runId);
    runMatterIds.delete(runId);
    kernel.resolveMatter(matterId);
    const arbitration = arbitrator.reconcile();
    const choiceReview = choiceReviewBridge.observe(arbitration, world.tick);
    authority.enforceMotionAuthority();
    return {
      matterId,
      runId,
      worldTick: world.tick,
      outcomeEvidence: structuredClone(reconciled.evidence),
      arbitration: structuredClone(arbitration),
      choiceReview: structuredClone(choiceReview),
    };
  }

  function advanceFocusedMatterOneWorldTick(): IncrementalCausalCommitmentStep {
    const runId = focus.focusedRun();
    if (!runId) throw new Error("cannot advance causal execution without a focused run");
    const matterId = runMatterIds.get(runId);
    if (!matterId) throw new Error(`focused run is not a causal commitment: ${runId}`);
    const executor = executors.get(runId);
    if (!executor) throw new Error(`missing executor for ${runId}`);

    const local = executor.step();
    if (local.status === "running") {
      world.step();
      return {
        status: "running",
        matterId,
        runId,
        worldTick: world.tick,
      };
    }
    if (local.status !== "arrived") {
      throw new Error(`${runId} did not reach its grounded destination: ${local.status}`);
    }
    return { status: "completed", completion: finishArrivedMatter(matterId, runId) };
  }

  function completeFocusedMatter(matterId: string): CompletedCausalCommitment {
    const matter = kernel.matter(matterId);
    if (!matter) throw new Error(`unknown causal commitment: ${matterId}`);
    const runId = matter.activeRunId;
    if (!runId || focus.focusedRun() !== runId) {
      throw new Error(`cannot complete unfocused commitment run: ${runId ?? "none"}`);
    }

    for (let step = 0; step < MAX_TRAVEL_STEPS; step += 1) {
      const advanced = advanceFocusedMatterOneWorldTick();
      if (advanced.status === "running") continue;
      if (advanced.completion.matterId !== matterId) {
        throw new Error(`unexpected causal commitment completed: ${advanced.completion.matterId}`);
      }
      return advanced.completion;
    }
    throw new Error(`${runId} exceeded bounded travel guard`);
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
    currentLifeView,
    takeReadyLifeIntentAttempt,
    groundPreparedPlayerRequest,
    groundPreparedPlayerCommitmentRequest,
    groundPreparedPrivateSpeechCommitment,
    materializeAdmittedPlayerRequest,
    materializeAdmittedPlayerCommitmentRequest,
    materializeAdmittedPrivateSpeechCommitment,
    settlePreparedPlayerRequest,
    acceptPlayerRequest,
    beginAddressedInterruption,
    advanceAddressedInterruptionOneWorldTick,
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

function legacyCommitmentIdentity(spec: MiraCausalCommitmentSpec): CausalCommitmentIdentity {
  return {
    matterId: spec.matterId,
    taskId: spec.taskId,
    runId: spec.runId,
    evidenceKey: `request:${spec.key}`,
  };
}

function causalCommitmentIdentity(occurrence: WorldOccurrence): CausalCommitmentIdentity {
  const causalId = occurrence.id;
  return {
    matterId: `matter.mira.causal.${causalId}`,
    taskId: `task.mira.causal.${causalId}.semantic-1`,
    runId: `run.mira.causal.${causalId}.semantic-1`,
    evidenceKey: `commitment:${causalId}`,
  };
}

function sameCommitmentIdentity(
  left: CausalCommitmentIdentity,
  right: CausalCommitmentIdentity,
): boolean {
  return left.matterId === right.matterId
    && left.taskId === right.taskId
    && left.runId === right.runId
    && left.evidenceKey === right.evidenceKey;
}

function legacyCommitmentProposal(spec: MiraCausalCommitmentSpec): ResidentCognitionProposal {
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

function groundLegacyCommitment(
  proposal: ResidentCognitionProposal,
  providerContext: ResidentLifeCognitionContext,
  groundingContext: ResidentCognitionContext,
  originPerceptId: string,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
  requireAddressedOrigin: boolean,
): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
  const directive = proposal.activityDirective;
  if (directive.kind !== "replace") {
    return { status: "rejected", detail: "expected legacy replacement travel commitment" };
  }
  return groundAcceptedTravelCommitment(
    directive.activity,
    directive.reason,
    providerContext,
    groundingContext,
    originPerceptId,
    navigation,
    true,
  );
}

function groundLifeCommitment(
  proposal: ResidentLifeIntentProposal,
  providerContext: ResidentLifeCognitionContext,
  groundingContext: ResidentCognitionContext,
  originPerceptId: string,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
  const decision = proposal.commitmentDecision;
  if (decision.kind !== "accept") {
    return { status: "rejected", detail: `commitment decision is ${decision.kind}, not accept` };
  }
  return groundAcceptedTravelCommitment(
    decision.intent,
    decision.reason,
    providerContext,
    groundingContext,
    originPerceptId,
    navigation,
    false,
  );
}

function groundAcceptedTravelCommitment(
  activity: ProposedActivity,
  reason: string,
  providerContext: ResidentLifeCognitionContext,
  groundingContext: ResidentCognitionContext,
  originPerceptId: string,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
): ResidentLifeIntentAdmission<GroundedCausalCommitmentIntent> {
  if (activity.kind !== "travel" || activity.targetRegionId === null) {
    return { status: "rejected", detail: "expected known-region travel commitment" };
  }
  if (!providerContext.recentPercepts.some((percept) => (
    percept.id === originPerceptId
    && percept.phenomenon === "speech"
    && (!requireAddressedOrigin || percept.addressed)
  ))) {
    return {
      status: "rejected",
      detail: requireAddressedOrigin
        ? "commitment origin is not the exact addressed private speech percept"
        : "commitment origin is not the exact private speech percept",
    };
  }

  const currentRegionId = groundingContext.currentRegionId;
  if (!currentRegionId) {
    return { status: "rejected", detail: "current resident region is unavailable at admission" };
  }
  const targetRegionId = activity.targetRegionId;
  const known = new Set(groundingContext.knownRegions.map((region) => region.id));
  known.add(currentRegionId);
  const route = navigation.route(currentRegionId, targetRegionId, known);
  const destination = navigation.destinationPoint(targetRegionId);
  if (!route || !destination) {
    return { status: "rejected", detail: "commitment target lacks current resident-known route/destination" };
  }

  return {
    status: "accepted",
    intent: {
      originPerceptId,
      destination,
      routeRegionIds: [...route.regionIds],
      semanticCourse: `${reason} · ${activity.goal}`,
      semanticIntent: {
        kind: "travel_region",
        goal: activity.goal,
        targetRegionId,
      },
    },
  };
}
