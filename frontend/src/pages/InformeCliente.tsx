import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import {
  getDetalleCliente,
  getTendencia,
  type DetalleCliente as DetalleClienteShape,
  type PuntoTendencia,
  type Recomendacion,
  type Tendencia,
} from "../api/plataforma";
import { describeError } from "../api/client";
import { TemaToggle } from "../tema";
import { BarrasSedes, Dumbbell } from "../components/plataforma/graficos";
import {
  mesLargo,
  num,
  pct,
  pctSig,
  plata,
  plural,
  puntos,
  sig,
  tipoN,
  tipoP,
} from "../components/plataforma/formato";
import {
  accionRec,
  claveRec,
  derivar,
  evidenciaRec,
  mesNombre,
  type Contexto,
  type Derivado,
} from "../components/plataforma/sesion-datos";
import { Cif, Frase, Kpi, Kpis, Nota, Pie, Tabla, TarjetaRec } from "../components/plataforma/sesion-piezas";

// ─── /plataforma/clientes/:slug/informe — el informe del cliente (Fase 11) ──
//
// La pieza 3 de la opción A: la MISMA historia de la sesión, capítulos 1 → 3,
// escrita para que un gerente de supermercado la lea solo. Tres páginas A4
// verticales, y todo lo que un tooltip diría acá está escrito.
//
// Lo que se cae respecto de la sesión, y por qué:
//
//   · **La cartera entera.** «4,5 puntos por debajo de la cartera» es un
//     número del operador: sale de `/metricas` y le cuenta al gerente cómo les
//     va a los otros supermercados. Esta pantalla NO llama a `/metricas`, así
//     que ese dato no está ni por accidente. Su «contra qué» es el promedio
//     anónimo de la plataforma por tipo, que sí vive en su propio detalle.
//   · **El capítulo 4.** Las 285 filas de espacios y las 122 de contratos son
//     el rastro que el asesor necesita, no la conversación del gerente.
//   · **Las palabras internas.** Señal, adopción, cuenta fantasma, estado de
//     cuenta, prioridad, spread, «benchmark»: juicios y jerga del operador
//     sobre su propia agenda. Y la tarifa de referencia, que nunca sale de la
//     base del cliente — ni su valor ni su nombre.
//
// Se lee con `/detalle` (obligatorio) y `/tendencia` del propio cliente (para
// el «contra el mes pasado»). Ni un endpoint más.
//
// El único amarillo de la pantalla es «Imprimir o guardar en PDF»; en papel no
// queda ni un control.

const mesActual = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** El `?periodo=` de la URL, o el mes en curso si no viene o no tiene forma de
 *  periodo. Un `?periodo=hola` cae en un mes que la pantalla puede escribir,
 *  no en un 422 sin explicación. */
const periodoDeUrl = (v: string | null): string => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : mesActual());

/** En papel el informe es claro, venga de donde venga el tema de la pantalla:
 *  el oscuro sobre blanco imprime texto invisible. Se declaran los tokens
 *  DERIVADOS (no los canales `-rgb`), porque el bloque oscuro los fija en la
 *  raíz y un elemento de adentro hereda el valor ya calculado. */
const IMPRESION_CLARA = `
  --bg: #FFFFFF !important;
  --surface: #FFFFFF !important;
  --surface-2: #FFFFFF !important;
  --surface-3: #EBEDE9 !important;
  --line-soft: #F0F1F1 !important;
  --line: #DDDEDE !important;
  --line-strong: #BBBCBE !important;
  --brd: rgba(11, 17, 22, .14) !important;
  --ink-1: #0A1014 !important;
  --ink-2: #4A5B65 !important;
  --ink-3: #54646E !important;
  --ink-4: #68788A !important;
  --libre: #00805A !important;
  --libre-suave: #E0F0EB !important;
  --libre-borde: #9ECFC0 !important;
  --libre-txt: #006B4C !important;
  --entra: #CE8A0A !important;
  --entra-suave: #F9F1E2 !important;
  --entra-borde: #ECD3A2 !important;
  --entra-txt: #8A5A06 !important;
  --ocupado: #D8342E !important;
  --ocupado-suave: #FAE7E6 !important;
  --ocupado-borde: #F0B2B0 !important;
  --ocupado-txt: #B32720 !important;
  --resto: #AAB3BE !important;
  --dato: #2E63C8 !important;
  --dato-tenue: #8FB3E8 !important;
  --dato-suave: rgba(46, 99, 200, .10) !important;
  background: #FFFFFF !important;
  color: #0A1014 !important;
`;

