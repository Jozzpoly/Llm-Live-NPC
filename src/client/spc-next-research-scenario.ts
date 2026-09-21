import type { ResidentContinuityKernel } from "../spc-next/resident-continuity-kernel";
import type { ResidentMaterialKnowledge } from "../spc-next/resident-material-knowledge";
import type { ResidentWorldExecutionAuthority } from "../spc-next/resident-world-execution-authority";
import type { ResidentLifeCognitionView } from "../spc-next/resident-life-cognition-view";
import { ResidentMatterRelevanceBridge } from "../spc-next/resident-matter-relevance-bridge";
import { createCognitionFetchHardBudget } from "../spc-next/cognition-fetch-hard-budget";
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
import { createR4MiraOrdinaryLifeSlice } from "../spc-next/r4-mira-ordinary-life-slice";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  R5_MIRA_SEMANTIC_REPLY,
  createR5MiraSemanticEscalationSlice,
} from "../spc-next/r5-mira-semantic-escalation-slice";

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
  | "r4-mira-ordinary-life"
  | "r5-mira-semantic-escalation"
  | "r5-mira-live-semantic-escalation"
  | "r6-mira-standing-social-commitment"
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
  if (kind === "r4-mira-ordinary-life") return createR4MiraOrdinaryLifeScenario();
  if (kind === "r5-mira-semantic-escalation") return createR5MiraSemanticEscalationScenario();
  if (kind === "r5-mira-live-semantic-escalation") return createR5MiraLiveSemanticEscalationScenario();
  if (kind === "r6-mira-standing-social-commitment") return createR6MiraStandingSocialCommitmentScenario();
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
  if (requested === "r4-mira-ordinary-life") return "r4-mira-ordinary-life";
  if (requested === "r5-mira-semantic-escalation") return "r5-mira-semantic-escalation";
  if (requested === "r5-mira-live-semantic-escalation") return "r5-mira-live-semantic-escalation";
  if (requested === "r6-mira-standing-social-commitment") return "r6-mira-standing-social-commitment";
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

function createR4MiraOrdinaryLifeScenario(): SpcNextResearchScenario {
  const slice = createR4MiraOrdinaryLifeSlice();

  function evidenceSnapshot() {
    const world = slice.world.publicSnapshot();
    const mira = world.actors.find((actor) => actor.id === "resident.mira") ?? null;
    const ida = world.actors.find((actor) => actor.id === "resident.ida") ?? null;
    return {
      tick: slice.world.tick,
      miraPosition: mira?.position ?? null,
      idaPosition: ida?.position ?? null,
      activeMatterIds: slice.activeMatterIds(),
      pendingCognitionReasons: slice.pendingCognitionReasons(),
      contact: slice.contact.snapshot(),
      miraMotionOwner: slice.authority.motionOwner(),
      miraActionFacts: slice.authority.recentActionFacts(),
      idaActionFacts: slice.idaAuthority.recentActionFacts(),
      idaMatters: slice.idaKernel.snapshotCommittedState().matters,
      materialKnowledge: slice.materialKnowledge.snapshot(),
      materialObjects: slice.world.materialObjects(),
    };
  }

  return {
    kind: "r4-mira-ordinary-life",
    evidenceScenarioId: "browser-r4-mira-ordinary-life",
    residentId: "resident.mira",
    // R4-D deliberately begins without a Mira matter. Canonical evidence accepts a
    // non-empty lookup id and projects matter:null, which is exactly the boundary
    // under test rather than a synthetic continuity object.
    matterId: "matter.mira.r4d.none",
    world: slice.world,
    kernel: slice.kernel,
    materialKnowledge: slice.materialKnowledge,
    authority: slice.authority,
    evidenceAction(actionId: string): unknown {
      if (actionId === "snapshot") return evidenceSnapshot();
      if (actionId === "ida-relocate-background") return slice.idaRelocateBackgroundObject();
      if (actionId === "ida-ambient-speech") return slice.idaSpeak("Ładny spokój.", false);
      if (actionId === "ida-address-mira") return slice.beginIdaAddressedContact("Mira?");
      throw new Error(`unknown R4-D Mira ordinary-life evidence action: ${actionId}`);
    },
    advanceOneWorldTick(): void {
      if (slice.contact.active()) {
        slice.advanceContactOneWorldTick();
        return;
      }
      slice.advanceQuietOneWorldTick();
    },
  };
}


