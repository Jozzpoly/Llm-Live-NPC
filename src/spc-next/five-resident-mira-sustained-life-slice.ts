import { CognitionGrounder } from "./cognition-grounder";
import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import type { CognitionBatch, Vec2 } from "./contracts";
import {
  createFiveResidentRegionComposition,
  type FiveResidentRegionComposition,
} from "./five-resident-region";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import {
  ResidentCognitionOwner,
  type CognitionIntentSettlement,
} from "./resident-cognition-owner";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import {
  ResidentGroundedTravelExecutor,
  type ResidentGroundedTravelStep,
} from "./resident-grounded-travel-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const FIXED_DELTA_SECONDS = 1 / 60;
const RESEARCH_PLAYER_START = { x: 700, y: 700 } as const;

const CHAPTERS = [
  {
    index: 1,
    matterId: "matter.mira.sustained.1.workshop",
    taskId: "task.mira.sustained.1.workshop",
    runId: "run.mira.sustained.1.workshop",
    targetRegionId: "workshop",
    reason: "continue settlement continuity at the familiar workshop",
    goal: "go to the workshop after finishing the settlement walk",
  },
  {
    index: 2,
    matterId: "matter.mira.sustained.2.hearth",
    taskId: "task.mira.sustained.2.hearth",
    runId: "run.mira.sustained.2.hearth",
    targetRegionId: "hearth",
    reason: "return to the familiar hearth after checking the workshop",
    goal: "go back to the hearth and continue settlement presence there",
  },
] as const;

type Chapter = (typeof CHAPTERS)[number];

interface GroundedTravelIntent {
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
  reviewAfterSeconds: number;
}

export type MiraSustainedLifePhase =
  | "authored_opening"
  | "awaiting_cognition"
  | "traveling"
  | "between_chapters"
  | "completed";

export type MiraSustainedLifeStep =
  | { status: "authored_opening"; tick: number }
  | { status: "awaiting_cognition"; tick: number; chapter: 1 | 2 }
  | {
      status: "chapter_started";
      tick: number;
      chapter: 1 | 2;
      matterId: string;
      runId: string;
      batch: CognitionBatch;
      context: ResidentCognitionContext;
      proposal: ResidentCognitionProposal;
      routeRegionIds: readonly string[];
    }
  | {
      status: "traveling";
      chapter: 1 | 2;
      local: Extract<ResidentGroundedTravelStep, { status: "running" }>;
    }
  | {
      status: "chapter_resolved";
      tick: number;
      chapter: 1 | 2;
      matterId: string;
      runId: string;
      local: Extract<ResidentGroundedTravelStep, { status: "arrived" }>;
    }
  | { status: "completed"; tick: number };

export interface FiveResidentMiraSustainedLifeSlice {
  world: FiveResidentRegionComposition["world"];
  kernel: ResidentContinuityKernel;
  executionFocus: ResidentExecutionFocusAuthority;
  phase(): MiraSustainedLifePhase;
  chapter(): 1 | 2 | null;
  advanceOneWorldTick(): MiraSustainedLifeStep;
}

/**
 * Bounded repeated-life experiment for one resident.
 *
 * It intentionally chooses deterministic semantic decisions so the experiment can
 * isolate lifecycle continuity rather than model quality. The fixture proves or
 * falsifies whether one resident can close cognition -> matter -> exact execution ->
 * factual outcome twice without reconstructing World/private memory/cognition/kernel
 * or reclaiming a second World authority facade.
 *
 * This is NOT evidence that ping-pong travel is desirable resident behavior and is
 * NOT LIVE_PROVIDER evidence. It is a sustained-life architecture pressure specimen.
 */
