import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, MapPin, RefreshCw } from "lucide-react";
import { describeError } from "../api/client";
import { miEspacio, planometriaUrl, reportar, type EspacioMontaje } from "../api/montaje";
import FormularioMontaje, {
  type EspacioAMontar, type PlanoDelEspacio,
} from "../components/Montaje/FormularioMontaje";
import type { MountConfirmation } from "../api/mounts";
import type { UnifiedFixture } from "../types/fixtures";
import { nombreDeMueble } from "../utils/nomenclatura";
import { textoDelReporte } from "../utils/montajeDelContrato";
import { TemaToggle } from "../tema";

/**
 * La pantalla que abre el enlace del correo. Un espacio y nada más.
 *
 * Antes este enlace llevaba al login, y la mercaderista entraba con la
 * contraseña compartida del rol `worker`: aterrizaba en el tablero, con el mapa
 * de la sede entera y la tabla del proveedor, el período y el estado de cada
 * espacio, para responder una sola pregunta. Ahora el enlace viene firmado y
 * esto es todo lo que hay del otro lado.
 *
 * No monta la sincronización del layout ni el store: el servidor manda en una
 * sola respuesta lo poco que esta pantalla necesita —su espacio, y los vecinos
 * como pura geometría para dibujar dónde queda—.
 */

/** Desde cuántos días antes se avisa que el enlace se está por vencer.
 *  Antes de salir a la tienda, no con el celular en la mano frente al mueble. */
const AVISO_VENCIMIENTO_DIAS = 5;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function diasHasta(iso: string): number {
  const cuando = new Date(iso).getTime();
  if (Number.isNaN(cuando)) return Infinity;
  return Math.ceil((cuando - Date.now()) / 86_400_000);
}

/** «9 de octubre» de un `AAAA-MM-DD`, sin pasar por `new Date`: ése lo toma
 *  como medianoche UTC y en Colombia lo muestra un día antes. */
