import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
// las maquetas viven un nivel arriba de este archivo
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const ctx=await nav.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate(()=>{
  const malos=[];
  document.querySelectorAll("section.t").forEach(s=>{
    const sb=s.getBoundingClientRect();
    s.querySelectorAll(":not(svg *)").forEach(e=>{
      if(e.children.length) return;
      const b=e.getBoundingClientRect();
      if(b.height>0 && (b.bottom > sb.bottom-1 || b.right > sb.right-1))
        malos.push(`«${String(e.textContent||e.tagName).trim().slice(0,26)}» se sale de «${s.querySelector("h2")?.textContent}»`);
    });
  });
  return malos.length? malos.slice(0,6).join("\n") : "nada recortado";
}));
await nav.close();
