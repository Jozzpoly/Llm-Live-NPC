import { describe, expect, it } from "vitest";

const CANONICAL_RUNTIME = "https://c13d0442-llm-live-npc.jozzpoly.workers.dev";
const CANONICAL_COMMIT = "caeb15cb875a83ffbab684f8e55880a87d723d15";
const CANONICAL_WORKER_VERSION = "c13d0442-104c-42ec-b148-a6d9374f98d0";
const MODEL = "@cf/ibm-granite/granite-4.0-h-micro";

interface HealthResponse {
  ok?: unknown;
  service?: unknown;
  aiBinding?: unknown;
  stage?: unknown;
  cognitionEndpoint?: unknown;
  build?: {
    commitSha?: unknown;
    workerVersionId?: unknown;
  };
}

interface DecisionResponse {
  ok?: unknown;
  cycleId?: unknown;
  decision?: { kind?: unknown; targetId?: unknown };
  model?: unknown;
  gatewayLogId?: unknown;
  latencyMs?: unknown;
  usage?: unknown;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${response.url}, received: ${text.slice(0, 500)}`);
  }
}

describe("R8 public repaired-runtime probe", () => {
  it(
    "proves exact deployed build provenance and one bounded live Granite wait decision",
    async () => {
      const healthResponse = await fetch(`${CANONICAL_RUNTIME}/api/health`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000)
      });
      const health = (await readJson(healthResponse)) as HealthResponse;

      expect(healthResponse.status).toBe(200);
      expect(health).toMatchObject({
        ok: true,
        service: "llm-live-npc",
        aiBinding: true,
        stage: "e1-grounded-notice-fetch",
        cognitionEndpoint: "/api/agent/e1/decide",
        build: {
          commitSha: CANONICAL_COMMIT,
          workerVersionId: CANONICAL_WORKER_VERSION
        }
      });

      const cycleId = 8801;
      const decisionResponse = await fetch(`${CANONICAL_RUNTIME}/api/agent/e1/decide`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          cycleId,
          trigger: "perception_changed",
          perception: {
            tick: 1,
            observer: {
              id: "npc.001",
              label: "NPC-001",
              locationId: "yard",
              locationLabel: "Common Yard",
              heldItemId: null
            },
            visibleEntities: [],
            fetchableItemIds: []
          },
          observedChanges: [],
          observedChangesDropped: 0,
          previousExperience: null
        }),
        signal: AbortSignal.timeout(25_000)
      });
      const decision = (await readJson(decisionResponse)) as DecisionResponse;

      expect(decisionResponse.status).toBe(200);
      expect(decision).toMatchObject({
        ok: true,
        cycleId,
        decision: { kind: "wait" },
        model: MODEL
      });
      expect(typeof decision.latencyMs).toBe("number");
      expect(decision.gatewayLogId === null || typeof decision.gatewayLogId === "string").toBe(true);
      expect(decision.usage === null || typeof decision.usage === "object").toBe(true);
    },
    45_000
  );
});
