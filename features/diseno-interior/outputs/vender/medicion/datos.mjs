/* Layout de prueba con la forma de NAVE: 106 muebles, 23 caras comercializables.
   Reproduce la historia de D contra el periodo por defecto de Vender
   (hoy → hoy+30): 15 libres · 5 se liberan adentro · 3 tomados. */
const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const mas = (n) => { const d = new Date(hoy); d.setDate(d.getDate()+n); return iso(d); };

let n = 0;
const F = [];
const push = (o) => { F.push({
  id: `f${++n}`, code: o.code ?? `AUX-${n}`, type: o.type, label: o.label ?? "",
  cx: o.cx, cz: o.cz, rotY: o.rotY ?? 0, w: o.w, d: o.d, h: o.h ?? 1.8,
  color: "#9aa5b1", status: o.status ?? "free", sede: "NAVE",
  supplierName: o.supplierName ?? "", brandCategory: "", negotiatedValue: o.valor ?? 0,
  startDate: o.startDate ?? "", endDate: o.endDate ?? "", observation: "",
  rentable: o.rentable ?? false,
  ...(o.gondolaType ? { gondolaType: o.gondolaType } : {}),
  ...(o.faceB ? { faceB: o.faceB } : {}),
}); };

const libre = { status: "free" };
const tomado = { status: "occupied", supplierName: "COCA COLA", valor: 900000, startDate: mas(-40), endDate: mas(120) };
const seLibera = (dias) => ({ status: "occupied", supplierName: "NUTRESA", valor: 800000, startDate: mas(-30), endDate: mas(dias) });

// ── 6 pasillos de góndola doble (30 muebles) ───────────────────────────────
for (let a = 0; a < 6; a++) {
  for (let k = 0; k < 5; k++) {
    push({ type: "gondola", gondolaType: "double", w: 3.0, d: 1.0, h: 1.9,
           cx: 5 + k * 3.2, cz: 3 + a * 2.6, code: `GMU-${a}${k}` });
  }
}
// tres de ellas SÍ se venden, por cara
const dobles = [
  { code: "GON-60", cx: 5, cz: 3, A: tomado, B: libre },
  { code: "GON-61", cx: 8.2, cz: 8.2, A: libre, B: libre },
  { code: "GON-67", cx: 11.4, cz: 13.4, A: libre, B: libre },
];
for (const g of dobles) {
  push({ type: "gondola", gondolaType: "double", rentable: true, w: 3.0, d: 1.0, h: 1.9,
         cx: g.cx, cz: g.cz + 1.3, code: g.code,
         ...g.A,
         faceB: { supplierName: g.B.supplierName ?? "", brandCategory: "", negotiatedValue: g.B.valor ?? 0,
                  startDate: g.B.startDate ?? "", endDate: g.B.endDate ?? "", observation: "",
                  status: g.B.status } });
}
// ── góndolas de pared (24) ─────────────────────────────────────────────────
for (let k = 0; k < 12; k++) push({ type: "gondola", gondolaType: "wall", w: 2.0, d: 0.5, cx: 3 + k * 2.1, cz: 0.6, code: `MUR-${k}` });
for (let k = 0; k < 12; k++) push({ type: "gondola", gondolaType: "wall", w: 0.5, d: 2.0, cx: 27.4, cz: 2 + k * 1.4, code: `MUD-${k}` });
// ── cajas (10) ─────────────────────────────────────────────────────────────
for (let k = 0; k < 10; k++) push({ type: "checkout", w: 1.8, d: 0.7, cx: 4 + k * 2.4, cz: 19.5, code: `CAJ-${k}` });
// ── columnas (8) ───────────────────────────────────────────────────────────
for (let k = 0; k < 8; k++) push({ type: "columna", w: 0.4, d: 0.4, h: 3, cx: 6 + (k % 4) * 6, cz: 5 + Math.floor(k / 4) * 9, code: `COL-${k}` });
// ── bateas y zonas sueltas (11) ────────────────────────────────────────────
for (let k = 0; k < 14; k++) push({ type: "batea", w: 1.2, d: 0.9, cx: 2.5, cz: 2 + k * 1.5, code: `BAT-${k}` });

// ── LOS 23 ESPACIOS COMERCIALIZABLES ───────────────────────────────────────
const V = (o) => push({ ...o, rentable: true });
V({ code: "ISL-03", type: "isla", w: 2.0, d: 1.2, cx: 22.0, cz: 4.0,  ...tomado });
V({ code: "ISL-04", type: "isla", w: 2.0, d: 1.2, cx: 22.0, cz: 7.0,  ...libre });
V({ code: "ISL-05", type: "isla", w: 2.0, d: 1.2, cx: 22.0, cz: 10.0, ...libre });
V({ code: "ISL-06", type: "isla", w: 2.0, d: 1.2, cx: 22.0, cz: 13.0, ...libre });
V({ code: "PUN-03", type: "punta", w: 1.0, d: 0.9, cx: 2.0,  cz: 6.0,  ...seLibera(17) });
V({ code: "PUN-04", type: "punta", w: 1.0, d: 0.9, cx: 2.0,  cz: 11.0, ...seLibera(17) });
V({ code: "PUN-05", type: "punta", w: 1.0, d: 0.9, cx: 2.0,  cz: 16.0, ...libre });
V({ code: "PUN-17", type: "punta", w: 1.0, d: 0.9, cx: 24.5, cz: 16.0, ...seLibera(19) });
V({ code: "EXP-01", type: "cross",  w: 1.6, d: 1.6, cx: 16.0, cz: 16.5, ...seLibera(21) });
V({ code: "EXP-02", type: "cross",  w: 1.6, d: 1.6, cx: 19.5, cz: 16.5, ...seLibera(21) });
V({ code: "CAR-01", type: "checkout", w: 1.8, d: 0.7, cx: 4 + 10 * 2.4, cz: 19.5, ...libre });
V({ code: "BEB-01", type: "nevera_refrescos", w: 2.4, d: 0.9, h: 2.1, cx: 25.0, cz: 3.0, ...tomado });
V({ code: "BEB-02", type: "nevera_refrescos", w: 2.4, d: 0.9, h: 2.1, cx: 25.0, cz: 6.0, ...libre });
V({ code: "BEB-03", type: "nevera_refrescos", w: 2.4, d: 0.9, h: 2.1, cx: 25.0, cz: 9.0, ...libre });
V({ code: "FRU-01", type: "stand_frutas", w: 1.5, d: 1.2, cx: 6.5,  cz: 17.5, ...libre });
V({ code: "FRU-04", type: "stand_frutas", w: 1.5, d: 1.2, cx: 9.0,  cz: 17.5, ...libre });
V({ code: "FRU-05", type: "stand_frutas", w: 1.5, d: 1.2, cx: 11.5, cz: 17.5, ...libre });

export const FIXTURES = F;
export const RATES = {
  default: { isla: 1200000, punta: 1150000, cross: 900000, checkout: 850000,
             nevera_refrescos: 420000, stand_frutas: 380000, gondola: 230000 },
  by_sede: {},
};
