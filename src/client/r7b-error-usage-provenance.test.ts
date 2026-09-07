import { afterEach, describe, expect, it, vi } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import {
  E1DecisionRequestError,
  requestE1Decision,
  type E1DecisionEnvelope
} from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";
import { handleE1AgentDecision, type E1AgentEnv } from "../../worker/e1-agent";

function cycleFixture(): E1CycleRequest {
  return {
    cycleId: 1,
    trigger: "perception_changed",
    perception: {
      tick: 10,
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
  };
}

function waitToolResult(usage?: unknown) {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: "function",
              function: { name: "wait", arguments: "{}" }
            }
          ]
        }
      }
    ],
    usage
  };
}

function workerEnv(run: () => Promise<unknown>): E1AgentEnv {
  return {
    AI: {
      aiGatewayLogId: "r7b-gateway",
      run: async () => run()
    },
    AI_PROBE_LIMITER: {
      async limit() {
        return { success: true };
      }
    }
  };
}

function workerRequest(body: E1CycleRequest = cycleFixture()): Request {
  return new Request("https://lab.example/api/agent/e1/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("R7b provider error and usage provenance", () => {
  it("keeps provider exception detail internal while returning a stable public error", async () => {
    const secret = "provider-secret-detail-that-must-not-leak";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleE1AgentDecision(
      workerRequest(),
      workerEnv(async () => {
        throw new Error(secret);
      })
    );

    expect(response.status).toBe(502);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      ok: false,
      error: "E1 cognition provider request failed",
      errorCode: "provider_error",
      model: "@cf/ibm-granite/granite-4.0-h-micro",
      gatewayLogId: "r7b-gateway",
      usage: null
    });
    expect(JSON.stringify(payload)).not.toContain(secret);
    expect(JSON.stringify(consoleError.mock.calls)).toContain(secret);
  });

  it("returns only bounded canonical usage fields from raw provider metadata", async () => {
    const response = await handleE1AgentDecision(
      workerRequest(),
      workerEnv(async () =>
        waitToolResult({
          prompt_tokens: 5,
          completion_tokens: -1,
          total_tokens: 9,
          neurons: Number.POSITIVE_INFINITY,
          secret_provider_field: "discard-me"
        })
      )
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.usage).toEqual({
      promptTokens: 5,
      completionTokens: null,
      totalTokens: 9,
      neurons: null
    });
    expect(JSON.stringify(payload.usage)).not.toContain("secret_provider_field");
  });

  it("preserves canonical usage in the browser success envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            cycleId: 1,
            decision: { kind: "wait" },
            model: "test-model",
            gatewayLogId: "browser-log",
            latencyMs: 12,
            usage: {
              promptTokens: 11,
              completionTokens: 2,
              totalTokens: 13,
              neurons: 7
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await requestE1Decision(cycleFixture());
    expect(result).toMatchObject({
      cycleId: 1,
      model: "test-model",
      gatewayLogId: "browser-log",
      latencyMs: 12,
      usage: {
        promptTokens: 11,
        completionTokens: 2,
        totalTokens: 13,
        neurons: 7
      }
    });
  });

  it("preserves bounded usage and provider provenance on a retryable model response error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            cycleId: 1,
            error: "Model did not return exactly one valid bounded intention tool call",
            errorCode: "invalid_model_intention",
            model: "test-model",
            gatewayLogId: "error-log",
            latencyMs: 20,
            usage: {
              promptTokens: 8,
              completionTokens: 3,
              totalTokens: 11,
              neurons: null
            }
          }),
          { status: 502, headers: { "content-type": "application/json" } }
        )
      )
    );

    let caught: unknown;
    try {
      await requestE1Decision(cycleFixture());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(E1DecisionRequestError);
    expect(caught).toMatchObject({
      retryable: true,
      status: 502,
      errorCode: "invalid_model_intention",
      model: "test-model",
      gatewayLogId: "error-log",
      latencyMs: 20,
      usage: {
        promptTokens: 8,
        completionTokens: 3,
        totalTokens: 11,
        neurons: null
      }
    });
  });

  it("retains usage separately for both provider attempts of one logical cognition request", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing R7b retry fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { ...player.position };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    let providerCalls = 0;
    const harness = new E1AgentHarness(world, executor, async (request): Promise<E1DecisionEnvelope> => {
      providerCalls += 1;
      if (providerCalls === 1) {
        throw new E1DecisionRequestError(
          "bounded model response failure",
          true,
          502,
          "invalid_model_intention",
          { promptTokens: 10, completionTokens: 2, totalTokens: 12, neurons: null },
          "attempt-1-model",
          "attempt-1-log",
          15
        );
      }
      return {
        cycleId: request.cycleId,
        decision: { kind: "wait" },
        model: "attempt-2-model",
        gatewayLogId: "attempt-2-log",
        latencyMs: 9,
        usage: { promptTokens: 9, completionTokens: 1, totalTokens: 10, neurons: 4 }
      };
    });

    harness.arm();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const run = harness.afterExecutionStep(frame, 1000);
    expect(run).not.toBeNull();
    await run!;

    expect(providerCalls).toBe(2);
    expect(harness.state()).toMatchObject({
      requestStatus: "accepted_wait",
      attempt: 2,
      model: "attempt-2-model",
      gatewayLogId: "attempt-2-log",
      usageAttempts: [
        {
          attempt: 1,
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12, neurons: null }
        },
        {
          attempt: 2,
          usage: { promptTokens: 9, completionTokens: 1, totalTokens: 10, neurons: 4 }
        }
      ]
    });
  });
});
