/**
 * Pruebas de src/utils/convertirPlano.ts — del store a cada editor y de vuelta,
 * sin perder nada.
 *   npm run probar:plano
 *
 * Las dos vueltas al store armaban el mueble desde cero con una lista fija de
 * campos, y lo que no estaba en la lista se borraba la primera vez que alguien
 * movía el mueble: mover una góndola en el plano 2D borraba la vista 3D que se
 * había guardado para mostrársela al proveedor, y el 3D perdía el montaje de la
 * cara A. Cualquier campo nuevo del mueble —la ficha de la que nació, sus
 * puertas o tramos— habría corrido la misma suerte.
 *
 * Lo que fijan estas pruebas:
 *
 *  · Lo que el editor no conoce SOBREVIVE a la vuelta, en el 2D y en el 3D.
 *  · Lo que el editor sabe MANDA, también cuando vale `undefined`.
 *  · Todo lo demás sale IGUAL que antes. Para eso se compara contra `ANTES`,
 *    las cuatro funciones tal como estaban en `main` (3498561) adentro de
 *    `FloorPlan2D.tsx` y `StoreEditor3D.tsx`, con el catálogo pasado por
 *    parámetro: la salida nueva tiene que ser la vieja más las claves que la
 *    vieja tiraba, y ninguna otra diferencia.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "plano-")), "p.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "convertirPlano.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const P = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

// ─── El catálogo de juguete ──────────────────────────────────────────────────
// A la conversión no le importan los valores, sólo de dónde los saca.

const CAT2D = {
  tipos: [
    { type: "gondola_doble", label: "Góndola Doble" },
    { type: "gondola_mural", label: "Góndola Mural" },
    { type: "punta", label: "Punta Góndola" },
    { type: "checkout", label: "Checkout / Caja" },
    { type: "nevera_refrescos", label: "Nevera Refrescos" },
  ],
  altos: { gondola_doble: 1.8, gondola_mural: 1.9, punta: 1.8, checkout: 0.9, exhibicion: 1.5 },
  colores: { gondola_doble: "#6366f1", gondola_mural: "#818cf8", punta: "#7c3aed" },
};

const CAT3D = {
  defs: [
    { type: "gondola", gondolaType: "double", label: "Góndola Doble", color: "#6366f1" },
    { type: "gondola", gondolaType: "wall", label: "Góndola Mural", color: "#818cf8" },
    { type: "punta", label: "Punta Góndola", color: "#7c3aed" },
    { type: "nevera_refrescos", label: "Nevera Refrescos", color: "#1e293b" },
  ],
  slotsPorDefecto: ({ type, code }) =>
    type === "gondola" || type === "punta" ? [{ id: `${code}-S01`, x: 0, y: 0, w: 1, h: 1, status: "free" }] : [],
};

// ─── ANTES: las cuatro funciones como estaban en main ────────────────────────
// Copiadas de `FloorPlan2D.tsx` (storeToItems, itemsToStore) y de
// `StoreEditor3D.tsx` (storeToFixtures, fixturesToStore) en 3498561, sin los
// tipos y con el catálogo por parámetro. Son la referencia de «lo demás sale
// igual»: no se tocan salvo que se quiera cambiar ese comportamiento a
// propósito.

const isRotated90 = (rotY) => {
  const r = ((rotY % Math.PI) + Math.PI) % Math.PI;
  return Math.abs(r - Math.PI / 2) < 0.15;
};

const ANTES = {
  storeToItems(fixtures, cat) {
    return fixtures.map((f) => {
      let type2D;
      if (f.type === "gondola") type2D = f.gondolaType === "wall" ? "gondola_mural" : "gondola_doble";
      else type2D = f.type;
      const catDef = cat.tipos.find((c) => c.type === type2D);
      const rot90 = isRotated90(f.rotY ?? 0);
      const w2d = rot90 ? f.d : f.w;
      const h2d = rot90 ? f.w : f.d;
      return {
        id: f.id, type: type2D, code: f.code, label: catDef?.label ?? f.label,
        x: f.cx - w2d / 2, y: f.cz - h2d / 2, w: w2d, h: h2d, rotY: f.rotY ?? 0,
        status: f.status, supplierName: f.supplierName, brandCategory: f.brandCategory,
        negotiatedValue: f.negotiatedValue ?? 0, startDate: f.startDate, endDate: f.endDate,
        observation: f.observation, sede: f.sede, nomenclatura: f.nomenclatura,
        nombreAnterior: f.nombreAnterior, faceB: f.faceB, rentable: f.rentable,
      };
    });
  },
  itemsToStore(items, existingStore, cat) {
    const existingMap = new Map(existingStore.map((f) => [f.id, f]));
    return items.map((item) => {
      let type, gondolaType;
      if (item.type === "gondola_doble") { type = "gondola"; gondolaType = "double"; }
      else if (item.type === "gondola_mural") { type = "gondola"; gondolaType = "wall"; }
      else type = item.type;
      const existing = existingMap.get(item.id);
      const rotY = item.rotY ?? existing?.rotY ?? 0;
      const rot90 = isRotated90(rotY);
      const storeW = rot90 ? item.h : item.w;
      const storeD = rot90 ? item.w : item.h;
      return {
        h: existing?.h ?? cat.altos[item.type] ?? 1.8,
        color: existing?.color ?? cat.colores[item.type] ?? "#6366f1",
        slots: existing?.slots, rotY, id: item.id, code: item.code, type, gondolaType,
        label: item.label, cx: item.x + item.w / 2, cz: item.y + item.h / 2, w: storeW, d: storeD,
        status: item.status, sede: item.sede, supplierName: item.supplierName,
        brandCategory: item.brandCategory, negotiatedValue: item.negotiatedValue,
        startDate: item.startDate, endDate: item.endDate, observation: item.observation,
        nomenclatura: item.nomenclatura, nombreAnterior: item.nombreAnterior,
        faceB: item.faceB, rentable: item.rentable,
      };
    });
  },
  storeToFixtures(unifiedList, cat) {
    return unifiedList.filter((f) => f.type !== "exhibicion").map((f) => {
      const type = f.type;
      const def = cat.defs.find((d) => d.type === type && (!f.gondolaType || d.gondolaType === f.gondolaType));
      return {
        id: f.id, code: f.code, type, gondolaType: f.gondolaType,
        slots: f.slots ?? cat.slotsPorDefecto({ type, w: f.w, h: f.h, code: f.code }),
        x: f.cx, z: f.cz, rotY: f.rotY, w: f.w, d: f.d, h: f.h,
        label: f.label || def?.label || type, color: f.color || def?.color || "#6366f1",
        supplierName: f.supplierName, brandCategory: f.brandCategory, status: f.status,
        negotiatedValue: f.negotiatedValue, startDate: f.startDate, endDate: f.endDate,
        observation: f.observation, rentable: f.rentable,
      };
    });
  },
  fixturesToStore(fixtures, sede, existingStore) {
    const exhibicion = existingStore.filter((f) => f.type === "exhibicion");
    const existingMap = new Map(existingStore.map((f) => [f.id, f]));
    const updated = fixtures.map((f) => {
      const existing = existingMap.get(f.id);
      return {
        id: f.id, code: f.code, type: f.type, gondolaType: f.gondolaType, label: f.label,
        cx: f.x, cz: f.z, rotY: f.rotY, w: f.w, d: f.d, h: f.h, color: f.color, status: f.status,
        sede, supplierName: f.supplierName, brandCategory: f.brandCategory,
        negotiatedValue: f.negotiatedValue, startDate: f.startDate, endDate: f.endDate,
        observation: f.observation, slots: f.slots, rentable: f.rentable,
        nomenclatura: existing?.nomenclatura, nombreAnterior: existing?.nombreAnterior,
        faceB: existing?.faceB, vista3D: existing?.vista3D,
      };
    });
    return [...exhibicion, ...updated];
  },
};

// ─── Un plano con de todo ────────────────────────────────────────────────────

const libre = { status: "free", supplierName: "", brandCategory: "", negotiatedValue: 0, startDate: "", endDate: "", observation: "" };
const VISTA = { A: { pos: [1, 1.6, 4], target: [1, 1, 0] }, B: { pos: [1, 1.6, -4], target: [1, 1, 0] } };
/** Lo que ningún editor modela hoy: tiene que volver tal cual. */
const AJENO = {
  vista3D: VISTA,
  mountedAt: "2026-09-02T15:00:00Z",
  mountedBy: "Yenny",
  claveDelFuturo: { partes: { puertas: 3 }, modelo: "base:nevera-3p" },
};
const AJENAS = Object.keys(AJENO);

