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
 * Y hay un agravante que decide el diseño: **el plano no alcanza.** Esto nació
 * cuando el plano era otra verdad —el JSON del layout guardaba el contrato, una
 * copia que mantenía al día el navegador que vendía— y decía «libre» donde la
 * base decía «ocupado»: reproducido acá, contrato del 8 de septiembre al 8 de
 * octubre en la base y el mueble pintado libre, con `data-est="libre"`.
 *
 * Esa mitad se cerró de raíz: lo comercial vive sólo en la base y el plano se
 * pinta de ahí. Pero el bloqueo sigue sin poder colgar del plano, y ahora por
 * una razón que no se va a ir: **el mapa dice el HOY y el contrato es un
 * RANGO.** Un mueble libre hoy puede estar comprometido en diciembre, y el
 * mapa no tiene cómo saberlo. Por eso se le pregunta a `/leases/bulk/validar`,
 * que corre el mismo control que el guardado y no escribe nada.
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

prueba("el total que viaja al aviso de guardado se suma con el mismo criterio", () => {
  // Si estos dos se separan, el «guardado» contradice a la ficha que se firmó.
  // Los dos suman `l.monto` —lo acordado, sin prorratear—; el del aviso sólo
  // sobre las líneas que el servidor aceptó, que es lo que se guardó de verdad.
  assert.match(
    codigoContrato,
    /const total = lineas\.reduce\(\(t, l\) => t \+ l\.monto, 0\)/,
    "la pantalla dejó de sumar `l.monto`",
  );
  assert.match(
    codigoContrato,
    /guardados\.push\(l\.visible\);\s*\n\s*total \+= l\.monto;/,
    "el total del aviso ya no se suma línea por línea sobre lo guardado",
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
  assert.match(codigoVender, /className="aviso choque" role="alert"/, "no se dibuja el aviso de choque, o no se anuncia a un lector de pantalla");
});

prueba("el aviso puede crecer, y a todo el ancho: no hereda el corte de los dos renglones", () => {
  // Va DEBAJO de la fila (hijo de `.eitem`, que es flex con `wrap`) y no en
  // la columna del tipo: ahí, angosta, salía una palabra por renglón.
  const regla = css.match(/\.eitem > \.aviso \{([\s\S]*?)\}/);
  assert.ok(regla, "falta la regla de `.aviso` en vender.css");
  assert.match(regla[1], /flex:\s*0 0 100%/, "el aviso no ocupa todo el ancho de la fila");
  assert.match(regla[1], /white-space:\s*normal/, "el aviso sigue en una sola línea");
  assert.match(css, /\.eitem \{ flex-wrap: wrap;/, "la fila no deja bajar el aviso a su propio renglón");
  assert.match(css, /\.eitem > \.aviso\.choque \{ color: var\(--danger\); \}/, "el choque no usa el color de peligro del sistema");
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

/* ── 3 · lo que se rellena, no se cree ───────────────────────────────────────

   La validación en vivo pregunta por LAS FECHAS. Para llegar a esa respuesta
   manda un proveedor de relleno cuando está vacío, porque si no la fila se cae
   por un campo obligatorio y nunca se entera de las fechas.

   El valor iba de verdad, y la firma del efecto no lo mira. O sea: la primera
   validación salía con el campo en cero, el servidor contestaba «Falta el valor
   mensual, o quedó en cero», y ESO QUEDABA GUARDADO — tipear el valor después
   no volvía a preguntar. Y como `chocan` cuenta cualquier mensaje del servidor
   como choque, el espacio quedaba marcado «ya está vendido en esas fechas» y no
   se podía guardar NUNCA. Reportado con PUN-15 en $1.000.000 en pantalla. */

prueba("el valor que se manda a validar no puede ser cero", () => {
  const m = codigoContrato.match(/validarLote\(([\s\S]*?)\n\s*\)\.then/);
  assert.ok(m, "no se encontró la llamada a `validarLote`");
  assert.match(
    m[1], /valor:\s*l\.monto\s*>\s*0\s*\?\s*l\.monto\s*:/,
    "el valor viaja tal cual: con el campo vacío el servidor contesta «falta el "
    + "valor» y ese mensaje se queda pegado, porque la firma no mira el monto",
  );
});

prueba("no se le cree al servidor sobre los campos que se le rellenaron", () => {
  // La contracara obligatoria del relleno. Sin esto el mensaje sobre un campo
  // inventado se trata como si fuera sobre las fechas.
  assert.match(
    codigoContrato, /RELLENADO\s*=\s*\/\^\(/,
    "no hay una lista de los mensajes que hablan de los campos rellenados",
  );
  const filtro = codigoContrato.match(/const RELLENADO = (\/[^\n]*\/i?)/);
  assert.ok(filtro, "no se encontró la definición de RELLENADO");
  const re = new RegExp(filtro[1].slice(1, filtro[1].lastIndexOf("/")), "i");
  for (const msg of [
    "Falta el valor mensual, o quedó en cero.",
    "Falta el proveedor.",
    "Proveedor nuevo: se va a crear.",
  ]) {
    assert.ok(re.test(msg), `«${msg}» habla de un campo rellenado y no se filtra`);
  }
  // Y lo que SÍ se preguntó tiene que pasar.
  for (const msg of [
    "«CIUDAD JARDIN-IMP-17» ya tiene un contrato del 2026-09-08 al 2026-10-08.",
    "Faltan las fechas, o no se entendieron.",
  ]) {
    assert.ok(!re.test(msg), `«${msg}» es sobre las fechas y se estaría descartando`);
  }
});

prueba("el filtro se aplica donde se arma el veredicto", () => {
  assert.match(
    codigoContrato, /mensajes\s*\?\?\s*\[\]\)\.filter\(\(m\) => !RELLENADO\.test\(m\)\)/,
    "el veredicto no filtra los mensajes de los campos rellenados",
  );
});

/* ── 4 · se puede soltar el contrato que sólo tiene la base ──────────────────

   El otro lado del mismo desfase. El servidor rechaza la venta nombrando un
   contrato («IMP-17 ya tiene un contrato del 2026-09-08 al 2026-10-08.
   Cancelalo primero») y el botón para cancelarlo colgaba de `hasContract`, que
   sale del JSON del layout. En el caso que hay que resolver el layout dice que
   está libre — así que el botón desaparecía justo cuando hacía falta, y
   «cancelalo primero» volvía a señalar algo que la aplicación no permitía.

   `CancelarContrato` le pregunta a la base y se dibuja solo si hay algo que
   soltar: la condición correcta la tiene él. */

const tablero = leer(join("src", "pages", "DashboardView.tsx"));
const cancelar = leer(join("src", "components", "Contrato", "CancelarContrato.tsx"));

prueba("cancelar NO cuelga del plano, que puede estar desfasado", () => {
  const m = sinComentarios(tablero).match(/\{[^{}]*onCancelado && \(\s*<CancelarContrato/);
  assert.ok(m, "no se encontró dónde se dibuja `CancelarContrato`");
  assert.ok(
    !/hasContract/.test(m[0]),
    "el botón de cancelar vuelve a colgar de `hasContract`: con la base "
    + "ocupada y el plano libre desaparece justo cuando hace falta",
  );
});

prueba("el contrato que el plano no tiene se NOMBRA antes de ofrecer borrarlo", () => {
  // Un botón de borrar sobre algo que la ficha de arriba jura que no existe es
  // peor que no tenerlo: hay que decir qué encontró la base.
  assert.match(
    cancelar, /segunElPlano/,
    "`CancelarContrato` no sabe si el plano muestra el contrato",
  );
  const c = sinComentarios(cancelar);
  assert.match(c, /start_date/, "no se nombran las fechas del contrato encontrado");
  assert.match(c, /supplier\?\.name/, "no se nombra el proveedor del contrato encontrado");
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
