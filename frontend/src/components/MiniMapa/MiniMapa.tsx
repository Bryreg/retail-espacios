import { useMemo } from "react";
import { footprint2D, isRentable, type UnifiedFixture } from "../../types/fixtures";

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
  /** Tope de alto. Sube cuando el plano es el instrumento de trabajo y no una
   *  miniatura de referencia. */
  altoMax?: number;
  /** Color de cada mueble que NO es el destino. Devolver null deja el gris.
   *  Sirve para pintar disponibilidad sin que este componente sepa nada de
   *  contratos ni de fechas. */
  colorDe?: (f: UnifiedFixture) => string | null;
  /** Hace el plano elegible: se recibe el código corto del mueble tocado.
   *  Sin esto el mapa es de solo lectura, como en la pantalla del montaje. */
  onElegir?: (codigoCorto: string) => void;
}

/** Alto mínimo y máximo del dibujo.
 *
 *  El alto NO es fijo: sale de la forma de la planta. Con un alto fijo, una
 *  tienda larga y angosta —que es la forma normal de un supermercado— se
 *  dibujaba a menos de 5 px por metro, y una punta de góndola de 0,9 × 0,4 m
 *  quedaba de cuatro píxeles. El mapa se veía; no se podía usar. El tope de
 *  arriba existe porque abajo del mapa todavía tienen que caber los dos
 *  botones grandes sin hacer scroll. */
const ALTO_MIN = 125;
const ALTO_MAX = 320;

interface Caja {
  f: UnifiedFixture;
  x: number;
  y: number;
  /** Ya con el giro aplicado, igual que el plano 2D: se intercambian ancho y
   *  fondo en vez de rotar el rectángulo, para que las dos vistas dibujen la
   *  misma huella. */
  w: number;
  h: number;
  destino: boolean;
  color: string;
}

/** Huella vista desde arriba, con el giro aplicado. */
function huellaDe(f: { w: number; d: number; rotY?: number }): { w: number; d: number } {
  return footprint2D(f);
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

  // La referencia más cercana que un humano reconozca sin plano, medida de
  // BORDE a borde y no de centro a centro.
  //
  // No es una sutileza: en NAVE la pared de refrigerados está dibujada como UN
  // mueble de 26 metros de ancho. Midiendo al centro, a una punta que está a
  // 3 m de la nevera se le decía "a 8 m", y con esa frase se camina para el
  // lado equivocado. Con datos reales, medir al centro se equivocaba en 11 de
  // los 19 espacios alquilables de esa sede.
  const t = huellaDe(target);
  let mejor: { frase: string; dist: number } | null = null;
  for (const f of fixtures) {
    if (f.id === target.id) continue;
    const ref = REFERENCIAS[f.type];
    if (!ref) continue;
    const o = huellaDe(f);
    const dx = Math.max(0, Math.abs(f.cx - target.cx) - (o.w + t.w) / 2);
    const dz = Math.max(0, Math.abs(f.cz - target.cz) - (o.d + t.d) / 2);
    const dist = Math.hypot(dx, dz);
    if (!mejor || dist < mejor.dist) mejor = { frase: ref.frase, dist };
  }
  if (!mejor) return null;
  // Ahora la distancia es el hueco real entre los dos muebles, así que
  // "pegado" quiere decir pegado.
  if (mejor.dist < 0.6) return `Pegado a ${mejor.frase}`;
  const metros = Math.max(1, Math.round(mejor.dist));
  return `A unos ${metros} m de ${mejor.frase}`;
}

