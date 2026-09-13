import type { ItemDescription, KnownEntity } from "../living/types";

/** First integrated contract. Identity and acceptance belong to the host, never the provider. */
export interface Experience {
  id: string; tick: number; kind: string; text: string;
  sourceId?: string;
}
export interface Belief {
  id: string; claim: string; evidenceIds: string[];
  confidence: "tentative" | "expected" | "doubted";
}
export interface Concern {
  id: string; description: string; reason: string;
  status: "open" | "satisfied" | "abandoned"; evidenceIds: string[];
}
export interface ResidentIdentity {
  id: string; name: string; background: string;
}

/** Parameters belong to these initial capability modules, not an enum of every possible behaviour. */
export type CapabilityStep =
  | { skill: "travel"; targetId: string }
  | { skill: "accompany"; targetId: string; durationSeconds: number }
  | { skill: "deliver"; targetId: string; recipientId: string }
  | { skill: "gather"; description: ItemDescription; quantity: "one" | "all"; recipientId: string }
  | { skill: "put_down" }
  | { skill: "pause"; durationSeconds: number };
export interface Realization {
  id: string; concernId: string; steps: CapabilityStep[]; index: number;
  status: "running" | "completed" | "blocked" | "interrupted";
  outcome: string | null;
}
export interface CognitionContext {
  version: 1;
  resident: ResidentIdentity;
  tick: number;
  reasons: string[];
  observations: KnownEntity[];
  experiences: Experience[];
  beliefs: Belief[];
  concerns: Concern[];
  realization: Realization | null;
  places: Array<{ id: string; label: string }>;
}
export interface CognitionProposal {
  version: 1;
  speech: { text: string; mode: "normal" | "quiet" | "call" } | null;
  beliefs: Belief[];
  concerns: Concern[];
  /** null preserves the existing realization; a replacement never erases its concern. */
  plan: { concernId: string; steps: CapabilityStep[] } | null;
  reviewAfterSeconds: number;
}
export interface CognitionUsage {
  model: string;
  inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  elapsedMs: number;
}
export interface CognitionResponse { proposal: CognitionProposal; usage: CognitionUsage }
export type CognitionProvider = (context: CognitionContext, signal: AbortSignal) => Promise<CognitionResponse>;

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 800): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const seconds = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 300;
const tick = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const point = (v: unknown) => object(v) && keys(v, ["x", "y"]) &&
  typeof v.x === "number" && Number.isFinite(v.x) && typeof v.y === "number" && Number.isFinite(v.y);

/** Knowledge validation is against the supplied private context, never against hidden World truth. */
export function parseCapabilityStep(value: unknown, context: CognitionContext, structuralOnly = false): CapabilityStep | null {
  if (!object(value)) return null;
  const known = (id: unknown) => context.observations.find(e => e.id === id);
  const actor = (id: unknown) => structuralOnly || (known(id) && known(id)!.kind !== "item" && id !== context.resident.id);
  switch (value.skill) {
    case "travel":
      return keys(value, ["skill", "targetId"]) && text(value.targetId, 120) &&
        (structuralOnly || known(value.targetId) || context.places.some(p => p.id === value.targetId))
        ? { skill: "travel", targetId: value.targetId } : null;
    case "accompany":
      return keys(value, ["skill", "targetId", "durationSeconds"]) && text(value.targetId, 120) && actor(value.targetId) && seconds(value.durationSeconds)
        ? { skill: "accompany", targetId: value.targetId, durationSeconds: value.durationSeconds as number } : null;
    case "deliver":
      return keys(value, ["skill", "targetId", "recipientId"]) && text(value.targetId, 120) &&
        (structuralOnly || known(value.targetId)?.kind === "item") && text(value.recipientId, 120) && actor(value.recipientId)
        ? { skill: "deliver", targetId: value.targetId, recipientId: value.recipientId } : null;
    case "gather": {
      const d = value.description;
      if (!keys(value, ["skill", "description", "quantity", "recipientId"]) || !object(d) ||
        !keys(d, ["itemType", "color", "nearPlaceId", "withinPlaceId"]) ||
        !["mug", "hammer", "lantern", "any"].includes(String(d.itemType)) ||
        (d.color !== undefined && !["red", "blue"].includes(String(d.color))) ||
        [d.nearPlaceId, d.withinPlaceId].some(id => id !== undefined && (!text(id, 120) || (!structuralOnly && !context.places.some(p => p.id === id)))) ||
        !["one", "all"].includes(String(value.quantity)) || !text(value.recipientId, 120) || !actor(value.recipientId)) return null;
      const description: ItemDescription = { itemType: d.itemType as ItemDescription["itemType"],
        ...(d.color ? { color: d.color as ItemDescription["color"] } : {}),
        ...(typeof d.nearPlaceId === "string" ? { nearPlaceId: d.nearPlaceId } : {}),
        ...(typeof d.withinPlaceId === "string" ? { withinPlaceId: d.withinPlaceId } : {}) };
      return { skill: "gather", description,
        quantity: value.quantity as "one" | "all", recipientId: value.recipientId };
    }
    case "put_down": return keys(value, ["skill"]) ? { skill: "put_down" } : null;
    case "pause": return keys(value, ["skill", "durationSeconds"]) && seconds(value.durationSeconds)
      ? { skill: "pause", durationSeconds: value.durationSeconds as number } : null;
    default: return null;
  }
}

