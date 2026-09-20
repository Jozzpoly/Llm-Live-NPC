import type { ResidentPercept, Vec2, WorldOccurrence } from "./contracts";
import type { MaterialActionResult, MaterialObjectState } from "./material-world-state";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import {
  ResidentLocalContactRoutine,
  type ResidentLocalContactSnapshot,
  type ResidentLocalContactStep,
} from "./resident-local-contact-routine";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export const R4D_MIRA_ID = "resident.mira";
export const R4D_IDA_ID = "resident.ida";
export const R4D_MOVED_OBJECT_ID = "basket.r4d.background";
export const R4D_STABLE_OBJECT_A_ID = "crate.r4d.background";
export const R4D_STABLE_OBJECT_B_ID = "stool.r4d.background";
export const R4D_MOVED_OBJECT_START = Object.freeze({ x: 900, y: 530 });
export const R4D_MOVED_OBJECT_END = Object.freeze({ x: 930, y: 530 });

const CONTACT_RESPONSE = "Tak?";
const CONTACT_HOLD_TICKS = 12;
const LOCAL_RADIUS = 420;

export interface R4DMovedBackgroundResult {
  pickup: MaterialActionResult;
  place: MaterialActionResult;
  interaction: WorldOccurrence;
  percept: ResidentPercept;
}

export interface R4DIdaSpeechResult {
  occurrence: WorldOccurrence;
  percept: ResidentPercept;
}

export interface R4DIdaContactResult extends R4DIdaSpeechResult {
  contact: ResidentLocalContactSnapshot;
}

/**
 * R4-D ordinary-life negative-capability specimen.
 *
 * Mira begins with no authored chore queue. Several material facts and another
 * resident are physically present inside one compact causal space. The specimen
 * pressures the opposite failure mode from Janek R4-B/C:
 *
 *   affordance availability != resident significance != resident demand.
 *
 * Background material change, interaction and ambient speech must remain truthful
 * private evidence without manufacturing a Mira matter or semantic pressure.
 *
 * A later physically hearable addressed contact from Ida is allowed to cross the
 * relevance boundary. Existing shared local-contact competence may acknowledge it,
 * but must not pretend that bodily acknowledgement semantically handled arbitrary
 * speech content. The addressed semantic reason therefore remains explicit for a
 * later R5-facing decision while Mira's body returns to idle.
 *
 * No provider host exists in this composition.
 */
