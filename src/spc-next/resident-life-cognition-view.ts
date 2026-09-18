import type { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import type { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import type {
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
  ResidentTaskRunBinding,
} from "./resident-continuity-kernel";

export type ResidentLifeBodyRunState = "focused" | "deferred" | "unfocused";

export interface ResidentLifeEvidenceView {
  id: string;
  tick: number;
  kind: string;
  summary: string;
}

export interface ResidentLifeRunView {
  runId: string;
  taskId: string;
  semanticRevision: number;
  canMutateWorld: boolean;
  bodyState: ResidentLifeBodyRunState;
}

export interface ResidentLifeMatterView {
  id: string;
  status: ResidentMatter["status"];
  semanticRevision: number;
  semanticCourse: string;
  /**
   * New resident-owned structured meaning. Optional only so existing
   * resident_life_cognition_v1 fixtures/transport payloads remain readable during
   * migration; kernel-backed projection always emits object-or-null explicitly.
   */
  semanticIntent?: ResidentMatter["semanticIntent"];
  suspendedByMatterId: string | null;
  originEvidence: ResidentLifeEvidenceView | null;
  semanticEvidence: ResidentLifeEvidenceView | null;
  lastOutcomeEvidence: ResidentLifeEvidenceView | null;
  activeRun: ResidentLifeRunView | null;
}

export interface ResidentLifeCognitionView {
  version: 1;
  matters: readonly ResidentLifeMatterView[];
  body: {
    focusedRunId: string | null;
    deferredRunIds: readonly string[];
  };
}

export interface CaptureResidentLifeCognitionViewInput {
  kernel: ResidentContinuityKernel;
  focus: ResidentExecutionFocusAuthority;
  /** Optional when this resident has no demand-continuity seam installed yet. */
  arbitrator?: ResidentExecutionArbitrator | null;
  /**
   * Explicit resident-owned matter scope for this review. The projector never scans
   * World/global state and never invents a registry alongside the continuity kernel.
   */
  matterIds: readonly string[];
}

/**
 * Read-only semantic/execution truth projection for higher cognition.
 *
 * `ResidentRuntime.currentActivity` remains a local-brain/legacy activity projection;
 * it is not sufficient once recovered continuing matters and exact runs own the body.
 * This view composes already-authoritative resident-owned state without mutating it or
 * creating a second life model. The caller explicitly chooses which resident matters
 * belong in this cognition review.
 *
 * Structured matter intent is resident semantic truth. Concrete execution methods
 * such as routes, destinations and executor state deliberately stay outside this view.
 */
export function captureResidentLifeCognitionView(
  input: CaptureResidentLifeCognitionViewInput,
): ResidentLifeCognitionView {
  const matterIds = uniqueMatterIds(input.matterIds);
  const focusedRunId = input.focus.focusedRun();
  const deferredRunIds = input.arbitrator?.deferredRunIds() ?? [];
  const deferred = new Set(deferredRunIds);
  const recentEvidenceById = new Map(
    input.kernel.recentEvidenceSnapshot().map((evidence) => [evidence.id, evidence] as const),
  );

  const matters = matterIds.map((matterId) => {
    const matter = input.kernel.matter(matterId);
    if (!matter) throw new Error(`unknown resident life matter: ${matterId}`);
    const binding = matter.activeRunId ? input.kernel.runBinding(matter.activeRunId) : null;
    return projectMatter(
      input.kernel,
      matter,
      binding,
      focusedRunId,
      deferred,
      recentEvidenceById,
    );
  });

  return {
    version: 1,
    matters,
    body: {
      focusedRunId,
      deferredRunIds: [...deferredRunIds],
    },
  };
}

function projectMatter(
  kernel: ResidentContinuityKernel,
  matter: ResidentMatter,
  binding: ResidentTaskRunBinding | null,
  focusedRunId: string | null,
  deferredRunIds: ReadonlySet<string>,
  recentEvidenceById: ReadonlyMap<string, ResidentKernelEvidence>,
): ResidentLifeMatterView {
  const activeRun = binding ? {
    runId: binding.runId,
    taskId: binding.taskId,
    semanticRevision: binding.semanticRevision,
    canMutateWorld: kernel.canRunMutateWorld(binding.runId),
    bodyState: binding.runId === focusedRunId
      ? "focused" as const
      : deferredRunIds.has(binding.runId)
        ? "deferred" as const
        : "unfocused" as const,
  } : null;

  return {
    id: matter.id,
    status: matter.status,
    semanticRevision: matter.semanticRevision,
    semanticCourse: matter.semanticCourse,
    semanticIntent: matter.semanticIntent ? structuredClone(matter.semanticIntent) : null,
    suspendedByMatterId: matter.suspendedByMatterId,
    originEvidence: projectEvidence(kernel.originEvidence(matter.id)),
    semanticEvidence: projectEvidence(kernel.semanticEvidence(matter.id)),
    lastOutcomeEvidence: projectEvidence(
      kernel.lastOutcomeEvidence(matter.id)
      ?? (matter.lastOutcomeEvidenceId ? recentEvidenceById.get(matter.lastOutcomeEvidenceId) ?? null : null),
    ),
    activeRun,
  };
}

function projectEvidence(evidence: ResidentKernelEvidence | null): ResidentLifeEvidenceView | null {
  if (!evidence) return null;
  return {
    id: evidence.id,
    tick: evidence.tick,
    kind: evidence.kind,
    summary: evidence.summary,
  };
}

function uniqueMatterIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("resident life cognition matter id must be non-empty");
    }
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
