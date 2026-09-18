import type { ResidentLifeCognitionContext } from "../src/spc-next/resident-life-cognition-context";
import type { ResidentLifeSelfContext } from "../src/spc-next/resident-life-self-context";
import type {
  ResidentLifeCognitionView,
  ResidentLifeEvidenceView,
  ResidentLifeMatterView,
  ResidentLifeRunView,
} from "../src/spc-next/resident-life-cognition-view";
import type { ResidentMatterIntent } from "../src/spc-next/resident-continuity-kernel";
import { sanitizeSpcNextContext } from "./spc-next-cognition";

const MAX_MATTERS = 32;
const MAX_SELF_DRIVES = 8;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const safeInt = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const positiveInt = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1;
const identifier = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(value) ? value : null;
const boundedText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string" || value.length > maxLength) return null;
  const text = value.trim();
  return text && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text) ? text : null;
};

/**
 * Strict transport sanitizer for the shared provider-facing resident-life context.
 *
 * This function owns no policy. A focused body, a free body, deferred demands and
 * unfocused exact runs may all be valid if the supplied recovered-life projection is
 * internally consistent. Endpoint-specific policy (for example, the life-choice
 * requirement that body be free with at least two deferred candidates) belongs after
 * this boundary.
 */
export function sanitizeSpcNextLifeContext(value: unknown): ResidentLifeCognitionContext | null {
  if (!record(value) || value.contract !== "resident_life_cognition_v1" || !record(value.life)) return null;
  if (!hasRequiredAndOptionalKeys(value, [
    "contract", "resident", "tick", "currentRegionId", "reasons", "localActivity",
    "recentPercepts", "concerns", "beliefs", "knownActors", "knownRegions", "life",
  ], ["self"])) return null;

  const privateContext = sanitizeSpcNextContext({
    version: 1,
    resident: value.resident,
    tick: value.tick,
    currentRegionId: value.currentRegionId,
    reasons: value.reasons,
    currentActivity: value.localActivity,
    recentPercepts: value.recentPercepts,
    concerns: value.concerns,
    beliefs: value.beliefs,
    knownActors: value.knownActors,
    knownRegions: value.knownRegions,
  });
  if (!privateContext) return null;

  const life = sanitizeLife(value.life, privateContext.tick);
  if (!life) return null;
  const self = Object.hasOwn(value, "self") ? sanitizeSelf(value.self) : null;
  if (Object.hasOwn(value, "self") && !self) return null;

  return {
    contract: "resident_life_cognition_v1",
    resident: structuredClone(privateContext.resident),
    ...(self ? { self } : {}),
    tick: privateContext.tick,
    currentRegionId: privateContext.currentRegionId,
    reasons: structuredClone(privateContext.reasons),
    localActivity: structuredClone(privateContext.currentActivity),
    recentPercepts: structuredClone(privateContext.recentPercepts),
    concerns: structuredClone(privateContext.concerns),
    beliefs: structuredClone(privateContext.beliefs),
    knownActors: structuredClone(privateContext.knownActors),
    knownRegions: structuredClone(privateContext.knownRegions),
    life,
  };
}

function sanitizeSelf(value: unknown): ResidentLifeSelfContext | null {
  if (!record(value) || value.version !== 1 || !hasOnlyKeys(value, ["version", "role", "drives"])) return null;
  const role = boundedText(value.role, 800);
  if (!role || !Array.isArray(value.drives) || value.drives.length < 1 || value.drives.length > MAX_SELF_DRIVES) return null;

  const drives: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.drives) {
    const drive = boundedText(raw, 1_200);
    if (!drive || seen.has(drive)) return null;
    seen.add(drive);
    drives.push(drive);
  }
  return { version: 1, role, drives };
}

function sanitizeLife(value: unknown, contextTick: number): ResidentLifeCognitionView | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.matters) || value.matters.length > MAX_MATTERS || !record(value.body)) return null;
  if (!hasOnlyKeys(value, ["version", "matters", "body"]) || !hasOnlyKeys(value.body, ["focusedRunId", "deferredRunIds"])) return null;

  const focusedRunId = value.body.focusedRunId === null ? null : identifier(value.body.focusedRunId);
  if (focusedRunId === null && value.body.focusedRunId !== null) return null;
  if (!Array.isArray(value.body.deferredRunIds) || value.body.deferredRunIds.length > MAX_MATTERS) return null;

  const deferredRunIds: string[] = [];
  const deferredSet = new Set<string>();
  for (const raw of value.body.deferredRunIds) {
    const runId = identifier(raw);
    if (!runId || deferredSet.has(runId)) return null;
    deferredSet.add(runId);
    deferredRunIds.push(runId);
  }
  if (focusedRunId !== null && deferredSet.has(focusedRunId)) return null;

  const matters: ResidentLifeMatterView[] = [];
  const matterIds = new Set<string>();
  const runIds = new Set<string>();
  for (const raw of value.matters) {
    const matter = sanitizeMatter(raw, contextTick);
    if (!matter || matterIds.has(matter.id)) return null;
    matterIds.add(matter.id);

    if (matter.activeRun) {
      if (runIds.has(matter.activeRun.runId)) return null;
      runIds.add(matter.activeRun.runId);
      const bodyConsistent = matter.activeRun.bodyState === "focused"
        ? matter.activeRun.runId === focusedRunId && !deferredSet.has(matter.activeRun.runId)
        : matter.activeRun.bodyState === "deferred"
          ? matter.activeRun.runId !== focusedRunId && deferredSet.has(matter.activeRun.runId)
          : matter.activeRun.runId !== focusedRunId && !deferredSet.has(matter.activeRun.runId);
      if (!bodyConsistent) return null;
      if (matter.activeRun.canMutateWorld
        && (matter.status !== "active" || matter.activeRun.semanticRevision !== matter.semanticRevision)) return null;
    }
    matters.push(matter);
  }

  if (focusedRunId !== null && !runIds.has(focusedRunId)) return null;
  if (deferredRunIds.some((runId) => !runIds.has(runId))) return null;
  return { version: 1, matters, body: { focusedRunId, deferredRunIds } };
}

