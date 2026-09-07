import { abrir } from "./abrir.mjs";
const { browser, page } = await abrir({});
await page.fill(".campo.par input.entrada", "ALPINA");
for (const cod of ["PUN-05","ISL-04"]) {
  const c = await page.evaluate((cod) => { const t=[...document.querySelectorAll(".rotulos .p-cod")].find(x=>x.dataset.cod===cod); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }, cod);
  if (c) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); }
}
console.log(await page.evaluate(() => {
  const señal = getComputedStyle(document.documentElement).getPropertyValue("--signal").trim();
  const norm = (c) => c.replace(/\s/g, "");
  const s = "rgb(242,179,0)";
  const amarillos = [];
  document.querySelectorAll(".vender *").forEach((el) => {
    const cs = getComputedStyle(el);
    if (norm(cs.backgroundColor) === s || norm(cs.color) === s || norm(cs.borderTopColor) === s)
      amarillos.push((el.className?.toString?.()||el.tagName).slice(0, 30));
  });
  return { señal, resuelto: s, amarillos };
}));
await browser.close();
