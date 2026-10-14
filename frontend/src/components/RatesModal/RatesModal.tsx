import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useFixtureStore } from "../../store/fixtureStore";
import { RATE_TYPES, rateTypeLabel } from "../../types/fixtures";
import { useModalAbierto } from "../../tema";
import { nombreDeTarifa } from "../../catalogo/nombresPropios";
import { CATALOGO_DE_MUEBLES } from "../../catalogo/catalogo";

/** Las tarifas que son de una DIVISIÓN (`parte_puerta` → «puertas»): vacías,
 *  la referencia es la del mueble entero dividida por sus partes. */
const DIVISION_POR_TARIFA: ReadonlyMap<string, string> = new Map(
  Object.values(CATALOGO_DE_MUEBLES.partes.clases)
    .filter((c) => c.es === "division")
    .map((c) => [c.tarifa, c.plural]),
);

/** Tariff editor (admin only). One general rate per fixture type plus an
 *  optional override for the sede being edited. Every keystroke goes through
 *  the store, which pushes with the same debounce as the shared settings —
 *  there is no explicit save button, matching how sedes and labels behave. */
export default function RatesModal({ onClose }: { onClose: () => void }) {
  const rates = useFixtureStore((s) => s.referenceRates);
  const { sedes, sede, setReferenceRate, loadRates } = useFixtureStore();
  // Cómo le dicen acá a cada familia (Configuración). La fila lo dice primero
  // y, debajo, el nombre de RECABRA: es por el que pregunta quien la ayuda
  // desde la consola, que compara supermercados con ese nombre.
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);

  // The dashboard's active sede is almost always the one being priced, so the
  // override column starts there; the selector switches it without closing.
  const [editSede, setEditSede] = useState(sede);

  useEffect(() => {
    if (rates === null) void loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Types beyond the static catalog that already carry a configured rate must
  // stay visible, or their value could never be seen nor cleared again.
  const rows = useMemo(() => {
    const known = new Set(RATE_TYPES.map((t) => t.type));
    const extra = new Set<string>();
    if (rates) {
      Object.keys(rates.default).forEach((t) => { if (!known.has(t)) extra.add(t); });
      Object.values(rates.by_sede).forEach((perSede) =>
        Object.keys(perSede).forEach((t) => { if (!known.has(t)) extra.add(t); }),
      );
    }
    return [
      ...RATE_TYPES,
      ...[...extra].sort().map((type) => ({ type, label: rateTypeLabel(type) })),
    ];
  }, [rates]);

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 30, padding: "0 8px",
    borderRadius: "var(--r-md)", border: "1px solid var(--brd-control)",
    background: "var(--surface-2)", color: "var(--ink-1)",
    fontSize: 12, fontFamily: "var(--font-mono)", outline: "none",
    textAlign: "right",
  };

  const thStyle: React.CSSProperties = {
    padding: "6px 8px", textAlign: "right",
    fontSize: 9.5, fontWeight: 700, color: "var(--ink-3)",
    textTransform: "uppercase", letterSpacing: "0.08em",
    whiteSpace: "nowrap",
  };

  // Este modal NO tiene botón principal amarillo, y no es un olvido: no tiene
  // botón de guardar. Las tarifas se guardan al salir de cada campo, igual que
  // las sedes y las etiquetas (ver el encabezado del archivo). El único botón
  // es «Cerrar», que es salida, no acción. Lo que sí hace es APAGAR el amarillo
  // de la pantalla de atrás mientras está abierto.
  useModalAbierto();

  return (
    <div
      data-capa-modal
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(20,19,15,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="rates-modal"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "86vh",
          display: "flex", flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <SlidersHorizontal size={15} style={{ color: "var(--accent)" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Tarifas de referencia
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

        {/* Explainer + sede selector */}
        <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid var(--line-soft)" }}>
          <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            Canon mensual esperado (COP) por tipo de mueble. La tarifa general aplica en todas
            las sedes; la columna de sede la ajusta solo ahí. Con esto, el Dashboard marca los
            contratos que pagan por debajo.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)" }}>
              Ajustar sede:
            </span>
            <select
              value={editSede}
              onChange={(e) => setEditSede(e.target.value)}
              style={{
                height: 28, padding: "0 8px",
                borderRadius: "var(--r-md)", border: "1px solid var(--brd-control)",
                background: "var(--surface-2)", color: "var(--ink-1)",
                fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600,
                outline: "none", cursor: "pointer",
              }}
            >
              {sedes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Rate table */}
        {rates === null ? (
          <div style={{ padding: "18px", fontSize: 12, color: "var(--ink-3)" }}>
            Cargando tarifas…
          </div>
        ) : (
          <div style={{ overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr style={{ background: "var(--surface)" }}>
                  <th style={{ ...thStyle, textAlign: "left", paddingLeft: 18 }}>Tipo</th>
                  <th style={{ ...thStyle, width: 130 }}>General</th>
                  <th style={{ ...thStyle, width: 130, paddingRight: 18 }}>{editSede}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ type, label }) => {
                  const dicho = nombreDeTarifa(type, nombresPropios);
                  const general = rates.default[type] ?? 0;
                  const override = rates.by_sede[editSede]?.[type] ?? 0;
                  return (
                    <tr key={type}>
                      <td
                        style={{
                          padding: "5px 8px 5px 18px", fontSize: 12.5,
                          color: "var(--ink-1)",
                          borderTop: "1px solid var(--line-soft)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dicho}
                        {dicho !== label && (
                          <span data-nombre-recabra style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)" }}>
                            {label} en RECABRA
                          </span>
                        )}
                        {/* Vender por partes: la tarifa de una puerta. Vacía, Vender
                            sugiere la de la nevera dividida por sus puertas. */}
                        {DIVISION_POR_TARIFA.has(type) && (
                          <span data-tarifa-de-parte style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "normal" }}>
                            Vacía: se sugiere la del mueble ÷ cantidad de {DIVISION_POR_TARIFA.get(type)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "5px 8px", borderTop: "1px solid var(--line-soft)" }}>
                        <input
                          type="number" min={0} placeholder="—"
                          value={general || ""}
                          onChange={(e) =>
                            setReferenceRate(null, type, parseFloat(e.target.value) || 0)
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ padding: "5px 18px 5px 8px", borderTop: "1px solid var(--line-soft)" }}>
                        <input
                          type="number" min={0}
                          // The placeholder shows what the sede inherits — an
                          // empty override means "use the general rate".
                          placeholder={general ? String(general) : "—"}
                          value={override || ""}
                          onChange={(e) =>
                            setReferenceRate(editSede, type, parseFloat(e.target.value) || 0)
                          }
                          style={inputStyle}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--line-soft)",
            fontSize: 10.5, color: "var(--ink-3)",
          }}
        >
          Los cambios se guardan automáticamente y se comparten con las demás estaciones.
          Dejá un campo vacío para quitar la tarifa.
        </div>
      </div>
    </div>
  );
}
