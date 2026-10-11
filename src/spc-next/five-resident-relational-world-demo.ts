import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import type { ResidentMatterIntent } from "./resident-continuity-kernel";

/**
 * Opt-in, zero-provider research dramaturgy, NOT autonomous NPC life.
 * ALL authored choices have explicit authored_initial_context provenance.
 * Ordinary R6 matter/run/World execution and resident-private sight are real.
 * The later optional "choice" is test-injected by the human, never generated
 * by a model or attributed to Janek. No network transport is constructed.
 */
const JAN = "resident.janek";
const IDA = "resident.ida";
const PROMISE = "Ida, porozmawiamy jeszcze, gdy wrócisz do warsztatu.";
const RESPONSE = "Ida, pamiętam naszą rozmowę. Dobrze, że wróciłaś.";
type Phase = "approach" | "promise" | "leaving" | "returning"
  | "awaiting_choice" | "settling_choice" | "spoken" | "deferred"
  | "control_complete" | "failed";
export type RelationalEpisodeChoice = "respond" | "defer";
export interface RelationalEpisodeState {
  readonly phase: Phase;
  readonly tick: number;
  readonly initialChoicesAuthored: true;
  readonly modelCalls: 0;
  readonly withEarlierPromise: boolean;
  readonly standingMatterId: string | null;
  readonly privateReturnReasonId: string | null;
  readonly localDecision: "not_selected" | RelationalEpisodeChoice;
  readonly factualReply: boolean;
  readonly failure: string | null;
}

export class FiveResidentRelationalWorldDemo {
  readonly composition = createFiveResidentRegionComposition({
    playerStart: { x: 1_660, y: 770 },
  });
  readonly host = new FiveResidentCausalLifeRuntime(this.composition, {
    socialReencounter: true,
  });
  readonly world = this.composition.world;
  private readonly cognition = new FiveResidentCausalCognitionHost(this.host, 1);
  private phase: Phase = "approach";
  private readonly withEarlierPromise: boolean;
  private activeRunId: string | null = null;
  private serial = 0;
  private standingId: string | null = null;
  private returnReasonId: string | null = null;
  private selectedChoice: RelationalEpisodeChoice | null = null;
  private factualReply = false;
  private failure: string | null = null;

  constructor(withEarlierPromise = true) {
    this.withEarlierPromise = withEarlierPromise;
    // Prelude is openly authored and ends BEFORE the view is presented.
    // It grants no fabricated personal goal to any recovered resident.
    for (let i = 0; this.host.claimedResidentIds().length < 5 && i < 1_600; i += 1) {
      this.host.advanceOneWorldTick();
    }
    if (this.host.claimedResidentIds().length !== 5) {
      throw new Error("relational lab never recovered all five residents");
    }
    this.startAct(IDA, "travel_to_workshop", {
      kind: "travel_region", targetRegionId: "workshop",
      goal: "Test-authored Ida arrival at the workshop",
    });
  }

  state(): RelationalEpisodeState {
    return {
      phase: this.phase,
      tick: this.world.tick,
      initialChoicesAuthored: true,
      modelCalls: 0,
      withEarlierPromise: this.withEarlierPromise,
      standingMatterId: this.standingId,
      privateReturnReasonId: this.returnReasonId,
      localDecision: this.selectedChoice ?? "not_selected",
      factualReply: this.factualReply,
      failure: this.failure,
    };
  }

  chooseTestResponse(choice: RelationalEpisodeChoice): "accepted" | "not_ready" {
    if (this.phase !== "awaiting_choice" || this.selectedChoice) return "not_ready";
    this.selectedChoice = choice;
    this.phase = "settling_choice";
    return "accepted";
  }

  advanceOneWorldTick(): void {
    // 6x display-time acceleration, but EACH World frame is a genuine 60 Hz
    // simulation tick with ordinary collision, cognition and executor authority.
    // Awaiting a choice remains quiet, not a provider polling/heartbeat loop.
    const steps = this.phase === "awaiting_choice" || this.phase === "spoken"
      || this.phase === "deferred" || this.phase === "control_complete"
      || this.phase === "failed" ? 1 : 6;
    for (let i = 0; i < steps; i += 1) this.advanceRealTick();
  }

