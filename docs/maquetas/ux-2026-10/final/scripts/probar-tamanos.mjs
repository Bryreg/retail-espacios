import { chromium } from "../verif17/herr/comun.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const V = "/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/final";
mkdirSync(`${V}/protocap`, { recursive: true });
const TAM = [[320,568],[375,667],[390,844],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080],[2560,1440],[844,390],[1024,1366]];
const PAG = (process.env.PAG ?? "inicio,disponibilidad,indicadores,montajes,plano2d,plano2d-propiedades,plano2d-catalogo,plano3d,plano3d-propiedades,tarifas").split(",");
const b = await chromium.launch();
const res = [];
for (const [w, h] of TAM) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  for (const pg of PAG) {
    await p.goto(`file://${V}/salida/${pg}.html`); await p.waitForTimeout(150);
    await p.screenshot({ path: `${V}/protocap/${w}x${h}-${pg}.png` });
    const m = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const enScroll = e => { for (let q = e.parentElement; q; q = q.parentElement) { const s = getComputedStyle(q); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && q !== document.documentElement && q !== document.body) return true; } return false; };
      const out = { desborde: document.documentElement.scrollWidth > W + 1 || document.body.scrollWidth > W + 1 };
      const hojas = [...document.querySelectorAll("body *")].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
      let min = 99, minT = "", fuera = [], cortes = [];
      for (const e of hojas) {
        const r = e.getBoundingClientRect(); const svg = !!e.closest("svg");
        const fs = svg ? r.height * .8 : parseFloat(getComputedStyle(e).fontSize);
        if (r.bottom > 0 && r.top < H && fs < min) { min = fs; minT = e.textContent.trim().slice(0, 30) + (svg ? " [plano]" : ""); }
        if ((r.right > W + 1 || r.left < -1) && !enScroll(e)) fuera.push(e.textContent.trim().slice(0, 30));
        if (!svg && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === "ellipsis") cortes.push(e.textContent.trim().slice(0, 40));
      }
      // solapes entre textos (no SVG), sin contar los que están dentro de una capa flotante
      const flota = e => { for (let q = e; q; q = q.parentElement) { if (getComputedStyle(q).position === "fixed") return true; } return false; };
      const recorte = e => { let r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
        for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const s = getComputedStyle(q); if (/(auto|scroll|hidden|clip)/.test(s.overflow + s.overflowX + s.overflowY)) { const k = q.getBoundingClientRect(); L = Math.max(L, k.left); T = Math.max(T, k.top); R = Math.min(R, k.right); B = Math.min(B, k.bottom); } }
        return { left: L, top: T, right: R, bottom: B }; };
      const cajas = hojas.filter(e => !e.closest("svg") && !e.closest(".velo") && !flota(e)).map(e => ({ e, r: recorte(e) })).filter(c => c.r.right - c.r.left > 1 && c.r.bottom - c.r.top > 1);
      const sol = [];
      for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i], c = cajas[j];
        if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        const x = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), y = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
        if (x > 3 && y > 3) sol.push(a.e.textContent.trim().slice(0, 20) + " ⟷ " + c.e.textContent.trim().slice(0, 20));
      }
      const ctl = [...document.querySelectorAll(".btn:not(.enl), .c, .nav a, .abajo a, .campo .ctl, .herr span, .tarifa .ctl")].filter(vis).map(e => e.getBoundingClientRect().height);
      const chicos = ctl.filter(x => x < 39.5).length;
      const modal = [...document.querySelectorAll(".modal")].filter(vis).map(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= W + 1 && r.top >= -1 && r.bottom <= H + 1; });
      const area = [...document.querySelectorAll(".plano-env, .escena")].filter(vis).map(e => { const r = e.getBoundingClientRect(); const vis_ = Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)); return Math.round(vis_ / (W * H) * 100); });
      return { ...out, minFuente: Math.round(min * 10) / 10, minT, fuera: fuera.slice(0, 4), cortes: [...new Set(cortes)].slice(0, 4), solapes: sol.length, ejSol: sol.slice(0, 3), controlesBajos: chicos, totalControles: ctl.length, modalCabe: modal, areaTrabajo: area };
    });
    res.push({ tam: `${w}x${h}`, pagina: pg, errores: errs.splice(0), ...m });
  }
  await ctx.close();
}
await b.close();
writeFileSync(`${V}/protocap/resultados.json`, JSON.stringify(res, null, 1));
for (const r of res) {
  const prob = [];
  if (r.desborde) prob.push("DESBORDE PÁGINA");
  if (r.minFuente < 12 && !r.minT.includes("[plano]")) prob.push(`fuente ${r.minFuente}px «${r.minT}»`);
  if (r.minT.includes("[plano]") && r.minFuente < 8) prob.push(`plano ${r.minFuente}px`);
  if (r.fuera.length) prob.push("fuera: " + r.fuera.join(" | "));
  if (r.solapes) prob.push(`solapes ${r.solapes}: ` + r.ejSol.join(" | "));
  if (r.controlesBajos) prob.push(`controles <40px: ${r.controlesBajos}/${r.totalControles}`);
  if (r.modalCabe.includes(false)) prob.push("MODAL NO CABE");
  if (r.errores.length) prob.push("errores: " + r.errores.join(" | "));
  console.log(r.tam.padEnd(10), r.pagina.padEnd(22), prob.length ? prob.join(" ; ") : "ok", r.areaTrabajo.length ? `área de trabajo ${r.areaTrabajo}%` : "");
}
