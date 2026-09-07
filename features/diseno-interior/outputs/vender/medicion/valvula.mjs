import { abrir } from "./abrir.mjs";
const tocar = async (page, cod) => {
  const c = await page.evaluate((cod) => {
    const t = [...document.querySelectorAll(".rotulos .p-cod")].find((x) => x.dataset.cod === cod);
    if (!t) return null; const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, cod);
  if (!c) return false;
  await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); return true;
};
for (const [w, h] of [[1440,900],[1440,800],[1366,768]]) {
  const { browser, page } = await abrir({ w, h });
  await page.fill(".campo.par input.entrada", "ALPINA");
  await page.waitForTimeout(150);
  const cods = ["ISL-04", "ISL-05", "ISL-06", "BEB-02", "FRU-01"];
  const linea = [];
  for (let i = 0; i < cods.length; i++) {
    if (!(await tocar(page, cods[i]))) { linea.push(`${i+1}:sin rótulo`); continue; }
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const c = document.querySelector(".cuerpo");
      const acc = document.querySelector(".acciones");
      const holgura = Math.round(c.getBoundingClientRect().bottom - acc.getBoundingClientRect().bottom);
      return { esc: c.scrollHeight - c.clientHeight, holgura, n: document.querySelectorAll(".eitem").length };
    });
    linea.push(`${r.n} esp: rueda ${r.esc}px · holgura ${r.holgura}px`);
  }
  console.log(`${w}x${h}  ` + linea.join("  |  "));
  await page.screenshot({ path: `/tmp/cap-contrato-${w}x${h}.png` });
  await browser.close();
}
