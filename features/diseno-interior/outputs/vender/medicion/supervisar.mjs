import { abrir } from "./abrir.mjs";
const { browser, page, errores } = await abrir({});
await page.click('button:has-text("Supervisar")');
await page.waitForTimeout(900);
const r = await page.evaluate(() => ({
  hayVender: !!document.querySelector(".vender-hoja"),
  cifras: [...document.querySelectorAll(".rotulo")].slice(0, 8).map((e) => e.textContent.trim()),
  tabla: document.querySelectorAll("table").length,
  plano: !!document.querySelector("svg polygon"),
  rotulosPlano: document.querySelectorAll(".rotulos .p-cod").length,
  texto: document.body.innerText.replace(/\s+/g, " ").slice(0, 260),
}));
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: "/tmp/cap-supervisar.png", fullPage: false });
// volver a Vender
await page.click('button:has-text("Vender")');
await page.waitForTimeout(700);
console.log("vuelve a Vender:", !!(await page.$(".vender-hoja")));
console.log("errores:", errores.filter((e) => !e.includes("404")));
await browser.close();
