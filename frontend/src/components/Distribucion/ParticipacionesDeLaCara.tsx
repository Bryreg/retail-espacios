import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePenLine, PenTool, Repeat } from "lucide-react";
import { describeError } from "../../api/client";
import { espacioDeLaCara, leerCara, type CaraOut, type TerminoOut } from "../../api/participaciones";
import { useFixtureStore } from "../../store/fixtureStore";
import { claveDeSede, useOcupacionStore } from "../../store/ocupacionStore";
import { useAuthStore } from "../../store/authStore";
import { pct } from "../../utils/participaciones";
import { estadoMontaje, type MountConfirmation } from "../../api/mounts";
import {
  PALABRA_DE_LA_DISTRIBUCION, PALABRA_DEL_TERMINO, fechaCorta, proveedorDe, segmentosDeHoy,
  terminoParaRenovar, terminoQueSeMuestra, type SegmentoDeCapacidad,
} from "../../utils/revisarParticipaciones";

/**
 * Las participaciones de UNA cara en la ficha de Supervisar (§11): la barra de
 * capacidad de hoy, lo comprometido y lo que queda EN EL PERIODO (el pico, que
 * es lo que Vender deja vender), la lista (número, proveedor, marca, %, fechas,
 * estado), el estado de la distribución y «Abrir en Distribución».
 *
 * Sin plata propia: el precio y el cobro de cada marca los escribe Supervisar
 * y llegan ya armados (`precioDe`, `cobroDe`). Este archivo también lo importa
 * el plano 2D (`useAbrirEnDistribucion`), y no tiene por qué cargar con las
 * cuentas de la plata de Supervisar.
 *
 * SÓLO ADMINISTRACIÓN: lleva proveedores, marcas y fechas de todos, y
 * `GET /participaciones/cara` es de administración (al trabajador le daría
 * 403). Quien la monta la pone adentro de `isAdmin &&` (guarda estática en
 * `probar-comercial.mjs`). No está en Vender: lo que mira el proveedor muestra
 * sólo lo suyo.
 *
 * Va en el pedazo del tablero: lee la API y el store de LECTURA
 * (`ocupacionStore`), nunca el de edición (`distribucionStore`, que es del 3D).
 * Nada se guarda en el navegador.
 */

/** `pedirEnfoque3D(fixtureId, cara, { distribucion })`: abre el Editor 3D en
 *  esa cara y entra a Distribución (§9.2); con `renovar`, con el formulario de
 *  renovar ese término. Es la firma de `pedirEnfoque3D` en `fixtureStore.ts`
 *  (el pedido lo atiende un efecto de `StoreEditor3D`). */
export type PedirEnfoqueConDistribucion = (
  fixtureId: string, cara: "A" | "B", opciones?: { distribucion?: { renovar?: number; volver?: "supervisar" } },
) => void;

/** Abrir una cara en Distribuir (y, con `renovar`, el formulario de renovar
 *  ese término). Con `volver = "supervisar"` (lo que se abre desde Supervisar),
 *  al guardar la cara se vuelve ahí. */
export function useAbrirEnDistribucion(volver?: "supervisar"): (fixtureId: string, cara: "A" | "B", renovar?: number) => void {
  const pedir: PedirEnfoqueConDistribucion = useFixtureStore((s) => s.pedirEnfoque3D);
  return useCallback(
    (fixtureId: string, cara: "A" | "B", renovar?: number) =>
      pedir(fixtureId, cara, { distribucion: { ...(renovar ? { renovar } : {}), ...(volver ? { volver } : {}) } }),
    [pedir, volver],
  );
}

/** «Editar contrato» sólo para un contrato que corre o está firmado (no una
 *  reserva provisional, no lo vencido ni lo cancelado), con su `lease_id`. */
function editable(t: TerminoOut | null | undefined): t is TerminoOut {
  return !!t && t.estado === "contrato" && typeof t.lease_id === "number"
    && (t.estado_visible === "vigente" || t.estado_visible === "firmado");
}

/** El relleno de un segmento: el tono de su estampa con su textura (el color
 *  nunca va solo: el número va en el rótulo y en la leyenda), lo libre en el
 *  verde de «libre» tenue y lo vendido entero en el de ocupado. */
