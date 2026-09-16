import { CognitionGrounder } from "./cognition-grounder";
import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import type { CognitionBatch, Vec2, WorldOccurrence } from "./contracts";
import {
  createFiveResidentRegionComposition,
  type FiveResidentRegionComposition,
} from "./five-resident-region";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import {
  ResidentCognitionOwner,
  type CognitionIntentSettlement,
  type ResidentCognitionAttempt,
} from "./resident-cognition-owner";
import {
  ResidentContinuityKernel,
  type RunOutcomeReconciliationResult,
} from "./resident-continuity-kernel";
import {
  ResidentGroundedTravelExecutor,
  type ResidentGroundedTravelStep,
} from "./resident-grounded-travel-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const MATTER_ID = "matter.mira.post-walk-continuation";
const TASK_ID = "task.mira.post-walk-continuation.travel";
const RUN_ID = "run.mira.post-walk-continuation.travel";
const TARGET_REGION_ID = "workshop";
const FIXED_DELTA_SECONDS = 1 / 60;
const PLAYER_ADDRESS_RADIUS = 420;
const RESEARCH_PLAYER_START = { x: 700, y: 700 } as const;

interface MiraGroundedContinuationIntent {
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
  reviewAfterSeconds: number;
}

export type MiraAutonomousContinuationPhase =
  | "awaiting_authored_completion"
  | "awaiting_cognition"
  | "cognition_pending"
  | "cognition_stale"
  | "cognition_rejected"
  | "traveling"
  | "resolved"
  | "blocked"
  | "authority_lost";

export type MiraAutonomousContinuationStep =
  | { status: "awaiting_authored_completion"; tick: number }
  | { status: "awaiting_cognition"; tick: number }
  | {
      status: "cognition_requested";
      tick: number;
      attemptId: string;
      batch: CognitionBatch;
      context: ResidentCognitionContext;
    }
  | { status: "cognition_pending"; tick: number; attemptId: string }
  | { status: "cognition_stale"; tick: number; reason: "newer_addressed_attention" | "activity_changed_during_request" }
  | { status: "cognition_rejected"; tick: number; reason: string; detail?: string }
  | {
      status: "continuation_started";
      tick: number;
      batch: CognitionBatch;
      context: ResidentCognitionContext;
      proposal: ResidentCognitionProposal;
      routeRegionIds: readonly string[];
    }
  | { status: "traveling"; local: Extract<ResidentGroundedTravelStep, { status: "running" }> }
  | {
      status: "resolved";
      local: Extract<ResidentGroundedTravelStep, { status: "arrived" }>;
      reconciliation: RunOutcomeReconciliationResult;
    }
  | {
      status: "blocked";
      local: Extract<ResidentGroundedTravelStep, { status: "blocked" }>;
      reconciliation: RunOutcomeReconciliationResult;
    }
  | { status: "authority_lost"; local: Extract<ResidentGroundedTravelStep, { status: "authority_lost" }> };

export type MiraDeterministicCognitionSettlement =
  | Extract<MiraAutonomousContinuationStep, { status: "continuation_started" }>
  | Extract<MiraAutonomousContinuationStep, { status: "cognition_stale" }>
  | Extract<MiraAutonomousContinuationStep, { status: "cognition_rejected" }>;

export interface FiveResidentMiraAutonomousContinuationSlice {
  world: FiveResidentRegionComposition["world"];
  kernel: ResidentContinuityKernel;
  phase(): MiraAutonomousContinuationPhase;
  advanceOneWorldTick(): MiraAutonomousContinuationStep;
  settleDeterministicCognition(): MiraDeterministicCognitionSettlement;
  playerAddressMira(text?: string): WorldOccurrence;
  cognitionBatch(): CognitionBatch | null;
  cognitionContext(): ResidentCognitionContext | null;
  cognitionProposal(): ResidentCognitionProposal | null;
  cognitionAttemptId(): string | null;
  reconciliation(): RunOutcomeReconciliationResult | null;
  miraScheduleDiagnostics(): ReturnType<FiveResidentRegionComposition["runtimes"]["resident.mira"]["cognitionScheduleDiagnostics"]>;
}

