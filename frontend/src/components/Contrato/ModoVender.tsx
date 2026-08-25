import { Check, Handshake, Loader2, Lock, X } from "lucide-react";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { isRentable, type FaceData, type UnifiedFixture } from "../../types/fixtures";
import {
  CabezaContrato, CamposContrato, fechaCorta, money, useContrato,
  type ResumenContrato,
} from "./Contrato";

/**
 * El modo Vender: el mapa grande a la izquierda, la ficha del contrato a la
 * derecha y una barra al pie con el resumen de lo que se está por firmar.
 *
 * La barra no es decoración. El botón de guardar salió de adentro del
 * formulario para que, antes de tocarlo, se lea de corrido lo que va a quedar
 * escrito —espacio → proveedor → valor → fechas—, que es la revisión que uno
 * hace en voz alta antes de colgar el teléfono. Y deja la ficha respirando: los
 * campos ya no compiten con un botón grande al final de un panel angosto.
 */

const ANCHO_FICHA = 428;

interface ModoVenderProps {
  fixture: UnifiedFixture | null;
  face: "A" | "B";
  onFace: (f: "A" | "B") => void;
  sede: string;
  rango: DateRange | null;
  /** El contrato que se acaba de guardar, si hay uno. */
  cerrado: ResumenContrato | null;
  onGuardado: (patch: Partial<FaceData>, resumen: ResumenContrato) => void;
  onCancelar: () => void;
  onSeguir: () => void;
  /** El mapa de la sede. Viene del tablero para que sea exactamente el mismo. */
  children: React.ReactNode;
}

// ─── Armazón ─────────────────────────────────────────────────────────────────

function Armazon({
  mapa, ficha, barra,
}: {
  mapa: React.ReactNode;
  ficha: React.ReactNode;
  barra: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        {mapa}
        {/* La ficha mide lo que mide su contenido y se queda pegada arriba: el
            mapa es mucho más alto que el formulario, y estirar la tarjeta hasta
            abajo sólo repartía aire entre los campos. */}
        <div
          style={{
            width: ANCHO_FICHA, flexShrink: 0, minWidth: 0,
            alignSelf: "flex-start", position: "sticky", top: 0,
            display: "flex", flexDirection: "column",
          }}
        >
          {ficha}
        </div>
      </div>
      {barra}
    </div>
  );
}

const tarjeta: React.CSSProperties = {
  display: "flex", flexDirection: "column",
  borderRadius: "var(--r-xl)", background: "var(--surface)",
  border: "1px solid var(--line)", boxShadow: "var(--shadow-xs)",
  overflow: "hidden",
};

/** La barra del pie. Pegada abajo mientras se hace scroll: el resumen y el
 *  botón no pueden quedar fuera de pantalla justo cuando hacen falta. */
function Barra({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "sticky", bottom: -20, zIndex: 5,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        minHeight: 62, padding: "10px 16px", marginBottom: -20,
        borderRadius: "var(--r-xl) var(--r-xl) 0 0",
        background: "var(--surface)", borderTop: "1px solid var(--line)",
        borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)",
        boxShadow: "0 -6px 18px rgba(26,24,20,.06)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Estados sin contrato en curso ───────────────────────────────────────────

function SinElegir() {
  return (
    <div
      style={{
        ...tarjeta,
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "30px 26px", gap: 12,
        background: "var(--surface-2)", border: "1px dashed var(--line-strong)",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          width: 46, height: 46, borderRadius: "var(--r-xl)",
          background: "var(--accent-50)", color: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Handshake size={22} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink-1)" }}>
        Elegí un espacio en el mapa
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 280 }}>
        Los verdes están libres todo el periodo, los amarillos tienen parte
        vendida. Tocá uno y el contrato se llena acá.
      </div>
    </div>
  );
}

/** Un mueble que no se alquila: una caja, una pared, la zona de frutas. Tocarlo
 *  en el mapa no puede abrir un contrato — no hay nada que vender ahí. */
function NoComercializable({ fixture }: { fixture: UnifiedFixture }) {
  return (
    <div
      style={{
        ...tarjeta,
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "30px 26px", gap: 12,
        background: "var(--surface-2)", border: "1px dashed var(--line-strong)",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          width: 46, height: 46, borderRadius: "var(--r-xl)",
          background: "var(--surface-3)", color: "var(--ink-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Lock size={20} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink-1)" }}>
        {fixture.label || fixture.code} es parte del local
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 280 }}>
        Está marcado como no comercializable: no admite contrato y no cuenta en
        la ocupación. Para alquilarlo, cambiá su destino desde el Plano.
      </div>
    </div>
  );
}

