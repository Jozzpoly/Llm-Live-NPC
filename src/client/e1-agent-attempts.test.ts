import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import {
  E1DecisionRequestError,
  type E1DecisionEnvelope,
  type E1DecisionRequestContext
} from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";

function fixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Invalid R5b attempt fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { x: player.position.x, y: player.position.y - player.radius - 10 };

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);
  return { world, executor, driver, player };
}

function waitEnvelope(cycleId: number, model = "r5b-test-model"): E1DecisionEnvelope {
  return {
    cycleId,
    decision: { kind: "wait" },
    model,
    gatewayLogId: `${model}-log`,
    latencyMs: 1
  };
}

function triggerDrop(harness: E1AgentHarness, driver: ExecutionDriver, playerId: string) {
  harness.arm();
  const frame = driver.step({
    playerControl: { moveX: 0, moveY: 0 },
    playerActions: [{ action: "drop", actorId: playerId }]
  });
  const run = harness.afterExecutionStep(frame, 1000);
  if (!run) throw new Error("Expected R5b cognition request.");
  return run;
}

function rejectWhenAborted(context: E1DecisionRequestContext, onAbort: () => void): Promise<E1DecisionEnvelope> {
  return new Promise((_resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(new Error("provider-aborted"));
    };
    if (context.signal?.aborted) {
      abort();
      return;
    }
    context.signal?.addEventListener("abort", abort, { once: true });
  });
}

describe("R5b E1 bounded provider attempts", () => {
  it("retries one timed-out provider attempt inside the same logical request and cognition cycle", async () => {
    const { world, executor, driver, player } = fixture();
    const attempts: number[] = [];
    let firstAttemptAborted = false;
    const harness = new E1AgentHarness(
      world,
      executor,
      async (request, context) => {
        attempts.push(context.attempt ?? -1);
        if (context.attempt === 1) {
          return rejectWhenAborted(context, () => {
            firstAttemptAborted = true;
          });
        }
        return waitEnvelope(request.cycleId, "retry-success-model");
      },
      { requestTimeoutMs: 15, maxRequestAttempts: 2 }
    );

    const run = triggerDrop(harness, driver, player.id);
    const requestId = harness.state().requestId;
    await run;

    expect(attempts).toEqual([1, 2]);
    expect(firstAttemptAborted).toBe(true);
    expect(harness.state()).toMatchObject({
      requestId,
      attempt: 2,
      attemptLimit: 2,
      cyclesUsed: 1,
      inFlight: false,
      requestStatus: "accepted_wait",
      model: "retry-success-model"
    });
  });

  it("retries a transient provider rejection without consuming another cycle or request ID", async () => {
    const { world, executor, driver, player } = fixture();
    const seen: Array<{ requestId: number | undefined; attempt: number | undefined }> = [];
    const harness = new E1AgentHarness(
      world,
      executor,
      async (request, context) => {
        seen.push({ requestId: context.requestId, attempt: context.attempt });
        if (context.attempt === 1) throw new Error("synthetic-transient-network-failure");
        return waitEnvelope(request.cycleId, "second-attempt-model");
      },
      { requestTimeoutMs: 1000, maxRequestAttempts: 2 }
    );

    const run = triggerDrop(harness, driver, player.id);
    await run;

    expect(seen).toHaveLength(2);
    expect(seen.map((entry) => entry.attempt)).toEqual([1, 2]);
    expect(seen[0]!.requestId).toBe(seen[1]!.requestId);
    expect(harness.state()).toMatchObject({
      attempt: 2,
      cyclesUsed: 1,
      requestStatus: "accepted_wait",
      model: "second-attempt-model"
    });
  });

  it("does not retry an explicitly non-retryable provider/API error", async () => {
    const { world, executor, driver, player } = fixture();
    let calls = 0;
    const harness = new E1AgentHarness(
      world,
      executor,
      async () => {
        calls += 1;
        throw new E1DecisionRequestError("synthetic-rate-limit", false, 429);
      },
      { requestTimeoutMs: 1000, maxRequestAttempts: 2 }
    );

    const run = triggerDrop(harness, driver, player.id);
    await run;

    expect(calls).toBe(1);
    expect(harness.state()).toMatchObject({
      attempt: 1,
      cyclesUsed: 1,
      inFlight: false,
      requestStatus: "request_error",
      decisionValidation: "synthetic-rate-limit"
    });
  });

  it("makes exhausted timeout attempts an explicit terminal outcome for that logical cycle", async () => {
    const { world, executor, driver, player } = fixture();
    let calls = 0;
    const harness = new E1AgentHarness(
      world,
      executor,
      async (_request, context) => {
        calls += 1;
        return rejectWhenAborted(context, () => {});
      },
      { requestTimeoutMs: 12, maxRequestAttempts: 2 }
    );

    const run = triggerDrop(harness, driver, player.id);
    await run;

    expect(calls).toBe(2);
    expect(harness.state()).toMatchObject({
      attempt: 2,
      cyclesUsed: 1,
      inFlight: false,
      requestStatus: "request_timeout",
      decisionValidation: "request_timeout_after_2_attempts"
    });

    const unchanged = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(harness.afterExecutionStep(unchanged, 5000)).toBeNull();
    expect(calls).toBe(2);
  });

  it("aborts the active provider attempt on disarm and does not retry or contaminate disarmed state", async () => {
    const { world, executor, driver, player } = fixture();
    let calls = 0;
    let aborted = false;
    const harness = new E1AgentHarness(
      world,
      executor,
      async (_request, context) => {
        calls += 1;
        return rejectWhenAborted(context, () => {
          aborted = true;
        });
      },
      { requestTimeoutMs: 1000, maxRequestAttempts: 2 }
    );

    const run = triggerDrop(harness, driver, player.id);
    harness.disarm();
    await run;

    expect(calls).toBe(1);
    expect(aborted).toBe(true);
    expect(harness.state()).toMatchObject({
      armed: false,
      inFlight: false,
      requestStatus: "disarmed",
      attempt: 1
    });
  });
});
