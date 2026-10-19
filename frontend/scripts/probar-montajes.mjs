/**
 * Pruebas de src/utils/montajeDelContrato.ts — cada contrato con sus propios
 * reportes de montaje.
 *   npm run probar:montajes
 *
 * El caso que la motiva (2026-10-05): Alpina tuvo la punta hasta el 20 de
 * octubre y se reportó montada; Colanta la compró desde el 21. El tablero
 * tomaba el último reporte del CÓDIGO, así que Colanta nunca aparecía como
 * pendiente y Supervisar la pintaba «Montado» con la foto de Alpina.
 */
// El navegador de quien usa esto está en Colombia. Con el proceso en UTC —los
// runners de CI lo están— una hora sin huso se leería bien por casualidad y la
// prueba de abajo no mordería.
process.env.TZ = "America/Bogota";

import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const salida = join(mkdtempSync(join(tmpdir(), "mon-")), "m.mjs");
const { outputFiles } = await build({
  entryPoints: [join(raiz, "src", "utils", "montajeDelContrato.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const M = await import(pathToFileURL(salida).href);
const fuente = (...partes) => readFileSync(join(raiz, ...partes), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const CODIGO = "NAVE-PUN-04";
let id = 0;
const reporte = (confirmado_en, extra = {}) =>
  ({ id: ++id, space_code: CODIGO, estado: "montado", confirmado_en, ...extra });
// El backend los manda del más reciente al más viejo.
const indexar = (...reportes) =>
  M.reportesPorCodigo([...reportes].sort((a, b) => M.instanteDe(b) - M.instanteDe(a)));

console.log("El caso que la motivó");

prueba("el «montado» de Alpina no cuenta para Colanta, que arranca después", () => {
  const alpina = reporte("2026-09-02T15:00:00+00:00", { reportado_por: "Yenny" });
  const porCodigo = indexar(alpina);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, "2026-10-21"), undefined);
  // Para el contrato de Alpina sí es su reporte.
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, "2026-09-01"), alpina);
});

prueba("lo que se reporta para Colanta, desde la víspera, sí cuenta", () => {
  const alpina = reporte("2026-09-02T15:00:00+00:00");
  const colanta = reporte("2026-10-20T13:00:00+00:00"); // 8 a. m. del 20, en Colombia
  assert.equal(M.reporteDelContrato(indexar(alpina, colanta), CODIGO, "2026-10-21"), colanta);
});

console.log("El borde: la víspera, a medianoche de Colombia");

prueba("un segundo antes de la medianoche del 20 (hora de Colombia) no cuenta; a medianoche, sí", () => {
  assert.equal(M.cuentaDesde("2026-10-21"), Date.UTC(2026, 9, 20, 5, 0, 0));
  const antes = reporte("2026-10-20T04:59:59+00:00");
  const justo = reporte("2026-10-20T05:00:00+00:00");
  assert.equal(M.reporteDelContrato(indexar(antes), CODIGO, "2026-10-21"), undefined);
  assert.equal(M.reporteDelContrato(indexar(justo), CODIGO, "2026-10-21"), justo);
});

prueba("la hora con huso de Colombia se lee igual que en UTC", () => {
  const r = reporte("2026-10-20T00:00:00-05:00");
  assert.equal(M.instanteDe(r), Date.UTC(2026, 9, 20, 5, 0, 0));
  assert.equal(M.reporteDelContrato(indexar(r), CODIGO, "2026-10-21"), r);
});

prueba("la hora sin huso (SQLite) es UTC, no la hora local del navegador", () => {
  assert.equal(new Date(2026, 9, 20).getTimezoneOffset(), 300, "el proceso no quedó en hora de Colombia");
  assert.equal(M.instanteDe(reporte("2026-10-20T05:00:00")), Date.UTC(2026, 9, 20, 5, 0, 0));
  assert.equal(M.instanteDe(reporte("2026-10-20T04:59:59.123456")), Date.UTC(2026, 9, 20, 4, 59, 59, 123));
  assert.equal(M.reporteDelContrato(indexar(reporte("2026-10-20T04:59:59")), CODIGO, "2026-10-21"), undefined);
});

prueba("la víspera cruza meses, años y el 29 de febrero", () => {
  assert.equal(M.cuentaDesde("2026-11-01"), Date.UTC(2026, 9, 31, 5));
  assert.equal(M.cuentaDesde("2027-01-01"), Date.UTC(2026, 11, 31, 5));
  assert.equal(M.cuentaDesde("2028-03-01"), Date.UTC(2028, 1, 29, 5));
  assert.equal(M.cuentaDesde("2027-03-01"), Date.UTC(2027, 1, 28, 5));
});

console.log("Lo que no cambia");

prueba("entre varios reportes del contrato, vale el último", () => {
  const primero = reporte("2026-10-21T14:00:00+00:00", { estado: "no_montado" });
  const despues = reporte("2026-10-22T14:00:00+00:00");
  assert.equal(M.reporteDelContrato(indexar(primero, despues), CODIGO, "2026-10-21"), despues);
});

prueba("sin fecha de contrato (espacio libre) vale el último, como antes", () => {
  const viejo = reporte("2026-05-01T14:00:00+00:00");
  const nuevo = reporte("2026-09-02T14:00:00+00:00");
  const porCodigo = indexar(viejo, nuevo);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, ""), nuevo);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, undefined), nuevo);
  assert.equal(M.cuentaDesde(""), null);
});