const plano = () => [
  { id: "g1", code: "GON-01", type: "gondola", gondolaType: "double", label: "Góndola Doble",
    cx: 4, cz: 2, rotY: Math.PI / 2, w: 3.6, d: 0.9, h: 1.8, color: "#6366f1", sede: "NAVE",
    ...libre, status: "occupied", supplierName: "Alpina", negotiatedValue: 900_000,
    slots: [{ id: "GON-01-S01", x: 0, y: 0, w: 0.5, h: 0.25, status: "free" }],
    faceB: { ...libre, mountedAt: "2026-09-03T10:00:00Z" },
    nomenclatura: "G-1", nombreAnterior: "GON-09", ...AJENO },
  // Una góndola vieja: sin `gondolaType`, con rótulo propio.
  { id: "g2", code: "GON-02", type: "gondola", label: "Mi góndola", cx: 8, cz: 2, rotY: 0,
    w: 2.4, d: 0.9, h: 2.0, color: "#123456", sede: "NAVE", ...libre, ...AJENO },
  { id: "g3", code: "GON-03", type: "gondola", gondolaType: "wall", label: "Góndola Mural",
    cx: 1, cz: 9, rotY: Math.PI, w: 2, d: 0.4, h: 1.9, color: "#818cf8", sede: "NAVE", ...libre },
  { id: "p1", code: "PUN-01", type: "punta", label: "", cx: 6, cz: 5, rotY: 3 * Math.PI / 2,
    w: 0.9, d: 0.4, h: 1.8, color: "", sede: "NAVE", ...libre, rentable: false, mountedAt: "2026-09-04T00:00:00Z" },
  // El mercaderista: el servidor no le manda la plata.
  { id: "n1", code: "BEB-01", type: "nevera_refrescos", label: "Nevera Refrescos", cx: 12, cz: 1,
    rotY: 0, w: 1.2, d: 0.75, h: 1.8, color: "#1e293b", sede: "NAVE",
    status: "free", supplierName: "", brandCategory: "", startDate: "", endDate: "", observation: "",
    ...AJENO },
  { id: "c1", code: "CAJ-01", type: "checkout", label: "Checkout / Caja", cx: 2, cz: 14, rotY: 0,
    w: 1.8, d: 0.7, h: 0.9, color: "#8b5cf6", sede: "NAVE", ...libre, rentable: false },
  // Legado del 2D: el 3D no la dibuja y no la puede perder.
  { id: "x1", code: "EXH-01", type: "exhibicion", label: "Exhibición", cx: 15, cz: 15, rotY: 0,
    w: 1, d: 1, h: 1.5, color: "#ec4899", sede: "NAVE", ...libre, ...AJENO },
];

