/**
 * Only explicit OWNER-approved deployment of the isolated SPC research Worker.
 * Never auto-deploy from CI, import secrets from source, or target production.
 * dry-run rehearses the SAME generated Vite config and secrets-file mechanism.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, isAbsolute, relative } from "node:path";

const root=process.cwd();
const targetName="llm-live-npc-spc-research";
const dryRun=process.argv.includes("--dry-run");
const approved=process.argv.includes("--confirm-name="+targetName);
const secretsArgument=process.argv.find(x=>x.startsWith("--secrets-file="));
let secretFile=secretsArgument?secretsArgument.slice("--secrets-file=".length):null;
if(!dryRun && (!approved || !secretFile)) {
  throw new Error("No deployment: require --confirm-name="+targetName+
    " AND --secrets-file=<local .env file>. NEVER paste secrets in chat or CLI args.");
}
const built=spawnSync(process.execPath,[resolve(root,"scripts/spc-research-build.mjs")],{
  cwd:root,env:process.env,stdio:"inherit",
});
if(built.error||built.status!==0)throw new Error("Isolated research Vite build failed; NOT deploying");
const manifest=resolve(root,"dist/llm_live_npc_spc_research/wrangler.json");
if(!existsSync(manifest))throw new Error("Research build generated no exact expected Worker manifest");
const config=JSON.parse(readFileSync(manifest,"utf8"));
if(config.name!==targetName||config.preview_urls!==false
  || config.vars?.SPC_RESEARCH_LUNA_ONLY!=="true"
  || !config.secrets?.required?.includes("OPENAI_API_KEY")
  || !config.secrets?.required?.includes("SPC_RESEARCH_OPERATOR_TOKEN")
  || config.ratelimits?.find(x=>x.name==="HEARTH_COGNITION_LIMITER")?.simple?.limit!==1
  || !config.assets?.directory) {
  throw new Error("SPC research generated deployment manifest violates its isolation contract");
}
let tempDir=null;
try {
  if(dryRun){
    tempDir=mkdtempSync(join(tmpdir(),"spc-research-dryrun-"));
    secretFile=join(tempDir,"not-real-secrets.env");
    writeFileSync(secretFile,
      "OPENAI_API_KEY=ci-placeholder-not-a-real-credential\n"+
      "SPC_RESEARCH_OPERATOR_TOKEN=ci-placeholder-long-enough-to-test-wrangler-contract\n",
      {mode:0o600});
  }
  const path=resolve(root,secretFile);
  if(!existsSync(path))throw new Error("Missing local secret file; no deployment");
  // When secret bundles live INSIDE the checkout, require an ignored filename.
  // Never let a casual secrets.json or copied text file be committed to Git.
  const inside=relative(root,path);
  if(inside && !inside.startsWith("..") && !isAbsolute(inside)
    && !/(?:^|[/\\])(?:\.env[^/\\]*|[^/\\]+\.secrets\.json)$/u.test(inside)) {
    throw new Error("Local secret bundle inside repository must be .env* or *.secrets.json (ignored by Git)");
  }
  const contents=readFileSync(path,"utf8");
  let pairs;
  if(path.endsWith(".json")){
    pairs=JSON.parse(contents);
  }else{
    pairs=Object.fromEntries(contents.split(/\r?\n/u)
      .filter(line=>line.trim()&&!line.trim().startsWith("#"))
      .map(line=>{const pos=line.indexOf("=");return pos>=1?[line.slice(0,pos).trim(),line.slice(pos+1).trim()]:["",""];}));
  }
  if(typeof pairs.OPENAI_API_KEY!=="string"||!pairs.OPENAI_API_KEY.trim()
    ||typeof pairs.SPC_RESEARCH_OPERATOR_TOKEN!=="string"
    ||pairs.SPC_RESEARCH_OPERATOR_TOKEN.length<32) {
    throw new Error("Research secret file requires OPENAI_API_KEY and 32+ char operator secret");
  }
  // No key values are logged, and no plain-text values enter CLI arguments.
  const args=[
    resolve(root,"node_modules/wrangler/bin/wrangler.js"),"deploy",
    "--config",manifest,"--secrets-file",path,
    ...(dryRun?["--dry-run"]:[]),
  ];
  const result=spawnSync(process.execPath,args,{
    cwd:root,env:process.env,stdio:"inherit",
  });
  if(result.error||result.status!==0)throw new Error("Research Worker "+(dryRun?"dry-run":"deploy")+" failed");
  console.log(dryRun
    ?"SPC_RESEARCH_DEPLOY_DRY_RUN_PASS: verified generated Worker + bundled fake secrets"
    :"SPC_RESEARCH_DEPLOY_SUBMITTED: verify real Cloudflare routing/auth before ANY Luna call");
}finally{
  if(tempDir)rmSync(tempDir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
