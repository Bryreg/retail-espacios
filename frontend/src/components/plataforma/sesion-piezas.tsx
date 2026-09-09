/* ============================================================================
   RECABRA · Plataforma — las piezas del documento

   El armazón de la sesión de asesoría y del informe del cliente: capítulos,
   frase-conclusión, ruta del JSON, bloques, cifras, tablas, avisos, hallazgos
   y tarjetas de recomendación. Todo son componentes tontos: reciben nodos y
   los ponen adentro de las clases de `src/plataforma.css`. Ni un `fetch`, ni
   una cuenta, ni un color en línea.

   Dos reglas de la opción A que estas piezas HACEN CUMPLIR, y no sólo
   permiten:

   · **Una frase-conclusión y una ruta por bloque.** `<Frase>` va antes de
     todo y `<Fuente>` justo debajo: quien arma un capítulo tiene que escribir
     las dos o el bloque se ve incompleto a simple vista.
   · **Los chips son grises.** `<Chip>` sólo acepta `fuerte | medio | suave`
     (peso y borde), nunca un color de estado de espacio: el rojo, el ámbar y
     el verde codifican estado de ESPACIO y nada más. La palabra va escrita
     adentro del chip, siempre.

   El amarillo no está acá: es `.btn-principal` de `index.css`, y lo pone la
   página, una sola vez.
   ========================================================================== */

import type { ReactNode } from "react";
import type { PrioridadRecomendacion } from "../../api/plataforma";

// ─── Capítulo ──────────────────────────────────────────────────────────────

export function Capitulo({
  id,
  numero,
  titulo,
  der,
  children,
}: {
  id?: string;
  numero: string;
  titulo: string;
  /** La línea de contexto a la derecha del título («contra el mes pasado y
   *  contra la cartera»). */
  der?: string;
  children: ReactNode;
}) {
  return (
    <section className="plat-cap" id={id}>
      <div className="plat-cap-cab">
        <span className="num">{numero}</span>
        <h2>{titulo}</h2>
        {der ? <span className="der">{der}</span> : null}
      </div>
      {children}
    </section>
  );
}

// ─── La frase-conclusión, la cifra subrayada y la ruta del JSON ────────────

/** El primer texto de cada bloque: el hallazgo, con su número. */
export function Frase({ chica, children }: { chica?: boolean; children: ReactNode }) {
  return <p className={chica ? "plat-frase chica" : "plat-frase"}>{children}</p>;
}

/** La cifra dentro de la frase. El subrayado es la tinta de dato al 10 %; el
 *  texto sigue en `--ink-1`, así que la cifra no depende del color para
 *  leerse. */
export function Cif({ children }: { children: ReactNode }) {
  return <em>{children}</em>;
}

/** «¿De dónde sale?», contestado sin abrir un panel: la ruta exacta dentro
 *  del JSON del backend, en monoespaciada, debajo de la frase. */
export function Fuente({ children }: { children: ReactNode }) {
  return <div className="plat-fuente">{children}</div>;
}

// ─── Contenedores ──────────────────────────────────────────────────────────

export function Bloque({ plano, children }: { plano?: boolean; children: ReactNode }) {
  return <div className={plano ? "plat-bloque plano" : "plat-bloque"}>{children}</div>;
}

/** El rótulo de una figura: qué se ve y por qué esa forma. Va ARRIBA del
 *  dibujo, no debajo. */
export function Titulillo({ children }: { children: ReactNode }) {
  return <div className="plat-fig-tit">{children}</div>;
}

export function Aviso({ rotulo, children }: { rotulo?: string; children: ReactNode }) {
  return (
    <div className="plat-aviso">
      {rotulo ? <span className="rotulo">{rotulo}</span> : null}
      {children}
    </div>
  );
}

export function Nota({ children }: { children: ReactNode }) {
  return <p className="plat-nota">{children}</p>;
}