function Cerrado({ datos, onSeguir }: { datos: ResumenContrato; onSeguir: () => void }) {
  return (
    <div
      style={{
        ...tarjeta,
        padding: 20, gap: 0, justifyContent: "flex-start",
        background: "var(--success-50)", border: "1px solid var(--success-100)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <Check size={17} style={{ color: "var(--success)" }} />
        <b style={{ fontSize: 15 }}>Contrato guardado</b>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
        <b>{datos.corto}</b> queda contratado para <b>{datos.proveedor}</b>, del{" "}
        {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}.
        <br />
        <br />
        Ya salieron los avisos: el resumen con el valor al comercial, la orden de
        montaje <b>sin valores</b> al mercaderista —con el plano del espacio
        señalado— y la constancia al proveedor si tiene correo cargado.
      </div>
      {datos.avisoPlanometria && (
        <div
          style={{
            marginTop: 12, padding: "9px 11px", borderRadius: "var(--r-md)",
            background: "var(--warning-50)", color: "var(--warning)",
            fontSize: 12.5, lineHeight: 1.45,
          }}
        >
          {datos.avisoPlanometria}
        </div>
      )}
      <button
        onClick={onSeguir}
        style={{
          marginTop: 15, alignSelf: "flex-start", padding: "9px 16px",
          borderRadius: "var(--r-md)", border: "1px solid var(--success)",
          background: "transparent", color: "var(--success)",
          fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Vender otro espacio
      </button>
    </div>
  );
}

// ─── Con un espacio elegido ──────────────────────────────────────────────────

function ConEspacio({
  fixture, face, onFace, sede, rango, onGuardado, onCancelar, children,
}: Omit<ModoVenderProps, "fixture" | "cerrado" | "onSeguir"> & { fixture: UnifiedFixture }) {
  const c = useContrato({ fixture, face, sede, rango, onGuardado });
  const guardando = c.estado === "guardando";

  return (
    <Armazon
      mapa={children}
      ficha={
        <div style={tarjeta}>
          <CabezaContrato c={c} onFace={onFace} />
          <CamposContrato c={c} />
        </div>
      }
      barra={
        <Barra>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                padding: "4px 9px", borderRadius: "var(--r-sm)",
                background: "var(--accent-50)", color: "var(--accent-700)",
              }}
            >
              {c.fixture.nomenclatura || c.corto}
            </span>
            <span style={{ color: "var(--ink-4)" }}>→</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: c.proveedor ? "var(--ink-1)" : "var(--ink-4)" }}>
              {c.proveedor.trim() || "sin proveedor"}
            </span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 700,
                color: c.monto > 0 ? "var(--success)" : "var(--ink-4)",
              }}
            >
              {c.monto > 0 ? money(c.monto) : "sin valor"}
            </span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {c.fechasEnOrden
                ? `${fechaCorta(c.desde)} → ${fechaCorta(c.hasta)} (${c.dias} día${c.dias === 1 ? "" : "s"})`
                : "fechas por definir"}
            </span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {c.falta && (
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.falta}</span>
            )}
            <button
              onClick={onCancelar}
              disabled={guardando}
              style={{
                height: 40, padding: "0 16px", borderRadius: "var(--r-lg)",
                border: "1px solid var(--line)", background: "var(--surface)",
                color: "var(--ink-2)", fontSize: 13.5, fontWeight: 600,
                fontFamily: "inherit", cursor: guardando ? "default" : "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <X size={13} /> Cancelar
            </button>
            <button
              onClick={c.guardar}
              disabled={!c.puedeGuardar || guardando}
              style={{
                height: 40, padding: "0 20px", borderRadius: "var(--r-lg)", border: "none",
                display: "inline-flex", alignItems: "center", gap: 7,
                background: c.puedeGuardar ? "var(--accent)" : "var(--surface-3)",
                color: c.puedeGuardar ? "#fff" : "var(--ink-4)",
                fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                cursor: c.puedeGuardar && !guardando ? "pointer" : "default",
              }}
            >
              {guardando ? (
                <Loader2 size={15} style={{ animation: "spin .9s linear infinite" }} />
              ) : (
                <Check size={15} />
              )}
              {guardando ? "Guardando…" : "Guardar contrato y avisar"}
            </button>
          </div>
        </Barra>
      }
    />
  );
}

// ─── ──────────────────────────────────────────────────────────────────────────

export default function ModoVender(props: ModoVenderProps) {
  const { fixture, face, cerrado, onSeguir, children } = props;

  if (cerrado) {
    return <Armazon mapa={children} ficha={<Cerrado datos={cerrado} onSeguir={onSeguir} />} barra={null} />;
  }
  if (!fixture) {
    return <Armazon mapa={children} ficha={<SinElegir />} barra={null} />;
  }
  if (!isRentable(fixture)) {
    return <Armazon mapa={children} ficha={<NoComercializable fixture={fixture} />} barra={null} />;
  }
  // La clave remonta el formulario al cambiar de espacio o de cara: lo que se
  // había tecleado para otra punta no puede quedar colgado en ésta.
  return <ConEspacio key={`${fixture.id}-${face}`} {...props} fixture={fixture} />;
}
