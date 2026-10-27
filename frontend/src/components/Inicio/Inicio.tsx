import { useEffect, useState } from "react";
import { AlarmClock, Banknote, CircleDashed, FilePlus2, FileText, Hammer, History } from "lucide-react";
import { getBitacora, type LineaBitacora } from "../../api/auth";
import "./inicio.css";

/**
 * Inicio (rediseño UX 2026-10, etapa 3): lo que pide atención hoy en la sede,
 * en una pantalla. Cuatro cifras que llevan a su módulo, lo que vence hoy con
 * su acción, y lo último que pasó.
 *
 * No calcula nada: cada cifra y cada fila le llegan de la pantalla comercial
 * (`DashboardView`), que es la que ya las cuenta para Indicadores y para
 * «Para revisar». Así el Inicio y los Indicadores no pueden decir dos cosas.
 * Quien trabaja en la tienda no ve plata: su cuarta cifra son los espacios
 * disponibles, y no ve la bitácora (es de administración).
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export interface FilaDeHoy {
  clave: string;
  /** Qué es («Vencidos», «Ventas por cargar»…). */
  titulo: string;
  /** El espacio, si el aviso tiene uno. */
  codigo: string | null;
  /** Cuándo: «venció hace 3 días», «hoy»… */
  cuando: string | null;
  accion: { texto: string; onClick: () => void };
  /** Abrir la ficha del espacio (tocar el código). */
  onFicha?: () => void;
}

export interface CifrasDelInicio {
  contratos: number;
  porVencer: number;
  montajesPorResolver: number;
  /** Sólo quien administra. */
  canonDelMes: number | null;
  disponibles: number;
}

function pesos(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-CO");
}

