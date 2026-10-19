import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Estampa, Textura } from "../../../utils/coloresDeMarca";
import type { Superficie } from "../../../utils/superficie";
import { trapecios, validarZona, type Poligono, type Punto } from "../../../utils/zonasGeometria";
import { formaDeZona, letraDeCara, letraTapada, sigueLejos, transformDeCara } from "../../../utils/zonas3d";
import { puntoInterior } from "../../../utils/edicionDeZonas";

/**
 * Las zonas de una cara pegadas al mueble, en el 3D de Distribución (§10.1 y
 * §8 del diseño de participaciones).
 *
 *   · **Hijas del grupo del mueble**: la escena las monta dentro del
 *     `<group>` del mueble que se distribuye, así heredan su posición y su
 *     giro y se mueven con él. Adentro, un grupo por cara con
 *     `transformDeCara` —el MISMO que prueba `probar-superficies.mjs`— y, en
 *     el robatope, otro de afuera con el giro de sus repisas: las zonas van
 *     en el marco girado de las repisas, no en el del mueble.
 *   · **La misma fórmula u,v que los gemelos** (`formaDeZona`): u = 0 es el
 *     borde izquierdo de quien mira la cara de frente; v = 0, abajo.
 *   · **Relleno con los trapecios** de la unión de las zonas de cada
 *     participación (∩ lo que se vende): cada punto se pinta una vez y nada
 *     cae sobre zócalo, parantes o copete; lo que se ve pintado es lo que
 *     cuenta. Encima, la cinta del contorno crudo (lo que se dibujó), en el
 *     tono pleno de su estampa: 1 cm, 2 cm la elegida; discontinua la
 *     reserva; gris punteada la historia, sin relleno.
 *   · **Sin z-fighting**: el plano del dibujo ya va ≥ 6 mm por delante de lo
 *     más saliente del frente (`superficie.ts`, medido) y el mueble está
 *     desnudo (`desnudo.ts`); los rellenos no escriben profundidad y llevan
 *     `polygonOffset` (−1, −4: la precisión de profundidad a 80 m, la órbita
 *     máxima, es ≈ 3,8 mm); la cinta va medio milímetro más afuera. Entre
 *     cintas coplanares (dos marcas vecinas, la historia bajo una viva, la
 *     elegida) decide su NIVEL (`nivelDeCinta`): cada nivel va 0,2 mm más
 *     afuera (`separacionDeCinta`), nunca el orden en que la GPU las triangula.
 *   · **El trazo en curso** (un rectángulo o un polígono a medio dibujar, en
 *     el lienzo o en el 3D con «Editar en el 3D»): una cinta discontinua en
 *     el tono de la participación activa, en el nivel más alto de la cara que
 *     se edita. Antes el 3D no mostraba nada hasta soltar.
 *   · **Lejos (más de 40 m)**, ni mallas ni `Html`: las letras y el rótulo no
 *     se montan (`sigueLejos`, con histéresis).
 *   · **No roban el clic**: toda malla lleva `raycast` nulo y va marcada
 *     `chrome` (fuera de las capturas). La cara y el punto que se tocan se
 *     resuelven con un rayo contra el plano (`elegirCaraYPunto`), nunca contra
 *     estas mallas.
 *
 * NO lee ningún store: la lista de zonas, las estampas y lo resaltado le
 * llegan armados. El que lee el store de edición es el editor
 * (`StoreEditor3D.tsx`), en un componente propio que sólo se vuelve a dibujar
 * él: la guarda de `probar-distribucion.mjs` deja importar
 * `distribucionStore` sólo al editor y a `components/Distribucion/`.
 *
 * Las texturas del rayado son dos, compartidas por todos los tonos (el color
 * lo pone el material) y se sueltan al desmontar el editor
 * (`olvidarTexturasDeZonas`); geometrías y materiales, al cambiar o
 * desmontarse cada pieza.
 */

/** Marca lo que no sale en una captura (como `CHROME` del editor). */
const CHROME = { chrome: true };
/** Con la cámara más lejos que esto del mueble, las zonas no se dibujan: no
 *  aportan y es donde la profundidad pierde precisión. */