prueba("los códigos no se mezclan, y uno sin reportes no tiene ninguno", () => {
  const otro = { ...reporte("2026-10-22T14:00:00+00:00"), space_code: "NAVE-PUN-05" };
  const porCodigo = indexar(otro);
  assert.equal(M.reporteDelContrato(porCodigo, CODIGO, "2026-10-21"), undefined);
  assert.equal(M.reporteDelContrato({}, CODIGO, "2026-10-21"), undefined);
});

console.log("Las dos pantallas usan la regla, y el servidor dice lo mismo");

prueba("Montajes: un espacio sale de pendientes sólo con el «montado» de SU contrato", () => {
  const vista = fuente("src", "pages", "MountView.tsx");
  assert.match(vista, /if \(reporteDelContrato\(porCodigo, code, cara\.startDate\)\?\.estado === "montado"\) continue;/);
  assert.doesNotMatch(vista, /ultimo\[code\]\?\.estado === "montado"/);
});

prueba("Sede/Supervisar: el estado de montaje de cada cara es el de su contrato", () => {
  const vista = fuente("src", "pages", "DashboardView.tsx");
  assert.match(vista, /reporteDelContrato\(\s*reportesDeMontaje, fullSpaceCode\(entry\.fixture\.sede \|\| sede, entry\.code\), entry\.startDate,\s*\)/);
  assert.doesNotMatch(vista, /latestByCode/);
});

