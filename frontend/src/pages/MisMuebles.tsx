import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { paletaConPropias } from "../catalogo/editor3D";
import type { ModeloPropio } from "../catalogo/propias";
import { conNombrePropio } from "../catalogo/nombresPropios";
import { useFichasPropias } from "../store/fichasPropias";
import { useFixtureStore } from "../store/fixtureStore";
import { entradaDelTipoDelPlano, familiaDe, formularioDe } from "../utils/formularioDeFicha";
import { AsistenteDeMueble } from "../components/taller/AsistenteDeMueble";
import { MuebleListo } from "../components/taller/MuebleListo";
import { RetirarMueble, retirarOReactivar } from "../components/taller/RetirarMueble";
import { FotografoDeMuebles, dibujoDe, useFoto } from "../components/taller/VistaDeLaFicha";
import { comoSeVendeDe, medidasDe, nombreCortoDe, porDentroDe } from "../components/taller/textos";
import "../muebles.css";

/**
 * Plano › Mis muebles (2026-10-28): los muebles del supermercado que miden
 * otra cosa que el estándar. Lo que era la pestaña «Fichas» del taller, ahora
 * en el menú, al lado del 2D y del 3D, y armado como el planograma: una lista
 * con su foto y un asistente de tres pasos (`AsistenteDeMueble`).
 *
 *   `/plano/muebles`          la lista, con los retirados plegados
 *   `/plano/muebles/nuevo`    el asistente; con `?desde=plano&sede&tipo` viene
 *                             de «Crear un mueble con otras medidas»
 *   `/plano/muebles/<clave>`  editar ese mueble, con los mismos pasos
 *
 * Al guardar uno nuevo, «Listo» lleva al plano con el mueble ya elegido para
 * soltar (`state.colocar`, que lee `FloorPlan2D`). El banco de prueba de la
 * forma, la luz y el producto quedó aparte, en `/taller/banco`.
 */

const BASE = "/plano/muebles";

export default function MisMuebles() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const propias = useFichasPropias();
  const sedeActual = useFixtureStore((s) => s.sede);
  const resto = decodeURIComponent(location.pathname.slice(BASE.length).replace(/^\/+|\/+$/g, ""));
  const desdePlano = params.get("desde") === "plano" ? { sede: params.get("sede") || sedeActual } : null;
  /** Lo que acaba de pasar (guardar cambios, retirar), en la lista. */
  const [aviso, setAviso] = useState<string | null>(() => (location.state as { aviso?: string } | null)?.aviso ?? null);
  useEffect(() => {
    const llega = (location.state as { aviso?: string } | null)?.aviso;
    if (!llega) return;
    setAviso(llega);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);
  /** El mueble recién guardado (el «Listo»), y cuántas veces se empezó otro. */
  const [listo, setListo] = useState<ModeloPropio | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => { setListo(null); }, [resto]);
  /** Editar un mueble que todavía no llegó: se espera un rato a la lista (un
   *  supermercado sin muebles propios la tiene vacía para siempre). */
  const [esperando, setEsperando] = useState(true);
  useEffect(() => {
    setEsperando(true);
    const t = window.setTimeout(() => setEsperando(false), 4000);
    return () => window.clearTimeout(t);
  }, [resto]);

  const alPlano = (colocar?: string) => navigate("/plano", { state: { delTaller: true, ...(colocar ? { colocar } : {}) } });
  const aLaLista = (texto?: string) => navigate(BASE, texto ? { state: { aviso: texto } } : undefined);

  let pantalla;
  if (resto === "nuevo") {
    pantalla = listo ? (
      <MuebleListo ficha={listo} sede={desdePlano?.sede || sedeActual}
        onColocar={() => alPlano(listo.id)}
        onOtro={() => { setListo(null); setVuelta((v) => v + 1); }}
        onVerTodos={() => aLaLista()} />
    ) : (
      <AsistenteDeMueble key={vuelta} editando={null} desdePlano={desdePlano}
        entradaInicial={desdePlano ? entradaDelTipoDelPlano(params.get("tipo")) : undefined}
        onGuardado={setListo} onSalir={() => aLaLista()} onVolverAlPlano={() => alPlano()} onRetirado={aLaLista} />
    );
  } else if (resto) {
    const mueble = propias.find((m) => m.clave === resto);
    pantalla = mueble ? (
      <AsistenteDeMueble key={`${mueble.clave}-${vuelta}`} editando={mueble} desdePlano={desdePlano}
        onGuardado={(f) => aLaLista(`Cambios guardados en «${f.nombre}». Los muebles ya colocados con él no cambian: en su ficha del plano aparece «Usar lo de la ficha».`)}
        onSalir={() => aLaLista()} onVolverAlPlano={() => alPlano()} onRetirado={aLaLista} />
    ) : (
      <div className="mm"><div className="mm-vacio" role="status" data-mueble-no-esta>
        <p>{propias.length || !esperando ? "Ese mueble no está en Mis muebles." : "Buscando el mueble…"}</p>
        <button type="button" className="mm-bt" onClick={() => aLaLista()}>Ver Mis muebles</button>
      </div></div>
    );
  } else {
    pantalla = <ListaDeMuebles propias={propias} aviso={aviso} onAviso={setAviso}
      onCrear={() => navigate(`${BASE}/nuevo`)} onEditar={(m) => navigate(`${BASE}/${encodeURIComponent(m.clave)}`)}
      onBanco={() => navigate("/taller/banco")} />;
  }
  return (
    <>
      {pantalla}
      <FotografoDeMuebles />
    </>
  );
}

