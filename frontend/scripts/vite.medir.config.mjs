/**
 * Cuánto JS baja cada recorrido (auditoría pre-lanzamiento, P2-20).
 *
 *   npm run medir:chunks
 *
 * Es la configuración de siempre (`vite.config.ts`) más un paso al final del
 * build que suma, para cada pantalla, el pedazo de entrada y todo lo que
 * importa de forma ESTÁTICA (lo que el navegador trae antes de poder pintar),
 * en gzip nivel 9. `MODULOS=<regex de pedazos>` lista además qué módulos pesan
 * adentro de esos pedazos. El resultado sale por consola (o a `SALIDA`).
 */
import base from "../vite.config.ts";
import fs from "node:fs";
import { gzipSync } from "node:zlib";

export default async (env) => {
  const cfg = typeof base === "function" ? await base(env) : base;
  cfg.plugins.push({
    name: "medir-chunks",
    generateBundle(_, bundle) {
      const out = [];
      const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
      const porNombre = (re) => chunks.find((c) => re.test(c.fileName));
      const gz = (c) => gzipSync(c.code, { level: 9 }).length;
      const cierre = (raices) => {
        const vistos = new Set();
        const pila = raices.map((c) => c.fileName);
        while (pila.length) {
          const f = pila.pop();
          if (vistos.has(f)) continue;
          vistos.add(f);
          const c = bundle[f];
          if (c && c.type === "chunk") pila.push(...c.imports);
        }
        return [...vistos].map((f) => bundle[f]).filter(Boolean);
      };
      const recorridos = {
        "portada (/ sin sesión)": [/^assets\/index-/],
        "Inicio (/ con sesión)": [/^assets\/index-/, /^assets\/Dashboard-/, /^assets\/DashboardView-/],
        "Contratos (Vender)": [/^assets\/index-/, /^assets\/Dashboard-/, /^assets\/DashboardView-/, /^assets\/ModoVender-/],
        "Indicadores (mapa)": [/^assets\/index-/, /^assets\/Dashboard-/, /^assets\/DashboardView-/, /^assets\/MapaDeOportunidades-/],
        "Plano 2D": [/^assets\/index-/, /^assets\/Dashboard-/, /^assets\/FloorPlan2D-/],
        "Montajes": [/^assets\/index-/, /^assets\/Dashboard-/, /^assets\/MountView-/],
      };
      for (const [nombre, res] of Object.entries(recorridos)) {
        const todos = cierre(res.map(porNombre).filter(Boolean));
        const total = todos.reduce((t, c) => t + gz(c), 0);
        out.push(`${nombre}: ${(total / 1024).toFixed(1)} kB gzip en ${todos.length} pedazos`);
        for (const c of todos.sort((a, b) => gz(b) - gz(a)).slice(0, 5)) out.push(`    ${(gz(c) / 1024).toFixed(1).padStart(7)} ${c.fileName}`);
      }
      if (process.env.MODULOS) {
        for (const c of chunks.filter((x) => new RegExp(process.env.MODULOS).test(x.fileName))) {
          out.push(`== ${c.fileName}`);
          const mods = Object.entries(c.modules).map(([id, m]) => [m.renderedLength, id.replace(/.*frontend\//, "")]).sort((a, b) => b[0] - a[0]);
          for (const [n, id] of mods.slice(0, 30)) out.push(String(n).padStart(8) + " " + id);
        }
      }
      const texto = out.join("\n") + "\n";
      if (process.env.SALIDA) fs.writeFileSync(process.env.SALIDA, texto);
      else console.log(texto);
    },
  });
  return cfg;
};
