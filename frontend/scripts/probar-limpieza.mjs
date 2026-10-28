/**
 * Pruebas de la limpieza del 2026-10-02 (auditoría de producción).
 *   npm run probar:limpieza
 *
 * Tres cosas que no pueden volver en silencio:
 *  · Lo público. Todo lo que está en `public/` se sirve sin iniciar sesión en
 *    la raíz del sitio. Ahí vivían el plano real de Galerías y 21 recortes, con
 *    la marca de agua de un proveedor, que cualquiera podía bajar.
 *  · La copia de seguridad, sólo para el dueño.
 *  · Lo que salió: «Empezar de cero», `/taller` para cualquier sesión y la lista
 *    pública de supermercados en el ingreso.
 *
 * Son pruebas de fuente, y se verifican en reversa rompiendo el fuente a mano.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const fuente = (...partes) => readFileSync(join(raiz, "src", ...partes), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

console.log("Lo público");

prueba("public/ sólo tiene lo que el sitio necesita servir sin sesión", () => {
  // Agregar algo acá es publicarlo: que sea una decisión, no un descuido.
  const permitidos = new Set(["_redirects", "robots.txt"]);
  const hay = readdirSync(join(raiz, "public"));
  const sobran = hay.filter((f) => !permitidos.has(f));
  assert.deepEqual(sobran, [], `queda público sin login: ${sobran.join(", ")}`);
});

prueba("el plano de Galerías no volvió a ninguna parte del frontend", () => {
  for (const ruta of [["public", "plano.png"], ["PLANOGALERIAS.png"]]) {
    assert.ok(!existsSync(join(raiz, ...ruta)), `volvió ${ruta.join("/")}`);
  }
});

console.log("La copia de seguridad");

const copia = fuente("api", "copia.ts");
const dashboard = fuente("pages", "Dashboard.tsx");

prueba("se pide como archivo y un error del servidor se puede leer", () => {
  assert.match(copia, /client\.get\("\/clientes\/mi-copia", \{\s*responseType: "blob",/);
  assert.match(copia, /if \(data instanceof Blob\) \{/);
  assert.match(copia, /JSON\.parse\(await data\.text\(\)\)/);
});

prueba("el nombre del archivo es el que manda el servidor", () => {
  assert.match(copia, /\/filename="\(\[\^"\]\+\)"\/\.exec\(disposicion\)/);
});

prueba("la sección no se le muestra a quien sabemos que no es el dueño", () => {
  const seccion = dashboard.slice(dashboard.indexOf("function CopiaSection()"));
  const cuerpo = seccion.slice(0, seccion.indexOf("\n}\n"));
  assert.match(cuerpo, /if \(rolCliente && rolCliente !== "owner"\) return null;/);
  // El retorno temprano va DESPUÉS de los hooks: si no, React se queja al
  // cambiar de sesión.
  assert.ok(cuerpo.indexOf("useState") < cuerpo.indexOf("return null"));
});

prueba("está en Configuración, junto a «Tus datos»", () => {
  assert.match(dashboard, /<CopiaSection \/>\s*<TusDatosSection \/>/);
});

console.log("Lo que salió");

prueba("«Empezar de cero» no está en ninguna pantalla", () => {
  assert.ok(!existsSync(join(raiz, "src", "components", "EmpezarDeCero")), "volvió el componente");
  assert.doesNotMatch(fuente("pages", "DashboardView.tsx"), /EmpezarDeCero|Empezar de cero/);
});

prueba("el taller de muebles es sólo para administradores", () => {
  // Desde el 2026-10-28 `/taller` lleva a Plano › Mis muebles (que el armazón
  // sólo abre para administración, `puedeAbrir`) y el banco de prueba vive en
  // `/taller/banco`: los dos, sólo para administradores.
  assert.match(
    fuente("App.tsx"),
    /<Route path="\/taller" element=\{esAdmin \? <AlTallerNuevo \/> : <Navigate to="\/" replace \/>\} \/>/,
  );
  assert.match(
    fuente("App.tsx"),
    /<Route path="\/taller\/banco" element=\{esAdmin \? <TallerMuebles \/> : <Navigate to="\/" replace \/>\} \/>/,
  );
  assert.match(fuente("modulos.ts"), /return modulo === "inicio" \|\| modulo === "indicadores" \|\| modulo === "montajes";/,
    "Mis muebles se abre para quien trabaja en la tienda");
});

prueba("el ingreso no pide la lista de supermercados", () => {
  assert.doesNotMatch(fuente("api", "auth.ts"), /client\.get[^\n]*\/auth\/clientes/);
  assert.doesNotMatch(fuente("pages", "Login.tsx"), /getClientes\b/);
});

console.log("El enlace de montaje dice su contrato");

const montaje = fuente("pages", "Montaje.tsx");

prueba("un contrato cancelado (410) lo dice y no ofrece reintentar", () => {
  assert.match(montaje, /if \(codigo === 410\) \{\s*setEstado\("cancelado"\);/);
  assert.match(montaje, /if \(estado === "cancelado"\) \{/);
});

prueba("antes de la víspera dice desde cuándo, en vez de ofrecer el formulario", () => {
  const aviso = montaje.indexOf("if (espacio.se_confirma_desde) {");
  const formulario = montaje.indexOf("<FormularioMontaje");
  assert.ok(aviso > 0 && aviso < formulario, "el aviso tiene que ir antes del formulario");
  assert.match(montaje, /diaLargo\(espacio\.se_confirma_desde\)/);
});

prueba("las fechas del contrato no pasan por new Date (en Colombia caerían un día antes)", () => {
  const dia = montaje.slice(montaje.indexOf("function diaLargo("), montaje.indexOf("function fechaLarga("));
  assert.ok(dia.length > 0, "falta diaLargo");
  assert.doesNotMatch(dia, /new Date/);
});

console.log(`\n${hechas} pruebas`);
