import type { FiveResidentManualResearchProbe } from "../spc-next/five-resident-unified-living-runtime";
import type { SpcNextResearchFrame } from "./spc-next-research-scene";

/**
 * One local, deliberately downloaded evidence package for an explicitly armed
 * operator experiment. No network, storage, browser credential or timer access.
 * This package intentionally contains PRIVATE resident context submitted to the
 * Worker: treat the downloaded file as research-sensitive.
 */
export function buildSpcManualProbeEvidence(
  before: SpcNextResearchFrame,
  after: SpcNextResearchFrame,
  probe: FiveResidentManualResearchProbe,
  exportedAtUtc: string,
) {
  if (!probe.requestId.trim()
    || before.selectedResidentId !== probe.residentId
    || after.selectedResidentId !== probe.residentId
    || before.snapshot.tick !== probe.dispatchedAtTick
    || after.snapshot.tick < probe.dispatchedAtTick
    || !Number.isFinite(Date.parse(exportedAtUtc))) {
    throw new Error("manual probe evidence needs one exact resident, request and ordered World frames");
  }

  const events = after.livingDiagnostics?.recentProviderEvents.filter(
    (event) => event.requestId === probe.requestId
      && event.residentId === probe.residentId,
  ) ?? [];
  const locallyApplied = probe.localSettlement?.status === "applied";
  const admitted = locallyApplied
    ? events.findLast((event) => event.status === "admitted" && event.admittedChoice)
      ?.admittedChoice ?? null
    : null;
  const matter = admitted?.matterId
    ? after.selectedLife?.matters.find((candidate) => candidate.id === admitted.matterId) ?? null
    : null;
  // Exact factual outcome only. A different later run and a model's own prose
  // are NOT evidence that the selected command physically succeeded.
  const matchedWorldOutcome = admitted?.runId && matter?.lastOutcomeEvidence?.sourceRunId === admitted.runId
    ? matter.lastOutcomeEvidence
    : null;

  return structuredClone({
    schemaVersion: 1 as const,
    origin: "manual-operator-local-browser-download" as const,
    sourceRevision: null as null, // Git/deployment SHA must be verified separately
    exportedAtUtc,
    warning: "Contains resident-private model context; no secrets captured. Model statements are not World facts. HTTP usage is not billing proof.",
    subject: {
      residentId: probe.residentId,
      requestId: probe.requestId,
      dispatchedAtWorldTick: probe.dispatchedAtTick,
    },
    before: projectFrame(before),
    modelExchange: {
      exactSubmittedContext: probe.submitted,
      dispatchedReasonBatch: probe.reasons,
      untrustedProviderArrival: probe.providerArrival,
      localSettlement: probe.localSettlement,
      transportFailed: probe.transportFailed,
      // No guesses about cached tokens, complimentary eligibility or actual charge.
      providerReportedUsage: probe.providerArrival?.usage ?? null,
    },
    after: projectFrame(after),
    trace: {
      sameRequestEvents: events,
      admittedChoice: admitted,
      relevantMatter: matter,
      exactRunFactualOutcome: matchedWorldOutcome,
      outcomeProved: matchedWorldOutcome !== null,
      // A decline/defer without a new matter is a valid judgement, not a fake action.
      didNotCreateNewMatter: locallyApplied && admitted?.matterId === null,
    },
    scope: {
      upstreamCallsBefore: before.livingDiagnostics?.providerHardBudget.upstreamRequestsStarted ?? null,
      upstreamCallsAfter: after.livingDiagnostics?.providerHardBudget.upstreamRequestsStarted ?? null,
      operatorSelectedSameResident: true,
      serverTelemetry: false,
      workerAuthVerified: false,
      serverGlobalSpendLimitVerified: false,
      isAutonomousLifePass: false,
    },
  });
}

function projectFrame(frame: SpcNextResearchFrame) {
  return {
    worldTick: frame.snapshot.tick,
    selectedResidentId: frame.selectedResidentId,
    selectedRegionId: frame.selectedRegionId,
    publicWorld: {
      actors: frame.snapshot.actors,
      residents: frame.snapshot.residents,
    },
    privateResident: {
      life: frame.selectedLife,
      diagnostics: frame.selectedDiagnostics,
    },
    // Only bounded recent occurrences, which may have rolled out earlier facts.
    recentWorldOccurrences: frame.recentOccurrences.slice(-64),
    worldMotionOutcomes: frame.motionOutcomes,
    cognition: frame.livingDiagnostics?.cognition ?? null,
    upstreamAttemptCount: frame.livingDiagnostics?.providerHardBudget.upstreamRequestsStarted ?? null,
  };
}