export function Hallazgo({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <div className="plat-hall">
      <div className="h-cab">
        <span className="h-id">{id}</span>
        <span className="h-tit">{titulo}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Cifras ────────────────────────────────────────────────────────────────

export function Kpis({ children }: { children: ReactNode }) {
  return (
    <div className="plat-kpis" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
      {children}
    </div>
  );
}

/** Una cifra con su rótulo y su «contra qué». `hero` es la única de la
 *  pantalla: la magnitud que abre el capítulo. */
export function Kpi({
  hero,
  rotulo,
  valor,
  contexto,
}: {
  hero?: boolean;
  rotulo: string;
  valor: string;
  /** Una línea por elemento. Van debajo (o al lado, en el hero). */
  contexto?: ReactNode[];
}) {
  return (
    <div className={hero ? "plat-kpi hero" : "plat-kpi"}>
      <div className="et">{rotulo}</div>
      <div className="v">{valor}</div>
      {contexto && contexto.length > 0 ? (
        <div className="c">
          {contexto.map((linea, i) => (
            <div key={i}>{linea}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Chips ─────────────────────────────────────────────────────────────────

type TonoChip = "fuerte" | "medio" | "suave";

/** Señal, estado de cuenta y prioridad: tinta gris con la palabra. La
 *  jerarquía la llevan el peso y el borde, que no colisionan con los tres
 *  estados de espacio. */
export function Chip({ tono = "suave", children }: { tono?: TonoChip; children: ReactNode }) {
  return <span className={`plat-chip plat-chip--${tono}`}>{children}</span>;
}

const TONO_PRIORIDAD: Record<PrioridadRecomendacion, TonoChip> = {
  alta: "fuerte",
  media: "medio",
  baja: "suave",
};

function ChipPrioridad({ prioridad }: { prioridad: PrioridadRecomendacion }) {
  return <Chip tono={TONO_PRIORIDAD[prioridad]}>prioridad {prioridad}</Chip>;
}

// ─── Tablas ────────────────────────────────────────────────────────────────

interface Col {
  k: string;
  t: string;
  num?: boolean;
}

export type Fila = Record<string, ReactNode>;

/** La tabla del documento. Se usa para el detalle y como tabla equivalente de
 *  un dibujo: en las dos, cada celda vacía se escribe «—» y no en blanco. */
export function Tabla({
  cols,
  filas,
  total,
  minAncho,
}: {
  cols: Col[];
  filas: Fila[];
  /** La fila de totales, con las mismas claves. */
  total?: Fila;
  minAncho?: number;
}) {
  return (
    <div className="tabla-scroll">
      <table style={minAncho ? { minWidth: minAncho } : undefined}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.k} className={c.num ? "num" : undefined}>
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.k} className={c.num ? "num" : undefined}>
                  {f[c.k] === undefined || f[c.k] === null ? "—" : f[c.k]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total ? (
          <tbody>
            <tr className="tot">
              {cols.map((c) => (
                <td key={c.k} className={c.num ? "num" : undefined}>
                  {total[c.k] ?? ""}
                </td>
              ))}
            </tr>
          </tbody>
        ) : null}
      </table>
    </div>
  );
}

/** La tabla equivalente de un dibujo, plegada. Es el camino accesible al
 *  valor: sin ella el gráfico se queda sin su tabla. En impresión se abre
 *  sola (`@media print` en `plataforma.css`). */
export function TablaEq({
  rotulo,
  abierta,
  children,
}: {
  rotulo: string;
  abierta?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="plat-tabla-eq" open={abierta}>
      <summary>{rotulo}</summary>
      <div>{children}</div>
    </details>
  );
}

/** El cajón del capítulo 4: una tabla completa, plegada por defecto, con su
 *  conteo en el encabezado. */
export function Cajon({
  rotulo,
  cuenta,
  abierto,
  children,
}: {
  rotulo: string;
  cuenta?: string;
  abierto?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="plat-cajon" open={abierto}>
      <summary>
        {rotulo}
        {cuenta ? <span className="cuenta">{cuenta}</span> : null}
      </summary>
      <div>{children}</div>
    </details>
  );
}

/** La marca de un ESTADO DE ESPACIO: el color y la palabra, siempre juntos.
 *  Es el único lugar del documento donde el rojo, el ámbar y el verde
 *  aparecen fuera de un dibujo — y dicen exactamente lo que dicen adentro. Un
 *  chip gris acá perdería el único dato que esos tres colores codifican. */
export function MarcaEstado({ estado, texto }: { estado: "libre" | "se_libera" | "ocupado"; texto: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span aria-hidden className={`plat-pt plat-pt--${estado === "se_libera" ? "se-libera" : estado}`} />
      {texto}
    </span>
  );
}

// ─── Clave / leyenda ───────────────────────────────────────────────────────
//
// NO hay una pieza de leyenda, a propósito. Los diez dibujos de `graficos.tsx`
// llevan su clave DENTRO del `<svg>` (`Clave`), que es donde el ojo la
// necesita; una segunda leyenda debajo de la figura decía lo mismo dos veces.
// `.plat-leyenda` y `.plat-pt--*` siguen en la hoja para quien dibuje una
// figura sin clave propia.

// ─── Recomendaciones ───────────────────────────────────────────────────────

/** Una recomendación es una ACCIÓN con su evidencia en una línea y su valor.
 *  La prioridad va como palabra y como orden; el chip es gris. */
export function TarjetaRec({
  n,
  accion,
  evidencia,
  valor,
  prioridad,
  children,
}: {
  n: string;
  accion: string;
  evidencia: string;
  /** Ya formateado. Cuando la recomendación no trae plata, quien llama pasa
   *  el texto que lo explica. */
  valor: { cifra: string; pie: string };
  /** Ausente en el informe del cliente: la prioridad es un juicio del
   *  operador sobre su propia agenda. */
  prioridad?: PrioridadRecomendacion;
  children?: ReactNode;
}) {
  return (
    <div className="plat-rec">
      <div className="r-top">
        <div className="r-n">{n}</div>
        <div className="r-cuerpo">
          <div className="r-acc">{accion}</div>
          <div className="r-ev">{evidencia}</div>
        </div>
        <div className="r-val">
          {valor.cifra}
          <small>{valor.pie}</small>
          {prioridad ? (
            <div style={{ marginTop: 4 }}>
              <ChipPrioridad prioridad={prioridad} />
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Un escalón de la escalera: `precio`, `a quién`, `dónde`. El nombre del
 *  escalón va en mono a la izquierda, el contenido a la derecha. */
export function Escalon({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="plat-esc">
      <span className="e-n">{nombre}</span>
      <div>{children}</div>
    </div>
  );
}

export function Candidatos({ children }: { children: ReactNode }) {
  return <div className="plat-cands">{children}</div>;
}

/** Una ficha de candidato. `ojo` es el aviso de que ese proveedor ya
 *  concentra al cliente: borde firme y palabra, sin ámbar — no es un estado
 *  de espacio. */
export function Candidato({
  nombre,
  detalle,
  ojo,
}: {
  nombre: string;
  detalle: string;
  ojo?: string;
}) {
  return (
    <div className={ojo ? "plat-cand plat-cand--ojo" : "plat-cand"}>
      <b>{nombre}</b>
      <span>{detalle}</span>
      {ojo ? <em>{ojo}</em> : null}
    </div>
  );
}

/** Los códigos de una sede, plegados. Nunca se abren solos. */
export function GrupoCodigos({
  sede,
  cuenta,
  chip,
  codigos,
}: {
  sede: string;
  cuenta: number;
  chip?: string;
  codigos: Array<{ codigo: string; estado: "libre" | "se_libera" }>;
}) {
  return (
    <details className="plat-grupo">
      <summary>
        {sede}
        {chip ? (
          <span style={{ marginLeft: 6, fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>
            <MarcaEstado estado="se_libera" texto={chip} />
          </span>
        ) : null}
        <b>{cuenta}</b>
      </summary>
      <div className="codigos">
        {/* El verde de la hoja dice «libre»; el que se libera lleva el ámbar y
            la palabra, como en cualquier otro lugar del documento. */}
        {codigos.map((c) => (
          <span
            key={c.codigo}
            style={
              c.estado === "se_libera"
                ? { background: "var(--entra-suave)", color: "var(--entra-txt)", borderColor: "var(--entra-borde)" }
                : undefined
            }
          >
            {c.estado === "se_libera" ? `${c.codigo} · se libera` : c.codigo}
          </span>
        ))}
      </div>
    </details>
  );
}

export function Grupos({ children }: { children: ReactNode }) {
  return <div className="plat-grupos">{children}</div>;
}

// ─── Pie de procedencia ────────────────────────────────────────────────────

export function Pie({ filas }: { filas: Array<{ t: string; v: ReactNode }> }) {
  return (
    <div className="plat-pie">
      {filas.map((f, i) => (
        <div key={i}>
          <b>{f.t}</b>
          {f.v}
        </div>
      ))}
    </div>
  );
}
