import { describe, expect, it } from "vitest";
import {
  R4D_IDA_ID,
  R4D_MIRA_ID,
  R4D_MOVED_OBJECT_END,
  R4D_MOVED_OBJECT_ID,
  R4D_STABLE_OBJECT_A_ID,
  R4D_STABLE_OBJECT_B_ID,
  createR4MiraOrdinaryLifeSlice,
} from "./r4-mira-ordinary-life-slice";

const QUIET_TICKS = 600;
const POST_BACKGROUND_QUIET_TICKS = 240;
const POST_CONTACT_BODY_QUIET_TICKS = 600;
const CONTACT_GUARD = 40;

describe("R4-D Mira ordinary-life negative capability", () => {
  it("keeps dense nearby affordances as background, wakes for Ida contact, and does not become a chore bot", () => {
    const slice = createR4MiraOrdinaryLifeSlice();
    const initialPosition = slice.miraPosition();

    expect(slice.world.publicSnapshot().actors.some((actor) => actor.id.startsWith("player."))).toBe(false);
    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.pendingCognitionReasons()).toEqual([]);

    const initialKnowledge = slice.materialKnowledge.snapshot();
    expect(initialKnowledge.map((entry) => entry.objectId)).toEqual([
      R4D_MOVED_OBJECT_ID,
      R4D_STABLE_OBJECT_A_ID,
      R4D_STABLE_OBJECT_B_ID,
    ].sort((left, right) => left.localeCompare(right)));
    expect(initialKnowledge.every((entry) => entry.currentlyVisible)).toBe(true);

    for (let tick = 0; tick < QUIET_TICKS; tick += 1) {
      slice.advanceQuietOneWorldTick();
    }

    // Dense possibility is not itself a demand. Mira remains still and pressure-free
    // despite legally seeing another resident and three manipulable material facts.
    expect(slice.miraPosition()).toEqual(initialPosition);
    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.pendingCognitionReasons()).toEqual([]);
    expect(slice.authority.recentActionFacts()).toEqual([]);

    const moved = slice.idaRelocateBackgroundObject();
    expect(moved.pickup).toMatchObject({
      status: "succeeded",
      code: "picked_up",
      actorId: R4D_IDA_ID,
      objectId: R4D_MOVED_OBJECT_ID,
    });
    expect(moved.place).toMatchObject({
      status: "succeeded",
      code: "placed",
      actorId: R4D_IDA_ID,
      objectId: R4D_MOVED_OBJECT_ID,
    });
    expect(moved.percept).toMatchObject({
      phenomenon: "interaction",
      modality: "sight",
      actorId: R4D_IDA_ID,
      subjectId: R4D_MOVED_OBJECT_ID,
      addressed: false,
    });
    expect(slice.materialKnowledge.observation(R4D_MOVED_OBJECT_ID)).toMatchObject({
      objectId: R4D_MOVED_OBJECT_ID,
      lastKnownPosition: R4D_MOVED_OBJECT_END,
      currentlyVisible: true,
    });

    // A truthful nearby material change is observed, but without resident-owned
    // significance it does not become a Mira matter, action or semantic demand.
    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.pendingCognitionReasons()).toEqual([]);
    expect(slice.authority.recentActionFacts()).toEqual([]);
    expect(slice.miraPosition()).toEqual(initialPosition);

    const ambient = slice.idaSpeak("Ładny spokój.", false);
    expect(ambient.percept).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      actorId: R4D_IDA_ID,
      addressed: false,
      text: "Ładny spokój.",
    });
    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.pendingCognitionReasons()).toEqual([]);

    for (let tick = 0; tick < POST_BACKGROUND_QUIET_TICKS; tick += 1) {
      slice.advanceQuietOneWorldTick();
    }
    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.pendingCognitionReasons()).toEqual([]);
    expect(slice.miraPosition()).toEqual(initialPosition);

    // Direct non-player contact is a real boundary. It may create addressed semantic
    // pressure, but the shared local-contact routine can still handle the already-
    // grounded bodily/social acknowledgement without a provider.
    const direct = slice.beginIdaAddressedContact("Mira?");
    expect(direct.percept).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      actorId: R4D_IDA_ID,
      addressed: true,
      text: "Mira?",
    });
    expect(direct.contact).toMatchObject({
      status: "active",
      sourceActorId: R4D_IDA_ID,
    });
    expect(direct.contact.contactMatterId).toBeTruthy();
    expect(direct.contact.contactRunId).toBeTruthy();

    const semanticReasonsBeforeLocalContact = slice.pendingCognitionReasons();
    expect(semanticReasonsBeforeLocalContact).toHaveLength(1);
    expect(semanticReasonsBeforeLocalContact[0]).toMatchObject({
      kind: "heard_speech",
    });
    expect(semanticReasonsBeforeLocalContact[0]!.evidenceIds).toContain(direct.percept.id);
    expect(slice.activeMatterIds()).toEqual([direct.contact.contactMatterId!]);

    let respondedOccurrenceId: string | null = null;
    let completed = false;
    for (let stepIndex = 0; stepIndex < CONTACT_GUARD && !completed; stepIndex += 1) {
      const step = slice.advanceContactOneWorldTick();
      if (step.status === "responded") {
        respondedOccurrenceId = step.snapshot.responseOccurrenceId;
      }
      if (step.status === "completed") completed = true;
    }

    expect(completed).toBe(true);
    expect(respondedOccurrenceId).toBeTruthy();
    const response = slice.world.diagnostics().recentOccurrences.find(
      (occurrence) => occurrence.id === respondedOccurrenceId,
    );
    expect(response).toMatchObject({
      actorId: R4D_MIRA_ID,
      kind: "speech",
      text: "Tak?",
    });
    expect(response?.addressedActorIds).toEqual([R4D_IDA_ID]);

    // Local acknowledgement resolves only its transient body/contact matter. It does
    // not falsely consume the semantic meaning of addressed speech.
    expect(slice.kernel.matter(direct.contact.contactMatterId!)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.authority.motionOwner()).toBeNull();
    expect(slice.authority.recentActionFacts()).toEqual([]);
    expect(slice.miraPosition()).toEqual(initialPosition);

    const semanticReasonIds = semanticReasonsBeforeLocalContact
      .map((reason) => reason.id)
      .sort((left, right) => left.localeCompare(right));
    expect(slice.pendingCognitionReasons()
      .map((reason) => reason.id)
      .sort((left, right) => left.localeCompare(right)))
      .toEqual(semanticReasonIds);

    // Body quiet after contact must not recursively create another local contact,
    // another material chore or another semantic reason. The one unresolved addressed
    // reason remains explicit for a later semantic layer.
    for (let tick = 0; tick < POST_CONTACT_BODY_QUIET_TICKS; tick += 1) {
      slice.advanceQuietOneWorldTick();
    }

    expect(slice.activeMatterIds()).toEqual([]);
    expect(slice.authority.motionOwner()).toBeNull();
    expect(slice.authority.recentActionFacts()).toEqual([]);
    expect(slice.miraPosition()).toEqual(initialPosition);
    expect(slice.pendingCognitionReasons()
      .map((reason) => reason.id)
      .sort((left, right) => left.localeCompare(right)))
      .toEqual(semanticReasonIds);

    expect(slice.materialKnowledge.observation(R4D_STABLE_OBJECT_A_ID)?.currentlyVisible).toBe(true);
    expect(slice.materialKnowledge.observation(R4D_STABLE_OBJECT_B_ID)?.currentlyVisible).toBe(true);
    expect(slice.materialKnowledge.observation(R4D_MOVED_OBJECT_ID)).toMatchObject({
      lastKnownPosition: R4D_MOVED_OBJECT_END,
      currentlyVisible: true,
    });
  });
});
