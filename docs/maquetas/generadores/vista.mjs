import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const f=process.argv[2];
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1360,height:900},deviceScaleFactor:2})).newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,70)));
await p.goto(`file://${D}/${f}`,{waitUntil:"networkidle"});
await p.waitForTimeout(400);
await p.screenshot({path:`${D}/${f.replace(".html",".png")}`,fullPage:true});
console.log("alto",await p.evaluate(()=>document.documentElement.scrollHeight),"· errores",errs.length?errs:"0");
await nav.close();