export const DISTANCIA_MAXIMA_M = 40;
/** El ancho de la cinta del contorno, en metros. */
export const CINTA_M = 0.01;
export const CINTA_ELEGIDA_M = 0.02;
/** La reserva provisional: tramos de 6 cm. La historia y lo que no cuenta el
 *  día que se mira: puntos de 2 cm cada 5. */
export const TRAMO_DISCONTINUO_M = 0.06;
export const PUNTO_M = 0.02;
export const HUECO_PUNTEADO_M = 0.03;
/** Cuánto más afuera que el relleno va la cinta (medio milímetro). */
const SOBRE_EL_RELLENO = 0.0005;
/** 25 repeticiones por metro: un período de 4 cm en cualquier mueble (las UV
 *  van en metros, como las de `ShapeGeometry`). */
export const REPETICIONES_POR_METRO = 25;
/** El gris de la historia (la cinta de una participación que ya no rige). */
const GRIS_DE_HISTORIA = "#8d9499";

export type EstiloDeCinta = "continua" | "discontinua" | "punteada";

/**
 * Las CINTAS, escalonadas en profundidad (revisión final, escena-uso 2).
 * Todas las cintas de una cara iban en el mismo plano, opacas y con el mismo
 * `polygonOffset`: dos zonas de participaciones distintas que comparten un
 * borde (lo normal: el imán viene prendido y pega los bordes exactos) dejaban
 * sus cintas superpuestas y coplanares, con triangulaciones distintas, y el
 * color que ganaba cambiaba a pedazos y al girar 1°. Ahora cada cinta tiene un
 * NIVEL y gana siempre la de nivel más alto:
 *
 *   · 0: la historia (gris punteada), debajo de todo lo vivo.
 *   · 1 + i: las cintas de la participación i, en el orden estable de su
 *     `spaceId` (el mismo de los rellenos).
 *   · arriba de todas: la gruesa de la participación resaltada y, encima, la
 *     de la zona elegida.
 *
 * Lo que separa es la POSICIÓN: cada nivel va `Z_POR_NIVEL_M` (0,2 mm) más
 * afuera que el anterior, en el marco de la cara. Medido en Chromium
 * (swiftshader) con estas mismas geometrías y materiales, sobre el borde común
 * de dos marcas, de 1 a 4 m y girando la cámara: el 20 % de los píxeles
 * cambiaba de color entre tomas con un solo plano, el 19 % escalonando sólo
 * `polygonOffsetUnits` de a 2 (la interpolación de la profundidad se come esas
 * unidades) y 0 % con los 0,2 mm por nivel. Más lejos la cinta de 1 cm ya
 * mide menos de un píxel. El `polygonOffset` escalonado queda como refuerzo
 * (siempre más cerca que el relleno, −4). El tope (`NIVEL_MAXIMO_DE_CINTA`)
 * deja la cinta más alta a 3,5 mm del dibujo: pegada a la cara, y el plano ya
 * va ≥ 6 mm por delante de lo más saliente del frente.
 */
export const Z_POR_NIVEL_M = 0.0002;
export const PASO_DE_DESFASE = 2;
/** Hasta dónde sube el nivel: con más participaciones que esto en una cara,
 *  las de arriba comparten el último. */
export const NIVEL_MAXIMO_DE_CINTA = 15;

export function nivelDeCinta(c: { historia?: boolean; indice: number; cuantas: number; gruesa?: boolean; elegida?: boolean }): number {
  if (c.historia) return 0;
  const n = Math.max(0, c.cuantas);
  const nivel = c.elegida ? n + 2 : c.gruesa ? n + 1 : 1 + Math.max(0, Math.min(c.indice, n - 1));
  return Math.min(nivel, NIVEL_MAXIMO_DE_CINTA);
}

/** Cuánto más afuera que el resto de su cara va una cinta de ese nivel, en
 *  metros (además del medio milímetro de `SOBRE_EL_RELLENO`). */
export function separacionDeCinta(nivel: number): number {
  return nivel * Z_POR_NIVEL_M;
}

