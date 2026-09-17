import { describe, expect, it } from "vitest";
import {
  IDA_MESSAGE_MATTER_ID,
  IDA_MESSAGE_RUN_ID,
  IDA_MESSAGE_TEXT,
  createFiveResidentIdaMessageDeliverySlice,
} from "./five-resident-ida-message-delivery-slice";

const IDA_ID = "resident.ida";
const MIRA_ID = "resident.mira";
const JANEK_ID = "resident.janek";
const MAX_STEPS = 1_100;

describe("five-resident Ida accepted-message delivery", () => {
  it("turns one private social commitment into factual addressed World speech without making nearby hearing equal addressee", () => {
    const slice = createFiveResidentIdaMessageDeliverySlice();
    const origin = slice.kernel.originEvidence(IDA_MESSAGE_MATTER_ID);
    const initialRecipientContact = slice.idaRecipientContact();
    const initialIda = actor(slice, IDA_ID);

    expect(origin).toMatchObject({
      kind: "accepted_social_commitment",
    });
    expect(origin?.summary).toContain("Mira asked Ida to tell Janek");
    expect(initialRecipientContact).toMatchObject({
      id: JANEK_ID,
      currentlyVisible: false,
    });
    expect(initialRecipientContact?.lastKnownPosition).not.toBeNull();
    expect(slice.idaSourceContact()?.id).toBe(MIRA_ID);
    expect(slice.kernel.matter(IDA_MESSAGE_MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: IDA_MESSAGE_RUN_ID,
    });

    // Once recovered authority owns Ida, legacy direct speech is not a second mutation path.
    expect(() => slice.world.speak(IDA_ID, "bypass", 100, [JANEK_ID])).toThrow(
      /direct speech bypass is disabled for recovered resident/,
    );

    let guard = 0;
    let sawApproach = false;
    let sawLegallyVisibleRecipient = false;
    let terminal: ReturnType<typeof slice.advanceOneWorldTick> | null = null;

    while (guard < MAX_STEPS) {
      const beforeMatter = slice.kernel.matter(IDA_MESSAGE_MATTER_ID);
      const step = slice.advanceOneWorldTick();
      terminal = step;
      if (step.status === "running") {
        sawApproach = true;
        sawLegallyVisibleRecipient ||= step.local.recipientCurrentlyVisible;
        expect(beforeMatter?.status).toBe("active");
        expect(slice.kernel.matter(IDA_MESSAGE_MATTER_ID)?.status).toBe("active");
      }
      if (step.status !== "running") break;
      guard += 1;
    }

    expect(guard).toBeLessThan(MAX_STEPS);
    expect(sawApproach).toBe(true);
    expect(sawLegallyVisibleRecipient).toBe(true);
    expect(terminal?.status).toBe("delivered");
    if (terminal?.status !== "delivered") throw new Error(`unexpected I1 terminal state: ${terminal?.status ?? "none"}`);

    const occurrence = terminal.local.occurrence;
    expect(occurrence).toMatchObject({
      kind: "speech",
      actorId: IDA_ID,
      text: IDA_MESSAGE_TEXT,
      addressedActorIds: [JANEK_ID],
    });
    expect(slice.deliveredOccurrence()).toEqual(occurrence);
    expect(occurrence.position).not.toEqual(initialIda.position);

    const finalIda = actor(slice, IDA_ID);
    const finalJanek = actor(slice, JANEK_ID);
    expect(Math.hypot(finalIda.position.x - finalJanek.position.x, finalIda.position.y - finalJanek.position.y)).toBeLessThanOrEqual(82);
    expect(finalIda.velocity).toEqual({ x: 0, y: 0 });

    expect(terminal.reconciliation).toMatchObject({
      status: "recorded",
      binding: {
        runId: IDA_MESSAGE_RUN_ID,
        matterId: IDA_MESSAGE_MATTER_ID,
      },
      matter: {
        status: "active",
        activeRunId: null,
      },
    });
    expect(slice.kernel.matter(IDA_MESSAGE_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const janekPercept = speechPercept(slice, JANEK_ID, occurrence.id);
    expect(janekPercept).toMatchObject({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      modality: "hearing",
      actorId: IDA_ID,
      text: IDA_MESSAGE_TEXT,
      addressed: true,
    });

    const miraPercept = speechPercept(slice, MIRA_ID, occurrence.id);
    expect(miraPercept).toMatchObject({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      modality: "hearing",
      actorId: IDA_ID,
      text: IDA_MESSAGE_TEXT,
      addressed: false,
    });

    for (const distantId of ["resident.oren", "resident.nela"]) {
      expect(speechPercept(slice, distantId, occurrence.id)).toBeNull();
    }

    const matchingWorldOccurrences = slice.world.diagnostics().recentOccurrences.filter((candidate) => (
      candidate.kind === "speech" && candidate.id === occurrence.id
    ));
    expect(matchingWorldOccurrences).toHaveLength(1);
    expect(slice.authority.motionOwner()).toBeNull();
  });
});

function actor(slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>, actorId: string) {
  const value = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!value) throw new Error(`missing actor ${actorId}`);
  return value;
}

function speechPercept(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  residentId: string,
  occurrenceId: string,
) {
  return slice.world.residentDiagnostics(residentId).recentPercepts.find((percept) => (
    percept.occurrenceId === occurrenceId && percept.phenomenon === "speech"
  )) ?? null;
}
