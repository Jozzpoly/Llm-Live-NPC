import type { ResidentPercept } from "./contracts";

/**
 * World-side physical provenance entering a private resident boundary.
 * `sourceActorId` is NOT itself resident knowledge and must never be serialized
 * into cognition context merely because World knows which entity caused a signal.
 */
export interface ResidentPerceptIngress {
  percept: ResidentPercept;
  sourceActorId: string | null;
}

export type ResidentActorRecognition = (actorId: string) => boolean;

/**
 * Convert World provenance into the epistemically-safe percept the resident may
 * actually remember/reason from.
 *
 * Current minimal game rule:
 * - hearing alone never acquires identity;
 * - a previously recognized actor may be recognized again by voice;
 * - direct sight currently acquires actor identity. This is an explicit policy,
 *   not a claim that physical entity identity and recognized identity are the
 *   same concept; future social/appearance work may replace this sight rule.
 */
export function resolveResidentPerceptIdentity(
  ingress: ResidentPerceptIngress,
  recognizesActor: ResidentActorRecognition,
): ResidentPercept {
  const percept = structuredClone(ingress.percept);
  if (percept.actorId !== null) {
    throw new Error("World ingress percept must not pre-populate resident actor identity");
  }

  const sourceActorId = ingress.sourceActorId;
  const recognizedActorId = sourceActorId === null
    ? null
    : percept.modality === "sight"
      ? sourceActorId
      : recognizesActor(sourceActorId)
        ? sourceActorId
        : null;

  percept.actorId = recognizedActorId;
  if (isActorSightPhenomenon(percept.phenomenon)) {
    if (percept.subjectId !== null) {
      throw new Error("World actor-sight ingress must not pre-populate resident subject identity");
    }
    percept.subjectId = recognizedActorId;
  }
  return percept;
}

function isActorSightPhenomenon(phenomenon: ResidentPercept["phenomenon"]): boolean {
  return phenomenon === "actor_sight_enter"
    || phenomenon === "actor_sight_update"
    || phenomenon === "actor_sight_exit";
}