/** Las `polygonOffsetUnits` de una cinta de ese nivel (las del relleno son −4). */
export function desfaseDeCinta(nivel: number): number {
  return -4 - PASO_DE_DESFASE * nivel;
}

/**
 * Cómo se dibuja una zona según su participación: la MISMA regla que el
 * lienzo 2D (`LienzoDeZonas`: `if (!info?.cuenta || !info.estampa) return
 * null;` y punteado si no cuenta). Relleno sólo si cuenta el día que se mira
 * y tiene estampa; si no cuenta —o la cara no la nombra (un dato roto que el
 * servidor marca)—, sin relleno y con la cinta punteada; la reserva,
 * discontinua. Antes, una zona de una participación que la cara no nombra se
 * rellenaba en gris en el 3D y no en el lienzo (revisión final, escena-uso).
 */
export function comoSeDibuja(como: ComoSeVe | undefined): { relleno: boolean; estilo: EstiloDeCinta } {
  if (!como?.cuenta) return { relleno: false, estilo: "punteada" };
  return { relleno: !!como.estampa, estilo: como.reserva ? "discontinua" : "continua" };
}

/** Una zona viva, tal como se edita. */
export interface ZonaParaDibujar { clave: string; spaceId: number; vertices: Poligono }

/** Lo que se dibuja de UNA cara. */
export interface CaraParaDibujar {
  cara: "A" | "B";
  /** La del SERVIDOR (la misma que usa el lienzo), no la del mueble local. */
  superficie: Superficie;
  /** La que se edita va entera; la otra (en una doble), a la mitad. */
  editada: boolean;
  zonas: readonly ZonaParaDibujar[];
  /** Zonas de participaciones que ya no rigen: cinta gris punteada. */
  historia: readonly Poligono[];
}

/** El trazo en curso (`trazoParaDibujar`): sus vértices en u,v y el tono de
 *  la participación activa (`null`: gris). */
export interface TrazoParaDibujar { vertices: Poligono; tono: string | null }

/** Cómo se ve cada participación (por `spaceId`). */
export interface ComoSeVe {
  estampa: Estampa | null;
  /** Reserva provisional: cinta discontinua. */
  reserva: boolean;
  /** Cuenta el día de «Ver al día»; si no, sin relleno y cinta punteada. */
  cuenta: boolean;
  /** «3 · 25 %». */
  rotulo: string;
}

// ─── Geometría (pura: la prueba `probar-muebles.mjs` la arma y la mide) ────

