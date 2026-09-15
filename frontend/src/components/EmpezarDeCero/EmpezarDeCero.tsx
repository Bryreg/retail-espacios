import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { revisarBarrido, aplicarBarrido, type Barrido } from "../../api/layout";
import { describeError } from "../../api/client";

/**
 * Dejar la base sin contratos y los planos sin estado comercial.
 *
 * Para un momento puntual, no para el uso diario: el sistema estuvo en prueba,
 * se cargaron contratos por caminos que ya no existen, y quedó mezcla —filas de
 * prueba en la base y muebles marcados «Ocupado» a mano en el JSON—. Ahora que
 * lo comercial tiene UNA verdad, barrer eso de una vez hace que lo que se
 * cargue después quede derecho, porque ya no hay otro camino por donde entre.
 *
 * ── Por qué hay que escribir el número ───────────────────────────────────────
 *
 * Esto NO SE DESHACE. Un botón que se lleva todos los contratos con un clic se
 * aprieta sin querer alguna vez, y ese día no hay a quién llamar.
 *
 * Escribir la cantidad obliga a leer antes lo que se va a llevar, que es la
 * única confirmación que significa algo: un «¿estás seguro?» se contesta que sí
 * sin leerlo. Y el mismo número viaja al servidor, que lo vuelve a contar: si
 * alguien vendió algo entre que se miró y se apretó, se niega en vez de
 * llevárselo también.
 *
 * ── Qué se ve antes ──────────────────────────────────────────────────────────
 *
 * Las dos listas, y la de lo que se QUEDA importa tanto como la otra: los
 * planos, los proveedores y los montajes no se tocan, y saber eso de antemano
 * es lo que hace que la decisión se pueda tomar sin miedo.
 */
