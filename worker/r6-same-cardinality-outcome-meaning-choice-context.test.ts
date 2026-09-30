// @ts-ignore Vitest/Vite loads the frozen JSON fixture; worker tsconfig intentionally has no Node/JSON ambient types.
import FIXTURE from "../evidence/r6-same-cardinality-outcome-meaning-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const JANek_MATTER = "matter.ida.r6.same-cardinality.current-janek";
const OTHER_MATTER = "matter.ida.r6.same-cardinality.other";
const OLD_A = "matter.ida.r6.same-cardinality.old-a";
const OLD_B = "matter.ida.r6.same-cardinality.old-b";
const OLD_A_OUTCOME = "task-outcome:run.ida.r6.same-cardinality.old-a:90";
const OLD_B_OUTCOME = "task-outcome:run.ida.r6.same-cardinality.old-b:120";
const JANEK_ORIGIN = "evidence:ida:r6:same-cardinality:janek-origin";
const OTHER_ORIGIN = "evidence:ida:r6:same-cardinality:other-origin";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_same_cardinality_outcome_meaning",
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
    usage: { input_tokens: 260, output_tokens: 40, total_tokens: 300 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 same-cardinality factual outcome-meaning choice contract", () => {
  it("keeps actor/count/current life identical while only factual old outcome meaning differs", () => {
    const succeeded = structuredClone(FIXTURE.succeeded_history) as any;
    const blocked = structuredClone(FIXTURE.blocked_history) as any;

    for (const oldMatterId of [OLD_A, OLD_B]) {
      expect(succeeded.life.matters.some((matter: any) => matter.id === oldMatterId)).toBe(false);
      expect(blocked.life.matters.some((matter: any) => matter.id === oldMatterId)).toBe(false);
    }

    const succeededC = succeeded.life.matters.find((matter: any) => matter.id === JANek_MATTER);
    const blockedC = blocked.life.matters.find((matter: any) => matter.id === JANek_MATTER);
    expect(succeededC?.historicalSupport).toHaveLength(2);
    expect(blockedC?.historicalSupport).toHaveLength(2);

    const normalizeMeaning = (value: any) => {
      const clone = structuredClone(value);
      const current = clone.life.matters.find((matter: any) => matter.id === JANek_MATTER);
      for (const support of current.historicalSupport) support.evidence.summary = "<OUTCOME_MEANING>";
      return clone;
    };
    expect(normalizeMeaning(succeeded)).toEqual(normalizeMeaning(blocked));

    expect(succeededC.historicalSupport.map((entry: any) => entry.evidence.summary))
      .toEqual([
        expect.stringMatching(/^succeeded:/),
        expect.stringMatching(/^succeeded:/),
      ]);
    expect(blockedC.historicalSupport.map((entry: any) => entry.evidence.summary))
      .toEqual([
        expect.stringMatching(/^blocked:/),
        expect.stringMatching(/^blocked:/),
      ]);

    const sanitizedSucceeded = sanitizeSpcNextLifeChoiceContext(succeeded);
    const sanitizedBlocked = sanitizeSpcNextLifeChoiceContext(blocked);
    expect(sanitizedSucceeded).not.toBeNull();
    expect(sanitizedBlocked).not.toBeNull();
    expect(sanitizedSucceeded?.candidateMatterIds).toEqual(sanitizedBlocked?.candidateMatterIds);
    expect(sanitizedSucceeded?.candidateSupports.map((candidate) => ({
      matterId: candidate.matterId,
      facts: candidate.facts.map((fact) => ({
        ...fact,
        summary: fact.relation === "prior_same_actor_outcome" ? "<OUTCOME_MEANING>" : fact.summary,
      })),
    }))).toEqual(sanitizedBlocked?.candidateSupports.map((candidate) => ({
      matterId: candidate.matterId,
      facts: candidate.facts.map((fact) => ({
        ...fact,
        summary: fact.relation === "prior_same_actor_outcome" ? "<OUTCOME_MEANING>" : fact.summary,
      })),
    })));

    const succeededHistory = sanitizedSucceeded?.candidateSupports.find(
      (candidate) => candidate.matterId === JANek_MATTER,
    )?.facts.filter((fact) => fact.relation === "prior_same_actor_outcome") ?? [];
    const blockedHistory = sanitizedBlocked?.candidateSupports.find(
      (candidate) => candidate.matterId === JANek_MATTER,
    )?.facts.filter((fact) => fact.relation === "prior_same_actor_outcome") ?? [];

    expect(succeededHistory.map((fact) => fact.evidenceId)).toEqual([OLD_A_OUTCOME, OLD_B_OUTCOME]);
    expect(blockedHistory.map((fact) => fact.evidenceId)).toEqual([OLD_A_OUTCOME, OLD_B_OUTCOME]);
    expect(succeededHistory.map((fact) => fact.summary)).toEqual([
      expect.stringMatching(/^succeeded:/),
      expect.stringMatching(/^succeeded:/),
    ]);
    expect(blockedHistory.map((fact) => fact.summary)).toEqual([
      expect.stringMatching(/^blocked:/),
      expect.stringMatching(/^blocked:/),
    ]);
  });

  it("preserves identical legal evidence IDs/schema while transporting the factual outcome distinction upstream", async () => {
    const captured: any[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const modelInput = JSON.parse(body.input[0].content);
      const history = modelInput.choiceSupport
        .find((candidate: any) => candidate.matterId === JANek_MATTER)
        ?.facts.filter((fact: any) => fact.relation === "prior_same_actor_outcome") ?? [];
      const blocked = history.every((fact: any) => String(fact.summary).startsWith("blocked:"));
      const decision = blocked
        ? {
            kind: "focus_matter",
            matterId: OTHER_MATTER,
            reason: "both factual prior attempts to reach Janek were blocked, so take the unrelated current future now",
            supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, OTHER_ORIGIN],
            reviewAfterSeconds: 30,
          }
        : {
            kind: "focus_matter",
            matterId: JANek_MATTER,
            reason: "both factual prior Janek exchanges succeeded, so current Janek contact remains grounded",
            supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, JANEK_ORIGIN],
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

    const focusVariant = (schema: any[], matterId: string) => schema.find(
      (variant) => variant.properties?.kind?.enum?.includes("focus_matter")
        && variant.properties?.matterId?.enum?.[0] === matterId,
    );
    const succeededSchema = captured[0].text.format.schema.properties.decision.anyOf;
    const blockedSchema = captured[1].text.format.schema.properties.decision.anyOf;
    const historicalIds = [OLD_A_OUTCOME, OLD_B_OUTCOME];

    for (const schema of [succeededSchema, blockedSchema]) {
      expect(focusVariant(schema, JANek_MATTER).properties.supportEvidenceIds.items.enum)
        .toEqual([...historicalIds, JANEK_ORIGIN].sort((a, b) => a.localeCompare(b)));
      expect(focusVariant(schema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
        .toEqual([...historicalIds, OTHER_ORIGIN].sort((a, b) => a.localeCompare(b)));
    }

    const sanitizedBlocked = sanitizeSpcNextLifeChoiceContext(FIXTURE.blocked_history);
    if (!sanitizedBlocked) throw new Error("same-cardinality blocked fixture failed sanitization");
    expect(extractSpcNextLifeChoiceDecision(
      upstreamResponse({
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        reason: "both exact old Janek outcomes were blocked, so take the unrelated current future",
        supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, OTHER_ORIGIN],
        reviewAfterSeconds: 30,
      }),
      sanitizedBlocked.candidateMatterIds,
      sanitizedBlocked.candidateSupports,
    )).toMatchObject({
      kind: "focus_matter",
      matterId: OTHER_MATTER,
      supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, OTHER_ORIGIN],
    });
  });
});
