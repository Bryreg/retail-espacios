import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, LogOut, X, Send, ShieldCheck, Download, ShieldAlert } from "lucide-react";
import StoreEditor3D from "../components/StoreEditor3D/StoreEditor3D";
import FloorPlan2D from "../components/FloorPlan2D/FloorPlan2D";
import DashboardView from "./DashboardView";
import MountView from "./MountView";
import SyncStatus from "../components/SyncStatus/SyncStatus";
import AvisoCuentaBanner from "../components/AvisoCuentaBanner";
import { soyOperador } from "../api/plataforma";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import {
  updatePasswords,
  getNotificationConfig,
  updateNotificationConfig,
  sendTestNotification,
  getContacts,
  saveContacts,
  getBitacora,
  getAccionesBitacora,
  getUsuarios,
  invitarUsuario,
  setMiembroActivo,
  type ContactBook,
  type LineaBitacora,
  type Miembro,
  type UsuariosResponse,
} from "../api/auth";
import { describeError } from "../api/client";
import { descargarMiExport, solicitarSupresion } from "../api/derechos";
import { useFixtureStore } from "../store/fixtureStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "map" | "store" | "kpis" | "montaje";

/** Código que venía en el enlace del correo de montaje (`?montar=NAVE-PUN-01`).
 *
 *  Se lee AL CARGAR EL MÓDULO y no dentro de un componente. La primera versión
 *  lo hacía en un inicializador de `useState`, y bajo StrictMode React invoca
 *  ese inicializador dos veces: la primera leía el código y limpiaba la URL, la
 *  segunda ya no encontraba nada, y ese null era el valor que quedaba. El
 *  enlace del correo abría el resumen en vez del espacio.
 *
 *  Leerlo acá ocurre exactamente una vez, antes de que React renderice, y la
 *  URL queda limpia para que recargar no reabra siempre el mismo espacio. */
const MOUNT_DEEP_LINK: string | null = (() => {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("montar");
  if (!code) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete("montar");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  return code;
})();

// ─── Logo mark ────────────────────────────────────────────────────────────────

// ─── Settings modal (admin) ──────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, padding: "0 10px",
  borderRadius: "var(--r-md)", border: "1px solid var(--line)",
  background: "var(--surface-2)", color: "var(--ink-1)",
  fontSize: 12.5, fontFamily: "inherit", outline: "none",
};

// Era 10px en mayúsculas con tracking, en CADA sección. El catálogo lo llama
// «eyebrow on every section» y la recomendación es sacarlo: que mande el título.
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600,
  color: "var(--ink-1)", marginBottom: 10,
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 500,
  color: "var(--ink-2)", marginBottom: 4,
};

function ActionButton({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 32, padding: "0 14px",
        borderRadius: "var(--r-md)",
        background: primary ? "var(--accent)" : "var(--surface)",
        color: primary ? "#fff" : "var(--ink-2)",
        border: primary ? "none" : "1px solid var(--line)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: 12, fontWeight: 600, fontFamily: "inherit",
        boxShadow: "var(--shadow-xs)",
        transition: "opacity .12s",
      }}
    >
      {children}
    </button>
  );
}

type Feedback = { ok: boolean; text: string } | null;

function FeedbackNote({ msg }: { msg: Feedback }) {
  if (!msg) return null;
  return (
    <div
      style={{
        marginTop: 8, fontSize: 11.5, fontWeight: 500,
        color: msg.ok ? "var(--success)" : "var(--danger)",
      }}
    >
      {msg.text}
    </div>
  );
}

/** Comma-separated text ⇄ address list. The book is typed by hand by one
 *  person, so a text field beats any chip widget for the amount of editing
 *  this actually gets — once a year, when someone changes job. */
const asText = (list?: string[]) => (list ?? []).join(", ");
const asList = (text: string) =>
  text.split(",").map((s) => s.trim()).filter(Boolean);

/** Who gets told when a contract is saved.
 *
 *  Split by role because the messages differ, not just the addresses: the
 *  merchandiser receives a work order with no money in it. Before this, one
 *  global list got a single email carrying the negotiated value — which handed
 *  prices to the person whose job is to mount the display. */
