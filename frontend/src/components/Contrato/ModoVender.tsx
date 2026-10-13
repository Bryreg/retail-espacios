import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Box, Check, ImageUp, Loader2, Lock, X } from "lucide-react";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { isRentable, rateTypeLabel, rateTypeOf, type UnifiedFixture } from "../../types/fixtures";
import NotifyPreview from "../NotifyPreview";
import { useModalAbierto } from "../../tema";
import {
  fechaCorta, money, useContrato,
  type CaraElegida, type Contrato, type ResumenContrato, type SemillaContrato,
} from "./Contrato";
import { useSesionDeVenta } from "./sesionDeVenta";
// De `utils/` (no importa nada): la ficha la usa al entrar.
import { normalizarProveedor } from "../../utils/proveedor";
// Sólo los TIPOS: el visor (y con él three.js y la escena del editor) se baja
// recién cuando se abre, por el `lazy` de abajo.
import type { CaraActiva, CaraDelVisor } from "./VisorDeVenta";

/** El visor 3D de Vender, perezoso. Entrar a Vender no baja three.js ni la
 *  escena: quien sólo arma un contrato no paga ~350 KB gzip que no usa. */
const VisorDeVenta = lazy(() => import("./VisorDeVenta"));

/**
 * 03 · EL CONTRATO — la ficha de D, con lugar fijo en la hoja.
 *
 * Filas mono con el código a 17,5 px, separador punteado, los cuatro campos que
 * se teclean en cada acuerdo, el total en tinta a 30 px, los sellos de
 * temporada y el único botón amarillo de la pantalla.
 *
 * LO QUE CAMBIÓ RESPECTO DE LO QUE HABÍA, y por qué:
 *
 * · **El botón volvió adentro de la ficha.** Estaba en una barra pegada al pie
 *   de la pantalla, y esa barra era la consecuencia de que la pantalla rodara.
 *   Con la hoja de D no rueda: los cuatro paneles caben, así que el botón puede
 *   estar donde termina lo que se está firmando. Una barra flotante menos.
 * · **La ficha existe siempre**, con espacios o sin ellos. La composición es
 *   fija —es la regla del dueño, «si armar el contrato es la mitad del trabajo,
 *   la mitad del trabajo tiene lugar fijo»— y el panel vacío no es un hueco
 *   reservado: se puede teclear el proveedor y las fechas antes de elegir el
 *   primer espacio, que es como de verdad empieza una llamada.
 * · **Correo, nota y planometría viven en un desplegable.** Son opcionales y
 *   ninguno de los tres se toca en la llamada típica; con los tres siempre
 *   abiertos la ficha no cierra con dos espacios sin esconder algo, y esconder
 *   sin avisar es exactamente lo que este PR vino a sacar. Abrirlos es un gesto
 *   deliberado, y ahí sí el cuerpo rueda con su barra a la vista.
 *
 * La válvula declarada: con dos y con tres espacios el panel cierra con 12 px de
 * aire —que los pone el margen de `.acciones`, así que se ven Y se cuentan como
 * contenido: la ficha avisa antes de romper—; del cuarto en adelante rueda, y
 * sólo él.
 */

interface ModoVenderProps {
  /** Los espacios que van en el contrato, en el orden en que se tocaron. */
  espacios: CaraElegida[];
  /** El que se tocó último: es el que decide si hay que explicar que ese mueble
   *  no se alquila. */
  ultimo: UnifiedFixture | null;
  onQuitar: (fixtureId: string, face: "A" | "B") => void;
  onCambiarCara: (fixtureId: string, face: "A" | "B") => void;
  /** Apagar la sala y encender estos muebles. Pasar el mouse por una fila del
   *  contrato señala en el plano de qué espacio habla. */
  onResaltar: (claves: string[] | null) => void;
  sede: string;
  rango: DateRange | null;
  /** El contrato que se acaba de guardar, si hay uno. */
  cerrado: ResumenContrato | null;
  onGuardado: (resumen: ResumenContrato) => void;
  onCancelar: () => void;
  onSeguir: () => void;
  /** Con qué abre el formulario cuando se llegó por «Renovar»: el mismo
   *  proveedor, el mismo valor y el periodo siguiente al que está corriendo. */
  semilla?: SemillaContrato | null;
}

/** El panel 03 de la hoja. Siempre en el mismo lugar de la rejilla. */
function Panel({ derecha, children }: { derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="vp" style={{ gridArea: "1 / 2" }}>
      <header>
        <span className="ojo">03</span>
        <h2>Contrato</h2>
        <div className="der">{derecha}</div>
      </header>
      {children}
    </section>
  );
}

// ─── Los espacios del contrato ───────────────────────────────────────────────