const copia = (x) => structuredClone(x);
const sinIndefinidos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** La vuelta nueva tiene que ser la vieja MÁS lo que la vieja tiraba del guardado. */
const esLaViejaMasLoAjeno = (nueva, vieja, guardado, donde) => {
  const tiradas = guardado
    ? Object.fromEntries(Object.entries(guardado).filter(([k, v]) => !(k in vieja) && v !== undefined))
    : {};
  assert.deepEqual(sinIndefinidos(nueva), { ...tiradas, ...sinIndefinidos(vieja) }, donde);
};

/**
 * Lo que hace la gente en el 2D: mover, girar, un mueble nuevo, volver a
 * habilitar uno y deshabilitar otro, y —para que ningún campo que el 2D
 * escribe pueda perderse sin que se note— cambiar TODOS los demás que sabe.
 *
 * La comparación «lo de antes, más lo que se tiraba» sólo ve un campo que la
 * vuelta dejó de escribir si el editor le puso un valor DISTINTO del guardado:
 * si no, lo guardado asoma por debajo con el mismo valor y la prueba pasa. Así
 * se pudo borrar `rentable` de la vuelta sin que nada fallara, y una punta que
 * la dueña volvía a habilitar regresaba «No comercializable» al guardar.
 */
const editar2D = (items) => {
  const out = copia(items);
  const g1 = out.find((i) => i.id === "g1"); g1.x += 1.5; g1.y -= 0.25;
  Object.assign(g1, {
    code: "GON-11", label: "Góndola del pasillo", status: "reserved", supplierName: "Colanta",
    brandCategory: "Lácteos", negotiatedValue: 1_000_000, startDate: "2026-10-01",
    endDate: "2026-12-31", observation: "cara A editada",
    faceB: { ...g1.faceB, observation: "cara B editada" },
  });
  const n1 = out.find((i) => i.id === "n1"); n1.rotY += Math.PI / 2; [n1.w, n1.h] = [n1.h, n1.w];
  // Deshabilitar y volver a habilitar, como el panel del 2D: `rentable ? undefined : false`.
  n1.rentable = false;
  out.find((i) => i.id === "p1").rentable = undefined;
  out.push({ id: "punta-nueva", type: "punta", code: "PUN-02", label: "Punta Góndola", x: 3, y: 3,
    w: 0.9, h: 0.4, rotY: 0, ...libre, sede: "NAVE" });
  return out;
};

