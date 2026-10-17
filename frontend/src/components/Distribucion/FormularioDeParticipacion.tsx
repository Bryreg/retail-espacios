import { useEffect, useMemo, useState } from "react";
import { describeError } from "../../api/client";
import {
  confirmarReserva, crear, editarReserva, espacioDeLaCara, rechazoDe, renovar, terminoDeOut,
  type CaraOut, type ParticipacionOut, type ProblemaOut, type TerminoEscrito, type TerminoOut,
} from "../../api/participaciones";
import { getSuppliers } from "../../api/suppliers";
import { useFichasPropias } from "../../store/fichasPropias";
import { useDistribucionStore, type DistribucionActiva } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import type { AvisosContrato, Supplier } from "../../types";
import { tarifaDeEspacio } from "../../utils/partes";
import {
  disponible, intervalosQueCuentan, pbDeTexto, pct, revisarCapacidad, revisarTerminos, vivo, type CambioDeTermino, type Rechazo,
} from "../../utils/participaciones";
import {
  BOTON, BOTON_PELIGRO, Dialogo, ESTILO_PELIGRO, datosDeLaCara, irAlProblema, nombreDeParticipacion, sumarDias, vigenciaDe,
} from "./LeyendaDeParticipaciones";

/**
 * El formulario de una participación (§9.3 del diseño de participaciones):
 * alta (reserva provisional o contrato), renovar, confirmar una reserva como
 * contrato, cambiar una reserva y «Cargar de nuevo» (un alta prellenada con
 * una participación que ya no rige).
 *
 * Debajo, EN VIVO y con las mismas reglas que el servidor (`revisarCapacidad`
 * y `revisarTerminos` sobre lo que bajó la cara): «En esas fechas queda 40 %.»
 * o la frase de por qué no entra, que deshabilita «Guardar». El servidor
 * decide con el candado tomado: un 409 se muestra arriba, sin cerrar el
 * formulario ni perder lo escrito —`rompe_distribucion` con su lista y «Ver en
 * el lienzo»; `version_vieja` con «Volver a leer la cara»—.
 *
 * En «Renovar», proveedor, marca y porcentaje no se cambian (un término nuevo
 * de la MISMA participación, I2 e I3): «Cambiar el porcentaje» lo convierte
 * en una participación nueva prellenada. La tarifa de la cara va como
 * referencia y nunca se prorratea (D10).
 */

type Modo = "alta" | "renovar" | "confirmar" | "editar" | "cargarDeNuevo";

const ETIQUETA = "mb-0.5 block text-[10px] font-medium uppercase tracking-widest text-dark-ink-3";
const CAMPO = "w-full border-0 border-b border-dark-line-2 bg-transparent px-0 py-1 text-sm text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none disabled:opacity-60";
const ROJO = "rgb(var(--ocupado-txt-rgb))";

