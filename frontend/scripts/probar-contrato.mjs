/**
 * Pruebas del panel de contrato: el valor que se firma y el choque de fechas.
 *   npm run probar:contrato
 *
 * Las dos cosas que mide nacieron del mismo reporte del dueño, mirando la
 * pantalla real, y las dos son de las que no se caen solas: nadie se entera de
 * que volvieron hasta que alguien vende mal.
 *
 * ── 1. El valor no se prorratea ──────────────────────────────────────────────
 *
 * Había un total derivado: `(valor / 30) * dias`. Con $200.000 del 11 de
 * septiembre al 11 de octubre daba **$206.667**, porque los dos extremos
 * cuentan (31 días) y el mes se tomaba de 30. La cuenta estaba bien; la premisa
 * estaba mal. Quien negocia vende el espacio al valor que quiera por el tiempo
 * que quiera: si acuerda un mes por $200.000, el contrato vale $200.000, y si
 * acuerda 31 días por $200.000, vale lo mismo. Lo tecleado ES el precio.
 *
 * El prorrateo es cómodo de reintroducir —parece una mejora— así que se afirma
 * su AUSENCIA, no su valor.
 *
 * ── 2. El choque de fechas se ve y frena ─────────────────────────────────────
 *
 * El aviso existía, pero vivía de tercero adentro de un texto de una línea con
 * puntos suspensivos: con una ubicación larga quedaba pasado el corte y no se
 * leía nunca. Y no frenaba nada: el botón se habilitaba igual y el único que se
 * quejaba era el servidor, al guardar, con todo tecleado.
 *
 * Y hay un agravante que decide el diseño: **el plano no es la verdad.** La
 * disponibilidad de cada renglón sale del JSON del layout, que es una copia que
 * mantiene al día el navegador que vende. Si un contrato entró por otro camino,
 * la copia dice «libre» y la base dice «ocupado» — reproducido acá: contrato
 * del 8 de septiembre al 8 de octubre en la base, y el plano pintando el mueble
 * libre todo el periodo, con `data-est="libre"`. Por eso el bloqueo NO puede
 * colgar sólo de la copia: se le pregunta a `/leases/bulk/validar`, que corre
 * el mismo control que el guardado y no escribe nada.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const contrato = leer(join("src", "components", "Contrato", "Contrato.tsx"));
const vender = leer(join("src", "components", "Contrato", "ModoVender.tsx"));
const css = leer(join("src", "vender.css"));

/* Los comentarios explican el bug con su propia fórmula y sus propias cifras:
   se quitan antes de buscar, para no fallar por la documentación que este
   mismo arreglo pide escribir. */
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const codigoContrato = sinComentarios(contrato);
const codigoVender = sinComentarios(vender);

// ─── 1 · el valor es el que se teclea ────────────────────────────────────────

prueba("no quedó ningún prorrateo por día sobre 30", () => {
  const sospechas = [...codigoContrato.matchAll(/\/\s*30\s*\)?\s*\*/g)].map((m) => m[0]);
  assert.deepEqual(
    sospechas, [],
    "volvió el prorrateo: el valor acordado se estaría dividiendo por 30 y " +
      "multiplicando por los días, que es justo lo que daba $206.667 por $200.000",
  );
});

prueba("el total es la suma de lo acordado, sin tocar", () => {
  assert.match(
    codigoContrato,
    /const total = lineas\.reduce\(\(t, l\) => t \+ l\.monto, 0\)/,
    "el total del contrato dejó de ser la suma limpia de los renglones",
  );
});

prueba("el total que viaja al aviso de guardado es el mismo", () => {
  // Si estos dos se separan, el «guardado» contradice a la ficha que se firmó.
  assert.match(
    codigoContrato,
    /total: parches\.reduce\(\(t, p\) => t \+ \(p\.patch\.negotiatedValue \?\? 0\), 0\)/,
    "el total del resumen de guardado no es la misma suma que la pantalla",
  );
});

prueba("nada de la ficha se sigue llamando «mensual»", () => {
  // El valor dejó de ser mensual: si la etiqueta lo sigue diciendo, la pantalla
  // vuelve a prometer la cuenta que se quitó.
  const restos = ["Valor mensual", "canon mensual", "Canon mensual"]
    .filter((t) => codigoVender.includes(t) || codigoContrato.includes(t));
  assert.deepEqual(restos, [], "quedaron etiquetas de valor mensual: " + restos.join(" · "));
});

// ─── 2 · el choque se ve y frena ─────────────────────────────────────────────

prueba("el aviso de choque NO vive adentro del texto que se trunca", () => {
  const seg = codigoVender.match(/const segunda = \[([\s\S]*?)\]\.filter\(Boolean\)/);
  assert.ok(seg, "no se encontró el renglón `segunda` en ModoVender");
  assert.ok(
    !/disponibilidad/.test(seg[1]),
    "la disponibilidad volvió adentro de `segunda`, que es una sola línea con " +
      "puntos suspensivos: ahí el aviso no se lee y se vende un espacio ocupado",
  );
});

prueba("el aviso se dibuja como elemento propio y se anuncia", () => {
  assert.match(codigoVender, /className="choque"/, "no se dibuja el aviso de choque");
  assert.match(codigoVender, /role="alert"/, "el aviso de choque no se anuncia a un lector de pantalla");
});

prueba("el aviso puede crecer: no hereda el corte de los dos renglones", () => {
  const regla = css.match(/\.eitem \.d > span\.choque \{([\s\S]*?)\}/);
  assert.ok(regla, "falta la regla de `.choque` en vender.css");
  assert.match(regla[1], /white-space:\s*normal/, "`.choque` sigue en una sola línea");
  assert.match(regla[1], /var\(--danger\)/, "`.choque` no usa el color de peligro del sistema");
});

prueba("un espacio en choque impide guardar", () => {
  assert.match(
    codigoContrato, /chocan\.length === 0/,
    "`puedeGuardar` dejó de mirar los choques: el botón vuelve a habilitarse " +
      "con un espacio ya vendido y el servidor es el único que se entera",
  );
  assert.match(codigoContrato, /chocan\.length > 0/, "`falta` no nombra el choque");
});

prueba("el bloqueo NO cuelga sólo del plano, que puede estar desfasado", () => {
  // El caso reproducido: la base con contrato y el layout pintándolo libre.
  // Si `chocan` sólo mirara `disponibilidad`, no frenaría nada justo ahí.
  const m = codigoContrato.match(/const chocan = lineas\.filter\(([\s\S]*?)\);/);
  assert.ok(m, "no se encontró `chocan`");
  assert.match(m[1], /veredicto\[/, "`chocan` no consulta el veredicto del servidor");
  assert.match(m[1], /disponibilidad !== "libre"/, "`chocan` dejó de mirar también el plano");
});

prueba("se le pregunta al endpoint que NO escribe", () => {
  assert.match(codigoContrato, /validarLote\(/, "no se consulta `/leases/bulk/validar`");
  assert.ok(
    !/confirmarLote\([\s\S]{0,200}veredicto/.test(codigoContrato),
    "la comprobación previa no puede pasar por `confirmarLote`: eso ESCRIBE",
  );
});

prueba("una respuesta vieja no pisa a una nueva", () => {
  // Las fechas se teclean dígito a dígito: sin esto, la respuesta de una fecha
  // a medio escribir puede llegar después y dejar un veredicto que no
  // corresponde a lo que está en pantalla.
  assert.match(
    codigoContrato, /if \(mio !== pedido\.current\) return/,
    "no se descartan las respuestas fuera de orden de la validación",
  );
});

console.log(`\n${hechas} pruebas del panel de contrato`);
