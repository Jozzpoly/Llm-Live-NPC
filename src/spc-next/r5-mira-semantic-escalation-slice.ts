import type {
  CognitionFetch,
} from "./resident-cognition-live-host";
import type {
  ResidentCausalProviderAdmission,
  ResidentCausalProviderArrival,
} from "./resident-causal-provider-transport";
import { ResidentCausalProviderTransport } from "./resident-causal-provider-transport";
import {
  ResidentCausalCognitionLane,
  type ResidentCausalCognitionRequest,
} from "./resident-causal-cognition-lane";
import {
  CAUSAL_PROVIDER_ERROR_RETRY_TICKS,
  CAUSAL_REJECT_RETRY_TICKS,
  CAUSAL_STALE_RETRY_TICKS,
} from "./resident-causal-cognition-retry-policy";
import { ResidentCausalExecutionCoordinator, type ResidentCausalExecutionStep } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";
import type { WorldOccurrence } from "./contracts";

export const R5_MIRA_ID = "resident.mira";
export const R5_IDA_ID = "resident.ida";
export const R5_REGION_ID = "r5-common-room";
export const R5_IDA_PROMPT = "Mira, odpowiesz mi, czy zostaniesz chwilę przy stole?";
export const R5_MIRA_SEMANTIC_REPLY = "Tak, zostanę chwilę.";

const LOCAL_SPEECH_RADIUS = 420;
const PROVIDER_EVENT_LIMIT = 128;

export interface R5SemanticProviderEvent {
  sequence: number;
  tick: number;
  status:
    | "request_started"
    | "arrival_ready"
    | "admitted"
    | "provider_error";
  requestId: string;
  detail: string;
}

export interface R5SemanticEscalationDiagnostics {
  tick: number;
  providerRequestCount: number;
  providerInFlightRequestId: string | null;
  providerInboxCount: number;
  providerRetryNotBeforeTick: number;
  pendingReasonIds: readonly string[];
  matterIds: readonly string[];
  focusedRunId: string | null;
  recentProviderEvents: readonly R5SemanticProviderEvent[];
}

export interface R5SemanticWorldTick {
  tick: number;
  execution: ResidentCausalExecutionStep;
  admissions: readonly ResidentCausalProviderAdmission[];
}

/**
 * Compact R5-A organism.
 *
 * This slice intentionally begins with no Mira matter. Ida can create one factual
 * addressed-speech reason, after which the resident-generic causal cognition lane may
 * freeze a provider request. Provider completion enters an inert inbox. Only the next
 * explicit advanceOneWorldTick() may admit it, and only resident-local grounding may
 * turn an accepted semantic proposal into a durable matter/run.
 *
 * No player actor exists in this composition.
 */
export interface R5MiraSemanticEscalationSliceOptions {
  readonly providerRuntimeMode?: string | null;
}

