import { describe, expect, it } from "vitest";
import { E1_PERCEPTION_RANGE } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { E1DecisionEnvelope } from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";
import { handleE1AgentDecision, type E1AgentEnv } from "../../worker/e1-agent";

function liveE1Fixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Missing E1 readiness fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { x: 680, y: 364 };
  return { specimen, npc, player, mug };
}

function nestedToolCall(name: string, args: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: "function",
              function: {
                name,
                arguments: JSON.stringify(args)
              }
            }
          ]
        }
      }
    ]
  };
}

function acceptingEnv(result: unknown, captured: unknown[]): E1AgentEnv {
  return {
    AI: {
      aiGatewayLogId: "audit-gateway-log",
      async run(_model: string, input: unknown) {
        captured.push(input);
        return result;
      }
    },
    AI_PROBE_LIMITER: {
      async limit() {
        return { success: true };
      }
    }
  };
}

function rawCycleRequest() {
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
      visibleEntities: [
        {
          id: "item.mug",
          kind: "item",
          label: "Red mug",
          distance: 40,
          direction: { x: 1, y: 0 },
          heldBy: null
        }
      ],
      fetchableItemIds: ["item.mug"]
    },
    observedChanges: [
      {
        kind: "item_holder_changed",
        itemId: "item.mug",
        previousHolderId: "player.jozz",
        holderId: null
      }
    ],
    previousExperience: null
  };
}

describe("pre-LLM E1 request and semantic boundary characterization", () => {
  it("shows that an unresolved cognition provider can keep E1 in-flight indefinitely across later world time", () => {
    const { specimen, player } = liveE1Fixture();
    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const never = new Promise<E1DecisionEnvelope>(() => {});
    const harness = new E1AgentHarness(world, executor, () => never);

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const pending = harness.afterExecutionStep(dropFrame, 1000);
    expect(pending).not.toBeNull();
    expect(harness.state()).toMatchObject({ inFlight: true, requestStatus: "in_flight" });

    for (const nowMs of [10_000, 60_000, 600_000]) {
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      expect(harness.afterExecutionStep(frame, nowMs)).toBeNull();
      expect(harness.state()).toMatchObject({ inFlight: true, requestStatus: "in_flight" });
    }
  });

  it("shows that Worker sanitation bounds shape but does not enforce the client's 220 px perception semantics", async () => {
    const captured: unknown[] = [];
    const request = rawCycleRequest();
    request.perception.visibleEntities[0]!.distance = E1_PERCEPTION_RANGE * 100;
    request.perception.visibleEntities[0]!.direction = { x: 9000, y: -7000 };

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      }),
      acceptingEnv(nestedToolCall("fetch", { targetId: "item.mug" }), captured)
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(await response.json()).toMatchObject({
      ok: true,
      decision: { kind: "fetch", targetId: "item.mug" }
    });
  });

  it("shows that duplicate contradictory visible entity IDs can still satisfy the Worker fetch allow-list", async () => {
    const captured: unknown[] = [];
    const request = rawCycleRequest();
    request.perception.visibleEntities = [
      {
        id: "item.mug",
        kind: "item",
        label: "Red mug held copy",
        distance: 40,
        direction: { x: 1, y: 0 },
        heldBy: "player.jozz"
      },
      {
        id: "item.mug",
        kind: "item",
        label: "Red mug free copy",
        distance: 40,
        direction: { x: 1, y: 0 },
        heldBy: null
      }
    ];

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      }),
      acceptingEnv(nestedToolCall("fetch", { targetId: "item.mug" }), captured)
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(await response.json()).toMatchObject({
      ok: true,
      decision: { kind: "fetch", targetId: "item.mug" }
    });
  });
});