export default function EmpezarDeCero({ onCerrar, onListo }: {
  onCerrar: () => void;
  /** Se barrió: quien llama tiene que recargar lo que muestre contratos. */
  onListo: () => void;
}) {
  const [datos, setDatos] = useState<Barrido | null>(null);
  const [escrito, setEscrito] = useState("");
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<Barrido | null>(null);

  useEffect(() => {
    let vivo = true;
    revisarBarrido()
      .then((r) => { if (vivo) setDatos(r); })
      .catch((e) => { if (vivo) setError(describeError(e, "No se pudo leer el estado.")); });
    return () => { vivo = false; };
  }, []);

  const listo = datos !== null && escrito.trim() === String(datos.contratos);

  async function barrer() {
    if (!datos || !listo) return;
    setError("");
    setYendo(true);
    try {
      const r = await aplicarBarrido(datos.contratos);
      setHecho(r);
      onListo();
    } catch (e) {
      setError(describeError(e, "No se pudo completar. No se borró nada."));
      // La cuenta pudo cambiar: se vuelve a leer para que el número a escribir
      // sea el de ahora y no el que ya no vale.
      revisarBarrido().then(setDatos).catch(() => {});
      setEscrito("");
    } finally {
      setYendo(false);
    }
  }

  const caja: React.CSSProperties = {
    width: "min(520px, 100%)", padding: 20,
    background: "var(--surface)", borderRadius: "var(--r-2xl)",
    border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)",
    maxHeight: "86vh", overflowY: "auto",
  };

  return (
    <div
      data-capa-modal
      role="alertdialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(26,24,20,.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div style={caja}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: 0 }}>Empezar de cero</h2>
            <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "3px 0 0", lineHeight: 1.5 }}>
              Borra <b>todos</b> los contratos y le quita a los planos el estado comercial
              que arrastran. Es para volver a cargar sobre limpio. <b>No se deshace.</b>
            </p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}>
            <X size={16} />
          </button>
        </div>

        {hecho ? (
          <>
            <div style={{
              padding: "11px 13px", borderRadius: "var(--r-lg)",
              background: "var(--surface-2)", border: "1px solid var(--line)",
              fontSize: 12.5, lineHeight: 1.6,
            }}>
              <b>Listo.</b> Se borraron {hecho.contratos} contrato(s)
              {hecho.planometrias > 0 && `, ${hecho.planometrias} planometría(s)`}
              {hecho.avisos > 0 && ` y ${hecho.avisos} aviso(s)`}.
              {hecho.muebles_con_residuo > 0 && (
                <> Se limpiaron {hecho.muebles_con_residuo} mueble(s) en{" "}
                  {hecho.sedes_con_residuo.join(", ")}.</>
              )}
              <br /><br />
              Los planos, los {hecho.proveedores_intactos} proveedor(es) y los{" "}
              {hecho.montajes_intactos} montaje(s) siguen donde estaban.
              <br /><br />
              Ya podés cargar la planilla: lo que entre de acá en adelante va a la base
              y el plano se pinta de ahí.
            </div>
            <button onClick={onCerrar} style={{
              width: "100%", height: 36, marginTop: 12, borderRadius: "var(--r-md)",
              border: "none", background: "var(--accent)", color: "#fff",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>
              Entendido
            </button>
          </>
        ) : datos === null ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {error || "Leyendo qué hay…"}
          </p>
        ) : (
          <>
            <Bloque titulo="Se borra" tono="danger" filas={[
              [`${datos.contratos}`, "contrato(s)"],
              ...(datos.planometrias > 0
                ? [[`${datos.planometrias}`, "planometría(s), que cuelgan de ellos"] as const] : []),
              ...(datos.avisos > 0
                ? [[`${datos.avisos}`, "aviso(s) enviado(s)"] as const] : []),
              ...(datos.muebles_con_residuo > 0
                ? [[`${datos.muebles_con_residuo}`,
                    `mueble(s) con estado comercial escrito en el plano — ${datos.sedes_con_residuo.join(", ")}`] as const]
                : []),
            ]} />

            <Bloque titulo="No se toca" tono="ink" filas={[
              ["Los planos", "la geometría es trabajo dibujado a mano"],
              [`${datos.proveedores_intactos} proveedor(es)`, "son contactos reales"],
              [`${datos.espacios_intactos} espacio(s)`, "sin contrato quedan libres"],
              [`${datos.montajes_intactos} montaje(s)`, "son la prueba de lo que se armó"],
            ]} />

            <label style={{
              display: "block", fontSize: 12.5, color: "var(--ink-2)",
              margin: "14px 0 6px", lineHeight: 1.5,
            }}>
              Para confirmar, escribí cuántos contratos se van a borrar:{" "}
              <b style={{ fontFamily: "var(--font-mono)" }}>{datos.contratos}</b>
            </label>
            <input
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              inputMode="numeric"
              placeholder={String(datos.contratos)}
              aria-label="Cantidad de contratos, para confirmar"
              style={{
                width: "100%", height: 34, padding: "0 10px",
                borderRadius: "var(--r-md)", border: "1px solid var(--line)",
                background: "var(--surface-2)", color: "var(--ink-1)",
                fontFamily: "var(--font-mono)", fontSize: 14,
              }}
            />

            {error && (
              <p style={{ fontSize: 11.5, color: "var(--danger)", margin: "8px 0 0" }}>{error}</p>
            )}

            <button
              onClick={() => void barrer()}
              disabled={!listo || yendo}
              style={{
                width: "100%", height: 36, marginTop: 12, borderRadius: "var(--r-md)",
                border: "none", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                background: listo ? "var(--danger)" : "var(--surface-2)",
                color: listo ? "#fff" : "var(--ink-3)",
                cursor: listo && !yendo ? "pointer" : "not-allowed",
              }}
            >
              {yendo ? "Borrando…" : "Borrar y empezar de cero"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Bloque({ titulo, tono, filas }: {
  titulo: string;
  tono: "danger" | "ink";
  filas: readonly (readonly [string, string])[];
}) {
  if (filas.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{
        fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
        letterSpacing: "0.09em", textTransform: "uppercase",
        color: tono === "danger" ? "var(--danger)" : "var(--ink-3)",
        margin: "0 0 5px",
      }}>
        {titulo}
      </p>
      {filas.map(([que, porque], i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0", fontSize: 12 }}>
          <span style={{ fontWeight: 700, flexShrink: 0 }}>{que}</span>
          <span style={{ color: "var(--ink-3)" }}>{porque}</span>
        </div>
      ))}
    </div>
  );
}