function relleno(s: SegmentoDeCapacidad): string {
  if (s.tipo === "libre") return "rgb(var(--libre-rgb) / 0.16)";
  if (s.tipo === "entera") return "var(--ocupado)";
  const tono = s.tono === null ? "var(--ink-3)" : `var(--marca-${s.tono + 1})`;
  if (s.textura === "rayado45" || s.textura === "rayado135") {
    const ang = s.textura === "rayado45" ? 45 : 135;
    return `repeating-linear-gradient(${ang}deg, ${tono} 0 4px, rgb(var(--surface-rgb) / 0.55) 4px 6px)`;
  }
  return tono;
}

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Lo que de un cobro por ventas dice la ficha, ya escrito por Supervisar
 *  («8 % de las ventas») y el próximo corte. Este archivo no importa
 *  `api/cobros` ni la plata de Supervisar. */
export interface CobroDeLaFicha {
  texto: string;
  proximo_corte: { periodo_desde: string; periodo_hasta: string } | null;
}

/** Lo que dice una participación de su precio, ya escrito por Supervisar en
 *  la unidad de la franja («$ 500.000 al mes»). */
export type PrecioDeLaFicha = (t: { valor_mensual: number; desde: string; hasta: string }) => string;

/** El montaje de una participación, como punto y palabra. */
function MontajeDeLaParticipacion({ reporte, desde, hoy }: { reporte: MountConfirmation | undefined; desde: string; hoy: string }) {
  const estado = estadoMontaje(reporte);
  // Firmada para más adelante y sin reporte: todavía no le toca.
  if (estado === "pendiente" && desde > hoy) return <span className="punto" style={{ "--c": "var(--ink-4)" } as React.CSSProperties}>—</span>;
  const pinta = estado === "montado" ? { c: "var(--libre)", t: "Montado" }
    : estado === "no_montado" ? { c: "var(--ocupado)", t: "No se pudo" }
    : { c: "var(--ink-4)", t: "Sin montar" };
  return <span className="punto" style={{ "--c": pinta.c } as React.CSSProperties}>{pinta.t}</span>;
}


