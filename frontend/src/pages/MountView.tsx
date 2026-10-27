import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { confirmMount, fetchMounts, latestByCode, MOTIVO_LABEL, type MountConfirmation, type MountMotivo } from "../api/mounts";
import { montajesPendientes, type MontajePendiente } from "../api/montajesPendientes";
import { leerMontajesDePlanogramas, type CaraDelMontaje } from "../api/supervision";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import VerificarMontaje from "../components/Montaje/VerificarMontaje";
import RevisarMontaje from "../components/Supervision/RevisarMontaje";
import {
  FILTROS_DE_MONTAJES, TEXTO_DEL_ESTADO, cuentaPorFiltro, estadoDelContrato, estadoDelPlanograma, filtroDe,
  type EstadoDeMontaje, type FiltroDeMontajes,
} from "../utils/montajes";
import type { EstadoPorEspacio } from "../utils/estadoComercial";
import "./montajes.css";
import { reportesPorCodigo, reporteDelContrato } from "../utils/montajeDelContrato";
import { contractPhase, fullSpaceCode, isRentable, isDoubleGondola } from "../types/fixtures";
import { planometriaDelEspacio, planometriaUrl } from "../api/planograms";
import FormularioMontaje, {
  type EspacioAMontar, type PlanoDelEspacio,
} from "../components/Montaje/FormularioMontaje";
import type { UnifiedFixture } from "../types/fixtures";
import { nombreDeMueble } from "../utils/nomenclatura";
// El tipo de cada espacio, como le dicen acá («tope de góndola»): la lista y el
// formulario del montaje.
import { conNombrePropio } from "../catalogo/nombresPropios";
import {
  cantidadDe, codigoDeParte, esParticipacion, esPieza, indiceDePartes, partirCodigo, piezasDeLaFamilia, sufijoDeParte,
  textoDeParticipacionParaMontar, textoParaMontar, type ParteRef,
} from "../utils/partes";

/** Una cara de un mueble que hay que montar, con lo que ordena la lista. */
interface Pendiente extends EspacioAMontar {
  /** El contrato ya arrancó hace poco: montarlo tarde es plata que el proveedor
   *  reclama. */
  urgente: boolean;
  /** Arrancó hace más de un mes y nunca se reportó. La exhibición está armada
   *  hace rato — lo que falta es el papel. Se deja en la lista para poder
   *  reportarlo, pero al final: si va arriba, entierra el trabajo de hoy. */
  viejo: boolean;
}

/** Días hacia atrás en que todavía tiene sentido tratar un montaje como
 *  pendiente de verdad. Espeja la ventana del tablero. */
const VENTANA_DIAS = 30;

/** Lo que dice la fila de una parte vendida: cuál es y contada desde dónde
 *  («Puerta 2 de 3, contando de izquierda a derecha…»). Una participación de
 *  la cara (`…-PC3`) es un contrato a montar como cualquier otro, con su
 *  rótulo «Participación 3 · cara A» (D13): sin el %, que el tablero no carga,
 *  ni zonas ni plata (§4.8, §4.9). */
function parteParaMontar(parte: ParteRef, cara: "A" | "B", f: UnifiedFixture): string {
  return esParticipacion(parte)
    ? textoDeParticipacionParaMontar(parte, cara)
    : textoParaMontar(parte, cantidadDe(f, parte.clase));
}

