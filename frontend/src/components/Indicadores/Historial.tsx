import { useEffect, useMemo, useState } from "react";
import { Download, FileText, SearchX, X } from "lucide-react";
import {
  getHistorialDeLaSede,
  type ContratoCerrado,
  type EstadoCerrado,
  type HistorialDeLaSede,
} from "../../api/spaces";
import { meses, sumarDias, textoDeMeses } from "../../utils/meses";
import "./historial.css";

/**
 * Indicadores › Historial (2026-11-13, dibujo aprobado «Historial de
 * contratos»): todo contrato de la sede que ya no está vivo —el que llegó a su
 * fecha, el cancelado y el reemplazado al editarlo—, con filtros, «Exportar a
 * Excel» y la ficha del espacio a un toque.
 *
 * Vive en Indicadores y no en Contratos (como decía el dibujo): Contratos es
 * sólo de administración y es la pantalla que mira el proveedor, que no ve
 * nombres ni plata de los demás (`GET /spaces/linea`). Acá entran los dos
 * roles; la plata —al mes y total— sólo le llega a administración, y su Excel
 * sale sin esas columnas. Las cuentas y el filtrado los hace el servidor
 * (`GET /spaces/historial`): el estado sale de la bitácora, no del navegador.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const DE_A = 25;

const ESTADOS: { id: EstadoCerrado; texto: string }[] = [
  { id: "terminado", texto: "Terminado" },
  { id: "cancelado", texto: "Cancelado" },
  { id: "reemplazado", texto: "Reemplazado al editarlo" },
];
const TEXTO_DEL_ESTADO: Record<EstadoCerrado, string> = {
  terminado: "Terminado", cancelado: "Cancelado", reemplazado: "Reemplazado al editarlo",
};

type Orden = "fin" | "inicio" | "proveedor" | "espacio" | "valor";

/** `2026-10-31` → `31/10/2026`, sin pasar por `Date` (sin corrimiento de huso). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function pesos(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-CO");
}

/** Lo que se dice debajo del estado: de lo cancelado, hasta cuándo corrió. */
export function detalleDe(f: Pick<ContratoCerrado, "estado" | "desde" | "cancelado_desde">): string {
  if (f.estado !== "cancelado" || !f.cancelado_desde) return "";
  if (f.desde && f.cancelado_desde <= f.desde) return "no llegó a correr";
  return `corrió hasta el ${fechaCorta(sumarDias(f.cancelado_desde, -1))}`;
}

/** La marca, sólo si dice algo que el proveedor no dice. */
function marcaAparte(f: ContratoCerrado): boolean {
  const m = (f.marca ?? "").trim().toLocaleLowerCase("es");
  return !!m && m !== (f.proveedor ?? "").trim().toLocaleLowerCase("es");
}

function duracion(f: ContratoCerrado): string {
  const m = f.desde && f.hasta ? meses(f.desde, f.hasta) : 0;
  return m > 0 ? textoDeMeses(m) : "—";
}

function ordenar(filas: ContratoCerrado[], orden: Orden): ContratoCerrado[] {
  const t = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("es");
  const copia = [...filas];
  if (orden === "inicio") copia.sort((a, b) => t(b.desde).localeCompare(t(a.desde)) || b.lease_id - a.lease_id);
  else if (orden === "proveedor") copia.sort((a, b) => t(a.proveedor).localeCompare(t(b.proveedor), "es") || t(b.hasta).localeCompare(t(a.hasta)));
  else if (orden === "espacio") copia.sort((a, b) => t(a.espacio).localeCompare(t(b.espacio), "es") || t(b.hasta).localeCompare(t(a.hasta)));
  else if (orden === "valor") copia.sort((a, b) => (b.valor_al_mes ?? -1) - (a.valor_al_mes ?? -1));
  // «fin»: como viene del servidor (el que terminó más tarde, primero).
  return copia;
}

/** Las filas del Excel: lo mismo que la tabla, con números y fechas de verdad
 *  (Excel las ordena y las suma). La plata, sólo si llegó. */
