import type {
  CognitionFetch,
  ResidentCognitionProviderErrorCode,
} from "./resident-cognition-live-host";
import type {
  ResidentCausalCognitionRequest,
  ResidentCausalCognitionSettlement,
} from "./resident-causal-cognition-lane";

export type ResidentCausalProviderArrival = Readonly<
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

export type ResidentCausalProviderAdmission =
  | ResidentCausalCognitionSettlement
  | {
      status: "provider_error";
      residentId: string;
      code: ResidentCognitionProviderErrorCode;
      detail: string | null;
      abandonment: boolean;
    }
  | { status: "arrival_rejected"; reason: "unknown_arrival" | "already_admitted" };

export interface ResidentCausalCognitionAdmissionTarget<
  Request extends ResidentCausalCognitionRequest = ResidentCausalCognitionRequest,
> {
  settleCommitment(
    request: Request,
    rawProposal: unknown,
    originReasonId: string,
  ): ResidentCausalCognitionSettlement;
  abandon(request: Request): boolean;
}

interface ArrivalAuthority<Request extends ResidentCausalCognitionRequest> {
  request: Request;
}

export interface ResidentCausalProviderTransportOptions {
  runtimeMode?: string | null;
}

const MAX_RESPONSE_CHARACTERS = 262_144;

/**
 * Resident-generic asynchronous transport for causal life-intent cognition.
 *
 * request() may finish at arbitrary wall-clock time but completion is inert. The
 * exact returned arrival object is only transport evidence until admit() consumes it
 * through a cognition target that still owns the matching request authority.
 *
 * The provider may select semantics and causal origin. It never receives matter/run/
 * World authority from this class.
 */
export class ResidentCausalProviderTransport<
  Request extends ResidentCausalCognitionRequest = ResidentCausalCognitionRequest,
> {
  private sequence = 0;
  private readonly authority = new WeakMap<object, ArrivalAuthority<Request>>();
  private readonly active = new Set<ResidentCausalProviderArrival>();
  private readonly admitted = new WeakSet<object>();
  private readonly runtimeMode: string | null;

  constructor(
    private readonly endpoint = "/api/spc-next/life-intent",
    private readonly fetcher: CognitionFetch = fetch,
    options: ResidentCausalProviderTransportOptions = {},
  ) {
    this.runtimeMode = options.runtimeMode?.trim() || null;
  }

  async request(
    request: Request,
    options: { signal?: AbortSignal } = {},
  ): Promise<ResidentCausalProviderArrival> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.runtimeMode) headers["x-spc-life-runtime"] = this.runtimeMode;

    let response: Response;
    try {
      response = await this.fetcher.call(globalThis, this.endpoint, {
        method: "POST",
        headers,
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
      if (text.length > MAX_RESPONSE_CHARACTERS) {
        throw new Error("provider response too large");
      }
      raw = JSON.parse(text);
    } catch {
      return this.registerError(
        request,
        "invalid_response",
        "response body was not bounded JSON",
      );
    }

    if (!isRecord(raw)
      || raw.ok !== true
      || typeof raw.originReasonId !== "string"
      || !("proposal" in raw)
      || !request.batch.reasons.some((reason) => reason.id === raw.originReasonId)) {
      return this.registerError(
        request,
        "invalid_response",
        "response lacked exact ok/origin/proposal contract",
      );
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
    arrival: ResidentCausalProviderArrival,
    cognition: ResidentCausalCognitionAdmissionTarget<Request>,
  ): ResidentCausalProviderAdmission {
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
    request: Request,
    code: ResidentCognitionProviderErrorCode,
    detail: string | null,
  ): ResidentCausalProviderArrival {
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
    request: Request,
    arrival: ResidentCausalProviderArrival,
  ): ResidentCausalProviderArrival {
    this.authority.set(arrival, { request });
    this.active.add(arrival);
    return arrival;
  }

  private nextId(): string {
    return "resident-causal-provider-arrival:" + this.sequence++;
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
      if (isRecord(raw)
        && typeof raw.code === "string"
        && /^[A-Za-z0-9_.:-]{1,120}$/u.test(raw.code)) {
        workerCode = raw.code;
      }
    }
  } catch {
    // HTTP status remains sufficient bounded diagnostic truth.
  }
  return workerCode ? "HTTP " + status + ": " + workerCode : "HTTP " + status;
}
