import { Link } from "react-router-dom";
import { BarChart3, FileText, Hammer, House, Map as IconoPlano, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RUTA_DE, puedeAbrir, type Modulo } from "../../modulos";
import { useArmazon } from "../../store/armazonStore";

/** El ícono del menú: el mismo tamaño y trazo que la barra (hoja de piezas). */
const ICONO_MENU = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

interface ItemDelMenu {
  modulo: Modulo;
  /** El nombre entero, en el menú lateral. */
  largo: string;
  /** El nombre en el riel y en la barra de abajo, donde no entra el largo. */
  corto: string;
  /** Para qué sirve, en el `title`: el nombre solo no siempre lo dice. */
  para: string;
  Icono: LucideIcon;
}

/** Los módulos, en el orden del dibujo aprobado. «Plano de la sede» junta lo
 *  que eran dos pestañas (Plano y Editor 3D): adentro se elige 2D | 3D. */
export const ITEMS_DEL_MENU: ItemDelMenu[] = [
  { modulo: "inicio", largo: "Inicio", corto: "Inicio", Icono: House,
    para: "Lo que pide atención hoy en la sede" },
  { modulo: "contratos", largo: "Contratos", corto: "Contratos", Icono: FileText,
    para: "Qué está disponible para unas fechas y el contrato, ahí mismo" },
  { modulo: "indicadores", largo: "Indicadores", corto: "Indicadores", Icono: BarChart3,
    para: "Cómo va la sede: canon, ocupación, vencimientos y lo que hay que revisar" },
  { modulo: "montajes", largo: "Montajes", corto: "Montajes", Icono: Hammer,
    para: "Que lo contratado y lo planificado quede armado en la tienda" },
  { modulo: "plano", largo: "Plano de la sede", corto: "Plano", Icono: IconoPlano,
    para: "Dibujar la tienda en 2D y verla en 3D" },
];

/** El módulo del menú que se marca: el 3D es parte del Plano. */
function marcado(actual: Modulo | null): Modulo | null {
  return actual === "plano3d" ? "plano" : actual;
}

/** La pastilla roja de lo que hay para revisar, en «Indicadores» (era la de
 *  la pestaña «Supervisar»). Con Contratos abierto no se dibuja: la pantalla
 *  la mira el proveedor. */
function useCuentaDe(modulo: Modulo, actual: Modulo | null): number {
  const cuenta = useArmazon((s) => s.cuentaPendientes);
  return modulo === "indicadores" && actual !== "contratos" ? cuenta : 0;
}

function Item({ item, actual }: { item: ItemDelMenu; actual: Modulo | null }) {
  const { modulo, largo, corto, para, Icono } = item;
  const badge = useCuentaDe(modulo, actual);
  return (
    <Link
      to={RUTA_DE[modulo]}
      className="item-menu"
      title={para}
      aria-current={marcado(actual) === modulo ? "page" : undefined}
      data-modulo={modulo}
    >
      <Icono {...ICONO_MENU} />
      <span className="largo">{largo}</span>
      <span className="corto" aria-hidden>{corto}</span>
      {badge > 0 && (
        <span className="cuenta" aria-label={`${badge} para revisar`}>{badge}</span>
      )}
    </Link>
  );
}

/** El menú de módulos: lateral desde 640 px (riel entre 640 y 1023) y barra
 *  de abajo en el teléfono (`armazon.css`). Ajustes es de quien administra y
 *  va aparte, abajo del menú: no es un lugar donde se trabaja todos los días. */
export function MenuLateral({ actual, esAdmin, clienteNombre, sede, onAjustes }: {
  actual: Modulo | null;
  esAdmin: boolean;
  clienteNombre: string | null;
  sede: string;
  onAjustes: () => void;
}) {
  const items = ITEMS_DEL_MENU.filter((i) => puedeAbrir(i.modulo, esAdmin));
  return (
    <nav className="menu-lateral" aria-label="Módulos">
      <div className="marca">RECABRA</div>
      <div className="grupo">
        {items.map((i) => <Item key={i.modulo} item={i} actual={actual} />)}
      </div>
      {esAdmin && (
        <div className="grupo">
          <button type="button" className="item-menu" onClick={onAjustes}
            title="Usuarios, avisos, nombres de los muebles, suscripción, copia y bitácora">
            <Settings {...ICONO_MENU} />
            <span className="largo">Ajustes</span>
            <span className="corto" aria-hidden>Ajustes</span>
          </button>
        </div>
      )}
      <div className="pie">
        {clienteNombre && <b>{clienteNombre}</b>}
        Sede: {sede}
      </div>
    </nav>
  );
}

export function BarraDeAbajo({ actual, esAdmin }: { actual: Modulo | null; esAdmin: boolean }) {
  const items = ITEMS_DEL_MENU.filter((i) => puedeAbrir(i.modulo, esAdmin));
  return (
    <nav className="barra-abajo" aria-label="Módulos">
      {items.map((i) => <Item key={i.modulo} item={i} actual={actual} />)}
    </nav>
  );
}