function diaLargo(dia: string): string {
  const [, m, d] = dia.split("-").map(Number);
  return m && d ? `${d} de ${MESES[m - 1]}` : dia;
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} de ${MESES[d.getMonth()]}`;
}

type Estado = "cargando" | "listo" | "vencido" | "cancelado" | "error";

export default function Montaje() {
  const [espacio, setEspacio] = useState<EspacioMontaje | null>(null);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState("");
  /** El reporte que se acaba de guardar en esta pantalla. */
  const [recien, setRecien] = useState<MountConfirmation | null>(null);
  /** Se pidió corregir un reporte anterior: se vuelve a abrir el formulario. */
  const [corrigiendo, setCorrigiendo] = useState(false);

  const cargar = useCallback(() => {
    setEstado("cargando");
    setError("");
    miEspacio()
      .then((e) => { setEspacio(e); setEstado("listo"); })
      .catch((e: unknown) => {
        // Un 401 acá no es "no iniciaste sesión": es el enlace vencido, y hay
        // que decirlo con esas palabras. Lo otro que puede ser es que no haya
        // señal, y eso se resuelve reintentando.
        const codigo = (e as { response?: { status?: number } })?.response?.status;
        if (codigo === 401) {
          setEstado("vencido");
          return;
        }
        // 410: el enlace dice su contrato y ese contrato se canceló.
        if (codigo === 410) {
          setEstado("cancelado");
          return;
        }
        setError(describeError(e, "No se pudo cargar el espacio."));
        setEstado("error");
      });
  }, []);

  useEffect(cargar, [cargar]);

  const item = useMemo<EspacioAMontar | null>(() => {
    if (!espacio) return null;
    return {
      code: espacio.code,
      corto: espacio.corto,
      fixtureCode: espacio.fixture_code,
      sede: espacio.sede,
      label: espacio.label,
      marca: espacio.marca,
      proveedor: espacio.proveedor,
      desde: espacio.desde ?? "",
      hasta: espacio.hasta ?? "",
      parte: espacio.parte?.texto ?? null,
    };
  }, [espacio]);

  const plano = useMemo<PlanoDelEspacio | null>(
    () =>
      espacio?.tiene_planometria
        ? { url: planometriaUrl(), tipo: espacio.planometria_tipo ?? "image/jpeg" }
        : null,
    [espacio],
  );

  if (estado === "cargando") return <Aviso texto="Cargando el espacio…" />;

  // Antes decía «pedí que te reenvíen el aviso»: no hay cómo reenviarlo, y el
  // enlace ahora vive hasta un mes después de que arranca el contrato. Lo que
  // sí funciona es entrar con cuenta propia y confirmar desde «Montajes».
  if (estado === "vencido") {
    return (
      <Aviso
        titulo="Este enlace ya no sirve"
        texto={
          "Los enlaces de montaje vencen para que no queden dando vueltas por correo. " +
          "Si tenés cuenta en RECABRA, entrá y confirmalo desde «Montajes»; si no, " +
          "pedile a quien administra el supermercado que te invite con tu correo."
        }
      >
        <a href="/login" style={{ ...BOTON, textDecoration: "none" }}>Entrar a RECABRA</a>
      </Aviso>
    );
  }

  if (estado === "cancelado") {
    return (
      <Aviso
        titulo="Este contrato se canceló"
        texto="Ya no hay nada que montar con este enlace. Si te parece un error, avisale a quien administra el supermercado."
      />
    );
  }

  if (estado === "error" || !espacio || !item) {
    return (
      <Aviso titulo="No se pudo cargar" texto={error || "Probá de nuevo cuando tengas señal."}>
        <button onClick={cargar} style={BOTON}>
          <RefreshCw size={15} /> Reintentar
        </button>
      </Aviso>
    );
  }

  // El enlace sale al vender, y el contrato puede arrancar dentro de semanas:
  // hasta la víspera el espacio puede seguir siendo de otro contrato, y un
  // «lo monté» quedaría a nombre de ése. Se dice desde cuándo, en vez de
  // ofrecer un formulario que el servidor va a rechazar.
  if (espacio.se_confirma_desde) {
    return (
      <Marco espacio={espacio}>
        <div style={TARJETA}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Clock size={18} style={{ color: "var(--ink-3)" }} />
            <b style={{ fontSize: 16 }}>Todavía no se monta</b>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {espacio.proveedor ? `El contrato de ${espacio.proveedor}` : "Este contrato"}
            {espacio.desde ? ` arranca el ${diaLargo(espacio.desde)}` : " todavía no arranca"}.
            {" "}El montaje se confirma desde el {diaLargo(espacio.se_confirma_desde)}, con este
            mismo enlace: hasta entonces el espacio puede seguir siendo de otro contrato.
          </div>
          {espacio.donde && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10,
              fontSize: 13, color: "var(--ink-3)" }}>
              <MapPin size={13} /> {espacio.donde}
            </div>
          )}
        </div>
      </Marco>
    );
  }

  // Ya se reportó: puede ser de antes o recién, y en los dos casos lo que hace
  // falta es lo mismo — confirmar que quedó, y poder corregirlo. Una foto
  // movida, con guantes y una mano, es lo más normal del mundo, y es la prueba
  // que el proveedor va a discutir en tres meses.
  const reportado = recien ?? espacio.ultimo ?? null;
  // Administración miró la foto al lado de la planometría y no coincide
  // (rediseño UX, etapa 7): quien monta lee qué corregir y lo registra de nuevo.
  const aCorregir = !recien && reportado?.verificacion?.resultado === "no_coincide" ? reportado.verificacion : null;
  if (reportado && !corrigiendo) {
    return (
      <Marco espacio={espacio}>
        {aCorregir && (
          <div data-hay-que-corregir style={{ ...TARJETA, marginBottom: 12, borderColor: "var(--warning)", background: "var(--warning-50)" }}>
            <b style={{ fontSize: 15, color: "var(--ink-1)" }}>Hay que corregir el montaje</b>
            <div style={{ fontSize: 13.5, color: "var(--ink-1)", lineHeight: 1.5, marginTop: 4 }}>{aCorregir.nota}</div>
            <button onClick={() => { setCorrigiendo(true); setRecien(null); }} style={BOTON}>
              Corregir y registrar de nuevo
            </button>
          </div>
        )}
        <div style={{ ...TARJETA, borderColor: "var(--success-100)", background: "var(--success-50)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Check size={18} style={{ color: "var(--success)" }} />
            <b style={{ fontSize: 16 }}>
              {recien
                ? "Listo, quedó reportado"
                : reportado.estado === "montado"
                ? "Este espacio ya se reportó como montado"
                : "Este espacio ya se reportó como no montado"}
            </b>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {/* El reporte puede quedar sin la foto: la limpieza la borra
                cinco días después de que el contrato termina sin renovación
                (`services/fotos_vencidas.py`) y un admin la puede borrar para
                que la repitan. `textoDelReporte` no dice la causa. */}
            {textoDelReporte(reportado)}
            {reportado.reportado_por ? ` Lo reportó ${reportado.reportado_por}.` : ""}
          </div>
          <button
            onClick={() => { setCorrigiendo(true); setRecien(null); }}
            style={{
              marginTop: 12, background: "none", border: "none", padding: 0,
              color: "var(--accent-700)", fontWeight: 600, fontSize: 13.5,
              fontFamily: "inherit", cursor: "pointer", textDecoration: "underline",
            }}
          >
            {recien ? "Corregir lo que acabo de reportar" : "Corregir el reporte"}
          </button>
        </div>
      </Marco>
    );
  }

  return (
    <Marco espacio={espacio}>
      <FormularioMontaje
        item={item}
        vecinos={espacio.vecinos as UnifiedFixture[]}
        plano={plano}
        dibujo={espacio.dibujo ?? null}
        donde={espacio.donde}
        onEnviar={reportar}
        onCancel={corrigiendo ? () => setCorrigiendo(false) : undefined}
        onSaved={(m) => { setRecien(m); setCorrigiendo(false); }}
      />
    </Marco>
  );
}

// ─── Envoltorio ───────────────────────────────────────────────────────────────

const TARJETA: React.CSSProperties = {
  padding: 14,
  borderRadius: "var(--r-lg)",
  background: "var(--surface)",
  border: "1px solid var(--line)",
};

const BOTON: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  marginTop: 14, padding: "10px 16px", borderRadius: "var(--r-lg)",
  background: "var(--accent)", color: "#fff", border: "none",
  fontSize: 14.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

/** Encabezado propio: sin esto la pantalla arranca en un formulario suelto y no
 *  se sabe de qué tienda se está hablando. No lleva navegación a ninguna otra
 *  parte porque no hay ninguna otra parte a la que este enlace dé acceso. */
function Marco({ espacio, children }: { espacio: EspacioMontaje; children: React.ReactNode }) {
  const quedan = espacio.vence ? diasHasta(espacio.vence) : Infinity;
  const sufijoParte = espacio.parte ? `${espacio.parte.token}${espacio.parte.n ?? ""}` : null;
  return (
    <div
      style={{
        minHeight: "100dvh", background: "var(--bg)", color: "var(--ink-1)",
        display: "flex", flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "14px 14px 12px", background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {/* El toggle de tema también acá: la mercaderista abre esta pantalla
            en el celular, parada frente al mueble, y el pasillo del fondo de un
            supermercado tiene la mitad de luz que la oficina. Es la misma pieza
            y la misma llave que en el tablero (`recabra-tema`). */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--ink-3)" }}>
            Montaje
          </div>
          <TemaToggle estilo={{ marginLeft: "auto" }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 3 }}>
          {/* Con una parte, el código de su cara y la parte aparte: decía
              «NEV-01-PU2 PU2», el sufijo dos veces. */}
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {nombreDeMueble({ code: sufijoParte && espacio.corto.toUpperCase().endsWith(`-${sufijoParte}`)
              ? espacio.corto.slice(0, -(sufijoParte.length + 1))
              : espacio.corto })}
          </span>
          {sufijoParte && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-700)" }}>
              {sufijoParte}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 12, color: "var(--ink-3)" }}>
            <MapPin size={11} /> {espacio.sede}
          </span>
        </div>
      </header>

      {quedan <= AVISO_VENCIMIENTO_DIAS && espacio.vence && (
        <div
          style={{
            display: "flex", gap: 7, alignItems: "center", padding: "9px 14px",
            background: "var(--warning-50)", color: "var(--warning)", fontSize: 12.5,
          }}
        >
          <Clock size={13} style={{ flexShrink: 0 }} />
          {quedan <= 0
            ? "Este enlace se vence hoy."
            : `Este enlace se vence el ${fechaLarga(espacio.vence)}.`}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14px 14px 40px" }}>
        {children}
      </div>
    </div>
  );
}

/** Pantalla completa con un solo mensaje: cargando, vencido o sin señal. */
function Aviso({
  titulo, texto, children,
}: {
  titulo?: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh", background: "var(--bg)", color: "var(--ink-1)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "24px 22px", textAlign: "center",
      }}
    >
      {titulo && (
        <h1 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>
          {titulo}
        </h1>
      )}
      <p style={{ margin: 0, maxWidth: 380, fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)" }}>
        {texto}
      </p>
      {children}
    </div>
  );
}