/** Lo mismo en el 3D, con todo lo que el 3D escribe: medidas, rótulo, color,
 *  tipo de góndola, repisas y la bandera, que el panel pone en `true`. */
const editar3D = (fixtures) => {
  const out = copia(fixtures);
  const g2 = out.find((f) => f.id === "g2"); g2.x += 2; g2.z += 0.5;
  const p1 = out.find((f) => f.id === "p1"); p1.rotY = 0; p1.rentable = true;
  Object.assign(out.find((f) => f.id === "n1"), { h: 2.0, w: 1.5, d: 0.8, label: "Nevera de la entrada", color: "#334155" });
  out.find((f) => f.id === "g3").gondolaType = "double";
  const g1 = out.find((f) => f.id === "g1");
  Object.assign(g1, {
    code: "GON-11", status: "reserved", supplierName: "Colanta", brandCategory: "Lácteos",
    negotiatedValue: 1_000_000, startDate: "2026-10-01", endDate: "2026-12-31", observation: "editada",
    slots: g1.slots.map((s) => ({ ...s, status: "occupied", supplierName: "Alpina" })),
  });
  out.find((f) => f.id === "c1").rentable = undefined;
  out.push({ id: "gondola-nueva", code: "GON-04", type: "gondola", gondolaType: "double",
    slots: [], x: 10, z: 10, rotY: 0, w: 0.9, d: 0.9, h: 1.8, label: "Góndola Doble",
    color: "#6366f1", ...libre });
  return out;
};

console.log("\nEl plano 2D\n");

prueba("del store al 2D sale IGUAL que antes (incluido el rótulo del catálogo)", () => {
  const g = plano();
  assert.deepEqual(P.storeToItems(g, CAT2D), ANTES.storeToItems(copia(g), CAT2D));
  // El 2D reescribe el rótulo con el de su catálogo: así era y así sigue.
  assert.equal(P.storeToItems(g, CAT2D).find((i) => i.id === "g2").label, "Góndola Doble");
});

