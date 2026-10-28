/**
 * Pruebas de QUÉ ES ESPACIO VENDIBLE.
 *   npm run probar:comercializable
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Hay muebles que están en el plano y no se venden nunca: la columna sostiene
 * el techo, y la caja registradora y el mostrador de servicio al cliente son
 * puestos de trabajo de la tienda. Ahí se cobra y se atienden reclamos; no se
 * exhibe la marca de un proveedor.
 *
 * Eso ya estaba escrito, y aun así no se cumplía, por dos motivos distintos:
 *
 *   · **La regla miraba sólo la bandera `rentable`.** La bandera se estampa al
 *     CREAR el mueble, y `rentable` ausente significa alquilable —tiene que
 *     significar eso, o los planos guardados antes de que la bandera existiera
 *     se vaciarían—. O sea que TODAS las cajas de los planos viejos seguían
 *     contando como espacio vendible y aceptaban un contrato. Ahora la regla
 *     pregunta primero por el TIPO, y esos planos quedan bien sin migrar nada.
 *   · **La tabla de tarifas ofrecía «Cabecera de caja».** Un precio publicado
 *     para algo que no está a la venta.
 *
 * Y hay un tercer motivo por el que esto se prueba y no se confía: **la regla
 * vive en dos idiomas.** El frontend decide qué se DIBUJA como vendible y el
 * backend decide qué se PUEDE GUARDAR. Si las dos listas se separan, la
 * pantalla ofrece lo que el servidor rechaza — o peor, al revés.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const repo = join(raiz, "..");
const leer = (p) => readFileSync(p, "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

// `types/fixtures.ts` son funciones y constantes puras: se compilan y se corren.
const { build } = await import("esbuild");
const compilado = await build({
  entryPoints: [join(raiz, "src", "types", "fixtures.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral",
});
const F = await import(
  "data:text/javascript;base64," +
  Buffer.from(compilado.outputFiles[0].text).toString("base64")
);

prueba("un puesto de trabajo de la tienda NO es espacio vendible", () => {
  for (const type of ["columna", "checkout", "servicio_cliente"]) {
    assert.equal(F.isRentable({ type }), false, `\`${type}\` se vende`);
  }
});

prueba("un plano viejo, sin la bandera, tampoco vende las cajas", () => {
  // El defecto real: la bandera se estampa al crear el mueble, así que una
  // caja guardada antes de que existiera no la tiene — y ausente significa
  // alquilable. Todas las cajas de los planos viejos aceptaban contrato.
  assert.equal(F.isRentable({ type: "checkout" }), false, "la caja sin bandera vuelve a venderse");
  assert.equal(
    F.isRentable({ type: "servicio_cliente" }), false,
    "el mostrador de servicio sin bandera vuelve a venderse",
  );
});

prueba("la bandera no puede dar vuelta lo que decide el tipo", () => {
  // Si el tipo no mandara, el par de botones «Comercializable» del panel
  // pondría a la venta una caja registradora.
  for (const type of ["columna", "checkout", "servicio_cliente"]) {
    assert.equal(
      F.isRentable({ type, rentable: true }), false,
      `\`${type}\` se puede poner a la venta con la bandera`,
    );
  }
});

prueba("lo que SÍ se vende sigue vendiéndose", () => {
  // La regla nueva no puede comerse el catálogo comercial: ése es el modo de
  // falla caro, porque vacía la disponibilidad de toda la sede en silencio.
  for (const type of [
    "gondola", "gondola_doble", "gondola_mural", "punta", "robatope", "ristra",
    "cross", "impulsador", "mueble", "isla", "batea", "isla_fria",
    "nevera_carnes", "nevera_vegetales", "nevera_refrescos", "stand_frutas",
  ]) {
    assert.equal(F.isRentable({ type }), true, `\`${type}\` dejó de ser vendible`);
  }
  // Y sin tipo —quien llame con un objeto parcial— manda la bandera, como antes.
  assert.equal(F.isRentable({}), true);
  assert.equal(F.isRentable({ rentable: false }), false);
});

prueba("la zona libre se puede dar vuelta a mano; el resto no", () => {
  // Un metro de piso SÍ se le alquila a una marca para que plante su stand,
  // así que nace no comercializable pero se puede habilitar.
  assert.ok(F.NON_RENTABLE_BY_DEFAULT.has("metro"), "la zona libre nace vendible");
  assert.equal(F.isRentable({ type: "metro" }), true, "la zona libre no se puede habilitar");
  assert.equal(F.isRentable({ type: "metro", rentable: false }), false);
  // Y los que nunca se venden nacen con la bandera puesta, para que el dato
  // guardado diga lo mismo que la regla.
  for (const type of F.NUNCA_ALQUILABLE) {
    assert.ok(F.NON_RENTABLE_BY_DEFAULT.has(type), `\`${type}\` nace sin la bandera`);
  }
});

prueba("no se publica tarifa de lo que no se vende", () => {
  // Estaba listada «Cabecera de caja»: un precio publicado para algo que no
  // está a la venta.
  for (const t of F.RATE_TYPES) {
    assert.ok(
      !F.NUNCA_ALQUILABLE.has(t.type),
      `la tabla de tarifas volvió a ofrecer \`${t.type}\``,
    );
  }
  assert.ok(F.RATE_TYPES.some((t) => t.type === "metro"), "se perdió la tarifa de la zona libre");
  assert.ok(F.RATE_TYPES.some((t) => t.type === "gondola"), "se perdió la tarifa de la góndola");
});

prueba("el frontend y el backend dicen lo MISMO", () => {
  // La pantalla decide qué se dibuja como vendible; el servidor decide qué se
  // puede guardar. Separadas, la pantalla ofrece lo que el servidor rechaza.
  //
  // Las dos listas salen del catálogo de muebles, cada lado de su copia
  // (`frontend/src/catalogo/muebles.json` y `backend/app/catalogo/muebles.json`,
  // idénticas: lo exigen `probar-catalogo.mjs` y `test_catalogo_muebles.py`).
  // Acá se lee la copia del SERVIDOR y se la compara con lo que corre la
  // pantalla, y se mira que el servidor tome su lista de ahí y no de una propia.
  const py = leer(join(repo, "backend", "app", "services", "layout_lookup.py"));
  const catalogo = JSON.parse(leer(join(repo, "backend", "app", "catalogo", "muebles.json")));
  const backend = new Set(
    Object.entries(catalogo.tipos).filter(([, d]) => d.alquilable === "nunca").map(([t]) => t),
  );
  const frontend = new Set(F.NUNCA_ALQUILABLE);
  assert.deepEqual(
    [...backend].sort(), [...frontend].sort(),
    "las dos listas se separaron: la pantalla y el servidor no venden lo mismo",
  );
  assert.match(py, /^NUNCA_ALQUILABLE[^=\n]*=\s*catalogo_muebles\.NUNCA_ALQUILABLE$/m,
    "layout_lookup.py no toma `NUNCA_ALQUILABLE` del catálogo de muebles: volvió a tener su propia lista");
  const servicio = leer(join(repo, "backend", "app", "services", "catalogo_muebles.py"));
  assert.match(servicio, /NUNCA_ALQUILABLE[^=]*=\s*frozenset\(\s*tipo for tipo, d in TIPOS\.items\(\) if d\["alquilable"\] == "nunca"/,
    "catalogo_muebles.py no calcula `NUNCA_ALQUILABLE` de `alquilable: \"nunca\"`");
  // Y el backend pregunta por el tipo antes que por la bandera.
  assert.match(py, /def es_comercializable/, "el backend perdió la regla unificada");
  assert.match(
    py, /if str\(fixture\.get\("type"\)[^)]*\) in NUNCA_ALQUILABLE:/,
    "el backend volvió a mirar sólo la bandera",
  );
  // Los tres portones del servidor usan la misma función y no una copia. La
  // planilla y Vender pasan por la COMPUERTA de la venta por partes
  // (`motivo_para_no_vender_parte`), que pregunta `es_comercializable` antes
  // que nada: un mueble no comercializable no vende ni su cara ni sus partes.
  assert.match(py, /def motivo_para_no_vender_parte[\s\S]*?\n    if not es_comercializable\(fixture\):/,
    "la compuerta de la venta por partes dejó de preguntar `es_comercializable`");
  for (const [archivo, ruta, regla] of [
    ["bulk_leases", join(repo, "backend", "app", "routers", "bulk_leases.py"), /motivo_para_no_vender_parte\(fixture, /],
    ["plataforma_metricas", join(repo, "backend", "app", "plataforma_metricas.py"), /es_comercializable\(/],
  ]) {
    const t = leer(ruta);
    assert.match(t, regla, `\`${archivo}\` volvió a tener su propia copia de la regla`);
    assert.ok(
      !/rentable"\)\s+is\s+(not\s+)?False/.test(t),
      `\`${archivo}\` volvió a leer la bandera a mano`,
    );
  }
});

prueba("el panel no ofrece un botón que la regla ignora", () => {
  // Un par de botones «Comercializable / No comercial» sobre una caja sería un
  // control muerto: se pinta el elegido y `isRentable` lo sigue negando.
  //
  // Se mide DÓNDE está la condición, no que el nombre aparezca en el archivo.
  // La primera versión de esta prueba buscaba `NUNCA_ALQUILABLE.has(` en todo
  // el texto, y una mutación que desarmaba la condición del botón pasaba en
  // verde: el nombre seguía estando más abajo, en el párrafo que explica por
  // qué el mueble no se alquila.
  // Desde 2026-10-28 el 3D es para mirar: el destino se cambia sólo en el
  // plano 2D, y el 3D no ofrece ningún botón que lo escriba.
  const ed3D = leer(join(raiz, "src/components/StoreEditor3D/StoreEditor3D.tsx"));
  assert.ok(!/rentable:\s*(value|!rentable|true|false)/.test(ed3D), "el editor 3D volvió a escribir el destino del mueble");
  for (const [nombre, ruta, boton] of [
    // Rediseño, PR 3: «Se vende» es un interruptor (el destino del mueble).
    ["el plano 2D", join(raiz, "src/components/FloorPlan2D/FloorPlan2D.tsx"), "onUpdate({ rentable: !rentable })"],
  ]) {
    const t = leer(ruta);
    const label = t.indexOf("Destino del mueble");
    assert.ok(label > 0, `${nombre} perdió el campo «Destino del mueble»`);
    const click = t.indexOf(boton, label);
    assert.ok(click > 0, `${nombre} perdió el botón de destino`);
    assert.match(
      t.slice(label, click),
      /NUNCA_ALQUILABLE\.has\(/,
      `${nombre} ofrece el botón sin preguntar por el tipo: es un control muerto`,
    );
  }
});

console.log(`\n${hechas} pruebas de espacio vendible`);
