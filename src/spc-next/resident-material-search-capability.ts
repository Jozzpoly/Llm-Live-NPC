import type { ResidentLocalCapabilityOffer } from "./resident-semantic-provider-membrane";
import {
  radialMaterialSearchWaypoints,
  ResidentMaterialSearchExecutor,
} from "./resident-material-search-executor";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import type {
  ResidentContinuityKernel,
  ResidentTaskRunBinding,
} from "./resident-continuity-kernel";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface ResidentMaterialSearchCapabilityOptions {
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
  radius?: number;
  sectorCount?: number;
}

export interface ResidentMaterialSearchCapabilityGroundingRecord {
  capabilityId: string;
  matterId: string;
  objectId: string;
  offeredSemanticRevision: number;
  admittedSemanticRevision: number;
  semanticEvidenceId: string;
  groundedAtTick: number;
  binding: ResidentTaskRunBinding;
}

export type ResidentMaterialSearchCapabilityGrounding =
  | {
      status: "grounded";
      record: ResidentMaterialSearchCapabilityGroundingRecord;
      executor: ResidentMaterialSearchExecutor;
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
        | "remembered_position_missing"
        | "object_already_visible";
    };

export type ResidentMaterialSearchCapabilityOfferResult =
  | { status: "offered"; capability: ResidentMaterialSearchCapability }
  | {
      status: "unavailable";
      reason:
        | "matter_missing"
        | "matter_not_active"
        | "run_already_active"
        | "remembered_position_missing"
        | "object_already_visible";
    };

/**
 * One resident-owned embodied competence offered to semantic cognition.
 *
 * The provider sees only offer(): a bounded id + semantic summary. Private grounding
 * retains the object/matter/run mechanics locally. Selection is therefore not
 * execution authority: after admission, ground() re-checks the exact matter revision,
 * semantic evidence and resident-private material knowledge before it can bind a run.
 *
 * The search plan is derived only from resident-owned remembered position. This
 * capability never reads current hidden material World truth to choose a route.
 */
export class ResidentMaterialSearchCapability {
  private readonly offeredSemanticRevision: number;
  private readonly offeredSemanticEvidenceId: string;
  private readonly offerValue: ResidentLocalCapabilityOffer;
  private readonly radius: number;
  private readonly sectorCount: number;
  private groundingRecord: ResidentMaterialSearchCapabilityGroundingRecord | null = null;

  private constructor(private readonly options: ResidentMaterialSearchCapabilityOptions) {
    const matter = options.kernel.matter(options.matterId);
    if (!matter) throw new Error("material search capability matter disappeared during creation");
    this.offeredSemanticRevision = matter.semanticRevision;
    this.offeredSemanticEvidenceId = matter.semanticEvidenceId;
    this.offerValue = Object.freeze({
      id: options.capabilityId,
      summary: options.summary,
    });
    this.radius = options.radius ?? 400;
    this.sectorCount = options.sectorCount ?? 8;
  }

  static offer(options: ResidentMaterialSearchCapabilityOptions): ResidentMaterialSearchCapabilityOfferResult {
    const matter = options.kernel.matter(options.matterId);
    if (!matter) return { status: "unavailable", reason: "matter_missing" };
    if (matter.status !== "active") return { status: "unavailable", reason: "matter_not_active" };
    if (matter.activeRunId !== null) return { status: "unavailable", reason: "run_already_active" };

    const observation = options.knowledge.observation(options.objectId);
    if (observation?.currentlyVisible) return { status: "unavailable", reason: "object_already_visible" };
    if (!options.knowledge.lastKnownPosition(options.objectId)) {
      return { status: "unavailable", reason: "remembered_position_missing" };
    }
    return { status: "offered", capability: new ResidentMaterialSearchCapability(options) };
  }

  offer(): ResidentLocalCapabilityOffer {
    return { ...this.offerValue };
  }

  lastGrounding(): ResidentMaterialSearchCapabilityGroundingRecord | null {
    return this.groundingRecord ? structuredClone(this.groundingRecord) : null;
  }

  ground(
    selectedCapabilityId: string | null,
    admittedSemanticRevision: number,
  ): ResidentMaterialSearchCapabilityGrounding {
    if (selectedCapabilityId !== this.offerValue.id) {
      return { status: "rejected", reason: "not_selected" };
    }

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

    const observation = this.options.knowledge.observation(this.options.objectId);
    if (observation?.currentlyVisible) return { status: "rejected", reason: "object_already_visible" };
    const remembered = this.options.knowledge.lastKnownPosition(this.options.objectId);
    if (!remembered) return { status: "rejected", reason: "remembered_position_missing" };

    // Precompute and validate the complete local plan before binding semantic run
    // authority. Constructor validation is also side-effect free, so failure cannot
    // leave a partially bound run behind.
    const waypoints = radialMaterialSearchWaypoints(remembered, this.radius, this.sectorCount);
    const executor = new ResidentMaterialSearchExecutor(
      this.options.runId,
      this.options.objectId,
      waypoints,
      this.options.knowledge,
      this.options.authority,
      this.options.world,
    );
    const binding = this.options.kernel.bindRun({
      matterId: this.options.matterId,
      taskId: this.options.taskId,
      runId: this.options.runId,
    });

    const record: ResidentMaterialSearchCapabilityGroundingRecord = {
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
