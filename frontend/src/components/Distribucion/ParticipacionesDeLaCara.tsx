import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, RefreshCw } from "lucide-react";
import { describeError } from "../../api/client";
import { espacioDeLaCara, leerCara, type CaraOut } from "../../api/participaciones";
import { useFixtureStore } from "../../store/fixtureStore";
import { claveDeSede, useOcupacionStore } from "../../store/ocupacionStore";
import { useAuthStore } from "../../store/authStore";
import { pct } from "../../utils/participaciones";
import {
  PALABRA_DE_LA_DISTRIBUCION, PALABRA_DEL_TERMINO, fechaCorta, proveedorDe, segmentosDeHoy,
  terminoParaRenovar, terminoQueSeMuestra, type SegmentoDeCapacidad,
} from "../../utils/revisarParticipaciones";

/**
 * Las participaciones de UNA cara en la ficha de Supervisar (§11): la barra de
 * capacidad de hoy, la lista (número, proveedor, marca, %, fechas, estado), el
 * estado de la distribución y «Abrir en Distribución».
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
 *  renovar ese término. El tercer argumento lo agrega el paso 6a en
 *  `fixtureStore.ts`; esta firma acepta la del store de antes (que tiene dos
 *  parámetros: TypeScript deja asignar una función con menos) y la de después,
 *  así que el merge no necesita tocar acá. Hasta ese merge, el pedido sólo
 *  encuadra la cara en el 3D. */
export type PedirEnfoqueConDistribucion = (
  fixtureId: string, cara: "A" | "B", opciones?: { distribucion?: { renovar?: number } },
) => void;

/** Abrir una cara en Distribución (y, con `renovar`, el formulario de renovar
 *  ese término). */
