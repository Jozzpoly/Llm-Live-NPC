// @ts-ignore Vitest/Vite loads the frozen JSON fixture; the worker tsconfig intentionally has no Node/JSON ambient types.
import FIXTURE from "../evidence/r6-delayed-competing-future-history-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const RETRY_MATTER = "matter.janek.r6.delayed-competing-future.retry";
const OTHER_MATTER = "matter.janek.r6.delayed-competing-future.other";
const OLD_MATTER = "matter.janek.r6.delayed-competing-future.old-material";
const OLD_OUTCOME = "task-outcome:run.janek.r6.delayed-competing-future.old-material:90";
const RETRY_ORIGIN = "evidence:janek:r6:delayed-competing-future:retry-origin";
const OTHER_ORIGIN = "evidence:janek:r6:delayed-competing-future:other-origin";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_delayed_competing_future",
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
    usage: { input_tokens: 220, output_tokens: 32, total_tokens: 252 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 delayed-history competing-future life-choice contract", () => {
  it("keeps A out of both current-life twins while history differs only by one candidate-scoped causal support", () => {
    const control = structuredClone(FIXTURE.control) as any;
    const history = structuredClone(FIXTURE.history) as any;

    expect(control.life.matters.some((matter: any) => matter.id === OLD_MATTER)).toBe(false);
    expect(history.life.matters.some((matter: any) => matter.id === OLD_MATTER)).toBe(false);

    const historyRetry = history.life.matters.find((matter: any) => matter.id === RETRY_MATTER);
    expect(historyRetry?.historicalSupport).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: OLD_MATTER,
      evidence: {
        id: OLD_OUTCOME,
        tick: 90,
        kind: "task_outcome",
        summary: "blocked: factual material pickup returned object_unavailable",
        sourceRunId: "run.janek.r6.delayed-competing-future.old-material",
      },
    }]);

    const stripped = structuredClone(history);
    delete stripped.life.matters.find((matter: any) => matter.id === RETRY_MATTER)
      .historicalSupport;
    expect(stripped).toEqual(control);

    const sanitizedControl = sanitizeSpcNextLifeChoiceContext(control);
    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(history);
    expect(sanitizedControl).not.toBeNull();
    expect(sanitizedHistory).not.toBeNull();
    expect(sanitizedHistory?.candidateMatterIds).toEqual(
      [OTHER_MATTER, RETRY_MATTER].sort((a, b) => a.localeCompare(b)),
    );
    expect(sanitizedControl?.candidateMatterIds).toEqual(
      sanitizedHistory?.candidateMatterIds,
    );

    const controlRetry = sanitizedControl?.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    const historyRetrySupport = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    const historyOtherSupport = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );

    expect(controlRetry?.facts.map((fact) => fact.evidenceId)).toEqual([RETRY_ORIGIN]);
    expect(historyRetrySupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: OLD_OUTCOME,
        sourceMatterId: OLD_MATTER,
        relation: "prior_same_material_outcome",
        evidenceKind: "task_outcome",
      }),
      expect.objectContaining({
        evidenceId: RETRY_ORIGIN,
        relation: "matter_origin",
      }),
    ]));
    expect(historyOtherSupport?.facts.map((fact) => fact.evidenceId)).toEqual([OTHER_ORIGIN]);
  });

  it("gives the live schema exact delayed-history comparative support without leaking ordinary cross-candidate evidence", async () => {
    const captured: any[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const modelInput = JSON.parse(body.input[0].content);
      const delayedHistoryPresent = modelInput.choiceSupport.some((candidate: any) =>
        candidate.facts.some((fact: any) => fact.evidenceId === OLD_OUTCOME),
      );
      const decision = delayedHistoryPresent
        ? {
            kind: "focus_matter",
            matterId: RETRY_MATTER,
            reason: "the exact earlier same-object failure is part of the retry candidate's causal history",
            supportEvidenceIds: [OLD_OUTCOME, RETRY_ORIGIN],
            reviewAfterSeconds: 30,
          }
        : {
            kind: "defer_all",
            reason: "the two current futures remain equally grounded without comparative history",
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

    for (const label of ["control", "history"] as const) {
      const response = await handleSpcNextLifeChoice(
        new Request("https://example.test/api/spc-next/life-choice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(FIXTURE[label]),
        }),
        env,
      );
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.ok).toBe(true);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const focusVariant = (schema: any[], matterId: string) => schema.find(
      (variant) => variant.properties?.kind?.enum?.includes("focus_matter")
        && variant.properties?.matterId?.enum?.[0] === matterId,
    );

    const controlSchema = captured[0].text.format.schema.properties.decision.anyOf;
    const historySchema = captured[1].text.format.schema.properties.decision.anyOf;

    expect(focusVariant(controlSchema, RETRY_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([RETRY_ORIGIN]);
    expect(focusVariant(controlSchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([OTHER_ORIGIN]);

    expect(focusVariant(historySchema, RETRY_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([OLD_OUTCOME, RETRY_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focusVariant(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([OLD_OUTCOME, OTHER_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focusVariant(historySchema, RETRY_MATTER).properties.supportEvidenceIds.items.enum)
      .not.toContain(OTHER_ORIGIN);
    expect(focusVariant(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .not.toContain(RETRY_ORIGIN);

    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(FIXTURE.history);
    if (!sanitizedHistory) throw new Error("delayed-history fixture failed sanitization");
    expect(extractSpcNextLifeChoiceDecision(
      upstreamResponse({
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        reason: "the old crate failure can be comparative evidence for taking the independent future",
        supportEvidenceIds: [OLD_OUTCOME, OTHER_ORIGIN],
        reviewAfterSeconds: 30,
      }),
      sanitizedHistory.candidateMatterIds,
      sanitizedHistory.candidateSupports,
    )).toMatchObject({
      kind: "focus_matter",
      matterId: OTHER_MATTER,
      supportEvidenceIds: [OLD_OUTCOME, OTHER_ORIGIN],
    });
  });
});
