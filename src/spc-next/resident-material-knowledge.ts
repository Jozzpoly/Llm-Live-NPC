import { distanceSquared, type Vec2 } from "./contracts";
import { SightGeometry } from "./sight-geometry";
import { SpcWorldRuntime } from "./spc-world-runtime";

export interface ResidentKnownMaterialObject {
  objectId: string;
  lastKnownPosition: Vec2;
  observedAtTick: number;
  currentlyVisible: boolean;
}

export interface ResidentMaterialCheckedAbsence {
  objectId: string;
  checkedPosition: Vec2;
  checkedAtTick: number;
}

/**
 * Minimal resident-private material knowledge for the first life slice.
 *
 * This is deliberately not inventory, object tracking or a general memory system.
 * It only remembers exact positions the resident actually acquired through sight
 * for specifically recognized material identities. Hidden World movement does not
 * rewrite the record. A recognized held object may be seen at the holder body's
 * position, but this projection deliberately does not expose holder identity.
 */
export class ResidentMaterialKnowledge {
  private readonly recognizedObjectIds: readonly string[];
  private readonly sight: SightGeometry;
  private readonly known = new Map<string, ResidentKnownMaterialObject>();
  /** Local percept-only availability transitions, not a second World store. */
  private visibleFreeObjectIds = new Set<string>();
  private newlyVisiblyFreeObjectIds = new Set<string>();

  constructor(
    readonly residentId: string,
    recognizedObjectIds: readonly string[],
    private readonly world: SpcWorldRuntime,
  ) {
    if (!residentId.trim()) throw new Error("material knowledge residentId must be non-empty");
    this.recognizedObjectIds = [...new Set(recognizedObjectIds.map((id) => id.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    this.sight = new SightGeometry(this.world.options.sightBlockers ?? []);
  }

  sample(): ResidentKnownMaterialObject[] {
    const snapshot = this.world.publicSnapshot();
    const observer = snapshot.actors.find((actor) => actor.id === this.residentId);
    if (!observer) throw new Error(`material knowledge resident actor missing: ${this.residentId}`);

    const previouslyFree = this.visibleFreeObjectIds;
    this.visibleFreeObjectIds = new Set();
    // Pending transitions persist across multiple observations until local
    // relevance consumes them, not just until the next arbitrary sample().
    for (const known of this.known.values()) known.currentlyVisible = false;

    for (const objectId of this.recognizedObjectIds) {
      const object = this.world.materialObject(objectId);
      if (!object) continue;
      const visiblePosition = object.location.kind === "free"
        ? object.location.position
        : snapshot.actors.find((actor) => actor.id === object.location.actorId)?.position ?? null;
      if (!visiblePosition) continue;
      if (distanceSquared(observer.position, visiblePosition) > observer.sightRadius ** 2) continue;
      if (!this.sight.hasLineOfSight(observer.position, visiblePosition)) continue;
      const previouslyKnown = this.known.has(objectId);
      this.known.set(objectId, {
        objectId,
        lastKnownPosition: { ...visiblePosition },
        observedAtTick: this.world.tick,
        currentlyVisible: true,
      });
      if (object.location.kind === "free") {
        this.visibleFreeObjectIds.add(objectId);
        // First EVER sight is knowledge acquisition, not a renewed opportunity.
        if (previouslyKnown && !previouslyFree.has(objectId)) {
          this.newlyVisiblyFreeObjectIds.add(objectId);
        }
      }
    }

    // No pending opportunity may survive losing sight or somebody taking it.
    for (const objectId of this.newlyVisiblyFreeObjectIds) {
      if (!this.visibleFreeObjectIds.has(objectId)) {
        this.newlyVisiblyFreeObjectIds.delete(objectId);
      }
    }
    return this.snapshot();
  }

  /**
   * A narrow resident-private physical affordance: the recognized material
   * is currently, freshly VISIBLE and lies free in World space. This does not
   * reveal any hidden holder or hidden current material location.
   */
  visiblyFree(objectId: string): boolean {
    const observation = this.known.get(objectId);
    if (!observation?.currentlyVisible || observation.observedAtTick !== this.world.tick) return false;
    return this.visibleFreeObjectIds.has(objectId);
  }

  /** Free material just became privately available, including held -> placed within sight. */
  becameVisiblyFree(objectId: string): boolean {
    return this.visiblyFree(objectId) && this.newlyVisiblyFreeObjectIds.delete(objectId);
  }

  lastKnownPosition(objectId: string): Vec2 | null {
    const known = this.known.get(objectId);
    return known ? { ...known.lastKnownPosition } : null;
  }

  observation(objectId: string): ResidentKnownMaterialObject | null {
    const known = this.known.get(objectId);
    return known ? structuredClone(known) : null;
  }

  /**
   * Checked absence is strictly local epistemic evidence: the resident can inspect
   * the last-known point now and the recognized object is not currently visible
   * there. It says nothing about whether the object exists elsewhere.
   */
  checkedAbsence(objectId: string): ResidentMaterialCheckedAbsence | null {
    const known = this.known.get(objectId);
    if (!known || known.currentlyVisible) return null;
    const snapshot = this.world.publicSnapshot();
    const observer = snapshot.actors.find((actor) => actor.id === this.residentId);
    if (!observer) throw new Error(`material knowledge resident actor missing: ${this.residentId}`);
    if (distanceSquared(observer.position, known.lastKnownPosition) > observer.sightRadius ** 2) return null;
    if (!this.sight.hasLineOfSight(observer.position, known.lastKnownPosition)) return null;
    return {
      objectId,
      checkedPosition: { ...known.lastKnownPosition },
      checkedAtTick: this.world.tick,
    };
  }

  snapshot(): ResidentKnownMaterialObject[] {
    return [...this.known.values()]
      .sort((a, b) => a.objectId.localeCompare(b.objectId))
      .map((entry) => structuredClone(entry));
  }
}