/**
 * First bounded closure of the baseline's post-authored cognition gap.
 *
 * This is intentionally a deterministic research fixture, NOT LIVE_PROVIDER evidence.
 * It uses Mira's real scheduler batch and private cognition context. The cognition
 * request is a real in-flight ResidentCognitionOwner attempt: World may advance after
 * request creation and before settlement, and newer addressed attention/activity
 * invalidates the late answer before matter grounding can run.
 *
 * The existing `activityDirective` is temporarily treated as a semantic-intent
 * envelope. It is never installed as a legacy ResidentActivity. An admitted intent
 * becomes a continuing matter + exact run; body execution then belongs to
 * ResidentGroundedTravelExecutor through recovered ResidentWorldExecutionAuthority.
 */
export function createFiveResidentMiraAutonomousContinuationSlice(): FiveResidentMiraAutonomousContinuationSlice {
  // Keep the participant physically within Mira's authored hearing radius at the
  // post-walk cognition boundary. This is fixture geometry, not an enlarged hearing
  // oracle: World still clamps speech by Mira's real 420-unit hearing radius.
  const composition = createFiveResidentRegionComposition({ playerStart: RESEARCH_PLAYER_START });
  const { world } = composition;
  const mira = composition.runtimes[MIRA_ID];
  const navigation = createFiveResidentNavigationGraph();
  const cognitionOwner = new ResidentCognitionOwner(mira, new CognitionGrounder(navigation));
  const kernel = new ResidentContinuityKernel();

  let currentPhase: MiraAutonomousContinuationPhase = "awaiting_authored_completion";
  let batch: CognitionBatch | null = null;
  let context: ResidentCognitionContext | null = null;
  let proposal: ResidentCognitionProposal | null = null;
  let cognitionAttempt: ResidentCognitionAttempt | null = null;
  let terminalCognition: Extract<MiraDeterministicCognitionSettlement, { status: "cognition_stale" | "cognition_rejected" }> | null = null;
  let authority: ResidentWorldExecutionAuthority | null = null;
  let executor: ResidentGroundedTravelExecutor | null = null;
  let reconciled: RunOutcomeReconciliationResult | null = null;

  return {
    world,
    kernel,
    phase: () => currentPhase,
    advanceOneWorldTick(): MiraAutonomousContinuationStep {
      if (currentPhase === "resolved") {
        if (!executor || !reconciled) throw new Error("resolved continuation lost executor/reconciliation");
        const local = executor.step();
        if (local.status !== "arrived") throw new Error("resolved continuation lost factual arrival");
        return { status: "resolved", local, reconciliation: structuredClone(reconciled) };
      }
      if (currentPhase === "blocked") {
        if (!executor || !reconciled) throw new Error("blocked continuation lost executor/reconciliation");
        const local = executor.step();
        if (local.status !== "blocked") throw new Error("blocked continuation lost factual blockage");
        return { status: "blocked", local, reconciliation: structuredClone(reconciled) };
      }
      if (currentPhase === "authority_lost") {
        if (!executor) throw new Error("authority-lost continuation lost executor");
        const local = executor.step();
        if (local.status !== "authority_lost") throw new Error("authority-lost continuation changed terminal state");
        return { status: "authority_lost", local };
      }
      if (currentPhase === "cognition_stale" || currentPhase === "cognition_rejected") {
        if (!terminalCognition) throw new Error("terminal cognition phase lost its settlement");
        return structuredClone(terminalCognition);
      }
      if (currentPhase === "cognition_pending") {
        if (!cognitionAttempt) throw new Error("pending cognition lost exact attempt authority");
        world.step();
        return { status: "cognition_pending", tick: world.tick, attemptId: cognitionAttempt.id };
      }

      if (currentPhase === "awaiting_authored_completion" || currentPhase === "awaiting_cognition") {
        world.step();
        const publicState = mira.publicState();
        const authoredComplete = publicState.activity.kind === "idle"
          && publicState.activity.reason.includes("completed activity:mira:initial");
        if (!authoredComplete) {
          currentPhase = "awaiting_authored_completion";
          return { status: "awaiting_authored_completion", tick: world.tick };
        }

        currentPhase = "awaiting_cognition";
        const ready = mira.takeCognitionBatch(world.tick);
        if (!ready) return { status: "awaiting_cognition", tick: world.tick };
        if (!ready.reasons.some((reason) => reason.kind === "activity_completed")) {
          throw new Error("Mira's first ready post-authored batch lacks activity_completed pressure");
        }

        const attempt = cognitionOwner.prepare(ready);
        if (!attempt) throw new Error("Mira cognition owner refused the first post-authored request");
        cognitionAttempt = attempt;
        batch = structuredClone(ready);
        context = structuredClone(attempt.context);
        currentPhase = "cognition_pending";
        return {
          status: "cognition_requested",
          tick: world.tick,
          attemptId: attempt.id,
          batch: structuredClone(ready),
          context: structuredClone(attempt.context),
        };
      }

      if (!authority || !executor) throw new Error("traveling continuation lacks execution authority");
      const local = executor.step();
      if (local.status === "running") {
        world.step();
        return { status: "traveling", local };
      }
      if (local.status === "authority_lost") {
        currentPhase = "authority_lost";
        return { status: "authority_lost", local };
      }
      if (local.status === "blocked") {
        reconciled = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: world.tick,
          status: "blocked",
          summary: `Mira's grounded continuation was physically blocked: ${local.constraints.join(", ") || "unknown constraint"}`,
        });
        const evidence = kernel.recordEvidence({
          id: `evidence:mira:continuation-blocked:${world.tick}`,
          tick: world.tick,
          kind: "task_outcome",
          summary: "Mira's continuation body run was physically blocked and now requires reconsideration.",
        });
        kernel.advanceSemanticContext(MATTER_ID, evidence.id);
        authority.enforceMotionAuthority();
        currentPhase = "blocked";
        return { status: "blocked", local, reconciliation: structuredClone(reconciled) };
      }

      reconciled = kernel.reconcileRunOutcome({
        runId: local.runId,
        tick: world.tick,
        status: "succeeded",
        summary: `Mira physically arrived at the cognition-grounded ${TARGET_REGION_ID} destination.`,
      });
      if (reconciled.status !== "recorded") {
        throw new Error("Mira continuation could not reconcile factual arrival");
      }
      kernel.resolveMatter(MATTER_ID);
      authority.enforceMotionAuthority();
      currentPhase = "resolved";
      return { status: "resolved", local, reconciliation: structuredClone(reconciled) };
    },
    settleDeterministicCognition(): MiraDeterministicCognitionSettlement {
      if (currentPhase !== "cognition_pending" || !cognitionAttempt || !batch || !context) {
        throw new Error("Mira deterministic cognition may settle only while an exact request is pending");
      }
      const attempt = cognitionAttempt;
      const settlement: CognitionIntentSettlement<MiraGroundedContinuationIntent> = cognitionOwner.settleIntent(
        attempt,
        deterministicContinuationProposal(),
        world.tick,
        (parsed, privateContext) => groundContinuationIntent(parsed, privateContext, navigation),
      );
      cognitionAttempt = null;

      if (settlement.status === "stale") {
        currentPhase = "cognition_stale";
        terminalCognition = {
          status: "cognition_stale",
          tick: world.tick,
          reason: settlement.reason,
        };
        return structuredClone(terminalCognition);
      }
      if (settlement.status === "rejected") {
        currentPhase = "cognition_rejected";
        terminalCognition = {
          status: "cognition_rejected",
          tick: world.tick,
          reason: settlement.reason,
          ...(settlement.detail ? { detail: settlement.detail } : {}),
        };
        return structuredClone(terminalCognition);
      }

      proposal = structuredClone(settlement.proposal);
      mira.scheduleAdaptiveReview(world.tick, settlement.intent.reviewAfterSeconds, FIXED_DELTA_SECONDS);

      const origin = kernel.recordEvidence({
        id: `evidence:mira:post-walk-cognition:${world.tick}`,
        tick: world.tick,
        kind: "life_context",
        summary: `After completing her settlement walk, Mira's admitted cognition selected: ${settlement.proposal.activityDirective.reason}`,
      });
      kernel.openMatter({
        id: MATTER_ID,
        originEvidenceId: origin.id,
        semanticCourse: settlement.intent.semanticCourse,
      });
      kernel.bindRun({ matterId: MATTER_ID, taskId: TASK_ID, runId: RUN_ID });

      authority = new ResidentWorldExecutionAuthority(MIRA_ID, kernel, world);
      executor = new ResidentGroundedTravelExecutor(RUN_ID, settlement.intent.destination, authority, world);
      currentPhase = "traveling";
      return {
        status: "continuation_started",
        tick: world.tick,
        batch: structuredClone(batch),
        context: structuredClone(context),
        proposal: structuredClone(settlement.proposal),
        routeRegionIds: [...settlement.intent.routeRegionIds],
      };
    },
    playerAddressMira(text = "Mira, chwila!"): WorldOccurrence {
      return world.speak(PLAYER_ID, text, PLAYER_ADDRESS_RADIUS, [MIRA_ID]);
    },
    cognitionBatch: () => batch ? structuredClone(batch) : null,
    cognitionContext: () => context ? structuredClone(context) : null,
    cognitionProposal: () => proposal ? structuredClone(proposal) : null,
    cognitionAttemptId: () => cognitionAttempt?.id ?? null,
    reconciliation: () => reconciled ? structuredClone(reconciled) : null,
    miraScheduleDiagnostics: () => structuredClone(mira.cognitionScheduleDiagnostics()),
  };
}

