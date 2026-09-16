import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const OUT_DIR = dirname(OUTPUT);
const CYCLES = 6;
const TIMEOUT = 3500;
const BLACK_LIMIT = 0.90;
const STABLE_MAD_LIMIT = 2.0;
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let liveReport = null;

function chromeExecutable() {
  for (const p of [process.env.CHROME_PATH,"/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].filter(Boolean)) if (existsSync(p)) return p;
  for (const b of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]) try { const p=execFileSync("which",[b],{encoding:"utf8"}).trim(); if(p) return p; } catch {}
  throw new Error("Chrome not found");
}
class CDP {
  constructor(url){ this.url=url; this.id=1; this.pending=new Map(); this.listeners=new Map(); }
  async open(){ this.ws=new WebSocket(this.url); await new Promise((r,j)=>{ const t=setTimeout(()=>j(new Error("CDP open timeout")),10000); this.ws.addEventListener("open",()=>{clearTimeout(t);r()},{once:true}); this.ws.addEventListener("error",()=>j(new Error("CDP open failed")),{once:true}); }); this.ws.addEventListener("message",e=>this.handle(e.data)); }
  handle(raw){ const m=JSON.parse(String(raw)); if(m.id){ const p=this.pending.get(m.id); if(!p)return; this.pending.delete(m.id); m.error?p.j(new Error(`${p.method}: ${m.error.message}`)):p.r(m.result??{}); return; } for(const f of this.listeners.get(m.method)??[])f(m.params??{}); }
  on(k,f){ this.listeners.set(k,[...(this.listeners.get(k)??[]),f]); }
  send(method,params={},ms=30000){ const id=this.id++; return new Promise((r,j)=>{ const t=setTimeout(()=>{this.pending.delete(id);j(new Error(`CDP timeout: ${method}`));},ms); this.pending.set(id,{method,r:x=>{clearTimeout(t);r(x)},j:x=>{clearTimeout(t);j(x)}}); this.ws.send(JSON.stringify({id,method,params})); }); }
  close(){ this.ws?.close(); }
}
const stable=x=>JSON.stringify(x);
const hash=x=>createHash("sha256").update(stable(x)).digest("hex");
const color=g=>[32+(g*53)%192,32+(g*97)%192,32+(g*149)%192];
async function evalv(c,expression){ const x=await c.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true}); if(x.exceptionDetails)throw new Error(x.exceptionDetails.exception?.description??x.exceptionDetails.text); return x.result?.value; }
async function pollJson(url,ms=15000){ const end=Date.now()+ms; while(Date.now()<end){ try{const r=await fetch(url);if(r.ok)return r.json()}catch{} await sleep(100);} throw new Error(`timeout ${url}`); }
async function until(fn,ms,label){ const end=Date.now()+ms; while(Date.now()<end){const x=await fn();if(x)return x;await sleep(5)} throw new Error(`timeout ${label}`); }

