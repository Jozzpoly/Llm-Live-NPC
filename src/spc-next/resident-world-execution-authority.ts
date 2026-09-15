import type { Vec2, WorldOccurrence } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentWorldEffect =
  | { kind: "motion"; desiredVelocity: Vec2 }
  | { kind: "speech"; text: string; radius: number; addressedActorIds: readonly string[] };

export interface ResidentWorldExecutionFrame {
  runId: string;
  effects: readonly ResidentWorldEffect[];
}

export type ResidentWorldExecutionResult =
  | {
      status: "applied";
      runId: string;
      appliedEffects: readonly ResidentWorldEffect["kind"][];
      occurrences: readonly WorldOccurrence[];
    }
  | {
      status: "rejected";
      runId: string;
      reason: "invalid_frame" | "run_not_authorized";
    }
  | {
      status: "interrupted";
      runId: string;
      appliedEffects: readonly ResidentWorldEffect["kind"][];
      reason: "run_authority_lost";
      occurrences: readonly WorldOccurrence[];
    };

/**
 * First SPC Next execution-authority seam between a resident-owned task run and
 * real World mutation APIs.
 *
 * This is deliberately not yet the only path into SpcWorldRuntime. K5a proves
 * exact run gating and latched-motion revocation for the new path. K5b must
 * migrate resident runtime effects onto this path and close legacy bypasses.
 */
export class ResidentWorldExecutionAuthority {
  private motionOwnerRunId: string | null = null;

  constructor(
    readonly residentId: string,
    private readonly kernel: ResidentContinuityKernel,
    private readonly world: SpcWorldRuntime,
  ) {
    if (residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === residentId);
    if (!actor || actor.kind !== "resident") throw new Error(`resident actor does not exist: ${residentId}`);
  }

  apply(frame: ResidentWorldExecutionFrame): ResidentWorldExecutionResult {
    const validated = validateFrame(frame, this.world);
    if (!validated) {
      return { status: "rejected", runId: frame.runId, reason: "invalid_frame" };
    }
    if (!this.kernel.canRunMutateWorld(frame.runId)) {
      return { status: "rejected", runId: frame.runId, reason: "run_not_authorized" };
    }

    const appliedEffects: ResidentWorldEffect["kind"][] = [];
    const occurrences: WorldOccurrence[] = [];

    for (const effect of validated.effects) {
      if (!this.kernel.canRunMutateWorld(frame.runId)) {
        return {
          status: "interrupted",
          runId: frame.runId,
          appliedEffects,
          reason: "run_authority_lost",
          occurrences,
        };
      }

      if (effect.kind === "motion") {
        this.world.setActorMotionIntent(this.residentId, effect.desiredVelocity);
        this.motionOwnerRunId = frame.runId;
      } else {
        occurrences.push(this.world.speak(
          this.residentId,
          effect.text,
          effect.radius,
          effect.addressedActorIds,
        ));
      }
      appliedEffects.push(effect.kind);
    }

    return {
      status: "applied",
      runId: frame.runId,
      appliedEffects,
      occurrences,
    };
  }

  /**
   * Revokes a latched motion intent as soon as the run that owns it loses
   * semantic/execution authority. K5b must call this from the World execution
   * phase before physical integration; callers should not rely on occasional
   * brain ticks to stop stale movement.
   */
  enforceMotionAuthority(): { status: "unchanged" } | { status: "revoked"; runId: string } {
    const runId = this.motionOwnerRunId;
    if (!runId || this.kernel.canRunMutateWorld(runId)) return { status: "unchanged" };
    this.world.setActorMotionIntent(this.residentId, { x: 0, y: 0 });
    this.motionOwnerRunId = null;
    return { status: "revoked", runId };
  }

  motionOwner(): string | null {
    return this.motionOwnerRunId;
  }
}

function validateFrame(
  frame: ResidentWorldExecutionFrame,
  world: SpcWorldRuntime,
): ResidentWorldExecutionFrame | null {
  if (typeof frame.runId !== "string" || frame.runId.trim().length === 0) return null;
  if (!Array.isArray(frame.effects) || frame.effects.length === 0) return null;

  const actorIds = new Set(world.publicSnapshot().actors.map((actor) => actor.id));
  const seenKinds = new Set<ResidentWorldEffect["kind"]>();
  const effects: ResidentWorldEffect[] = [];

  for (const effect of frame.effects) {
    if (seenKinds.has(effect.kind)) return null;
    seenKinds.add(effect.kind);

    if (effect.kind === "motion") {
      if (!isFiniteVec2(effect.desiredVelocity)) return null;
      effects.push({ kind: "motion", desiredVelocity: { ...effect.desiredVelocity } });
      continue;
    }

    if (typeof effect.text !== "string" || effect.text.trim().length === 0) return null;
    if (!Number.isFinite(effect.radius) || effect.radius < 0) return null;
    const addressed = [...new Set<string>(effect.addressedActorIds)];
    if (addressed.some((id) => id.trim().length === 0 || !actorIds.has(id))) return null;
    effects.push({
      kind: "speech",
      text: effect.text.trim(),
      radius: effect.radius,
      addressedActorIds: addressed,
    });
  }

  return { runId: frame.runId, effects };
}

function isFiniteVec2(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}
