import { useMemo } from "react";
import { isRentable, type UnifiedFixture } from "../../types/fixtures";

/**
 * El plano de la tienda visto desde arriba, con UN mueble señalado.
 *
 * No es el editor en chiquito. El mercaderista no viene a editar: viene parado
 * en la entrada con el celular en la mano a resolver una sola pregunta —
 * ¿dónde queda esto?—, así que el mapa dibuja el contexto en gris y gasta todo
 * el color en el destino.
 *
 * Convención de coordenadas (ver types/fixtures.ts): cx/cz son el centro en
 * metros, w es el ancho (eje X), d el fondo (eje Z), y rotY el giro en
 * RADIANES. El plano se dibuja cenital, así que Z va hacia abajo en pantalla.
 */

/** Un mueble que no se alquila igual sirve: son las referencias de la tienda. */
const GRIS_INFRA = "#CBD5E1";
const GRIS_OTROS = "#94A3B8";

/** Las cajas son la referencia que todo el mundo conoce, aunque nunca haya
 *  mirado un plano. Se dibujan aparte y con etiqueta. */
const REFERENCIAS: Record<string, { corto: string; frase: string }> = {
  checkout: { corto: "Cajas", frase: "las cajas" },
  nevera_refrescos: { corto: "Neveras", frase: "las neveras" },
  nevera_carnes: { corto: "Carnes", frase: "el mostrador de carnes" },
  stand_frutas: { corto: "Frutas", frase: "las frutas" },
};

export interface MiniMapaProps {
  /** Todos los muebles de la sede, no solo el de destino. */
  fixtures: UnifiedFixture[];
  /** Código corto del mueble a señalar (el del layout, no el `SEDE-CODE`). */
  targetCode: string;
  /** Ancho del lienzo en px. El alto se calcula según la forma de la tienda. */
  ancho?: number;
}

/** Alto mínimo y máximo del dibujo.
 *
 *  El alto NO es fijo: sale de la forma de la planta. Con un alto fijo, una
 *  tienda larga y angosta —que es la forma normal de un supermercado— se
 *  dibujaba a menos de 5 px por metro, y una punta de góndola de 0,9 × 0,4 m
 *  quedaba de cuatro píxeles. El mapa se veía; no se podía usar. El tope de
 *  arriba existe porque abajo del mapa todavía tienen que caber los dos
 *  botones grandes sin hacer scroll. */
const ALTO_MIN = 150;
const ALTO_MAX = 320;

interface Caja {
  f: UnifiedFixture;
  x: number;
  y: number;
  w: number;
  h: number;
  deg: number;
  destino: boolean;
  color: string;
}

/** Describe en palabras dónde queda el mueble, para quien no mire el dibujo.
 *  Devuelve null cuando no hay con qué comparar. */
export function describirUbicacion(
  fixtures: UnifiedFixture[],
  targetCode: string,
): string | null {
  const code = targetCode.trim().toUpperCase();
  const target = fixtures.find((f) => f.code.toUpperCase() === code);
  if (!target) return null;

  // La referencia más cercana que un humano reconozca sin plano.
  let mejor: { frase: string; dist: number } | null = null;
  for (const f of fixtures) {
    if (f.id === target.id) continue;
    const ref = REFERENCIAS[f.type];
    if (!ref) continue;
    const dist = Math.hypot(f.cx - target.cx, f.cz - target.cz);
    if (!mejor || dist < mejor.dist) mejor = { frase: ref.frase, dist };
  }
  if (!mejor) return null;
  const metros = Math.round(mejor.dist);
  if (metros <= 1) return `Pegado a ${mejor.frase}`;
  return `A unos ${metros} m de ${mejor.frase}`;
}