async function main(){
  const profile=mkdtempSync(`${tmpdir()}/spc-content-settle-`); const port=11200+Math.floor(Math.random()*300);
  const proc=spawn(chromeExecutable(),["--headless=new","--no-sandbox","--disable-dev-shm-usage",`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1",`--user-data-dir=${profile}`,"--window-size=1400,900","about:blank"],{stdio:["ignore","pipe","pipe"]});
  let c,cast=false; const frames=[];
  const rep={schemaVersion:1,experiment:"spc-presented-frame-content-settle-p1",sourceSha:SOURCE_SHA,startedAt:new Date().toISOString(),assertions:[],runtimeExceptions:[],cycles:[],rejections:[]};
  liveReport = rep;
  const check=(name,pass,detail)=>rep.assertions.push({name,pass:Boolean(pass),detail});
  try{
    const ver=await pollJson(`http://127.0.0.1:${port}/json/version`); rep.chrome=ver.Browser??null;
    const tr=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"}); const target=await tr.json(); c=new CDP(target.webSocketDebuggerUrl); await c.open();
    c.on("Runtime.exceptionThrown",x=>rep.runtimeExceptions.push(x.exceptionDetails?.exception?.description??x.exceptionDetails?.text??"unknown"));
    c.on("Page.screencastFrame",f=>{frames.push({...f,receivedAtMs:Date.now()});c.send("Page.screencastFrameAck",{sessionId:f.sessionId}).catch(()=>{});if(frames.length>240)frames.splice(0,frames.length-240)});
    await Promise.all([c.send("Page.enable"),c.send("Runtime.enable"),c.send("Emulation.setDeviceMetricsOverride",{width:1400,height:900,deviceScaleFactor:1,mobile:false})]);
    await c.send("Page.navigate",{url:`${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate`});
    await until(()=>evalv(c,'Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector(".spc-world-mode-toggle") && document.querySelector("canvas"))'),20000,"SPC ready");
    await evalv(c,`(()=>{const m=document.createElement("div");m.id="content-settle-marker";Object.assign(m.style,{position:"fixed",left:"0px",top:"0px",width:"96px",height:"96px",zIndex:"2147483647",pointerEvents:"none",background:"rgb(32,32,32)"});document.documentElement.appendChild(m);window.__CS_EVENTS=[];const b=document.querySelector(".spc-world-mode-toggle");b.addEventListener("click",e=>window.__CS_EVENTS.push({isTrusted:e.isTrusted,wallMs:performance.timeOrigin+performance.now(),worldOnly:document.querySelector("#app")?.classList.contains("spc-world-only")??null}),true);return true})()`);
    const initial=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()"); const initialHash=hash(initial);
    await c.send("Page.startScreencast",{format:"png",quality:100,maxWidth:700,maxHeight:450,everyNthFrame:1}); cast=true;

    for(let cycle=1;cycle<=CYCLES;cycle++){
      const before=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()"); const beforeHash=hash(before);
      const beforeWorldOnly=await evalv(c,'document.querySelector("#app")?.classList.contains("spc-world-only")??null');
      const g=cycle; const col=color(g); const eventCount=await evalv(c,"window.__CS_EVENTS.length"); const sendMs=Date.now();
      await evalv(c,'document.querySelector(".spc-world-mode-toggle").click()');
      const ev=await until(()=>evalv(c,`window.__CS_EVENTS.length>${eventCount}?window.__CS_EVENTS[window.__CS_EVENTS.length-1]:null`),TIMEOUT,`semantic event ${cycle}`);
      const projection=await until(()=>evalv(c,`(()=>{const x=document.querySelector("#app")?.classList.contains("spc-world-only")??null;return x!==${beforeWorldOnly}?{worldOnly:x}:null})()`),TIMEOUT,`projection ${cycle}`);
      const afterWorldOnly=projection.worldOnly;
      await evalv(c,`(()=>{const m=document.querySelector("#content-settle-marker");m.style.background="rgb(${col.join(",")})";m.dataset.generation=${JSON.stringify(String(g))};return true})()`);
      const ack=await waitContentSettledFrame(c,frames,col,ev.wallMs,cycle,rep.rejections);
      if(!ack)throw new Error(`cycle ${cycle}: no content-settled frame`);
      const after=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()"); const afterHash=hash(after); const bytes=Buffer.from(ack.frame.data,"base64");
      writeFileSync(resolve(OUT_DIR,`content-settled-${String(cycle).padStart(2,"0")}.png`),bytes);
      rep.cycles.push({cycle,beforeWorldOnly,afterWorldOnly,eventIsTrusted:ev.isTrusted,semanticSendUtcMs:sendMs,handlerWallMs:ev.wallMs,frameSwapUtcMs:ack.frameSwapUtcMs,semanticSendToFrameSwapMs:ack.frameSwapUtcMs-sendMs,handlerToFrameSwapMs:ack.frameSwapUtcMs-ev.wallMs,rejectedCandidates:ack.rejectedCandidates,acceptedMetrics:ack.metrics,canonicalTickBefore:before.tick??null,canonicalTickAfter:after.tick??null,canonicalStable:beforeHash===afterHash,pngSha256:createHash("sha256").update(bytes).digest("hex"),pngBytes:bytes.length});
    }
    const final=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");
    check("semantic clicks remain synthetic",rep.cycles.every(x=>x.eventIsTrusted===false),rep.cycles.map(x=>x.eventIsTrusted));
    check("every semantic click toggles projection",rep.cycles.every(x=>x.beforeWorldOnly!==x.afterWorldOnly),rep.cycles.map(x=>[x.beforeWorldOnly,x.afterWorldOnly]));
    check("accepted frames are nonblank and stable",rep.cycles.every(x=>x.acceptedMetrics.blackFraction<BLACK_LIMIT&&x.acceptedMetrics.stableMad<=STABLE_MAD_LIMIT),rep.cycles.map(x=>x.acceptedMetrics));
    check("content-aware ack preserves canonical World",rep.cycles.every(x=>x.canonicalStable)&&hash(final)===initialHash,{initialHash,finalHash:hash(final)});
    check("no uncaught runtime exceptions",rep.runtimeExceptions.length===0,rep.runtimeExceptions);
    rep.rejectedBlankCandidates=rep.rejections.filter(x=>x.reason==="blank").length;
    rep.rejectedUnstableCandidates=rep.rejections.filter(x=>x.reason==="unstable").length;
    rep.finishedAt=new Date().toISOString(); rep.outcome=rep.assertions.every(x=>x.pass)?"PASS":"FAIL"; writeFileSync(OUTPUT,JSON.stringify(rep,null,2)+"\n"); if(rep.outcome!=="PASS")process.exitCode=1;
  } finally { if(c&&cast)await c.send("Page.stopScreencast").catch(()=>{}); c?.close(); proc.kill("SIGTERM"); await sleep(100); if(!proc.killed)proc.kill("SIGKILL"); rmSync(profile,{recursive:true,force:true}); }
}

async function waitContentSettledFrame(c,frames,expectedColor,notBefore,cycle,rejections){
  const deadline=Date.now()+TIMEOUT; let previous=null; let rejectedCandidates=0;
  while(Date.now()<deadline){
    const frame=frames.shift(); if(!frame){await sleep(2);continue}
    const swap=Number(frame.metadata?.timestamp)*1000; if(!Number.isFinite(swap)||swap+2<notBefore)continue;
    const metrics=await inspectFrame(c,frame.data,expectedColor); if(!metrics.markerMatch)continue;
    if(metrics.blackFraction>=BLACK_LIMIT){rejections.push({cycle,frameSwapUtcMs:swap,reason:"blank",metrics});rejectedCandidates++;previous=null;continue}
    if(!previous){previous={frame,swap,metrics};continue}
    const stableMad=await frameMad(c,previous.frame.data,frame.data);
    if(stableMad>STABLE_MAD_LIMIT){rejections.push({cycle,frameSwapUtcMs:previous.swap,reason:"unstable",metrics:{...previous.metrics,stableMad}});rejectedCandidates++;previous={frame,swap,metrics};continue}
    return {frame,frameSwapUtcMs:swap,rejectedCandidates,metrics:{...metrics,stableMad,previousFrameSwapUtcMs:previous.swap}};
  }
  return null;
}

async function inspectFrame(c,data,expectedColor){
  return evalv(c,`(async()=>{const raw=atob(${JSON.stringify(data)}),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);const bm=await createImageBitmap(new Blob([u],{type:"image/png"}));const cv=document.createElement("canvas");cv.width=bm.width;cv.height=bm.height;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(bm,0,0);const marker=Array.from(x.getImageData(Math.floor(bm.width*.02),Math.floor(bm.height*.02),1,1).data);const sx=Math.floor(bm.width*.04),sy=Math.floor(bm.height*.18),sw=Math.floor(bm.width*.74),sh=Math.floor(bm.height*.77);const d=x.getImageData(sx,sy,sw,sh).data;let black=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i]<8&&d[i+1]<8&&d[i+2]<8)black++;n++;}bm.close();return{marker,markerMatch:${JSON.stringify(expectedColor)}.every((v,i)=>Math.abs(marker[i]-v)<=3),blackFraction:black/n,crop:[sx,sy,sw,sh]}})()`);
}
async function frameMad(c,a,b){
  return evalv(c,`(async()=>{async function dec(s){const raw=atob(s),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);return createImageBitmap(new Blob([u],{type:"image/png"}))}const A=await dec(${JSON.stringify(a)}),B=await dec(${JSON.stringify(b)});const w=Math.min(A.width,B.width),h=Math.min(A.height,B.height),sx=Math.floor(w*.04),sy=Math.floor(h*.18),sw=Math.floor(w*.74),sh=Math.floor(h*.77);const cv=document.createElement("canvas");cv.width=w;cv.height=h;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(A,0,0);const da=x.getImageData(sx,sy,sw,sh).data;x.clearRect(0,0,w,h);x.drawImage(B,0,0);const db=x.getImageData(sx,sy,sw,sh).data;let sum=0,n=0;for(let i=0;i<da.length;i+=4){sum+=Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]);n+=3;}A.close();B.close();return sum/n})()`);
}
main().catch(e=>{const partial=liveReport??{schemaVersion:1,experiment:"spc-presented-frame-content-settle-p1",sourceSha:SOURCE_SHA,assertions:[],runtimeExceptions:[],cycles:[],rejections:[]};writeFileSync(OUTPUT,JSON.stringify({...partial,outcome:"HARNESS_ERROR",error:{message:e?.message??String(e),stack:e?.stack??null},finishedAt:new Date().toISOString()},null,2)+"\n");console.error(e);process.exitCode=1});
