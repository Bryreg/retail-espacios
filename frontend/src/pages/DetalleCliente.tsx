import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  getDetalleCliente,
  getMetricasPlataforma,
  getTendencia,
  type ClienteMetricas,
  type DetalleCliente as DetalleClienteShape,
  type EspacioDetalle,
  type MetricasPlataforma,
  type PuntoTendencia,
  type Recomendacion,
  type Tendencia,
} from "../api/plataforma";
import { describeError } from "../api/client";
import { TemaToggle } from "../tema";
import {
  BarrasDivergentes,
  BarrasSedes,
  CLAVE_ESTADOS,
  DosLineasConteo,
  Dumbbell,
  Enfasis,
  LineaIngreso,
  RielVencimientos,
  Unidades,
  ocupadosDe,
  unidadesPorTipo,
  type Anotacion,
} from "../components/plataforma/graficos";
import {
  ESTADO_CUENTA_TXT,
  ESTADO_TXT,
  fechaCorta,
  mesCorto,
  mesLargo,
  num,
  pct,
  pctSig,
  periodosOfrecidos,
  plata,
  platM,
  plural,
  puntos,
  sig,
  tipoN,
  tipoP,
  type PeriodoOfrecido,
} from "../components/plataforma/formato";
import {
  accionRec,
  claveRec,
  derivar,
  evidenciaRec,
  lista,
  mesNombre,
  TITULO_HALLAZGO,
  type Contexto,
  type Derivado,
} from "../components/plataforma/sesion-datos";
import {
  Aviso,
  Bloque,
  Cajon,
  Capitulo,
  Chip,
  Cif,
  Candidato,
  Candidatos,
  Escalon,
  Frase,
  Fuente,
  GrupoCodigos,
  Grupos,
  Hallazgo,
  Kpi,
  Kpis,
  MarcaEstado,
  Nota,
  Pie,
  Tabla,
  TablaEq,
  TarjetaRec,
  Titulillo,
} from "../components/plataforma/sesion-piezas";

// ─── /plataforma/clientes/:slug — la sesión de asesoría (Fase 11) ───────────
//
// La pieza 2 de la opción A («El informe»), portada al frontend real. Es un
// DOCUMENTO, no un tablero: cinco capítulos que se leen de arriba abajo, cada
// bloque con su frase-conclusión con cifra arriba y la ruta exacta del JSON
// en monoespaciada debajo, los dibujos anotados sobre el dato y el detalle
// plegado. El orden es el del brief §5.B, que es también el de una
// conversación: dónde está · qué encontramos · qué proponemos · los datos
// detrás · de dónde sale.
//
// Los diez dibujos viven en `components/plataforma/graficos.tsx` y son puros;
// las cuentas, en `sesion-datos.ts`; las piezas del documento, en
// `sesion-piezas.tsx`; el CSS, en `src/plataforma.css` bajo `.plat`. Acá sólo
// queda la pantalla: qué se pide, en qué orden se cuenta y qué se dice cuando
// un dato no vino.
//
// Tres endpoints, uno obligatorio:
//   · `/plataforma/clientes/{slug}/detalle` — SIN él no hay sesión, y la
//     pantalla lo dice con todas las letras en vez de dibujar capítulos
//     vacíos (503 base ilegible, 404 slug inexistente, 422 período).
//   · `/plataforma/tendencia?cliente={slug}` — los doce meses. Sin él, la
//     rejilla no se dibuja y el «contra el mes pasado» dice «sin dato».
//   · `/plataforma/metricas` — el «contra la cartera» y el spread del
//     cliente. Sin él, ese contraste dice «sin referencia»; todo lo demás
//     (ingreso, contratos, ocupación) sale del detalle y sigue exacto.
//
// FRONTERA (brief §4): la tarifa de referencia del cliente NO se pinta nunca
// — sólo `spread_pct` (una relación) y `tarifa_configurada` (sí/no). Los
// nombres de proveedor van tal como llegan, ya saneados por el backend. Todo
// es sólo lectura: esta pantalla no tiene un `PATCH`, ni un formulario, ni un
// botón que escriba. El reporte de transparencia se ENLAZA (capítulo 5) y no
// se rediseña. Y el texto de `recomendaciones[].explicacion` no se imprime
// nunca: es el ejemplo que el dueño puso como lo que no puede pasar.

const mesActual = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** El `?periodo=` de la URL, o el mes en curso si no viene o no tiene forma de
 *  periodo. Se valida acá y no en el `fetch`: un `?periodo=hola` tiene que caer
 *  en un mes que la pantalla pueda escribir, no en un 422 sin explicación. */
const periodoDeUrl = (v: string | null): string => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : mesActual());

/** `"2026-09-08T14:22:41Z"` → `"2026-09-08 14:22:41 UTC"`. La fecha de
 *  generación se muestra entera, con hora: es la que dice qué tan fresco es
 *  todo lo demás. */
const generado = (iso: string): string => iso.replace("T", " ").replace("Z", " UTC");

// ─── Anotaciones sobre el dato ─────────────────────────────────────────────
//
// El hallazgo va escrito ENCIMA del gráfico, no en una leyenda aparte. Las
// dos anotaciones se CALCULAN de la serie; si el dato no las sostiene, no se
// escriben (nunca se redacta una causa que el dato no muestra).

/** El mes en que más creció el inventario: casi siempre un plano que entró.
 *  Es la anotación que impide leer una caída de ocupación como contratos
 *  perdidos. */
function anotacionInventario(serie: PuntoTendencia[]): Anotacion[] {
  let mejor: { i: number; delta: number } | null = null;
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1].espacios_comercializables;
    const b = serie[i].espacios_comercializables;
    if (a === null || b === null) continue;
    const d = b - a;
    if (d > 0 && (mejor === null || d > mejor.delta)) mejor = { i, delta: d };
  }
  if (mejor === null) return [];
  const p = serie[mejor.i];
  const oa = ocupadosDe(serie[mejor.i - 1]);
  const ob = ocupadosDe(p);
  const cola = oa !== null && ob !== null && ob >= oa ? ", sin perder un ocupado" : "";
  return [
    {
      i: mejor.i,
      t: `${mesCorto(p.periodo)} · entran ${num(mejor.delta)} espacios al plano${cola}`,
      lado: "izq",
    },
  ];
}

/** El mes en que MÁS BAJÓ el ingreso, con el proveedor que lo explica. La
 *  serie dice cuánto bajó; `movimientos[]` dice quién se fue ese mes. Si el
 *  ingreso nunca bajó, no se anota nada: no se redacta una caída que no hubo.
 *
 *  A propósito NO es «el mes con más salidas»: eso ya lo anota el panel de
 *  movimientos, que mide justamente el saldo. Nada dicho dos veces. */
function anotacionCaidaIngreso(
  serie: PuntoTendencia[],
  movimientos: DetalleClienteShape["movimientos"]
): Anotacion[] {
  let peor: { i: number; delta: number } | null = null;
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1].ingreso_contratado_mes;
    const b = serie[i].ingreso_contratado_mes;
    if (a === null || b === null) continue;
    const d = b - a;
    if (d < 0 && (peor === null || d < peor.delta)) peor = { i, delta: d };
  }
  if (peor === null) return [];
  const mes = serie[peor.i].periodo;
  const mv = movimientos.find((m) => m.mes === mes);
  const salidas = mv ? mv.salidas : [];
  let quien = "";
  if (salidas.length > 0) {
    const porProveedor = new Map<string, number>();
    for (const x of salidas) porProveedor.set(x.proveedor, (porProveedor.get(x.proveedor) ?? 0) + x.canon_mensual);
    const top = [...porProveedor.entries()].sort((a, b) => b[1] - a[1])[0];
    quien = ` · sale ${top[0]}`;
  }
  return [{ i: peor.i, t: `${mesCorto(mes)}${quien}: ${sig(peor.delta, platM)} al mes`, lado: "izq" }];
}

/** La frase-conclusión del panel de plata del cliente. La rejilla de arriba
 *  cuenta caras y ésta cuenta pesos: son dos lecturas sobre la misma rejilla
 *  de meses y cada una necesita su propia conclusión con su cifra. */
function fraseIngresoCliente(serie: PuntoTendencia[]): string {
  const con = serie.filter((p) => !p.sin_dato && p.ingreso_contratado_mes !== null);
  if (con.length < 2)
    return `${plural(con.length, "mes de la ventana trae", "meses de la ventana traen")} ingreso publicado: con menos de 2 no hay tramo que contar en el panel de plata.`;
  const primero = con[0];
  const ultimo = con[con.length - 1];
  const a = primero.ingreso_contratado_mes as number;
  const b = ultimo.ingreso_contratado_mes as number;
  const pico = con.reduce((m, p) => ((p.ingreso_contratado_mes as number) > (m.ingreso_contratado_mes as number) ? p : m), con[0]);
  return (
    `En plata, de ${mesCorto(primero.periodo)} a ${mesCorto(ultimo.periodo)} pasó de ${plata(a)} a ${plata(b)} ` +
    `(${sig(b - a, plata)}${a > 0 ? ` · ${pctSig((b / a - 1) * 100)}` : ""}), con el techo de la ventana en ` +
    `${mesCorto(pico.periodo)} (${plata(pico.ingreso_contratado_mes)}). Misma rejilla de meses, otra unidad: por eso ` +
    `va en su propio panel y no en un segundo eje.`
  );
}

/** La frase-conclusión de las barras divergentes. El dibujo muestra el flujo
 *  con signo; la frase dice el saldo de la ventana entera, que es la pregunta
 *  que el dibujo deja abierta: ¿se ganó o se perdió, y cuánto? */
function fraseMovimientos(movimientos: DetalleClienteShape["movimientos"]): string {
  const ent = movimientos.reduce((t, m) => t + m.entradas.reduce((x, e) => x + e.canon_mensual, 0), 0);
  const sal = movimientos.reduce((t, m) => t + m.salidas.reduce((x, e) => x + e.canon_mensual, 0), 0);
  const nEnt = movimientos.reduce((t, m) => t + m.entradas.length, 0);
  const nSal = movimientos.reduce((t, m) => t + m.salidas.length, 0);
  if (nEnt === 0 && nSal === 0) {
    return `Los ${num(movimientos.length)} meses de la ventana vienen con cero entradas y cero salidas: no hubo un solo movimiento que dibujar.`;
  }
  const conSaldo = movimientos
    .map((m) => ({
      mes: m.mes,
      neto: m.entradas.reduce((x, e) => x + e.canon_mensual, 0) - m.salidas.reduce((x, e) => x + e.canon_mensual, 0),
    }))
    .filter((m) => m.neto !== 0);
  const peor = conSaldo.length > 0 ? conSaldo.reduce((m, x) => (x.neto < m.neto ? x : m), conSaldo[0]) : null;
  return (
    `En ${num(movimientos.length)} meses entraron ${plural(nEnt, "contrato", "contratos")} por ${plata(ent)} ` +
    `y salieron ${plural(nSal, "contrato", "contratos")} por ${plata(sal)}: el saldo de la ventana es ` +
    `${sig(ent - sal, plata)} al mes` +
    (peor && peor.neto < 0 ? `, y el peor mes fue ${mesCorto(peor.mes)} con ${sig(peor.neto, plata)}` : "") +
    `. Entradas arriba, salidas abajo y el saldo neto en la MISMA escala de pesos: la polaridad la lleva la posición sobre el cero, no el color.`
  );
}

