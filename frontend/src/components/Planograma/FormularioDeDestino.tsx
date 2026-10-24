import { useState } from "react";
import { Check, Circle, LayoutGrid, Megaphone, Package, Plus, Store } from "lucide-react";
import { describeError } from "../../api/client";
import * as API from "../../api/planogramas";
import type { ColorDeDestino, DestinoOut, TipoDeDestino } from "../../api/planogramas";
import { pbDeTexto, pct } from "../../utils/participaciones";
import { COLORES_DE_DESTINO, TIPOS_DE_DESTINO, tonoDeDestino } from "../../utils/planograma";
import { BOTON, Dialogo } from "../Distribucion/LeyendaDeParticipaciones";

/**
 * «Agregar destino» (y «Cambiar» uno que ya está en la cara): nombre, qué es,
 * cuánto de la cara (cualquier número: 15, 17,5…), el color (sale solo, se
 * puede cambiar), cómo se monta (lo lee la mercaderista en su guía) y el código
 * en el sistema del supermercado (para unirlo después con su ERP). Arriba, los
 * destinos guardados de la sede para reusar con un toque.
 */

const ETIQUETA = "mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink-3";
const CAMPO = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:border-accent focus:outline-none";
const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const ICONO_DEL_TIPO: Record<TipoDeDestino, typeof Store> = {
  categoria: LayoutGrid, marca_propia: Store, producto: Package, promocion: Megaphone, otro: Circle,
};
const textoDePb = (pb: number) => pct(pb).replace(/\s*%$/, "");

export function IconoDelTipo({ tipo, size = 14 }: { tipo: TipoDeDestino; size?: number }) {
  const I = ICONO_DEL_TIPO[tipo] ?? Circle;
  return <I size={size} strokeWidth={1.75} aria-hidden />;
}

