import type {
  CognitionFetch,
  ResidentCognitionProviderErrorCode,
} from "./resident-cognition-live-host";
import {
  FiveResidentCausalCognitionHost,
  type FiveResidentCausalCognitionRequest,
  type FiveResidentCausalCognitionSettlement,
} from "./five-resident-causal-cognition-host";

export type FiveResidentCausalProviderArrival = Readonly<
  | {
      version: 1;
      id: string;
      requestId: string;
      residentId: string;
      status: "proposal";
      originReasonId: string;
      proposal: unknown;
    }
  | {
      version: 1;
      id: string;
      requestId: string;
      residentId: string;
      status: "provider_error";
      code: ResidentCognitionProviderErrorCode;
      detail: string | null;
    }
>;

export type FiveResidentCausalProviderAdmission =
  | FiveResidentCausalCognitionSettlement
  | {
      status: "provider_error";
      residentId: string;
      code: ResidentCognitionProviderErrorCode;
      detail: string | null;
      abandonment: boolean;
    }
  | { status: "arrival_rejected"; reason: "unknown_arrival" | "already_admitted" };

interface ArrivalAuthority {
  request: FiveResidentCausalCognitionRequest;
}

const MAX_RESPONSE_CHARACTERS = 262_144;

/**
 * Thin asynchronous transport adapter for the unified causal cognition host.
 *
 * Provider completion is inert. It cannot touch resident-life authority until the
 * exact returned arrival object is explicitly admitted. Causal origin attribution is
 * validated again client-side against the immutable request batch even though the
 * Worker already validates it against the private context.
 */
export class FiveResidentCausalProviderTransport {
  private sequence = 0;
  private readonly authority = new WeakMap<object, ArrivalAuthority>();
  private readonly active = new Set<FiveResidentCausalProviderArrival>();
  private readonly admitted = new WeakSet<object>();

  constructor(
    private readonly endpoint = "/api/spc-next/life-intent",
    private readonly fetcher: CognitionFetch = fetch,
  ) {}

  async request(
    request: FiveResidentCausalCognitionRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<FiveResidentCausalProviderArrival> {
    let response: Response;
    try {
      response = await this.fetcher.call(globalThis, this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-spc-life-runtime": "five-resident-causal-v1",
        },
        body: JSON.stringify(request.context),
        signal: options.signal,
      });
    } catch {
      return this.registerError(request, "network", "network transport failed");
    }

    if (!response.ok) {
      return this.registerError(
        request,
        "http",
        await safeHttpErrorDetail(response),
      );
    }

    let raw: unknown;
    try {
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("provider response too large");
      raw = JSON.parse(text);
    } catch {
      return this.registerError(request, "invalid_response", "response body was not bounded JSON");
    }

    if (!isRecord(raw)
      || raw.ok !== true
      || typeof raw.originReasonId !== "string"
      || !("proposal" in raw)
      || !request.batch.reasons.some((reason) => reason.id === raw.originReasonId)) {
      return this.registerError(request, "invalid_response", "response lacked exact ok/origin/proposal contract");
    }

    return this.register(request, Object.freeze({
      version: 1 as const,
      id: this.nextId(),
      requestId: request.id,
      residentId: request.residentId,
      status: "proposal" as const,
      originReasonId: raw.originReasonId,
      proposal: structuredClone(raw.proposal),
    }));
  }

  admit(
    arrival: FiveResidentCausalProviderArrival,
    cognition: FiveResidentCausalCognitionHost,
  ): FiveResidentCausalProviderAdmission {
    const local = this.authority.get(arrival);
    if (!local || !this.active.has(arrival)) {
      return {
        status: "arrival_rejected",
        reason: this.admitted.has(arrival) ? "already_admitted" : "unknown_arrival",
      };
    }

    this.authority.delete(arrival);
    this.active.delete(arrival);
    this.admitted.add(arrival);

    if (arrival.status === "provider_error") {
      return {
        status: "provider_error",
        residentId: arrival.residentId,
        code: arrival.code,
        detail: arrival.detail,
        abandonment: cognition.abandon(local.request),
      };
    }

    return cognition.settleCommitment(
      local.request,
      arrival.proposal,
      arrival.originReasonId,
    );
  }

  pendingArrivals(): number {
    return this.active.size;
  }

  private registerError(
    request: FiveResidentCausalCognitionRequest,
    code: ResidentCognitionProviderErrorCode,
    detail: string | null,
  ): FiveResidentCausalProviderArrival {
    return this.register(request, Object.freeze({
      version: 1 as const,
      id: this.nextId(),
      requestId: request.id,
      residentId: request.residentId,
      status: "provider_error" as const,
      code,
      detail,
    }));
  }

  private register(
    request: FiveResidentCausalCognitionRequest,
    arrival: FiveResidentCausalProviderArrival,
  ): FiveResidentCausalProviderArrival {
    this.authority.set(arrival, { request });
    this.active.add(arrival);
    return arrival;
  }

  private nextId(): string {
    return `five-resident-causal-provider-arrival:${this.sequence++}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


async function safeHttpErrorDetail(response: Response): Promise<string> {
  const status = response.status;
  let workerCode: string | null = null;
  try {
    const text = await response.text();
    if (text.length <= MAX_RESPONSE_CHARACTERS) {
      const raw = JSON.parse(text) as unknown;
      if (isRecord(raw) && typeof raw.code === "string" && /^[A-Za-z0-9_.:-]{1,120}$/u.test(raw.code)) {
        workerCode = raw.code;
      }
    }
  } catch {
    // Status alone remains sufficient bounded diagnostic truth.
  }
  return workerCode ? `HTTP ${status}: ${workerCode}` : `HTTP ${status}`;
}