export default function MiniMapa({
  fixtures,
  targetCode,
  ancho = 330,
}: MiniMapaProps) {
  const escena = useMemo(() => {
    if (fixtures.length === 0) return null;
    const code = targetCode.trim().toUpperCase();

    // Encuadre: todo lo que hay en la sede, más un metro de aire para que
    // nada quede pegado al borde.
    const M = 1;
    const minX = Math.min(...fixtures.map((f) => f.cx - Math.max(f.w, f.d) / 2)) - M;
    const maxX = Math.max(...fixtures.map((f) => f.cx + Math.max(f.w, f.d) / 2)) + M;
    const minZ = Math.min(...fixtures.map((f) => f.cz - Math.max(f.w, f.d) / 2)) - M;
    const maxZ = Math.max(...fixtures.map((f) => f.cz + Math.max(f.w, f.d) / 2)) + M;

    const anchoM = Math.max(maxX - minX, 0.1);
    const fondoM = Math.max(maxZ - minZ, 0.1);
    // El lienzo toma la forma de la tienda, dentro de los topes. Así la escala
    // la fija el ancho disponible y no se desperdicia mitad del dibujo en aire.
    const height = Math.round(
      Math.min(ALTO_MAX, Math.max(ALTO_MIN, (ancho * fondoM) / anchoM)),
    );
    // Una sola escala para los dos ejes: un plano deformado desorienta más de
    // lo que ayuda.
    const escala = Math.min(ancho / anchoM, height / fondoM);
    const wPx = anchoM * escala;
    const hPx = fondoM * escala;
    // Centrado dentro del lienzo.
    const offX = (ancho - wPx) / 2;
    const offY = (height - hPx) / 2;

    const px = (x: number) => offX + (x - minX) * escala;
    const py = (z: number) => offY + (z - minZ) * escala;

    let destino: Caja | null = null;
    const cajas: Caja[] = fixtures.map((f) => {
      const esDestino = f.code.toUpperCase() === code;
      const w = Math.max(f.w * escala, 3);
      const h = Math.max(f.d * escala, 3);
      const caja: Caja = {
        f,
        x: px(f.cx) - w / 2,
        y: py(f.cz) - h / 2,
        w,
        h,
        deg: ((f.rotY ?? 0) * 180) / Math.PI,
        destino: esDestino,
        color: esDestino
          ? "var(--accent)"
          : isRentable(f)
          ? GRIS_OTROS
          : GRIS_INFRA,
      };
      if (esDestino) destino = caja;
      return caja;
    });

    // Etiquetas de referencia: una sola por tipo, sobre el grupo más grande.
    // Repetir "Cajas" cinco veces sobre cinco cajas no orienta, ensucia.
    const etiquetas: { x: number; y: number; texto: string }[] = [];
    for (const [tipo, ref] of Object.entries(REFERENCIAS)) {
      const grupo = fixtures.filter((f) => f.type === tipo);
      if (grupo.length === 0) continue;
      const cx = grupo.reduce((a, f) => a + f.cx, 0) / grupo.length;
      const cz = grupo.reduce((a, f) => a + f.cz, 0) / grupo.length;
      etiquetas.push({ x: px(cx), y: py(cz), texto: ref.corto });
    }

    return { cajas, destino: destino as Caja | null, etiquetas, height };
  }, [fixtures, targetCode, ancho]);

  if (!escena) return null;
  const { cajas, destino, etiquetas, height } = escena;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${ancho} ${height}`}
      style={{ display: "block", borderRadius: "var(--r-md)", background: "var(--surface-2)" }}
      role="img"
      aria-label={
        destino
          ? `Plano de la tienda con ${destino.f.nomenclatura || destino.f.code} señalado`
          : "Plano de la tienda"
      }
    >
      {/* El resto de la tienda, apagado. Está para dar contexto, no para leerse. */}
      {cajas
        .filter((c) => !c.destino)
        .map((c) => (
          <rect
            key={c.f.id}
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={1.5}
            fill={c.color}
            opacity={0.55}
            transform={`rotate(${c.deg} ${c.x + c.w / 2} ${c.y + c.h / 2})`}
          />
        ))}

      {etiquetas.map((e) => (
        <text
          key={e.texto}
          x={e.x}
          y={e.y + 3}
          textAnchor="middle"
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            fill: "var(--ink-3)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {e.texto}
        </text>
      ))}

      {/* El destino: anillo, relleno y etiqueta. Todo el color del dibujo se
          gasta acá, que es lo único que hay que encontrar. */}
      {destino && (
        <g>
          <circle
            cx={destino.x + destino.w / 2}
            cy={destino.y + destino.h / 2}
            r={Math.max(destino.w, destino.h) / 2 + 11}
            fill="var(--accent)"
            opacity={0.13}
          />
          <circle
            cx={destino.x + destino.w / 2}
            cy={destino.y + destino.h / 2}
            r={Math.max(destino.w, destino.h) / 2 + 11}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.6}
          />
          <rect
            x={destino.x}
            y={destino.y}
            width={destino.w}
            height={destino.h}
            rx={1.5}
            fill="var(--accent)"
            transform={`rotate(${destino.deg} ${destino.x + destino.w / 2} ${destino.y + destino.h / 2})`}
          />
          {/* La etiqueta va sobre una pastilla opaca: sin fondo se montaba
              encima de los muebles vecinos y se volvía ilegible justo en la
              zona más cargada del plano, que es la que hay que leer. */}
          {(() => {
            const texto = destino.f.nomenclatura || destino.f.code;
            const anchoPastilla = texto.length * 5.6 + 10;
            const cxD = destino.x + destino.w / 2;
            const radio = Math.max(destino.w, destino.h) / 2 + 11;
            // Arriba salvo que no quepa: contra el borde superior se voltea.
            const arriba = destino.y + destino.h / 2 - radio - 13 > 2;
            const yPastilla = arriba
              ? destino.y + destino.h / 2 - radio - 13
              : destino.y + destino.h / 2 + radio + 3;
            return (
              <>
                <rect
                  x={cxD - anchoPastilla / 2}
                  y={yPastilla}
                  width={anchoPastilla}
                  height={13}
                  rx={6.5}
                  fill="var(--accent)"
                />
                <text
                  x={cxD}
                  y={yPastilla + 9.3}
                  textAnchor="middle"
                  style={{ fontSize: 9.5, fontWeight: 800, fill: "#fff" }}
                >
                  {texto}
                </text>
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
