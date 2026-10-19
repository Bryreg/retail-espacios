import { useId, useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import type { DibujoDeMontaje } from "../../api/montaje";
import { guiasDeCara, type MuebleParaSuperficie } from "../../utils/superficie";

/**
 * «Tu zona en la cara A»: dónde arma quien monta una participación de cara
 * (fase 2 · G1, decisión de la dueña del 2026-10-18: «con su zona dibujada,
 * sólo la suya; el resto gris»).
 *
 * Un dibujo de SÓLO LECTURA, chico y sin estado: la cara entera en gris
 * neutro, lo que no se vende (parantes, zócalo, copete…) rayado, los
 * entrepaños como guías punteadas finas, y SU zona —o sus zonas— en el color
 * de acento. Nada más: ni las otras formas, ni números, ni nombres, ni plata.
 *
 * Las formas llegan YA filtradas por el servidor (`routers/montaje.py`,
 * `_dibujo_de_participacion`): las de las otras participaciones nunca viajan,
 * así que acá no hay nada que esconder. Por eso este archivo no lee el store
 * ni la API de las participaciones, ni reusa el lienzo del editor (que tiene
 * el store, todas las zonas y las herramientas): `probar-montajes` lo fija.
 *
 * La superficie también viene del servidor: no se recalcula acá con el
 * mueble de los vecinos (que llega recortado a geometría). Del mueble sólo
 * salen las guías, que son cosméticas.
 */

type Punto = readonly [number, number];

/** Lo que dibuja la tarjeta, en metros de la cara (u·ancho, (1 − v)·alto: u = 0
 *  a la izquierda de quien mira y v = 0 abajo, o el borde delantero en una
 *  tapa vista desde arriba — el mismo mapeo que el lienzo de Distribución). */
export interface GeometriaDeMiZona {
  W: number;
  H: number;
  exclusiones: { por: string; x: number; y: number; w: number; h: number }[];
  /** El `d` de cada zona suya (un `path` cerrado). */
  zonas: string[];
  /** Las guías de los entrepaños (y) y de los parantes (x), en metros. */
  entrepanos: number[];
  parantes: number[];
}

const finito = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const enLaCara = (x: number) => Math.min(1, Math.max(0, x));

/** El título de la tarjeta. */
export function tituloDeMiZona(cara: "A" | "B"): string {
  return `Tu zona en la cara ${cara}`;
}

/** El pie: cómo se mira el dibujo, para no armar al revés. */
export function pieDeMiZona(orientacion: "frente" | "arriba"): string {
  return orientacion === "arriba"
    ? "Vista desde arriba: el borde de abajo es el frente. Armá sólo en lo pintado."
    : "Vista de frente, como la ves parada delante del mueble. Armá sólo en lo pintado; lo gris es el resto de la cara.";
}

/**
 * La geometría de la tarjeta (pura: la corre `probar-montajes`). `null` si no
 * hay nada que dibujar —medidas que no son números, o ninguna zona con al
 * menos tres puntos—: la tarjeta no sale y la pantalla queda como antes.
 */
export function geometriaDeMiZona(
  dibujo: DibujoDeMontaje | null | undefined,
  guias?: { entrepanos: readonly number[]; parantes: readonly number[] } | null,
): GeometriaDeMiZona | null {
  if (!dibujo) return null;
  const { ancho: W, alto: H } = dibujo.superficie;
  if (!finito(W) || !finito(H) || W <= 0 || H <= 0) return null;
  const zonas = dibujo.zonas
    .filter((z) => Array.isArray(z) && z.length >= 3 && z.every((p) => finito(p?.[0]) && finito(p?.[1])))
    .map((z) => (z as readonly Punto[])
      .map(([u, v], i) => `${i === 0 ? "M" : "L"}${enLaCara(u) * W} ${(1 - enLaCara(v)) * H}`)
      .join(" ") + " Z");
  if (zonas.length === 0) return null;
  const exclusiones = dibujo.superficie.exclusiones
    .filter((x) => [x.u0, x.u1, x.v0, x.v1].every(finito) && x.u1 > x.u0 && x.v1 > x.v0)
    .map((x) => ({
      por: x.por,
      x: enLaCara(x.u0) * W,
      y: (1 - enLaCara(x.v1)) * H,
      w: (enLaCara(x.u1) - enLaCara(x.u0)) * W,
      h: (enLaCara(x.v1) - enLaCara(x.v0)) * H,
    }));
  // Las guías son de un frente: en una tapa vista desde arriba no hay
  // entrepaños que señalar.
  const lineas = dibujo.superficie.orientacion === "frente" ? guias ?? null : null;
  return {
    W, H, exclusiones, zonas,
    entrepanos: lineas ? lineas.entrepanos.filter(finito).map((v) => (1 - enLaCara(v)) * H) : [],
    parantes: lineas ? lineas.parantes.filter(finito).map((u) => enLaCara(u) * W) : [],
  };
}

export default function MiZonaEnLaCara({
  dibujo, mueble,
}: {
  dibujo: DibujoDeMontaje;
  /** El mueble del plano (de los vecinos, sólo geometría): de él salen las
   *  guías de los entrepaños. Sin él, el dibujo va sin guías. */
  mueble?: MuebleParaSuperficie | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = useMemo(
    () => geometriaDeMiZona(dibujo, mueble && dibujo.superficie.orientacion === "frente" ? guiasDeCara(mueble, dibujo.cara) : null),
    [dibujo, mueble],
  );
  if (!g) return null;
  // Un poco de aire alrededor para que el borde no quede cortado, y el rayado
  // proporcional a la cara (una punta de 0,9 m y una isla de 2 m se ven igual).
  const lado = Math.max(g.W, g.H);
  const aire = lado * 0.03;
  const paso = lado / 45;
  return (
    <div
      data-mi-zona
      style={{
        padding: "12px 12px 10px", borderRadius: "var(--r-lg)",
        background: "var(--surface)", border: "1px solid var(--line)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 5, marginBottom: 8,
          fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)",
          letterSpacing: "0.03em", textTransform: "uppercase",
        }}
      >
        <LayoutGrid size={12} /> {tituloDeMiZona(dibujo.cara)}
      </div>
      <svg
        role="img"
        aria-label={tituloDeMiZona(dibujo.cara)}
        viewBox={`${-aire} ${-aire} ${g.W + 2 * aire} ${g.H + 2 * aire}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", maxHeight: 260 }}
      >
        <defs>
          <pattern id={`${uid}-gris`} patternUnits="userSpaceOnUse" width={paso} height={paso} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={paso} style={{ stroke: "var(--ink-3)" }} strokeWidth={paso * 0.3} opacity={0.45} />
          </pattern>
        </defs>

        {/* La cara entera, en gris neutro (`--surface-3`: el pie dice «lo gris
            es el resto», y `--surface-2` era casi blanco). */}
        <rect x={0} y={0} width={g.W} height={g.H}
          style={{ fill: "var(--surface-3)", stroke: "var(--line-strong)" }}
          strokeWidth={1} vectorEffect="non-scaling-stroke" />

        {/* Lo que no se vende, rayado. */}
        {g.exclusiones.map((x, i) => (
          <rect key={i} x={x.x} y={x.y} width={x.w} height={x.h} fill={`url(#${uid}-gris)`} data-exclusion={x.por} />
        ))}

        {/* Las guías: entrepaños y parantes, finas y punteadas. */}
        {(g.entrepanos.length > 0 || g.parantes.length > 0) && (
          <g style={{ stroke: "var(--ink-3)" }} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} vectorEffect="non-scaling-stroke">
            {g.entrepanos.map((y, i) => (
              <line key={`e${i}`} x1={0} x2={g.W} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
            ))}
            {g.parantes.map((x, i) => (
              <line key={`p${i}`} x1={x} x2={x} y1={0} y2={g.H} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}

        {/* SU zona (o sus zonas): lo único pintado, en color. Con `--accent`
            (la tinta, casi negra) al 35 % salía un gris sobre la cara casi
            blanca y el pie le decía que lo gris era de otros (recorrido). */}
        {g.zonas.map((d, i) => (
          <path key={i} d={d} data-zona-propia
            style={{ fill: "var(--marca-1)", stroke: "var(--marca-1)" }}
            fillOpacity={0.35} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 8, textAlign: "center" }}>
        {pieDeMiZona(dibujo.superficie.orientacion)}
      </div>
    </div>
  );
}
