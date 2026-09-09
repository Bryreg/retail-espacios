import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Loader2, Printer, RefreshCw } from "lucide-react";
import {
  bloqueoDeRenumeracion,
  renumeracionAplicar,
  renumeracionPrevio,
  type RenumeracionBloqueada,
} from "../api/layout";
import { describeError } from "../api/client";
import {
  contar,
  contarTodo,
  contratosEnJuego,
  porBanda,
  resumenDeLoQueSeEscribe,
  textoDelRecorrido,
  type Conteo,
  type Renumeracion,
  type SedeRenumerada,
} from "../utils/renumeracion";
import { useFixtureStore } from "../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../store/authStore";

/**
 * `/renumerar` — la pantalla con la que el dueño renumera sus sedes.
 *
 * ES LA HIGIENE DEL PLANO, y por eso se entra desde donde vive la higiene del
 * plano: el botón «Renumerar» de la barra del plano 2D, al lado de «Revisar»,
 * y el enlace del pie del panel de revisión. Las dos cosas responden a la misma
 * pregunta —«¿está bien el plano?»— y la segunda es la única que además lo
 * arregla.
 *
 * POR QUÉ ES UNA RUTA Y NO UN PANEL DEL PLANO. Porque la mitad de su valor está
 * en el papel: el dueño lo imprime, camina la tienda y tacha renglón por
 * renglón contra la cartelería. Un panel lateral del plano —`position: fixed`,
 * adentro de una rejilla con `overflow: hidden`— se imprime UNA vez, tapado y
 * cortado en la primera hoja: los navegadores no paginan lo que está fijo. Una
 * página entera pagina bien, repite la cabecera de la tabla en cada hoja y sale
 * en A4 sin una sola línea de la aplicación alrededor. La forma sigue al uso.
 *
 * DOS PASOS, como la carga masiva y por la misma razón: el previo NO escribe una
 * sola fila y muestra el antes → después completo; aplicar escribe. Una
 * renumeración a ciegas que sale mal no se deshace con un botón.
 *
 * Y LA CUENTA SE HACE ACÁ, cruzando el informe del servidor contra el plano que
 * este navegador ya tiene dibujado (y, después de aplicar, contra el plano
 * vuelto a bajar). La promesa fue «ningún mueble se agrega ni se borra»; una
 * promesa que sólo se puede comprobar creyéndole al que la hizo no es una
 * promesa. Ver `utils/renumeracion.ts`.
 */

type Paso = "cargando" | "informe" | "aplicando" | "aplicado";

/** La fecha del papel. Va con hora: dos corridas del mismo día son dos papeles
 *  distintos, y el que camina la tienda tiene que saber cuál está mirando. */
const ahora = () =>
  new Date().toLocaleString("es-CO", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

/** Los ids de los muebles de cada sede, tal como los tiene ESTE navegador. Es
 *  la fuente independiente contra la que se cuenta. */
function idsPorSede(fixturesBySede: Record<string, { id: string }[]>): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const [sede, muebles] of Object.entries(fixturesBySede)) {
    salida[sede] = (muebles ?? []).map((m) => m.id);
  }
  return salida;
}

