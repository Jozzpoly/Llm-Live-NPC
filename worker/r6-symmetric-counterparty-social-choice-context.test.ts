// @ts-ignore Vitest/Vite loads the frozen JSON fixture; worker tsconfig intentionally has no Node/JSON ambient types.
import FIXTURE from "../evidence/r6-symmetric-counterparty-social-choice-context.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const NELA = "matter.oren.r6.symmetric-social.nela";
const IDA = "matter.oren.r6.symmetric-social.ida";
const OLD_STANDING = "matter.oren.r6.symmetric-social.old-standing";
const RELEASE = "evidence-social-commitment-release:r6-symmetric-social-old-nela-release";
const NELA_ORIGIN = "evidence.oren.r6.symmetric-social.nela-origin";
const IDA_ORIGIN = "evidence.oren.r6.symmetric-social.ida-origin";

function upstreamResponse(decision: unknown) {
  return {
    id: "resp_r6_symmetric_counterparty_social",
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

describe("R6 symmetric counterparty social choice contract", () => {
  it("keeps current Nela/Ida state matched across twins and differs only by one old Nela release on current Nela C", () => {
    const control = structuredClone(FIXTURE.control) as any;
    const history = structuredClone(FIXTURE.history) as any;

    expect(control.life.matters.some((matter: any) => matter.id === OLD_STANDING)).toBe(false);
    expect(history.life.matters.some((matter: any) => matter.id === OLD_STANDING)).toBe(false);

    const historyNela = history.life.matters.find((matter: any) => matter.id === NELA);
    expect(historyNela?.historicalSupport).toEqual([{
      relation: "prior_counterparty_social_outcome",
      sourceMatterId: OLD_STANDING,
      evidence: expect.objectContaining({
        id: RELEASE,
        kind: "resident_released_social_commitment",
      }),
    }]);

    const stripped = structuredClone(history);
    delete stripped.life.matters.find((matter: any) => matter.id === NELA).historicalSupport;
    expect(stripped).toEqual(control);

    const sanitizedControl = sanitizeSpcNextLifeChoiceContext(control);
    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(history);
    expect(sanitizedControl).not.toBeNull();
    expect(sanitizedHistory).not.toBeNull();

    expect(sanitizedHistory?.candidateMatterIds).toEqual(
      [NELA, IDA].sort((a, b) => a.localeCompare(b)),
    );

    const controlNela = sanitizedControl?.candidateSupports.find(
      (candidate) => candidate.matterId === NELA,
    );
    const controlIda = sanitizedControl?.candidateSupports.find(
      (candidate) => candidate.matterId === IDA,
    );
    const historyNelaSupport = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === NELA,
    );
    const historyIdaSupport = sanitizedHistory?.candidateSupports.find(
      (candidate) => candidate.matterId === IDA,
    );

    expect(controlNela?.facts.map((fact) => fact.evidenceId)).toEqual([NELA_ORIGIN]);
    expect(controlIda?.facts.map((fact) => fact.evidenceId)).toEqual([IDA_ORIGIN]);
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
    expect(historyIdaSupport?.facts.map((fact) => fact.evidenceId)).toEqual([IDA_ORIGIN]);
  });

  it("exposes the Nela release comparatively for either social choice without leaking sibling current origins", async () => {
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
            matterId: IDA,
            reason: "Nela's exact earlier release belongs to the competing Nela future, so choose the equally current Ida future instead",
            supportEvidenceIds: [RELEASE, IDA_ORIGIN],
            reviewAfterSeconds: 30,
          }
        : {
            kind: "defer_all",
            reason: "both current social futures remain legal without comparative counterparty history",
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

    expect(focusVariant(controlSchema, NELA).properties.supportEvidenceIds.items.enum)
      .toEqual([NELA_ORIGIN]);
    expect(focusVariant(controlSchema, IDA).properties.supportEvidenceIds.items.enum)
      .toEqual([IDA_ORIGIN]);

    expect(focusVariant(historySchema, NELA).properties.supportEvidenceIds.items.enum)
      .toEqual([RELEASE, NELA_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focusVariant(historySchema, IDA).properties.supportEvidenceIds.items.enum)
      .toEqual([RELEASE, IDA_ORIGIN].sort((a, b) => a.localeCompare(b)));
    expect(focusVariant(historySchema, NELA).properties.supportEvidenceIds.items.enum)
      .not.toContain(IDA_ORIGIN);
    expect(focusVariant(historySchema, IDA).properties.supportEvidenceIds.items.enum)
      .not.toContain(NELA_ORIGIN);

    const sanitizedHistory = sanitizeSpcNextLifeChoiceContext(FIXTURE.history);
    if (!sanitizedHistory) throw new Error("symmetric counterparty fixture failed sanitization");

    for (const [matterId, ownOrigin] of [[NELA, NELA_ORIGIN], [IDA, IDA_ORIGIN]] as const) {
      expect(extractSpcNextLifeChoiceDecision(
        upstreamResponse({
          kind: "focus_matter",
          matterId,
          reason: matterId === NELA
            ? "choose Nela; her exact earlier release is relevant to this current social future"
            : "choose Ida; Nela's exact earlier release belongs to the competing social future and matters comparatively",
          supportEvidenceIds: [RELEASE, ownOrigin],
          reviewAfterSeconds: 30,
        }),
        sanitizedHistory.candidateMatterIds,
        sanitizedHistory.candidateSupports,
      )).toMatchObject({
        kind: "focus_matter",
        matterId,
        supportEvidenceIds: [RELEASE, ownOrigin],
      });
    }
  });
});
