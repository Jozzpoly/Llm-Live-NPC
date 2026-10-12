import type { SpcNextResearchScenarioKind } from "./spc-next-research-scenario";

/**
 * An explicit ART-QUALITY guard, not terrain generation or world semantics.
 * "neutral-unapproved" is a temporary visual placeholder, not an aesthetic choice.
 */
export type SpcWorldTerrainPresentation =
  | "neutral-unapproved"
  | "neutral-with-diagnostic-regions"
  | "legacy-research";

export function worldTerrainPresentation(
  kind: SpcNextResearchScenarioKind,
  diagnosticsEnabled: boolean,
): SpcWorldTerrainPresentation {
  if (kind !== "unified-living" && kind !== "unified-armed") {
    return "legacy-research";
  }
  return diagnosticsEnabled
    ? "neutral-with-diagnostic-regions"
    : "neutral-unapproved";
}