export default function Renumerar() {
  const navigate = useNavigate();
  const esAdmin = useAuthStore(selectIsAdmin);
  const sedes = useFixtureStore((s) => s.sedes);
  const flushPending = useFixtureStore((s) => s.flushPending);
  const syncFromServer = useFixtureStore((s) => s.syncFromServer);

  const [paso, setPaso] = useState<Paso>("cargando");
  const [alcance, setAlcance] = useState<string>("");   // "" = todas
  const [informe, setInforme] = useState<Renumeracion | null>(null);
  const [error, setError] = useState<string>("");
  const [bloqueo, setBloqueo] = useState<RenumeracionBloqueada | null>(null);

  /** El plano tal como estaba cuando se pidió el previo. Congelado a propósito:
   *  después de aplicar, `fixturesBySede` ya es el de DESPUÉS, y comparar el
   *  después contra sí mismo no prueba nada. */
  const [antes, setAntes] = useState<Record<string, string[]>>({});
  const [despues, setDespues] = useState<Record<string, string[]> | null>(null);

  const generado = useRef<string>("");

  /** Número del pedido en vuelo. Cada cálculo son tres viajes al servidor
   *  (subir lo pendiente, bajar el plano, calcular), así que dos pedidos se
   *  pisan de verdad: cambiar el alcance dos veces seguidas, o —lo grave— un
   *  previo que estaba en camino cuando terminó el APLICAR y que llega después
   *  y borra el cartel de «Aplicado». Quien no es el último pedido, se calla. */
  const pedido = useRef(0);

  const pedirPrevio = useCallback(async (sede: string) => {
    const mio = ++pedido.current;
    setPaso("cargando");
    setError("");
    setBloqueo(null);
    setDespues(null);
    try {
      // Lo que este navegador tenga sin subir se sube ANTES de calcular: el
      // servidor renumera lo que él tiene guardado, y un mueble movido hace diez
      // segundos que todavía está en la cola de guardado saldría del informe con
      // la coordenada vieja — o directamente no saldría.
      await flushPending();
      // Y se vuelve a bajar, para que la cuenta compare el informe contra un
      // plano que está al día. Sigue siendo una fuente independiente —es otro
      // endpoint y otro camino de código: `GET /layout/` devuelve lo guardado,
      // el previo lo recalcula— pero deja de haber alarmas falsas por un caché
      // viejo.
      await syncFromServer();
      const datos = await renumeracionPrevio(sede ? [sede] : null);
      if (mio !== pedido.current) return;
      setAntes(idsPorSede(useFixtureStore.getState().fixturesBySede));
      setInforme(datos);
      generado.current = ahora();
      setPaso("informe");
    } catch (err) {
      if (mio !== pedido.current) return;
      const b = bloqueoDeRenumeracion(err);
      if (b) setBloqueo(b);
      else setError(describeError(err, "No se pudo calcular la renumeración."));
      setInforme(null);
      setPaso("informe");
    }
  }, [flushPending, syncFromServer]);

  useEffect(() => {
    if (!esAdmin) return;
    void pedirPrevio("");
    // Sólo al entrar: el cambio de alcance lo dispara el selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin]);

  const aplicar = async () => {
    if (!informe) return;
    // Aplicar gana: cualquier previo que estuviera en camino queda invalidado.
    ++pedido.current;
    setPaso("aplicando");
    setError("");
    setBloqueo(null);
    try {
      const datos = await renumeracionAplicar(alcance ? [alcance] : null);
      // El plano del servidor cambió: sin este pull el caché local se queda con
      // los códigos viejos y la próxima edición los vuelve a subir, deshaciendo
      // lo que se acaba de hacer. Además es la tercera fuente de la cuenta: los
      // ids DESPUÉS salen de acá y no del informe.
      await syncFromServer();
      setDespues(idsPorSede(useFixtureStore.getState().fixturesBySede));
      setInforme(datos);
      // La hora del papel pasa a ser la del APLICAR, no la del cálculo: es la
      // fecha en que la tienda y el plano dejaron de decir lo mismo, y es la
      // que hay que poder mirar dentro de tres meses.
      generado.current = ahora();
      setPaso("aplicado");
    } catch (err) {
      const b = bloqueoDeRenumeracion(err);
      if (b) setBloqueo(b);
      else setError(describeError(err, "No se pudo aplicar la renumeración."));
      setPaso("informe");
    }
  };

  const total: Conteo | null = useMemo(
    () => (informe ? contarTodo(informe, antes, despues) : null),
    [informe, antes, despues],
  );

  if (!esAdmin) {
    return (
      <div className="renum">
        <div className="renum-barra">
          <button className="renum-btn" onClick={() => navigate("/")}>
            <ArrowLeft size={13} /> Volver
          </button>
          <h1>Renumerar el plano</h1>
        </div>
        <div className="renum-hoja">
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>
            Renumerar cambia el nombre de cada mueble de cada sede y mueve con él los
            contratos y los montajes. Es de administrador.
          </p>
        </div>
      </div>
    );
  }

  const ocupado = paso === "cargando" || paso === "aplicando";
  const cambian = informe?.cambian ?? 0;

  return (
    <div className="renum">
      {/* ── Los controles. No se imprimen. ──────────────────────────────── */}
      <div className="renum-barra renum-noimprime">
        <button className="renum-btn" onClick={() => navigate("/")} disabled={paso === "aplicando"}>
          <ArrowLeft size={13} /> Volver al plano
        </button>
        <h1>Renumerar el plano</h1>

        <div className="der">
          <label style={{ fontSize: "var(--t-2xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
            Alcance
            <select
              className="renum-select"
              value={alcance}
              disabled={ocupado}
              onChange={(e) => { setAlcance(e.target.value); void pedirPrevio(e.target.value); }}
            >
              <option value="">Todas las sedes</option>
              {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <button
            className="renum-btn"
            onClick={() => void pedirPrevio(alcance)}
            disabled={ocupado}
            title="Volver a calcular contra lo que el servidor tiene guardado ahora"
          >
            <RefreshCw size={13} /> Volver a calcular
          </button>

          <button
            className="renum-btn"
            onClick={() => window.print()}
            disabled={!informe || ocupado}
            title="Imprimir el informe: es lo que se camina en la tienda"
          >
            <Printer size={13} /> Imprimir
          </button>

          {/* LA ÚNICA acción principal de la pantalla, y el único amarillo. En
              el paso del previo el botón escribe; una vez aplicado desaparece,
              porque volver a apretarlo no haría nada (es idempotente) y un
              botón que no hace nada enseña a desconfiar de los que sí. */}
          {paso !== "aplicado" && (
            <button
              className="btn-principal renum-btn-principal"
              onClick={() => void aplicar()}
              disabled={ocupado || !informe || cambian === 0}
              title={
                !informe ? "No hay informe: el cálculo no llegó a terminar"
                  : cambian === 0 ? "No hay nada que cambiar"
                    : "Escribe la renumeración"
              }
            >
              {paso === "aplicando"
                ? <Loader2 size={14} style={{ animation: "spin .9s linear infinite" }} />
                : <Check size={14} />}
              {/* Las tres razones para que no se pueda apretar son distintas y
                  el botón las dice: sin informe (el servidor se negó o falló),
                  con informe pero sin nada que cambiar, y el caso normal. Decir
                  «Nada que aplicar» cuando el servidor acaba de rechazar el
                  cálculo haría creer que el plano está bien. */}
              {paso === "aplicando"
                ? "Aplicando…"
                : !informe
                  ? "No se puede aplicar"
                  : cambian === 0
                    ? "Nada que aplicar"
                    : `Aplicar: renombrar ${cambian} muebles`}
            </button>
          )}
        </div>
      </div>

      {/* ── El documento ───────────────────────────────────────────────── */}
      <div className="renum-hoja">
        <div className="renum-portada">
          <h2>Renumeración del plano</h2>
          <p>
            El nombre de un mueble es su código, y hay uno solo. Acá el sistema lo
            reasigna siguiendo el recorrido del plano, de modo que caminar la tienda y
            leer los números vayan en el mismo orden. <b>Ningún mueble se agrega ni se
            borra y no se mueve una sola coordenada</b>: lo único que cambia es cómo se
            llama.
          </p>
          <p>
            Este informe es lo que hay que llevar a la tienda: cada renglón dice cómo se
            llamaba el mueble, cómo lo dibujaba el plano y cómo se llama ahora. Con eso se
            reconcilia la cartelería de la góndola, que no se entera sola.
          </p>
        </div>

        {/* El estado, que es lo único que no se puede leer mal sin consecuencias. */}
        {informe && (
          <div className={`renum-estado ${informe.aplicado ? "es-aplicado" : "es-previo"}`}>
            {informe.aplicado ? <Check size={15} /> : <AlertTriangle size={15} />}
            <span>
              {informe.aplicado ? (
                <>
                  <b>Aplicado.</b> Los nombres de abajo ya son los del sistema. Los
                  espacios, sus contratos y las confirmaciones de montaje se mudaron con su
                  mueble, todo dentro de una misma transacción.{" "}
                  <b>Falta la tienda</b>: imprimí esto y cambiá la cartelería.
                </>
              ) : (
                <>
                  <b>Previo: no se escribió nada todavía.</b> Esto es lo que va a pasar si
                  se aplica. {resumenDeLoQueSeEscribe(informe)}
                </>
              )}
            </span>
          </div>
        )}

        {/* Lo que el servidor se negó a hacer, con los motivos uno por uno. */}
        {bloqueo && (
          <div className="renum-estado es-roto">
            <AlertTriangle size={15} />
            <span>
              <b>{bloqueo.message}</b> No se escribió nada.
              <ul style={{ margin: "6px 0 0", paddingLeft: "1.1em" }}>
                {[...(bloqueo.motivos ?? []), ...(bloqueo.fallas ?? [])].map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </span>
          </div>
        )}
        {error && (
          <div className="renum-estado es-roto">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {paso === "cargando" && (
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={14} style={{ animation: "spin .9s linear infinite" }} />
            Calculando el recorrido de cada sede…
          </p>
        )}

        {/* ── La promesa, comprobable ─────────────────────────────────── */}
        {informe && total && <Cuenta conteo={total} titulo="Todas las sedes del informe" />}

        {informe?.sedes.map((sede) => (
          <SedeInforme
            key={sede.sede}
            sede={sede}
            conteo={contar(sede, antes[sede.sede] ?? [], despues ? (despues[sede.sede] ?? []) : null)}
          />
        ))}

        {informe && (
          <div className="renum-pie">
            RECABRA · Renumeración del plano ·{" "}
            {informe.aplicado
              ? `APLICADO el ${generado.current}`
              : `PREVIO, sin escribir · calculado el ${generado.current}`}
            {" · "}{informe.muebles} muebles en {informe.sedes.length} sede
            {informe.sedes.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── La cuenta ───────────────────────────────────────────────────────────────

/** El conteo antes → después, escrito en la pantalla y en el papel.
 *
 *  No es decoración ni un resumen amable: es la promesa que se le hizo al dueño
 *  —«ningún mueble se agrega ni se borra»— puesta donde él la pueda comprobar.
 *  Los números salen de fuentes distintas (el plano de este navegador, el
 *  informe del servidor y, si ya se aplicó, el plano vuelto a bajar), así que
 *  que coincidan quiere decir algo. */
function Cuenta({ conteo, titulo }: { conteo: Conteo; titulo: string }) {
  const problemas = [
    ...conteo.faltan.map((id) => `no aparece en el informe: ${id}`),
    ...conteo.sobran.map((id) => `aparece y no estaba en el plano: ${id}`),
    ...conteo.perdidos.map((id) => `estaba antes y ya no está: ${id}`),
    ...conteo.aparecidos.map((id) => `apareció después: ${id}`),
    ...conteo.repetidos.map((n) => `dos muebles quedarían llamándose ${n}`),
  ];
  return (
    <div className={`renum-cuenta${conteo.ok ? "" : " es-roto"}`} aria-label={titulo}>
      <div className="renum-dato">
        <span className="rotulo">En el plano</span>
        <span className="valor">{conteo.comparable ? conteo.enElPlano : "—"}</span>
      </div>
      <div className="renum-dato">
        <span className="rotulo">En el informe</span>
        <span className={`valor ${!conteo.comparable ? "" : conteo.enElPlano === conteo.enElInforme ? "ok" : "mal"}`}>
          {conteo.enElInforme}
        </span>
      </div>
      <div className="renum-dato">
        <span className="rotulo">Después</span>
        <span className={`valor ${conteo.despues === null || !conteo.comparable ? "" : conteo.despues === conteo.enElPlano ? "ok" : "mal"}`}>
          {conteo.despues === null ? "—" : conteo.despues}
        </span>
      </div>
      <div className="renum-dato">
        <span className="rotulo">Se agregan</span>
        <span className={`valor ${!conteo.comparable ? "" : conteo.sobran.length + conteo.aparecidos.length === 0 ? "ok" : "mal"}`}>
          {conteo.comparable ? conteo.sobran.length + conteo.aparecidos.length : "—"}
        </span>
      </div>
      <div className="renum-dato">
        <span className="rotulo">Se borran</span>
        <span className={`valor ${!conteo.comparable ? "" : conteo.faltan.length + conteo.perdidos.length === 0 ? "ok" : "mal"}`}>
          {conteo.comparable ? conteo.faltan.length + conteo.perdidos.length : "—"}
        </span>
      </div>
      <div className="renum-dato">
        <span className="rotulo">Cambian de nombre</span>
        <span className="valor">{conteo.cambian}</span>
      </div>
      <div className="renum-dato">
        <span className="rotulo">Quedan igual</span>
        <span className="valor">{conteo.iguales}</span>
      </div>
      {!conteo.comparable && (
        <div style={{ gridColumn: "1 / -1", fontSize: "var(--t-xs)", color: "var(--ink-3)", lineHeight: 1.55 }}>
          Este navegador no tiene el plano de esa sede descargado, así que la cuenta de
          agregados y borrados no se pudo comprobar contra una segunda fuente. Volvé a
          calcular con el plano abierto.
        </div>
      )}
      {problemas.length > 0 && (
        <div style={{ gridColumn: "1 / -1", fontSize: "var(--t-xs)", color: "var(--danger)", lineHeight: 1.55 }}>
          <b>Esto no cierra y hay que mirarlo antes de aplicar:</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: "1.1em" }}>
            {problemas.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Una sede ────────────────────────────────────────────────────────────────

function SedeInforme({ sede, conteo }: { sede: SedeRenumerada; conteo: Conteo }) {
  const bandas = useMemo(() => porBanda(sede), [sede]);
  const contratos = contratosEnJuego(sede);
  // Los renglones en el orden del recorrido, cada uno sabiendo si su corrida va
  // sombreada o no. El sombreado alterna por CORRIDA, no por renglón: la franja
  // dice «estos cinco son el mismo pasillo», que es lo que se camina.
  const filas = bandas.flatMap((b, i) => b.filas.map((f) => ({ fila: f, par: i % 2 === 1 })));

  return (
    <section className="renum-sede">
      <h3>{sede.sede}</h3>
      <p className="nota">
        {textoDelRecorrido(sede)} Eje elegido: {sede.motivo_eje}.
      </p>

      <Cuenta conteo={conteo} titulo={`Conteo de ${sede.sede}`} />

      <div className="renum-tabla-caja">
        <table className="renum-tabla">
          <thead>
            {/* Se repite en cada hoja impresa. En pantalla está escondido: el
                `<h3>` de arriba ya dice la sede. */}
            <tr className="fila-sede">
              <th colSpan={9}>
                <b>{sede.sede}</b> · {sede.muebles} muebles · {sede.cambian} cambian de
                nombre · 0 se agregan · 0 se borran
              </th>
            </tr>
            <tr>
              <th style={{ width: "5%" }}>✓</th>
              <th style={{ width: "6%" }}>Corrida</th>
              <th>Antes</th>
              <th>Se leía</th>
              <th>Ahora</th>
              <th style={{ width: "7%" }}>Cambia</th>
              <th style={{ width: "8%", textAlign: "right" }}>X</th>
              <th style={{ width: "8%", textAlign: "right" }}>Z</th>
              <th>Mueble</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ fila: f, par }) => (
              <tr
                key={f.id}
                className={`${f.cambia ? "cambia" : "igual"}${par ? " banda-par" : ""}`}
              >
                <td><span className="renum-tilde" /></td>
                <td className="num">{f.banda}</td>
                <td className="cod viejo">{f.antes}</td>
                <td className="cod viejo">{f.se_leia}</td>
                <td className="cod nuevo">{f.ahora}</td>
                <td className="marca">{f.cambia ? "sí" : "—"}</td>
                <td className="num">{f.cx.toFixed(2)}</td>
                <td className="num">{f.cz.toFixed(2)}</td>
                <td className="mueble">{f.etiqueta || f.tipo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sede.nomenclaturas_borradas > 0 && (
        <div className="renum-anexo">
          <h4>Nombres escritos a mano que se descartan</h4>
          {sede.nomenclaturas_borradas} mueble{sede.nomenclaturas_borradas === 1 ? "" : "s"} tenía
          {sede.nomenclaturas_borradas === 1 ? "" : "n"} un nombre puesto a mano encima del
          código. Ese segundo nombre desaparece: el nombre del mueble pasa a ser su código, y
          hay uno solo. La columna «Se leía» guarda lo que el plano dibujaba, que es lo que
          todavía dice el cartel de la góndola.
        </div>
      )}

      {sede.espacios.length > 0 && (
        <div className="renum-anexo">
          <h4>
            Espacios que se mudan con su mueble ({sede.espacios.length}
            {contratos > 0 ? ` · ${contratos} contrato${contratos === 1 ? "" : "s"} vigente${contratos === 1 ? "" : "s"}` : ""}
            {sede.montajes > 0 ? ` · ${sede.montajes} montaje${sede.montajes === 1 ? "" : "s"}` : ""})
          </h4>
          <ul>
            {sede.espacios.map((e) => (
              <li key={e.space_id}>
                <code>{e.antes}</code> → <code>{e.ahora}</code>
                {e.contratos > 0 && ` · ${e.contratos} contrato${e.contratos === 1 ? "" : "s"} vigente${e.contratos === 1 ? "" : "s"}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sede.avisos.length > 0 && (
        <div className="renum-anexo es-aviso">
          <h4>Para mirar a mano</h4>
          <ul>
            {sede.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