/** Una fila: qué espacio es, dónde queda y cuánto sale.
 *
 *  El valor va ADENTRO de la fila y no en un campo aparte, porque en un
 *  contrato de tres espacios hay tres precios y no uno: la punta de la entrada
 *  no vale lo que la del fondo, y ese es justamente el detalle que se negocia.
 *  Arranca con la tarifa de referencia escrita —el precio de lista es el punto
 *  de partida real— y al lado se ve el desvío, así que bajar el precio es una
 *  decisión que se toma mirando cuánto se está bajando. */
function Fila({
  l, c, sePuedeQuitar, onResaltar,
}: {
  l: Contrato["lineas"][number];
  c: Contrato;
  sePuedeQuitar: boolean;
  onResaltar: (claves: string[] | null) => void;
}) {
  const clave = `${l.fixture.id}-${l.face}`;
  /* Dos renglones y ni uno más: la fila mide 46 px y la ficha tiene que cerrar
     con tres espacios adentro. Arriba el TIPO —que es lo que se está
     vendiendo—, abajo dónde queda y lo único que hay que mirar del precio: el
     desvío contra la referencia, si lo hay. La referencia entera («referencia
     $1.200.000») era un tercer renglón para un número que ya está en la tabla
     de tarifa, a dos paneles de distancia. */
  const segunda = [
    l.ubicacion,
    l.ref === null
      ? "sin tarifa de referencia"
      : l.desvio !== null && l.desvio !== 0
      ? l.desvio >= 1 ? `${l.desvio}% bajo la referencia` : `${Math.abs(l.desvio)}% sobre la referencia`
      : "",
  ].filter(Boolean).join(" · ");

  /* El choque de fechas sale de ese renglón y se dibuja aparte.
     Estaba ahí adentro, de tercero, en un texto de una línea que se corta con
     puntos suspensivos: con una ubicación larga («a unos 2 m del mostrador de
     carnes») más «sin tarifa de referencia», el aviso quedaba pasado el corte
     y no se veía NUNCA. Se vendió un espacio ocupado y el único que avisó fue
     el backend, al guardar, cuando ya estaba todo tecleado.
     Un aviso que compite por ancho con la ubicación no es un aviso. */
  const choque = l.choqueServidor.length > 0
    // Lo que dice la base gana: nombra las fechas del contrato que ya existe,
    // que es lo que hace falta para corregir las propias.
    ? l.choqueServidor.join(" ")
    : l.disponibilidad === "libre" ? null
    : l.disponibilidad === "parcial" ? "Parte del periodo ya está vendida"
    : "Ya está vendido en el periodo";

  /* Los espacios internos que el plano da por vendidos APARTE (los que se
     marcan en el Editor 3D). No tienen contrato en la base —viven sólo en el
     JSON del layout—, así que el plano de Vender, que mira contratos, da la
     cara por libre entera, y el visor 3D también: la muestra libre, sin ellos
     (`sinRepisasVendidas`), porque es lo que se vende. Se le dice a la dueña
     ACÁ, antes de la reunión, sin nombres: es ella la que sabe si siguen
     vigentes. Con la MISMA palabra que el editor («espacios internos») y la
     misma cuenta (uno por espacio, no por entrepaño), y que son del MUEBLE:
     valen para las dos caras de una góndola doble. No bloquea el guardado
     —el servidor no los conoce—. */
  const repisasVendidas = (l.fixture.slots ?? []).filter((s) => s.status === "occupied" || s.status === "reserved").length;

  return (
    <div
      className="eitem"
      data-clave={clave}
      onMouseEnter={() => onResaltar([clave])}
      onMouseLeave={() => onResaltar(null)}
    >
      <span className="cod">
        {l.visible}
        {/* Debajo del código, y no en un renglón propio: la fila no crece
            (con un renglón más, la ficha de tres espacios rodaba). El texto
            entero va en el `title`. */}
        {!choque && repisasVendidas > 0 && (
          <span
            className="repisas"
            data-repisas-vendidas={repisasVendidas}
            title={`${repisasVendidas === 1 ? "Un espacio interno de este mueble figura vendido" : `${repisasVendidas} espacios internos de este mueble figuran vendidos`} aparte en el plano (Editor 3D), sin contrato en la base. Son del mueble, no de una cara: valen para las dos. Vender ofrece la cara entera, y el 3D se la muestra al proveedor libre, sin ellos: revisá si siguen vigentes antes de cerrar.`}
          >
            {repisasVendidas === 1 ? "1 interno vendido" : `${repisasVendidas} internos vendidos`}
          </span>
        )}
      </span>
      <span className="d">
        <span title={l.fixture.label || l.fixture.code}>{rateTypeLabel(rateTypeOf(l.fixture))}</span>
        <span title={segunda}>{segunda}</span>
      </span>
      {/* Una góndola doble son DOS espacios que se venden por separado, y las
          dos pueden ir en el mismo contrato: una marca que quiere el pasillo
          entero compra las dos caras. Por eso cada letra es un interruptor y no
          una opción — con un selector entre A y B eso eran dos contratos. */}
      {l.doble && (
        <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {(["A", "B"] as const).map((id) => {
            const propia = l.face === id;
            const puesta = c.lineas.some((o) => o.fixture.id === l.fixture.id && o.face === id);
            return (
              <button
                key={id}
                onClick={() => c.onCambiarCara(l.fixture.id, id)}
                title={puesta ? `Sacar la cara ${id} del contrato` : `Sumar la cara ${id} al contrato`}
                style={{
                  height: 22, padding: "0 6px", borderRadius: "var(--r-xs)", cursor: "pointer",
                  border: `1px solid ${propia ? "var(--ink-1)" : puesta ? "var(--line-strong)" : "var(--line)"}`,
                  background: "var(--surface)",
                  color: puesta ? "var(--ink-1)" : "var(--ink-3)",
                  fontFamily: "var(--f-mono)", fontSize: "var(--t-2xs)",
                  fontWeight: propia ? 700 : 600,
                }}
              >
                {id}
              </button>
            );
          })}
        </span>
      )}
      <span className={`m${l.monto > 0 ? "" : " falta"}`}>
        {/* El peso va como rótulo del campo y no adentro del texto: tecleado se
            borra, y un campo de plata sin signo se confunde con los días. Con
            su cuerpo declarado: heredado quedaba en los 16 px del navegador y
            era el único tamaño de la pantalla fuera de la escala. */}
        <span
          aria-hidden
          style={{
            fontSize: "var(--t-sm)", fontFamily: "var(--f-mono)",
            color: l.monto > 0 ? "var(--ink-3)" : "var(--ocupado-txt)",
          }}
        >
          $
        </span>
        <input
          value={l.valor}
          onChange={(e) => c.escribirValor(l.codigo, e.target.value)}
          placeholder="al mes"
          inputMode="numeric"
          aria-label={`Valor acordado de ${l.visible}`}
        />
      </span>
      {sePuedeQuitar && (
        <button
          className="x"
          onClick={() => c.onQuitar(l.fixture.id, l.face)}
          aria-label={`Quitar ${l.visible} del contrato`}
        >
          ×
        </button>
      )}
      {/* El choque va DEBAJO, a todo el ancho de la fila, y no en la columna
          del tipo: ahí, angosta, salía con una palabra por renglón, la fila
          pasaba de 150 a 255 px y empujaba Proveedor, fechas y «Guardar»
          fuera del panel. (`.eitem` es flex con `wrap`; el aviso ocupa el
          100 % y baja solo al renglón de abajo.) */}
      {choque && <span className="aviso choque" role="alert">{choque}</span>}
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
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 11px", borderRadius: "var(--r-sm)",
        border: "1px dashed var(--line-strong)", background: "var(--surface-2)",
      }}
    >
      <Lock size={16} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
      <span style={{ fontSize: "var(--t-2xs)", color: "var(--ink-2)", lineHeight: 1.4 }}>
        <b>{fixture.label || fixture.code}</b> es parte del local: está marcado como
        no comercializable y no admite contrato. Para alquilarlo, cambiá su
        destino desde el Plano.
      </span>
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
    marginTop: 6, padding: "8px 10px", borderRadius: "var(--r-sm)",
    background: "var(--warning-50)", color: "var(--warning)",
    fontSize: "var(--t-2xs)", lineHeight: 1.45,
  };

  // Un servidor viejo no manda el campo: no se afirma nada.
  if (!avisos) return <>El contrato quedó guardado.</>;

  if (!avisos.smtp_listo) {
    return (
      <div style={alerta}>
        <b>No se avisó a nadie.</b> El correo no está configurado en el
        servidor, así que el contrato quedó guardado pero no salió ningún
        mensaje.
      </div>
    );
  }

  const total = avisos.comercial.length + avisos.montaje.length + avisos.proveedor.length;
  if (total === 0) {
    return (
      <div style={alerta}>
        <b>No se avisó a nadie.</b> No hay contactos cargados para esta sede.
      </div>
    );
  }

  const linea = (etiqueta: string, lista: string[], nota?: string) =>
    lista.length > 0 && (
      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
        <span style={{ color: "var(--ink-3)", flexShrink: 0, minWidth: 72 }}>{etiqueta}</span>
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
        <div style={alerta}>
          Nadie va a montar: no hay mercaderista cargado para esta sede.
        </div>
      )}
    </>
  );
}

