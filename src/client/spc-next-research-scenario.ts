import type { ResidentContinuityKernel } from "../spc-next/resident-continuity-kernel";
import type { ResidentMaterialKnowledge } from "../spc-next/resident-material-knowledge";
import type { ResidentWorldExecutionAuthority } from "../spc-next/resident-world-execution-authority";
import type { SpcWorldRuntime } from "../spc-next/spc-world-runtime";
import { createFiveResidentJanekMaterialSlice } from "../spc-next/five-resident-material-slice";
import { createFiveResidentJanekMissingCrateStagedSlice } from "../spc-next/five-resident-missing-crate-slice";
import { createFiveResidentJanekMissingCrateRecoverySlice } from "../spc-next/five-resident-missing-crate-recovery-slice";
import { createFiveResidentJanekMissingCrateInterruptionSlice } from "../spc-next/five-resident-missing-crate-interruption-slice";
import { createFiveResidentJanekMissingCrateLiveProviderSlice } from "../spc-next/five-resident-missing-crate-live-provider-slice";
import { createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice } from "../spc-next/five-resident-missing-crate-live-provider-interruption-slice";
import {
  IDA_MESSAGE_MATTER_ID,
  createFiveResidentIdaMessageDeliverySlice,
} from "../spc-next/five-resident-ida-message-delivery-slice";
import { createFiveResidentMiraSustainedLifeSlice } from "../spc-next/five-resident-mira-sustained-life-slice";

export type SpcNextResearchScenarioKind =
  | "baseline-delivery"
  | "missing-crate"
  | "missing-crate-recovery"
  | "missing-crate-interruption"
  | "missing-crate-live-provider"
  | "missing-crate-live-provider-interruption"
  | "ida-message-delivery"
  | "mira-sustained-life";

export interface SpcNextResearchScenario {
  readonly kind: SpcNextResearchScenarioKind;
  readonly evidenceScenarioId: string;
  readonly residentId: string;
  readonly matterId: string;
  readonly world: SpcWorldRuntime;
  readonly kernel: ResidentContinuityKernel;
  /** Optional resident-specific evidence extension; social/travel slices do not invent material knowledge. */
  readonly materialKnowledge?: ResidentMaterialKnowledge | null;
  /** Optional existing action-fact source. Observation must never create execution authority. */
  readonly authority: ResidentWorldExecutionAuthority | null;
  /** Advances exactly one authoritative World tick. */
  advanceOneWorldTick(): void;
}

export function createSpcNextResearchScenario(kind: SpcNextResearchScenarioKind): SpcNextResearchScenario {
  if (kind === "missing-crate") return createMissingCrateScenario();
  if (kind === "missing-crate-recovery") return createMissingCrateRecoveryScenario();
  if (kind === "missing-crate-interruption") return createMissingCrateInterruptionScenario();
  if (kind === "missing-crate-live-provider") return createMissingCrateLiveProviderScenario();
  if (kind === "missing-crate-live-provider-interruption") return createMissingCrateLiveProviderInterruptionScenario();
  if (kind === "ida-message-delivery") return createIdaMessageDeliveryScenario();
  if (kind === "mira-sustained-life") return createMiraSustainedLifeScenario();
  return createBaselineDeliveryScenario();
}

export function researchScenarioKindFromSearch(search: string): SpcNextResearchScenarioKind {
  const requested = new URLSearchParams(search).get("scenario");
  if (requested === null || requested === "" || requested === "baseline-delivery") return "baseline-delivery";
  if (requested === "missing-crate") return "missing-crate";
  if (requested === "missing-crate-recovery") return "missing-crate-recovery";
  if (requested === "missing-crate-interruption") return "missing-crate-interruption";
  if (requested === "missing-crate-live-provider") return "missing-crate-live-provider";
  if (requested === "missing-crate-live-provider-interruption") return "missing-crate-live-provider-interruption";
  if (requested === "ida-message-delivery") return "ida-message-delivery";
  if (requested === "mira-sustained-life") return "mira-sustained-life";
  throw new Error(`unknown SPC Next research scenario: ${requested}`);
}

function createBaselineDeliveryScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentJanekMaterialSlice();
  return {
    kind: "baseline-delivery",
    evidenceScenarioId: "browser-baseline-delivery",
    residentId: "resident.janek",
    matterId: "matter.janek.crate-delivery",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      slice.stepJanek();
      slice.world.step();
    },
  };
}

function createMissingCrateScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentJanekMissingCrateStagedSlice();
  return {
    kind: "missing-crate",
    evidenceScenarioId: "browser-missing-crate",
    residentId: "resident.janek",
    matterId: "matter.janek.missing-crate",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      if (!slice.hiddenRelocationApplied()) {
        slice.relocateCrateHidden();
        return;
      }
      slice.stepJanek();
      slice.world.step();
    },
  };
}

function createMissingCrateRecoveryScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentJanekMissingCrateRecoverySlice();
  return {
    kind: "missing-crate-recovery",
    evidenceScenarioId: "browser-missing-crate-recovery",
    residentId: "resident.janek",
    matterId: "matter.janek.missing-crate",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      slice.advanceOneWorldTick();
    },
  };
}

function createMissingCrateInterruptionScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentJanekMissingCrateInterruptionSlice();
  return {
    kind: "missing-crate-interruption",
    evidenceScenarioId: "browser-missing-crate-interruption",
    residentId: "resident.janek",
    matterId: "matter.janek.missing-crate",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      slice.advanceOneWorldTick();
    },
  };
}

function createMissingCrateLiveProviderScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentJanekMissingCrateLiveProviderSlice();
  return {
    kind: "missing-crate-live-provider",
    evidenceScenarioId: "browser-missing-crate-live-provider",
    residentId: "resident.janek",
    matterId: "matter.janek.missing-crate",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      slice.advanceOneWorldTick();
    },
  };
}

function createMissingCrateLiveProviderInterruptionScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice();
  return {
    kind: "missing-crate-live-provider-interruption",
    evidenceScenarioId: "browser-missing-crate-live-provider-interruption",
    residentId: "resident.janek",
    matterId: "matter.janek.missing-crate",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      slice.advanceOneWorldTick();
    },
  };
}

function createIdaMessageDeliveryScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentIdaMessageDeliverySlice();
  return {
    kind: "ida-message-delivery",
    evidenceScenarioId: "browser-ida-message-delivery",
    residentId: "resident.ida",
    matterId: IDA_MESSAGE_MATTER_ID,
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: null,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      slice.advanceOneWorldTick();
    },
  };
}

function createMiraSustainedLifeScenario(): SpcNextResearchScenario {
  const slice = createFiveResidentMiraSustainedLifeSlice();
  let focusMatterId = "matter.mira.sustained.1.workshop";

  return {
    kind: "mira-sustained-life",
    evidenceScenarioId: "browser-mira-sustained-life",
    residentId: "resident.mira",
    get matterId(): string {
      return focusMatterId;
    },
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: null,
    authority: null,
    advanceOneWorldTick(): void {
      const step = slice.advanceOneWorldTick();
      if (step.status === "chapter_started" || step.status === "chapter_resolved") {
        focusMatterId = step.matterId;
      }
    },
  };
}
