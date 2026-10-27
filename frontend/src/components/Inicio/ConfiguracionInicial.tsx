import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useFixtureStore } from "../../store/fixtureStore";
import { useAuthStore } from "../../store/authStore";
import { getContacts, getUsuarios, type ContactBook, type UsuariosResponse } from "../../api/auth";
export type { PasoInicial } from "../../utils/configuracionInicial";
import { pasosIniciales, type PasoInicial } from "../../utils/configuracionInicial";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Ocultarla es de esta computadora y de este supermercado; se vuelve a
 *  mostrar desde Ajustes › Cuenta. */
const claveOculta = (cliente: string | null) => `recabra-config-inicial-oculta:${cliente ?? "-"}`;
export const EVENTO_CONFIGURACION = "recabra:config-inicial";

export function mostrarConfiguracionInicial(cliente: string | null): void {
  try { localStorage.removeItem(claveOculta(cliente)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO_CONFIGURACION));
}

/** Los pasos y si se muestra (sólo administración, mientras falte algo y no
 *  se haya ocultado). */
export function useConfiguracionInicial(esAdmin: boolean) {
  const sedes = useFixtureStore((s) => s.sedes);
  const porSede = useFixtureStore((s) => s.fixturesBySede);
  const rates = useFixtureStore((s) => s.referenceRates);
  const cliente = useAuthStore((s) => s.cliente);
  const [contactos, setContactos] = useState<ContactBook | null>(null);
  const [usuarios, setUsuarios] = useState<UsuariosResponse | null>(null);
  const [oculta, setOculta] = useState(() => { try { return localStorage.getItem(claveOculta(cliente)) === "1"; } catch { return false; } });
  useEffect(() => {
    const re = () => { try { setOculta(localStorage.getItem(claveOculta(cliente)) === "1"); } catch { setOculta(false); } };
    window.addEventListener(EVENTO_CONFIGURACION, re);
    return () => window.removeEventListener(EVENTO_CONFIGURACION, re);
  }, [cliente]);
  useEffect(() => {
    if (!esAdmin || oculta) return;
    getContacts().then(setContactos).catch(() => setContactos({ gerente: [], by_sede: {} }));
    getUsuarios().then(setUsuarios).catch(() => setUsuarios(null));
  }, [esAdmin, oculta]);
  const tarifas = Object.values(rates?.default ?? {}).filter((v) => v > 0).length;
  const pasos = useMemo(() => pasosIniciales({ sedes, porSede, tarifas, contactos, usuarios }), [sedes, porSede, tarifas, contactos, usuarios]);
  const hechos = pasos.filter((p) => p.hecho).length;
  const ocultar = () => { try { localStorage.setItem(claveOculta(cliente), "1"); } catch { /* queda en esta pestaña */ } setOculta(true); };
  return { pasos, hechos, visible: esAdmin && !oculta && hechos < pasos.length, ocultar };
}

/**
 * La configuración inicial (rediseño UX 2026-10, etapa 8): los seis pasos de
 * un supermercado nuevo, con el avance «N de 6». Cada paso dice lo que falta y
 * lo ya hecho, con los datos de verdad; el siguiente pendiente lleva la única
 * acción amarilla de la pantalla. Se oculta y se vuelve a mostrar desde
 * Ajustes › Cuenta.
 */
export default function ConfiguracionInicial({ pasos, hechos, onIr, onOcultar }: {
  pasos: PasoInicial[];
  hechos: number;
  onIr: (destino: PasoInicial["ir"]) => void;
  onOcultar: () => void;
}) {
  const siguiente = pasos.find((p) => !p.hecho);
  return (
    <section className="ini-config" data-configuracion-inicial aria-label="Configuración inicial">
      <header>
        <div>
          <h2>Configuración inicial</h2>
          <p>{hechos} de {pasos.length} · lo que falta para dejar el supermercado listo</p>
        </div>
        <button type="button" className="ini-config-ocultar" onClick={onOcultar} title="Ocultar (se vuelve a mostrar desde Ajustes › Cuenta)">
          <X {...ICONO} /> Ocultar
        </button>
      </header>
      <div className="ini-config-avance" role="progressbar" aria-valuemin={0} aria-valuemax={pasos.length} aria-valuenow={hechos}>
        <i style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>
      <ol>
        {pasos.map((p) => (
          <li key={p.n} data-paso={p.n} data-hecho={p.hecho || undefined}>
            <span className="num">{p.hecho ? <Check {...ICONO} /> : p.n}</span>
            <span className="t"><b>{p.titulo}</b><small>{p.detalle}</small></span>
            <button type="button" className={p === siguiente ? "btn-principal" : "ini-config-btn"} onClick={() => onIr(p.ir)}>
              {p.hecho ? "Ver" : p.boton}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
