import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate(()=>{
  const m=new Map();
  document.querySelectorAll("body *").forEach(e=>{
    if(e.children.length||!(e.textContent||"").trim()) return;
    const cs=getComputedStyle(e); let px=parseFloat(cs.fontSize);
    // dentro de un SVG el tamaño va escalado por el viewBox
    const svg=e.closest("svg");
    if(svg){const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
      if(vb&&vb.width) px=px*(r.width/vb.width);}
    px=Math.round(px*10)/10;
    const v=m.get(px)||{n:0,q:[]}; v.n++;
    if(v.q.length<3) v.q.push((e.textContent||"").trim().slice(0,18));
    m.set(px,v);
  });
  return [...m.entries()].sort((a,b)=>a[0]-b[0])
    .map(([px,v])=>`${String(px).padStart(6)}px  ×${String(v.n).padEnd(3)} ${v.q.join(" · ")}`).join("\n");
}));
await nav.close();