// ─── La escalera de los cuatro escalones ───────────────────────────────────
//
// El caso que el dueño puso como lo que NO puede pasar: «113 espacios de tipo
// gondola libres (…113 códigos…): ofrecerlos a X, Y, Z». Acá se cuenta en
// cuatro escalones y sólo el primero está a la vista.

function Escalera({ rec, ctx }: { rec: Recomendacion; ctx: Contexto }) {
  const tipo = claveRec(rec);
  const { detalle, der } = ctx;
  const bench = detalle.benchmark_plataforma[tipo];
  const grupos = der.gruposOportunidad.filter((g) => g.tipo === tipo);
  const oport = detalle.oportunidades.filter((o) => o.tipo === tipo);
  const precio = oport.length > 0 ? oport[0].precio_sugerido : null;
  const origen = oport.length > 0 ? oport[0].origen_precio : null;
  const n = oport.length;

  /* Los candidatos de este tipo, con el que YA concentra al cliente al final:
     ofrecerle a él las 113 caras es hacer justo lo que la otra recomendación
     desaconseja. El orden lo resuelve el dibujo, no una nota al pie. */
  const candidatos = new Map<string, { canon: number; mismoTipo: boolean }>();
  for (const o of oport) {
    for (const c of o.candidatos) {
      const y = candidatos.get(c.proveedor);
      if (!y || c.canon_actual > y.canon) candidatos.set(c.proveedor, { canon: c.canon_actual, mismoTipo: c.mismo_tipo });
    }
  }
  const expuestos = der.valor.proveedoresExpuestos;
  const lista = [...candidatos.entries()].sort(
    (a, b) => (expuestos.includes(a[0]) ? 1 : 0) - (expuestos.includes(b[0]) ? 1 : 0)
  );

  return (
    <>
      <Escalon nombre="precio">
        <span>
          {precio === null
            ? `Ni este cliente ni la plataforma tienen una referencia calculable para ${tipoN(
                tipo
              )}: sin precio sugerido, no hay valor que ofrecer.`
            : origen === "cliente"
              ? typeof bench === "number" && bench > 0
                ? `Sale del promedio que ${detalle.cliente.nombre} ya cobra por ese tipo. El promedio de la plataforma es ${plata(
                    bench
                  )}: está cobrando ${pct(Math.abs((precio / bench - 1) * 100))} ${
                    precio < bench ? "menos" : "más"
                  } que el mercado. Al promedio de la plataforma, los mismos ${num(n)} espacios valdrían ${plata(
                    n * bench
                  )}.`
                : `Sale del promedio que ${detalle.cliente.nombre} ya cobra por ese tipo. La plataforma no tiene promedio de ${tipoN(
                    tipo
                  )} con que compararlo.`
              : `Este cliente no tiene contratos de ese tipo: el precio sale del promedio de la plataforma (${plata(
                  bench,
                )}), no del cliente.`}
        </span>
      </Escalon>

      <Escalon nombre="a quién">
        <div>
          {lista.length === 0
            ? "Todavía no hay a quién ofrecérselo desde adentro: este cliente no tiene un proveedor a quien parecerse. No se rellena con proveedores de otros clientes — eso cruzaría la frontera de datos."
            : "Proveedores que ya tienen este tipo de espacio acá:"}
          {lista.length > 0 ? (
            <Candidatos>
              {lista.map(([nombre, c]) => {
                const p = detalle.proveedores.find((x) => x.nombre === nombre);
                return (
                  <Candidato
                    key={nombre}
                    nombre={nombre}
                    detalle={`canon promedio hoy ${plata(c.canon)}${c.mismoTipo ? "" : " · aún sin este tipo"}`}
                    ojo={
                      expuestos.includes(nombre) && p
                        ? `ojo: ya tiene el ${pct(p.participacion_pct)} de los contratos`
                        : undefined
                    }
                  />
                );
              })}
            </Candidatos>
          ) : null}
        </div>
      </Escalon>

      <Escalon nombre="dónde">
        <div>
          {`Los ${num(n)} códigos existen y no se listan solos: se abren por sede.`}
          <Grupos>
            {grupos.map((g) => (
              <GrupoCodigos
                key={g.sede}
                sede={g.sede}
                cuenta={g.n}
                chip={g.seLiberan > 0 ? `${g.seLiberan} se libera` : undefined}
                codigos={g.codigos}
              />
            ))}
          </Grupos>
        </div>
      </Escalon>
    </>
  );
}

// ─── Una recomendación, como acción ────────────────────────────────────────

function Recomendada({
  rec,
  n,
  ctx,
  conEscalera,
}: {
  rec: Recomendacion;
  n: string;
  ctx: Contexto;
  conEscalera?: boolean;
}) {
  const solapa =
    rec.tipo === "sede_subutilizada"
      ? `Sus ${plata(rec.valor_estimado_mensual)} ya están contados adentro de los espacios libres de arriba: es la misma plata mirada por sede. No se suma.`
      : rec.tipo === "concentracion_proveedor"
        ? `Sus ${plata(rec.valor_estimado_mensual)} son ingreso que YA entra, no plata nueva. Está acá porque el riesgo es la dependencia, no el monto.`
        : null;
  return (
    <TarjetaRec
      n={n}
      accion={accionRec(rec, ctx)}
      evidencia={evidenciaRec(rec, ctx)}
      valor={{
        cifra: rec.valor_estimado_mensual > 0 ? plata(rec.valor_estimado_mensual) : "—",
        pie: rec.valor_estimado_mensual > 0 ? "al mes" : "no hay plata: falta una medición",
      }}
      prioridad={rec.prioridad}
    >
      {conEscalera && rec.tipo === "espacio_libre" ? <Escalera rec={rec} ctx={ctx} /> : null}
      {solapa ? <Escalon nombre="ojo">{solapa}</Escalon> : null}
    </TarjetaRec>
  );
}

// ─── Los hallazgos del capítulo 2 ──────────────────────────────────────────
//
// No hay una lista fija de seis: se arman los que el dato sostiene y se
// ordenan por lo que pesan (la plata que ponen sobre la mesa). Los dos que no
// mueven plata —la posición de precio y lo que no se puede medir— van al
// final, que es donde corresponde en una conversación.

interface HallazgoArmado {
  clave: string;
  peso: number;
  titulo: string;
  nodo: (id: string) => JSX.Element;
}

// ─── La pantalla ───────────────────────────────────────────────────────────

