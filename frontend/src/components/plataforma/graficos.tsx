/* ============================================================================
   RECABRA · Plataforma — los dibujos de A («El informe»)

   Diez componentes React PUROS. Cada uno recibe datos con los tipos reales de
   `src/api/plataforma.ts` y devuelve un `<figure class="plat-fig">` con un
   `<svg>` dibujado a mano. Sin librerías, sin estado, sin efectos, sin
   `fetch`: lo que entra es lo que se dibuja.

   Referencia exacta: las once figuras de
   `features/plataforma-asesoria/outputs/opciones/A-el-informe/index.html`.
   Ese archivo es un PROTOTIPO con datos inventados y con un bloque
   `_derivado_frontend` que el backend no devuelve; acá se porta el
   TRATAMIENTO sobre los shapes reales y lo derivado se calcula de las claves
   que sí existen. Nada se rellena: lo que la API no trae se dice.

   ── El contrato de todos ──────────────────────────────────────────────────

   · **Una sola escala por gráfico.** Nunca dos ejes. Donde hacen falta dos
     unidades hay dos componentes con la misma rejilla de meses
     (`DosLineasConteo` + `LineaIngreso`).
   · **La clave va DENTRO del dibujo**, con la palabra al lado de la marca.
     El color nunca lleva un dato solo.
   · **La marca de referencia y las anotaciones van sobre el dato**, no en un
     párrafo debajo.
   · **`<title>` y `aria-label`** en cada `<svg>`, y `tabla` opcional: la tabla
     equivalente del gráfico, alcanzable sin hover. No hay ni un tooltip.
   · **Cuerpo real en pantalla.** El `viewBox` mide lo mismo que la caja
     (`width:100% · min-width:W · height:H` + `xMinYMin meet`), así que el
     factor de escala es exactamente 1 en cualquier ancho: 11,5 px declarados
     son 11,5 px leídos. Los cuerpos salen de la escala `--t-*` de `tema.css`
     — y ninguno se agrandó respecto de A: donde A usaba un cuerpo que no está
     en la escala (11, 12, 13) se bajó al paso inmediatamente inferior.
   · **`--ink-4` no escribe.** Da 3,98:1 sobre el papel. Todo `<text>` va en
     `--ink-3` o más oscuro; `--ink-4` queda para rejillas y guías.
   · **`null` es «sin dato»**, nunca un cero dibujado.
   ========================================================================== */

import type { ReactNode } from "react";
import type {
  ClienteAdopcion,
  ClienteMetricas,
  EspacioDetalle,
  MovimientoMes,
  ProveedorDetalle,
  PuntoTendencia,
  ResumenTipoDetalle,
} from "../../api/plataforma";
import {
  CLASIFICACION_TXT,
  ESTADO_TXT,
  SIN_DATO,
  diasEntre,
  fechaCorta,
  mesCorto,
  num,
  pct,
  pctSig,
  plata,
  platM,
  plural,
  puntos,
  sig,
  tipoN,
} from "./formato";

// ═══════════════════════════════════════════════════════════════════════════
// 0 · La caja: tipografía, medidas y armazón compartidos
// ═══════════════════════════════════════════════════════════════════════════

/** Los cinco cuerpos que se usan adentro de un dibujo, con su token y su
 *  medida real. Ninguno pasa de 13,5 px (el techo de 30 px de la regla queda
 *  lejísimos) y ninguno baja de 10 px (el piso). Fuera de esta tabla no se
 *  escribe un `font-size` en todo el archivo. */
const VOZ = {
  min: { px: 10, css: "var(--t-3xs)" },   // el conteo de un grupo, el «sin snapshot»
  lbl: { px: 10.5, css: "var(--lbl-px)" }, // ejes, meses, anotaciones
  peq: { px: 11.5, css: "var(--t-2xs)" },  // rótulos de serie, cifras al final de barra
  med: { px: 12.5, css: "var(--t-xs)" },   // nombres de fila (sede, tipo, cliente)
  gde: { px: 13.5, css: "var(--t-sm)" },   // la cifra que encabeza un dibujo
} as const;

type Voz = keyof typeof VOZ;

/** Ancho aproximado de una cadena, para colocar sin pisar. Los dos factores
 *  salen de medir las pilas de sistema del producto con Playwright: 0,525 em
 *  por carácter en la sans y 0,601 em en la mono (que es de ancho fijo, así
 *  que ahí la cuenta es exacta). Se usa SIEMPRE del lado conservador: si el
 *  rótulo no entra de un lado, se voltea al otro. */
function anchoAprox(s: string, px: number, mono = false): number {
  return String(s).length * px * (mono ? 0.601 : 0.525);
}

interface TProps {
  x: number;
  y: number;
  voz?: Voz;
  /** `start` por defecto. */
  ancla?: "start" | "middle" | "end";
  peso?: 400 | 600 | 700;
  /** Siempre `--ink-1/2/3` o el `--entra-txt` del mes parcial. Nunca `--ink-4`
   *  (3,98:1 sobre el papel) y nunca el color del dato: la identidad la da la
   *  marca de al lado, no la letra (guion §4.4). */
  fill?: string;
  mono?: boolean;
  /** Un halo del color de la superficie alrededor de las letras, para cuando
   *  el rótulo cae encima de un trazo. Es el mismo recurso que el aire de 2 px
   *  entre marcas que se tocan (guion §4.4): la superficie separa, no un borde
   *  de otro color. */
  halo?: boolean;
  children: ReactNode;
}

/** Un `<text>` del sistema. `font-size` va por `style` y no por atributo: un
 *  atributo de presentación no resuelve `var(--t-2xs)`. */
function T({ x, y, voz = "peq", ancla = "start", peso = 400, fill = "var(--ink-3)", mono, halo, children }: TProps) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={ancla}
      fill={fill}
      stroke={halo ? "var(--surface)" : undefined}
      strokeWidth={halo ? 3 : undefined}
      paintOrder={halo ? "stroke" : undefined}
      style={{
        fontSize: VOZ[voz].css,
        fontWeight: peso,
        fontFamily: mono ? "var(--f-mono)" : "var(--f-text)",
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
      }}
    >
      {children}
    </text>
  );
}

/** El lienzo. Ver el contrato de tamaño arriba y el comentario de
 *  `.plat-fig` en `plataforma.css`. */
function Lienzo({ w, h, titulo, children }: { w: number; h: number; titulo: string; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={titulo}
      preserveAspectRatio="xMinYMin meet"
      style={{ width: "100%", minWidth: w, height: h }}
    >
      <title>{titulo}</title>
      {children}
    </svg>
  );
}

interface ColumnaTabla {
  k: string;
  t: string;
  num?: boolean;
}

interface TablaEquivalente {
  cols: ColumnaTabla[];
  filas: Array<Record<string, string | number | null>>;
  resumen?: string;
}

/** El armazón de toda figura: rótulo arriba (la frase que dice qué se ve),
 *  el dibujo, la clave si va afuera, y la tabla equivalente plegada.
 *
 *  La tabla equivalente vive SIEMPRE dentro del `<figure>`, y por eso hay dos
 *  puertas para ponerla: `tabla` (la que la figura arma sola con sus propias
 *  columnas) y `tablaNodo` (una tabla ya armada por quien llama, cuando las
 *  columnas o la voz son suyas — el riel de la sesión, el dumbbell del
 *  informe). Una tabla equivalente que se renderiza AL LADO de la figura, y no
 *  adentro, deja de leerse como el camino accesible del dibujo y pasa a
 *  contar como una tabla más sin conclusión propia. */
function Figura({
  titulo,
  rotulo,
  tabla,
  tablaNodo,
  resumenTabla,
  tablaAbierta,
  children,
}: {
  titulo: string;
  rotulo?: ReactNode;
  tabla?: TablaEquivalente | null;
  /** Una tabla equivalente ya armada. Manda sobre `tabla` si vienen las dos. */
  tablaNodo?: ReactNode;
  /** El texto del `<summary>` cuando la tabla viene de afuera. */
  resumenTabla?: string;
  tablaAbierta?: boolean;
  children: ReactNode;
}) {
  const cuerpoTabla = tablaNodo ?? (tabla ? <TablaDeFigura tabla={tabla} /> : null);
  return (
    <figure className="plat-fig">
      {rotulo ? <figcaption className="plat-fig-tit">{rotulo}</figcaption> : null}
      <div className="plat-fig-cuerpo">{children}</div>
      {cuerpoTabla ? (
        <details className="plat-tabla-eq" open={tablaAbierta}>
          <summary>{resumenTabla ?? tabla?.resumen ?? `Ver la tabla · ${titulo}`}</summary>
          <div>{cuerpoTabla}</div>
        </details>
      ) : null}
    </figure>
  );
}

