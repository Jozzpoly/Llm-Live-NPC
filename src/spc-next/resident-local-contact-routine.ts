import type { ResidentPercept, Vec2 } from "./contracts";
import { deriveSpcIdentifier } from "./identity-contract";
import type {
  ResidentContinuityKernel,
  ResidentTaskRunBinding,
} from "./resident-continuity-kernel";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface ResidentLocalContactRoutineOptions {
  responseText: string;
  holdTicks: number;
  responseRadius?: number;
}

export interface ResidentLocalContactInterruptedExecution {
  matterId: string;
  runId: string;
}

export interface ResidentLocalContactSnapshot {
  status: "none" | "active" | "completed";
  perceptId: string | null;
  sourceActorId: string | null;
  direction: Vec2 | null;
  contactMatterId: string | null;
  contactRunId: string | null;
  interruptedMatterId: string | null;
  interruptedRunId: string | null;
  startedAtTick: number | null;
  responseTick: number | null;
  responseOccurrenceId: string | null;
  completedAtTick: number | null;
  remainingHoldTicks: number;
}

export type ResidentLocalContactStep =
  | { status: "responded"; snapshot: ResidentLocalContactSnapshot }
  | { status: "holding"; snapshot: ResidentLocalContactSnapshot }
  | { status: "completed"; snapshot: ResidentLocalContactSnapshot };

/**
 * Shared local competence for one already-classified addressed contact.
 *
 * This routine does not decide whether speech deserves attention and does not infer
 * semantic acceptance/refusal. Its bounded job is physical/social micro-behavior:
 * stop, orient from private hearing evidence when available, acknowledge contact,
 * hold briefly, then restore the exact interrupted run if one existed.
 *
 * Because the response is only contact acknowledgement, it must never be treated as
 * semantic handling of the speech content.
 */
export class ResidentLocalContactRoutine {
  private sequence = 0;
  private activeState: ActiveLocalContact | null = null;
  private completedState: ResidentLocalContactSnapshot | null = null;

  constructor(
    readonly residentId: string,
    private readonly kernel: ResidentContinuityKernel,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly options: ResidentLocalContactRoutineOptions,
  ) {
    if (!residentId.trim()) throw new Error("local contact residentId must be non-empty");
    if (!options.responseText.trim()) throw new Error("local contact responseText must be non-empty");
    if (!Number.isSafeInteger(options.holdTicks) || options.holdTicks < 0) {
      throw new Error("local contact holdTicks must be a non-negative safe integer");
    }
    if (options.responseRadius !== undefined
      && (!Number.isFinite(options.responseRadius) || options.responseRadius <= 0)) {
      throw new Error("local contact responseRadius must be positive and finite");
    }
  }

  active(): boolean {
    return this.activeState !== null;
  }

  snapshot(): ResidentLocalContactSnapshot {
    if (this.activeState) return snapshotActive(this.activeState, "active");
    return this.completedState
      ? structuredClone(this.completedState)
      : emptySnapshot();
  }

  begin(
    percept: ResidentPercept,
    interrupted: ResidentLocalContactInterruptedExecution | null = null,
  ): ResidentLocalContactSnapshot {
    if (this.activeState) throw new Error("local contact routine already active");
    if (percept.phenomenon !== "speech"
      || percept.modality !== "hearing"
      || !percept.addressed
      || !percept.text) {
      throw new Error("local contact requires addressed heard speech with text");
    }

    let interruptedBinding: ResidentTaskRunBinding | null = null;
    if (interrupted) {
      const matter = this.kernel.matter(interrupted.matterId);
      if (!matter || matter.status !== "active" || matter.activeRunId !== interrupted.runId) {
        throw new Error("local contact interrupted execution is not an active exact matter/run");
      }
      interruptedBinding = this.kernel.runBinding(interrupted.runId);
      if (!interruptedBinding || interruptedBinding.matterId !== interrupted.matterId) {
        throw new Error("local contact interrupted run binding missing");
      }
    }

    const sequence = this.sequence++;
    const source = `${this.residentId}:${percept.id}`;
    const evidenceId = deriveSpcIdentifier("evidence-local-contact", source, String(sequence));
    const contactMatterId = deriveSpcIdentifier("matter-local-contact", source, String(sequence));
    const contactTaskId = deriveSpcIdentifier("task-local-contact", source, String(sequence));
    const contactRunId = deriveSpcIdentifier("run-local-contact", source, String(sequence));

    const evidence = this.kernel.recordEvidence({
      id: evidenceId,
      tick: percept.tick,
      kind: "local_addressed_contact",
      summary: `Locally noticed addressed speech: ${percept.text}`,
    });
    this.kernel.openMatter({
      id: contactMatterId,
      originEvidenceId: evidence.id,
      semanticCourse: "briefly acknowledge addressed contact without claiming semantic handling",
    });
    this.kernel.bindRun({
      matterId: contactMatterId,
      taskId: contactTaskId,
      runId: contactRunId,
    });

    if (interrupted) {
      this.kernel.suspendMatter(interrupted.matterId, contactMatterId);
      this.authority.enforceMotionAuthority();
      if (this.kernel.canRunMutateWorld(interrupted.runId)) {
        throw new Error("local contact failed to suspend interrupted run authority");
      }
    }

    this.activeState = {
      perceptId: percept.id,
      sourceActorId: percept.actorId,
      direction: percept.spatial.kind === "directional"
        && Math.hypot(percept.spatial.direction.x, percept.spatial.direction.y) > 1e-9
        ? { ...percept.spatial.direction }
        : null,
      contactMatterId,
      contactRunId,
      interruptedMatterId: interrupted?.matterId ?? null,
      interruptedRunId: interrupted?.runId ?? null,
      interruptedBinding,
      startedAtTick: this.world.tick,
      responseTick: null,
      responseOccurrenceId: null,
      completedAtTick: null,
      remainingHoldTicks: this.options.holdTicks,
      responded: false,
    };
    this.completedState = null;
    return this.snapshot();
  }