prueba("MOVER UNA GÓNDOLA EN EL 2D NO BORRA LA VISTA 3D, el montaje ni lo desconocido", () => {
  const g = plano();
  const vuelta = P.itemsToStore(editar2D(P.storeToItems(g, CAT2D)), g, CAT2D);
  for (const id of ["g1", "g2", "n1"]) {
    const f = vuelta.find((x) => x.id === id);
    for (const k of AJENAS) assert.deepEqual(f[k], AJENO[k], `${id} perdió «${k}»`);
  }
  assert.equal(vuelta.find((x) => x.id === "p1").mountedAt, "2026-09-04T00:00:00Z", "la punta perdió su montaje");
  // Y lo movido, se movió.
  const g1 = vuelta.find((x) => x.id === "g1");
  assert.equal(g1.cx, g[0].cx + 1.5, "la góndola no quedó donde se la dejó");
  assert.equal(g1.cz, g[0].cz - 0.25, "la góndola no quedó donde se la dejó");
});

prueba("de vuelta al store: lo de antes, más lo que antes se tiraba, y nada más", () => {
  const g = plano();
  const items = editar2D(P.storeToItems(g, CAT2D));
  const nueva = P.itemsToStore(copia(items), g, CAT2D);
  const vieja = ANTES.itemsToStore(copia(items), copia(g), CAT2D);
  assert.equal(nueva.length, vieja.length);
  nueva.forEach((f, k) => esLaViejaMasLoAjeno(f, vieja[k], g.find((x) => x.id === f.id), f.id));
});

prueba("lo que el 2D sabe MANDA aunque valga undefined: no asoma lo guardado por debajo", () => {
  const g = plano();
  const items = P.storeToItems(g, CAT2D);
  const g1 = items.find((i) => i.id === "g1");
  // De doble a mural: la cara B se va, y el nombre viejo también.
  g1.type = "gondola_mural"; g1.faceB = undefined; g1.nomenclatura = undefined;
  const f = P.itemsToStore(items, g, CAT2D).find((x) => x.id === "g1");
  assert.equal(f.gondolaType, "wall");
  assert.equal(f.faceB, undefined, "volvió la cara B del guardado");
  assert.equal(f.nomenclatura, undefined, "volvió el nombre viejo del guardado");
  assert.deepEqual(f.vista3D, VISTA, "lo que el 2D no conoce igual se queda");
});

prueba("VOLVER A HABILITAR UN MUEBLE EN EL 2D no deja asomar el «No comercializable» guardado", () => {
  // El panel del 2D lo habilita con `rentable: undefined` (ausente es
  // comercializable). Si la vuelta no escribe la bandera, el `false` guardado
  // asoma por debajo y el mueble vuelve a «No comercializable» al guardar.
  const g = plano();
  const items = P.storeToItems(g, CAT2D);
  items.find((i) => i.id === "p1").rentable = undefined;
  items.find((i) => i.id === "n1").rentable = false;
  const vuelta = P.itemsToStore(items, g, CAT2D);
  assert.equal(vuelta.find((x) => x.id === "p1").rentable, undefined, "la punta habilitada volvió a no comercializable");
  assert.equal(vuelta.find((x) => x.id === "n1").rentable, false, "la nevera deshabilitada quedó comercializable");
});

prueba("un mueble nuevo nace con el alto y el color del catálogo, sin nada ajeno", () => {
  const g = plano();
  const nuevo = P.itemsToStore(editar2D(P.storeToItems(g, CAT2D)), g, CAT2D).find((x) => x.id === "punta-nueva");
  assert.equal(nuevo.h, 1.8);
  assert.equal(nuevo.color, "#7c3aed");
  for (const k of AJENAS) assert.equal(nuevo[k], undefined, `el mueble nuevo trae «${k}» de otro`);
});

console.log("\nEl editor 3D\n");