function TablaDeFigura({ tabla }: { tabla: TablaEquivalente }) {
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            {tabla.cols.map((c) => (
              <th key={c.k} className={c.num ? "num" : undefined}>
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, i) => (
            <tr key={i}>
              {tabla.cols.map((c) => (
                <td key={c.k} className={c.num ? "num" : undefined}>
                  {f[c.k] === null || f[c.k] === undefined ? SIN_DATO : String(f[c.k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** El aviso que reemplaza a un dibujo cuando no hay con qué dibujarlo. Nunca
 *  se pinta un lienzo vacío ni una barra en cero: se dice qué falta. */
function SinDatos({ texto }: { texto: string }) {
  return (
    <figure className="plat-fig">
      <p className="plat-nota" style={{ marginTop: 0 }}>
        {texto}
      </p>
    </figure>
  );
}

/** Una marca de la clave, dibujada adentro del `<svg>`: cuadrito (relleno o
 *  hueco), punto o trazo, y a su derecha la palabra. */
function Clave({
  x,
  y,
  items,
}: {
  x: number;
  y: number;
  items: Array<{ t: string; c: string; forma?: "rect" | "punto" | "linea" | "hueco" | "anillo" }>;
}) {
  let cx = x;
  return (
    <g>
      {items.map((it, i) => {
        const forma = it.forma ?? "rect";
        const marca =
          forma === "punto" ? (
            <circle cx={cx + 5} cy={y} r={4.5} fill={it.c} />
          ) : forma === "anillo" ? (
            <circle cx={cx + 5} cy={y} r={4.5} fill="var(--surface)" stroke={it.c} strokeWidth={2} />
          ) : forma === "linea" ? (
            <rect x={cx} y={y - 1.5} width={14} height={3} rx={1.5} fill={it.c} />
          ) : forma === "hueco" ? (
            <rect x={cx + 1} y={y - 4} width={8} height={8} rx={2} fill="none" stroke={it.c} strokeWidth={2} />
          ) : (
            <rect x={cx} y={y - 5} width={10} height={10} rx={2} fill={it.c} />
          );
        const tx = cx + (forma === "linea" ? 19 : 15);
        const nodo = (
          <g key={i}>
            {marca}
            <T x={tx} y={y + 3.5} voz="lbl" fill="var(--ink-3)">
              {it.t}
            </T>
          </g>
        );
        cx = tx + anchoAprox(it.t, VOZ.lbl.px) + 22;
        return nodo;
      })}
    </g>
  );
}

/** Una anotación sobre el dato: el texto arriba, en su propia fila para que
 *  dos anotaciones no se toquen, y una guía de 1 px que baja hasta el punto
 *  del que habla. */
export interface Anotacion {
  /** Índice del punto de la serie que se anota. */
  i: number;
  /** El texto, ya con su cifra. */
  t: string;
  /** De qué lado del punto se escribe; si no entra, se voltea solo. */
  lado?: "izq" | "der";
}

function Anotaciones({
  anotaciones,
  X,
  yBase,
  yHasta,
  limite,
}: {
  anotaciones: Anotacion[];
  X: (i: number) => number;
  yBase: number;
  yHasta: number;
  limite: number;
}) {
  return (
    <g>
      {anotaciones.map((an, fila) => {
        const y = yBase + fila * 16;
        const xp = X(an.i);
        const w = anchoAprox(an.t, VOZ.lbl.px);
        let ax: number;
        let anc: "start" | "end";
        if (an.lado === "izq") {
          ax = xp - 7;
          anc = "end";
          if (ax - w < 2) {
            ax = xp + 7;
            anc = "start";
          }
        } else {
          ax = xp + 7;
          anc = "start";
          if (ax + w > limite) {
            ax = xp - 7;
            anc = "end";
          }
        }
        return (
          <g key={fila}>
            <T x={ax} y={y} voz="lbl" ancla={anc} peso={600} fill="var(--ink-2)">
              {an.t}
            </T>
            <line x1={xp} y1={y + 4} x2={xp} y2={yHasta} stroke="var(--ink-4)" strokeWidth={1} opacity={0.55} />
          </g>
        );
      })}
    </g>
  );
}

const COL_ESTADO: Record<EspacioDetalle["estado"], string> = {
  ocupado: "var(--ocupado)",
  se_libera: "var(--entra)",
  libre: "var(--libre)",
};

// ═══════════════════════════════════════════════════════════════════════════
// 1 · Derivados — lo que el prototipo traía masticado y acá se calcula
// ═══════════════════════════════════════════════════════════════════════════

/** Espacios ocupados de un punto de la tendencia. El backend publica
 *  `ocupacion_pct` y `espacios_comercializables`, no el conteo; el conteo es
 *  el producto, redondeado. `null` si falta cualquiera de los dos: no se
 *  dibuja un cero donde no hubo lectura. */
export function ocupadosDe(p: PuntoTendencia): number | null {
  if (p.ocupacion_pct === null || p.espacios_comercializables === null) return null;
  return Math.round((p.espacios_comercializables * p.ocupacion_pct) / 100);
}

/** El rótulo de la rejilla de doce meses, CON SU CIFRA — el ajuste (b) de la
 *  comparativa. Busca el salto de ocupación más grande entre dos meses
 *  consecutivos con dato y lo escribe:
 *
 *    «De mayo a junio la ocupación cayó 35,1 puntos, de 76,0 % a 40,9 %,
 *     y no se perdió una sola cara: entraron 108 espacios al denominador.»
 *
 *  La segunda mitad sólo aparece cuando el conteo de ocupados NO bajó — que
 *  es la trampa que este gráfico existe para desarmar. Si no hay dos meses
 *  con dato, devuelve `null` y la figura va sin rótulo (no se inventa uno). */
function rotuloRejillaMeses(serie: PuntoTendencia[]): string | null {
  let peor: { i: number; delta: number } | null = null;
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1];
    const b = serie[i];
    if (a.ocupacion_pct === null || b.ocupacion_pct === null) continue;
    const d = b.ocupacion_pct - a.ocupacion_pct;
    if (peor === null || Math.abs(d) > Math.abs(peor.delta)) peor = { i, delta: d };
  }
  if (peor === null) return null;
  const a = serie[peor.i - 1];
  const b = serie[peor.i];
  const verbo = peor.delta < 0 ? "cayó" : "subió";
  let frase =
    `De ${mesCorto(a.periodo)} a ${mesCorto(b.periodo)} la ocupación ${verbo} ` +
    `${puntos(peor.delta).replace(/^[+−]/, "")}, de ${pct(a.ocupacion_pct)} a ${pct(b.ocupacion_pct)}`;
  /* La segunda mitad es la que desarma la trampa: cuando la ocupación cae
     porque creció el denominador, decirlo con las dos cifras es la diferencia
     entre «se perdieron contratos» y «entró un plano nuevo». Sólo se escribe
     si el dato lo sostiene; nunca se afirma «no se perdió nada» sin mirar el
     conteo de ocupados. */
  const oa = ocupadosDe(a);
  const ob = ocupadosDe(b);
  const dDen = (b.espacios_comercializables ?? 0) - (a.espacios_comercializables ?? 0);
  if (peor.delta < 0 && dDen > 0) {
    frase += `, y entraron ${num(dDen)} espacios al denominador`;
    if (oa !== null && ob !== null) {
      frase += ob >= oa ? ` sin perder un solo ocupado (${num(oa)} → ${num(ob)})` : ` (ocupados ${num(oa)} → ${num(ob)})`;
    }
  }
  return frase + ".";
}

interface EstadoSede {
  sede: string;
  ocupado: number;
  se_libera: number;
  libre: number;
  total: number;
}

function estadosPorSede(espacios: EspacioDetalle[]): EstadoSede[] {
  const m = new Map<string, EstadoSede>();
  for (const e of espacios) {
    let o = m.get(e.sede);
    if (!o) {
      o = { sede: e.sede, ocupado: 0, se_libera: 0, libre: 0, total: 0 };
      m.set(e.sede, o);
    }
    o[e.estado]++;
    o.total++;
  }
  return [...m.values()];
}

/** La misma definición que `SedeDetalle.ocupacion_pct` del backend: un espacio
 *  que se libera dentro del periodo está OCUPADO hoy. */
function ocupacionSede(a: EstadoSede): number {
  return a.total === 0 ? 0 : ((a.ocupado + a.se_libera) / a.total) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 · MEDIDOR — «¿qué tan llena está la cartera?»
//     Un ratio contra un límite. 513 marcas (3.000 con 30 clientes) no
//     señalarían ningún lugar al que ir: a nivel de cartera no hay un espacio
//     concreto que abrir, así que la forma es el medidor y no las unidades.
//     La forma sigue al trabajo, y el trabajo cambia con el nivel.
// ═══════════════════════════════════════════════════════════════════════════

export function Medidor({
  ocupacionPct,
  espaciosComercializables,
  referencia,
  nota,
  titulo,
  tabla,
  tablaAbierta,
}: {
  /** `AgregadosMetricas.ocupacion_pct` — `null` es «sin dato». */
  ocupacionPct: number | null;
  /** `AgregadosMetricas.espacios_comercializables`. */
  espaciosComercializables: number;
  /** La marca de referencia: contra qué se lee. Típicamente el mes anterior. */
  referencia?: { pct: number; rotulo: string } | null;
  /** El «contra qué» escrito, al lado de la cifra. */
  nota?: string;
  titulo?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  if (ocupacionPct === null) {
    return (
      <SinDatos
        texto={`Sin ocupación para este periodo sobre ${plural(
          espaciosComercializables,
          "espacio comercializable",
          "espacios comercializables"
        )}. No es 0 %: es que no hay con qué calcularla.`}
      />
    );
  }

  const W = 900;
  /* 104 y no 96: la clave va dibujada DENTRO del lienzo (regla del port), y
     un texto con su descendente necesita el alto que ocupa de verdad. */
  const H = 104;
  const X0 = 0;
  const X1 = 690;
  const y = 44;
  const alto = 18;
  const X = (v: number) => X0 + ((X1 - X0) * Math.max(0, Math.min(100, v))) / 100;

  const ocupados = Math.round((espaciosComercializables * ocupacionPct) / 100);
  const libres = espaciosComercializables - ocupados;
  const tit =
    titulo ??
    `Medidor: la cartera está al ${pct(ocupacionPct)} de ocupación sobre ${num(
      espaciosComercializables
    )} espacios comercializables`;
  const cifra = `${pct(ocupacionPct)} ocupada`;

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: "Ver la tabla de la ocupación",
              cols: [
                { k: "q", t: "Qué" },
                { k: "v", t: "Espacios", num: true },
                { k: "p", t: "Sobre el total", num: true },
              ],
              filas: [
                { q: "Ocupados", v: num(ocupados), p: pct(ocupacionPct) },
                { q: "Para vender", v: num(libres), p: pct(100 - ocupacionPct) },
                { q: "Comercializables", v: num(espaciosComercializables), p: pct(100) },
                ...(referencia ? [{ q: referencia.rotulo, v: SIN_DATO, p: pct(referencia.pct) }] : []),
              ],
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        {/* La pista: el paso tenue de la tinta de dato, no un gris de sistema. */}
        <rect x={X0} y={y} width={X1 - X0} height={alto} rx={4} fill="var(--dato-tenue)" opacity={0.45} />
        <rect x={X0} y={y} width={X(ocupacionPct)} height={alto} rx={4} fill="var(--dato)" />

        {/* La marca de referencia, rotulada sobre el dato. */}
        {referencia ? (
          <g>
            <line x1={X(referencia.pct)} y1={y - 7} x2={X(referencia.pct)} y2={y + alto + 7} stroke="var(--ink-1)" strokeWidth={2} />
            <T x={X(referencia.pct) + 7} y={y + alto + 19} voz="lbl" fill="var(--ink-3)">
              {referencia.rotulo}
            </T>
          </g>
        ) : null}

        <T x={X0} y={y - 11} voz="gde" peso={700} fill="var(--ink-1)" mono>
          {cifra}
        </T>
        {nota ? (
          <T x={anchoAprox(cifra, VOZ.gde.px, true) + 8} y={y - 11} voz="peq" fill="var(--ink-3)">
            {nota}
          </T>
        ) : null}
        <T x={X1} y={y - 11} voz="peq" ancla="end" fill="var(--ink-3)">
          {`${num(espaciosComercializables)} comercializables`}
        </T>

        {/* La clave, adentro del dibujo. */}
        <Clave
          x={X0}
          y={y + alto + 32}
          items={[
            { t: `${num(ocupados)} ocupados`, c: "var(--dato)" },
            { t: `${num(libres)} para vender`, c: "var(--dato-tenue)" },
          ]}
        />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · DOS LÍNEAS DE CONTEO — «¿hacia dónde va la ocupación?»
//     El desvío medido de A: el denominador se mueve (445 → 553 → 587 → 513),
//     y una línea de porcentaje sobre eso dibuja un derrumbe que no ocurrió.
//     Con dos líneas de CONTEO en una sola escala de espacios, la ocupación
//     se lee como la brecha y el escalón está en el dato. Una escala, un eje.
// ═══════════════════════════════════════════════════════════════════════════

export function DosLineasConteo({
  serie,
  anotaciones = [],
  etiquetaTotal = "comercializables",
  etiquetaOcupados = "ocupados",
  rotulo,
  titulo,
  tabla,
  tablaAbierta,
}: {
  /** `Tendencia.serie` tal cual: siempre `meses` puntos consecutivos. */
  serie: PuntoTendencia[];
  anotaciones?: Anotacion[];
  etiquetaTotal?: string;
  etiquetaOcupados?: string;
  /** El rótulo con su cifra. Por defecto se calcula del dato
   *  (`rotuloRejillaMeses`); pasá `null` para no poner ninguno. */
  rotulo?: string | null;
  titulo?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  if (serie.length < 2) return <SinDatos texto="Sin serie: hacen falta al menos dos meses para dibujar una tendencia." />;

  const W = 940;
  const bandaAnot = 14 + anotaciones.length * 16;
  const H = bandaAnot + 188 + 30;
  const L = 52;
  const R = 152;
  const y0 = bandaAnot + 8;
  const y1 = bandaAnot + 176;
  const paso = (W - R - L) / (serie.length - 1);
  const X = (i: number) => L + i * paso;

  const max = serie.reduce((m, p) => Math.max(m, p.espacios_comercializables ?? 0), 0);
  const tope = Math.max(100, Math.ceil(max / 100) * 100);
  const Y = (v: number) => y1 - (v / tope) * (y1 - y0);

  const ult = serie[serie.length - 1];
  const vt = ult.espacios_comercializables;
  const vo = ocupadosDe(ult);

  const camino = (get: (p: PuntoTendencia) => number | null) => {
    let d = "";
    let prev = false;
    serie.forEach((p, i) => {
      const v = get(p);
      if (v === null || v === undefined) {
        prev = false;
        return;
      }
      d += (prev ? "L" : "M") + X(i) + " " + Y(v);
      prev = true;
    });
    return d;
  };

  /* Las dos etiquetas del extremo derecho son un bloque de dos renglones cada
     una (~30 px de alto). Cuando las dos series terminan cerca —un cliente
     casi vacío, o casi lleno— se pisan. Se separan lo mínimo necesario y se
     mueve la ETIQUETA, nunca el punto ni la línea: el dato queda donde está.
     Medido en la sesión de asesoría de un cliente con 12 espacios y 0
     contratos («comercializables» encima de «0»). */
  const SEP_ET = 32;
  let yTot = vt === null ? null : Y(vt);
  let yOcu = vo === null ? null : Y(vo);
  if (yTot !== null && yOcu !== null && Math.abs(yTot - yOcu) < SEP_ET) {
    const medio = (yTot + yOcu) / 2;
    yTot = Math.max(y0 + 6, medio - SEP_ET / 2);
    yOcu = Math.min(y1 - 2, yTot + SEP_ET);
  }

  const tit = titulo ?? "Espacios comercializables y ocupados, mes a mes, en una sola escala de conteo";
  const rot = rotulo === undefined ? rotuloRejillaMeses(serie) : rotulo;
  const marcas: number[] = [0, tope / 3, (tope * 2) / 3, tope];

  return (
    <Figura
      titulo={tit}
      rotulo={rot}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: `Ver la tabla de los ${serie.length} meses`,
              cols: [
                { k: "m", t: "Mes" },
                { k: "c", t: "Comercializables", num: true },
                { k: "o", t: "Ocupados", num: true },
                { k: "p", t: "Ocupación", num: true },
                { k: "n", t: "Nota" },
              ],
              filas: serie.map((p) => ({
                m: p.periodo,
                c: num(p.espacios_comercializables),
                o: num(ocupadosDe(p)),
                p: pct(p.ocupacion_pct),
                n: p.sin_dato ? "sin snapshot" : p.parcial ? "mes en curso · parcial" : "",
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        {/* Rejilla: 1 px sólido, nunca punteada. */}
        {marcas.map((t, i) => (
          <g key={i}>
            <line x1={L} y1={Y(t)} x2={W - R} y2={Y(t)} stroke="var(--line)" strokeWidth={1} />
            <T x={L - 8} y={Y(t) + 4} voz="lbl" ancla="end" fill="var(--ink-3)" mono>
              {num(t)}
            </T>
          </g>
        ))}
        <line x1={L} y1={y1} x2={W - R} y2={y1} stroke="var(--line-strong)" strokeWidth={1} />

        {/* La franja del mes en curso: sus números todavía se mueven. */}
        <rect x={X(serie.length - 1) - paso / 2} y={y0 - 6} width={paso / 2} height={y1 - y0 + 6} fill="var(--entra)" opacity={0.07} />
        <T x={X(serie.length - 1)} y={y0 - 10} voz="min" ancla="middle" peso={600} fill="var(--entra-txt)">
          parcial
        </T>

        {/* Los meses. */}
        {serie.map((p, i) => (
          <T
            key={p.periodo}
            x={X(i)}
            y={y1 + 18}
            voz="lbl"
            ancla="middle"
            fill={p.parcial ? "var(--entra-txt)" : "var(--ink-3)"}
          >
            {mesCorto(p.periodo)}
          </T>
        ))}

        {/* El hueco: un mes sin snapshot NO se une con una recta a sus vecinos. */}
        {serie.map((p, i) =>
          p.sin_dato ? (
            <g key={`h${i}`}>
              <line x1={X(i)} y1={y0} x2={X(i)} y2={y1} stroke="var(--resto)" strokeWidth={1} opacity={0.6} />
              <T x={X(i) + 6} y={y0 + 12} voz="min" fill="var(--ink-3)">
                sin snapshot
              </T>
            </g>
          ) : null
        )}

        <path
          d={camino((p) => p.espacios_comercializables)}
          fill="none"
          stroke="var(--dato-tenue)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={camino(ocupadosDe)}
          fill="none"
          stroke="var(--dato)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Etiqueta selectiva: sólo el punto actual, con anillo del color de
            la superficie para que los dos extremos no se peguen. */}
        {vt !== null ? (
          <g>
            <circle cx={X(serie.length - 1)} cy={Y(vt)} r={4.5} fill="var(--dato-tenue)" stroke="var(--surface)" strokeWidth={2} />
            <T x={W - R + 10} y={(yTot as number) + 1} voz="med" peso={700} fill="var(--ink-1)" mono>
              {num(vt)}
            </T>
            <T x={W - R + 10} y={(yTot as number) + 15} voz="lbl" fill="var(--ink-3)">
              {etiquetaTotal}
            </T>
          </g>
        ) : null}
        {vo !== null ? (
          <g>
            <circle cx={X(serie.length - 1)} cy={Y(vo)} r={4.5} fill="var(--dato)" stroke="var(--surface)" strokeWidth={2} />
            <T x={W - R + 10} y={(yOcu as number) + 1} voz="med" peso={700} fill="var(--ink-1)" mono>
              {num(vo)}
            </T>
            <T x={W - R + 10} y={(yOcu as number) + 15} voz="lbl" fill="var(--ink-3)">
              {etiquetaOcupados}
            </T>
          </g>
        ) : null}

        <Anotaciones anotaciones={anotaciones} X={X} yBase={14} yHasta={y0 - 2} limite={W - R} />
        <Clave
          x={L}
          y={H - 6}
          items={[
            { t: etiquetaTotal, c: "var(--dato-tenue)", forma: "linea" },
            { t: etiquetaOcupados, c: "var(--dato)", forma: "linea" },
            { t: "sin snapshot", c: "var(--resto)", forma: "linea" },
          ]}
        />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 · LÍNEA DE INGRESO — «¿hacia dónde va la plata?»
//     Su propio panel, con la MISMA rejilla de meses que el de arriba. Dos
//     unidades no comparten un eje: comparten un eje de tiempo.
// ═══════════════════════════════════════════════════════════════════════════

export function LineaIngreso({
  serie,
  anotaciones = [],
  titulo,
  rotulo,
  tabla,
  tablaAbierta,
}: {
  serie: PuntoTendencia[];
  anotaciones?: Anotacion[];
  titulo?: string;
  rotulo?: string | null;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  if (serie.length < 2) return <SinDatos texto="Sin serie: hacen falta al menos dos meses para dibujar una tendencia." />;

  const W = 940;
  const bandaAnot = 10 + anotaciones.length * 16;
  const H = bandaAnot + 134 + 30;
  const L = 64;
  const R = 152;
  const y0 = bandaAnot + 6;
  const y1 = bandaAnot + 118;
  const paso = (W - R - L) / (serie.length - 1);
  const X = (i: number) => L + i * paso;

  const max = serie.reduce((m, p) => Math.max(m, p.ingreso_contratado_mes ?? 0), 0);
  const tope = max > 0 ? Math.ceil(max / 50e6) * 50e6 : 50e6;
  const Y = (v: number) => y1 - (v / tope) * (y1 - y0);

  let d = "";
  let prev = false;
  serie.forEach((p, i) => {
    const v = p.ingreso_contratado_mes;
    if (v === null || v === undefined) {
      prev = false;
      return;
    }
    d += (prev ? "L" : "M") + X(i) + " " + Y(v);
    prev = true;
  });

  const ult = serie[serie.length - 1];
  const uv = ult.ingreso_contratado_mes;
  const tit = titulo ?? "Ingreso contratado del mes, mes a mes, en pesos";

  return (
    <Figura
      titulo={tit}
      rotulo={rotulo ?? undefined}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: `Ver la tabla del ingreso de ${serie.length} meses`,
              cols: [
                { k: "m", t: "Mes" },
                { k: "v", t: "Ingreso contratado", num: true },
                { k: "c", t: "Canon promedio", num: true },
                { k: "n", t: "Nota" },
              ],
              filas: serie.map((p) => ({
                m: p.periodo,
                v: plata(p.ingreso_contratado_mes),
                c: plata(p.canon_promedio_mensual),
                n: p.sin_dato ? "sin snapshot" : p.parcial ? "mes en curso · parcial" : "",
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        {[0, tope / 2, tope].map((t, i) => (
          <g key={i}>
            <line x1={L} y1={Y(t)} x2={W - R} y2={Y(t)} stroke="var(--line)" strokeWidth={1} />
            <T x={L - 8} y={Y(t) + 4} voz="lbl" ancla="end" fill="var(--ink-3)" mono>
              {t === 0 ? "0" : platM(t)}
            </T>
          </g>
        ))}
        <line x1={L} y1={y1} x2={W - R} y2={y1} stroke="var(--line-strong)" strokeWidth={1} />

        <rect x={X(serie.length - 1) - paso / 2} y={y0 - 4} width={paso / 2} height={y1 - y0 + 4} fill="var(--entra)" opacity={0.07} />

        {serie.map((p, i) => (
          <T
            key={p.periodo}
            x={X(i)}
            y={y1 + 18}
            voz="lbl"
            ancla="middle"
            fill={p.parcial ? "var(--entra-txt)" : "var(--ink-3)"}
          >
            {mesCorto(p.periodo)}
          </T>
        ))}
        {serie.map((p, i) =>
          p.sin_dato ? <line key={`h${i}`} x1={X(i)} y1={y0} x2={X(i)} y2={y1} stroke="var(--resto)" strokeWidth={1} opacity={0.6} /> : null
        )}

        <path d={d} fill="none" stroke="var(--dato)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {uv !== null && uv !== undefined ? (
          <g>
            <circle cx={X(serie.length - 1)} cy={Y(uv)} r={4.5} fill="var(--dato)" stroke="var(--surface)" strokeWidth={2} />
            <T x={W - R + 10} y={Y(uv) + 4} voz="peq" peso={700} fill="var(--ink-1)" mono>
              {platM(uv)}
            </T>
            {ult.parcial ? (
              <T x={W - R + 10} y={Y(uv) + 18} voz="min" peso={600} fill="var(--entra-txt)">
                parcial
              </T>
            ) : null}
          </g>
        ) : null}

        <Anotaciones anotaciones={anotaciones} X={X} yBase={12} yHasta={y0 - 2} limite={W - R} />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 · BARRAS DE SEDE — «¿qué sede rinde y cuál no?»
//     El largo son ESPACIOS, no porcentaje: con barras de % una sede de 12 y
//     una de 24 dibujan lo mismo y no son el mismo negocio. La peor arriba,
//     porque es la llamada. El «contra qué» no puede ser una línea vertical
//     única en un eje de conteos, así que es UNA MARCA POR BARRA, en el punto
//     donde terminaría lo ocupado si esa sede estuviera en el promedio del
//     cliente. Los tres estados con 2 px de aire de la superficie entre sí.
// ═══════════════════════════════════════════════════════════════════════════

export function BarrasSedes({
  espacios,
  promedioPct,
  titulo,
  etiquetaPromedio = "del cliente",
  tabla,
  tablaAbierta,
}: {
  /** `DetalleCliente.espacios` — el estado por espacio es lo único que
   *  permite partir la barra en tres; `sedes[]` sólo trae ocupados/libres. */
  espacios: EspacioDetalle[];
  /** La media del cliente (`AgregadosMetricasCliente.ocupacion_pct`, o la que
   *  salga del detalle). `null` deja las barras sin marca de referencia y lo
   *  dice en la clave. */
  promedioPct: number | null;
  titulo?: string;
  /** De quién es ese promedio, en palabras. Cambia de VOZ entre la sesión
   *  («del cliente») y el informe («de su red»); el default es la voz del
   *  operador y no cambia nada de lo que se dibuja. */
  etiquetaPromedio?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  const arr = estadosPorSede(espacios).sort((a, b) => ocupacionSede(a) - ocupacionSede(b));
  if (arr.length === 0) return <SinDatos texto="Este cliente no tiene espacios comercializables en el plano este periodo." />;

  const W = 940;
  const fila = 34;
  const H = arr.length * fila + 52;
  const L = 104;
  const X0 = L;
  const X1 = 700;
  const max = arr.reduce((m, a) => Math.max(m, a.total), 0);
  const esc = (v: number) => (max === 0 ? 0 : (v / max) * (X1 - X0));

  const tit =
    titulo ??
    `Ocupación por sede, la peor arriba: el largo de la barra son los espacios de la sede, no un porcentaje`;

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: `Ver la tabla de las ${arr.length} sedes`,
              cols: [
                { k: "s", t: "Sede" },
                { k: "t", t: "Espacios", num: true },
                { k: "o", t: "Ocupado", num: true },
                { k: "l", t: "Se libera", num: true },
                { k: "f", t: "Libre", num: true },
                { k: "p", t: "Ocupación", num: true },
              ],
              filas: arr.map((a) => ({
                s: a.sede,
                t: num(a.total),
                o: num(a.ocupado),
                l: num(a.se_libera),
                f: num(a.libre),
                p: pct(ocupacionSede(a)),
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        {arr.map((a, i) => {
          const y = 10 + i * fila;
          const h = 20;
          let x = X0;
          const tramos = (["ocupado", "se_libera", "libre"] as const).map((k) => {
            const w = esc(a[k]);
            const t = { k, x, w };
            x += w;
            return t;
          });
          const xr = promedioPct === null ? null : X0 + esc((a.total * promedioPct) / 100);
          return (
            <g key={a.sede}>
              <T x={L - 14} y={y + 14} voz="med" ancla="end" peso={600} fill="var(--ink-1)">
                {a.sede}
              </T>
              {tramos.map((t) =>
                t.w > 0 ? (
                  /* 2 px de aire del color de la superficie entre marcas que se
                     tocan: se restan del ancho, no se pinta un borde encima. */
                  <rect key={t.k} x={t.x} y={y} width={Math.max(t.w - 2, 1)} height={h} rx={3} fill={COL_ESTADO[t.k]} />
                ) : null
              )}
              {xr !== null ? <line x1={xr} y1={y - 5} x2={xr} y2={y + h + 5} stroke="var(--ink-1)" strokeWidth={2} /> : null}
              <T x={X0 + esc(a.total) + 10} y={y + 14} voz="peq" fill="var(--ink-2)">
                {`${num(a.total)} espacios · ${pct(ocupacionSede(a))} ocupada`}
              </T>
            </g>
          );
        })}
        <Clave
          x={L}
          y={H - 12}
          items={[
            { t: ESTADO_TXT.ocupado, c: "var(--ocupado)" },
            { t: ESTADO_TXT.se_libera, c: "var(--entra)" },
            { t: ESTADO_TXT.libre, c: "var(--libre)" },
            ...(promedioPct !== null
              ? [
                  {
                    t: `la marca: la sede al ${pct(promedioPct)} ${etiquetaPromedio}`,
                    c: "var(--ink-1)",
                    forma: "linea" as const,
                  },
                ]
              : [
                  {
                    t: `sin promedio ${etiquetaPromedio}: sin marca de referencia`,
                    c: "var(--resto)",
                    forma: "linea" as const,
                  },
                ]),
          ]}
        />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 · UNIDADES — «¿cuánto hay para vender?» / «¿quién no usa lo que paga?»
//     Un conteo se cuenta: una marca por espacio (o por cliente), agrupadas,
//     con la palabra al lado del color y el conteo por grupo. Acá sí las
//     marcas señalan un lugar: el bloque verde de la góndola ES el hallazgo.
// ═══════════════════════════════════════════════════════════════════════════

type TonoUnidad = "libre" | "se_libera" | "ocupado" | "dato" | "dato-hueco" | "resto";

const COL_UNIDAD: Record<TonoUnidad, { fill: string; hueco?: boolean }> = {
  libre: { fill: "var(--libre)" },
  se_libera: { fill: "var(--entra)" },
  ocupado: { fill: "var(--ocupado)" },
  dato: { fill: "var(--dato)" },
  "dato-hueco": { fill: "var(--dato)", hueco: true },
  resto: { fill: "var(--resto)" },
};

interface GrupoUnidades {
  etiqueta: string;
  /** El conteo del grupo, escrito. */
  sub?: string;
  /** Los nombres detrás del grupo (la lista de clientes de una clase). */
  detalle?: string;
  marcas: TonoUnidad[];
}

/** `DetalleCliente.espacios` + `resumen_por_tipo` → un grupo por tipo, lo
 *  ocupado primero, los tipos más grandes arriba. */
export function unidadesPorTipo(espacios: EspacioDetalle[], resumen: ResumenTipoDetalle[]): GrupoUnidades[] {
  const orden: Record<EspacioDetalle["estado"], number> = { ocupado: 0, se_libera: 1, libre: 2 };
  return resumen
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((g) => {
      const esp = espacios.filter((e) => e.tipo === g.tipo).sort((a, b) => orden[a.estado] - orden[b.estado]);
      return {
        etiqueta: tipoN(g.tipo),
        sub: `${num(g.total)} · ${num(g.libres)} libres`,
        marcas: esp.map((e) => e.estado as TonoUnidad),
      };
    });
}

/** `Adopcion.clientes` → un grupo por clase. Relleno = entró en 30 días;
 *  hueco = tiene cuentas y no entró; gris = no tiene cuentas, así que no se
 *  puede saber (y eso no es lo mismo que no haber entrado). */
export function unidadesAdopcion(clientes: ClienteAdopcion[]): GrupoUnidades[] {
  const orden = ["activa", "fantasma", "dormida", "sin_cuentas", "nueva"] as const;
  return orden.map((k) => {
    const arr = clientes.filter((c) => c.clasificacion === k);
    return {
      etiqueta: CLASIFICACION_TXT[k] ?? k,
      sub: plural(arr.length, "cliente", "clientes"),
      detalle: arr.map((c) => c.nombre).join(" · "),
      marcas: arr.map<TonoUnidad>((c) =>
        c.usuarios_con_cuenta === 0
          ? "resto"
          : c.dias_sin_acceso !== null && c.dias_sin_acceso <= 30
            ? "dato"
            : "dato-hueco"
      ),
    };
  });
}

export function Unidades({
  grupos,
  disposicion = "filas",
  clave,
  titulo,
  tabla,
  tablaAbierta,
}: {
  grupos: GrupoUnidades[];
  /** `filas`: un grupo por renglón, con la etiqueta a la izquierda y las
   *  marcas envolviendo (254 espacios por tipo). `columnas`: los grupos uno al
   *  lado del otro (5 clases de adopción con 6 clientes en total). */
  disposicion?: "filas" | "columnas";
  clave?: Array<{ t: string; c: string; forma?: "rect" | "hueco" }>;
  titulo?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  const vivos = grupos.filter((g) => g.marcas.length > 0 || g.sub);
  if (vivos.length === 0) return <SinDatos texto="Sin unidades que contar en este periodo." />;

  const W = 940;
  const total = vivos.reduce((s, g) => s + g.marcas.length, 0);
  const tit = titulo ?? `Una marca por unidad, agrupadas: ${num(total)} en ${plural(vivos.length, "grupo", "grupos")}`;
  const alturaClave = clave && clave.length ? 22 : 0;

  const tablaEq: TablaEquivalente | null = tabla
    ? {
        resumen: "Ver la tabla del conteo",
        cols: [
          { k: "g", t: "Grupo" },
          { k: "n", t: "Unidades", num: true },
          { k: "d", t: "Detalle" },
        ],
        filas: vivos.map((g) => ({ g: g.etiqueta, n: num(g.marcas.length), d: g.detalle ?? g.sub ?? "" })),
      }
    : null;

  if (disposicion === "columnas") {
    /* Las columnas ENVUELVEN. Antes se ponían una al lado de la otra sin mirar
       el ancho del lienzo, y un `detalle` largo —la lista de nombres de una
       clase de adopción— empujaba a las últimas más allá del `viewBox`, que
       recorta: el grupo entero desaparecía del dibujo sin decir nada. Un
       gráfico al que se le cae una categoría por el largo de un rótulo miente,
       así que la columna se limita al lienzo, el texto que no entra se corta
       (la lista completa vive en la tabla equivalente) y lo que no cabe en la
       banda baja a la siguiente. */
    const BANDA = 88;
    const cortar = (t: string, ancho: number): string => {
      if (anchoAprox(t, VOZ.min.px) <= ancho) return t;
      const cabe = Math.max(6, Math.floor(ancho / (VOZ.min.px * 0.525)) - 1);
      return t.slice(0, cabe).replace(/[\s·]+$/, "") + "…";
    };
    const bandas: Array<Array<{ g: GrupoUnidades; x: number; w: number }>> = [[]];
    let x = 0;
    vivos.forEach((g) => {
      const w = Math.min(W, Math.max(196, anchoAprox(g.detalle ?? "", VOZ.min.px) + 22));
      if (x > 0 && x + w > W) {
        bandas.push([]);
        x = 0;
      }
      bandas[bandas.length - 1].push({ g, x, w });
      x += w;
    });
    const H = bandas.length * BANDA + alturaClave;
    return (
      <Figura titulo={tit} tabla={tablaEq} tablaAbierta={tablaAbierta}>
        <Lienzo w={W} h={H} titulo={tit}>
          {bandas.map((banda, bi) =>
            banda.map(({ g, x: gx, w }) => {
              const y0 = bi * BANDA;
              return (
                <g key={g.etiqueta}>
                  <T x={gx} y={y0 + 14} voz="peq" peso={600} fill="var(--ink-1)">
                    {g.etiqueta}
                  </T>
                  <T x={gx} y={y0 + 30} voz="lbl" fill="var(--ink-3)">
                    {g.sub ?? plural(g.marcas.length, "unidad", "unidades")}
                  </T>
                  {g.marcas.map((m, j) => {
                    const c = COL_UNIDAD[m];
                    return c.hueco ? (
                      <rect key={j} x={gx + j * 20 + 1} y={y0 + 41} width={14} height={14} rx={3} fill="none" stroke={c.fill} strokeWidth={2} />
                    ) : (
                      <rect key={j} x={gx + j * 20} y={y0 + 40} width={16} height={16} rx={3} fill={c.fill} />
                    );
                  })}
                  {g.detalle ? (
                    <T x={gx} y={y0 + 72} voz="min" fill="var(--ink-3)">
                      {cortar(g.detalle, w - 22)}
                    </T>
                  ) : null}
                </g>
              );
            })
          )}
          {clave && clave.length ? (
            <Clave x={0} y={H - 6} items={clave.map((c) => ({ t: c.t, c: c.c, forma: c.forma ?? "rect" }))} />
          ) : null}
        </Lienzo>
      </Figura>
    );
  }

  const PITCH = 12;
  const LADO = 9;
  const POR = 46;
  const X0 = 196;
  const alturas = vivos.map((g) => Math.max(1, Math.ceil(g.marcas.length / POR)) * PITCH + 18);
  const H = alturas.reduce((a, b) => a + b, 0) + 8 + alturaClave;
  let y = 12;
  const filas = vivos.map((g, gi) => {
    const aqui = y;
    y += alturas[gi];
    return { g, y: aqui };
  });

  return (
    <Figura titulo={tit} tabla={tablaEq} tablaAbierta={tablaAbierta}>
      <Lienzo w={W} h={H} titulo={tit}>
        {filas.map(({ g, y: gy }) => (
          <g key={g.etiqueta}>
            <T x={X0 - 14} y={gy + 9} voz="med" ancla="end" peso={600} fill="var(--ink-1)">
              {g.etiqueta}
            </T>
            {g.sub ? (
              <T x={X0 - 14} y={gy + 24} voz="lbl" ancla="end" fill="var(--ink-3)">
                {g.sub}
              </T>
            ) : null}
            {g.marcas.map((m, i) => {
              const c = COL_UNIDAD[m];
              const cx = X0 + (i % POR) * PITCH;
              const cy = gy + Math.floor(i / POR) * PITCH;
              return c.hueco ? (
                <rect key={i} x={cx + 1} y={cy + 1} width={LADO - 2} height={LADO - 2} rx={2} fill="none" stroke={c.fill} strokeWidth={2} />
              ) : (
                <rect key={i} x={cx} y={cy} width={LADO} height={LADO} rx={2} fill={c.fill} />
              );
            })}
          </g>
        ))}
        {clave && clave.length ? (
          <Clave x={X0} y={H - 6} items={clave.map((c) => ({ t: c.t, c: c.c, forma: c.forma ?? "rect" }))} />
        ) : null}
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 · DUMBBELL — «¿cobra bien?»
//     Comparación contra una referencia, por tipo. Punto lleno = el cliente,
//     punto hueco (anillo del color de la superficie) = el benchmark de la
//     plataforma. Ordenado por brecha, el más negativo arriba. El tipo SIN
//     contratos vigentes no dibuja punto: dice que no tiene con qué compararse.
//     La tarifa de referencia del cliente NO aparece: no sale de su base.
// ═══════════════════════════════════════════════════════════════════════════

export function Dumbbell({
  resumen,
  benchmark,
  titulo,
  etiquetaCliente = "lo que cobra el cliente",
  etiquetaReferencia = "el promedio de la plataforma",
  nombreReferencia = "benchmark de la plataforma",
  tabla,
  tablaNodo,
  resumenTabla,
  tablaAbierta,
}: {
  /** `DetalleCliente.resumen_por_tipo` — `canon_promedio` es `null` con cero
   *  contratos vigentes de ese tipo. */
  resumen: ResumenTipoDetalle[];
  /** `DetalleCliente.benchmark_plataforma`: `{tipo: promedio}`. */
  benchmark: Record<string, number>;
  titulo?: string;
  /** Las tres palabras del dibujo que cambian de VOZ entre la sesión (el
   *  operador habla del cliente) y el informe (el cliente se lee a sí mismo,
   *  y la palabra «benchmark» es interna). Los defaults son la voz del
   *  operador: pasarlas es opcional y no cambia nada de lo que se dibuja. */
  etiquetaCliente?: string;
  etiquetaReferencia?: string;
  nombreReferencia?: string;
  tabla?: boolean;
  /** La tabla ya armada por quien llama. El informe la escribe en la voz del
   *  cliente («lo que usted cobra»), no en la del operador. */
  tablaNodo?: ReactNode;
  resumenTabla?: string;
  tablaAbierta?: boolean;
}) {
  const arr = resumen
    .map((r) => {
      const b = benchmark[r.tipo];
      const bench = typeof b === "number" ? b : null;
      const brecha = r.canon_promedio !== null && bench !== null && bench !== 0 ? (r.canon_promedio / bench - 1) * 100 : null;
      return { tipo: r.tipo, cliente: r.canon_promedio, bench, brecha };
    })
    .filter((a) => a.cliente !== null || a.bench !== null)
    .sort((a, b) => {
      if (a.brecha === null) return 1;
      if (b.brecha === null) return -1;
      return a.brecha - b.brecha;
    });

  if (arr.length === 0) return <SinDatos texto={`Sin tipos de espacio con canon propio ni ${nombreReferencia} para comparar.`} />;

  const W = 940;
  const fila = 32;
  const H = arr.length * fila + 62;
  const L = 190;
  const X0 = L;
  const X1 = 690;
  const max = arr.reduce((m, a) => Math.max(m, a.cliente ?? 0, a.bench ?? 0), 0);
  const tope = max > 0 ? Math.ceil(max / 500000) * 500000 : 500000;
  const esc = (v: number) => (v / tope) * (X1 - X0);

  const tit = titulo ?? "Canon promedio del cliente contra el promedio de la plataforma, por tipo de espacio";

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tablaNodo={tablaNodo}
      resumenTabla={resumenTabla}
      tabla={
        tabla
          ? {
              resumen: `Ver la tabla de los ${arr.length} tipos`,
              cols: [
                { k: "t", t: "Tipo" },
                { k: "c", t: "Canon del cliente", num: true },
                { k: "b", t: nombreReferencia, num: true },
                { k: "g", t: "Brecha", num: true },
              ],
              filas: arr.map((a) => ({
                t: tipoN(a.tipo),
                c: a.cliente === null ? "sin contratos" : plata(a.cliente),
                b: plata(a.bench),
                g: a.brecha === null ? "sin referencia" : pctSig(a.brecha),
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        {[0, tope / 4, tope / 2, (tope * 3) / 4, tope].map((t, i) => (
          <g key={i}>
            <line x1={X0 + esc(t)} y1={26} x2={X0 + esc(t)} y2={26 + arr.length * fila} stroke="var(--line)" strokeWidth={1} />
            <T x={X0 + esc(t)} y={18} voz="lbl" ancla="middle" fill="var(--ink-3)" mono>
              {t === 0 ? "0" : platM(t)}
            </T>
          </g>
        ))}
        {arr.map((a, i) => {
          const y = 42 + i * fila;
          if (a.cliente === null) {
            return (
              <g key={a.tipo}>
                <T x={L - 14} y={y + 4} voz="med" ancla="end" peso={600} fill="var(--ink-1)">
                  {tipoN(a.tipo)}
                </T>
                <T x={X0 + 4} y={y + 4} voz="peq" fill="var(--ink-3)">
                  {`sin contratos de este tipo · precio sugerido = ${nombreReferencia} ${plata(a.bench)}`}
                </T>
              </g>
            );
          }
          const xc = X0 + esc(a.cliente);
          const xb = a.bench === null ? xc : X0 + esc(a.bench);
          return (
            <g key={a.tipo}>
              <T x={L - 14} y={y + 4} voz="med" ancla="end" peso={600} fill="var(--ink-1)">
                {tipoN(a.tipo)}
              </T>
              <line
                x1={Math.min(xc, xb)}
                y1={y}
                x2={Math.max(xc, xb)}
                y2={y}
                stroke="var(--dato-tenue)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              {a.bench !== null ? <circle cx={xb} cy={y} r={5.5} fill="var(--surface)" stroke="var(--dato)" strokeWidth={2} /> : null}
              <circle cx={xc} cy={y} r={5.5} fill="var(--dato)" stroke="var(--surface)" strokeWidth={2} />
              <T x={X1 + 16} y={y + 4} voz="med" peso={700} fill="var(--ink-1)" mono>
                {a.brecha === null ? "sin referencia" : pctSig(a.brecha)}
              </T>
              <T x={X1 + 86} y={y + 4} voz="lbl" fill="var(--ink-3)">
                {`${plata(a.cliente)} vs ${plata(a.bench)}`}
              </T>
            </g>
          );
        })}
        <Clave
          x={L}
          y={H - 12}
          items={[
            { t: etiquetaCliente, c: "var(--dato)", forma: "punto" },
            { t: etiquetaReferencia, c: "var(--dato)", forma: "anillo" },
          ]}
        />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 8 · EJE DEL SPREAD — «¿quién cobra por debajo de lo que dice que vale?»
//     Puntos sobre un eje con el CERO marcado fuerte: la polaridad la lleva la
//     posición, que es un canal más fuerte que el tono y no colisiona con los
//     estados de espacio. El cliente sin tarifa configurada NO se dibuja en
//     cero — se cuenta aparte, con su nombre: cero y «no se puede saber» son
//     dos cosas distintas. La tarifa en sí nunca aparece: sólo la relación.
// ═══════════════════════════════════════════════════════════════════════════

export function EjeSpread({
  clientes,
  titulo,
  tabla,
  tablaAbierta,
}: {
  /** `MetricasPlataforma.clientes`. */
  clientes: ClienteMetricas[];
  titulo?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  const con = clientes
    .filter((c) => c.metricas !== null && c.metricas.spread_pct !== null)
    .sort((a, b) => (a.metricas!.spread_pct as number) - (b.metricas!.spread_pct as number));
  const sinTarifa = clientes.filter((c) => c.metricas !== null && c.metricas.spread_pct === null);
  const ilegibles = clientes.filter((c) => c.metricas === null);

  if (con.length === 0) {
    return (
      <SinDatos
        texto={`Ningún cliente legible tiene spread calculable este periodo: ${plural(
          sinTarifa.length,
          "cliente sin tarifa aplicable",
          "clientes sin tarifa aplicable"
        )} y ${plural(ilegibles.length, "base ilegible", "bases ilegibles")}. No se dibuja un cero en su lugar.`}
      />
    );
  }

  const W = 940;
  const filaAlto = 30;
  const H = 48 + con.length * filaAlto + 40;
  const L = 196;
  const R = 200;
  const y0 = 44;
  const valores = con.map((c) => c.metricas!.spread_pct as number);
  const min = Math.min(-20, Math.floor(Math.min(...valores) / 5) * 5);
  const max = Math.max(6, Math.ceil(Math.max(...valores) / 5) * 5 + 1);
  const X = (v: number) => L + ((v - min) / (max - min)) * (W - R - L);
  const marcas: number[] = [];
  for (let t = Math.ceil(min / 5) * 5; t <= max; t += 5) marcas.push(t);

  const tit = titulo ?? "Spread por cliente: puntos sobre un eje con el cero marcado — negativo es cobrar por debajo de su propia tarifa";

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: "Ver la tabla del spread",
              cols: [
                { k: "n", t: "Cliente" },
                { k: "s", t: "Spread", num: true },
                { k: "i", t: "Ingreso del mes", num: true },
                { k: "x", t: "Contratos sin tarifa", num: true },
                { k: "o", t: "Nota" },
              ],
              filas: [
                ...con.map((c) => ({
                  n: c.nombre,
                  s: pctSig(c.metricas!.spread_pct),
                  i: plata(c.metricas!.ingreso_contratado_mes),
                  x: num(c.metricas!.contratos_sin_tarifa),
                  o: "",
                })),
                ...sinTarifa.map((c) => ({
                  n: c.nombre,
                  s: SIN_DATO,
                  i: plata(c.metricas!.ingreso_contratado_mes),
                  x: num(c.metricas!.contratos_sin_tarifa),
                  o: c.metricas!.tarifa_configurada ? "tarifa cargada, ningún contrato con tarifa aplicable" : "sin tarifa de referencia cargada",
                })),
                ...ilegibles.map((c) => ({ n: c.nombre, s: SIN_DATO, i: SIN_DATO, x: SIN_DATO, o: "base ilegible este periodo" })),
              ],
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        <line x1={L} y1={y0 - 16} x2={W - R} y2={y0 - 16} stroke="var(--line-strong)" strokeWidth={1} />
        {marcas.map((t) => (
          <g key={t}>
            <line x1={X(t)} y1={y0 - 16} x2={X(t)} y2={y0 - 11} stroke="var(--line-strong)" strokeWidth={1} />
            <T x={X(t)} y={y0 - 22} voz="lbl" ancla="middle" fill="var(--ink-3)" mono>
              {(t > 0 ? "+" : t < 0 ? "−" : "") + Math.abs(t) + " %"}
            </T>
          </g>
        ))}
        {/* El cero, dibujado fuerte: es la referencia contra la que se lee todo. */}
        <line x1={X(0)} y1={y0 - 16} x2={X(0)} y2={y0 - 16 + con.length * filaAlto + 4} stroke="var(--ink-1)" strokeWidth={1.5} />
        <T x={X(0) + 7} y={y0 - 16 + con.length * filaAlto + 18} voz="lbl" fill="var(--ink-3)">
          cero = su propia tarifa de referencia
        </T>

        {con.map((c, i) => {
          const y = y0 + i * filaAlto;
          const v = c.metricas!.spread_pct as number;
          const et = pctSig(v);
          /* La cifra va del lado de afuera del punto — salvo cuando de ese
             lado ya no hay lienzo y se metería encima del nombre del cliente
             (el peor spread queda pegado al borde izquierdo del eje). Ahí se
             voltea al lado de adentro: un rótulo pisado no es un rótulo. */
          const anchoEt = anchoAprox(et, VOZ.peq.px, true);
          const cabeAfuera = v < 0 ? X(v) - 11 - anchoEt > L : X(v) + 11 + anchoEt < W - R;
          const aLaIzquierda = v < 0 ? cabeAfuera : !cabeAfuera;
          return (
            <g key={c.slug}>
              <T x={L - 14} y={y + 4} voz="med" ancla="end" peso={600} fill="var(--ink-1)">
                {c.nombre}
              </T>
              <line x1={X(0)} y1={y} x2={X(v)} y2={y} stroke="var(--dato-tenue)" strokeWidth={3} strokeLinecap="round" />
              <circle cx={X(v)} cy={y} r={5.5} fill="var(--dato)" stroke="var(--surface)" strokeWidth={2} />
              <T
                x={aLaIzquierda ? X(v) - 11 : X(v) + 11}
                y={y + 4}
                voz="peq"
                ancla={aLaIzquierda ? "end" : "start"}
                peso={700}
                fill="var(--ink-1)"
                mono
                halo={!cabeAfuera}
              >
                {et}
              </T>
              <T x={W - R + 8} y={y + 4} voz="lbl" fill="var(--ink-3)">
                {`sobre ${plata(c.metricas!.ingreso_contratado_mes)}`}
              </T>
            </g>
          );
        })}

        {/* Los que no se dibujan, contados: es parte del gráfico, no una nota. */}
        {sinTarifa.length > 0 || ilegibles.length > 0 ? (
          <T x={L} y={H - 8} voz="lbl" fill="var(--ink-3)">
            {[
              sinTarifa.length > 0
                ? `${plural(sinTarifa.length, "cliente", "clientes")} sin spread calculable (${sinTarifa.map((c) => c.nombre).join(" · ")}): no se dibujan en cero`
                : "",
              ilegibles.length > 0 ? `${plural(ilegibles.length, "base ilegible", "bases ilegibles")}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </T>
        ) : null}
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 9 · ÉNFASIS — «¿de quién depende?»
//     Partes de un total, ranking. Veinticinco barras no contestan una
//     pregunta que tiene UNA respuesta: el primero en la tinta de dato, los
//     siguientes en el paso tenue, y todo el resto en un solo bloque gris con
//     su conteo. El umbral de concentración va como línea vertical rotulada.
//     Las 25 filas viven en la tabla equivalente.
// ═══════════════════════════════════════════════════════════════════════════

export function Enfasis({
  proveedores,
  top = 5,
  umbralPct = 40,
  titulo,
  tabla,
  tablaAbierta,
}: {
  /** `DetalleCliente.proveedores`, ya saneados y ordenados por el backend. */
  proveedores: ProveedorDetalle[];
  top?: number;
  umbralPct?: number;
  titulo?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  if (proveedores.length === 0) return <SinDatos texto="Este cliente no tiene proveedores con contratos vigentes este periodo." />;

  const cab = proveedores.slice(0, top);
  const resto = proveedores.slice(top);
  const filas = cab.map((p, i) => ({
    n: p.nombre,
    v: p.participacion_pct,
    c: p.espacios,
    plataV: p.canon_total,
    color: i === 0 ? "var(--dato)" : "var(--dato-tenue)",
  }));
  if (resto.length > 0) {
    filas.push({
      n: `otros ${resto.length} proveedores`,
      v: Math.round(resto.reduce((a, p) => a + p.participacion_pct, 0) * 10) / 10,
      c: resto.reduce((a, p) => a + p.espacios, 0),
      plataV: resto.reduce((a, p) => a + p.canon_total, 0),
      color: "var(--resto)",
    });
  }

  const W = 940;
  const fila = 30;
  const H = filas.length * fila + 66;
  const L = 206;
  const X0 = L;
  const X1 = 690;
  const MAX = Math.max(umbralPct + 5, Math.ceil(Math.max(...filas.map((f) => f.v)) / 5) * 5 + 5);
  const esc = (v: number) => (v / MAX) * (X1 - X0);
  const xu = X0 + esc(umbralPct);

  const tit = titulo ?? `Participación de los proveedores sobre los contratos del cliente, con el umbral de concentración del ${pct(umbralPct, 0)}`;

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: `Ver la tabla de los ${proveedores.length} proveedores`,
              cols: [
                { k: "n", t: "Proveedor" },
                { k: "e", t: "Espacios", num: true },
                { k: "p", t: "Participación", num: true },
                { k: "c", t: "Canon total", num: true },
                { k: "v", t: "Vencen a 60 d", num: true },
                { k: "d", t: "Desde" },
              ],
              filas: proveedores.map((p) => ({
                n: p.nombre,
                e: num(p.espacios),
                p: pct(p.participacion_pct),
                c: plata(p.canon_total),
                v: num(p.contratos_por_vencer_60d),
                d: p.desde ?? SIN_DATO,
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        <line x1={xu} y1={28} x2={xu} y2={28 + filas.length * fila} stroke="var(--ink-1)" strokeWidth={1.5} />
        <T x={xu - 8} y={20} voz="lbl" ancla="end" peso={600} fill="var(--ink-2)">
          {`umbral de concentración · ${pct(umbralPct, 0)}`}
        </T>
        {filas.map((f, i) => {
          const y = 32 + i * fila;
          const et = `${pct(f.v)} · ${plural(f.c, "espacio", "espacios")} · ${plata(f.plataV)}`;
          /* La cifra va al final de su barra, salvo que ahí la cruce la línea
             del umbral: entonces arranca del otro lado. Una etiqueta partida
             en dos por una guía se lee mal y la guía deja de guiar. */
          let ex = X0 + esc(f.v) + 10;
          if (ex < xu + 6 && ex + anchoAprox(et, VOZ.peq.px) > xu - 6) ex = xu + 7;
          return (
            <g key={f.n}>
              <T x={L - 14} y={y + 14} voz="med" ancla="end" peso={i === 0 ? 700 : 400} fill={i === 0 ? "var(--ink-1)" : "var(--ink-2)"}>
                {f.n}
              </T>
              <rect x={X0} y={y} width={Math.max(esc(f.v), 2)} height={19} rx={3} fill={f.color} />
              <T x={ex} y={y + 14} voz="peq" fill="var(--ink-2)">
                {et}
              </T>
            </g>
          );
        })}
        <Clave
          x={L}
          y={H - 12}
          items={[
            { t: "el proveedor del que más depende", c: "var(--dato)" },
            { t: `los ${Math.max(0, cab.length - 1)} siguientes`, c: "var(--dato-tenue)" },
            ...(resto.length > 0 ? [{ t: `los otros ${resto.length}, juntos`, c: "var(--resto)" }] : []),
          ]}
        />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 10 · RIEL DE VENCIMIENTOS — «¿qué se cae y cuándo?»
//      Hechos con fecha sobre un eje de tiempo de 60 días, que es la ventana
//      que el backend mira (`contratos_por_vencer_60d`). Un riel de 90 con
//      datos de 60 deja un tercio vacío que se lee como «acá no vence nada», y
//      no es cierto: es que no se mira. Hoy y el fin del periodo marcados, y
//      DOS TRAMOS rotulados con su conteo y su plata.
// ═══════════════════════════════════════════════════════════════════════════

export function RielVencimientos({
  espacios,
  hasta,
  hoy,
  etiquetaOrigen = "hoy",
  dias = 60,
  titulo,
  tabla,
  tablaNodo,
  resumenTabla,
  tablaAbierta,
}: {
  /** `DetalleCliente.espacios` — los que tienen contrato traen
   *  `dias_para_vencer`. */
  espacios: EspacioDetalle[];
  /** `DetalleCliente.hasta` (`"YYYY-MM-DD"`): el fin del periodo. */
  hasta: string;
  /** El día que representa el CERO del riel, `"YYYY-MM-DD"`. Tiene que ser el
   *  mismo desde el que el backend cuenta `dias_para_vencer`, que es
   *  `(contrato.fin − desde).days` — o sea `DetalleCliente.desde`, el primer
   *  día del periodo, NO la fecha de hoy. Con la fecha de hoy el corte de fin
   *  de periodo cae unos días antes de donde va y un contrato que vence dentro
   *  del mes aparece del lado de afuera. Sin este dato el corte no se dibuja
   *  (nunca se adivina). */
  hoy?: string;
  /** Cómo se rotula ese cero. El default es «hoy» para no cambiarle el dibujo
   *  a nadie; con el cero en el primer día del periodo, quien llama pasa esa
   *  fecha («1 sep»), que es lo que el eje dice de verdad. */
  etiquetaOrigen?: string;
  dias?: number;
  titulo?: string;
  tabla?: boolean;
  /** La lista de contratos ya armada por quien llama (la sesión la escribe con
   *  sus propias columnas y su total). Va DENTRO de la figura, como todas. */
  tablaNodo?: ReactNode;
  resumenTabla?: string;
  tablaAbierta?: boolean;
}) {
  const vencen = espacios
    .filter((e) => e.contrato !== null && e.contrato.dias_para_vencer <= dias)
    .map((e) => ({
      codigo: e.codigo,
      sede: e.sede,
      tipo: e.tipo,
      estado: e.estado,
      proveedor: e.contrato!.proveedor,
      canon: e.contrato!.canon_mensual,
      d: e.contrato!.dias_para_vencer,
      fin: e.contrato!.fin,
    }))
    .sort((a, b) => a.d - b.d);

  if (vencen.length === 0) {
    return <SinDatos texto={`Ningún contrato vence en los próximos ${dias} días. La ventana que mira el sistema es de ${dias} días: más allá no hay dato, no es que no haya vencimientos.`} />;
  }

  const corte = hoy ? diasEntre(hoy, hasta) : null;
  const W = 940;
  const H = 128;
  const L = 62;
  const R = 70;
  const X1 = W - R;
  const dMin = Math.min(0, vencen[0].d);
  const X = (d: number) => L + ((d - dMin) / (dias - dMin)) * (X1 - L);
  const yr = 68;

  const ticks: number[] = [];
  for (let d = 0; d <= dias; d += Math.max(5, Math.round(dias / 4))) ticks.push(d);

  const cortar = corte !== null && corte > dMin && corte < dias ? corte : null;
  const dentro = cortar === null ? vencen : vencen.filter((v) => v.d <= cortar);
  const fuera = cortar === null ? [] : vencen.filter((v) => v.d > cortar);
  const suma = (l: typeof vencen) => l.reduce((s, v) => s + v.canon, 0);

  const tit =
    titulo ?? `Riel de ${dias} días: ${plural(vencen.length, "contrato que vence", "contratos que vencen")} por ${plata(suma(vencen))} al mes`;

  const tramos = cortar === null
    ? [{ a: dMin, b: dias, lista: vencen, et: `próximos ${dias} días` }]
    : [
        { a: dMin, b: cortar, lista: dentro, et: "dentro del periodo" },
        { a: cortar, b: dias, lista: fuera, et: "después del periodo" },
      ];

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tablaNodo={tablaNodo}
      resumenTabla={resumenTabla}
      tabla={
        tabla
          ? {
              resumen: `Ver la lista de los ${vencen.length} contratos, por fecha`,
              cols: [
                { k: "f", t: "Vence" },
                { k: "d", t: "Días", num: true },
                { k: "p", t: "Proveedor" },
                { k: "c", t: "Código" },
                { k: "t", t: "Tipo" },
                { k: "v", t: "Canon", num: true },
                { k: "e", t: "Estado del espacio" },
              ],
              filas: vencen.map((v) => ({
                f: fechaCorta(v.fin),
                d: num(v.d),
                p: v.proveedor,
                c: v.codigo,
                t: tipoN(v.tipo),
                v: plata(v.canon),
                e: ESTADO_TXT[v.estado],
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        <line x1={L} y1={yr} x2={X1} y2={yr} stroke="var(--line-strong)" strokeWidth={1} />
        {ticks.map((d) => (
          <g key={d}>
            <line x1={X(d)} y1={yr} x2={X(d)} y2={yr + 5} stroke="var(--line-strong)" strokeWidth={1} />
            <T x={X(d)} y={yr + 20} voz="lbl" ancla="middle" fill="var(--ink-3)">
              {d === 0 ? etiquetaOrigen : `+${d} d`}
            </T>
          </g>
        ))}
        <line x1={X(0)} y1={yr - 42} x2={X(0)} y2={yr + 5} stroke="var(--ink-1)" strokeWidth={1.5} />
        {cortar !== null ? (
          <g>
            <line x1={X(cortar)} y1={yr - 42} x2={X(cortar)} y2={yr + 5} stroke="var(--ink-1)" strokeWidth={2} strokeDasharray="0" />
            <T x={X(cortar) + 8} y={yr - 34} voz="lbl" peso={600} fill="var(--ink-2)">
              {`fin del periodo · ${fechaCorta(hasta)}`}
            </T>
          </g>
        ) : null}

        {tramos.map((t, i) => (
          <g key={i}>
            <rect x={X(t.a)} y={yr - 14} width={Math.max(X(t.b) - X(t.a), 1)} height={28} fill="var(--dato)" opacity={0.07} />
            <T x={(X(t.a) + X(t.b)) / 2} y={yr + 40} voz="peq" ancla="middle" peso={600} fill="var(--ink-2)">
              {`${t.et} · ${plural(t.lista.length, "contrato", "contratos")} · ${plata(suma(t.lista))}`}
            </T>
          </g>
        ))}

        {vencen.map((v) => (
          <circle key={v.codigo} cx={X(v.d)} cy={yr} r={5.5} fill="var(--dato)" stroke="var(--surface)" strokeWidth={2} />
        ))}

        <Clave
          x={L}
          y={H - 6}
          items={[
            { t: "un contrato que vence", c: "var(--dato)", forma: "punto" },
            { t: `${etiquetaOrigen} y el fin del periodo`, c: "var(--ink-1)", forma: "linea" },
          ]}
        />
      </Lienzo>
    </Figura>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 11 · BARRAS DIVERGENTES — «¿qué se ganó y qué se perdió?»
//      Flujo con signo en el tiempo, EN PESOS (no en conteo: dos contratos de
//      $ 500.000 y uno de $ 3.000.000 no se compensan). Entradas arriba,
//      salidas abajo, la línea del cero dibujada fuerte, y el saldo neto en la
//      MISMA escala de pesos — no hay segundo eje. La polaridad la lleva la
//      posición sobre el cero, que es un canal más fuerte que el tono y no se
//      confunde con el rojo de «ocupado». Etiquetas sólo en los extremos.
// ═══════════════════════════════════════════════════════════════════════════

export function BarrasDivergentes({
  movimientos,
  titulo,
  tabla,
  tablaAbierta,
}: {
  /** `DetalleCliente.movimientos` — siempre 12 meses, del más viejo al más
   *  nuevo; un mes sin movimientos trae las dos listas vacías. */
  movimientos: MovimientoMes[];
  titulo?: string;
  tabla?: boolean;
  tablaAbierta?: boolean;
}) {
  if (movimientos.length === 0) return <SinDatos texto="Sin ventana de movimientos para este cliente." />;

  const ent = (m: MovimientoMes) => m.entradas.reduce((a, x) => a + x.canon_mensual, 0);
  const sal = (m: MovimientoMes) => m.salidas.reduce((a, x) => a + x.canon_mensual, 0);

  const W = 940;
  const H = 244;
  const L = 64;
  const R = 160;
  const y0 = 52;
  const y1 = 188;
  const cero = (y0 + y1) / 2;
  const max = movimientos.reduce((m, x) => Math.max(m, ent(x), sal(x)), 0);
  const tope = max > 0 ? Math.ceil(max / 2e6) * 2e6 : 2e6;
  const esc = (v: number) => (v / tope) * (cero - y0);
  const paso = (W - R - L) / movimientos.length;
  const X = (i: number) => L + paso * i + paso / 2;
  /* Barras ≤ 24 px y con aire a los lados: la banda nunca se llena. */
  const bw = Math.max(6, Math.min(22, paso - 14));

  let ipeor = 0;
  let peor = -1;
  movimientos.forEach((m, i) => {
    const s = sal(m);
    if (s > peor) {
      peor = s;
      ipeor = i;
    }
  });
  const mp = movimientos[ipeor];
  const netoPeor = ent(mp) - peor;
  const anT = `${mesCorto(mp.mes)} · el peor saldo de la ventana: ${sig(netoPeor, platM)} (${plural(
    mp.salidas.length,
    "salida",
    "salidas"
  )} contra ${plural(mp.entradas.length, "entrada", "entradas")})`;

  const dNeto = movimientos.map((m, i) => (i ? "L" : "M") + X(i) + " " + (cero - esc(ent(m) - sal(m)))).join("");
  const ultimo = movimientos[movimientos.length - 1];
  /* El último mes se rotula con su SALDO —lo que dibuja la línea del neto—, y
     nunca con sus entradas solas. Con una entrada de $ 600.000 contra una
     salida de $ 2.000.000 el rótulo anunciaba «+$ 0,6 M» a diez píxeles de la
     anotación que decía, sobre ese mismo mes, «el peor saldo de la ventana:
     −$ 1,4 M». Y si el último mes ES el peor, la anotación ya lo dijo: no se
     dice dos veces. La palabra «saldo» va escrita porque un número suelto
     arriba de una barra de entradas se lee como la barra. */
  const netoUlt = ent(ultimo) - sal(ultimo);
  const ultRotula = ipeor !== movimientos.length - 1 && (ent(ultimo) > 0 || sal(ultimo) > 0);
  const ultT = "saldo " + sig(netoUlt, platM);
  const ultW = anchoAprox(ultT, VOZ.lbl.px, true);
  const ultX = Math.min(X(movimientos.length - 1), W - R - ultW / 2);
  const ultY = Math.max(34, cero - esc(ent(ultimo)) - 9);
  const tit = titulo ?? "Entradas y salidas de contratos por mes, en pesos, con el saldo neto en la misma escala";

  const anW = anchoAprox(anT, VOZ.lbl.px);
  const anX = X(ipeor) + 8 + anW > W - R ? X(ipeor) - 8 : X(ipeor) + 8;
  const anA: "start" | "end" = X(ipeor) + 8 + anW > W - R ? "end" : "start";

  return (
    <Figura
      titulo={tit}
      tablaAbierta={tablaAbierta}
      tabla={
        tabla
          ? {
              resumen: `Ver la tabla de los ${movimientos.length} meses de movimientos`,
              cols: [
                { k: "m", t: "Mes" },
                { k: "e", t: "Entradas", num: true },
                { k: "ev", t: "Plata que entró", num: true },
                { k: "s", t: "Salidas", num: true },
                { k: "sv", t: "Plata que salió", num: true },
                { k: "n", t: "Saldo", num: true },
              ],
              filas: movimientos.map((m) => ({
                m: m.mes,
                e: num(m.entradas.length),
                ev: plata(ent(m)),
                s: num(m.salidas.length),
                sv: plata(sal(m)),
                n: sig(ent(m) - sal(m), plata),
              })),
            }
          : null
      }
    >
      <Lienzo w={W} h={H} titulo={tit}>
        {[tope, tope / 2, -tope / 2, -tope].map((t, i) => (
          <g key={i}>
            <line x1={L} y1={cero - esc(t)} x2={W - R} y2={cero - esc(t)} stroke="var(--line)" strokeWidth={1} />
            <T x={L - 8} y={cero - esc(t) + 4} voz="lbl" ancla="end" fill="var(--ink-3)" mono>
              {sig(t, platM)}
            </T>
          </g>
        ))}
        {movimientos.map((m, i) => {
          const e = ent(m);
          const s = sal(m);
          return (
            <g key={m.mes}>
              {e > 0 ? <rect x={X(i) - bw / 2} y={cero - esc(e)} width={bw} height={esc(e)} rx={3} fill="var(--dato)" /> : null}
              {s > 0 ? <rect x={X(i) - bw / 2} y={cero + 2} width={bw} height={esc(s)} rx={3} fill="var(--dato-tenue)" /> : null}
              <T x={X(i)} y={y1 + 22} voz="lbl" ancla="middle" fill="var(--ink-3)">
                {mesCorto(m.mes)}
              </T>
            </g>
          );
        })}
        <line x1={L} y1={cero} x2={W - R} y2={cero} stroke="var(--ink-1)" strokeWidth={1.5} />
        <path d={dNeto} fill="none" stroke="var(--ink-1)" strokeWidth={1.5} opacity={0.55} strokeLinejoin="round" />

        <T x={anX} y={20} voz="lbl" ancla={anA} peso={600} fill="var(--ink-2)">
          {anT}
        </T>
        <line x1={X(ipeor)} y1={26} x2={X(ipeor)} y2={cero - esc(netoPeor)} stroke="var(--ink-4)" strokeWidth={1} opacity={0.5} />

        {ultRotula ? (
          <T x={ultX} y={ultY} voz="lbl" ancla="middle" peso={700} fill="var(--ink-1)" mono>
            {ultT}
          </T>
        ) : null}

        <Clave
          x={W - R + 10}
          y={y0 + 8}
          items={[{ t: "entradas de contratos", c: "var(--dato)" }]}
        />
        <Clave
          x={W - R + 10}
          y={y1 - 8}
          items={[{ t: "salidas de contratos", c: "var(--dato-tenue)" }]}
        />
        <Clave
          x={W - R + 10}
          y={cero}
          items={[{ t: "saldo neto del mes", c: "var(--ink-1)", forma: "linea" }]}
        />
      </Lienzo>
    </Figura>
  );
}

/** Las claves de estado y de adopción, para pasarlas a `Unidades`. La palabra
 *  siempre acompaña al color: el color no lleva un dato solo. */
export const CLAVE_ESTADOS: Array<{ t: string; c: string; forma?: "rect" | "hueco" }> = [
  { t: ESTADO_TXT.ocupado, c: "var(--ocupado)" },
  { t: ESTADO_TXT.se_libera, c: "var(--entra)" },
  { t: ESTADO_TXT.libre, c: "var(--libre)" },
];

export const CLAVE_ADOPCION: Array<{ t: string; c: string; forma?: "rect" | "hueco" }> = [
  { t: "entró en los últimos 30 días", c: "var(--dato)" },
  { t: "tiene cuentas y no entró", c: "var(--dato)", forma: "hueco" },
  { t: "sin cuentas: nadie entra todavía", c: "var(--resto)" },
];