function ContactsSection({ sedes }: { sedes: string[] }) {
  const [book, setBook] = useState<ContactBook | null>(null);
  const [msg, setMsg] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getContacts()
      .then(setBook)
      .catch(() => setMsg({ ok: false, text: "No se pudo cargar la libreta de contactos." }));
  }, []);

  if (!book) {
    return (
      <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
        <div style={sectionLabelStyle}>Quién recibe los avisos</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Cargando…</div>
      </div>
    );
  }

  const setSedeRole = (sede: string, role: "admin" | "mercaderista", text: string) =>
    setBook({
      ...book,
      by_sede: {
        ...book.by_sede,
        [sede]: {
          admin: book.by_sede[sede]?.admin ?? [],
          mercaderista: book.by_sede[sede]?.mercaderista ?? [],
          [role]: asList(text),
        },
      },
    });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setBook(await saveContacts(book));
      setMsg({ ok: true, text: "Contactos guardados." });
    } catch {
      setMsg({ ok: false, text: "No se pudieron guardar los contactos." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Quién recibe los avisos</div>
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "-4px 0 12px", lineHeight: 1.5 }}>
        Al guardar un contrato sale un aviso por rol. El gerente y el administrador de la
        sede reciben el resumen comercial con el valor; el mercaderista recibe la orden de
        montaje <strong>sin valores</strong>. Varios correos separados por coma.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabelStyle}>Gerente operacional · recibe todas las sedes</label>
        <input
          type="text"
          value={asText(book.gerente)}
          onChange={(e) => setBook({ ...book, gerente: asList(e.target.value) })}
          placeholder="gerente@empresa.com"
          style={inputStyle}
        />
      </div>

      {sedes.map((sede) => (
        <div
          key={sede}
          style={{
            marginBottom: 10, padding: "10px 12px",
            border: "1px solid var(--line)", borderRadius: "var(--r-md)",
            background: "var(--surface-2)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600,
              color: "var(--ink-1)", marginBottom: 8,
            }}
          >
            {sede}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <label style={fieldLabelStyle}>Administrador de sede</label>
              <input
                type="text"
                value={asText(book.by_sede[sede]?.admin)}
                onChange={(e) => setSedeRole(sede, "admin", e.target.value)}
                placeholder="admin.sede@empresa.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Mercaderista · sin valores</label>
              <input
                type="text"
                value={asText(book.by_sede[sede]?.mercaderista)}
                onChange={(e) => setSedeRole(sede, "mercaderista", e.target.value)}
                placeholder="mercaderista@empresa.com"
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 12 }}>
        <ActionButton onClick={save} disabled={busy} primary>
          {busy ? "Guardando…" : "Guardar contactos"}
        </ActionButton>
      </div>
      <FeedbackNote msg={msg} />
    </div>
  );
}

// ─── Usuarios (Fase 1 identidad) ────────────────────────────────────────────

/** `owner`/`admin`/`worker` → la palabra que la persona espera leer, no el
 *  nombre de la columna. */
function rolLabelUsuario(rol: Miembro["rol"]): string {
  if (rol === "owner") return "Dueño";
  if (rol === "admin") return "Administrador";
  return "Trabajador";
}

/** Miembros con cuenta individual (Google/correo) e invitaciones que
 *  todavía nadie aceptó, para el cliente de la sesión actual — el token
 *  manda, no hay selector de cliente acá.
 *
 *  Convive con "Claves de acceso" de arriba a propósito: mientras dure la
 *  transición de la Fase 1 los dos caminos entran al mismo lugar, y quien
 *  administra necesita ver los dos para saber a quién todavía le falta
 *  pasarse a cuenta propia. */
