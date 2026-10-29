import { Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings, LogOut, X, Send, ShieldCheck, Download, ShieldAlert, FileText, MapPin, Inbox, Search, CircleHelp, ArrowLeft, Armchair, LayoutGrid } from "lucide-react";
// El editor 3D va en su propio pedazo y se baja al entrar al modo «store»:
// importado de una, cada carga del tablero (KPIs, Supervisar, Vender) bajaba y
// parseaba ~160 KB gzip del editor y de la prueba de producto que no usaba.
const StoreEditor3D = lazy(() => import("../components/StoreEditor3D/StoreEditor3D"));
const PlanificarCara = lazy(() => import("../components/Planograma/PlanificarCara"));
const MisMuebles = lazy(() => import("./MisMuebles"));
const CarasDeLaSede = lazy(() => import("./CarasDeLaSede"));
import FloorPlan2D from "../components/FloorPlan2D/FloorPlan2D";
import DashboardView, { type ModoComercial } from "./DashboardView";
import { MenuLateral, BarraDeAbajo } from "../components/Armazon/MenuDeModulos";
import { NOMBRE_DE, RUTA_DE, moduloDeRuta, puedeAbrir, vueltaAlCambiar, type Modulo, type VueltaDelPlano } from "../modulos";
import { useArmazon, type TemaDeAjustes } from "../store/armazonStore";
import type { ContextoDeAccion } from "../acciones";
import Buscador from "../components/Armazon/Buscador";
import Ayuda from "../components/Armazon/Ayuda";
import Mas from "../components/Armazon/Mas";
import MetasPorSede from "../components/Ajustes/Metas";
import SedesDeAjustes from "../components/Ajustes/Sedes";
import PermisosDePlanogramas from "../components/Ajustes/Permisos";
import RatesModal from "../components/RatesModal/RatesModal";
import SeasonsModal from "../components/SeasonPicker/SeasonsModal";
import { mostrarConfiguracionInicial } from "../components/Inicio/ConfiguracionInicial";
import "../components/Ajustes/ajustes.css";
import "../armazon.css";
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
import { usePlanograma } from "../store/planogramaStore";
import { TemaToggle, useModalAbierto } from "../tema";
import { altoDeLaVentana, useEscalaDeLaApp } from "../escala";
import {
  LARGO_DEL_NOMBRE_PROPIO, familiasConNombre, nombrePropio, nombreParaGuardar,
  type FamiliaConNombre,
} from "../catalogo/nombresPropios";

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

/** Los temas de Ajustes, en el orden del menú lateral. */
const TEMAS_DE_AJUSTES: readonly { id: TemaDeAjustes; texto: string; sub: string }[] = [
  { id: "comercial", texto: "Comercial", sub: "Tarifas · Temporadas · Metas" },
  { id: "sede", texto: "Sede y plano", sub: "Sedes · Nombres · Códigos · Catálogo" },
  { id: "avisos", texto: "Avisos", sub: "Correos · Responsables" },
  { id: "equipo", texto: "Equipo", sub: "Usuarios · Permisos" },
  { id: "cuenta", texto: "Cuenta", sub: "Suscripción · Copia · Datos · Bitácora" },
];

/**
 * Ajustes (rediseño UX 2026-10, etapa 8): una pantalla con menú lateral por
 * tema. Junta lo que estaba en el engranaje, en botones de la barra de la sede
 * (Tarifas), en el Plano (las sedes) y en direcciones sin enlace (/taller,
 * /renumerar). Las piezas son las de siempre; cambia dónde viven.
 */
