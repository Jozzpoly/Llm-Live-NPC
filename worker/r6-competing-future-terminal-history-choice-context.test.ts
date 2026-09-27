// @ts-ignore Vitest/Vite loads the frozen JSON fixture; the browser/worker tsconfig intentionally has no Node/JSON ambient types.
import FIXTURE from "../evidence/r6-competing-future-terminal-history-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const HISTORY_OUTCOME = "evidence:janek:r6:competing-future:history-outcome";
const RETRY_ORIGIN = "evidence:janek:r6:competing-future:retry-origin";
const OTHER_ORIGIN = "evidence:janek:r6:competing-future:other-origin";
const RETRY_MATTER = "matter.janek.r6.competing-future.retry";
const OTHER_MATTER = "matter.janek.r6.competing-future.other";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_competing_future",
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
    usage: { input_tokens: 200, output_tokens: 30, total_tokens: 230 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 competing-future terminal-history life-choice contract", () => {
  it("keeps twins equal outside one terminal episode and derives exact bounded comparative support only in the history twin", () => {
    const control = structuredClone(FIXTURE.control);
    const history = structuredClone(FIXTURE.history);

    const strippedHistory = structuredClone(history);
    strippedHistory.life.matters = strippedHistory.life.matters.filter(
      (matter: any) => matter.id !== "matter.janek.r6.competing-future.history",
    );
    expect(strippedHistory).toEqual(control);

    const sanitizedControl = sanitizeSpcNextLifeChoiceContext(control);
    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(history);
    expect(sanitizedControl).not.toBeNull();
    expect(sanitizedHistory).not.toBeNull();

    expect(sanitizedControl?.candidateMatterIds).toEqual(
      [OTHER_MATTER, RETRY_MATTER].sort((a, b) => a.localeCompare(b)),
    );
    expect(sanitizedHistory?.candidateMatterIds).toEqual(sanitizedControl?.candidateMatterIds);

    const controlRetry = sanitizedControl?.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    const historyRetry = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    const historyOther = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );

    expect(controlRetry?.facts.map((fact) => fact.evidenceId)).toEqual([RETRY_ORIGIN]);
    expect(historyRetry?.facts).toEqual([
      expect.objectContaining({
        evidenceId: HISTORY_OUTCOME,
        relation: "prior_same_material_outcome",
      }),
      expect.objectContaining({
        evidenceId: RETRY_ORIGIN,
        relation: "matter_origin",
      }),
    ]);
    expect(historyOther?.facts.map((fact) => fact.evidenceId)).toEqual([OTHER_ORIGIN]);

    expect(history.life.matters[0]).toMatchObject({
      status: "resolved",
      activeRun: null,
      lastOutcomeEvidence: {
        id: HISTORY_OUTCOME,
        kind: "task_outcome",
      },
    });
  });

  it("exposes terminal history as a narrow comparative schema option without allowing ordinary cross-matter evidence", async () => {
    const captured: any[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const modelInput = JSON.parse(body.input[0].content);
      const hasHistory = modelInput.choiceSupport.some((candidate: any) =>
        candidate.facts.some((fact: any) => fact.evidenceId === HISTORY_OUTCOME),
      );
      const decision = hasHistory
        ? {
            kind: "focus_matter",
            matterId: OTHER_MATTER,
            reason: "the prior factual failure belongs to the competing retry, so take the ordinary workshop future",
            supportEvidenceIds: [HISTORY_OUTCOME, OTHER_ORIGIN],
            reviewAfterSeconds: 12,
          }
        : {
            kind: "focus_matter",
            matterId: OTHER_MATTER,
            reason: "take the ordinary workshop future from its own current support",
            supportEvidenceIds: [OTHER_ORIGIN],
            reviewAfterSeconds: 12,
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

    const controlSchema = captured[0].text.format.schema.properties.decision.anyOf;
    const historySchema = captured[1].text.format.schema.properties.decision.anyOf;

    const focus = (schema: any[], matterId: string) => schema.find(
      (variant) => variant.properties?.kind?.enum?.includes("focus_matter")
        && variant.properties?.matterId?.enum?.[0] === matterId,
    );

    expect(focus(controlSchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([OTHER_ORIGIN]);
    expect(focus(controlSchema, RETRY_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([RETRY_ORIGIN]);

    expect(focus(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([HISTORY_OUTCOME, OTHER_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focus(historySchema, RETRY_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([HISTORY_OUTCOME, RETRY_ORIGIN].sort((a, b) => a.localeCompare(b)));

    expect(focus(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .not.toContain(RETRY_ORIGIN);
    expect(focus(historySchema, RETRY_MATTER).properties.supportEvidenceIds.items.enum)
      .not.toContain(OTHER_ORIGIN);
  });
});
