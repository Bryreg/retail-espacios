/* ============================================================================
   RECABRA · Plataforma — los cobros (capítulo 1.6, «Lo operativo»)

   Lo que RECABRA le cobra a cada supermercado, a mano (C1, 2026-10-13). Es
   una operación, no análisis: vive en un cajón plegado al lado de los estados
   de cuenta, como las supresiones.

   Lo que la dueña decidió y esta pantalla respeta:

     · **Sin pasarela.** La operadora registra la cuenta de cobro que ya emitió
       (número y, si es electrónica, CUFE: RECABRA no emite nada ante la DIAN)
       y el pago que vio entrar en el banco, con lo que el supermercado retuvo
       y la referencia de la transferencia.
     · **Sin suscripción, exento.** Galerías y todo cliente sin suscripción no
       tiene deuda ni facturas: la fila lo dice con esa palabra, no con un
       «al día» que sería mentira.
     · **Los formularios de acá no cortan el servicio.** El estado de cuenta lo
       sigue moviendo ella con «Cambiar», en el cajón de al lado; al registrar
       un pago, el sistema lo LEVANTA sólo si ella marca la casilla y el pago
       deja al día (lo firma `sistema:cobranza`). Lo que sí corta es la
       escalera automática, con su interruptor prendido, y la pantalla lo dice
       según cómo esté (revisión de C2).
     · **«Correspondería»** es el estado que le tocaría al cliente por sus
       facturas (sólo lectura a los N días de vencida, nunca suspendido), al
       lado del real, para que la diferencia se vea. Desde C2 la escalera lo
       APLICA sola a las suscripciones automáticas —si el interruptor
       `COBRANZA_AUTOMATICA` del servidor está prendido; si no, sólo lo
       ensaya— y nunca encima de un estado que puso una persona. La fila dice
       cuál de las tres cosas pasa con cada diferencia.
     · **«Correr cobranza (ensayo)»** muestra qué haría la escalera hoy, o el
       día que se elija: a quién movería y qué avisos mandaría. Desde acá es
       siempre un ensayo: no escribe ni manda nada (`probar-plataforma.mjs`
       falla si `correrCobranza` deja de mandar `ensayo: 1`).
     · **Los números se leen como se escriben en Colombia**: pesos con punto
       de miles, porcentajes con coma decimal —o punto: «3.5» es 3,5, no 35—
       (`formato.ts`).

   Plata y facturas son de la operadora: esta pantalla vive detrás de
   `/plataforma`, y el backend contesta 403 a cualquier otra cuenta.

   Mismas reglas de forma que el resto del cajón operativo: botones en tinta
   (el único amarillo de la pantalla es la llamada #1 de la cola), confirmación
   con lo que va a pasar dicho en palabras, y ningún color de estado de
   espacio para el estado de cuenta.
   ========================================================================== */

import { Fragment, useCallback, useEffect, useState } from "react";
import { describeError } from "../../api/client";
import {
  anularFactura,
  correrCobranza,
  emitirFactura,
  getCobros,
  guardarSuscripcion,
  marcarDisputa,
  registrarPago,
  type CarteraCobros,
  type ClienteCartera,
  type ClientePlataforma,
  type FacturaCobro,
  type MedioPago,
  type ModoCobro,
  type PagoRegistrado,
  type PlanCobranza,
  type SuscripcionPayload,
  type UnidadCobro,
} from "../../api/plataforma";
import {
  ESTADO_CUENTA_TXT,
  SIN_DATO,
  fechaCorta,
  mesesDelPeriodo,
  pesosEscritos,
  plata,
  plural,
  porcentajeEscrito,
  porcentajeParaEscribir,
} from "./formato";

const MODO_TXT: Record<ModoCobro, string> = { manual: "manual", automatico: "automático" };

const ESTADO_FACTURA_TXT: Record<FacturaCobro["estado"], string> = {
  borrador: "borrador",
  emitida: "emitida",
  pagada: "pagada",
  anulada: "anulada",
};

/** Por qué un pago con «levantar» no movió el estado, dicho para la operadora. */
const RAZON_TXT: Record<string, string> = {
  exento: "el cliente no tiene suscripción, o es el de la base principal (nada del sistema lo mueve)",
  no_queda_al_dia: "con este pago todavía no queda al día",
  otra_suscripcion: "la factura es de una suscripción anterior del cliente",
  sin_cliente: "el cliente ya no existe",
  no_mejora: "con lo que debe, no le corresponde un estado mejor que el que tiene",
  sin_cambio: "ya estaba en el estado que corresponde",
  lo_puso_una_persona: "el estado lo puso una persona",
};

/** Los avisos de la escalera, dichos para la operadora. */
const HITO_TXT: Record<string, string> = {
  por_vencer: "recordatorio de vencimiento",
  vencida: "aviso de vencida",
  mas_7: "aviso de más de 7 días",
  aviso_solo_lectura: "aviso formal de sólo lectura",
  solo_lectura: "aviso de sólo lectura",
  pago_recibido: "constancia de pago",
};

/** `"2026-10-13"` → `"2026-10"`: el período por defecto de una cuenta nueva. */
const mesDe = (fecha: string): string => fecha.slice(0, 7);

/** Pesos de un campo de texto, redondeados; vacío o inválido es 0. Los
 *  porcentajes NO pasan por acá: van con `porcentajeEscrito` (ver formato.ts). */