export default function FormularioDeDestino({ sede, libre, colorSugerido, biblioteca, enLaCara, cambiando, onListo, onCerrar }: {
  sede: string;
  /** Lo libre para planificar (el tope del %; al cambiar, más lo que ya tenía). */
  libre: number;
  colorSugerido: ColorDeDestino;
  biblioteca: readonly DestinoOut[];
  /** Los destinos que ya están en la cara (no se ofrecen dos veces). */
  enLaCara: ReadonlySet<number>;
  /** Cambiar uno que ya está: su destino y su %. */
  cambiando?: { destino: DestinoOut; pb: number } | null;
  onListo: (d: DestinoOut, pb: number) => void;
  onCerrar: () => void;
}) {
  const d0 = cambiando?.destino ?? null;
  const [nombre, setNombre] = useState(d0?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoDeDestino>(d0?.tipo ?? "categoria");
  const [color, setColor] = useState<ColorDeDestino>(d0?.color ?? colorSugerido);
  const [texto, setTexto] = useState(cambiando ? textoDePb(cambiando.pb) : "");
  const [como, setComo] = useState(d0?.como_se_monta ?? "");
  const [codigo, setCodigo] = useState(d0?.codigo_externo ?? "");
  const [guardar, setGuardar] = useState(d0?.en_la_sede ?? true);
  const [elegido, setElegido] = useState<DestinoOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);

  const tope = libre + (cambiando?.pb ?? 0);
  const pb = pbDeTexto(texto);
  const ofrecidos = biblioteca.filter((d) => !enLaCara.has(d.id) || d.id === d0?.id);
  const usar = (d: DestinoOut) => {
    setElegido(d); setNombre(d.nombre); setTipo(d.tipo); setColor(d.color); setComo(d.como_se_monta ?? ""); setCodigo(d.codigo_externo ?? "");
    setGuardar(true);
  };
  const problema = !nombre.trim() ? "Ponele un nombre."
    : pb === null ? "Escribí cuánto de la cara: un número entre 0,01 y 100."
    : pb > tope ? `Queda ${pct(tope)} para planificar: no entra ${pct(pb)}.`
    : null;

  async function listo() {
    if (problema || pb === null || haciendo) { setError(problema); return; }
    setHaciendo(true);
    setError(null);
    try {
      const base = elegido ?? d0;
      const campos = { nombre: nombre.trim(), tipo, color, como_se_monta: como.trim() || null, codigo_externo: codigo.trim() || null, en_la_sede: guardar };
      const cambio = base && (base.nombre !== campos.nombre || base.tipo !== tipo || base.color !== color
        || (base.como_se_monta ?? null) !== campos.como_se_monta || (base.codigo_externo ?? null) !== campos.codigo_externo
        || !!base.en_la_sede !== guardar);
      const d = !base ? await API.crearDestino({ sede, ...campos })
        : cambio ? await API.cambiarDestino(base.id, campos) : base;
      onListo(d, pb);
    } catch (e) {
      setError(describeError(e, "No se pudo guardar el destino."));
    } finally {
      setHaciendo(false);
    }
  }

  return (
    <Dialogo titulo={cambiando ? `Cambiar ${d0?.nombre ?? "el destino"}` : "Agregar destino"} onCerrar={onCerrar} ancho="max-w-lg" cerrarAfuera={false}>
      <div className="flex flex-col gap-4" data-formulario-de-destino>
        {!cambiando && ofrecidos.length > 0 && (
          <div>
            <span className={ETIQUETA}>Guardados en {sede}</span>
            <div className="flex flex-wrap gap-1.5" data-biblioteca>
              {ofrecidos.map((d) => (
                <button key={d.id} type="button" onClick={() => usar(d)} aria-pressed={elegido?.id === d.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs ${elegido?.id === d.id ? "border-ink-1 font-semibold text-ink-1" : "border-line text-ink-2 hover:text-ink-1"}`}>
                  <span aria-hidden className="inline-block h-3 w-3 rounded-sm border" style={{ background: tonoDeDestino(d.color), borderColor: tonoDeDestino(d.color) }} />
                  {d.nombre}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-3">O uno nuevo, abajo.</p>
          </div>
        )}

        <div>
          <label className={ETIQUETA} htmlFor="destino-nombre">Nombre</label>
          <input id="destino-nombre" className={CAMPO} value={nombre} maxLength={120} placeholder="Lácteos, Marca propia, Halloween…"
            onChange={(e) => { setNombre(e.target.value); setElegido(null); }} autoFocus={!cambiando} />
        </div>

        <div>
          <span className={ETIQUETA}>Qué es</span>
          <div role="radiogroup" aria-label="Qué es" className="flex flex-wrap gap-1.5">
            {TIPOS_DE_DESTINO.map((t) => (
              <button key={t.tipo} type="button" role="radio" aria-checked={tipo === t.tipo} onClick={() => setTipo(t.tipo)} data-tipo={t.tipo}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs ${tipo === t.tipo ? "border-ink-1 bg-ink-1 font-semibold text-surface" : "border-line text-ink-2 hover:text-ink-1"}`}>
                <IconoDelTipo tipo={t.tipo} />{t.texto}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={ETIQUETA} htmlFor="destino-pct">Cuánto de la cara</label>
            <div className="flex items-baseline gap-1.5">
              <input id="destino-pct" className={`${CAMPO} font-mono`} inputMode="decimal" value={texto} placeholder="15"
                onChange={(e) => setTexto(e.target.value)} aria-describedby="destino-pct-ayuda" />
              <span className="text-sm font-semibold text-ink-3">%</span>
            </div>
            <p id="destino-pct-ayuda" className="mt-1 text-[11px] text-ink-3">Cualquier número: 15, 17,5… Queda {pct(tope)} para planificar.</p>
          </div>
          <div>
            <span className={ETIQUETA}>Color</span>
            <div role="radiogroup" aria-label="Color" className="flex h-[38px] items-center gap-2">
              {COLORES_DE_DESTINO.map((c, i) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${i + 1}`} onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-lg border-2"
                  style={{ background: `color-mix(in srgb, ${tonoDeDestino(c)} 28%, rgb(var(--surface-rgb)))`, borderColor: tonoDeDestino(c),
                    outline: color === c ? "2px solid rgb(var(--ink-1-rgb))" : undefined, outlineOffset: 2 }} />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-3">Sale solo; se puede cambiar.</p>
          </div>
        </div>

        <div>
          <label className={ETIQUETA} htmlFor="destino-como">Cómo se monta <span className="normal-case tracking-normal">· opcional</span></label>
          <textarea id="destino-como" className={`${CAMPO} min-h-[64px] resize-y`} maxLength={2000} value={como}
            placeholder="Ej.: precio al frente, lo más vendido a la altura de los ojos." onChange={(e) => setComo(e.target.value)} />
          <p className="mt-1 text-[11px] text-ink-3">Lo lee quien monta, en su guía.</p>
        </div>

        <div>
          <label className={ETIQUETA} htmlFor="destino-codigo">Código en tu sistema <span className="normal-case tracking-normal">· opcional</span></label>
          <input id="destino-codigo" className={`${CAMPO} font-mono`} maxLength={120} value={codigo} placeholder="CAT-102"
            onChange={(e) => setCodigo(e.target.value)} />
          <p className="mt-1 text-[11px] text-ink-3">Para unirlo más adelante con el ERP del supermercado.</p>
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--ink-1-rgb))]" />
          Guardarlo en los destinos de {sede} para usarlo en otros muebles
        </label>

        {error && <p role="alert" className="text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={BOTON} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn-principal inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
            onClick={() => void listo()} disabled={haciendo} data-agregar-a-la-cara>
            {cambiando ? <Check {...ICONO} /> : <Plus {...ICONO} />}
            {haciendo ? "Guardando…" : cambiando ? "Guardar el cambio" : "Agregar a la cara"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
