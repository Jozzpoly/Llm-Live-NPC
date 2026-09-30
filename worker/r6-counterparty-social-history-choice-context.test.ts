// @ts-ignore Vitest/Vite loads the frozen JSON fixture; worker tsconfig intentionally has no Node/JSON ambient types.
import FIXTURE from "../evidence/r6-counterparty-social-history-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const NELA_MATTER = "matter.oren-r6-counterparty-support.causal.reason:reason:oren:r6:counterparty-support:current-nela";
const OTHER_MATTER = "matter.oren.r6.counterparty-support.other";
const OLD_STANDING = "matter.oren.r6.counterparty-support.standing";
const RELEASE = "evidence-social-commitment-release:994176f47a5d7832";
const NELA_ORIGIN = "evidence:oren-r6-counterparty-support:accepted-reason:reason:oren:r6:counterparty-support:current-nela:82";
const OTHER_ORIGIN = "evidence.oren.r6.counterparty-support.other-origin";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_counterparty_social_history",
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
    usage: { input_tokens: 220, output_tokens: 36, total_tokens: 256 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("R6 counterparty-caused social history choice contract", () => {
  it("keeps old standing matter absent and differs only by one typed counterparty release fact", () => {
    const control = structuredClone(FIXTURE.control) as any;
    const history = structuredClone(FIXTURE.history) as any;

    expect(control.life.matters.some((matter: any) => matter.id === OLD_STANDING)).toBe(false);
    expect(history.life.matters.some((matter: any) => matter.id === OLD_STANDING)).toBe(false);

    const historyNela = history.life.matters.find((matter: any) => matter.id === NELA_MATTER);
    expect(historyNela?.historicalSupport).toEqual([{
      relation: "prior_counterparty_social_outcome",
      sourceMatterId: OLD_STANDING,
      evidence: expect.objectContaining({
        id: RELEASE,
        kind: "resident_released_social_commitment",
      }),
    }]);

    const stripped = structuredClone(history);
    delete stripped.life.matters.find((matter: any) => matter.id === NELA_MATTER).historicalSupport;
    expect(stripped).toEqual(control);

    const sanitizedControl = sanitizeSpcNextLifeChoiceContext(control);
    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(history);
    expect(sanitizedControl).not.toBeNull();
    expect(sanitizedHistory).not.toBeNull();

    const controlNela = sanitizedControl?.candidateSupports.find(
      (candidate) => candidate.matterId === NELA_MATTER,
    );
    const historyNelaSupport = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === NELA_MATTER,
    );
    const historyOther = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );

    expect(controlNela?.facts.map((fact) => fact.evidenceId)).toEqual([NELA_ORIGIN]);
    expect(historyNelaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: RELEASE,
        sourceMatterId: OLD_STANDING,
        relation: "prior_counterparty_social_outcome",
        evidenceKind: "resident_released_social_commitment",
      }),
      expect.objectContaining({
        evidenceId: NELA_ORIGIN,
        relation: "matter_origin",
      }),
    ]));
    expect(historyOther?.facts.map((fact) => fact.evidenceId)).toEqual([OTHER_ORIGIN]);
  });

  it("exposes the release as comparative schema support without leaking current origins", async () => {
    const captured: any[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      captured.push(body);
      const modelInput = JSON.parse(body.input[0].content);
      const hasRelease = modelInput.choiceSupport
        .flatMap((candidate: any) => candidate.facts)
        .some((fact: any) => (
          fact.relation === "prior_counterparty_social_outcome"
          && fact.evidenceId === RELEASE
        ));
      const decision = hasRelease
        ? {
            kind: "focus_matter",
            matterId: OTHER_MATTER,
            reason: "Nela's exact earlier release belongs to the competing Nela future, so choose the unrelated current future instead",
            supportEvidenceIds: [RELEASE, OTHER_ORIGIN],
            reviewAfterSeconds: 30,
          }
        : {
            kind: "defer_all",
            reason: "the two current futures have no comparative prior counterparty evidence",
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
      expect((await response.json() as any).ok).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const focusVariant = (schema: any[], matterId: string) => schema.find(
      (variant) => variant.properties?.kind?.enum?.includes("focus_matter")
        && variant.properties?.matterId?.enum?.[0] === matterId,
    );
    const controlSchema = captured[0].text.format.schema.properties.decision.anyOf;
    const historySchema = captured[1].text.format.schema.properties.decision.anyOf;

    expect(focusVariant(controlSchema, NELA_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([NELA_ORIGIN]);
    expect(focusVariant(controlSchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([OTHER_ORIGIN]);
    expect(focusVariant(historySchema, NELA_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([RELEASE, NELA_ORIGIN].sort((a,b)=>a.localeCompare(b)));
    expect(focusVariant(historySchema, OTHER_MATTER).properties.supportEvidenceIds.items.enum)
      .toEqual([RELEASE, OTHER_ORIGIN].sort((a,b)=>a.localeCompare(b)));

    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(FIXTURE.history);
    if (!sanitizedHistory) throw new Error("counterparty social history fixture failed sanitization");
    expect(extractSpcNextLifeChoiceDecision(
      upstreamResponse({
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        reason: "the exact old Nela release belongs to the competing Nela future, so take the unrelated future",
        supportEvidenceIds: [RELEASE, OTHER_ORIGIN],
        reviewAfterSeconds: 30,
      }),
      sanitizedHistory.candidateMatterIds,
      sanitizedHistory.candidateSupports,
    )).toMatchObject({
      kind: "focus_matter",
      matterId: OTHER_MATTER,
      supportEvidenceIds: [RELEASE, OTHER_ORIGIN],
    });
  });
});
