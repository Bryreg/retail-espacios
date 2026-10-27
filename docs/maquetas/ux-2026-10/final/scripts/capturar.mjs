import { chromium } from "/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/verif17/herr/comun.mjs";
const F = "/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/final";
const [w, h] = (process.env.TAM ?? "1440x900").split("x").map(Number);
const pags = (process.env.PAG ?? "inicio,pendientes,contratos,nuevo-contrato,indicadores,diccionario,montajes,plano2d,plano3d,ficha-GON-03,ficha-PUN-07,contrato-2,planograma-GON-13-B,linea,participaciones,ajustes,tarifas,buscador").split(",");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
for (const pg of pags) { await p.goto(`file://${F}/salida/${pg}.html`); await p.screenshot({ path: `${F}/cap/${w}x${h}-${pg}.png` }); }
console.log("errores:", errs.length, errs.slice(0, 3)); await b.close();