export function createR5MiraSemanticEscalationSlice(
  fetcher: CognitionFetch,
  options: R5MiraSemanticEscalationSliceOptions = {},
) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 1_000 },
    regions: [{
      id: R5_REGION_ID,
      label: "R5 Common Room",
      minX: 0,
      minY: 0,
      maxX: 1_600,
      maxY: 1_000,
    }],
    anchors: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });

  const mira = world.addResident(R5_MIRA_ID, "Mira", { x: 700, y: 500 });
  world.addResident(R5_IDA_ID, "Ida", { x: 900, y: 500 });
  world.familiarizeResidentWithRegions(R5_MIRA_ID, [R5_REGION_ID]);
  world.familiarizeResidentWithRegions(R5_IDA_ID, [R5_REGION_ID]);

  const navigation = new RegionNavigationGraph(
    [{ id: R5_REGION_ID, destinationPoint: { x: 700, y: 500 } }],
    [],
  );
  const life = new ResidentCausalLifeSubstrate({
    residentId: R5_MIRA_ID,
    resident: mira,
    world,
    navigation,
    identityNamespace: "mira-r5",
  });
  const execution = new ResidentCausalExecutionCoordinator(life);
  const cognition = new ResidentCausalCognitionLane(life);
  const transport = new ResidentCausalProviderTransport(
    "/api/spc-next/life-intent",
    fetcher,
    { runtimeMode: options.providerRuntimeMode ?? null },
  );

  // Ida's fixture speech is still a real resident World effect under exact run
  // authority. The research fixture supplies only her already-decided bounded act.
  const idaKernel = new ResidentContinuityKernel();
  const idaAuthority = new ResidentWorldExecutionAuthority(
    R5_IDA_ID,
    idaKernel,
    world,
  );
  let idaSequence = 0;

  const providerInbox: ResidentCausalProviderArrival[] = [];
  const recentProviderEvents: R5SemanticProviderEvent[] = [];
  let providerInFlight: ResidentCausalCognitionRequest | null = null;
  let providerRequestCount = 0;
  let providerRetryNotBeforeTick = 0;
  let providerEventSequence = 0;

  function recordProviderEvent(
    status: R5SemanticProviderEvent["status"],
    requestId: string,
    detail: string,
  ): void {
    recentProviderEvents.push({
      sequence: providerEventSequence++,
      tick: world.tick,
      status,
      requestId,
      detail,
    });
    while (recentProviderEvents.length > PROVIDER_EVENT_LIMIT) {
      recentProviderEvents.shift();
    }
  }

  function startProviderIfReady(): void {
    if (providerInFlight || providerInbox.length > 0) return;
    if (world.tick < providerRetryNotBeforeTick) return;
    const request = cognition.takeReadyRequest();
    if (!request) return;

    providerInFlight = request;
    providerRequestCount += 1;
    recordProviderEvent(
      "request_started",
      request.id,
      "one resident-owned cognition batch started",
    );

    void transport.request(request).then((arrival) => {
      if (providerInFlight !== request) return;
      providerInFlight = null;
      providerInbox.push(arrival);
      recordProviderEvent(
        "arrival_ready",
        request.id,
        arrival.status === "proposal"
          ? "provider proposal completed into inert arrival inbox"
          : "provider error completed into inert arrival inbox",
      );
    });
  }

  function admitProviderInbox(): ResidentCausalProviderAdmission[] {
    const ready = providerInbox.splice(0, providerInbox.length);
    const admissions: ResidentCausalProviderAdmission[] = [];
    for (const arrival of ready) {
      const admission = transport.admit(arrival, cognition);
      admissions.push(admission);
      if (admission.status === "provider_error") {
        providerRetryNotBeforeTick = world.tick + CAUSAL_PROVIDER_ERROR_RETRY_TICKS;
        recordProviderEvent(
          "provider_error",
          arrival.requestId,
          admission.code + (admission.detail ? ": " + admission.detail : ""),
        );
      } else {
        if (admission.status === "applied") {
          providerRetryNotBeforeTick = 0;
        } else if (admission.status === "stale") {
          providerRetryNotBeforeTick = world.tick + CAUSAL_STALE_RETRY_TICKS;
        } else {
          providerRetryNotBeforeTick = world.tick + CAUSAL_REJECT_RETRY_TICKS;
        }
        recordProviderEvent(
          "admitted",
          arrival.requestId,
          admission.status,
        );
      }
    }
    return admissions;
  }

  function advanceOneWorldTick(): R5SemanticWorldTick {
    // Existing durable body work is allowed to continue while provider work is in
    // flight. Provider admission occurs only after the shared World boundary.
    const executionStep = execution.stepFocusedRun();
    world.step();

    const admissions = admitProviderInbox();
    startProviderIfReady();

    return {
      tick: world.tick,
      execution: structuredClone(executionStep),
      admissions: structuredClone(admissions),
    };
  }

  function idaAddressMira(text = R5_IDA_PROMPT): WorldOccurrence {
    if (!text.trim()) throw new Error("R5 Ida addressed speech must be non-empty");

    const sequence = idaSequence++;
    const evidence = idaKernel.recordEvidence({
      id: "evidence.ida.r5.address." + sequence,
      tick: world.tick,
      kind: "life_context",
      summary: "Ida already decided to address Mira once in the bounded R5 fixture.",
    });
    const matterId = "matter.ida.r5.address." + sequence;
    const runId = "run.ida.r5.address." + sequence;
    idaKernel.openMatter({
      id: matterId,
      originEvidenceId: evidence.id,
      semanticCourse: "address Mira once in the R5 semantic-escalation fixture",
    });
    idaKernel.bindRun({
      matterId,
      taskId: "task.ida.r5.address." + sequence,
      runId,
    });

    const applied = idaAuthority.apply({
      runId,
      effects: [{
        kind: "speech",
        text,
        radius: LOCAL_SPEECH_RADIUS,
        addressedActorIds: [R5_MIRA_ID],
      }],
    });
    if (applied.status !== "applied") {
      throw new Error("Ida R5 addressed speech failed resident execution authority");
    }
    const occurrence = applied.occurrences.find(
      (candidate) => candidate.kind === "speech" && candidate.text === text,
    );
    if (!occurrence) throw new Error("Ida R5 addressed speech created no World occurrence");

    const reconciled = idaKernel.reconcileRunOutcome({
      runId,
      tick: world.tick,
      status: "succeeded",
      summary: "Ida factually addressed Mira in World.",
    });
    if (reconciled.status !== "recorded") {
      throw new Error("Ida R5 speech run did not reconcile");
    }
    idaKernel.resolveMatter(matterId);
    idaAuthority.enforceMotionAuthority();
    return structuredClone(occurrence);
  }

  function diagnostics(): R5SemanticEscalationDiagnostics {
    return {
      tick: world.tick,
      providerRequestCount,
      providerInFlightRequestId: providerInFlight?.id ?? null,
      providerInboxCount: providerInbox.length,
      providerRetryNotBeforeTick,
      pendingReasonIds: mira.pendingCognitionReasons()
        .map((reason) => reason.id)
        .sort((left, right) => left.localeCompare(right)),
      matterIds: life.matterScope.matterIds(),
      focusedRunId: life.focus.focusedRun(),
      recentProviderEvents: recentProviderEvents.map((event) => structuredClone(event)),
    };
  }

  return {
    world,
    mira,
    life,
    execution,
    cognition,
    transport,
    idaKernel,
    idaAuthority,
    advanceOneWorldTick,
    idaAddressMira,
    diagnostics,
  };
}
