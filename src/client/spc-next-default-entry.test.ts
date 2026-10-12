import { describe, expect, it } from "vitest";
import { researchScenarioKindFromSearch } from "./spc-next-research-scenario";

describe("Owner-facing five-resident entry", () => {
  it("opens the shared World by default while preserving explicit historical specimens", () => {
    expect(researchScenarioKindFromSearch("?spc=1")).toBe("unified-living");
    expect(researchScenarioKindFromSearch("?spc=1&evidence=1")).toBe("baseline-delivery");
    expect(researchScenarioKindFromSearch("?spc=1&scenario=unified-living")).toBe("unified-living");
    expect(researchScenarioKindFromSearch("?spc=1&scenario=baseline-delivery")).toBe("baseline-delivery");
    expect(researchScenarioKindFromSearch("?spc=1&scenario=unified-armed")).toBe("unified-armed");
  });
});
