import type { Vec2 } from "../spc-next/contracts";
import type { ResidentContinuityKernel } from "../spc-next/resident-continuity-kernel";
import type { SpcWorldRuntime } from "../spc-next/spc-world-runtime";

export type MaterialProgressRelation =
  | "free_elsewhere"
  | "held_by_resident"
  | "held_by_other"
  | "delivered"
  | "missing";

export interface MaterialProgressWitness {
  tick: number;
  relation: MaterialProgressRelation;
  carrierId: string | null;
  residentDistanceToDestination: number | null;
  objectDistanceToDestination: number | null;
  delivered: boolean;
}

export interface MaterialProgressContext {
  matterStatus: string | null;
  semanticRevision: number | null;
  semanticCourse: string | null;
}

export interface MaterialProgressObservation {
  /** External/World-grounded evidence. Only this surface is progress evidence. */
  witness: MaterialProgressWitness;
  /** Resident semantic context for comparison only; it is not progress by itself. */
  semanticContext: MaterialProgressContext;
}

/**
 * Research-only material progress projection.
 *
 * It intentionally refuses to scalarize progress. The witness is grounded in
 * authoritative actor/material World truth. Resident semantic revision/course are
 * returned only as adjacent context so an Observatory can detect semantic churn
 * without accidentally counting churn as physical progress.
 */
export function observeMaterialProgress(
  world: SpcWorldRuntime,
  kernel: ResidentContinuityKernel,
  input: {
    residentId: string;
    matterId: string;
    objectId: string;
    destination: Vec2;
    deliveryTolerance?: number;
  },
): MaterialProgressObservation {
  const tolerance = input.deliveryTolerance ?? 1;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("deliveryTolerance must be finite and non-negative");
  }

  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === input.residentId) ?? null;
  const object = world.materialObject(input.objectId);
  const matter = kernel.matter(input.matterId);

  let relation: MaterialProgressRelation = "missing";
  let carrierId: string | null = null;
  let objectDistanceToDestination: number | null = null;
  let delivered = false;

  if (object?.location.kind === "held") {
    carrierId = object.location.actorId;
    relation = carrierId === input.residentId ? "held_by_resident" : "held_by_other";
  } else if (object?.location.kind === "free") {
    objectDistanceToDestination = distance(object.location.position, input.destination);
    delivered = objectDistanceToDestination <= tolerance;
    relation = delivered ? "delivered" : "free_elsewhere";
  }

  return {
    witness: {
      tick: world.tick,
      relation,
      carrierId,
      residentDistanceToDestination: actor ? distance(actor.position, input.destination) : null,
      objectDistanceToDestination,
      delivered,
    },
    semanticContext: {
      matterStatus: matter?.status ?? null,
      semanticRevision: matter?.semanticRevision ?? null,
      semanticCourse: matter?.semanticCourse ?? null,
    },
  };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