prueba("del store al 3D sale IGUAL que antes", () => {
  const g = plano();
  assert.deepEqual(P.storeToFixtures(g, CAT3D), ANTES.storeToFixtures(copia(g), CAT3D));
});

prueba("MOVER EN EL 3D NO BORRA EL MONTAJE DE LA CARA A ni lo desconocido", () => {
  const g = plano();
  const vuelta = P.fixturesToStore(editar3D(P.storeToFixtures(g, CAT3D)), "NAVE", g);
  for (const id of ["g1", "g2", "n1", "x1"]) {
    const f = vuelta.find((x) => x.id === id);
    for (const k of AJENAS) assert.deepEqual(f[k], AJENO[k], `${id} perdió «${k}»`);
  }
  assert.equal(vuelta.find((x) => x.id === "p1").mountedAt, "2026-09-04T00:00:00Z", "la punta perdió su montaje");
  assert.equal(vuelta.find((x) => x.id === "g2").cx, g[1].cx + 2, "la góndola no quedó donde se la dejó");
});

prueba("de vuelta al store: lo de antes, más lo que antes se tiraba, y nada más", () => {
  const g = plano();
  const placed = editar3D(P.storeToFixtures(g, CAT3D));
  const nueva = P.fixturesToStore(copia(placed), "NAVE", g);
  const vieja = ANTES.fixturesToStore(copia(placed), "NAVE", copia(g));
  assert.equal(nueva.length, vieja.length);
  nueva.forEach((f, k) => esLaViejaMasLoAjeno(f, vieja[k], g.find((x) => x.id === f.id), f.id));
  // La exhibición, que el 3D no dibuja, vuelve primera y entera.
  assert.equal(nueva[0], g.find((x) => x.id === "x1"));
});

prueba("VOLVER A HABILITAR UN MUEBLE EN EL 3D no deja asomar el «No comercializable» guardado", () => {
  // El panel del 3D escribe la bandera tal cual (`u({ rentable: value })`).
  const g = plano();
  const placed = P.storeToFixtures(g, CAT3D);
  placed.find((f) => f.id === "p1").rentable = true;
  placed.find((f) => f.id === "n1").rentable = false;
  const vuelta = P.fixturesToStore(placed, "NAVE", g);
  assert.equal(vuelta.find((x) => x.id === "p1").rentable, true, "la punta habilitada volvió a no comercializable");
  assert.equal(vuelta.find((x) => x.id === "n1").rentable, false, "la nevera deshabilitada quedó comercializable");
});

prueba("un mueble nuevo del 3D no hereda nada de otro", () => {
  const g = plano();
  const nuevo = P.fixturesToStore(editar3D(P.storeToFixtures(g, CAT3D)), "NAVE", g)
    .find((x) => x.id === "gondola-nueva");
  for (const k of [...AJENAS, "faceB", "nomenclatura", "nombreAnterior"]) {
    assert.equal(nuevo[k], undefined, `el mueble nuevo trae «${k}» de otro`);
  }
  assert.equal(nuevo.sede, "NAVE");
});

console.log("\nLa ficha del modelo\n");

const FICHA = { modelo: "base:gondola-central-200-m100", entrepanos: 4, modulo: 1 };