export default function MiniMapa({
  fixtures,
  targetCode,
  ancho = 330,
  altoMax = ALTO_MAX,
  colorDe,
  onElegir,
}: MiniMapaProps) {
  const escena = useMemo(() => {
    if (fixtures.length === 0) return null;
    const code = targetCode.trim().toUpperCase();

    // Encuadre: todo lo que hay en la sede, más un metro de aire para que
    // nada quede pegado al borde.
    // Cada eje con SU medida, no con la mayor de las dos. Usar max(w, d) para
    // los dos lados parecía la opción segura y en NAVE infla el recinto casi al
    // doble de alto: la pared de refrigerados mide 26 m de ancho, así que
    // aportaba 13 m de margen también hacia arriba y hacia abajo. El plano
    // terminaba dibujado en la mitad del cuadro, con todo más chico de lo
    // necesario justo donde hay que encontrar una punta de 90 cm.
    const M = 1;
    const cajas0 = fixtures.map((f) => {
      const fp = footprint2D(f);
      return { x0: f.cx - fp.w / 2, x1: f.cx + fp.w / 2, z0: f.cz - fp.d / 2, z1: f.cz + fp.d / 2 };
    });
    const minX = Math.min(...cajas0.map((c) => c.x0)) - M;
    const maxX = Math.max(...cajas0.map((c) => c.x1)) + M;
    const minZ = Math.min(...cajas0.map((c) => c.z0)) - M;
    const maxZ = Math.max(...cajas0.map((c) => c.z1)) + M;

    const anchoM = Math.max(maxX - minX, 0.1);
    const fondoM = Math.max(maxZ - minZ, 0.1);
    // El lienzo toma la forma de la tienda, dentro de los topes. Así la escala
    // la fija el ancho disponible y no se desperdicia mitad del dibujo en aire.
    const height = Math.round(
      Math.min(altoMax, Math.max(ALTO_MIN, (ancho * fondoM) / anchoM)),
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
      const fp = footprint2D(f);
      const w = Math.max(fp.w * escala, 3);
      const h = Math.max(fp.d * escala, 3);
      const caja: Caja = {
        f,
        x: px(f.cx) - w / 2,
        y: py(f.cz) - h / 2,
        w,
        h,
        destino: esDestino,
        color: esDestino
          ? "var(--accent)"
          : colorDe?.(f) ?? (isRentable(f) ? GRIS_OTROS : GRIS_INFRA),
      };
      if (esDestino) destino = caja;
      return caja;
    });

    // Etiquetas de referencia: una sola por tipo, sobre el grupo más grande.
    // Repetir "Cajas" cinco veces sobre cinco cajas no orienta, ensucia.
    const etiquetas: { x: number; y: number; texto: string; ancho: number }[] = [];
    for (const [tipo, ref] of Object.entries(REFERENCIAS)) {
      const grupo = fixtures.filter((f) => f.type === tipo);
      if (grupo.length === 0) continue;
      const cx = grupo.reduce((a, f) => a + f.cx, 0) / grupo.length;
      const cz = grupo.reduce((a, f) => a + f.cz, 0) / grupo.length;
      const x = px(cx);
      const y = py(cz);
      // Una etiqueta encima de otra no orienta a nadie: en NAVE "CARNES" y
      // "NEVERAS" caían en el mismo lugar y se leían como una sola palabra.
      // Ante choque gana la primera y la segunda no se dibuja: el mapa igual
      // muestra el mueble, y una referencia clara vale más que dos ilegibles.
      const ancho = ref.corto.length * 5 + 6;
      const choca = etiquetas.some(
        (e) => Math.abs(e.x - x) < (ancho + e.ancho) / 2 && Math.abs(e.y - y) < 11,
      );
      if (choca) continue;
      etiquetas.push({ x, y, texto: ref.corto, ancho });
    }

    return { cajas, destino: destino as Caja | null, etiquetas, height };
  }, [fixtures, targetCode, ancho, altoMax, colorDe]);

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
            opacity={onElegir && colorDe?.(c.f) ? 0.9 : 0.55}
            style={onElegir && colorDe?.(c.f) ? { cursor: "pointer" } : undefined}
            onClick={onElegir && colorDe?.(c.f) ? () => onElegir(c.f.code) : undefined}
          >
            {onElegir && colorDe?.(c.f) && (
              <title>{`${c.f.nomenclatura || c.f.code} · ${c.f.label ?? ""}`}</title>
            )}
          </rect>
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
