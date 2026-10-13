/**
 * Red team de FRONTERA de la Plataforma (Fase 11 · el port de la opción A).
 *   npm run probar:plataforma
 *
 * La consola del operador es la única pantalla del producto que abre las bases
 * de TODOS los clientes a la vez. Eso la vuelve la superficie con más para
 * perder: la tarifa de referencia de un supermercado, el correo de un
 * proveedor, el nombre de otro cliente adentro de un informe que el gerente se
 * lleva impreso. Ninguna de esas fronteras se ve mirando la pantalla —— se ven
 * cuando ya se filtraron. Acá se escriben.
 *
 * El brief §4 las fija y no se negocian:
 *
 *   · la TARIFA DE REFERENCIA de un cliente NUNCA se pinta: sólo `spread_pct`
 *     (la relación) y `tarifa_configurada` (sí/no);
 *   · los nombres de proveedor van SANEADOS tal como llegan —— el frontend no
 *     los retoca y no lee ni correo, ni teléfono, ni contacto, ni notas;
 *   · el INFORME DEL CLIENTE no lleva nada de la cartera: ni métricas de los
 *     otros supermercados, ni adopción, ni señal, ni el nombre de nadie más;
 *   · todo es SOLO LECTURA salvo estado de cuenta y supresiones;
 *   · cada consulta al detalle queda en la bitácora que el cliente puede ver.
 *
 * Y la forma que el dueño eligió (la opción A, «sin los cambios de C») tiene
 * tres reglas que también son de frontera, no de gusto:
 *
 *   (a) los tres colores de estado de espacio (`--libre / --entra /
 *       --ocupado`) codifican ESTADO DE ESPACIO y nada más: un chip de señal,
 *       de estado de cuenta o de prioridad va en tinta gris con su palabra;
 *   (b) un solo amarillo por pantalla, y es `.btn-principal`;
 *   (c) los cuerpos salen de la escala `--t-*` de `tema.css`; `--ink-4` da
 *       3,98:1 sobre el papel y no escribe texto.
 *
 * ── Qué mide ──────────────────────────────────────────────────────────────
 *
 * SIEMPRE (sin navegador, sin servidor, sin backend):
 *
 *  1. **Frontera de campos.** Todo acceso a un campo `snake_case` en los
 *     archivos del área resuelve contra los shapes exportados de
 *     `api/plataforma.ts` (más `api/derechos.ts` y lo que el área declara
 *     ella misma). Un campo que no existe en el contrato es una invención, y
 *     una invención es exactamente la forma que tiene una fuga de empezar.
 *     Encima, una lista corta de campos PROHIBIDOS por nombre.
 *  2. **El informe no sabe de la cartera.** `InformeCliente.tsx` no importa
 *     `/metricas`, `/adopcion` ni `/clientes`, ni sus tipos, ni lee `spread`,
 *     `clasificacion` o `estado_cuenta`; y no escribe «benchmark» como texto.
 *  3. **Un amarillo por pantalla.** Exactamente un `.btn-principal` por
 *     pantalla del área y cero `var(--signal)` fuera de esa clase.
 *  4. **La letra sale de la escala.** Cero `font-size` literales en px en los
 *     archivos nuevos del área, y **cero exports sin importador** en
 *     `src/components/plataforma/`: el código muerto es de donde salen los
 *     `fontSize` sueltos que alguien copia.
 *  4b. **El periodo y el tema, en el código**: ninguna pantalla usa
 *     `<input type="month">` (A usa un `<select>` de los periodos que
 *     existen), el informe no clava el periodo en un `useState` sin fuente,
 *     la sesión se lo manda al navegar, y las tres pantallas importan el
 *     MISMO interruptor de tema.
 *  5. **Los tres estados sólo codifican estado de espacio.** Ningún chip de
 *     señal / estado de cuenta / prioridad los consume.
 *  6. **El backend no cambió** (`git diff origin/main -- backend` vacío).
 *  7. **`ReportePlataforma.tsx` no cambió** (el reporte de transparencia se
 *     enlaza, no se rediseña).
 *
 * CON NAVEGADOR (`PROBAR_PLATAFORMA_URL` + `PROBAR_PLATAFORMA_TOKEN`), que es
 * la parte que ningún grep hace, sobre las tres pantallas de verdad, con un
 * backend sembrado con una tarifa de referencia de valor reconocible:
 *
 *  8. **La tarifa no aparece.** Ni en el `innerText`, ni en los `<text>` de
 *     los SVG, ni en los `aria-label`, ni en los `title`, ni en el cuerpo de
 *     ninguna respuesta de la API —— en las tres pantallas, con todos los
 *     `<details>` abiertos.
 *  9. **El proveedor va saneado.** Correo, teléfono, contacto y notas de la
 *     base del cliente no llegan a ninguna pantalla.
 * 10. **El informe está limpio.** No dice «cartera», «señal», «fantasma»,
 *     «adopción», «spread», «prioridad», ni nombra a otro cliente.
 * 11. **El detalle deja rastro.** Después de abrirlo, la bitácora del cliente
 *     (que él mismo puede leer) tiene su línea con `accion="detalle"`.
 * 12. **El informe no abre una consulta nueva.** Los endpoints que toca son
 *     un subconjunto de los de la sesión —— no hay un `/metricas` escondido.
 * 13. **Un `.btn-principal` visible por pantalla**, en claro y en oscuro (y
 *     que la temperatura pedida se haya aplicado de verdad: medir el oscuro
 *     sobre una pantalla clara daría verde y sería falso).
 * 14. **Contraste** WCAG de todo texto, en claro y en oscuro.
 * 15. **Ningún rótulo de señal / estado de cuenta / prioridad / cobertura**
 *     pintado con un color de estado —— medido sobre el color COMPUTADO (que
 *     es donde se cuela un `style=` en línea que el grep no ve), **en los DOS
 *     temas**, y contra los tokens RESUELTOS en el `:root` vivo. Los dos
 *     agujeros por donde se escapó: se medía sólo el claro, y la lista de
 *     colores estaba copiada a mano.
 * 16. **El informe se imprime** en 3 páginas A4 y en papel no queda un control.
 * 17. **Escritorio primero**: cero scroll horizontal en 1440×900 y 1366×768.
 * 18. **Residuo de frases-conclusión = 0.** Cada `<figure>` y cada `<table>`
 *     del área tiene arriba, cerca, un texto con al menos un dígito. La única
 *     exención es la tabla equivalente de un dibujo, y tiene que estar DENTRO
 *     de su `<figure>`, en un `<details class="plat-tabla-eq">`.
 * 19. **El informe hereda el periodo de quien lo abre**: se cambia el mes en
 *     la sesión, se aprieta el botón de verdad, y el informe tiene que pedir
 *     ESE mes y escribirlo en la hoja.
 * 20. **Un solo interruptor de tema en el área, con un solo `aria-label`.**
 *
 * Sin esas variables la parte 8-17 se salta y se dice que se saltó: `npm run
 * probar` no necesita navegador, ni servidor, ni base sembrada.
 *
 * ── Cómo se corre la parte de navegador ───────────────────────────────────
 *
 *   # 1 · sembrar una base propia (la receta y el porqué, en el propio archivo)
 *   cd backend && SP=/tmp/sp PYTHONPATH=$PWD \
 *     python3 ../frontend/scripts/sembrar-plataforma.py
 *   # 2 · backend propio, en su propio puerto y sobre esa base
 *   cd backend && DATABASE_URL="sqlite:///./frontera.db" JWT_SECRET=dev-frontera \
 *     ADMIN_PASSWORD=admin123 WORKER_PASSWORD=galerias \
 *     OPERADOR_EMAILS=brayanmoreno098@gmail.com PYTHONPATH=$PWD \
 *     python3 -m uvicorn app.main:app --port 8043
 *   # 3 · servidor de dev apuntado a ese backend
 *   cd frontend && VITE_API_TARGET=http://127.0.0.1:8043 npx vite --port 5213
 *   # 4 · el test
 *   PROBAR_PLATAFORMA_URL=http://127.0.0.1:5213 \
 *   PROBAR_PLATAFORMA_API=http://127.0.0.1:8043 \
 *   PROBAR_PLATAFORMA_TOKEN=$(cat /tmp/sp/token-frontera.txt) \
 *   PROBAR_PLATAFORMA_TARIFA=987654 npm run probar:plataforma
 *
 * Variables:
 *   PROBAR_PLATAFORMA_URL         servidor de dev servido (activa 8-17)
 *   PROBAR_PLATAFORMA_TOKEN       JWT del operador de plataforma
 *   PROBAR_PLATAFORMA_API         backend directo, para la bitácora (deriva de URL)
 *   PROBAR_PLATAFORMA_CLIENTE     slug del cliente a abrir (por defecto «mercafresco»)
 *   PROBAR_PLATAFORMA_TARIFA      la tarifa de referencia sembrada (por defecto 987654)
 *   PROBAR_PLATAFORMA_AJENOS      nombres de OTROS clientes, separados por coma
 *   PROBAR_PLATAFORMA_SECRETOS    otras agujas de la base del cliente, por coma
 *   PROBAR_PLATAFORMA_CHROME      ruta al Chromium (por defecto el de /opt/pw-browsers)
 *   PROBAR_PLATAFORMA_PLAYWRIGHT  ruta a playwright-core si no está en node_modules
 *
 * LÍMITE DECLARADO. La parte estática lee texto, no un AST: quita comentarios
 * (este repo documenta a propósito lo que el código NO hace —— fallar por eso
 * sería el peor test posible) y después busca. Si no encuentra los anclajes
 * que necesita para afirmar algo —— las interfaces de `api/plataforma.ts`, los
 * archivos del área, la escala `--t-*` de `tema.css`, la tabla `VOZ` de los
 * dibujos —— FALLA. Un test que no puede afirmar nada no pasa.
 *
 * Y el límite concreto de (1): no sabe de qué TIPO es el objeto del que se
 * lee un campo. Eso lo prueba `npx tsc --noEmit`, que corre en la misma
 * cadena. Lo que este test agrega es lo que tsc no puede ver: un campo que
 * se declara en el área y se lee en el área compila perfecto y puede ser
 * igual una invención, así que la lista de los que no vienen del contrato se
 * IMPRIME —— son pocos y un nombre nuevo ahí es una revisión.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const repo = join(raiz, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const hay = (p) => existsSync(join(raiz, p));

let fallas = 0;
const ok = (t) => console.log("  ok   " + t);
const mal = (t, d) => {
  fallas++;
  process.exitCode = 1;
  console.log("  FALLA " + t + (d ? "\n         " + d : ""));
};
const aviso = (t) => console.log("       aviso · " + t);

/* Los comentarios de este repo nombran a propósito lo prohibido («la tarifa de
   referencia NUNCA viaja acá»). Se quitan antes de buscar. */
const sinComentarios = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)));
const sinComentariosCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// ═══════════════════════════════════════════════════════════════════════════
// El área: qué archivos entran, y en qué papel
// ═══════════════════════════════════════════════════════════════════════════
//
// `consola.tsx` NO entra en las afirmaciones duras de forma: es el legado de
// las fases 4-7, lo comparte `ReportePlataforma.tsx` (que no se rediseña) y
// arrastra su propia tipografía. Sí entra en la frontera de campos, porque
// pinta datos de cliente igual que el resto. Su desprolijidad se reporta como
// aviso, con nombre y apellido, para que quien la limpie tenga la lista.

const PANTALLAS = [
  { nombre: "cartera", archivo: "src/pages/Plataforma.tsx" },
  { nombre: "sesión", archivo: "src/pages/DetalleCliente.tsx" },
  { nombre: "informe", archivo: "src/pages/InformeCliente.tsx" },
];

const PIEZAS = [
  "src/components/plataforma/graficos.tsx",
  "src/components/plataforma/formato.ts",
  "src/components/plataforma/cartera-datos.ts",
  "src/components/plataforma/cartera-cola.tsx",
  "src/components/plataforma/cartera-operativo.tsx",
  "src/components/plataforma/cartera-cobros.tsx",
  "src/components/plataforma/sesion-datos.ts",
  "src/components/plataforma/sesion-piezas.tsx",
];

const LEGADO = ["src/components/plataforma/consola.tsx"];
const HOJA = "src/plataforma.css";
const CONTRATO = "src/api/plataforma.ts";

const NUEVOS = [...PANTALLAS.map((p) => p.archivo), ...PIEZAS.filter((p) => hay(p))];
const AREA_TS = [...NUEVOS, ...LEGADO.filter((p) => hay(p))];

for (const f of [...PANTALLAS.map((p) => p.archivo), CONTRATO, HOJA])
  assert.ok(hay(f), `no está ${f}: el test no puede afirmar nada`);