function UsuariosSection() {
  const [datos, setDatos] = useState<UsuariosResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<Feedback>(null);

  const [invEmail, setInvEmail] = useState("");
  const [invRol, setInvRol] = useState<Miembro["rol"]>("worker");
  const [invitando, setInvitando] = useState(false);
  const [invMsg, setInvMsg] = useState<Feedback>(null);

  // Qué fila está a mitad de un activar/desactivar, para deshabilitar sólo
  // ESE botón y no toda la sección mientras viaja el PATCH.
  const [cambiando, setCambiando] = useState<number | null>(null);

  const cargar = () => {
    setCargando(true);
    setMsg(null);
    getUsuarios()
      .then(setDatos)
      .catch((err) => setMsg({ ok: false, text: describeError(err, "No se pudo leer la lista de usuarios.") }))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, []);

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim() || invitando) return;
    setInvitando(true);
    setInvMsg(null);
    try {
      await invitarUsuario({ email: invEmail.trim(), rol: invRol });
      setInvMsg({ ok: true, text: `Invitación enviada a ${invEmail.trim()}.` });
      setInvEmail("");
      cargar();
    } catch (err) {
      // 409: la persona ya es miembro de este cliente — describeError ya
      // trae el detalle del backend, no hace falta inventar uno genérico.
      setInvMsg({ ok: false, text: describeError(err, "No se pudo enviar la invitación.") });
    } finally {
      setInvitando(false);
    }
  };

  const cambiarActivo = async (m: Miembro) => {
    // Desactivar le corta el acceso YA — a mitad de un turno de trabajo si
    // hace falta. Reactivar es reversible y no lo pide; apagar sí.
    if (m.activo) {
      const seguro = confirm(
        `¿Desactivar a ${m.nombre || m.email}? Pierde el acceso a este supermercado de inmediato.`
      );
      if (!seguro) return;
    }
    setCambiando(m.id);
    setMsg(null);
    try {
      await setMiembroActivo(m.id, !m.activo);
      // El endpoint sólo confirma `{ok}`, no manda la fila de vuelta: se
      // actualiza la copia local a mano en vez de re-pedir toda la lista.
      setDatos((prev) =>
        prev
          ? {
              ...prev,
              miembros: prev.miembros.map((x) => (x.id === m.id ? { ...x, activo: !m.activo } : x)),
            }
          : prev
      );
    } catch (err) {
      setMsg({ ok: false, text: describeError(err, "No se pudo actualizar la membresía.") });
    } finally {
      setCambiando(null);
    }
  };

  return (
    <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Usuarios</div>
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "-4px 0 12px", lineHeight: 1.5 }}>
        Cuentas individuales con Google o correo, para este supermercado. Conviven
        con la clave compartida de arriba mientras dure la transición.
      </p>

      {/* Invitar */}
      <form onSubmit={invitar} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabelStyle}>Invitar por correo</label>
          <input
            type="email"
            value={invEmail}
            onChange={(e) => setInvEmail(e.target.value)}
            placeholder="persona@empresa.com"
            style={inputStyle}
          />
        </div>
        <div style={{ width: 120 }}>
          <label style={fieldLabelStyle}>Rol</label>
          <select
            value={invRol}
            onChange={(e) => setInvRol(e.target.value as Miembro["rol"])}
            style={inputStyle}
          >
            <option value="worker">Trabajador</option>
            <option value="admin">Administrador</option>
            <option value="owner">Dueño</option>
          </select>
        </div>
        <ActionButton onClick={() => {}} disabled={invitando || !invEmail.trim()} primary>
          {invitando ? "Enviando…" : "Invitar"}
        </ActionButton>
      </form>
      <FeedbackNote msg={invMsg} />

      {cargando ? (
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>Cargando…</div>
      ) : datos ? (
        <>
          {datos.miembros.length === 0 && datos.invitaciones.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
              Todavía nadie entró con cuenta propia en este supermercado.
            </div>
          ) : (
            <div
              style={{
                marginTop: 4,
                border: "1px solid var(--line)", borderRadius: "var(--r-md)",
                background: "var(--surface-2)", overflow: "hidden",
              }}
            >
              {datos.miembros.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 600,
                      color: m.activo ? "var(--ink-1)" : "var(--ink-4)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {m.nombre || m.email}
                    </div>
                    <div style={{
                      fontSize: 11, color: "var(--ink-3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {m.email} · {rolLabelUsuario(m.rol)}
                      {!m.activo && " · desactivado"}
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
                    {m.ultimo_login ? haceCuanto(m.ultimo_login) : "nunca entró"}
                  </div>
                  <button
                    onClick={() => cambiarActivo(m)}
                    disabled={cambiando === m.id}
                    style={{
                      height: 26, padding: "0 10px",
                      borderRadius: "var(--r-md)",
                      border: `1px solid ${m.activo ? "var(--danger)" : "var(--line)"}`,
                      background: "var(--surface)",
                      color: m.activo ? "var(--danger)" : "var(--ink-2)",
                      fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                      cursor: cambiando === m.id ? "default" : "pointer",
                      opacity: cambiando === m.id ? 0.55 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cambiando === m.id ? "…" : m.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))}

              {datos.invitaciones.map((inv) => (
                <div
                  key={inv.email}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 600, color: "var(--ink-3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.email}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                      Invitación pendiente · {rolLabelUsuario(inv.rol)}
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
                    {fraseVencimiento(inv.expira_en)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      <FeedbackNote msg={msg} />
    </div>
  );
}

// ─── Bitácora ─────────────────────────────────────────────────────────────────

/** Cuándo pasó, en la unidad que uno pregunta.
 *
 *  "Hace 3 min" contesta lo que importa cuando algo acaba de pasar; la fecha
 *  entera contesta lo que importa cuando el proveedor reclama por algo de hace
 *  dos meses. Las dos están: una en la línea, la otra al pasar el mouse. */
function haceCuanto(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const seg = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (seg < 60) return "recién";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(t).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

/** Cuándo vence una invitación, en la misma unidad relativa que el resto de
 *  la pantalla — "vence en 3 d" y no una fecha ISO que hay que traducir de
 *  cabeza. Frase completa (no sólo el número) porque "vencida" sola no
 *  admite el prefijo "vence " sin sonar mal. */
function fraseVencimiento(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const seg = Math.round((t - Date.now()) / 1000);
  if (seg <= 0) return "vencida";
  const min = Math.round(seg / 60);
  if (min < 60) return `vence en ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vence en ${h} h`;
  const d = Math.round(h / 24);
  return `vence en ${d} d`;
}

const exacto = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

/** De qué clase es la línea, para poder encontrarla sin leerlas todas.
 *
 *  Antes esto pintaba una barrita de color al costado de cada fila. El
 *  catálogo de tells de diseño generado la llama «la señal más confiable de
 *  todas», y con razón: es decoración que finge ser información.
 *
 *  Ahora el color va en el TÍTULO de la línea, que es lo que uno lee. Un
 *  borrado se ve rojo porque la palabra «borrado» está en rojo, no porque
 *  tenga un adorno al lado. Lo demás queda en tinta: si algo tiene color, es
 *  porque hay que mirarlo. */
function tonoDe(accion: string): string {
  if (accion.endsWith(".baja")) return "var(--danger)";
  if (accion === "login.fallo") return "var(--warning)";
  return "var(--ink-1)";
}

function BitacoraSection() {
  const [lineas, setLineas] = useState<LineaBitacora[]>([]);
  const [catalogo, setCatalogo] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState("");
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<Feedback>(null);

  const cargar = (accion: string) => {
    setCargando(true);
    setMsg(null);
    getBitacora({ limite: 60, accion: accion || undefined })
      .then(setLineas)
      .catch((err) => setMsg({ ok: false, text: describeError(err, "No se pudo leer la bitácora.") }))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    getAccionesBitacora().then(setCatalogo).catch(() => setCatalogo({}));
  }, []);

  useEffect(() => { cargar(filtro); }, [filtro]);

  return (
    <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ ...sectionLabelStyle, flex: 1 }}>Bitácora</div>
        <button
          onClick={() => cargar(filtro)}
          title="Volver a leer"
          style={{
            background: "transparent", border: "none", padding: 0,
            color: "var(--accent)", cursor: "pointer",
            fontSize: 11, fontWeight: 600, fontFamily: "inherit",
          }}
        >
          Actualizar
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
        Contratos, documentos, borrados e ingresos. Se guarda un año.
      </div>

      <select
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ ...inputStyle, marginBottom: 10 }}
      >
        <option value="">Todo</option>
        {Object.entries(catalogo).map(([codigo, nombre]) => (
          <option key={codigo} value={codigo}>{nombre}</option>
        ))}
      </select>

      {cargando ? (
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Leyendo…</div>
      ) : lineas.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {filtro ? "Nada de eso todavía." : "Todavía no hay nada anotado."}
        </div>
      ) : (
        <div
          style={{
            maxHeight: 280, overflowY: "auto",
            border: "1px solid var(--line)", borderRadius: "var(--r-md)",
            background: "var(--surface-2)",
          }}
        >
          {lineas.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "7px 10px",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: tonoDe(l.accion) }}>
                  {l.titulo}
                </div>
                {l.detalle && (
                  <div
                    style={{
                      fontSize: 11.5, color: "var(--ink-2)", marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={l.detalle}
                  >
                    {l.detalle}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 10.5, color: "var(--ink-4)", marginTop: 2,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {l.rol} · {l.ip}
                </div>
              </div>
              <div
                style={{ fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap", paddingTop: 1 }}
                title={exacto(l.at)}
              >
                {haceCuanto(l.at)}
              </div>
            </div>
          ))}
        </div>
      )}
      <FeedbackNote msg={msg} />
    </div>
  );
}

/** "Tus datos" (Fase 3, Ley 1581/2012): derechos del titular, propios de esta
 *  fase y en su propio archivo (`api/derechos.ts`) -- no comparten código con
 *  el resto de Configuración a propósito, porque su frontera es distinta: acá
 *  no importa el rol del JWT (que siempre es "admin" para un owner, Fase 1,
 *  decisión 5) sino la membresía real, y eso el backend lo resuelve solo. El
 *  frontend no intenta adivinar "sos owner": deja que el 403 lo diga y lo
 *  traduce a un mensaje que se entiende. */
function TusDatosSection() {
  const [descargando, setDescargando] = useState(false);
  const [exportMsg, setExportMsg] = useState<Feedback>(null);

  const [motivo, setMotivo] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [supresionMsg, setSupresionMsg] = useState<Feedback>(null);

  const bajarExport = async () => {
    setDescargando(true);
    setExportMsg(null);
    try {
      await descargarMiExport();
      setExportMsg({ ok: true, text: "Descarga iniciada." });
    } catch (err) {
      setExportMsg({
        ok: false,
        text: describeError(err, "No se pudo generar el export."),
      });
    } finally {
      setDescargando(false);
    }
  };

  const pedirSupresion = async () => {
    const seguro = confirm(
      "Esto NO borra nada ahora mismo: registra un pedido de supresión que revisa el " +
        "operador de la plataforma, y la ejecución (si corresponde) la hace a mano. " +
        "¿Confirmás la solicitud?"
    );
    if (!seguro) return;
    setPidiendo(true);
    setSupresionMsg(null);
    try {
      await solicitarSupresion(motivo.trim() || undefined);
      setSupresionMsg({
        ok: true,
        text: "Solicitud registrada. El operador de la plataforma la va a revisar.",
      });
      setMotivo("");
    } catch (err) {
      setSupresionMsg({
        ok: false,
        text: describeError(err, "No se pudo registrar la solicitud."),
      });
    } finally {
      setPidiendo(false);
    }
  };

  return (
    <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Tus datos</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.5 }}>
        Política de Tratamiento de Datos Personales (Ley 1581/2012). Estas dos acciones sólo
        las puede hacer quien fundó el cliente -- si no sos el owner, el sistema te lo va a decir.
      </div>

      <div style={{ marginBottom: 14 }}>
        <ActionButton onClick={bajarExport} disabled={descargando}>
          <Download size={12} />
          {descargando ? "Generando…" : "Descargar mis datos"}
        </ActionButton>
        <FeedbackNote msg={exportMsg} />
      </div>

      <div>
        <label style={fieldLabelStyle}>Solicitar supresión (motivo opcional)</label>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por qué querés que se suprima el cliente"
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <ActionButton onClick={pedirSupresion} disabled={pidiendo}>
          <ShieldAlert size={12} />
          {pidiendo ? "Enviando…" : "Solicitar supresión"}
        </ActionButton>
        <FeedbackNote msg={supresionMsg} />
      </div>
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  // Passwords
  const [adminPw, setAdminPw] = useState("");
  const [workerPw, setWorkerPw] = useState("");
  const [pwMsg, setPwMsg] = useState<Feedback>(null);

  // Notifications
  const [emails, setEmails] = useState("");
  const [days, setDays] = useState("");
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgMsg, setCfgMsg] = useState<Feedback>(null);
  const [testMsg, setTestMsg] = useState<Feedback>(null);

  const [busy, setBusy] = useState<"pw" | "cfg" | "test" | null>(null);

  // Para reemplazar el token propio cuando el admin cambia su propia clave.
  const setAuth = useAuthStore((s) => s.setAuth);

  // The contact book is keyed by sede, so it needs the same list the rest of
  // the app uses rather than a second one that could drift out of step.
  const sedes = useFixtureStore((s) => s.sedes);

  useEffect(() => {
    getNotificationConfig()
      .then((c) => {
        setEmails(c.notify_emails);
        setDays(c.reminder_days);
      })
      .catch(() =>
        setCfgMsg({ ok: false, text: "No se pudo cargar la configuración de notificaciones." })
      )
      .finally(() => setCfgLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const savePasswords = async () => {
    const payload: { admin_password?: string; worker_password?: string } = {};
    if (adminPw.trim()) payload.admin_password = adminPw.trim();
    if (workerPw.trim()) payload.worker_password = workerPw.trim();
    if (!payload.admin_password && !payload.worker_password) {
      setPwMsg({ ok: false, text: "Ingresa al menos una clave nueva." });
      return;
    }
    setBusy("pw");
    setPwMsg(null);
    try {
      const r = await updatePasswords(payload);
      // Cambiar la clave del admin cierra TODAS las sesiones de admin, incluida
      // esta. El backend manda un token nuevo justamente para que quien acaba
      // de guardar no salga expulsado de la pantalla.
      if (r.token) setAuth(r.token, "admin");
      const cerradas = payload.admin_password
        ? "Se cerraron las demás sesiones de administrador."
        : "Las sesiones de trabajador abiertas se cerraron.";
      setPwMsg({ ok: true, text: `Claves actualizadas. ${cerradas}` });
      setAdminPw("");
      setWorkerPw("");
    } catch (err) {
      setPwMsg({ ok: false, text: describeError(err, "No se pudieron actualizar las claves.") });
    } finally {
      setBusy(null);
    }
  };

  const saveConfig = async () => {
    setBusy("cfg");
    setCfgMsg(null);
    try {
      await updateNotificationConfig({ notify_emails: emails, reminder_days: days });
      setCfgMsg({ ok: true, text: "Configuración guardada." });
    } catch {
      setCfgMsg({ ok: false, text: "No se pudo guardar la configuración." });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setTestMsg(null);
    try {
      const res = await sendTestNotification();
      setTestMsg({ ok: res.ok, text: res.detail });
    } catch {
      setTestMsg({ ok: false, text: "No se pudo enviar el correo de prueba." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(22,21,15,0.28)",
        display: "flex", alignItems: "stretch", justifyContent: "flex-end",
      }}
    >
      {/* Panel lateral, no diálogo centrado. El centrado con overlay negro y la
          X arriba a la derecha es, palabra por palabra, el «modal default» del
          catálogo. Y acá el lateral además es mejor: configurar no es una
          interrupción de un paso, es una mesa de trabajo que se abre al lado
          de lo que estabas mirando. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, height: "100%", overflowY: "auto",
          background: "var(--surface)",
          borderLeft: "1px solid var(--line-strong)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "13px 18px",
            borderBottom: "1px solid var(--line-strong)",
            position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
          }}
        >
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "var(--ink-1)" }}>
            Configuración
          </span>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--r-md)",
              background: "transparent", border: "none",
              color: "var(--ink-2)", cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Passwords */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={sectionLabelStyle}>Claves de acceso</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
            Mínimo 8 caracteres. Al cambiar una clave se cierran las sesiones abiertas
            de ese rol: avisá antes a quien la use.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={fieldLabelStyle}>Clave administrador</label>
              <input
                type="password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="Sin cambio"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Clave trabajador</label>
              <input
                type="password"
                value={workerPw}
                onChange={(e) => setWorkerPw(e.target.value)}
                placeholder="Sin cambio"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <ActionButton onClick={savePasswords} disabled={busy !== null} primary>
              {busy === "pw" ? "Guardando…" : "Guardar claves"}
            </ActionButton>
          </div>
          <FeedbackNote msg={pwMsg} />
        </div>

        <UsuariosSection />

        {/* Notifications */}
        <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
          <div style={sectionLabelStyle}>Notificaciones por correo</div>
          {cfgLoading ? (
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Cargando configuración…</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={fieldLabelStyle}>Correos destinatarios (separados por coma)</label>
                <input
                  type="text"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="correo1@dominio.com, correo2@dominio.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={fieldLabelStyle}>Días de recordatorio antes del vencimiento</label>
                <input
                  type="text"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder="30,15,7,1"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ActionButton onClick={saveConfig} disabled={busy !== null} primary>
                  {busy === "cfg" ? "Guardando…" : "Guardar notificaciones"}
                </ActionButton>
                <ActionButton onClick={sendTest} disabled={busy !== null}>
                  <Send size={12} />
                  {busy === "test" ? "Enviando…" : "Enviar correo de prueba"}
                </ActionButton>
              </div>
              <FeedbackNote msg={cfgMsg} />
              <FeedbackNote msg={testMsg} />
            </>
          )}
        </div>

        <ContactsSection sedes={sedes} />

        <TusDatosSection />

        <BitacoraSection />
      </div>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

/** Las pestañas, con una frase que dice para qué sirve cada una.
 *
 *  Los nombres solos no alcanzaban: "Plano" y "Editor 3D" suenan a lo mismo, y
 *  desde ninguno de los dos se adivina que el contrato se llena ahí adentro.
 *  Quedan tres del trabajo diario —la sede, los montajes— separadas del diseño
 *  de la tienda, que es donde se entra una vez cada tanto y no todos los días.
 *
 *  Eran cuatro. Negociar y Resumen abrían las dos con el plano de la misma
 *  sede y se diferenciaban en poco más que el orden de las tarjetas, así que
 *  la pregunta "¿en cuál de las dos hago el contrato?" no tenía buena
 *  respuesta. Ahora hay una sola, y el contrato vive al lado del mapa. */
const TABS: {
  id: ViewMode; label: string; para: string; grupo: "operar" | "diseñar";
}[] = [
  // Negociar y Resumen eran dos pestañas que mostraban casi lo mismo: las dos
  // abrían con el plano de la sede. Ahora son una sola — el mapa es el mismo y
  // el contrato se llena en el riel de la derecha, sin cambiar de pantalla.
  { id: "kpis",     label: "Sede", grupo: "operar",
    para: "Cómo va la sede y dónde se vende: tocás un espacio en el mapa y llenás el contrato ahí mismo" },
  { id: "montaje",  label: "Montajes",    grupo: "operar",
    para: "Confirmar con foto que la exhibición quedó armada" },
  { id: "map",      label: "Plano",   grupo: "diseñar",
    para: "Dibujar la tienda vista desde arriba y editar los muebles" },
  { id: "store",    label: "Editor 3D",       grupo: "diseñar",
    para: "Ver la tienda en 3D y aplicar las artes del proveedor" },
];

interface TopbarProps {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  isAdmin: boolean;
  operador: boolean;
  onOpenSettings: () => void;
  onIrPlataforma: () => void;
  onLogout: () => void;
}

function Topbar({
  viewMode, setViewMode, isAdmin, operador, onOpenSettings, onIrPlataforma, onLogout,
}: TopbarProps) {
  // A worker gets the dashboard and the mount screen: confirming a mount is
  // literally their job, and it is the one thing they are allowed to write.
  const visibleTabs = isAdmin
    ? TABS
    : TABS.filter((t) => t.id === "kpis" || t.id === "montaje");

  const iconButtonStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: "var(--r-md)",
    background: "transparent", border: "none",
    color: "var(--ink-2)", cursor: "pointer",
    transition: "background .12s",
  };

  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 16px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* Marca. El cuadrado con cuatro puntos y la pastilla BETA se fueron: el
          ícono no significaba nada y la pastilla es de las cosas que se ponen
          cuando hay que llenar un espacio. El nombre alcanza. */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <span
          style={{
            fontSize: 14, fontWeight: 700, letterSpacing: "0.055em",
            color: "var(--ink-1)",
          }}
        >
          RECABRA
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: "var(--line)", flexShrink: 0 }} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2 }}>
        {visibleTabs.map(({ id, label, para, grupo }, i) => {
          const active = viewMode === id;
          // Una línea fina separa "operar" de "diseñar la tienda": son dos
          // trabajos distintos y mezclarlos era parte de la confusión.
          const abreGrupo = i > 0 && visibleTabs[i - 1].grupo !== grupo;
          return (
            <span key={id} style={{ display: "flex", alignItems: "center" }}>
            {abreGrupo && (
              <span
                aria-hidden
                style={{
                  width: 1, height: 18, margin: "0 7px",
                  background: "var(--line)", flexShrink: 0,
                }}
              />
            )}
            {/* Pastilla con ícono → palabra con subrayado. La gente comercial
                lee palabras, y un ícono por pestaña es de los patrones más
                generados que hay. El subrayado dice cuál está activa sin
                pintar un fondo de color. */}
            <button
              onClick={() => setViewMode(id)}
              title={para}
              style={{
                display: "flex", alignItems: "center",
                height: 30, padding: "0 10px",
                borderRadius: 0,
                fontSize: 12.5, fontWeight: active ? 600 : 450,
                border: "none",
                borderBottom: `2px solid ${active ? "var(--ink-1)" : "transparent"}`,
                background: "transparent",
                color: active ? "var(--ink-1)" : "var(--ink-3)",
                cursor: "pointer",
                transition: "color .12s, border-color .12s",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
            </span>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Server sync state — click to sync now */}
        <SyncStatus />

        {/* Acá había una lupa. **No tenía `onClick`.** Era un botón que no
            hacía nada: se dibujó porque una barra superior "tiene" que llevar
            lupa, engranaje y avatar. Un control que no responde es la cosa más
            delatora que puede tener una pantalla — nadie que use el sistema
            todos los días deja un botón muerto ahí arriba. Se va.

            Y el avatar: un círculo con "AD" adentro. Acá hay dos roles, no una
            organización con nombres. El rol dicta la mitad de lo que se ve en
            pantalla —la plata va tachada para el trabajador— así que decirlo
            con la palabra informa, y el círculo con iniciales sólo decoraba. */}
        <span style={{ fontSize: 11.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
          {isAdmin ? "Administrador" : "Trabajador"}
        </span>

        {/* Fase 2 clientes: sólo existe en el DOM si el backend confirmó
            `operador === true` — no es un botón deshabilitado para el resto
            de las cuentas, directamente no está.
            Fase 4 plataforma: ya no abre un modal — NAVEGA a la ruta propia
            `/plataforma` (Dashboard vive adentro del `<BrowserRouter>` de
            App.tsx, así que `useNavigate` está disponible). */}
        {operador && (
          <button
            title="Plataforma"
            onClick={onIrPlataforma}
            style={iconButtonStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <ShieldCheck size={14} />
          </button>
        )}

        {isAdmin && (
          <button
            title="Configuración"
            onClick={onOpenSettings}
            style={iconButtonStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Settings size={14} />
          </button>
        )}

        <button
          title="Cerrar sesión"
          onClick={onLogout}
          style={iconButtonStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function Dashboard() {
  // Arriving from the mount email opens that screen straight away, on the
  // space the email was about.
  const mountCode = MOUNT_DEEP_LINK;
  const [viewMode, setViewMode] = useState<ViewMode>(mountCode ? "montaje" : "kpis");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = useAuthStore(selectIsAdmin);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // Fase 2 clientes: quién es operador de plataforma se pregunta de nuevo en
  // cada sesión — nunca se persiste (a diferencia de `avisoCuenta`, que es
  // parte de la sesión misma). El legado (token sin email) siempre da
  // `false`, así que pedirlo acá no distingue caminos: el backend resuelve.
  const [operador, setOperador] = useState(false);

  useEffect(() => {
    let vivo = true;
    soyOperador()
      .then((v) => { if (vivo) setOperador(v); })
      .catch(() => { if (vivo) setOperador(false); });
    return () => { vivo = false; };
  }, []);

  // A worker may only be on the dashboard or the mount screen.
  useEffect(() => {
    if (role === "worker" && viewMode !== "kpis" && viewMode !== "montaje") {
      setViewMode("kpis");
    }
  }, [role, viewMode]);

  // «Ver la exhibición en 3D» se pide desde la pantalla de sede, que es una
  // pestaña hermana del editor: el pedido viaja por el store y acá se cambia
  // de pestaña. El encuadre lo resuelve el propio editor.
  const enfoque3D = useFixtureStore((s) => s.enfoque3D);
  useEffect(() => {
    if (enfoque3D && isAdmin) setViewMode("store");
  }, [enfoque3D, isAdmin]);

  const effectiveMode: ViewMode =
    isAdmin || viewMode === "montaje" ? viewMode : "kpis";

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        height: "100dvh", overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <AvisoCuentaBanner />

      <Topbar
        viewMode={effectiveMode}
        setViewMode={setViewMode}
        isAdmin={isAdmin}
        operador={operador}
        onOpenSettings={() => setSettingsOpen(true)}
        onIrPlataforma={() => navigate("/plataforma")}
        onLogout={logout}
      />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {effectiveMode === "store" ? (
          <StoreEditor3D />
        ) : effectiveMode === "montaje" ? (
          <MountView initialCode={mountCode} onDone={() => setViewMode("kpis")} />
        ) : effectiveMode === "kpis" ? (
          <DashboardView />
        ) : (
          <FloorPlan2D />
        )}
      </div>

      {settingsOpen && isAdmin && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
