import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const OUT_DIR = dirname(OUTPUT);
const CYCLES = 8;
const TIMEOUT = 4000;
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
  constructor(url){this.url=url;this.id=1;this.pending=new Map();this.listeners=new Map()}
  async open(){this.ws=new WebSocket(this.url);await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error("CDP open timeout")),10000);this.ws.addEventListener("open",()=>{clearTimeout(t);r()},{once:true});this.ws.addEventListener("error",()=>j(new Error("CDP open failed")),{once:true})});this.ws.addEventListener("message",e=>this.handle(e.data))}
  handle(raw){const m=JSON.parse(String(raw));if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.j(new Error(`${p.method}: ${m.error.message}`)):p.r(m.result??{});return}for(const f of this.listeners.get(m.method)??[])f(m.params??{})}
  on(k,f){this.listeners.set(k,[...(this.listeners.get(k)??[]),f])}
  send(method,params={},ms=30000){const id=this.id++;return new Promise((r,j)=>{const t=setTimeout(()=>{this.pending.delete(id);j(new Error(`CDP timeout: ${method}`))},ms);this.pending.set(id,{method,r:x=>{clearTimeout(t);r(x)},j:x=>{clearTimeout(t);j(x)}});this.ws.send(JSON.stringify({id,method,params}))})}
  close(){this.ws?.close()}
}
const stable=x=>JSON.stringify(x);
const hash=x=>createHash("sha256").update(stable(x)).digest("hex");
const color=g=>[32+(g*53)%192,32+(g*97)%192,32+(g*149)%192];
const near=(a,b)=>a?.length>=3&&b.every((v,i)=>Math.abs(a[i]-v)<=3);
async function evalv(c,expression){const x=await c.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw new Error(x.exceptionDetails.exception?.description??x.exceptionDetails.text);return x.result?.value}
async function pollJson(url,ms=15000){const end=Date.now()+ms;while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return r.json()}catch{}await sleep(100)}throw new Error(`timeout ${url}`)}
async function until(fn,ms,label){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await sleep(5)}throw new Error(`timeout ${label}`)}

