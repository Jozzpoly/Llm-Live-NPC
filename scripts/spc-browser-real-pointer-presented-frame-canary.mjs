import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const OUT_DIR = dirname(OUTPUT); const STEPS = 10; const TIMEOUT = 2000;
mkdirSync(OUT_DIR,{recursive:true}); const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function chrome(){
  for(const p of [process.env.CHROME_PATH,"/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].filter(Boolean)) if(existsSync(p)) return p;
  for(const b of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]) try { const p=execFileSync("which",[b],{encoding:"utf8"}).trim(); if(p)return p; } catch{}
  throw new Error("Chrome not found");
}
class CDP{
  constructor(url){this.url=url;this.id=1;this.pending=new Map();this.listeners=new Map()}
  async open(){this.ws=new WebSocket(this.url);await new Promise((r,j)=>{let t=setTimeout(()=>j(new Error("CDP open timeout")),10000);this.ws.addEventListener("open",()=>{clearTimeout(t);r()},{once:true});this.ws.addEventListener("error",()=>j(new Error("CDP open failed")),{once:true})});this.ws.addEventListener("message",e=>this.msg(e.data))}
  msg(raw){const m=JSON.parse(String(raw));if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.j(new Error(`${p.method}: ${m.error.message}`)):p.r(m.result??{});return}for(const f of this.listeners.get(m.method)??[])f(m.params??{})}
  on(k,f){this.listeners.set(k,[...(this.listeners.get(k)??[]),f])}
  send(method,params={},ms=30000){const id=this.id++;return new Promise((r,j)=>{const t=setTimeout(()=>{this.pending.delete(id);j(new Error(`CDP timeout: ${method}`))},ms);this.pending.set(id,{method,r:x=>{clearTimeout(t);r(x)},j:x=>{clearTimeout(t);j(x)}});this.ws.send(JSON.stringify({id,method,params}))})}
  close(){this.ws?.close()}
}
const stable=x=>JSON.stringify(x); const hash=x=>createHash("sha256").update(stable(x)).digest("hex");
const color=g=>[32+(g*53)%192,32+(g*97)%192,32+(g*149)%192];
const near=(a,b)=>a?.length>=3&&b.every((v,i)=>Math.abs(a[i]-v)<=3);
async function evalv(c,expression){const x=await c.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw new Error(x.exceptionDetails.exception?.description??x.exceptionDetails.text);return x.result?.value}
async function pollJson(url,ms=15000){const end=Date.now()+ms;while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return r.json()}catch{}await sleep(100)}throw new Error(`timeout ${url}`)}
async function until(fn,ms,label){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await sleep(5)}throw new Error(`timeout ${label}`)}
async function main(){
  const profile=mkdtempSync(`${tmpdir()}/spc-pointer-frame-`); const port=10500+Math.floor(Math.random()*300);
  const proc=spawn(chrome(),["--headless=new","--no-sandbox","--disable-dev-shm-usage",`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1",`--user-data-dir=${profile}`,"--window-size=1400,900","about:blank"],{stdio:["ignore","pipe","pipe"]});
  let c,cast=false; const frames=[]; const rep={schemaVersion:1,experiment:"spc-real-pointer-presented-frame-p0",sourceSha:SOURCE_SHA,startedAt:new Date().toISOString(),assertions:[],runtimeExceptions:[],transitions:[]};
  const check=(name,pass,detail)=>rep.assertions.push({name,pass:Boolean(pass),detail});
  try{
    const ver=await pollJson(`http://127.0.0.1:${port}/json/version`);rep.chrome=ver.Browser??null;
    const tr=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"});const target=await tr.json();c=new CDP(target.webSocketDebuggerUrl);await c.open();
    c.on("Runtime.exceptionThrown",x=>rep.runtimeExceptions.push(x.exceptionDetails?.exception?.description??x.exceptionDetails?.text??"unknown"));
    c.on("Page.screencastFrame",f=>{frames.push({...f,receivedAtMs:Date.now()});c.send("Page.screencastFrameAck",{sessionId:f.sessionId}).catch(()=>{});if(frames.length>120)frames.splice(0,frames.length-120)});
    await Promise.all([c.send("Page.enable"),c.send("Runtime.enable"),c.send("Emulation.setDeviceMetricsOverride",{width:1400,height:900,deviceScaleFactor:1,mobile:false})]);
    await c.send("Page.navigate",{url:`${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate`});
    await until(()=>evalv(c,'Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector(".spc-world-mode-toggle"))'),20000,"SPC ready");
    await evalv(c,`(()=>{const m=document.createElement("div");m.id="ptr-frame-marker";Object.assign(m.style,{position:"fixed",left:"0px",top:"0px",width:"96px",height:"96px",zIndex:"2147483647",pointerEvents:"none",background:"rgb(32,32,32)"});document.documentElement.appendChild(m);window.__PTR_TARGET=null;window.__PTR_EVENTS=[];const b=document.querySelector(".spc-world-mode-toggle");b.addEventListener("click",e=>{const t=window.__PTR_TARGET;if(!t)return;m.style.background="rgb("+t.color.join(",")+")";m.dataset.generation=String(t.g);window.__PTR_EVENTS.push({g:t.g,isTrusted:e.isTrusted,clientX:e.clientX,clientY:e.clientY,handlerWallMs:performance.timeOrigin+performance.now()});window.__PTR_TARGET=null},true);return true})()`);
    const initial=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()"); const initialHash=hash(initial);
    await c.send("Page.startScreencast",{format:"png",quality:100,maxWidth:700,maxHeight:450,everyNthFrame:1});cast=true;
    for(let g=1;g<=STEPS;g++){
      const before=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");const beforeHash=hash(before);const col=color(g);
      const state=await evalv(c,`(()=>{const root=document.querySelector("#app"),b=document.querySelector(".spc-world-mode-toggle"),r=b.getBoundingClientRect();window.__PTR_TARGET={g:${g},color:${JSON.stringify(col)}};return{worldOnly:root.classList.contains("spc-world-only"),x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
      if(!(state.w>0&&state.h>0))throw new Error("toggle has no hit box"); const sendMs=Date.now();
      await c.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:state.x,y:state.y,button:"none",buttons:0});
      await c.send("Input.dispatchMouseEvent",{type:"mousePressed",x:state.x,y:state.y,button:"left",buttons:1,clickCount:1});
      await c.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:state.x,y:state.y,button:"left",buttons:0,clickCount:1});
      const ev=await until(()=>evalv(c,`(()=>{const e=[...(window.__PTR_EVENTS??[])].reverse().find(x=>x.g===${g});if(!e)return null;return{...e,worldOnly:document.querySelector("#app")?.classList.contains("spc-world-only")??null}})()`),TIMEOUT,`trusted click ${g}`);
      if(!ev.isTrusted)throw new Error(`generation ${g} not trusted`);if(ev.worldOnly===state.worldOnly)throw new Error(`generation ${g} did not toggle projection`);
      const ack=await waitFrame(c,frames,col,ev.handlerWallMs);if(!ack)throw new Error(`generation ${g} no presented frame`);
      const after=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");const afterHash=hash(after);const bytes=Buffer.from(ack.data,"base64");const file=resolve(OUT_DIR,`pointer-presented-${String(g).padStart(2,"0")}.png`);writeFileSync(file,bytes);
      rep.transitions.push({generation:g,beforeWorldOnly:state.worldOnly,afterWorldOnly:ev.worldOnly,isTrusted:ev.isTrusted,clientX:ev.clientX,clientY:ev.clientY,pointerSendUtcMs:sendMs,pointerSendToHandlerMs:ev.handlerWallMs-sendMs,handlerWallMs:ev.handlerWallMs,frameSwapUtcMs:ack.frameSwapUtcMs,handlerToFrameSwapMs:ack.frameSwapUtcMs-ev.handlerWallMs,pointerSendToFrameSwapMs:ack.frameSwapUtcMs-sendMs,receiveMinusFrameSwapMs:ack.receivedAtMs-ack.frameSwapUtcMs,canonicalTickBefore:before.tick??null,canonicalTickAfter:after.tick??null,canonicalHashBefore:beforeHash,canonicalHashAfter:afterHash,canonicalStable:beforeHash===afterHash,pngSha256:createHash("sha256").update(bytes).digest("hex"),pngBytes:bytes.length});
    }
    const final=await evalv(c,"window.__SPC_EVIDENCE__.canonicalSnapshot()");
    check("all clicks are trusted browser pointer events",rep.transitions.length===STEPS&&rep.transitions.every(x=>x.isTrusted),rep.transitions.map(x=>x.isTrusted));
    check("every trusted pointer toggles actual projection",rep.transitions.every(x=>x.beforeWorldOnly!==x.afterWorldOnly),rep.transitions.map(x=>[x.beforeWorldOnly,x.afterWorldOnly]));
    check("every trusted pointer reaches exact compositor frame",rep.transitions.length===STEPS,rep.transitions.length);
    check("presentation interactions preserve canonical World",rep.transitions.every(x=>x.canonicalStable)&&hash(final)===initialHash,{initialHash,finalHash:hash(final)});
    check("frame-swap timestamps are monotonic",rep.transitions.every((x,i,a)=>i===0||x.frameSwapUtcMs>=a[i-1].frameSwapUtcMs),rep.transitions.map(x=>x.frameSwapUtcMs));
    check("no uncaught runtime exceptions",rep.runtimeExceptions.length===0,rep.runtimeExceptions);
    rep.finishedAt=new Date().toISOString();rep.outcome=rep.assertions.every(x=>x.pass)?"PASS":"FAIL";writeFileSync(OUTPUT,JSON.stringify(rep,null,2)+"\n");if(rep.outcome!=="PASS")process.exitCode=1;
  }finally{if(c&&cast)await c.send("Page.stopScreencast").catch(()=>{});c?.close();proc.kill("SIGTERM");await sleep(100);if(!proc.killed)proc.kill("SIGKILL");rmSync(profile,{recursive:true,force:true})}
}
async function waitFrame(c,frames,col,notBefore){const end=Date.now()+TIMEOUT;while(Date.now()<end){const f=frames.shift();if(!f){await sleep(2);continue}const swap=Number(f.metadata?.timestamp)*1000;if(!Number.isFinite(swap)||swap+2<notBefore)continue;const rgba=await sample(c,f.data);if(near(rgba,col))return{...f,frameSwapUtcMs:swap}}return null}
async function sample(c,data){return evalv(c,`(async()=>{const s=atob(${JSON.stringify(data)}),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);const bm=await createImageBitmap(new Blob([u],{type:"image/png"})),cv=document.createElement("canvas");cv.width=bm.width;cv.height=bm.height;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(bm,0,0);const rgba=Array.from(x.getImageData(Math.floor(bm.width*.02),Math.floor(bm.height*.02),1,1).data);bm.close();return rgba})()`)}
main().catch(e=>{writeFileSync(OUTPUT,JSON.stringify({schemaVersion:1,experiment:"spc-real-pointer-presented-frame-p0",sourceSha:SOURCE_SHA,outcome:"HARNESS_ERROR",error:{message:e?.message??String(e),stack:e?.stack??null},finishedAt:new Date().toISOString()},null,2)+"\n");console.error(e);process.exitCode=1});
