import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, LogOut, X, Send, ShieldCheck, Download, ShieldAlert, FileText } from "lucide-react";
// El editor 3D va en su propio pedazo y se baja al entrar al modo «store»:
// importado de una, cada carga del tablero (KPIs, Supervisar, Vender) bajaba y
// parseaba ~160 KB gzip del editor y de la prueba de producto que no usaba.
const StoreEditor3D = lazy(() => import("../components/StoreEditor3D/StoreEditor3D"));
import FloorPlan2D from "../components/FloorPlan2D/FloorPlan2D";
import DashboardView from "./DashboardView";
import MountView from "./MountView";
import SyncStatus from "../components/SyncStatus/SyncStatus";
import AvisoCuentaBanner from "../components/AvisoCuentaBanner";
import MiSuscripcion from "../components/suscripcion/MiSuscripcion";
import { soyOperador } from "../api/plataforma";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import {
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
import { descargarCopia } from "../api/copia";
import { useFixtureStore } from "../store/fixtureStore";
import { TemaToggle, useModalAbierto } from "../tema";
import {
  LARGO_DEL_NOMBRE_PROPIO, familiasConNombre, nombrePropio, nombreParaGuardar,
  type FamiliaConNombre,
} from "../catalogo/nombresPropios";

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
/** «Cómo se llaman los muebles acá» (sólo administración, como todo este
 *  panel): una fila por familia, con el nombre de RECABRA y el de la tienda.
 *
 *  Es `catalogLabels`, que ya existía y sólo se editaba con el lápiz de la
 *  biblioteca del Plano —escondido detrás de un hover, y sólo lo aplicaba esa
 *  biblioteca—. Desde ahora el nombre propio sale en todas las pantallas del
 *  supermercado (`catalogo/nombresPropios.ts`), así que se edita en un lugar
 *  que se encuentra. Se guarda al salir del campo, con la lista de sedes (el
 *  mismo `PUT /api/layout/settings`, y el mismo debounce), como las tarifas: no
 *  hay botón de guardar. */
function NombresDeMueblesSection() {
  const nombres = useFixtureStore((s) => s.catalogLabels);
  const setCatalogLabel = useFixtureStore((s) => s.setCatalogLabel);
  const familias = familiasConNombre();
  return (
    <div data-seccion="nombres-de-muebles" style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Cómo se llaman los muebles acá</div>
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "-4px 0 12px", lineHeight: 1.5 }}>
        Si en la tienda a la estiba le dicen «mamut» o a la punta «tope de góndola», escribilo
        al lado: sale así en Vender, Supervisar, Estado por espacio, Montajes, Tarifas, el
        Plano, el Editor 3D y la lámina que se lleva el proveedor. Vacío, queda el de RECABRA.
        Los informes de RECABRA siguen con el suyo, para poder comparar supermercados. Se
        guarda al salir del campo; ningún mueble, código ni tarifa cambia.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: "6px 10px", alignItems: "center" }}>
        <div style={{ ...fieldLabelStyle, marginBottom: 0 }}>En RECABRA</div>
        <div style={{ ...fieldLabelStyle, marginBottom: 0 }}>Acá le dicen</div>
        {familias.map((f) => (
          <FilaDeNombre
            key={f.clave}
            familia={f}
            guardado={nombrePropio(f.clave, nombres) ?? ""}
            onGuardar={(texto) => setCatalogLabel(f.clave, nombreParaGuardar(f.clave, texto))}
          />
        ))}
      </div>
    </div>
  );
}

function FilaDeNombre({ familia, guardado, onGuardar }: {
  familia: FamiliaConNombre;
  guardado: string;
  onGuardar: (texto: string) => void;
}) {
  const [borrador, setBorrador] = useState(guardado);
  const [editando, setEditando] = useState(false);
  // Lo que llega del servidor (otra estación lo cambió) entra mientras no se
  // está escribiendo encima.
  useEffect(() => { if (!editando) setBorrador(guardado); }, [guardado, editando]);
  const id = `nombre-propio-${familia.clave}`;
  return (
    <>
      <label htmlFor={id} style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <span aria-hidden style={{ marginRight: 6 }}>{familia.emoji}</span>{familia.rotulo}
      </label>
      <input
        id={id}
        data-familia={familia.clave}
        type="text"
        value={borrador}
        maxLength={LARGO_DEL_NOMBRE_PROPIO}
        placeholder={familia.rotulo}
        onFocus={() => setEditando(true)}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={() => {
          setEditando(false);
          if (borrador.trim() !== guardado) onGuardar(borrador);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") { e.stopPropagation(); setBorrador(guardado); setEditando(false); }
        }}
        style={{ ...inputStyle, height: 30 }}
      />
    </>
  );
}