export function parseCognitionProposal(value: unknown, context: CognitionContext): CognitionProposal | null {
  if (!object(value) || !keys(value, ["version", "speech", "beliefs", "concerns", "plan", "reviewAfterSeconds"]) ||
    value.version !== 1 || !seconds(value.reviewAfterSeconds) ||
    !Array.isArray(value.beliefs) || value.beliefs.length > 8 || !Array.isArray(value.concerns) || value.concerns.length > 8) return null;
  const allowedEvidence = new Set(context.experiences.map(e => e.id));
  const references = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 12 && v.every(id => typeof id === "string" && allowedEvidence.has(id));
  const beliefs: Belief[] = [], concerns: Concern[] = [];
  for (const b of value.beliefs) {
    if (!object(b) || !keys(b, ["id", "claim", "evidenceIds", "confidence"]) || !text(b.id, 64) || !text(b.claim) ||
      !references(b.evidenceIds) || !["tentative", "expected", "doubted"].includes(String(b.confidence))) return null;
    beliefs.push({ id: b.id, claim: b.claim, evidenceIds: [...b.evidenceIds], confidence: b.confidence as Belief["confidence"] });
  }
  for (const c of value.concerns) {
    if (!object(c) || !keys(c, ["id", "description", "reason", "status", "evidenceIds"]) || !text(c.id, 64) ||
      !text(c.description) || !text(c.reason) || !references(c.evidenceIds) ||
      !["open", "satisfied", "abandoned"].includes(String(c.status))) return null;
    concerns.push({ id: c.id, description: c.description, reason: c.reason, status: c.status as Concern["status"], evidenceIds: [...c.evidenceIds] });
  }
  if (new Set(beliefs.map(b => b.id)).size !== beliefs.length || new Set(concerns.map(c => c.id)).size !== concerns.length) return null;
  let speech: CognitionProposal["speech"] = null;
  if (value.speech !== null) {
    const s = value.speech;
    if (!object(s) || !keys(s, ["text", "mode"]) || !text(s.text, 1200) || !["normal", "quiet", "call"].includes(String(s.mode))) return null;
    speech = { text: s.text, mode: s.mode as "normal" | "quiet" | "call" };
  }
  let plan: CognitionProposal["plan"] = null;
  const resultingConcerns = new Map(context.concerns.map(c => [c.id, c]));
  for (const concern of concerns) resultingConcerns.set(concern.id, concern);
  if (value.plan !== null) {
    const p = value.plan;
    if (!object(p) || !keys(p, ["concernId", "steps"]) || !text(p.concernId, 64) ||
      resultingConcerns.get(p.concernId)?.status !== "open" ||
      !Array.isArray(p.steps) || p.steps.length < 1 || p.steps.length > 12) return null;
    const steps = p.steps.map(s => parseCapabilityStep(s, context));
    if (steps.some(s => !s)) return null;
    plan = { concernId: p.concernId, steps: steps as CapabilityStep[] };
  }
  return { version: 1, speech, beliefs, concerns, plan, reviewAfterSeconds: value.reviewAfterSeconds as number };
}

