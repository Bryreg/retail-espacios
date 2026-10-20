import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { completarProveedor } from "../../api/vender";
import { pct } from "../../utils/participaciones";
import { textoDeCortes, type Contrato } from "./Contrato";

/**
 * Los campos del contrato que el rediseño de Vender (PR 1) agregó:
 *
 *  · `CampoProveedor` — completa UN nombre en línea desde la tercera letra
 *    (`GET /suppliers/completar`), con el resto escrito en gris adentro del
 *    campo; Tab lo acepta. Nunca una lista: Vender la mira el proveedor, y una
 *    lista de coincidencias le mostraría los nombres de su competencia (la
 *    opción B de la hoja de piezas, la aprobada).
 *  · `AtajosDeFecha` — «1 mes · 3 meses · <la temporada que viene>».
 *  · `ComoSeCobra` — precio fijo, o un % de las ventas con su corte (cada mes
 *    o al final). Sin mínimo garantizado.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Sin tildes ni mayúsculas, como compara el servidor. Mismo largo que el
 *  texto (una letra con tilde es una letra), así lo escrito y la sugerencia se
 *  parten por el mismo lugar. */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CampoProveedor({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const [sugerido, setSugerido] = useState<string | null>(null);
  const pedido = useRef(0);
  useEffect(() => {
    const escrito = valor.trimStart();
    const mio = ++pedido.current;
    if (plano(escrito).length < 3) { setSugerido(null); return; }
    const t = setTimeout(() => {
      completarProveedor(escrito)
        .then((n) => { if (mio === pedido.current) setSugerido(n); })
        .catch(() => { if (mio === pedido.current) setSugerido(null); });
    }, 250);
    return () => clearTimeout(t);
  }, [valor]);
  /** Lo que falta del nombre, si empieza con lo escrito y es más largo. */
  const resto = sugerido && valor && plano(sugerido).startsWith(plano(valor)) && sugerido.length > valor.length
    ? sugerido.slice(valor.length) : "";
  return (
    <label className="entrada con-ico">
      <Building2 {...ICONO} />
      <span className="fantasma-caja">
        <input
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && !e.shiftKey && resto && sugerido) { e.preventDefault(); onCambio(sugerido); }
          }}
          placeholder="Escribí el nombre"
          aria-label="Proveedor"
          autoComplete="off"
          spellCheck={false}
        />
        {resto && (
          <span className="fantasma" aria-hidden>
            <span className="ya">{valor}</span>{resto}
          </span>
        )}
      </span>
      {resto && <span className="kbd" title="Tab completa el nombre">Tab</span>}
    </label>
  );
}

export function AtajosDeFecha({ c }: { c: Contrato }) {
  return (
    <span className="atajos" role="group" aria-label="Plazo">
      {c.atajos.map((a) => (
        <button
          key={a.texto}
          type="button"
          className="atajo"
          aria-pressed={c.desde === a.desde && c.hasta === a.hasta}
          onClick={() => { c.setDesde(a.desde); c.setHasta(a.hasta); }}
        >
          {a.texto}
        </button>
      ))}
    </span>
  );
}

/** «Precio fijo | % de las ventas», a todo el ancho del bloque 3 («Cómo se
 *  cobra», que es su rótulo: el grupo se nombra igual para el lector de
 *  pantalla). Con «% de las ventas», el % y el corte debajo. `extra` va
 *  después, a todo el ancho. */
export function ComoSeCobra({ c, extra }: { c: Contrato; extra?: React.ReactNode }) {
  return (
    <div className="campo cobro" data-cobro={c.cobroModo}>
      <span className="seg seg-ancho" role="group" aria-label="Cómo se cobra">
        <button type="button" aria-pressed={c.cobroModo === "fijo"} onClick={() => c.setCobroModo("fijo")}>Precio fijo</button>
        <button type="button" aria-pressed={c.cobroModo === "ventas"} onClick={() => c.setCobroModo("ventas")}>% de las ventas</button>
      </span>
      {c.cobroModo === "ventas" && (
        <span className="cobro-ventas">
          <label className="entrada cif pct-ventas">
            <input
              value={c.ventasTexto}
              onChange={(e) => c.setVentasTexto(e.target.value)}
              placeholder="8"
              inputMode="decimal"
              aria-label="Porcentaje de las ventas"
            />
            <span className="fin">%</span>
          </label>
          <span className="rotulo">Corte</span>
          <span className="seg seg-chico" role="group" aria-label="Corte">
            <button type="button" aria-pressed={c.corte === "mensual"} onClick={() => c.setCorte("mensual")}>Cada mes</button>
            <button type="button" aria-pressed={c.corte === "al_final"} onClick={() => c.setCorte("al_final")}>Al final</button>
          </span>
        </span>
      )}
      {extra}
    </div>
  );
}

/** El total con cobro por ventas: no se sabe todavía, y se dice así. */
export function totalPorVentas(c: Contrato): { cifra: string; detalle: string } {
  const cifra = c.ventasPb !== null ? `${pct(c.ventasPb)} de las ventas` : "% de las ventas";
  const detalle = c.cortes.length === 0 ? "Elegí las fechas para ver los cortes."
    : c.corte === "al_final" ? `Se calcula al final: ${textoDeCortes(c.cortes)}.`
    : `Se calcula en cada corte: ${textoDeCortes(c.cortes)}.`;
  return { cifra, detalle };
}
