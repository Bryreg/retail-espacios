import { abrir } from "./abrir.mjs";

for (const tema of ["claro", "oscuro"]) {
  const { browser, page } = await abrir({ tema });
  // con dos espacios en el contrato, que es el estado que se revisa
  for (const cod of ["PUN-05", "ISL-04"]) {
    const c = await page.evaluate((cod) => {
      const t = [...document.querySelectorAll(".rotulos .p-cod")].find((x) => x.dataset.cod === cod);
      if (!t) return null; const r = t.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, cod);
    if (c) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); }
  }
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    // ── contraste WCAG de todo texto visible de la pantalla de Vender ──────
    const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= .03928 ? c/12.92 : ((c+.055)/1.055)**2.4; };
      return .2126*f(r)+.7152*f(g)+.0722*f(b); };
    const ratio = (a, b) => { const [l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x); return (l1+.05)/(l2+.05); };
    const rgb = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0],m[1],m[2],m[3]??1]; };
    const mezcla = (fg, bg) => fg[3] >= 1 ? fg : [0,1,2].map(i => fg[i]*fg[3] + bg[i]*(1-fg[3]));
    const fondoDe = (el) => {
      for (let p = el; p; p = p.parentElement) {
        const c = rgb(getComputedStyle(p).backgroundColor);
        if (c[3] > 0) {
          if (c[3] < 1 && p.parentElement) return mezcla(c, fondoDe(p.parentElement));
          return c.slice(0,3);
        }
      }
      return [255,255,255];
    };
    const malos = [], tamanos = {};
    const raiz = document.querySelector(".vender");
    const vis = (el) => { const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > .1 && r.width > 0 && r.height > 0; };
    raiz.querySelectorAll("*").forEach((el) => {
      const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!propio || !vis(el)) return;
      const cs = getComputedStyle(el);
      const fs = Math.round(parseFloat(cs.fontSize) * 100) / 100;
      const svg = el.ownerSVGElement || el.tagName.toLowerCase() === "svg";
      const color = svg ? rgb(cs.fill) : rgb(cs.color);
      const fondo = svg ? fondoDe(el.ownerSVGElement ?? el) : fondoDe(el);
      const c = Math.round(ratio(mezcla(color, fondo), fondo) * 100) / 100;
      const txt = el.textContent.trim().slice(0, 24);
      tamanos[fs] = (tamanos[fs] || 0) + 1;
      const grande = fs >= 18 || (fs >= 14 && +cs.fontWeight >= 700);
      if (c < (grande ? 3 : 4.5)) malos.push({ txt, fs, c, w: cs.fontWeight });
    });

    // ── confidencialidad: nada de otros proveedores ni plata de la sede ────
    const textos = [];
    const rec = (el) => {
      for (const a of ["aria-label", "title", "placeholder", "alt"]) {
        const v = el.getAttribute?.(a); if (v) textos.push(v);
      }
      for (const n of el.childNodes) {
        if (n.nodeType === 3) textos.push(n.textContent);
        else if (n.nodeType === 1) rec(n);
      }
    };
    rec(raiz);
    const todo = textos.join(" ");
    const prohibido = ["COCA COLA", "NUTRESA", "canon", "Canon", "ranking", "Ranking",
                       "vence", "Vence", "facturación", "recaudo", "margen", "ocupación",
                       "Ocupación", "sin alquilar", "Sin alquilar", "por debajo de tarifa"];
    const fugas = prohibido.filter((p) => todo.includes(p));

    return { malos, tamanos, fugas, muestra: todo.replace(/\s+/g, " ").slice(0, 220) };
  });
  console.log(`\n=== ${tema} ===`);
  console.log("cuerpos renderizados:", Object.entries(r.tamanos).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}px×${v}`).join("  "));
  console.log("contraste por debajo del piso:", r.malos.length, JSON.stringify(r.malos.slice(0, 12)));
  console.log("fugas de confidencialidad:", r.fugas);
  await browser.close();
}
