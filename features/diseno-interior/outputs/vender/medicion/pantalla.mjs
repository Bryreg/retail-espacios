/* La hoja: que entre entera, sin scroll de documento y sin nada escondido. */
import { abrir } from "./abrir.mjs";
const casos = [[1440,900],[1366,768],[1440,800],[1600,900],[1920,1080],[1280,800],[390,844]];
for (const tema of ["claro","oscuro"]) {
  for (const [w,h] of casos) {
    const { browser, page, errores } = await abrir({ w, h, tema });
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const escondido = [];
      document.querySelectorAll("*").forEach((el) => {
        const dy = el.scrollHeight - el.clientHeight, dx = el.scrollWidth - el.clientWidth;
        if (dy <= 1 && dx <= 1) return;
        const cs = getComputedStyle(el);
        const rueda = /(auto|scroll)/.test(cs.overflowY + cs.overflowX);
        if (!rueda) return;                       // no es un contenedor con barra
        const barra = el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== "hidden";
        escondido.push({ q: el.className?.toString?.().slice(0,40) || el.tagName, dy, dx, barra });
      });
      const btn = document.querySelector(".btn-principal");
      const pie = document.querySelector(".tabla tfoot td");
      const hoja = document.querySelector(".vender-hoja");
      // «entero» = visible de verdad: adentro de la ventana Y adentro de todos
      // sus contenedores con overflow hidden.
      const enteros = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.bottom > innerHeight + 0.5 || r.top < -0.5) return false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (!/(hidden|auto|scroll|clip)/.test(cs.overflowY)) continue;
          const pr = p.getBoundingClientRect();
          if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) return false;
        }
        return true;
      };
      return {
        doc: `${de.scrollHeight}/${de.clientHeight}`, ancho: `${de.scrollWidth}/${de.clientWidth}`,
        escondido, botonEntero: enteros(btn), pieEntero: enteros(pie),
        filas: hoja ? getComputedStyle(document.querySelector(".vender-hoja")).gridTemplateRows : "-",
      };
    });
    console.log(`${tema} ${w}x${h}  doc ${r.doc}  ancho ${r.ancho}  botón=${r.botonEntero} pie=${r.pieEntero}  filas ${r.filas}  escondido=${JSON.stringify(r.escondido)}  err=${errores.filter(e=>!e.includes("404")).length}`);
    await browser.close();
  }
}