console.log("\n── el área ──");
console.log("  pantallas: " + PANTALLAS.map((p) => p.nombre).join(" · "));
console.log("  piezas nuevas: " + PIEZAS.filter((p) => hay(p)).length + " · legado: " + LEGADO.filter((p) => hay(p)).length);

// ═══════════════════════════════════════════════════════════════════════════
// 1 · FRONTERA DE CAMPOS
//     Ningún archivo del área lee un campo que el contrato no publica.
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[1] frontera de campos — todo lo que se lee existe en los shapes");

/** Los miembros de tipo de un módulo de API: `nombre:` o `nombre?:` seguido de
 *  algo que abre un tipo. Cubre las interfaces exportadas y también los tipos
 *  inline (`cliente: { slug: string; nombre: string }`), que son campos igual. */
const camposDe = (src) => {
  const s = sinComentarios(src);
  const out = new Set();
  for (const m of s.matchAll(/(?:^|[{;,]|\n)\s*([a-z_][a-zA-Z0-9_]*)\s*\??\s*:\s*[A-Za-z"'{(\[]/g))
    out.add(m[1]);
  return out;
};

/** Los valores de las uniones de cadena del contrato (`"se_libera"`,
 *  `"sin_tarifa"`…). El frontend los usa como claves de mapas —— `TONO.se_libera`
 *  es un acceso legítimo a un valor del contrato, no a un campo inventado. */
const literalesDe = (src) => {
  const out = new Set();
  for (const m of sinComentarios(src).matchAll(/"([a-z_][a-z0-9_]*)"/g)) out.add(m[1]);
  return out;
};

const contrato = leer(CONTRATO);
const vocab = camposDe(contrato);
assert.ok(vocab.size > 80, `el vocabulario de ${CONTRATO} salió en ${vocab.size} campos: el parser no está leyendo las interfaces`);
for (const clave of ["ocupacion_pct", "spread_pct", "tarifa_configurada", "benchmark_plataforma", "valor_estimado_mensual"])
  assert.ok(vocab.has(clave), `falta «${clave}» en el vocabulario: el parser de ${CONTRATO} está roto`);

for (const l of literalesDe(contrato)) vocab.add(l);

/* Los otros módulos de API que el área importa de verdad —— hoy sólo
   `derechos.ts` (las supresiones son una operación, no análisis). */
const OTROS_API = ["src/api/derechos.ts"].filter((p) => hay(p));
for (const p of OTROS_API) for (const c of camposDe(leer(p))) vocab.add(c);

/* Y lo que el área declara ella misma: `SENALES.cobra_debajo`, los tipos
   locales de `cartera-datos.ts`… son campos del frontend, no del backend. */
const propios = new Set();
for (const p of AREA_TS) for (const c of camposDe(leer(p))) propios.add(c);

console.log(`  vocabulario: ${vocab.size} del contrato · ${propios.size} declarados en el área`);

const inventados = [];
for (const p of AREA_TS) {
  const s = sinComentarios(leer(p));
  const lineas = s.split("\n");
  lineas.forEach((linea, i) => {
    for (const m of linea.matchAll(/[.?]\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
      const campo = m[1];
      if (vocab.has(campo) || propios.has(campo)) continue;
      inventados.push(`${p}:${i + 1}  .${campo}`);
    }
  });
}
if (inventados.length === 0) ok(`ningún acceso a un campo fuera de los shapes (${AREA_TS.length} archivos)`);
else mal(`${inventados.length} accesos a campos que no existen en los shapes`, inventados.slice(0, 12).join("\n         "));

/* LÍMITE, dicho en voz alta. Este test no sabe de qué TIPO es el objeto sobre
   el que se lee un campo —— eso lo prueba `npx tsc --noEmit`, que corre en la
   misma cadena y falla si alguien lee de un `DetalleCliente` un campo que no
   tiene. Lo que este test agrega es lo que tsc no puede: un campo que se
   declara acá y se lee acá typea perfecto y puede ser igual una invención.
   Por eso se IMPRIME la lista de los que no vienen del contrato: son pocos,
   se leen de un vistazo, y un nombre nuevo en esa lista es una revisión. */
const soloPropios = new Set();
for (const p of AREA_TS)
  for (const m of sinComentarios(leer(p)).matchAll(/[.?]\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g))
    if (!vocab.has(m[1]) && propios.has(m[1])) soloPropios.add(m[1]);
if (soloPropios.size === 0) aviso("todo campo leído viene del contrato de la API");
else aviso(`${soloPropios.size} campo(s) leídos que NO vienen del contrato sino de una declaración del área: ${[...soloPropios].sort().join(" · ")}`);

/* ── 1b · los prohibidos por nombre ───────────────────────────────────────
   `tarifa*`: el valor de la tarifa de referencia del cliente, que no sale de
   su base ni existe en ningún shape —— sólo `tarifa_configurada` (sí/no) y la
   relación `spread_pct`. `correo` / `telefono` / `phone` / `contact_name` /
   `notes`: PII de proveedor que el backend ya sanea; si el frontend la
   nombra, es que alguien la fue a buscar. `ocupadas` / `contratos_activos` a
   secas: crudos del reporte de transparencia que NO están en `PuntoTendencia`
   —— leerlos de una serie es leer un campo que ese punto no trae.
   Los campos legítimos que CONTIENEN estas palabras (`tarifa_configurada`,
   `contratos_sin_tarifa`, `con_contratos_activos`) pasan: el match es la
   palabra entera del acceso, no una subcadena. */
const PROHIBIDOS = [
  "tarifa", "tarifa_referencia", "tarifa_ref", "referencia_tarifa",
  "correo", "telefono", "phone", "contact_name", "notes",
  "ocupadas", "contratos_activos",
];

/* `email` no es un prohibido a secas: hay DOS lugares donde es el dato, y no
   una fuga. Fuera de esos dos, un correo en esta área sólo puede venir de la
   base de un cliente, y ahí sí es fuga. Se declara por archivo y por anclaje
   para que un tercer uso tenga que pasar por acá.
     · la barra de la cartera escribe el correo del OPERADOR que entró —— es
       su propia sesión, la misma que ya está en el JWT;
     · el cajón de supresiones lista el correo del TITULAR que pidió la
       supresión: el pedido ES el correo, y sin él no se puede atender. Viene
       de `api/derechos.ts`, no de `/plataforma/*`. */
const EMAIL_OK = [
  { archivo: "src/pages/Plataforma.tsx", ancla: /useAuthStore/, razon: "el correo del propio operador en la barra" },
  { archivo: "src/components/plataforma/cartera-operativo.tsx", ancla: /supresi|f\.email/i, razon: "el correo del titular que pidió la supresión (api/derechos.ts)" },
];

const fugas = [];
for (const p of AREA_TS) {
  const lineas = sinComentarios(leer(p)).split("\n");
  lineas.forEach((linea, i) => {
    const marcar = (nombre, forma) => {
      if (PROHIBIDOS.includes(nombre)) fugas.push(`${p}:${i + 1}  ${forma}`);
      else if (nombre === "email") {
        const ventana = lineas.slice(Math.max(0, i - 3), i + 4).join(" ");
        const permitido = EMAIL_OK.some((e) => e.archivo === p && e.ancla.test(ventana));
        if (!permitido) fugas.push(`${p}:${i + 1}  ${forma}  (correo sin declarar)`);
      }
    };
    for (const m of linea.matchAll(/[.?]\s*([a-z][a-z0-9_]*)\b/g)) marcar(m[1], "." + m[1]);
    for (const m of linea.matchAll(/\[\s*"([a-z_]+)"\s*\]/g)) marcar(m[1], `["${m[1]}"]`);
  });
}
if (fugas.length === 0) ok(`ningún acceso a los ${PROHIBIDOS.length} campos prohibidos (tarifa · PII de proveedor · crudos de tendencia) ni a un correo sin declarar`);
else mal(`${fugas.length} accesos a campos prohibidos`, fugas.slice(0, 12).join("\n         "));
for (const e of EMAIL_OK) aviso(`\`email\` declarado en ${e.archivo}: ${e.razon}`);

/* La tarifa tampoco puede viajar como PROP entre componentes: `tarifa={…}`,
   `referencia={valor}` con un número adentro. La marca de referencia de los
   dibujos sí se llama `referencia`, pero es `{pct, rotulo}` —— un porcentaje
   sobre una pista, no una plata. Se exige que ninguna prop llamada `tarifa*`
   exista, y basta. */
const propsTarifa = [];
for (const p of AREA_TS)
  sinComentarios(leer(p)).split("\n").forEach((l, i) => {
    if (/\btarifa[A-Za-z]*\s*=\s*\{/.test(l) && !/tarifaConfigurada/.test(l))
      propsTarifa.push(`${p}:${i + 1}  ${l.trim().slice(0, 90)}`);
  });
if (propsTarifa.length === 0) ok("ninguna prop `tarifa…` viaja entre componentes");
else mal(`${propsTarifa.length} props \`tarifa…\``, propsTarifa.join("\n         "));

/* ── 1c · solo lectura ────────────────────────────────────────────────────
   Todo es de lectura salvo el estado de cuenta, las supresiones y los cobros
   (C1: suscripción, cuentas de cobro y pagos que registra la operadora), que
   viven en el cajón operativo. Ninguna otra pieza del área puede escribir. */
const ESCRIBEN_OK = [
  "src/components/plataforma/cartera-operativo.tsx",
  "src/components/plataforma/cartera-cobros.tsx",
];
const escrituras = [];
for (const p of AREA_TS) {
  if (ESCRIBEN_OK.includes(p)) continue;
  sinComentarios(leer(p)).split("\n").forEach((l, i) => {
    if (/\b(client\.(post|put|patch|delete)|patchEstadoCliente|atenderSupresion|guardarSuscripcion|emitirFactura|registrarPago|anularFactura|marcarDisputa|fetch\([^)]*method)/.test(l))
      escrituras.push(`${p}:${i + 1}  ${l.trim().slice(0, 90)}`);
  });
}
if (escrituras.length === 0) ok("solo lectura: nadie escribe fuera del cajón operativo");
else mal(`${escrituras.length} escrituras fuera del cajón operativo`, escrituras.join("\n         "));

/* ── 1d · la plata de la plataforma no sale de la consola (C1, C2) ────────
   Lo que RECABRA le cobra a cada supermercado lo ve la operadora —acá, con
   la cartera de TODOS— y la dueña de ESE supermercado, por su propia puerta
   (`api/suscripcion.ts`, que vigila `probar-suspension.mjs`): su gente
   (admin no dueña, worker, mercaderista) no ve un monto jamás. Ningún archivo
   fuera de `/plataforma` puede nombrar la API de cobros de la consola, ni la
   escalera («Correr cobranza»). Y la casilla que levanta el estado tras un
   pago es una opción EXPLÍCITA: arranca apagada. */
{
  const API_COBROS = /\b(getCobros|guardarSuscripcion|emitirFactura|registrarPago|anularFactura|marcarDisputa|correrCobranza|CarteraCobros|FacturaCobro|PagoCobro|PlanCobranza)\b/;
  const fuera = [];
  const recorrerFront = (rel) => {
    for (const e of readdirSync(join(raiz, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) recorrerFront(r);
      else if (/\.tsx?$/.test(e.name) && r !== CONTRATO && !r.startsWith("src/components/plataforma/") && r !== "src/pages/Plataforma.tsx")
        sinComentarios(leer(r)).split("\n").forEach((l, i) => {
          if (API_COBROS.test(l)) fuera.push(`${r}:${i + 1}  ${l.trim().slice(0, 90)}`);
        });
    }
  };
  recorrerFront("src");
  if (fuera.length === 0) ok("la API de cobros sólo la nombra la consola de la plataforma");
  else mal(`${fuera.length} archivos fuera de la consola nombran la API de cobros`, fuera.join("\n         "));

  const cobros = sinComentarios(leer("src/components/plataforma/cartera-cobros.tsx"));
  if (/const \[levantar, setLevantar\] = useState\(false\)/.test(cobros) && /levantar_estado: levantar,/.test(cobros))
    ok("«levantar el estado si queda al día» arranca apagada y viaja tal cual la marcó la operadora");
  else mal("la casilla que levanta el estado tras un pago no arranca apagada (o no es la que viaja)");
}

/* ── 1e · la revisión de C2: el ensayo es ensayo, los números se leen bien,
   la cartera no se pide de más y el reporte nombra cada acción ──────────── */
{
  const { build } = await import("esbuild");
  // «Correr cobranza (ensayo)» manda SIEMPRE `ensayo: 1`: con el interruptor
  // prendido, el backend aplica `ensayo=0` de verdad, y un botón rotulado
  // «ensayo» cortaría cuentas y mandaría correos.
  const api = sinComentarios(leer(CONTRATO));
  const correr = api.match(/export const correrCobranza = [\s\S]*?\.then\(/);
  const ramas = correr ? [...correr[0].matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((r) => /ensayo/.test(r)) : [];
  if (correr && ramas.length === 2 && ramas.every((r) => /\bensayo: 1\b/.test(r)))
    ok("«Correr cobranza» manda `ensayo: 1` en las dos ramas (con fecha y sin fecha)");
  else mal("correrCobranza no manda `ensayo: 1` en las dos ramas", correr ? correr[0].slice(0, 200) : "no está");
  const aplicar = [];
  const recorrerSrc = (rel) => {
    for (const e of readdirSync(join(raiz, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) recorrerSrc(r);
      else if (/\.tsx?$/.test(e.name))
        sinComentarios(leer(r)).split("\n").forEach((l, i) => {
          if (/\bensayo\s*[:=]\s*(0|false)\b/.test(l)) aplicar.push(`${r}:${i + 1}  ${l.trim().slice(0, 90)}`);
        });
    }
  };
  recorrerSrc("src");
  if (aplicar.length === 0) ok("nada en el navegador pide aplicar la escalera (`ensayo: 0` / `false`)");
  else mal(`${aplicar.length} lugares piden aplicar la escalera desde el navegador`, aplicar.join("\n         "));

  // Los números escritos a mano: pesos con punto de miles, porcentajes con
  // coma —o punto— decimal. Antes «3.5» de retefuente viajaba como 35.
  const r = await build({
    entryPoints: [join(raiz, "src/components/plataforma/formato.ts")],
    bundle: true, write: false, format: "esm", platform: "neutral",
  });
  const F = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
  const casos = [
    [F.porcentajeEscrito("3.5"), 3.5], [F.porcentajeEscrito("3,5"), 3.5], [F.porcentajeEscrito("0.966"), 0.966],
    [F.porcentajeEscrito("11,04"), 11.04], [F.porcentajeEscrito(F.porcentajeParaEscribir(3.5)), 3.5],
    [F.porcentajeEscrito(String(0.966)), 0.966], [F.porcentajeEscrito(""), null], [F.porcentajeEscrito("1.000,5"), null],
    [F.pesosEscritos("1.234.567"), 1234567], [F.pesosEscritos("1234567"), 1234567], [F.pesosEscritos(""), null],
    [F.mesesDelPeriodo("2026-11"), 1], [F.mesesDelPeriodo("2026-11..2027-01"), 3], [F.mesesDelPeriodo("2026-13"), null],
  ];
  const torcidos = casos.map(([dio, esperado], i) => (dio === esperado ? null : `caso ${i}: ${dio} ≠ ${esperado}`)).filter(Boolean);
  if (torcidos.length === 0) ok("porcentajes, pesos y meses del período se leen como se escriben (3.5 % es 3,5, no 35)");
  else mal("los números escritos a mano se leen mal", torcidos.join(" · "));
  const editor = sinComentarios(leer("src/components/plataforma/cartera-cobros.tsx"));
  const pcts = ["retefuente", "reteica", "reteiva"];
  if (pcts.every((x) => new RegExp(`${x}_pct: porcentajeEscrito\\(${x}\\)`).test(editor)) && !/\bnumero\(/.test(editor))
    ok("las retenciones de la suscripción viajan con `porcentajeEscrito`, no con el lector de pesos");
  else mal("alguna retención de la suscripción no pasa por `porcentajeEscrito`");
  if (/mesesDelPeriodo\(periodo\)/.test(editor) && /pactado \* meses/.test(editor))
    ok("la vista previa de una cuenta de cobro sin subtotal multiplica por los meses del período, como el backend");
  else mal("la vista previa de la cuenta de cobro no cuenta los meses del período");

  // La cartera se pide al abrir el cajón de cobros, no al abrir la consola ni
  // tras cada cambio de estado: cada GET /cobros deja una línea en el reporte
  // de transparencia de TODOS los clientes.
  const pagina = sinComentarios(leer("src/pages/Plataforma.tsx"));
  const uso = pagina.match(/useCartera\(([^,]+),/);
  if (uso && /cobrosPedidos/.test(uso[1]) && !/cobros\.recargar\(\)/.test(pagina))
    ok("la cartera de cobros se pide recién al abrir su cajón, y un cambio de estado no la vuelve a pedir");
  else mal("la consola pide la cartera de cobros sin que se abra su cajón (o tras cada PATCH)", uso ? uso[0] : "");

  // Cada acción que el backend deja llegar al reporte de transparencia tiene
  // su nombre en la pantalla del reporte.
  const reporte = readFileSync(join(repo, "backend/app/plataforma_reporte.py"), "utf8");
  const cuerpo = reporte.slice(reporte.indexOf("def _accesos_del_cliente"), reporte.indexOf("def armar_reporte"));
  const acciones = new Set();
  for (const m of cuerpo.matchAll(/f\.accion (?:==|in) (\([^)]*\)|"[a-z_]+")/g))
    for (const a of m[1].matchAll(/"([a-z_]+)"/g)) acciones.add(a[1]);
  const etiquetas = leer("src/pages/ReportePlataforma.tsx").match(/const ACCION_LABEL[^{]*\{([\s\S]*?)\n\};/);
  const nombradas = new Set(etiquetas ? [...etiquetas[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]) : []);
  const sinNombre = [...acciones].filter((a) => !nombradas.has(a));
  if (acciones.size >= 15 && sinNombre.length === 0)
    ok(`las ${acciones.size} acciones que llegan al reporte de transparencia tienen nombre en la pantalla`);
  else mal("acciones del reporte sin nombre en ReportePlataforma.tsx (la dueña lee el código crudo)", sinNombre.join(", ") || `sólo ${acciones.size} acciones leídas`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 · EL INFORME NO SABE DE LA CARTERA
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[2] el informe del cliente no importa nada de la cartera");
{
  const ruta = "src/pages/InformeCliente.tsx";
  const src = sinComentarios(leer(ruta));

  /* Los tres endpoints de cartera, y sus tipos. Que la pantalla no los
     IMPORTE es más fuerte que que no los pinte: sin el import no hay forma de
     que un refactor los cuele. */
  const CARTERA = [
    "getMetricasPlataforma", "getAdopcion", "getClientesPlataforma",
    "MetricasPlataforma", "ConsolidadoMetricas", "ClienteMetricas", "AgregadosMetricasCliente",
    "Adopcion", "ClienteAdopcion", "CohorteAdopcion", "Clasificacion",
  ];
  const importados = [...src.matchAll(/import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.replace(/\btype\b/, "").trim())
    .filter(Boolean);
  assert.ok(importados.length > 5, `no se pudieron leer los imports de ${ruta}`);
  const cuela = importados.filter((n) => CARTERA.includes(n));
  if (cuela.length === 0) ok(`el informe no importa ninguno de los ${CARTERA.length} nombres de cartera`);
  else mal("el informe importa cartera", cuela.join(" · "));

  /* Y los campos que sólo tienen sentido para el operador: el spread contra
     la tarifa del cliente, la clasificación de adopción, el estado de cuenta,
     la prioridad de la recomendación. */
  const SOLO_OPERADOR = ["spread_pct", "tarifa_configurada", "contratos_sin_tarifa",
    "clasificacion", "dias_sin_acceso", "estado_cuenta", "usuarios_con_cuenta", "ultimo_acceso"];
  const leidos = SOLO_OPERADOR.filter((c) => new RegExp(`[.?]\\s*${c}\\b`).test(src));
  if (leidos.length === 0) ok(`el informe no lee ninguno de los ${SOLO_OPERADOR.length} campos que son sólo del operador`);
  else mal("el informe lee campos del operador", leidos.join(" · "));

  /* «benchmark», «spread», «cartera», «fantasma» son jerga del operador: el
     promedio anónimo de la plataforma se nombra en castellano. Se miran las
     cadenas entrecomilladas de UNA línea que se leen como prosa (tienen un
     espacio adentro y no llevan operadores): como identificador de código
     —— nombre de prop, clave de mapa —— la palabra es libre, y lo que llega a
     pantalla lo mide el grep del navegador (10) sobre el `innerText` real. */
  const esProsa = (t) =>
    /\s/.test(t.trim()) &&
    !/[{}()[\]<>=|&;]|=>|!==|===|\bnull\b|\btrue\b|\bfalse\b|\btypeof\b/.test(t);
  const textos = [...src.matchAll(/"([^"\n]{6,})"|'([^'\n]{6,})'/g)]
    .map((m) => m[1] || m[2])
    .filter(esProsa)
    .filter((t) => /\b(benchmark|spread|fantasma|dormida|adopci\w*|cartera|prioridad|se[nñ]al\w*)\b/i.test(t));
  if (textos.length === 0) ok("ninguna cadena de prosa del informe usa jerga del operador");
  else mal(`${textos.length} cadenas del informe con jerga`, textos.slice(0, 6).map((t) => "«" + t.trim().slice(0, 80) + "»").join("\n         "));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · UN AMARILLO POR PANTALLA
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[3] un solo amarillo por pantalla, y es `.btn-principal`");
{
  /* Cuántas veces se ESCRIBE la clase en toda el área. Uno por pantalla: la
     cartera lo pone en la llamada #1 de la cola, la sesión en «Armar el
     informe», el informe en «Imprimir». Que sea UNO VISIBLE lo mide la parte
     de navegador; acá se afirma que no hay más de tres en el código. */
  const puestos = [];
  for (const p of AREA_TS)
    sinComentarios(leer(p)).split("\n").forEach((l, i) => {
      if (/btn-principal/.test(l)) puestos.push(`${p}:${i + 1}`);
    });
  if (puestos.length === PANTALLAS.length)
    ok(`${puestos.length} \`.btn-principal\` en el área, uno por pantalla (${puestos.join(" · ")})`);
  else mal(`hay ${puestos.length} \`.btn-principal\` en el área y hay ${PANTALLAS.length} pantallas`, puestos.join("\n         "));

  /* Y el amarillo no se puede pedir desde ningún otro lado. `--signal-ink` es
     la señal ESCRITA (5,54:1) y no es el amarillo de fondo: se permite. */
  const derrames = [];
  for (const p of [...AREA_TS, HOJA]) {
    const src = p.endsWith(".css") ? sinComentariosCss(leer(p)) : sinComentarios(leer(p));
    src.split("\n").forEach((l, i) => {
      for (const m of l.matchAll(/var\(--signal(-[a-z]+)?\)/g))
        if (!m[1]) derrames.push(`${p}:${i + 1}  ${l.trim().slice(0, 80)}`);
    });
  }
  if (derrames.length === 0) ok("cero `var(--signal)` en el área: el único amarillo es `.btn-principal` de `index.css`");
  else mal(`${derrames.length} usos de \`var(--signal)\` fuera de \`.btn-principal\``, derrames.join("\n         "));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 · LA LETRA SALE DE LA ESCALA
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[4] cuerpos: todo sale de la escala `--t-*` de `tema.css`");
{
  const tema = leer("src/tema.css");
  const escala = [...tema.matchAll(/--t-([a-z0-9]+):\s*([\d.]+)px/g)].map((m) => "--t-" + m[1]);
  assert.ok(escala.length >= 6, `la escala --t-* de tema.css salió en ${escala.length} pasos: el test no puede afirmar nada`);
  console.log(`  escala: ${escala.length} pasos (${escala.join(" ")}) + --lbl-px`);

  /* Un `font-size: 12.5px` escrito a mano es un paso que nadie declaró: el
     modo oscuro, el apretón de ventana y la próxima figura no lo van a
     respetar. Los SVG de `graficos.tsx` declaran px a propósito —— el contrato
     de tamaño clava la escala en 1 —— y su rango lo mide `probar:graficos`. */
  const literales = [];
  for (const p of [...NUEVOS, HOJA]) {
    const es_css = p.endsWith(".css");
    const src = es_css ? sinComentariosCss(leer(p)) : sinComentarios(leer(p));
    src.split("\n").forEach((l, i) => {
      const m = es_css
        ? l.match(/font-size\s*:\s*([\d.]+)px/)
        : l.match(/fontSize\s*:\s*["']?([\d.]+)(?:px)?["']?\s*[,}]/);
      if (m) literales.push({ donde: `${p}:${i + 1}`, px: Number(m[1]), linea: l.trim().slice(0, 90) });
    });
  }
  /* `graficos.tsx` es el único que puede: sus px viven adentro del `viewBox`.
     Igual se le exige el rango 10-30 acá, para que este test lo diga solo. */
  const enSvg = literales.filter((x) => /graficos\.tsx/.test(x.donde));
  const fuera = literales.filter((x) => !/graficos\.tsx/.test(x.donde));
  if (fuera.length === 0) ok(`cero \`font-size\` literales fuera de la escala en los ${NUEVOS.length + 1} archivos nuevos del área`);
  else mal(`${fuera.length} \`font-size\` literales fuera de la escala`, fuera.map((x) => `${x.donde}  ${x.px}px  ${x.linea}`).join("\n         "));

  /* Los cuerpos de los dibujos no se escriben sueltos: salen de la tabla
     `VOZ` de `graficos.tsx`, que declara cada paso con su px. Se lee la tabla
     —— si no está, este test no puede afirmar nada sobre los SVG y falla ——
     y se le exige el rango de la pantalla. Con el contrato de tamaño
     (`viewBox` + `min-width` + `xMinYMin meet`) el factor de escala es 1, así
     que el px declarado es el px en pantalla; que lo siga siendo bajo el
     navegador lo mide `probar:graficos`. */
  const gsrc = hay("src/components/plataforma/graficos.tsx") ? leer("src/components/plataforma/graficos.tsx") : "";
  const voz = gsrc.match(/const VOZ = \{[\s\S]*?\} as const;/);
  const pasosVoz = voz ? [...voz[0].matchAll(/px:\s*([\d.]+)/g)].map((m) => Number(m[1])) : [];
  const declaradosSvg = [...enSvg.map((x) => x.px), ...pasosVoz];
  if (declaradosSvg.length === 0)
    mal("no hay ni un cuerpo declarado para los SVG (ni la tabla `VOZ` ni un literal): el test no puede afirmar nada sobre los dibujos");
  else {
    const malRango = declaradosSvg.filter((px) => px < 10 || px > 30);
    if (malRango.length === 0)
      ok(`los ${declaradosSvg.length} cuerpos de los SVG (tabla VOZ + literales) están entre 10 y 30 px: ${[...new Set(declaradosSvg)].sort((a, b) => a - b).join(" · ")}`);
    else mal(`${malRango.length} cuerpos de SVG fuera del rango 10-30`, malRango.join(" · "));
  }

  /* `--ink-4` da 3,98:1 sobre el papel (`--bg` #EFF1ED): es trazo y guía, no
     texto. Es el hallazgo medido de la opción A y es de cumplimiento. */
  const conInk4 = [];
  for (const p of [...NUEVOS, HOJA]) {
    const es_css = p.endsWith(".css");
    const src = es_css ? sinComentariosCss(leer(p)) : sinComentarios(leer(p));
    src.split("\n").forEach((l, i) => {
      if (es_css) {
        if (/(^|[;{]|\s)color\s*:\s*var\(--ink-4\)/.test(l)) conInk4.push(`${p}:${i + 1}  ${l.trim().slice(0, 80)}`);
      } else if (/\bfill=(["'{]|\{")var\(--ink-4\)/.test(l) || /\bcolor:\s*"var\(--ink-4\)"/.test(l)) {
        /* `fill` sobre un `<text>` es escritura; sobre un `<path>` o un
           `<line>` es trazo. Sólo se marca el que está en la misma línea de
           un texto —— el resto lo mide `probar:graficos` en pantalla. */
        if (/<T\b|<text\b/.test(l)) conInk4.push(`${p}:${i + 1}  ${l.trim().slice(0, 80)}`);
      }
    });
  }
  if (conInk4.length === 0) ok("ningún texto del área se escribe en `--ink-4` (3,98:1 sobre el papel)");
  else mal(`${conInk4.length} textos escritos en --ink-4`, conInk4.join("\n         "));

  /* El legado, con nombre y apellido, para quien lo limpie. */
  const legado = [];
  for (const p of LEGADO.filter((x) => hay(x)))
    sinComentarios(leer(p)).split("\n").forEach((l, i) => {
      const m = l.match(/fontSize\s*:\s*["']?([\d.]+)(?:px)?["']?\s*[,}]/) || l.match(/fontSize:\s*[a-z]+\s*\?\s*([\d.]+)/);
      if (m) legado.push(`${p}:${i + 1}  ${m[1]}px`);
    });
  if (legado.length) aviso(`${legado.length} \`fontSize\` literales quedan en el legado de las fases 4-7 (${LEGADO.join(", ")}), que \`ReportePlataforma.tsx\` todavía comparte y por eso no se toca en esta fase`);

  /* Y de dónde salen esos literales: exports que ya no importa nadie.
     ── Por qué esto FALLA y ya no es un aviso ─────────────────────────────
     El código muerto no molesta hasta que alguien lo copia, y lo que había
     ahí era justamente la tipografía que esta fase dejó atrás: doce
     `fontSize` literales, en el único archivo del área que nadie mira porque
     «es legado». La verificación del port los contó (11 de 20 exports de
     `consola.tsx` sin un solo importador) y quedaron escritos como aviso, que
     es una forma elegante de no arreglar nada. Ahora es una puerta: CERO
     exports sin importador en `src/components/plataforma/`. Un export que
     nadie importa no es una interfaz, es una copia esperando —— y si se usa
     sólo adentro de su propio archivo, la palabra `export` sobra y quitarla
     cuesta un carácter.
     Lo que cuenta como importador es cualquier OTRO archivo de `src/` que
     nombre el símbolo; el propio archivo no cuenta. */
  const todoElFront = new Map();
  const recorrer = (rel) => {
    let entradas = [];
    try { entradas = readdirSync(join(raiz, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) recorrer(r);
      else if (/\.tsx?$/.test(e.name)) todoElFront.set(r, sinComentarios(leer(r)));
    }
  };
  recorrer("src");
  /* Si el recorrido falla, TODO parecería muerto: verde y falso, otra vez. */
  assert.ok(todoElFront.size > 20, `sólo se leyeron ${todoElFront.size} archivos de src/: el recorrido está roto y no se puede afirmar qué está muerto`);
  const DIR_AREA = "src/components/plataforma";
  const archivosArea = [...todoElFront.keys()].filter((r) => r.startsWith(DIR_AREA + "/")).sort();
  assert.ok(
    archivosArea.length >= 5,
    `sólo se leyeron ${archivosArea.length} archivos de ${DIR_AREA}/: el recorrido está roto y no se puede afirmar qué está muerto`
  );

  const muertosPorArchivo = [];
  let exportsTotales = 0;
  let muertosTotales = 0;
  for (const p of archivosArea) {
    const exports = [...todoElFront.get(p).matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|type|class|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map((m) => m[1]);
    exportsTotales += exports.length;
    const muertos = exports.filter((n) => {
      for (const [ruta, src] of todoElFront) {
        if (ruta === p) continue;
        if (new RegExp(`\\b${n}\\b`).test(src)) return false;
      }
      return true;
    });
    muertosTotales += muertos.length;
    if (muertos.length) muertosPorArchivo.push(`${p}: ${muertos.length} de ${exports.length} sin importador — ${muertos.join(" · ")}`);
  }
  if (muertosTotales === 0)
    ok(`los ${exportsTotales} exports de ${DIR_AREA}/ (${archivosArea.length} archivos) tienen al menos un importador: cero código muerto`);
  else
    mal(
      `${muertosTotales} de ${exportsTotales} exports de ${DIR_AREA}/ no los importa NADIE`,
      muertosPorArchivo.join("\n         ") +
        "\n         Si el símbolo se usa sólo adentro de su archivo, sacale el `export`; si no se usa, borralo."
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 · LOS TRES ESTADOS SÓLO CODIFICAN ESTADO DE ESPACIO
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[5] `--libre / --entra / --ocupado` no codifican nada que no sea estado de espacio");
{
  const HEX = /#(00805A|CE8A0A|D8342E|00BE86|F5A524|F4544E)\b/i;
  const TOKEN = /var\(--(libre|entra|ocupado)(-[a-z]+)?\)/;
  /* Declarar el token NO es consumirlo. `InformeCliente.tsx` los redeclara
     para imprimir en claro venga de donde venga el tema de la pantalla: eso
     no le enseña un color a nadie, sólo lo fija. */
  const DECLARA = /^\s*--(libre|entra|ocupado|resto|dato)[a-z-]*\s*:/;

  /* La regla no es «qué archivo puede», es «qué está codificando». Un color
     de estado es legítimo cuando, al lado, está LA PALABRA del estado que
     codifica (`libre`, `se_libera`, `ocupado`, el mapa `ESTADO_TXT`, la
     comparación `estado === …`) —— que es además la compensación escrita en
     `tema.css` para la terna oscura: cada estado va siempre con su palabra.
     Y es ilegítimo cuando lo que hay al lado es prioridad, señal,
     clasificación o estado de CUENTA: eso es un color que le enseña al ojo
     algo falso.
     Para buscar la palabra se limpian antes los `var(--…)` y los hex, si no
     `var(--ocupado)` se anclaría a sí mismo. */
  const limpiar = (t) => t.replace(/var\(--[a-z0-9-]+\)/g, " ").replace(/#[0-9A-Fa-f]{6}\b/g, " ");
  const PALABRA_ESTADO = /\b(libre|se_libera|se libera|ocupado|ocupados|ESTADO_TXT|MarcaEstado|CLAVE_ESTADOS?)\b|\bestado\b(?!_cuenta)/;
  const NO_ES_ESTADO = /prioridad|se[nñ]al|clasificacion|estado_cuenta|fantasma|dormida|adopci|cobra_debajo|urgencia/i;

  /* La única excepción declarada, con su razón. «Mes en curso · parcial»
     conserva el ámbar de A: no es señal, ni estado de cuenta, ni prioridad
     —— es honestidad del dato —— y no comparte figura con ningún estado de
     espacio (la rejilla de doce meses no dibuja libre/ocupado). Queda escrita
     acá, en un renglón, para que se pueda discutir: si mañana se decide que
     también va en gris, este es el único lugar que hay que tocar. */
  const EXCEPCIONES = [
    { sel: ".plat-chip--parcial", ancla: /parcial/i, razon: "mes en curso · parcial: honestidad del dato, no estado de espacio" },
  ];

  const invasores = [];
  const sinPalabra = [];
  const porExcepcion = [];
  let legitimos = 0;
  for (const p of AREA_TS) {
    const lineas = sinComentarios(leer(p)).split("\n");
    lineas.forEach((l, i) => {
      if (DECLARA.test(l)) return;                 // declarar el token no es usarlo
      if (!(TOKEN.test(l) || HEX.test(l))) return;
      /* Las dos ventanas son distintas a propósito, y la asimetría es la
         regla: lo que un color CODIFICA se escribe pegado a él —— el rótulo
         del chip está en la misma línea o en la de al lado —— mientras que la
         palabra que lo LEGITIMA puede estar en la cabecera del bloque, unas
         líneas más arriba. Una ventana negativa ancha convierte en falla al
         vecino de al lado (la clave de estados junto a la de adopción). */
      const cerca = limpiar(lineas.slice(Math.max(0, i - 1), i + 2).join(" "));
      const ancha = limpiar(lineas.slice(Math.max(0, i - 10), i + 11).join(" "));
      const donde = `${p}:${i + 1}  ${l.trim().slice(0, 78)}`;
      if (NO_ES_ESTADO.test(cerca)) invasores.push(donde);
      else if (PALABRA_ESTADO.test(ancha)) legitimos++;
      else if (EXCEPCIONES.some((e) => e.ancla.test(ancha))) porExcepcion.push(donde);
      else sinPalabra.push(donde);
    });
  }
  if (invasores.length === 0)
    ok(`los ${legitimos} consumos de color de estado van con la palabra del estado al lado; ninguno codifica prioridad, señal, clasificación ni estado de cuenta`);
  else mal(`${invasores.length} colores de estado codificando algo que no es estado de espacio`, invasores.slice(0, 10).join("\n         "));
  if (sinPalabra.length === 0) ok("ningún color de estado aparece sin su palabra cerca");
  else mal(`${sinPalabra.length} colores de estado sin la palabra del estado al lado`, sinPalabra.slice(0, 10).join("\n         "));
  if (porExcepcion.length) aviso(`${porExcepcion.length} consumo(s) cubiertos por la excepción declarada «parcial»`);

  /* Y adentro de la hoja: ningún SELECTOR de señal / estado de cuenta /
     prioridad puede consumirlos. Se recorre bloque por bloque. */
  const css = sinComentariosCss(leer(HOJA));
  const FAMILIAS = /chip|se[nñ]al|prioridad|cuenta|adopci|fantasma|dormida|urgente|riesgo|alta|media|baja/i;
  const bloques = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(bloques.length > 40, `sólo ${bloques.length} bloques leídos de ${HOJA}: el parser está roto`);
  const chipsConColor = [];
  for (const [, selCrudo, cuerpo] of bloques) {
    const sel = selCrudo.trim().replace(/\s+/g, " ");
    if (!(TOKEN.test(cuerpo) || HEX.test(cuerpo))) continue;
    if (!FAMILIAS.test(sel)) continue;
    if (EXCEPCIONES.some((e) => sel.includes(e.sel))) continue;
    chipsConColor.push(`${sel}  →  ${cuerpo.trim().replace(/\s+/g, " ").slice(0, 70)}`);
  }
  if (chipsConColor.length === 0)
    ok("ningún selector de señal / estado de cuenta / prioridad usa el rojo o el ámbar de los estados");
  else mal(`${chipsConColor.length} selectores de chip pintados con color de estado`, chipsConColor.join("\n         "));

  for (const e of EXCEPCIONES) {
    if (css.includes(e.sel)) aviso(`excepción declarada: \`${e.sel}\` — ${e.razon}`);
    else aviso(`la excepción declarada \`${e.sel}\` ya no existe en la hoja: se puede borrar de este test`);
  }

  /* En `graficos.tsx`, el consumo tiene que estar cerca de la palabra del
     estado —— la clave, la leyenda, el mapa de tonos —— y nunca cerca de
     «prioridad» o «señal». */
  const g = "src/components/plataforma/graficos.tsx";
  if (hay(g)) {
    const lineas = sinComentarios(leer(g)).split("\n");
    const cerca = [];
    lineas.forEach((l, i) => {
      if (!(TOKEN.test(l) || HEX.test(l))) return;
      const ventana = lineas.slice(Math.max(0, i - 4), i + 5).join(" ");
      if (/prioridad|se[nñ]al|clasificacion|estado_cuenta|fantasma|dormida/i.test(ventana))
        cerca.push(`${g}:${i + 1}  ${l.trim().slice(0, 80)}`);
    });
    if (cerca.length === 0) ok("en los dibujos, el color de estado nunca aparece cerca de prioridad, señal o clasificación");
    else mal(`${cerca.length} colores de estado cerca de vocabulario que no es estado de espacio`, cerca.join("\n         "));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5b · EL CONTROL DE PERIODO Y EL INTERRUPTOR DE TEMA
//      (la mitad estática de las reglas (c) y (d); la otra mitad, en pantalla)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[5b] el control de periodo y el interruptor de tema");
{
  /* ── (c·1) ningún `<input type="month">` ────────────────────────────────
     La opción A elige un `<select>` con los periodos que existen, y no es
     gusto: Chromium pinta el `<input type="month">` en el idioma DEL
     NAVEGADOR —— «September 2026» en una pantalla íntegramente en castellano
     —— y a 390 px lo recorta a «September 202» más medio ícono de calendario.
     Además ofrece meses que la base no tiene. La verificación del port lo
     midió como la única diferencia de forma contra A visible en cada captura.
     Se mira el atributo escrito, en cualquiera de sus formas JSX. */
  const conMes = [];
  for (const p of PANTALLAS) {
    sinComentarios(leer(p.archivo)).split("\n").forEach((l, i) => {
      if (/type\s*=\s*(?:"month"|'month'|\{\s*["'`]month["'`]\s*\})/.test(l))
        conMes.push(`${p.nombre} · ${p.archivo}:${i + 1}  ${l.trim().slice(0, 80)}`);
    });
  }
  if (conMes.length === 0)
    ok(`ninguna de las ${PANTALLAS.length} pantallas usa \`<input type="month">\` (A usa un \`<select>\` de los periodos que existen)`);
  else mal(`${conMes.length} \`<input type="month">\` en el área`, conMes.join("\n         "));

  /* ── (c·2) el informe no puede clavarse el periodo ──────────────────────
     `const [periodo] = useState(mesActual())` —— sin setter y sin leer de
     dónde viene —— es el patrón exacto que hizo que el informe imprimiera
     septiembre mientras el asesor analizaba julio. Que lo HEREDE de verdad
     lo mide la parte de navegador (19); acá se prohíbe la forma que garantiza
     que no puede heredarlo. */
  {
    const src = sinComentarios(leer("src/pages/InformeCliente.tsx"));
    const clavado = /const\s*\[\s*periodo\s*\]\s*=\s*useState\s*\(/.test(src);
    const lee = /useSearchParams|useLocation|location\.state|searchParams|URLSearchParams|useParams/.test(src);
    if (!clavado && lee)
      ok("el informe toma el periodo de quien lo abre (lee la URL o el estado de navegación), no de un `useState` clavado");
    else if (clavado)
      mal("el informe clava el periodo en un `useState(mesActual())` sin setter ni fuente: no puede heredar el mes que el asesor eligió",
        "src/pages/InformeCliente.tsx  ·  la sesión analiza julio y el informe imprime el mes en curso");
    else
      mal("el informe no lee el periodo de ningún lado (ni URL, ni estado de navegación, ni parámetro de ruta)");

    /* Y del otro lado del botón: la sesión tiene que MANDARLO. */
    const nav = [...sinComentarios(leer("src/pages/DetalleCliente.tsx"))
      .matchAll(/navigate\s*\(([\s\S]{0,260}?)\)\s*;/g)].map((m) => m[1]).filter((a) => /\/informe/.test(a));
    if (nav.length === 0) mal("no se encontró la navegación al informe en `DetalleCliente.tsx`: el test no puede afirmar nada");
    else if (nav.every((a) => /periodo/.test(a)))
      ok(`las ${nav.length} navegaciones al informe llevan el periodo elegido`);
    else mal(`${nav.filter((a) => !/periodo/.test(a)).length} navegación(es) al informe sin el periodo`,
      nav.filter((a) => !/periodo/.test(a)).map((a) => a.replace(/\s+/g, " ").slice(0, 100)).join("\n         "));
  }

  /* ── (d) un solo interruptor de tema en el área ─────────────────────────
     Había dos, y pintaban lo mismo: el de `src/tema.tsx` (sin borde,
     «Cambiar a MODO oscuro») y el de `components/plataforma/consola.tsx`
     (con borde, «Cambiar a TEMA oscuro»). Mismo atributo, misma llave de
     `localStorage`, distinta forma y —— lo que importa —— distinto anuncio
     para un lector de pantalla: el mismo botón cambia de nombre según en qué
     pantalla del área esté parado. Uno solo, y con un solo `aria-label`. */
  const origen = new Map();
  for (const p of PANTALLAS) {
    const src = sinComentarios(leer(p.archivo));
    for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g))
      if (/\bTemaToggle\b/.test(m[1])) origen.set(p.nombre, m[2]);
  }
  const modulos = [...new Set(origen.values())];
  if (origen.size !== PANTALLAS.length)
    mal(`sólo ${origen.size} de las ${PANTALLAS.length} pantallas importan un \`TemaToggle\`: el test no puede afirmar cuál es el único`,
      [...origen].map(([k, v]) => `${k} → ${v}`).join(" · "));
  else if (modulos.length === 1)
    ok(`las ${PANTALLAS.length} pantallas usan el mismo interruptor de tema (\`${modulos[0]}\`)`);
  else
    mal(`${modulos.length} interruptores de tema distintos en la misma área`,
      [...origen].map(([k, v]) => `${k} → ${v}`).join("\n         "));

  /* Y el `aria-label` que ese interruptor anuncia: uno solo por dirección.
     Se leen los del módulo elegido y se exige que no haya dos redacciones
     compitiendo dentro del área. */
  /** `"../tema"` visto desde `src/pages/X.tsx` → `src/tema.tsx`. */
  const resolver = (esp) => {
    const base = join("src/pages", esp).replace(/\\/g, "/");
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (hay(base + ext)) return base + ext;
    return null;
  };
  const ARIA_TOGGLE = /Cambiar a (?:modo|tema) (?:oscuro|claro)/g;
  const redacciones = new Set();
  for (const esp of modulos) {
    const f = resolver(esp);
    if (!f) { aviso(`no se pudo resolver \`${esp}\` a un archivo: el \`aria-label\` lo mide la parte de navegador (20)`); continue; }
    for (const m of sinComentarios(leer(f)).matchAll(ARIA_TOGGLE)) redacciones.add(m[0]);
  }
  /* Dos redacciones son lo correcto —— una por dirección («a oscuro» / «a
     claro») ——; tres o más significan que hay dos botones compitiendo. */
  if (redacciones.size === 0)
    aviso("no se encontró el `aria-label` del interruptor en el estático; lo mide la parte de navegador (20)");
  else if (redacciones.size <= 2)
    ok(`el interruptor del área tiene un solo \`aria-label\` por dirección: ${[...redacciones].join(" · ")}`);
  else
    mal(`${redacciones.size} redacciones distintas del \`aria-label\` del interruptor conviven en el área`, [...redacciones].join("\n         "));
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 y 7 · LO QUE NO SE TOCA
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[6·7] lo que esta fase no toca");
{
  /* Acá había dos comprobaciones que diffeaban `backend/` y
     `ReportePlataforma.tsx` contra `origin/main` y fallaban si algo había
     cambiado. Eran las dos promesas del PR de la Fase 11 —«backend sin una
     sola línea de cambio», «el reporte se enlaza, no se rediseña»— y mientras
     la fase vivía en una rama medían exactamente eso.

     Mergeada la fase, dejaron de medir la promesa: `origin/main` ya ES la
     Fase 11, así que el diff pasó a ser «¿alguien tocó el backend después?»,
     que es siempre que sí y no tiene nada que ver con esta área. La primera
     rama que arregló otra cosa las puso en rojo.

     Una prueba que no puede volver a pasar no protege nada: enseña a ignorar
     la suite. Lo que sí sobrevive al merge es lo de abajo —el enlace tiene
     que seguir estando, porque no rediseñar el reporte no es esconderlo—, y
     eso se afirma leyendo la pantalla de hoy y no comparándola con ayer. */
  const enlaza = PANTALLAS.filter((p) => /\/plataforma\/reporte\//.test(leer(p.archivo)));
  if (enlaza.length > 0) ok(`el reporte de transparencia se enlaza desde ${enlaza.map((p) => p.nombre).join(" · ")}`);
  else mal("ninguna pantalla del área enlaza el reporte de transparencia");
}

// ═══════════════════════════════════════════════════════════════════════════
// 8-17 · LA PARTE QUE NINGÚN GREP HACE
// ═══════════════════════════════════════════════════════════════════════════
const URL_DEV = process.env.PROBAR_PLATAFORMA_URL;
const TOKEN_OP = process.env.PROBAR_PLATAFORMA_TOKEN;

if (!URL_DEV || !TOKEN_OP) {
  console.log("\n[8-17] navegador — SALTADO (falta PROBAR_PLATAFORMA_URL / PROBAR_PLATAFORMA_TOKEN)");
  console.log("       la frontera en pantalla no se afirma sin abrir las tres pantallas de verdad;");
  console.log("       la cabecera de este archivo tiene la receta completa (seed + backend + vite).");
} else {
  const CLIENTE = process.env.PROBAR_PLATAFORMA_CLIENTE || "mercafresco";
  const TARIFA = process.env.PROBAR_PLATAFORMA_TARIFA || "987654";
  const AJENOS = (process.env.PROBAR_PLATAFORMA_AJENOS || "Zafiro Nocturno,zafironoct")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const SECRETOS = (process.env.PROBAR_PLATAFORMA_SECRETOS ||
    "NOTA-INTERNA-QUE-NO-DEBE-SALIR,Juan Perez,contacto@proveedor.example,3005558899,ventas@nutresa.com.co")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const API = process.env.PROBAR_PLATAFORMA_API || URL_DEV;
  const CHROME = process.env.PROBAR_PLATAFORMA_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

  /** La tarifa, escrita como la escribiría la pantalla: cruda, con puntos de
   *  miles (es-CO), con coma decimal, y con el separador fino que usa
   *  `Intl.NumberFormat` en algunos entornos. */
  const caras = (n) => {
    const s = String(n);
    const conPuntos = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return [...new Set([s, conPuntos, conPuntos.replace(/\./g, ","), conPuntos.replace(/\./g, " "), conPuntos.replace(/\./g, " ")])];
  };
  const CARAS_TARIFA = caras(TARIFA);

  let chromium = null;
  try {
    ({ chromium } = await import(process.env.PROBAR_PLATAFORMA_PLAYWRIGHT || "playwright-core"));
  } catch {
    try { ({ chromium } = await import("playwright")); } catch { /* no hay */ }
  }
  if (!chromium) {
    console.log("\n[8-17] navegador — SALTADO: no se pudo importar playwright-core");
  } else if (!existsSync(CHROME)) {
    console.log(`\n[8-17] navegador — SALTADO: no está el Chromium en ${CHROME}`);
  } else {
    console.log(`\n[8-17] navegador — ${URL_DEV} · cliente «${CLIENTE}» · tarifa sembrada ${TARIFA}`);

    const nav = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
    const cerrar = async () => { try { await nav.close(); } catch { /* ya cerró */ } };

    const RUTAS = [
      { nombre: "cartera", url: "/plataforma" },
      { nombre: "sesión", url: `/plataforma/clientes/${CLIENTE}` },
      { nombre: "informe", url: `/plataforma/clientes/${CLIENTE}/informe` },
    ];

    /** Todo lo que un ojo o un lector de pantalla puede alcanzar: el texto
     *  renderizado, los `<text>` y `<title>` de los SVG (que NO están en
     *  `innerText`), los `aria-label` y los `title`. Con los `<details>`
     *  abiertos: el detalle plegado también es pantalla. */
    const COSECHAR = () => ({
      texto: document.body.innerText,
      svg: [...document.querySelectorAll("svg text, svg title, svg desc")].map((t) => t.textContent).join(" · "),
      aria: [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).join(" · "),
      titles: [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title")).join(" · "),
      principales: [...document.querySelectorAll(".btn-principal")]
        .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 20)
        .map((e) => (e.textContent || "").trim().slice(0, 40)),
      entradas: document.querySelectorAll("input, textarea, select").length,
    });

    const abrir = async (ctx, ruta) => {
      const p = await ctx.newPage();
      const errores = [];
      const pedidos = [];
      const cuerpos = [];
      /* Se separan tres cosas que se suelen confundir en una sola bolsa:
         una EXCEPCIÓN de la app (rompe la pantalla), una respuesta de la API
         que falla (rompe el dato), y el ruido del navegador (`/favicon.ico`
         404 en el servidor de dev, que no es de nadie). Las dos primeras
         fallan; la tercera se reporta y no. */
      const ruido = [];
      p.on("console", (m) => { if (m.type() === "error") ruido.push(m.text().slice(0, 180)); });
      p.on("pageerror", (e) => errores.push("EXCEPCIÓN " + String(e).slice(0, 180)));
      /* `/api/plataforma/` con la barra: `/src/api/plataforma.ts` es el módulo
         que sirve Vite, no un endpoint. */
      p.on("request", (r) => { const u = r.url(); const i = u.indexOf("/api/plataforma/"); if (i >= 0) pedidos.push(u.slice(i)); });
      p.on("response", async (r) => {
        const u = r.url();
        const i = u.indexOf("/api/plataforma/");
        if (i < 0) return;
        if (r.status() >= 400) errores.push(`API ${r.status()} en ${u.slice(i)}`);
        try { cuerpos.push({ u: u.slice(i), cuerpo: await r.text() }); } catch { /* redirect */ }
      });
      await p.goto(URL_DEV + ruta, { waitUntil: "networkidle", timeout: 45000 });
      await p.waitForTimeout(2500);
      await p.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
      await p.waitForTimeout(700);
      return { p, errores, pedidos, cuerpos, ruido };
    };

    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([t]) => {
      localStorage.setItem("retail-auth-v1", JSON.stringify({
        state: {
          token: t, role: "worker", cliente: "plataforma", clienteNombre: "Plataforma",
          email: "operador@recabra.example", nombre: "Operador", avisoCuenta: null,
          pedirConsentimiento: false, plataforma: true,
        }, version: 0,
      }));
    }, [TOKEN_OP]);

    const cosecha = {};
    for (const r of RUTAS) {
      const { p, errores, pedidos, cuerpos, ruido } = await abrir(ctx, r.url);
      const c = await p.evaluate(COSECHAR);
      cosecha[r.nombre] = { ...c, errores, pedidos, cuerpos };
      await p.close();
      console.log(`  · ${r.nombre}: ${c.texto.length} car. de texto · ${c.svg.length} en SVG · ${pedidos.length} llamadas a /api/plataforma/`);
      if (c.texto.length < 400) mal(`la pantalla «${r.nombre}» quedó casi vacía (${c.texto.length} car.): el test no puede afirmar nada`, c.texto.slice(0, 200));
      if (errores.length) mal(`${errores.length} fallas de app o de API en «${r.nombre}»`, errores.slice(0, 4).join("\n         "));
      else ok(`«${r.nombre}» — 0 excepciones y 0 respuestas de la API en error`);
      /* «Failed to load resource» sin URL no se le puede adjudicar a nadie
         desde acá (en el servidor de dev es `/favicon.ico`, que no existe y
         no es del área). Se dice, y no falla: lo que sí importa —— que una
         llamada de la plataforma devuelva un error —— ya lo mide la línea de
         arriba, y con el código de estado. */
      const sinAdjudicar = ruido.filter((t) => /^Failed to load resource/.test(t));
      const propios = ruido.filter((t) => !/^Failed to load resource/.test(t));
      if (propios.length) mal(`${propios.length} errores de consola propios en «${r.nombre}»`, propios.slice(0, 3).join("\n         "));
      if (sinAdjudicar.length) aviso(`«${r.nombre}»: ${sinAdjudicar.length} error(es) de recurso sin URL adjudicable (en dev, \`/favicon.ico\`)`);
    }

    const todoDe = (n) => [cosecha[n].texto, cosecha[n].svg, cosecha[n].aria, cosecha[n].titles].join(" · ");

    // ── 8 · la tarifa de referencia no aparece ───────────────────────────
    {
      const hits = [];
      for (const n of Object.keys(cosecha)) {
        const t = todoDe(n);
        for (const cara of CARAS_TARIFA) if (t.includes(cara)) hits.push(`${n}: «${cara}» en pantalla`);
        for (const { u, cuerpo } of cosecha[n].cuerpos)
          for (const cara of CARAS_TARIFA) if (cuerpo.includes(cara)) hits.push(`${n}: «${cara}» en la respuesta de ${u}`);
      }
      if (hits.length === 0)
        ok(`la tarifa de referencia (${CARAS_TARIFA.join(" / ")}) no aparece en ninguna de las 3 pantallas ni en ningún cuerpo de la API`);
      else mal(`${hits.length} apariciones de la tarifa de referencia`, hits.slice(0, 8).join("\n         "));

      /* El otro lado de la misma frontera: la RELACIÓN sí tiene que estar.
         Un test que sólo prohíbe deja pasar la pantalla que borró el dato. */
      if (/%/.test(cosecha.cartera.texto) && /(por debajo|spread)/i.test(cosecha.cartera.texto))
        ok("la cartera sí publica la relación (quién cobra por debajo), que es lo que reemplaza a la tarifa");
      else aviso("la cartera no menciona «cobra por debajo» ni «spread»: revisar que el spread siga publicándose");
    }

    // ── 9 · el proveedor va saneado ──────────────────────────────────────
    {
      const hits = [];
      for (const n of Object.keys(cosecha)) {
        const t = todoDe(n);
        for (const s of SECRETOS) if (s && t.includes(s)) hits.push(`${n}: «${s}»`);
      }
      if (hits.length === 0) ok(`ninguna de las ${SECRETOS.length} agujas de la base del cliente (correo · teléfono · contacto · notas) llega a pantalla`);
      else mal(`${hits.length} fugas de datos de la base del cliente`, hits.join("\n         "));
    }

    // ── 10 · el informe está limpio ──────────────────────────────────────
    {
      const t = todoDe("informe");
      const JERGA = ["cartera", "señal", "senal", "fantasma", "adopción", "adopcion",
        "spread", "benchmark", "dormida", "solo lectura", "suspendido", "en gracia"];
      const hits = JERGA.filter((w) => t.toLowerCase().includes(w.toLowerCase()));
      if (hits.length === 0) ok(`el informe no usa ninguna de las ${JERGA.length} palabras internas del operador`);
      else mal(`${hits.length} palabras internas en el informe`, hits.join(" · "));

      /* Los otros clientes no se toman de una variable de entorno que se
         puede quedar vieja: se le preguntan al registro. Lo que el informe no
         puede nombrar es a TODOS los demás, no a los dos que alguien recordó
         poner en la línea de comandos. */
      let ajenos = AJENOS;
      try {
        const r = await fetch(`${API}/api/plataforma/clientes`, { headers: { Authorization: "Bearer " + TOKEN_OP } });
        if (r.ok) {
          const j = await r.json();
          const lista = (j.clientes || []).filter((c) => c.slug !== CLIENTE);
          if (lista.length) ajenos = lista.flatMap((c) => [c.nombre, c.slug]).filter(Boolean);
          console.log(`       otros clientes del registro: ${lista.map((c) => c.nombre).join(" · ")}`);
        }
      } catch { /* se queda con los de la variable */ }
      if (ajenos.length === 0) mal("no hay ni un otro cliente contra el cual probar: sembrá al menos dos");
      const otros = ajenos.filter((a) => a && a.length > 3 && t.toLowerCase().includes(a.toLowerCase()));
      if (otros.length === 0) ok(`el informe no nombra a ninguno de los ${ajenos.length} nombres/slugs de otros clientes`);
      else mal("el informe nombra a otro cliente", otros.join(" · "));

      /* «prioridad» es juicio del operador sobre su propia agenda. Se mira
         aparte porque puede colarse como rótulo de una tarjeta. */
      if (!/prioridad/i.test(t)) ok("el informe no habla de prioridad");
      else mal("el informe habla de prioridad (es el orden de la agenda del operador, no del gerente)");

      /* Y solo lectura: el informe no es un formulario. */
      if (cosecha.informe.entradas === 0) ok("el informe no tiene ni un `input`, `select` o `textarea`");
      else mal(`el informe tiene ${cosecha.informe.entradas} controles de entrada`);
    }

    // ── 11 · el detalle deja rastro en la bitácora ───────────────────────
    {
      const url = `${API}/api/plataforma/clientes/${encodeURIComponent(CLIENTE)}/reporte?meses=1`;
      try {
        const r = await fetch(url, { headers: { Authorization: "Bearer " + TOKEN_OP } });
        if (!r.ok) mal(`la bitácora no se pudo leer (${r.status} en ${url})`);
        else {
          const j = await r.json();
          const lineas = (j.accesos && j.accesos.lineas) || [];
          const detalles = lineas.filter((l) => l.accion === "detalle");
          if (detalles.length > 0)
            ok(`el detalle quedó en la bitácora que el cliente puede leer: ${detalles.length} línea(s) \`accion=detalle\` (de ${j.accesos.total} accesos)`);
          else mal("abrir el detalle NO dejó línea en `bitacora_plataforma`", JSON.stringify(lineas.slice(0, 4)));
          /* Y la bitácora tampoco puede traer la tarifa. */
          const crudo = JSON.stringify(j);
          const fuga = CARAS_TARIFA.filter((c) => crudo.includes(c));
          if (fuga.length === 0) ok("el reporte de transparencia tampoco trae la tarifa de referencia");
          else mal("la tarifa aparece en el reporte de transparencia", fuga.join(" · "));
        }
      } catch (e) {
        mal("no se pudo consultar la bitácora", String(e).slice(0, 160));
      }
    }

    // ── 12 · el informe no abre una consulta nueva ───────────────────────
    {
      const normal = (l) => [...new Set(l
        .filter((u) => u.startsWith("/api/plataforma"))
        .map((u) => u.split("?")[0].replace(new RegExp("/clientes/" + CLIENTE), "/clientes/{slug}")))].sort();
      const sesion = normal(cosecha["sesión"].pedidos);
      const informe = normal(cosecha.informe.pedidos);
      console.log(`       sesión: ${sesion.join(" · ") || "—"}`);
      console.log(`       informe: ${informe.join(" · ") || "—"}`);
      const extra = informe.filter((e) => !sesion.includes(e));
      if (extra.length === 0) ok(`el informe no consulta ningún endpoint que la sesión no consulte ya (${informe.length} de ${sesion.length})`);
      else mal(`el informe abre ${extra.length} endpoint(s) que la sesión no abre`, extra.join(" · "));

      const CARTERA_EP = ["/api/plataforma/metricas", "/api/plataforma/adopcion", "/api/plataforma/clientes"];
      const cuela = informe.filter((e) => CARTERA_EP.includes(e));
      if (cuela.length === 0) ok("el informe no llama a `/metricas`, `/adopcion` ni `/clientes`");
      else mal("el informe llama a la cartera", cuela.join(" · "));
    }

    // ── 13 · un `.btn-principal` visible por pantalla, claro y oscuro ────
    {
      for (const [tema, atributo] of [["claro", null], ["oscuro", "oscuro"]]) {
        const c2 = await nav.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
        await c2.addInitScript(([t, tm]) => {
          localStorage.setItem("retail-auth-v1", JSON.stringify({
            state: {
              token: t, role: "worker", cliente: "plataforma", clienteNombre: "Plataforma",
              email: "operador@recabra.example", nombre: "Operador", avisoCuenta: null,
              pedirConsentimiento: false, plataforma: true,
            }, version: 0,
          }));
          if (tm) localStorage.setItem("recabra-tema", "oscuro");
          else localStorage.setItem("recabra-tema", "claro");
        }, [TOKEN_OP, atributo]);
        for (const r of RUTAS) {
          const p = await c2.newPage();
          await p.goto(URL_DEV + r.url, { waitUntil: "networkidle", timeout: 45000 });
          await p.waitForTimeout(2200);
          /* Que la temperatura de verdad se haya aplicado. Sin esto, «0
             textos por debajo del piso en oscuro» podría estar midiendo la
             pantalla clara dos veces —— el peor resultado posible: verde y
             falso. `aplicarTema` BORRA el atributo en claro, así que se
             comprueba contra el fondo pintado, que es la única verdad. */
          const puesto = await p.evaluate(() => ({
            attr: document.documentElement.dataset.tema || "claro",
            bg: getComputedStyle(document.body).backgroundColor,
          }));
          if (puesto.attr === tema) ok(`«${r.nombre}» — el tema ${tema} se aplicó (fondo ${puesto.bg})`);
          else mal(`«${r.nombre}» — se pidió ${tema} y la raíz quedó en ${puesto.attr} (fondo ${puesto.bg}): la medición de abajo no vale`);
          const n = await p.evaluate(() => [...document.querySelectorAll(".btn-principal")]
            .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 20).length);
          if (n === 1) ok(`«${r.nombre}» ${tema} — exactamente 1 \`.btn-principal\` visible`);
          else mal(`«${r.nombre}» ${tema} — ${n} \`.btn-principal\` visibles`);

          // ── 14 · contraste de los pares principales ──────────────────
          const bajos = await p.evaluate(() => {
            const lum = (c) => {
              const m = c.match(/[\d.]+/g);
              if (!m) return null;
              const [r, g, b] = m.slice(0, 3).map(Number);
              const a = m.length > 3 ? Number(m[3]) : 1;
              if (a < 0.95) return null; // translúcido: no se puede afirmar el par
              const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const fondoDe = (el) => {
              let n = el;
              while (n && n !== document.documentElement) {
                const bg = getComputedStyle(n).backgroundColor;
                const l = lum(bg);
                if (l !== null) return l;
                n = n.parentElement;
              }
              return lum(getComputedStyle(document.documentElement).backgroundColor) ?? 1;
            };
            const malos = [];
            const vistos = new Set();
            for (const el of document.querySelectorAll("body *")) {
              if (el.children.length > 0) continue;
              const txt = (el.textContent || "").trim();
              if (!txt) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === "hidden" || cs.opacity === "0") continue;
              const lf = lum(cs.color);
              if (lf === null) continue;
              const lb = fondoDe(el);
              const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
              const px = parseFloat(cs.fontSize);
              const grueso = Number(cs.fontWeight) >= 700;
              const piso = px >= 24 || (grueso && px >= 18.66) ? 3 : 4.5;
              if (ratio + 0.02 < piso) {
                const clave = cs.color + "|" + Math.round(ratio * 100) + "|" + txt.slice(0, 20);
                if (vistos.has(clave)) continue;
                vistos.add(clave);
                malos.push({ ratio: Math.round(ratio * 100) / 100, piso, px: Math.round(px * 10) / 10, color: cs.color, txt: txt.slice(0, 42) });
              }
            }
            return malos;
          });
          if (bajos.length === 0) ok(`«${r.nombre}» ${tema} — 0 textos por debajo de su piso WCAG`);
          else mal(`«${r.nombre}» ${tema} — ${bajos.length} textos por debajo de su piso`,
            bajos.slice(0, 6).map((b) => `${b.ratio}:1 (piso ${b.piso}) ${b.px}px ${b.color} «${b.txt}»`).join("\n         "));
          await p.close();
        }
        await c2.close();
      }
    }

    // ── 15 · ningún chip de señal / cuenta / prioridad / cobertura,
    //         pintado con un color de estado — EN LOS DOS TEMAS ────────────
    //
    // La versión de pantalla del ajuste (a). El estático mira selectores de
    // la hoja; esto mira el color COMPUTADO de cada elemento y su palabra, así
    // que también atrapa un `style=` en línea, que es por donde se cuela.
    //
    // ── Por qué esto se rehízo ────────────────────────────────────────────
    // Esta prueba existía y daba verde mientras la regla se rompía. Dos
    // agujeros, los dos medidos por la verificación del port:
    //
    //   1. **Corría en un solo tema.** El chip «MES EN CURSO · PARCIAL» salía
    //      gris en claro y ámbar en oscuro, y la prueba sólo miraba el claro.
    //      La causa está en los tokens, no en el chip: `tema.css` define
    //      `--entra-txt-rgb: var(--entra-rgb)` en oscuro, así que `--entra-txt`
    //      y `--entra` COLAPSAN en el mismo color. Un chip escrito con la
    //      variante «de texto» de un color de estado es, en oscuro, el color
    //      de estado. Ahora se mide en claro y en oscuro, y se comprueba que
    //      el tema pedido se haya aplicado de verdad antes de medir.
    //   2. **La lista de colores estaba escrita a mano.** Doce cadenas
    //      `rgb(…)` copiadas de `tema.css`: cambiar un token dejaba la prueba
    //      mirando un color que ya no existe —— verde y falso. Ahora los
    //      valores se RESUELVEN en la página, del `:root` vivo, con el propio
    //      navegador normalizando (`--libre`, `--entra`, `--ocupado` y sus
    //      variantes `-suave`, `-borde`, `-txt`).
    //
    // Sin excepciones: la terna codifica estado de ESPACIO. Un chip de señal,
    // de estado de cuenta, de prioridad o de cobertura va en tinta gris con su
    // palabra. Los `<text>` de los SVG quedan fuera del barrido —— ahí el
    // color SÍ codifica estado y la franja del mes parcial es una figura, no
    // un chip.
    {
      const PALABRAS = ["fantasma", "dormida", "activa", "nueva", "sin cuentas", "activo", "gracia",
        "solo lectura", "suspendido", "prioridad", "alta", "media", "baja",
        "sin tarifa", "ocupación baja", "cobra por debajo", "señal",
        "parcial", "mes en curso", "cobertura", "sin cobertura", "sin plano",
        "cubierto", "cubierta", "completa", "incompleta", "sin dato", "sin lectura"];

      const MEDIR_CHIPS = ([PAL]) => {
        /* Los doce tokens de la terna, resueltos en el `:root` VIVO y
           normalizados por el navegador a `rgb(r, g, b)`. En oscuro varios
           colapsan entre sí —— eso no se corrige acá: se registra, porque el
           colapso ES la falla que se persigue. */
        const cs = getComputedStyle(document.documentElement);
        const sonda = document.createElement("span");
        sonda.style.display = "none";
        document.body.appendChild(sonda);
        const normalizar = (v) => { sonda.style.color = "rgb(1, 2, 3)"; sonda.style.color = v; return getComputedStyle(sonda).color; };
        const porColor = new Map();
        for (const base of ["libre", "entra", "ocupado"])
          for (const suf of ["", "-suave", "-borde", "-txt"]) {
            const nombre = `--${base}${suf}`;
            const crudo = cs.getPropertyValue(nombre).trim();
            if (!crudo) continue;
            const rgb = normalizar(crudo);
            if (!rgb || rgb === "rgb(1, 2, 3)") continue;
            porColor.set(rgb, [...(porColor.get(rgb) || []), nombre]);
          }
        sonda.remove();

        const hits = [];
        for (const el of document.querySelectorAll("body *")) {
          if (el.children.length > 0) continue;
          if (el.closest("svg")) continue;               // los dibujos sí codifican estado
          const txt = (el.textContent || "").trim().toLowerCase();
          if (!txt || txt.length > 30) continue;
          if (!PAL.some((w) => txt === w || txt.startsWith(w + " ") || txt.endsWith(" " + w) || txt.includes(" " + w + " ")))
            continue;
          const s = getComputedStyle(el);
          for (const prop of ["color", "backgroundColor", "borderTopColor", "borderLeftColor"]) {
            const v = s[prop];
            if (!porColor.has(v)) continue;
            if (prop !== "color" && (v === "rgba(0, 0, 0, 0)" || s.borderTopWidth === "0px")) continue;
            hits.push(`«${txt}» ${prop} = ${v} = ${porColor.get(v).join(" / ")}`);
          }
        }
        return { tokens: [...porColor].map(([v, ns]) => `${ns.join("=")} ${v}`), hits };
      };

      for (const [tema, guardado] of [["claro", "claro"], ["oscuro", "oscuro"]]) {
        const cChip = await nav.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
        await cChip.addInitScript(([t, tm]) => {
          localStorage.setItem("retail-auth-v1", JSON.stringify({
            state: {
              token: t, role: "worker", cliente: "plataforma", clienteNombre: "Plataforma",
              email: "operador@recabra.example", nombre: "Operador", avisoCuenta: null,
              pedirConsentimiento: false, plataforma: true,
            }, version: 0,
          }));
          localStorage.setItem("recabra-tema", tm);
        }, [TOKEN_OP, guardado]);
        let dicho = false;
        for (const r of RUTAS) {
          const p = await cChip.newPage();
          await p.goto(URL_DEV + r.url, { waitUntil: "networkidle", timeout: 45000 });
          await p.waitForTimeout(2200);
          await p.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
          await p.waitForTimeout(400);
          /* Sin esto la medición del oscuro podría estar mirando la pantalla
             clara dos veces: verde y falso, que es como se escapó. */
          const puesto = await p.evaluate(() => document.documentElement.dataset.tema || "claro");
          if (puesto !== tema) {
            mal(`«${r.nombre}» — se pidió el tema ${tema} y la raíz quedó en ${puesto}: la medición de chips no vale`);
            await p.close();
            continue;
          }
          const m = await p.evaluate(MEDIR_CHIPS, [PALABRAS]);
          if (!dicho) { console.log(`       terna en ${tema}: ${m.tokens.join(" · ")}`); dicho = true; }
          if (m.hits.length === 0)
            ok(`«${r.nombre}» ${tema} — ningún chip de señal / estado de cuenta / prioridad / cobertura pintado con la terna de estado`);
          else
            mal(`«${r.nombre}» ${tema} — ${m.hits.length} rótulo(s) que no son estado de espacio, pintados con un color de la terna`,
              m.hits.slice(0, 8).join("\n         "));
          await p.close();
        }
        await cChip.close();
      }
    }

    // ── 18 · residuo de frases-conclusión = 0 ───────────────────────────
    //
    // La regla de A: **ningún dibujo ni tabla aparece sin que, arriba, una
    // frase con la cifra ya diga qué hay que ver.** El gráfico confirma; no
    // informa solo. La verificación del port midió 7 dianas sin ella —— cinco
    // residuos de verdad y dos tablas equivalentes que se habían quedado
    // FUERA de su figura y por eso contaban como dibujo nuevo.
    //
    // Cómo se mide, para que no dependa de nombres de clase:
    //
    //   · DIANA = todo `<figure>` del área y toda `<table>` del área.
    //   · ÚNICA EXENCIÓN: la tabla equivalente de un dibujo, que tiene que
    //     estar DENTRO de su `<figure>`, en un `<details class="plat-tabla-eq">`.
    //     Si está afuera —— hermana de la figura —— no es una equivalencia
    //     estructural, es una tabla más, y necesita su frase. Es exactamente
    //     el caso del riel de vencimientos y del dumbbell del informe.
    //   · Para cada diana se busca, hacia atrás y en orden de documento, el
    //     último texto CON AL MENOS UN DÍGITO que esté fuera de toda diana y
    //     después de la diana anterior. Sin ese texto, es residuo.
    //   · Y tiene que estar CERCA: «a menos de la distancia que use el resto».
    //     Medido en el port, las dianas que cumplen van de 8 a 119 px; el
    //     techo se pone en 220 para que una frase que quedó a media pantalla
    //     no cuente como el pie de un dibujo que está más abajo.
    {
      const TECHO_PX = 220;
      const MEDIR_FRASES = ([techo]) => {
        const raiz = document.querySelector(".plat") || document.body;
        /* La exención, y sólo ella: `<details class="plat-tabla-eq">` DENTRO
           de un `<figure>`. */
        const exenta = (t) => { const d = t.closest("details.plat-tabla-eq"); return !!(d && d.closest("figure")); };
        const dianas = [...raiz.querySelectorAll("figure, table")].filter((e) => e.tagName === "FIGURE" || !exenta(e));
        const eqFuera = [...raiz.querySelectorAll("details.plat-tabla-eq")].filter((d) => !d.closest("figure"))
          .map((d) => (d.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60));
        const dentroDeAlguna = (n) => dianas.some((d) => d.contains(n));
        const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
        const res = dianas.map(() => null);
        let i = 0, ultimo = null, n;
        while ((n = w.nextNode())) {
          while (i < dianas.length && dianas[i].contains(n)) {
            if (ultimo) {
              const a = ultimo.el.getBoundingClientRect(), b = dianas[i].getBoundingClientRect();
              res[i] = { gap: Math.round(b.top - a.bottom), txt: ultimo.t.replace(/\s+/g, " ").trim().slice(-70) };
            }
            ultimo = null; i++;
          }
          if (i >= dianas.length) break;
          if (dentroDeAlguna(n)) continue;
          if (!/\d/.test(n.textContent)) continue;
          const el = n.parentElement;
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.height <= 0 || r.width <= 0) continue;
          ultimo = { el, t: n.textContent };
        }
        const etiqueta = (d) => (d.getAttribute("aria-label") || d.querySelector("figcaption,caption,th")?.textContent || d.textContent || "")
          .replace(/\s+/g, " ").trim().slice(0, 62);
        const residuo = [];
        dianas.forEach((d, k) => {
          const r = res[k];
          if (!r) residuo.push(`${d.tagName} sin ninguna cifra escrita antes — «${etiqueta(d)}»`);
          else if (r.gap > techo || r.gap < -4)
            residuo.push(`${d.tagName} con su cifra a ${r.gap} px (techo ${techo}) — «${etiqueta(d)}»`);
        });
        return {
          dianas: dianas.length,
          exentas: raiz.querySelectorAll("figure details.plat-tabla-eq").length,
          gaps: res.filter(Boolean).map((r) => r.gap).sort((a, b) => a - b),
          eqFuera, residuo,
        };
      };

      for (const r of RUTAS) {
        const p = await ctx.newPage();
        await p.goto(URL_DEV + r.url, { waitUntil: "networkidle", timeout: 45000 });
        await p.waitForTimeout(2200);
        await p.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
        await p.waitForTimeout(500);
        const m = await p.evaluate(MEDIR_FRASES, [TECHO_PX]);
        console.log(`       «${r.nombre}»: ${m.dianas} dianas · ${m.exentas} tablas equivalentes dentro de su figura · distancias ${m.gaps.join(", ") || "—"} px`);
        if (m.dianas < 2) mal(`«${r.nombre}» — sólo ${m.dianas} diana(s): la pantalla no cargó y el test no puede afirmar nada`);
        if (m.residuo.length === 0) ok(`«${r.nombre}» — residuo de frases-conclusión = 0: las ${m.dianas} dianas tienen su cifra arriba`);
        else mal(`«${r.nombre}» — residuo de frases-conclusión = ${m.residuo.length} sobre ${m.dianas} dianas`, m.residuo.join("\n         "));
        /* Y quién se quedó fuera de la exención. Esto NO es una falla: un
           `plat-tabla-eq` que vive fuera de su figura simplemente no está
           exento, y por eso arriba se lo contó como diana y se le exigió su
           cifra como a cualquier otra tabla. Se nombra para que se vea que la
           exención no se está repartiendo sola: la marca puesta a mano sobre
           una tabla hermana no la saca de la cuenta. */
        if (m.eqFuera.length === 0) ok(`«${r.nombre}» — todo \`details.plat-tabla-eq\` vive dentro de su \`<figure>\` (la única exención)`);
        else aviso(`«${r.nombre}»: ${m.eqFuera.length} \`details.plat-tabla-eq\` fuera de una \`<figure>\` — NO están exentos, se les exigió su cifra como diana: ${m.eqFuera.map((t) => "«" + t.slice(0, 34) + "…»").join(" · ")}`);
        await p.close();
      }
    }

    // ── 19 · el informe hereda el periodo de quien lo abre ──────────────
    //
    // La falla más seria que midió la verificación del port: el asesor
    // analiza julio en la sesión, aprieta «Armar el informe para el cliente»,
    // y el informe pide `?periodo=<mes en curso>` y titula el mes en curso.
    // El gerente se lleva impreso un mes que nadie eligió y la hoja no lo
    // dice. Se mide de punta a punta: se cambia el periodo en la sesión, se
    // aprieta el botón de verdad, y se mira QUÉ PIDIÓ el informe.
    {
      const p = await ctx.newPage();
      const pedidos = [];
      p.on("request", (rq) => { const u = rq.url(); const i = u.indexOf("/api/plataforma/"); if (i >= 0) pedidos.push(u.slice(i)); });
      await p.goto(URL_DEV + RUTAS[1].url, { waitUntil: "networkidle", timeout: 45000 });
      await p.waitForTimeout(2200);

      const ctrl = await p.$("#plat-periodo");
      if (!ctrl) {
        mal("la sesión no tiene el control `#plat-periodo`: no se puede probar la herencia del periodo");
      } else {
        /* Se elige un periodo que NO sea el mes en curso —— si fueran el
           mismo, el informe acertaría por casualidad y la prueba daría verde
           sin haber probado nada. El control puede ser un `<select>` (la
           forma de A) o un `<input>`; los dos se manejan igual. */
        const info = await p.evaluate(() => {
          const e = document.querySelector("#plat-periodo");
          const hoy = new Date();
          const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
          const opciones = e.tagName === "SELECT" ? [...e.options].map((o) => o.value) : [];
          return { tag: e.tagName.toLowerCase(), valor: e.value, mesActual, opciones };
        });
        const anterior = (() => {
          const [a, m] = info.mesActual.split("-").map(Number);
          const d = new Date(Date.UTC(a, m - 2, 1));
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        })();
        const elegido = info.opciones.length
          ? (info.opciones.find((v) => v && v !== info.mesActual) || anterior)
          : anterior;

        if (elegido === info.mesActual) {
          mal("no hay ningún periodo distinto del mes en curso para elegir: sembrá al menos dos meses o la prueba no prueba nada");
        } else {
          if (info.tag === "select") await p.selectOption("#plat-periodo", elegido);
          else await p.fill("#plat-periodo", elegido);
          await p.waitForTimeout(2500);
          const enSesion = await p.evaluate(() => document.querySelector("#plat-periodo").value);
          if (enSesion === elegido) ok(`la sesión aceptó el periodo ${elegido} (control \`<${info.tag}>\`, mes en curso ${info.mesActual})`);
          else mal(`se pidió el periodo ${elegido} en la sesión y el control quedó en ${enSesion}`);

          pedidos.length = 0;
          const boton = await p.$(".btn-principal");
          if (!boton) mal("no está el `.btn-principal` de la sesión («Armar el informe para el cliente»)");
          else {
            await boton.click();
            await p.waitForTimeout(3000);
            const url = p.url();
            const detalles = pedidos.filter((u) => /\/detalle\?/.test(u));
            const conElegido = detalles.filter((u) => u.includes(`periodo=${elegido}`));
            const conOtro = detalles.filter((u) => !u.includes(`periodo=${elegido}`));
            if (!/\/informe/.test(url)) {
              mal(`el botón de la sesión no llevó al informe (quedó en ${url.replace(URL_DEV, "")})`);
            } else if (detalles.length === 0) {
              mal("el informe no pidió el detalle: no se puede afirmar con qué periodo se armó");
            } else if (conOtro.length === 0) {
              ok(`el informe heredó el periodo ${elegido}: pidió ${conElegido[0]}`);
            } else {
              mal(`el informe NO heredó el periodo: la sesión estaba en ${elegido} y el informe pidió ${conOtro.join(" · ")}`,
                "un gerente se lleva impreso un mes que el asesor no eligió, y la hoja no lo dice");
            }
            /* Y que lo diga en la hoja, no sólo en la llamada —— pero no vale
               con que el nombre del mes aparezca EN CUALQUIER PARTE: en una
               pieza que compara contra el mes anterior, «agosto» sale escrito
               igual aunque el informe esté armado con septiembre. Se mira el
               RENGLÓN del periodo, que es el que el gerente lee arriba; y si
               no existe, la fecha de arranque del rango (`2026-08-01`), que
               ningún otro capítulo escribe. */
            const enPantalla = await p.evaluate(() => document.body.innerText);
            const nombres = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
              "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            const nombreMes = nombres[Number(elegido.split("-")[1]) - 1];
            const reglon = enPantalla.split("\n").map((l) => l.trim()).find((l) => /^periodo\b/i.test(l));
            if (reglon) {
              if (new RegExp(nombreMes, "i").test(reglon) || reglon.includes(elegido))
                ok(`el renglón del periodo del informe dice el mes heredado: «${reglon.slice(0, 70)}»`);
              else mal(`el renglón del periodo del informe no dice ${elegido} («${nombreMes}»)`, `dice: «${reglon.slice(0, 90)}»`);
            } else if (enPantalla.includes(`${elegido}-01`)) {
              ok(`el informe escribe el rango del periodo heredado (${elegido}-01…)`);
            } else {
              mal(`el informe no escribe por ningún lado el periodo ${elegido} («${nombreMes}»): no hay renglón «Periodo …» ni el rango ${elegido}-01`);
            }
          }
        }
      }
      await p.close();
    }

    // ── 20 · un solo interruptor de tema, con un solo `aria-label` ──────
    //
    // Había dos en la misma área, y se anunciaban distinto a un lector de
    // pantalla («Cambiar a MODO oscuro» en la cartera, «Cambiar a TEMA
    // oscuro» en la sesión y el informe). El mismo botón, el mismo atributo,
    // la misma llave de `localStorage`, y dos nombres. Uno solo.
    {
      const etiquetas = new Map();
      let malContado = false;
      for (const r of RUTAS) {
        const p = await ctx.newPage();
        await p.goto(URL_DEV + r.url, { waitUntil: "networkidle", timeout: 45000 });
        await p.waitForTimeout(2200);
        const t = await p.evaluate(() =>
          [...document.querySelectorAll("[aria-label]")]
            .filter((e) => /Cambiar a (modo|tema) (oscuro|claro)/i.test(e.getAttribute("aria-label") || ""))
            .filter((e) => e.offsetParent !== null)
            .map((e) => e.getAttribute("aria-label")));
        if (t.length === 1) ok(`«${r.nombre}» — exactamente 1 interruptor de tema visible`);
        else { mal(`«${r.nombre}» — ${t.length} interruptores de tema visibles`, t.join(" · ")); malContado = true; }
        etiquetas.set(r.nombre, t.join(" · "));
        await p.close();
      }
      const distintas = new Set([...etiquetas.values()].filter(Boolean));
      if (!malContado && distintas.size === 1)
        ok(`las ${RUTAS.length} pantallas anuncian el interruptor con el mismo \`aria-label\`: «${[...distintas][0]}»`);
      else if (distintas.size > 1)
        mal(`${distintas.size} \`aria-label\` distintos para el mismo interruptor, según la pantalla`,
          [...etiquetas].map(([k, v]) => `${k}: «${v}»`).join("\n         "));
    }

    // ── 16 · el informe se imprime, y en papel no queda un control ───────
    {
      const p = await ctx.newPage();
      await p.goto(URL_DEV + RUTAS[2].url, { waitUntil: "networkidle", timeout: 45000 });
      await p.waitForTimeout(2200);
      await p.emulateMedia({ media: "print" });
      await p.waitForTimeout(400);
      const controles = await p.evaluate(() =>
        [...document.querySelectorAll("button, a, input, select, textarea")].filter((e) => e.offsetParent !== null).length);
      if (controles === 0) ok("el informe en `media:print` no deja ni un control a la vista");
      else mal(`el informe imprime ${controles} control(es)`);
      const pdf = await p.pdf({ format: "A4", printBackground: true });
      const hojas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      /* A entrega el informe del cliente en 3 páginas A4. Cuatro todavía es
         un informe; a la quinta dejó de ser la pieza que el gerente lee solo. */
      if (hojas >= 1 && hojas <= 4) ok(`el informe imprime en ${hojas} página(s) A4`);
      else mal(`el informe imprime en ${hojas} páginas A4 (la referencia son 3; el techo, 4)`);
      await p.close();
    }

    // ── 17 · escritorio primero: sin scroll horizontal ──────────────────
    for (const [w, h] of [[1440, 900], [1366, 768]]) {
      const c3 = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await c3.addInitScript(([t]) => {
        localStorage.setItem("retail-auth-v1", JSON.stringify({
          state: {
            token: t, role: "worker", cliente: "plataforma", clienteNombre: "Plataforma",
            email: "operador@recabra.example", nombre: "Operador", avisoCuenta: null,
            pedirConsentimiento: false, plataforma: true,
          }, version: 0,
        }));
      }, [TOKEN_OP]);
      const anchos = [];
      for (const r of RUTAS) {
        const p = await c3.newPage();
        await p.goto(URL_DEV + r.url, { waitUntil: "networkidle", timeout: 45000 });
        await p.waitForTimeout(2000);
        const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (m.sw > m.cw + 2) anchos.push(`${r.nombre}: ${m.sw} > ${m.cw}`);
        await p.close();
      }
      await c3.close();
      if (anchos.length === 0) ok(`${w}×${h} — las 3 pantallas sin scroll horizontal`);
      else mal(`${w}×${h} — ${anchos.length} pantalla(s) con scroll horizontal`, anchos.join(" · "));
    }

    await ctx.close();
    await cerrar();
  }
}

console.log(fallas === 0 ? "\nfrontera: sin fallas\n" : `\nfrontera: ${fallas} falla(s)\n`);