function ListaDeMuebles({ propias, aviso, onAviso, onCrear, onEditar, onBanco }: {
  propias: readonly ModeloPropio[];
  aviso: string | null;
  onAviso: (t: string | null) => void;
  onCrear: () => void;
  onEditar: (m: ModeloPropio) => void;
  onBanco: () => void;
}) {
  const vigentes = useMemo(() => propias.filter((m) => !m.retirado), [propias]);
  const retirados = useMemo(() => propias.filter((m) => m.retirado), [propias]);
  const [retirando, setRetirando] = useState<ModeloPropio | null>(null);
  const reactivar = async (m: ModeloPropio) => {
    try { onAviso(await retirarOReactivar(m)); }
    catch (e) { onAviso((e as Error).message); }
  };
  return (
    <div className="mm" data-mis-muebles-lista>
      <div className="mm-h">
        <nav className="mm-miga" aria-label="Dónde estás"><span>Plano</span><span aria-hidden>›</span></nav>
        <h1>Mis muebles</h1>
        <span className="mm-h-der">
          <button type="button" className="mm-bt chico" onClick={onBanco} data-banco-de-prueba
            title="Para RECABRA: probar artes, envases y la luz sobre un mueble">Banco de prueba</button>
          <button type="button" className="btn-principal mm-principal" onClick={onCrear} data-crear-mueble-nuevo>
            <Plus size={16} strokeWidth={2} aria-hidden /> Crear un mueble
          </button>
        </span>
      </div>
      <div className="mm-lista">
        <p className="mm-sub">
          Los muebles con tus medidas. Cada uno aparece en el catálogo del plano, en «Mis muebles», para colocarlo.
        </p>
        {aviso && <p className="mm-aviso" role="status" data-aviso-ficha>{aviso}</p>}
        <div className="mm-grilla" data-lista-fichas>
          {vigentes.map((m) => <TarjetaDeMueble key={m.clave} m={m} onEditar={() => onEditar(m)} onRetirar={() => setRetirando(m)} />)}
          <div className="mm-nuevo">
            <b>{vigentes.length ? "¿Otro mueble con otras medidas?" : "¿Tenés un mueble con otras medidas?"}</b>
            <span>
              {vigentes.length === 0 && (retirados.length > 0
                ? "Ninguno vigente: los retirados están acá abajo. "
                : "Todavía no armaste ninguno. ")}
              Armalo una vez en tres pasos: qué es, cuánto mide y cómo se llama.
            </span>
            <button type="button" className="mm-bt" onClick={onCrear}><Plus size={15} strokeWidth={2} aria-hidden /> Crear un mueble</button>
          </div>
        </div>
        <details className="mm-mas" data-retiradas>
          <summary>
            Retirados ({retirados.length}): los que ya no se ofrecen en el plano. Lo colocado con ellos sigue igual.
          </summary>
          {retirados.length > 0 && (
            <ul className="mm-retirados">
              {retirados.map((m) => (
                <li key={m.clave} data-ficha-propia={m.clave}>
                  <span><b>{m.nombre}</b> <span className="mm-med">{medidasDe(m)}</span></span>
                  <button type="button" className="mm-bt chico" data-retirar={m.clave} onClick={() => void reactivar(m)}>Reactivar</button>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
      {retirando && (
        <RetirarMueble mueble={retirando} onCerrar={() => setRetirando(null)}
          onRetirado={(t) => { setRetirando(null); onAviso(t); }} />
      )}
    </div>
  );
}

/** Un mueble de la lista, con su foto, sus medidas y cómo se vende. */
function TarjetaDeMueble({ m, onEditar, onRetirar }: { m: ModeloPropio; onEditar: () => void; onRetirar: () => void }) {
  const propias = useFichasPropias();
  const paleta = useMemo(() => paletaConPropias(propias), [propias]);
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const form = useMemo(() => formularioDe(m), [m]);
  const fixture = useMemo(() => dibujoDe(form, paleta)?.fixture ?? null, [form, paleta]);
  const clave = `mueble:${m.id}:${m.w}x${m.d}x${m.h}:${m.entrepanos ?? ""}:${m.modulo ?? ""}:${JSON.stringify(m.partes ?? {})}`;
  const foto = useFoto(clave, fixture);
  const familia = familiaDe(form.entrada);
  const adentro = porDentroDe(m);
  const nombreFamilia = familia ? conNombrePropio({ type: familia.tipo, gondolaType: familia.variante }, nombresPropios, nombreCortoDe(familia)) : m.tipo;
  return (
    <div className="mm-mio" data-ficha-propia={m.clave}>
      <span className="foto">{foto ? <img src={foto} alt={`${m.nombre}, en 3D`} /> : <span className="cargando" aria-hidden />}</span>
      <div className="d">
        <b>{m.fuente.confiabilidad === "estimado" ? "≈ " : ""}{m.nombre}</b>
        <span className="mm-med">{medidasDe(m)}{adentro ? ` · ${adentro}` : ""}</span>
        <span className="como">{nombreFamilia} · {comoSeVendeDe(m, familia)}</span>
      </div>
      <div className="acc">
        <button type="button" className="mm-bt chico" onClick={onEditar} data-editar={m.clave}>Editar</button>
        <button type="button" className="mm-bt chico" onClick={onRetirar} data-retirar={m.clave}>Retirar</button>
      </div>
    </div>
  );
}
