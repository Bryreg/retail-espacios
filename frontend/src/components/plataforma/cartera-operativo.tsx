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

   Y desde el 2026-09-23, el ciclo de vida de cada cliente —pedido del dueño
   de la plataforma, que tenía cinco clientes y trabaja en uno—: **renombrar**
   (sólo el nombre visible; el código no cambia), **archivar** / **reactivar**
   (reversible, con motivo) y **borrar** (irreversible: sólo un cliente ya
   archivado, nunca el de la base principal, escribiendo su código). Cada
   paso pide confirmación con lo que va a pasar dicho en palabras.

   Y **pasar a la base principal**: los datos de un cliente reemplazan a los
   del principal (el de la instalación original, `galerias`), y el origen queda
   archivado de respaldo. Es lo que pidió el dueño de la plataforma cuando su
   supermercado real vivía con el código `pepito`: que quedara como Galerías
   «desde el código», no sólo de nombre. Ver `backend/app/services/traspaso.py`.

   El botón de confirmar va en TINTA, no en amarillo: el único amarillo de
   esta pantalla es la llamada #1 de la cola, y un cajón plegado no compite
   con ella.
   ========================================================================== */

import { useEffect, useState } from "react";
import { describeError } from "../../api/client";
import {
  ESTADOS_CUENTA,
  archivarCliente,
  borrarCliente,
  pasarAlPrincipal,
  patchEstadoCliente,
  reactivarCliente,
  renombrarCliente,
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

// ─── El ciclo de vida: renombrar, archivar, reactivar, borrar, pasar ────────

type AccionCiclo = "renombrar" | "archivar" | "reactivar" | "borrar" | "principal";

/** Lo que cada acción le cuenta a quien está por confirmarla. */
function confirmacionDe(
  accion: AccionCiclo,
  fila: ClientePlataforma,
  valor: string,
  principal: ClientePlataforma | null,
): string {
  const quien = `«${fila.nombre}» (${fila.slug})`;
  if (accion === "principal" && principal) {
    return (
      `¿Reemplazar los datos de «${principal.nombre}» (${principal.slug}) con los de ${quien}?\n\n` +
      `Lo que hoy tiene ${principal.nombre} se pierde. ${fila.nombre} queda archivado, intacto, de ` +
      `respaldo. Se cierran las sesiones abiertas de los dos.`
    );
  }
  if (accion === "renombrar") {
    return `¿Renombrar ${quien} a «${valor}»?\n\nEl código no cambia: nadie pierde la sesión.`;
  }
  if (accion === "archivar") {
    return (
      `¿Archivar ${quien}?\n\nNadie va a poder entrar, deja de aparecer en el ingreso y en el ` +
      `análisis de la consola, y sus datos quedan intactos. Se puede reactivar.\n\nMotivo: ${valor}`
    );
  }
  if (accion === "reactivar") {
    return `¿Reactivar ${quien}?\n\nSus usuarios vuelven a poder entrar.\n\nMotivo: ${valor}`;
  }
  return (
    `¿Borrar ${quien} PARA SIEMPRE?\n\nSe elimina su base —sedes, planos, contratos, proveedores— ` +
    `y sus usuarios pierden el acceso. No hay forma de deshacerlo.`
  );
}

function EditorCiclo({
  fila,
  accion,
  principal,
  onHecho,
  onCancelar,
}: {
  fila: ClientePlataforma;
  accion: AccionCiclo;
  /** El cliente de la base principal: el que recibe los datos al «pasar». */
  principal: ClientePlataforma | null;
  /** El cambio a mezclar en la fila, o `null` si la fila se borró. */
  onHecho: (patch: Partial<ClientePlataforma> | null) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(accion === "renombrar" ? fila.nombre : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valor = accion === "renombrar" ? texto.replace(/\s+/g, " ").trim() : texto.trim();
  // Borrar se confirma con el código de ESTE cliente; pasar a la base
  // principal, con el del principal, que es el que pierde lo que tenía.
  const codigoOk =
    accion === "borrar" ? valor.toLowerCase() === fila.slug
    : accion === "principal" ? !!principal && valor.toLowerCase() === principal.slug
    : true;

  const guardar = async () => {
    if (!valor) {
      setError(accion === "renombrar" ? "El nombre no puede quedar vacío." : "El motivo es obligatorio.");
      return;
    }
    if (!codigoOk) {
      setError(`Escribí el código exacto: ${accion === "principal" ? principal?.slug ?? "" : fila.slug}`);
      return;
    }
    if (!confirm(confirmacionDe(accion, fila, valor, principal))) return;
    setBusy(true);
    setError(null);
    try {
      if (accion === "renombrar") onHecho({ nombre: (await renombrarCliente(fila.slug, valor)).nombre });
      else if (accion === "archivar") onHecho({ activo: (await archivarCliente(fila.slug, valor)).activo });
      else if (accion === "reactivar") onHecho({ activo: (await reactivarCliente(fila.slug, valor)).activo });
      else if (accion === "principal") {
        const r = await pasarAlPrincipal(fila.slug, valor);
        alert(
          `Listo: los datos de «${fila.nombre}» ya están en «${principal?.nombre ?? r.principal}» ` +
            `(${r.filas.spaces ?? 0} espacios, ${r.filas.space_leases ?? 0} contratos, ` +
            `${r.filas.suppliers ?? 0} proveedores).\n\n«${fila.nombre}» quedó archivado de respaldo: ` +
            `cuando confirmes que está todo, lo podés borrar. Las sesiones abiertas se cerraron; si la ` +
            `tuya era una de ellas, vas a volver a la pantalla de ingreso.`,
        );
        onHecho({ activo: false });
      } else {
        await borrarCliente(fila.slug, valor);
        onHecho(null);
      }
    } catch (err) {
      setError(describeError(err, "No se pudo completar."));
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    accion === "renombrar" ? "Nombre visible del cliente"
    : accion === "borrar" ? `Escribí ${fila.slug} para confirmar`
    : accion === "principal" ? `Escribí ${principal?.slug ?? ""} para confirmar`
    : "Motivo (obligatorio)";
  const boton =
    accion === "renombrar" ? "Guardar nombre"
    : accion === "archivar" ? "Confirmar archivo"
    : accion === "reactivar" ? "Confirmar reactivación"
    : accion === "principal" ? `Reemplazar ${principal?.nombre ?? "el principal"}`
    : "Borrar para siempre";

  return (
    <div className="plat-editor">
      {accion === "renombrar" && (
        <p className="plat-nota" style={{ margin: "0 0 var(--s2)" }}>
          Cambia sólo el nombre que se ve. El código <span className="cod">{fila.slug}</span> no cambia.
        </p>
      )}
      {accion === "archivar" && (
        <p className="plat-nota" style={{ margin: "0 0 var(--s2)" }}>
          Nadie entra, sale del ingreso y del análisis, y los datos quedan intactos. Se deshace con «Reactivar».
        </p>
      )}
      {accion === "borrar" && (
        <p className="plat-nota plat-peligro" style={{ margin: "0 0 var(--s2)" }}>
          Borra la base de «{fila.nombre}» con todo lo que tiene. <b>No se puede deshacer.</b>
        </p>
      )}
      {accion === "principal" && principal && (
        <p className="plat-nota plat-peligro" style={{ margin: "0 0 var(--s2)" }}>
          Los datos de «{fila.nombre}» —sedes, planos, contratos, proveedores, archivos y
          configuración— pasan a «{principal.nombre}» (<span className="cod">{principal.slug}</span>), la
          base principal, y <b>reemplazan lo que tiene hoy: eso se pierde.</b> Las cuentas y las
          invitaciones de «{fila.nombre}» pasan a «{principal.nombre}», y «{fila.nombre}» queda archivado,
          intacto, de respaldo. Se cierran las sesiones abiertas de los dos: antes, fijate que no quede
          nada sin guardar.
        </p>
      )}
      <div className="linea">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          aria-label={`${boton}: ${fila.nombre}`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="linea">
        <button
          type="button"
          className={`plat-btn mini ${accion === "borrar" || accion === "principal" ? "peligro" : "fuerte"}`}
          onClick={guardar}
          disabled={busy || !valor || !codigoOk}
        >
          {busy ? "Un momento…" : boton}
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
  onBorrado,
  onCicloCambiado,
  enlaceReporte,
}: {
  clientes: ClientePlataforma[] | null;
  error: string | null;
  /** El slug en edición, o `null`. Lo maneja la página porque «Revisar la
   *  conexión» de la cola abre esta fila desde afuera. */
  abierto: string | null;
  onAbrir: (slug: string | null) => void;
  onGuardado: (slug: string, patch: Partial<ClientePlataforma>) => void;
  /** La fila se borró para siempre: sale de la lista. */
  onBorrado: (slug: string) => void;
  /** Cambió qué clientes cuentan (archivar, reactivar, borrar, renombrar):
   *  el análisis de arriba se vuelve a pedir. */
  onCicloCambiado: () => void;
  enlaceReporte: (slug: string) => void;
}) {
  // Qué editor del ciclo está abierto, y en qué fila. Local: nadie de afuera
  // abre estos, a diferencia del de estado.
  const [ciclo, setCiclo] = useState<{ slug: string; accion: AccionCiclo } | null>(null);
  const principal = clientes?.find((c) => c.base_principal) ?? null;
  const abrirCiclo = (slug: string, accion: AccionCiclo) => {
    onAbrir(null);
    setCiclo((actual) => (actual?.slug === slug && actual.accion === accion ? null : { slug, accion }));
  };

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
            <tr key={c.slug} id={`plat-estado-${c.slug}`} className={c.activo ? undefined : "plat-archivado"}>
              <td>
                <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                <div className="cod mut">
                  {c.slug}
                  {!c.activo && " · archivado"}
                  {c.base_principal && " · base principal"}
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
                {ciclo?.slug === c.slug && (
                  <EditorCiclo
                    key={ciclo.accion}
                    fila={c}
                    accion={ciclo.accion}
                    principal={principal}
                    onCancelar={() => setCiclo(null)}
                    onHecho={(patch) => {
                      setCiclo(null);
                      if (patch === null) onBorrado(c.slug);
                      else onGuardado(c.slug, patch);
                      onCicloCambiado();
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
                  onClick={() => {
                    setCiclo(null);
                    onAbrir(abierto === c.slug ? null : c.slug);
                  }}
                >
                  {abierto === c.slug ? "Cerrar" : "Cambiar"}
                </button>{" "}
                <button type="button" className="plat-btn mini" onClick={() => abrirCiclo(c.slug, "renombrar")}>
                  Renombrar
                </button>{" "}
                {c.activo ? (
                  <button type="button" className="plat-btn mini" onClick={() => abrirCiclo(c.slug, "archivar")}>
                    Archivar
                  </button>
                ) : (
                  <button type="button" className="plat-btn mini" onClick={() => abrirCiclo(c.slug, "reactivar")}>
                    Reactivar
                  </button>
                )}{" "}
                {/* Sólo un cliente ACTIVO: el archivado es el respaldo de un
                    traspaso, y pasarlo otra vez pisaría lo trabajado después. */}
                {c.activo && !c.base_principal && principal && (
                  <>
                    <button
                      type="button"
                      className="plat-btn mini"
                      onClick={() => abrirCiclo(c.slug, "principal")}
                      title={`Sus datos reemplazan a los de ${principal.nombre} (${principal.slug}); este queda archivado de respaldo.`}
                    >
                      Pasar a la base principal
                    </button>{" "}
                  </>
                )}
                {!c.activo && !c.base_principal && (
                  <>
                    <button
                      type="button"
                      className="plat-btn mini peligro"
                      onClick={() => abrirCiclo(c.slug, "borrar")}
                      title="Borra la base de este cliente para siempre. Sólo se ofrece con el cliente archivado."
                    >
                      Borrar
                    </button>{" "}
                  </>
                )}
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