export default function ParticipacionesDeLaCara({
  fixtureId, codigo, cara, sede, doble, onRenovar, precioDe, montajeDe, cobroDe, onVender, onEditar,
}: {
  fixtureId: string;
  /** El código del mueble en el plano (`GON-01`). */
  codigo: string;
  cara: "A" | "B";
  /** La sede del plano. */
  sede: string;
  /** El mueble tiene cara B (`carasDe`): el título nombra la cara. */
  doble: boolean;
  /** Renovar la participación `PC<numero>`: abre Vender armado con su % y el
   *  término que renueva (rediseño de Vender, PR 1). Sin esto no hay botón:
   *  Renovar ya no va a Distribución. */
  onRenovar?: (numero: number) => void;
  /** El precio de cada marca, en la unidad de la franja (rediseño, PR 2):
   *  lo escribe Supervisar. Sin esto, la fila no dice precio. */
  precioDe?: PrecioDeLaFicha;
  /** El último reporte de montaje del contrato de esa participación (por su
   *  código completo y su arranque). */
  montajeDe?: (codigoCompleto: string, desde: string) => MountConfirmation | undefined;
  /** El cobro por % de las ventas del contrato de esa participación, si se
   *  cobra así. */
  cobroDe?: (codigoCompleto: string) => CobroDeLaFicha | undefined;
  /** «Vender el Y %»: abre Vender con esta cara y lo que queda EN EL PERIODO
   *  (el pico): lo de hoy puede no entrar el día que arranca otra. */
  onVender?: (quedaPb: number) => void;
  /** «Editar contrato» de una participación con contrato vigente o firmado:
   *  abre Vender con ESE contrato (su `lease_id`) cargado. Sólo Supervisar, y
   *  sólo quien administra; sin esto no hay botón (el plano 2D no lo pasa). */
  onEditar?: (t: TerminoOut, codigoCompleto: string) => void;
}) {
  const abrir = useAbrirEnDistribucion("supervisar");
  const cliente = useAuthStore((s) => s.cliente) ?? "";
  // Una escritura de participaciones vuelve a leer la ocupación de la sede, y
  // un contrato que se cancela cambia el mapa de la base: con cualquiera de
  // los dos, la ficha se vuelve a leer.
  const ocupacion = useOcupacionStore((s) => s.ocupacion[claveDeSede(cliente, sede)]);
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  const [datos, setDatos] = useState<CaraOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const espacio = espacioDeLaCara(codigo, cara);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    leerCara(sede, espacio)
      .then((d) => { if (vivo) { setDatos(d); setError(null); } })
      .catch((e) => { if (vivo) { setDatos(null); setError(describeError(e, "No se pudieron leer las participaciones de la cara.")); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [sede, espacio, ocupacion, estadoComercial]);

  const segmentos = useMemo(() => (datos ? segmentosDeHoy(datos) : []), [datos]);
  const vivas = datos?.participaciones.filter((p) => p.viva) ?? [];
  const terminadas = (datos?.participaciones.length ?? 0) - vivas.length;
  const titulo = doble ? `Participaciones de la cara ${cara}` : "Participaciones de la cara";
  /** El tono de cada participación en la barra, para su número en la lista. */
  const tonoDe = (numero: number): string => {
    const s0 = segmentos.find((x) => x.clave.startsWith(`${numero}|`));
    return s0 ? relleno(s0) : "var(--surface-3)";
  };
  /** Con UNA sola participación para renovar, «Renovar» va con las otras
   *  acciones; con varias, cada una lleva el suyo. */
  const paraRenovar = datos ? vivas.filter((p) => terminoParaRenovar(p, datos.hoy)) : [];
  const unaSola = paraRenovar.length === 1 ? paraRenovar[0] : null;
  /** Lo que queda en el PERIODO: lo que se puede vender sin chocar con nada
   *  el día más cargado (`capacidad.periodo`). Con lo de hoy, «Vender el 80 %»
   *  rebotaba en Vender si otra participación arrancaba en cinco días. */
  const periodo = datos?.capacidad.periodo;
  const comprometido = periodo?.pico_pb ?? 0;
  const queda = periodo?.disponible_pb ?? 0;

  return (
    <div data-participaciones-de-la-cara={`${fixtureId}-${cara}`} className="ficha-pc">
      <span className="rotulo">{titulo}</span>

      {cargando && !datos && <div className="nota">Cargando…</div>}
      {error && <div className="nota error">{error}</div>}

      {datos && !datos.por_participacion && (
        <div className="nota">
          En el plano guardado esta cara todavía no se vende por participación: esperá a que se guarde el plano.
        </div>
      )}

      {datos && datos.por_participacion && (
        <>
          {/* La única figura: la barra de lo comprometido HOY, una franja por
              participación con su tono y lo que queda en verde tenue; debajo
              la lectura con las dos cifras. */}
          <div className="cap">
            <div
              className="barra"
              role="img"
              aria-label={`Hoy: comprometido ${pct(datos.capacidad.hoy_pb)}, queda ${pct(datos.capacidad.disponible_hoy_pb)}`}
            >
              {segmentos.map((s0) => (
                <span
                  key={s0.clave}
                  title={`${s0.rotulo}${s0.tipo === "reserva" ? " · reserva" : ""}`}
                  className={s0.tipo === "libre" ? "queda" : undefined}
                  style={{ flex: `${s0.pb} 0 0`, ...(s0.tipo === "libre" ? {} : { background: relleno(s0) }) }}
                />
              ))}
            </div>
            <div className="lee" title="Lo comprometido y lo que queda, en el día más cargado del periodo; la barra es la de hoy">
              <span>
                Comprometido <b>{pct(comprometido)}</b>
                {comprometido > datos.capacidad.hoy_pb && datos.capacidad.periodo.dia_pico
                  ? ` desde el ${fechaCorta(datos.capacidad.periodo.dia_pico, datos.hoy)}` : ""}
              </span>
              <span>queda <b>{pct(queda)}</b></span>
              {comprometido > datos.capacidad.hoy_pb && (
                <span>hoy <b>{pct(datos.capacidad.hoy_pb)}</b></span>
              )}
            </div>
          </div>

          {vivas.length === 0 ? (
            <div className="nota">No tiene participaciones vivas: un porcentaje se vende en Vender.</div>
          ) : (
            <div className="partes-pc">
              {vivas.map((p) => {
                const t = terminoQueSeMuestra(p, datos.hoy);
                const prov = proveedorDe(p);
                // Con una sola para renovar, el botón va abajo, con las otras acciones.
                const renovable = unaSola ? null : terminoParaRenovar(p, datos.hoy);
                const completo = (p.codigo || t?.codigo || "").toUpperCase();
                const cobro = completo ? cobroDe?.(completo) : undefined;
                const precio = cobro
                  ? cobro.texto
                  : t && t.valor_mensual && t.valor_mensual > 0 && precioDe
                  ? precioDe({ valor_mensual: t.valor_mensual, desde: t.desde, hasta: t.hasta })
                  : "";
                const fechas = t ? (t.desde <= datos.hoy ? `hasta ${fechaCorta(t.hasta, datos.hoy)}` : `${fechaCorta(t.desde, datos.hoy)} – ${fechaCorta(t.hasta, datos.hoy)}`) : "";
                return (
                  <div key={p.space_id} className="part">
                    <span className="num" style={{ background: tonoDe(p.numero) }}>{p.numero}</span>
                    <div className="dat">
                      <b>{prov?.nombre ?? "Sin proveedor"}{t?.marca ? ` · ${t.marca}` : ""}</b>
                      <span>
                        {[pct(p.contratado_pb || t?.puntos_basicos || 0), fechas, precio].filter(Boolean).join(" · ")}
                      </span>
                      {cobro?.proximo_corte && (
                        <span>próximo corte {fechaCorta(cobro.proximo_corte.periodo_hasta, datos.hoy)}</span>
                      )}
                      {t && t.estado_visible !== "vigente" && (
                        <span>
                          {PALABRA_DEL_TERMINO[t.estado_visible]}
                          {t.estado_visible === "reserva" && t.caduca ? ` · caduca el ${fechaCorta(t.caduca, datos.hoy)}` : ""}
                        </span>
                      )}
                    </div>
                    {t && t.estado === "contrato" && completo
                      ? <MontajeDeLaParticipacion reporte={montajeDe?.(completo, t.desde)} desde={t.desde} hoy={datos.hoy} />
                      : <span />}
                    {((renovable && onRenovar) || (editable(t) && onEditar)) && (
                      <span className="acc-part">
                        {renovable && onRenovar && (
                          <button
                            type="button"
                            onClick={() => onRenovar(p.numero)}
                            className="btn-s"
                            title={`Renovar la participación ${p.numero}`}
                          >
                            <Repeat {...ICONO} /> Renovar
                          </button>
                        )}
                        {editable(t) && onEditar && t && (
                          <button
                            type="button"
                            onClick={() => onEditar(t, completo)}
                            className="btn-s"
                            data-editar-contrato={t.lease_id ?? undefined}
                            title={`Editar el contrato de la participación ${p.numero} (se reenvía a los correos)`}
                          >
                            <FilePenLine {...ICONO} /> Editar contrato
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {terminadas > 0 && (
            <div className="nota">
              Y {terminadas} participación{terminadas === 1 ? "" : "es"} que ya no rige{terminadas === 1 ? "" : "n"}: su historia está en Distribución.
            </div>
          )}

          <div className="acc">
            <button type="button" className="btn-s" onClick={() => abrir(fixtureId, cara)} title="Abrir en Distribución: el Editor 3D en esta cara">
              <PenTool {...ICONO} /> Distribuir
            </button>
            {unaSola && onRenovar && (
              <button type="button" className="btn-s" onClick={() => onRenovar(unaSola.numero)} title={`Renovar la participación ${unaSola.numero}`}>
                <Repeat {...ICONO} /> Renovar
              </button>
            )}
            {onVender && queda > 0 && (
              <button type="button" className="btn-s" onClick={() => onVender(queda)} title="Abre Vender con esta cara y lo que queda en el periodo">
                <FilePenLine {...ICONO} /> Vender el {pct(queda)}
              </button>
            )}
          </div>

          <div className="fila-dist">
            <span className="rotulo">Distribución</span>
            <span className={`pill ${datos.distribucion?.estado === "confirmada" ? "libre" : "entra"}`}>
              {PALABRA_DE_LA_DISTRIBUCION[datos.distribucion?.estado ?? "sin_distribuir"]}
            </span>
            {vivas.length > 0 && (() => {
              let contratado = 0, dibujado = 0, pendiente = 0;
              for (const p of vivas) { contratado += p.contratado_pb; dibujado += p.dibujado_pb; pendiente += p.pendiente_pb; }
              return (
                <span className="mono nota">
                  dibujado {pct(dibujado)} de {pct(contratado)} contratado{pendiente > 0 ? ` · falta ${pct(pendiente)}` : ""}
                </span>
              );
            })()}
          </div>
          {datos.revision.errores.length > 0 && (
            <div className="nota error">
              {datos.revision.errores.length} problema{datos.revision.errores.length === 1 ? "" : "s"}: {datos.revision.errores[0].frase}
            </div>
          )}
        </>
      )}
    </div>
  );
}
