// @ts-ignore Vitest/Vite loads the already-qualified frozen run-30 fixture.
import FIXTURE from "../evidence/r6-same-cardinality-outcome-meaning-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const CURRENT = "matter.ida.r6.same-cardinality.current-janek";
const OTHER = "matter.ida.r6.same-cardinality.other";
const OLD_A = "task-outcome:run.ida.r6.same-cardinality.old-a:90";
const OLD_B = "task-outcome:run.ida.r6.same-cardinality.old-b:120";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_plan_revision_outcome_meaning",
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({ version: 1, decision }),
      }],
    }],
    usage: { input_tokens: 240, output_tokens: 48, total_tokens: 288 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 plan-revision outcome-meaning live contract", () => {
  it("gives succeeded and blocked twins the same bounded relinquish-C affordance and no relinquish-D affordance", async () => {
    const succeeded = sanitizeSpcNextLifeChoiceContext(FIXTURE.succeeded_history);
    const blocked = sanitizeSpcNextLifeChoiceContext(FIXTURE.blocked_history);
    expect(succeeded).not.toBeNull();
    expect(blocked).not.toBeNull();
    if (!succeeded || !blocked) throw new Error("run-30 plan-revision donor fixture failed sanitization");

    expect(succeeded.candidateMatterIds).toEqual(blocked.candidateMatterIds);

    const succeededC = succeeded.candidateSupports.find((candidate) => candidate.matterId === CURRENT);
    const blockedC = blocked.candidateSupports.find((candidate) => candidate.matterId === CURRENT);
    const succeededHistory = succeededC?.facts.filter(
      (fact) => fact.relation === "prior_same_actor_outcome",
    ) ?? [];
    const blockedHistory = blockedC?.facts.filter(
      (fact) => fact.relation === "prior_same_actor_outcome",
    ) ?? [];

    expect(succeededHistory.map((fact) => fact.evidenceId)).toEqual([OLD_A, OLD_B]);
    expect(blockedHistory.map((fact) => fact.evidenceId)).toEqual([OLD_A, OLD_B]);
    expect(succeededHistory.map((fact) => fact.summary)).toEqual([
      expect.stringMatching(/^succeeded:/),
      expect.stringMatching(/^succeeded:/),
    ]);
    expect(blockedHistory.map((fact) => fact.summary)).toEqual([
      expect.stringMatching(/^blocked:/),
      expect.stringMatching(/^blocked:/),
    ]);

    const captured: any[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const decision = {
        kind: "relinquish_matter",
        matterId: CURRENT,
        reason: "the exact factual history changes whether I still want to carry this current Janek plan",
        supportEvidenceIds: [OLD_A, OLD_B],
        reviewAfterSeconds: 30,
      };
      return new Response(JSON.stringify(upstreamResponse(decision)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env: SpcNextLifeChoiceEnv = {
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_LIFE_CHOICE_MODEL: "gpt-5.6-luna",
      SPC_NEXT_LIFE_CHOICE_REASONING: "low",
      SPC_NEXT_LIFE_CHOICE_MAX_OUTPUT_TOKENS: "512",
      HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };

    for (const label of ["succeeded_history", "blocked_history"] as const) {
      const response = await handleSpcNextLifeChoice(
        new Request("https://example.test/api/spc-next/life-choice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(FIXTURE[label]),
        }),
        env,
      );
      expect(response.status).toBe(200);
      expect((await response.json() as any).ok).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const relinquishVariants = (schema: any[]) => schema.filter(
      (variant) => variant.properties?.kind?.enum?.includes("relinquish_matter"),
    );
    const succeededSchema = captured[0].text.format.schema.properties.decision.anyOf;
    const blockedSchema = captured[1].text.format.schema.properties.decision.anyOf;
    for (const schema of [succeededSchema, blockedSchema]) {
      const variants = relinquishVariants(schema);
      expect(variants).toHaveLength(1);
      expect(variants[0].properties.matterId.enum).toEqual([CURRENT]);
      expect(variants[0].properties.supportEvidenceIds.items.enum)
        .toEqual([OLD_A, OLD_B].sort((a, b) => a.localeCompare(b)));
      expect(variants.some((variant) => variant.properties?.matterId?.enum?.[0] === OTHER))
        .toBe(false);
    }

    expect(JSON.stringify(
      succeededSchema.map(normalizeSchemaVariant),
    )).toBe(JSON.stringify(
      blockedSchema.map(normalizeSchemaVariant),
    ));

    const validRelinquish = {
      kind: "relinquish_matter",
      matterId: CURRENT,
      reason: "both exact old outcomes materially change whether this current Janek plan should remain mine",
      supportEvidenceIds: [OLD_A, OLD_B],
      reviewAfterSeconds: 30,
    };
    expect(extractSpcNextLifeChoiceDecision(
      upstreamResponse(validRelinquish),
      blocked.candidateMatterIds,
      blocked.candidateSupports,
    )).toEqual(validRelinquish);

    expect(extractSpcNextLifeChoiceDecision(
      upstreamResponse({ ...validRelinquish, matterId: OTHER }),
      blocked.candidateMatterIds,
      blocked.candidateSupports,
    )).toBeNull();
  });
});

function normalizeSchemaVariant(value: any) {
  // Strict schemas are expected to be byte-for-byte equivalent already. Clone only
  // to make the assertion's intent explicit and avoid accidental object identity use.
  return structuredClone(value);
}