function diasDesde(iso: string): number {
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const inicio = Date.UTC(y, m - 1, d);
  const hoy = new Date();
  const cero = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((cero - inicio) / 86_400_000);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MESES[m - 1]}` : iso;
}

/** Una fila de la lista: un contrato o un planograma. */
interface Fila {
  clave: string;
  clase: "contrato" | "planograma";
  sede: string;
  /** Lo que se lee primero: `PUN-01-B`, «GON-12 · cara A». */
  codigo: string;
  parte?: string;
  /** Contrato: proveedor · marca; planograma: «Versión N». */
  quien: string;
  tipo: string;
  desde: string;
  estado: EstadoDeMontaje;
  /** El contrato, para registrarlo. */
  pendiente?: Pendiente;
  /** Su último reporte (contrato). */
  reporte?: MountConfirmation;
  /** La versión (planograma), para revisarla. */
  versionId?: number;
  /** Planograma «no se pudo»: el motivo en palabras. */
  motivo?: string | null;
}

/**
 * Montajes (rediseño UX 2026-10, etapa 7): todos los montajes de la sede en
 * una sola lista —los de contratos y los de planogramas—, con su estado
 * preciso y lo que se hace con cada uno: registrar, verificar, resolver un «no
 * se pudo», adjuntar la planometría que falta o revisar el de un planograma.
 *
 * Quien trabaja en la tienda ve la misma lista, sin verificar y sin la lista
 * de avisos que esperan (es de administración). En ningún lado hay valores,
 * igual que en su correo. En el teléfono, cada fila es una tarjeta grande.
 */
export default function MountView({
  initialCode,
  onDone,
  onAbrirPendientes,
}: {
  /** Código que venía en el enlace del correo, si vino por ahí. */
  initialCode?: string | null;
  /** «Resumen de montajes»: lleva a Indicadores. */
  onDone?: () => void;
  /** «Adjuntar planometría»: abre Pendientes, donde se adjunta. */
  onAbrirPendientes?: () => void;
}) {
  const fixturesBySede = useFixtureStore((s) => s.fixturesBySede);
  const sedes = useFixtureStore((s) => s.sedes);
  const activeSede = useFixtureStore((s) => s.sede);
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const fixtures = useFixtureStore(selectFixtures);
  const isAdmin = useAuthStore(selectIsAdmin);
  /** Vender por partes: las puertas vendidas no están en el mueble fusionado,
   *  están en el mapa crudo de la base, por su código. */
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  const indicePartes = useMemo(() => indiceDePartes(estadoComercial), [estadoComercial]);
  /** El primer pull del servidor ya terminó — antes de eso no hay espacios. */
  const layoutListo = useFixtureStore((s) => s.lastSyncedAt) !== null;
  /** La última sincronización falló: una lista vacía puede ser falta de señal
   *  y no falta de trabajo. */
  const sinConexion = useFixtureStore((s) => s.syncState) === "error";

  const [mounts, setMounts] = useState<MountConfirmation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<Pendiente | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeMontajes>("todos");
  /** El mercaderista puede cubrir varias sedes: con esto las ve juntas. */
  const [todasLasSedes, setTodasLasSedes] = useState(false);
  const [mirando, setMirando] = useState<Fila | null>(null);
  const [revisandoVersion, setRevisandoVersion] = useState<number | null>(null);
  /** Los avisos que esperan (sólo administración), por código de espacio. */
  const [avisos, setAvisos] = useState<Map<string, MontajePendiente> | null>(null);
  const [planogramas, setPlanogramas] = useState<(CaraDelMontaje & { sede: string })[]>([]);
  const [recargar, setRecargar] = useState(0);
  /** Lo que dijo la última revisión de un planograma. */
  const [hecho, setHecho] = useState<string | null>(null);

  const sedesALaVista = useMemo(
    () => (todasLasSedes && sedes.length ? sedes : [activeSede]).filter(Boolean),
    [todasLasSedes, sedes, activeSede],
  );

  useEffect(() => {
    fetchMounts()
      .then(setMounts)
      .catch(() => setMounts([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    let vivo = true;
    if (isAdmin) {
      Promise.all(sedesALaVista.map((s) => montajesPendientes(s).catch(() => [] as MontajePendiente[])))
        .then((ls) => { if (vivo) setAvisos(new Map(ls.flat().map((m) => [m.espacio.toUpperCase(), m]))); });
    }
    Promise.all(sedesALaVista.map((s) => leerMontajesDePlanogramas(s).then((cs) => cs.map((c) => ({ ...c, sede: s }))).catch(() => [])))
      .then((ls) => { if (vivo) setPlanogramas(ls.flat()); });
    return () => { vivo = false; };
  }, [isAdmin, sedesALaVista, recargar]);

  const ultimo = useMemo(() => latestByCode(mounts), [mounts]);
  const porCodigo = useMemo(() => reportesPorCodigo(mounts), [mounts]);

  // Todos los espacios con contrato corriendo o por empezar, de todas las
  // sedes: el enlace del correo puede apuntar a cualquiera. La lista muestra
  // las de la sede (o todas, si se pide).
  const espacios = useMemo<{ p: Pendiente; reporte?: MountConfirmation }[]>(() => {
    const out: { p: Pendiente; reporte?: MountConfirmation }[] = [];
    const universo = sedes.length
      ? sedes.flatMap((s) => (fixturesBySede[s] ?? []).map((f) => [s, f] as const))
      : fixtures.map((f) => [activeSede, f] as const);

    for (const [sede, f] of universo) {
      // La caja y la columna no se montan enteras (no se venden), pero sus
      // piezas vendidas sí: la bahía de impulso, el forro.
      const soloPiezas = !isRentable(f);
      if (soloPiezas && piezasDeLaFamilia(f.type).length === 0) continue;
      // El código completo se arma con la sede del propio mueble cuando la
      // trae, igual que al guardar el contrato: un mueble puede haber quedado
      // con la sede escrita adentro y no coincidir con la clave del mapa.
      const base = fullSpaceCode((f.sede as string) || sede, f.code);
      const caras: { code: string; corto: string; data: Partial<UnifiedFixture>; parte?: string }[] = [
        { code: base, corto: f.code, data: f },
      ];
      if (!soloPiezas && isDoubleGondola(f) && f.faceB) {
        caras.push({
          code: `${base}-B`,
          corto: `${f.code}-B`,
          data: f.faceB as Partial<UnifiedFixture>,
        });
      }
      // Vender por partes: cada puerta vendida se monta como un espacio más,
      // con su propio contrato y su propio reporte.
      for (const c of [...caras]) {
        for (const { partido, estado } of indicePartes.get(c.code) ?? []) {
          if (!partido.parte || (soloPiezas && !esPieza(partido.parte))) continue;
          caras.push({
            // El completo de la cara más el de la parte: `NAVE-NEV-03-PU2`.
            code: `${c.code}-${sufijoDeParte(partido.parte)}`,
            corto: codigoDeParte(f.code, partido.cara, partido.parte),
            data: { ...estado, status: estado.status as UnifiedFixture["status"] } as Partial<UnifiedFixture>,
            parte: parteParaMontar(partido.parte, partido.cara, f),
          });
        }
      }
      // De la caja, sólo sus piezas: la caja entera no tiene contrato.
      for (const { code, corto, data, parte } of soloPiezas ? caras.slice(1) : caras) {
        const cara = {
          status: (data.status ?? "free") as UnifiedFixture["status"],
          startDate: data.startDate ?? "",
          endDate: data.endDate ?? "",
        };
        const fase = contractPhase(cara);
        // Solo lo que tiene contrato por delante o corriendo. Lo vencido ya no
        // se monta, y lo libre no tiene qué montar.
        if (fase !== "vigente" && fase !== "pendiente") continue;
        // El reporte de ESTE contrato: el «montado» del contrato anterior sobre
        // el mismo espacio no cuenta (2026-10-05, `utils/montajeDelContrato.ts`).
        const reporte = reporteDelContrato(porCodigo, code, cara.startDate);
        out.push({
          p: {
            code,
            corto,
            fixtureCode: f.code,
            sede: (data.sede as string) || sede,
            label: conNombrePropio(f, nombresPropios, f.label || f.code),
            marca: (data.brandCategory as string) || "",
            proveedor: (data.supplierName as string) || "",
            desde: data.startDate ?? "",
            hasta: data.endDate ?? "",
            urgente: fase === "vigente" && diasDesde(data.startDate ?? "") <= VENTANA_DIAS,
            viejo: fase === "vigente" && diasDesde(data.startDate ?? "") > VENTANA_DIAS,
            ...(parte ? { parte } : {}),
          },
          ...(reporte ? { reporte } : {}),
        });
      }
    }
    return out;
  }, [fixturesBySede, sedes, fixtures, activeSede, porCodigo, nombresPropios, indicePartes]);

  /** Lo que falta montar (sin reporte de «montado» de su contrato). Tres
   *  tramos: lo que arrancó y hay que montar ya, lo que viene, y al final lo
   *  viejo sin reportar. Ordenar solo por fecha ponía arriba contratos de
   *  enero y enterraba el trabajo de esta semana. */
  const pendientes = useMemo<Pendiente[]>(() => {
    const tramo = (p: Pendiente) => (p.urgente ? 0 : p.viejo ? 2 : 1);
    return espacios
      .filter((e) => e.reporte?.estado !== "montado")
      .map((e) => e.p)
      .sort((a, b) => tramo(a) - tramo(b) || a.desde.localeCompare(b.desde));
  }, [espacios]);

  const mismaSede = (s: string) => sedesALaVista.some((x) => x.trim().toUpperCase() === (s ?? "").trim().toUpperCase());

  /** La lista: contratos y planogramas de la sede, por fecha de inicio (lo que
   *  ya empezó y falta montar, arriba). */
  const filas = useMemo<Fila[]>(() => {
    const out: Fila[] = [];
    for (const { p, reporte } of espacios) {
      if (!mismaSede(p.sede)) continue;
      const aviso = isAdmin ? (avisos === null ? undefined : (avisos.get(p.code.toUpperCase()) ?? null)) : undefined;
      out.push({
        clave: `c-${p.sede}-${p.code}`, clase: "contrato", sede: p.sede, codigo: nombreDeMueble({ code: p.corto }),
        ...(p.parte ? { parte: p.parte } : {}),
        quien: [p.proveedor || "Sin proveedor", p.marca].filter(Boolean).join(" · "),
        tipo: p.label, desde: p.desde, estado: estadoDelContrato(reporte, aviso), pendiente: p,
        ...(reporte ? { reporte } : {}),
      });
    }
    for (const c of planogramas) {
      out.push({
        clave: `p-${c.version_id}`, clase: "planograma", sede: c.sede, codigo: c.nombre,
        quien: `Planograma · versión ${c.numero}`, tipo: "Planograma", desde: c.rige_desde,
        estado: estadoDelPlanograma(c.estado), versionId: c.version_id,
        motivo: c.estado === "no_se_pudo" ? (c.aviso?.motivo_legible ?? null) : null,
      });
    }
    const urgencia = (f: Fila) => (filtroDe(f.estado) === "sin_montar" || f.estado === "no_realizado" ? 0 : 1);
    out.sort((a, b) => urgencia(a) - urgencia(b) || a.desde.localeCompare(b.desde) || a.codigo.localeCompare(b.codigo));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espacios, planogramas, avisos, isAdmin, sedesALaVista]);

  const cuenta = useMemo(() => cuentaPorFiltro(filas.map((f) => f.estado)), [filas]);
  const visibles = filtro === "todos" ? filas : filas.filter((f) => filtroDe(f.estado) === filtro);

  // Enlace del correo: abrir directamente ese espacio.
  const [yaConfirmado, setYaConfirmado] = useState<MountConfirmation | null>(null);

  /** El espacio ya reportado, reconstruido para poder volver a abrirlo.
   *
   *  No está en `pendientes` justamente porque ya se reportó, así que se arma
   *  de nuevo desde el layout. Sin esto no hay forma de corregir una foto
   *  movida: el espacio desaparece de la lista y el enlace del correo solo
   *  dice "ya se reportó". */
  const reportarDeNuevo = useMemo<Pendiente | null>(() => {
    if (!yaConfirmado) return null;
    return pendienteDelReporte(yaConfirmado, fixturesBySede, nombresPropios, estadoComercial);
  }, [yaConfirmado, fixturesBySede, nombresPropios, estadoComercial]);
  const abiertoPorEnlace = useRef(false);
  useEffect(() => {
    // Esperar a que el layout haya llegado del servidor. Sin esta condición el
    // efecto corría apenas terminaban de cargar las confirmaciones, cuando la
    // lista de espacios todavía estaba vacía: no encontraba nada, se marcaba
    // como consumido y el enlace del correo no volvía a funcionar nunca.
    if (!initialCode || cargando || !layoutListo || abiertoPorEnlace.current) return;
    abiertoPorEnlace.current = true;
    const code = initialCode.toUpperCase();
    const found = pendientes.find((p) => p.code.toUpperCase() === code);
    if (found) {
      setAbierto(found);
      return;
    }
    // Tocar el enlace dos veces es lo más normal del mundo. Decir por qué no
    // hay nada que hacer es mejor que dejar la lista sin explicación. Si no
    // está entre los pendientes es porque su contrato ya se reportó —y ése es
    // su último reporte— o porque no tiene contrato por montar.
    const previo = ultimo[code];
    if (previo) setYaConfirmado(previo);
  }, [initialCode, cargando, layoutListo, pendientes, ultimo]);

  if (abierto) {
    return (
      <FormularioDelTablero
        item={abierto}
        vecinos={fixturesDeSede(fixturesBySede, abierto.sede)}
        onCancel={() => setAbierto(null)}
        onSaved={(m) => {
          setMounts((prev) => [m, ...prev]);
          setAbierto(null);
        }}
      />
    );
  }

  /** Lo que se hace con la fila: un botón, con el verbo del estado. */
  const accion = (f: Fila): { texto: string; hacer: () => void } | null => {
    if (f.clase === "planograma") {
      return f.versionId !== undefined
        ? { texto: f.estado === "sin_verificar" ? "Verificar montaje" : f.estado === "no_realizado" ? "Resolver" : f.estado === "sin_montar" ? "Ver la guía y revisar" : "Ver revisión", hacer: () => setRevisandoVersion(f.versionId!) }
        : null;
    }
    if ((f.estado === "falta_planometria" || f.estado === "falta_zona") && onAbrirPendientes) {
      return { texto: f.estado === "falta_planometria" ? "Adjuntar planometría" : "Ubicar la zona", hacer: onAbrirPendientes };
    }
    if (filtroDe(f.estado) === "sin_montar" && f.pendiente) return { texto: "Registrar montaje", hacer: () => setAbierto(f.pendiente!) };
    if (f.estado === "sin_verificar") return { texto: isAdmin ? "Verificar montaje" : "Ver registro y foto", hacer: () => setMirando(f) };
    if (f.estado === "no_realizado") return { texto: isAdmin ? "Resolver" : "Ver registro", hacer: () => setMirando(f) };
    return { texto: "Ver registro y foto", hacer: () => setMirando(f) };
  };

  return (
    <div className="montajes" data-montajes>
      <header className="mj-cab">
        <div>
          <h2>Montajes</h2>
          {/* Tres estados, no dos: mientras el layout todavía venía en camino
              —o si la sincronización falló por falta de señal— la pantalla
              decía "no hay espacios pendientes", y con eso el mercaderista
              guarda el celular y se va. */}
          <p className="mj-sub">
            {cargando || !layoutListo
              ? "Cargando espacios…"
              : cuenta.sin_montar === 0
              ? "No hay espacios pendientes de montaje."
              : `${cuenta.sin_montar} por montar`}
            {" · "}contratos y planogramas de {todasLasSedes ? "todas las sedes" : activeSede}, por fecha de inicio
          </p>
        </div>
        <span className="mj-der">
          {sedes.length > 1 && (
            <label className="mj-todas">
              <input type="checkbox" checked={todasLasSedes} onChange={(e) => setTodasLasSedes(e.target.checked)} /> Todas las sedes
            </label>
          )}
          {onDone && (
            <button type="button" className="mj-enlace" onClick={onDone} data-resumen-de-montajes>
              Resumen de montajes
            </button>
          )}
        </span>
      </header>
      {!cargando && layoutListo && cuenta.sin_montar === 0 && sinConexion && (
        <p className="mj-aviso">
          La lista no se pudo actualizar. Buscá señal y volvé a entrar antes de dar por
          hecho que no hay nada.
        </p>
      )}

      {yaConfirmado && (
        <div className="mj-ya">
          <Check size={15} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <b className="mono">{yaConfirmado.space_code}</b> ya se
            reportó como {yaConfirmado.estado === "montado" ? "montado" : "no montado"}
            {yaConfirmado.reportado_por ? ` por ${yaConfirmado.reportado_por}` : ""}.
            {/* Una foto movida, con guantes y una mano, es lo más normal del
                mundo — y es la prueba que el proveedor va a discutir en tres
                meses. El histórico guarda todos los reportes y vale el último,
                así que corregir es volver a reportar. */}
            {reportarDeNuevo && (
              <>
                {" "}
                <button type="button" className="mj-enlace subrayado" onClick={() => { setAbierto(reportarDeNuevo); setYaConfirmado(null); }}>
                  Corregir el reporte
                </button>
              </>
            )}
          </div>
          <button type="button" onClick={() => setYaConfirmado(null)} aria-label="Cerrar aviso" className="mj-cerrar">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mj-filtros" role="group" aria-label="Filtrar montajes" data-filtros-montajes>
        {FILTROS_DE_MONTAJES.map((x) => (
          <button key={x.id} type="button" aria-pressed={filtro === x.id} onClick={() => setFiltro(x.id)} data-filtro={x.id}>
            {x.texto} <span className="mono">{cuenta[x.id]}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="mj-vacio">{filas.length === 0 ? "No hay montajes en esta sede." : "Ninguno en este filtro."}</p>
      ) : (
        <ul className="mj-lista" data-lista-montajes>
          <li className="mj-fila mj-titulos" aria-hidden>
            <span>Espacio</span><span>Clase</span><span>Proveedor o versión</span><span>Inicio</span><span>Estado</span><span />
          </li>
          {visibles.map((f) => {
            const a = accion(f);
            return (
              <li key={f.clave} className="mj-fila" data-montaje={f.clase} data-estado={f.estado} data-urgente={f.pendiente?.urgente && filtroDe(f.estado) === "sin_montar" || undefined}>
                <span className="mj-cod">
                  <b className="mono">{f.codigo}</b>
                  {f.parte && <small className="mj-parte">{f.parte}</small>}
                  {todasLasSedes && <small className="mj-sede"><MapPin size={11} /> {f.sede}</small>}
                </span>
                <span className="mj-clase">{f.clase === "contrato" ? "Contrato" : "Planograma"}</span>
                <span className="mj-quien">
                  {f.quien}
                  {f.clase === "contrato" && <small>{f.tipo}</small>}
                </span>
                <span className="mj-desde">{f.desde ? `desde el ${fecha(f.desde)}` : "—"}</span>
                <span className="mj-estado">
                  <i className={`mj-punto ${filtroDe(f.estado)}${f.estado === "no_coincide" ? " mal" : ""}`} />
                  {TEXTO_DEL_ESTADO[f.estado]}
                  {f.reporte?.estado === "no_montado" && f.reporte.motivo && <small>{MOTIVO_LABEL[f.reporte.motivo as MountMotivo]}</small>}
                  {f.motivo && <small>{f.motivo}</small>}
                </span>
                <span className="mj-accion">
                  {a && <button type="button" className="mj-btn" onClick={a.hacer}>{a.texto}</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {mirando?.reporte && (
        <VerificarMontaje
          reporte={mirando.reporte}
          titulo={mirando.codigo}
          puedeVerificar={isAdmin}
          onCerrar={() => setMirando(null)}
          onVerificado={(m) => setMounts((prev) => prev.map((x) => (x.id === m.id ? { ...x, verificacion: m.verificacion } : x)))}
          onRegistrarDeNuevo={mirando.pendiente ? () => { const p = mirando.pendiente!; setMirando(null); setAbierto(p); } : undefined}
        />
      )}
      {revisandoVersion !== null && (
        <RevisarMontaje versionId={revisandoVersion} onCerrar={() => setRevisandoVersion(null)}
          onRevisada={(texto) => { setRevisandoVersion(null); setHecho(texto); setRecargar((n) => n + 1); }} />
      )}
      {hecho && (
        <p className="mj-hecho" role="status">
          {hecho}
          <button type="button" aria-label="Cerrar el aviso" className="mj-cerrar" onClick={() => setHecho(null)}><X size={14} /></button>
        </p>
      )}
    </div>
  );
}

/** El espacio de un reporte, armado desde el layout (para corregirlo). */
function pendienteDelReporte(
  reporte: MountConfirmation,
  fixturesBySede: Record<string, UnifiedFixture[]>,
  nombresPropios: Record<string, string>,
  estadoComercial: EstadoPorEspacio,
): Pendiente | null {
  const code = reporte.space_code.toUpperCase();
  // `NAVE-NEV-03-B-PU2` → el mueble `NAVE-NEV-03`, la cara B y la puerta 2.
  const partido = partirCodigo(code);
  const base = partido.base;
  for (const [sede, lista] of Object.entries(fixturesBySede)) {
    for (const f of lista) {
      const completo = fullSpaceCode((f.sede as string) || sede, f.code);
      if (completo !== base) continue;
      const caraB = partido.cara === "B";
      const data = (partido.parte
        ? { ...(estadoComercial[code] ?? {}) }
        : (caraB ? f.faceB : f)) as Partial<UnifiedFixture>;
      return {
        code,
        corto: codigoDeParte(f.code, partido.cara, partido.parte),
        ...(partido.parte ? { parte: parteParaMontar(partido.parte, partido.cara, f) } : {}),
        fixtureCode: f.code,
        sede: (data?.sede as string) || (f.sede as string) || sede,
        label: conNombrePropio(f, nombresPropios, f.label || f.code),
        marca: (data?.brandCategory as string) || "",
        proveedor: (data?.supplierName as string) || "",
        desde: data?.startDate ?? "",
        hasta: data?.endDate ?? "",
        urgente: false,
        viejo: false,
      };
    }
  }
  return null;
}

// ─── El formulario, tal como lo abre el tablero ──────────────────────────────

/** Los muebles de una sede, tolerando que la clave del mapa y la sede escrita
 *  dentro del mueble difieran en mayúsculas o espacios. */
function fixturesDeSede(
  porSede: Record<string, UnifiedFixture[]>,
  sede: string,
): UnifiedFixture[] {
  const directo = porSede[sede];
  if (directo) return directo;
  const buscada = (sede ?? "").trim().toUpperCase();
  const clave = Object.keys(porSede).find((k) => k.trim().toUpperCase() === buscada);
  return clave ? porSede[clave] : [];
}

/**
 * El mismo formulario que abre el enlace del correo, conectado a la sesión.
 *
 * Lo único que cambia entre las dos puertas: acá el reporte viaja con el token
 * de la sesión y la planometría se busca por contrato; por el enlace firmado
 * las dos cosas salen del propio token.
 */
function FormularioDelTablero({
  item, vecinos, onCancel, onSaved,
}: {
  item: Pendiente;
  vecinos: UnifiedFixture[];
  onCancel: () => void;
  onSaved: (m: MountConfirmation) => void;
}) {
  /** Cómo debe quedar armada la exhibición, según lo que el proveedor mandó.
   *
   *  Se busca por el CÓDIGO del espacio y no por el id del contrato: quien
   *  monta no tiene por qué saber que existen contratos. Que no haya es normal
   *  —no todas lo traen—, así que la ausencia no se anuncia como un error. */
  const [plano, setPlano] = useState<PlanoDelEspacio | null>(null);
  // Con cuenta propia el servidor guarda quién reportó: no se pregunta.
  const nombre = useAuthStore((s) => s.nombre);
  const email = useAuthStore((s) => s.email);
  const quienReporta = email ? nombre?.trim() || email : null;
  useEffect(() => {
    let vivo = true;
    planometriaDelEspacio(item.code).then((p) => {
      if (vivo && p) setPlano({ url: planometriaUrl(p.id), tipo: p.content_type });
    });
    return () => { vivo = false; };
  }, [item.code]);

  return (
    <FormularioMontaje
      item={item}
      vecinos={vecinos}
      plano={plano}
      quienReporta={quienReporta}
      onEnviar={(datos) => confirmMount({ ...datos, spaceCode: item.code, sede: item.sede })}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}
