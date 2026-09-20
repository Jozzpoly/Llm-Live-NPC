import {
  ResidentCausalProviderTransport,
  type ResidentCausalProviderAdmission,
  type ResidentCausalProviderArrival,
} from "./resident-causal-provider-transport";
import type { CognitionFetch } from "./resident-cognition-live-host";
import type {
  FiveResidentCausalCognitionRequest,
  FiveResidentCausalCognitionSettlement,
  FiveResidentCausalCognitionHost,
} from "./five-resident-causal-cognition-host";

export type FiveResidentCausalProviderArrival = ResidentCausalProviderArrival;

export type FiveResidentCausalProviderAdmission =
  | FiveResidentCausalCognitionSettlement
  | Exclude<
      ResidentCausalProviderAdmission,
      { status: "applied" | "stale" | "rejected" | "unknown_request" }
    >;

/**
 * Compatibility wrapper retaining the established five-resident API while transport
 * authority is now resident-generic.
 *
 * The only five-resident-specific transport policy left here is the Worker guidance
 * header selecting the bounded five-resident causal runtime vocabulary.
 */
export class FiveResidentCausalProviderTransport {
  private readonly transport: ResidentCausalProviderTransport<FiveResidentCausalCognitionRequest>;

  constructor(
    endpoint = "/api/spc-next/life-intent",
    fetcher: CognitionFetch = fetch,
  ) {
    this.transport = new ResidentCausalProviderTransport(
      endpoint,
      fetcher,
      { runtimeMode: "five-resident-causal-v1" },
    );
  }

  request(
    request: FiveResidentCausalCognitionRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<FiveResidentCausalProviderArrival> {
    return this.transport.request(request, options);
  }

  admit(
    arrival: FiveResidentCausalProviderArrival,
    cognition: FiveResidentCausalCognitionHost,
  ): FiveResidentCausalProviderAdmission {
    return this.transport.admit(arrival, cognition) as FiveResidentCausalProviderAdmission;
  }

  pendingArrivals(): number {
    return this.transport.pendingArrivals();
  }
}