function Cerrado({ datos, onSeguir }: { datos: ResumenContrato; onSeguir: () => void }) {
  return (
    <Panel derecha={<span className="vpill">guardado</span>}>
      <div className="cuerpo">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Check size={16} style={{ color: "var(--libre-txt)" }} />
          <b style={{ fontSize: "var(--t-base)" }}>Contrato guardado</b>
        </div>
        <div style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.5 }}>
          <b>{datos.espacios.join(", ")}</b>
          {datos.espacios.length > 1 ? " quedan contratados" : " queda contratado"} para{" "}
          <b>{datos.proveedor}</b>, del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}
          {datos.total > 0 && <> por <b>{money(datos.total)}</b></>}.
          <div style={{ marginTop: 8 }}><Avisos avisos={datos.avisos} /></div>
        </div>

        {/* Lo que NO quedó. Un contrato de tres espacios son tres filas en la
            base y la segunda puede fallar con la primera ya escrita; deshacerla
            sería peor —el correo ya salió—. Así que no se deshace nada y se dice
            exactamente qué falta, con el código a mano para reintentarlo. */}
        {datos.fallaron && datos.fallaron.length > 0 && (
          <div className="error-txt">
            <b>
              {datos.fallaron.length === 1
                ? "Un espacio no se pudo guardar."
                : `${datos.fallaron.length} espacios no se pudieron guardar.`}
            </b>{" "}
            El resto del contrato sí quedó. Volvé a intentarlo con{" "}
            {datos.fallaron.map((f) => f.espacio).join(", ")}.
            {datos.fallaron.map((f) => (
              <div key={f.espacio} style={{ color: "var(--ink-2)" }}>{f.espacio}: {f.motivo}</div>
            ))}
          </div>
        )}
        {datos.avisoPlanometria && (
          <div style={{
            marginTop: 8, padding: "8px 10px", borderRadius: "var(--r-sm)",
            background: "var(--warning-50)", color: "var(--warning)",
            fontSize: "var(--t-2xs)", lineHeight: 1.45,
          }}>
            {datos.avisoPlanometria}
          </div>
        )}
        {/* En tinta y no en amarillo, y no es un descuido: el amarillo dice
            «acá está el trabajo», y con el contrato guardado el trabajo está
            hecho. Además `probar:tema` cuenta los amarillos por archivo, y dos
            usos de `.btn-principal` en el mismo componente —aunque nunca
            aparezcan a la vez— es exactamente la forma en que la regla del
            dueño se empieza a vaciar. */}
        <div className="acciones">
          <button
            type="button"
            onClick={onSeguir}
            style={{
              display: "block", width: "100%", padding: 11,
              borderRadius: "var(--r-md)", border: 0, cursor: "pointer",
              background: "var(--accent)", color: "var(--accent-ink)",
              fontSize: "var(--t-base)", fontWeight: 700, fontFamily: "inherit",
            }}
          >
            Vender otro espacio
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ─── La ficha ────────────────────────────────────────────────────────────────