function sanitizeMatter(value: unknown, contextTick: number): ResidentLifeMatterView | null {
  const required = [
    "id", "status", "semanticRevision", "semanticCourse", "suspendedByMatterId",
    "originEvidence", "semanticEvidence", "lastOutcomeEvidence", "activeRun",
  ] as const;
  if (!record(value) || !hasRequiredAndOptionalKeys(value, required, ["semanticIntent"])) return null;

  const id = identifier(value.id);
  const status = ["active", "suspended", "resolved", "cancelled"].includes(String(value.status))
    ? value.status as ResidentLifeMatterView["status"] : null;
  const semanticCourse = boundedText(value.semanticCourse, 2_000);
  const suspendedByMatterId = value.suspendedByMatterId === null ? null : identifier(value.suspendedByMatterId);
  if (!id || !status || !positiveInt(value.semanticRevision) || !semanticCourse
    || (suspendedByMatterId === null && value.suspendedByMatterId !== null)) return null;
  if (status === "suspended" && suspendedByMatterId === null) return null;
  if (status !== "suspended" && suspendedByMatterId !== null) return null;

  const semanticIntent = !Object.hasOwn(value, "semanticIntent") || value.semanticIntent === null
    ? null
    : sanitizeMatterIntent(value.semanticIntent);
  if (semanticIntent === null && Object.hasOwn(value, "semanticIntent") && value.semanticIntent !== null) return null;

  const originEvidence = value.originEvidence === null ? null : sanitizeEvidence(value.originEvidence, contextTick);
  const semanticEvidence = value.semanticEvidence === null ? null : sanitizeEvidence(value.semanticEvidence, contextTick);
  const lastOutcomeEvidence = value.lastOutcomeEvidence === null ? null : sanitizeEvidence(value.lastOutcomeEvidence, contextTick);
  if ((originEvidence === null && value.originEvidence !== null)
    || (semanticEvidence === null && value.semanticEvidence !== null)
    || (lastOutcomeEvidence === null && value.lastOutcomeEvidence !== null)) return null;

  const activeRun = value.activeRun === null ? null : sanitizeRun(value.activeRun);
  if (activeRun === null && value.activeRun !== null) return null;

  return {
    id,
    status,
    semanticRevision: value.semanticRevision,
    semanticCourse,
    semanticIntent,
    suspendedByMatterId,
    originEvidence,
    semanticEvidence,
    lastOutcomeEvidence,
    activeRun,
  };
}

function sanitizeMatterIntent(value: unknown): ResidentMatterIntent | null {
  if (!record(value) || !hasOnlyKeys(value, ["kind", "goal", "targetRegionId"])) return null;
  if (value.kind !== "travel_region") return null;
  const goal = boundedText(value.goal, 1_200);
  const targetRegionId = identifier(value.targetRegionId);
  if (!goal || !targetRegionId) return null;
  return { kind: "travel_region", goal, targetRegionId };
}

function sanitizeEvidence(value: unknown, contextTick: number): ResidentLifeEvidenceView | null {
  if (!record(value) || !hasOnlyKeys(value, ["id", "tick", "kind", "summary"])) return null;
  const id = identifier(value.id);
  const kind = boundedText(value.kind, 120);
  const summary = boundedText(value.summary, 4_000);
  if (!id || !safeInt(value.tick) || value.tick > contextTick || !kind || !summary) return null;
  return { id, tick: value.tick, kind, summary };
}

function sanitizeRun(value: unknown): ResidentLifeRunView | null {
  if (!record(value) || !hasOnlyKeys(value, ["runId", "taskId", "semanticRevision", "canMutateWorld", "bodyState"])) return null;
  const runId = identifier(value.runId);
  const taskId = identifier(value.taskId);
  const bodyState = ["focused", "deferred", "unfocused"].includes(String(value.bodyState))
    ? value.bodyState as ResidentLifeRunView["bodyState"] : null;
  if (!runId || !taskId || !positiveInt(value.semanticRevision) || typeof value.canMutateWorld !== "boolean" || !bodyState) return null;
  return { runId, taskId, semanticRevision: value.semanticRevision, canMutateWorld: value.canMutateWorld, bodyState };
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => Object.hasOwn(value, key));
}

function hasRequiredAndOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key))
    && required.every((key) => Object.hasOwn(value, key));
}