/** Structural input guard shared by Worker and local captures. Incoming data never executes code. */
export function isCognitionContext(v: unknown): v is CognitionContext {
  if (!object(v) || !tick(v.tick)) return false;
  const currentTick = v.tick;
  if (!object(v) || !keys(v, ["version", "resident", "tick", "reasons", "places", "observations", "experiences", "beliefs", "concerns", "realization"]) ||
    v.version !== 1 || !object(v.resident) || !keys(v.resident, ["id", "name", "background"]) || !text(v.resident.id, 120) ||
    !text(v.resident.name, 120) || !text(v.resident.background, 4000) ||
    !tick(v.tick) ||
    !Array.isArray(v.reasons) || v.reasons.length > 16 || !v.reasons.every(r => text(r, 240)) ||
    !Array.isArray(v.places) || v.places.length > 32 || !v.places.every(p => object(p) && keys(p, ["id", "label"]) && text(p.id, 120) && text(p.label, 120)) ||
    !Array.isArray(v.observations) || v.observations.length > 64 ||
    !v.observations.every(e => object(e) && keys(e, ["id", "label", "kind", "position", "seenAtTick", "heldBy", "visible", "source", "lastCheckedAbsentAtTick", "observedMotion", "appearance"]) &&
      text(e.id, 120) && text(e.label, 120) && ["player", "npc", "item"].includes(String(e.kind)) && point(e.position) && tick(e.seenAtTick) && e.seenAtTick <= currentTick &&
      (e.heldBy === undefined || e.heldBy === null || text(e.heldBy, 120)) &&
      (e.visible === undefined || typeof e.visible === "boolean") &&
      (e.source === undefined || e.source === "sight" || e.source === "body") &&
      (e.lastCheckedAbsentAtTick === undefined || (tick(e.lastCheckedAbsentAtTick) && e.lastCheckedAbsentAtTick <= currentTick)) &&
      (e.observedMotion === undefined || point(e.observedMotion)) &&
      (e.appearance === undefined || (object(e.appearance) && keys(e.appearance, ["itemType", "color"]) &&
        ["mug", "hammer", "lantern"].includes(String(e.appearance.itemType)) &&
        (e.appearance.color === undefined || ["red", "blue"].includes(String(e.appearance.color)))))) ||
    !Array.isArray(v.experiences) || v.experiences.length > 128 ||
    !v.experiences.every(e => object(e) && keys(e, ["id", "tick", "kind", "text", "sourceId"]) && text(e.id, 120) && text(e.kind, 80) && text(e.text, 1600) &&
      tick(e.tick) && e.tick <= currentTick && (e.sourceId === undefined || text(e.sourceId, 120))) ||
    !Array.isArray(v.beliefs) || v.beliefs.length > 32 || !Array.isArray(v.concerns) || v.concerns.length > 24) return false;
  if (!v.beliefs.every(b => object(b) && keys(b, ["id", "claim", "evidenceIds", "confidence"]) && text(b.id, 64) && text(b.claim) && Array.isArray(b.evidenceIds) &&
    b.evidenceIds.length <= 12 && b.evidenceIds.every(id => text(id, 120)) && ["tentative", "expected", "doubted"].includes(String(b.confidence)))) return false;
  if (!v.concerns.every(c => object(c) && keys(c, ["id", "description", "reason", "status", "evidenceIds"]) && text(c.id, 64) && text(c.description) && text(c.reason) && Array.isArray(c.evidenceIds) &&
    c.evidenceIds.length <= 12 && c.evidenceIds.every(id => text(id, 120)) && ["open", "satisfied", "abandoned"].includes(String(c.status)))) return false;
  if (v.realization !== null) {
    const r = v.realization;
    if (!object(r) || !keys(r, ["id", "concernId", "steps", "index", "status", "outcome"]) || !text(r.id, 120) || !text(r.concernId, 64) ||
      !Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > 12 ||
      !Number.isSafeInteger(r.index) || (r.index as number) < 0 || (r.index as number) > r.steps.length ||
      !["running", "completed", "blocked", "interrupted"].includes(String(r.status)) ||
      (r.outcome !== null && !text(r.outcome, 1600))) return false;
    // Existing methods can retain a once-known target after it leaves working perception.
    if (!r.steps.every(s => parseCapabilityStep(s, v as unknown as CognitionContext, true))) return false;
  }
  for (const entries of [v.places, v.observations, v.experiences, v.beliefs, v.concerns]) {
    if (new Set(entries.map(e => e.id)).size !== entries.length) return false;
  }
  const evidence = new Set(v.experiences.map(e => e.id));
  if (![...v.beliefs, ...v.concerns].every(b => b.evidenceIds.every((id: string) => evidence.has(id)))) return false;
  return true;
}