/* La hoja del informe es más ancha que la de A (860 px) por una razón medida:
   el contrato de tamaño de `graficos.tsx` clava los dibujos en 940 px de
   ancho y les pone `min-width`, así que en una caja de 764 px la figura se
   desliza y el rótulo de la última sede queda cortado. Con 1036 px la caja
   útil son 940 y la figura entra entera, a escala 1 — el cuerpo declarado es
   el cuerpo en pantalla. En papel manda `@page` y el `width:100%` del bloque
   de impresión de `plataforma.css`. */
const CSS_HOJA = `
.informe-pagina .plat-doc,
.informe-pagina .plat-hoja { max-width: 1040px; }
.informe-pagina .plat-hoja h1,
.informe-pagina .plat-hoja h3 { scroll-margin-top: 76px; }
`;

const CSS_IMPRESION = `
@media print {
  @page { size: A4 portrait; margin: 13mm 12mm; }
  .informe-pagina { ${IMPRESION_CLARA} }
  .informe-pagina .no-imprime { display: none !important; }
  .informe-envoltura { padding: 0 !important; max-width: none !important; }
  .informe-pagina .plat-hoja { max-width: none; }
  .informe-pagina .plat-rec { break-inside: avoid; }
  .informe-pagina .plat-hall { break-inside: avoid; }
  .informe-pagina figure { break-inside: avoid; }
}
`;

/* El «en esta pieza» de A para el informe: el titular y los tres capítulos.
   Es una lista fija porque los tres capítulos se escriben siempre —con dato o
   con la línea que dice que no lo hay—, y sólo se pinta cuando la hoja existe:
   un índice de cuatro entradas sobre una pantalla de error es un índice que
   miente. */
const PIEZAS_INFORME: Array<[string, string]> = [
  ["i-0", "El titular"],
  ["i-1", "1 · Dónde está su negocio"],
  ["i-2", "2 · Qué encontramos"],
  ["i-3", "3 · Qué le proponemos"],
];

export default function InformeCliente() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugParam ?? "";
  const navigate = useNavigate();

  /* EL PERIODO LO MANDA LA URL, no un `useState` clavado en el mes en curso.
     El informe lo hereda de quien lo abre (`…/informe?periodo=2026-07`), y una
     URL pegada a pelo sin `?periodo=` cae en el mes en curso — y lo dice, en
     el membrete y en el pie, porque lo escribe del periodo que el backend
     devolvió, no del que la pantalla creía haber pedido. */
  const [params] = useSearchParams();
  const periodo = periodoDeUrl(params.get("periodo"));
  const [detalle, setDetalle] = useState<DetalleClienteShape | null>(null);
  const [tendencia, setTendencia] = useState<Tendencia | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    getDetalleCliente(slug, periodo)
      .then((d) => {
        if (vivo) setDetalle(d);
      })
      .catch((err) => {
        if (vivo) setError(describeError(err, "No se pudo armar el informe de este cliente."));
      });
    getTendencia(slug, 12)
      .then((t) => {
        if (vivo) setTendencia(t);
      })
      .catch(() => {
        if (vivo) setTendencia(null);
      });
    return () => {
      vivo = false;
    };
  }, [slug, periodo]);

  const der = useMemo<Derivado | null>(() => (detalle ? derivar(detalle) : null), [detalle]);

  return (
    <div className="plat plat-pagina informe-pagina">
      <style>{CSS_HOJA + CSS_IMPRESION}</style>

      <header className="plat-barra no-imprime">
        <button
          type="button"
          className="plat-btn mini"
          onClick={() => navigate(`/plataforma/clientes/${encodeURIComponent(slug)}`)}
        >
          <ArrowLeft size={13} /> Volver a la sesión
        </button>
        <div className="plat-marca">
          RECABRA <span>· informe para el cliente</span>
        </div>
        <div className="sep" />
        <button
          type="button"
          className="btn-principal"
          onClick={() => window.print()}
          disabled={!detalle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            borderRadius: "var(--r-md)",
            padding: "8px 14px",
            fontSize: "var(--t-xs)",
            whiteSpace: "nowrap",
          }}
        >
          <Printer size={13} /> Imprimir o guardar en PDF
        </button>
        <TemaToggle />
      </header>

      <div className="plat-shell">
        <nav className="plat-indice no-imprime" aria-label="Índice del informe">
          <h4>En esta pieza</h4>
          <div className="plat-toc">
            {detalle && der
              ? PIEZAS_INFORME.map(([id, t]) => (
                  <a key={id} href={`#${id}`}>
                    {t}
                  </a>
                ))
              : null}
          </div>
        </nav>

        <main className="plat-doc informe-envoltura">
          <p className="plat-nota no-imprime" style={{ marginTop: 0, marginBottom: "var(--s4)" }}>
            Tres páginas A4 verticales. Sin nada interno y sin comparaciones con otros supermercados: el gerente la lee
            solo, y todo lo que haría falta preguntar está escrito.
          </p>

          {error ? <div className="plat-aviso">{error}</div> : null}
          {!detalle && !error ? <p className="plat-nota">Armando el informe…</p> : null}
          {detalle && der ? <Hoja detalle={detalle} der={der} tendencia={tendencia} /> : null}
        </main>
      </div>
    </div>
  );
}

