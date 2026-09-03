import { AlertTriangle, Check, Loader2, Lock, X } from "lucide-react";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { isRentable, type UnifiedFixture } from "../../types/fixtures";
import {
  CabezaContrato, CamposContrato, fechaCorta, money, useContrato,
  type CaraElegida, type ParcheDeCara, type ResumenContrato, type SemillaContrato,
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
  /** Los espacios que van en el contrato, en el orden en que se tocaron. */
  espacios: CaraElegida[];
  /** El que se tocó último: es el que decide si la columna muestra el
   *  formulario o el cartel de «esto no se alquila». */
  ultimo: UnifiedFixture | null;
  onQuitar: (fixtureId: string, face: "A" | "B") => void;
  onCambiarCara: (fixtureId: string, face: "A" | "B") => void;
  sede: string;
  rango: DateRange | null;
  /** El contrato que se acaba de guardar, si hay uno. */
  cerrado: ResumenContrato | null;
  onGuardado: (parches: ParcheDeCara[], resumen: ResumenContrato) => void;
  onCancelar: () => void;
  onSeguir: () => void;
  /** La columna izquierda: el plano y la escalera de «cuándo se libera».
   *  Viene del tablero para que sea exactamente la misma en los dos modos. */
  children: React.ReactNode;
  /** La lista de precios, debajo de la ficha. Se dibuja SIEMPRE —haya o no un
   *  espacio elegido— porque es lo que se mira mientras se decide cuál tocar:
   *  qué familias quedan y a cuánto salen. Antes vivía detrás de un botón, y
   *  abrir un modal para consultar un precio en cada llamada es lo que hace
   *  que la gente termine con la lista impresa al lado del teclado. */
  panelTarifas?: React.ReactNode;
  /** Con qué abre el formulario cuando se llegó por «Renovar»: el mismo
   *  proveedor, el mismo valor y el periodo siguiente al que está corriendo. */
  semilla?: SemillaContrato | null;
}

// ─── Armazón ─────────────────────────────────────────────────────────────────

function Armazon({
  mapa, ficha, barra, tarifas,
}: {
  mapa: React.ReactNode;
  /** Sin ficha —y sin tarifas— el riel no se dibuja y el mapa se lleva todo. */
  ficha: React.ReactNode | null;
  barra: React.ReactNode;
  tarifas?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Las dos columnas terminan a la misma altura, y lo que absorbe la
          diferencia es SIEMPRE el último panel de la columna corta: la lista
          de precios a la derecha, la de espacios libres a la izquierda. Nunca
          la tarjeta del plano ni la escalera, que se miden con su dibujo —
          estirarlas les agrega blanco adentro, que fue el error anterior.
          Por eso `stretch` acá y `flex` sólo en el último de cada columna. */}
      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        {mapa}
        {/* Mientras no hay un espacio elegido, acá había 428 px de blanco con
            un rótulo chiquito arriba explicando que ahí iba a aparecer algo.
            Media pantalla reservada para lo que no está: es la interfaz
            avisando que le falta contenido, y es de lo que más delata que
            nadie se sentó a mirarla trabajando.

            Ahora el riel simplemente no existe hasta que hay algo que poner, y
            el mapa ocupa todo. Cuando se toca un espacio el riel entra y el
            mapa se corre: el movimiento es la respuesta al clic. */}
        {(ficha !== null || tarifas) && (
          <div
            style={{
              width: ANCHO_FICHA, flexShrink: 0, minWidth: 0,
              display: "flex", flexDirection: "column", gap: 10,
              /* Con ficha la columna es alta y se pega arriba al hacer scroll.
                 Sin ficha queda sólo la lista de precios —unos 380 px— al lado
                 de un plano que puede medir 700, y eso dejaba trescientos
                 píxeles de fondo gris que se leen como que falta algo. Estirada,
                 la tabla queda arriba y lo que sobra es hoja en blanco: una
                 lista de precios que no llena su hoja es una lista de precios,
                 no un hueco. */
              ...(ficha !== null
                ? { alignSelf: "flex-start" as const, position: "sticky" as const, top: 0 }
                : { alignSelf: "stretch" as const }),
            }}
          >
            {ficha}
            {tarifas}
          </div>
        )}
      </div>
      {barra}
    </div>
  );
}

/*  La ficha del contrato es un panel como el plano y como la tabla: mismo
 *  blanco, misma línea de 1 px, misma esquina de 3. Un rato fue una «lámina»
 *  sin borde con una línea de tinta arriba, para que se leyera como la otra
 *  mitad del plano; el problema es que en esta pantalla hay cuatro paneles y
 *  dos de ellos no pueden tener una gramática distinta de los otros dos. La
 *  jerarquía la dan el tamaño y la posición, no el tratamiento del borde. */
