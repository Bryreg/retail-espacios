import { abrir } from "./abrir.mjs";
const { browser, page, errores } = await abrir({});
const T = (s) => page.textContent(s);
const dice = async (n, esperado, real) =>
  console.log(`${esperado === real ? "ok  " : "FALLA"} ${n}: ${real}${esperado === real ? "" : "  (esperaba " + esperado + ")"}`);

// ── el resaltado desde una fila de la tarifa ────────────────────────────────
const fila = page.locator(".vender .tabla tbody tr").first();   // Isla
await fila.hover();
await page.waitForTimeout(350);
let r = await page.evaluate(() => {
  const esc = document.querySelector(".iso-escena");
  const hijos = [...esc.children];
  const apagados = hijos.filter((h) => Math.abs(+getComputedStyle(h).opacity - 0.2) < 0.02).length;
  const encendidos = hijos.filter((h) => h.classList.contains("mk")).length;
  const rot = [...document.querySelectorAll(".rotulos .p-cod")];
  return { foco: esc.getAttribute("data-foco"), hijos: hijos.length, apagados, encendidos,
           rotEncendidos: rot.filter((t) => t.classList.contains("mk")).map((t) => t.dataset.cod) };
});
console.log("resaltado desde la tarifa (fila Isla):", JSON.stringify(r));
await page.mouse.move(5, 5); await page.waitForTimeout(300);
console.log("al salir, data-foco =", await page.getAttribute(".iso-escena", "data-foco"));

// ── el resaltado desde un chip de la escalera ──────────────────────────────
await page.locator(".gChip").first().hover();
await page.waitForTimeout(320);
r = await page.evaluate(() => ({
  foco: document.querySelector(".iso-escena").getAttribute("data-foco"),
  enc: [...document.querySelectorAll(".rotulos .p-cod.mk")].map((t) => t.dataset.cod),
}));
console.log("resaltado desde el chip:", JSON.stringify(r));
await page.mouse.move(5, 5); await page.waitForTimeout(250);

// ── tocar espacios en el plano ─────────────────────────────────────────────
const tocar = async (cod) => {
  const caja = await page.evaluate((cod) => {
    const t = [...document.querySelectorAll(".rotulos .p-cod")].find((x) => x.dataset.cod === cod);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, cod);
  if (!caja) { console.log("no está el rótulo", cod); return; }
  await page.mouse.click(caja.x, caja.y);
  await page.waitForTimeout(250);
};
await tocar("ISL-05");
console.log("tras tocar ISL-05 · total:", (await T(".total .n")).trim(),
            "· plazo:", (await T(".plazo")).trim(),
            "· clave libres:", (await T(".clave span:nth-of-type(1) b")).trim(),
            "· en contrato:", (await T(".clave span:last-of-type b")).trim(),
            "· fila Isla:", (await T(".vender .tabla tbody tr:nth-child(1) td:nth-child(2)")).trim(),
            "· pie:", (await T("#pie, .vender .tabla tfoot tr")).replace(/\s+/g, " ").trim());
await tocar("ISL-04");
console.log("tras tocar ISL-04 · total:", (await T(".total .n")).trim(),
            "· plazo:", (await T(".plazo")).trim(),
            "· fila Isla:", (await T(".vender .tabla tbody tr:nth-child(1) td:nth-child(2)")).trim(),
            "· pie:", (await T(".vender .tabla tfoot tr")).replace(/\s+/g, " ").trim());
await tocar("ISL-05");   // destocar
console.log("al destocar ISL-05 · total:", (await T(".total .n")).trim(), "· plazo:", (await T(".plazo")).trim());

// góndola por cara
await tocar("GON-61·B");
console.log("tras tocar la cara B de GON-61 · códigos en la ficha:",
  (await page.$$eval(".eitem .cod", (n) => n.map((x) => x.textContent))).join(", "));
// la cara tomada no entra
await tocar("GON-60·A");
console.log("tras tocar GON-60·A (tomada) · códigos:",
  (await page.$$eval(".eitem .cod", (n) => n.map((x) => x.textContent))).join(", "));

// ── la escalera con el teclado ─────────────────────────────────────────────
await page.click(".vender .graf svg", { position: { x: 400, y: 100 } });
const antes = (await T(".lectura")).replace(/\s+/g, " ").trim();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
const despues = (await T(".lectura")).replace(/\s+/g, " ").trim();
console.log("escalera · teclado:", antes, "→", despues);

// ── el resaltado desde una fila del contrato ───────────────────────────────
await page.locator(".eitem").first().hover();
await page.waitForTimeout(320);
console.log("resaltado desde la ficha:", await page.evaluate(() => ({
  foco: document.querySelector(".iso-escena").getAttribute("data-foco"),
  enc: [...document.querySelectorAll(".rotulos .p-cod.mk")].map((t) => t.dataset.cod),
  hl: [...document.querySelectorAll(".eitem.hl")].length,
})));

console.log("errores:", errores.filter((e) => !e.includes("404")));
await page.screenshot({ path: "/tmp/cap-contrato.png" });
await browser.close();