const R5_BROWSER_NEWER_ATTENTION_PROMPT = "Mira, jednak chwila — najpierw odpowiedz, czy słyszysz zmianę.";

type R5BrowserProviderMode = "accept" | "error" | "decline" | "defer" | "clarify";

function createR5MiraSemanticEscalationScenario(): SpcNextResearchScenario {
  let releaseProvider: (() => void) | null = null;
  let providerMode: R5BrowserProviderMode = "accept";
  const providerContexts: unknown[] = [];

  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const context = JSON.parse(String(init?.body));
    providerContexts.push(structuredClone(context));
    await new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });

    const originReasonId = context?.reasons?.[0]?.id;
    if (typeof originReasonId !== "string") {
      throw new Error("R5 browser fixture provider received no exact origin reason");
    }

    if (providerMode === "error") {
      return new Response(JSON.stringify({
        ok: false,
        code: "global_limit",
        secretDiagnostic: "must-not-cross-client-boundary",
      }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }

    const proposal = providerMode === "decline"
      ? {
          version: 1,
          commitmentDecision: {
            kind: "decline",
            reason: "I heard Ida but choose not to accept a continuing commitment.",
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: 30,
        }
      : providerMode === "defer"
        ? {
            version: 1,
            commitmentDecision: {
              kind: "defer",
              reason: "Keep this semantic pressure unresolved for later review.",
            },
            beliefs: [],
            concerns: [],
            reviewAfterSeconds: 1,
          }
        : providerMode === "clarify"
          ? {
              version: 1,
              commitmentDecision: {
                kind: "clarify",
                reason: "The semantic content is not specific enough to accept or decline.",
                question: "Ida, co dokładnie masz na myśli?",
              },
              beliefs: [],
              concerns: [],
              reviewAfterSeconds: 0.5,
            }
          : {
              version: 1,
              commitmentDecision: {
                kind: "accept",
                reason: "Ida addressed me directly and I choose to answer her once.",
                intent: {
                  kind: "communicate",
                  goal: "answer Ida's direct question with one bounded reply",
                  targetActorId: R5_IDA_ID,
                  targetRegionId: null,
                  targetPosition: null,
                  text: R5_MIRA_SEMANTIC_REPLY,
                },
              },
              beliefs: [],
              concerns: [],
              reviewAfterSeconds: 30,
            };

    return new Response(JSON.stringify({
      ok: true,
      originReasonId,
      proposal,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const slice = createR5MiraSemanticEscalationSlice(fetcher);

  function currentStandingMatter() {
    if (observedStandingMatterId) {
      return slice.life.kernel.matter(observedStandingMatterId);
    }
    const projected = slice.life.currentLifeView().matters.find(
      (matter) => matter.semanticIntent?.kind === "standing_social_commitment"
        && matter.semanticIntent.counterpartyActorId === R5_IDA_ID,
    ) ?? null;
    if (!projected) return null;
    observedStandingMatterId = projected.id;
    return slice.life.kernel.matter(projected.id);
  }

  function snapshot() {
    const world = slice.world.publicSnapshot();
    const mira = world.actors.find((actor) => actor.id === R5_MIRA_ID) ?? null;
    const ida = world.actors.find((actor) => actor.id === R5_IDA_ID) ?? null;
    const standingMatter = currentStandingMatter();
    return {
      diagnostics: slice.diagnostics(),
      life: slice.life.currentLifeView(),
      semanticPressure: slice.mira.semanticPressureLifecycleSnapshot(),
      miraPosition: mira?.position ?? null,
      idaPosition: ida?.position ?? null,
      providerMode,
      providerContexts: structuredClone(providerContexts),
      recentOccurrences: slice.world.diagnostics().recentOccurrences,
    };
  }

  return {
    kind: "r5-mira-semantic-escalation",
    evidenceScenarioId: "browser-r5-mira-semantic-escalation",
    residentId: R5_MIRA_ID,
    // R5 begins reason-native; no matter exists until admitted semantic judgement.
    matterId: "matter.mira.r5.none",
    world: slice.world,
    kernel: slice.life.kernel,
    materialKnowledge: null,
    authority: slice.life.worldAuthority,
    residentLifeView(residentId: string): ResidentLifeCognitionView | null {
      return residentId === R5_MIRA_ID ? slice.life.currentLifeView() : null;
    },
    evidenceAction(actionId: string): unknown {
      if (actionId === "snapshot") return snapshot();
      if (actionId === "ida-address-mira") return slice.idaAddressMira();
      if (actionId === "ida-address-mira-newer") {
        return slice.idaAddressMira(R5_BROWSER_NEWER_ATTENTION_PROMPT);
      }
      if (actionId === "provider-mode-accept") {
        providerMode = "accept";
        return { providerMode };
      }
      if (actionId === "provider-mode-error") {
        providerMode = "error";
        return { providerMode };
      }
      if (actionId === "provider-mode-decline") {
        providerMode = "decline";
        return { providerMode };
      }
      if (actionId === "provider-mode-defer") {
        providerMode = "defer";
        return { providerMode };
      }
      if (actionId === "provider-mode-clarify") {
        providerMode = "clarify";
        return { providerMode };
      }
      if (actionId === "release-provider") {
        const release = releaseProvider;
        if (!release) throw new Error("R5 browser provider is not waiting for release");
        releaseProvider = null;
        release();
        return { released: true, tick: slice.world.tick };
      }
      throw new Error(`unknown R5 Mira semantic-escalation evidence action: ${actionId}`);
    },
    advanceOneWorldTick(): void {
      slice.advanceOneWorldTick();
    },
  };
}


interface R5LiveProviderObservation {
  sequence: number;
  startedAtTick: number;
  completedAtTick: number;
  status: number | null;
  elapsedMs: number;
  body: unknown;
  transportError: string | null;
}

function createR5MiraLiveSemanticEscalationScenario(): SpcNextResearchScenario {
  const providerObservations: R5LiveProviderObservation[] = [];
  let observationSequence = 0;

  const observedUpstream = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const startedAtTick = slice.world.tick;
    const startedAt = performance.now();
    try {
      const response = await fetch(input, init);
      let body: unknown = null;
      try {
        body = await response.clone().json();
      } catch {
        body = null;
      }
      providerObservations.push({
        sequence: observationSequence++,
        startedAtTick,
        completedAtTick: slice.world.tick,
        status: response.status,
        elapsedMs: performance.now() - startedAt,
        body: structuredClone(body),
        transportError: null,
      });
      return response;
    } catch (error) {
      providerObservations.push({
        sequence: observationSequence++,
        startedAtTick,
        completedAtTick: slice.world.tick,
        status: null,
        elapsedMs: performance.now() - startedAt,
        body: null,
        transportError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  // The real-provider experiment owns a literal one-upstream-request budget.
  // Any local retry after the first call receives a synthetic bounded 429 before
  // network IO, so this scene cannot recreate the September unattended spend loop.
  const providerBudget = createCognitionFetchHardBudget(observedUpstream, 1);
  const slice = createR5MiraSemanticEscalationSlice(
    providerBudget.fetch,
    { providerRuntimeMode: "five-resident-causal-v1" },
  );
  let lastWorldTick: ReturnType<typeof slice.advanceOneWorldTick> | null = null;

  function snapshot() {
    const world = slice.world.publicSnapshot();
    const mira = world.actors.find((actor) => actor.id === R5_MIRA_ID) ?? null;
    const ida = world.actors.find((actor) => actor.id === R5_IDA_ID) ?? null;
    return {
      diagnostics: slice.diagnostics(),
      life: slice.life.currentLifeView(),
      semanticPressure: slice.mira.semanticPressureLifecycleSnapshot(),
      cognitionRevision: slice.mira.cognitionRevision(),
      miraPosition: mira?.position ?? null,
      idaPosition: ida?.position ?? null,
      providerBudget: providerBudget.snapshot(),
      providerObservations: structuredClone(providerObservations),
      lastAdmissions: structuredClone(lastWorldTick?.admissions ?? []),
      recentOccurrences: slice.world.diagnostics().recentOccurrences,
    };
  }

  return {
    kind: "r5-mira-live-semantic-escalation",
    evidenceScenarioId: "browser-r5-mira-live-semantic-escalation",
    residentId: R5_MIRA_ID,
    matterId: "matter.mira.r5.live.none",
    world: slice.world,
    kernel: slice.life.kernel,
    materialKnowledge: null,
    authority: slice.life.worldAuthority,
    residentLifeView(residentId: string): ResidentLifeCognitionView | null {
      return residentId === R5_MIRA_ID ? slice.life.currentLifeView() : null;
    },
    evidenceAction(actionId: string): unknown {
      if (actionId === "snapshot") return snapshot();
      if (actionId === "ida-address-mira") return slice.idaAddressMira();
      throw new Error(`unknown R5 Mira live semantic-escalation evidence action: ${actionId}`);
    },
    advanceOneWorldTick(): void {
      lastWorldTick = slice.advanceOneWorldTick();
    },
  };
}


const R6_PROMISE_TEXT = "Tak, zostanę przy tobie jeszcze chwilę.";
const R6_PROMISE_GOAL = "pozostać dostępną dla Idy jeszcze przez chwilę";
const R6_PROMISE_MEANING = "Zobowiązałam się wobec Idy, że pozostanę z nią jeszcze chwilę.";
const R6_IDA_AWAY_X = 1_500;
const R6_IDA_HOME_X = 900;
const R6_IDA_MOTION_SPEED = 115;

function createR6MiraStandingSocialCommitmentScenario(): SpcNextResearchScenario {
  let releaseProvider: (() => void) | null = null;
  const providerContexts: unknown[] = [];
  let lastWorldTick: ReturnType<ReturnType<typeof createR5MiraSemanticEscalationSlice>["advanceOneWorldTick"]> | null = null;
  let observedStandingMatterId: string | null = null;
  let idaMotionSequence = 0;
  let idaMotion: {
    matterId: string;
    runId: string;
    targetX: number;
    direction: -1 | 1;
  } | null = null;
  const processedSightPercepts = new Set<string>();
  const relevanceEvents: unknown[] = [];

  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const context = JSON.parse(String(init?.body));
    providerContexts.push(structuredClone(context));
    await new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });

    const originReasonId = context?.reasons?.[0]?.id;
    if (typeof originReasonId !== "string") {
      throw new Error("R6 browser fixture provider received no exact origin reason");
    }

    return new Response(JSON.stringify({
      ok: true,
      originReasonId,
      proposal: {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "Ida addressed me directly and I choose to make one explicit social commitment.",
          intent: {
            kind: "communicate",
            goal: "tell Ida that I will remain with her for a while",
            targetActorId: R5_IDA_ID,
            targetRegionId: null,
            targetPosition: null,
            text: R6_PROMISE_TEXT,
          },
          standingSocialCommitment: {
            goal: R6_PROMISE_GOAL,
            commitment: R6_PROMISE_MEANING,
          },
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const slice = createR5MiraSemanticEscalationSlice(fetcher);
  const relevanceBridge = new ResidentMatterRelevanceBridge(slice.mira);

  function startIdaMotion(targetX: number): { matterId: string; runId: string; targetX: number } {
    if (idaMotion) throw new Error("R6 Ida motion already active");
    const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === R5_IDA_ID);
    if (!actor) throw new Error("R6 Ida actor missing");
    const delta = targetX - actor.position.x;
    if (Math.abs(delta) < 1) return { matterId: "", runId: "", targetX };

    const sequence = idaMotionSequence++;
    const evidence = slice.idaKernel.recordEvidence({
      id: `evidence.ida.r6.motion.${sequence}`,
      tick: slice.world.tick,
      kind: "life_context",
      summary: `Ida already decided to move toward x=${targetX} in the bounded R6 fixture.`,
    });
    const matterId = `matter.ida.r6.motion.${sequence}`;
    const runId = `run.ida.r6.motion.${sequence}`;
    slice.idaKernel.openMatter({
      id: matterId,
      originEvidenceId: evidence.id,
      semanticCourse: `move to bounded R6 fixture position x=${targetX}`,
    });
    slice.idaKernel.bindRun({
      matterId,
      taskId: `task.ida.r6.motion.${sequence}`,
      runId,
    });
    idaMotion = {
      matterId,
      runId,
      targetX,
      direction: delta < 0 ? -1 : 1,
    };
    return { matterId, runId, targetX };
  }

  function applyIdaMotionFrame(): void {
    if (!idaMotion) return;
    const applied = slice.idaAuthority.apply({
      runId: idaMotion.runId,
      effects: [{
        kind: "motion",
        desiredVelocity: { x: idaMotion.direction * R6_IDA_MOTION_SPEED, y: 0 },
      }],
    });
    if (applied.status !== "applied") {
      throw new Error("R6 Ida motion lost exact resident execution authority");
    }
  }

  function finishIdaMotionIfReached(): void {
    if (!idaMotion) return;
    const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === R5_IDA_ID);
    if (!actor) throw new Error("R6 Ida actor missing after World step");
    const reached = idaMotion.direction > 0
      ? actor.position.x >= idaMotion.targetX
      : actor.position.x <= idaMotion.targetX;
    if (!reached) return;

    const current = idaMotion;
    const reconciled = slice.idaKernel.reconcileRunOutcome({
      runId: current.runId,
      tick: slice.world.tick,
      status: "succeeded",
      summary: `Ida factually reached the bounded R6 motion target x=${current.targetX}.`,
    });
    if (reconciled.status !== "recorded") {
      throw new Error("R6 Ida motion run did not reconcile");
    }
    slice.idaKernel.resolveMatter(current.matterId);
    slice.idaAuthority.enforceMotionAuthority();
    idaMotion = null;
  }

  function observeNewIdaSight(): void {
    const privateContext = slice.mira.cognitionContext({
      residentId: R5_MIRA_ID,
      requestedAtTick: slice.world.tick,
      reasons: [],
    });
    for (const percept of privateContext.recentPercepts) {
      if (processedSightPercepts.has(percept.id)) continue;
      if (percept.phenomenon !== "actor_sight_enter" || percept.actorId !== R5_IDA_ID) continue;
      processedSightPercepts.add(percept.id);
      relevanceEvents.push({
        tick: slice.world.tick,
        percept: structuredClone(percept),
        result: relevanceBridge.observe(percept, slice.life.currentLifeView()),
      });
    }
  }

  function snapshot() {
    const world = slice.world.publicSnapshot();
    const mira = world.actors.find((actor) => actor.id === R5_MIRA_ID) ?? null;
    const ida = world.actors.find((actor) => actor.id === R5_IDA_ID) ?? null;
    const knownIda = slice.mira.cognitionContext({
      residentId: R5_MIRA_ID,
      requestedAtTick: slice.world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === R5_IDA_ID) ?? null;
    return {
      diagnostics: slice.diagnostics(),
      life: slice.life.currentLifeView(),
      semanticPressure: slice.mira.semanticPressureLifecycleSnapshot(),
      miraPosition: mira?.position ?? null,
      idaPosition: ida?.position ?? null,
      knownIda,
      providerContexts: structuredClone(providerContexts),
      lastWorldTick: structuredClone(lastWorldTick),
      standingMatterId: standingMatter?.id ?? null,
      standingMatter,
      activeRelevanceMatterIds: relevanceBridge.activeMatterIds(),
      relevanceEvents: structuredClone(relevanceEvents),
      idaMotion: idaMotion ? structuredClone(idaMotion) : null,
      recentOccurrences: slice.world.diagnostics().recentOccurrences,
    };
  }

  return {
    kind: "r6-mira-standing-social-commitment",
    evidenceScenarioId: "browser-r6-mira-standing-social-commitment",
    residentId: R5_MIRA_ID,
    matterId: "matter.mira.r6.standing.none",
    world: slice.world,
    kernel: slice.life.kernel,
    materialKnowledge: null,
    authority: slice.life.worldAuthority,
    residentLifeView(residentId: string): ResidentLifeCognitionView | null {
      return residentId === R5_MIRA_ID ? slice.life.currentLifeView() : null;
    },
    evidenceAction(actionId: string): unknown {
      if (actionId === "snapshot") return snapshot();
      if (actionId === "ida-address-mira") return slice.idaAddressMira();
      if (actionId === "release-provider") {
        const release = releaseProvider;
        if (!release) throw new Error("R6 browser provider is not waiting for release");
        releaseProvider = null;
        release();
        return { released: true, tick: slice.world.tick };
      }
      if (actionId === "ida-move-away") return startIdaMotion(R6_IDA_AWAY_X);
      if (actionId === "ida-move-back") return startIdaMotion(R6_IDA_HOME_X);
      if (actionId === "release-standing") {
        const standingMatter = currentStandingMatter();
        if (!standingMatter) throw new Error("R6 no standing commitment to release");
        const released = slice.life.originatedSocialCommitments.release({
          matterId: standingMatter.id,
          tick: slice.world.tick,
          reason: "Mira no longer treats this standing commitment as open.",
        });
        const reconciliation = relevanceBridge.reconcile(
          slice.life.currentLifeView(),
          slice.world.tick,
        );
        return {
          matter: released.matter,
          releaseEvidence: released.releaseEvidence,
          reconciliation,
        };
      }
      throw new Error(`unknown R6 Mira standing-social-commitment evidence action: ${actionId}`);
    },
    advanceOneWorldTick(): void {
      applyIdaMotionFrame();
      lastWorldTick = slice.advanceOneWorldTick();
      finishIdaMotionIfReached();
      observeNewIdaSight();
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
