import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, MapPin, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { describeError } from "../api/client";
import {
  confirmMount, fetchMounts, latestByCode,
  type MountConfirmation, type MountMotivo,
} from "../api/mounts";
import { contractPhase, fullSpaceCode, isRentable, isDoubleGondola } from "../types/fixtures";
import MiniMapa, { describirUbicacion } from "../components/MiniMapa/MiniMapa";
import { prepararFoto, MAX_SUBIDA } from "../utils/foto";
import type { UnifiedFixture } from "../types/fixtures";

/** Una cara de un mueble que hay que montar. */
interface Pendiente {
  /** `SEDE-CODIGO`: el mismo que viaja en el enlace del correo y el que se
   *  reporta. La nomenclatura corta se repite entre sedes y no sirve de llave. */
  code: string;
  /** Lo que se le muestra al mercaderista: `PUN-01`, no `NAVE-PUN-01`. */
  corto: string;
  /** El código del MUEBLE en el layout, sin el sufijo de cara. La cara B se
   *  reporta como `PUN-01-B` pero en el plano no hay dos muebles: hay uno con
   *  dos caras, y es ese el que hay que señalar. */
  fixtureCode: string;
  sede: string;
  label: string;
  nomenclatura?: string;
  marca: string;
  proveedor: string;
  desde: string;
  hasta: string;
  /** El contrato ya arrancó hace poco: montarlo tarde es plata que el proveedor
   *  reclama. */
  urgente: boolean;
  /** Arrancó hace más de un mes y nunca se reportó. La exhibición está armada
   *  hace rato — lo que falta es el papel. Se deja en la lista para poder
   *  reportarlo, pero al final: si va arriba, entierra el trabajo de hoy. */
  viejo: boolean;
}

/** Días hacia atrás en que todavía tiene sentido tratar un montaje como
 *  pendiente de verdad. Espeja la ventana del tablero. */
const VENTANA_DIAS = 30;

function diasDesde(iso: string): number {
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const inicio = Date.UTC(y, m - 1, d);
  const hoy = new Date();
  const cero = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((cero - inicio) / 86_400_000);
}

