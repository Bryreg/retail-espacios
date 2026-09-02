import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
// las maquetas viven un nivel arriba de este archivo
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate(()=>{
  const svg=document.querySelector(".graf svg"); if(!svg) return "sin svg";
  const sb=svg.getBoundingClientRect(), t=[...svg.querySelectorAll("text")];
  const out=[];
  t.forEach(e=>{const b=e.getBoundingClientRect();
    if(b.left<sb.left-.5||b.right>sb.right+.5||b.top<sb.top-.5||b.bottom>sb.bottom+.5)
      out.push(`FUERA «${e.textContent.trim().slice(0,24)}»`);});
  for(let i=0;i<t.length;i++)for(let j=i+1;j<t.length;j++){
    const a=t[i].getBoundingClientRect(), b=t[j].getBoundingClientRect();
    const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(ox>0.5&&oy>0.5) out.push(`PISA «${t[i].textContent.trim().slice(0,18)}» ↔ «${t[j].textContent.trim().slice(0,18)}» (${ox.toFixed(0)}×${oy.toFixed(0)})`);
  }
  return out.length? out.join("\n") : `${t.length} textos, sin choques ni desbordes`;
}));
await nav.close();