async function main(){
  const profile=mkdtempSync(`${tmpdir()}/spc-content-settle-occlusion-`);const port=11600+Math.floor(Math.random()*300);
  const chrome=spawn(chromeExecutable(),["--headless=new","--no-sandbox","--disable-dev-shm-usage",`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1",`--user-data-dir=${profile}`,"--window-size=1400,900","about:blank"],{stdio:["ignore","pipe","pipe"]});
  let c,cast=false;const frames=[];
  const rep={schemaVersion:1,experiment:"spc-presented-frame-content-settle-p1b-occlusion-replay",sourceSha:SOURCE_SHA,startedAt:new Date().toISOString(),assertions:[],runtimeExceptions:[],cycles:[],rejections:[]};liveReport=rep;
  const check=(name,pass,detail)=>rep.assertions.push({name,pass:Boolean(pass),detail});
  try{
    const ver=await pollJson(`http://127.0.0.1:${port}/json/version`);rep.chrome=ver.Browser??null;
    const tr=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"});const target=await tr.json();c=new CDP(target.webSocketDebuggerUrl);await c.open();
    c.on("Runtime.exceptionThrown",x=>rep.runtimeExceptions.push(x.exceptionDetails?.exception?.description??x.exceptionDetails?.text??"unknown"));
    c.on("Page.screencastFrame",f=>{frames.push({...f,receivedAtMs:Date.now()});c.send("Page.screencastFrameAck",{sessionId:f.sessionId}).catch(()=>{});if(frames.length>300)frames.splice(0,frames.length-300)});
    await Promise.all([c.send("Page.enable"),c.send("Runtime.enable"),c.send("Emulation.setDeviceMetricsOverride",{width:1400,height:900,deviceScaleFactor:1,mobile:false})]);
    await c.send("Page.navigate",{url:`${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate`});
    await until(()=>evalv(c,'Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector(".spc-world-mode-toggle") && document.querySelector("canvas"))'),20000,"SPC ready");
    await evalv(c,`(()=>{const marker=document.createElement("div");marker.id="content-settle-marker";Object.assign(marker.style,{position:"fixed",left:"0px",top:"0px",width:"96px",height:"96px",zIndex:"2147483647",pointerEvents:"none",background:"rgb(32,32,32)"});document.documentElement.appendChild(marker);const blocker=document.createElement("div");blocker.id="content-settle-blocker";Object.assign(blocker.style,{position:"fixed",zIndex:"2147483646",pointerEvents:"auto",background:"transparent"});document.documentElement.appendChild(blocker);window.__CS_EVENTS=[];window.__BLOCK_ARM=null;window.__SEM_ARM=null;blocker.addEventListener("click",e=>{const arm=window.__BLOCK_ARM;if(!arm)return;window.__CS_EVENTS.push({kind:"blocker",cycle:arm.cycle,isTrusted:e.isTrusted,targetId:e.target?.id??null,clientX:e.clientX,clientY:e.clientY,wallMs:performance.timeOrigin+performance.now()});window.__BLOCK_ARM=null;e.preventDefault();e.stopPropagation()},true);const button=document.querySelector(".spc-world-mode-toggle");button.addEventListener("click",e=>{const arm=window.__SEM_ARM;window.__CS_EVENTS.push({kind:"button",cycle:arm?.cycle??null,isTrusted:e.isTrusted,clientX:e.clientX,clientY:e.clientY,wallMs:performance.timeOrigin+performance.now()})},true);return true})()`);
    const initial=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");const initialHash=hash(initial);
    await c.send("Page.startScreencast",{format:"png",quality:100,maxWidth:700,maxHeight:450,everyNthFrame:1});cast=true;

    for(let cycle=1;cycle<=CYCLES;cycle++){
      const before=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");const beforeHash=hash(before);
      const blockedGeneration=cycle*2-1,semanticGeneration=cycle*2,blockedColor=color(blockedGeneration),semanticColor=color(semanticGeneration);
      const geometry=await evalv(c,`(()=>{const root=document.querySelector("#app"),button=document.querySelector(".spc-world-mode-toggle"),blocker=document.querySelector("#content-settle-blocker"),r=button.getBoundingClientRect();Object.assign(blocker.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});const x=r.left+r.width/2,y=r.top+r.height/2;window.__BLOCK_ARM={cycle:${cycle}};return{worldOnly:root.classList.contains("spc-world-only"),x,y,w:r.width,h:r.height,hitId:document.elementFromPoint(x,y)?.id??null}})()`);
      if(!(geometry.w>0&&geometry.h>0))throw new Error(`cycle ${cycle}: toggle has no hit box`);if(geometry.hitId!=="content-settle-blocker")throw new Error(`cycle ${cycle}: blocker is not top hit target (${geometry.hitId})`);
      const buttonCountBefore=await evalv(c,'window.__CS_EVENTS.filter(e=>e.kind==="button").length');const pointerSendUtcMs=Date.now();
      await c.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:geometry.x,y:geometry.y,button:"none",buttons:0});await c.send("Input.dispatchMouseEvent",{type:"mousePressed",x:geometry.x,y:geometry.y,button:"left",buttons:1,clickCount:1});await c.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:geometry.x,y:geometry.y,button:"left",buttons:0,clickCount:1});
      const blockedEvent=await until(()=>evalv(c,`(()=>[...window.__CS_EVENTS].reverse().find(e=>e.kind==="blocker"&&e.cycle===${cycle})??null)()`),TIMEOUT,`blocked pointer ${cycle}`);
      const blockedState=await evalv(c,'(()=>({worldOnly:document.querySelector("#app")?.classList.contains("spc-world-only")??null,buttonEventCount:window.__CS_EVENTS.filter(e=>e.kind==="button").length}))()');
      await setMarker(c,blockedGeneration,blockedColor);const blockedFrame=await waitMarkerFrame(c,frames,blockedColor,blockedEvent.wallMs);if(!blockedFrame)throw new Error(`cycle ${cycle}: no blocked marker frame`);const blockedBytes=Buffer.from(blockedFrame.data,"base64");writeFileSync(resolve(OUT_DIR,`p1b-blocked-${String(cycle).padStart(2,"0")}.png`),blockedBytes);
      const afterBlocked=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");const afterBlockedHash=hash(afterBlocked);

      const semanticPre=await evalv(c,'(()=>{const root=document.querySelector("#app"),button=document.querySelector(".spc-world-mode-toggle"),blocker=document.querySelector("#content-settle-blocker"),r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{worldOnly:root.classList.contains("spc-world-only"),x,y,hitId:document.elementFromPoint(x,y)?.id??null}})()');
      if(semanticPre.hitId!=="content-settle-blocker")throw new Error(`cycle ${cycle}: blocker no longer covers button`);await evalv(c,`window.__SEM_ARM={cycle:${cycle}}`);const semanticSendUtcMs=Date.now();await evalv(c,'document.querySelector(".spc-world-mode-toggle").click()');
      const semanticEvent=await until(()=>evalv(c,`(()=>[...window.__CS_EVENTS].reverse().find(e=>e.kind==="button"&&e.cycle===${cycle})??null)()`),TIMEOUT,`semantic click ${cycle}`);
      const projection=await until(()=>evalv(c,`(()=>{const x=document.querySelector("#app")?.classList.contains("spc-world-only")??null;return x!==${geometry.worldOnly}?{worldOnly:x}:null})()`),TIMEOUT,`semantic projection ${cycle}`);
      await setMarker(c,semanticGeneration,semanticColor);const ack=await waitContentSettledFrame(c,frames,semanticColor,semanticEvent.wallMs,cycle,rep.rejections);if(!ack)throw new Error(`cycle ${cycle}: no content-settled semantic frame`);
      const semanticBytes=Buffer.from(ack.frame.data,"base64");writeFileSync(resolve(OUT_DIR,`p1b-semantic-${String(cycle).padStart(2,"0")}.png`),semanticBytes);const afterSemantic=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");const afterSemanticHash=hash(afterSemantic);await evalv(c,'window.__SEM_ARM=null');
      rep.cycles.push({cycle,beforeWorldOnly:geometry.worldOnly,buttonCenter:{x:geometry.x,y:geometry.y},blocked:{hitTarget:geometry.hitId,isTrusted:blockedEvent.isTrusted,targetId:blockedEvent.targetId,projectionUnchanged:blockedState.worldOnly===geometry.worldOnly,buttonEventCountBefore:buttonCountBefore,buttonEventCountAfter:blockedState.buttonEventCount,pointerSendUtcMs,handlerWallMs:blockedEvent.wallMs,frameSwapUtcMs:blockedFrame.frameSwapUtcMs,pngSha256:createHash("sha256").update(blockedBytes).digest("hex")},semanticBypass:{hitTargetStillBlocker:semanticPre.hitId,isTrusted:semanticEvent.isTrusted,projectionToggled:projection.worldOnly!==geometry.worldOnly,afterWorldOnly:projection.worldOnly,semanticSendUtcMs,handlerWallMs:semanticEvent.wallMs,frameSwapUtcMs:ack.frameSwapUtcMs,rejectedCandidates:ack.rejectedCandidates,acceptedMetrics:ack.metrics,pngSha256:createHash("sha256").update(semanticBytes).digest("hex"),pngBytes:semanticBytes.length},canonicalTickBefore:before.tick??null,canonicalTickAfterBlocked:afterBlocked.tick??null,canonicalTickAfterSemantic:afterSemantic.tick??null,canonicalStable:beforeHash===afterBlockedHash&&beforeHash===afterSemanticHash});
    }
    const final=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");
    check("trusted real pointer is blocked by live hit testing",rep.cycles.every(x=>x.blocked.isTrusted&&x.blocked.targetId==="content-settle-blocker"&&x.blocked.projectionUnchanged&&x.blocked.buttonEventCountBefore===x.blocked.buttonEventCountAfter),rep.cycles.map(x=>x.blocked));
    check("semantic button.click bypasses same blocker",rep.cycles.every(x=>x.semanticBypass.hitTargetStillBlocker==="content-settle-blocker"&&x.semanticBypass.isTrusted===false&&x.semanticBypass.projectionToggled),rep.cycles.map(x=>x.semanticBypass));
    check("accepted semantic frames are nonblank and stable",rep.cycles.every(x=>x.semanticBypass.acceptedMetrics.blackFraction<BLACK_LIMIT&&x.semanticBypass.acceptedMetrics.stableMad<=STABLE_MAD_LIMIT),rep.cycles.map(x=>x.semanticBypass.acceptedMetrics));
    check("occlusion replay preserves canonical World",rep.cycles.every(x=>x.canonicalStable)&&hash(final)===initialHash,{initialHash,finalHash:hash(final)});
    check("replay exposes at least one rejected generation-correct candidate",rep.rejections.length>0,rep.rejections);
    check("no uncaught runtime exceptions",rep.runtimeExceptions.length===0,rep.runtimeExceptions);
    rep.rejectedBlankCandidates=rep.rejections.filter(x=>x.reason==="blank").length;rep.rejectedUnstableCandidates=rep.rejections.filter(x=>x.reason==="unstable").length;rep.finishedAt=new Date().toISOString();rep.outcome=rep.assertions.every(x=>x.pass)?"PASS":"FAIL";writeFileSync(OUTPUT,JSON.stringify(rep,null,2)+"\n");if(rep.outcome!=="PASS")process.exitCode=1;
  } finally {if(c&&cast)await c.send("Page.stopScreencast").catch(()=>{});c?.close();chrome.kill("SIGTERM");await sleep(100);if(!chrome.killed)chrome.kill("SIGKILL");rmSync(profile,{recursive:true,force:true})}
}

