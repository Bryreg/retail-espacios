// Una sede sintética con los datos de la maqueta de Supervisar: 23 caras
// comercializables entre muebles de sala, y los ocho contratos reales de NAVE
// —los mismos que suman el canon exacto de $5.300.001—, con las fechas movidas
// para que caigan siempre respecto de hoy.
//
// Los CÓDIGOS son los del plano de la maqueta, que es un layout sintético; los
// CONTRATOS son los de la sede desplegada. La lee `pantalla.mjs`.
const HOY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const mas = (n) => { const d = new Date(HOY); d.setDate(d.getDate() + n); return iso(d); };

let n = 0;
const base = (o) => ({
  id: `f${++n}`, rotY: 0, color: "#CBD5E1",
  status: "free", sede: "NAVE", supplierName: "", brandCategory: "",
  negotiatedValue: 0, startDate: "", endDate: "", observation: "",
  h: 1.6, ...o,
});

const contratos = {
  "PUN-03": ["Punta de góndola", "comercializadora nutresa", mas(-6), mas(24), 800000, true],
  "PUN-04": ["Punta de góndola", "brayan",                   mas(-4), mas(24), 1000000, false],
  "PUN-17": ["Punta de góndola", "ALPINA",                   mas(-5), mas(26), 800000, false],
  "EXP-01": ["Exhibición",       "camilop",                  mas(-2), mas(28), 1000000, false],
  "EXP-02": ["Exhibición",       "nutresa",                  mas(-2), mas(28), 100000, false],
  "ISL-03": ["Isla",             "RECAMIER",                 mas(-18), mas(45), 400000, true],
  "BEB-01": ["Nevera",           "COCA COLA",                mas(-1), mas(91), 1200000, false],
  "GON-60": ["Góndola",          "COLOMBIANA DE COMERCIO",   mas(-242), mas(120), 1, false],
};
const con = (code, extra = {}) => {
  const c = contratos[code];
  if (!c) return extra;
  const [, prov, desde, hasta, valor] = c;
  return { status: "occupied", supplierName: prov, negotiatedValue: valor,
           startDate: desde, endDate: hasta, ...extra };
};

const F = [];
// Góndolas dobles en fila: GON-60 / 61 / 67 (caras A y B)
[["GON-60", 6], ["GON-61", 10], ["GON-67", 14]].forEach(([code, cx], i) => {
  F.push(base({
    code, label: `Góndola ${code.slice(4)}`, type: "gondola", gondolaType: "double",
    cx, cz: 9, w: 8, d: 1.2, ...con(code),
    faceB: { supplierName: "", brandCategory: "", negotiatedValue: 0,
             startDate: "", endDate: "", observation: "", status: "free" },
  }));
});
// Puntas de góndola
[["PUN-03", 5.5, 5], ["PUN-04", 3, 6], ["PUN-05", 9.5, 5], ["PUN-17", 15, 5]].forEach(([code, cx, cz]) =>
  F.push(base({ code, label: `Punta ${code.slice(4)}`, type: "punta", cx, cz, w: 1.2, d: 1.2, ...con(code) })));
// Exhibiciones de piso
[["EXP-01", 4, 12], ["EXP-02", 6.5, 13]].forEach(([code, cx, cz]) =>
  F.push(base({ code, label: `Exhibición ${code.slice(4)}`, type: "cross", cx, cz, w: 1.4, d: 1.4, ...con(code) })));
// Islas
[["ISL-03", 2, 7], ["ISL-04", 3.5, 8.5], ["ISL-05", 1, 5], ["ISL-06", 3, 4]].forEach(([code, cx, cz]) =>
  F.push(base({ code, label: `Isla ${code.slice(4)}`, type: "isla", cx, cz, w: 1.8, d: 1.8, h: 1.1, ...con(code) })));
// Neveras de bebidas
[["BEB-01", 17, 15], ["BEB-02", 15, 16], ["BEB-03", 13, 17]].forEach(([code, cx, cz]) =>
  F.push(base({ code, label: `Nevera ${code.slice(4)}`, type: "nevera_refrescos", cx, cz, w: 2.2, d: 1, h: 2, ...con(code) })));
// Frutas y verduras
[["FRU-01", 6, 3], ["FRU-04", 4.5, 2], ["FRU-05", 8, 2.5]].forEach(([code, cx, cz]) =>
  F.push(base({ code, label: `Frescos ${code.slice(4)}`, type: "stand_frutas", cx, cz, w: 2, d: 1.4, h: 1.1, ...con(code) })));
// Cabecera de caja
F.push(base({ code: "CAR-01", label: "Cabecera de caja", type: "mueble", cx: 10, cz: 1, w: 2.4, d: 1, ...con("CAR-01") }));

// Resto de la sala: infraestructura que se dibuja y no se vende
for (let i = 0; i < 30; i++) {
  F.push(base({
    code: `INF-${i + 1}`, label: "Góndola de sala", type: "gondola", gondolaType: "wall",
    cx: 2 + (i % 6) * 3, cz: 19 + Math.floor(i / 6) * 2.4,
    w: 2.6, d: 1, rentable: false,
  }));
}

export const LAYOUT = [{ sede: "NAVE", fixtures: F, updated_at: new Date().toISOString() }];
export const RATES = {
  default: {
    isla: 1200000, punta: 1150000, cross: 900000, mueble: 850000,
    nevera_refrescos: 420000, stand_frutas: 380000, gondola: 230000,
  },
  by_sede: {},
};
export const MONTAJES = [
  { space_code: "NAVE-PUN-03", estado: "montado", confirmado_en: new Date().toISOString(), reportado_por: "mercaderista" },
  { space_code: "NAVE-ISL-03", estado: "montado", confirmado_en: new Date().toISOString(), reportado_por: "mercaderista" },
];
