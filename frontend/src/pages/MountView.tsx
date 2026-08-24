import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, MapPin, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { describeError } from "../api/client";
import {
  confirmMount, fetchMounts, latestByCode,
  type MountConfirmation, type MountMotivo,
} from "../api/mounts";
import { contractPhase, fullSpaceCode, isRentable, isDoubleGondola } from "../types/fixtures";
import type { UnifiedFixture } from "../types/fixtures";

/** Una cara de un mueble que hay que montar. */
interface Pendiente {
  /** `SEDE-CODIGO`: el mismo que viaja en el enlace del correo y el que se
   *  reporta. La nomenclatura corta se repite entre sedes y no sirve de llave. */
  code: string;
  /** Lo que se le muestra al mercaderista: `PUN-01`, no `NAVE-PUN-01`. */
  corto: string;
  sede: string;
  label: string;
  nomenclatura?: string;
  marca: string;
  proveedor: string;
  desde: string;
  hasta: string;
  /** El contrato ya arrancó: montarlo tarde es plata que el proveedor reclama. */
  urgente: boolean;
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
          sede: (data.sede as string) || sede,
          label: f.label || f.code,
          nomenclatura: f.nomenclatura,
          marca: (data.brandCategory as string) || "",
          proveedor: (data.supplierName as string) || "",
          desde: data.startDate ?? "",
          hasta: data.endDate ?? "",
          urgente: fase === "vigente",
        });
      }
    }
    out.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.desde.localeCompare(b.desde));
    return out;
  }, [fixturesBySede, sedes, fixtures, activeSede, ultimo]);

  // Enlace del correo: abrir directamente ese espacio.
  const [yaConfirmado, setYaConfirmado] = useState<MountConfirmation | null>(null);
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
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-3)" }}>
        {cargando
          ? "Cargando…"
          : pendientes.length === 0
          ? "No hay espacios pendientes de montaje."
          : `${pendientes.length} espacio${pendientes.length === 1 ? "" : "s"} por montar`}
      </p>

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

function MountForm({
  item, onCancel, onSaved,
}: {
  item: Pendiente;
  onCancel: () => void;
  onSaved: (m: MountConfirmation) => void;
}) {
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [quien, setQuien] = useState("");
  const [motivo, setMotivo] = useState<MountMotivo | null>(null);
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<"montado" | "no_montado" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  function elegirFoto(f: File | null) {
    if (vista) URL.revokeObjectURL(vista);
    setFoto(f);
    setVista(f ? URL.createObjectURL(f) : null);
  }

  async function enviar() {
    if (!modo) return;
    if (modo === "no_montado" && !motivo) {
      setError("Elegí el motivo para que quede claro a quién reclamarle.");
      return;
    }
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
      setError(describeError(e));
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
              {modo === "montado" && (
                <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · es la prueba</span>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
                  borderRadius: "var(--r-lg)", border: "1.5px dashed var(--line-strong)",
                  background: "var(--surface-2)", color: "var(--ink-2)",
                  fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <Camera size={22} />
                Tomar foto
              </button>
            )}
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