const tarjeta: React.CSSProperties = {
  display: "flex", flexDirection: "column",
  borderRadius: "var(--r-xl)", background: "var(--surface)",
  border: "1px solid var(--line)",
  boxShadow: "none",
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

/**
 * A quién se le avisó, de verdad.
 *
 * Acá había una frase fija —«Ya salieron los avisos: …»— que se mostraba pase
 * lo que pase. Con el SMTP sin configurar en el servidor, o sin contactos
 * cargados para la sede, decía exactamente lo mismo y no salía ni un correo.
 * Cerrar una negociación creyendo que se avisó al mercaderista, y que no se
 * haya avisado a nadie, es el modo de falla que vuelve inútil la herramienta.
 *
 * El servidor informa lo ENCOLADO, no lo entregado: los envíos corren en
 * segundo plano después de responder. Es la diferencia entre «se intentó» y
 * «se afirmó sin intentar».
 */
function Avisos({ avisos }: { avisos?: ResumenContrato["avisos"] }) {
  const alerta: React.CSSProperties = {
    marginTop: 4, padding: "9px 11px", borderRadius: "var(--r-md)",
    background: "var(--warning-50)", color: "var(--warning)",
    fontSize: 12.5, lineHeight: 1.5,
  };

  // Un servidor viejo no manda el campo: no se afirma nada.
  if (!avisos) return <>El contrato quedó guardado.</>;

  if (!avisos.smtp_listo) {
    return (
      <div style={alerta}>
        <b>No se avisó a nadie.</b> El correo no está configurado en el
        servidor, así que el contrato quedó guardado pero no salió ningún
        mensaje. Se configura en las variables de entorno del servidor; el
        botón de prueba, en ajustes, dice exactamente qué falta.
      </div>
    );
  }

  const total = avisos.comercial.length + avisos.montaje.length + avisos.proveedor.length;
  if (total === 0) {
    return (
      <div style={alerta}>
        <b>No se avisó a nadie.</b> No hay contactos cargados para esta sede.
        Se configuran en el ícono de ajustes del encabezado.
      </div>
    );
  }

  const linea = (etiqueta: string, lista: string[], nota?: string) =>
    lista.length > 0 && (
      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
        <span style={{ color: "var(--ink-3)", flexShrink: 0, minWidth: 78 }}>{etiqueta}</span>
        <span style={{ color: "var(--ink-2)", wordBreak: "break-word" }}>
          {lista.join(", ")}
          {nota && <span style={{ color: "var(--ink-3)" }}> {nota}</span>}
        </span>
      </div>
    );

  return (
    <>
      <span style={{ color: "var(--ink-3)" }}>Salieron los avisos a:</span>
      {linea("Comercial", avisos.comercial, "· con el valor")}
      {linea("Montaje", avisos.montaje, "· sin valores")}
      {linea("Proveedor", avisos.proveedor)}
      {avisos.montaje.length === 0 && (
        <div style={{ ...alerta, marginTop: 8 }}>
          Nadie va a montar: no hay mercaderista cargado para esta sede.
        </div>
      )}
    </>
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
        <b>{datos.espacios.join(", ")}</b>
        {datos.espacios.length > 1 ? " quedan contratados" : " queda contratado"} para{" "}
        <b>{datos.proveedor}</b>, del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}
        {datos.total > 0 && <> por <b>{money(datos.total)}</b></>}.
        <br />
        <br />
        <Avisos avisos={datos.avisos} />
      </div>

      {/* Lo que NO quedó. Un contrato de tres espacios son tres filas en la
          base y la segunda puede fallar con la primera ya escrita; deshacerla
          sería peor —el correo ya salió—. Así que no se deshace nada y se dice
          exactamente qué falta, con el código a mano para reintentarlo. */}
      {datos.fallaron && datos.fallaron.length > 0 && (
        <div
          style={{
            marginTop: 12, padding: "9px 11px", borderRadius: "var(--r-md)",
            background: "var(--ocupado-suave)", color: "var(--ocupado)",
            fontSize: 12.5, lineHeight: 1.45,
          }}
        >
          <b>
            {datos.fallaron.length === 1
              ? "Un espacio no se pudo guardar."
              : `${datos.fallaron.length} espacios no se pudieron guardar.`}
          </b>{" "}
          El resto del contrato sí quedó. Volvé a intentarlo con{" "}
          {datos.fallaron.map((f) => f.espacio).join(", ")}.
          <div style={{ marginTop: 5, color: "var(--ink-2)" }}>
            {datos.fallaron.map((f) => (
              <div key={f.espacio}>
                {f.espacio}: {f.motivo}
              </div>
            ))}
          </div>
        </div>
      )}
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

// ─── Con espacios elegidos ───────────────────────────────────────────────────

function ConEspacios({
  espacios, sede, rango, semilla, onQuitar, onCambiarCara, onGuardado, onCancelar,
  children, panelTarifas,
}: Omit<ModoVenderProps, "cerrado" | "onSeguir">) {
  const c = useContrato({ espacios, sede, rango, semilla, onQuitar, onCambiarCara, onGuardado });
  const guardando = c.estado === "guardando";

  return (
    <Armazon
      mapa={children}
      tarifas={panelTarifas}
      ficha={
        <div style={tarjeta}>
          <CabezaContrato c={c} />
          <CamposContrato c={c} />
        </div>
      }
      barra={
        <Barra>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
            {/* Los espacios, cada uno en su plaquita. Juntos en una sola
                cadena —«PUN-05, ISL-04»— se leen como un texto y hay que
                contarlos; separados se ven de un golpe, que es lo que uno
                revisa antes de firmar: cuántos y cuáles. */}
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
              {c.lineas.map((l) => (
                <span
                  key={`${l.fixture.id}-${l.face}`}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                    padding: "4px 9px", borderRadius: "var(--r-sm)",
                    background: "var(--accent-50)", color: "var(--accent-700)",
                  }}
                >
                  {l.nombre}
                </span>
              ))}
            </span>
            <span style={{ color: "var(--ink-4)" }}>→</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: c.proveedor ? "var(--ink-1)" : "var(--ink-4)" }}>
              {c.proveedor.trim() || "sin proveedor"}
            </span>
            <span style={{ color: "var(--line-strong)" }}>·</span>
            {/* El TOTAL del plazo, no el valor mensual: es lo que va a quedar
                escrito, y es el número sobre el que alguien dice que sí. */}
            <span
              style={{
                fontSize: 13.5, fontWeight: 700,
                color: c.total > 0 ? "var(--libre)" : "var(--ink-4)",
              }}
            >
              {c.total > 0 ? money(c.total) : "sin valor"}
            </span>
            {c.total > 0 && c.lineas.length > 0 && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                {money(c.montoMensual)} al mes
              </span>
            )}
            <span style={{ color: "var(--line-strong)" }}>·</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {c.fechasEnOrden
                ? `${fechaCorta(c.desde)} → ${fechaCorta(c.hasta)} (${c.dias} día${c.dias === 1 ? "" : "s"})`
                : "fechas por definir"}
            </span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {/* El error del servidor va ACÁ y no al pie del formulario.
                Estaba abajo de la nota, fuera de la parte visible de la ficha,
                mientras el botón que lo provoca vive en esta barra: se tocaba
                "Guardar", el backend rechazaba el choque de fechas y en
                pantalla no pasaba nada. */}
            {c.error ? (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  maxWidth: 460, padding: "6px 10px", borderRadius: "var(--r-md)",
                  background: "var(--danger-50)", color: "var(--danger)",
                  fontSize: 12, fontWeight: 500, lineHeight: 1.4,
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                {c.error}
              </span>
            ) : c.falta ? (
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.falta}</span>
            ) : null}
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
  const { espacios, ultimo, cerrado, onSeguir, children, panelTarifas } = props;

  if (cerrado) {
    return (
      <Armazon
        mapa={children} tarifas={panelTarifas} barra={null}
        ficha={<Cerrado datos={cerrado} onSeguir={onSeguir} />}
      />
    );
  }
  // Un mueble que no se alquila no entra al contrato, así que la lista sigue
  // vacía: lo que hay que explicar es por qué tocarlo no hizo nada.
  if (espacios.length === 0 && ultimo && !isRentable(ultimo)) {
    return (
      <Armazon
        mapa={children} tarifas={panelTarifas} barra={null}
        ficha={<NoComercializable fixture={ultimo} />}
      />
    );
  }
  if (espacios.length === 0) {
    // Sin espacios elegidos acá había 428 px de blanco con un rótulo chiquito
    // explicando que ahí iba a aparecer algo. Media pantalla reservada para lo
    // que no está. Ahora la columna la ocupa la lista de precios, que es
    // justamente lo que se mira antes de elegir.
    return <Armazon mapa={children} ficha={null} tarifas={panelTarifas} barra={null} />;
  }
  // La clave remonta el formulario cuando cambia la sede, no cuando cambia la
  // lista: agregar un segundo espacio no puede borrar el proveedor que alguien
  // ya tecleó. Por eso NO entra la lista en la clave.
  //
  // La semilla SÍ entra: los campos se siembran en el `useState` inicial, así
  // que sin remontar, tocar «Renovar» con un contrato a medio armar en pantalla
  // no haría nada visible.
  return <ConEspacios key={`${props.sede}|${props.semilla?.id ?? ""}`} {...props} />;
}