function SettingsModal({
  onClose,
  enfocar = null,
  tema,
  onTema,
  onTarifas,
  onTemporadas,
  onConfiguracionInicial,
  bloqueado = false,
}: {
  onClose: () => void;
  /** Abrir directo en una sección: la franja de «pago pendiente» abre acá la
   *  suscripción. */
  enfocar?: "suscripcion" | null;
  tema: TemaDeAjustes;
  onTema: (t: TemaDeAjustes) => void;
  onTarifas: () => void;
  onTemporadas: () => void;
  onConfiguracionInicial: () => void;
  /** Hay un diálogo encima (Tarifas, Temporadas): Esc es de él. */
  bloqueado?: boolean;
}) {
  const navigate = useNavigate();
  const sedeActiva = useFixtureStore((s) => s.sede);
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
      // Un diálogo encima (Tarifas, renombrar o borrar una sede) se cierra él.
      if (e.key === "Escape" && !bloqueado && !document.querySelector('[aria-modal="true"]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, bloqueado]);

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

  const bloque = (titulo: string, texto: string, boton: string, hacer: () => void, dato?: string) => (
    <div className="aj-bloque" data-bloque-ajustes={dato}>
      <div style={sectionLabelStyle}>{titulo}</div>
      <p className="aj-nota">{texto}</p>
      <button type="button" className="aj-btn" onClick={hacer}>{boton}</button>
    </div>
  );

  return (
    <div className="ajustes-capa" data-capa-modal onClick={onClose}>
      <div className="ajustes" role="dialog" aria-label="Ajustes" onClick={(e) => e.stopPropagation()} data-ajustes={tema}>
        <header className="ajustes-cab">
          <h2>Ajustes</h2>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar Ajustes" className="aj-icono"><X size={16} /></button>
        </header>
        <div className="ajustes-cuerpo">
          <nav className="ajustes-menu" aria-label="Temas de Ajustes">
            {TEMAS_DE_AJUSTES.map((t) => (
              <button key={t.id} type="button" aria-current={tema === t.id ? "page" : undefined} onClick={() => onTema(t.id)} data-tema={t.id}>
                <b>{t.texto}</b><small>{t.sub}</small>
              </button>
            ))}
          </nav>
          <div className="ajustes-tema">
            {tema === "comercial" && (
              <>
                {bloque("Tarifas", "El canon mensual de referencia por tipo de mueble, general y por sede. Se guarda solo.", "Abrir las tarifas", onTarifas, "tarifas")}
                {bloque("Temporadas", "Las fechas de cada temporada, los días antes y después, si se vende, y volver al valor sugerido.", "Editar las temporadas", onTemporadas, "temporadas")}
                <div className="aj-bloque" data-bloque-ajustes="metas">
                  <div style={sectionLabelStyle}>Metas por sede</div>
                  <MetasPorSede sedes={sedes} />
                </div>
              </>
            )}
            {tema === "sede" && (
              <>
                <div className="aj-bloque" data-bloque-ajustes="sedes">
                  <div style={sectionLabelStyle}>Sedes</div>
                  <SedesDeAjustes />
                </div>
                <NombresDeMueblesSection />
                {bloque("Ordenar códigos", "Renumerar el plano siguiendo el recorrido de la tienda, todas las sedes o una, con el informe antes → después para imprimir.", "Ordenar los códigos", () => { onClose(); navigate("/renumerar"); }, "renumerar")}
                {bloque("Catálogo de muebles propios", "Las fichas de los muebles del supermercado: crear, editar, retirar o reactivar, y cómo se vende cada una.", "Abrir Mis muebles", () => { onClose(); navigate("/plano/muebles"); }, "taller")}
              </>
            )}
            {tema === "avisos" && (
              <>
                <div className="aj-bloque">
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
              </>
            )}
            {tema === "equipo" && (
              <>
                <UsuariosSection />
                <div className="aj-bloque" data-bloque-ajustes="permisos">
                  <div style={sectionLabelStyle}>Quién planifica y publica planogramas</div>
                  <PermisosDePlanogramas sede={sedeActiva} />
                </div>
              </>
            )}
            {tema === "cuenta" && (
              <>
                <SuscripcionSection enfocar={enfocar === "suscripcion"} />
                <CopiaSection />
                <TusDatosSection />
                <BitacoraSection />
                {bloque("Configuración inicial", "Los seis pasos para dejar el supermercado listo, en el Inicio.", "Volver a mostrarla", onConfiguracionInicial, "config-inicial")}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── La barra de arriba ───────────────────────────────────────────────────────

/** Las iniciales de quien entró, para el círculo del menú de la cuenta. */
function iniciales(texto: string | null): string {
  const partes = (texto ?? "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const dos = partes.length >= 2 ? partes[0][0] + partes[1][0] : (partes[0] ?? "?").slice(0, 2);
  return dos.toUpperCase();
}

/** Supermercado, persona y rol. El rol dicta la mitad de lo que se ve en
 *  pantalla —la plata va tachada para el trabajador—, así que va con la
 *  palabra. Una sesión de antes del 2026-10-02 no trae el rol en el
 *  supermercado y cae a la palabra del token. */
function useQuienSoy(isAdmin: boolean) {
  const clienteNombre = useAuthStore((s) => s.clienteNombre);
  const nombre = useAuthStore((s) => s.nombre);
  const email = useAuthStore((s) => s.email);
  const rolCliente = useAuthStore((s) => s.rolCliente);
  const rol = rolCliente ? rolLabelUsuario(rolCliente) : isAdmin ? "Administrador" : "Trabajador";
  const persona = nombre?.trim() || email || null;
  return { clienteNombre, persona, rol };
}

/** El menú de la cuenta (rediseño UX 2026-10): quién sos y con qué rol, el
 *  tema claro u oscuro y cerrar la sesión. Antes eran tres cosas sueltas en la
 *  barra —el texto de la persona, el sol/luna y la puerta—; ahora la barra
 *  deja lugar a lo que se usa todo el día y esto queda a un toque. En el
 *  teléfono, donde no hay menú lateral, también lleva Ajustes. */
function MenuDeLaCuenta({ isAdmin, onLogout, onAjustes }: {
  isAdmin: boolean;
  onLogout: () => void;
  onAjustes: () => void;
}) {
  const { clienteNombre, persona, rol } = useQuienSoy(isAdmin);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  return (
    <div className="cuenta-app" ref={caja}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={[clienteNombre, persona, rol].filter(Boolean).join(" · ")}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="avatar-app" aria-hidden>{iniciales(persona ?? clienteNombre)}</span>
        <span className="quien-corto">
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
            {persona ?? clienteNombre ?? rol}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{rol}</span>
        </span>
      </button>
      {abierto && (
        <div className="menu-cuenta" role="menu">
          <div className="quien">
            {clienteNombre && <b>{clienteNombre}</b>}
            <span>{persona ? `${persona} · ${rol}` : rol}</span>
          </div>
          {/* Claro / oscuro: la misma pieza de siempre (el ícono es el del
              tema AL QUE SE VA), con su palabra al lado. */}
          <div className="fila">
            Tema claro u oscuro
            <span className="der"><TemaToggle /></span>
          </div>
          {isAdmin && (
            <button type="button" role="menuitem" className="fila solo-telefono"
              onClick={() => { setAbierto(false); onAjustes(); }}>
              <Settings {...ICONO_BARRA} /> Ajustes
            </button>
          )}
          <button type="button" role="menuitem" className="fila"
            onClick={() => { setAbierto(false); onLogout(); }}>
            <LogOut {...ICONO_BARRA} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

/** La sede, elegida en UN solo lugar para toda la aplicación (rediseño UX
 *  2026-10). Antes había un selector en la barra de la sede, otro en el plano
 *  y otro en el 3D, y los tres movían la misma sede del store. Crear,
 *  renombrar o eliminar una sede sigue en el plano (su menú ⋯). */
function SelectorDeSede() {
  const sedes = useFixtureStore((s) => s.sedes);
  const sede = useFixtureStore((s) => s.sede);
  const setSede = useFixtureStore((s) => s.setSede);
  const muebles = useFixtureStore((s) => (s.fixturesBySede[s.sede] ?? []).length);
  /** Con un contrato a medio cargar, cambiar de sede lo vacía: se pregunta. */
  const borrador = useArmazon((s) => s.borradorDeVenta);
  const [pedida, setPedida] = useState<string | null>(null);
  return (
    <div className="selector-sede">
      <MapPin {...ICONO_BARRA} className="ico" />
      <select className="sede-sel" value={sede} aria-label="Sede"
        onChange={(e) => { const v = e.target.value; if (borrador && v !== sede) setPedida(v); else setSede(v); }}>
        {(sedes.includes(sede) ? sedes : [sede, ...sedes]).map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      {/* Cuál de cuántas y cuántos muebles tiene: el selector lista TODAS las
          sedes, tengan plano o no. */}
      <span className="cuantos">
        {sedes.includes(sede) && <>{sedes.indexOf(sede) + 1} de {sedes.length}{" · "}</>}
        {muebles} mueble{muebles === 1 ? "" : "s"}
      </span>
      {pedida && borrador && (
        <AvisoCambioDeSede actual={sede} nueva={pedida} borrador={borrador}
          onSeguir={() => setPedida(null)}
          onCambiar={() => { setSede(pedida); setPedida(null); }} />
      )}
    </div>
  );
}

/** «¿Cambiar de sede?» con un contrato a medio cargar (2026-10-28). Seguir
 *  en la sede es lo que se hace por defecto (Enter, Esc). */
function AvisoCambioDeSede({ actual, nueva, borrador, onSeguir, onCambiar }: {
  actual: string; nueva: string; borrador: string; onSeguir: () => void; onCambiar: () => void;
}) {
  useModalAbierto();
  const titulo = useId();
  return (
    <div className="aviso-sede-capa" data-capa-modal onMouseDown={onSeguir}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onSeguir(); } }}>
      <div className="aviso-sede" role="dialog" aria-modal="true" aria-labelledby={titulo} onMouseDown={(e) => e.stopPropagation()} data-aviso-sede>
        <h2 id={titulo}>¿Cambiar a {nueva}?</h2>
        <p>Tenés un contrato sin guardar en <b>{actual}</b> ({borrador}). Si cambiás de sede, se pierde.</p>
        <div className="botones">
          <button type="button" className="sec" onClick={onCambiar}>Cambiar y descartarlo</button>
          <button type="button" className="btn-principal" onClick={onSeguir} autoFocus>Seguir en {actual}</button>
        </div>
      </div>
    </div>
  );
}

/** El ícono de la barra: un tamaño y un trazo para todos (hoja de piezas del
 *  rediseño, 2026-10). `probar-vender` lo asevera. */
const ICONO_BARRA = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** 2D | 3D | Muebles | Caras: el Plano de la sede junta lo que eran dos pestañas
 *  (Plano y Editor 3D) y, desde el 2026-10-28, los muebles propios del
 *  supermercado (lo que era el taller). Va en la barra mientras se está en el
 *  Plano; cada vista es su dirección (`/plano`, `/plano/3d`, `/plano/muebles`). */
function VistaDelPlano({ modulo, ir }: { modulo: Modulo; ir: (m: Modulo) => void }) {
  if (modulo !== "plano" && modulo !== "plano3d" && modulo !== "muebles" && modulo !== "caras") return null;
  return (
    <div className="vista-plano" role="group" aria-label="Vista del plano">
      {([["plano", "2D", "Dibujar la tienda vista desde arriba y editar los muebles"],
         ["plano3d", "3D", "Mirar la tienda en 3D: recorrerla, probar productos y distribuir caras"],
         ["muebles", "Muebles", "Mis muebles: los de tu supermercado, con sus medidas. Crearlos, editarlos y retirarlos"],
         ["caras", "Caras", "Todas las caras: qué falta repartir, qué está listo y cómo va su montaje"]] as const).map(([m, palabra, para]) => (
        <button key={m} type="button" aria-pressed={modulo === m} title={para} onClick={() => ir(m)}
          aria-label={m === "muebles" ? "Mis muebles" : m === "caras" ? "Caras" : undefined}>
          {/* En el teléfono «Muebles» y «Caras» no entran al lado de la sede
              y la cuenta: va el ícono (`armazon.css`). */}
          {m === "muebles" ? <><Armchair className="ico-movil" {...ICONO_BARRA} /><span className="txt-ancho">{palabra}</span></>
            : m === "caras" ? <><LayoutGrid className="ico-movil" {...ICONO_BARRA} /><span className="txt-ancho">{palabra}</span></> : palabra}
        </button>
      ))}
    </div>
  );
}

/** Pendientes (etapa 3): la bandeja de lo que hay para revisar, encima de la
 *  pantalla en uso. La cuenta roja no se dibuja con Contratos abierto —mezcla
 *  vencimientos, bajo tarifa, reservas y cortes de ventas, y esa pantalla la
 *  mira el proveedor— y la bandeja sólo se abre si se la pide. Fuera de las
 *  pantallas comerciales (Plano, Montajes) lleva al Inicio y la abre ahí:
 *  sus filas resuelven con la ficha y el plano de la sede. */
function BotonPendientes({ modulo, ir }: { modulo: Modulo; ir: (m: Modulo) => void }) {
  const cuenta = useArmazon((s) => s.cuentaPendientes);
  const abierta = useArmazon((s) => s.bandejaAbierta);
  const abrir = useArmazon((s) => s.abrirBandeja);
  const cerrar = useArmazon((s) => s.cerrarBandeja);
  const comercial = modulo === "inicio" || modulo === "contratos" || modulo === "indicadores";
  const n = modulo === "contratos" ? 0 : cuenta;
  return (
    <button
      type="button"
      className="btn-pendientes"
      aria-expanded={abierta}
      title="Lo que hay que resolver: hoy, los próximos 30 días y lo que no cuadra"
      onClick={() => {
        if (abierta) { cerrar(); return; }
        if (!comercial) ir("inicio");
        abrir();
      }}
    >
      <Inbox {...ICONO_BARRA} />
      <span className="txt">Pendientes</span>
      {n > 0 && <span className="cuenta" aria-label={`${n} para revisar`}>{n}</span>}
    </button>
  );
}

interface TopbarProps {
  modulo: Modulo;
  ir: (m: Modulo) => void;
  isAdmin: boolean;
  operador: boolean;
  onIrPlataforma: () => void;
  onAjustes: () => void;
  onLogout: () => void;
  /** Lo que hacen las funciones de «Más», lo fijado y el buscador. */
  ctx: ContextoDeAccion;
  quien: string;
}

/** La barra de arriba del armazón: la sede, el guardado y la cuenta. Los
 *  módulos se fueron al menú (`MenuDeModulos.tsx`). */
function Topbar({ modulo, ir, isAdmin, operador, onIrPlataforma, onAjustes, onLogout, ctx, quien }: TopbarProps) {
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
        display: "flex", alignItems: "center", gap: 14,
        height: 56, padding: "0 18px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      {/* En el teléfono no hay menú lateral: la marca va acá. */}
      <span className="marca-movil">RECABRA</span>

      <SelectorDeSede />

      <VistaDelPlano modulo={modulo} ir={ir} />

      <span className="esp" />

      {/* El buscador de funciones (Ctrl K), la ayuda de la pantalla, «Más» del
          módulo y lo fijado (etapa 8): ninguna función queda escondida. */}
      <button type="button" className="btn-buscar" onClick={() => useArmazon.getState().setBuscador(true)}
        title="Buscar una función, un espacio o un término (Ctrl K)" aria-label="Buscar (Ctrl K)" data-abrir-buscador>
        <Search {...ICONO_BARRA} /><span className="txt">Buscar</span><kbd>Ctrl K</kbd>
      </button>
      <Mas modulo={modulo} esAdmin={isAdmin} quien={quien} ctx={ctx} />
      <button type="button" className="btn-ayuda" onClick={() => useArmazon.getState().setAyuda(true)}
        title="Qué hace esta pantalla y qué quiere decir cada término" aria-label="Ayuda de esta pantalla" data-abrir-ayuda>
        <CircleHelp {...ICONO_BARRA} />
      </button>

      {/* El estado del guardado (punto y palabra). Un clic sincroniza: es lo
          que hacía el botón «Actualizar» de la barra de la sede, que se fue. */}
      <SyncStatus />

      <BotonPendientes modulo={modulo} ir={ir} />

      {/* Fase 2 clientes: sólo existe en el DOM si el backend confirmó
          `operador === true` — no es un botón deshabilitado para el resto de
          las cuentas, directamente no está. Fase 4 plataforma: NAVEGA a la
          ruta propia `/plataforma`. */}
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

      <MenuDeLaCuenta isAdmin={isAdmin} onLogout={onLogout} onAjustes={onAjustes} />
    </header>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function Dashboard() {
  // Arriving from the mount email opens that screen straight away, on the
  // space the email was about.
  const mountCode = MOUNT_DEEP_LINK;
  // Un solo diseño que se escala con la pantalla (`escala.ts`).
  useEscalaDeLaApp();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = useAuthStore(selectIsAdmin);
  const logout = useAuthStore((s) => s.logout);
  const clienteNombre = useAuthStore((s) => s.clienteNombre);
  const sede = useFixtureStore((s) => s.sede);

  /** El módulo lo dice la dirección (`modulos.ts`). */
  const modulo = moduloDeRuta(location.pathname);
  const ir = useCallback((m: Modulo) => navigate(RUTA_DE[m]), [navigate]);
  // El enlace del correo de montaje abre Montajes, sobre ese espacio.
  useEffect(() => {
    if (mountCode) navigate(RUTA_DE.montajes, { replace: true });
  }, [mountCode, navigate]);
  // Una dirección que no es de ningún módulo, o un módulo que este rol no
  // abre (quien trabaja en la tienda: Inicio, Indicadores y Montajes), va al
  // Inicio. Es lo mismo que hacía la pestaña: un trabajador sólo podía estar
  // en la sede o en los montajes.
  const permitido = modulo !== null && puedeAbrir(modulo, isAdmin);
  useEffect(() => {
    if (!permitido) navigate(RUTA_DE.inicio, { replace: true });
  }, [permitido, navigate]);
  const efectivo: Modulo = permitido ? modulo! : "inicio";

  const temaAjustes = useArmazon((s) => s.ajustes);
  /** Se vino de Montajes a resolver algo: la barra para volver. */
  const desdeMontaje = useArmazon((s) => s.desdeMontaje);
  /** Al volver, la fila de ese contrato marcada en Montajes. */
  const [montajeResaltado, setMontajeResaltado] = useState<string | null>(null);
  useEffect(() => {
    if (efectivo !== "montajes") { setMontajeResaltado(null); return; }
    // Se volvió a Montajes (por la barra o por el menú): esa fila, marcada.
    const d = useArmazon.getState().desdeMontaje;
    if (d) {
      setMontajeResaltado(d.codigo);
      useArmazon.getState().olvidarMontaje();
      useArmazon.getState().cerrarBandeja();
    }
  }, [efectivo]);
  const buscadorAbierto = useArmazon((s) => s.buscador);
  const ayudaAbierta = useArmazon((s) => s.ayuda);
  /** Tarifas y Temporadas, abiertas desde Ajustes, Ctrl K o «Más». */
  const [modalDeAjuste, setModalDeAjuste] = useState<"tarifas" | "temporadas" | null>(null);
  const cliente = useAuthStore((s) => s.cliente);
  const quien = useAuthStore((s) => s.email) ?? useAuthStore.getState().role ?? "anonimo";
  const planificando = usePlanograma((s) => s.abierta !== null);
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

  // «Ver la exhibición en 3D» se pide desde la pantalla comercial: el pedido
  // viaja por el store y acá se cambia de módulo. El encuadre lo resuelve el
  // propio editor.
  const enfoque3D = useFixtureStore((s) => s.enfoque3D);
  useEffect(() => {
    if (enfoque3D && isAdmin) ir("plano3d");
  }, [enfoque3D, isAdmin, ir]);

  // «Vender» del panel del Plano (rediseño, PR 3): el pedido viaja por el
  // store y acá se pasa a Contratos, que lo arma en Vender.
  const pedidoVender = useFixtureStore((s) => s.pedidoVender);
  useEffect(() => {
    if (pedidoVender && isAdmin) ir("contratos");
  }, [pedidoVender, isAdmin, ir]);

  // Distribuir, al guardar una cara a la que se entró desde Supervisar: vuelve
  // a Indicadores, que abre Supervisar con el aviso.
  const pedidoSupervisar = useFixtureStore((s) => s.pedidoSupervisar);
  useEffect(() => {
    if (pedidoSupervisar && isAdmin) ir("indicadores");
  }, [pedidoSupervisar, isAdmin, ir]);

  /** Contratos, Indicadores e Inicio son la misma pantalla comercial
   *  (`DashboardView`) en otro modo: pasar de uno a otro no la vuelve a montar
   *  —el contrato a medio armar, el periodo y lo elegido siguen ahí—. */
  const comercial = efectivo === "inicio" || efectivo === "contratos" || efectivo === "indicadores";
  /** La bandeja de Pendientes se cierra cuando una de sus filas lleva a otro
   *  módulo (Renovar → Contratos, Distribuir → el 3D): lo que se pidió es esa
   *  pantalla. Llegar al Inicio DESDE el Plano o Montajes para abrirla
   *  (`BotonPendientes`) no la cierra. */
  const moduloAnterior = useRef(efectivo);
  /** La dirección de la pantalla anterior, con su búsqueda: adónde vuelve el 3D. */
  const rutaActual = location.pathname + location.search;
  const rutaAnterior = useRef(rutaActual);
  /** Se llegó al 3D desde otra pantalla: la barra para volver (`vueltaAlCambiar`). */
  const [vueltaDelPlano, setVueltaDelPlano] = useState<VueltaDelPlano | null>(null);
  useEffect(() => {
    const antes = moduloAnterior.current;
    const rutaDeAntes = rutaAnterior.current;
    moduloAnterior.current = efectivo;
    rutaAnterior.current = rutaActual;
    if (antes === efectivo) return;
    setVueltaDelPlano((v) => vueltaAlCambiar(v, antes, efectivo, rutaDeAntes));
    const eraComercial = antes === "inicio" || antes === "contratos" || antes === "indicadores";
    if (eraComercial) useArmazon.getState().cerrarBandeja();
  }, [efectivo, rutaActual]);
  const modoComercial: ModoComercial = efectivo === "contratos" ? "vender" : "supervisar";
  const abrirAjustes = () => { setSeccionConfig(null); useArmazon.getState().abrirAjustes("comercial"); };
  /** Lo que hace cada función del registro (`acciones.ts`). */
  const ctx: ContextoDeAccion = {
    ir,
    navegar: (r) => navigate(r),
    abrirAjustes: (t) => { setSeccionConfig(null); useArmazon.getState().abrirAjustes(t); },
    abrirPendientes: (g) => { if (!comercial) ir("inicio"); useArmazon.getState().abrirBandeja(g ?? null); },
    pedir: (p) => useArmazon.getState().pedir(p),
    abrirTarifas: () => setModalDeAjuste("tarifas"),
    abrirTemporadas: () => setModalDeAjuste("temporadas"),
    abrirAyuda: () => useArmazon.getState().setAyuda(true),
    mostrarConfiguracionInicial: () => { mostrarConfiguracionInicial(cliente); useArmazon.getState().cerrarAjustes(); ir("inicio"); },
  };
  // Ctrl K (⌘ K en Mac) abre el buscador desde cualquier pantalla.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const a = useArmazon.getState();
        a.setBuscador(!a.buscador);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        height: altoDeLaVentana, overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <AvisoCuentaBanner
        onVerSuscripcion={() => {
          setSeccionConfig("suscripcion");
          useArmazon.getState().abrirAjustes("cuenta");
        }}
      />

      <div className="armazon" data-modulo={efectivo}>
        <MenuLateral actual={efectivo} esAdmin={isAdmin} clienteNombre={clienteNombre}
          sede={sede} onAjustes={abrirAjustes} />

        <div className="armazon-der">
          <Topbar
            modulo={efectivo}
            ir={ir}
            isAdmin={isAdmin}
            operador={operador}
            onIrPlataforma={() => navigate("/plataforma")}
            onAjustes={abrirAjustes}
            onLogout={logout}
            ctx={ctx}
            quien={quien}
          />

          {/* Se vino de Montajes a resolver algo («Ubicar la zona»): mientras
              tanto, esta barra lleva de vuelta a ese montaje, esté donde esté
              (Pendientes, la ficha, el plano). */}
          {desdeMontaje && efectivo !== "montajes" && (
            <div className="volver-montaje" role="status" data-volver-montaje>
              <span>
                Resolviendo <b className="mono">{desdeMontaje.corto}</b> para Montajes:{" "}
                {desdeMontaje.estado === "falta_zona" ? "falta ubicar su zona en la cara." : "falta su planometría."}
              </span>
              <button type="button" onClick={() => ir("montajes")}>
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Volver a Montajes
              </button>
              <button type="button" className="cerrar" aria-label="Quitar este aviso" onClick={() => useArmazon.getState().olvidarMontaje()}>
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          )}

          {/* Se llegó al 3D desde otra pantalla («Distribuir» de la ficha,
              Pendientes, Indicadores): el camino de vuelta, mientras se siga en
              el Plano. Con la barra de Montajes encima, ésa ya lleva de vuelta. */}
          {vueltaDelPlano && !desdeMontaje && (
            <div className="volver-montaje" role="status" data-volver-plano>
              <span>Viniste desde <b>{NOMBRE_DE[vueltaDelPlano.modulo]}</b>.</span>
              <button type="button" onClick={() => navigate(vueltaDelPlano.ruta)}>
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Volver a {NOMBRE_DE[vueltaDelPlano.modulo]}
              </button>
              <button type="button" className="cerrar" aria-label="Quitar este aviso" onClick={() => setVueltaDelPlano(null)}>
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          )}

          {/* El área de las pantallas: Vender y Supervisar miden el alto de su
              plano contra ESTE alto (`--alto-area`, medido), así el plano mide
              lo mismo en las dos sin adivinar cuánto mide el marco. */}
          <div
            ref={areaRef}
            className="area-pantallas"
            style={{
              flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
              ...(altoArea ? { ["--alto-area" as string]: `${altoArea}px` } : {}),
            }}
          >
            {comercial ? (
              <DashboardView
                inicio={efectivo === "inicio"}
                onIrAMontajes={() => ir("montajes")}
                onIrAlInicio={() => ir("inicio")}
                modo={modoComercial}
                onModo={(m) => ir(m === "vender" ? "contratos" : "indicadores")}
                onDisenarPlano={() => ir("plano")}
              />
            ) : efectivo === "plano3d" ? (
              <Suspense fallback={
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontSize: 13 }}>
                  Abriendo el editor 3D…
                </div>
              }>
                <StoreEditor3D />
              </Suspense>
            ) : efectivo === "muebles" ? (
              <Suspense fallback={
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontSize: 13 }}>
                  Abriendo Mis muebles…
                </div>
              }>
                <MisMuebles />
              </Suspense>
            ) : efectivo === "caras" ? (
              <Suspense fallback={
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontSize: 13 }}>
                  Abriendo las caras…
                </div>
              }>
                <CarasDeLaSede />
              </Suspense>
            ) : efectivo === "montajes" ? (
              <MountView initialCode={mountCode} onDone={() => ir("indicadores")} resaltar={montajeResaltado}
                onAbrirPendientes={isAdmin ? (d) => { ir("inicio"); useArmazon.getState().abrirDesdeMontaje(d); } : undefined} />
            ) : (
              <FloorPlan2D />
            )}
          </div>
        </div>
      </div>

      <BarraDeAbajo actual={efectivo} esAdmin={isAdmin} />

      {temaAjustes && isAdmin && (
        <SettingsModal enfocar={seccionConfig} tema={temaAjustes} onTema={(t) => useArmazon.getState().abrirAjustes(t)}
          onClose={() => useArmazon.getState().cerrarAjustes()}
          onTarifas={() => setModalDeAjuste("tarifas")} onTemporadas={() => setModalDeAjuste("temporadas")}
          onConfiguracionInicial={ctx.mostrarConfiguracionInicial} bloqueado={modalDeAjuste !== null} />
      )}
      {modalDeAjuste === "tarifas" && isAdmin && <RatesModal onClose={() => setModalDeAjuste(null)} />}
      {modalDeAjuste === "temporadas" && isAdmin && <SeasonsModal onClose={() => setModalDeAjuste(null)} />}
      {buscadorAbierto && <Buscador esAdmin={isAdmin} ctx={ctx} onCerrar={() => useArmazon.getState().setBuscador(false)} />}
      {ayudaAbierta && (
        <Ayuda modulo={efectivo} onCerrar={() => useArmazon.getState().setAyuda(false)}
          onDiccionario={() => { useArmazon.getState().setAyuda(false); ctx.ir("indicadores"); ctx.pedir("diccionario"); }} />
      )}
      {/* «Planificar la cara» (planogramas con destinos): encima de todo,
          desde el panel del mueble del plano. */}
      {planificando && (
        <Suspense fallback={null}>
          <PlanificarCara />
        </Suspense>
      )}
    </div>
  );
}