function rolLabelUsuario(rol: Miembro["rol"]): string {
  if (rol === "owner") return "Dueño";
  if (rol === "admin") return "Administrador";
  return "Trabajador";
}

/** Miembros con cuenta individual (Google/correo) e invitaciones que
 *  todavía nadie aceptó, para el cliente de la sesión actual — el token
 *  manda, no hay selector de cliente acá.
 *
 *  Es la ÚNICA forma de dar acceso desde 2026-10-01: «Claves de acceso», que
 *  convivía con esta sección durante la transición, se fue junto con el
 *  acceso por clave compartida. */
function UsuariosSection() {
  // A qué supermercado se invita, dicho en la pantalla (2026-09-23): con dos
  // supermercados en la misma cuenta, invitar desde el equivocado mandaba a
  // la persona al equivocado.
  const clienteNombre = useAuthStore((s) => s.clienteNombre);
  const miCorreo = useAuthStore((s) => s.email);
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

  const soyDuenio =
    !miCorreo ||
    (datos?.miembros ?? []).some((m) => m.email === miCorreo && m.rol === "owner" && m.activo);

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim() || invitando) return;
    setInvitando(true);
    setInvMsg(null);
    try {
      await invitarUsuario({ email: invEmail.trim(), rol: invRol });
      setInvMsg({
        ok: true,
        text: `Invitación enviada a ${invEmail.trim()}: entra a ${clienteNombre ?? "este supermercado"} como ${rolLabelUsuario(invRol).toLowerCase()}, con esa misma cuenta.`,
      });
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
      <div style={sectionLabelStyle}>Usuarios{clienteNombre ? ` de ${clienteNombre}` : ""}</div>
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "-4px 0 12px", lineHeight: 1.5 }}>
        Cuentas individuales con Google o correo, para {clienteNombre ?? "este supermercado"}. La
        persona tiene que entrar con el correo que escribas acá: si entra con otra cuenta, la
        invitación no la encuentra.
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
            {/* Sólo un dueño hace dueños: el backend lo exige (403) y acá ni
                se ofrece. Una sesión sin correo —sólo existe con el acceso por
                clave compartida prendido a mano, `LOGIN_LEGADO`— sigue
                pudiendo, igual que en el backend. */}
            {soyDuenio && <option value="owner">Dueño</option>}
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
              Todavía no hay nadie más: invitá a tu equipo con su correo.
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
                  {(m.rol !== "owner" || soyDuenio) && (
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
                  )}
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

/** Bytes para una persona: «850 KB», «12,4 MB». */
function peso(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

/** «Copia de seguridad»: todo el supermercado en un ZIP, para guardarlo fuera
 *  de RECABRA (2026-10-02). Reemplaza a `scripts/respaldo.py`, que entraba con
 *  la clave compartida y quedó sin puerta cuando se apagó.
 *
 *  Sólo el dueño —la membresía `owner`, como «Tus datos»—: lleva la plata de
 *  los contratos y los contactos de los proveedores, así que a un admin
 *  invitado ni se le muestra. Una sesión abierta antes de que el ingreso dijera
 *  el rol (`rolCliente` en null) la ve, y si no es el dueño el 403 lo dice. */
function CopiaSection() {
  const rolCliente = useAuthStore((s) => s.rolCliente);
  const [avance, setAvance] = useState<string | null>(null);
  const [msg, setMsg] = useState<Feedback>(null);

  if (rolCliente && rolCliente !== "owner") return null;

  const bajar = async () => {
    setAvance("Armando la copia…");
    setMsg(null);
    try {
      const { nombre, bytes } = await descargarCopia((bajado, total) =>
        setAvance(
          total
            ? `Descargando… ${Math.min(100, Math.round((bajado / total) * 100))} %`
            : `Descargando… ${peso(bajado)}`
        )
      );
      setMsg({ ok: true, text: `Listo: ${nombre} (${peso(bytes)}).` });
    } catch (err) {
      setMsg({
        ok: false,
        text: describeError(err, "No se pudo armar la copia. Probá de nuevo en un rato."),
      });
    } finally {
      setAvance(null);
    }
  };

  return (
    <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Copia de seguridad</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.5 }}>
        Todo el supermercado en un archivo ZIP: planos, espacios, contratos, proveedores,
        montajes con sus fotos, documentos y configuración. Bajala cada tanto y guardala
        fuera de RECABRA, en tu computador o en Drive.
      </div>
      <ActionButton onClick={bajar} disabled={avance !== null}>
        <Download size={12} />
        {avance ?? "Descargar copia de seguridad"}
      </ActionButton>
      <FeedbackNote msg={msg} />
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
        Trae los valores de los contratos y los datos de contacto: tratala como un documento
        confidencial. Cada descarga queda en la bitácora.
      </div>
    </div>
  );
}