const entero = (texto: string): number => Math.round(pesosEscritos(texto) ?? 0);

/** El piso de «sólo lectura a los N días»: lo decidió la dueña (el backend
 *  contesta 422 con menos). */
const DIA_SOLO_LECTURA_MINIMO = 30;

// ─── Los datos ─────────────────────────────────────────────────────────────

/** La cartera se pide UNA vez y la comparten dos cajones: éste y la columna
 *  «Modo» de los estados de cuenta. Se vuelve a pedir cuando la página cambia
 *  `recarga` (archivar, borrar…) o cuando una operación de acá lo pide.
 *
 *  `activa` lo prende la página recién cuando la operadora ABRE el cajón de
 *  cobros (revisión de C2): cada `GET /cobros` deja una línea «cobros» en el
 *  reporte de transparencia de TODOS los clientes, y pedirla al abrir la
 *  consola, o después de cada cambio de estado, la anotaba sin que nadie la
 *  mirara. Un cambio de estado se copia en memoria con `actualizarEstado`. */
export function useCartera(activa: boolean, recarga: number) {
  const [cartera, setCartera] = useState<CarteraCobros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!activa) return;
    let vivo = true;
    getCobros()
      .then((c) => {
        if (!vivo) return;
        setCartera(c);
        setError(null);
      })
      .catch((err) => {
        if (vivo) setError(describeError(err, "No se pudo leer la cartera de cobros."));
      });
    return () => {
      vivo = false;
    };
  }, [activa, recarga, vuelta]);

  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  const actualizarEstado = useCallback(
    (slug: string, patch: Partial<Pick<ClienteCartera, "estado" | "cambiado_por">>) =>
      setCartera((c) =>
        c ? { ...c, clientes: c.clientes.map((x) => (x.slug === slug ? { ...x, ...patch } : x)) } : c
      ),
    []
  );
  return { cartera, error, recargar, actualizarEstado };
}

/** Slug → «exento» / «manual» / «automático», para la columna «Modo» de los
 *  estados de cuenta. `null` mientras la cartera no llegó. */
export function mapaDeModos(cartera: CarteraCobros | null): Map<string, string> | null {
  if (!cartera) return null;
  return new Map(
    cartera.clientes.map((c) => [c.slug, c.suscripcion ? MODO_TXT[c.suscripcion.modo] : "exento"])
  );
}

// ─── La suscripción ────────────────────────────────────────────────────────

