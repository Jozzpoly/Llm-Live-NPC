// @ts-ignore Vitest/Vite loads the frozen bounded single-current-plan fixture.
import FIXTURE from "../evidence/r6-single-current-plan-review-outcome-meaning-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleSpcNextLifeIntent,
  sanitizeSpcNextLifeIntentContext,
  type SpcNextLifeIntentEnv,
} from "./spc-next-life-intent";

const MATTER = "matter.janek.r6.single-current-review.crate";
const OUTCOME = "task-outcome:run.janek.r6.single-current-review.crate.semantic-1:900";
const REASON = "reason-life-outcome:janek-r6-single-current-review-crate-900";

function upstreamResponse(kind: "continue_matter" | "relinquish_matter") {
  return {
    id: `resp_r6_single_current_plan_${kind}`,
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          originReasonId: REASON,
          proposal: {
            version: 1,
            commitmentDecision: {
              kind,
              reason: kind === "continue_matter"
                ? "the exact factual outcome still leaves this same bounded plan worth carrying"
                : "the exact factual outcome changes whether this bounded plan remains worth carrying",
              matterId: MATTER,
              supportEvidenceIds: [OUTCOME],
            },
            beliefs: [],
            concerns: [],
            reviewAfterSeconds: 60,
          },
        }),
      }],
    }],
    usage: { input_tokens: 320, output_tokens: 72, total_tokens: 392 },
  };
}

function env(): SpcNextLifeIntentEnv {
  return {
    OPENAI_API_KEY: "test-key",
    SPC_NEXT_LIFE_INTENT_MODEL: "gpt-5.6-luna",
    SPC_NEXT_LIFE_INTENT_REASONING: "low",
    SPC_NEXT_LIFE_INTENT_MAX_OUTPUT_TOKENS: "1024",
    HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  };
}

function normalizedTwin(value: any) {
  const clone = structuredClone(value);
  clone.reasons[0].summary = "<OUTCOME_MEANING>";
  clone.life.matters[0].lastOutcomeEvidence.summary = "<OUTCOME_MEANING>";
  return clone;
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 single-current-plan outcome-meaning live contract", () => {
  it("freezes two valid one-plan contexts that vary only factual blocked outcome meaning", () => {
    const pickup = sanitizeSpcNextLifeIntentContext(FIXTURE.pickup_time_unavailable);
    const inspected = sanitizeSpcNextLifeIntentContext(FIXTURE.bounded_inspection_absent);
    expect(pickup).not.toBeNull();
    expect(inspected).not.toBeNull();
    if (!pickup || !inspected) throw new Error("single-plan twin failed life-context sanitization");

    expect(normalizedTwin(pickup)).toEqual(normalizedTwin(inspected));
    for (const context of [pickup, inspected]) {
      expect(context.reasons).toEqual([expect.objectContaining({
        id: REASON,
        kind: "activity_completed",
        evidenceIds: [OUTCOME],
      })]);
      expect(context.life.body).toEqual({
        focusedRunId: null,
        deferredRunIds: [],
      });
      expect(context.life.matters).toEqual([expect.objectContaining({
        id: MATTER,
        status: "active",
        semanticRevision: 1,
        semanticIntent: {
          kind: "acquire_material_object",
          goal: "try to acquire the familiar workshop crate",
          objectId: "crate.workshop.01",
        },
        lastOutcomeEvidence: expect.objectContaining({
          id: OUTCOME,
          kind: "task_outcome",
          sourceRunId: "run.janek.r6.single-current-review.crate.semantic-1",
        }),
        activeRun: null,
      })]);
    }
    expect(pickup.life.matters[0]!.lastOutcomeEvidence!.summary)
      .toContain("became unavailable at pickup time");
    expect(inspected.life.matters[0]!.lastOutcomeEvidence!.summary)
      .toContain("not visible after bounded local inspection");
  });

  it("exposes the same strict continue/relinquish review action space to both twins", async () => {
    const captured: any[] = [];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const kind = call++ === 0 ? "continue_matter" : "relinquish_matter";
      return new Response(JSON.stringify(upstreamResponse(kind)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    for (const label of ["pickup_time_unavailable", "bounded_inspection_absent"] as const) {
      const response = await handleSpcNextLifeIntent(
        new Request("https://example.test/api/spc-next/life-intent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-spc-life-runtime": "five-resident-causal-v1",
          },
          body: JSON.stringify(FIXTURE[label]),
        }),
        env(),
      );
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.ok).toBe(true);
      expect(body.originReasonId).toBe(REASON);
      expect(body.proposal.commitmentDecision.matterId).toBe(MATTER);
      expect(body.proposal.commitmentDecision.supportEvidenceIds).toEqual([OUTCOME]);
    }

    expect(captured).toHaveLength(2);
    const schemaA = captured[0].text.format.schema;
    const schemaB = captured[1].text.format.schema;
    expect(schemaA).toEqual(schemaB);

    const variants = schemaA.properties.proposal.properties.commitmentDecision.anyOf;
    for (const kind of ["continue_matter", "relinquish_matter"]) {
      const variant = variants.find((candidate: any) =>
        candidate.properties?.kind?.enum?.includes(kind),
      );
      expect(variant).toBeTruthy();
      expect(Object.keys(variant.properties)).toEqual([
        "kind",
        "reason",
        "matterId",
        "supportEvidenceIds",
      ]);
    }
    expect(captured[0].instructions).toContain(
      "continue_matter and relinquish_matter may target one exact already-current body plan",
    );
  });
});