export function createR4MiraOrdinaryLifeSlice() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 1_000 },
    regions: [{
      id: "r4d-common-room",
      label: "R4-D Common Room",
      minX: 0,
      minY: 0,
      maxX: 1_600,
      maxY: 1_000,
    }],
    anchors: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });

  const mira = world.addResident(R4D_MIRA_ID, "Mira", { x: 700, y: 500 });
  world.addResident(R4D_IDA_ID, "Ida", { x: 900, y: 500 });
  world.familiarizeResidentWithRegions(R4D_MIRA_ID, ["r4d-common-room"]);
  world.familiarizeResidentWithRegions(R4D_IDA_ID, ["r4d-common-room"]);

  const objects: MaterialObjectState[] = [
    {
      id: R4D_MOVED_OBJECT_ID,
      label: "Background Basket",
      radius: 18,
      location: { kind: "free", position: { ...R4D_MOVED_OBJECT_START } },
    },
    {
      id: R4D_STABLE_OBJECT_A_ID,
      label: "Background Crate",
      radius: 18,
      location: { kind: "free", position: { x: 760, y: 420 } },
    },
    {
      id: R4D_STABLE_OBJECT_B_ID,
      label: "Background Stool",
      radius: 18,
      location: { kind: "free", position: { x: 780, y: 610 } },
    },
  ];
  for (const object of objects) world.addMaterialObject(object);

  const knowledge = new ResidentMaterialKnowledge(
    R4D_MIRA_ID,
    [R4D_MOVED_OBJECT_ID, R4D_STABLE_OBJECT_A_ID, R4D_STABLE_OBJECT_B_ID],
    world,
  );
  knowledge.sample();

  const kernel = new ResidentContinuityKernel();
  const authority = new ResidentWorldExecutionAuthority(R4D_MIRA_ID, kernel, world);
  const contact = new ResidentLocalContactRoutine(
    R4D_MIRA_ID,
    kernel,
    authority,
    world,
    {
      responseText: CONTACT_RESPONSE,
      holdTicks: CONTACT_HOLD_TICKS,
      responseRadius: LOCAL_RADIUS,
    },
  );

  function stepWorld(): void {
    world.step();
    knowledge.sample();
  }

  function exactPercept(occurrenceId: string): ResidentPercept {
    const percept = [...world.residentDiagnostics(R4D_MIRA_ID).recentPercepts]
      .reverse()
      .find((candidate) => candidate.occurrenceId === occurrenceId);
    if (!percept) throw new Error(`Mira did not legally perceive occurrence ${occurrenceId}`);
    return percept;
  }

  function miraPosition(): Vec2 {
    const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === R4D_MIRA_ID);
    if (!actor) throw new Error("Mira body missing from R4-D World");
    return { ...actor.position };
  }

  return {
    world,
    mira,
    kernel,
    authority,
    materialKnowledge: knowledge,
    contact,
    miraPosition,
    pendingCognitionReasons: () => mira.pendingCognitionReasons(),
    activeMatterIds(): string[] {
      return kernel.snapshotCommittedState().matters
        .filter((matter) => matter.status === "active" || matter.status === "suspended")
        .map((matter) => matter.id)
        .sort((left, right) => left.localeCompare(right));
    },
    advanceQuietOneWorldTick(): void {
      if (contact.active()) throw new Error("quiet step is invalid while local contact is active");
      stepWorld();
    },
    idaRelocateBackgroundObject(): R4DMovedBackgroundResult {
      if (contact.active()) throw new Error("cannot move background object during active contact");
      const pickup = world.attemptMaterialAction(R4D_IDA_ID, {
        kind: "pickup",
        objectId: R4D_MOVED_OBJECT_ID,
      });
      if (pickup.status !== "succeeded") {
        throw new Error(`Ida failed to pick up R4-D background object: ${pickup.code}`);
      }
      const place = world.attemptMaterialAction(R4D_IDA_ID, {
        kind: "place",
        objectId: R4D_MOVED_OBJECT_ID,
        position: { ...R4D_MOVED_OBJECT_END },
      });
      if (place.status !== "succeeded") {
        throw new Error(`Ida failed to place R4-D background object: ${place.code}`);
      }
      const interaction = world.emitInteraction(
        R4D_IDA_ID,
        R4D_MOVED_OBJECT_ID,
        "Ida moved a nearby basket.",
        520,
      );
      stepWorld();
      return {
        pickup,
        place,
        interaction,
        percept: exactPercept(interaction.id),
      };
    },
    idaSpeak(text: string, addressed = false): R4DIdaSpeechResult {
      const occurrence = world.speak(
        R4D_IDA_ID,
        text,
        LOCAL_RADIUS,
        addressed ? [R4D_MIRA_ID] : [],
      );
      stepWorld();
      return {
        occurrence,
        percept: exactPercept(occurrence.id),
      };
    },
    beginIdaAddressedContact(text = "Mira?"): R4DIdaContactResult {
      if (contact.active()) throw new Error("R4-D local contact is already active");
      const speech = this.idaSpeak(text, true);
      const snapshot = contact.begin(speech.percept, null);
      return {
        ...speech,
        contact: snapshot,
      };
    },
    advanceContactOneWorldTick(): ResidentLocalContactStep {
      if (!contact.active()) throw new Error("R4-D local contact is not active");
      const step = contact.step();
      stepWorld();
      return step;
    },
  };
}
