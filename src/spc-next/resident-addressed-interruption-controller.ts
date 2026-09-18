import type { ResidentPercept } from "./contracts";
import type { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import type { ResidentTaskRunBinding } from "./resident-continuity-kernel";

export interface ResidentAddressedInterruptionSnapshot {
  status: "active" | "completed";
  originPerceptId: string;
  interruptMatterId: string;
  interruptRunId: string;
  mainMatterId: string;
  mainRunId: string;
  responseOccurrenceId: string | null;
  remainingHoldTicks: number;
}

export type ResidentAddressedInterruptionObservation =
  | { status: "none" }
  | { status: "heard_without_preemption"; perceptId: string }
  | { status: "already_active"; interruption: ResidentAddressedInterruptionSnapshot }
  | { status: "started"; interruption: ResidentAddressedInterruptionSnapshot };

export type ResidentAddressedInterruptionStep =
  | { status: "idle" }
  | { status: "responded"; interruption: ResidentAddressedInterruptionSnapshot }
  | { status: "holding"; interruption: ResidentAddressedInterruptionSnapshot }
  | { status: "resumed"; interruption: ResidentAddressedInterruptionSnapshot };

interface ActiveInterruption {
  originPerceptId: string;
  addressedDirection: { x: number; y: number } | null;
  targetActorId: string | null;
  interruptMatterId: string;
  interruptRunId: string;
  mainMatterId: string;
  mainRunId: string;
  mainRunBinding: ResidentTaskRunBinding;
  responseOccurrenceId: string | null;
  remainingHoldTicks: number;
  responded: boolean;
}

export interface ResidentAddressedInterruptionOptions {
  responseText?: string;
  holdTicks?: number;
}

const DEFAULT_RESPONSE_TEXT = "Tak?";
const DEFAULT_HOLD_TICKS = 24;

/**
 * Resident-generic local contact interruption for physically heard addressed speech.
 *
 * This component owns no World clock and no semantic interpretation. It reacts only
 * to a private resident percept that already passed World hearing/identity rules.
 * When a normal causal run currently owns the body it opens a bounded local contact
 * matter, suspends the exact old matter/run, acknowledges the speaker, then restores
 * the exact same binding. Higher cognition may independently interpret the speech into
 * a durable commitment; ordinary newly admitted matters remain deferred while this
 * interruption owns the body.
 */
export class ResidentAddressedInterruptionController {
  private readonly handledPerceptIds = new Set<string>();
  private readonly responseText: string;
  private readonly holdTicks: number;
  private lastPerceptionRevision = -1;
  private active: ActiveInterruption | null = null;

  constructor(
    private readonly life: ResidentCausalLifeSubstrate,
    options: ResidentAddressedInterruptionOptions = {},
  ) {
    this.responseText = options.responseText ?? DEFAULT_RESPONSE_TEXT;
    this.holdTicks = options.holdTicks ?? DEFAULT_HOLD_TICKS;
    if (this.responseText.trim().length === 0) {
      throw new Error("addressed interruption response text must be non-empty");
    }
    if (!Number.isSafeInteger(this.holdTicks) || this.holdTicks < 0) {
      throw new Error("addressed interruption holdTicks must be a non-negative safe integer");
    }
  }

  observePrivateAddressedSpeech(): ResidentAddressedInterruptionObservation {
    if (this.active) {
      return { status: "already_active", interruption: this.snapshot(this.active, "active") };
    }

    const perception = this.life.resident.perceptionSnapshot();
    if (perception.revision === this.lastPerceptionRevision) return { status: "none" };
    this.lastPerceptionRevision = perception.revision;

    for (const percept of perception.recentPercepts) {
      if (this.handledPerceptIds.has(percept.id)) continue;
      if (percept.phenomenon !== "speech" || !percept.addressed || !percept.text) continue;

      this.handledPerceptIds.add(percept.id);
      const focusedRunId = this.life.focus.focusedRun();
      if (!focusedRunId) {
        return { status: "heard_without_preemption", perceptId: percept.id };
      }

      const binding = this.life.kernel.runBinding(focusedRunId);
      const matter = binding ? this.life.kernel.matter(binding.matterId) : null;
      if (!binding
        || !matter
        || matter.status !== "active"
        || matter.activeRunId !== focusedRunId
        || !this.life.kernel.canRunMutateWorld(focusedRunId)) {
        return { status: "heard_without_preemption", perceptId: percept.id };
      }

      this.active = this.begin(percept, binding);
      return { status: "started", interruption: this.snapshot(this.active, "active") };
    }

    return { status: "none" };
  }

  advanceOneExecutionFrame(): ResidentAddressedInterruptionStep {
    const active = this.active;
    if (!active) return { status: "idle" };

    if (!active.responded) {
      const effects = [
        { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
        ...(active.addressedDirection
          ? [{ kind: "look" as const, direction: { ...active.addressedDirection } }]
          : []),
        {
          kind: "speech" as const,
          text: this.responseText,
          radius: this.life.resident.profile.hearingRadius,
          addressedActorIds: active.targetActorId ? [active.targetActorId] : [],
        },
      ];
      const applied = this.life.worldAuthority.apply({
        runId: active.interruptRunId,
        effects,
      });
      if (applied.status !== "applied") {
        throw new Error(`addressed interruption response failed: ${applied.status}`);
      }
      const response = applied.occurrences.find((occurrence) => occurrence.kind === "speech") ?? null;
      if (!response) throw new Error("addressed interruption response created no speech occurrence");
      active.responded = true;
      active.responseOccurrenceId = response.id;
      return { status: "responded", interruption: this.snapshot(active, "active") };
    }

    if (active.remainingHoldTicks > 0) {
      active.remainingHoldTicks -= 1;
      return { status: "holding", interruption: this.snapshot(active, "active") };
    }

    const outcome = this.life.kernel.reconcileRunOutcome({
      runId: active.interruptRunId,
      tick: this.life.world.tick,
      status: "succeeded",
      summary: `locally acknowledged contact/attention via ${active.responseOccurrenceId ?? "speech"}; addressed speech content remains semantically unsettled`,
    });
    if (outcome.status !== "recorded") {
      throw new Error("addressed interruption factual reconciliation failed");
    }
    this.life.kernel.resolveMatter(active.interruptMatterId);
    this.life.worldAuthority.enforceMotionAuthority();

    if (!this.life.kernel.resumeMatter(active.mainMatterId)) {
      throw new Error("addressed interruption failed to resume prior matter");
    }
    const restoredBinding = this.life.kernel.runBinding(active.mainRunId);
    if (JSON.stringify(restoredBinding) !== JSON.stringify(active.mainRunBinding)) {
      throw new Error("addressed interruption changed exact prior run binding");
    }
    const focus = this.life.arbitrator.restoreInterrupted(active.mainRunId);
    if (focus.status !== "acquired") {
      throw new Error(`addressed interruption failed to restore prior focus: ${focus.status}`);
    }
    this.life.worldAuthority.enforceMotionAuthority();

    const completed = this.snapshot(active, "completed");
    this.active = null;
    return { status: "resumed", interruption: completed };
  }

  current(): ResidentAddressedInterruptionSnapshot | null {
    return this.active ? this.snapshot(this.active, "active") : null;
  }

  private begin(percept: ResidentPercept, mainRunBinding: ResidentTaskRunBinding): ActiveInterruption {
    const suffix = percept.id;
    const interruptMatterId = `matter.${this.life.residentId}.contact-interrupt:${suffix}`;
    const interruptRunId = `run.${this.life.residentId}.contact-interrupt:${suffix}.semantic-1`;
    if (this.life.kernel.matter(interruptMatterId)) {
      throw new Error(`addressed interruption already exists: ${interruptMatterId}`);
    }

    const evidence = this.life.kernel.recordEvidence({
      id: `evidence.${this.life.residentId}.contact-interrupt:${suffix}`,
      tick: percept.tick,
      kind: "addressed_speech_contact",
      summary: `Physically heard addressed speech caused a brief local contact/attention acknowledgement only; semantic content remains for higher judgement: ${percept.text}`,
    });
    this.life.kernel.openMatter({
      id: interruptMatterId,
      originEvidenceId: evidence.id,
      semanticCourse: "briefly acknowledge the addressed speaker's contact/attention only; do not interpret, accept, decline or fulfill the speech content; then return to the exact interrupted matter",
    });
    this.life.kernel.bindRun({
      matterId: interruptMatterId,
      taskId: `task.${this.life.residentId}.contact-interrupt:${suffix}.semantic-1`,
      runId: interruptRunId,
    });
    this.life.matterScope.track(interruptMatterId);

    this.life.kernel.suspendMatter(mainRunBinding.matterId, interruptMatterId);
    const focus = this.life.arbitrator.claimInterruption(interruptRunId);
    if (focus.status !== "acquired") {
      throw new Error(`addressed interruption failed to acquire body: ${focus.status}`);
    }
    this.life.worldAuthority.enforceMotionAuthority();

    return {
      originPerceptId: percept.id,
      addressedDirection: percept.spatial.kind === "directional"
        && Math.hypot(percept.spatial.direction.x, percept.spatial.direction.y) > 1e-9
        ? { ...percept.spatial.direction }
        : null,
      targetActorId: percept.actorId,
      interruptMatterId,
      interruptRunId,
      mainMatterId: mainRunBinding.matterId,
      mainRunId: mainRunBinding.runId,
      mainRunBinding: structuredClone(mainRunBinding),
      responseOccurrenceId: null,
      remainingHoldTicks: this.holdTicks,
      responded: false,
    };
  }

  private snapshot(
    active: ActiveInterruption,
    status: ResidentAddressedInterruptionSnapshot["status"],
  ): ResidentAddressedInterruptionSnapshot {
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
}