function EditorSuscripcion({
  fila,
  prendida,
  onHecho,
  onCancelar,
}: {
  fila: ClienteCartera;
  /** El interruptor `COBRANZA_AUTOMATICA` del servidor. */
  prendida: boolean;
  onHecho: () => void;
  onCancelar: () => void;
}) {
  const s = fila.suscripcion;
  const [modo, setModo] = useState<ModoCobro>(s?.modo ?? "manual");
  const [valor, setValor] = useState(s ? String(s.valor_cop) : "");
  const [unidad, setUnidad] = useState<UnidadCobro>(s?.unidad ?? "supermercado_mes");
  const [cantidad, setCantidad] = useState(String(s?.cantidad ?? 1));
  const [periodicidad, setPeriodicidad] = useState(String(s?.periodicidad_meses ?? 1));
  const [plazo, setPlazo] = useState(String(s?.plazo_pago_dias ?? 30));
  const [diaSoloLectura, setDiaSoloLectura] = useState(String(s?.dia_solo_lectura ?? 30));
  const [prorroga, setProrroga] = useState(s?.prorroga_hasta ?? "");
  const [contrato, setContrato] = useState(s?.contrato_ref ?? "");
  const [razonSocial, setRazonSocial] = useState(s?.razon_social ?? "");
  const [nit, setNit] = useState(s?.nit ?? "");
  const [correo, setCorreo] = useState(s?.correo_facturacion ?? "");
  const [municipio, setMunicipio] = useState(s?.municipio ?? "");
  const [retefuente, setRetefuente] = useState(porcentajeParaEscribir(s?.retefuente_pct ?? 0));
  const [reteica, setReteica] = useState(porcentajeParaEscribir(s?.reteica_pct ?? 0));
  const [reteiva, setReteiva] = useState(porcentajeParaEscribir(s?.reteiva_pct ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const valorCop = pesosEscritos(valor);
    if (!valorCop || valorCop <= 0) {
      setError("El valor pactado es obligatorio.");
      return;
    }
    if (modo === "automatico" && !contrato.trim()) {
      setError("El modo automático necesita la referencia del contrato o de los términos aceptados.");
      return;
    }
    if (entero(diaSoloLectura) < DIA_SOLO_LECTURA_MINIMO) {
      setError(`Sólo lectura va a los ${DIA_SOLO_LECTURA_MINIMO} días de vencida o más: se puede dar más aire, no menos.`);
      return;
    }
    const pcts = [porcentajeEscrito(retefuente), porcentajeEscrito(reteica), porcentajeEscrito(reteiva)];
    if (pcts.some((p) => p === null || p > 100)) {
      setError("Las retenciones van en porcentaje, de 0 a 100 (3,5 o 3.5 es tres y medio por ciento).");
      return;
    }
    const payload: SuscripcionPayload = {
      modo,
      valor_cop: Math.round(valorCop),
      unidad,
      cantidad: entero(cantidad),
      periodicidad_meses: entero(periodicidad),
      plazo_pago_dias: entero(plazo),
      dia_solo_lectura: entero(diaSoloLectura),
      prorroga_hasta: prorroga || null,
      contrato_ref: contrato.trim() || null,
      razon_social: razonSocial.trim() || null,
      nit: nit.trim() || null,
      correo_facturacion: correo.trim() || null,
      municipio: municipio.trim() || null,
      retefuente_pct: porcentajeEscrito(retefuente) ?? 0,
      reteica_pct: porcentajeEscrito(reteica) ?? 0,
      reteiva_pct: porcentajeEscrito(reteiva) ?? 0,
    };
    const seguro = confirm(
      `¿${s ? "Guardar los cambios de" : "Cargar"} la suscripción de «${fila.nombre}» (${fila.slug})?\n\n` +
        `${plata(payload.valor_cop)} por ${unidad === "sede_mes" ? "sede" : "supermercado"} y por mes, ` +
        `modo ${MODO_TXT[modo]}.` +
        (modo === "automatico"
          ? `\n\n${prendida ? "Con la cobranza automática prendida" : "Cuando se prenda la cobranza automática"}, ` +
            `la cuenta va a pasar sola a sólo lectura ${payload.dia_solo_lectura} días después de vencida una ` +
            "cuenta de cobro, y nunca antes de 10 días después del aviso formal por correo. Nunca se suspende sola."
          : "\n\nManual: el estado de cuenta lo seguís moviendo vos.")
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      await guardarSuscripcion(fila.slug, payload);
      onHecho();
    } catch (err) {
      setError(describeError(err, "No se pudo guardar la suscripción."));
    } finally {
      setBusy(false);
    }
  };

  const campo = (rotulo: string, nodo: React.ReactNode, corto = false) => (
    <label className={corto ? "campo corto" : "campo"}>
      <span>{rotulo}</span>
      {nodo}
    </label>
  );

  return (
    <div className="plat-editor">
      <p className="plat-nota" style={{ margin: "0 0 var(--s2)" }}>
        El precio que se pactó con este cliente. Manual: el estado de cuenta lo movés vos. Automático:{" "}
        {prendida
          ? "la escalera está prendida y la pasa sola a sólo lectura"
          : "cuando se prenda la escalera (hoy está apagada: sólo ensaya), pasa sola a sólo lectura"}{" "}
        a los días que digas acá (30 o más) y diez días después del aviso formal como mínimo; nunca a suspendido.
      </p>
      <div className="linea">
        {campo(
          "Modo",
          <select value={modo} onChange={(e) => setModo(e.target.value as ModoCobro)}>
            <option value="manual">Manual</option>
            <option value="automatico" disabled={fila.base_principal}>
              Automático{fila.base_principal ? " (no para la base principal)" : ""}
            </option>
          </select>,
          true
        )}
        {campo("Valor pactado (pesos)", <input type="text" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} />, true)}
        {campo(
          "Por",
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadCobro)}>
            <option value="supermercado_mes">supermercado y mes</option>
            <option value="sede_mes">sede y mes</option>
          </select>,
          true
        )}
        {campo("Cantidad", <input type="text" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />, true)}
        {campo(
          "Se cobra cada",
          <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
            <option value="1">mes</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
          </select>,
          true
        )}
      </div>
      <div className="linea">
        {campo("Plazo de pago (días)", <input type="text" inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} />, true)}
        {campo("Sólo lectura a los (días de vencida, 30 o más)", <input type="text" inputMode="numeric" value={diaSoloLectura} onChange={(e) => setDiaSoloLectura(e.target.value)} />, true)}
        {campo("Prórroga hasta", <input type="date" value={prorroga} onChange={(e) => setProrroga(e.target.value)} />, true)}
        {campo("Contrato o términos aceptados", <input type="text" value={contrato} onChange={(e) => setContrato(e.target.value)} placeholder="Obligatorio para automático" />)}
      </div>
      <div className="linea">
        {campo("Razón social", <input type="text" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />)}
        {campo("NIT", <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} />, true)}
        {campo("Correo de facturación", <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />)}
        {campo("Municipio", <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />, true)}
      </div>
      <div className="linea">
        {campo("Retefuente esperada (%)", <input type="text" inputMode="decimal" value={retefuente} onChange={(e) => setRetefuente(e.target.value)} />, true)}
        {campo("ReteICA esperada (%)", <input type="text" inputMode="decimal" value={reteica} onChange={(e) => setReteica(e.target.value)} />, true)}
        {campo("ReteIVA esperada (% del IVA)", <input type="text" inputMode="decimal" value={reteiva} onChange={(e) => setReteiva(e.target.value)} />, true)}
      </div>
      <div className="linea">
        <button type="button" className="plat-btn mini fuerte" onClick={guardar} disabled={busy}>
          {busy ? "Guardando…" : s ? "Guardar suscripción" : "Cargar suscripción"}
        </button>
        <button type="button" className="plat-btn mini" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

// ─── Emitir una cuenta de cobro ────────────────────────────────────────────