function groundContinuationIntent(
  proposal: ResidentCognitionProposal,
  context: ResidentCognitionContext,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
) {
  const directive = proposal.activityDirective;
  if (directive.kind !== "replace" || directive.activity.kind !== "travel") {
    return { status: "rejected" as const, detail: "post-walk continuation requires a travel intent" };
  }
  if (directive.activity.targetRegionId !== TARGET_REGION_ID) {
    return { status: "rejected" as const, detail: "deterministic fixture selected an unexpected target region" };
  }
  if (!context.currentRegionId) {
    return { status: "rejected" as const, detail: "Mira has no private current region at continuation boundary" };
  }

  const knownRegionIds = new Set(context.knownRegions.map((region) => region.id));
  knownRegionIds.add(context.currentRegionId);
  const route = navigation.route(context.currentRegionId, TARGET_REGION_ID, knownRegionIds);
  const destination = navigation.destinationPoint(TARGET_REGION_ID);
  if (!route || !destination) {
    return { status: "rejected" as const, detail: "Mira's private region knowledge cannot ground the selected continuation route" };
  }

  return {
    status: "accepted" as const,
    intent: {
      destination,
      routeRegionIds: [...route.regionIds],
      semanticCourse: `${directive.reason} · ${directive.activity.goal}`,
      reviewAfterSeconds: proposal.reviewAfterSeconds,
    },
  };
}

function deterministicContinuationProposal(): unknown {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: "check workshop continuity after finishing the settlement walk",
      activity: {
        kind: "travel",
        goal: "go to the familiar workshop and continue settlement responsibilities there",
        targetActorId: null,
        targetRegionId: TARGET_REGION_ID,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 20,
  };
}
