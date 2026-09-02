import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
// las maquetas viven un nivel arriba de este archivo
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const f=process.argv[2];
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const ctx=await nav.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
const p=await ctx.newPage(); const errs=[],faltan=[];
p.on("pageerror",e=>errs.push(String(e).slice(0,80)));
p.on("requestfailed",r=>{if(!r.url().startsWith("data:"))faltan.push(r.url().split("/").pop())});
await p.goto(`file://${D}/${f}`,{waitUntil:"networkidle"});
await p.waitForTimeout(800);
await p.screenshot({path:`${D}/${f.replace(".html",".png")}`});
console.log("alto",await p.evaluate(()=>document.documentElement.scrollHeight),
 "· desborda",await p.evaluate(()=>document.documentElement.scrollWidth>1440),
 "· errores",errs.length?errs:"0","· faltan",faltan.length?[...new Set(faltan)]:"0");
await nav.close();
