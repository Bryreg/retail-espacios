import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate((titulo)=>{
  const s=[...document.querySelectorAll("section.t")].find(x=>x.querySelector("h2")?.textContent.includes(titulo));
  if(!s) return "no está ese panel";
  const b=s.getBoundingClientRect(), hijos=[];
  const rec=(el)=>{[...el.children].forEach(c=>{
    const r=c.getBoundingClientRect();
    if(r.height>0) hijos.push({t:(c.textContent||c.tagName).trim().slice(0,26),y:r.top,y2:r.bottom,d:c.tagName});
  })};
  rec(s);
  hijos.sort((a,c)=>a.y-c.y);
  const out=[`panel ${Math.round(b.width)}×${Math.round(b.height)}`];
  let prev=b.top;
  hijos.forEach(h=>{const g=Math.round(h.y-prev); if(g>0) out.push(`   ↕ ${g}px`);
    out.push(`${String(Math.round(h.y2-h.y)).padStart(4)}px  ${h.t}`); prev=h.y2;});
  out.push(`   ↕ ${Math.round(b.bottom-prev)}px (fondo)`);
  return out.join("\n");
}, process.argv[3]));
await nav.close();
