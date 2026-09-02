import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const f=process.argv[2];
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const ctx=await nav.newContext({viewport:{width:1200,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage(); const errs=[],faltan=[];
p.on("pageerror",e=>errs.push(String(e).slice(0,80)));
p.on("requestfailed",r=>{if(!r.url().startsWith("data:"))faltan.push(r.url().split("/").pop())});
await p.goto(`file://${D}/${f}`,{waitUntil:"networkidle"});
await p.waitForTimeout(600);
await p.screenshot({path:`${D}/${f.replace(".html",".png")}`,fullPage:true});
// recorte por panel + solapes de texto en cada svg
console.log(await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll("section.t").forEach((s,i)=>{
    const sb=s.getBoundingClientRect();
    s.querySelectorAll(":not(svg *)").forEach(e=>{
      if(e.children.length) return;
      const b=e.getBoundingClientRect();
      if(b.height>0 && (b.bottom>sb.bottom-1||b.right>sb.right-1||b.top<sb.top-1))
        out.push(`panel ${i+1}: «${String(e.textContent||e.tagName).trim().slice(0,24)}» se sale`);
    });
    const svg=s.querySelector("svg"); if(!svg) return;
    const vb=svg.getBoundingClientRect(), t=[...svg.querySelectorAll("text")];
    t.forEach(e=>{const b=e.getBoundingClientRect();
      if(b.left<vb.left-.5||b.right>vb.right+.5||b.top<vb.top-.5||b.bottom>vb.bottom+.5)
        out.push(`panel ${i+1}: FUERA «${e.textContent.trim().slice(0,20)}»`);});
    for(let a=0;a<t.length;a++)for(let b2=a+1;b2<t.length;b2++){
      const A=t[a].getBoundingClientRect(), B=t[b2].getBoundingClientRect();
      const ox=Math.min(A.right,B.right)-Math.max(A.left,B.left);
      const oy=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);
      if(ox>0.5&&oy>0.5) out.push(`panel ${i+1}: PISA «${t[a].textContent.trim().slice(0,16)}» ↔ «${t[b2].textContent.trim().slice(0,16)}»`);
    }
  });
  return out.length? out.slice(0,10).join("\n") : "los 5 paneles limpios";
}));
console.log("alto",await p.evaluate(()=>document.documentElement.scrollHeight),
 "· desborda",await p.evaluate(()=>document.documentElement.scrollWidth>1200),
 "· errores",errs.length?errs:"0","· faltan",faltan.length?[...new Set(faltan)]:"0");
await nav.close();
