import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate(()=>[...document.querySelectorAll("section.t")].map(s=>{
  const c=s.querySelector(".pend,.quien,.franja,.lienzo,.graf,.cuerpo");
  const h2=s.querySelector("h2")?.textContent||"?";
  if(!c) return `${h2}: sin cuerpo medible`;
  const falta=c.scrollHeight-c.clientHeight;
  return `${h2.padEnd(26)} panel ${Math.round(s.getBoundingClientRect().height)}  contenido ${c.scrollHeight}  caja ${c.clientHeight}  ${falta>0?"FALTAN "+falta+"px":"sobran "+(-falta)+"px"}`;
}).join("\n")));
await nav.close();
