import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import {
  CONSOLIDADO_SLUG,
  getAdopcion,
  getClientesPlataforma,
  getMetricasPlataforma,
  getTendencia,
  soyOperador,
  type Adopcion,
  type ClientePlataforma,
  type MetricasPlataforma,
  type PuntoTendencia,
  type Tendencia,
} from "../api/plataforma";
import { describeError } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { TemaToggle } from "../tema";
import {
  CLAVE_ADOPCION,
  DosLineasConteo,
  EjeSpread,
  LineaIngreso,
  Medidor,
  Unidades,
  unidadesAdopcion,
} from "../components/plataforma/graficos";
import {
  mesCorto,
  mesLargo,
  num,
  pct,
  periodosOfrecidos,
  plata,
  plural,
  puntos,
  sig,
  SIN_DATO,
} from "../components/plataforma/formato";
import {
  anotacionIngreso,
  anotacionesDenominador,
  armarCola,
  armarComposicion,
  avisoDenominador,
  casiCero,
  fraseAdopcion,
  fraseSpread,
  movimiento,
  urgentes,
  type Composicion,
  type OrdenCola,
} from "../components/plataforma/cartera-datos";
import { ColaLlamadas } from "../components/plataforma/cartera-cola";
import {
  TablaEstados,
  TablaSupresiones,
  useSupresiones,
} from "../components/plataforma/cartera-operativo";
import { TablaCobros, mapaDeModos, useCartera } from "../components/plataforma/cartera-cobros";

/* ============================================================================
   /plataforma — PIEZA 1 DE A («El informe»): LA CARTERA

   La consola es un DOCUMENTO, no un tablero. Se lee de arriba abajo, cada
   capítulo abre con su frase-conclusión —el hallazgo con su número—, debajo
   de la frase va la RUTA del JSON en monoespaciada («¿de dónde sale?»
   contestada sin abrir un panel), los gráficos van anotados sobre el dato y
   el detalle va plegado. El índice de la izquierda es el «en esta pieza» de
   A; la cola de llamadas es lo único operativo, y desde cada fila se entra a
   la sesión de asesoría de ese cliente.

   Siete capítulos, los de A:

     1.1 el titular con la corrección de composición · 1.2 la tendencia de
     doce meses anotada · 1.3 la cola de llamadas · 1.4 quién cobra por
     debajo · 1.5 la adopción · 1.6 lo operativo · 1.7 de dónde sale.

   ── Lo que cambia respecto del prototipo, y por qué ───────────────────────

   A es una maqueta con datos inventados y con un bloque `_derivado_frontend`
   servido en el JSON. Acá los datos son los de la API real
   (`/plataforma/metricas`, `/tendencia`, `/adopcion`, `/clientes`,
   `/supresiones`) y **lo derivado se calcula de las claves que sí existen**
   (`components/plataforma/cartera-datos.ts`). Lo que la API no trae se dice:

     · La cartera **no publica el total de contratos activos** por cliente. Se
       podría despejar (ingreso ÷ canon promedio) y sería una inferencia, no
       un dato: no se muestra, y el pie lo dice.
     · La cartera **no publica la participación** de un proveedor: sin el
       total de contratos del cliente, un porcentaje sobre el top 5 es un
       número inventado. Esa lectura vive en el detalle, no acá.
     · `/tendencia` y `/adopcion` **no toman el periodo**: la serie termina
       siempre en el mes en curso y la adopción se calcula a hoy. El selector
       de arriba manda sobre `/metricas`, y el pie escribe esa asimetría en
       vez de repintar un rótulo sobre los mismos números.
     · La **tarifa de referencia** de un cliente no se pinta nunca: sólo su
       relación (`spread_pct`) y si existe (`tarifa_configurada`).

   ── Las reglas de forma que se respetan ───────────────────────────────────

   Un solo amarillo por pantalla (`.btn-principal`), y es el botón de la
   llamada #1 de la cola. Los chips de señal y de estado de cuenta van en
   tinta gris con la palabra: el verde, el ámbar y el rojo codifican estado de
   ESPACIO y nada más. Ningún gráfico sin su frase arriba, ninguno sin su
   tabla equivalente alcanzable sin hover, y ni un tooltip como único camino a
   un valor.

   El guard `soyOperador` y el manejo de 401/403/503 se conservan tal cual: el
   403 real lo tira el backend en cada endpoint, esto sólo evita que alguien
   que no es operador vea la forma de la pantalla un instante, y el `detail`
   que llegue se muestra tal cual, sin inventarle un mensaje.
   ========================================================================== */

const mesActual = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const haceMin = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return SIN_DATO;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 min";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
};

const CAPITULOS: Array<{ id: string; num: string; titulo: string }> = [
  { id: "c-titular", num: "1.1", titulo: "El titular" },
  { id: "c-tendencia", num: "1.2", titulo: "La tendencia de 12 meses" },
  { id: "c-cola", num: "1.3", titulo: "La cola de llamadas" },
  { id: "c-spread", num: "1.4", titulo: "Quién cobra por debajo" },
  { id: "c-adopcion", num: "1.5", titulo: "La adopción" },
  { id: "c-operativo", num: "1.6", titulo: "Lo operativo" },
  { id: "c-fuente", num: "1.7", titulo: "De dónde sale" },
];

// ─── Piezas del documento ──────────────────────────────────────────────────

function Capitulo({
  id,
  numero,
  titulo,
  der,
  children,
}: {
  id: string;
  numero: string;
  titulo: string;
  der?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="plat-cap" id={id}>
      <div className="plat-cap-cab">
        <span className="num">{numero}</span>
        <h2>{titulo}</h2>
        {der && <span className="der">{der}</span>}
      </div>
      {children}
    </section>
  );
}

/** La frase-conclusión y, debajo, la ruta del JSON de la que sale. Es el
 *  contrato de cada bloque: si el bloque dibujado no la deja leer en tres
 *  segundos, el bloque está mal. */
function Frase({ chica, ruta, children }: { chica?: boolean; ruta: string; children: React.ReactNode }) {
  return (
    <>
      <p className={"plat-frase" + (chica ? " chica" : "")}>{children}</p>
      <div className="plat-fuente">{ruta}</div>
    </>
  );
}

