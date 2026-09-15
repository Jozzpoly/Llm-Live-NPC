import {
  ResidentSemanticProviderMembrane,
  type ResidentSemanticProviderSettlement,
} from "./resident-semantic-provider-membrane";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

export type SemanticFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ResidentSemanticLiveResult =
  | { status: "applied"; settlement: Extract<ResidentSemanticProviderSettlement, { status: "applied" }> }
  | { status: "stale"; settlement: Extract<ResidentSemanticProviderSettlement, { status: "stale" }> }
  | { status: "provider_error"; code: "network" | "http" | "invalid_response" | "correlation_mismatch" };

const MAX_RESPONSE_CHARACTERS = 32_768;

/**
 * Browser/runtime host for the recovered matter-scoped semantic provider path.
 *
 * This host owns transport correlation only. Resident mutation authority stays in
 * ResidentSemanticProviderMembrane. Any failed transport abandons exactly the local
 * provider attempt so dead request authority cannot linger.
 */
export class ResidentSemanticLiveHost {
  constructor(
    private readonly kernel: ResidentContinuityKernel,
    private readonly membrane = new ResidentSemanticProviderMembrane(),
    private readonly endpoint = "/api/spc-next/semantic",
    private readonly fetcher: SemanticFetch = fetch,
  ) {}

  async reviewMatter(matterId: string, signal?: AbortSignal): Promise<ResidentSemanticLiveResult> {
    const run = this.membrane.prepare(this.kernel, matterId);
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(run),
        signal,
      });
    } catch {
      this.membrane.abandon(this.kernel, run.providerRunId);
      return { status: "provider_error", code: "network" };
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      this.membrane.abandon(this.kernel, run.providerRunId);
      return { status: "provider_error", code: "http" };
    }

    let raw: unknown;
    try {
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("semantic response too large");
      raw = JSON.parse(text);
    } catch {
      this.membrane.abandon(this.kernel, run.providerRunId);
      return { status: "provider_error", code: "invalid_response" };
    }

    const envelope = parseEnvelope(raw);
    if (!envelope) {
      this.membrane.abandon(this.kernel, run.providerRunId);
      return { status: "provider_error", code: "invalid_response" };
    }
    if (envelope.providerRunId !== run.providerRunId) {
      this.membrane.abandon(this.kernel, run.providerRunId);
      return { status: "provider_error", code: "correlation_mismatch" };
    }

    const settlement = this.membrane.settle(
      this.kernel,
      run.providerRunId,
      envelope.decision,
    );
    if (settlement.status === "applied") return { status: "applied", settlement };
    if (settlement.status === "stale") return { status: "stale", settlement };

    // The Worker envelope has already been schema-validated. If local settlement
    // still rejects it, fail closed and ensure the provider attempt cannot linger.
    this.membrane.abandon(this.kernel, run.providerRunId);
    return { status: "provider_error", code: "invalid_response" };
  }

  pendingProviderAttempts(): number {
    return this.membrane.activeLocalRunCount();
  }
}

function parseEnvelope(value: unknown): { providerRunId: string; decision: { semanticCourse: string } } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || typeof record.providerRunId !== "string" || record.providerRunId.trim().length === 0) return null;
  if (!record.decision || typeof record.decision !== "object" || Array.isArray(record.decision)) return null;
  const decision = record.decision as Record<string, unknown>;
  if (Object.keys(decision).some((key) => key !== "semanticCourse")) return null;
  if (typeof decision.semanticCourse !== "string") return null;
  const semanticCourse = decision.semanticCourse.trim();
  if (!semanticCourse || semanticCourse.length > 2_000) return null;
  return { providerRunId: record.providerRunId, decision: { semanticCourse } };
}
