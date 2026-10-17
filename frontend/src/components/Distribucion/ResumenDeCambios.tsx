import { useMemo, useState } from "react";
import { planoAlDia, useDistribucionStore } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import { desdeElServidor, diferencias, revisarZonas } from "../../utils/edicionDeZonas";
import { pct, type Problema } from "../../utils/participaciones";
import {
  BOTON, Dialogo, datosDeLaCara, irAlProblema, nombreDeParticipacion, useRevisionEnVivo,
} from "./LeyendaDeParticipaciones";

/**
 * «Qué cambia al confirmar» (§9.3 del diseño de participaciones): antes de
 * confirmar la distribución de una cara, por participación, lo dibujado antes
 * y después («dibujado 20 % → 24,1 %») y las zonas agregadas, borradas o
 * cambiadas; los errores, que BLOQUEAN («Hay 2 problemas: corregilos o guardá
 * como borrador.»), los avisos y, después de traer lo de otra sesión, los
 * conflictos con «Usar lo mío». La cuenta de antes es la de la capa
 * confirmada, juzgada como la juzga el servidor al leerla.
 *
 * Con un error del servidor (409 `distribucion_invalida`: se guardó como
 * borrador; `version_vieja`: otra sesión guardó en el medio) el diálogo no se
 * cierra: dice qué pasó y qué hacer, y nada de lo dibujado se pierde.
 */

/** Los conflictos de la fusión de tres vías (§9.8): en cada uno quedó lo de la
 *  otra sesión; «Usar lo mío» lo cambia por lo que había acá. */
