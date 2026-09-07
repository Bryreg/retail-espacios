import { abrir } from "./abrir.mjs";
const { browser, page } = await abrir({});
for (const cod of ["PUN-05","ISL-04"]) {
  const c = await page.evaluate((cod) => { const t=[...document.querySelectorAll(".rotulos .p-cod")].find(x=>x.dataset.cod===cod); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }, cod);
  if (c) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); }
}
const r = await page.evaluate(() => {
  const out = {};
  document.querySelector(".vender").querySelectorAll("*").forEach((el) => {
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propio) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    const fs = Math.round(parseFloat(cs.fontSize) * 100) / 100;
    (out[fs] ||= []).push(el.textContent.trim().slice(0, 28) + " [" + el.tagName + "." + (el.className?.toString?.().slice(0,18)||"") + "]");
  });
  return out;
});
for (const k of Object.keys(r).sort((a,b)=>a-b)) console.log(k, "→", r[k].slice(0,6).join(" | "));
await browser.close();
