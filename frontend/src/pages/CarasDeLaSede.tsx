import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, RotateCcw, Shapes } from "lucide-react";
import { describeError } from "../api/client";
import { leerCaras, type CaraDeLaSede, type EstadoDeMontaje } from "../api/planogramas";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import { useFixtureStore } from "../store/fixtureStore";
import { usePlanograma } from "../store/planogramaStore";
import { comoEstaLaCara, contarCaras, filtrarCaras, type FiltroDeCaras } from "../utils/planograma";
import "../caras.css";

/**
 * Plano › Caras (dibujo aprobado por el dueño, 2026-10-29: «¿desde dónde
 * entro o llevo control de la distribución de los muebles no
 * comercializables?»). Todas las caras de la sede en una lista
 * (`GET /api/planogramas/caras`): arriba cuántas faltan repartir, cuántas
 * están en curso, cuántas piden revisión y cuántas están listas; abajo una
 * fila por cara con qué va, su estado, cómo va su montaje y UN botón que abre
 * la cara («Distribuir la cara», «Seguir y publicar», «Nueva versión»…). Al
 * salir de la cara la lista se vuelve a leer.
 *
 * Arranca con los muebles que no se venden; «Lo libre» muestra lo que queda
 * sin vender de los que sí (sólo administración, como todo lo comercial).
 * «Sin repartir» vive acá y no en Pendientes: el primer día serían todas.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

const MONTAJE: Record<EstadoDeMontaje, string> = {
  no_rige: "Todavía no rige",
  sin_montar: "Sin montar",
  por_revisar: "Montada · falta revisar",
  no_se_pudo: "No se pudo montar",
  coincide: "Montada · coincide",
  no_coincide: "No coincide",
  sin_registro: "—",
};

type Grupo = "falta" | "en_curso" | "para_revisar" | "lista" | null;

const FILTROS: { f: FiltroDeCaras; texto: string }[] = [
  { f: "internas", texto: "No se venden" },
  { f: "lo_libre", texto: "Lo libre de las que se venden" },
  { f: "todas", texto: "Todas" },
];

export default function CarasDeLaSede() {
  const sede = useFixtureStore((s) => s.sede);
  const isAdmin = useAuthStore(selectIsAdmin);
  const abierta = usePlanograma((s) => s.abierta);
  const [caras, setCaras] = useState<CaraDeLaSede[] | null>(null);
  const [puede, setPuede] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeCaras>("internas");
  const [grupo, setGrupo] = useState<Grupo>(null);
  const [busqueda, setBusqueda] = useState("");

  const leer = useCallback(() => {
    if (!sede) return;
    let vivo = true;
    setError(null);
    leerCaras(sede)
      .then((r) => { if (vivo) { setCaras(r.caras); setPuede(r.puede_planificar); } })
      .catch((e) => { if (vivo) setError(describeError(e, "No se pudieron leer las caras.")); });
    return () => { vivo = false; };
  }, [sede]);
  // Al entrar, al cambiar de sede y al salir de una cara: el estado al día.
  useEffect(() => { if (abierta === null) return leer(); }, [leer, abierta]);

  const delFiltro = useMemo(() => filtrarCaras(caras ?? [], isAdmin ? filtro : "internas"), [caras, filtro, isAdmin]);
  const cuentas = contarCaras(delFiltro);
  const filas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es");
    return delFiltro.filter((c) => {
      const como = comoEstaLaCara(c);
      if (grupo === "falta" && como.estado !== "sin_repartir") return false;
      if (grupo === "en_curso" && como.estado !== "borrador" && como.estado !== "programada") return false;
      if (grupo === "para_revisar" && como.estado !== "para_revisar") return false;
      if (grupo === "lista" && como.estado !== "lista") return false;
      if (!q) return true;
      return [c.codigo, c.nombre ?? "", ...c.destinos].some((t) => t.toLocaleLowerCase("es").includes(q));
    });
  }, [delFiltro, grupo, busqueda]);

  const abrir = (c: CaraDeLaSede) => void usePlanograma.getState().abrir({ sede, fixtureId: c.fixture_id, cara: c.cara });
  const contador = (g: Exclude<Grupo, null>, n: number, titulo: string, texto: string) => (
    <button type="button" className={`cs-cuenta ${g}`} aria-pressed={grupo === g} data-cuenta={g}
      onClick={() => setGrupo(grupo === g ? null : g)}>
      <span className="cs-cuenta-t">{titulo}</span>
      <b>{n}</b>
      <span className="cs-cuenta-x">{texto}</span>
    </button>
  );

  return (
    <div className="cs" data-caras-de-la-sede>
      <div className="cs-h">
        <nav className="cs-miga" aria-label="Dónde estás"><span>Plano</span><span aria-hidden>›</span></nav>
        <h1>Caras</h1>
        <span className="cs-sub">Qué va en cada cara de {sede || "la sede"}, y cómo va su montaje</span>
        <button type="button" className="cs-bt cs-recargar" onClick={() => leer()} title="Leer de nuevo">
          <RotateCcw {...ICONO} />Actualizar
        </button>
      </div>

      <div className="cs-cuerpo">
        {error && <p role="alert" className="cs-error">{error}</p>}
        {caras === null && !error && <p className="cs-nota">Leyendo las caras…</p>}
        {caras !== null && (
          <>
            <div className="cs-cuentas" role="group" aria-label="Cuántas hay en cada estado">
              {contador("falta", cuentas.sinRepartir, "Sin repartir", "el equipo no tiene guía")}
              {contador("en_curso", cuentas.enCurso, "En curso", "borrador o todavía no rige")}
              {contador("para_revisar", cuentas.paraRevisar, "Para revisar", "venció, el mueble cambió o el montaje")}
              {contador("lista", cuentas.listas, "Listas", "con versión vigente")}
            </div>

            <div className="cs-filtros">
              {isAdmin && FILTROS.map(({ f, texto }) => (
                <button key={f} type="button" className="cs-filtro" aria-pressed={filtro === f} onClick={() => setFiltro(f)} data-filtro={f}>
                  {texto}
                </button>
              ))}
              <label className="cs-buscar">
                <span className="sr-only">Buscar mueble o destino</span>
                <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar mueble o destino…" />
              </label>
            </div>

            {filas.length === 0 ? (
              <p className="cs-nota" data-caras-vacio>
                {delFiltro.length === 0
                  ? (filtro === "internas" ? "Esta sede no tiene muebles que no se vendan con una cara para repartir." : "No hay caras con este filtro.")
                  : "Ninguna cara con lo que elegiste."}
              </p>
            ) : (
              <ul className="cs-lista" aria-label="Caras">
                {filas.map((c) => {
                  const como = comoEstaLaCara(c);
                  const nombre = c.nombre && c.nombre.toUpperCase() !== c.codigo.replace(/-B$/, "").toUpperCase() ? c.nombre : null;
                  return (
                    <li key={`${c.fixture_id}:${c.cara}`} className="cs-fila" data-cara-de-la-lista={c.codigo} data-estado={como.estado}>
                      <div className="cs-cara">
                        <b className="mono">{c.codigo.replace(/-B$/, "")}{c.caras === 2 ? ` · ${c.cara}` : ""}</b>
                        <span>{nombre ?? (c.comercializable ? (c.por_participacion ? "Por porcentaje · lo libre" : "Se vende · lo libre") : "No se vende")}</span>
                      </div>
                      <div className={`cs-destinos${c.destinos.length ? "" : " vacio"}`}>{c.destinos.length ? c.destinos.join(" · ") : <span className="cs-tenue">—</span>}</div>
                      <div className="cs-estado"><span className={`cs-chip ${como.tono}`}>{como.titulo}</span></div>
                      <div className={`cs-montaje${c.montaje ? "" : " vacio"} ${c.montaje === "no_coincide" || c.montaje === "no_se_pudo" ? "mal" : c.montaje === "coincide" ? "bien" : ""}`}>
                        {c.montaje ? MONTAJE[c.montaje] : <span className="cs-tenue">—</span>}
                      </div>
                      <div className="cs-accion">
                        {(puede || como.estado !== "sin_repartir") && (
                          <button type="button" className={como.tono === "falta" ? "cs-bt fuerte" : "cs-bt"}
                            onClick={() => abrir(c)} data-abrir-cara={c.codigo}>
                            {como.tono === "falta" ? <Shapes {...ICONO} /> : <LayoutGrid {...ICONO} />}
                            {puede ? como.boton : "Ver la cara"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