// ─── La hoja ───────────────────────────────────────────────────────────────

function Hoja({
  detalle,
  der,
  tendencia,
}: {
  detalle: DetalleClienteShape;
  der: Derivado;
  tendencia: Tendencia | null;
}) {
  const ctx: Contexto = { detalle, der };
  const serie = tendencia?.serie ?? [];
  const anterior: PuntoTendencia | null = serie.length >= 2 ? serie[serie.length - 2] : null;
  const delta =
    anterior && anterior.ingreso_contratado_mes !== null ? der.ingresoMes - anterior.ingreso_contratado_mes : null;
  const deltaPct =
    anterior && anterior.ingreso_contratado_mes !== null && anterior.ingreso_contratado_mes > 0
      ? (der.ingresoMes / anterior.ingreso_contratado_mes - 1) * 100
      : null;

  const sedes = detalle.sedes.slice().filter((s) => s.ocupacion_pct !== null);
  const peorSede = sedes.length > 1 ? sedes.sort((a, b) => (a.ocupacion_pct as number) - (b.ocupacion_pct as number))[0] : null;
  const tipoConMasVacio = detalle.resumen_por_tipo.slice().sort((a, b) => b.libres - a.libres)[0] ?? null;

  /* De dónde sale el precio con que se valora lo que está sin vender: el
     promedio propio del cliente, el de la plataforma donde él todavía no cobra
     ninguno, o los dos. No se afirma «lo que usted cobra» si parte del precio
     no salió de él. */
  const origenes = new Set(detalle.oportunidades.map((o) => o.origen_precio));
  const comoSeValora =
    origenes.size === 1 && origenes.has("cliente")
      ? "al precio que usted mismo cobra por cada tipo"
      : origenes.size === 1 && origenes.has("benchmark")
        ? "al promedio de la plataforma, porque todavía no cobra ninguno de esos tipos"
        : "al precio sugerido de cada tipo: el que usted ya cobra, y el promedio de la plataforma en los tipos donde todavía no cobra ninguno";

  /* Las de prioridad alta, menos «dejar la tarifa cargada»: eso es una tarea
     de configuración del operador, no una propuesta comercial del mes. */
  const propuestas = der.recomendaciones.alta.filter((r) => r.tipo !== "sin_tarifa");

  return (
    <div className="plat-hoja">
      <div className="membrete">
        <div>
          <div className="rotulo">RECABRA · Informe de espacios comerciales</div>
          <div style={{ fontWeight: 700, fontSize: "var(--t-base)" }}>{detalle.cliente.nombre}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>
          <div>
            Periodo {mesLargo(detalle.periodo)} · {detalle.desde} a {detalle.hasta}
          </div>
          {/* El informe puede pedir un mes CERRADO (lo hereda de la sesión por
              `?periodo=`), y entonces «todavía no terminó» sería falso. La
              línea sale del periodo que el backend devolvió, no del calendario
              de quien mira. */}
          <div>
            Generado el {detalle.generado_en.slice(0, 10)}
            {detalle.periodo === mesActual() ? " — el mes en curso todavía no terminó" : " — el periodo ya cerró"}
          </div>
        </div>
      </div>

      {/* ── El titular: «qué gano», no «a quién llamo» ── */}
      {der.enOferta > 0 ? (
        <>
          <h1 id="i-0">
            Usted tiene {num(der.enOferta)} espacios sin vender de {num(der.espacios.length)}.
          </h1>
          <Frase>
            Valen <Cif>{plata(der.valor.espaciosLibres)} al mes</Cif> {comoSeValora}
            {der.ingresoMes > 0 ? (
              <>
                : el <Cif>{pct((der.valor.espaciosLibres / der.ingresoMes) * 100, 0)}</Cif> de lo que factura hoy.
              </>
            ) : (
              <>.</>
            )}{" "}
            {peorSede && peorSede.libres > 0 ? (
              <>
                {peorSede.sede} concentra {num(peorSede.libres)} de esos {num(der.enOferta)} espacios (
                {pct((peorSede.libres / der.enOferta) * 100, 0)}).
              </>
            ) : null}
          </Frase>
        </>
      ) : (
        <>
          <h1 id="i-0">Su inventario está vendido entero: {num(der.espacios.length)} de {num(der.espacios.length)} espacios.</h1>
          <Frase>
            No hay un solo espacio libre este mes. Lo que sigue es cuidar lo que ya está vendido:{" "}
            <Cif>{plural(der.porVencer.length, "contrato vence", "contratos vencen")} en los próximos 60 días</Cif>.
          </Frase>
        </>
      )}

      {/* ══ 1 · DÓNDE ESTÁ SU NEGOCIO ══ */}
      <h3 id="i-1">1 · Dónde está su negocio este mes</h3>
      <Kpis>
        <Kpi
          rotulo="Ingreso contratado del mes"
          valor={plata(der.ingresoMes)}
          contexto={[
            delta === null ? (
              <>sin mes anterior con que compararlo</>
            ) : delta === 0 ? (
              <>
                <b>igual que {mesNombre(anterior!.periodo)}</b>
                {der.ingresoMes === 0 ? ": tampoco había contratos" : ""}
              </>
            ) : (
              <>
                contra {mesNombre(anterior!.periodo)}: <b>{sig(delta, plata)}</b>
                {deltaPct === null ? " (venía de cero)" : ` (${pctSig(deltaPct)})`}
              </>
            ),
            <>{plural(der.contratos, "contrato activo", "contratos activos")}</>,
          ]}
        />
        <Kpi
          rotulo="Ocupación"
          valor={der.ocupacionPct === null ? "sin dato" : pct(der.ocupacionPct)}
          contexto={[
            <>
              {num(der.ocupados + der.seLiberan)} de {num(der.espacios.length)} espacios
            </>,
            anterior && anterior.ocupacion_pct !== null && der.ocupacionPct !== null ? (
              <>
                {mesNombre(anterior.periodo)}: {pct(anterior.ocupacion_pct)} ({puntos(der.ocupacionPct - anterior.ocupacion_pct)})
              </>
            ) : (
              <>sin mes anterior con que compararla</>
            ),
          ]}
        />
        <Kpi
          rotulo="Espacios en oferta"
          valor={num(der.enOferta)}
          contexto={[
            <>
              {num(der.libres)} libres + {num(der.seLiberan)} que se liberan este mes
            </>,
            <>valen {plata(der.valor.espaciosLibres)} al mes</>,
          ]}
        />
      </Kpis>

      {der.espacios.length > 0 ? (
        <>
          <BarrasSedes
            espacios={der.espacios}
            promedioPct={der.ocupacionPct}
            etiquetaPromedio="de su promedio"
            titulo="Sus sedes, la que menos se vende arriba: el largo de la barra son los espacios de la sede"
            tabla
            tablaAbierta
          />
        </>
      ) : (
        <Nota>Todavía no hay un plano cargado: sin plano no hay espacios que contar.</Nota>
      )}

      {/* ══ 2 · QUÉ ENCONTRAMOS ══ */}
      <h3 id="i-2">2 · Qué encontramos</h3>
      <Hallazgos ctx={ctx} peorSede={peorSede} tipoConMasVacio={tipoConMasVacio} />

      {detalle.resumen_por_tipo.some(
        (t) => t.canon_promedio !== null && typeof detalle.benchmark_plataforma[t.tipo] === "number"
      ) ? (
        <>
          {/* La tabla va DENTRO de la figura, en su `<details>`: es la tabla
              equivalente del dibujo, escrita en la voz del cliente («lo que
              usted cobra»), no en la del operador. Fuera de la figura dejaba de
              leerse como el camino accesible del dumbbell. */}
          <Dumbbell
            resumen={detalle.resumen_por_tipo}
            benchmark={detalle.benchmark_plataforma}
            titulo="Lo que usted cobra por cada tipo de espacio, contra el promedio de todos los supermercados"
            etiquetaCliente="lo que usted cobra hoy, por tipo"
            etiquetaReferencia="el promedio de todos los supermercados (anónimo)"
            nombreReferencia="promedio de la plataforma"
            resumenTabla={`Ver la tabla de los ${detalle.resumen_por_tipo.length} tipos de espacio`}
            tablaAbierta
            tablaNodo={
              <Tabla
                minAncho={620}
                cols={[
                  { k: "t", t: "Tipo de espacio" },
                  { k: "c", t: "Lo que usted cobra", num: true },
                  { k: "b", t: "El promedio de la plataforma", num: true },
                  { k: "g", t: "Diferencia", num: true },
                ]}
                filas={detalle.resumen_por_tipo.map((t) => {
                  const b = detalle.benchmark_plataforma[t.tipo];
                  const bench = typeof b === "number" ? b : null;
                  return {
                    t: tipoN(t.tipo),
                    c: t.canon_promedio === null ? "sin contratos de este tipo" : plata(t.canon_promedio),
                    b: plata(bench),
                    g:
                      t.canon_promedio === null || bench === null || bench === 0
                        ? "sin comparación"
                        : pctSig((t.canon_promedio / bench - 1) * 100),
                  };
                })}
              />
            }
          />
        </>
      ) : null}

      {/* ══ 3 · QUÉ LE PROPONEMOS ══ */}
      <h3 id="i-3">3 · Qué le proponemos para este mes</h3>
      {propuestas.length === 0 ? (
        <Nota>
          Este mes no hay una acción que mueva la aguja: el inventario está vendido y ningún contrato se cae pronto.
        </Nota>
      ) : (
        propuestas.map((r, i) => (
          <TarjetaRec
            key={r.id}
            n={String(i + 1)}
            accion={accionRec(r, ctx, "cliente")}
            evidencia={evidenciaRec(r, ctx, "cliente")}
            valor={{
              cifra: r.valor_estimado_mensual > 0 ? plata(r.valor_estimado_mensual) : "—",
              pie: r.valor_estimado_mensual > 0 ? "al mes" : "sin plata asociada",
            }}
          >
            <CandidatosCliente rec={r} ctx={ctx} />
          </TarjetaRec>
        ))
      )}

      {der.valor.ingresoEnRiesgo > 0 ? (
        <Nota>
          Estos valores no se suman entre sí: {plata(der.valor.espaciosLibres)} es plata que podría entrar si se vende
          el espacio libre, y {plata(der.valor.ingresoEnRiesgo)} es plata que podría salir si no se renuevan los
          contratos que vencen. Son dos cosas distintas.
        </Nota>
      ) : (
        <Nota>
          {plata(der.valor.espaciosLibres)} es plata que podría entrar si se vende el espacio libre. Ningún contrato
          vence en los próximos 60 días, así que este mes no hay nada que se pueda caer.
        </Nota>
      )}

      <div style={{ marginTop: "var(--s6)" }}>
        <Pie
          filas={[
            {
              t: "De dónde salen estos números",
              v: `De su propia base: sus planos, sus espacios, sus contratos y sus proveedores, tal como estaban el ${detalle.generado_en.slice(
                0,
                10
              )}.`,
            },
            {
              t: "El «promedio de la plataforma»",
              v: "Es el promedio anónimo de todos los supermercados que usan RECABRA, por tipo de espacio. No incluye el nombre ni las cifras de ningún otro supermercado.",
            },
            detalle.periodo === mesActual()
              ? {
                  t: "El mes está en curso",
                  v: `El periodo ${mesLargo(detalle.periodo)} termina el ${detalle.hasta}: las cifras del mes son parciales y pueden subir.`,
                }
              : {
                  t: "El mes ya cerró",
                  v: `El periodo ${mesLargo(detalle.periodo)} terminó el ${detalle.hasta}: las cifras no van a cambiar. Se recalculan sobre los contratos de hoy, así que un contrato que se cargó después puede hacerlas distintas de las que se publicaron ese mes.`,
                },
            {
              t: "Sus derechos sobre estos datos",
              v: "Puede pedir el reporte de transparencia: qué datos toma RECABRA de su base, cómo los calcula y quién los consultó.",
            },
          ]}
        />
      </div>
    </div>
  );
}

