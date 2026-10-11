import { describe, expect, it, vi } from "vitest";
import worker from "./index";
import researchText from "../wrangler.spc-research.jsonc?raw";
import productionText from "../wrangler.jsonc?raw";

const config = JSON.parse(researchText);
const production = JSON.parse(productionText);
const secret = "only-for-local-tests-not-a-real-credential-123456";
function env() {
  return {
    SPC_RESEARCH_LUNA_ONLY: "true",
    SPC_RESEARCH_OPERATOR_TOKEN: secret,
    OPENAI_API_KEY: "only-test-key",
    AI: { run: vi.fn(async () => ({})) },
    AI_PROBE_LIMITER: { limit: vi.fn(async () => ({success:true})) },
    HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({success:true})) },
  };
}
function post(path: string, bearer = true) {
  return new Request("https://research.spc.test"+path,{
    method:"POST",
    headers: {
      "content-type":"application/json",
      ...(bearer?{authorization:"Bearer "+secret}:{}),
    },
    body:"{}",
  });
}
describe("isolated SPC Luna microprobe has no accidental production path", () => {
  it("requires a distinct Worker, disabled previews, both secrets and independent rate-limit counters", () => {
    expect(config.name).toBe("llm-live-npc-spc-research");
    expect(config.name).not.toBe(production.name);
    expect(config.preview_urls).toBe(false);
    expect(config.workers_dev).toBe(true);
    expect(config.vars.SPC_RESEARCH_LUNA_ONLY).toBe("true");
    expect(config.secrets.required).toEqual(["OPENAI_API_KEY","SPC_RESEARCH_OPERATOR_TOKEN"]);
    expect(config.assets.run_worker_first).toContain("/api/*");
    const namespaces=config.ratelimits.map((x:{namespace_id:string})=>x.namespace_id);
    const current=production.ratelimits.map((x:{namespace_id:string})=>x.namespace_id);
    expect(new Set(namespaces).size).toBe(namespaces.length);
    expect(namespaces.some((x:string)=>current.includes(x))).toBe(false);
    expect(config.ratelimits.find((x:{name:string})=>x.name==="HEARTH_COGNITION_LIMITER")?.simple)
      .toEqual({limit:1,period:60});
  });

  it("does not let even a valid operator call any other model route", async () => {
    const e=env();
    for(const path of [
      "/api/ai/qualify",
      "/api/hearth/cognition",
      "/api/spc-next/cognition",
      "/api/spc-next/life-choice",
      "/api/spc-next/semantic",
      "/api/resident/converse",
      "/api/agent/e1/decide",
      "/api/first-presence/semantic/propose",
    ]) {
      const result=await worker.fetch(post(path),e);
      expect(result.status, path).toBe(404);
      expect((await result.json()).code).toBe("research_route_disabled");
    }
    expect(e.AI.run).not.toHaveBeenCalled();
    expect(e.HEARTH_COGNITION_LIMITER.limit).not.toHaveBeenCalled();
  });

  it("requires authorization before paid route selection and rejects invalid Luna context before upstream", async () => {
    const e=env();
    expect((await worker.fetch(post("/api/spc-next/life-intent",false),e)).status).toBe(403);
    expect((await worker.fetch(post("/api/spc-next/life-intent"),e)).status).toBe(400);
    expect(e.HEARTH_COGNITION_LIMITER.limit).not.toHaveBeenCalled();
    expect(e.AI.run).not.toHaveBeenCalled();
  });
});
