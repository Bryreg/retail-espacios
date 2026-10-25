import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { describeError } from "../../api/client";
import { destinatariosDeLaGuia, enviarLaGuia, type Destinatarios } from "../../api/guia";
import { rechazoDe } from "../../api/participaciones";
import { correosEscritos } from "../../utils/guia";
import { BOTON, Dialogo } from "../Distribucion/LeyendaDeParticipaciones";

/**
 * «Mandarla a quien corresponde» (decisión del dueño: no sale sola al
 * publicar; se ofrece y se elige a quién). Arriba, quien monta en la sede (la
 * libreta de contactos, marcado) y, para quien administra, la administración
 * de la sede; abajo, los correos que se quieran agregar. Sale el enlace sin
 * contraseña y lo que va dónde, sin precios.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const CAMPO = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:border-accent focus:outline-none";

export default function EnviarGuia({ versionId, titulo, onCerrar, onEnviada }: {
  versionId: number;
  /** «GON-12 · cara A · versión 2». */
  titulo: string;
  onCerrar: () => void;
  onEnviada: (a: string[]) => void;
}) {
  const [d, setD] = useState<Destinatarios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [otros, setOtros] = useState("");
  const [haciendo, setHaciendo] = useState(false);
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    let vale = true;
    destinatariosDeLaGuia(versionId)
      .then((r) => { if (!vale) return; setD(r); setMarcados(new Set(r.montaje)); })
      .catch((e) => { if (vale) setError(describeError(e, "No se pudo leer a quién mandarla.")); });
    return () => { vale = false; };
  }, [versionId]);

  const escritos = correosEscritos(otros);
  const todos = [...new Set([...marcados, ...escritos.validos])];
  const alternar = (c: string) => setMarcados((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const problema = escritos.malos.length > 0 ? `No parece un correo: ${escritos.malos.join(", ")}.`
    : todos.length === 0 ? "Elegí o escribí al menos un correo." : null;

  async function enviar() {
    setIntento(true);
    if (problema || haciendo) return;
    setHaciendo(true);
    setError(null);
    try {
      const r = await enviarLaGuia(versionId, todos);
      onEnviada(r.enviados);
    } catch (e) {
      setError(rechazoDe(e)?.message || describeError(e, "No se pudo mandar."));
    } finally {
      setHaciendo(false);
    }
  }

  const Fila = ({ c, quien }: { c: string; quien: string }) => (
    <label className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--ink-1-rgb))]" checked={marcados.has(c)} onChange={() => alternar(c)} />
      <span className="min-w-0 flex-1 break-all">{c}</span><span className="text-xs text-ink-3">{quien}</span>
    </label>
  );

  return (
    <Dialogo titulo={`Mandar la guía de ${titulo}`} onCerrar={onCerrar} ancho="max-w-md" cerrarAfuera={false}>
      <div className="flex flex-col gap-3" data-enviar-guia>
        <p className="text-sm text-ink-2">Le llega el enlace a la guía (sin contraseña, para imprimir o seguirla en el teléfono) y lo que va dónde. Sin precios.</p>
        {!d && !error && <p className="text-xs text-ink-3">Leyendo los contactos de la sede…</p>}
        {d && (
          <div className="flex flex-col gap-1.5">
            {d.montaje.map((c) => <Fila key={c} c={c} quien={`Monta en ${d.sede}`} />)}
            {d.comercial.filter((c) => !d.montaje.includes(c)).map((c) => <Fila key={c} c={c} quien="Administración" />)}
            {d.montaje.length === 0 && (
              <p className="text-xs text-ink-3">No hay nadie cargado para montar en {d.sede} (Configuración → Contactos). Escribí el correo abajo.</p>
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink-3" htmlFor="guia-otros">Otros correos</label>
          <textarea id="guia-otros" className={`${CAMPO} min-h-[56px] resize-y`} value={otros} placeholder="quien.monta@proveedor.co, otra@tienda.co"
            onChange={(e) => setOtros(e.target.value)} />
        </div>
        {d && !d.correo_listo && (
          <p className="text-xs" style={{ color: "rgb(var(--entra-txt-rgb))" }}>El correo de RECABRA no está configurado: copiá el enlace y mandalo vos.</p>
        )}
        {error || (problema && (intento || escritos.malos.length > 0)) ? (
          <p role="alert" className="text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{error ?? problema}</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={BOTON} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn-principal inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
            disabled={haciendo || !d?.correo_listo} onClick={() => void enviar()} data-confirmar-enviar>
            <Send {...ICONO} />{haciendo ? "Mandando…" : `Mandar${todos.length ? ` a ${todos.length}` : ""}`}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
