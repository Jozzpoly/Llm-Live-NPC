import { describe, expect, it } from "vitest";
import { worldTerrainPresentation } from "./spc-next-terrain-presentation";

describe("Owner rejected SPC pseudo-terrain", () => {
  it("keeps unified game visually neutral and diagnostic region borders explicit", () => {
    expect(worldTerrainPresentation("unified-living", false)).toBe("neutral-unapproved");
    expect(worldTerrainPresentation("unified-armed", false)).toBe("neutral-unapproved");
    expect(worldTerrainPresentation("unified-living", true)).toBe("neutral-with-diagnostic-regions");
    expect(worldTerrainPresentation("unified-armed", true)).toBe("neutral-with-diagnostic-regions");
  });
  it("does not change the archived terrain evidence contract of other scenarios", () => {
    expect(worldTerrainPresentation("baseline-delivery", false)).toBe("legacy-research");
    expect(worldTerrainPresentation("r4-dense-workshop", true)).toBe("legacy-research");
  });
});