export function createFiveResidentMiraSustainedLifeSlice(): FiveResidentMiraSustainedLifeSlice {
  const composition = createFiveResidentRegionComposition({ playerStart: RESEARCH_PLAYER_START });
  const { world } = composition;
  const mira = composition.runtimes[MIRA_ID];
  const navigation = createFiveResidentNavigationGraph();
  const cognitionOwner = new ResidentCognitionOwner(mira, new CognitionGrounder(navigation));
  const kernel = new ResidentContinuityKernel();
  const executionFocus = new ResidentExecutionFocusAuthority(kernel);

  let phase: MiraSustainedLifePhase = "authored_opening";
  let chapterIndex = 0;
  let executor: ResidentGroundedTravelExecutor | null = null;
  let worldAuthority: ResidentWorldExecutionAuthority | null = null;

  return {
    world,
    kernel,
    executionFocus,
    phase: () => phase,
    chapter: () => chapterIndex < CHAPTERS.length ? CHAPTERS[chapterIndex]!.index : null,
    advanceOneWorldTick(): MiraSustainedLifeStep {
      if (phase === "completed") return { status: "completed", tick: world.tick };

      if (phase === "traveling") {
        const chapter = CHAPTERS[chapterIndex]!;
        if (!executor || !worldAuthority) throw new Error("sustained-life travel lost execution state");
        const local = executor.step();
        if (local.status === "authority_lost") {
          throw new Error(`sustained-life chapter ${chapter.index} unexpectedly lost exact run authority`);
        }
        if (local.status === "blocked") {
          throw new Error(`sustained-life chapter ${chapter.index} unexpectedly blocked: ${local.constraints.join(",")}`);
        }
        if (local.status === "running") {
          world.step();
          return { status: "traveling", chapter: chapter.index, local };
        }

        const reconciled = kernel.reconcileRunOutcome({
          runId: chapter.runId,
          tick: world.tick,
          status: "succeeded",
          summary: `Mira physically arrived for sustained-life chapter ${chapter.index} in ${chapter.targetRegionId}.`,
        });
        if (reconciled.status !== "recorded") {
          throw new Error(`sustained-life chapter ${chapter.index} could not reconcile factual arrival`);
        }
        kernel.resolveMatter(chapter.matterId);
        executionFocus.sync();
        worldAuthority.enforceMotionAuthority();
        executor = null;

        const resolved: MiraSustainedLifeStep = {
          status: "chapter_resolved",
          tick: world.tick,
          chapter: chapter.index,
          matterId: chapter.matterId,
          runId: chapter.runId,
          local,
        };
        chapterIndex += 1;
        phase = chapterIndex >= CHAPTERS.length ? "completed" : "between_chapters";
        return resolved;
      }

      // World remains authoritative and continues between chapters. The second
      // cognition trigger must therefore arise from the same resident history rather
      // than from fixture reinitialization.
      world.step();

      if (phase === "authored_opening") {
        const authored = mira.publicState().activity;
        if (authored.kind !== "idle" || !authored.reason.includes("completed activity:mira:initial")) {
          return { status: "authored_opening", tick: world.tick };
        }
        phase = "awaiting_cognition";
      } else if (phase === "between_chapters") {
        phase = "awaiting_cognition";
      }

      const chapter = CHAPTERS[chapterIndex];
      if (!chapter) {
        phase = "completed";
        return { status: "completed", tick: world.tick };
      }

      const batch = mira.takeCognitionBatch(world.tick);
      if (!batch) {
        return { status: "awaiting_cognition", tick: world.tick, chapter: chapter.index };
      }
      if (chapter.index === 1 && !batch.reasons.some((reason) => reason.kind === "activity_completed")) {
        throw new Error("first sustained-life cognition lacks authored activity completion pressure");
      }

      const attempt = cognitionOwner.prepare(batch);
      if (!attempt) throw new Error("sustained-life cognition owner already has an unrelated active attempt");
      const rawProposal = deterministicTravelProposal(chapter);
      const settlement: CognitionIntentSettlement<GroundedTravelIntent> = cognitionOwner.settleIntent(
        attempt,
        rawProposal,
        world.tick,
        (proposal, context) => groundTravelIntent(chapter, proposal, context, navigation),
      );
      if (settlement.status !== "applied") {
        throw new Error(`sustained-life chapter ${chapter.index} cognition was not admitted: ${settlement.status}`);
      }

      mira.scheduleAdaptiveReview(world.tick, settlement.intent.reviewAfterSeconds, FIXED_DELTA_SECONDS);
      const origin = kernel.recordEvidence({
        id: `evidence:mira:sustained:${chapter.index}:${world.tick}`,
        tick: world.tick,
        kind: "life_context",
        summary: `Mira sustained-life chapter ${chapter.index}: ${settlement.proposal.activityDirective.reason}`,
      });
      kernel.openMatter({
        id: chapter.matterId,
        originEvidenceId: origin.id,
        semanticCourse: settlement.intent.semanticCourse,
      });
      kernel.bindRun({
        matterId: chapter.matterId,
        taskId: chapter.taskId,
        runId: chapter.runId,
      });
      const focus = executionFocus.claim(chapter.runId);
      if (focus.status !== "acquired") {
        throw new Error(`sustained-life chapter ${chapter.index} could not acquire execution focus: ${focus.status}`);
      }

      if (!worldAuthority) {
        worldAuthority = new ResidentWorldExecutionAuthority(MIRA_ID, executionFocus, world);
      }
      executor = new ResidentGroundedTravelExecutor(
        chapter.runId,
        settlement.intent.destination,
        worldAuthority,
        world,
      );
      phase = "traveling";
      return {
        status: "chapter_started",
        tick: world.tick,
        chapter: chapter.index,
        matterId: chapter.matterId,
        runId: chapter.runId,
        batch: structuredClone(batch),
        context: structuredClone(attempt.context),
        proposal: structuredClone(settlement.proposal),
        routeRegionIds: [...settlement.intent.routeRegionIds],
      };
    },
  };
}

function groundTravelIntent(
  chapter: Chapter,
  proposal: ResidentCognitionProposal,
  context: ResidentCognitionContext,
  navigation: ReturnType<typeof createFiveResidentNavigationGraph>,
) {
  const directive = proposal.activityDirective;
  if (directive.kind !== "replace" || directive.activity.kind !== "travel") {
    return { status: "rejected" as const, detail: "sustained-life chapter requires travel intent" };
  }
  if (directive.activity.targetRegionId !== chapter.targetRegionId) {
    return { status: "rejected" as const, detail: "unexpected sustained-life target region" };
  }
  if (!context.currentRegionId) {
    return { status: "rejected" as const, detail: "resident has no current authored region" };
  }

  const knownRegionIds = new Set(context.knownRegions.map((region) => region.id));
  knownRegionIds.add(context.currentRegionId);
  const route = navigation.route(context.currentRegionId, chapter.targetRegionId, knownRegionIds);
  const destination = navigation.destinationPoint(chapter.targetRegionId);
  if (!route || !destination) {
    return { status: "rejected" as const, detail: "private known-region graph cannot ground chapter route" };
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

function deterministicTravelProposal(chapter: Chapter): unknown {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: chapter.reason,
      activity: {
        kind: "travel",
        goal: chapter.goal,
        targetActorId: null,
        targetRegionId: chapter.targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 20,
  };
}
