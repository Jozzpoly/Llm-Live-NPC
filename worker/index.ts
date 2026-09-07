import { BUILD_PROVENANCE } from "../src/build-provenance";
import { handleE1AgentDecision, type E1AgentEnv } from "./e1-agent";

const GATEWAY_ID = "default";
const LIVE_STAGE = "e1-grounded-notice-fetch";

interface WorkerVersionMetadataBinding {
  id: string;
  tag?: string;
  timestamp: string;
}

interface Env extends E1AgentEnv {
  CF_VERSION_METADATA?: WorkerVersionMetadataBinding;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "llm-live-npc",
        aiBinding: Boolean(env.AI),
        gateway: GATEWAY_ID,
        stage: LIVE_STAGE,
        build: {
          commitSha: BUILD_PROVENANCE.commitSha,
          branch: BUILD_PROVENANCE.branch,
          workerVersionId: env.CF_VERSION_METADATA?.id ?? null,
          workerVersionTag: env.CF_VERSION_METADATA?.tag ?? null,
          workerVersionTimestamp: env.CF_VERSION_METADATA?.timestamp ?? null
        },
        cognitionEndpoint: "/api/agent/e1/decide",
        transportQualificationEndpoint: null
      });
    }

    if (url.pathname === "/api/agent/e1/decide") {
      return handleE1AgentDecision(request, env);
    }

    if (url.pathname === "/api/ai/smoke") {
      return json(
        {
          error: "Superseded by closed model-transport qualification evidence."
        },
        { status: 410 }
      );
    }

    if (url.pathname === "/api/ai/qualify") {
      return json(
        {
          error: "Transport qualification is retired on the E1 runtime."
        },
        { status: 410 }
      );
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};
