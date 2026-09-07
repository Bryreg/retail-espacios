import { abrir } from "./abrir.mjs";
const w = +(process.argv[2] || 1440), h = +(process.argv[3] || 900), tema = process.argv[4] || "claro";
const { browser, page, errores } = await abrir({ w, h, tema });
await page.screenshot({ path: `/tmp/cap-${tema}-${w}x${h}.png` });
const doc = await page.evaluate(() => ({
  sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight,
  sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
}));
console.log("documento", doc);
console.log("errores", errores.slice(0, 8));
await browser.close();