export function filasDelExcel(filas: ContratoCerrado[], esAdmin: boolean): (string | number | Date | null)[][] {
  const fecha = (iso: string | null) => {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const cabeza = ["Espacio", "Proveedor", "Marca", "Desde", "Hasta", "Meses", "Estado", "Detalle",
    ...(esAdmin ? ["Al mes", "Total del contrato"] : [])];
  return [cabeza, ...filas.map((f) => {
    const m = f.desde && f.hasta ? meses(f.desde, f.hasta) : 0;
    return [
      f.espacio, f.proveedor ?? "", f.marca ?? "", fecha(f.desde), fecha(f.hasta),
      m > 0 ? Math.round(m * 100) / 100 : null, TEXTO_DEL_ESTADO[f.estado], detalleDe(f),
      ...(esAdmin ? [
        typeof f.valor_al_mes === "number" ? Math.round(f.valor_al_mes) : null,
        typeof f.valor_total === "number" ? Math.round(f.valor_total) : null,
      ] : []),
    ];
  })];
}

async function bajarExcel(nombre: string, filas: (string | number | Date | null)[][]) {
  const XLSX = await import("xlsx");
  const hoja = XLSX.utils.aoa_to_sheet(filas, { cellDates: true, dateNF: "dd/mm/yyyy" });
  hoja["!cols"] = filas[0].map((_, i) => ({ wch: [18, 24, 18, 12, 12, 8, 22, 26, 14, 18][i] ?? 14 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Historial");
  XLSX.writeFile(libro, nombre);
}

export default function Historial({ sede, esAdmin, cara, onQuitarCara, onAbrirFicha, puedeAbrir, version }: {
  sede: string;
  esAdmin: boolean;
  /** «Ver todos» de la ficha: esa cara y sus partes. */
  cara: string | null;
  onQuitarCara: () => void;
  onAbrirFicha: (espacio: string) => void;
  /** ¿El espacio está en el plano? Si no, su código no abre nada. */
  puedeAbrir: (espacio: string) => boolean;
  /** Cambia cuando cambia lo comercial de la sede: se vuelve a leer. */
  version?: unknown;
}) {
  const [proveedor, setProveedor] = useState("");
  const [espacio, setEspacio] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<EstadoCerrado | null>(null);
  const [orden, setOrden] = useState<Orden>("fin");
  const [cuantos, setCuantos] = useState(DE_A);
  const [datos, setDatos] = useState<HistorialDeLaSede | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);

  const alReves = !!(desde && hasta && hasta < desde);

  useEffect(() => {
    if (alReves) return;
    let vivo = true;
    setError(null);
    // Lo que se teclea espera un respiro; lo que se toca, no tanto.
    const t = setTimeout(() => {
      getHistorialDeLaSede(sede, { proveedor, espacio, cara: cara ?? undefined, desde, hasta, estado: estado ?? undefined })
        .then((r) => { if (vivo) { setDatos(r); setCuantos(DE_A); } })
        .catch(() => { if (vivo) setError("No se pudo leer el historial. Probá de nuevo en un momento."); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [sede, proveedor, espacio, cara, desde, hasta, estado, alReves, version]);

  const filas = useMemo(() => (datos ? ordenar(datos.filas, orden) : []), [datos, orden]);
  const visibles = filas.slice(0, cuantos);
  const cuentas = datos?.cuentas ?? { terminado: 0, cancelado: 0, reemplazado: 0 };
  const todos = cuentas.terminado + cuentas.cancelado + cuentas.reemplazado;
  const hayFiltros = !!(proveedor || espacio || desde || hasta || estado || cara);
  const limpiar = () => {
    setProveedor(""); setEspacio(""); setDesde(""); setHasta(""); setEstado(null);
    if (cara) onQuitarCara();
  };
  const exportar = async () => {
    if (!filas.length) return;
    setBajando(true);
    try {
      const hoy = new Date();
      const sello = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
      await bajarExcel(`historial-contratos-${sede}-${sello}.xlsx`, filasDelExcel(filas, esAdmin));
    } catch {
      setError("No se pudo armar el Excel. Probá de nuevo.");
    } finally {
      setBajando(false);
    }
  };

  const codigo = (f: ContratoCerrado) => puedeAbrir(f.espacio)
    ? <button type="button" className="hist-codigo" onClick={() => onAbrirFicha(f.espacio)} title="Abrir la ficha del espacio">{f.espacio}</button>
    : <span className="hist-codigo quieto" title="Ese espacio ya no está en el plano">{f.espacio}</span>;
  const pastilla = (f: ContratoCerrado) => <span className={`hist-estado ${f.estado}`}>{TEXTO_DEL_ESTADO[f.estado]}</span>;

  return (
    <section className="hist" aria-label="Historial de contratos" data-historial>
      <div className="hist-cabeza">
        <p>
          Los contratos de {sede} que ya no están vivos: los que llegaron a su fecha, los cancelados y los que se
          reemplazaron al editarlos. Lo vigente está en la pestaña Contratos.
        </p>
        <button type="button" className="btn-principal hist-exportar" onClick={exportar}
          disabled={!filas.length || bajando} data-exportar-historial>
          <Download {...ICONO} /> {bajando ? "Armando el Excel…" : "Exportar a Excel"}
        </button>
      </div>

      <div className="hist-filtros">
        <div className="hist-campos">
          <label>Proveedor o marca
            <input type="search" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Buscar…" />
          </label>
          <label>Espacio
            <input type="search" value={espacio} onChange={(e) => setEspacio(e.target.value)} placeholder="Código, p. ej. GON-01" />
          </label>
          <label>Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} max={hasta || undefined} />
          </label>
          <label>Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde || undefined} />
          </label>
        </div>
        <div className="hist-chips" role="group" aria-label="Estado">
          <span className="rot">Estado</span>
          <button type="button" aria-pressed={estado === null} onClick={() => setEstado(null)}>Todos · {todos}</button>
          {ESTADOS.map((e) => (
            <button key={e.id} type="button" aria-pressed={estado === e.id} onClick={() => setEstado(e.id)}>
              {e.texto} · {cuentas[e.id]}
            </button>
          ))}
          {cara && (
            <span className="hist-cara" data-filtro-cara>
              Espacio: <b>{cara}</b>
              <button type="button" aria-label={`Quitar el filtro de ${cara}`} onClick={onQuitarCara}><X {...ICONO} /></button>
            </span>
          )}
          {hayFiltros && <button type="button" className="hist-limpiar" onClick={limpiar}>Limpiar filtros</button>}
        </div>
        {alReves && <p className="hist-aviso" role="alert">«Hasta» no puede ser anterior a «Desde».</p>}
      </div>

      {error ? (
        <p className="hist-aviso" role="alert">{error}</p>
      ) : !datos ? (
        <p className="hist-nota">Leyendo el historial…</p>
      ) : filas.length === 0 ? (
        hayFiltros ? (
          <div className="hist-vacio" data-historial-vacio="filtros">
            <SearchX size={32} strokeWidth={1.5} aria-hidden />
            <h3>Ningún contrato cerrado coincide</h3>
            <p>Probá con otras fechas u otro estado. «Exportar a Excel» se prende cuando hay algo para bajar.</p>
            <button type="button" className="ind-csv" onClick={limpiar}>Limpiar filtros</button>
          </div>
        ) : (
          <div className="hist-vacio" data-historial-vacio="sede">
            <FileText size={32} strokeWidth={1.5} aria-hidden />
            <h3>Todavía no hay contratos cerrados</h3>
            <p>Cuando un contrato llegue a su fecha, se cancele o se reemplace al editarlo, aparece acá. No se borra nunca.</p>
          </div>
        )
      ) : (
        <div className="hist-lista">
          <div className="hist-barra">
            <span><b>{filas.length} contrato{filas.length === 1 ? "" : "s"}</b></span>
            <label>Ordenar por
              <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
                <option value="fin">Fecha de fin</option>
                <option value="inicio">Fecha de inicio</option>
                <option value="proveedor">Proveedor</option>
                <option value="espacio">Espacio</option>
                {esAdmin && <option value="valor">Valor al mes</option>}
              </select>
            </label>
          </div>

          <div className="hist-tabla-caja">
            <table className="hist-tabla">
              <thead>
                <tr>
                  <th scope="col">Espacio</th>
                  <th scope="col">Proveedor · marca</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Hasta</th>
                  <th scope="col">Duró</th>
                  <th scope="col">Estado</th>
                  {esAdmin && <th scope="col" className="num">Al mes</th>}
                  {esAdmin && <th scope="col" className="num">Total del contrato</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.lease_id} data-lease={f.lease_id}>
                    <td>{codigo(f)}</td>
                    <td><div>{f.proveedor ?? "Sin proveedor"}</div>{marcaAparte(f) && <div className="sub">{f.marca}</div>}</td>
                    <td className="fecha">{fechaCorta(f.desde)}</td>
                    <td className="fecha">{fechaCorta(f.hasta)}</td>
                    <td>{duracion(f)}</td>
                    <td>{pastilla(f)}{detalleDe(f) && <div className="sub">{detalleDe(f)}</div>}</td>
                    {esAdmin && <td className="num">{typeof f.valor_al_mes === "number" ? pesos(f.valor_al_mes) : "—"}</td>}
                    {esAdmin && <td className="num">{typeof f.valor_total === "number" ? pesos(f.valor_total) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* En el teléfono, tarjetas: la tabla de ocho columnas no entra. */}
          <ul className="hist-tarjetas">
            {visibles.map((f) => (
              <li key={f.lease_id}>
                <div className="fila">{codigo(f)}{pastilla(f)}</div>
                <div className="fila"><b>{f.proveedor ?? "Sin proveedor"}</b>
                  {esAdmin && typeof f.valor_al_mes === "number" && <span className="num">{pesos(f.valor_al_mes)} al mes</span>}
                </div>
                <div className="sub">{fechaCorta(f.desde)} – {fechaCorta(f.hasta)} · {duracion(f)}{detalleDe(f) ? ` · ${detalleDe(f)}` : ""}</div>
              </li>
            ))}
          </ul>

          <div className="hist-pie">
            <span>Mostrando {visibles.length} de {filas.length}</span>
            {visibles.length < filas.length && (
              <button type="button" className="ind-csv" onClick={() => setCuantos((n) => n + DE_A)}>
                Ver {Math.min(DE_A, filas.length - visibles.length)} más
              </button>
            )}
          </div>
          <p className="hist-nota">
            Tocá el código de un espacio para abrir su ficha. El Excel baja los {filas.length} con estos filtros
            {esAdmin ? ", con lo que pagaba cada uno." : "."}
          </p>
        </div>
      )}
    </section>
  );
}
