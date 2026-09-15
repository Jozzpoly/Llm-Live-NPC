import type {
  ResidentDiagnostics,
  ResidentPublicState,
  Vec2,
  WorldPublicSnapshot,
} from "../spc-next/contracts";

export interface EpistemicActorMarker {
  actorId: string;
  lastKnownPosition: Vec2;
  lastObservedTick: number;
  currentlyVisible: boolean;
}

export interface DirectionalHearingMarker {
  actorId: string | null;
  tick: number;
  direction: Vec2;
  distanceBand: "near" | "mid" | "far";
  summary: string;
}

export function projectEpistemicActors(diagnostics: ResidentDiagnostics): EpistemicActorMarker[] {
  const markers = new Map<string, EpistemicActorMarker>();

  for (const percept of diagnostics.recentPercepts) {
    const actorId = percept.actorId;
    if (!actorId) continue;
    if (percept.phenomenon === "actor_sight_enter" || percept.phenomenon === "actor_sight_update") {
      if (percept.spatial.kind !== "exact") continue;
      markers.set(actorId, {
        actorId,
        lastKnownPosition: { ...percept.spatial.position },
        lastObservedTick: percept.tick,
        currentlyVisible: true,
      });
      continue;
    }
    if (percept.phenomenon === "actor_sight_exit") {
      const previous = markers.get(actorId);
      if (previous) markers.set(actorId, { ...previous, currentlyVisible: false });
    }
  }

  return [...markers.values()].sort((a, b) => a.actorId.localeCompare(b.actorId));
}

export function projectRecentDirectionalHearing(
  diagnostics: ResidentDiagnostics,
  limit = 4,
): DirectionalHearingMarker[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("hearing marker limit must be a non-negative integer");
  return diagnostics.recentPercepts
    .filter((percept) => percept.modality === "hearing" && percept.spatial.kind === "directional")
    .slice(-limit)
    .reverse()
    .map((percept) => {
      if (percept.spatial.kind !== "directional") throw new Error("directional percept projection invariant failed");
      return {
        actorId: percept.actorId,
        tick: percept.tick,
        direction: { ...percept.spatial.direction },
        distanceBand: percept.spatial.distanceBand,
        summary: percept.summary,
      };
    });
}

export function resolveActivityTarget(
  snapshot: WorldPublicSnapshot,
  resident: ResidentPublicState,
): Vec2 | null {
  if (resident.activity.targetActorId) {
    const target = snapshot.actors.find((actor) => actor.id === resident.activity.targetActorId);
    return target ? { ...target.position } : null;
  }
  return resident.activity.targetPosition ? { ...resident.activity.targetPosition } : null;
}