  private advanceRealTick(): void {
    const frame = this.host.advanceOneWorldTick();
    const janek = this.host.life(JAN);
    if (!janek) throw new Error("Janek's recovered R6 life missing");
    const completion = frame.execution[this.phase === "promise" ? JAN : IDA];
    const completed = !!completion && completion.status === "completed"
      && completion.runId === this.activeRunId;
    // World failure must be observable, never hidden as an endless authored
    // animation. Player obstruction or changed geometry can falsify the demo.
    if (completion && "runId" in completion && completion.runId === this.activeRunId
      && (completion.status === "blocked"
        || completion.status === "grounding_unavailable"
        || completion.status === "unsupported_intent"
        || completion.status === "authority_lost")) {
      return this.fail("World rejected active " + this.phase + " execution: " + completion.status);
    }

    if (this.phase === "approach" && completed) {
      if (this.withEarlierPromise) {
        // Hearing/proximity comes from completed physical World travel.
        this.startAct(JAN, "authored_first_promise", {
          kind: "communicate_actor", targetActorId: IDA, text: PROMISE,
          goal: "Say a previously test-selected initial promise",
          standingSocialCommitment: { goal: "Keep my own factual promise to Ida" },
        });
        this.phase = "promise";
      } else {
        this.startIdaDeparture();
      }
    } else if (this.phase === "promise") {
      const standing = janek.currentLifeView().matters.find(m =>
        m.status === "active" && m.semanticIntent?.kind === "standing_social_commitment"
          && m.semanticIntent.counterpartyActorId === IDA
      );
      if (standing) {
        // Never synthesize a spoken past. The exact World occurrence is required.
        const occurred = this.world.diagnostics().recentOccurrences.some(o =>
          o.kind === "speech" && o.actorId === JAN && o.text === PROMISE
            && o.addressedActorIds.includes(IDA));
        if (!occurred) return this.fail("standing exists without factual World speech");
        this.standingId = standing.id;
        this.startIdaDeparture();
      }
    } else if (this.phase === "leaving" && completed) {
      this.startAct(IDA, "return_to_workshop", {
        kind: "travel_region", targetRegionId: "workshop",
        goal: "Test-authored physical Ida return after an earlier real meeting",
      });
      this.phase = "returning";
    } else if (this.phase === "returning") {
      const newReasons = frame.socialRelevance[JAN] ?? [];
      for (const reason of newReasons) {
        if (reason.status === "promoted" && reason.matterId === this.standingId) {
          this.returnReasonId = reason.reasonId;
        }
      }
      if (completed) {
        if (!this.withEarlierPromise) {
          this.phase = "control_complete";
        } else if (this.returnReasonId !== null) {
          this.phase = "awaiting_choice";
        } else {
          this.fail("physical return completed without Janek-private standing relevance");
        }
      }
    } else if (this.phase === "settling_choice") {
      this.trySettleChosenResponse();
    }

    if (this.phase === "settling_choice" && this.selectedChoice === "respond"
      || this.phase === "spoken") {
      const spoke = this.world.diagnostics().recentOccurrences.some(o =>
        o.kind === "speech" && o.actorId === JAN && o.text === RESPONSE
          && o.addressedActorIds.includes(IDA));
      if (spoke) {
        this.factualReply = true;
        this.phase = "spoken";
      }
    }
  }

  private startIdaDeparture(): void {
    this.startAct(IDA, "leave_workshop", {
      kind: "travel_region", targetRegionId: "crossroads",
      goal: "Test-authored journey away from the earlier social encounter",
    });
    this.phase = "leaving";
  }

  private startAct(
    residentId: typeof IDA | typeof JAN, name: string, intent: ResidentMatterIntent,
  ): void {
    const life = this.host.life(residentId);
    if (!life) throw new Error("missing resident causal life: " + residentId);
    const stem = `lab.${name}.${++this.serial}`;
    const namespace = residentId.split(".").at(-1)!;
    const origin = life.kernel.recordEvidence({
      id: `evidence.${namespace}.${stem}.authored`,
      tick: this.world.tick,
      kind: "authored_initial_context",
      summary: "The LAB AUTHOR chose this act; do not credit autonomous resident intention.",
    });
    const matterId = `matter.${namespace}.${stem}`;
    const runId = `run.${namespace}.${stem}`;
    life.kernel.openMatter({
      id: matterId, originEvidenceId: origin.id,
      semanticCourse: "Test-authored episode setup: " + name,
      semanticIntent: intent,
    });
    life.matterScope.track(matterId);
    life.kernel.bindRun({ matterId, taskId: `task.${namespace}.${stem}`, runId });
    const claim = life.arbitrator.request(runId);
    if (claim.status !== "acquired") throw new Error("real R6 run refused: " + name);
    this.activeRunId = runId;
  }

  private trySettleChosenResponse(): void {
    const reasonId = this.returnReasonId, choice = this.selectedChoice;
    if (!reasonId || !choice) return this.fail("no personal reason or test choice");
    this.cognition.collectReadyBatches([JAN]);
    const request = this.cognition.startReadyRequests([JAN])[0];
    if (!request) return; // not ready: ordinary resident-local cognition cadence
    if (!request.batch.reasons.some(r => r.id === reasonId)) {
      this.cognition.abandon(request);
      return this.fail("wrong reason: refused to fabricate matching personal context");
    }
    const commitmentDecision = choice === "respond"
      ? {
          kind: "accept" as const,
          reason: "LAB-SELECTED response to one privately supported social continuation",
          intent: {
            kind: "communicate" as const, goal: "Test-authorized return greeting",
            targetActorId: IDA, targetRegionId: null, targetPosition: null,
            text: RESPONSE,
          },
        }
      : {
          kind: "defer" as const,
          reason: "LAB-SELECTED meaningful nonaction; keep original standing open",
        };
    const applied = this.cognition.settleCommitment(request, {
      version: 1, commitmentDecision,
      beliefs: [], concerns: [], reviewAfterSeconds: 60,
    }, reasonId);
    if (applied.status !== "applied") {
      return this.fail("local semantic admission: " + applied.status);
    }
    if (choice === "defer") this.phase = "deferred";
    // For 'respond', keep ticking World until actual physically emitted speech.
  }

  private fail(reason: string): void {
    this.phase = "failed";
    this.failure = reason;
  }
}

export const RELATIONAL_DEMO_JANEK = JAN;
export const RELATIONAL_DEMO_IDA = IDA;
export const RELATIONAL_DEMO_SPEECH = { promise: PROMISE, response: RESPONSE } as const;
