import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const output = resolve(process.env.UNIFIED_ARMED_OUTPUT ?? "evidence/browser/unified-armed.json");
const report = { sourceSha: process.env.SOURCE_SHA ?? "local", assertions: [], requests: [], modelRouteRequests: [], exceptions: [] };
const wait = ms => new Promise(r => setTimeout(r,ms));
mkdirSync(dirname(output),{recursive:true});
function check(name,ok,detail=null) {
  report.assertions.push({name,pass:!!ok,detail});
  if(!ok) throw Error(name+": "+JSON.stringify(detail));
}
class Cdp {
  constructor(url) { this.url=url;this.n=0;this.pending=new Map();this.handlers=new Map(); }
  async open(){
    this.ws=new WebSocket(this.url);
    await new Promise((yes,no)=>{
      let t=setTimeout(()=>no(Error("open timeout")),10000);
      this.ws.addEventListener("open",()=>{clearTimeout(t);yes();},{once:true});
      this.ws.addEventListener("error",()=>{clearTimeout(t);no(Error("websocket error"));},{once:true});
    });
    this.ws.addEventListener("message",event=>{
      const m=JSON.parse(String(event.data));
      if(m.id!==undefined){
        const p=this.pending.get(m.id);if(!p)return;
        this.pending.delete(m.id);m.error?p.no(Error(m.error.message)):p.yes(m.result??{});
      }else for(const fn of this.handlers.get(m.method)??[])fn(m.params??{});
    });
  }
  on(method,fn){this.handlers.set(method,[...this.handlers.get(method)??[],fn]);}
  send(method,params={}){
    return new Promise((yes,no)=>{
      const id=++this.n, t=setTimeout(()=>{this.pending.delete(id);no(Error(method+" timeout"));},60000);
      this.pending.set(id,{yes:r=>{clearTimeout(t);yes(r);},no:e=>{clearTimeout(t);no(e);}});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){this.ws?.close();}
}
async function until(callback,timeout=12000){
  const stop=Date.now()+timeout;
  while(Date.now()<stop){try{if(await callback())return;}catch{}await wait(100);}
  throw Error("deadline exceeded");
}
async function runIn(cdp,code) {
  const r=await cdp.send("Runtime.evaluate",{expression:code,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text+": "+(r.result?.description??""));
  return r.result?.value;
}
function chromePath(){
  for(const candidate of [process.env.CHROME_PATH,"/usr/bin/google-chrome","/usr/bin/chromium"].filter(Boolean))
    if(existsSync(candidate))return candidate;
  for(const name of ["google-chrome","chromium","chromium-browser"])
    try{return execFileSync("which",[name],{encoding:"utf8"}).trim();}catch{}
  throw Error("Chrome missing");
}
const port=12000+Math.floor(Math.random()*800), profile=mkdtempSync(resolve(tmpdir(),"unified-armed-"));
const chrome=spawn(chromePath(),[
  "--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-extensions",
  "--disable-background-networking","--remote-debugging-port="+port,
  "--remote-debugging-address=127.0.0.1","--user-data-dir="+profile,
  "--window-size=1400,900","about:blank"
],{stdio:"ignore"});
let cdp=null;
try{
  let target;
  await until(async()=>{
    const r=await fetch("http://127.0.0.1:"+port+"/json/new?about:blank",{method:"PUT"});
    if(!r.ok)return false;
    target=await r.json();return !!target.webSocketDebuggerUrl;
  });
  cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.open();
  cdp.on("Network.requestWillBeSent",({request})=>{
    if(request?.method==="POST" && /[/]api[/](?:spc-next|ai)[/]/u.test(request.url??"")) {
      report.modelRouteRequests.push({ url: request.url, method: request.method });
    }
    if(request?.url?.includes("/api/spc-next/life-intent")) {
      let context = null;
      try { context = JSON.parse(request.postData ?? ""); } catch {}
      report.requests.push({
        url:request.url,method:request.method,
        residentId:context?.resident?.id??null,
        reasonKinds:Array.isArray(context?.reasons)?context.reasons.map(x=>x.kind):[],
        reasonIds:Array.isArray(context?.reasons)?context.reasons.map(x=>x.id):[],
      });
    }
  });
  cdp.on("Runtime.exceptionThrown",({exceptionDetails})=>{
    report.exceptions.push(exceptionDetails?.exception?.description??exceptionDetails?.text??"unknown");
  });
  await Promise.all([cdp.send("Page.enable"),cdp.send("Network.enable"),cdp.send("Runtime.enable")]);
  await cdp.send("Page.navigate",{url:base.replace(/\/$/u,"")+"/?spc=1&evidence=1&scenario=unified-armed"});
  await until(()=>runIn(cdp,'Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))'));
  check("explicit one-shot UI",await runIn(cdp,'Array.from(document.querySelectorAll("button")).some(b=>b.textContent?.includes("Zapytaj Lunę")&&!b.hidden)'));
  const initial=await runIn(cdp,"window.__SPC_EVIDENCE__.snapshot()");
  check("no API at load",initial.livingDiagnostics?.providerRequestCount===0&&report.requests.length===0);
  await runIn(cdp,"window.__SPC_EVIDENCE__.stepWorld(2600)");
  const ready=await runIn(cdp,"window.__SPC_EVIDENCE__.snapshot()");
  check("five residents claimed and no API through 2600 World ticks",
    ready.livingDiagnostics?.claimedResidentIds?.length===5
    &&ready.livingDiagnostics?.providerRequestCount===0
    &&report.requests.length===0,
    {claimed:ready.livingDiagnostics?.claimedResidentIds,provider:ready.livingDiagnostics?.providerRequestCount});
  const speech=await runIn(cdp,'window.__SPC_EVIDENCE__.addressResident("resident.mira","Mira, czy możemy chwilę porozmawiać?")');
  check("actual World speech",speech?.kind==="speech"&&speech?.actorId==="player.jozz",speech);
  await runIn(cdp,"window.__SPC_EVIDENCE__.stepWorld(1)");
  check("player utterance not automatically billed",report.requests.length===0);
  const clicked=await runIn(cdp,'(()=>{const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes("Zapytaj Lunę"));b?.click();return b?.disabled??null;})()');
  check("one explicit click disables itself",clicked===true,{clicked});
  await until(()=>report.requests.length>=1,5000);
  check("exactly one network attempt",report.requests.length===1,report.requests);
  check("Mira alone forwards genuine heard player speech, not an invented provider reason",
    report.requests[0]?.residentId==="resident.mira"
    &&report.requests[0]?.reasonKinds?.includes("heard_speech"),
    report.requests[0]);
  await runIn(cdp,"window.__SPC_EVIDENCE__.stepWorld(500)");
  await wait(200);
  const after=await runIn(cdp,"window.__SPC_EVIDENCE__.snapshot()");
  check("no auto retry after another 500 World ticks",
    report.requests.length===1
    &&after.livingDiagnostics?.providerHardBudget?.upstreamRequestsStarted===1,
    {attempts:report.requests.length,budget:after.livingDiagnostics?.providerHardBudget});
  check("no browser exception",report.exceptions.length===0,report.exceptions);
  const screenshot=await cdp.send("Page.captureScreenshot",{format:"png"});
  writeFileSync(resolve(dirname(output),"unified-armed.png"),Buffer.from(screenshot.data,"base64"));
  // Separate independent browser-run, intentionally WITHOUT a fresh player action.
  // The authored opening is a factual starting condition, NOT self-created motive.
  const beforeQuiet=report.requests.length;
  await cdp.send("Page.navigate",{
    url:base.replace(/[/]$/u,"")+"/?spc=1&evidence=1&scenario=unified-armed&case=quiet-self-future"
  });
  await until(()=>runIn(cdp,'Boolean(location.search.includes("case=quiet-self-future") && window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))'));
  const quietAtStart=await runIn(cdp,"window.__SPC_EVIDENCE__.snapshot()");
  check("quiet second run starts a fresh World with zero API",
    quietAtStart.livingDiagnostics?.providerRequestCount===0&&report.requests.length===beforeQuiet);
  await runIn(cdp,"window.__SPC_EVIDENCE__.stepWorld(2600)");
  const quietReady=await runIn(cdp,"window.__SPC_EVIDENCE__.snapshot()");
  check("Mira and all five finished authored openings without player dialogue or upstream traffic",
    quietReady.livingDiagnostics?.claimedResidentIds?.length===5
    &&quietReady.selectedResidentId==="resident.mira"
    &&report.requests.length===beforeQuiet,
    {claimed:quietReady.livingDiagnostics?.claimedResidentIds,selected:quietReady.selectedResidentId});
  const quietClicked=await runIn(cdp,'(()=>{const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes("Zapytaj Lunę"));b?.click();return b?.disabled??null;})()');
  check("operator can explicitly ask Mira without scripting a player utterance",quietClicked===true);
  await until(()=>report.requests.length===beforeQuiet+1,5000);
  const quietRequest=report.requests.at(-1);
  check("self-history request carries genuine private activity completion, no heard player speech",
    quietRequest?.residentId==="resident.mira"
    &&quietRequest?.reasonKinds?.includes("activity_completed")
    &&!quietRequest?.reasonKinds?.includes("heard_speech")
    &&quietRequest?.reasonIds?.length>0,
    quietRequest);
  await runIn(cdp,"window.__SPC_EVIDENCE__.stepWorld(500)");
  await wait(200);
  const quietAfter=await runIn(cdp,"window.__SPC_EVIDENCE__.snapshot()");
  check("quiet self-history trial never auto-retries after rejected static-server provider",
    report.requests.length===beforeQuiet+1
    &&quietAfter.livingDiagnostics?.providerHardBudget?.upstreamRequestsStarted===1);
  check("no browser exceptions across independent speech and quiet runs",
    report.exceptions.length===0,report.exceptions);
  const quietScreenshot=await cdp.send("Page.captureScreenshot",{format:"png"});
  writeFileSync(resolve(dirname(output),"unified-armed-self-future.png"),Buffer.from(quietScreenshot.data,"base64"));
  // Public browse-only mode: even after an operator has a valid cookie,
  // opening the living World must NEVER start model traffic on a World tick.
  const beforeBrowseOnly = report.requests.length;
  await cdp.send("Page.navigate", {
    url: base.replace(/[/]$/u, "") + "/?spc=1&evidence=1&scenario=unified-living&case=browse-only"
  });
  await until(()=>runIn(cdp,'Boolean(location.search.includes("case=browse-only") && window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))'));
  const browseStart = await runIn(cdp, "window.__SPC_EVIDENCE__.snapshot()");
  check("browse-only living starts without external cognition",
    browseStart.livingDiagnostics?.providerRequestCount===0
    && report.requests.length===beforeBrowseOnly);
  check("browse-only exposes no manual Luna click",
    await runIn(cdp,'!Array.from(document.querySelectorAll("button")).some(b=>b.textContent?.includes("Zapytaj Lunę")&&!b.hidden)'));
  await runIn(cdp, "window.__SPC_EVIDENCE__.stepWorld(3600)");
  const browseEnd = await runIn(cdp, "window.__SPC_EVIDENCE__.snapshot()");
  check("3600 browse-only World ticks with real private pressures cannot call any model",
    report.requests.length===beforeBrowseOnly
    && browseEnd.livingDiagnostics?.providerRequestCount===0,
    {newRequests:report.requests.length-beforeBrowseOnly,
      providerCount:browseEnd.livingDiagnostics?.providerRequestCount});
  // Test archival browser routes too. They historically started a provider
  // automatically; opening them after operator login must not silently spend.
  const silentLegacyRoutes = [
    "missing-crate-live-provider",
    "missing-crate-live-provider-interruption",
    "r5-mira-live-semantic-escalation",
  ];
  for (const legacyScenario of silentLegacyRoutes) {
    const before = report.modelRouteRequests.length;
    await cdp.send("Page.navigate", {
      url: base.replace(/[/]$/u, "") + "/?spc=1&evidence=1&scenario=" + legacyScenario
    });
    await until(()=>runIn(cdp,
      'Boolean(location.search.includes("scenario=' + legacyScenario + '") && window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))'));
    if (legacyScenario === "r5-mira-live-semantic-escalation") {
      await runIn(cdp, 'window.__SPC_EVIDENCE__.scenarioAction("ida-address-mira")');
    }
    await runIn(cdp, "window.__SPC_EVIDENCE__.stepWorld(1800)");
    await wait(50);
    check("legacy " + legacyScenario + " has zero model POST even when the World advances",
      report.modelRouteRequests.length===before,
      {route:legacyScenario, attempts:report.modelRouteRequests.slice(before)});
  }
  report.outcome="PASS";
}catch(e){report.outcome="FAIL";report.failure=e instanceof Error?e.stack:String(e);process.exitCode=1;}
finally{
  writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  cdp?.close();
  chrome.kill("SIGTERM");
  await wait(500);
  try{rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
console.log(JSON.stringify({outcome:report.outcome,assertions:report.assertions,requests:report.requests.length,exceptions:report.exceptions,failure:report.failure??null},null,2));
