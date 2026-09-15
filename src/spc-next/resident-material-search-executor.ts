import { distanceSquared, normalizedDirection, type Vec2 } from "./contracts";
import type { ResidentKnownMaterialObject, ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentMaterialSearchStep =
  | {
      status: "running";
      runId: string;
      phase: "search";
      waypointIndex: number;
      waypoint: Vec2;
    }
  | {
      status: "found";
      runId: string;
      observation: ResidentKnownMaterialObject;
    }
  | {
      status: "exhausted";
      runId: string;
      searchedWaypointCount: number;
    }
  | { status: "authority_lost"; runId: string };

const DEFAULT_SEARCH_SPEED = 95;
const SEARCH_WAYPOINT_TOLERANCE = 10;

/**
 * Produce a deterministic body-scale search ring around resident-owned remembered
 * evidence. The helper knows nothing about current object truth or World material
 * locations; callers remain responsible for choosing a semantically valid radius.
 *
 * The east-first ordering is deterministic only. It is not target steering: every
 * caller with the same remembered origin receives the same plan regardless of where
 * the object actually is now.
 */
export function radialMaterialSearchWaypoints(
  rememberedOrigin: Vec2,
  radius = 400,
  sectorCount = 8,
): Vec2[] {
  if (!Number.isFinite(rememberedOrigin.x) || !Number.isFinite(rememberedOrigin.y)) {
    throw new Error("material search remembered origin must be finite");
  }
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("material search radius must be positive and finite");
  if (!Number.isSafeInteger(sectorCount) || sectorCount < 4 || sectorCount > 32) {
    throw new Error("material search sectorCount must be an integer between 4 and 32");
  }

  const waypoints: Vec2[] = [];
  for (let index = 0; index < sectorCount; index += 1) {
    const angle = index * Math.PI * 2 / sectorCount;
    waypoints.push({
      x: rememberedOrigin.x + Math.cos(angle) * radius,
      y: rememberedOrigin.y + Math.sin(angle) * radius,
    });
  }
  return waypoints;
}

/**
 * Bounded local-brain search over an already-grounded physical plan.
 *
 * This executor deliberately has no access to current hidden material World truth.
 * It can move the resident through supplied search waypoints and can stop when the
 * resident-private material knowledge surface reports a legal sight acquisition.
 * It never issues a material action and never steers toward an unseen object.
 *
 * Choosing/grounding the search area is semantic/task authority and therefore lives
 * outside this executor. This class only owns embodied execution of that plan.
 */
export class ResidentMaterialSearchExecutor {
  private waypointIndex = 0;
  private terminal: ResidentMaterialSearchStep | null = null;
  private readonly waypoints: readonly Vec2[];

  constructor(
    readonly runId: string,
    readonly objectId: string,
    searchWaypoints: readonly Vec2[],
    private readonly knowledge: ResidentMaterialKnowledge,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly searchSpeed = DEFAULT_SEARCH_SPEED,
  ) {
    if (!runId.trim()) throw new Error("material search runId must be non-empty");
    if (!objectId.trim()) throw new Error("material search objectId must be non-empty");
    if (!Number.isFinite(searchSpeed) || searchSpeed <= 0) {
      throw new Error("material search speed must be positive and finite");
    }
    if (searchWaypoints.length === 0) throw new Error("material search requires at least one waypoint");
    this.waypoints = searchWaypoints.map((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error("material search waypoint must be finite");
      }
      return { ...point };
    });
  }

  step(): ResidentMaterialSearchStep {
    if (this.terminal) return structuredClone(this.terminal);

    const observation = this.knowledge.observation(this.objectId);
    if (observation?.currentlyVisible) {
      return this.finishFound(observation);
    }

    const actor = this.world.publicSnapshot().actors.find((candidate) => candidate.id === this.authority.residentId);
    if (!actor) return this.finishAuthorityLost();

    let waypoint = this.waypoints[this.waypointIndex] ?? null;
    while (waypoint && distanceSquared(actor.position, waypoint) <= SEARCH_WAYPOINT_TOLERANCE ** 2) {
      this.waypointIndex += 1;
      waypoint = this.waypoints[this.waypointIndex] ?? null;
    }

    if (!waypoint) {
      const stopped = this.authority.apply({
        runId: this.runId,
        effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
      });
      if (stopped.status !== "applied") return this.finishAuthorityLost();
      this.terminal = {
        status: "exhausted",
        runId: this.runId,
        searchedWaypointCount: this.waypoints.length,
      };
      return structuredClone(this.terminal);
    }

    const direction = normalizedDirection(actor.position, waypoint);
    const speed = Math.min(actor.maxSpeed, this.searchSpeed);
    const applied = this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: scale(direction, speed) }],
    });
    if (applied.status !== "applied") return this.finishAuthorityLost();

    return {
      status: "running",
      runId: this.runId,
      phase: "search",
      waypointIndex: this.waypointIndex,
      waypoint: { ...waypoint },
    };
  }

  private finishFound(observation: ResidentKnownMaterialObject): ResidentMaterialSearchStep {
    const stopped = this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
    });
    if (stopped.status !== "applied") return this.finishAuthorityLost();
    this.terminal = {
      status: "found",
      runId: this.runId,
      observation: structuredClone(observation),
    };
    return structuredClone(this.terminal);
  }

  private finishAuthorityLost(): ResidentMaterialSearchStep {
    this.terminal = { status: "authority_lost", runId: this.runId };
    return structuredClone(this.terminal);
  }
}

function scale(direction: Vec2, magnitude: number): Vec2 {
  return { x: direction.x * magnitude, y: direction.y * magnitude };
}
