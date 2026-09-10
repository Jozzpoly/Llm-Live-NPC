import { createP1Specimen } from "../world/specimen";
import type { ItemEntity, WorldSpecimen } from "../world/types";

/** An authored living scene. The laboratory retains its independent specimen. */
export function createLivingSpecimen(): WorldSpecimen {
  const specimen = createP1Specimen();
  specimen.entities.push({ id: "item.blue-mug", kind: "item", label: "Blue mug", position: { x: 865, y: 390 }, radius: 9, heldBy: null });
  const appearances: Record<string, ItemEntity["appearance"]> = {
    "item.mug": { itemType: "mug", color: "red" }, "item.blue-mug": { itemType: "mug", color: "blue" },
    "item.hammer": { itemType: "hammer" }, "item.lantern": { itemType: "lantern" }
  };
  for (const item of specimen.entities) if (item.kind === "item" && appearances[item.id]) item.appearance = appearances[item.id];
  return specimen;
}
