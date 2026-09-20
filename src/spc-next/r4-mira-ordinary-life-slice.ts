import type { ResidentPercept, Vec2, WorldOccurrence } from "./contracts";
import type { MaterialObjectState } from "./material-world-state";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import {
  ResidentLocalContactRoutine,
  type ResidentLocalContactSnapshot,
  type ResidentLocalContactStep,
} from "./resident-local-contact-routine";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentWorldExecutionAuthority,
  type ResidentWorldActionResolution,
} from "./resident-world-execution-authority";
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
  pickup: ResidentWorldActionResolution;
  place: ResidentWorldActionResolution;
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

  // Ida is a real resident too. Her fixture actions therefore go through the same
  // recovered execution gate rather than SpcWorldRuntime's non-resident research
  // shortcut. This keeps R4-D honest about cross-resident causal World change.
  const idaKernel = new ResidentContinuityKernel();
  const idaAuthority = new ResidentWorldExecutionAuthority(R4D_IDA_ID, idaKernel, world);
  let idaRunSequence = 0;

  function beginIdaFixtureRun(label: string): { matterId: string; runId: string } {
    const sequence = idaRunSequence++;
    const evidence = idaKernel.recordEvidence({
      id: `evidence.ida.r4d.${label}.${sequence}`,
      tick: world.tick,
      kind: "life_context",
      summary: `Ida already has one bounded R4-D fixture action: ${label}.`,
    });
    const matterId = `matter.ida.r4d.${label}.${sequence}`;
    const runId = `run.ida.r4d.${label}.${sequence}`;
    idaKernel.openMatter({
      id: matterId,
      originEvidenceId: evidence.id,
      semanticCourse: `perform bounded R4-D fixture action: ${label}`,
    });
    idaKernel.bindRun({
      matterId,
      taskId: `task.ida.r4d.${label}.${sequence}`,
      runId,
    });
    return { matterId, runId };
  }

  function finishIdaFixtureRun(matterId: string, runId: string, summary: string): void {
    const reconciled = idaKernel.reconcileRunOutcome({
      runId,
      tick: world.tick,
      status: "succeeded",
      summary,
    });
    if (reconciled.status !== "recorded") {
      throw new Error(`Ida R4-D fixture run failed to reconcile: ${runId}`);
    }
    idaKernel.resolveMatter(matterId);
    idaAuthority.enforceMotionAuthority();
  }

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
    idaKernel,
    idaAuthority,
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
      const fixture = beginIdaFixtureRun("background-move");
      const pickup = idaAuthority.act(fixture.runId, {
        kind: "material_pickup",
        objectId: R4D_MOVED_OBJECT_ID,
      });
      if (pickup.status !== "resolved" || pickup.materialOutcome.status !== "succeeded") {
        throw new Error("Ida failed to pick up R4-D background object through resident authority");
      }
      const place = idaAuthority.act(fixture.runId, {
        kind: "material_place",
        objectId: R4D_MOVED_OBJECT_ID,
        position: { ...R4D_MOVED_OBJECT_END },
      });
      if (place.status !== "resolved" || place.materialOutcome.status !== "succeeded") {
        throw new Error("Ida failed to place R4-D background object through resident authority");
      }
      finishIdaFixtureRun(
        fixture.matterId,
        fixture.runId,
        "Ida factually moved the R4-D background basket through recovered resident execution authority.",
      );
      stepWorld();
      return { pickup, place };
    },
    idaSpeak(text: string, addressed = false): R4DIdaSpeechResult {
      const fixture = beginIdaFixtureRun(addressed ? "addressed-speech" : "ambient-speech");
      const applied = idaAuthority.apply({
        runId: fixture.runId,
        effects: [{
          kind: "speech",
          text,
          radius: LOCAL_RADIUS,
          addressedActorIds: addressed ? [R4D_MIRA_ID] : [],
        }],
      });
      if (applied.status !== "applied") {
        throw new Error(`Ida R4-D speech was not applied through resident authority: ${applied.status}`);
      }
      const occurrence = applied.occurrences.find((candidate) => candidate.kind === "speech");
      if (!occurrence) throw new Error("Ida R4-D speech produced no factual World occurrence");
      finishIdaFixtureRun(
        fixture.matterId,
        fixture.runId,
        addressed ? "Ida factually addressed Mira." : "Ida factually spoke ambiently near Mira.",
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
