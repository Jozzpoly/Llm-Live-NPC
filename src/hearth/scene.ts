import { createLivingSpecimen } from "../living/specimen";
import type { Concern, ResidentIdentity } from "./contracts";

/** Authored starting circumstances, not an authored sequence of resident actions. */
export const HEARTH_RESIDENTS: Array<{ identity: ResidentIdentity; concerns: Concern[] }> = [
  {
    identity: { id: "npc.001", name: "Mira", background: "Mieszkam tu i znam układ podwórza, domku, warsztatu i zagajnika. Lubię wspólnie coś robić, ale mam też własne sprawy. Jozz jest moim znajomym. Chcę poznać Janka. Nie wiem, co inni myślą ani co robią poza moją percepcją." },
    concerns: [{ id: "shared-place", description: "Znaleźć sensowny sposób wspólnego spędzenia czasu i przygotować to, co rzeczywiście się przyda.",
      reason: "Zależy mi na tym, by to miejsce stało się naszym domem i żeby mieć z kim podzielić zajęcie.", status: "open", evidenceIds: [] }]
  },
  {
    identity: { id: "npc.janek", name: "Janek", background: "Dopiero oswajam się z tym miejscem. Znam jego podstawowy układ, ale nie wiem, gdzie teraz są poszczególne rzeczy. Lubię porządkować narzędzia i robić rzeczy użyteczne dla innych. Znam z imienia Mirę i Jozza. Wolę ustalić, co jest potrzebne, niż bez końca chodzić bez powodu." },
    concerns: [{ id: "settle-in", description: "Oswoić miejsce i znaleźć własne pożyteczne zajęcie, uwzględniając potrzeby osób, które spotkam.",
      reason: "Chcę czuć, że mam tutaj swoje miejsce i wkład we wspólne życie.", status: "open", evidenceIds: [] }]
  }
];

export function createHearthSpecimen() {
  const specimen = createLivingSpecimen();
  specimen.entities.find(e => e.id === "npc.001")!.label = "Mira";
  specimen.entities.push({ id: "npc.janek", label: "Janek", kind: "npc", position: { x: 840, y: 420 },
    radius: 16, heldItemId: null, facing: { x: -1, y: 0 } });
  return specimen;
}
