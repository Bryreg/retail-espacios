/* ============================================================================
   RECABRA · Plataforma — lo operativo (capítulo 1.6 de la cartera)

   Estados de cuenta y solicitudes de supresión **existen y tienen su lugar,
   pero no son análisis: son operaciones** (guion §1.5). Por eso viven en un
   cajón plegado al final del documento, con su conteo en el resumen, y lo
   único que sube a la historia es el chip de estado en la fila del cliente.

   Es la MISMA funcionalidad de la consola anterior, mudada sin cambiarle una
   regla de comportamiento:

     · cambiar el estado de cuenta con **motivo obligatorio** (también al
       reactivar) y **confirmación** antes del PATCH;
     · atender una supresión con **nota obligatoria** y confirmación, con el
       aviso de que acá no se borra nada;
     · el enlace al **reporte de transparencia** de cada cliente, que se
       enlaza y no se rediseña.

   El botón de confirmar va en TINTA, no en amarillo: el único amarillo de
   esta pantalla es la llamada #1 de la cola, y un cajón plegado no compite
   con ella.
   ========================================================================== */

import { useEffect, useState } from "react";
import { describeError } from "../../api/client";
import {
  ESTADOS_CUENTA,
  patchEstadoCliente,
  type ClientePlataforma,
  type EstadoCuenta,
} from "../../api/plataforma";
import {
  atenderSupresion,
  getSolicitudesSupresion,
  type SolicitudSupresion,
} from "../../api/derechos";
import { ESTADO_CUENTA_TXT, SIN_DATO } from "./formato";

const etiquetaSupresion = (e: SolicitudSupresion["estado"]): string =>
  e === "pendiente" ? "pendiente" : e === "atendida" ? "atendida" : "rechazada";

// ─── Estado de cuenta ──────────────────────────────────────────────────────

