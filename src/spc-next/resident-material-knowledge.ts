import { distanceSquared, type Vec2 } from "./contracts";
import { SightGeometry } from "./sight-geometry";
import { SpcWorldRuntime } from "./spc-world-runtime";

export interface ResidentKnownMaterialObject {
  objectId: string;
  lastKnownPosition: Vec2;
  observedAtTick: number;
  currentlyVisible: boolean;
}

/**
 * Minimal resident-private material knowledge for the first life slice.
 *
 * This is deliberately not inventory, object tracking or a general memory system.
 * It only remembers exact positions the resident actually acquired through sight
 * for specifically recognized material identities. Hidden World movement does not
 * rewrite the record.
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
      if (!object || object.location.kind !== "free") continue;
      if (distanceSquared(observer.position, object.location.position) > observer.sightRadius ** 2) continue;
      if (!this.sight.hasLineOfSight(observer.position, object.location.position)) continue;
      this.known.set(objectId, {
        objectId,
        lastKnownPosition: { ...object.location.position },
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

  snapshot(): ResidentKnownMaterialObject[] {
    return [...this.known.values()]
      .sort((a, b) => a.objectId.localeCompare(b.objectId))
      .map((entry) => structuredClone(entry));
  }
}
