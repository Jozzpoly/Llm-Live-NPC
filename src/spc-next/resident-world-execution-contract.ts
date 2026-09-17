import type { ActorMotionOutcome, Vec2, WorldOccurrence } from "./contracts";

export type ResidentWorldEffect =
  | { kind: "motion"; desiredVelocity: Vec2 }
  | { kind: "look"; direction: Vec2 }
  | { kind: "speech"; text: string; radius: number; addressedActorIds: readonly string[] };

export interface ResidentWorldExecutionFrame {
  runId: string;
  effects: readonly ResidentWorldEffect[];
}

export interface ResidentRunAuthority {
  canRunMutateWorld(runId: string): boolean;
}

export interface ResidentAuthorizedMotionOutcome {
  runId: string;
  tick: number;
  outcome: ActorMotionOutcome;
}

export type ResidentWorldExecutionResult =
  | {
      status: "applied";
      runId: string;
      appliedEffects: readonly ResidentWorldEffect["kind"][];
      occurrences: readonly WorldOccurrence[];
    }
  | {
      status: "rejected";
      runId: string;
      reason: "invalid_frame" | "run_not_authorized";
    }
  | {
      status: "interrupted";
      runId: string;
      appliedEffects: readonly ResidentWorldEffect["kind"][];
      reason: "run_authority_lost";
      occurrences: readonly WorldOccurrence[];
    };