const area2 = (a: Punto, b: Punto, c: Punto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Un cuadrilátero (a, b, c, d) en dos triángulos, siempre antihorarios en
 *  el plano de la forma: la cara visible da hacia quien mira (`FrontSide`). */
function empujarCuadrilatero(pos: number[], uv: number[], idx: number[], q: readonly Punto[], z: number): void {
  const base = pos.length / 3;
  for (const [x, y] of q) { pos.push(x, y, z); uv.push(x, y); }
  const s = area2(q[0], q[1], q[2]) + area2(q[0], q[2], q[3]);
  if (s >= 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function geometriaDe(pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * El relleno de una participación: los trapecios (en u,v) pasados al plano
 * de la cara con `formaDeZona`, en metros. Las UV son las mismas coordenadas
 * en metros: con `REPETICIONES_POR_METRO` el rayado mide 4 cm en cualquier
 * mueble y no se deforma.
 */
export function geometriaDeRelleno(sup: Superficie, cara: "A" | "B", cuadros: readonly (readonly Punto[])[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const t of cuadros) {
    const q = formaDeZona(sup, cara, t.map((p) => [p[0], p[1]] as Punto));
    empujarCuadrilatero(pos, uv, idx, q, 0);
  }
  return geometriaDe(pos, uv, idx);
}

/** Los vértices de la forma (sx, sy) de un polígono, antihorarios. */
function anillo(sup: Superficie, cara: "A" | "B", p: Poligono): Punto[] {
  const q = formaDeZona(sup, cara, p);
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s < 0 ? q.reverse() : q;
}

/**
 * La cinta del contorno de un polígono, centrada en su borde, de `ancho`
 * metros. Continua: con ingletes en cada vértice, limitados a 2× el ancho
 * (una zona fina no dispara picos). Discontinua o punteada: tramos sueltos a
 * lo largo del perímetro, que siguen la cuenta de una arista a la otra.
 */
export function geometriaDeCinta(
  sup: Superficie, cara: "A" | "B", p: Poligono, ancho: number, estilo: EstiloDeCinta = "continua",
): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const q = anillo(sup, cara, p);
  const n = q.length;
  const m = ancho / 2;
  if (n < 2) return geometriaDe(pos, uv, idx);
  const normal = (a: Punto, b: Punto): Punto => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];   // hacia afuera de un anillo antihorario
  };
  if (estilo === "continua") {
    const afuera: Punto[] = [], adentro: Punto[] = [];
    for (let i = 0; i < n; i++) {
      const prev = q[(i - 1 + n) % n], cur = q[i], next = q[(i + 1) % n];
      const n1 = normal(prev, cur), n2 = normal(cur, next);
      let mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const l = Math.hypot(mx, my);
      let largo = m;
      if (l < 1e-9) { mx = n1[0]; my = n1[1]; }
      else {
        mx /= l; my /= l;
        const cos = mx * n1[0] + my * n1[1];
        largo = Math.min(m / Math.max(cos, 1e-9), 2 * ancho);
      }
      afuera.push([cur[0] + mx * largo, cur[1] + my * largo]);
      adentro.push([cur[0] - mx * largo, cur[1] - my * largo]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      empujarCuadrilatero(pos, uv, idx, [adentro[i], adentro[j], afuera[j], afuera[i]], SOBRE_EL_RELLENO);
    }
    return geometriaDe(pos, uv, idx);
  }
  const lleno = estilo === "discontinua" ? TRAMO_DISCONTINUO_M : PUNTO_M;
  const hueco = estilo === "discontinua" ? TRAMO_DISCONTINUO_M : HUECO_PUNTEADO_M;
  const periodo = lleno + hueco;
  let fase = 0;   // dónde arranca la arista dentro del período
  for (let i = 0; i < n; i++) {
    const a = q[i], b = q[(i + 1) % n];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (largo < 1e-9) continue;
    const ux = (b[0] - a[0]) / largo, uy = (b[1] - a[1]) / largo;
    const [nx, ny] = normal(a, b);
    let t = -fase;
    while (t < largo) {
      const t0 = Math.max(0, t), t1 = Math.min(largo, t + lleno);
      if (t1 > t0 + 1e-9) {
        const p0: Punto = [a[0] + ux * t0, a[1] + uy * t0], p1: Punto = [a[0] + ux * t1, a[1] + uy * t1];
        empujarCuadrilatero(pos, uv, idx, [
          [p0[0] - nx * m, p0[1] - ny * m], [p1[0] - nx * m, p1[1] - ny * m],
          [p1[0] + nx * m, p1[1] + ny * m], [p0[0] + nx * m, p0[1] + ny * m],
        ], SOBRE_EL_RELLENO);
      }
      t += periodo;
    }
    fase = (fase + largo) % periodo;
  }
  return geometriaDe(pos, uv, idx);
}

/** Las zonas válidas (limpias y antihorarias) de una lista: una a medio
 *  dibujar o rota no se pinta (el lienzo la marca). */
export function zonasValidas(sup: Superficie, ps: readonly Poligono[]): Poligono[] {
  const fuera: Poligono[] = [];
  for (const p of ps) {
    const v = validarZona(p, sup.ancho, sup.alto);
    if (v.codigo === null) fuera.push(v.vertices);
  }
  return fuera;
}

// ─── Texturas del rayado ────────────────────────────────────────────────────

const texturas = new Map<Textura, THREE.CanvasTexture>();

/** El rayado a 45° o 135° de una estampa, blanco sobre un fondo traslúcido
 *  (el color lo pone el material). Una por textura, compartida. */
function texturaDe(t: Textura): THREE.Texture | null {
  if (t === "lleno") return null;
  const ya = texturas.get(t);
  if (ya) return ya;
  if (typeof document === "undefined") return null;
  const n = 64;
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = n;
  const g = lienzo.getContext("2d");
  if (!g) return null;
  g.fillStyle = "rgba(255,255,255,0.4)";
  g.fillRect(0, 0, n, n);
  g.strokeStyle = "#ffffff";
  g.lineWidth = n * 0.3;
  g.lineCap = "square";
  for (const k of [-n, 0, n]) {
    g.beginPath();
    // 45°: de abajo a la izquierda a arriba a la derecha (la textura se da
    // vuelta en y al subir); 135°, al revés. Tres rayas: sin costura.
    if (t === "rayado45") { g.moveTo(k, n); g.lineTo(k + n, 0); } else { g.moveTo(k, 0); g.lineTo(k + n, n); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(lienzo);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(REPETICIONES_POR_METRO, REPETICIONES_POR_METRO);
  texturas.set(t, tex);
  return tex;
}

/** Suelta las texturas del rayado (lo llama el editor al desmontarse). */
export function olvidarTexturasDeZonas(): void {
  for (const t of texturas.values()) t.dispose();
  texturas.clear();
}

// ─── Componentes ────────────────────────────────────────────────────────────

function Relleno({ sup, cara, zonas, tono, textura, opacidad, orden }: {
  sup: Superficie; cara: "A" | "B"; zonas: readonly Poligono[]; tono: string; textura: Textura; opacidad: number; orden: number;
}) {
  const clave = `${sup.ancho}|${sup.alto}|${JSON.stringify(sup.exclusiones)}|${cara}|${JSON.stringify(zonas)}`;
  const geometria = useMemo(
    () => geometriaDeRelleno(sup, cara, trapecios(zonasValidas(sup, zonas), sup.exclusiones)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave],
  );
  useEffect(() => () => geometria.dispose(), [geometria]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: tono, map: texturaDe(textura), transparent: true, opacity: opacidad, depthWrite: false,
    side: THREE.FrontSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  }), [tono, textura, opacidad]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometria} material={material} renderOrder={orden} raycast={() => null} userData={CHROME} />;
}

/** El material de una cinta: opaco (escribe profundidad) salvo atenuada, con
 *  el desfase de su nivel (`nivelDeCinta`). Exportado para medirlo. */
export function materialDeCinta(tono: string, opacidad: number, nivel: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: tono, transparent: opacidad < 1, opacity: opacidad, side: THREE.FrontSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: desfaseDeCinta(nivel),
  });
}

