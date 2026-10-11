/**
 * Isolated SPC microprobe preflight ONLY. No Cloudflare login, secret loading,
 * network deployment or API inference. The Vite plugin must compile with the
 * research input config; plain wrangler --config after a default vite build
 * is not a safe replacement (it may deploy the wrong output Worker).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const expectedName = "llm-live-npc-spc-research";
const root = process.cwd();
const expectedConfig = resolve(root, "wrangler.spc-research.jsonc");
const dryRun = process.argv.includes("--dry-run");
const input = JSON.parse(readFileSync(expectedConfig, "utf8"));
if (input.name !== expectedName || input.preview_urls !== false
  || input.vars?.SPC_RESEARCH_LUNA_ONLY !== "true"
  || !input.secrets?.required?.includes("SPC_RESEARCH_OPERATOR_TOKEN")) {
  throw new Error("SPC microprobe input config failed fail-closed preflight");
}
const environment = {
  ...process.env,
  CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: expectedConfig,
};
const vite = spawnSync(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build"], {
  cwd: root, env: environment, stdio: "inherit",
});
if (vite.error || vite.status !== 0) throw new Error("SPC isolated Vite build failed");

function collectWranglerJson(directory, depth = 0) {
  if (!existsSync(directory) || depth > 5) return [];
  return readdirSync(directory).flatMap(entry => {
    const candidate = join(directory, entry);
    if (statSync(candidate).isDirectory()) return collectWranglerJson(candidate, depth + 1);
    return entry === "wrangler.json" ? [candidate] : [];
  });
}
const generated = collectWranglerJson(resolve(root, "dist"))
  .map(path => ({path, json: JSON.parse(readFileSync(path, "utf8"))}))
  .filter(candidate => candidate.json.name === expectedName);
if (generated.length !== 1) {
  throw new Error("Expected exactly one research Worker compiled output, got "+generated.length);
}
const output = generated[0];
if (output.json.preview_urls !== false
  || output.json.vars?.SPC_RESEARCH_LUNA_ONLY !== "true"
  || !output.json.secrets?.required?.includes("SPC_RESEARCH_OPERATOR_TOKEN")
  || output.json.main == null
  || !output.json.assets?.directory
  || output.json.assets?.run_worker_first?.[0] !== "/api/*") {
  throw new Error("Generated Worker output would not safely serve research UI/API");
}
console.log("ISOLATED_RESEARCH_BUILD_VERIFIED", JSON.stringify({
  name:output.json.name, preview_urls:output.json.preview_urls,
  worker:output.path, assets:output.json.assets.directory,
  requiredSecrets:output.json.secrets.required,
  researchOnly:output.json.vars.SPC_RESEARCH_LUNA_ONLY,
}));
// FIRST-DEPLOY BOOTSTRAP ONLY — transient, staging-branch-only workaround.
// Wrangler cannot inherit required secrets from a Worker version that does not
// exist yet (Cloudflare workers-sdk #14258). The Owner has entered both values
// in the dedicated Worker's runtime settings; DO NOT copy values to build vars.
// Keep the checked-in research config and the RUNTIME operator access gate
// unchanged. Only this one generated deploy manifest skips the preflight
// declaration so the first immutable Worker version can exist. The operator
// must NOT trigger inference before separate remote auth/key verification.
//
// REVERT THIS BLOCK AND THE writeFileSync IMPORT IMMEDIATELY AFTER BOOTSTRAP.
// No main, production llm-live-npc, #165, or other donor branches are changed.
if (!dryRun) {
  if (output.json.name !== expectedName
    || !Array.isArray(output.json.secrets?.required)
    || output.json.secrets.required.length !== 2
    || !output.json.secrets.required.includes("OPENAI_API_KEY")
    || !output.json.secrets.required.includes("SPC_RESEARCH_OPERATOR_TOKEN")
    || output.json.workers_dev !== true
    || output.json.preview_urls !== false
    || output.json.vars?.SPC_RESEARCH_LUNA_ONLY !== "true") {
    throw new Error("Refuse first-deploy bootstrap outside exact isolated research Worker");
  }
  delete output.json.secrets;
  writeFileSync(output.path, JSON.stringify(output.json, null, 2) + "\\n", { mode: 0o600 });
  console.log("SPC_RESEARCH_FIRST_DEPLOY_BOOTSTRAP: required-secret declaration temporarily omitted ONLY from generated manifest; runtime authorization unchanged; model calls NOT executed.");
}

if (dryRun) {
  const wrangler = spawnSync(process.execPath,
    [resolve(root,"node_modules/wrangler/bin/wrangler.js"),"deploy","--dry-run"], {
      cwd:root, env:environment, stdio:"inherit",
    });
  if (wrangler.error || wrangler.status !== 0) throw new Error("SPC research Wrangler dry run failed");
}