function Ficha(props: Omit<ModoVenderProps, "cerrado" | "onSeguir">) {
  const {
    espacios, ultimo, sede, rango, semilla, onQuitar, onCambiarCara,
    onGuardado, onCancelar, onResaltar,
  } = props;
  const c = useContrato({ espacios, sede, rango, semilla, onQuitar, onCambiarCara, onGuardado });
  const guardando = c.estado === "guardando";

  /* ── El 3D, encima de la ficha ──────────────────────────────────────────
     La prueba de producto vive ACÁ y no en el visor: se abre y se cierra
     muchas veces en una llamada, y al reabrir el yogur tiene que seguir en la
     punta. Se olvida con la ficha: al guardar (la ficha se va), al cambiar de
     sede (se remonta), con «Empezar de nuevo» y al cambiar de proveedor. */
  const sesion = useSesionDeVenta(c.proveedor);
  const [en3D, setEn3D] = useState<CaraActiva | null>(null);
  /** Las caras del contrato, como las lee el visor: dónde están y cómo se
   *  llaman. Nada comercial cruza: ni valores, ni fechas, ni la tarifa.
   *
   *  Sin las que chocan: una cara que ya está vendida en el periodo no se
   *  puede guardar en este contrato, y mostrársela en 3D al proveedor era
   *  ofrecerle un espacio que no se le puede vender. */
  const carasDelVisor = useMemo<CaraDelVisor[]>(() => c.lineas
    // La exhibición no tiene 3D (`storeToFixtures` no la dibuja): ni botón ni pestaña.
    .filter((l) => l.fixture.type !== "exhibicion")
    .filter((l) => l.disponibilidad === "libre" && l.choqueServidor.length === 0)
    .map((l) => ({
      fixtureId: l.fixture.id, face: l.face, visible: l.visible, codigo: l.codigo,
      tipo: rateTypeLabel(rateTypeOf(l.fixture)),
    })), [c.lineas]);
  /** La que abre «Ver en 3D»: la última cara que se tocó en el plano (las
   *  filas van en el orden en que se tocaron). Las otras quedan a un toque en
   *  la chapa del visor. */
  const caraParaVer = carasDelVisor[carasDelVisor.length - 1] ?? null;
  /** La última tocada, aunque no se pueda mostrar (tomada en estas fechas, o
   *  la exhibición, que no tiene 3D): el botón dice qué abre en su lugar, o
   *  por qué no abre nada. Antes «Ver en 3D» desaparecía sin decir nada, o
   *  abría NEV-01 habiendo tocado PUN-01. */
  const ultima = c.lineas[c.lineas.length - 1] ?? null;
  const ultimaSeVe = !!ultima && !!caraParaVer && ultima.fixture.id === caraParaVer.fixtureId && ultima.face === caraParaVer.face;
  /** «Tocá Ver en 3D…»: una pista la primera vez, mientras hay un solo
   *  espacio y el visor no se abrió. Con el segundo espacio la ficha
   *  necesita ese renglón. */
  const [vio3D, setVio3D] = useState(false);
  const abrir3D = (cara: CaraActiva) => {
    onResaltar(null);
    // La pantalla completa se pide ACÁ, en el clic: después del `import` del
    // visor el navegador ya no la da (sólo la concede con un gesto). Sobre
    // todo el documento y no sobre el visor, que en el primer clic todavía
    // no existe. Si la niega, el visor igual tapa la app entera.
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    setEn3D({ fixtureId: cara.fixtureId, face: cara.face });
    setVio3D(true);
  };
  /** Cerrar: soltar la pantalla completa y devolver el foco al botón «Ver en
   *  3D». La salida va acá y no en el desmontaje del visor: StrictMode monta
   *  y desmonta dos veces en desarrollo y la soltaría al abrir. */
  const cerrar3D = useCallback(() => {
    setEn3D(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ya salió */ });
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-ver-3d]")?.focus();
    });
  }, []);
  /** Correo, nota y planometría: opcionales, y ninguno se toca en la llamada
   *  típica. Cerrados, la ficha cierra con aire; abiertos, el cuerpo rueda y se
   *  ve que rueda. */
  const [masDatos, setMasDatos] = useState(false);
  /** «Usarla como planometría», desde el visor: la lámina queda en el campo
   *  de planometría de ESTE contrato (y se guarda con él), y el desplegable
   *  se abre para que al volver se vea adjunta. Nunca el plano.
   *
   *  Sólo si es del proveedor que el contrato tiene AHORA. La lámina se arma
   *  en segundo plano durante varios segundos y llega acá después; si en el
   *  medio el proveedor cambió, es la lámina del anterior —«PROVEEDOR Alpina»
   *  y su producto— y no entra al contrato de Postobón, donde además el visor
   *  la habría atribuido al nuevo. El proveedor vigente sale de un ref: la
   *  función que llama el visor se armó en el render del clic. Es la segunda
   *  defensa; la primera es que el visor descarta lo armado si cambió lo que
   *  se mostraba (`vigencia`). */
  const { setPlanometria } = c;
  const { marcarLamina } = sesion;
  const proveedorVigente = useRef(c.proveedor);
  proveedorVigente.current = c.proveedor;
  const adjuntarLamina = useCallback((archivo: File, cara: string, proveedor: string) => {
    if (normalizarProveedor(proveedor) !== normalizarProveedor(proveedorVigente.current)) return false;
    setPlanometria(archivo);
    marcarLamina({ archivo, cara });
    setMasDatos(true);
    return true;
  }, [setPlanometria, marcarLamina]);
  /* La lámina adjunta es de la PRUEBA, y se va con ella. La prueba se olvida
     al cambiar de proveedor (`useSesionDeVenta`); si en ese momento la
     planometría sigue siendo la lámina, sale del contrato. Pasaba: con Alpina
     se adjuntaba la lámina, se escribía «Postobón» y el contrato de Postobón
     se guardaba con la lámina de Alpina —«PROVEEDOR Alpina» y su yogur—, que
     viaja por correo y es la guía con la que el mercaderista arma la
     exhibición. Un archivo que subió la dueña no se toca: no es del 3D.
     («Empezar de nuevo» también olvida la prueba, pero saca la lámina él
     mismo y sin aviso: ver `empezarDeNuevo`.) */
  const laminaAntes = useRef(sesion.lamina);
  const [laminaQuitada, setLaminaQuitada] = useState(false);
  useEffect(() => {
    const antes = laminaAntes.current;
    laminaAntes.current = sesion.lamina;
    if (antes && !sesion.lamina && c.planometria === antes.archivo) {
      setPlanometria(null);
      setLaminaQuitada(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.lamina]);
  /** «Empezar de nuevo»: la prueba del 3D se olvida con el contrato (la ficha
   *  no se remonta: su clave es la sede). La lámina era de las caras que se
   *  van, así que sale de la planometría ACÁ, en el mismo clic, y sin aviso:
   *  con el efecto de arriba quedaba «se quitó la lámina» en una ficha que se
   *  estaba empezando de cero, con el proveedor todavía escrito. */
  const empezarDeNuevo = () => {
    if (sesion.lamina && c.planometria === sesion.lamina.archivo) setPlanometria(null);
    setLaminaQuitada(false);
    sesion.vaciar();
    onCancelar();
  };
  // Otra planometría (un archivo de la dueña, o quitarla a mano): ya no es la
  // lámina, y el aviso de que se quitó tampoco hace falta.
  useEffect(() => {
    if (sesion.lamina && c.planometria !== sesion.lamina.archivo) marcarLamina(null);
    if (c.planometria) setLaminaQuitada(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.planometria]);

  return (
    <Panel
      derecha={
        <>
          {/* «¿Y cómo queda?», sin salir del contrato: el 3D se abre ENCIMA
              de la ficha, que sigue montada debajo con todo lo tecleado. UNO
              solo, en la cabecera, y no uno por fila: en la fila le comía
              50 px a la descripción —a 1366 la góndola desbordaba la
              tarjeta— y el aviso de choque quedaba de una palabra por
              renglón. Abre la última cara que se tocó en el plano; las otras,
              desde la chapa del visor. No va en el plano porque en Vender
              tocar el plano suma o saca la cara del contrato. De la familia
              de los interruptores A/B —borde fino, mono, tinta—: nunca
              amarillo, que es de «Guardar contrato y avisar». */}
          {(caraParaVer || ultima) && (
            <button
              type="button"
              className="ver3d"
              data-ver-3d
              // Ninguna cara del contrato se puede mostrar: el botón queda, y
              // dice por qué (antes desaparecía sin explicación). `aria-disabled`
              // y no `disabled`: con `disabled` no se ve el `title`.
              aria-disabled={caraParaVer ? undefined : "true"}
              onClick={caraParaVer ? () => abrir3D(caraParaVer) : undefined}
              aria-label={caraParaVer ? `Ver ${caraParaVer.visible} en 3D` : undefined}
              title={!caraParaVer
                ? `${ultima!.visible} no se muestra en 3D: ${porQueNoSeVe(ultima!)}.`
                : ultimaSeVe
                ? `Ver cómo queda ${caraParaVer.visible} en 3D`
                : `${ultima!.visible} no se muestra en 3D (${porQueNoSeVe(ultima!)}): se abre ${caraParaVer.visible}.`}
            >
              {/* Si la última tocada no se puede mostrar, dice cuál abre. */}
              <Box size={12} aria-hidden /> {caraParaVer && !ultimaSeVe ? `Ver ${caraParaVer.visible} en 3D` : "Ver en 3D"}
            </button>
          )}
          <span className="vpill">sin firmar</span>
        </>
      }
    >
      <div className="cuerpo">
        <div className="espacios">
          {c.lineas.map((l) => (
            <Fila
              key={`${l.fixture.id}-${l.face}`}
              l={l}
              c={c}
              onResaltar={onResaltar}
              /* Con un solo espacio no se ofrece quitarlo: dejaría un contrato
                 sin nada adentro, y para eso está «Empezar de nuevo». */
              sePuedeQuitar={c.lineas.length > 1}
            />
          ))}
          {c.lineas.length === 0 && ultimo && !isRentable(ultimo) && (
            <NoComercializable fixture={ultimo} />
          )}
        </div>
        {/* Un solo renglón de guía, y dice lo que falta AHORA. Antes eran dos
            —la pista de arriba y el «falta el proveedor» sobre el botón— que
            nunca hablan del mismo momento y sumaban 40 px a una ficha que tiene
            que cerrar con tres espacios adentro. */}
        {/* Del tercer espacio en adelante, y sólo si no falta nada, la pista se
            va: quien ya sumó tres sabe cómo se suma el cuarto, y ese renglón es
            justo lo que la ficha necesita para no empezar a rodar. Es la misma
            regla de D (`$('.pista').hidden = contrato.length >= 3`). */}
        {(c.lineas.length < 3 || c.falta) && (
          <p className="pista">
            {c.lineas.length === 0
              ? <>Elegí el primer espacio <b>tocándolo en el plano</b></>
              : c.falta
              ? c.falta
              : <>Agregá otro espacio <b>tocándolo en el plano</b></>}
          </p>
        )}
        {/* La primera vez que se toca una cara, dónde está el 3D: el botón
            de la cabecera es chico y nada más en la ficha decía que existe. */}
        {c.lineas.length === 1 && caraParaVer && !vio3D && (
          <p className="pista" data-pista-3d>Tocá <b>Ver en 3D</b> para mostrarle cómo queda</p>
        )}

        <hr className="corte" />

        <div className="campo par">
          <div>
            <span className="rotulo">Proveedor</span>
            <input
              className="entrada"
              value={c.proveedor}
              onChange={(e) => c.setProveedor(e.target.value)}
              placeholder="Alpina, Nutresa…"
            />
          </div>
          <div>
            <span className="rotulo">Marca</span>
            <input
              className="entrada"
              value={c.marca}
              onChange={(e) => c.setMarca(e.target.value)}
              placeholder="opcional"
            />
          </div>
        </div>
        <div className="campo par">
          <div>
            <span className="rotulo">Desde</span>
            <input
              className="entrada cif" type="date"
              value={c.desde} onChange={(e) => c.setDesde(e.target.value)}
            />
          </div>
          <div>
            <span className="rotulo">Hasta</span>
            <input
              className="entrada cif" type="date"
              value={c.hasta} onChange={(e) => c.setHasta(e.target.value)}
            />
          </div>
        </div>
        {/* El plazo y el desplegable comparten renglón: son las dos cosas que
            cuelgan de las fechas, y en una ficha que tiene que cerrar en 448 px
            un renglón entero para un enlace de tres palabras es alto que le
            falta al botón. */}
        <div className="plazo-fila">
          <p className={`plazo${c.desde && c.hasta && !c.fechasEnOrden ? " mal" : ""}`}>
            {c.desde && c.hasta && !c.fechasEnOrden
              ? "La fecha de fin es anterior a la de inicio"
              : c.fechasEnOrden
              ? `${c.dias} día${c.dias === 1 ? "" : "s"} · ${c.lineas.length} espacio${c.lineas.length === 1 ? "" : "s"}`
              : "Elegí las fechas del acuerdo"}
          </p>
          <button
            className="btn2"
            onClick={() => setMasDatos((v) => !v)}
            aria-expanded={masDatos}
          >
            {masDatos ? "− " : "+ "}Correo, nota y planometría
          </button>
        </div>

        {masDatos && (
          <div style={{ marginTop: 4 }}>
            <div className="campo">
              <span className="rotulo">Correo · para la constancia</span>
              <input
                className="entrada"
                value={c.correo}
                onChange={(e) => c.setCorreo(e.target.value)}
                placeholder="opcional"
                inputMode="email"
              />
            </div>
            <div className="campo">
              <span className="rotulo">Nota</span>
              <textarea
                className="entrada"
                rows={2}
                value={c.nota}
                onChange={(e) => c.setNota(e.target.value)}
                placeholder="Algo que haya que saber de este acuerdo"
                style={{ display: "block", resize: "none", lineHeight: 1.4, fontSize: "var(--t-sm)" }}
              />
            </div>
            {/* La planometría: qué le prometimos armar al proveedor. Va acá y no
                en el plano porque cuelga de ESTE contrato — la misma punta
                recibe una distinta cada temporada. */}
            <div className="campo">
              <span className="rotulo">Planometría · foto o PDF del proveedor</span>
              {/* Sin nombres y sin decir POR QUÉ: esta ficha la mira el
                  proveedor, y «era de otro proveedor» le contaba que ese
                  espacio se le estuvo ofreciendo a otro (y con sólo corregir
                  cómo se escribe el mismo, era falso). La dueña sabe qué
                  cambió; lo que necesita es saber que tiene que rehacerla. */}
              {!c.planometria && laminaQuitada && (
                <span className="nota-campo" data-lamina-quitada>La lámina del 3D se quitó: si la querés, armala de nuevo con «Ver en 3D».</span>
              )}
              {c.planometria ? (
                <div className="entrada" style={{ gap: 8 }}>
                  <ImageUp size={14} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: "var(--t-2xs)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.planometria.name}
                  </span>
                  <button
                    onClick={() => c.setPlanometria(null)}
                    aria-label="Quitar la planometría"
                    style={{ border: 0, background: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex" }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <label
                  className="entrada"
                  style={{
                    gap: 8, cursor: "pointer", borderStyle: "dashed",
                    color: "var(--ink-3)", fontSize: "var(--t-2xs)",
                  }}
                >
                  <ImageUp size={14} />
                  Adjuntar cómo debe quedar la exhibición
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => c.setPlanometria(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
            {/* Quién se va a enterar, ANTES de guardar. */}
            <NotifyPreview sede={c.sede} />
          </div>
        )}

        {/* ── Lo que se firma ─────────────────────────────────────────────
            La suma de lo acordado, sin prorratear. Acá había un total que se
            derivaba del valor por día sobre un mes de 30 —$200.000 por un mes
            del 11 de septiembre al 11 de octubre salían $206.667— y la cuenta
            estaba bien pero la premisa estaba mal: quien negocia vende el
            espacio al valor que quiera por el tiempo que quiera, así que lo
            tecleado ES el precio. Es la única cifra grande de la pantalla y se
            la gana: es lo que va a quedar escrito. */}
        <div className="total">
          <span className="rotulo">Total del contrato</span>
          <span className="n">{c.total > 0 ? money(c.total) : "—"}</span>
        </div>
        {/* Las temporadas que el plazo cubre: el argumento de venta que una
            planilla no puede dar, y a la vez el control de que las fechas
            quedaron donde se querían. */}
        {c.cubre.length > 0 && (
          <div className="cubre">
            {c.cubre.map((t) => <span className="sello" key={t}>Cubre {t}</span>)}
          </div>
        )}

        {/* El error del servidor sí se dice acá, pegado al botón que lo
            provocó: es lo que pasó al tocarlo, no lo que falta antes. */}
        {c.error && (
          <p className="error-txt">
            <AlertTriangle size={12} style={{ verticalAlign: "-1px" }} /> {c.error}
          </p>
        )}

        <div className="acciones">
          {/* EL botón principal de Vender: el único amarillo de la pantalla
              (`outputs/tema.md` §2). El estado deshabilitado lo pinta
              `.btn-principal:disabled`, así que acá no hay ternarios de color:
              el color no es una decisión de este componente. */}
          <button
            className="btn-principal"
            type="button"
            onClick={c.guardar}
            disabled={!c.puedeGuardar || guardando}
            title={c.falta ?? undefined}
          >
            {guardando
              ? <><Loader2 size={14} style={{ verticalAlign: "-2px", animation: "spin .9s linear infinite" }} /> Guardando…</>
              : "Guardar contrato y avisar"}
          </button>
          <button
            className="btn2"
            type="button"
            // La prueba del 3D se olvida con el contrato: «empezar de nuevo» no
            // remonta la ficha (su clave es la sede), así que se vacía a mano.
            onClick={empezarDeNuevo}
            disabled={guardando}
          >
            Empezar de nuevo
          </button>
        </div>
      </div>
      {en3D && (
        <LimiteDelVisor onCerrar={cerrar3D}>
          <Suspense fallback={<AbriendoEl3D />}>
            <VisorDeVenta
              caras={carasDelVisor}
              activa={en3D}
              onActiva={setEn3D}
              proveedor={c.proveedor}
              onProveedor={c.setProveedor}
              sesion={sesion}
              onCerrar={cerrar3D}
              sede={c.sede}
              onPlanometria={adjuntarLamina}
              planometria={!c.planometria ? null
                : sesion.lamina && c.planometria === sesion.lamina.archivo ? { lamina: sesion.lamina.cara } : "otra"}
            />
          </Suspense>
        </LimiteDelVisor>
      )}
    </Panel>
  );
}

/** Por qué una cara del contrato no va al visor (ver `carasDelVisor`). */
function porQueNoSeVe(l: Contrato["lineas"][number]): string {
  return l.fixture.type === "exhibicion" ? "la exhibición no tiene 3D" : "está tomada en estas fechas";
}

// ─── Lo que rodea al visor 3D ────────────────────────────────────────────────

/** Mientras el visor baja (la primera vez, uno a tres segundos): la pantalla ya
 *  está en pantalla completa y algo tiene que decir qué pasa. */
function AbriendoEl3D() {
  return createPortal(
    <div className="visor-venta visor-abriendo" data-cajon-oscuro role="status">
      <Loader2 size={16} className="visor-gira" aria-hidden /> Abriendo el 3D…
    </div>,
    document.body,
  );
}

/** El aviso de que el 3D no pudo abrir, con la misma capa que el visor: la
 *  ficha queda debajo, intacta. */
function FallaDelVisor({ onCerrar }: { onCerrar: () => void }) {
  useModalAbierto();
  const volver = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const app = document.getElementById("root");
    app?.setAttribute("inert", "");
    volver.current?.focus();
    return () => app?.removeAttribute("inert");
  }, []);
  return createPortal(
    <div className="visor-venta visor-falla" data-cajon-oscuro data-capa-modal role="alertdialog" aria-modal="true" aria-label="No se pudo abrir el 3D">
      <p role="alert">
        No se pudo abrir el 3D. El contrato sigue como estaba: guardalo y recargá la página para ver el 3D.
      </p>
      <button ref={volver} type="button" className="visor-volver" onClick={onCerrar}>
        <X size={14} aria-hidden /> Volver al contrato
      </button>
    </div>,
    document.body,
  );
}

/**
 * Si el visor no puede abrir, se dice y la ficha queda como estaba.
 *
 * La app no tiene NINGÚN otro límite de errores: un `lazy` cuyo archivo no
 * baja —Render redesplegó desde `main` y el nombre del archivo cambió, o se
 * cortó la red— tira un error en el render, y sin esto React desmonta la
 * aplicación entera. Con el proveedor mirando, eso era perder el contrato
 * tecleado por querer ver el 3D.
 */
class LimiteDelVisor extends Component<{ onCerrar: () => void; children: React.ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  componentDidCatch() {
    // La pantalla completa se pidió para el 3D: sin 3D, se suelta.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ya salió */ });
  }
  render() {
    if (this.state.fallo) return <FallaDelVisor onCerrar={this.props.onCerrar} />;
    return this.props.children;
  }
}

// ─── ──────────────────────────────────────────────────────────────────────────

export default function ModoVender(props: ModoVenderProps) {
  const { cerrado, onSeguir } = props;
  if (cerrado) return <Cerrado datos={cerrado} onSeguir={onSeguir} />;
  // La clave remonta el formulario cuando cambia la sede, no cuando cambia la
  // lista: agregar un segundo espacio no puede borrar el proveedor que alguien
  // ya tecleó. Por eso NO entra la lista en la clave.
  //
  // La semilla SÍ entra: los campos se siembran en el `useState` inicial, así
  // que sin remontar, tocar «Renovar» con un contrato a medio armar en pantalla
  // no haría nada visible.
  return <Ficha key={`${props.sede}|${props.semilla?.id ?? ""}`} {...props} />;
}