function Cinta({ sup, cara, vertices, ancho, estilo, tono, opacidad, nivel }: {
  sup: Superficie; cara: "A" | "B"; vertices: Poligono; ancho: number; estilo: EstiloDeCinta; tono: string; opacidad: number; nivel: number;
}) {
  const clave = `${sup.ancho}|${sup.alto}|${cara}|${ancho}|${estilo}|${JSON.stringify(vertices)}`;
  const geometria = useMemo(
    () => geometriaDeCinta(sup, cara, vertices, ancho, estilo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave],
  );
  useEffect(() => () => geometria.dispose(), [geometria]);
  const material = useMemo(() => materialDeCinta(tono, opacidad, nivel), [tono, opacidad, nivel]);
  useEffect(() => () => material.dispose(), [material]);
  // El orden de dibujo sigue al nivel (rellenos `2 + i`, cintas `3 + i`, la
  // historia 2): las atenuadas, que son transparentes, se mezclan siempre en
  // el mismo orden.
  return <mesh geometry={geometria} material={material} position={[0, 0, separacionDeCinta(nivel)]} renderOrder={2 + nivel}
    raycast={() => null} userData={CHROME} />;
}

/** El rótulo «3 · 25 %», en el punto interior de la zona. Texto en la tinta
 *  del tema sobre una pastilla (nunca en el color de la serie). */
