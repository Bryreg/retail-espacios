import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll("section.t").forEach(s=>{
    const b=s.getBoundingClientRect(), h2=s.querySelector("h2")?.textContent||"?";
    // último hijo con contenido, para medir el aire muerto abajo
    let bajo=0;
    s.querySelectorAll("*").forEach(e=>{const r=e.getBoundingClientRect();
      if(r.height>0&&r.bottom>bajo&&r.bottom<=b.bottom+2) bajo=r.bottom;});
    out.push(`${h2.padEnd(30)} ${Math.round(b.width)}×${Math.round(b.height)}  aire abajo: ${Math.round(b.bottom-bajo)}px`);
  });
  return out.join("\n");
}));
await nav.close();
