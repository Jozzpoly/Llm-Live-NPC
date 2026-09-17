import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import type { ResidentActivity, Vec2 } from "./contracts";
import type { RegionNavigationGraph } from "./region-navigation";

export interface CognitionGroundingView {
  residentId: string;
  tick: number;
  currentPosition: Vec2;
  currentRegionId: string | null;
  context: ResidentCognitionContext;
}

export type CognitionGroundingResult =
  | { kind: "keep" }
  | { kind: "set_activity"; activity: ResidentActivity }
  | { kind: "rejected"; reason: string };

export class CognitionGrounder {
  private sequence = 0;

  constructor(private readonly navigation: RegionNavigationGraph) {}

  ground(proposal: ResidentCognitionProposal, view: CognitionGroundingView): CognitionGroundingResult {
    const directive = proposal.activityDirective;
    if (directive.kind === "keep") return { kind: "keep" };
    if (directive.kind === "stop") {
      return {
        kind: "set_activity",
        activity: this.activity(view, "idle", directive.reason, null, null, null),
      };
    }

    const proposed = directive.activity;
    const reason = `${directive.reason} · ${proposed.goal}`;
    if (proposed.kind === "idle") {
      return {
        kind: "set_activity",
        activity: this.activity(view, proposed.kind, reason, null, null, null),
      };
    }

    if (proposed.kind === "follow" || proposed.kind === "communicate") {
      const targetId = proposed.targetActorId;
      const known = view.context.knownActors.find((actor) => actor.id === targetId);
      if (!targetId || !known) return { kind: "rejected", reason: "target_actor_unknown" };
      const hasDirectionalCue = Boolean(known.lastHeardDirection && known.lastHeardDistanceBand && known.lastHeardTick !== null);
      if (!known.lastKnownPosition && !hasDirectionalCue) {
        return { kind: "rejected", reason: "target_actor_has_no_grounded_contact_evidence" };
      }
      return {
        kind: "set_activity",
        activity: this.activity(
          view,
          proposed.kind,
          reason,
          targetId,
          known.lastKnownPosition,
          proposed.kind === "communicate" ? proposed.text : null,
        ),
      };
    }

    if (proposed.targetRegionId) {
      if (!view.currentRegionId) return { kind: "rejected", reason: "resident_has_no_current_region" };
      const destination = this.navigation.destinationPoint(proposed.targetRegionId);
      if (!destination) return { kind: "rejected", reason: "target_region_has_no_navigation_destination" };
      const physicalRoute = this.navigation.route(view.currentRegionId, proposed.targetRegionId);
      if (!physicalRoute) return { kind: "rejected", reason: "target_region_unreachable" };
      const knownRegionIds = new Set(view.context.knownRegions.map((region) => region.id));
      knownRegionIds.add(view.currentRegionId);
      const knownRoute = this.navigation.route(view.currentRegionId, proposed.targetRegionId, knownRegionIds);
      if (!knownRoute) return { kind: "rejected", reason: "target_region_route_not_known" };
      const routeWaypoints = knownRoute.waypoints.length > 0
        ? knownRoute.waypoints.slice(0, -1)
        : [];
      return {
        kind: "set_activity",
        activity: {
          ...this.activity(view, proposed.kind, reason, null, destination, null),
          routeWaypoints,
        },
      };
    }

    if (proposed.targetPosition) {
      return {
        kind: "set_activity",
        activity: this.activity(view, proposed.kind, reason, null, proposed.targetPosition, null),
      };
    }

    return { kind: "rejected", reason: "proposal_has_no_groundable_target" };
  }

  private activity(
    view: CognitionGroundingView,
    kind: ResidentActivity["kind"],
    reason: string,
    targetActorId: string | null,
    targetPosition: Vec2 | null,
    text: string | null,
  ): ResidentActivity {
    return {
      id: `activity:${view.residentId}:cognition:${view.tick}:${this.sequence++}`,
      kind,
      targetActorId,
      targetPosition: targetPosition ? { ...targetPosition } : null,
      text,
      speed: null,
      reason,
    };
  }
}
