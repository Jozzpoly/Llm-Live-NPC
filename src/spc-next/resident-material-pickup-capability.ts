import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import type {
  ResidentContinuityKernel,
  ResidentTaskRunBinding,
} from "./resident-continuity-kernel";
import type { ResidentLocalCapabilityOffer } from "./resident-semantic-provider-membrane";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface ResidentMaterialPickupCapabilityOptions {
  capabilityId: string;
  summary: string;
  matterId: string;
  taskId: string;
  runId: string;
  objectId: string;
  kernel: ResidentContinuityKernel;
  knowledge: ResidentMaterialKnowledge;
  authority: ResidentWorldExecutionAuthority;
  world: SpcWorldRuntime;
}

export interface ResidentMaterialPickupCapabilityGroundingRecord {
  capabilityId: string;
  matterId: string;
  objectId: string;
  offeredSemanticRevision: number;
  admittedSemanticRevision: number;
  semanticEvidenceId: string;
  groundedAtTick: number;
  binding: ResidentTaskRunBinding;
}

export type ResidentMaterialPickupCapabilityGrounding =
  | {
      status: "grounded";
      record: ResidentMaterialPickupCapabilityGroundingRecord;
      executor: ResidentMaterialPickupExecutor;
    }
  | {
      status: "rejected";
      reason:
        | "not_selected"
        | "matter_missing"
        | "matter_not_active"
        | "semantic_revision_changed"
        | "semantic_evidence_changed"
        | "run_already_active"
        | "object_not_currently_visible"
        | "object_position_missing";
    };

export type ResidentMaterialPickupCapabilityOfferResult =
  | { status: "offered"; capability: ResidentMaterialPickupCapability }
  | {
      status: "unavailable";
      reason:
        | "matter_missing"
        | "matter_not_active"
        | "run_already_active"
        | "object_not_currently_visible"
        | "object_position_missing";
    };

/**
 * Resident-owned competence for approaching and picking up one material object the
 * resident currently sees. Provider selection is only semantic preference: ground()
 * re-samples legal resident perception at the admission boundary and binds an exact
 * run only if the object is still visible and the matter/evidence revision is exact.
 */
export class ResidentMaterialPickupCapability {
  private readonly offeredSemanticRevision: number;
  private readonly offeredSemanticEvidenceId: string;
  private readonly offerValue: ResidentLocalCapabilityOffer;
  private groundingRecord: ResidentMaterialPickupCapabilityGroundingRecord | null = null;

  private constructor(private readonly options: ResidentMaterialPickupCapabilityOptions) {
    const matter = options.kernel.matter(options.matterId);
    if (!matter) throw new Error("material pickup capability matter disappeared during creation");
    this.offeredSemanticRevision = matter.semanticRevision;
    this.offeredSemanticEvidenceId = matter.semanticEvidenceId;
    this.offerValue = Object.freeze({ id: options.capabilityId, summary: options.summary });
  }

  static offer(options: ResidentMaterialPickupCapabilityOptions): ResidentMaterialPickupCapabilityOfferResult {
    const matter = options.kernel.matter(options.matterId);
    if (!matter) return { status: "unavailable", reason: "matter_missing" };
    if (matter.status !== "active") return { status: "unavailable", reason: "matter_not_active" };
    if (matter.activeRunId !== null) return { status: "unavailable", reason: "run_already_active" };

    options.knowledge.sample();
    const observation = options.knowledge.observation(options.objectId);
    if (!observation?.currentlyVisible) return { status: "unavailable", reason: "object_not_currently_visible" };
    if (!options.knowledge.lastKnownPosition(options.objectId)) {
      return { status: "unavailable", reason: "object_position_missing" };
    }
    return { status: "offered", capability: new ResidentMaterialPickupCapability(options) };
  }

  offer(): ResidentLocalCapabilityOffer {
    return { ...this.offerValue };
  }

  lastGrounding(): ResidentMaterialPickupCapabilityGroundingRecord | null {
    return this.groundingRecord ? structuredClone(this.groundingRecord) : null;
  }

  ground(
    selectedCapabilityId: string | null,
    admittedSemanticRevision: number,
  ): ResidentMaterialPickupCapabilityGrounding {
    if (selectedCapabilityId !== this.offerValue.id) return { status: "rejected", reason: "not_selected" };

    const matter = this.options.kernel.matter(this.options.matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status !== "active") return { status: "rejected", reason: "matter_not_active" };
    if (matter.semanticRevision !== admittedSemanticRevision
      || admittedSemanticRevision !== this.offeredSemanticRevision + 1) {
      return { status: "rejected", reason: "semantic_revision_changed" };
    }
    if (matter.semanticEvidenceId !== this.offeredSemanticEvidenceId) {
      return { status: "rejected", reason: "semantic_evidence_changed" };
    }
    if (matter.activeRunId !== null) return { status: "rejected", reason: "run_already_active" };

    // Provider latency is real wall time. Re-sample through resident-private material
    // perception at grounding time so a once-visible object cannot manufacture a
    // pickup run after another actor moved it away while cognition was in flight.
    this.options.knowledge.sample();
    const observation = this.options.knowledge.observation(this.options.objectId);
    if (!observation?.currentlyVisible) return { status: "rejected", reason: "object_not_currently_visible" };
    if (!this.options.knowledge.lastKnownPosition(this.options.objectId)) {
      return { status: "rejected", reason: "object_position_missing" };
    }

    const executor = new ResidentMaterialPickupExecutor(
      this.options.runId,
      this.options.objectId,
      this.options.knowledge,
      this.options.authority,
      this.options.world,
    );
    const binding = this.options.kernel.bindRun({
      matterId: this.options.matterId,
      taskId: this.options.taskId,
      runId: this.options.runId,
    });
    const record: ResidentMaterialPickupCapabilityGroundingRecord = {
      capabilityId: this.offerValue.id,
      matterId: binding.matterId,
      objectId: this.options.objectId,
      offeredSemanticRevision: this.offeredSemanticRevision,
      admittedSemanticRevision,
      semanticEvidenceId: this.offeredSemanticEvidenceId,
      groundedAtTick: this.options.world.tick,
      binding: structuredClone(binding),
    };
    this.groundingRecord = structuredClone(record);
    return { status: "grounded", record, executor };
  }
}