function EditorEstado({
  fila,
  onGuardado,
  onCancelar,
}: {
  fila: ClientePlataforma;
  onGuardado: (patch: Pick<ClientePlataforma, "estado" | "motivo" | "cambiado_en" | "cambiado_por">) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCuenta>(fila.estado);
  const [motivo, setMotivo] = useState(fila.motivo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!motivo.trim()) {
      setError("El motivo es obligatorio.");
      return;
    }
    const seguro = confirm(
      `¿Cambiar "${fila.nombre}" (${fila.slug}) a "${ESTADO_CUENTA_TXT[estado] ?? estado}"?\n\nMotivo: ${motivo.trim()}`
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      const r = await patchEstadoCliente(fila.slug, { estado, motivo: motivo.trim() });
      onGuardado({ estado: r.estado, motivo: r.motivo, cambiado_en: r.cambiado_en, cambiado_por: r.cambiado_por });
    } catch (err) {
      setError(describeError(err, "No se pudo cambiar el estado."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plat-editor">
      <div className="linea">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoCuenta)}
          aria-label={`Nuevo estado de cuenta de ${fila.nombre}`}
        >
          {ESTADOS_CUENTA.map((e) => (
            <option key={e} value={e}>
              {ESTADO_CUENTA_TXT[e] ?? e}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (obligatorio, también al reactivar)"
          aria-label={`Motivo del cambio de estado de ${fila.nombre}`}
        />
      </div>
      <div className="linea">
        <button type="button" className="plat-btn mini fuerte" onClick={guardar} disabled={busy}>
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button type="button" className="plat-btn mini" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

export function TablaEstados({
  clientes,
  error,
  abierto,
  onAbrir,
  onGuardado,
  enlaceReporte,
}: {
  clientes: ClientePlataforma[] | null;
  error: string | null;
  /** El slug en edición, o `null`. Lo maneja la página porque «Revisar la
   *  conexión» de la cola abre esta fila desde afuera. */
  abierto: string | null;
  onAbrir: (slug: string | null) => void;
  onGuardado: (slug: string, patch: Pick<ClientePlataforma, "estado" | "motivo" | "cambiado_en" | "cambiado_por">) => void;
  enlaceReporte: (slug: string) => void;
}) {
  if (error) return <div className="plat-aviso">{error}</div>;
  if (clientes === null) return <p className="plat-nota">Cargando los estados de cuenta…</p>;
  if (clientes.length === 0) return <p className="plat-nota">No hay clientes en el registro todavía.</p>;

  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Motivo</th>
            <th>Cambiado</th>
            <th>Por</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.slug} id={`plat-estado-${c.slug}`}>
              <td>
                <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                <div className="cod mut">
                  {c.slug}
                  {!c.activo && " · inactivo"}
                </div>
                {abierto === c.slug && (
                  <EditorEstado
                    fila={c}
                    onCancelar={() => onAbrir(null)}
                    onGuardado={(patch) => {
                      onGuardado(c.slug, patch);
                      onAbrir(null);
                    }}
                  />
                )}
              </td>
              <td>{ESTADO_CUENTA_TXT[c.estado] ?? c.estado}</td>
              <td>{c.motivo ?? SIN_DATO}</td>
              <td className="cod">{c.cambiado_en ? c.cambiado_en.slice(0, 10) : SIN_DATO}</td>
              <td className="cod">{c.cambiado_por ?? SIN_DATO}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  className="plat-btn mini"
                  onClick={() => onAbrir(abierto === c.slug ? null : c.slug)}
                >
                  {abierto === c.slug ? "Cerrar" : "Cambiar"}
                </button>{" "}
                <button
                  type="button"
                  className="plat-btn mini"
                  onClick={() => enlaceReporte(c.slug)}
                  title="Reporte de transparencia: qué toma la plataforma de este cliente, cómo lo calcula y quién lo consultó."
                >
                  Reporte
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Solicitudes de supresión ──────────────────────────────────────────────

function EditorSupresion({
  fila,
  onGuardado,
  onCancelar,
}: {
  fila: SolicitudSupresion;
  onGuardado: (actualizada: SolicitudSupresion) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<"atendida" | "rechazada">("atendida");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nota.trim()) {
      setError("La nota es obligatoria.");
      return;
    }
    const seguro = confirm(
      `¿Marcar la solicitud de "${fila.cliente_slug}" como "${etiquetaSupresion(estado)}"?\n\n` +
        `Nota: ${nota.trim()}\n\n` +
        "Esto NO borra nada: la supresión real, si corresponde, se ejecuta a mano, fuera del sistema."
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      onGuardado(await atenderSupresion(fila.id, { estado, nota: nota.trim() }));
    } catch (err) {
      setError(describeError(err, "No se pudo actualizar la solicitud."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plat-editor">
      <div className="linea">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as "atendida" | "rechazada")}
          aria-label={`Resolución de la solicitud de ${fila.cliente_slug}`}
        >
          <option value="atendida">Atendida</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (obligatoria)"
          aria-label={`Nota de la solicitud de ${fila.cliente_slug}`}
        />
      </div>
      <div className="linea">
        <button type="button" className="plat-btn mini fuerte" onClick={guardar} disabled={busy}>
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button type="button" className="plat-btn mini" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

/** Las supresiones se leen acá adentro y no en la página: es el único dato de
 *  la cartera que no depende del periodo ni del consolidado, y tenerlo junto a
 *  su tabla evita un estado más arriba que nadie más mira. */
export function useSupresiones() {
  const [filas, setFilas] = useState<SolicitudSupresion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getSolicitudesSupresion()
      .then((r) => {
        if (vivo) setFilas(r);
      })
      .catch((err) => {
        if (vivo) setError(describeError(err, "No se pudo leer las solicitudes de supresión."));
      });
    return () => {
      vivo = false;
    };
  }, []);

  return { filas, error, setFilas };
}

export function TablaSupresiones({
  filas,
  error,
  setFilas,
}: {
  filas: SolicitudSupresion[] | null;
  error: string | null;
  setFilas: React.Dispatch<React.SetStateAction<SolicitudSupresion[] | null>>;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);

  if (error) return <div className="plat-aviso">{error}</div>;
  if (filas === null) return <p className="plat-nota">Cargando las solicitudes…</p>;
  if (filas.length === 0) return <p className="plat-nota">No hay solicitudes de supresión todavía.</p>;

  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Quién pidió</th>
            <th>Estado</th>
            <th>Motivo</th>
            <th>Creada</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{f.cliente_slug}</div>
                {abierto === f.id && (
                  <EditorSupresion
                    fila={f}
                    onCancelar={() => setAbierto(null)}
                    onGuardado={(actualizada) => {
                      setFilas((prev) => (prev ? prev.map((x) => (x.id === f.id ? actualizada : x)) : prev));
                      setAbierto(null);
                    }}
                  />
                )}
              </td>
              <td className="cod">{f.email}</td>
              <td>{etiquetaSupresion(f.estado)}</td>
              <td>{f.motivo ?? SIN_DATO}</td>
              <td className="cod">{f.creado_en ? f.creado_en.slice(0, 10) : SIN_DATO}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {f.estado === "pendiente" ? (
                  <button
                    type="button"
                    className="plat-btn mini"
                    onClick={() => setAbierto(abierto === f.id ? null : f.id)}
                  >
                    {abierto === f.id ? "Cerrar" : "Atender"}
                  </button>
                ) : (
                  <span className="mut">
                    {f.atendido_por ?? SIN_DATO}
                    {f.atendido_en ? ` · ${f.atendido_en.slice(0, 10)}` : ""}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
