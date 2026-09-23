/**
 * Pruebas de la pantalla de ingreso: que nadie funde un supermercado por
 * error ni entre al equivocado.
 *   npm run probar:ingreso
 *
 * Sale de una pregunta del dueño de la plataforma (2026-09-23): «¿cuando el
 * dueño de una sede invite a un administrador por correo va a quedar
 * aperturando un supermercado nuevo? ¿va a entrar en el supermercado
 * equivocado?». Dos capas:
 *
 *  1. src/utils/ingreso.ts, la aritmética pura (el token del enlace, qué
 *     supermercado arranca elegido en el selector, cómo se distinguen dos
 *     supermercados que se llaman igual);
 *  2. el FUENTE de Login.tsx, firebase.ts y la consola: que las decisiones
 *     sigan cableadas donde tienen que estar. Son las pruebas «de fuente» del
 *     repo — se verifican en reversa rompiendo el fuente a mano.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const salida = join(mkdtempSync(join(tmpdir(), "ing-")), "i.mjs");
const { outputFiles } = await build({
  entryPoints: [join(raiz, "src", "utils", "ingreso.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const I = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const fuente = (...partes) => readFileSync(join(raiz, "src", ...partes), "utf8");

console.log("El enlace de la invitación");

prueba("lee el token de la URL del correo", () => {
  assert.equal(I.tokenDeInvitacion("?invitacion=abc-123_XY"), "abc-123_XY");
  assert.equal(I.tokenDeInvitacion("?x=1&invitacion=t0k"), "t0k");
});

prueba("sin token, o con uno vacío, no hay invitación", () => {
  assert.equal(I.tokenDeInvitacion(""), null);
  assert.equal(I.tokenDeInvitacion("?invitacion="), null);
  assert.equal(I.tokenDeInvitacion("?invitacion=%20%20"), null);
  assert.equal(I.tokenDeInvitacion("?otra=cosa"), null);
});

console.log("El selector de supermercados");

const DOS = [
  { cliente: "pepito", nombre: "Galerías", rol: "owner" },
  { cliente: "otro", nombre: "Otro", rol: "worker" },
];

prueba("arranca VACÍO: no elige el primero de la lista por la persona", () => {
  assert.equal(I.clientePreseleccionado(DOS, null), "");
});

prueba("recuerda el último al que se entró desde este navegador", () => {
  assert.equal(I.clientePreseleccionado(DOS, "otro"), "otro");
});

prueba("un recuerdo que ya no está entre las membresías no se usa", () => {
  assert.equal(I.clientePreseleccionado(DOS, "borrado"), "");
});

const rol = (r) => ({ owner: "dueño", admin: "administrador", worker: "trabajador" })[r];

prueba("dos supermercados que se leen igual se distinguen por su código", () => {
  const iguales = [
    { cliente: "galerias", nombre: "Galerías", rol: "admin" },
    { cliente: "pepito", nombre: "GALERIAS", rol: "owner" },
  ];
  assert.equal(I.etiquetaDeMembresia(iguales[0], iguales, rol), "Galerías (galerias) · administrador");
  assert.equal(I.etiquetaDeMembresia(iguales[1], iguales, rol), "GALERIAS (pepito) · dueño");
});

prueba("los que no se repiten van sólo con su nombre", () => {
  assert.equal(I.etiquetaDeMembresia(DOS[1], DOS, rol), "Otro · trabajador");
});

prueba("el nombre comparable ignora tildes, mayúsculas y signos, como el backend", () => {
  assert.equal(I.nombreComparable("  Galerías. "), "galerias");
  assert.equal(I.nombreComparable("GALERIAS"), "galerias");
  assert.equal(I.nombreComparable("Súper Éxito #2"), "superexito2");
});

console.log("Login.tsx");

const login = fuente("pages", "Login.tsx");

prueba("el token del enlace viaja a /oauth", () => {
  assert.match(login, /loginOauth\(idToken, clienteElegido, aceptaPolitica, conEnlace\)/);
  assert.match(login, /const conEnlace = invitacion && !sinEnlace\.current \? invitacion : undefined;/);
});

prueba("el 403 «sin acceso» ya no abre el formulario de fundar", () => {
  // El aviso va con `sinCliente && !fundando`; el formulario, sólo con `fundando`.
  assert.match(login, /\) : sinCliente && !fundando \? \(/);
  assert.match(login, /onClick=\{\(\) => setFundando\(true\)\}/);
  assert.doesNotMatch(login, /funde\s+el suyo ahora mismo/, "vuelve la invitación a fundar en el aviso de «sin acceso»");
});

prueba("con un enlace de invitación en la URL no se ofrece fundar", () => {
  const bloque = login.slice(login.indexOf("{!invitacion && ("), login.indexOf("Registrar un supermercado nuevo"));
  assert.ok(bloque.length > 0 && bloque.length < 1200, "el botón de fundar no está detrás de `!invitacion`");
});

prueba("los errores del enlace tienen su propio cuadro, antes que el de «sin acceso»", () => {
  const error = login.indexOf(") : errorInvitacion ? (");
  const sinAcceso = login.indexOf(") : sinCliente && !fundando ? (");
  assert.ok(error > 0 && sinAcceso > error, "el cuadro del enlace tiene que ir antes");
  assert.match(login, /const deInvitacion = esErrorDeInvitacion\(err\);/);
});

prueba("el selector usa la preselección, no el primero de la lista", () => {
  assert.match(login, /setClienteElegido\(clientePreseleccionado\(r\.membresias, leerUltimoCliente\(\)\)\)/);
  assert.doesNotMatch(login, /setClienteElegido\(r\.membresias\[0\]/);
});

console.log("Google pregunta con qué cuenta");

prueba("el popup de Google muestra siempre el selector de cuentas", () => {
  assert.match(fuente("api", "firebase.ts"), /setCustomParameters\(\{ prompt: "select_account" \}\)/);
});

console.log("La consola");

const operativo = fuente("components", "plataforma", "cartera-operativo.tsx");

prueba("«Borrar» sólo se ofrece con el cliente archivado y fuera de la base principal", () => {
  assert.match(operativo, /\{!c\.activo && !c\.base_principal && \(/);
});

prueba("borrar exige escribir el código exacto antes de habilitar el botón", () => {
  assert.match(operativo, /accion === "borrar" \? valor\.toLowerCase\(\) === fila\.slug/);
  assert.match(operativo, /disabled=\{busy \|\| !valor \|\| !codigoOk\}/);
});

console.log(`\n${hechas} pruebas`);