const MOTIVOS: { id: MountMotivo; label: string }[] = [
  { id: "sin_material", label: "El proveedor no entregó el material" },
  { id: "sin_producto", label: "No llegó el producto" },
  { id: "espacio_ocupado", label: "El espacio está ocupado por otra cosa" },
  { id: "otro", label: "Otro motivo" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MESES[m - 1]}` : iso;
}

/**
 * Lo que ve el mercaderista en el celular.
 *
 * No es el escritorio reducido: es una lista de tarjetas grandes y, al tocar
 * una, una sola pregunta — ¿lo montaste? — con la cámara a un toque. No hay
 * valores en ninguna parte, igual que en su correo.
 */
export default function MountView({
  initialCode,
  onDone,
}: {
  /** Código que venía en el enlace del correo, si vino por ahí. */
  initialCode?: string | null;
  onDone?: () => void;
}) {
  const fixturesBySede = useFixtureStore((s) => s.fixturesBySede);
  const sedes = useFixtureStore((s) => s.sedes);
  const activeSede = useFixtureStore((s) => s.sede);
  const fixtures = useFixtureStore(selectFixtures);
  /** El primer pull del servidor ya terminó — antes de eso no hay espacios. */
  const layoutListo = useFixtureStore((s) => s.lastSyncedAt) !== null;
  /** La última sincronización falló: una lista vacía puede ser falta de señal
   *  y no falta de trabajo. */
  const sinConexion = useFixtureStore((s) => s.syncState) === "error";

  const [mounts, setMounts] = useState<MountConfirmation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<Pendiente | null>(null);

  useEffect(() => {
    fetchMounts()
      .then(setMounts)
      .catch(() => setMounts([]))
      .finally(() => setCargando(false));
  }, []);

  const ultimo = useMemo(() => latestByCode(mounts), [mounts]);

  // Todas las sedes, no solo la activa: el mercaderista puede cubrir varias y
  // el enlace del correo puede apuntar a cualquiera.
  const pendientes = useMemo<Pendiente[]>(() => {
    const out: Pendiente[] = [];
    const universo = sedes.length
      ? sedes.flatMap((s) => (fixturesBySede[s] ?? []).map((f) => [s, f] as const))
      : fixtures.map((f) => [activeSede, f] as const);

    for (const [sede, f] of universo) {
      if (!isRentable(f)) continue;
      // El código completo se arma con la sede del propio mueble cuando la
      // trae, igual que al guardar el contrato: un mueble puede haber quedado
      // con la sede escrita adentro y no coincidir con la clave del mapa.
      const base = fullSpaceCode((f.sede as string) || sede, f.code);
      const caras: { code: string; corto: string; data: Partial<UnifiedFixture> }[] = [
        { code: base, corto: f.code, data: f },
      ];
      if (isDoubleGondola(f) && f.faceB) {
        caras.push({
          code: `${base}-B`,
          corto: `${f.code}-B`,
          data: f.faceB as Partial<UnifiedFixture>,
        });
      }
      for (const { code, corto, data } of caras) {
        const cara = {
          status: (data.status ?? "free") as UnifiedFixture["status"],
          startDate: data.startDate ?? "",
          endDate: data.endDate ?? "",
        };
        const fase = contractPhase(cara);
        // Solo lo que tiene contrato por delante o corriendo. Lo vencido ya no
        // se monta, y lo libre no tiene qué montar.
        if (fase !== "vigente" && fase !== "pendiente") continue;
        // Ya reportado como montado: sale de la lista.
        if (ultimo[code]?.estado === "montado") continue;
        out.push({
          code,
          corto,
          fixtureCode: f.code,
          sede: (data.sede as string) || sede,
          label: f.label || f.code,
          nomenclatura: f.nomenclatura,
          marca: (data.brandCategory as string) || "",
          proveedor: (data.supplierName as string) || "",
          desde: data.startDate ?? "",
          hasta: data.endDate ?? "",
          urgente: fase === "vigente" && diasDesde(data.startDate ?? "") <= VENTANA_DIAS,
          viejo: fase === "vigente" && diasDesde(data.startDate ?? "") > VENTANA_DIAS,
        });
      }
    }
    // Tres tramos: lo que arrancó y hay que montar ya, lo que viene, y al final
    // lo viejo sin reportar. Ordenar solo por fecha ponía arriba contratos de
    // enero y enterraba el trabajo de esta semana.
    const tramo = (p: Pendiente) => (p.urgente ? 0 : p.viejo ? 2 : 1);
    out.sort((a, b) => tramo(a) - tramo(b) || a.desde.localeCompare(b.desde));
    return out;
  }, [fixturesBySede, sedes, fixtures, activeSede, ultimo]);

  // Enlace del correo: abrir directamente ese espacio.
  const [yaConfirmado, setYaConfirmado] = useState<MountConfirmation | null>(null);

  /** El espacio ya reportado, reconstruido para poder volver a abrirlo.
   *
   *  No está en `pendientes` justamente porque ya se reportó, así que se arma
   *  de nuevo desde el layout. Sin esto no hay forma de corregir una foto
   *  movida: el espacio desaparece de la lista y el enlace del correo solo
   *  dice "ya se reportó". */
  const reportarDeNuevo = useMemo<Pendiente | null>(() => {
    if (!yaConfirmado) return null;
    const code = yaConfirmado.space_code.toUpperCase();
    const base = code.endsWith("-B") ? code.slice(0, -2) : code;
    for (const [sede, lista] of Object.entries(fixturesBySede)) {
      for (const f of lista) {
        const completo = fullSpaceCode((f.sede as string) || sede, f.code);
        if (completo !== base) continue;
        const caraB = code.endsWith("-B");
        const data = (caraB ? f.faceB : f) as Partial<UnifiedFixture>;
        return {
          code,
          corto: caraB ? `${f.code}-B` : f.code,
          fixtureCode: f.code,
          sede: (data?.sede as string) || (f.sede as string) || sede,
          label: f.label || f.code,
          nomenclatura: f.nomenclatura,
          marca: (data?.brandCategory as string) || "",
          proveedor: (data?.supplierName as string) || "",
          desde: data?.startDate ?? "",
          hasta: data?.endDate ?? "",
          urgente: false,
          viejo: false,
        };
      }
    }
    return null;
  }, [yaConfirmado, fixturesBySede]);
  const abiertoPorEnlace = useRef(false);
  useEffect(() => {
    // Esperar a que el layout haya llegado del servidor. Sin esta condición el
    // efecto corría apenas terminaban de cargar las confirmaciones, cuando la
    // lista de espacios todavía estaba vacía: no encontraba nada, se marcaba
    // como consumido y el enlace del correo no volvía a funcionar nunca.
    if (!initialCode || cargando || !layoutListo || abiertoPorEnlace.current) return;
    abiertoPorEnlace.current = true;
    const code = initialCode.toUpperCase();
    const found = pendientes.find((p) => p.code.toUpperCase() === code);
    if (found) {
      setAbierto(found);
      return;
    }
    // Tocar el enlace dos veces es lo más normal del mundo. Decir por qué no
    // hay nada que hacer es mejor que dejar la lista sin explicación.
    const previo = ultimo[code];
    if (previo) setYaConfirmado(previo);
  }, [initialCode, cargando, layoutListo, pendientes, ultimo]);

  if (abierto) {
    return (
      <MountForm
        item={abierto}
        vecinos={fixturesDeSede(fixturesBySede, abierto.sede)}
        onCancel={() => setAbierto(null)}
        onSaved={(m) => {
          setMounts((prev) => [m, ...prev]);
          setAbierto(null);
        }}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", padding: "16px 14px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Montajes
        </h2>
        {onDone && (
          <button
            onClick={onDone}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "var(--ink-3)", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Ver el resumen
          </button>
        )}
      </div>
      {/* Tres estados, no dos. `cargando` era solo el fetch de confirmaciones:
          mientras el layout todavía venía en camino —o si la sincronización
          falló por falta de señal— la pantalla decía "no hay espacios
          pendientes", y con eso el mercaderista guarda el celular y se va. */}
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-3)" }}>
        {cargando || !layoutListo
          ? "Cargando espacios…"
          : pendientes.length === 0
          ? "No hay espacios pendientes de montaje."
          : `${pendientes.length} espacio${pendientes.length === 1 ? "" : "s"} por montar`}
      </p>
      {!cargando && layoutListo && pendientes.length === 0 && sinConexion && (
        <p style={{ margin: "-8px 0 16px", fontSize: 13, color: "var(--warning)" }}>
          La lista no se pudo actualizar. Buscá señal y volvé a entrar antes de dar por
          hecho que no hay nada.
        </p>
      )}

      {yaConfirmado && (
        <div
          style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "11px 12px", marginBottom: 14,
            borderRadius: "var(--r-md)",
            background: "var(--success-50)", border: "1px solid var(--success-100)",
          }}
        >
          <Check size={15} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.45 }}>
            <b style={{ fontFamily: "var(--font-mono)" }}>{yaConfirmado.space_code}</b> ya se
            reportó como {yaConfirmado.estado === "montado" ? "montado" : "no montado"}
            {yaConfirmado.reportado_por ? ` por ${yaConfirmado.reportado_por}` : ""}.
            {/* Una foto movida, con guantes y una mano, es lo más normal del
                mundo — y es la prueba que el proveedor va a discutir en tres
                meses. El histórico guarda todos los reportes y vale el último,
                así que corregir es volver a reportar. */}
            {reportarDeNuevo && (
              <>
                {" "}
                <button
                  onClick={() => { setAbierto(reportarDeNuevo); setYaConfirmado(null); }}
                  style={{
                    background: "none", border: "none", padding: 0,
                    color: "var(--accent-700)", fontWeight: 600, fontSize: 13,
                    fontFamily: "inherit", cursor: "pointer", textDecoration: "underline",
                  }}
                >
                  Corregir el reporte
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setYaConfirmado(null)}
            aria-label="Cerrar aviso"
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "var(--ink-3)", cursor: "pointer", padding: 0, flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendientes.map((p) => (
          <button
            key={`${p.sede}-${p.code}`}
            onClick={() => setAbierto(p)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "14px 14px", borderRadius: "var(--r-lg)",
              background: "var(--surface)",
              border: `1px solid ${p.urgente ? "var(--warning)" : "var(--line)"}`,
              boxShadow: "var(--shadow-xs)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                  color: "var(--ink-1)",
                }}
              >
                {p.nomenclatura || p.corto}
              </span>
              {p.urgente && (
                <span
                  style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                    background: "var(--warning-50)", color: "var(--warning)",
                  }}
                >
                  ya empezó
                </span>
              )}
              <span
                style={{
                  marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 11, color: "var(--ink-3)",
                }}
              >
                <MapPin size={11} /> {p.sede}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)" }}>
              {p.proveedor || "Sin proveedor"}
              {p.marca && <span style={{ color: "var(--ink-2)", fontWeight: 500 }}> · {p.marca}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
              {p.label} · desde el {fecha(p.desde)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Formulario de una confirmación ──────────────────────────────────────────

/** Los muebles de una sede, tolerando que la clave del mapa y la sede escrita
 *  dentro del mueble difieran en mayúsculas o espacios. */
function fixturesDeSede(
  porSede: Record<string, UnifiedFixture[]>,
  sede: string,
): UnifiedFixture[] {
  const directo = porSede[sede];
  if (directo) return directo;
  const buscada = (sede ?? "").trim().toUpperCase();
  const clave = Object.keys(porSede).find((k) => k.trim().toUpperCase() === buscada);
  return clave ? porSede[clave] : [];
}

function MountForm({
  item, vecinos, onCancel, onSaved,
}: {
  item: Pendiente;
  /** Todos los muebles de la sede: el plano necesita el contexto, no solo el destino. */
  vecinos: UnifiedFixture[];
  onCancel: () => void;
  onSaved: (m: MountConfirmation) => void;
}) {
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [quien, setQuien] = useState("");
  const [motivo, setMotivo] = useState<MountMotivo | null>(null);
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<"montado" | "no_montado" | null>(null);
  /** La foto se está achicando. Dura menos de un segundo, pero enviar en ese
   *  hueco subiría el archivo sin reducir. */
  const [preparando, setPreparando] = useState(false);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);

  // El mueble puede no estar en el layout: un contrato guardado sobre un
  // espacio que después se borró del plano deja el reporte válido pero sin
  // dónde dibujarlo. Mejor omitir el mapa que mostrar uno que no señala nada.
  const tieneMapa = useMemo(
    () => vecinos.some((f) => f.code.toUpperCase() === item.fixtureCode.trim().toUpperCase()),
    [vecinos, item.fixtureCode],
  );
  const ubicacion = useMemo(
    () => (tieneMapa ? describirUbicacion(vecinos, item.fixtureCode) : null),
    [tieneMapa, vecinos, item.fixtureCode],
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  async function elegirFoto(f: File | null) {
    if (vista) URL.revokeObjectURL(vista);
    if (!f) {
      setFoto(null);
      setVista(null);
      return;
    }
    // Se muestra la vista previa del archivo ORIGINAL: es instantánea y es lo
    // que la persona acaba de ver por la cámara. La reducción corre detrás.
    const vistaNueva = URL.createObjectURL(f);
    setVista(vistaNueva);
    setPreparando(true);
    setError("");
    try {
      const lista = await prepararFoto(f);
      if (lista.size > MAX_SUBIDA) {
        // Se limpia también la vista previa. Dejarla puesta mostraba la foto en
        // pantalla mientras la app insistía en que faltaba: parece un error de
        // la aplicación y no hay forma de darse cuenta de qué pasó.
        URL.revokeObjectURL(vistaNueva);
        setFoto(null);
        setVista(null);
        setError(
          "El teléfono no pudo achicar esta foto y pesa más de lo que el servidor acepta. " +
          "Tomala otra vez desde la app en vez de elegirla de la galería.",
        );
        return;
      }
      setFoto(lista);
    } finally {
      setPreparando(false);
    }
  }

  async function enviar() {
    if (!modo) return;
    // Ref y no estado: `enviando` es el MISMO valor de closure con el que se
    // calculó `disabled` en el render, así que dos toques seguidos antes del
    // siguiente render pasaban los dos, subían la foto dos veces por datos
    // móviles y creaban dos reportes del mismo montaje.
    if (enviandoRef.current) return;
    if (modo === "no_montado" && !motivo) {
      setError("Elegí el motivo para que quede claro a quién reclamarle.");
      return;
    }
    // El servidor también lo exige. Acá se repite para no gastarle al
    // mercaderista una subida y una espera para decirle que falta la foto.
    if (preparando) {
      setError("La foto se está preparando, un segundo.");
      return;
    }
    if (modo === "montado" && !foto) {
      setError("Falta la foto. Es la prueba de que la exhibición quedó armada.");
      return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    try {
      const saved = await confirmMount({
        spaceCode: item.code,
        sede: item.sede,
        estado: modo,
        motivo: modo === "no_montado" ? motivo! : undefined,
        nota: nota.trim() || undefined,
        reportadoPor: quien.trim() || undefined,
        foto,
      });
      onSaved(saved);
    } catch (e: any) {
      // Un tiempo agotado no trae `detail`, y "No se pudo completar la
      // operación" no le dice a nadie qué hacer. Acá sí: reintentar sirve,
      // y el formulario quedó lleno.
      const timeout = e?.code === "ECONNABORTED" || /timeout/i.test(e?.message ?? "");
      setError(
        timeout
          ? "La subida tardó demasiado. Buscá mejor señal y volvé a intentar: no se perdió nada."
          : describeError(e),
      );
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  const campo: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: "var(--r-md)",
    border: "1px solid var(--line)", background: "var(--surface-2)",
    color: "var(--ink-1)", fontSize: 15, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", padding: "12px 14px 44px" }}>
      <button
        onClick={onCancel}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12,
          background: "none", border: "none", color: "var(--ink-2)",
          fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", padding: 0,
        }}
      >
        <ChevronLeft size={15} /> Volver
      </button>

      <div
        style={{
          padding: "14px", borderRadius: "var(--r-lg)", background: "var(--surface)",
          border: "1px solid var(--line)", marginBottom: 16,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>
          {item.sede} · {item.corto}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, letterSpacing: "-0.02em" }}>
          {item.proveedor || "Sin proveedor"}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 2 }}>
          {item.marca && <>{item.marca} · </>}{item.label}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
          Del {fecha(item.desde)} al {fecha(item.hasta)}
        </div>
      </div>

      {/* Dónde queda. Va antes de la pregunta a propósito: primero se camina
          hasta el mueble, después se responde. El plano se dibuja con los
          muebles de la sede, y si el destino no aparece en el layout se omite
          entero en vez de mostrar un plano sin señalar nada. */}
      {tieneMapa && (
        <div
          style={{
            padding: "12px 12px 10px", borderRadius: "var(--r-lg)",
            background: "var(--surface)", border: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 5, marginBottom: 8,
              fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)",
              letterSpacing: "0.03em", textTransform: "uppercase",
            }}
          >
            <MapPin size={12} /> Dónde queda
          </div>
          <MiniMapa fixtures={vecinos} targetCode={item.fixtureCode} />
          {ubicacion && (
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 8, textAlign: "center" }}>
              {ubicacion}
            </div>
          )}
        </div>
      )}

      {/* La pregunta, en botones grandes para el pulgar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {([
          { id: "montado" as const, label: "Lo monté", icon: <Check size={17} />, color: "var(--success)" },
          { id: "no_montado" as const, label: "No pude", icon: <X size={17} />, color: "var(--warning)" },
        ]).map((b) => (
          <button
            key={b.id}
            onClick={() => { setModo(b.id); setError(""); }}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              minHeight: 52, borderRadius: "var(--r-lg)",
              fontSize: 15.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              border: `1.5px solid ${modo === b.id ? b.color : "var(--line)"}`,
              background: modo === b.id ? b.color : "var(--surface)",
              color: modo === b.id ? "#fff" : "var(--ink-2)",
            }}
          >
            {b.icon} {b.label}
          </button>
        ))}
      </div>

      {modo === "no_montado" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
            ¿Qué pasó?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMotivo(m.id); setError(""); }}
                style={{
                  textAlign: "left", padding: "11px 12px", borderRadius: "var(--r-md)",
                  fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                  border: `1px solid ${motivo === m.id ? "var(--accent)" : "var(--line)"}`,
                  background: motivo === m.id ? "var(--accent-50)" : "var(--surface)",
                  color: motivo === m.id ? "var(--accent-700)" : "var(--ink-1)",
                  fontWeight: motivo === m.id ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {modo && (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
              Foto {modo === "montado" ? "del espacio armado" : "de cómo quedó"}
              <span style={{ fontWeight: 400, color: modo === "montado" ? "var(--accent-700)" : "var(--ink-3)" }}>
                {modo === "montado" ? " · obligatoria" : " · opcional"}
              </span>
            </div>
            {/* Dos entradas separadas a propósito. `capture` manda a la
                cámara de una, que es el camino rápido; pero en Android saca la
                opción de galería, y con la foto obligatoria eso deja atrapado
                a quien ya la tomó antes — por ejemplo cuando montó sin señal y
                volvió a reportar más tarde. */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
            />
            {vista ? (
              <div style={{ position: "relative" }}>
                <img
                  src={vista}
                  alt="Foto del montaje"
                  style={{
                    width: "100%", maxHeight: 260, objectFit: "cover",
                    borderRadius: "var(--r-lg)", border: "1px solid var(--line)", display: "block",
                  }}
                />
                <button
                  onClick={() => elegirFoto(null)}
                  aria-label="Quitar foto"
                  style={{
                    position: "absolute", top: 8, right: 8,
                    width: 30, height: 30, borderRadius: 99,
                    background: "rgba(20,19,15,.7)", border: "none",
                    color: "#fff", cursor: "pointer",
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => inputRef.current?.click()}
                style={{
                  width: "100%", minHeight: 92, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 6,
                  borderRadius: "var(--r-lg)",
                  border: `1.5px dashed ${modo === "montado" ? "var(--accent-200)" : "var(--line-strong)"}`,
                  background: modo === "montado" ? "var(--accent-50)" : "var(--surface-2)",
                  color: modo === "montado" ? "var(--accent-700)" : "var(--ink-2)",
                  fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <Camera size={22} />
                {preparando ? "Preparando…" : "Tomar foto"}
              </button>
            )}
            <button
              onClick={() => galeriaRef.current?.click()}
              style={{
                width: "100%", marginTop: 8, padding: "9px 0",
                background: "none", border: "none", color: "var(--ink-3)",
                fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              {vista ? "Cambiar por otra de la galería" : "o elegir una de la galería"}
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              Tu nombre
            </div>
            <input
              type="text"
              value={quien}
              onChange={(e) => setQuien(e.target.value)}
              placeholder="Quién reporta"
              style={campo}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              Nota <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>· opcional</span>
            </div>
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Algo que haya que saber"
              style={{ ...campo, resize: "none" }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 10, fontSize: 13, color: "var(--danger)" }}>{error}</div>
          )}

          <button
            onClick={enviar}
            disabled={enviando}
            style={{
              width: "100%", minHeight: 50, borderRadius: "var(--r-lg)",
              background: "var(--accent)", color: "#fff", border: "none",
              fontSize: 16, fontWeight: 700, fontFamily: "inherit",
              cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.6 : 1,
            }}
          >
            {enviando ? "Enviando…" : "Confirmar"}
          </button>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ink-3)", textAlign: "center" }}>
            La fecha y la hora las pone el sistema al recibir el reporte.
          </p>
        </>
      )}
    </div>
  );
}
