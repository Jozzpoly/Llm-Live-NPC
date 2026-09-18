import { ResidentCausalCommunicateCommitmentAuthority } from "./resident-causal-communicate-commitment";
import { ResidentCausalOutcomeTravelCommitmentAuthority } from "./resident-causal-outcome-travel-commitment";
import { ResidentCausalTravelCommitmentAuthority } from "./resident-causal-travel-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentLifeChoiceReviewBridge } from "./resident-life-choice-review-bridge";
import {
  captureResidentLifeCognitionView,
  type ResidentLifeCognitionView,
} from "./resident-life-cognition-view";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAttempt,
} from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { ResidentLifeOutcomeReviewBridge } from "./resident-life-outcome-review-bridge";
import type { RegionNavigationGraph } from "./region-navigation";
import type { ResidentRuntime } from "./resident-runtime";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";
import type { CognitionBatch } from "./contracts";

export interface ResidentCausalLifeSubstrateOptions {
  residentId: string;
  resident: ResidentRuntime;
  world: SpcWorldRuntime;
  navigation: RegionNavigationGraph;
  identityNamespace?: string;
}

export interface PreparedResidentCausalLifeIntent {
  batch: CognitionBatch;
  /** Exact authority handle. Do not clone before settlement/admission. */
  attempt: ResidentLifeIntentAttempt;
}

/**
 * Thin resident-owned composition of already-established causal-life authorities.
 *
 * This class owns no executor loop, provider transport, language interpretation,
 * outcome reconciliation or body-choice policy. It only guarantees that one resident's
 * continuity kernel, life discovery scope, focus/arbitration surfaces and cognition
 * authorities all refer to the same recovered life.
 */
export class ResidentCausalLifeSubstrate {
  readonly kernel: ResidentContinuityKernel;
  readonly matterScope: ResidentLifeMatterScope;
  readonly focus: ResidentExecutionFocusAuthority;
  readonly arbitrator: ResidentExecutionArbitrator;
  readonly worldAuthority: ResidentWorldExecutionAuthority;
  readonly lifeIntentOwner: ResidentLifeIntentOwner;
  readonly choiceReviewBridge: ResidentLifeChoiceReviewBridge;
  readonly outcomeReviewBridge: ResidentLifeOutcomeReviewBridge;
  readonly travelCommitments: ResidentCausalTravelCommitmentAuthority;
  readonly communicateCommitments: ResidentCausalCommunicateCommitmentAuthority;
  readonly outcomeTravelCommitments: ResidentCausalOutcomeTravelCommitmentAuthority;

  constructor(private readonly options: ResidentCausalLifeSubstrateOptions) {
    if (typeof options.residentId !== "string" || options.residentId.trim().length === 0) {
      throw new Error("residentId must be non-empty");
    }
    if (options.resident.profile.id !== options.residentId) {
      throw new Error("resident causal life substrate runtime belongs to another resident");
    }

    this.kernel = new ResidentContinuityKernel();
    this.matterScope = new ResidentLifeMatterScope(this.kernel);
    this.focus = new ResidentExecutionFocusAuthority(this.kernel);
    this.arbitrator = new ResidentExecutionArbitrator(this.kernel, this.focus);
    this.worldAuthority = new ResidentWorldExecutionAuthority(
      options.residentId,
      this.arbitrator,
      options.world,
    );
    this.lifeIntentOwner = new ResidentLifeIntentOwner(options.resident);
    this.choiceReviewBridge = new ResidentLifeChoiceReviewBridge(options.resident);
    this.outcomeReviewBridge = new ResidentLifeOutcomeReviewBridge(options.resident);

    const shared = {
      residentId: options.residentId,
      resident: options.resident,
      world: options.world,
      kernel: this.kernel,
      arbitrator: this.arbitrator,
      authority: this.worldAuthority,
      matterScope: this.matterScope,
      ...(options.identityNamespace === undefined
        ? {}
        : { identityNamespace: options.identityNamespace }),
    };

    this.travelCommitments = new ResidentCausalTravelCommitmentAuthority({
      ...shared,
      navigation: options.navigation,
    });
    this.communicateCommitments = new ResidentCausalCommunicateCommitmentAuthority(shared);
    this.outcomeTravelCommitments = new ResidentCausalOutcomeTravelCommitmentAuthority({
      ...shared,
      navigation: options.navigation,
    });
  }

  get residentId(): string {
    return this.options.residentId;
  }

  get resident(): ResidentRuntime {
    return this.options.resident;
  }

  get world(): SpcWorldRuntime {
    return this.options.world;
  }

  get navigation(): RegionNavigationGraph {
    return this.options.navigation;
  }

  currentLifeView(): ResidentLifeCognitionView {
    return structuredClone(captureResidentLifeCognitionView({
      kernel: this.kernel,
      focus: this.focus,
      arbitrator: this.arbitrator,
      matterIds: this.matterScope.matterIds(),
    }));
  }

  takeReadyLifeIntentAttempt(): PreparedResidentCausalLifeIntent | null {
    if (this.lifeIntentOwner.state().activeAttemptId !== null) return null;

    const batch = this.options.resident.takeCognitionBatch(this.options.world.tick);
    if (!batch) return null;

    const attempt = this.lifeIntentOwner.prepare(batch, this.currentLifeView());
    if (!attempt) {
      this.options.resident.requeueCognitionBatch(batch);
      throw new Error("resident causal life substrate intent owner refused a ready cognition batch");
    }

    return {
      batch: structuredClone(batch),
      attempt,
    };
  }
}
