import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const processEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env ?? {};

const buildCommit = processEnv.WORKERS_CI_COMMIT_SHA ?? processEnv.GITHUB_SHA ?? null;
const buildBranch =
  processEnv.WORKERS_CI_BRANCH ??
  processEnv.GITHUB_HEAD_REF ??
  processEnv.GITHUB_REF_NAME ??
  null;

export default defineConfig({
  define: {
    "import.meta.env.LLM_LIVE_NPC_BUILD_COMMIT": JSON.stringify(buildCommit),
    "import.meta.env.LLM_LIVE_NPC_BUILD_BRANCH": JSON.stringify(buildBranch)
  },
  plugins: [cloudflare()]
});
