import type {
  KnownActorContext,
  KnownRegionContext,
  ResidentBeliefState,
  ResidentCognitionContext,
  ResidentConcernState,
} from "./cognition-contract";
import type {
  CognitionReason,
  ResidentActivity,
  ResidentPercept,
} from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";

/**
 * Transitional higher-cognition input for the recovered resident-life architecture.
 *
 * `localActivity` is intentionally named as a local-brain projection. It is NOT
 * presented as the resident's complete current bodily/semantic truth. `life` is the
 * resident-owned continuing-matter + exact-run projection and is authoritative for
 * those recovered domains.
 *
 * This type is currently a local deterministic contract. It is not yet accepted by
 * the live worker endpoint; provider transport must earn its own strict sanitizer
 * and stale-admission tests before promotion.
 */
export interface ResidentLifeCognitionContext {
  contract: "resident_life_cognition_v1";
  resident: { id: string; name: string };
  tick: number;
  currentRegionId: string | null;
  reasons: readonly CognitionReason[];
  localActivity: ResidentActivity;
  recentPercepts: readonly ResidentPercept[];
  concerns: readonly ResidentConcernState[];
  beliefs: readonly ResidentBeliefState[];
  knownActors: readonly KnownActorContext[];
  knownRegions: readonly KnownRegionContext[];
  life: ResidentLifeCognitionView;
}

export function composeResidentLifeCognitionContext(
  privateContext: ResidentCognitionContext,
  life: ResidentLifeCognitionView,
): ResidentLifeCognitionContext {
  return {
    contract: "resident_life_cognition_v1",
    resident: structuredClone(privateContext.resident),
    tick: privateContext.tick,
    currentRegionId: privateContext.currentRegionId,
    reasons: structuredClone(privateContext.reasons),
    localActivity: structuredClone(privateContext.currentActivity),
    recentPercepts: structuredClone(privateContext.recentPercepts),
    concerns: structuredClone(privateContext.concerns),
    beliefs: structuredClone(privateContext.beliefs),
    knownActors: structuredClone(privateContext.knownActors),
    knownRegions: structuredClone(privateContext.knownRegions),
    life: structuredClone(life),
  };
}
