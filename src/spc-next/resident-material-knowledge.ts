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
      this.known.set(objectId, {
        objectId,
        lastKnownPosition: { ...visiblePosition },
        observedAtTick: this.world.tick,
        currentlyVisible: true,
      });
    }

    return this.snapshot();
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
