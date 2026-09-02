// ¿se pisan los rótulos del plano entre sí, o el texto se sale de su cajita?
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const D=fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/,"");
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",
  args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const p=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(`file://${D}/${process.argv[2]}`,{waitUntil:"networkidle"});
console.log(await p.evaluate(()=>{
  const svg=document.querySelector(".plano"); if(!svg) return "sin plano";
  const cajas=[...svg.querySelectorAll('rect[rx="2"][fill="#FFFFFF"]')];
  const out=[];
  cajas.forEach(r=>{
    const rb=r.getBoundingClientRect();
    let n=r.nextElementSibling, textos=[];
    // sólo los <text> que son el contenido de esta cajita: mismo centro y sin
    // transform propio (ENTRADA y CAJAS van rotados sobre el piso, sin cajita)
    while(n&&n.tagName==="text"){
      if(!n.getAttribute("transform") &&
         Math.abs(parseFloat(n.getAttribute("x")) - (parseFloat(r.getAttribute("x"))+parseFloat(r.getAttribute("width"))/2))<1.5)
        textos.push(n);
      else break;
      n=n.nextElementSibling;}
    textos.forEach(t=>{const tb=t.getBoundingClientRect();
      if(tb.width>rb.width-3) out.push(`APRETADO «${t.textContent}» ${tb.width.toFixed(1)} en caja de ${rb.width.toFixed(1)}`);
      if(tb.left<rb.left-.5||tb.right>rb.right+.5) out.push(`SE SALE «${t.textContent}»`);});
  });
  for(let i=0;i<cajas.length;i++)for(let j=i+1;j<cajas.length;j++){
    const a=cajas[i].getBoundingClientRect(), b=cajas[j].getBoundingClientRect();
    const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(ox>1&&oy>1) out.push(`SE PISAN «${cajas[i].nextElementSibling?.textContent}» ↔ «${cajas[j].nextElementSibling?.textContent}»`);
  }
  return out.length? `${cajas.length} rótulos · ${out.length} problemas\n  `+out.slice(0,8).join("\n  ")
                   : `${cajas.length} rótulos, todos bien`;
}));
await nav.close();
