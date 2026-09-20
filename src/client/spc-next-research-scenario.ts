import type { ResidentContinuityKernel } from "../spc-next/resident-continuity-kernel";
import type { ResidentMaterialKnowledge } from "../spc-next/resident-material-knowledge";
import type { ResidentWorldExecutionAuthority } from "../spc-next/resident-world-execution-authority";
import type { ResidentLifeCognitionView } from "../spc-next/resident-life-cognition-view";
import {
  FiveResidentUnifiedLivingRuntime,
  type FiveResidentLivingRuntimeDiagnostics,
} from "../spc-next/five-resident-unified-living-runtime";
import type { FiveResidentId } from "../spc-next/five-resident-region";
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
import { createZeroProviderLocalLifeSlice } from "../spc-next/zero-provider-local-life-slice";
import {
  createR4DenseWorkshopSlice,
  R4_PRIMARY_MATTER_ID,
} from "../spc-next/r4-dense-workshop-slice";

export type SpcNextResearchScenarioKind =
  | "baseline-delivery"
  | "missing-crate"
  | "missing-crate-recovery"
  | "missing-crate-interruption"
  | "missing-crate-live-provider"
  | "missing-crate-live-provider-interruption"
  | "ida-message-delivery"
  | "zero-provider-local-life"
  | "r4-dense-workshop"
  | "unified-living";

export interface SpcNextResearchScenario {
  readonly kind: SpcNextResearchScenarioKind;
  readonly evidenceScenarioId: string;
  readonly residentId: string;
  readonly matterId: string;
  readonly world: SpcWorldRuntime;
  readonly kernel: ResidentContinuityKernel;
  /** Optional resident-specific evidence extension; social slices do not invent material knowledge. */
  readonly materialKnowledge?: ResidentMaterialKnowledge | null;
  readonly authority: ResidentWorldExecutionAuthority;
  /** Unified runtime has multiple resident kernels and therefore no single canonical evidence target. */
  readonly canonicalEvidenceSupported?: boolean;
  readonly residentLifeView?: (residentId: string) => ResidentLifeCognitionView | null;
  readonly livingDiagnostics?: () => FiveResidentLivingRuntimeDiagnostics | null;
  /** Optional evidence-only explicit causal boundary for a bounded research fixture. */
  readonly evidenceAction?: (actionId: string) => unknown;
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
  if (kind === "zero-provider-local-life") return createZeroProviderLocalLifeScenario();
  if (kind === "r4-dense-workshop") return createR4DenseWorkshopScenario();
  if (kind === "unified-living") return createUnifiedLivingScenario();
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
  if (requested === "zero-provider-local-life") return "zero-provider-local-life";
  if (requested === "r4-dense-workshop") return "r4-dense-workshop";
  if (requested === "unified-living") return "unified-living";
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
      // The first browser-controlled tick is the variable under test: World truth
      // changes while Janek is outside sight range. Resident execution starts only
      // on the following tick, so evidence can capture the exact pre/post boundary.
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
      // The recovery slice itself owns the deterministic one-tick state machine.
      // Scripted semantic choices exercise the real authority membrane but remain
      // research-fixture decisions; this scenario is not LIVE_PROVIDER evidence.
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
      // Addressed participant speech still enters through World.speak() and private
      // perception. This adapter only advances the already-qualified interruption
      // state machine; it does not inject an interruption directly.
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
      // Unlike deterministic recovery, this path really calls the same-origin
      // Worker endpoint. Transport completion can only fill the slice's inert
      // arrival inbox; admission and grounding remain resident/World-tick owned.
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
      // The participant interruption is not injected here. Browser evidence must
      // enter through __SPC_EVIDENCE__.addressResident() -> World.speak(), after a
      // real provider choice has grounded the live search run.
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
      // I1 begins after legally acquired authored prehistory. The browser adapter
      // advances only the resident-owned social commitment execution; it does not
      // inject delivery, recipient identity or recipient position into the slice.
      slice.advanceOneWorldTick();
    },
  };
}


function createZeroProviderLocalLifeScenario(): SpcNextResearchScenario {
  const slice = createZeroProviderLocalLifeSlice();
  return {
    kind: "zero-provider-local-life",
    evidenceScenarioId: "browser-zero-provider-local-life",
    residentId: "resident.mira",
    matterId: slice.mainMatterId,
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    advanceOneWorldTick(): void {
      // This adapter advances the exact provider-free R1 organism. It does not
      // inject life decisions, semantic settlement or provider output.
      slice.advanceOneWorldTick();
    },
  };
}


function createR4DenseWorkshopScenario(): SpcNextResearchScenario {
  const slice = createR4DenseWorkshopSlice();
  let relocated = false;

  return {
    kind: "r4-dense-workshop",
    evidenceScenarioId: "browser-r4-dense-workshop",
    residentId: "resident.janek",
    matterId: R4_PRIMARY_MATTER_ID,
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.knowledge,
    authority: slice.authority,
    residentLifeView(residentId: string): ResidentLifeCognitionView | null {
      return residentId === "resident.janek" ? slice.currentLifeView() : null;
    },
    evidenceAction(actionId: string): unknown {
      if (actionId === "reveal-primary-nearby") return slice.revealPrimaryNearby();
      throw new Error(`unknown R4 dense-workshop evidence action: ${actionId}`);
    },
    advanceOneWorldTick(): void {
      // Keep the adversarial relocation on an explicit first browser-controlled
      // boundary. Later ticks are entirely the provider-free R4 local organism.
      if (!relocated) {
        slice.relocatePrimaryHidden();
        relocated = true;
        return;
      }
      slice.advanceOneWorldTick();
    },
  };
}


function createUnifiedLivingScenario(): SpcNextResearchScenario {
  const living = new FiveResidentUnifiedLivingRuntime();
  const janek = living.life("resident.janek");
  if (!janek) {
    throw new Error("unified living runtime must claim idle Janek at construction");
  }

  return {
    kind: "unified-living",
    evidenceScenarioId: "browser-unified-living",
    // Compatibility fields exist only because the older research shell is centered
    // on one canonical target. Unified canonical evidence is explicitly disabled.
    residentId: "resident.janek",
    matterId: "matter.unified-living.multiple-residents",
    world: living.world,
    kernel: janek.kernel,
    materialKnowledge: null,
    authority: janek.worldAuthority,
    canonicalEvidenceSupported: false,
    residentLifeView(residentId: string): ResidentLifeCognitionView | null {
      if (!living.world.publicSnapshot().residents.some((resident) => resident.id === residentId)) {
        return null;
      }
      return living.life(residentId as FiveResidentId)?.currentLifeView() ?? null;
    },
    livingDiagnostics(): FiveResidentLivingRuntimeDiagnostics {
      return living.diagnostics();
    },
    advanceOneWorldTick(): void {
      living.advanceOneWorldTick();
    },
  };
}
