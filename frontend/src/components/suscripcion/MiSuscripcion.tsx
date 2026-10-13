import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { describeError } from "../../api/client";
import {
  getMiSuscripcion,
  guardarMiFacturacion,
  type EstadoDeCuenta,
  type FacturaDeLaSuscripcion,
  type MiSuscripcion as Datos,
} from "../../api/suscripcion";

/* ============================================================================
   La suscripción, vista por la dueña del supermercado (C2, 2026-10-13)

   Lo que RECABRA le cobra: el estado de la cuenta con su motivo, lo pactado,
   la próxima cuenta de cobro —total, retenciones estimadas, neto y
   vencimiento—, cómo transferir, el historial de un año (cuentas de cobro,
   pagos y cambios de estado) y sus datos de facturación, que puede corregir.

   Es la ÚNICA pantalla del supermercado con la plata de la suscripción, y sale
   en dos lugares, los dos sólo para la dueña: Configuración → Suscripción, y
   la pantalla de bloqueo DESPUÉS de un clic en «Ver suscripción». Nunca en la
   franja ni en la pantalla de bloqueo misma: esas se ven en Vender, delante
   de los proveedores. El backend contesta 403 a todo el que no es la dueña.
   ========================================================================== */

const ESTADO_TXT: Record<EstadoDeCuenta, string> = {
  activo: "Al día",
  gracia: "Pago pendiente",
  solo_lectura: "Sólo lectura",
  suspendido: "Suspendida",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `"2026-11-15"` → `15-nov-2026`, la misma forma que los correos. */
function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}-${MESES[m - 1]}-${a}`;
}

/** `$ 1.234.567`: pesos enteros, punto de miles. */
function pesos(n: number): string {
  return "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function cuandoVence(f: FacturaDeLaSuscripcion, hoy: string): string {
  if (f.vencida && f.dias_atraso !== null) {
    return f.dias_atraso === 1 ? "venció ayer" : `vencida hace ${f.dias_atraso} días`;
  }
  const dias = Math.round((Date.parse(f.vence_el) - Date.parse(hoy)) / 86_400_000);
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

function estadoDeFactura(f: FacturaDeLaSuscripcion): string {
  if (f.estado === "pagada") return f.pagada_el ? `pagada el ${fecha(f.pagada_el)}` : "pagada";
  if (f.estado === "anulada") return "anulada";
  if (f.en_disputa) return "en revisión";
  if (f.vencida) return "vencida";
  return f.abonado_cop > 0 ? `abonada, falta ${pesos(f.saldo_cop)}` : "por pagar";
}

const s = {
  bloque: { marginTop: 14 } as CSSProperties,
  titulo: { fontSize: 12, fontWeight: 600, color: "var(--ink-1)", marginBottom: 6 } as CSSProperties,
  nota: { fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 } as CSSProperties,
  fila: {
    display: "flex", justifyContent: "space-between", gap: 10,
    padding: "4px 0", fontSize: 12, color: "var(--ink-2)",
  } as CSSProperties,
  cifra: { fontVariantNumeric: "tabular-nums", color: "var(--ink-1)", fontWeight: 600, whiteSpace: "nowrap" } as CSSProperties,
  lista: { borderTop: "1px solid var(--line-soft)" } as CSSProperties,
  item: {
    display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline",
    padding: "6px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 11.5, color: "var(--ink-2)",
  } as CSSProperties,
  mut: { fontSize: 10.5, color: "var(--ink-3)" } as CSSProperties,
  caja: {
    background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)",
    padding: "8px 10px",
  } as CSSProperties,
  input: {
    width: "100%", height: 32, padding: "0 10px",
    borderRadius: "var(--r-md)", border: "1px solid var(--line)",
    background: "var(--surface-2)", color: "var(--ink-1)",
    fontSize: 12.5, fontFamily: "inherit", outline: "none",
  } as CSSProperties,
  etiqueta: { display: "block", fontSize: 11, fontWeight: 500, color: "var(--ink-2)", margin: "6px 0 3px" } as CSSProperties,
  boton: {
    height: 30, padding: "0 12px", borderRadius: "var(--r-md)",
    background: "var(--surface)", color: "var(--ink-2)", border: "1px solid var(--line)",
    fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
  } as CSSProperties,
};

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div style={s.fila}>
      <span>{etiqueta}</span>
      <span style={s.cifra}>{children}</span>
    </div>
  );
}

function DatosDeFacturacion({ datos, alGuardar }: { datos: Datos; alGuardar: () => void }) {
  const sus = datos.suscripcion;
  const [razon, setRazon] = useState(sus?.razon_social ?? "");
  const [nit, setNit] = useState(sus?.nit ?? "");
  const [correo, setCorreo] = useState(sus?.correo_facturacion ?? "");
  const [municipio, setMunicipio] = useState(sus?.municipio ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const guardar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await guardarMiFacturacion({
        razon_social: razon.trim() || null,
        nit: nit.trim() || null,
        correo_facturacion: correo.trim() || null,
        municipio: municipio.trim() || null,
      });
      setMsg({ ok: true, text: "Datos de facturación guardados: valen para las próximas cuentas de cobro." });
      alGuardar();
    } catch (err) {
      setMsg({ ok: false, text: describeError(err, "No se pudieron guardar los datos de facturación.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s.bloque}>
      <div style={s.titulo}>Datos de facturación</div>
      <label style={s.etiqueta}>Razón social</label>
      <input style={s.input} value={razon} onChange={(e) => setRazon(e.target.value)} />
      <label style={s.etiqueta}>NIT</label>
      <input style={{ ...s.input, fontFamily: "var(--font-mono)" }} value={nit} onChange={(e) => setNit(e.target.value)} />
      <label style={s.etiqueta}>
        Correo de facturación (le llegan los avisos con montos; si es el de alguien de tu equipo que no es dueño, no
        se le mandan)
      </label>
      <input style={s.input} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
      <label style={s.etiqueta}>Municipio</label>
      <input style={s.input} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
      <div style={{ marginTop: 10 }}>
        <button type="button" style={{ ...s.boton, opacity: busy ? 0.55 : 1 }} onClick={guardar} disabled={busy}>
          {busy ? "Guardando…" : "Guardar datos de facturación"}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 500, color: msg.ok ? "var(--success)" : "var(--danger)" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

/** El cuerpo de «Suscripción». Pide los datos al montarse: sin la dueña
 *  adentro de esta vista, la plata no viaja. `alCargar` avisa cuando llegaron
 *  (Configuración vuelve a llevar la vista hasta acá). */
export default function MiSuscripcion({ alCargar }: { alCargar?: () => void } = {}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    getMiSuscripcion()
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
        alCargar?.();
      })
      .catch((err) => {
        if (vivo) setError(describeError(err, "No se pudo leer la suscripción."));
      });
    return () => {
      vivo = false;
    };
    // `alCargar` no entra: es para la primera carga, no un motivo para volver a pedir.
  }, [vuelta]);

  if (error) return <div style={{ ...s.nota, color: "var(--danger)" }}>{error}</div>;
  if (!datos) return <div style={s.nota}>Cargando la suscripción…</div>;

  const sus = datos.suscripcion;
  const prox = datos.proxima_factura;
  const estado = datos.estado;

  return (
    <div>
      <Fila etiqueta="Estado de la cuenta">{ESTADO_TXT[estado.estado] ?? estado.estado}</Fila>
      {estado.motivo && <div style={{ ...s.nota, marginBottom: 4 }}>{estado.motivo}</div>}

      {!sus ? (
        <div style={{ ...s.nota, marginTop: 8 }}>
          Este supermercado no tiene una suscripción registrada en RECABRA: no hay cuentas de cobro a su
          nombre.
        </div>
      ) : (
        <>
          <div style={s.bloque}>
            <div style={s.titulo}>Lo pactado</div>
            <Fila etiqueta={sus.unidad === "sede_mes" ? `Por sede al mes · ${sus.cantidad} sedes` : "Por mes"}>
              {pesos(sus.valor_cop)}
            </Fila>
            <Fila etiqueta="Se cobra">
              {sus.periodicidad_meses === 1 ? "cada mes" : `cada ${sus.periodicidad_meses} meses`}
            </Fila>
            <Fila etiqueta="Plazo para pagar">{sus.plazo_pago_dias} días</Fila>
            {sus.prorroga_hasta && <Fila etiqueta="Prórroga hasta">{fecha(sus.prorroga_hasta)}</Fila>}
            {sus.modo === "automatico" && (
              <div style={{ ...s.nota, marginTop: 4 }}>
                Si una cuenta de cobro queda vencida {sus.dia_solo_lectura} días, la cuenta pasa a sólo lectura
                —se puede ver y consultar todo, pero no guardar cambios— hasta ponerse al día. Los datos no se
                borran. Antes llegan avisos al correo de facturación y a la dueña.
              </div>
            )}
          </div>

          <div style={s.bloque}>
            <div style={s.titulo}>Próxima a pagar</div>
            {prox ? (
              <div style={s.caja}>
                <Fila etiqueta={`${prox.electronica ? "Factura" : "Cuenta de cobro"} ${prox.numero ?? ""} · ${prox.periodo}`}>
                  {cuandoVence(prox, datos.hoy)}
                </Fila>
                <Fila etiqueta="Total">{pesos(prox.total_cop)}</Fila>
                <Fila etiqueta="Retenciones estimadas">−{pesos(prox.retenciones_estimadas_cop)}</Fila>
                <Fila etiqueta="Neto a pagar">{pesos(prox.neto_esperado_cop)}</Fila>
                {prox.abonado_cop > 0 && <Fila etiqueta="Falta">{pesos(prox.saldo_cop)}</Fila>}
                <Fila etiqueta="Vence">{fecha(prox.vence_el)}</Fila>
                {prox.en_disputa && (
                  <div style={s.nota}>Está en revisión con RECABRA: no cuenta como atraso mientras tanto.</div>
                )}
                {prox.solo_lectura_desde && !prox.en_disputa && (
                  <div style={s.nota}>
                    {prox.solo_lectura_desde > datos.hoy
                      ? `Si sigue impaga, desde el ${fecha(prox.solo_lectura_desde)} la cuenta pasa a sólo lectura.`
                      : `Desde el ${fecha(prox.solo_lectura_desde)} le corresponde sólo lectura, hasta ponerse al día.`}
                  </div>
                )}
              </div>
            ) : (
              <div style={s.nota}>No hay cuentas de cobro pendientes.</div>
            )}
          </div>
        </>
      )}

      {sus && (
        <div style={s.bloque}>
          <div style={s.titulo}>Cómo pagar</div>
          {datos.instrucciones_transferencia ? (
            <div style={{ ...s.caja, ...s.nota, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
              {datos.instrucciones_transferencia}
            </div>
          ) : (
            <div style={s.nota}>Para los datos de la transferencia, comunicate con RECABRA.</div>
          )}
          <div style={{ ...s.nota, marginTop: 4 }}>
            RECABRA registra el pago cuando lo ve en el banco, y desde ahí sale de las cuentas pendientes.
          </div>
        </div>
      )}

      {datos.facturas.length > 0 && (
        <div style={s.bloque}>
          <div style={s.titulo}>Cuentas de cobro</div>
          <div style={s.lista}>
            {datos.facturas.map((f) => (
              <div key={f.id} style={s.item}>
                <span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{f.numero ?? "—"}</span> · {f.periodo}
                  <div style={s.mut}>vence {fecha(f.vence_el)} · {estadoDeFactura(f)}</div>
                </span>
                <span style={s.cifra}>{pesos(f.total_cop)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {datos.pagos.length > 0 && (
        <div style={s.bloque}>
          <div style={s.titulo}>Pagos registrados</div>
          <div style={s.lista}>
            {datos.pagos.map((p, i) => (
              <div key={i} style={s.item}>
                <span>
                  {fecha(p.recibido_el)} · <span style={{ fontFamily: "var(--font-mono)" }}>{p.factura_numero ?? "—"}</span>
                  <div style={s.mut}>
                    ref. {p.ref_externa}
                    {p.retenciones_cop > 0 &&
                      ` · retenciones ${pesos(p.retenciones_cop)}${p.certificado_recibido ? "" : " (certificado pendiente)"}`}
                  </div>
                </span>
                <span style={s.cifra}>{pesos(p.valor_recibido_cop)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {datos.cambios.length > 0 && (
        <div style={s.bloque}>
          <div style={s.titulo}>Cambios de estado</div>
          <div style={s.lista}>
            {datos.cambios.map((c, i) => (
              <div key={i} style={s.item}>
                <span>
                  {ESTADO_TXT[c.de] ?? c.de} → {ESTADO_TXT[c.a] ?? c.a}
                  <div style={s.mut}>{c.motivo}</div>
                </span>
                <span style={{ ...s.mut, whiteSpace: "nowrap" }}>
                  {fecha(c.en)} · {c.por}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin `key`: al guardar se vuelve a pedir la suscripción, y remontar el
          formulario con los datos de ANTES de que llegue la respuesta le
          borraría a la dueña lo que acaba de escribir. */}
      {sus && <DatosDeFacturacion datos={datos} alGuardar={recargar} />}
    </div>
  );
}