function Kpi({
  hero,
  et,
  v,
  c,
}: {
  hero?: boolean;
  et: string;
  v: string;
  c?: React.ReactNode[];
}) {
  return (
    <div className={"plat-kpi" + (hero ? " hero" : "")}>
      <div className="et">{et}</div>
      <div className="v">{v}</div>
      {c && c.length > 0 && (
        <div className="c">
          {c.map((linea, i) => (
            <div key={i}>{linea}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Aviso({ rotulo, children }: { rotulo?: string; children: React.ReactNode }) {
  return (
    <div className="plat-aviso">
      {rotulo && <span className="rotulo">{rotulo}</span>}
      {children}
    </div>
  );
}

// ─── 1.1 · La tabla de la corrección de composición ────────────────────────

function TablaComposicion({ comp, mes }: { comp: Composicion; mes: string }) {
  const cols = [
    { k: "pub", t: comp.mesAnterior ? `${mesCorto(comp.mesAnterior)} publicado` : "mes anterior", col: comp.publicado },
    {
      k: "cmp",
      t: comp.mesAnterior ? `${mesCorto(comp.mesAnterior)} comparable` : "comparable",
      col: comp.comparable,
      tachado: false,
    },
    { k: "act", t: mesCorto(mes), col: comp.actual },
  ];
  const filas: Array<{ q: string; f: (c: Composicion["actual"] | null) => string }> = [
    { q: "clientes en la cuenta", f: (c) => (c ? c.clientes : SIN_DATO) },
    { q: "espacios comercializables", f: (c) => (c ? num(c.espacios) : SIN_DATO) },
    { q: "ocupación", f: (c) => (c ? pct(c.ocupacion) : SIN_DATO) },
    { q: "ingreso contratado", f: (c) => (c ? plata(c.ingreso) : SIN_DATO) },
  ];
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c.k} className="num">
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.q}>
              <td>{f.q}</td>
              {cols.map((c) => (
                <td key={c.k} className="num">
                  {c.k === "pub" && !comp.mismaComposicion && comp.comparable ? (
                    <span className="tachado">{f.f(c.col)}</span>
                  ) : (
                    f.f(c.col)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 1.5 · Cohortes: tabla, sin gráfico ────────────────────────────────────

function TablaCohortes({ adopcion }: { adopcion: Adopcion }) {
  if (adopcion.cohortes.length === 0) return <p className="plat-nota">Sin cohortes: ningún cliente tiene fecha de alta.</p>;
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Cohorte (mes de alta)</th>
            <th className="num">Clientes</th>
            <th className="num">Con acceso en 30 días</th>
            <th className="num">Retención</th>
            <th>Clases</th>
          </tr>
        </thead>
        <tbody>
          {adopcion.cohortes.map((h) => {
            const ret = h.retencion_30d_pct === null ? null : Math.round((h.clientes * h.retencion_30d_pct) / 100);
            const clases = (["activa", "fantasma", "dormida", "sin_cuentas", "nueva"] as const)
              .filter((k) => h[k] > 0)
              .map((k) => `${h[k]} ${k.replace("_", " ")}`)
              .join(" · ");
            return (
              <tr key={h.cohorte ?? "sin-fecha"}>
                <td>{h.cohorte ?? "sin fecha de alta"}</td>
                <td className="num">{h.clientes}</td>
                <td className="num">{ret === null ? SIN_DATO : `${ret} de ${h.clientes}`}</td>
                <td className="num">
                  {h.retencion_30d_pct === null ? SIN_DATO : `${pct(h.retencion_30d_pct, 0)} (n = ${h.clientes})`}
                </td>
                <td>{clases || SIN_DATO}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── La página ─────────────────────────────────────────────────────────────

export default function Plataforma() {
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  /* Guard de cortesía: mientras no se sepa, no se pinta nada de negocio. */
  const [operador, setOperador] = useState<"verificando" | "si" | "no">("verificando");
  useEffect(() => {
    let vivo = true;
    soyOperador()
      .then((v) => {
        if (vivo) setOperador(v ? "si" : "no");
      })
      .catch(() => {
        if (vivo) setOperador("no");
      });
    return () => {
      vivo = false;
    };
  }, []);

  // ── El periodo manda sobre /metricas ────────────────────────────────────
  const [periodo, setPeriodo] = useState(mesActual());
  const [metricas, setMetricas] = useState<MetricasPlataforma | null>(null);
  const [metricasError, setMetricasError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  /* Sube en cada resolución de /metricas. La tendencia y la adopción se piden
     DESPUÉS, nunca antes: el backend hace write-through del snapshot del mes
     en curso al calcular métricas, así que pedir la tendencia primero deja el
     mes actual como «sin dato». */
  const [version, setVersion] = useState(0);
  /* Sube cuando la consola archiva, reactiva, renombra o borra un cliente:
     cambió quién cuenta en el análisis y se vuelve a pedir todo. */
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (operador !== "si") return;
    let vivo = true;
    setCargando(true);
    setMetricasError(null);
    getMetricasPlataforma(periodo)
      .then((m) => {
        if (vivo) setMetricas(m);
      })
      .catch((err) => {
        if (vivo) setMetricasError(describeError(err, "No se pudieron leer las métricas."));
      })
      .finally(() => {
        if (!vivo) return;
        setCargando(false);
        setVersion((v) => v + 1);
      });
    return () => {
      vivo = false;
    };
  }, [operador, periodo, recarga]);

  // ── Tendencia del consolidado ───────────────────────────────────────────
  const [tendencia, setTendencia] = useState<Tendencia | null>(null);
  const [tendenciaError, setTendenciaError] = useState<string | null>(null);
  useEffect(() => {
    if (operador !== "si" || version === 0) return;
    let vivo = true;
    setTendenciaError(null);
    getTendencia(CONSOLIDADO_SLUG, 12)
      .then((t) => {
        if (vivo) setTendencia(t);
      })
      .catch((err) => {
        if (vivo) setTendenciaError(describeError(err, "No se pudo leer la tendencia."));
      });
    return () => {
      vivo = false;
    };
  }, [operador, version]);

  // ── Adopción ────────────────────────────────────────────────────────────
  const [adopcion, setAdopcion] = useState<Adopcion | null>(null);
  const [adopcionError, setAdopcionError] = useState<string | null>(null);
  useEffect(() => {
    if (operador !== "si" || version === 0) return;
    let vivo = true;
    setAdopcionError(null);
    getAdopcion()
      .then((a) => {
        if (vivo) setAdopcion(a);
      })
      .catch((err) => {
        if (vivo) setAdopcionError(describeError(err, "No se pudo leer la adopción."));
      });
    return () => {
      vivo = false;
    };
  }, [operador, version]);

  // ── La serie de los clientes que hoy no se dejan leer ───────────────────
  //
  // Es lo que hace posible la corrección de composición del titular sin
  // inventar nada: `/tendencia?cliente=<slug>` lee el snapshot PERSISTIDO del
  // registro, así que sigue contestando el mes anterior de un cliente cuya
  // base está rota hoy. Si alguna de estas llamadas falla, ese cliente entra
  // en «faltan» y la columna comparable no se publica: se dice por qué.
  const [seriesIlegibles, setSeriesIlegibles] = useState<Map<string, PuntoTendencia[]>>(new Map());
  const ilegibles = useMemo(
    () => (metricas?.clientes ?? []).filter((c) => c.metricas === null).map((c) => c.slug),
    [metricas]
  );
  const claveIlegibles = ilegibles.join(",");
  useEffect(() => {
    if (operador !== "si" || ilegibles.length === 0) {
      setSeriesIlegibles(new Map());
      return;
    }
    let vivo = true;
    Promise.all(
      ilegibles.map((slug) =>
        getTendencia(slug, 12)
          .then((t) => [slug, t.serie] as const)
          .catch(() => null)
      )
    ).then((rs) => {
      if (!vivo) return;
      const m = new Map<string, PuntoTendencia[]>();
      rs.forEach((r) => {
        if (r) m.set(r[0], r[1]);
      });
      setSeriesIlegibles(m);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador, claveIlegibles]);

  // ── Clientes (estado de cuenta: fuente de verdad para editar) ───────────
  const [clientes, setClientes] = useState<ClientePlataforma[] | null>(null);
  const [clientesError, setClientesError] = useState<string | null>(null);
  useEffect(() => {
    if (operador !== "si") return;
    let vivo = true;
    getClientesPlataforma()
      .then((c) => {
        if (vivo) setClientes(c);
      })
      .catch((err) => {
        if (vivo) setClientesError(describeError(err, "No se pudo leer la lista de clientes."));
      });
    return () => {
      vivo = false;
    };
    // `recarga`: pasar un cliente a la base principal cambia dos filas a la vez
    // (y el estado de cuenta de una), así que se vuelve a pedir la lista entera.
  }, [operador, recarga]);

  const supresiones = useSupresiones();

  // ── Cobros (C1): la cartera de la suscripción ───────────────────────────
  // La comparten dos cajones: el de cobros y la columna «Modo» de los estados.
  // Se pide recién al abrir el cajón de cobros, y una vez: cada pedido deja una
  // línea en el reporte de transparencia de todos los clientes (revisión de C2).
  const [cobrosPedidos, setCobrosPedidos] = useState(false);
  const cobros = useCartera(operador === "si" && cobrosPedidos, recarga);
  const modos = useMemo(() => mapaDeModos(cobros.cartera), [cobros.cartera]);

  // ── Estado de la pantalla ───────────────────────────────────────────────
  const [orden, setOrden] = useState<OrdenCola>("riesgo");
  const [editandoEstado, setEditandoEstado] = useState<string | null>(null);
  /* El cajón de estados de cuenta arranca ABIERTO, como en A: es el único
     `<details>` que la cartera abre sola, porque el estado de cuenta es lo que
     corta el servicio y se mira sin buscarlo. */
  const [cajonAbierto, setCajonAbierto] = useState(true);
  const [activo, setActivo] = useState<string>(CAPITULOS[0].id);
  const docRef = useRef<HTMLElement | null>(null);

  /* El índice marca el capítulo que se está leyendo. Un observador, no un
     listener de scroll: el que entra más arriba manda. */
  useEffect(() => {
    if (operador !== "si") return;
    const obs = new IntersectionObserver(
      (entradas) => {
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActivo(visibles[0].target.id);
      },
      { rootMargin: "-76px 0px -60% 0px" }
    );
    CAPITULOS.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [operador, metricas, adopcion, tendencia]);

  /* El periodo VIAJA con el clic: la sesión que se abre desde la cartera abre
     en el mismo mes que se estaba mirando, y desde ahí al informe. Sin esto,
     el asesor analiza julio y el documento que imprime dice septiembre. */
  const abrirSesion = useCallback(
    (slug: string) => {
      navigate(`/plataforma/clientes/${encodeURIComponent(slug)}?periodo=${encodeURIComponent(periodo)}`);
    },
    [navigate, periodo]
  );

  const revisarConexion = useCallback((slug: string) => {
    setCajonAbierto(true);
    setEditandoEstado(slug);
    /* El cajón se abre en este mismo render; el scroll va después de que la
       fila exista. */
    window.setTimeout(() => {
      document.getElementById(`plat-estado-${slug}`)?.scrollIntoView({ block: "center" });
    }, 0);
  }, []);

  const cola = useMemo(() => (metricas ? armarCola(metricas, adopcion, orden) : []), [metricas, adopcion, orden]);
  const periodos = useMemo(() => periodosOfrecidos(tendencia?.serie, periodo), [tendencia, periodo]);
  const composicion = useMemo(
    () => (metricas && tendencia ? armarComposicion(metricas, tendencia.serie, seriesIlegibles) : null),
    [metricas, tendencia, seriesIlegibles]
  );

  if (operador === "no") return <Navigate to="/" replace />;

  const cons = metricas?.consolidado ?? null;
  const esMesEnCurso = periodo === mesActual();
  const filasUrgentes = urgentes(cola);

  return (
    <div className="plat plat-pagina">
      <header className="plat-barra">
        <div className="plat-marca">
          RECABRA <span>· Plataforma</span>
        </div>
        <div className="plat-ctrl">
          <label htmlFor="plat-periodo">Periodo</label>
          {/* El `<select>` de A, no un `<input type="month">`: ese control lo
              pinta el navegador en SU idioma («September 2026» en una pantalla
              escrita entera en español) y a 390 px se corta. Los meses salen de
              la serie de doce, el más nuevo arriba; el que no tiene snapshot se
              ofrece igual, deshabilitado y con la palabra escrita. */}
          <select
            id="plat-periodo"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value || mesActual())}
            title="El periodo manda sobre las métricas de toda la pieza."
          >
            {periodos.map((o) => (
              <option key={o.p} value={o.p} disabled={o.sinDato && o.p !== periodo}>
                {mesLargo(o.p)}
                {o.sinDato ? " · sin dato" : ""}
              </option>
            ))}
          </select>
          {esMesEnCurso && <span className="plat-chip plat-chip--parcial">mes en curso · parcial</span>}
        </div>
        <div className="sep" />
        {email && <span className="plat-correo">{email}</span>}
        <TemaToggle />
        <button type="button" className="plat-btn mini" onClick={logout} title="Salir">
          <LogOut size={13} /> Salir
        </button>
      </header>

      {operador === "verificando" ? (
        <div style={{ padding: 40 }} className="plat-nota">
          Verificando acceso…
        </div>
      ) : (
        <div className="plat-shell">
          <nav className="plat-indice" aria-label="Índice de la cartera">
            <h4>En esta pieza</h4>
            <div className="plat-toc">
              {CAPITULOS.map((c) => (
                <Fragment key={c.id}>
                  <a href={`#${c.id}`} className={activo === c.id ? "on" : undefined}>
                    {c.num} · {c.titulo}
                  </a>
                  {/* Las sub-entradas de A: bajo «la cola de llamadas», los
                      clientes por nombre, en el orden de la cola. Hacer clic en
                      uno abre su sesión —con el periodo puesto—; el que no se
                      deja leer no tiene sesión que abrir y lleva al cajón
                      operativo, que es donde se le revisa la conexión. */}
                  {c.id === "c-cola"
                    ? cola.map((f) => (
                        <a
                          key={f.slug}
                          className="sub"
                          href={
                            f.accion === "conexion"
                              ? "#c-operativo"
                              : `/plataforma/clientes/${encodeURIComponent(f.slug)}?periodo=${encodeURIComponent(periodo)}`
                          }
                          onClick={(e) => {
                            if (f.accion === "conexion") return;
                            e.preventDefault();
                            abrirSesion(f.slug);
                          }}
                        >
                          {f.nombre}
                        </a>
                      ))
                    : null}
                </Fragment>
              ))}
            </div>
          </nav>

          <main className="plat-doc" ref={docRef}>
            <div className="plat-tapa">
              <div className="rotulo">Pieza 1 · Informe de cartera</div>
              <h1>¿Cómo va el negocio y a quién llamo primero?</h1>
              <div className="cred">
                <span>
                  <b>Periodo</b>{" "}
                  <span className="cod">
                    {metricas ? `${metricas.periodo.anio_mes} · ${metricas.periodo.desde} a ${metricas.periodo.hasta}` : periodo}
                  </span>
                </span>
                <span>
                  <b>Cobertura</b>{" "}
                  {cons
                    ? `${cons.clientes_total - cons.clientes_con_error} de ${cons.clientes_total} clientes leídos` +
                      (cons.clientes_con_error > 0
                        ? ` · ${plural(cons.clientes_con_error, "con error", "con error")}`
                        : "")
                    : SIN_DATO}
                </span>
                <span>
                  <b>Generado</b>{" "}
                  <span className="cod">
                    {metricas ? `${haceMin(metricas.generado_en)}${metricas.de_cache ? " · de caché" : ""}` : cargando ? "cargando…" : SIN_DATO}
                  </span>
                </span>
              </div>
            </div>

            {metricasError && <Aviso rotulo="No se pudieron leer las métricas">{metricasError}</Aviso>}

            {/* ═══ 1.1 · El titular ═══ */}
            <Capitulo id="c-titular" numero="1.1" titulo="El titular" der="todo contra el mes comparable">
              {cons && composicion ? (
                <>
                  <Frase ruta="metricas.consolidado · tendencia[__consolidado__].serie · tendencia[<slug ilegible>].serie">
                    La cartera factura <em>{plata(cons.ingreso_contratado_mes)}</em> este mes sobre{" "}
                    {num(cons.espacios_comercializables)} espacios en{" "}
                    {plural(cons.sedes_con_plano, "sede", "sedes")}, al <em>{pct(cons.ocupacion_pct)}</em> de
                    ocupación
                    {composicion.mismaComposicion
                      ? `. Contra ${mesLargo(composicion.mesAnterior)}, con los mismos clientes en la cuenta, el ingreso ${movimiento(composicion.deltaIngresoPct)} y la ocupación se movió ${puntos(casiCero(composicion.deltaOcupacion))}.`
                      : composicion.comparable
                        ? `. Contra el ${mesCorto(composicion.mesAnterior)} publicado parece ${(composicion.deltaIngresoCrudo ?? 0) < 0 ? "perder" : "ganar"} ${plata(Math.abs(composicion.deltaIngresoCrudo ?? 0))}, y no es eso lo que pasó: ${composicion.quitados.map((q) => q.nombre).join(", ")} ${composicion.quitados.length === 1 ? "salió" : "salieron"} de las dos puntas de la cuenta. A igual composición fueron ${plata(composicion.comparable.ingreso)} y ${pct(composicion.comparable.ocupacion)}: el ingreso ${movimiento(composicion.deltaIngresoPct)}.`
                        : `. El mes anterior no se puede usar como referencia todavía: ${composicion.motivoSinComparable ?? "no hay con qué compararlo"}`}
                  </Frase>

                  <div className="plat-bloque">
                    <div className="plat-kpis" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
                      <Kpi
                        hero
                        et="Ingreso contratado del mes"
                        v={plata(cons.ingreso_contratado_mes)}
                        c={lineasDeltaIngreso(composicion)}
                      />
                      <Kpi
                        et="Espacios · sedes con plano"
                        v={`${num(cons.espacios_comercializables)} · ${cons.sedes_con_plano}`}
                        c={[
                          `sobre ${plural(cons.clientes_total - cons.clientes_con_error, "cliente leído", "clientes leídos")}`,
                          composicion.publicado
                            ? `${mesCorto(composicion.mesAnterior)} publicó ${num(composicion.publicado.espacios)}`
                            : "sin mes anterior con qué compararlo",
                        ]}
                      />
                      <Kpi
                        et="Canon promedio mensual"
                        v={plata(cons.canon_promedio_mensual)}
                        c={[
                          "promedio de la cartera",
                          "es el «contra qué» de cada cliente en su sesión",
                        ]}
                      />
                    </div>
                    <Medidor
                      ocupacionPct={cons.ocupacion_pct}
                      espaciosComercializables={cons.espacios_comercializables}
                      referencia={referenciaMedidor(composicion)}
                      nota={notaMedidor(composicion)}
                      tabla
                    />
                  </div>

                  <div className="plat-bloque">
                    <p className="plat-frase chica">{fraseComposicion(composicion)}</p>
                    <div className="plat-fig-tit">La corrección de composición, para que se pueda auditar</div>
                    <TablaComposicion comp={composicion} mes={periodo} />
                    <p className="plat-nota">
                      {composicion.mismaComposicion
                        ? "Los dos meses cuentan los mismos clientes, así que el delta se lee directo: no hay corrección que hacer."
                        : composicion.comparable
                          ? "El delta grande va contra la columna del medio. La primera se muestra igual, tachada: nunca se esconde, se explica. La columna comparable se arma restándole al mes anterior lo que ese mismo mes aportaba cada cliente que hoy no se deja leer, leído de su propio snapshot."
                          : `Sin columna del medio: ${composicion.motivoSinComparable ?? "no se puede recomponer"} Por eso el delta grande va tachado y no se publica ninguno en su lugar.`}
                      <br />
                      La cartera <b>no publica</b> el total de contratos activos. Se podría despejar (ingreso ÷ canon
                      promedio) y eso es una inferencia, no un dato: no se muestra.
                    </p>
                  </div>
                </>
              ) : (
                <p className="plat-nota">
                  {metricasError
                    ? "Sin métricas para este periodo."
                    : tendenciaError
                      ? `El titular necesita la tendencia para saber contra qué medirse, y no se pudo leer: ${tendenciaError}`
                      : "Cargando el consolidado…"}
                </p>
              )}
            </Capitulo>

            {/* ═══ 1.2 · La tendencia ═══ */}
            <Capitulo
              id="c-tendencia"
              numero="1.2"
              titulo="La tendencia de 12 meses, anotada"
              der="contra su propio pasado"
            >
              {tendenciaError && <Aviso rotulo="No se pudo leer la tendencia">{tendenciaError}</Aviso>}
              {tendencia ? (
                <>
                  <Frase
                    chica
                    ruta={`tendencia[${CONSOLIDADO_SLUG}].serie[${tendencia.desde} … ${tendencia.hasta}]`}
                  >
                    {fraseTendencia(tendencia.serie)}
                  </Frase>
                  <div className="plat-bloque">
                    <DosLineasConteo
                      serie={tendencia.serie}
                      anotaciones={anotacionesDenominador(tendencia.serie)}
                      tabla
                    />
                    <p className="plat-frase chica">{fraseIngresoSerie(tendencia.serie)}</p>
                    <LineaIngreso serie={tendencia.serie} anotaciones={anotacionIngreso(tendencia.serie)} />
                  </div>
                  {avisoDenominador(tendencia.serie) && (
                    <Aviso rotulo="Por qué conteos y no un porcentaje">{avisoDenominador(tendencia.serie)}</Aviso>
                  )}
                </>
              ) : (
                !tendenciaError && <p className="plat-nota">Cargando los doce meses…</p>
              )}
            </Capitulo>

            {/* ═══ 1.3 · La cola de llamadas ═══ */}
            <Capitulo
              id="c-cola"
              numero="1.3"
              titulo="La cola de llamadas"
              der="la adopción es una columna, no un panel"
            >
              {metricas ? (
                <>
                  <Frase ruta="metricas.clientes[] · adopcion.clientes[] · orden calculado en el frontend">
                    De {plural(cola.length, "cliente", "clientes")},{" "}
                    <em>
                      {filasUrgentes.length}{" "}
                      {filasUrgentes.length === 1 ? "necesita una llamada" : "necesitan una llamada"} esta semana
                    </em>
                    {filasUrgentes.length > 0 ? `: ${resumenUrgentes(filasUrgentes)}.` : "."}
                  </Frase>
                  <ColaLlamadas
                    filas={cola}
                    orden={orden}
                    onOrden={setOrden}
                    onAbrirSesion={abrirSesion}
                    onRevisarConexion={revisarConexion}
                  />
                  <p className="plat-nota">
                    El orden por defecto es riesgo, no plata: el número más grande de la tabla casi nunca es el que se
                    va esta semana. El orden por plata está a un clic y la regla se lee arriba de la lista.
                    {adopcionError ? ` La adopción no se pudo leer (${adopcionError}), así que las señales de cuenta fantasma, dormida y sin cuentas no entran en este orden.` : ""}
                  </p>
                </>
              ) : (
                <p className="plat-nota">Cargando la cartera…</p>
              )}
            </Capitulo>

            {/* ═══ 1.4 · El spread ═══ */}
            <Capitulo
              id="c-spread"
              numero="1.4"
              titulo="Quién cobra por debajo de lo que dice que vale"
              der="contra cero"
            >
              {metricas ? (
                <>
                  <Frase chica ruta="metricas.clientes[].metricas.spread_pct · .tarifa_configurada · .contratos_sin_tarifa">
                    {fraseSpread(metricas)}
                  </Frase>
                  <div className="plat-bloque">
                    <EjeSpread clientes={metricas.clientes} tabla />
                  </div>
                  <p className="plat-nota">
                    La <b>tarifa de referencia</b> de un cliente no sale nunca de su base: acá sólo viaja su relación
                    (cuánto cobra contra ella) y si existe. Un cliente sin tarifa cargada no tiene spread: se cuenta
                    aparte, con su nombre, y no se dibuja en cero.
                  </p>
                </>
              ) : (
                <p className="plat-nota">Cargando el spread…</p>
              )}
            </Capitulo>

            {/* ═══ 1.5 · La adopción ═══ */}
            <Capitulo id="c-adopcion" numero="1.5" titulo="La adopción" der="quién no usa lo que paga">
              {adopcionError && <Aviso rotulo="No se pudo leer la adopción">{adopcionError}</Aviso>}
              {adopcion ? (
                <>
                  <Frase chica ruta="adopcion.clientes[].clasificacion · adopcion.cohortes[]">
                    {fraseAdopcion(adopcion)}
                  </Frase>
                  <div className="plat-bloque">
                    <Unidades
                      grupos={unidadesAdopcion(adopcion.clientes)}
                      disposicion="columnas"
                      clave={CLAVE_ADOPCION}
                      titulo="Una marca por cliente, agrupadas por clase de adopción"
                      tabla
                    />
                    <p className="plat-frase chica" style={{ marginTop: "var(--s5)" }}>
                      {fraseCohortes(adopcion)}
                    </p>
                    <div className="plat-fig-tit">
                      Cohortes por mes de alta · {plural(adopcion.cohortes.length, "fila", "filas")}, sin gráfico
                    </div>
                    <TablaCohortes adopcion={adopcion} />
                    <p className="plat-nota">
                      Con uno o dos clientes por cohorte, «0 % de retención» y «100 %» son la misma información que «0
                      de 2» y «1 de 1». Manda el conteo; el porcentaje va al lado, con su n.
                    </p>
                  </div>
                  <p className="plat-nota">
                    La adopción no es un panel aparte: es la columna «señal» y la línea de días sin acceso de la cola
                    de arriba. Un cliente fantasma no es una estadística, es una llamada.
                  </p>
                </>
              ) : (
                !adopcionError && <p className="plat-nota">Cargando la adopción…</p>
              )}
            </Capitulo>

            {/* ═══ 1.6 · Lo operativo ═══ */}
            <Capitulo id="c-operativo" numero="1.6" titulo="Lo operativo" der="fuera de la historia">
              <p className="plat-nota" style={{ marginTop: 0 }}>
                Estados de cuenta, cobros y solicitudes de supresión existen y tienen su lugar, pero no son
                análisis: son operaciones. Lo único que sube a la historia es la línea de estado en la fila del
                cliente.
              </p>
              <details
                className="plat-cajon"
                open={cajonAbierto}
                onToggle={(e) => setCajonAbierto((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>
                  Estados de cuenta
                  <span className="cuenta">
                    {clientes ? plural(clientes.length, "cliente", "clientes") : SIN_DATO}
                  </span>
                </summary>
                <div>
                  <TablaEstados
                    clientes={clientes}
                    modos={modos}
                    error={clientesError}
                    abierto={editandoEstado}
                    onAbrir={setEditandoEstado}
                    onGuardado={(slug, patch) => {
                      setClientes((prev) => (prev ? prev.map((x) => (x.slug === slug ? { ...x, ...patch } : x)) : prev));
                      // El estado también se lee en la cartera de cobros: se copia,
                      // no se vuelve a pedir (cada pedido deja línea en la bitácora).
                      cobros.actualizarEstado(slug, { estado: patch.estado, cambiado_por: patch.cambiado_por });
                    }}
                    onBorrado={(slug) => setClientes((prev) => (prev ? prev.filter((x) => x.slug !== slug) : prev))}
                    onCicloCambiado={() => setRecarga((n) => n + 1)}
                    enlaceReporte={(slug) => navigate(`/plataforma/reporte/${encodeURIComponent(slug)}`)}
                  />
                  <p className="plat-nota">
                    Cambiar el estado corta o restringe el servicio de inmediato. El motivo queda de constancia,
                    también al reactivar.
                  </p>
                  <p className="plat-nota">
                    <b>Archivar</b> saca al cliente del ingreso y del análisis sin tocar sus datos, y se deshace.{" "}
                    <b>Borrar</b> elimina su base para siempre: sólo se ofrece con el cliente ya archivado y nunca con
                    el de la base principal, que guarda también la lista de clientes y sus usuarios.
                  </p>
                </div>
              </details>
              <details
                className="plat-cajon"
                onToggle={(e) => {
                  if ((e.currentTarget as HTMLDetailsElement).open) setCobrosPedidos(true);
                }}
              >
                <summary>
                  Cobros
                  <span className="cuenta">
                    {cobros.cartera
                      ? `${plural(cobros.cartera.clientes.filter((c) => !c.exento).length, "con suscripción", "con suscripción")} · ${plural(cobros.cartera.clientes.filter((c) => c.dias_atraso !== null).length, "con atraso", "con atraso")}`
                      : SIN_DATO}
                  </span>
                </summary>
                <div>
                  <TablaCobros
                    cartera={cobros.cartera}
                    error={cobros.error}
                    onCambio={cobros.recargar}
                    onEstadoMovido={(slug, patch) =>
                      setClientes((prev) => (prev ? prev.map((x) => (x.slug === slug ? { ...x, ...patch } : x)) : prev))
                    }
                  />
                  <p className="plat-nota">
                    Lo que RECABRA le cobra a cada supermercado. Se registra a mano: la cuenta de cobro que ya se emitió
                    (RECABRA no factura ante la DIAN) y el pago que entró por el banco, con lo que el supermercado
                    retuvo. Un cliente sin suscripción queda <b>exento</b>: no tiene deuda y nada lo mueve.
                  </p>
                  <p className="plat-nota">
                    {cobros.cartera?.cobranza_automatica
                      ? "La escalera automática está prendida: a las suscripciones automáticas las pasa sola a gracia y a sólo lectura (diez días después del aviso formal, como mínimo), y levanta sola lo que puso ella cuando se ponen al día. Nunca suspende ni toca lo que puso una persona."
                      : "Los formularios de acá no cortan el servicio, y la escalera automática está apagada: sólo ensaya. El estado de cuenta se cambia en el cajón de arriba; el sistema sólo lo levanta si se marca al registrar un pago que deja al día."}{" "}
                    Lo que hace el sistema lo firma <span className="cod">sistema:cobranza</span>.
                  </p>
                </div>
              </details>
              <details className="plat-cajon">
                <summary>
                  Solicitudes de supresión
                  <span className="cuenta">
                    {supresiones.filas
                      ? `${plural(supresiones.filas.filter((f) => f.estado === "pendiente").length, "pendiente", "pendientes")} de ${supresiones.filas.length}`
                      : SIN_DATO}
                  </span>
                </summary>
                <div>
                  <TablaSupresiones
                    filas={supresiones.filas}
                    error={supresiones.error}
                    setFilas={supresiones.setFilas}
                  />
                  <p className="plat-nota">
                    Nada se borra desde acá: la supresión real, si corresponde, se ejecuta a mano y fuera del sistema.
                  </p>
                </div>
              </details>
            </Capitulo>

            {/* ═══ 1.7 · De dónde sale ═══ */}
            <Capitulo id="c-fuente" numero="1.7" titulo="De dónde sale">
              <div className="plat-pie">
                <div>
                  <b>Periodo</b>
                  {metricas
                    ? `${metricas.periodo.anio_mes} (${metricas.periodo.desde} a ${metricas.periodo.hasta})${esMesEnCurso ? " — mes en curso, parcial" : " — mes cerrado"}`
                    : SIN_DATO}
                </div>
                <div>
                  <b>Generado</b>
                  {metricas
                    ? `${metricas.generado_en.replace("T", " ").replace("Z", " UTC")}${metricas.de_cache ? " · de caché (5 min)" : " · lectura en vivo"}`
                    : SIN_DATO}
                </div>
                <div>
                  <b>Cobertura</b>
                  {cons
                    ? `${cons.clientes_total - cons.clientes_con_error} de ${cons.clientes_total} clientes leídos; el consolidado es la suma de esos${cons.clientes_con_error > 0 ? `. ${plural(cons.clientes_con_error, "base devolvió error", "bases devolvieron error")} y quedó fuera de las dos puntas de la cuenta` : ""}.`
                    : SIN_DATO}
                </div>
                {!esMesEnCurso && (
                  <div>
                    <b>Un mes cerrado se recalcula, no se relee</b>
                    Las métricas de un periodo pasado se vuelven a calcular sobre las bases de HOY, con los clientes
                    que hay hoy: la base de un cliente guarda sus contratos como están ahora, no como estaban ese mes.
                    La foto de ese mes tal como se publicó vive en la rejilla de doce meses de arriba, que sí sale del
                    snapshot — si las dos no coinciden, ésa es la razón.
                  </div>
                )}
                <div>
                  <b>La ventana de la tendencia</b>
                  {tendencia
                    ? `${tendencia.meses} meses, de ${tendencia.desde} a ${tendencia.hasta}. No toma el periodo de arriba: la serie termina siempre en el mes en curso.`
                    : SIN_DATO}
                </div>
                <div>
                  <b>La adopción</b>
                  {adopcion
                    ? `Calculada a hoy (${adopcion.generado_en.slice(0, 10)}), no al periodo elegido. Las clases las decide el backend una sola vez; el frontend no las re-deriva de fechas.`
                    : SIN_DATO}
                </div>
                <div>
                  <b>Lo que no se muestra nunca</b>
                  La tarifa de referencia del cliente. Sólo su relación (spread) y si existe. Los nombres de proveedor
                  llegan saneados del backend y se pintan tal cual.
                </div>
                <div>
                  <b>Lo que no se publica</b>
                  El total de contratos activos por cliente y la participación de un proveedor sobre él: sin
                  denominador publicado, un porcentaje es un número inventado. Esa lectura vive en el detalle de cada
                  cliente.
                </div>
                <div>
                  <b>Bitácora</b>
                  Cada consulta de métricas, tendencia, detalle y reporte queda anotada con el correo del operador, la
                  fecha y el periodo — y el cliente la puede ver en su reporte de transparencia.
                </div>
              </div>
            </Capitulo>
          </main>
        </div>
      )}
    </div>
  );
}

// ─── Cuentas de render que no valen un archivo aparte ──────────────────────

/** Las dos líneas que acompañan a la cifra hero. El delta va contra la
 *  columna comparable; el crudo se muestra igual, tachado, con la palabra
 *  «composición distinta». Nunca se esconde: se explica. */
function lineasDeltaIngreso(c: Composicion): React.ReactNode[] {
  if (!c.mesAnterior || !c.publicado) {
    return [<span key="s">Sin mes anterior publicado con qué compararlo.</span>];
  }
  /* Un delta de cero se escribe «sin cambio», no «$ 0 · 0,0 %»: dos ceros con
     signo es más difícil de leer que la palabra. */
  const delta =
    (c.deltaIngreso ?? 0) === 0 ? (
      <b>sin cambio</b>
    ) : (
      <b>
        {sig(c.deltaIngreso, (v) => plata(v))} · {sig(casiCero(c.deltaIngresoPct), (v) => pct(v))}
      </b>
    );
  if (c.mismaComposicion) {
    return [
      <span key="a">
        {delta} contra {mesLargo(c.mesAnterior)} ({plata(c.publicado.ingreso)}), con los mismos clientes en la
        cuenta.
      </span>,
      <span key="b">
        Ocupación: {puntos(casiCero(c.deltaOcupacion))} contra {pct(c.publicado.ocupacion)}.
      </span>,
    ];
  }
  if (c.comparable) {
    return [
      <span key="a">
        {delta} contra {mesCorto(c.mesAnterior)} a igual composición ({plata(c.comparable.ingreso)}).
      </span>,
      <span key="b">
        <span className="tachado">
          {sig(c.deltaIngresoCrudo, (v) => plata(v))} contra el {mesCorto(c.mesAnterior)} publicado
        </span>{" "}
        — composición distinta: {c.quitados.map((q) => q.nombre).join(", ")} salió de la cuenta.
      </span>,
    ];
  }
  return [
    <span key="a">
      <span className="tachado">
        {sig(c.deltaIngresoCrudo, (v) => plata(v))} contra el {mesCorto(c.mesAnterior)} publicado
      </span>{" "}
      — no es comparable.
    </span>,
    <span key="b">{c.motivoSinComparable}</span>,
  ];
}

function referenciaMedidor(c: Composicion): { pct: number; rotulo: string } | null {
  if (c.comparable && c.comparable.ocupacion !== null && c.mesAnterior) {
    return {
      pct: c.comparable.ocupacion,
      rotulo: c.mismaComposicion ? `${mesCorto(c.mesAnterior)}` : `${mesCorto(c.mesAnterior)} comparable`,
    };
  }
  return null;
}

function notaMedidor(c: Composicion): string {
  if (c.comparable && c.comparable.ocupacion !== null && c.mesAnterior) {
    return `contra ${mesCorto(c.mesAnterior)}${c.mismaComposicion ? "" : " a igual composición"}: ${puntos(casiCero(c.deltaOcupacion))}`;
  }
  return `sin marca de referencia: ${c.motivoSinComparable ?? "no hay mes anterior comparable"}`;
}

/** La frase-conclusión de la tabla de composición. La tabla es el paso a paso
 *  de una resta; la frase dice CUÁNTO corrige esa resta, con la cifra. Sin
 *  ella, el medidor de arriba se lleva la única conclusión del capítulo y la
 *  auditoría queda sin titular. */
function fraseComposicion(c: Composicion): string {
  if (!c.mesAnterior || !c.publicado) {
    return "No hay un mes anterior publicado con qué compararse: la tabla trae 1 sola columna, la de este mes, y no hay corrección que auditar.";
  }
  if (c.mismaComposicion) {
    return (
      `Los dos meses cuentan los mismos ${c.publicado.clientes} clientes: la corrección es de ` +
      `${plata(0)} y el delta de arriba (${sig(c.deltaIngreso, (v) => plata(v))}) se lee directo, sin columna del medio.`
    );
  }
  if (c.comparable) {
    const ing = c.quitados.reduce((t, q) => t + q.ingreso, 0);
    const esp = c.quitados.reduce((t, q) => t + q.espacios, 0);
    return (
      `${c.quitados.map((q) => q.nombre).join(", ")} ${c.quitados.length === 1 ? "aportaba" : "aportaban"} ` +
      `${plata(ing)} y ${num(esp)} espacios en ${mesLargo(c.mesAnterior)}, y este mes ${c.quitados.length === 1 ? "no está" : "no están"} ` +
      `en la cuenta: quitarlo${c.quitados.length === 1 ? "" : "s"} baja el mes anterior de ${plata(c.publicado.ingreso)} a ` +
      `${plata(c.comparable.ingreso)}. Ésa es la columna del medio, y contra ella se mide el ` +
      `${sig(c.deltaIngreso, (v) => plata(v))} de arriba.`
    );
  }
  return (
    `Sin columna del medio: ${c.motivoSinComparable ?? "no se puede recomponer"} El delta crudo contra ` +
    `${mesLargo(c.mesAnterior)} (${sig(c.deltaIngresoCrudo, (v) => plata(v))}) queda tachado y no se publica ninguno en su lugar.`
  );
}

/** La frase-conclusión del panel de plata. La rejilla de conteos de arriba
 *  cuenta caras; ésta cuenta pesos, y son dos lecturas distintas sobre la
 *  misma rejilla de meses: cada una necesita su propia conclusión. */
function fraseIngresoSerie(serie: PuntoTendencia[]): string {
  const con = serie.filter((p) => !p.sin_dato && p.ingreso_contratado_mes !== null);
  if (con.length < 2)
    return `${plural(con.length, "mes de la ventana trae", "meses de la ventana traen")} ingreso publicado: con menos de 2 no hay tramo que contar en el panel de plata.`;
  const primero = con[0];
  const ultimo = con[con.length - 1];
  const a = primero.ingreso_contratado_mes as number;
  const b = ultimo.ingreso_contratado_mes as number;
  const pico = con.reduce((m, p) => ((p.ingreso_contratado_mes as number) > (m.ingreso_contratado_mes as number) ? p : m), con[0]);
  return (
    `En plata, de ${mesCorto(primero.periodo)} a ${mesCorto(ultimo.periodo)} la cartera pasó de ${plata(a)} a ` +
    `${plata(b)} (${sig(b - a, (v) => plata(v))}${a > 0 ? ` · ${sig(((b / a - 1) * 100), (v) => pct(v))}` : ""}), ` +
    `con el techo de la ventana en ${mesCorto(pico.periodo)} (${plata(pico.ingreso_contratado_mes)}). ` +
    `Es el mismo eje de meses de arriba y otra unidad: por eso va en su propio panel y no en un segundo eje.`
  );
}

/** La frase-conclusión de la tabla de cohortes. Manda el conteo, no el
 *  porcentaje: con una o dos altas por mes, «0 %» y «100 %» son la misma
 *  información que «0 de 2» y «1 de 1». */
function fraseCohortes(adopcion: Adopcion): string {
  const h = adopcion.cohortes;
  if (h.length === 0) return "0 clientes tienen fecha de alta: no hay una sola cohorte que seguir.";
  const conRet = h.filter((x) => x.retencion_30d_pct !== null);
  const altas = h.reduce((t, x) => t + x.clientes, 0);
  const entraron = conRet.reduce((t, x) => t + Math.round((x.clientes * (x.retencion_30d_pct as number)) / 100), 0);
  const base = conRet.reduce((t, x) => t + x.clientes, 0);
  if (base === 0) {
    return `${plural(h.length, "cohorte de alta", "cohortes de alta")} y ${plural(altas, "cliente", "clientes")} en total, y ninguna tiene retención calculable todavía: la tabla dice «sin dato», no cero.`;
  }
  return (
    `De ${plural(altas, "cliente dado de alta", "clientes dados de alta")} en ` +
    `${plural(h.length, "cohorte", "cohortes")}, ${num(entraron)} de ${num(base)} entraron dentro de los 30 días ` +
    `(${pct((entraron / base) * 100, 0)}). Con cohortes de uno o dos, el conteo manda y el porcentaje va al lado con su n: ` +
    `por eso son cinco filas de tabla y no un gráfico.`
  );
}

/** La frase-conclusión de la rejilla de doce meses. Sale del dato: el tramo
 *  de ocupación más largo, y si el denominador se movió, la cifra que lo
 *  explica. */
function fraseTendencia(serie: PuntoTendencia[]): string {
  const con = serie.filter((p) => !p.sin_dato && p.ocupacion_pct !== null);
  if (con.length < 2) return "Todavía no hay dos meses con snapshot: la tendencia no tiene qué contar.";
  const primero = con[0];
  const ultimo = con[con.length - 1];
  const dOc = (ultimo.ocupacion_pct as number) - (primero.ocupacion_pct as number);
  const dEsp = (ultimo.espacios_comercializables ?? 0) - (primero.espacios_comercializables ?? 0);
  const dIng =
    ultimo.ingreso_contratado_mes !== null && primero.ingreso_contratado_mes !== null
      ? ultimo.ingreso_contratado_mes - primero.ingreso_contratado_mes
      : null;
  const sinDato = serie.filter((p) => p.sin_dato).length;
  return (
    `De ${mesCorto(primero.periodo)} a ${mesCorto(ultimo.periodo)} la ocupación de la cartera pasó de ` +
    `${pct(primero.ocupacion_pct)} a ${pct(ultimo.ocupacion_pct)} (${puntos(dOc)}) mientras el inventario se movía ` +
    `${sig(dEsp, (v) => num(v))} espacios` +
    (dIng !== null ? ` y el ingreso ${sig(dIng, (v) => plata(v))}` : "") +
    `. Por eso el dibujo va en conteos: la brecha entre las dos líneas es la ocupación, y el escalón del denominador ` +
    `se ve como lo que es.` +
    (sinDato > 0 ? ` ${plural(sinDato, "mes no tiene snapshot", "meses no tienen snapshot")} y van como hueco, no como recta entre vecinos.` : "")
  );
}

/** La enumeración de la frase de la cola: una razón por señal, sin repetir. */
function resumenUrgentes(filas: ReturnType<typeof armarCola>): string {
  const porSenal = new Map<string, number>();
  filas.forEach((f) => porSenal.set(f.palabra, (porSenal.get(f.palabra) ?? 0) + 1));
  const partes = [...porSenal].map(([palabra, n]) => `${n} ${n === 1 ? articulo(palabra) : articuloPlural(palabra)}`);
  return partes.join(", ");
}

const FRASE_SENAL: Record<string, [string, string]> = {
  "sin dato": ["no se deja leer", "no se dejan leer"],
  fantasma: ["tiene contratos y nadie entra", "tienen contratos y nadie entra"],
  dormida: ["tiene cuentas y no entra hace más de un mes", "tienen cuentas y no entran hace más de un mes"],
  "sin cuentas": ["paga y no tiene ni una cuenta de usuario", "pagan y no tienen ni una cuenta de usuario"],
  "cobra por debajo": ["cobra por debajo de su propia tarifa", "cobran por debajo de su propia tarifa"],
};

const articulo = (palabra: string) => FRASE_SENAL[palabra]?.[0] ?? palabra;
const articuloPlural = (palabra: string) => FRASE_SENAL[palabra]?.[1] ?? palabra;
