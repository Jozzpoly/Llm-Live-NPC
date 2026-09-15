import type { Vec2 } from "./contracts";
import type { MaterialActionResult } from "./material-world-state";

export type ResidentWorldAction =
  | { kind: "material_pickup"; objectId: string }
  | { kind: "material_place"; objectId: string; position: Vec2 };

export type ResidentWorldActionResolution =
  | {
      status: "resolved";
      runId: string;
      action: ResidentWorldAction;
      materialOutcome: MaterialActionResult;
    }
  | {
      status: "rejected";
      runId: string;
      reason: "invalid_action" | "run_not_authorized";
    };