prueba("el enlace firmado usa la misma víspera (routers/montaje.py)", () => {
  const backend = readFileSync(join(raiz, "..", "backend", "app", "routers", "montaje.py"), "utf8");
  assert.match(backend, /def _se_confirma_desde\(lease: SpaceLease\) -> date:[\s\S]*?return lease\.start_date - timedelta\(days=1\)/);
  assert.match(backend, /inicio = datetime\.combine\(desde, time\.min, tzinfo=ZONA_DEL_NEGOCIO\)/);
  const fechas = readFileSync(join(raiz, "..", "backend", "app", "fechas.py"), "utf8");
  assert.match(fechas, /ZONA_DEL_NEGOCIO = timezone\(timedelta\(hours=-5\)/);
});

prueba("la limpieza de fotos vencidas usa esa misma víspera, importada y no copiada", () => {
  // Qué reporte es de qué contrato decide qué foto se borra: si la limpieza
  // tuviera su propia cuenta de la víspera, podría borrar la foto que el
  // tablero le atribuye a un contrato vivo.
  const limpieza = readFileSync(
    join(raiz, "..", "backend", "app", "services", "fotos_vencidas.py"), "utf8");
  assert.match(limpieza, /^from app\.routers\.montaje import _se_confirma_desde$/m);
  assert.match(limpieza, /_se_confirma_desde\(self\.primero\)/);
  assert.doesNotMatch(limpieza, /start_date - timedelta\(days=1\)/);
});

prueba("el enlace no dice que la foto quedó guardada cuando ya se borró", () => {
  // La función pura, con la foto y sin ella: una regex sobre el fuente también
  // pasaba con la condición invertida (`!reportado.file_id ?` la contiene).
  assert.match(M.textoDelReporte({ estado: "montado", file_id: 7 }), /^La foto quedó guardada como prueba/);
  for (const file_id of [null, undefined, 0]) {
    const sin = M.textoDelReporte({ estado: "montado", file_id });
    assert.doesNotMatch(sin, /guardada como prueba/, String(file_id));
    assert.match(sin, /La foto ya no está guardada\.$/, String(file_id));
  }
  assert.match(M.textoDelReporte({ estado: "no_montado", file_id: null }), /motivo/);
  // Y la pantalla la usa, sin una copia propia del texto.
  const pantalla = fuente("src", "pages", "Montaje.tsx");
  assert.match(pantalla, /\{textoDelReporte\(reportado\)\}/);
  assert.doesNotMatch(pantalla, /La foto quedó guardada/);
});

prueba("sin la foto, el enlace no le echa la culpa al fin del contrato", () => {
  // Un admin puede borrar la foto con el contrato en curso para que la
  // repitan: «se borra cuando el contrato termina» sería falso.
  const sin = M.textoDelReporte({ estado: "montado", file_id: null });
  assert.doesNotMatch(sin, /contrato|termina/);
});

// ── fase 2 · I6 ─────────────────────────────────────────────────────────────
// G1: quien monta una participación de cara ve SU zona dibujada (decisión de
// la dueña del 2026-10-18: «con su zona dibujada, sólo la suya; el resto
// gris»). El filtro va en el servidor —las formas ajenas nunca viajan—, el
// trabajador no lo recibe, y la tarjeta es un dibujo de sólo lectura que no
// toca el store ni la API de las participaciones. Y el enlace que dice su
// contrato sigue a ese contrato aunque el espacio cambie de código.

console.log("Fase 2 · la zona de quien monta y el enlace que sigue a su contrato");

const backendMontaje = readFileSync(join(raiz, "..", "backend", "app", "routers", "montaje.py"), "utf8");
/** El cuerpo de una función de nivel 0 de `montaje.py`, hasta la siguiente. */
const funcionPy = (nombre) => {
  const i = backendMontaje.indexOf(`\ndef ${nombre}(`);
  assert.ok(i >= 0, `no está ${nombre} en routers/montaje.py`);
  const fin = backendMontaje.slice(i + 1).search(/\n(?:def |class |@router\.)/);
  return fin < 0 ? backendMontaje.slice(i) : backendMontaje.slice(i, i + 1 + fin);
};
/** Sin docstrings ni comentarios: los textos explican lo que NO se manda. */
const sinDocPy = (t) => t.replace(/"""[\s\S]*?"""/g, "").replace(/#[^\n]*/g, "");

prueba("el dibujo se filtra en el SERVIDOR: de la capa confirmada viajan sólo los polígonos de esta participación", () => {
  const f = funcionPy("_dibujo_de_participacion");
  const codigo = sinDocPy(f);
  assert.match(codigo, /for z in datos\.capas\.get\("confirmada", \[\]\)\s*if z\.participacion_space_id == termino\.space_id/,
    "las zonas no se filtran por la participación del enlace: viajarían las formas de otros");
  assert.doesNotMatch(codigo, /capas(?:\.get\(|\[)"borrador"/, "se dibuja el borrador");
  assert.match(codigo, /if estado_de_distribucion\(cara, datos\) != "confirmada":\s*return None/,
    "se dibuja una distribución sin confirmar, de otro mueble o para revisar");
  assert.match(codigo, /if termino is None or not \(quien\.es_montaje or quien\.role == "admin"\):\s*return None/,
    "el dibujo le llega al trabajador (con ?code= de cada …-PC<n> armaría la distribución entera)");
  assert.match(codigo, /if not zonas:\s*return None/, "una cara toda gris, sin nada suyo, igual sale");
  // Se llama sólo para una participación, con el término de ESTE contrato.
  assert.match(backendMontaje, /if es_participacion\(partido\.parte\):[\s\S]{0,700}?termino = _termino_del_contrato\(db, lease\)[\s\S]{0,200}?dibujo = _dibujo_de_participacion\(db, termino, quien\)/);
});

prueba("el dibujo es una lista blanca tipada: forma de la cara y sus zonas, sin un solo campo comercial", () => {
  const i = backendMontaje.indexOf("class ExclusionDeMontaje(BaseModel):");
  const j = backendMontaje.indexOf("class EspacioMontaje(BaseModel):");
  assert.ok(i > 0 && j > i, "no están los modelos del dibujo antes de EspacioMontaje");
  const modelos = sinDocPy(backendMontaje.slice(i, j));
  const campos = [...modelos.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(campos, ["por", "u0", "u1", "v0", "v1", "orientacion", "ancho", "alto", "exclusiones", "cara", "superficie", "zonas"],
    "el dibujo lleva otro campo que la forma de la cara y las zonas");
  assert.doesNotMatch(modelos, /proveedor|supplier|marca|valor|monto|numero|nombre|pb\b|porcentaje/i);
  assert.match(backendMontaje, /\n {4}dibujo: Optional\[DibujoDeMontaje\] = None\n/);
  // Y la superficie se copia clave por clave (no el dict entero de la cara,
  // que trae más cosas).
  assert.match(sinDocPy(funcionPy("_dibujo_de_participacion")),
    /ExclusionDeMontaje\(por=str\(x\["por"\]\), u0=x\["u0"\], u1=x\["u1"\], v0=x\["v0"\], v1=x\["v1"\]\)/);
  // El mismo tipo en el navegador, sin campos de más.
  const api = fuente("src", "api", "montaje.ts");
  const tipo = (api.match(/export interface DibujoDeMontaje \{[\s\S]*?\n\}/) || [""])[0];
  assert.ok(tipo, "no está DibujoDeMontaje en api/montaje.ts");
  assert.doesNotMatch(tipo.replace(/\/\*[\s\S]*?\*\//g, ""), /proveedor|marca|valor|monto|numero|nombre/i);
  assert.match(api, /\n {2}dibujo\?: DibujoDeMontaje \| null;\n/);
});

prueba("la tarjeta «Tu zona» no lee el store ni la API de las participaciones, no reusa el lienzo y no dice «sombra»", () => {
  const c = fuente("src", "components", "Montaje", "MiZonaEnLaCara.tsx");
  const imports = [...c.matchAll(/^import [^;]*? from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["react", "lucide-react", "../../api/montaje", "../../utils/superficie"],
    "la tarjeta importa algo más que React, el ícono, el tipo del dibujo y las guías");
  assert.doesNotMatch(c, /distribucionStore|api\/participaciones|LienzoDeZonas|useFixtureStore|axios/);
  assert.doesNotMatch(c, /sombra/i, "en la interfaz nunca se dice «sombra»");
  assert.doesNotMatch(c, /<text\b/, "el dibujo escribe algo (un número, un nombre) sobre la cara");
  // Lo pintado es SU zona y lo gris el resto, como dice el pie: la zona en color (no la tinta ni un gris) y la
  // cara en `--surface-3` (recorrido: con `--accent` al 35 % sobre `--surface-2` se leía al revés).
  const zona = (c.match(/<path key=\{i\} d=\{d\} data-zona-propia[\s\S]*?\/>/) || [""])[0];
  assert.match(zona, /fill: "var\(--marca-1\)"/, "la zona propia no se pinta en color");
  assert.doesNotMatch(zona, /--accent|--ink|--surface|--line/, "la zona propia se pinta con un neutro (se lee gris)");
  assert.match(c, /<rect x=\{0\} y=\{0\} width=\{g\.W\} height=\{g\.H\}\s*style=\{\{ fill: "var\(--surface-3\)"/,
    "el resto de la cara no es el gris que nombra el pie");
});

prueba("la tarjeta va entre «Así debe quedar» y «Dónde queda», y sólo la pasa la pantalla del enlace", () => {
  const form = fuente("src", "components", "Montaje", "FormularioMontaje.tsx");
  const asi = form.indexOf("Así debe quedar");
  const zona = form.indexOf("{dibujo && <MiZonaEnLaCara dibujo={dibujo} mueble={muebleDeLaZona} />}");
  const mapa = form.indexOf("<MiniMapa ");
  assert.ok(asi > 0 && zona > asi && mapa > zona, "la tarjeta no está entre la planometría y el mapa");
  const pantalla = fuente("src", "pages", "Montaje.tsx");
  assert.match(pantalla, /dibujo=\{espacio\.dibujo \?\? null\}/, "la pantalla del enlace no le pasa el dibujo al formulario");
  // El tablero (con sesión) no la muestra: el dibujo es de la pantalla del enlace.
  assert.doesNotMatch(fuente("src", "pages", "MountView.tsx"), /dibujo=/);
});

prueba("el enlace con contrato sigue a su contrato tras renumerar o renombrar la sede, y sólo con evidencia", () => {
  // Las tres puertas resuelven igual (la pantalla, la planometría y el reporte).
  assert.equal([...backendMontaje.matchAll(/= _resolver\(db, quien, (?:code|space_code)\)/g)].length, 3,
    "alguna puerta del enlace no pasa por _resolver");
  assert.doesNotMatch(backendMontaje, /_contrato\(quien, _espacio\(/, "una puerta resuelve el contrato con el código viejo");
  const r = sinDocPy(funcionPy("_resolver"));
  assert.match(r, /if quien\.contrato is not None and lease is None:\s*lease = _contrato_mudado\(db, quien, codigo, space\)\s*if lease is None:\s*raise HTTPException\(status_code=410, detail=CONTRATO_CANCELADO\)/);
  const m = sinDocPy(funcionPy("_contrato_mudado"));
  assert.match(m, /if lease is None or not lease\.is_active or lease\.space is None:\s*return None/, "sigue a un contrato cancelado");
  assert.match(m, /ArchivedSpace\.space_id == lease\.space_id/, "sigue a un contrato de una fila archivada");
  assert.match(m, /if \(antes\.cara, antes\.parte\) != \(ahora\.cara, ahora\.parte\):\s*return None/, "cambia de cara o de parte");
  // Sin evidencia de que el código del enlace era de ESE espacio, no se adivina.
  assert.match(m, /if del_codigo is None or _renumeracion_lo_llevo\(db, antes\.base, ahora\.base\):\s*return lease\s*return None/);
});

// La geometría de la tarjeta, ejecutada: el componente exporta sus puros.
const salidaZona = join(mkdtempSync(join(tmpdir(), "mon-zona-")), "z.mjs");
const zonaCompilada = await build({
  entryPoints: [join(raiz, "src", "components", "Montaje", "MiZonaEnLaCara.tsx")],
  bundle: true, format: "esm", write: false, platform: "node", jsx: "automatic", logLevel: "silent",
});
writeFileSync(salidaZona, zonaCompilada.outputFiles[0].text);
const Z = await import(pathToFileURL(salidaZona).href);

prueba("«Tu zona»: u·ancho y (1 − v)·alto, lo que no se vende y las guías; sin nada que dibujar, sin tarjeta (ejecutado)", () => {
  const dib = {
    cara: "A",
    superficie: { orientacion: "frente", ancho: 2, alto: 1, exclusiones: [{ por: "zocalo", u0: 0, u1: 1, v0: 0, v1: 0.25 }] },
    zonas: [[[0.25, 0.25], [0.5, 0.25], [0.5, 0.75], [0.25, 0.75]]],
  };
  const g = Z.geometriaDeMiZona(dib, { entrepanos: [0.5], parantes: [0.25] });
  // Sólo forma: ni un texto, ni un número de participación, ni un porcentaje.
  assert.deepEqual(Object.keys(g), ["W", "H", "exclusiones", "zonas", "entrepanos", "parantes"]);
  assert.equal(g.W, 2);
  assert.equal(g.H, 1);
  assert.deepEqual(g.zonas, ["M0.5 0.75 L1 0.75 L1 0.25 L0.5 0.25 Z"], "v = 0 no quedó abajo");
  assert.deepEqual(g.exclusiones, [{ por: "zocalo", x: 0, y: 0.75, w: 2, h: 0.25 }]);
  assert.deepEqual(g.entrepanos, [0.5]);
  assert.deepEqual(g.parantes, [0.5]);
  // Una tapa vista desde arriba no tiene entrepaños que señalar.
  const arriba = Z.geometriaDeMiZona({ ...dib, superficie: { ...dib.superficie, orientacion: "arriba" } }, { entrepanos: [0.5], parantes: [0.25] });
  assert.deepEqual([arriba.entrepanos, arriba.parantes], [[], []]);
  // Lo que se sale de la cara se recorta al borde.
  assert.deepEqual(Z.geometriaDeMiZona({ ...dib, zonas: [[[-1, 0], [2, 0], [2, 1]]] }, null).zonas, ["M0 1 L2 1 L2 0 Z"]);
  // Nada que dibujar: la tarjeta no sale y la pantalla queda como antes.
  for (const malo of [null, undefined, { ...dib, zonas: [] }, { ...dib, zonas: [[[0, 0], [1, 1]]] },
    { ...dib, superficie: { ...dib.superficie, ancho: 0 } }, { ...dib, superficie: { ...dib.superficie, alto: Number.NaN } }]) {
    assert.equal(Z.geometriaDeMiZona(malo, null), null, String(JSON.stringify(malo)));
  }
});

prueba("«Tu zona»: el título dice la cara y el pie cómo se mira el dibujo (ejecutado)", () => {
  assert.equal(Z.tituloDeMiZona("A"), "Tu zona en la cara A");
  assert.equal(Z.tituloDeMiZona("B"), "Tu zona en la cara B");
  assert.equal(Z.pieDeMiZona("frente"),
    "Vista de frente, como la ves parada delante del mueble. Armá sólo en lo pintado; lo gris es el resto de la cara.");
  assert.equal(Z.pieDeMiZona("arriba"), "Vista desde arriba: el borde de abajo es el frente. Armá sólo en lo pintado.");
});

console.log(`\n${hechas} pruebas`);