// ─── Los hallazgos del informe ─────────────────────────────────────────────
//
// Los mismos del capítulo 2 de la sesión, contados en segunda persona y sin
// los dos que son medición y no negocio (la posición de precio vive en el
// dibujo de arriba; lo que no se puede medir es una tarea del operador).

function Hallazgos({
  ctx,
  peorSede,
  tipoConMasVacio,
}: {
  ctx: Contexto;
  peorSede: DetalleClienteShape["sedes"][number] | null;
  tipoConMasVacio: DetalleClienteShape["resumen_por_tipo"][number] | null;
}) {
  const { detalle, der } = ctx;
  const items: Array<{ titulo: string; cuerpo: string; valor: string; peso: number }> = [];
  const recSede = detalle.recomendaciones.find((r) => r.tipo === "sede_subutilizada") ?? null;

  if (peorSede && peorSede.ocupacion_pct !== null && der.ocupacionPct !== null && der.libres > 0) {
    items.push({
      titulo: "Casi todo lo vacío está en una sola sede",
      cuerpo: `${peorSede.sede} tiene ${num(peorSede.libres)} de sus ${num(
        der.libres
      )} espacios libres y está al ${pct(peorSede.ocupacion_pct)} de ocupación, ${puntos(
        peorSede.ocupacion_pct - der.ocupacionPct
      )} de su propio promedio (${pct(der.ocupacionPct)}).`,
      valor: recSede ? `${plata(recSede.valor_estimado_mensual)}/mes` : "sin valor estimado",
      peso: recSede ? recSede.valor_estimado_mensual : 1,
    });
  }

  if (tipoConMasVacio && tipoConMasVacio.libres > 0 && der.libres > 0) {
    const b = detalle.benchmark_plataforma[tipoConMasVacio.tipo];
    const oportTipo = detalle.oportunidades.find((o) => o.tipo === tipoConMasVacio.tipo) ?? null;
    const precio = oportTipo?.precio_sugerido ?? null;
    const origenDelTipo = oportTipo?.origen_precio ?? null;
    const brecha =
      tipoConMasVacio.canon_promedio !== null && typeof b === "number" && b !== 0
        ? (tipoConMasVacio.canon_promedio / b - 1) * 100
        : null;
    const valorTipo = detalle.oportunidades
      .filter((o) => o.tipo === tipoConMasVacio.tipo)
      .reduce((s, o) => s + o.valor_estimado_mensual, 0);
    items.push({
      titulo: `El ${pct((tipoConMasVacio.libres / der.libres) * 100, 0)} de lo vacío son ${tipoP(
        tipoConMasVacio.tipo,
        2
      )}`,
      cuerpo: `${num(tipoConMasVacio.total)} de sus ${num(der.espacios.length)} espacios son ${tipoP(
        tipoConMasVacio.tipo,
        tipoConMasVacio.total
      )} y ${num(tipoConMasVacio.libres)} están libres.${
        precio === null
          ? ""
          : origenDelTipo === "cliente"
            ? ` Los cobra a ${plata(precio)}${
                brecha !== null
                  ? `, ${pct(Math.abs(brecha))} ${brecha < 0 ? "por debajo" : "por encima"} del promedio de la plataforma para ese tipo (${plata(b)})`
                  : ""
              }`
            : ` Todavía no cobra ninguno: al promedio de la plataforma valen ${plata(precio)} cada uno`
      }.`,
      valor: `${plata(valorTipo)}/mes`,
      peso: valorTipo,
    });
  }

  if (der.porVencer.length > 0) {
    const monto = der.porVencer.reduce((s, x) => s + (x.espacio.contrato?.canon_mensual ?? 0), 0);
    const dentro = der.porVencer.filter((x) => x.espacio.estado === "se_libera");
    items.push({
      titulo:
        der.porVencer.length === 1
          ? "Un contrato vence en los próximos 60 días"
          : `Hay ${num(der.porVencer.length)} contratos que vencen en los próximos 60 días`,
      cuerpo: `Suman ${plata(monto)} mensuales${
        der.ingresoMes > 0 ? `, el ${pct((monto / der.ingresoMes) * 100)} de su ingreso` : ""
      }.${
        dentro.length > 0
          ? ` ${dentro.length === 1 ? "Uno se cae" : `${num(dentro.length)} se caen`} dentro de este mes: ${dentro
              .map((x) => x.espacio.codigo)
              .slice(0, 4)
              .join(", ")}.`
          : ""
      }`,
      valor: `${plata(monto)}/mes en riesgo`,
      peso: monto,
    });
  }

  const p = der.proveedorTop;
  if (p && der.valor.proveedoresExpuestos.length > 0) {
    items.push({
      titulo: `Un proveedor concentra el ${pct(p.participacion_pct)} de sus contratos`,
      cuerpo: `${p.nombre} tiene ${num(p.espacios)} de sus ${num(der.contratos)} contratos y ${
        der.ingresoMes > 0 ? `el ${pct((p.canon_total / der.ingresoMes) * 100)} de su ingreso` : plata(p.canon_total)
      }.${
        p.contratos_por_vencer_60d > 0
          ? ` ${
              p.contratos_por_vencer_60d === 1
                ? "Uno de ellos vence"
                : `${num(p.contratos_por_vencer_60d)} de ellos vencen`
            } en los próximos 60 días.`
          : ""
      }`,
      valor: `${plata(p.canon_total)}/mes de una sola mano`,
      peso: 0,
    });
  }

  items.sort((a, b) => b.peso - a.peso);

  return (
    <>
      {items.map((h, i) => (
        <div className="plat-hall" key={i}>
          {/* La MISMA marca que la sesión: H1, H2… El operador y el gerente
              hablan por teléfono sobre la misma pieza, y «el dos» tiene que
              ser el mismo hallazgo en las dos pantallas. */}
          <div className="h-cab">
            <span className="h-id">H{i + 1}</span>
            <span className="h-tit">{h.titulo}</span>
          </div>
          <Frase chica>{h.cuerpo}</Frase>
          <div className="fig" style={{ fontSize: "var(--t-md)", marginTop: "var(--s2)", fontWeight: 700 }}>
            {h.valor}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Los candidatos, en la voz del cliente ─────────────────────────────────
//
// «A quién se lo ofrezco» es la mitad de la propuesta. Van los proveedores que
// YA tienen ese tipo de espacio en su propia base — nunca proveedores de otro
// supermercado, que cruzaría la frontera de datos — y el que ya concentra sus
// contratos va último, con la advertencia pegada al nombre.

function CandidatosCliente({ rec, ctx }: { rec: Recomendacion; ctx: Contexto }) {
  if (rec.tipo !== "espacio_libre") return null;
  const tipo = claveRec(rec);
  const expuestos = ctx.der.valor.proveedoresExpuestos;
  const vistos = new Map<string, number>();
  for (const o of ctx.detalle.oportunidades) {
    if (o.tipo !== tipo) continue;
    for (const c of o.candidatos) {
      if (!vistos.has(c.proveedor) || c.canon_actual > (vistos.get(c.proveedor) as number)) {
        vistos.set(c.proveedor, c.canon_actual);
      }
    }
  }
  const lista = [...vistos.keys()].sort((a, b) => (expuestos.includes(a) ? 1 : 0) - (expuestos.includes(b) ? 1 : 0));
  if (lista.length === 0) return null;
  return (
    <div className="plat-esc">
      <span className="e-n">a quién</span>
      <div>
        Proveedores suyos que ya tienen este tipo de espacio:{" "}
        {lista.map((n, i) => (
          <span key={n}>
            {i > 0 ? " · " : ""}
            <b>{n}</b>
            {expuestos.includes(n) ? " (ojo: es del que hoy más depende)" : ""}
          </span>
        ))}
        .
      </div>
    </div>
  );
}