/** «Suscripción» (C2): lo que RECABRA le cobra a este supermercado —estado de
 *  la cuenta, lo pactado, la próxima cuenta de cobro con retenciones y neto,
 *  cómo transferir, el historial y los datos de facturación—.
 *
 *  Sólo la dueña, con el mismo filtro que la copia de seguridad: a un admin
 *  invitado ni se le muestra, y si una sesión vieja sin rol la ve, el 403 del
 *  backend lo dice. La plata vive acá y no en la franja de «pago pendiente»,
 *  que se ve en Vender delante de los proveedores. */
function SuscripcionSection({ enfocar }: { enfocar: boolean }) {
  const rolCliente = useAuthStore((s) => s.rolCliente);
  const ancla = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (enfocar) ancla.current?.scrollIntoView({ block: "start" });
  }, [enfocar]);

  if (rolCliente && rolCliente !== "owner") return null;

  return (
    <div ref={ancla} style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Suscripción</div>
      {/* Las secciones de arriba también cargan solas y la empujan: cuando
          llegan sus datos, se vuelve a traer a la vista. */}
      <MiSuscripcion alCargar={() => enfocar && ancla.current?.scrollIntoView({ block: "start" })} />
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
  const navigate = useNavigate();
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
        las puede hacer el dueño del supermercado.
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

      <div style={{ marginTop: 14 }}>
        <ActionButton onClick={() => navigate("/reporte-plataforma")}>
          <FileText size={12} />
          Reporte de transparencia
        </ActionButton>
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
          Qué tomó la plataforma de tu cliente, cómo lo calculó y quién lo consultó.
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  onClose,
  enfocar = null,
}: {
  onClose: () => void;
  /** Abrir directo en una sección: la franja de «pago pendiente» abre acá la
   *  suscripción. */
  enfocar?: "suscripcion" | null;
}) {
  // «Claves de acceso» vivía acá arriba y se fue (2026-10-01): desde la Fase 15
  // se entra sólo con Google o correo, y las claves compartidas por rol ya no
  // abrían nada desde la app — sólo una puerta del backend, que se apagó (ver
  // `exigir_login_legado` en `backend/app/routers/auth.py`). A una persona se le
  // corta el acceso desde Usuarios, de a una.

  // Notifications
  const [emails, setEmails] = useState("");
  const [days, setDays] = useState("");
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgMsg, setCfgMsg] = useState<Feedback>(null);
  const [testMsg, setTestMsg] = useState<Feedback>(null);

  const [busy, setBusy] = useState<"cfg" | "test" | null>(null);

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

  // Mientras este panel está abierto, ÉL es la pantalla: el botón principal de
  // lo que quedó atrás pierde el amarillo (regla del dueño, un amarillo por
  // pantalla). Configuración no tiene botón principal propio —son interruptores
  // que guardan solos— así que sólo apaga, no enciende.
  useModalAbierto();

  return (
    <div
      data-capa-modal
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(4,7,10,0.42)",
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
                  placeholder="30,15,6"
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

        <NombresDeMueblesSection />

        <SuscripcionSection enfocar={enfocar === "suscripcion"} />

        <CopiaSection />

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

/** Supermercado, persona y rol, a la derecha de la barra. El rol dicta la mitad
 *  de lo que se ve en pantalla —la plata va tachada para el trabajador—, así que
 *  va con la palabra. Una sesión de antes del 2026-10-02 no trae el rol en el
 *  supermercado y cae a la palabra del token. */
function QuienSoy({ isAdmin }: { isAdmin: boolean }) {
  const clienteNombre = useAuthStore((s) => s.clienteNombre);
  const nombre = useAuthStore((s) => s.nombre);
  const email = useAuthStore((s) => s.email);
  const rolCliente = useAuthStore((s) => s.rolCliente);
  const rol = rolCliente ? rolLabelUsuario(rolCliente) : isAdmin ? "Administrador" : "Trabajador";
  const persona = nombre?.trim() || email || null;
  const linea: React.CSSProperties = {
    maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };
  return (
    <span
      title={[clienteNombre, persona, rol].filter(Boolean).join(" · ")}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.25, minWidth: 0, maxWidth: 220 }}
    >
      {clienteNombre && (
        <span style={{ ...linea, fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>{clienteNombre}</span>
      )}
      <span style={{ ...linea, fontSize: 11, color: "var(--ink-4)" }}>
        {persona ? `${persona} · ${rol}` : rol}
      </span>
    </span>
  );
}

/** El ícono de la barra: un tamaño y un trazo para todos (hoja de piezas del
 *  rediseño, 2026-10). `probar-vender` lo asevera. */
const ICONO_BARRA = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

function Topbar({
  viewMode, setViewMode, isAdmin, operador, onOpenSettings, onIrPlataforma, onLogout,
}: TopbarProps) {
  // A worker gets the dashboard and the mount screen: confirming a mount is
  // literally their job, and it is the one thing they are allowed to write.
  const visibleTabs = isAdmin
    ? TABS
    : TABS.filter((t) => t.id === "kpis" || t.id === "montaje");

  /* Los botones de ícono de la barra: 32 px, el ícono a 16 con trazo 1,75 y
     en gris (`--ink-2`), como en la hoja de piezas del rediseño. Sin palabra
     al lado: el `title` y el `aria-label` la dicen. */
  const iconButtonStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: "var(--r-md)",
    background: "transparent", border: "none",
    color: "var(--ink-2)", cursor: "pointer",
    transition: "background .12s",
    flexShrink: 0,
  };

  return (
    <header
      className="barra-app"
      style={{
        display: "flex", alignItems: "center", gap: 18,
        height: 52, padding: "0 18px",
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
      <div className="sep-app" style={{ width: 1, height: 18, background: "var(--line)", flexShrink: 0 }} />

      {/* Tabs: palabras con subrayado, sin ícono (hoja de piezas: «ni en las
          pestañas ni dentro de las pastillas: ahí manda la palabra»). El
          subrayado va al pie de la barra, como en la maqueta. */}
      <div className="pestanas-app" style={{ display: "flex", gap: 2, alignSelf: "stretch" }}>
        {visibleTabs.map(({ id, label, para, grupo }, i) => {
          const active = viewMode === id;
          // Una línea fina separa "operar" de "diseñar la tienda": son dos
          // trabajos distintos y mezclarlos era parte de la confusión.
          const abreGrupo = i > 0 && visibleTabs[i - 1].grupo !== grupo;
          return (
            <span key={id} style={{ display: "flex", alignItems: "stretch" }}>
            {abreGrupo && (
              <span
                aria-hidden
                style={{
                  width: 1, height: 18, margin: "0 7px", alignSelf: "center",
                  background: "var(--line)", flexShrink: 0,
                }}
              />
            )}
            {/* Pastilla con ícono → palabra con subrayado. La gente comercial
                lee palabras, y un ícono por pestaña es de los patrones más
                generados que hay. El subrayado dice cuál está activa sin
                pintar un fondo de color. */}
            <button
              className="pestana-app"
              onClick={() => setViewMode(id)}
              title={para}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center",
                // «Editor 3D» en un renglón, también a 390 px.
                whiteSpace: "nowrap",
                padding: "0 11px",
                borderRadius: 0,
                fontSize: "var(--t-xs)", fontWeight: active ? 600 : 450,
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

      {/* Right side: el estado de la sincronización (punto y palabra), el
          sol/luna, quién sos y los tres botones de ícono. */}
      <div className="der-app" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {/* Server sync state — click to sync now */}
        <SyncStatus />

        {/* Claro / oscuro. Misma pieza que la de la landing (sol / luna) y
            misma convención: el ícono es el del tema AL QUE SE VA. La
            preferencia queda en `localStorage` bajo `recabra-tema` y la
            comparte con la consola de plataforma, que antes tenía la suya. */}
        <TemaToggle />

        {/* Acá había una lupa. **No tenía `onClick`.** Era un botón que no
            hacía nada: se dibujó porque una barra superior "tiene" que llevar
            lupa, engranaje y avatar. Un control que no responde es la cosa más
            delatora que puede tener una pantalla — nadie que use el sistema
            todos los días deja un botón muerto ahí arriba. Se va.

            Y el avatar: un círculo con "AD" adentro, que sólo decoraba. Lo
            reemplazó la palabra del rol, cuando el acceso era con dos claves
            compartidas y no había personas. Hoy sí las hay, con su cuenta, en
            más de un supermercado: se dice en cuál se está, quién es y con qué
            rol —el dueño no es «Administrador»— (2026-10-02). */}
        <QuienSoy isAdmin={isAdmin} />

        {/* Fase 2 clientes: sólo existe en el DOM si el backend confirmó
            `operador === true` — no es un botón deshabilitado para el resto
            de las cuentas, directamente no está.
            Fase 4 plataforma: ya no abre un modal — NAVEGA a la ruta propia
            `/plataforma` (Dashboard vive adentro del `<BrowserRouter>` de
            App.tsx, así que `useNavigate` está disponible). */}
        {operador && (
          <button
            title="Plataforma"
            aria-label="Plataforma"
            onClick={onIrPlataforma}
            style={iconButtonStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <ShieldCheck {...ICONO_BARRA} />
          </button>
        )}

        {isAdmin && (
          <button
            title="Configuración"
            aria-label="Configuración"
            onClick={onOpenSettings}
            style={iconButtonStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Settings {...ICONO_BARRA} />
          </button>
        )}

        <button
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          onClick={onLogout}
          style={iconButtonStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <LogOut {...ICONO_BARRA} />
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
  /** El alto del área de las pantallas, medido: Vender y Supervisar cuentan
   *  el alto de su plano contra él (`--alto-area` → `--alto-plano`,
   *  `vender.css`). Ya descuenta la barra de la aplicación y el aviso de la
   *  cuenta, que la cuenta con `100dvh` tenía que adivinar. */
  const areaRef = useRef<HTMLDivElement>(null);
  const [altoArea, setAltoArea] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setAltoArea(el.clientHeight);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [seccionConfig, setSeccionConfig] = useState<"suscripcion" | null>(null);
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

  // «Vender» del panel del Plano (rediseño, PR 3): el pedido viaja por el
  // store y acá se pasa a la pantalla de sede, que lo arma en Vender.
  const pedidoVender = useFixtureStore((s) => s.pedidoVender);
  useEffect(() => {
    if (pedidoVender && isAdmin) setViewMode("kpis");
  }, [pedidoVender, isAdmin]);

  // Distribuir, al guardar una cara a la que se entró desde Supervisar: vuelve
  // a la pantalla de sede, que abre Supervisar con el aviso.
  const pedidoSupervisar = useFixtureStore((s) => s.pedidoSupervisar);
  useEffect(() => {
    if (pedidoSupervisar && isAdmin) setViewMode("kpis");
  }, [pedidoSupervisar, isAdmin]);

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
      <AvisoCuentaBanner
        onVerSuscripcion={() => {
          setSeccionConfig("suscripcion");
          setSettingsOpen(true);
        }}
      />

      <Topbar
        viewMode={effectiveMode}
        setViewMode={setViewMode}
        isAdmin={isAdmin}
        operador={operador}
        onOpenSettings={() => {
          setSeccionConfig(null);
          setSettingsOpen(true);
        }}
        onIrPlataforma={() => navigate("/plataforma")}
        onLogout={logout}
      />

      {/* El área de las pantallas: Vender y Supervisar miden el alto de su
          plano contra ESTE alto (`--alto-area`, medido), así el plano mide lo
          mismo en las dos sin adivinar cuánto mide el marco. */}
      <div
        ref={areaRef}
        className="area-pantallas"
        style={{
          flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
          ...(altoArea ? { ["--alto-area" as string]: `${altoArea}px` } : {}),
        }}
      >
        {effectiveMode === "store" ? (
          <Suspense fallback={
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontSize: 13 }}>
              Abriendo el editor 3D…
            </div>
          }>
            <StoreEditor3D />
          </Suspense>
        ) : effectiveMode === "montaje" ? (
          <MountView initialCode={mountCode} onDone={() => setViewMode("kpis")} />
        ) : effectiveMode === "kpis" ? (
          <DashboardView onDisenarPlano={() => setViewMode("map")} />
        ) : (
          <FloorPlan2D />
        )}
      </div>

      {settingsOpen && isAdmin && (
        <SettingsModal enfocar={seccionConfig} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