  step(): ResidentLocalContactStep {
    const active = this.activeState;
    if (!active) throw new Error("local contact routine is not active");

    if (!active.responded) {
      const effects = [
        { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
        ...(active.direction
          ? [{ kind: "look" as const, direction: { ...active.direction } }]
          : []),
        {
          kind: "speech" as const,
          text: this.options.responseText,
          radius: this.options.responseRadius ?? 420,
          addressedActorIds: active.sourceActorId ? [active.sourceActorId] : [],
        },
      ];
      const applied = this.authority.apply({
        runId: active.contactRunId,
        effects,
      });
      if (applied.status !== "applied") {
        throw new Error(`local contact response execution failed: ${applied.status}`);
      }
      const speech = applied.occurrences.find((occurrence) => occurrence.kind === "speech");
      if (!speech) throw new Error("local contact response produced no factual speech");
      active.responded = true;
      active.responseTick = this.world.tick;
      active.responseOccurrenceId = speech.id;
      return { status: "responded", snapshot: this.snapshot() };
    }

    if (active.remainingHoldTicks > 0) {
      active.remainingHoldTicks -= 1;
      return { status: "holding", snapshot: this.snapshot() };
    }

    const reconciled = this.kernel.reconcileRunOutcome({
      runId: active.contactRunId,
      tick: this.world.tick,
      status: "succeeded",
      summary: `locally acknowledged addressed contact via ${active.responseOccurrenceId ?? "speech"}`,
    });
    if (reconciled.status !== "recorded") {
      throw new Error("local contact outcome did not reconcile");
    }
    this.kernel.resolveMatter(active.contactMatterId);
    this.authority.enforceMotionAuthority();

    if (active.interruptedMatterId && active.interruptedRunId) {
      if (!this.kernel.resumeMatter(active.interruptedMatterId)) {
        throw new Error("local contact could not resume interrupted matter");
      }
      const restored = this.kernel.runBinding(active.interruptedRunId);
      if (JSON.stringify(restored) !== JSON.stringify(active.interruptedBinding)) {
        throw new Error("local contact changed exact interrupted run binding");
      }
      if (!this.kernel.canRunMutateWorld(active.interruptedRunId)) {
        throw new Error("local contact did not restore interrupted run authority");
      }
    }

    active.completedAtTick = this.world.tick;
    this.completedState = snapshotActive(active, "completed");
    this.activeState = null;
    return { status: "completed", snapshot: structuredClone(this.completedState) };
  }
}

interface ActiveLocalContact {
  perceptId: string;
  sourceActorId: string | null;
  direction: Vec2 | null;
  contactMatterId: string;
  contactRunId: string;
  interruptedMatterId: string | null;
  interruptedRunId: string | null;
  interruptedBinding: ResidentTaskRunBinding | null;
  startedAtTick: number;
  responseTick: number | null;
  responseOccurrenceId: string | null;
  completedAtTick: number | null;
  remainingHoldTicks: number;
  responded: boolean;
}

function emptySnapshot(): ResidentLocalContactSnapshot {
  return {
    status: "none",
    perceptId: null,
    sourceActorId: null,
    direction: null,
    contactMatterId: null,
    contactRunId: null,
    interruptedMatterId: null,
    interruptedRunId: null,
    startedAtTick: null,
    responseTick: null,
    responseOccurrenceId: null,
    completedAtTick: null,
    remainingHoldTicks: 0,
  };
}

function snapshotActive(
  active: ActiveLocalContact,
  status: "active" | "completed",
): ResidentLocalContactSnapshot {
  return {
    status,
    perceptId: active.perceptId,
    sourceActorId: active.sourceActorId,
    direction: active.direction ? { ...active.direction } : null,
    contactMatterId: active.contactMatterId,
    contactRunId: active.contactRunId,
    interruptedMatterId: active.interruptedMatterId,
    interruptedRunId: active.interruptedRunId,
    startedAtTick: active.startedAtTick,
    responseTick: active.responseTick,
    responseOccurrenceId: active.responseOccurrenceId,
    completedAtTick: active.completedAtTick,
    remainingHoldTicks: active.remainingHoldTicks,
  };
}
