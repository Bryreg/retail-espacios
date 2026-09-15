import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { cancelLease, getSpaceByCode } from "../../api/spaces";
import { describeError } from "../../api/client";
import type { FaceData } from "../../types/fixtures";
import type { Lease } from "../../types";
import { fechaCorta } from "./Contrato";

/**
 * Cancelar el contrato de un espacio.
 *
 * Faltaba: el backend tiene `DELETE /spaces/{id}/leases/{id}` desde siempre y
 * ninguna pantalla lo llamaba. El agujero se veía justo en el mensaje de choque
 * de fechas —«Cancelalo primero o ajustá las fechas»— que mandaba a hacer algo
 * que la aplicación no permitía.
 *
 * Cancela el que corre hoy o, si no hay, el que ya está firmado y todavía no
 * arranca: ése es el que hay que soltar cuando un proveedor se cae antes de
 * empezar, y era el más difícil de alcanzar porque su id no salía en ninguna
 * respuesta.
 */

export default function CancelarContrato({
  spaceCode, segunElPlano, onCancelado,
}: {
  /** `SEDE-CODIGO`, el completo. */
  spaceCode: string;
  /** Si el JSON del layout —lo que pinta el mapa— dice que este espacio tiene
   *  contrato. Cuando dice que NO y acá igual aparece un contrato, no alcanza
   *  con ofrecer el botón: hay que decir qué se encontró, porque la ficha de
   *  arriba está diciendo «sin contrato activo» en la misma pantalla. */
  segunElPlano: boolean;
  /** Lo que hay que escribir en el JSON del layout para que el mapa repinte.
   *  Sin esto el contrato desaparece de la base y el mueble sigue rojo. */
  onCancelado: (patch: Partial<FaceData>) => void;
}) {
  const [ids, setIds] = useState<{ spaceId: number; leaseId: number } | null>(null);
  /** El contrato que encontró la BASE. Se guarda entero, no sólo el id, para
   *  poder nombrarlo cuando el plano no lo tiene. */
  const [enLaBase, setEnLaBase] = useState<Lease | null>(null);
  const [preguntando, setPreguntando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");

  const buscar = useCallback(async () => {
    const espacio = await getSpaceByCode(spaceCode);
    const lease = espacio?.active_lease ?? espacio?.upcoming_lease ?? null;
    setIds(espacio && lease ? { spaceId: espacio.id, leaseId: lease.id } : null);
    setEnLaBase(lease);
  }, [spaceCode]);

  useEffect(() => {
    let vivo = true;
    buscar().catch(() => { if (vivo) { setIds(null); setEnLaBase(null); } });
    return () => { vivo = false; };
  }, [buscar]);

  if (!ids) return null;

  async function cancelar() {
    if (!ids || borrando) return;
    setBorrando(true);
    setError("");
    try {
      await cancelLease(ids.spaceId, ids.leaseId);
      // El JSON del layout es lo que pinta el mapa: si no se limpia acá, el
      // contrato deja de existir en la base y el mueble sigue viéndose vendido.
      onCancelado({
        status: "free",
        supplierName: "",
        brandCategory: "",
        negotiatedValue: 0,
        startDate: "",
        endDate: "",
      } as Partial<FaceData>);
    } catch (e) {
      setError(describeError(e, "No se pudo cancelar el contrato."));
      setBorrando(false);
    }
  }

  /** Un contrato que la base tiene y el plano no.
   *
   *  Es el caso que deja el espacio invendible sin que se vea por qué: el
   *  servidor rechaza la venta nombrando un contrato, y la ficha, que lee el
   *  layout, dice «sin contrato activo». Antes el botón de cancelar ni siquiera
   *  aparecía —lo escondía esa misma ficha— así que «cancelalo primero»
   *  señalaba algo imposible. Ahora aparece, y con el contrato nombrado: sin
   *  eso sería un botón de borrar sobre algo que la pantalla jura que no
   *  existe, que es peor que no tenerlo. */
  const fantasma = !segunElPlano && enLaBase !== null;

  const cartelFantasma = fantasma && (
    <div
      style={{
        padding: "10px 12px", borderRadius: "var(--r-lg)", marginBottom: 8,
        background: "var(--warning-50, var(--surface-2))",
        border: "1px solid var(--warning-100, var(--line))",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <AlertTriangle size={14} style={{ color: "var(--warning, var(--ink-2))", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <b>La base tiene un contrato que el plano no muestra.</b>{" "}
          {enLaBase.supplier?.name || "Sin proveedor"} · del{" "}
          {fechaCorta(enLaBase.start_date)} al {fechaCorta(enLaBase.end_date)}.
          <br />
          Por eso el espacio no se deja vender en esas fechas, aunque acá arriba
          figure libre. Si ese contrato ya no va, cancelalo.
        </div>
      </div>
    </div>
  );

  if (!preguntando) {
    return (
      <>
      {cartelFantasma}
      <button
        onClick={() => setPreguntando(true)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", height: 32, borderRadius: "var(--r-md)",
          border: "1px solid var(--line)", background: "var(--surface)",
          color: "var(--danger)", fontSize: 12, fontWeight: 600,
          fontFamily: "inherit", cursor: "pointer",
        }}
      >
        <Trash2 size={13} /> {fantasma ? "Cancelar el contrato de la base" : "Cancelar el contrato"}
      </button>
      </>
    );
  }

  return (
    <>
    {cartelFantasma}
    <div
      style={{
        padding: "11px 12px", borderRadius: "var(--r-lg)",
        background: "var(--danger-50)", border: "1px solid var(--danger-100, var(--line))",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 9 }}>
        <AlertTriangle size={14} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          El espacio queda libre y el contrato deja de contar en ocupación e ingresos.
          La planometría y el reporte de montaje <b>se quedan</b>: son la prueba de lo
          que se acordó y de lo que se armó.
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { setPreguntando(false); setError(""); }}
          disabled={borrando}
          style={{
            flex: 1, height: 31, borderRadius: "var(--r-md)",
            border: "1px solid var(--line)", background: "var(--surface)",
            color: "var(--ink-2)", fontSize: 12, fontWeight: 600,
            fontFamily: "inherit", cursor: borrando ? "wait" : "pointer",
          }}
        >
          Dejarlo así
        </button>
        <button
          onClick={cancelar}
          disabled={borrando}
          style={{
            flex: 1, height: 31, borderRadius: "var(--r-md)", border: "none",
            background: "var(--danger)", color: "#fff",
            fontSize: 12, fontWeight: 700,
            fontFamily: "inherit", cursor: borrando ? "wait" : "pointer",
          }}
        >
          {borrando ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </div>
    </>
  );
}