export function ConflictosDeLaFusion() {
  const fusion = useDistribucionStore((s) => s.fusion);
  const datos = useDistribucionStore((s) => s.datos);
  const modo = useDistribucionStore((s) => s.edicion.modo);
  if (!fusion || fusion.conflictos.length === 0 || !datos) return null;
  const d = datosDeLaCara(datos);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dark-line-2 px-2.5 py-2" data-conflictos>
      {fusion.conflictos.map((s) => {
        const p = d.porSpace.get(s);
        return (
          <div key={s} className="flex items-start gap-2 text-[11px] leading-snug text-dark-ink-2">
            <p className="flex-1">
              La otra sesión también cambió la participación <b className="text-dark-ink-1">{p ? nombreDeParticipacion(p) : s}</b>:
              quedó lo de la otra sesión.
            </p>
            <button type="button" className={BOTON} disabled={modo !== "editar"}
              title={modo !== "editar" ? "Pasá a «Editar» para usar lo tuyo." : "Volver a tus zonas de esta participación"}
              onClick={() => useDistribucionStore.getState().usarLoMio(s)}>
              Usar lo mío
            </button>
          </div>
        );
      })}
    </div>
  );
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function ResumenDeCambios({ onCerrar }: { onCerrar: () => void }) {
  const datos = useDistribucionStore((s) => s.datos);
  const activa = useDistribucionStore((s) => s.activa);
  const zonas = useDistribucionStore((s) => s.edicion.zonas);
  const guardado = useDistribucionStore((s) => s.guardado);
  const mueble = useFixtureStore((s) => (activa ? (s.fixturesBySede[activa.sede] ?? selectFixtures(s)).find((f) => f.id === activa.fixtureId) ?? null : null));
  const rev = useRevisionEnVivo();
  const [mandando, setMandando] = useState(false);
  const [intento, setIntento] = useState(false);

  const resumen = useMemo(() => {
    if (!datos?.superficie || !rev) return null;
    const sup = datos.superficie;
    const confirmada = datos.distribucion?.confirmada ?? [];
    const antes = revisarZonas(desdeElServidor(confirmada),
      { exclusiones: sup.exclusiones, ancho: sup.ancho, alto: sup.alto, orientacion: sup.orientacion },
      datosDeLaCara(datos).terminosPorS, datos.hoy, { confirmada: true });
    return diferencias(confirmada, zonas, antes.juicio.cuentas, rev.juicio.cuentas);
  }, [datos, zonas, rev]);

  if (!datos || !activa) return null;
  const d = datosDeLaCara(datos);
  const errores: Problema[] = rev?.juicio.errores ?? [];
  const avisos: Problema[] = rev?.juicio.avisos ?? [];
  const alDia = planoAlDia(datos, mueble);
  const enTopes = rev?.enLosTopes ?? true;
  const bloqueado = errores.length > 0 || !enTopes || !alDia || mandando || guardado.estado === "version_vieja";

  async function confirmar() {
    setMandando(true);
    setIntento(true);
    await useDistribucionStore.getState().confirmar();
    setMandando(false);
    const g = useDistribucionStore.getState().guardado;
    if (g.estado === "quieto" && !g.mensaje) onCerrar();
  }

  async function comoBorrador() {
    setMandando(true);
    const ok = await useDistribucionStore.getState().guardarBorrador(false);
    setMandando(false);
    if (ok) onCerrar();
  }

  const verEnElLienzo = (p: Problema) => { irAlProblema(p); onCerrar(); };
  const estadoAntes = datos.distribucion?.estado ?? "sin_distribuir";

  return (
    <Dialogo titulo={`Qué cambia al confirmar · ${activa.codigo} · cara ${activa.cara}`} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="flex flex-col gap-3 text-xs text-dark-ink-2">
        {resumen && resumen.hayCambios ? (
          <ul className="flex flex-col gap-1.5" data-cambios>
            {resumen.participaciones.map((c) => {
              const p = d.porSpace.get(c.spaceId);
              const zonasQueCambian = [
                c.agregadas ? plural(c.agregadas, "zona agregada", "zonas agregadas") : "",
                c.borradas ? plural(c.borradas, "zona borrada", "zonas borradas") : "",
                c.cambiadas ? plural(c.cambiadas, "zona cambiada", "zonas cambiadas") : "",
              ].filter(Boolean).join(" · ");
              return (
                <li key={c.spaceId} className="rounded-md border border-dark-line px-2.5 py-1.5">
                  <p className="font-semibold text-dark-ink-1">{p ? nombreDeParticipacion(p) : `Participación (espacio ${c.spaceId})`}</p>
                  <p>Dibujado {pct(c.dibujadoAntes)} → <b className="text-dark-ink-1">{pct(c.dibujadoDespues)}</b>
                    {p && <> · contratado {pct(p.contratado_pb)}</>}</p>
                  {zonasQueCambian && <p className="text-dark-ink-3">{zonasQueCambian}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p data-cambios>
            No cambia ninguna zona respecto de lo confirmado.
            {estadoAntes === "para_revisar" && " Se vuelve a confirmar como está, y la distribución deja de estar para revisar."}
            {estadoAntes === "sin_distribuir" && " La cara queda confirmada sin zonas."}
          </p>
        )}

        {!enTopes && (
          <p role="alert" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>
            Hay demasiadas zonas o puntos: hasta 60 zonas y 240 puntos por cara. Uní o simplificá algunas.
          </p>
        )}
        {!alDia && (
          <p role="alert" style={{ color: "rgb(var(--entra-txt-rgb))" }}>
            El plano tiene cambios sin guardar: esperá un momento y volvé a intentar.
          </p>
        )}

        {errores.length > 0 && (
          <div role="alert">
            <p className="font-semibold" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>
              {errores.length === 1 ? "Hay 1 problema" : `Hay ${errores.length} problemas`}: corregilos o guardá como borrador.
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {errores.map((p, i) => (
                <li key={i}>
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => verEnElLienzo(p)}
                    style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>
                    ⚠ {p.frase}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {avisos.length > 0 && (
          <div>
            <p className="font-semibold text-dark-ink-1">Avisos (no frenan la confirmación)</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {avisos.map((p, i) => (
                <li key={i}>
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => verEnElLienzo(p)}>
                    · {p.frase}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ConflictosDeLaFusion />

        {intento && guardado.mensaje && (
          <div role="alert" className="rounded-md border px-2.5 py-2"
            style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" }}>
            <p>{guardado.mensaje}</p>
            {guardado.estado === "version_vieja" && (
              <p className="mt-1 text-dark-ink-2">
                Tocá «Traer lo nuevo»: se combina con lo tuyo por participación y no se pierde nada.
              </p>
            )}
            {guardado.estado === "error" && <p className="mt-1 text-dark-ink-2">Tu trabajo sigue acá: probá de nuevo en un momento.</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-dark-line pt-3">
          <button type="button" className={BOTON} onClick={onCerrar} disabled={mandando}>Volver</button>
          {guardado.estado === "version_vieja" && (
            <button type="button" className={BOTON} disabled={mandando}
              onClick={() => { void useDistribucionStore.getState().traerLoNuevo(); }}>
              Traer lo nuevo
            </button>
          )}
          {errores.length > 0 && (
            <button type="button" className={BOTON} disabled={mandando || !enTopes || guardado.estado === "version_vieja"} onClick={() => void comoBorrador()}>
              Guardar como borrador
            </button>
          )}
          <button type="button" className="btn-principal rounded-md px-3 py-1.5 text-xs" disabled={bloqueado} onClick={() => void confirmar()}>
            {mandando ? "Confirmando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
