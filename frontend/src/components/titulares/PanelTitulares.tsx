/* ============================================================================
   Derechos de una persona (auditoría pre-lanzamiento, P1-14) — el cajón de la
   consola de plataforma donde el operador atiende la consulta o la supresión
   de UNA persona: la busca por su correo (o el contacto de un proveedor por
   supermercado y número), baja todo lo que hay de ella o la anonimiza.

   Vive FUERA de `components/plataforma/` a propósito: esa carpeta es el área
   de análisis de la consola, y `scripts/probar-plataforma.mjs` vigila que
   ningún archivo de ahí nombre un correo ni un teléfono. Acá el correo ES el
   pedido —lo trae la persona, no se lee de la base de un cliente— y lo que
   devuelve el servidor se baja como archivo sin pintarse en pantalla. Habla
   sólo con `api/legal.ts`. La excepción está declarada en la política (§5.3 b
   y §7.1 e) y el procedimiento, con los plazos, en `docs/operacion.md` §11.
   ========================================================================== */

import { useState } from "react";
import { describeError } from "../../api/client";
import {
  exportarTitular,
  listarConstancias,
  suprimirTitular,
  type ConstanciaDeTitular,
  type TitularPedido,
} from "../../api/legal";

const SIN_DATO = "—";

/** El detalle del 409 «única dueña» trae los supermercados. */
function supermercadosDeLaUnicaDuena(err: unknown): string[] | null {
  const d = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detalle = d?.data?.detail as { codigo?: string; supermercados?: string[] } | undefined;
  return d?.status === 409 && detalle?.codigo === "unica_duena" ? detalle.supermercados ?? [] : null;
}

/** Atender la consulta o la supresión de UNA persona: buscarla por su correo
 *  (o el contacto de un proveedor por supermercado y número), bajar todo lo que
 *  hay de ella o anonimizarla. El procedimiento y los plazos (10 y 15 días
 *  hábiles) están en `docs/operacion.md` §11. */
export function PanelTitulares() {
  const [correo, setCorreo] = useState("");
  const [cliente, setCliente] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [constancias, setConstancias] = useState<ConstanciaDeTitular[] | null>(null);

  // Las constancias se leen a pedido: leerlas deja una línea en la bitácora de
  // la plataforma, y abrir la consola no es mirarlas.
  const leer = () => {
    listarConstancias().then(setConstancias).catch(() => setConstancias([]));
  };
  const releer = () => { if (constancias !== null) leer(); };

  const pedido = (): TitularPedido | null => {
    const p: TitularPedido = { referencia: referencia.trim() || undefined };
    if (cliente.trim()) p.cliente = cliente.trim().toLowerCase();
    if (proveedor.trim()) {
      const n = Number(proveedor.trim());
      if (!Number.isInteger(n) || n <= 0 || !p.cliente) {
        setMensaje("Para el contacto de un proveedor: el código del supermercado y el número del proveedor.");
        return null;
      }
      p.proveedor_id = n;
    } else if (correo.includes("@")) {
      p.correo = correo.trim();
    } else if (correo.replace(/\D/g, "").length >= 7) {
      p.telefono = correo.trim();
    } else {
      setMensaje("Escribí el correo o el teléfono de la persona, o el supermercado y el número del proveedor.");
      return null;
    }
    return p;
  };

  const exportar = async () => {
    const p = pedido();
    if (!p || busy) return;
    setBusy(true);
    setMensaje(null);
    try {
      const n = await exportarTitular(p);
      setMensaje(`Bajó el archivo. Constancia #${n}.`);
      releer();
    } catch (err) {
      setMensaje(describeError(err, "No se pudo exportar."));
    } finally {
      setBusy(false);
    }
  };

  const suprimir = async (aunqueSeaLaUnicaDuena = false) => {
    const p = pedido();
    if (!p || busy) return;
    if (!p.referencia) {
      setMensaje("Para suprimir, escribí la referencia de la solicitud (el radicado o la fecha del correo).");
      return;
    }
    if (!aunqueSeaLaUnicaDuena && !confirm(
      "Esto ANONIMIZA a la persona en todas las bases: donde está su correo, su teléfono o su nombre queda " +
        "«titular-suprimido-…», su cuenta deja de entrar y el contacto del proveedor queda vacío. Los contratos, " +
        "la bitácora y la facturación quedan, sin ella. No se puede deshacer. ¿Seguimos?",
    )) return;
    setBusy(true);
    setMensaje(null);
    try {
      const r = await suprimirTitular({ ...p, aunque_sea_la_unica_duena: aunqueSeaLaUnicaDuena });
      const donde = Object.keys(r.supermercados);
      setMensaje(
        `Listo. Constancia #${r.constancia}. ` +
          (donde.length ? `Anonimizada en ${donde.join(", ")}. ` : "No aparecía en ningún supermercado. ") +
          (r.no_revisados.length ? `No se pudieron revisar: ${r.no_revisados.join(", ")} (volvé a intentarlo). ` : "") +
          "Falta borrar la cuenta en Firebase, a mano.",
      );
      setCorreo("");
      releer();
    } catch (err) {
      const unica = supermercadosDeLaUnicaDuena(err);
      if (unica && confirm(
        `Es la única dueña de ${unica.join(", ")}: si se la suprime, nadie queda a cargo. ` +
          "¿Suprimirla igual?",
      )) {
        setBusy(false);
        await suprimir(true);
        return;
      }
      setMensaje(describeError(err, "No se pudo suprimir."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="plat-editor">
        <div className="linea">
          <input type="text" value={correo} onChange={(e) => setCorreo(e.target.value)}
            placeholder="Correo o teléfono de la persona" aria-label="Correo o teléfono de la persona" />
        </div>
        <div className="linea">
          <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)}
            placeholder="Supermercado (código, opcional: limita la búsqueda)" aria-label="Código del supermercado" />
          <input type="text" inputMode="numeric" value={proveedor} onChange={(e) => setProveedor(e.target.value)}
            placeholder="N.º de proveedor (contacto de un proveedor)" aria-label="Número del proveedor" />
        </div>
        <div className="linea">
          <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)}
            placeholder="Referencia de la solicitud (obligatoria para suprimir)" aria-label="Referencia de la solicitud" />
        </div>
        <div className="linea">
          <button type="button" className="plat-btn mini fuerte" onClick={exportar} disabled={busy}>
            {busy ? "Buscando…" : "Exportar sus datos"}
          </button>
          <button type="button" className="plat-btn mini" onClick={() => void suprimir()} disabled={busy}>
            Anonimizar
          </button>
          {constancias === null && (
            <button type="button" className="plat-btn mini" onClick={leer}>Ver las constancias</button>
          )}
          {mensaje && <span className="error" role="status">{mensaje}</span>}
        </div>
      </div>
      {constancias && constancias.length === 0 && <p className="plat-nota">Todavía no se atendió a nadie.</p>}
      {constancias && constancias.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Qué</th>
                <th>Persona (huella)</th>
                <th>Referencia</th>
                <th>Atendió</th>
              </tr>
            </thead>
            <tbody>
              {constancias.map((c) => (
                <tr key={c.id}>
                  <td className="cod">{c.id}</td>
                  <td>{c.tipo === "supresion" ? "Supresión" : "Consulta"}{c.sujeto === "contacto" ? " · contacto" : ""}</td>
                  <td className="cod">{c.huella}</td>
                  <td>{c.referencia ?? SIN_DATO}</td>
                  <td className="mut">
                    {c.atendido_por}
                    {c.atendido_en ? ` · ${c.atendido_en.slice(0, 10)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

