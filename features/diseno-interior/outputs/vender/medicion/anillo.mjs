import { abrir } from "./abrir.mjs";
for (const tema of ["claro","oscuro"]) {
  const { browser, page } = await abrir({ tema });
  console.log(tema, await page.evaluate(() => ({
    raiz: getComputedStyle(document.documentElement).getPropertyValue("--ring").trim(),
    enVender: getComputedStyle(document.querySelector(".vender")).getPropertyValue("--ring").trim(),
    resuelto: getComputedStyle(document.querySelector(".btn-principal")).getPropertyValue("--ring").trim(),
  })));
  await browser.close();
}