function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function horaDe(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function Tarjeta({ icono, rotulo, definicion, valor, nota, alarma = false, accion }: {
  icono: React.ReactNode;
  rotulo: string;
  /** Qué cuenta, dicho entero: va en el `title` del rótulo. */
  definicion: string;
  valor: string;
  nota?: string;
  alarma?: boolean;
  accion?: { texto: string; onClick: () => void };
}) {
  return (
    <section className="ini-tarjeta" data-cifra-inicio={rotulo}>
      <h3 title={definicion}>{icono}{rotulo}</h3>
      <div className={"valor" + (alarma ? " alarma" : "")}>{valor}</div>
      {nota && <p className="nota">{nota}</p>}
      {accion && (
        <button type="button" className="ini-link" onClick={accion.onClick}>{accion.texto}</button>
      )}
    </section>
  );
}

export default function Inicio({
  esAdmin, sede, nombre, cifras, filasDeHoy, cuentaHoy, totalPendientes,
  onNuevoContrato, onVerTabla, onVerPorVencer, onVerMontajes, onVerIndicadores, onVerPendientes,
}: {
  esAdmin: boolean;
  sede: string;
  nombre: string | null;
  cifras: CifrasDelInicio;
  filasDeHoy: FilaDeHoy[];
  cuentaHoy: number;
  totalPendientes: number;
  onNuevoContrato?: () => void;
  onVerTabla: () => void;
  onVerPorVencer: () => void;
  onVerMontajes: () => void;
  onVerIndicadores: () => void;
  onVerPendientes: () => void;
}) {
  // Lo último que pasó: la bitácora, sólo para quien administra (el servidor
  // también lo exige). Se pide al entrar; sin ella el Inicio igual sirve.
  const [actividad, setActividad] = useState<LineaBitacora[] | null>(null);
  useEffect(() => {
    if (!esAdmin) return;
    let vivo = true;
    // Los ingresos llenan la bitácora y no son trabajo: acá va lo que se hizo.
    getBitacora({ limite: 40 })
      .then((l) => { if (vivo) setActividad(l.filter((x) => !x.accion.startsWith("login.")).slice(0, 8)); })
      .catch(() => { if (vivo) setActividad([]); });
    return () => { vivo = false; };
  }, [esAdmin]);

  const hoy = new Date();
  const visibles = filasDeHoy.slice(0, 8);
  return (
    <div className="inicio" data-inicio>
      <header className="ini-cab">
        <div>
          <h1>Hola{nombre ? `, ${nombre}` : ""}</h1>
          <p>Esto es lo que pide atención hoy en {sede}.</p>
        </div>
        <div className="der">
          <span className="hoy">Hoy, {fechaCorta(hoy)}</span>
          {onNuevoContrato && (
            <button type="button" className="btn-principal ini-nuevo" onClick={onNuevoContrato}>
              <FilePlus2 {...ICONO} /> Nuevo contrato
            </button>
          )}
        </div>
      </header>

      <div className="ini-tarjetas">
        <Tarjeta
          icono={<FileText {...ICONO} />}
          rotulo="Contratos activos"
          definicion="Contratos que corren hoy en la sede, incluidas las partes vendidas por separado."
          valor={String(cifras.contratos)}
          accion={{ texto: "Ver la tabla", onClick: onVerTabla }}
        />
        <Tarjeta
          icono={<AlarmClock {...ICONO} />}
          rotulo="Por vencer (30 días)"
          definicion="Contratos con proveedor que terminan en los próximos 30 días."
          valor={String(cifras.porVencer)}
          nota={cifras.porVencer > 0 ? "Requieren acción" : "Nada vence este mes"}
          alarma={cifras.porVencer > 0}
          accion={cifras.porVencer > 0 ? { texto: "Ver cuáles", onClick: onVerPorVencer } : undefined}
        />
        <Tarjeta
          icono={<Hammer {...ICONO} />}
          rotulo="Montajes por resolver"
          definicion="Contratados que empezaron y nadie reportó armados, más los que no se pudieron montar."
          valor={String(cifras.montajesPorResolver)}
          accion={{ texto: "Ver montajes", onClick: onVerMontajes }}
        />
        {esAdmin && cifras.canonDelMes !== null ? (
          <Tarjeta
            icono={<Banknote {...ICONO} />}
            rotulo="Canon del mes"
            definicion="Lo que pagan al mes los contratos vigentes: cada contrato repartido en sus meses, más lo cargado de los que cobran por % de las ventas."
            valor={pesos(cifras.canonDelMes)}
            accion={{ texto: "Ver indicadores", onClick: onVerIndicadores }}
          />
        ) : (
          <Tarjeta
            icono={<CircleDashed {...ICONO} />}
            rotulo="Disponibles hoy"
            definicion="Caras que se pueden contratar hoy: sin contrato ni reserva."
            valor={String(cifras.disponibles)}
            accion={{ texto: "Ver indicadores", onClick: onVerIndicadores }}
          />
        )}
      </div>

      <div className={"ini-dos" + (esAdmin ? "" : " solo")}>
        <section className="ini-panel" data-pendientes-de-hoy>
          <header>
            <h2>Pendientes de hoy · {cuentaHoy}</h2>
            {totalPendientes > 0 && (
              <button type="button" className="ini-link" onClick={onVerPendientes}>
                Ver los {totalPendientes}
              </button>
            )}
          </header>
          {visibles.length === 0 ? (
            <p className="vacio">Nada con fecha límite hoy.</p>
          ) : (
            <ul className="ini-lista">
              {visibles.map((f) => (
                <li key={f.clave}>
                  <div className="que">
                    <span className="tit">{f.titulo}</span>
                    {(f.codigo || f.cuando) && (
                      <span className="det">
                        {f.codigo && (f.onFicha
                          ? <button type="button" className="codigo" onClick={f.onFicha} title="Abrir la ficha del espacio">{f.codigo}</button>
                          : <span className="codigo">{f.codigo}</span>)}
                        {f.codigo && f.cuando && " · "}
                        {f.cuando}
                      </span>
                    )}
                  </div>
                  <button type="button" className="btn-s" onClick={f.accion.onClick}>{f.accion.texto}</button>
                </li>
              ))}
            </ul>
          )}
          {filasDeHoy.length > visibles.length && (
            <button type="button" className="ini-link mas" onClick={onVerPendientes}>
              y {filasDeHoy.length - visibles.length} más de hoy
            </button>
          )}
        </section>

        {esAdmin && (
          <section className="ini-panel" data-actividad>
            <header>
              <h2><History {...ICONO} /> Actividad reciente</h2>
            </header>
            {actividad === null ? (
              <p className="vacio">Cargando…</p>
            ) : actividad.length === 0 ? (
              <p className="vacio">Todavía no hay movimientos.</p>
            ) : (
              <ul className="ini-actividad">
                {actividad.map((l) => (
                  <li key={l.id}>
                    <span className="tit">{l.titulo}</span>
                    {l.detalle && <span className="det">{l.detalle}</span>}
                    <time dateTime={l.at}>{horaDe(l.at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