/** `2500` → «25»; `3333` → «33,33» (lo que se escribe en el campo). */
const textoDePb = (pb: number) => pct(pb).replace(/\s*%$/, "");
const diasEntre = (a: string, b: string) =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
/** «900.000», «$ 900000», «900000,5» → 900000.5; null si no es un número ≥ 0. */
export function valorDeTexto(s: string): number | null {
  const limpio = s.replace(/[$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-CO")}`;

/**
 * Qué hace Esc en el formulario (también con el foco en un campo, donde Esc
 * llega igual al diálogo): sin nada escrito, cierra; con algo escrito,
 * pregunta antes de perderlo; con la pregunta a la vista, la cierra y se
 * sigue editando. Mientras se guarda, nada.
 */
export function queHaceEsc(c: { sucio: boolean; preguntando: boolean; enviando: boolean }): "cerrar" | "preguntar" | "seguir" | "nada" {
  if (c.enviando) return "nada";
  if (c.preguntando) return "seguir";
  return c.sucio ? "preguntar" : "cerrar";
}

/** El último día que ocupa un término vivo de la participación (o null). */
function finDeLosVivos(p: ParticipacionOut, hoy: string): string | null {
  let fin: string | null = null;
  for (const t of p.terminos) if (vivo(terminoDeOut(t), hoy) && (fin === null || t.hasta > fin)) fin = t.hasta;
  return fin;
}

interface Campos {
  tipo: "reserva" | "contrato";
  proveedor: string;
  correo: string;
  marca: string;
  porcentaje: string;
  desde: string;
  hasta: string;
  caduca: string;
  valor: string;
  notas: string;
}

function camposIniciales(modo: Modo, t: TerminoOut | null, p: ParticipacionOut | null, hoy: string): Campos {
  const base: Campos = {
    tipo: "contrato", proveedor: "", correo: "", marca: "", porcentaje: "", desde: hoy, hasta: sumarDias(hoy, 89),
    caduca: sumarDias(hoy, 7), valor: "", notas: "",
  };
  if (!t || !p) return base;
  const duracion = Math.max(0, diasEntre(t.desde, t.hasta));
  const despuesDeLosVivos = () => {
    const fin = finDeLosVivos(p, hoy);
    return fin && fin >= hoy ? sumarDias(fin, 1) : hoy;
  };
  switch (modo) {
    case "cargarDeNuevo": {
      const desde = despuesDeLosVivos();
      return { ...base, proveedor: t.proveedor?.nombre ?? "", marca: t.marca ?? "", porcentaje: textoDePb(t.puntos_basicos),
        desde, hasta: sumarDias(desde, duracion), caduca: sumarDias(hoy, 7) };
    }
    case "renovar": {
      const desde = despuesDeLosVivos();
      return { ...base, proveedor: t.proveedor?.nombre ?? "", marca: t.marca ?? "", porcentaje: textoDePb(t.puntos_basicos),
        desde, hasta: sumarDias(desde, duracion), valor: t.valor_mensual != null ? String(t.valor_mensual) : "", notas: "" };
    }
    case "confirmar":
      return { ...base, proveedor: t.proveedor?.nombre ?? "", marca: t.marca ?? "", porcentaje: textoDePb(t.puntos_basicos),
        desde: t.desde, hasta: t.hasta, notas: t.notas ?? "" };
    case "editar":
      return { ...base, tipo: "reserva", proveedor: t.proveedor?.nombre ?? "", marca: t.marca ?? "", porcentaje: textoDePb(t.puntos_basicos),
        desde: t.desde, hasta: t.hasta, caduca: t.caduca ?? sumarDias(hoy, 7), notas: t.notas ?? "" };
    default:
      return base;
  }
}

/** Lo que el servidor rechazaría por las fechas o el tipo (los 422 de §5.3),
 *  dicho antes de mandar. */
export function problemaDeLosCampos(modo: Modo, c: Campos, hoy: string): string | null {
  const conProveedor = modo === "alta" || modo === "cargarDeNuevo";
  if (conProveedor && !c.proveedor.trim()) return "Escribí el proveedor.";
  if (pbDeTexto(c.porcentaje) === null) return "Escribí un porcentaje entre 0,01 y 100.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(c.hasta)) return "Elegí las dos fechas.";
  if (c.desde > c.hasta) return "La fecha de inicio no puede ser posterior a la de fin.";
  const tipo = modo === "confirmar" ? "contrato" : modo === "editar" ? "reserva" : c.tipo;
  if (tipo === "reserva") {
    if (c.hasta < hoy) return "Una reserva provisional tiene que terminar hoy o después.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.caduca) || c.caduca < hoy || c.caduca > c.hasta) {
      return "La reserva tiene que caducar entre hoy y el último día que reserva.";
    }
  } else if (modo !== "editar" && valorDeTexto(c.valor) === null) {
    return "Escribí el valor mensual del contrato (en pesos; 0 si no se cobra).";
  }
  return null;
}

export default function FormularioDeParticipacion() {
  const formulario = useDistribucionStore((s) => s.formulario);
  const datos = useDistribucionStore((s) => s.datos);
  const activa = useDistribucionStore((s) => s.activa);
  if (!formulario || !datos || !activa) return null;
  return <Formulario key={`${formulario.modo}|${formulario.terminoId ?? ""}`} modo={formulario.modo} terminoId={formulario.terminoId ?? null}
    datos={datos} activa={activa} />;
}

function Formulario({ modo, terminoId, datos, activa }: { modo: Modo; terminoId: number | null; datos: CaraOut; activa: DistribucionActiva }) {
  const hoy = datos.hoy;
  // El término y su participación se buscan en cada dibujo: después de
  // «Volver a leer la cara» traen su versión nueva.
  const participacion = terminoId != null ? datos.participaciones.find((p) => p.terminos.some((t) => t.id === terminoId)) ?? null : null;
  const termino = participacion?.terminos.find((t) => t.id === terminoId) ?? null;
  const [c, setC] = useState<Campos>(() => camposIniciales(modo, termino, participacion, hoy));
  // Lo que había al abrir: con algo distinto, Esc pregunta antes de cerrar.
  const [inicial] = useState<Campos>(() => c);
  const sucio = (Object.keys(inicial) as (keyof Campos)[]).some((k) => c[k] !== inicial[k]);
  const [preguntaCerrar, setPreguntaCerrar] = useState(false);
  const [proveedores, setProveedores] = useState<Supplier[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [rechazo, setRechazo] = useState<{ mensaje: string; problemas: ProblemaOut[]; code: string | null } | null>(null);
  const [hecho, setHecho] = useState<{ texto: string; avisos: AvisosContrato | null; distribucion: ProblemaOut[] } | null>(null);
  const mueble = useFixtureStore((s) => (s.fixturesBySede[activa.sede] ?? selectFixtures(s)).find((f) => f.id === activa.fixtureId) ?? null);
  const rates = useFixtureStore((s) => s.referenceRates);
  // La tarifa de una ficha propia llega después del primer dibujo: el cálculo
  // depende de las fichas del supermercado (la regla de `probar-catalogo`).
  const fichasPropias = useFichasPropias();
  const tipo: "reserva" | "contrato" = modo === "confirmar" ? "contrato" : modo === "editar" ? "reserva" : c.tipo;
  const tarifa = useMemo(
    () => (mueble && tipo === "contrato" ? tarifaDeEspacio(rates, activa.sede, mueble, null).valor : null),
    [mueble, tipo, rates, activa.sede, fichasPropias],
  );

  const conProveedor = modo === "alta" || modo === "cargarDeNuevo";
  useEffect(() => {
    if (!conProveedor) return;
    let vivoAca = true;
    getSuppliers().then((l) => { if (vivoAca) setProveedores(l); }).catch(() => { if (vivoAca) setProveedores([]); });
    return () => { vivoAca = false; };
  }, [conProveedor]);

  const cerrar = () => useDistribucionStore.getState().abrirFormulario(null);
  const cambiar = (k: keyof Campos, v: string) => { setC((x) => ({ ...x, [k]: v })); setRechazo(null); };

  const necesitaTermino = modo !== "alta";
  if (necesitaTermino && (!termino || !participacion)) {
    return (
      <Dialogo titulo="La participación ya no está" onCerrar={cerrar} cerrarAfuera={false}>
        <p className="text-xs text-dark-ink-2">Esa participación no aparece en la cara que se leyó. Cerrá y volvé a elegirla en la lista.</p>
        <div className="mt-3 flex justify-end"><button type="button" className={BOTON} onClick={cerrar}>Cerrar</button></div>
      </Dialogo>
    );
  }

  const d = datosDeLaCara(datos);
  const pb = pbDeTexto(c.porcentaje);
  const problemaCampos = problemaDeLosCampos(modo, c, hoy);
  const fechasOk = /^\d{4}-\d{2}-\d{2}$/.test(c.desde) && /^\d{4}-\d{2}-\d{2}$/.test(c.hasta) && c.desde <= c.hasta;
  const proveedorElegido = conProveedor && proveedores
    ? proveedores.find((s) => s.name.trim().toLowerCase() === c.proveedor.trim().toLowerCase()) ?? null : null;
  const proveedorNuevo = conProveedor && !!c.proveedor.trim() && proveedores !== null && !proveedorElegido;

  // La vista previa: las mismas reglas que el servidor.
  const excluir = (modo === "editar" || modo === "confirmar") && termino ? termino.id : null;
  const I = intervalosQueCuentan(d.todos, d.fisicos, hoy, excluir);
  const queda = fechasOk ? disponible(I, c.desde, c.hasta, hoy) : null;
  let porCapacidad: Rechazo | null = null;
  if (pb !== null && fechasOk) porCapacidad = revisarCapacidad(I, d.fisicos, pb, c.desde, c.hasta, activa.cara, hoy);
  let porTerminos: Rechazo | null = null;
  if (termino && participacion && pb !== null && fechasOk) {
    const deLaP = d.terminosPorS.get(participacion.space_id) ?? [];
    let cambio: CambioDeTermino | null = null;
    if (modo === "renovar") {
      cambio = { tipo: "renovar", renuevaA: termino.id, desde: c.desde, hasta: c.hasta, pb: termino.puntos_basicos,
        supplierId: termino.proveedor?.id ?? 0, marca: termino.marca };
    } else if (modo === "editar" || modo === "confirmar") {
      cambio = {
        tipo: modo, id: termino.id, desde: c.desde, hasta: c.hasta,
        ...(pb !== termino.puntos_basicos ? { pb } : {}),
        ...(modo === "editar" && (c.marca.trim() || null) !== (termino.marca ?? null) ? { marca: c.marca.trim() || null } : {}),
      };
    }
    if (cambio) porTerminos = revisarTerminos(deLaP, cambio, hoy);
  }
  const noEntra = porTerminos ?? porCapacidad;
  const puedeGuardar = !problemaCampos && !noEntra && !enviando;

  const titulo = modo === "alta" ? `Nueva participación · ${activa.codigo} · cara ${activa.cara}`
    : modo === "cargarDeNuevo" ? `Nueva participación (prellenada) · cara ${activa.cara}`
    : modo === "renovar" ? `Renovar la participación ${participacion!.numero}`
    : modo === "confirmar" ? `Confirmar la reserva de la participación ${participacion!.numero} como contrato`
    : `Cambiar la reserva de la participación ${participacion!.numero}`;

  async function guardar() {
    if (!puedeGuardar || pb === null) return;
    setEnviando(true);
    setRechazo(null);
    const espacio = espacioDeLaCara(activa.codigo, activa.cara);
    const valor = valorDeTexto(c.valor);
    const notas = c.notas.trim() || null;
    try {
      let r: TerminoEscrito;
      if (modo === "alta" || modo === "cargarDeNuevo") {
        r = await crear({
          sede: activa.sede, espacio, tipo, proveedor: c.proveedor.trim(),
          correo: proveedorNuevo && c.correo.trim() ? c.correo.trim() : null, marca: c.marca.trim() || null,
          puntos_basicos: pb, desde: c.desde, hasta: c.hasta, caduca: tipo === "reserva" ? c.caduca : null,
          valor_mensual: tipo === "contrato" ? valor : null, notas,
        });
      } else if (modo === "renovar") {
        r = await renovar(termino!.id, {
          version: termino!.version, tipo, desde: c.desde, hasta: c.hasta,
          caduca: tipo === "reserva" ? c.caduca : null, valor_mensual: tipo === "contrato" ? valor : null, notas,
        });
      } else if (modo === "confirmar") {
        r = await confirmarReserva(termino!.id, {
          version: termino!.version, valor_mensual: valor ?? 0, notas,
          ...(pb !== termino!.puntos_basicos ? { puntos_basicos: pb } : {}),
          ...(c.desde !== termino!.desde ? { desde: c.desde } : {}),
          ...(c.hasta !== termino!.hasta ? { hasta: c.hasta } : {}),
        });
      } else {
        const t = termino!;
        r = await editarReserva(t.id, {
          version: t.version,
          ...(pb !== t.puntos_basicos ? { puntos_basicos: pb } : {}),
          ...(c.desde !== t.desde ? { desde: c.desde } : {}),
          ...(c.hasta !== t.hasta ? { hasta: c.hasta } : {}),
          ...(c.caduca !== (t.caduca ?? "") ? { caduca: c.caduca } : {}),
          ...((c.marca.trim() || null) !== (t.marca ?? null) ? { marca: c.marca.trim() || null } : {}),
          ...(notas !== (t.notas ?? null) ? { notas } : {}),
        });
      }
      useDistribucionStore.getState().aplicarCara(r.cara);
      // Un contrato nuevo (alta, confirmación o renovación) es una fila de
      // `space_leases`: el estado comercial del plano se vuelve a leer ya, como
      // después de cualquier venta, y no a los 20 s del sondeo.
      if (r.termino.estado === "contrato") void useFixtureStore.getState().refrescarComercial();
      const extra = (r as TerminoEscrito & { avisos_distribucion?: ProblemaOut[] }).avisos_distribucion ?? [];
      const n = r.termino.numero;
      setHecho({
        texto: modo === "renovar" ? `Quedó renovada la participación ${n} ${vigenciaDe(r.termino)}.`
          : modo === "confirmar" ? `La reserva de la participación ${n} quedó confirmada como contrato.`
          : modo === "editar" ? `Quedó cambiada la reserva de la participación ${n}.`
          : `Quedó cargada la participación ${n}: ${pct(r.termino.puntos_basicos)} de la cara ${activa.cara}, ${vigenciaDe(r.termino)}.`,
        avisos: r.avisos ?? null, distribucion: extra,
      });
    } catch (e) {
      const r = rechazoDe(e);
      const problemas = r && Array.isArray(r.cuerpo.problemas) ? (r.cuerpo.problemas as ProblemaOut[]) : [];
      setRechazo({
        mensaje: r?.message || describeError(e, "No se pudo guardar: probá de nuevo en un momento. Lo escrito sigue acá."),
        problemas, code: r?.code ?? null,
      });
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <Dialogo titulo={titulo} onCerrar={cerrar}>
        <p className="text-xs leading-relaxed text-dark-ink-1" role="status">{hecho.texto}</p>
        {hecho.avisos && <AvisosDeCorreo avisos={hecho.avisos} />}
        {hecho.distribucion.length > 0 && (
          <div className="mt-2 text-[11px] leading-snug" style={{ color: "rgb(var(--entra-txt-rgb))" }}>
            <p className="font-semibold">El borrador de la distribución queda con esto para corregir:</p>
            <ul className="mt-0.5">{hecho.distribucion.map((p, i) => <li key={i}>· {p.frase}</li>)}</ul>
          </div>
        )}
        <div className="mt-3 flex justify-end"><button type="button" className={BOTON} onClick={cerrar}>Listo</button></div>
      </Dialogo>
    );
  }

  return (
    <Dialogo titulo={titulo} onCerrar={cerrar} cerrarAfuera={false} ancho="max-w-md"
      alEscape={() => {
        const q = queHaceEsc({ sucio, preguntando: preguntaCerrar, enviando });
        if (q === "cerrar") cerrar();
        else if (q === "preguntar") setPreguntaCerrar(true);
        else if (q === "seguir") setPreguntaCerrar(false);
      }}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        {preguntaCerrar && (
          <div role="alert" data-pregunta-cerrar className="rounded-md border px-2.5 py-2 text-xs leading-snug"
            style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.6)", color: "rgb(var(--entra-txt-rgb))" }}>
            <p>Hay cambios sin guardar en el formulario. Si cerrás, se pierde lo escrito.</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" className={BOTON} autoFocus onClick={() => setPreguntaCerrar(false)}>Seguir editando</button>
              <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO} onClick={cerrar}>Cerrar sin guardar</button>
            </div>
          </div>
        )}
        {rechazo && (
          <div role="alert" className="rounded-md border px-2.5 py-2 text-xs leading-snug" style={{ borderColor: ROJO, color: ROJO }}>
            <p>{rechazo.mensaje}</p>
            {rechazo.problemas.length > 1 && (
              <ul className="mt-1">{rechazo.problemas.map((p, i) => <li key={i}>· {p.frase}</li>)}</ul>
            )}
            <div className="mt-1.5 flex flex-wrap gap-2">
              {rechazo.code === "rompe_distribucion" && rechazo.problemas.length > 0 && (
                <button type="button" className={BOTON}
                  onClick={() => { irAlProblema({ zona: null, participaciones: rechazo.problemas[0].participaciones }); cerrar(); }}>
                  Ver en el lienzo
                </button>
              )}
              {(rechazo.code === "version_vieja" || rechazo.code === "plano_cambio") && (
                <button type="button" className={BOTON} onClick={() => { void useDistribucionStore.getState().traerLoNuevo(); setRechazo(null); }}>
                  Volver a leer la cara
                </button>
              )}
            </div>
          </div>
        )}

        {participacion && modo !== "cargarDeNuevo" && (
          <p className="text-xs text-dark-ink-2">
            <b className="text-dark-ink-1">{nombreDeParticipacion(participacion)}</b>
            {termino && <> · ahora {pct(termino.puntos_basicos)}, {vigenciaDe(termino)}</>}
          </p>
        )}

        {(modo === "alta" || modo === "cargarDeNuevo" || modo === "renovar") && (
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-md border border-dark-line-2 p-0.5">
            {(["reserva", "contrato"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={c.tipo === t} onClick={() => cambiar("tipo", t)}
                className={`rounded px-2 py-1 text-[11px] font-semibold ${c.tipo === t ? "bg-dark-surface-2 text-dark-ink-1" : "text-dark-ink-3 hover:text-dark-ink-1"}`}>
                {t === "reserva" ? "Reserva provisional" : "Contrato"}
              </button>
            ))}
          </div>
        )}

        {conProveedor ? (
          <div>
            <label className={ETIQUETA} htmlFor="part-proveedor">Proveedor</label>
            <input id="part-proveedor" className={CAMPO} list="part-proveedores" value={c.proveedor} autoComplete="off"
              onChange={(e) => cambiar("proveedor", e.target.value)} placeholder="Nombre del proveedor" />
            <datalist id="part-proveedores">{(proveedores ?? []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
            {proveedorNuevo && <p className="mt-1 text-[10px] text-dark-ink-3">Proveedor nuevo: se da de alta con este nombre.</p>}
          </div>
        ) : (
          <p className="text-[11px] text-dark-ink-3">
            Proveedor, marca{modo === "renovar" ? " y porcentaje" : ""} son los de la participación: otro proveedor u otra marca es otra participación.
          </p>
        )}
        {proveedorNuevo && (
          <div>
            <label className={ETIQUETA} htmlFor="part-correo">Correo del proveedor (opcional)</label>
            <input id="part-correo" type="email" className={CAMPO} value={c.correo} onChange={(e) => cambiar("correo", e.target.value)}
              placeholder="para avisarle del contrato" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ETIQUETA} htmlFor="part-marca">Marca</label>
            <input id="part-marca" className={CAMPO} value={c.marca} disabled={!(conProveedor || modo === "editar")}
              onChange={(e) => cambiar("marca", e.target.value)} placeholder="opcional" />
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="part-pct">Porcentaje de la cara</label>
            <input id="part-pct" className={CAMPO} inputMode="decimal" value={c.porcentaje} disabled={modo === "renovar"}
              onChange={(e) => cambiar("porcentaje", e.target.value)} placeholder="25" />
            {c.porcentaje.trim() !== "" && pb === null && (
              <p className="mt-1 text-[10px]" style={{ color: ROJO }}>Escribí un porcentaje entre 0,01 y 100.</p>
            )}
            {modo === "renovar" && termino && (
              <button type="button" className="mt-1 text-[10px] text-dark-ink-2 underline underline-offset-2 hover:text-dark-ink-1"
                onClick={() => useDistribucionStore.getState().abrirFormulario({ modo: "cargarDeNuevo", terminoId: termino.id })}>
                Cambiar el porcentaje
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ETIQUETA} htmlFor="part-desde">Desde</label>
            <input id="part-desde" type="date" className={CAMPO} value={c.desde} onChange={(e) => cambiar("desde", e.target.value)} />
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="part-hasta">Hasta</label>
            <input id="part-hasta" type="date" className={CAMPO} value={c.hasta} onChange={(e) => cambiar("hasta", e.target.value)} />
          </div>
        </div>

        {tipo === "reserva" ? (
          <div>
            <label className={ETIQUETA} htmlFor="part-caduca">La reserva se sostiene hasta</label>
            <input id="part-caduca" type="date" className={CAMPO} value={c.caduca} onChange={(e) => cambiar("caduca", e.target.value)} />
            <p className="mt-1 text-[10px] text-dark-ink-3">Si para entonces no se confirmó como contrato, caduca y el porcentaje queda libre.</p>
          </div>
        ) : modo !== "editar" && (
          <div>
            <label className={ETIQUETA} htmlFor="part-valor">Valor mensual (pesos)</label>
            <input id="part-valor" className={CAMPO} inputMode="numeric" value={c.valor} onChange={(e) => cambiar("valor", e.target.value)}
              placeholder="900.000" />
            <p className="mt-1 text-[10px] text-dark-ink-3">
              {tarifa != null ? `Referencia: tarifa de la cara ${pesos(tarifa)} (la de la cara entera; no se prorratea).` : "Sin tarifa de referencia para este mueble."}
            </p>
          </div>
        )}

        <div>
          <label className={ETIQUETA} htmlFor="part-notas">Notas</label>
          <textarea id="part-notas" rows={2} className={`${CAMPO} resize-none`} value={c.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </div>

        {/* La vista previa, con las reglas del servidor */}
        <div className="rounded-md border border-dark-line px-2.5 py-2 text-xs leading-snug" aria-live="polite" data-vista-previa>
          {problemaCampos ? (
            <p className="text-dark-ink-2">{problemaCampos}</p>
          ) : noEntra ? (
            <p style={{ color: ROJO }}>{noEntra.frase}</p>
          ) : (
            <p className="text-dark-ink-1">
              En esas fechas queda {queda !== null ? pct(queda) : "—"}{pb !== null ? ` y pedís ${pct(pb)}` : ""}.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-dark-line pt-3">
          <button type="button" className={BOTON} onClick={cerrar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="btn-principal rounded-md px-3 py-1.5 text-xs" disabled={!puedeGuardar}>
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

/** A quién se avisó del contrato (el servidor dice lo ENCOLADO). */
function AvisosDeCorreo({ avisos }: { avisos: AvisosContrato }) {
  if (!avisos.smtp_listo) {
    return <p className="mt-2 text-[11px]" style={{ color: "rgb(var(--entra-txt-rgb))" }}>No se avisó a nadie: el correo no está configurado en el servidor.</p>;
  }
  const total = avisos.comercial.length + avisos.montaje.length + avisos.proveedor.length;
  if (total === 0) return <p className="mt-2 text-[11px]" style={{ color: "rgb(var(--entra-txt-rgb))" }}>No se avisó a nadie: no hay contactos cargados para esta sede.</p>;
  const linea = (etiqueta: string, l: string[]) => l.length > 0 && <li>{etiqueta}: {l.join(", ")}</li>;
  return (
    <ul className="mt-2 text-[11px] text-dark-ink-2">
      <li className="text-dark-ink-3">Salieron los avisos a:</li>
      {linea("Comercial", avisos.comercial)}
      {linea("Montaje", avisos.montaje)}
      {linea("Proveedor", avisos.proveedor)}
    </ul>
  );
}