function Rotulo({ sup, cara, vertices, texto }: { sup: Superficie; cara: "A" | "B"; vertices: Poligono; texto: string }) {
  const [u, v] = puntoInterior(vertices, sup.ancho, sup.alto);
  const [[x, y]] = formaDeZona(sup, cara, [[u, v]]);
  return (
    <Html position={[x, y, 0.002]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
      <div style={{
        background: "var(--surface)", color: "var(--ink-1)", fontSize: 11, fontWeight: 700, padding: "1px 6px",
        borderRadius: 999, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}>{texto}</div>
    </Html>
  );
}

function ZonasDeUnaCara({ c, participaciones, resaltada, seleccionada, lejos, trazo }: {
  c: CaraParaDibujar; participaciones: ReadonlyMap<number, ComoSeVe>; resaltada: number | null; seleccionada: string | null;
  /** Lejos (más de `DISTANCIA_MAXIMA_M`): los rótulos `Html` no se montan. */
  lejos: boolean;
  /** El trazo en curso: sólo en la cara que se edita. */
  trazo?: TrazoParaDibujar | null;
}) {
  const sup = c.superficie;
  const t = transformDeCara(sup, c.cara);
  const mitad = c.editada ? 1 : 0.5;
  // Las zonas de cada participación juntas: el relleno es la unión.
  const porParticipacion = new Map<number, Poligono[]>();
  for (const z of c.zonas) {
    const l = porParticipacion.get(z.spaceId);
    if (l) l.push(z.vertices); else porParticipacion.set(z.spaceId, [z.vertices]);
  }
  const ordenadas = [...porParticipacion.keys()].sort((a, b) => a - b);
  const opacidadDe = (s: number) => (resaltada === null ? 0.35 : s === resaltada ? 0.6 : 0.15) * mitad;
  const contenido = (
    <group position={t.position} rotation={t.rotation}>
      {ordenadas.map((s, i) => {
        const como = participaciones.get(s);
        // Lo que no cuenta ese día, o una participación que la cara no
        // nombra: sólo el contorno, como en el lienzo (`comoSeDibuja`).
        if (!comoSeDibuja(como).relleno || !como?.estampa) return null;
        return (
          <Relleno key={`r${s}`} sup={sup} cara={c.cara} zonas={porParticipacion.get(s)!}
            tono={como.estampa.tono} textura={como.estampa.textura}
            opacidad={opacidadDe(s)} orden={2 + i} />
        );
      })}
      {c.zonas.map((z) => {
        const como = participaciones.get(z.spaceId);
        const i = Math.max(0, ordenadas.indexOf(z.spaceId));
        const elegida = z.clave === seleccionada;
        const gruesa = elegida || (resaltada !== null && z.spaceId === resaltada);
        const apagada = resaltada !== null && z.spaceId !== resaltada && !elegida;
        return (
          <Cinta key={`c${z.clave}`} sup={sup} cara={c.cara} vertices={z.vertices}
            ancho={gruesa ? CINTA_ELEGIDA_M : CINTA_M} estilo={comoSeDibuja(como).estilo}
            tono={como?.estampa?.tono ?? GRIS_DE_HISTORIA} opacidad={(apagada ? 0.35 : 1) * mitad}
            nivel={nivelDeCinta({ indice: i, cuantas: ordenadas.length, gruesa, elegida })} />
        );
      })}
      {c.historia.map((p, k) => (
        <Cinta key={`h${k}`} sup={sup} cara={c.cara} vertices={p} ancho={CINTA_M} estilo="punteada"
          tono={GRIS_DE_HISTORIA} opacidad={0.8 * mitad} nivel={nivelDeCinta({ historia: true, indice: 0, cuantas: ordenadas.length })} />
      ))}
      {/* El trazo en curso, discontinuo, encima de todo lo de la cara. */}
      {c.editada && trazo && trazo.vertices.length >= 2 && (
        <Cinta key="trazo" sup={sup} cara={c.cara} vertices={trazo.vertices} ancho={CINTA_ELEGIDA_M} estilo="discontinua"
          tono={trazo.tono ?? GRIS_DE_HISTORIA} opacidad={1} nivel={NIVEL_MAXIMO_DE_CINTA} />
      )}
      {c.editada && !lejos && c.zonas.map((z) => {
        const como = participaciones.get(z.spaceId);
        if (!como || (z.clave !== seleccionada && z.spaceId !== resaltada)) return null;
        return <Rotulo key={`t${z.clave}`} sup={sup} cara={c.cara} vertices={z.vertices} texto={como.rotulo} />;
      })}
    </group>
  );
  return t.giro ? <group rotation={t.giro}>{contenido}</group> : contenido;
}

/**
 * Las zonas de las caras del mueble que se distribuye, y la letra de cada
 * cara. La monta la escena adentro del grupo del mueble.
 */
export const ZonasDelMueble = memo(function ZonasDelMueble({ caras, participaciones, resaltada, seleccionada, trazo = null }: {
  caras: readonly CaraParaDibujar[];
  participaciones: ReadonlyMap<number, ComoSeVe>;
  /** La participación activa (con la que se dibuja): sus zonas resaltan. */
  resaltada: number | null;
  /** La zona elegida (su `clave`). */
  seleccionada: string | null;
  /** El trazo en curso (se dibuja en la cara que se edita), o nada. */
  trazo?: TrazoParaDibujar | null;
}) {
  const grupo = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const donde = useMemo(() => new THREE.Vector3(), []);
  const camaraLocal = useMemo(() => new THREE.Vector3(), []);
  /** Las letras, para esconder la que el mueble tapa sin volver a dibujar. */
  const letras = useRef<Partial<Record<"A" | "B", HTMLDivElement | null>>>({});
  /** Lejos, los `Html` (letras y rótulo) no se montan: son capas del DOM que
   *  no miran el `visible` del grupo y quedaban flotando sobre la nada más
   *  allá de los 40 m (revisión final, escena-uso). Con estado y con
   *  histéresis (`sigueLejos`): se vuelve a dibujar sólo al cruzar el borde. */
  const [lejos, setLejos] = useState(false);
  const lejosAhora = useRef(false);
  // Las mallas, lejos, no se dibujan: se decide en cada cuadro, sin estado.
  useFrame(() => {
    const g = grupo.current;
    if (!g) return;
    g.getWorldPosition(donde);
    g.visible = camera.position.distanceTo(donde) <= DISTANCIA_MAXIMA_M;
    const siguen = sigueLejos(lejosAhora.current, camera.position.distanceTo(donde), DISTANCIA_MAXIMA_M);
    if (siguen !== lejosAhora.current) { lejosAhora.current = siguen; setLejos(siguen); }
    // La letra de la cara de atrás no se ve A TRAVÉS del mueble (el `Html` se
    // dibuja encima del lienzo, sin profundidad): con la cámara en el marco
    // del mueble —el grupo de las zonas no tiene transformación propia—, la
    // que tapa el cuerpo se esconde.
    if (!g.visible || caras.length < 2) return;
    g.worldToLocal(camaraLocal.copy(camera.position));
    const cam: [number, number, number] = [camaraLocal.x, camaraLocal.y, camaraLocal.z];
    for (const c of caras) {
      const el = letras.current[c.cara];
      if (!el) continue;
      const tapada = letraTapada(c.superficie, cam, letraDeCara(c.superficie, c.cara));
      const visibilidad = tapada ? "hidden" : "visible";
      if (el.style.visibility !== visibilidad) el.style.visibility = visibilidad;
    }
  });
  return (
    <group ref={grupo} userData={CHROME}>
      {caras.map((c) => (
        <ZonasDeUnaCara key={c.cara} c={c} participaciones={participaciones} resaltada={resaltada} seleccionada={seleccionada} lejos={lejos}
          trazo={trazo} />
      ))}
      {!lejos && caras.length > 1 && caras.map((c) => (
        <Html key={`letra${c.cara}`} position={letraDeCara(c.superficie, c.cara)} center zIndexRange={[6, 0]}
          style={{ pointerEvents: "none" }}>
          <div ref={(el) => { letras.current[c.cara] = el; }} data-letra-de-cara={c.cara} style={{
            background: c.editada ? "var(--ink-1)" : "var(--surface)", color: c.editada ? "var(--surface)" : "var(--ink-1)",
            fontSize: 12, fontWeight: 800, width: 20, height: 20, lineHeight: "20px", textAlign: "center", borderRadius: 999,
            pointerEvents: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}>{c.cara}</div>
        </Html>
      ))}
    </group>
  );
});