export default function DetalleCliente() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugParam ?? "";
  const navigate = useNavigate();

  /* El periodo vive en la URL, no en un `useState`: es lo que la cartera pasa
     al abrir la sesión y lo que la sesión le pasa al informe. Una sesión
     pegada a pelo sin `?periodo=` cae en el mes en curso. */
  const [params, setParams] = useSearchParams();
  const periodo = periodoDeUrl(params.get("periodo"));
  const setPeriodo = (p: string) => {
    const siguiente = new URLSearchParams(params);
    siguiente.set("periodo", p || mesActual());
    setParams(siguiente, { replace: true });
  };

  const [detalle, setDetalle] = useState<DetalleClienteShape | null>(null);
  const [tendencia, setTendencia] = useState<Tendencia | null>(null);
  const [cartera, setCartera] = useState<MetricasPlataforma | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    setDetalle(null);
    getDetalleCliente(slug, periodo)
      .then((d) => {
        if (vivo) setDetalle(d);
      })
      .catch((err) => {
        if (vivo) setError(describeError(err, "No se pudo leer el detalle de este cliente."));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    /* Los dos contrastes son opcionales a propósito: si la cartera no se deja
       leer, la sesión no se cae — dice «sin referencia» donde iría el
       contraste y sigue contando lo que sí sabe. */
    getTendencia(slug, 12)
      .then((t) => {
        if (vivo) setTendencia(t);
      })
      .catch(() => {
        if (vivo) setTendencia(null);
      });
    getMetricasPlataforma(periodo)
      .then((m) => {
        if (vivo) setCartera(m);
      })
      .catch(() => {
        if (vivo) setCartera(null);
      });
    return () => {
      vivo = false;
    };
  }, [slug, periodo]);

  const der = useMemo<Derivado | null>(() => (detalle ? derivar(detalle) : null), [detalle]);
  const filaCartera: ClienteMetricas | null = useMemo(
    () => cartera?.clientes.find((c) => c.slug === slug) ?? null,
    [cartera, slug]
  );
  const periodos = useMemo(() => periodosOfrecidos(tendencia?.serie, periodo), [tendencia, periodo]);

  /* El índice lista los capítulos que la pantalla ARMÓ. Un índice con cinco
     entradas y dos capítulos es un índice que miente. */
  const CINCO: Array<[string, string]> = [
    ["s-cap1", "1 · Dónde está"],
    ["s-cap2", "2 · Qué encontramos"],
    ["s-cap3", "3 · Qué proponemos"],
    ["s-cap4", "4 · Los datos detrás"],
    ["s-cap5", "5 · De dónde sale"],
  ];
  const DOS: Array<[string, string]> = [CINCO[0], CINCO[4]];
  const capitulos: Array<[string, string]> = error ? DOS : detalle && der ? (der.espacios.length === 0 ? DOS : CINCO) : [];

  return (
    <div className="plat plat-pagina">
      <Barra
        titulo={detalle?.cliente.nombre ?? slug}
        periodo={periodo}
        periodos={periodos}
        onPeriodo={setPeriodo}
        onVolver={() => navigate("/plataforma")}
      />

      <div className="plat-shell">
        <nav className="plat-indice no-imprime" aria-label="Capítulos de la sesión">
          <h4>En esta sesión</h4>
          <div className="plat-toc">
            {/* Sólo los capítulos que la pantalla armó. Un índice con cinco
                entradas y dos capítulos es un índice que miente. */}
            {capitulos.map(([id, t]) => (
              <a key={id} href={`#${id}`}>
                {t}
              </a>
            ))}
          </div>
        </nav>

        <main className="plat-doc">
          {cargando && !detalle && !error ? <p className="plat-nota">Leyendo la base de este cliente…</p> : null}
          {error ? (
            <SesionParcial slug={slug} periodo={periodo} error={error} fila={filaCartera} cartera={cartera} />
          ) : null}
          {detalle && der ? (
            <Sesion
              detalle={detalle}
              der={der}
              tendencia={tendencia}
              cartera={cartera}
              fila={filaCartera}
              onInforme={() =>
                navigate(
                  `/plataforma/clientes/${encodeURIComponent(slug)}/informe?periodo=${encodeURIComponent(periodo)}`
                )
              }
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

// ─── La barra ──────────────────────────────────────────────────────────────
//
// La única fila de controles, arriba de todo lo que alcanza. El periodo manda
// sobre los tres endpoints a la vez.

function Barra({
  titulo,
  periodo,
  periodos,
  onPeriodo,
  onVolver,
}: {
  titulo: string;
  periodo: string;
  periodos: PeriodoOfrecido[];
  onPeriodo: (p: string) => void;
  onVolver: () => void;
}) {
  return (
    <header className="plat-barra no-imprime">
      <button type="button" className="plat-btn mini" onClick={onVolver}>
        <ArrowLeft size={13} /> Cartera
      </button>
      <div className="plat-marca">
        RECABRA <span>· sesión de asesoría · {titulo}</span>
      </div>
      <div className="sep" />
      <div className="plat-ctrl">
        <label htmlFor="plat-periodo">Periodo</label>
        {/* El `<select>` de A. Un `<input type="month">` lo pinta el navegador
            en su propio idioma y a 390 px se corta; los meses de acá salen de
            la serie del cliente, en español, y el que no tiene snapshot se
            ofrece deshabilitado. */}
        <select
          id="plat-periodo"
          value={periodo}
          onChange={(e) => onPeriodo(e.target.value || mesActual())}
          title="El periodo manda sobre los tres endpoints de esta sesión."
        >
          {periodos.map((o) => (
            <option key={o.p} value={o.p} disabled={o.sinDato && o.p !== periodo}>
              {mesLargo(o.p)}
              {o.sinDato ? " · sin dato" : ""}
            </option>
          ))}
        </select>
      </div>
      <TemaToggle />
    </header>
  );
}

// ─── La sesión que no se puede armar ───────────────────────────────────────
//
// 503 (base ilegible), 404 (slug inexistente) o 422 (período): la pantalla
// dice exactamente eso y muestra lo único que sí existe —lo que la cartera
// publica de este cliente—, en vez de dibujar cinco capítulos con datos que
// el endpoint no devolvió.

function SesionParcial({
  slug,
  periodo,
  error,
  fila,
  cartera,
}: {
  slug: string;
  periodo: string;
  error: string;
  fila: ClienteMetricas | null;
  cartera: MetricasPlataforma | null;
}) {
  const m = fila?.metricas ?? null;
  return (
    <>
      <div className="plat-tapa">
        <div className="rotulo">Sesión de asesoría · parcial</div>
        <h1>
          {fila?.nombre ?? slug} — {mesLargo(periodo)}
        </h1>
        <div className="cred">
          <span>
            <b>Periodo</b> {periodo}
          </span>
          {fila ? (
            <span>
              <b>Cuenta</b> {ESTADO_CUENTA_TXT[fila.estado_cuenta] ?? fila.estado_cuenta}
            </span>
          ) : null}
        </div>
      </div>

      <Capitulo id="s-cap1" numero="1" titulo="Dónde está" der="lo que se pudo leer, y nada más">
        <Frase>
          <Cif>No hay sesión de asesoría de este cliente en este periodo</Cif>: el detalle no se pudo armar.
        </Frase>
        <Fuente>GET /api/plataforma/clientes/{slug}/detalle?periodo={periodo}</Fuente>
        <Aviso rotulo="Lo que respondió el backend">{error}</Aviso>

        {m ? (
          <Bloque>
            <Titulillo>
              Lo único que existe de este cliente en este periodo son los agregados que publica la cartera. Con eso no se
              arman hallazgos ni propuestas: hacen falta los espacios, los contratos y los proveedores.
            </Titulillo>
            <Kpis>
              <Kpi
                rotulo="Ingreso contratado del mes"
                valor={plata(m.ingreso_contratado_mes)}
                contexto={cartera ? [`la cartera entera factura ${plata(cartera.consolidado.ingreso_contratado_mes)}`] : []}
              />
              <Kpi
                rotulo="Ocupación"
                valor={m.ocupacion_pct === null ? "sin dato" : pct(m.ocupacion_pct)}
                contexto={[`${num(m.espacios_comercializables)} espacios comercializables`]}
              />
              <Kpi
                rotulo="Sedes con plano"
                valor={num(m.sedes_con_plano)}
                contexto={[`último acceso ${m.ultimo_acceso ?? "sin registro"}`]}
              />
            </Kpis>
          </Bloque>
        ) : (
          <Nota>
            La cartera tampoco publica métricas de este cliente en este periodo. Lo que corresponde no es un análisis: es
            una operación (revisar la conexión de la base, o el estado de la cuenta).
          </Nota>
        )}
      </Capitulo>

      <Capitulo id="s-cap5" numero="5" titulo="De dónde sale">
        <Pie
          filas={[
            {
              t: "Periodo",
              v: `${periodo}${periodo === mesActual() ? " — el mes en curso todavía no termina." : " — el periodo ya cerró."}`,
            },
            {
              t: "Qué falta",
              v: "El detalle por cliente: espacios, contratos, proveedores, movimientos, oportunidades y recomendaciones.",
            },
            { t: "Bitácora", v: "Un intento fallido no deja línea: el backend anota después de armar, no antes." },
          ]}
        />
        {/* El reporte se enlaza sólo si el cliente EXISTE en el registro: con
            un slug inventado el enlace lleva a otro 404. */}
        {fila ? (
          <div style={{ marginTop: "var(--s4)" }}>
            <a className="plat-btn" href={`/plataforma/reporte/${encodeURIComponent(slug)}`}>
              → Reporte de transparencia del cliente
            </a>
          </div>
        ) : null}
      </Capitulo>
    </>
  );
}

// ─── La sesión entera ──────────────────────────────────────────────────────

function Sesion({
  detalle,
  der,
  tendencia,
  cartera,
  fila,
  onInforme,
}: {
  detalle: DetalleClienteShape;
  der: Derivado;
  tendencia: Tendencia | null;
  cartera: MetricasPlataforma | null;
  fila: ClienteMetricas | null;
  onInforme: () => void;
}) {
  const ctx: Contexto = { detalle, der };
  const serie = tendencia?.serie ?? [];
  /* Sin plano no hay sesión: no hay espacios, ni sedes, ni ocupación, ni
     oportunidades. Dibujar cinco capítulos de ceros sería contar cinco veces
     lo mismo, y encima mal («sin ocupación calculable de ocupación»). */
  if (der.espacios.length === 0) return <SesionSinPlano detalle={detalle} der={der} cartera={cartera} />;
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  const cons = cartera?.consolidado ?? null;
  /* El informe se arma sólo si hay un plano: sin espacios no hay ni ocupación,
     ni sedes, ni oportunidades — una hoja para el gerente con tres «sin dato»
     no es un informe. */
  const hayInforme = der.espacios.length > 0;

  const deltaIngreso =
    anterior && anterior.ingreso_contratado_mes !== null ? der.ingresoMes - anterior.ingreso_contratado_mes : null;
  const deltaIngresoPct =
    anterior && anterior.ingreso_contratado_mes !== null && anterior.ingreso_contratado_mes > 0
      ? (der.ingresoMes / anterior.ingreso_contratado_mes - 1) * 100
      : null;
  const vsCartera =
    der.ocupacionPct !== null && cons && cons.ocupacion_pct !== null ? der.ocupacionPct - cons.ocupacion_pct : null;
  const vsMes =
    der.ocupacionPct !== null && anterior && anterior.ocupacion_pct !== null
      ? der.ocupacionPct - anterior.ocupacion_pct
      : null;

  const origenes = new Set(detalle.oportunidades.map((o) => o.origen_precio));
  const comoSeValora =
    origenes.size === 0
      ? ""
      : origenes.size === 1 && origenes.has("cliente")
        ? " al precio que él mismo cobra por cada tipo"
        : origenes.size === 1 && origenes.has("benchmark")
          ? " al promedio de la plataforma, porque todavía no cobra ninguno de esos tipos"
          : " a su precio sugerido: el promedio propio, y el de la plataforma en los tipos donde todavía no cobra ninguno";

  return (
    <>
      {/* ── Tapa ── */}
      <div className="plat-tapa">
        <div className="rotulo">Sesión de asesoría</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--s5)", flexWrap: "wrap" }}>
          <h1 style={{ flex: 1, minWidth: 260 }}>
            {detalle.cliente.nombre} — {mesLargo(detalle.periodo)}
          </h1>
          {hayInforme ? (
            <button type="button" className="btn-principal no-imprime" onClick={onInforme} style={botonPrincipal}>
              Armar el informe para el cliente
            </button>
          ) : null}
        </div>
        <div className="cred">
          <span>
            <b>Periodo</b> {detalle.desde} a {detalle.hasta}
          </span>
          <span>
            <b>Cuenta</b>{" "}
            <Chip tono={detalle.cliente.estado_cuenta === "activo" ? "suave" : "fuerte"}>
              {ESTADO_CUENTA_TXT[detalle.cliente.estado_cuenta] ?? detalle.cliente.estado_cuenta}
            </Chip>
          </span>
          <span>
            <b>Contratos</b> {num(der.contratos)} vigentes
          </span>
          <span>
            <b>Generado</b> {generado(detalle.generado_en)}
          </span>
        </div>
      </div>

      <Cap1
        detalle={detalle}
        der={der}
        serie={serie}
        anterior={anterior}
        cons={cons}
        deltaIngreso={deltaIngreso}
        deltaIngresoPct={deltaIngresoPct}
        vsCartera={vsCartera}
        vsMes={vsMes}
        comoSeValora={comoSeValora}
      />
      <Cap2 ctx={ctx} fila={fila} />
      <Cap3 ctx={ctx} />
      <Cap4 detalle={detalle} der={der} />
      <Cap5 detalle={detalle} cartera={cartera} />
    </>
  );
}

const botonPrincipal: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  borderRadius: "var(--r-md)",
  padding: "9px 15px",
  fontSize: "var(--t-xs)",
  whiteSpace: "nowrap",
};

// ─── La sesión de un cliente sin plano ─────────────────────────────────────
//
// El endpoint respondió 200 y trajo un cliente entero: lo que no hay es
// inventario. Es un estado de pantalla distinto, no una sesión con huecos.

function SesionSinPlano({
  detalle,
  der,
  cartera,
}: {
  detalle: DetalleClienteShape;
  der: Derivado;
  cartera: MetricasPlataforma | null;
}) {
  const cons = cartera?.consolidado ?? null;
  return (
    <>
      <div className="plat-tapa">
        <div className="rotulo">Sesión de asesoría · sin plano</div>
        <h1>
          {detalle.cliente.nombre} — {mesLargo(detalle.periodo)}
        </h1>
        <div className="cred">
          <span>
            <b>Periodo</b> {detalle.desde} a {detalle.hasta}
          </span>
          <span>
            <b>Cuenta</b>{" "}
            <Chip tono={detalle.cliente.estado_cuenta === "activo" ? "suave" : "fuerte"}>
              {ESTADO_CUENTA_TXT[detalle.cliente.estado_cuenta] ?? detalle.cliente.estado_cuenta}
            </Chip>
          </span>
          <span>
            <b>Generado</b> {generado(detalle.generado_en)}
          </span>
        </div>
      </div>

      <Capitulo id="s-cap1" numero="1" titulo="Dónde está" der="lo que hay, y lo que falta para poder asesorar">
        <Frase>
          <Cif>Este cliente todavía no tiene un plano cargado</Cif>: cero espacios comercializables en cero sedes.
          {detalle.contratos_fuera_del_plano > 0 ? (
            <>
              {" "}
              Sí tiene <Cif>{plural(detalle.contratos_fuera_del_plano, "contrato", "contratos")}</Cif> sobre códigos que
              no están en ningún plano, por <Cif>{plata(der.ingresoMes)}</Cif> al mes: plata que entra y que no ocupa una
              cara.
            </>
          ) : (
            <> Sin plano no hay ocupación, ni oportunidades, ni precio sugerido: no hay negocio que medir todavía.</>
          )}
        </Frase>
        <Fuente>detalle.sedes_con_plano = 0 · detalle.espacios[] = [] · detalle.contratos_fuera_del_plano</Fuente>
        <Aviso rotulo="Lo que corresponde no es un análisis">
          Es una operación: <b>cargar el plano de al menos una sede</b>. Con el plano entran los espacios, y con los
          espacios entran la ocupación, las oportunidades y las recomendaciones — todo lo que esta sesión cuenta.
        </Aviso>
        {cons ? (
          <Bloque>
            <Titulillo>Lo único con que se lo puede comparar hoy es la cartera entera, y es un contraste sin dato propio.</Titulillo>
            <Kpis>
              <Kpi
                rotulo="Espacios comercializables"
                valor="0"
                contexto={[<>la cartera tiene {num(cons.espacios_comercializables)}</>]}
              />
              <Kpi
                rotulo="Ingreso contratado del mes"
                valor={plata(der.ingresoMes)}
                contexto={[<>la cartera entera factura {plata(cons.ingreso_contratado_mes)}</>]}
              />
              <Kpi
                rotulo="Sedes con plano"
                valor="0"
                contexto={[<>la cartera tiene {num(cons.sedes_con_plano)}</>]}
              />
            </Kpis>
          </Bloque>
        ) : null}
      </Capitulo>

      <Cap5 detalle={detalle} cartera={cartera} />
    </>
  );
}

// ═══ CAPÍTULO 1 · DÓNDE ESTÁ ═══════════════════════════════════════════════

function Cap1({
  detalle,
  der,
  serie,
  anterior,
  cons,
  deltaIngreso,
  deltaIngresoPct,
  vsCartera,
  vsMes,
  comoSeValora,
}: {
  detalle: DetalleClienteShape;
  der: Derivado;
  serie: PuntoTendencia[];
  anterior: PuntoTendencia | null;
  cons: MetricasPlataforma["consolidado"] | null;
  deltaIngreso: number | null;
  deltaIngresoPct: number | null;
  vsCartera: number | null;
  vsMes: number | null;
  comoSeValora: string;
}) {
  /* «Sin historia» no es «historia en cero»: un cliente que nunca tuvo un
     contrato no tiene doce meses que contar. */
  const hayHistoria =
    der.contratos > 0 ||
    serie.some((p) => (p.ingreso_contratado_mes ?? 0) > 0) ||
    detalle.movimientos.some((m) => m.entradas.length > 0 || m.salidas.length > 0);
  const contraCartera =
    vsCartera === null
      ? "sin referencia de la cartera en este periodo"
      : `${puntos(vsCartera)} contra la cartera (${pct(cons!.ocupacion_pct)})`;
  const contraMes =
    vsMes === null ? "sin mes anterior con que compararla" : `${puntos(vsMes)} contra ${mesNombre(anterior!.periodo)}`;

  const filas12 = serie.map((p) => {
    const mv = detalle.movimientos.find((m) => m.mes === p.periodo);
    const ent = mv ? mv.entradas.reduce((s, x) => s + x.canon_mensual, 0) : null;
    const sal = mv ? mv.salidas.reduce((s, x) => s + x.canon_mensual, 0) : null;
    return {
      m: p.periodo,
      e: p.espacios_comercializables === null ? "—" : num(p.espacios_comercializables),
      o: num(ocupadosDe(p)),
      p: pct(p.ocupacion_pct),
      i: plata(p.ingreso_contratado_mes),
      en: mv ? `${mv.entradas.length} · ${plata(ent)}` : "—",
      sa: mv ? `${mv.salidas.length} · ${plata(sal)}` : "—",
      n: p.sin_dato ? "sin snapshot" : p.parcial ? "mes en curso · parcial" : "",
    };
  });

  return (
    <Capitulo id="s-cap1" numero="1" titulo="Dónde está" der="contra el mes pasado y contra la cartera">
      <Frase>
        {detalle.cliente.nombre} factura <Cif>{plata(der.ingresoMes)}</Cif> este mes con {num(der.contratos)} contratos
        sobre {num(der.espacios.length)} espacios en {plural(detalle.sedes.length, "sede", "sedes")}:{" "}
        <Cif>{der.ocupacionPct === null ? "sin ocupación calculable" : pct(der.ocupacionPct)}</Cif> de ocupación,{" "}
        {contraCartera} y {contraMes}. Los <Cif>{num(der.enOferta)} espacios que puede vender hoy</Cif> —{num(der.libres)}{" "}
        libres y {num(der.seLiberan)} que se liberan este mes— valen <Cif>{plata(der.valor.espaciosLibres)}</Cif>{" "}
        mensuales{comoSeValora}.
      </Frase>
      <Fuente>
        detalle.proveedores[].canon_total · detalle.espacios[].estado · detalle.oportunidades[] ·
        tendencia.serie[{anterior ? anterior.periodo : "—"}] · metricas.consolidado
      </Fuente>

      <Bloque>
        <Kpis>
          <Kpi
            hero
            rotulo="Ingreso contratado del mes"
            valor={plata(der.ingresoMes)}
            contexto={[
              deltaIngreso === null ? (
                <>sin mes anterior publicado con que compararlo</>
              ) : deltaIngreso === 0 ? (
                <>
                  <b>igual que {mesNombre(anterior!.periodo)}</b>
                  {der.ingresoMes === 0 ? ": tampoco había contratos" : ""}
                </>
              ) : (
                <>
                  <b>
                    {sig(deltaIngreso, plata)}
                    {deltaIngresoPct === null ? " (venía de cero)" : ` · ${pctSig(deltaIngresoPct)}`}
                  </b>{" "}
                  contra {mesNombre(anterior!.periodo)}
                </>
              ),
              detalle.periodo === mesActual() ? <>y el mes todavía no terminó</> : <>y el periodo ya cerró</>,
            ]}
          />
          <Kpi
            rotulo="Ocupación"
            valor={der.ocupacionPct === null ? "sin dato" : pct(der.ocupacionPct)}
            contexto={[
              <>
                {num(der.ocupados + der.seLiberan)} de {num(der.espacios.length)} espacios
              </>,
              <>
                {vsCartera === null ? "sin referencia de cartera" : <b>{puntos(vsCartera)}</b>}
                {vsCartera === null ? "" : " contra la cartera"}
                {vsMes === null ? "" : <> · <b>{puntos(vsMes)}</b> contra el mes pasado</>}
              </>,
            ]}
          />
          <Kpi
            rotulo="Canon promedio mensual"
            valor={plata(der.canonPromedio)}
            contexto={
              der.canonPromedio === null
                ? [<>no existe el promedio de cero contratos</>]
                : cons && cons.canon_promedio_mensual !== null
                  ? [
                      <>
                        <b>{pctSig((der.canonPromedio / cons.canon_promedio_mensual - 1) * 100)}</b> contra la cartera (
                        {plata(cons.canon_promedio_mensual)})
                      </>,
                    ]
                  : [<>sin promedio de cartera con que compararlo</>]
            }
          />
          <Kpi
            rotulo="Espacios en oferta"
            valor={`${num(der.enOferta)} de ${num(der.espacios.length)}`}
            contexto={[
              <>
                {num(der.libres)} libres todo el periodo + {num(der.seLiberan)} que se liberan
              </>,
              der.espacios.length > 0 ? (
                <>
                  <b>{pct((der.enOferta / der.espacios.length) * 100, 0)}</b> del inventario está sin vender
                </>
              ) : (
                <>sin plano cargado</>
              ),
            ]}
          />
        </Kpis>
      </Bloque>

      <Bloque>
        {hayHistoria ? (
          <Titulillo>
            Doce meses en una sola rejilla de tiempo. Tres registros, tres paneles: nunca dos ejes en un mismo dibujo.
          </Titulillo>
        ) : null}
        {hayHistoria && serie.length >= 2 ? (
          <>
            <DosLineasConteo serie={serie} anotaciones={anotacionInventario(serie)} tabla={false} />
            <Frase chica>{fraseIngresoCliente(serie)}</Frase>
            <LineaIngreso
              serie={serie}
              anotaciones={anotacionCaidaIngreso(serie, detalle.movimientos)}
              rotulo={null}
              tabla={false}
            />
            <Frase chica>{fraseMovimientos(detalle.movimientos)}</Frase>
            <BarrasDivergentes movimientos={detalle.movimientos} tabla={false} />
          </>
        ) : (
          <Nota>
            {serie.length < 2
              ? "La tendencia de doce meses no está disponible para este cliente en este periodo."
              : "Los doce meses vienen con cero contratos, cero entradas y cero salidas. Un cliente que todavía no vendió nada no tiene historia: no se dibuja una línea plana como si la tuviera."}
          </Nota>
        )}
        {hayHistoria ? (
        <Aviso rotulo="Por qué la ocupación se dibuja en conteos y no en porcentaje">
          El denominador se mueve cuando entra el plano de una sede nueva. Una línea de porcentaje dibuja entonces un
          derrumbe que no ocurrió, y <b>ninguna anotación arregla un eje que miente</b>. Con dos líneas de conteo en una
          sola escala, el escalón está en el dato: la ocupación se lee como la brecha entre las dos.
        </Aviso>
        ) : null}
        {hayHistoria && serie.length >= 2 ? (
          <TablaEq rotulo={`Ver la tabla de los ${serie.length} meses`}>
            <Tabla
              minAncho={860}
              cols={[
                { k: "m", t: "Mes" },
                { k: "e", t: "Comercializables", num: true },
                { k: "o", t: "Ocupados", num: true },
                { k: "p", t: "Ocupación", num: true },
                { k: "i", t: "Ingreso", num: true },
                { k: "en", t: "Entradas", num: true },
                { k: "sa", t: "Salidas", num: true },
                { k: "n", t: "Nota" },
              ]}
              filas={filas12}
            />
          </TablaEq>
        ) : null}
      </Bloque>
    </Capitulo>
  );
}

// ═══ CAPÍTULO 2 · QUÉ ENCONTRAMOS ══════════════════════════════════════════

function Cap2({ ctx, fila }: { ctx: Contexto; fila: ClienteMetricas | null }) {
  const { detalle, der } = ctx;
  const rec = (tipo: Recomendacion["tipo"]) => detalle.recomendaciones.filter((r) => r.tipo === tipo);
  const hallazgos: HallazgoArmado[] = [];

  // — Inventario por tipo: dónde está lo que no se vende ————————————————
  const libresPorTipo = detalle.resumen_por_tipo.slice().sort((a, b) => b.libres - a.libres);
  const peorTipo = libresPorTipo[0];
  const recEspacio = rec("espacio_libre");
  if (der.espacios.length > 0 && peorTipo) {
    const valorTipo = recEspacio.reduce((s, r) => s + r.valor_estimado_mensual, 0);
    hallazgos.push({
      clave: "tipos",
      peso: valorTipo,
      titulo:
        der.enOferta === 0
          ? "El inventario está vendido entero"
          : `Lo que no se vende es sobre todo ${tipoN(peorTipo.tipo)}`,
      nodo: (id) => (
        <Hallazgo key={id} id={id} titulo={
          der.enOferta === 0 ? "El inventario está vendido entero" : `Lo que no se vende es sobre todo ${tipoN(peorTipo.tipo)}`
        }>
          <Frase chica>
            <Cif>
              {num(peorTipo.total)} de los {num(der.espacios.length)} espacios son {tipoP(peorTipo.tipo, peorTipo.total)}
            </Cif>{" "}
            ({pct((peorTipo.total / der.espacios.length) * 100, 0)}) y {num(peorTipo.libres)} de ellos están libres: son
            el <Cif>{der.libres > 0 ? pct((peorTipo.libres / der.libres) * 100, 0) : "—"} de todo lo vacío</Cif>.
            Vender el inventario libre de todos los tipos vale{" "}
            <Cif>{plata(der.valor.espaciosLibres)} al mes</Cif>.
          </Frase>
          <Fuente>detalle.resumen_por_tipo[] · detalle.espacios[].estado · detalle.oportunidades[]</Fuente>
          <Bloque>
            <Titulillo>
              Una marca por espacio: {num(der.espacios.length)} marcas, agrupadas por tipo, lo ocupado primero. El bloque
              verde de un tipo entero es el hallazgo.
            </Titulillo>
            <Unidades
              grupos={unidadesPorTipo(der.espacios, detalle.resumen_por_tipo)}
              clave={CLAVE_ESTADOS}
              tabla={false}
            />
            <TablaEq rotulo={`Ver la tabla de los ${detalle.resumen_por_tipo.length} tipos de espacio`}>
              <Tabla
                minAncho={760}
                cols={[
                  { k: "t", t: "Tipo" },
                  { k: "n", t: "Total", num: true },
                  { k: "o", t: "Ocupados", num: true },
                  { k: "l", t: "Libres", num: true },
                  { k: "p", t: "Precio sugerido", num: true },
                  { k: "d", t: "De dónde sale el precio" },
                  { k: "x", t: "Tarifa cargada" },
                ]}
                filas={detalle.resumen_por_tipo.map((t) => {
                  const o = detalle.oportunidades.find((x) => x.tipo === t.tipo);
                  return {
                    t: tipoN(t.tipo),
                    n: num(t.total),
                    o: num(t.ocupados),
                    l: num(t.libres),
                    p: o ? plata(o.precio_sugerido) : "—",
                    d:
                      !o || o.origen_precio === null
                        ? "sin nada en oferta de este tipo"
                        : o.origen_precio === "cliente"
                          ? "el promedio de este cliente"
                          : "el promedio de la plataforma",
                    x: t.tarifa_configurada ? "sí" : "no",
                  };
                })}
                total={{
                  t: "total",
                  n: num(der.espacios.length),
                  o: num(der.ocupados + der.seLiberan),
                  l: num(der.libres),
                }}
              />
            </TablaEq>
          </Bloque>
        </Hallazgo>
      ),
    });
  }

  // — La sede que no se vendió ——————————————————————————————————————————
  const recSede = rec("sede_subutilizada")[0] ?? null;
  if (detalle.sedes.length >= 2) {
    const peorSede = detalle.sedes
      .slice()
      .filter((s) => s.ocupacion_pct !== null)
      .sort((a, b) => (a.ocupacion_pct as number) - (b.ocupacion_pct as number))[0];
    const clave = recSede ? claveRec(recSede) : peorSede?.sede;
    const s = detalle.sedes.find((x) => x.sede === clave) ?? peorSede;
    if (s) {
      const titulo = recSede ? TITULO_HALLAZGO.sede_subutilizada : "Las sedes no rinden igual";
      hallazgos.push({
        clave: "sedes",
        peso: recSede ? recSede.valor_estimado_mensual : 0,
        titulo,
        nodo: (id) => (
          <Hallazgo key={id} id={id} titulo={titulo}>
            <Frase chica>
              <Cif>
                {s.sede} tiene {num(s.libres)} de los {num(der.libres)} espacios libres
              </Cif>{" "}
              del cliente ({der.libres > 0 ? pct((s.libres / der.libres) * 100, 0) : "—"}) y está al{" "}
              <Cif>{s.ocupacion_pct === null ? "sin ocupación calculable" : pct(s.ocupacion_pct)}</Cif> de ocupación
              {s.ocupacion_pct !== null && der.ocupacionPct !== null ? (
                <>, {puntos(s.ocupacion_pct - der.ocupacionPct)} contra el promedio del cliente ({pct(der.ocupacionPct)})</>
              ) : null}
              .{" "}
              {recSede ? (
                <>
                  Vender sólo ahí vale <Cif>{plata(recSede.valor_estimado_mensual)} al mes</Cif>.
                </>
              ) : (
                <>Ninguna sede queda 15 puntos por debajo del promedio: el backend no levanta una recomendación de sede.</>
              )}
            </Frase>
            <Fuente>
              detalle.sedes[] · detalle.espacios[].estado
              {recSede ? ` · recomendaciones[id="${recSede.id}"]` : ""}
            </Fuente>
            <Bloque>
              <Titulillo>
                El largo de la barra son los espacios de la sede, no un porcentaje: con porcentajes, una sede de 12
                espacios y una de 190 dibujan la misma barra y no son el mismo negocio.
              </Titulillo>
              <BarrasSedes espacios={der.espacios} promedioPct={der.ocupacionPct} tabla />
            </Bloque>
          </Hallazgo>
        ),
      });
    }
  }

  // — De quién depende ——————————————————————————————————————————————————
  const recConc = rec("concentracion_proveedor")[0] ?? null;
  if (detalle.proveedores.length > 0) {
    const p = recConc ? detalle.proveedores.find((x) => x.nombre === claveRec(recConc)) ?? der.proveedorTop : der.proveedorTop;
    const titulo = recConc ? TITULO_HALLAZGO.concentracion_proveedor : "Ningún proveedor pasa el umbral";
    if (p) {
      hallazgos.push({
        clave: "proveedores",
        peso: recConc ? recConc.valor_estimado_mensual : 0,
        titulo,
        nodo: (id) => (
          <Hallazgo key={id} id={id} titulo={titulo}>
            <Frase chica>
              <Cif>
                {p.nombre} tiene {num(p.espacios)} de los {num(der.contratos)} contratos
              </Cif>{" "}
              ({pct(p.participacion_pct)}) y {plata(p.canon_total)} de los {plata(der.ingresoMes)} de ingreso:{" "}
              <Cif>{der.ingresoMes > 0 ? pct((p.canon_total / der.ingresoMes) * 100) : "—"}</Cif>.{" "}
              {p.contratos_por_vencer_60d > 0
                ? `${plural(p.contratos_por_vencer_60d, "contrato suyo vence", "contratos suyos vencen")} en los próximos 60 días.`
                : "Ninguno de sus contratos vence en los próximos 60 días."}
            </Frase>
            <Fuente>detalle.proveedores[0]{recConc ? ` · recomendaciones[id="${recConc.id}"]` : ""}</Fuente>
            <Bloque>
              <Titulillo>
                {detalle.proveedores.length > 6
                  ? `Cinco nombres y un bloque: ${num(detalle.proveedores.length)} barras no contestan «¿de quién depende?», que tiene una sola respuesta.`
                  : `Los ${num(detalle.proveedores.length)} proveedores, ordenados, con el umbral de concentración marcado: la pregunta «¿de quién depende?» tiene una sola respuesta.`}
              </Titulillo>
              <Enfasis proveedores={detalle.proveedores} tabla />
              <Aviso rotulo="Dos números, dos cosas">
                La participación se cuenta <b>en contratos</b> ({pct(p.participacion_pct)}) y el peso en plata es{" "}
                <b>otro número</b> ({der.ingresoMes > 0 ? pct((p.canon_total / der.ingresoMes) * 100) : "—"}): este
                proveedor ocupa espacios {p.canon_total / Math.max(p.espacios, 1) > (der.canonPromedio ?? 0) ? "más caros" : "más baratos"}{" "}
                que el promedio. Hay que decir los dos, o la conversación con el cliente se cae.
              </Aviso>
            </Bloque>
          </Hallazgo>
        ),
      });
    }
  }

  // — Qué se cae y cuándo ————————————————————————————————————————————————
  if (der.porVencer.length > 0) {
    hallazgos.push({
      clave: "vencen",
      peso: der.valor.ingresoEnRiesgo,
      titulo: TITULO_HALLAZGO.contrato_por_vencer,
      nodo: (id) => {
        const dentro = der.porVencer.filter((x) => x.espacio.estado === "se_libera");
        const montoDentro = dentro.reduce((s, x) => s + (x.espacio.contrato?.canon_mensual ?? 0), 0);
        const monto = der.porVencer.reduce((s, x) => s + (x.espacio.contrato?.canon_mensual ?? 0), 0);
        return (
          <Hallazgo key={id} id={id} titulo={TITULO_HALLAZGO.contrato_por_vencer}>
            <Frase chica>
              <Cif>{plural(der.porVencer.length, "contrato vence", "contratos vencen")} dentro de 60 días</Cif> por{" "}
              <Cif>{plata(monto)} mensuales</Cif>
              {der.ingresoMes > 0 ? <>: el {pct((monto / der.ingresoMes) * 100)} del ingreso</> : null}.{" "}
              {dentro.length > 0
                ? `${plural(dentro.length, "se cae", "se caen")} dentro del periodo, por ${plata(
                    montoDentro
                  )}, y ya cambiaron de estado a «${ESTADO_TXT.se_libera}».`
                : "Ninguno se cae dentro del periodo: todos los espacios siguen ocupados este mes."}
            </Frase>
            <Fuente>detalle.espacios[].contrato.dias_para_vencer · detalle.espacios[].estado</Fuente>
            <Bloque>
              <Titulillo>
                Riel de 60 días, no de 90: el backend mira 60. Un tercio de riel vacío se leería como «no hay
                vencimientos», y no es cierto: es que no se miran.
              </Titulillo>
              {/* El cero del riel es `desde`, no la fecha de hoy: el backend
                  cuenta `dias_para_vencer` como `(fin − desde).days`. Con hoy
                  el corte de fin de periodo cae antes de donde va y un
                  contrato que vence dentro del mes salta al otro tramo. */}
              {/* La lista va DENTRO de la figura, en su `<details>`: es la
                  tabla equivalente del riel, no una tabla aparte. Las columnas
                  y el total son de acá —el riel arma otras—, así que entra por
                  `tablaNodo`. */}
              <RielVencimientos
                espacios={der.espacios}
                hasta={detalle.hasta}
                hoy={detalle.desde}
                etiquetaOrigen={fechaCorta(detalle.desde)}
                resumenTabla={`Ver la lista de ${plural(der.porVencer.length, "contrato", "contratos")}, por fecha`}
                tablaNodo={
                  <Tabla
                    minAncho={860}
                    cols={[
                      { k: "f", t: "Vence" },
                      { k: "d", t: "Días", num: true },
                      { k: "c", t: "Código" },
                      { k: "t", t: "Tipo" },
                      { k: "p", t: "Proveedor" },
                      { k: "v", t: "Canon mensual", num: true },
                      { k: "e", t: "Estado del espacio" },
                    ]}
                    filas={der.porVencer.map(({ espacio, dias }) => ({
                      f: fechaCorta(espacio.contrato!.fin),
                      d: num(dias),
                      c: espacio.codigo,
                      t: tipoN(espacio.tipo),
                      p: espacio.contrato!.proveedor,
                      v: plata(espacio.contrato!.canon_mensual),
                      e:
                        espacio.estado === "se_libera"
                          ? `ya está en «${ESTADO_TXT.se_libera}»`
                          : "ocupado todo el periodo",
                    }))}
                    total={{ f: "total", c: plural(der.porVencer.length, "contrato", "contratos"), v: plata(monto) }}
                  />
                }
              />
            </Bloque>
          </Hallazgo>
        );
      },
    });
  }

  // — Si cobra bien ——————————————————————————————————————————————————————
  const hayBenchmark = detalle.resumen_por_tipo.some(
    (t) => t.canon_promedio !== null && typeof detalle.benchmark_plataforma[t.tipo] === "number"
  );
  if (hayBenchmark) {
    const brechas = detalle.resumen_por_tipo
      .map((t) => {
        const b = detalle.benchmark_plataforma[t.tipo];
        if (t.canon_promedio === null || typeof b !== "number" || b === 0) return null;
        return { tipo: t.tipo, brecha: (t.canon_promedio / b - 1) * 100 };
      })
      .filter((x): x is { tipo: string; brecha: number } => x !== null)
      .sort((a, b) => a.brecha - b.brecha);
    const bajo = brechas.filter((x) => x.brecha < 0);
    const alto = brechas.filter((x) => x.brecha > 0);
    hallazgos.push({
      clave: "precio",
      peso: 0,
      titulo:
        bajo.length === 0
          ? "Cobra por encima del mercado en todos los tipos"
          : `Cobra por debajo del mercado en ${plural(bajo.length, "tipo", "tipos")}`,
      nodo: (id) => (
        <Hallazgo
          key={id}
          id={id}
          titulo={
            bajo.length === 0
              ? "Cobra por encima del mercado en todos los tipos"
              : `Cobra por debajo del mercado en ${plural(bajo.length, "tipo", "tipos")}`
          }
        >
          <Frase chica>
            Contra el promedio de la plataforma, {detalle.cliente.nombre} cobra{" "}
            {bajo.length > 0 ? (
              <>
                <Cif>
                  {pctSig(bajo[0].brecha)} en {tipoN(bajo[0].tipo)}
                </Cif>
                {bajo.slice(1, 3).map((x) => `, ${pctSig(x.brecha)} en ${tipoN(x.tipo)}`)}
                {bajo.length > 3 ? ` y ${plural(bajo.length - 3, "tipo más", "tipos más")}` : ""}
              </>
            ) : (
              <Cif>por encima en todos los tipos comparables</Cif>
            )}
            {alto.length > 0 ? `; y ${lista(alto.map((x) => `${pctSig(x.brecha)} en ${tipoN(x.tipo)}`))}` : ""}.
          </Frase>
          <Fuente>detalle.resumen_por_tipo[].canon_promedio ÷ detalle.benchmark_plataforma[tipo] — cuenta del frontend</Fuente>
          <Bloque>
            <Dumbbell resumen={detalle.resumen_por_tipo} benchmark={detalle.benchmark_plataforma} tabla />
            <Aviso rotulo="Esto NO es la recomendación «canon bajo su propio promedio»">
              Esa recomendación compara cada contrato contra el promedio del <b>propio cliente</b>: es dispersión
              interna. Este dibujo lo compara contra el <b>mercado</b>. Son dos hallazgos distintos y se nombran
              distinto, o el asesor cree que ya cubrió el segundo cuando leyó el primero. La brecha negativa no se suma
              en plata sin decidir a cuántos contratos se le aplicaría: por eso acá no hay un total.
            </Aviso>
          </Bloque>
        </Hallazgo>
      ),
    });
  }

  // — Lo que no se puede medir ———————————————————————————————————————————
  const m = fila?.metricas ?? null;
  if (der.tiposSinTarifa.length > 0 || (m && m.spread_pct === null)) {
    const tipos = der.tiposSinTarifa.map((t) => tipoN(t.tipo));
    hallazgos.push({
      clave: "medicion",
      peso: -1,
      titulo: TITULO_HALLAZGO.sin_tarifa,
      nodo: (id) => (
        <Hallazgo key={id} id={id} titulo={TITULO_HALLAZGO.sin_tarifa}>
          <Frase chica>
            {tipos.length > 0 ? (
              <>
                <Cif>
                  {lista(tipos)} no {tipos.length === 1 ? "tiene" : "tienen"} tarifa cargada
                </Cif>
                {m && m.contratos_sin_tarifa > 0 ? (
                  <>
                    : {plural(m.contratos_sin_tarifa, "contrato queda", "contratos quedan")} fuera del cálculo del
                    spread ({m.spread_pct === null ? "que por eso no existe" : pctSig(m.spread_pct)})
                  </>
                ) : m && m.spread_pct === null ? (
                  <>, y por eso este cliente no tiene spread en este periodo</>
                ) : null}
                .
              </>
            ) : (
              <Cif>Este cliente no tiene spread calculable en este periodo</Cif>
            )}{" "}
            {der.tiposSinTarifa.some((t) => t.canon_promedio === null)
              ? "Y de los tipos sin un solo contrato, el precio sugerido sale del promedio de la plataforma, no del cliente."
              : ""}
          </Frase>
          <Fuente>
            detalle.resumen_por_tipo[].tarifa_configurada · metricas.clientes[].spread_pct ·
            metricas.clientes[].contratos_sin_tarifa
          </Fuente>
          <Nota>
            Un cliente sin tarifa cargada no tiene spread: se dice, no se rellena. Y el precio de referencia que él
            configuró nunca sale de su base — sólo su relación con lo que cobra.
          </Nota>
        </Hallazgo>
      ),
    });
  }

  hallazgos.sort((a, b) => b.peso - a.peso);

  // — La contradicción que ninguna recomendación dice sola ————————————————
  const mayor = recEspacio.slice().sort((a, b) => b.valor_estimado_mensual - a.valor_estimado_mensual)[0] ?? null;
  const expuesto = der.valor.proveedoresExpuestos[0] ?? null;
  const chocan =
    mayor && expuesto
      ? detalle.oportunidades.some(
          (o) => o.tipo === claveRec(mayor) && o.candidatos.some((c) => c.proveedor === expuesto)
        )
      : false;
  const pExp = expuesto ? detalle.proveedores.find((x) => x.nombre === expuesto) ?? null : null;
  const nOfrecidos = mayor ? detalle.oportunidades.filter((o) => o.tipo === claveRec(mayor)).length : 0;
  const otroCandidato =
    mayor && expuesto
      ? detalle.oportunidades
          .filter((o) => o.tipo === claveRec(mayor))
          .flatMap((o) => o.candidatos.map((c) => c.proveedor))
          .find((n) => n !== expuesto) ?? null
      : null;

  return (
    <Capitulo
      id="s-cap2"
      numero="2"
      titulo="Qué encontramos"
      der={`${plural(hallazgos.length, "hallazgo", "hallazgos")}, en orden de lo que pesa`}
    >
      {hallazgos.map((h, i) => h.nodo(`H${i + 1}`))}

      {chocan && pExp && mayor ? (
        <Aviso rotulo="El hallazgo que ninguna recomendación dice sola">
          La recomendación de {plural(nOfrecidos, tipoP(claveRec(mayor), 1), tipoP(claveRec(mayor), nOfrecidos))} propone
          ofrecérselas a <b>{expuesto}</b> como candidato; la de concentración dice que ese proveedor{" "}
          <b>ya pesa el {pct(pExp.participacion_pct)}</b> de los contratos. Las dos son correctas y se contradicen:
          ofrecerle {num(nOfrecidos)} más lo llevaría al{" "}
          <b>
            {pct(((pExp.espacios + nOfrecidos) / (der.contratos + nOfrecidos)) * 100)} (
            {num(pExp.espacios + nOfrecidos)} de {num(der.contratos + nOfrecidos)} contratos)
          </b>
          . Por eso en la propuesta ese candidato va último y con su advertencia pegada al nombre
          {otroCandidato ? `, y el que va primero es ${otroCandidato}` : ""}.
        </Aviso>
      ) : null}
    </Capitulo>
  );
}

// ═══ CAPÍTULO 3 · QUÉ PROPONEMOS ═══════════════════════════════════════════

function Cap3({ ctx }: { ctx: Contexto }) {
  const { detalle, der } = ctx;
  const { alta, media, baja } = der.recomendaciones;
  const v = der.valor;
  const haySede = detalle.recomendaciones.some((r) => r.tipo === "sede_subutilizada");
  const hayConc = detalle.recomendaciones.some((r) => r.tipo === "concentracion_proveedor");
  const motivosDelTotal = [
    ...(haySede ? ["cuenta dos veces los mismos espacios (la sede subutilizada está adentro de los espacios libres por tipo)"] : []),
    ...(hayConc ? ["suma como oportunidad plata que ya está entrando (la concentración de proveedor)"] : []),
  ];
  /* Cuántos de los tres números existen de verdad: con uno solo, la frase no
     puede abrir diciendo «hay tres números». */
  const cuantos = [v.oportunidadNueva, v.ingresoEnRiesgo, v.ingresoExpuesto].filter((x) => x > 0).length;
  const tablaRecs = (arr: Recomendacion[]) => (
    <Tabla
      minAncho={720}
      cols={[
        { k: "a", t: "Acción" },
        { k: "e", t: "Evidencia" },
        { k: "v", t: "Vale al mes", num: true },
      ]}
      filas={arr.map((r) => ({
        a: accionRec(r, ctx),
        e: evidenciaRec(r, ctx),
        v: r.valor_estimado_mensual > 0 ? plata(r.valor_estimado_mensual) : "—",
      }))}
    />
  );

  return (
    <Capitulo
      id="s-cap3"
      numero="3"
      titulo="Qué proponemos"
      der={`${plural(detalle.recomendaciones.length, "acción", "acciones")} · ${plural(alta.length, "alta", "altas")}, ${plural(media.length, "media", "medias")}, ${plural(baja.length, "baja", "bajas")}`}
    >
      <Frase>
        {cuantos >= 2 ? (
          <>
            Hay <Cif>{cuantos === 3 ? "tres números y no se suman" : "dos números y no se suman"}</Cif>:{" "}
          </>
        ) : (
          <>Este mes hay un solo número que mover: </>
        )}
        <Cif>{plata(v.oportunidadNueva)}</Cif> de oportunidad nueva
        {der.ingresoMes > 0 ? <> —el {pct((v.oportunidadNueva / der.ingresoMes) * 100)} de lo que factura hoy—</> : null}
        {v.ingresoEnRiesgo > 0 ? (
          <>
            , <Cif>{plata(v.ingresoEnRiesgo)}</Cif> de ingreso en riesgo a 60 días
          </>
        ) : (
          <>, sin un solo contrato que venza en los próximos 60 días</>
        )}
        {v.ingresoExpuesto > 0 ? (
          <>
            , y <Cif>{plata(v.ingresoExpuesto)}</Cif> que ya entran, pero de una sola mano.
          </>
        ) : (
          <> y sin un proveedor que pase el umbral de concentración.</>
        )}
      </Frase>
      <Fuente>
        detalle.oportunidades[].valor_estimado_mensual · detalle.recomendaciones[].valor_estimado_mensual — el valor en
        juego lo arma el frontend: el endpoint no lo devuelve
      </Fuente>

      <Bloque>
        <Kpis>
          <Kpi
            rotulo="Oportunidad nueva · al mes"
            valor={plata(v.oportunidadNueva)}
            contexto={[
              <>{plata(v.espaciosLibres)} de espacio sin vender</>,
              ...(v.canonBajoSuPromedio > 0
                ? [<>+ {plata(v.canonBajoSuPromedio)} de canon bajo su propio promedio</>]
                : []),
              der.ingresoMes > 0 ? (
                <>
                  <b>{pct((v.oportunidadNueva / der.ingresoMes) * 100)}</b> de lo que factura hoy
                </>
              ) : (
                <>todavía no factura nada con que compararla</>
              ),
            ]}
          />
          <Kpi
            rotulo="Ingreso en riesgo · 60 días"
            valor={plata(v.ingresoEnRiesgo)}
            contexto={
              v.ingresoEnRiesgo === 0
                ? [<>ningún contrato vence en los próximos 60 días</>]
                : [
                    <>{plural(der.porVencer.length, "contrato", "contratos")} por vencer</>,
                    der.ingresoMes > 0 ? (
                      <>
                        <b>{pct((v.ingresoEnRiesgo / der.ingresoMes) * 100)}</b> del ingreso del mes
                      </>
                    ) : (
                      <>sin ingreso con que compararlo</>
                    ),
                  ]
            }
          />
          <Kpi
            rotulo="Ingreso expuesto a un proveedor"
            valor={plata(v.ingresoExpuesto)}
            contexto={
              v.proveedoresExpuestos.length === 0
                ? [<>ningún proveedor pasa el umbral de concentración</>]
                : [
                    <>{lista(v.proveedoresExpuestos)}</>,
                    der.ingresoMes > 0 ? (
                      <>
                        <b>{pct((v.ingresoExpuesto / der.ingresoMes) * 100)}</b> del ingreso · plata que YA entra
                      </>
                    ) : (
                      <>plata que YA entra, no oportunidad nueva</>
                    ),
                  ]
            }
          />
        </Kpis>
        {/* El aviso sólo aparece cuando el total crudo ESTÁ mal, y nombra
            únicamente los motivos que este cliente tiene. Con una sola
            recomendación no hay nada que explicar. */}
        {motivosDelTotal.length > 0 ? (
          <Aviso rotulo="El total que no existe">
            Sumar las {num(detalle.recomendaciones.length)} recomendaciones da <b>{plata(v.bruto)}</b>, y ese número no
            existe: {lista(motivosDelTotal)}. Uno es plata que podría entrar, otro plata que podría salir, el tercero
            plata que ya entra: no se suman entre sí.
          </Aviso>
        ) : null}
      </Bloque>

      <Bloque>
        <Titulillo>
          {alta.length === 0
            ? "No hay recomendaciones de prioridad alta en este periodo."
            : alta.length === 1
              ? "La única de prioridad alta. Es una acción con un número, no una descripción."
              : `Las ${alta.length} de prioridad alta, en orden de valor. Cada una es una acción con un número, no una descripción.`}
        </Titulillo>
        {alta.map((r, i) => (
          <Recomendada key={r.id} rec={r} n={String(i + 1)} ctx={ctx} conEscalera />
        ))}
        {media.length > 0 ? (
          <TablaEq rotulo={`Ver las ${media.length} de prioridad media`}>{tablaRecs(media)}</TablaEq>
        ) : null}
        {baja.length > 0 ? (
          <TablaEq rotulo={`Ver las ${baja.length} de prioridad baja`}>{tablaRecs(baja)}</TablaEq>
        ) : null}
        <Nota>
          La prioridad es palabra y es orden, nunca sólo color.
          {detalle.recomendaciones.some((r) => r.valor_estimado_mensual === 0)
            ? " Y una acción con valor $ 0 no es un descuido: dejar la tarifa cargada no trae plata, trae una medición que hoy falta."
            : ""}
        </Nota>
      </Bloque>

    </Capitulo>
  );
}

// ═══ CAPÍTULO 4 · LOS DATOS DETRÁS ═════════════════════════════════════════

function Cap4({ detalle, der }: { detalle: DetalleClienteShape; der: Derivado }) {
  const [sede, setSede] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [busca, setBusca] = useState("");

  const q = busca.trim().toLowerCase();
  const pasa = (e: EspacioDetalle) => {
    if (sede && e.sede !== sede) return false;
    if (tipo && e.tipo !== tipo) return false;
    if (estado && e.estado !== estado) return false;
    if (q) {
      const heno = `${e.codigo} ${e.zona ?? ""} ${e.contrato ? `${e.contrato.proveedor} ${e.contrato.marca ?? ""}` : ""}`;
      if (!heno.toLowerCase().includes(q)) return false;
    }
    return true;
  };
  const espacios = der.espacios.filter(pasa);
  const contratos = espacios.filter((e) => e.contrato !== null);
  const proveedores = detalle.proveedores.filter(
    (p) => (!q || p.nombre.toLowerCase().includes(q)) && (!sede || p.sedes.includes(sede)) && (!tipo || p.tipos.includes(tipo))
  );
  const movFilas = detalle.movimientos.flatMap((mv) => [
    ...mv.entradas.map((x) => ({
      m: mv.mes,
      s: "entró",
      p: x.proveedor,
      c: x.codigo,
      t: tipoN(x.tipo),
      v: plata(x.canon_mensual),
      f: fechaCorta(x.fecha),
      r: x.cancelado ? "alta que después se canceló" : "—",
    })),
    ...mv.salidas.map((x) => ({
      m: mv.mes,
      s: "salió",
      p: x.proveedor,
      c: x.codigo,
      t: tipoN(x.tipo),
      v: plata(x.canon_mensual),
      f: fechaCorta(x.fecha),
      r: x.motivo === "cancelacion" ? "cancelación" : "vencimiento",
    })),
  ]);
  const movVisibles = movFilas.filter(
    (f) => !q || `${f.p} ${f.c} ${f.t}`.toLowerCase().includes(q)
  );
  const sinCandidatos =
    detalle.oportunidades.length > 0 && detalle.oportunidades.every((o) => o.candidatos.length === 0);

  return (
    <Capitulo
      id="s-cap4"
      numero="4"
      titulo="Los datos detrás"
      der="plegados por defecto · cada cifra de arriba aterriza acá"
    >
      <Frase chica>
        Todo lo de arriba se puede rastrear hasta acá: <Cif>{num(der.espacios.length)} espacios</Cif>,{" "}
        <Cif>{num(der.contratos)} contratos</Cif>, <Cif>{num(detalle.proveedores.length)} proveedores</Cif> y{" "}
        <Cif>{num(detalle.movimientos.length)} meses de movimientos</Cif>. Nada se abre solo.
      </Frase>
      <Fuente>detalle.espacios[] · detalle.espacios[].contrato · detalle.proveedores[] · detalle.movimientos[]</Fuente>

      <div className="plat-filtros no-imprime">
        <label htmlFor="f-sede">Filtros de este capítulo:</label>
        <select id="f-sede" value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
          <option value="">todas las sedes</option>
          {detalle.sedes.map((s) => (
            <option key={s.sede} value={s.sede}>
              {s.sede}
            </option>
          ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de espacio">
          <option value="">todos los tipos</option>
          {detalle.resumen_por_tipo.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {tipoN(t.tipo)}
            </option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado del espacio">
          <option value="">todos los estados</option>
          <option value="libre">{ESTADO_TXT.libre}</option>
          <option value="se_libera">{ESTADO_TXT.se_libera}</option>
          <option value="ocupado">{ESTADO_TXT.ocupado}</option>
        </select>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="código, zona o proveedor…"
          aria-label="Buscar código, zona o proveedor"
        />
        <span className="mut" style={{ marginLeft: "auto" }}>
          {num(espacios.length)} de {num(der.espacios.length)} espacios
        </span>
      </div>

      <Cajon rotulo="Espacios" cuenta={`${num(espacios.length)} de ${num(der.espacios.length)}`}>
        <Tabla
          minAncho={1080}
          cols={[
            { k: "c", t: "Código" },
            { k: "s", t: "Sede" },
            { k: "t", t: "Tipo" },
            { k: "z", t: "Zona" },
            { k: "a", t: "m²", num: true },
            { k: "e", t: "Estado" },
            { k: "p", t: "Proveedor · marca" },
            { k: "v", t: "Canon", num: true },
            { k: "f", t: "Vence" },
            { k: "d", t: "Días", num: true },
          ]}
          filas={espacios.map((e) => ({
            c: e.codigo,
            s: e.sede,
            t: tipoN(e.tipo),
            z: e.zona ?? "—",
            a: e.area_m2 === null ? "—" : e.area_m2,
            e: <MarcaEstado estado={e.estado} texto={ESTADO_TXT[e.estado]} />,
            p: e.contrato ? `${e.contrato.proveedor}${e.contrato.marca ? ` · ${e.contrato.marca}` : ""}` : "—",
            v: e.contrato ? plata(e.contrato.canon_mensual) : "—",
            f: e.contrato ? fechaCorta(e.contrato.fin) : "—",
            d: e.contrato ? num(e.contrato.dias_para_vencer) : "—",
          }))}
        />
      </Cajon>

      <Cajon
        rotulo="Contratos"
        cuenta={`${num(der.contratos)} · ${num(der.contratosEnPlano)} sobre el plano + ${num(
          detalle.contratos_fuera_del_plano
        )} fuera`}
      >
        <Tabla
          minAncho={1020}
          cols={[
            { k: "c", t: "Código" },
            { k: "p", t: "Proveedor" },
            { k: "m", t: "Marca" },
            { k: "t", t: "Tipo" },
            { k: "v", t: "Canon mensual", num: true },
            { k: "i", t: "Inicio" },
            { k: "f", t: "Fin" },
            { k: "d", t: "Días para vencer", num: true },
            { k: "a", t: "Arranca en el periodo" },
          ]}
          filas={contratos.map((e) => ({
            c: e.codigo,
            p: e.contrato!.proveedor,
            m: e.contrato!.marca ?? "—",
            t: tipoN(e.tipo),
            v: plata(e.contrato!.canon_mensual),
            i: fechaCorta(e.contrato!.inicio),
            f: fechaCorta(e.contrato!.fin),
            d: num(e.contrato!.dias_para_vencer),
            a: e.contrato!.arranca_en_periodo ? "sí" : "no",
          }))}
        />
        <Nota>
          {detalle.contratos_fuera_del_plano > 0 ? (
            <>
              Hay {plural(detalle.contratos_fuera_del_plano, "contrato", "contratos")} sobre códigos que{" "}
              {detalle.contratos_fuera_del_plano === 1 ? "no está" : "no están"} en el plano. Suman al ingreso y{" "}
              <b>no suman a la ocupación</b>, porque no hay cara que ocupar — por eso no aparecen en esta tabla, que se
              arma desde los espacios. Sin esta línea, ingreso y ocupación no cierran y nadie sabe por qué.
            </>
          ) : (
            <>Todos los contratos vigentes están sobre una cara del plano: ingreso y ocupación cierran sin residuo.</>
          )}
        </Nota>
      </Cajon>

      <Cajon rotulo="Proveedores" cuenta={`${num(proveedores.length)} de ${num(detalle.proveedores.length)}`}>
        <Tabla
          minAncho={1020}
          cols={[
            { k: "n", t: "Proveedor" },
            { k: "e", t: "Contratos", num: true },
            { k: "t", t: "Tipos" },
            { k: "s", t: "Sedes" },
            { k: "c", t: "Canon total", num: true },
            { k: "m", t: "Canon promedio", num: true },
            { k: "p", t: "Participación", num: true },
            { k: "d", t: "Desde" },
            { k: "v", t: "Vencen a 60 d", num: true },
          ]}
          filas={proveedores.map((p) => ({
            n: p.nombre,
            e: num(p.espacios),
            t: p.tipos.map(tipoN).join(", "),
            s: p.sedes.join(", "),
            c: plata(p.canon_total),
            m: plata(p.canon_promedio),
            p: pct(p.participacion_pct),
            d: p.desde ? fechaCorta(p.desde) : "—",
            v: num(p.contratos_por_vencer_60d),
          }))}
          total={{ n: "total", e: num(der.contratos), c: plata(der.ingresoMes) }}
        />
      </Cajon>

      {/* La quinta tabla de A: las oportunidades completas, PLEGADAS, acá y no
          en «Qué proponemos». En el capítulo 3 vive la escalera —el precio, a
          quién, y los grupos por sede—; la lista entera de sede × tipo es el
          dato detrás, y se abre cuando alguien la pide. */}
      <Cajon
        rotulo="Oportunidades"
        cuenta={`${num(detalle.oportunidades.length)} espacios en ${num(der.gruposOportunidad.length)} grupos de sede × tipo`}
      >
        {sinCandidatos ? (
          <Aviso rotulo="Todavía no hay a quién ofrecérselo desde adentro">
            Las {num(detalle.oportunidades.length)} oportunidades vienen con <b>la lista de candidatos vacía</b>. No es
            un error del sistema: este cliente no tiene un solo proveedor a quien parecerse. Y no se rellena con
            proveedores de otros clientes — eso cruzaría la frontera de datos.
          </Aviso>
        ) : null}
        {der.gruposOportunidad.length === 0 ? (
          <Nota>No hay espacios libres ni que se liberen en este periodo: no hay nada que ofrecer.</Nota>
        ) : (
          <Tabla
            minAncho={940}
            cols={[
              { k: "s", t: "Sede" },
              { k: "t", t: "Tipo" },
              { k: "n", t: "En oferta", num: true },
              { k: "p", t: "Precio sugerido", num: true },
              { k: "o", t: "De dónde sale el precio" },
              { k: "v", t: "Vale al mes", num: true },
              { k: "c", t: "Candidatos" },
              { k: "k", t: "Códigos" },
            ]}
            filas={der.gruposOportunidad.map((g) => ({
              s: g.sede,
              t: tipoN(g.tipo),
              n: g.seLiberan > 0 ? `${num(g.n)} (${g.seLiberan} se libera)` : num(g.n),
              p: plata(g.precio),
              o:
                g.origen === "cliente"
                  ? "promedio de este cliente"
                  : g.origen === "benchmark"
                    ? "promedio de la plataforma"
                    : "sin referencia",
              v: plata(g.valor),
              c: g.candidatos.slice(0, 3).join(" · ") || "sin candidatos",
              k: <GrupoCodigos sede={`ver ${g.n}`} cuenta={g.n} codigos={g.codigos} />,
            }))}
            total={{
              s: "total",
              n: `${num(detalle.oportunidades.length)} espacios en ${num(der.gruposOportunidad.length)} grupos`,
              v: plata(der.gruposOportunidad.reduce((t, g) => t + g.valor, 0)),
            }}
          />
        )}
      </Cajon>

      <Cajon rotulo="Movimientos" cuenta={`${num(movVisibles.length)} de ${num(movFilas.length)} en 12 meses`}>
        {movFilas.length === 0 ? (
          <Nota>
            Los doce meses vienen con cero entradas y cero salidas. Un cliente sin historia no dibuja una línea plana
            como si la tuviera.
          </Nota>
        ) : (
          <Tabla
            minAncho={940}
            cols={[
              { k: "m", t: "Mes" },
              { k: "s", t: "" },
              { k: "p", t: "Proveedor" },
              { k: "c", t: "Código" },
              { k: "t", t: "Tipo" },
              { k: "v", t: "Canon", num: true },
              { k: "f", t: "Fecha" },
              { k: "r", t: "Motivo" },
            ]}
            filas={movVisibles}
          />
        )}
      </Cajon>
    </Capitulo>
  );
}

// ═══ CAPÍTULO 5 · DE DÓNDE SALE ════════════════════════════════════════════

function Cap5({ detalle, cartera }: { detalle: DetalleClienteShape; cartera: MetricasPlataforma | null }) {
  const sinTarifa = detalle.resumen_por_tipo.filter((t) => !t.tarifa_configurada).map((t) => tipoN(t.tipo));
  const sinContratos = detalle.resumen_por_tipo.filter((t) => t.canon_promedio === null).map((t) => tipoN(t.tipo));
  return (
    <Capitulo id="s-cap5" numero="5" titulo="De dónde sale">
      <Pie
        filas={[
          {
            t: "Periodo",
            v: `${detalle.periodo} (${detalle.desde} a ${detalle.hasta})${
              detalle.periodo === mesActual() ? " — el mes en curso todavía no termina." : " — el periodo ya cerró."
            }`,
          },
          { t: "Generado", v: generado(detalle.generado_en) },
          {
            t: "Cobertura del promedio de plataforma",
            v: cartera
              ? `Promedio por tipo sobre los clientes legibles del periodo: ${
                  cartera.consolidado.clientes_total - cartera.consolidado.clientes_con_error
                } de ${cartera.consolidado.clientes_total}.`
              : "La cartera no se pudo leer en esta carga: la cobertura del promedio de plataforma queda sin dato.",
          },
          {
            t: "Sin dato",
            v:
              sinContratos.length > 0 || sinTarifa.length > 0
                ? `${
                    sinContratos.length > 0
                      ? `${sinContratos.join(", ")} no ${sinContratos.length === 1 ? "tiene" : "tienen"} contratos vigentes → su precio sugerido viene del promedio de la plataforma. `
                      : ""
                  }${
                    sinTarifa.length > 0
                      ? `${sinTarifa.join(", ")} sin tarifa cargada → sus contratos quedan fuera del spread.`
                      : ""
                  }`
                : detalle.resumen_por_tipo.length === 0
                  ? "No hay tipos de espacio en este cliente: sin plano no hay nada que declarar."
                  : "Todos los tipos tienen contratos vigentes y tarifa cargada: no hay huecos que declarar.",
          },
          {
            t: "Lo que no se muestra nunca",
            v: "El precio de referencia que este cliente configuró. Sólo su relación con lo que cobra, y si existe.",
          },
          { t: "Bitácora", v: "Esta consulta queda anotada y el cliente la puede ver en su reporte." },
        ]}
      />
      <div style={{ marginTop: "var(--s4)" }}>
        <a className="plat-btn" href={`/plataforma/reporte/${encodeURIComponent(detalle.cliente.slug)}`}>
          → Reporte de transparencia del cliente
        </a>
      </div>
      <Nota>
        Endpoints: GET /api/plataforma/clientes/{detalle.cliente.slug}/detalle?periodo={detalle.periodo} · GET
        /api/plataforma/tendencia?cliente={detalle.cliente.slug}&amp;meses=12 · GET /api/plataforma/metricas
      </Nota>
    </Capitulo>
  );
}