export function useAbrirEnDistribucion(): (fixtureId: string, cara: "A" | "B", renovar?: number) => void {
  const pedir: PedirEnfoqueConDistribucion = useFixtureStore((s) => s.pedirEnfoque3D);
  return useCallback(
    (fixtureId: string, cara: "A" | "B", renovar?: number) =>
      pedir(fixtureId, cara, { distribucion: renovar ? { renovar } : {} }),
    [pedir],
  );
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

const etiqueta: React.CSSProperties = {
  fontSize: "var(--t-3xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)",
};

function boton(lleno: boolean): React.CSSProperties {
  return {
    height: 28, padding: "0 10px", borderRadius: "var(--r-md)",
    display: "inline-flex", alignItems: "center", gap: 5,
    border: lleno ? "none" : "1px solid var(--line)",
    background: lleno ? "var(--accent)" : "var(--surface-2)",
    color: lleno ? "#fff" : "var(--ink-2)",
    fontSize: "var(--t-xs)", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
  };
}

export default function ParticipacionesDeLaCara({
  fixtureId, codigo, cara, sede, doble,
}: {
  fixtureId: string;
  /** El código del mueble en el plano (`GON-01`). */
  codigo: string;
  cara: "A" | "B";
  /** La sede del plano. */
  sede: string;
  /** El mueble tiene cara B (`carasDe`): el título nombra la cara. */
  doble: boolean;
}) {
  const abrir = useAbrirEnDistribucion();
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

  return (
    <div data-participaciones-de-la-cara={`${fixtureId}-${cara}`} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={etiqueta}>{titulo}</span>
        <button
          type="button"
          onClick={() => abrir(fixtureId, cara)}
          style={{ ...boton(false), marginLeft: "auto" }}
          title="Abre el Editor 3D en esta cara, en Distribución"
        >
          <Layers size={12} /> Abrir en Distribución
        </button>
      </div>

      {cargando && !datos && <div style={{ fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>Cargando…</div>}
      {error && <div style={{ fontSize: "var(--t-2xs)", color: "var(--danger)" }}>{error}</div>}

      {datos && !datos.por_participacion && (
        <div style={{ fontSize: "var(--t-2xs)", color: "var(--ink-2)", lineHeight: 1.45 }}>
          En el plano guardado esta cara todavía no se vende por participación: esperá a que se guarde el plano.
        </div>
      )}

      {datos && datos.por_participacion && (
        <>
          {/* La única figura: la barra de capacidad de HOY, con 2 px entre
              segmentos, la leyenda siempre y los rótulos con número. */}
          <div>
            <div
              role="img"
              aria-label={`Hoy: comprometido ${pct(datos.capacidad.hoy_pb)}, queda ${pct(datos.capacidad.disponible_hoy_pb)}`}
              style={{ display: "flex", gap: 2, height: 14, borderRadius: "var(--r-sm)", overflow: "hidden" }}
            >
              {segmentos.map((s) => (
                <div key={s.clave} title={s.rotulo} style={{ flex: `${s.pb} 0 0`, background: relleno(s), minWidth: 2 }} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 6 }}>
              {segmentos.map((s) => (
                <span key={s.clave} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--t-3xs)", color: "var(--ink-2)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: relleno(s), border: "1px solid var(--line)" }} />
                  {s.rotulo}{s.tipo === "reserva" ? " · reserva" : ""}
                </span>
              ))}
            </div>
            <div style={{ fontSize: "var(--t-3xs)", color: "var(--ink-3)", marginTop: 5, fontFamily: "var(--font-mono)" }}>
              Hoy {pct(datos.capacidad.hoy_pb)} comprometido · queda {pct(datos.capacidad.disponible_hoy_pb)}
              {datos.capacidad.periodo.pico_pb > datos.capacidad.hoy_pb && datos.capacidad.periodo.dia_pico
                ? ` · pico ${pct(datos.capacidad.periodo.pico_pb)} el ${fechaCorta(datos.capacidad.periodo.dia_pico, datos.hoy)}`
                : ""}
            </div>
          </div>

          {vivas.length === 0 ? (
            <div style={{ fontSize: "var(--t-2xs)", color: "var(--ink-2)" }}>
              No tiene participaciones vivas. Se cargan en Distribución.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {vivas.map((p) => {
                const t = terminoQueSeMuestra(p, datos.hoy);
                const prov = proveedorDe(p);
                const renovable = terminoParaRenovar(p, datos.hoy);
                return (
                  <div
                    key={p.space_id}
                    style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "7px 9px", display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--t-xs)", color: "var(--ink-1)" }}>
                        {p.numero}
                      </span>
                      <span style={{ fontSize: "var(--t-xs)", color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {prov?.nombre ?? "Sin proveedor"}{t?.marca ? ` · ${t.marca}` : ""}
                      </span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--t-xs)", color: "var(--ink-1)" }}>
                        {pct(p.contratado_pb || t?.puntos_basicos || 0)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-3xs)", color: "var(--ink-3)" }}>
                      {t && <span style={{ fontFamily: "var(--font-mono)" }}>{fechaCorta(t.desde, datos.hoy)} → {fechaCorta(t.hasta, datos.hoy)}</span>}
                      {t && <span>{PALABRA_DEL_TERMINO[t.estado_visible]}</span>}
                      {t?.estado_visible === "reserva" && t.caduca && <span>· caduca el {fechaCorta(t.caduca, datos.hoy)}</span>}
                      {renovable && (
                        <button
                          type="button"
                          onClick={() => abrir(fixtureId, cara, renovable.id)}
                          style={{ ...boton(true), height: 24, marginLeft: "auto" }}
                        >
                          <RefreshCw size={11} /> Renovar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {terminadas > 0 && (
            <div style={{ fontSize: "var(--t-3xs)", color: "var(--ink-3)" }}>
              Y {terminadas} participación{terminadas === 1 ? "" : "es"} que ya no rige{terminadas === 1 ? "" : "n"}: su historia está en Distribución.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "var(--t-2xs)", color: "var(--ink-2)" }}>
              <span style={etiqueta}>Distribución</span>
              <span>{PALABRA_DE_LA_DISTRIBUCION[datos.distribucion?.estado ?? "sin_distribuir"]}</span>
            </div>
            {vivas.length > 0 && (() => {
              let contratado = 0, dibujado = 0, pendiente = 0;
              for (const p of vivas) { contratado += p.contratado_pb; dibujado += p.dibujado_pb; pendiente += p.pendiente_pb; }
              return (
                <span style={{ fontSize: "var(--t-3xs)", fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
                  dibujado {pct(dibujado)} de {pct(contratado)} contratado{pendiente > 0 ? ` · falta ${pct(pendiente)}` : ""}
                </span>
              );
            })()}
          </div>
          {datos.revision.errores.length > 0 && (
            <div style={{ fontSize: "var(--t-2xs)", color: "var(--danger)", lineHeight: 1.45 }}>
              {datos.revision.errores.length} problema{datos.revision.errores.length === 1 ? "" : "s"}: {datos.revision.errores[0].frase}
            </div>
          )}
        </>
      )}
    </div>
  );
}