function EditorFactura({
  fila,
  hoy,
  onHecho,
  onCancelar,
}: {
  fila: ClienteCartera;
  hoy: string;
  onHecho: () => void;
  onCancelar: () => void;
}) {
  const s = fila.suscripcion;
  const [periodo, setPeriodo] = useState(mesDe(hoy));
  const [numeroFactura, setNumeroFactura] = useState("");
  const [cufe, setCufe] = useState("");
  const [emitida, setEmitida] = useState(hoy);
  const [vence, setVence] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!s) return null;
  const pactado = s.valor_cop * s.cantidad;
  /* Sin subtotal, el backend cobra lo pactado por los MESES del período: la
     vista previa y la confirmación tienen que decir lo mismo que va a quedar. */
  const meses = mesesDelPeriodo(periodo) ?? 1;
  const sub = pesosEscritos(subtotal) ?? pactado * meses;
  const ivaN = pesosEscritos(iva) ?? 0;
  /* Una vista previa, con la misma cuenta que el backend (que es el que manda):
     retefuente y reteICA sobre el subtotal, reteIVA sobre el IVA. */
  const retenciones = Math.round((sub * (s.retefuente_pct + s.reteica_pct)) / 100 + (ivaN * s.reteiva_pct) / 100);

  const guardar = async () => {
    if (!numeroFactura.trim()) {
      setError("El número de la cuenta de cobro es obligatorio.");
      return;
    }
    const seguro = confirm(
      `¿Registrar la cuenta de cobro ${numeroFactura.trim()} de «${fila.nombre}» por ${periodo}` +
        `${subtotal.trim() ? "" : ` (${plural(meses, "mes", "meses")} de lo pactado)`}?\n\n` +
        `Total ${plata(sub + ivaN)} · retenciones estimadas ${plata(retenciones)} · neto ${plata(sub + ivaN - retenciones)}.\n\n` +
        "RECABRA no la emite ante la DIAN: sólo la registra."
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      await emitirFactura(fila.slug, {
        periodo: periodo.trim(),
        numero: numeroFactura.trim(),
        cufe: cufe.trim() || null,
        emitida_el: emitida || null,
        vence_el: vence || null,
        subtotal_cop: subtotal.trim() ? Math.round(sub) : null,
        iva_cop: Math.round(ivaN),
      });
      onHecho();
    } catch (err) {
      setError(describeError(err, "No se pudo registrar la cuenta de cobro."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plat-editor">
      <div className="linea">
        <label className="campo corto">
          <span>Período</span>
          <input type="text" value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-11 o 2026-11..2027-01" />
        </label>
        <label className="campo corto">
          <span>Número</span>
          <input type="text" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} placeholder="CC-001" />
        </label>
        <label className="campo">
          <span>CUFE (si es factura electrónica)</span>
          <input type="text" value={cufe} onChange={(e) => setCufe(e.target.value)} />
        </label>
      </div>
      <div className="linea">
        <label className="campo corto">
          <span>Emitida el</span>
          <input type="date" value={emitida} onChange={(e) => setEmitida(e.target.value)} />
        </label>
        <label className="campo corto">
          <span>Vence el</span>
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </label>
        <label className="campo corto">
          <span>Subtotal (pesos)</span>
          <input
            type="text"
            inputMode="numeric"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            placeholder={`${plata(pactado)} por mes`}
          />
        </label>
        <label className="campo corto">
          <span>IVA (pesos)</span>
          <input type="text" inputMode="numeric" value={iva} onChange={(e) => setIva(e.target.value)} />
        </label>
      </div>
      <p className="plat-nota" style={{ margin: "var(--s2) 0" }}>
        Sin subtotal, va lo pactado por los meses del período ({plural(meses, "mes", "meses")}). Sin vencimiento, la
        emisión más {plural(s.plazo_pago_dias, "día", "días")}.
        Total {plata(sub + ivaN)} · retenciones estimadas {plata(retenciones)} · neto esperado {plata(sub + ivaN - retenciones)}.
      </p>
      <div className="linea">
        <button type="button" className="plat-btn mini fuerte" onClick={guardar} disabled={busy}>
          {busy ? "Registrando…" : "Registrar cuenta de cobro"}
        </button>
        <button type="button" className="plat-btn mini" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

// ─── Registrar un pago ─────────────────────────────────────────────────────

function EditorPago({
  fila,
  factura,
  hoy,
  escalera,
  onHecho,
  onCancelar,
}: {
  fila: ClienteCartera;
  factura: FacturaCobro;
  hoy: string;
  /** Suscripción automática con el interruptor prendido: tras el pago, la
   *  escalera de este cliente corre sola (y sólo mueve lo que puso ella). */
  escalera: boolean;
  onHecho: (r: PagoRegistrado) => void;
  onCancelar: () => void;
}) {
  const [medio, setMedio] = useState<MedioPago>("transferencia");
  const [fecha, setFecha] = useState(hoy);
  const [recibido, setRecibido] = useState(String(factura.saldo_cop));
  const [retefuente, setRetefuente] = useState("0");
  const [reteica, setReteica] = useState("0");
  const [reteiva, setReteiva] = useState("0");
  const [certificado, setCertificado] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [levantar, setLevantar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cubre = entero(recibido) + entero(retefuente) + entero(reteica) + entero(reteiva);
  const falta = factura.saldo_cop - cubre;

  const guardar = async () => {
    if (!referencia.trim()) {
      setError("La referencia es obligatoria: la del banco, o la del recibo.");
      return;
    }
    if (cubre <= 0) {
      setError("Un pago por cero pesos no se registra.");
      return;
    }
    const seguro = confirm(
      `¿Registrar un pago de «${fila.nombre}» contra ${factura.numero ?? "la cuenta de cobro"}?\n\n` +
        `Recibido ${plata(entero(recibido))} + retenciones ${plata(cubre - entero(recibido))} = ${plata(cubre)}.\n` +
        `Referencia: ${referencia.trim()}` +
        (levantar
          ? "\n\nSi con esto queda al día, el estado de cuenta se levanta solo. Si no queda al día, no se toca."
          : escalera
            ? "\n\nEl pago no toca el estado de cuenta; la escalera automática vuelve a mirar al cliente enseguida (sólo lo que puso ella)."
            : "\n\nEl estado de cuenta no se toca.")
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      onHecho(
        await registrarPago(factura.id, {
          medio,
          valor_recibido_cop: entero(recibido),
          retefuente_cop: entero(retefuente),
          reteica_cop: entero(reteica),
          reteiva_cop: entero(reteiva),
          certificado_recibido: certificado,
          ref_externa: referencia.trim(),
          recibido_el: fecha || null,
          levantar_estado: levantar,
        })
      );
    } catch (err) {
      setError(describeError(err, "No se pudo registrar el pago."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plat-editor">
      <p className="plat-nota" style={{ margin: "0 0 var(--s2)" }}>
        Falta {plata(factura.saldo_cop)} de {plata(factura.total_cop)}; el neto esperado era {plata(factura.neto_esperado_cop)}{" "}
        (retenciones estimadas {plata(factura.retenciones_estimadas_cop)}). Si la transferencia pagó varias cuentas de
        cobro, registrá en cada una la parte que le toca, con la misma referencia.
      </p>
      <div className="linea">
        <label className="campo corto">
          <span>Medio</span>
          <select value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
            <option value="transferencia">Transferencia</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="campo corto">
          <span>Recibido el</span>
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="campo corto">
          <span>Valor recibido (pesos)</span>
          <input type="text" inputMode="numeric" value={recibido} onChange={(e) => setRecibido(e.target.value)} />
        </label>
        <label className="campo">
          <span>Referencia del banco o del recibo</span>
          <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </label>
      </div>
      <div className="linea">
        <label className="campo corto">
          <span>Retefuente (pesos)</span>
          <input type="text" inputMode="numeric" value={retefuente} onChange={(e) => setRetefuente(e.target.value)} />
        </label>
        <label className="campo corto">
          <span>ReteICA (pesos)</span>
          <input type="text" inputMode="numeric" value={reteica} onChange={(e) => setReteica(e.target.value)} />
        </label>
        <label className="campo corto">
          <span>ReteIVA (pesos)</span>
          <input type="text" inputMode="numeric" value={reteiva} onChange={(e) => setReteiva(e.target.value)} />
        </label>
      </div>
      <div className="linea">
        <label className="marca">
          <input type="checkbox" checked={certificado} onChange={(e) => setCertificado(e.target.checked)} />
          Llegó el certificado de retención
        </label>
        <label className="marca">
          <input type="checkbox" checked={levantar} onChange={(e) => setLevantar(e.target.checked)} />
          Si con este pago queda al día, levantar el estado de cuenta
        </label>
      </div>
      <p className="plat-nota" style={{ margin: "var(--s2) 0" }}>
        Cubre {plata(cubre)}:{" "}
        {falta <= 1000 ? "la cuenta de cobro queda pagada." : `todavía faltarían ${plata(falta)}.`} Las retenciones
        cuentan como pagadas aunque el certificado no haya llegado.
      </p>
      <div className="linea">
        <button type="button" className="plat-btn mini fuerte" onClick={guardar} disabled={busy}>
          {busy ? "Registrando…" : "Registrar pago"}
        </button>
        <button type="button" className="plat-btn mini" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

// ─── Anular o marcar en disputa ────────────────────────────────────────────

type AccionFactura = "pago" | "anular" | "disputa" | "sin_disputa";

function EditorMotivo({
  factura,
  accion,
  onHecho,
  onCancelar,
}: {
  factura: FacturaCobro;
  accion: "anular" | "disputa" | "sin_disputa";
  onHecho: () => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cual = factura.numero ?? "la cuenta de cobro";
  const texto =
    accion === "anular"
      ? `¿Anular ${cual}?\n\nNo se borra: el número queda usado y el período queda libre para emitir la corregida.`
      : accion === "disputa"
        ? `¿Marcar ${cual} en disputa?\n\nMientras se discute, no cuenta para el atraso.`
        : `¿Sacar ${cual} de la disputa?\n\nVuelve a contar para el atraso.`;

  const guardar = async () => {
    if (!motivo.trim()) {
      setError("El motivo es obligatorio.");
      return;
    }
    if (!confirm(`${texto}\n\nMotivo: ${motivo.trim()}`)) return;
    setBusy(true);
    setError(null);
    try {
      if (accion === "anular") await anularFactura(factura.id, motivo.trim());
      else await marcarDisputa(factura.id, accion === "disputa", motivo.trim());
      onHecho();
    } catch (err) {
      setError(describeError(err, "No se pudo completar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plat-editor">
      <div className="linea">
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (obligatorio)"
          aria-label={`Motivo para ${accion === "anular" ? "anular" : "la disputa de"} ${cual}`}
        />
      </div>
      <div className="linea">
        <button type="button" className={`plat-btn mini ${accion === "anular" ? "peligro" : "fuerte"}`} onClick={guardar} disabled={busy}>
          {busy ? "Un momento…" : accion === "anular" ? "Anular" : accion === "disputa" ? "Marcar en disputa" : "Sacar de la disputa"}
        </button>
        <button type="button" className="plat-btn mini" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

// ─── Las facturas de un cliente ────────────────────────────────────────────

function FacturasDe({
  fila,
  hoy,
  escalera,
  onCambio,
  onPago,
}: {
  fila: ClienteCartera;
  hoy: string;
  escalera: boolean;
  onCambio: () => void;
  onPago: (r: PagoRegistrado) => void;
}) {
  const [abierta, setAbierta] = useState<{ id: number; accion: AccionFactura } | null>(null);
  const abrir = (id: number, accion: AccionFactura) =>
    setAbierta((a) => (a?.id === id && a.accion === accion ? null : { id, accion }));

  if (fila.facturas.length === 0) return <p className="plat-nota">Todavía no tiene cuentas de cobro registradas.</p>;

  return (
    <table className="plat-cobros-facturas">
      <thead>
        <tr>
          <th>Número</th>
          <th>Período</th>
          <th>Vence</th>
          <th className="num">Total</th>
          <th className="num">Neto esperado</th>
          <th className="num">Falta</th>
          <th>Estado</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {fila.facturas.map((f) => (
          <Fragment key={f.id}>
            <tr>
              <td className="cod">
                {f.numero ?? SIN_DATO}
                {f.cufe && <div className="mut">con CUFE</div>}
              </td>
              <td className="cod">{f.periodo}</td>
              <td className="cod">{fechaCorta(f.vence_el)}</td>
              <td className="num">{plata(f.total_cop)}</td>
              <td className="num">{plata(f.neto_esperado_cop)}</td>
              <td className="num">{f.estado === "emitida" ? plata(f.saldo_cop) : SIN_DATO}</td>
              <td>
                {ESTADO_FACTURA_TXT[f.estado]}
                {f.vencida && ` · vencida hace ${plural(f.dias_atraso ?? 0, "día", "días")}`}
                {f.en_disputa && " · en disputa"}
                {f.pagada_el && <div className="mut">el {fechaCorta(f.pagada_el)}</div>}
                {f.motivo_anulacion && <div className="mut">{f.motivo_anulacion}</div>}
                {f.en_disputa && f.motivo_disputa && <div className="mut">{f.motivo_disputa}</div>}
                {f.pagos.map((p) => (
                  <div key={p.id} className="mut cod">
                    {fechaCorta(p.recibido_el)} · {plata(p.valor_recibido_cop)}
                    {p.retefuente_cop + p.reteica_cop + p.reteiva_cop > 0 &&
                      ` + ${plata(p.retefuente_cop + p.reteica_cop + p.reteiva_cop)} retenido${p.certificado_recibido ? "" : " (sin certificado)"}`}
                    {" · "}
                    {p.ref_externa} · {p.registrado_por}
                  </div>
                ))}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {f.estado === "emitida" && (
                  <>
                    <button type="button" className="plat-btn mini" onClick={() => abrir(f.id, "pago")}>
                      Registrar pago
                    </button>{" "}
                    <button
                      type="button"
                      className="plat-btn mini"
                      onClick={() => abrir(f.id, f.en_disputa ? "sin_disputa" : "disputa")}
                    >
                      {f.en_disputa ? "Sacar de disputa" : "Disputa"}
                    </button>{" "}
                    {f.abonado_cop === 0 && (
                      <button type="button" className="plat-btn mini peligro" onClick={() => abrir(f.id, "anular")}>
                        Anular
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
            {abierta?.id === f.id && (
              <tr>
                <td colSpan={8}>
                  {abierta.accion === "pago" ? (
                    <EditorPago
                      fila={fila}
                      factura={f}
                      hoy={hoy}
                      escalera={escalera}
                      onCancelar={() => setAbierta(null)}
                      onHecho={(r) => {
                        setAbierta(null);
                        onPago(r);
                      }}
                    />
                  ) : (
                    <EditorMotivo
                      key={abierta.accion}
                      factura={f}
                      accion={abierta.accion}
                      onCancelar={() => setAbierta(null)}
                      onHecho={() => {
                        setAbierta(null);
                        onCambio();
                      }}
                    />
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** Qué pasa con la diferencia entre el estado real y el que correspondería.
 *  La escalera nunca suspende y nunca toca un estado que no es «activo» y que
 *  puso una persona (el `cambiado_por` que no empieza con `sistema:`). */
function comoSeAplica(c: ClienteCartera, prendida: boolean): string {
  if (c.base_principal) return " (base principal: nada del sistema la mueve)";
  if (c.suscripcion?.modo !== "automatico") return " (manual: no se aplica solo)";
  if (!c.activo) return " (archivado: la escalera no lo mira)";
  const deUnaPersona = !!c.cambiado_por && !c.cambiado_por.startsWith("sistema:") && c.estado !== "activo";
  if (deUnaPersona) return " (lo puso una persona: la escalera no lo toca)";
  return prendida ? " (automático: lo aplica la próxima pasada)" : " (automático, en ensayo: no se aplica)";
}

// ─── La escalera, en ensayo ────────────────────────────────────────────────

/** «Correr cobranza (ensayo)»: lo que haría la escalera hoy, o el día que se
 *  elija. Desde la consola es SIEMPRE un ensayo —aplicarla es cosa del
 *  interruptor del servidor—, así que el botón no escribe ni manda nada. */
function EnsayoCobranza({ hoy, prendida }: { hoy: string; prendida: boolean }) {
  const [fecha, setFecha] = useState("");
  const [plan, setPlan] = useState<PlanCobranza | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correr = async () => {
    setBusy(true);
    setError(null);
    try {
      setPlan(await correrCobranza(fecha || null));
    } catch (err) {
      setError(describeError(err, "No se pudo ensayar la cobranza."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plat-editor" style={{ marginBottom: "var(--s3)" }}>
      <p className="plat-nota" style={{ margin: "0 0 var(--s2)" }}>
        {prendida
          ? "La escalera automática está PRENDIDA: cada 12 horas pasa a gracia y a sólo lectura las suscripciones automáticas con cuentas de cobro vencidas, y manda los avisos."
          : "La escalera automática está apagada (COBRANZA_AUTOMATICA): cada 12 horas sólo ensaya y deja en el log lo que haría."}{" "}
        Sólo toca suscripciones automáticas, nunca suspende y nunca cambia un estado que puso una persona.
      </p>
      <div className="linea">
        <label className="campo corto">
          <span>Para el día</span>
          <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <button type="button" className="plat-btn mini" onClick={correr} disabled={busy}>
          {busy ? "Ensayando…" : "Correr cobranza (ensayo)"}
        </button>
        {error && <span className="error">{error}</span>}
      </div>
      {plan && (
        <div className="plat-nota" role="status">
          <div>
            {plan.clientes.length === 0
              ? `El ${fechaCorta(plan.hoy)} no hay suscripciones automáticas que mirar.`
              : `El ${fechaCorta(plan.hoy)}, la escalera haría esto:`}
          </div>
          {plan.clientes.map((c) => (
            <div key={c.slug}>
              <b>{c.nombre}</b>:{" "}
              {c.movido
                ? `pasaría de ${ESTADO_CUENTA_TXT[c.de] ?? c.de} a ${ESTADO_CUENTA_TXT[c.a] ?? c.a}`
                : c.razon === "lo_puso_una_persona"
                  ? `queda en ${ESTADO_CUENTA_TXT[c.a] ?? c.a}: lo puso una persona`
                  : `sigue en ${ESTADO_CUENTA_TXT[c.a] ?? c.a}`}
              {c.correos.length > 0 &&
                " · " +
                  c.correos
                    .map((m) =>
                      m.destinatarios > 0
                        ? `${HITO_TXT[m.hito] ?? m.hito} de ${m.factura ?? "la cuenta de cobro"} (${plural(m.destinatarios, "destinatario", "destinatarios")})`
                        : `${HITO_TXT[m.hito] ?? m.hito} de ${m.factura ?? "la cuenta de cobro"}: no hay a quién mandarlo`
                    )
                    .join(" · ")}
            </div>
          ))}
          {plan.errores.length > 0 && <div className="error">Con error: {plan.errores.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

// ─── La cartera ────────────────────────────────────────────────────────────

type Abierto = { slug: string; que: "suscripcion" | "factura" | "facturas" };

export function TablaCobros({
  cartera,
  error,
  onCambio,
  onEstadoMovido,
}: {
  cartera: CarteraCobros | null;
  error: string | null;
  /** Algo de la cartera cambió: se vuelve a pedir. */
  onCambio: () => void;
  /** Un pago levantó el estado de cuenta: la tabla de estados se entera sin
   *  volver a pedir toda la lista. */
  onEstadoMovido: (slug: string, patch: Partial<ClientePlataforma>) => void;
}) {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const abrir = (slug: string, que: Abierto["que"]) =>
    setAbierto((a) => (a?.slug === slug && a.que === que ? null : { slug, que }));

  if (error) return <div className="plat-aviso">{error}</div>;
  if (cartera === null) return <p className="plat-nota">Cargando la cartera de cobros…</p>;
  if (cartera.clientes.length === 0) return <p className="plat-nota">No hay clientes en el registro todavía.</p>;

  const alPagar = (fila: ClienteCartera, r: PagoRegistrado) => {
    const factura = r.factura.numero ?? "la cuenta de cobro";
    const pagada = r.factura.estado === "pagada" ? `${factura} quedó pagada` : `${factura} sigue con saldo`;
    const ec = r.estado_cuenta;
    const escalera = cartera.cobranza_automatica && fila.suscripcion?.modo === "automatico" && !fila.base_principal;
    if (ec === null)
      setAviso(
        `Pago registrado: ${pagada}. ` +
          (escalera
            ? "El pago no tocó el estado de cuenta; la escalera automática vuelve a mirar al cliente enseguida."
            : "El estado de cuenta no se tocó.")
      );
    else if (ec.movido && ec.estado) {
      setAviso(`Pago registrado: ${pagada}. «${fila.nombre}» pasó a ${ESTADO_CUENTA_TXT[ec.estado] ?? ec.estado}.`);
      onEstadoMovido(fila.slug, {
        estado: ec.estado,
        motivo: ec.motivo ?? null,
        cambiado_en: ec.cambiado_en ?? null,
        cambiado_por: ec.cambiado_por ?? null,
      });
    } else {
      setAviso(
        `Pago registrado: ${pagada}. El estado de cuenta no se levantó: ${RAZON_TXT[ec.razon ?? ""] ?? "no correspondía"}.`
      );
    }
    onCambio();
  };

  return (
    <>
      <EnsayoCobranza hoy={cartera.hoy} prendida={cartera.cobranza_automatica} />
      {aviso && (
        <p className="plat-nota" role="status">
          {aviso}
        </p>
      )}
      <div className="tabla-scroll plat-cobros">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Modo</th>
              <th className="num">Pactado</th>
              <th>Próxima a pagar</th>
              <th>Atraso</th>
              <th>Estado de cuenta</th>
              <th>Último pago</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cartera.clientes.map((c) => {
              const s = c.suscripcion;
              const prox = c.proxima_factura;
              const difiere = !c.exento && c.estado_correspondiente !== null && c.estado_correspondiente !== c.estado;
              return (
                <Fragment key={c.slug}>
                  <tr className={c.activo ? undefined : "plat-archivado"}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                      <div className="cod mut">
                        {c.slug}
                        {!c.activo && " · archivado"}
                        {c.base_principal && " · base principal"}
                      </div>
                    </td>
                    <td>{s ? MODO_TXT[s.modo] : "exento"}</td>
                    <td className="num">
                      {s ? (
                        <>
                          {plata(s.valor_cop)}
                          <div className="mut">
                            {s.unidad === "sede_mes" ? `por sede · ${plural(s.cantidad, "sede", "sedes")}` : "por mes"}
                          </div>
                        </>
                      ) : (
                        SIN_DATO
                      )}
                    </td>
                    <td>
                      {c.exento ? (
                        SIN_DATO
                      ) : prox ? (
                        <>
                          <span className="cod">{prox.numero ?? SIN_DATO}</span> · vence {fechaCorta(prox.vence_el)}
                          <div className="mut">falta {plata(prox.saldo_cop)}</div>
                        </>
                      ) : (
                        "nada pendiente"
                      )}
                    </td>
                    <td>{c.dias_atraso !== null ? plural(c.dias_atraso, "día", "días") : SIN_DATO}</td>
                    <td>
                      {ESTADO_CUENTA_TXT[c.estado] ?? c.estado}
                      {difiere && c.estado_correspondiente && (
                        <div className="mut">
                          correspondería: {ESTADO_CUENTA_TXT[c.estado_correspondiente] ?? c.estado_correspondiente}
                          {comoSeAplica(c, cartera.cobranza_automatica)}
                        </div>
                      )}
                      {c.cambiado_por && <div className="mut cod">{c.cambiado_por}</div>}
                    </td>
                    <td>
                      {c.ultimo_pago ? (
                        <>
                          <span style={{ whiteSpace: "nowrap" }}>{plata(c.ultimo_pago.valor_recibido_cop)}</span>
                          <div className="mut cod">
                            {fechaCorta(c.ultimo_pago.recibido_el)} · {c.ultimo_pago.ref_externa}
                          </div>
                        </>
                      ) : (
                        SIN_DATO
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="plat-btn mini" onClick={() => abrir(c.slug, "suscripcion")}>
                        {s ? "Suscripción" : "Cargar suscripción"}
                      </button>{" "}
                      {s && (
                        <>
                          <button type="button" className="plat-btn mini" onClick={() => abrir(c.slug, "factura")}>
                            Emitir
                          </button>{" "}
                          <button type="button" className="plat-btn mini" onClick={() => abrir(c.slug, "facturas")}>
                            {abierto?.slug === c.slug && abierto.que === "facturas"
                              ? "Cerrar"
                              : `Cuentas de cobro (${c.facturas.length})`}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {abierto?.slug === c.slug && (
                    <tr>
                      <td colSpan={8}>
                        {abierto.que === "suscripcion" && (
                          <EditorSuscripcion
                            fila={c}
                            prendida={cartera.cobranza_automatica}
                            onCancelar={() => setAbierto(null)}
                            onHecho={() => {
                              setAbierto(null);
                              setAviso(`Suscripción de «${c.nombre}» guardada.`);
                              onCambio();
                            }}
                          />
                        )}
                        {abierto.que === "factura" && (
                          <EditorFactura
                            fila={c}
                            hoy={cartera.hoy}
                            onCancelar={() => setAbierto(null)}
                            onHecho={() => {
                              setAviso(`Cuenta de cobro de «${c.nombre}» registrada.`);
                              setAbierto({ slug: c.slug, que: "facturas" });
                              onCambio();
                            }}
                          />
                        )}
                        {abierto.que === "facturas" && (
                          <FacturasDe
                            fila={c}
                            hoy={cartera.hoy}
                            escalera={
                              cartera.cobranza_automatica && c.suscripcion?.modo === "automatico" && !c.base_principal
                            }
                            onCambio={onCambio}
                            onPago={(r) => alPagar(c, r)}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