prueba("la ficha la escribe sólo el mueble que NACE: ningún editor la reescribe", () => {
  // Un mueble guardado con su ficha: la vuelta de cada editor la deja como
  // estaba aunque lo que traiga el editor diga otra cosa.
  const g = plano().map((f) => (f.id === "g2" ? { ...f, ...FICHA } : f));
  const placed = P.storeToFixtures(g, CAT3D);
  const g2 = placed.find((f) => f.id === "g2");
  assert.deepEqual([g2.modelo, g2.entrepanos, g2.modulo], [FICHA.modelo, 4, 1], "el 3D no recibe la ficha para dibujarla");
  Object.assign(g2, { modelo: "base:otro", entrepanos: 2, modulo: 1.25, x: g2.x + 1 });
  const v3 = P.fixturesToStore(placed, "NAVE", g).find((f) => f.id === "g2");
  assert.deepEqual([v3.modelo, v3.entrepanos, v3.modulo], [FICHA.modelo, 4, 1], "el 3D reescribió la ficha de un mueble guardado");
  assert.equal(v3.cx, g[1].cx + 1, "lo que el 3D sí sabe no se escribió");
  const items = P.storeToItems(g, CAT2D);
  const i2 = items.find((i) => i.id === "g2");
  assert.deepEqual(i2.nace, { h: 2.0, color: "#123456", ...FICHA }, "el 2D no trae la ficha del mueble (el panel la nombra)");
  i2.nace = { ...i2.nace, modelo: "base:otro", h: 1.5 };
  const v2 = P.itemsToStore(items, g, CAT2D).find((f) => f.id === "g2");
  assert.deepEqual([v2.modelo, v2.h, v2.entrepanos], [FICHA.modelo, 2.0, 4], "el 2D reescribió la ficha de un mueble guardado");
  assert.ok(!("nace" in v2), "`nace` llegó al plano");
  // Los muebles sin ficha no la ganan en ninguna vuelta.
  for (const f of P.itemsToStore(items, g, CAT2D).concat(P.fixturesToStore(placed, "NAVE", g))) {
    if (f.id === "g2") continue;
    for (const k of ["modelo", "entrepanos", "modulo", "partes", "nace"]) assert.ok(!(k in f), `${f.id} ganó \`${k}\``);
  }
});

prueba("un mueble NUEVO nace con la ficha que trae del editor", () => {
  const g = plano();
  // El 3D: el que se colocó desde un modelo trae la ficha en el PlacedFixture.
  const placed = editar3D(P.storeToFixtures(g, CAT3D));
  Object.assign(placed.find((f) => f.id === "gondola-nueva"), FICHA, { partes: { puertas: 2 } });
  const n3 = P.fixturesToStore(placed, "NAVE", g).find((f) => f.id === "gondola-nueva");
  assert.deepEqual([n3.modelo, n3.entrepanos, n3.modulo, n3.partes], [FICHA.modelo, 4, 1, { puertas: 2 }]);
  // El 2D: el que se colocó desde un modelo trae `nace`.
  const items = editar2D(P.storeToItems(g, CAT2D));
  items.find((i) => i.id === "punta-nueva").nace = { h: 2.0, color: "#abcdef", modelo: "base:punta-070-200" };
  const n2 = P.itemsToStore(items, g, CAT2D).find((f) => f.id === "punta-nueva");
  assert.deepEqual([n2.modelo, n2.h, n2.color], ["base:punta-070-200", 2.0, "#abcdef"], "el 2D no estampó la ficha");
  assert.ok(!("nace" in n2), "`nace` llegó al plano");
});

console.log("\nDe un editor al otro\n");

prueba("2D → store → 3D → store → 2D → store: lo desconocido llega entero al final", () => {
  const g = plano();
  const tras2D = P.itemsToStore(editar2D(P.storeToItems(g, CAT2D)), g, CAT2D);
  const tras3D = P.fixturesToStore(editar3D(P.storeToFixtures(tras2D, CAT3D)), "NAVE", tras2D);
  const final = P.itemsToStore(P.storeToItems(tras3D, CAT2D), tras3D, CAT2D);
  for (const id of ["g1", "g2", "n1", "x1"]) {
    const f = final.find((x) => x.id === id);
    for (const k of AJENAS) assert.deepEqual(f[k], AJENO[k], `${id} perdió «${k}» en el camino`);
  }
  const g1 = final.find((x) => x.id === "g1");
  assert.equal(g1.faceB.mountedAt, "2026-09-03T10:00:00Z", "la cara B perdió su montaje");
  assert.equal(g1.nombreAnterior, "GON-09");
});

console.log(`\n${hechas} pruebas · el plano no pierde lo que no conoce\n`);