async function setMarker(c,g,rgb){return evalv(c,`(()=>{const m=document.querySelector("#content-settle-marker");m.style.background="rgb(${rgb.join(",")})";m.dataset.generation=${JSON.stringify(String(g))};return true})()`)}
async function waitMarkerFrame(c,frames,expectedColor,notBefore){const end=Date.now()+TIMEOUT;while(Date.now()<end){const f=frames.shift();if(!f){await sleep(2);continue}const swap=Number(f.metadata?.timestamp)*1000;if(!Number.isFinite(swap)||swap+2<notBefore)continue;const m=await inspectFrame(c,f.data,expectedColor);if(m.markerMatch)return{...f,frameSwapUtcMs:swap}}return null}
async function waitContentSettledFrame(c,frames,expectedColor,notBefore,cycle,rejections){const end=Date.now()+TIMEOUT;let previous=null,rejectedCandidates=0;while(Date.now()<end){const frame=frames.shift();if(!frame){await sleep(2);continue}const swap=Number(frame.metadata?.timestamp)*1000;if(!Number.isFinite(swap)||swap+2<notBefore)continue;const metrics=await inspectFrame(c,frame.data,expectedColor);if(!metrics.markerMatch)continue;if(metrics.blackFraction>=BLACK_LIMIT){rejections.push(saveRejected(frame,cycle,"blank",swap,metrics));rejectedCandidates++;previous=null;continue}if(!previous){previous={frame,swap,metrics};continue}const stableMad=await frameMad(c,previous.frame.data,frame.data);if(stableMad>STABLE_MAD_LIMIT){rejections.push(saveRejected(previous.frame,cycle,"unstable",previous.swap,{...previous.metrics,stableMad}));rejectedCandidates++;previous={frame,swap,metrics};continue}return{frame,frameSwapUtcMs:swap,rejectedCandidates,metrics:{...metrics,stableMad,previousFrameSwapUtcMs:previous.swap}}}return null}
function saveRejected(frame,cycle,reason,swap,metrics){const bytes=Buffer.from(frame.data,"base64"),index=(liveReport?.rejections?.length??0)+1,file=`p1b-rejected-${String(index).padStart(2,"0")}-cycle-${String(cycle).padStart(2,"0")}-${reason}.png`;writeFileSync(resolve(OUT_DIR,file),bytes);return{cycle,reason,frameSwapUtcMs:swap,metrics,file,pngSha256:createHash("sha256").update(bytes).digest("hex"),pngBytes:bytes.length}}
async function inspectFrame(c,data,expectedColor){return evalv(c,`(async()=>{const raw=atob(${JSON.stringify(data)}),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);const bm=await createImageBitmap(new Blob([u],{type:"image/png"}));const cv=document.createElement("canvas");cv.width=bm.width;cv.height=bm.height;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(bm,0,0);const marker=Array.from(x.getImageData(Math.floor(bm.width*.02),Math.floor(bm.height*.02),1,1).data);const sx=Math.floor(bm.width*.04),sy=Math.floor(bm.height*.18),sw=Math.floor(bm.width*.74),sh=Math.floor(bm.height*.77),d=x.getImageData(sx,sy,sw,sh).data;let black=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i]<8&&d[i+1]<8&&d[i+2]<8)black++;n++}bm.close();return{marker,markerMatch:${JSON.stringify(expectedColor)}.every((v,i)=>Math.abs(marker[i]-v)<=3),blackFraction:black/n,crop:[sx,sy,sw,sh]}})()`)}
async function frameMad(c,a,b){return evalv(c,`(async()=>{async function dec(s){const raw=atob(s),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);return createImageBitmap(new Blob([u],{type:"image/png"}))}const A=await dec(${JSON.stringify(a)}),B=await dec(${JSON.stringify(b)}),w=Math.min(A.width,B.width),h=Math.min(A.height,B.height),sx=Math.floor(w*.04),sy=Math.floor(h*.18),sw=Math.floor(w*.74),sh=Math.floor(h*.77),cv=document.createElement("canvas");cv.width=w;cv.height=h;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(A,0,0);const da=x.getImageData(sx,sy,sw,sh).data;x.clearRect(0,0,w,h);x.drawImage(B,0,0);const db=x.getImageData(sx,sy,sw,sh).data;let sum=0,n=0;for(let i=0;i<da.length;i+=4){sum+=Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]);n+=3}A.close();B.close();return sum/n})()`)}
main().catch(e=>{const partial=liveReport??{schemaVersion:1,experiment:"spc-presented-frame-content-settle-p1b-occlusion-replay",sourceSha:SOURCE_SHA,assertions:[],runtimeExceptions:[],cycles:[],rejections:[]};writeFileSync(OUTPUT,JSON.stringify({...partial,outcome:"HARNESS_ERROR",error:{message:e?.message??String(e),stack:e?.stack??null},finishedAt:new Date().toISOString()},null,2)+"\n");console.error(e);process.exitCode=1});
