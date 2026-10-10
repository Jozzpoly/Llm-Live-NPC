// @ts-ignore Vitest/Vite loads the frozen JSON fixture; worker tsconfig intentionally has no Node/JSON ambient types.
import FIXTURE from "../evidence/r6-cumulative-same-actor-history-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const IDA_MATTER = "matter.mira.r6.cumulative-same-actor.ida";
const OTHER_MATTER = "matter.mira.r6.cumulative-same-actor.other";
const OLD_A = "matter.mira.r6.cumulative-same-actor.old-a";
const OLD_B = "matter.mira.r6.cumulative-same-actor.old-b";
const OLD_A_OUTCOME = "task-outcome:run.mira.r6.cumulative-same-actor.old-a:91";
const OLD_B_OUTCOME = "task-outcome:run.mira.r6.cumulative-same-actor.old-b:121";
const IDA_ORIGIN = "evidence:mira:r6:cumulative-same-actor:ida-origin";
const OTHER_ORIGIN = "evidence:mira:r6:cumulative-same-actor:other-origin";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_cumulative_same_actor",
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
    usage: { input_tokens: 240, output_tokens: 36, total_tokens: 276 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 cumulative same-actor competing-future life-choice contract", () => {
  it("keeps old matters absent while history differs only by two candidate-scoped factual same-actor outcomes", () => {
    const control = structuredClone(FIXTURE.control) as any;
    const history = structuredClone(FIXTURE.history) as any;

    for (const oldMatterId of [OLD_A, OLD_B]) {
      expect(control.life.matters.some((matter: any) => matter.id === oldMatterId)).toBe(false);
      expect(history.life.matters.some((matter: any) => matter.id === oldMatterId)).toBe(false);
    }

    const historyIda = history.life.matters.find((matter: any) => matter.id === IDA_MATTER);
    expect(historyIda?.historicalSupport).toEqual([
      expect.objectContaining({
        relation: "prior_same_actor_outcome",
        sourceMatterId: OLD_A,
        evidence: expect.objectContaining({
          id: OLD_A_OUTCOME,
          kind: "task_outcome",
        }),
      }),
      expect.objectContaining({
        relation: "prior_same_actor_outcome",
        sourceMatterId: OLD_B,
        evidence: expect.objectContaining({
          id: OLD_B_OUTCOME,
          kind: "task_outcome",
        }),
      }),
    ]);

    const stripped = structuredClone(history);
    delete stripped.life.matters.find((matter: any) => matter.id === IDA_MATTER)
      .historicalSupport;
    expect(stripped).toEqual(control);

    const sanitizedControl = sanitizeSpcNextLifeChoiceContext(control);
    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(history);
    expect(sanitizedControl).not.toBeNull();
    expect(sanitizedHistory).not.toBeNull();
    expect(sanitizedHistory?.candidateMatterIds).toEqual(
      [IDA_MATTER, OTHER_MATTER].sort((a, b) => a.localeCompare(b)),
    );

    const controlIda = sanitizedControl?.candidateSupports.find(
      (candidate) => candidate.matterId === IDA_MATTER,
    );
    const historyIdaSupport = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === IDA_MATTER,
    );
    const historyOther = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );

    expect(controlIda?.facts.map((fact) => fact.evidenceId)).toEqual([IDA_ORIGIN]);
    expect(historyIdaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: OLD_A_OUTCOME,
        sourceMatterId: OLD_A,
        relation: "prior_same_actor_outcome",
        evidenceKind: "task_outcome",
      }),
      expect.objectContaining({
        evidenceId: OLD_B_OUTCOME,
        sourceMatterId: OLD_B,
        relation: "prior_same_actor_outcome",
        evidenceKind: "task_outcome",
      }),
      expect.objectContaining({
        evidenceId: IDA_ORIGIN,
        relation: "matter_origin",
      }),
    ]));
    expect(historyOther?.facts.map((fact) => fact.evidenceId)).toEqual([OTHER_ORIGIN]);
  });

  it("exposes both factual same-actor outcomes as bounded comparative schema support without leaking ordinary origins", async () => {
    const captured: any[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const modelInput = JSON.parse(body.input[0].content);
      const historyIds = new Set(
        modelInput.choiceSupport
          .flatMap((candidate: any) => candidate.facts)
          .filter((fact: any) => fact.relation === "prior_same_actor_outcome")
          .map((fact: any) => fact.evidenceId),
      );
      const hasCumulativeHistory = historyIds.has(OLD_A_OUTCOME)
        && historyIds.has(OLD_B_OUTCOME);
      const decision = hasCumulativeHistory
        ? {
            kind: "focus_matter",
            matterId: IDA_MATTER,
            reason: "two exact factual prior Ida episodes are part of the current Ida future's causal history",
            supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, IDA_ORIGIN],
            reviewAfterSeconds: 30,
          }
        : {
            kind: "defer_all",
            reason: "the two current futures have no comparative resident-history support",
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

    expect(focusVariant(controlSchema, IDA_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([IDA_ORIGIN]);
    expect(focusVariant(controlSchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([OTHER_ORIGIN]);

    const historicalIds = [OLD_A_OUTCOME, OLD_B_OUTCOME];
    expect(focusVariant(historySchema, IDA_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([...historicalIds, IDA_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focusVariant(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([...historicalIds, OTHER_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focusVariant(historySchema, IDA_MATTER).properties.supportEvidenceIds.items.enum)
      .not.toContain(OTHER_ORIGIN);
    expect(focusVariant(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .not.toContain(IDA_ORIGIN);

    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(FIXTURE.history);
    if (!sanitizedHistory) throw new Error("cumulative same-actor fixture failed sanitization");
    expect(extractSpcNextLifeChoiceDecision(
      upstreamResponse({
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        reason: "the prior Ida episodes belong to the competing Ida future, so they can matter comparatively while I choose the unrelated current future",
        supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, OTHER_ORIGIN],
        reviewAfterSeconds: 30,
      }),
      sanitizedHistory.candidateMatterIds,
      sanitizedHistory.candidateSupports,
    )).toMatchObject({
      kind: "focus_matter",
      matterId: OTHER_MATTER,
      supportEvidenceIds: [OLD_A_OUTCOME, OLD_B_OUTCOME, OTHER_ORIGIN],
    });
  });
});
