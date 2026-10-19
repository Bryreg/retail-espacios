import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, BadgeCheck, Box, Calendar, Check, FilePenLine, Hourglass, Loader2, Lock, Mail, Receipt,
  RotateCcw, StickyNote, X,
} from "lucide-react";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { isDoubleGondola, type UnifiedFixture } from "../../types/fixtures";
import NotifyPreview from "../NotifyPreview";
import { useModalAbierto } from "../../tema";
import {
  diaCorto, money, rangoCorto, useContrato,
  type CaraElegida, type Contrato, type LineaDelContrato, type ResumenContrato, type SemillaContrato,
} from "./Contrato";
import {
  ElegirPartes, FormasDeLaLinea, IconoDeLinea, Porcentaje, PrecioDeLinea, RechazoDeLinea, textoDeNoEntra,
} from "./LineaDelContrato";
import { AtajosDeFecha, CampoProveedor, ComoSeCobra, totalPorVentas } from "./CamposDelContrato";
import { useSesionDeVenta } from "./sesionDeVenta";
import { useFichasPropias } from "../../store/fichasPropias";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
// Cómo le dice este supermercado a cada familia: la lista, el visor y la lámina.
import { conNombrePropio, tipoDelMueble } from "../../catalogo/nombresPropios";
import { pct } from "../../utils/participaciones";
import { fullSpaceCode } from "../../types/espacio";
import {
  claseDe, claveDeEspacio, codigoVisibleDe, concordancia, divisionDe, esPieza, interruptoresDeLaCara, marcasDelContrato,
  parteDeSufijo, partesDe, piezasDe, seVendeAlgo, sufijoDeParte, textoDeParte,
  type FormaDeLaLinea, type ParticipacionDeLaCara,
} from "../../utils/partes";
import {
  cambioDesdeVender, divisionSinFijar, formasDeLaLinea, piezasDeLaFamilia, type CambioDePartes,
} from "../../utils/partesDelMueble";
import { internosVendidosEnLaParte } from "../../utils/slotsDeLasPartes";
// Sólo los TIPOS: el visor (y con él three.js y la escena del editor) se baja
// recién cuando se abre, por el `lazy` de abajo.
import type { CaraActiva, CaraDelVisor } from "./VisorDeVenta";

/** El visor 3D de Vender, perezoso. Entrar a Vender no baja three.js ni la
 *  escena: quien sólo arma un contrato no paga ~350 KB gzip que no usa. */
const VisorDeVenta = lazy(() => import("./VisorDeVenta"));

/**
 * 03 · EL CONTRATO — la ficha, con lugar fijo en la hoja.
 *
 * Rediseño de Vender (PR 1, los dibujos aprobados en
 * `docs/maquetas/rediseno-2026-10/`): cada línea dice qué vende con su ícono
 * —la cara entera, por partes, por entrepaños o un porcentaje— y cómo («Entera
 * · Por entrepaños · Por porcentaje», lo que el mueble permite); las partes se
 * eligen en una lista y el porcentaje con lo que queda en las fechas del
 * contrato. Cada precio, total o al mes. Abajo, siempre a la vista, el total y
 * los botones: «Guardar contrato» (el único amarillo), «Reservar hasta…» y
 * «Empezar de nuevo». Se guarda todo junto o nada.
 *
 * LO QUE SIGUE DE ANTES, y por qué:
 *
 * · **La ficha existe siempre**, con espacios o sin ellos: se puede teclear el
 *   proveedor y las fechas antes de elegir el primer espacio, que es como de
 *   verdad empieza una llamada.
 * · **Correo y nota viven en un desplegable.** Son opcionales y ninguno se
 *   toca en la llamada típica. La planometría NO está en Vender: se carga en
 *   Supervisar, en la ficha del espacio, con el contrato ya hecho.
 * · **El cuerpo rueda y el pie no**: el total y el botón no se pierden con
 *   cuatro líneas adentro.
 */

interface ModoVenderProps {
  /** Los espacios que van en el contrato, en el orden en que se tocaron. */
  espacios: CaraElegida[];
  /** El que se tocó último: es el que decide si hay que explicar que ese mueble
   *  no se alquila. */
  ultimo: UnifiedFixture | null;
  /** La ocupación ANÓNIMA de una cara por participación (o `undefined`). De
   *  acá sale «queda X %»: la ficha no lee participaciones. */
  ocupacionDe?: (f: UnifiedFixture, cara: "A" | "B") => ParticipacionDeLaCara | undefined;
  onQuitar: (fixtureId: string, face: "A" | "B", parte?: string) => void;
  onCambiarCara: (fixtureId: string, face: "A" | "B") => void;
  /** Vender por partes: prender la entera (`null`) o una parte (`"PU2"`). */
  onCambiarParte: (fixtureId: string, face: "A" | "B", parte: string | null) => void;
  /** La forma de una línea («Entera · Por entrepaños · Por porcentaje»). Con
   *  `cambio`, el mueble hoy se vende de otra forma y hay que escribírselo en el
   *  plano (ya revisado con las guardas del Plano: `cambioDesdeVender`). */
  onVenderAsi?: (fixtureId: string, face: "A" | "B", forma: FormaDeLaLinea, cambio: CambioDePartes | null) => Promise<string | null> | void;
  /** Apagar la sala y encender estos muebles. Pasar el mouse por una fila del
   *  contrato señala en el plano de qué espacio habla. */
  onResaltar: (claves: string[] | null) => void;
  /** Vender por partes, las piezas: sumar al contrato esa pieza (`"BI1"`) de
   *  todos los muebles de ese tipo de la sede que la tienen (la bahía 1 de
   *  todas las cajas): un contrato multiespacio, un renglón por caja. */
  onSumarEnTodas?: (tipo: string, parte: string) => void;
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

/** El panel 03 de la hoja. Siempre en el mismo lugar de la rejilla. Con el
 *  ícono de la tarjeta («un documento que todavía se está escribiendo»). */
function Panel({ derecha, pie, children }: { derecha?: React.ReactNode; pie?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="vp contrato" style={{ gridArea: "1 / 2" }}>
      <header>
        <FilePenLine size={16} strokeWidth={1.75} color="var(--ink-2)" aria-hidden className="ico-tarjeta" />
        <h2>Contrato</h2>
        <div className="der">{derecha}</div>
      </header>
      {children}
      {pie}
    </section>
  );
}

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

// ─── Los espacios del contrato ───────────────────────────────────────────────

/** Una línea: qué se vende, dónde queda, cómo y cuánto sale.
 *
 *  El valor va ADENTRO de la línea y no en un campo aparte, porque en un
 *  contrato de tres espacios hay tres precios y no uno: la punta de la entrada
 *  no vale lo que la del fondo, y ese es justamente el detalle que se negocia.
 *  Arranca con la tarifa de referencia escrita —el precio de lista es el punto
 *  de partida real— y la sigue mientras nadie lo toque.
 *
 *  Cerrada, la línea es un renglón; abierta (la última que se tocó, o la que
 *  todavía pide algo), muestra cómo se vende, las partes o el porcentaje, y de
 *  dónde sale el precio. */
function Fila({
  l, c, sePuedeQuitar, onResaltar, onSumarEnTodas, abierta, onAbrir, ocupacionDe, onVenderAsi,
}: {
  l: LineaDelContrato;
  c: Contrato;
  sePuedeQuitar: boolean;
  onResaltar: (claves: string[] | null) => void;
  onSumarEnTodas?: (tipo: string, parte: string) => void;
  abierta: boolean;
  onAbrir: () => void;
  ocupacionDe?: ModoVenderProps["ocupacionDe"];
  onVenderAsi?: ModoVenderProps["onVenderAsi"];
}) {
  const clave = claveDeEspacio(l.fixture.id, l.face, l.tipo === "pieza" ? l.parte : null);
  /** La llave de la CARA: la que conoce el plano (una puerta enciende su
   *  nevera). */
  const claveDeCara = claveDeEspacio(l.fixture.id, l.face);
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  /* Dos renglones y ni uno más en la cabecera de la línea. Arriba el TIPO
     —que es lo que se está vendiendo—, abajo cómo (la parte, el porcentaje y
     lo que queda), dónde queda y el desvío contra la referencia, si lo hay. */
  /* Vender por partes, pedido y sin fijar: la ficha dice «por tramos» pero
     nadie fijó cuántos (la de una góndola no los trae). Se vende entera hasta
     fijarlos en el panel del plano: se dice dónde. */
  const sinFijar = l.tipo === "entera" ? divisionSinFijar(l.fixture) : null;
  const segunda = [
    // «Puerta 2 de 3», «2 de 5 entrepaños», «Por porcentaje · queda 40 %».
    l.textoParte,
    sinFijar ? `por ${claseDe(sinFijar)?.plural ?? "partes"}: fijalos en el plano` : "",
    l.ubicacion,
    l.ref === null
      ? (l.tipo === "pc" && l.pb <= 0 ? "" : "sin tarifa de referencia")
      : l.desvio !== null && l.desvio !== 0
      ? l.desvio >= 1 ? `${l.desvio}% bajo la referencia` : `${Math.abs(l.desvio)}% sobre la referencia`
      : "",
  ].filter(Boolean).join(" · ");

  /* El choque de fechas sale de la cabecera y se dibuja aparte, a todo el
     ancho: en un texto que se corta con puntos suspensivos no se veía NUNCA, y
     se vendió un espacio ocupado. Un aviso que compite por ancho con la
     ubicación no es un aviso. Vender por partes: lo que choca puede no ser este
     espacio sino la cara entera (para una parte) o una parte (para la entera).
     Se dice cuál, sin nombrar a nadie: ni de quién es ni cuánto paga. De un
     porcentaje, sólo lo que queda. */
  const division = divisionDe(l.fixture);
  const clase = division ? claseDe(division.clase) : undefined;
  const g = division ? concordancia(division.clase) : null;
  const choque = l.choqueServidor.length > 0
    // Lo que dice la base gana: nombra las fechas, que es lo que hace falta
    // para corregir las propias.
    ? l.choqueServidor.join(" ")
    : l.tipo === "pc"
    ? (l.disponibilidad !== "libre"
      ? l.quedaPb !== null && l.quedaPb <= 0 ? "No queda nada libre de esta cara en estas fechas" : "Esta cara no se ofrece en estas fechas"
      : l.noEntra ? textoDeNoEntra(l) : null)
    : l.disponibilidad === "libre" ? null
    : l.porQue === "entera" ? "Ya está vendida entera en el periodo: no se vende por partes"
    : l.porQue === "partes" && clase && g && l.tipo === "entera"
    ? `Hay ${clase.plural} vendid${g.o}s en el periodo: se puede vender otr${g.o} ${clase.singular}, no la entera`
    : l.porQue === "partes"
    ? "Se pisa con otra parte vendida en el periodo: un mueble se divide de una sola forma"
    : l.tipo === "partes" ? "Una parte elegida ya está tomada en el periodo"
    : l.disponibilidad === "parcial" ? "Parte del periodo ya está vendida"
    : "Ya está vendido en el periodo";

  /* «BI1 · BI2»: los interruptores de las PIEZAS de lo que no se vende entero
     (una caja, una columna), en el primer renglón de ese mueble. Las partes de
     una cara (puertas, tramos, entrepaños) se eligen en su lista
     (`ElegirPartes`), con lo tomado a la vista. */
  const partesDeLaCara = partesDe(l.fixture).filter((p) => p.cara === l.face);
  const interruptores = l.tipo === "pieza" ? interruptoresDeLaCara(l.fixture, l.face) : [];
  const primeraDeLaCara = c.lineas.find((o) => o.fixture.id === l.fixture.id && o.face === l.face) === l;
  /* «Sumar la BI1 de todas las cajas de la sede (8)»: el contrato multiespacio
     de una marca que compra la misma bahía en toda la línea de cajas. */
  const todos = useFixtureStore(selectFixtures);
  const piezaDelRenglon = l.parte && esPieza(parteDeSufijo(l.parte)) ? l.parte : null;
  const conEsaPieza = piezaDelRenglon
    ? todos.filter((o) => o.type === l.fixture.type && piezasDe(o).some((p) => sufijoDeParte(p) === piezaDelRenglon))
    : [];
  const faltanEnElContrato = conEsaPieza.filter((o) => !c.lineas.some((x) => x.fixture.id === o.id && x.parte === piezaDelRenglon));
  const deTodas = piezaDelRenglon && parteDeSufijo(piezaDelRenglon)?.clase === "forro" ? "todas las columnas forradas" : "todas las cajas";

  /* Los espacios internos que el plano da por vendidos APARTE (los que se
     marcan en el Editor 3D). No tienen contrato en la base, así que Vender da
     la cara por libre y el visor 3D también. Se le dice a la dueña ACÁ, sin
     nombres. No bloquea el guardado. Vendiendo partes, sólo los que caen en
     ESAS partes (`slotsDeLasPartes.ts`). */
  const partesDelRenglon = l.partes.map((p) => parteDeSufijo(p)).filter((p): p is NonNullable<typeof p> => !!p);
  const repisasVendidas = l.tipo === "pc" ? 0
    : partesDelRenglon.length > 0
    ? partesDelRenglon.reduce((t, p) => t + internosVendidosEnLaParte(l.fixture, l.face, p), 0)
    : (l.fixture.slots ?? []).filter((s) => s.status === "occupied" || s.status === "reserved").length;
  const parteDelRenglon = partesDelRenglon[0] ?? null;

  /* Cómo se vende esta línea, y lo que haría falta para venderla de otra
     forma: las MISMAS guardas del panel «Cómo se vende» del Plano. */
  const formas = formasDeLaLinea(l.fixture);
  const actual: FormaDeLaLinea = l.tipo === "pc" ? "participacion" : l.tipo === "partes" ? (l.clase ?? "entera") : "entera";
  const posible = (forma: FormaDeLaLinea) => {
    const codigoA = fullSpaceCode(c.sede, l.fixture.code);
    const parA = ocupacionDe?.(l.fixture, "A");
    const parB = ocupacionDe?.(l.fixture, "B");
    return cambioDesdeVender(l.fixture, forma, estadoComercial, c.sede, {
      ocupacion: {
        ...(parA ? { [codigoA]: parA.ocupacion } : {}),
        ...(parB ? { [`${codigoA}-B`]: parB.ocupacion } : {}),
      },
      hoy: parA?.hoy ?? parB?.hoy,
    });
  };
  const conVentas = c.cobroModo === "ventas";
  const conPrecio = !conVentas && !l.sinElegir && !(l.tipo === "pc" && l.pb <= 0);
  /* Un porcentaje no se vende «por cara» (el rótulo de la tarifa de la
     góndola): «Góndola, por participación». */
  const tipo = tipoDelMueble(l.fixture, nombresPropios);
  const tipoDeLaLinea = l.tipo === "pc" ? `${tipo.replace(/,\s*por cara$/i, "")}, por participación` : tipo;

  return (
    <div
      className={`eitem${abierta ? " abierta" : ""}`}
      data-clave={clave}
      data-linea={l.tipo}
      onMouseEnter={() => onResaltar(clave === claveDeCara ? [clave] : [claveDeCara, clave])}
      onMouseLeave={() => onResaltar(null)}
    >
      <IconoDeLinea l={l} />
      <span className="cod">
        <button type="button" className="abrir" onClick={onAbrir} aria-expanded={abierta}
          title={abierta ? undefined : `Ver cómo se vende ${l.visible}`}>
          {l.visible}
        </button>
        {/* Debajo del código, y no en un renglón propio: la línea no crece. El
            texto entero va en el `title`. */}
        {!choque && repisasVendidas > 0 && (
          <span
            className="repisas"
            data-repisas-vendidas={repisasVendidas}
            title={parteDelRenglon
              ? `${repisasVendidas === 1 ? "Un espacio interno de este mueble figura vendido" : `${repisasVendidas} espacios internos de este mueble figuran vendidos`} aparte en el plano (Editor 3D), sin contrato en la base, y ${repisasVendidas === 1 ? "cae" : "caen"} en lo elegido. Las partes se venden igual: revisá que no caigan encima de lo que se está vendiendo antes de cerrar.`
              : `${repisasVendidas === 1 ? "Un espacio interno de este mueble figura vendido" : `${repisasVendidas} espacios internos de este mueble figuran vendidos`} aparte en el plano (Editor 3D), sin contrato en la base. Son del mueble, no de una cara: valen para las dos. Vender ofrece la cara entera, y el 3D se la muestra al proveedor libre, sin ellos: revisá si siguen vigentes antes de cerrar.`}
          >
            {repisasVendidas === 1 ? "1 interno vendido" : `${repisasVendidas} internos vendidos`}{parteDelRenglon ? " en lo elegido" : ""}
          </span>
        )}
      </span>
      <span className="d">
        <span title={conNombrePropio(l.fixture, nombresPropios, l.fixture.label || l.fixture.code)}>{tipoDeLaLinea}</span>
        <span title={segunda}>{segunda}</span>
      </span>
      {l.tipo === "pc" && l.pb > 0 && <span className="pct">{pct(l.pb)}</span>}
      {/* Una góndola doble son DOS espacios que se venden por separado, y las
          dos pueden ir en el mismo contrato. Por eso cada letra es un
          interruptor y no una opción. */}
      {l.doble && l.tipo !== "pieza" && (
        <span className="caras">
          {(["A", "B"] as const).map((id) => {
            const propia = l.face === id;
            const puesta = c.lineas.some((o) => o.fixture.id === l.fixture.id && o.face === id);
            return (
              <button
                key={id}
                type="button"
                className={`${propia ? "propia" : ""}${puesta ? " puesta" : ""}`.trim() || undefined}
                onClick={() => c.onCambiarCara(l.fixture.id, id)}
                title={puesta ? `Sacar la cara ${id} del contrato` : `Sumar la cara ${id} al contrato`}
              >
                {id}
              </button>
            );
          })}
        </span>
      )}
      {conPrecio && (
        <span className={`m${l.monto > 0 ? "" : " falta"}`}>
          {/* El peso va como rótulo del campo y no adentro del texto: tecleado
              se borra, y un campo de plata sin signo se confunde con los días. */}
          <span aria-hidden className={`signo${l.monto > 0 ? "" : " falta"}`}>$</span>
          <input
            value={l.valor}
            onChange={(e) => c.escribirValor(l.codigo, e.target.value)}
            placeholder={l.modo === "mensual" ? "al mes" : "total"}
            inputMode="numeric"
            aria-label={`Precio ${l.modo === "mensual" ? "al mes" : "total"} de ${l.visible}`}
          />
        </span>
      )}
      {sePuedeQuitar && (
        <button
          className="x"
          onClick={() => {
            if (l.tipo === "partes" && l.items.length > 0) {
              // Las partes de la línea, de una: es una línea.
              for (const it of l.items) c.onQuitar(l.fixture.id, l.face, it.parte ?? undefined);
              c.onQuitar(l.fixture.id, l.face);
            } else c.onQuitar(l.fixture.id, l.face, l.tipo === "pieza" ? l.parte ?? undefined : undefined);
          }}
          aria-label={`Quitar ${l.visible} del contrato`}
        >
          ×
        </button>
      )}
      {abierta && formas.length > 0 && onVenderAsi && (
        <FormasDeLaLinea
          l={l}
          formas={formas}
          actual={actual}
          posible={posible}
          onElegir={(forma, cambio) => onVenderAsi(l.fixture.id, l.face, forma, cambio)}
        />
      )}
      {primeraDeLaCara && interruptores.length > 0 && (
        <span className="partes" role="group" aria-label={`Cómo se vende ${codigoVisibleDe(l.fixture.code, l.face, l.doble, null)}`}
          data-partes-de={claveDeCara}>
          {interruptores.map((suf) => {
            const puesta = c.lineas.some((o) => o.fixture.id === l.fixture.id && o.face === l.face && o.parte === suf);
            const parte = suf ? parteDeSufijo(suf) : null;
            const nombre = parte ? textoDeParte(parte, partesDeLaCara.length) : "Entera";
            return (
              <button
                key={suf ?? "entera"}
                type="button"
                aria-pressed={puesta}
                className={puesta ? "on" : undefined}
                onClick={() => c.onCambiarParte(l.fixture.id, l.face, suf)}
                title={puesta ? `Sacar ${nombre.toLowerCase()} del contrato` : `Vender ${nombre.toLowerCase()}`}
              >
                {suf ?? "Entera"}
              </button>
            );
          })}
          {onSumarEnTodas && piezaDelRenglon && faltanEnElContrato.length > 0 && conEsaPieza.length > 1 && (
            <button type="button" data-sumar-en-todas={piezaDelRenglon}
              onClick={() => onSumarEnTodas(l.fixture.type, piezaDelRenglon)}
              title={`Un renglón por cada una: la ${piezaDelRenglon} de ${deTodas} de la sede que la tienen configurada`}>
              Sumar la {piezaDelRenglon} de {deTodas} de la sede ({conEsaPieza.length})
            </button>
          )}
        </span>
      )}
      {(abierta || l.sinElegir) && l.tipo === "partes" && <ElegirPartes l={l} c={c} />}
      {(abierta || l.pb <= 0) && l.tipo === "pc" && <Porcentaje l={l} c={c} />}
      {conPrecio && (abierta || l.modo === "mensual") && <PrecioDeLinea l={l} c={c} />}
      {choque && <span className="aviso choque" role="alert">{choque}</span>}
      {l.tipo === "pc" && l.noEntra && !l.rechazo && l.quedaPb !== null && l.quedaPb > 0 && (
        <span className="aviso-acciones">
          <button type="button" className="btn3" onClick={() => c.escribirPorcentaje(l.codigoCara, l.quedaPb!)}>
            Bajar a {pct(l.quedaPb)}
          </button>
        </span>
      )}
      <RechazoDeLinea l={l} c={c} onCambiarFechas={() => document.getElementById("contrato-desde")?.focus()} />
    </div>
  );
}

// ─── Estados sin contrato en curso ───────────────────────────────────────────

/** Un mueble que no se alquila: una caja, una pared, la zona de frutas. Tocarlo
 *  en el mapa no puede abrir un contrato — no hay nada que vender ahí. Una
 *  caja o una columna sin piezas configuradas dicen cómo se venden sus piezas
 *  (las bahías de impulso, el forro): en el panel del plano. */
function NoComercializable({ fixture }: { fixture: UnifiedFixture }) {
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const piezas = piezasDeLaFamilia(fixture.type);
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
        <b>{conNombrePropio(fixture, nombresPropios, fixture.label || fixture.code)}</b>{" "}
        {piezas.includes("bahias")
          ? <>no se vende entera: se venden sus bahías de impulso, una por una, cuando se configuran en el panel de la
            caja, en el Plano («Cómo se vende»).</>
          : piezas.includes("forro")
          ? <>no se vende: se vende su forro, cuando se marca en el panel de la columna, en el Plano («Cómo se vende»).</>
          : <>es parte del local: está marcado como no comercializable y no admite contrato. Para alquilarlo, cambiá su
            destino desde el Plano.</>}
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
  const reserva = datos.tipo === "reserva";
  const porVentas = datos.cobro.modo === "ventas" ? `${pct(Math.round(datos.cobro.porcentaje * 100))} de las ventas` : null;
  const cobro = porVentas ?? (datos.total > 0 ? money(datos.total) : null);
  return (
    <Panel derecha={<span className="vpill">{reserva ? "Reservado" : "Firmado"}</span>}>
      <div className="cuerpo">
        {/* Lo que quedó escrito, como el paso 5 del dibujo aprobado: las
            líneas en mono, el proveedor, las fechas y la plata. Sin
            Distribución: dónde va la marca en una cara por porcentaje se
            define después, en Supervisar, sin el proveedor delante. */}
        <div className="hecho" data-guardado={datos.tipo}>
          <Check {...ICONO} />
          <div>
            {/* «Reservado hasta el 25 oct · 8 % de las ventas»: una reserva
                que cobra por ventas lo dice en el título, que es lo que se
                apartó. */}
            <b>
              {reserva && datos.caduca
                ? `Reservado hasta el ${diaCorto(datos.caduca)}${porVentas ? ` · ${porVentas}` : ""}`
                : "Contrato guardado"}
            </b>
            {datos.espacios.map((e) => <span className="mono" key={e}>{e}</span>)}
            <span>
              {datos.proveedor} · {rangoCorto(datos.desde, datos.hasta)}
              {cobro && !(reserva && porVentas) && <> · {cobro}</>}
            </span>
            {reserva && (
              <span>Hasta ese día nadie más puede tomarlo. Después se libera solo, si no se confirma.</span>
            )}
          </div>
        </div>
        <div className="avisos-guardado">
          <Avisos avisos={datos.avisos} />
        </div>
        {/* La planometría no se carga en Vender (decisión de la dueña,
            2026-10-20): se dice dónde, una vez, sin alarma. */}
        <p className="nota-guardado" data-planometria-en-supervisar>La planometría se carga en Supervisar, en la ficha del espacio.</p>
        {/* En tinta y no en amarillo, y no es un descuido: el amarillo dice
            «acá está el trabajo», y con el contrato guardado el trabajo está
            hecho. Además dos usos de `.btn-principal` en el mismo archivo
            —aunque nunca aparezcan a la vez— es exactamente la forma en que la
            regla del dueño se empieza a vaciar. */}
        <div className="acciones">
          <button type="button" className="btn-tinta" onClick={onSeguir}>
            Armar otro contrato
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ─── La ficha ────────────────────────────────────────────────────────────────

function Ficha(props: Omit<ModoVenderProps, "cerrado" | "onSeguir">) {
  const {
    espacios, ultimo, sede, rango, semilla, onQuitar, onCambiarCara, onCambiarParte,
    onGuardado, onCancelar, onResaltar, ocupacionDe, onVenderAsi,
  } = props;
  const c = useContrato({ espacios, sede, rango, semilla, ocupacionDe, onQuitar, onCambiarCara, onCambiarParte, onGuardado });
  const guardando = c.estado === "guardando";
  // Las fichas propias del supermercado: con ellas `rateTypeOf` resuelve la
  // tarifa de un mueble colocado desde una (`cli:…`). Llegan después del
  // primer dibujo, así que van en las dependencias de lo que la pregunta.
  const fichasPropias = useFichasPropias();
  // El nombre propio de cada familia: el tipo de cada cara que ve el visor
  // (la chapa) y que lleva la lámina del proveedor.
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);

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
  //
  // El visor sigue siendo por CARA: las puertas de una nevera (o los tramos
  // de un mural) que van en el contrato son una sola cara del visor, con esas
  // partes marcadas (`vanos`, los del dibujo de la cara) y el producto sólo en
  // ellas; los entrepaños, por sus filas (`filas`: el `EN1` es la base). Con
  // la entera, la cara entera, como siempre.
  const carasDelVisor = useMemo<CaraDelVisor[]>(() => {
    const porCara = new Map<string, CaraDelVisor & { entera: boolean; sufijos: string[]; codigos: string[] }>();
    // Por ESPACIO (las partes de una línea van cada una), y un porcentaje es
    // su cara entera: el visor nunca dibuja zonas ni porcentajes.
    for (const l of c.lineas.flatMap((x) => x.items)
      // La exhibición no tiene 3D (`storeToFixtures` no la dibuja): ni botón ni pestaña.
      .filter((l) => l.fixture.type !== "exhibicion")
      .filter((l) => l.disponibilidad === "libre" && l.choqueServidor.length === 0)) {
      const k = `${l.fixture.id}|${l.face}`;
      const doble = isDoubleGondola(l.fixture);
      const ya = porCara.get(k) ?? {
        fixtureId: l.fixture.id, face: l.face, visible: codigoVisibleDe(l.fixture.code, l.face, doble, null), codigo: l.codigo,
        tipo: tipoDelMueble(l.fixture, nombresPropios), entera: false, sufijos: [], codigos: [],
      };
      if (l.parte) { ya.sufijos.push(l.parte); ya.codigos.push(l.codigo); } else ya.entera = true;
      porCara.set(k, ya);
    }
    return [...porCara.values()].map(({ entera, sufijos, codigos, ...cara }) => {
      const f = c.lineas.find((l) => l.fixture.id === cara.fixtureId)!.fixture;
      if (entera || sufijos.length === 0) {
        return { ...cara, visible: codigoVisibleDe(f.code, cara.face, isDoubleGondola(f), null) };
      }
      // Las puertas, los tramos y las filas que van en el contrato, o el nicho
      // de una pieza: `marcasDelContrato`, probada con la cámara de venta.
      const { vanos, filas, dePiezas } = marcasDelContrato(f, cara.face, sufijos);
      const doble = dePiezas ? false : isDoubleGondola(f);
      return {
        ...cara,
        visible: `${codigoVisibleDe(f.code, cara.face, doble, null)}·${sufijos.join("·")}`,
        codigo: codigos.join(", "),
        ...(vanos.length ? { vanos } : {}),
        ...(filas.length ? { filas } : {}),
      };
    });
  }, [c.lineas, fichasPropias, nombresPropios]);
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
  /** Correo y nota: opcionales, y ninguno se toca en la llamada típica.
   *  Cerrados, la ficha cierra con aire; abiertos, el cuerpo rueda y se ve que
   *  rueda. (La planometría se fue de Vender: se carga sólo en Supervisar, en
   *  la ficha del espacio, con el contrato ya hecho — decisión de la dueña,
   *  2026-10-20. Con ella se fue adjuntar la lámina del visor al contrato.) */
  const [masDatos, setMasDatos] = useState(false);
  /** «Empezar de nuevo»: la prueba del 3D se olvida con el contrato (la ficha
   *  no se remonta: su clave es la sede), así que se vacía a mano. */
  const empezarDeNuevo = () => {
    sesion.vaciar();
    onCancelar();
  };

  /** La línea abierta: la última que se tocó (cerradas, las líneas son un
   *  renglón y la ficha cierra con tres adentro). La que todavía pide algo
   *  (sin partes elegidas, sin %) se abre sola. */
  const [abierta, setAbierta] = useState<string | null>(null);
  const cuantas = useRef(c.lineas.length);
  useEffect(() => {
    if (c.lineas.length > cuantas.current) setAbierta(c.lineas[c.lineas.length - 1]?.clave ?? null);
    cuantas.current = c.lineas.length;
  }, [c.lineas]);
  /* Una línea que pasa a «por partes» sin ninguna marcada (cambió la forma, o
     entró así) queda ABIERTA por su clave, que es la misma con o sin partes
     (`…-EN*`): antes se mostraba sólo mientras no tenía ninguna y al tildar
     EN1 se cerraba en la cara del que estaba eligiendo. */
  const sinElegir = c.lineas.find((l) => l.sinElegir)?.clave ?? null;
  useEffect(() => {
    if (sinElegir) setAbierta(sinElegir);
  }, [sinElegir]);
  const conVentas = c.cobroModo === "ventas";
  const porVentas = conVentas ? totalPorVentas(c) : null;
  const queSeReserva = c.lineas.length === 1
    ? c.lineas[0].tipo === "pc" && c.lineas[0].pb > 0 ? `este ${pct(c.lineas[0].pb)}` : c.lineas[0].visible
    : "lo de este contrato";

  /* ── El pie: el total y los botones, SIEMPRE a la vista ──────────────────
     Afuera del cuerpo que rueda: con cuatro líneas abiertas el total y el
     botón seguían ahí. El total es la suma del total de cada línea (o el % de
     las ventas, que no se sabe todavía y se dice así). */
  const pie = (
    <div className="pie-contrato">
      <div className="total">
        <span className="rotulo"><Receipt {...ICONO} size={14} /> Total del contrato</span>
        {porVentas ? (
          <span className="n n-ventas">{porVentas.cifra}</span>
        ) : (
          <span className="n">{c.total > 0 ? money(c.total) : "—"}</span>
        )}
      </div>
      {/* El plazo («31 días · 1 mes · 1 línea») y las temporadas que cubre,
          en UN renglón: con una o dos líneas la ficha entra entera sin rodar
          (antes eran tres renglones, y el plazo se repetía en el cuerpo). Las
          temporadas son el argumento de venta que una planilla no puede dar,
          y el control de que las fechas quedaron donde se querían. */}
      <div className="total-fila">
        <p className="total-sub">
          {porVentas ? porVentas.detalle
            : c.fechasEnOrden && c.lineas.length > 0
            ? `${c.dias} día${c.dias === 1 ? "" : "s"} · ${c.textoDeMeses(c.nMeses)} · ${c.lineas.length} ${c.lineas.length === 1 ? "línea" : "líneas"}`
            : "\u00a0"}
        </p>
        {c.cubre.length > 0 && (
          <div className="cubre">
            {c.cubre.map((t) => <span className="sello" key={t}>Cubre {t}</span>)}
          </div>
        )}
      </div>
      {/* El error del servidor sí se dice acá, pegado al botón que lo
          provocó: es lo que pasó al tocarlo, no lo que falta antes. */}
      {c.error && (
        <p className="error-txt">
          <AlertTriangle size={12} style={{ verticalAlign: "-1px" }} /> {c.error}
        </p>
      )}
      <div className="acciones acciones2">
        {/* EL botón principal de Vender: el único amarillo de la pantalla. Con
            «Reservar hasta…» abierto, el mismo botón reserva: nunca dos
            amarillos. El estado deshabilitado lo pinta `.btn-principal:disabled`. */}
        <button
          className="btn-principal"
          type="button"
          onClick={c.guardar}
          disabled={guardando || (c.reservando ? !c.puedeReservar || !!c.faltaReserva : !c.puedeGuardar)}
          title={(c.reservando ? c.falta ?? c.faltaReserva : c.falta) ?? undefined}
        >
          {guardando
            ? <><Loader2 size={14} style={{ verticalAlign: "-2px", animation: "spin .9s linear infinite" }} /> Guardando…</>
            : c.reservando
            ? <><Hourglass {...ICONO} /> {c.caduca && !c.faltaReserva ? `Reservar hasta el ${diaCorto(c.caduca)}` : "Reservar"}</>
            : <><Check {...ICONO} /> Guardar contrato</>}
        </button>
        {c.reservando ? (
          <button className="btn3" type="button" onClick={() => c.setReservando(false)} disabled={guardando}>
            Volver
          </button>
        ) : (
          <button
            className="btn3"
            type="button"
            onClick={() => c.setReservando(true)}
            disabled={guardando || !c.puedeReservar}
            title={!c.puedeReservar ? c.falta ?? undefined : "Apartarlo hasta una fecha, sin firmar todavía"}
          >
            <Hourglass {...ICONO} /> Reservar hasta…
          </button>
        )}
        <button
          className="btn2 fantasma"
          type="button"
          // La prueba del 3D se olvida con el contrato: «empezar de nuevo» no
          // remonta la ficha (su clave es la sede), así que se vacía a mano.
          onClick={empezarDeNuevo}
          disabled={guardando}
        >
          <RotateCcw {...ICONO} size={14} /> Empezar de nuevo
        </button>
      </div>
    </div>
  );

  return (
    <Panel
      pie={pie}
      derecha={
        <>
          {/* «¿Y cómo queda?», sin salir del contrato: el 3D se abre ENCIMA
              de la ficha, que sigue montada debajo con todo lo tecleado. UNO
              solo, en la cabecera, y no uno por línea. Abre la última cara que
              se tocó en el plano; las otras, desde la chapa del visor. Nunca
              amarillo, que es de «Guardar contrato». */}
          {(caraParaVer || ultima) && (
            <button
              type="button"
              className="ver3d"
              data-ver-3d
              // Ninguna cara del contrato se puede mostrar: el botón queda, y
              // dice por qué. `aria-disabled` y no `disabled`: con `disabled`
              // no se ve el `title`.
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
          <span className="vpill">{c.reservando ? "Reservando" : "Sin firmar"}</span>
        </>
      }
    >
      <div className="cuerpo">
        <div className="espacios">
          {c.lineas.map((l) => (
            <Fila
              key={l.clave}
              l={l}
              c={c}
              onResaltar={onResaltar}
              onSumarEnTodas={props.onSumarEnTodas}
              ocupacionDe={ocupacionDe}
              onVenderAsi={onVenderAsi}
              abierta={abierta === l.clave || !!l.rechazo}
              onAbrir={() => setAbierta((a) => (a === l.clave ? null : l.clave))}
              /* Con un solo espacio no se ofrece quitarlo: dejaría un contrato
                 sin nada adentro, y para eso está «Empezar de nuevo». */
              sePuedeQuitar={c.lineas.length > 1}
            />
          ))}
          {c.lineas.length === 0 && ultimo && !seVendeAlgo(ultimo) && (
            <NoComercializable fixture={ultimo} />
          )}
        </div>
        {/* UN solo renglón de guía, y dice lo que falta AHORA. Si no falta
            nada y es la primera cara, dónde está el 3D (el botón de la
            cabecera es chico); si no, sumar otro espacio. Del tercer espacio
            en adelante, y sólo si no falta nada, se va. Eran dos renglones
            («Falta el proveedor» y el del 3D) y con una línea la ficha rodaba. */}
        {(c.lineas.length < 3 || c.falta) && (
          c.lineas.length === 1 && !c.falta && caraParaVer && !vio3D ? (
            <p className="pista" data-pista-3d>Tocá <b>Ver en 3D</b> para mostrarle cómo queda</p>
          ) : (
            <p className="pista">
              {c.lineas.length === 0
                ? <>Elegí el primer espacio <b>tocándolo en el plano</b></>
                : c.falta
                ? c.falta
                : <>Agregá otro espacio <b>tocándolo en el plano</b></>}
            </p>
          )
        )}

        <hr className="corte" />

        <div className="campo par">
          <div>
            <span className="rotulo">Proveedor</span>
            <CampoProveedor valor={c.proveedor} onCambio={c.setProveedor} />
          </div>
          <div>
            <span className="rotulo">Marca</span>
            <label className="entrada con-ico">
              <BadgeCheck {...ICONO} />
              <input value={c.marca} onChange={(e) => c.setMarca(e.target.value)} placeholder="opcional" aria-label="Marca" />
            </label>
          </div>
        </div>
        <div className="campo par">
          <div>
            <span className="rotulo">Desde</span>
            <label className="entrada con-ico cif">
              <Calendar {...ICONO} />
              <input id="contrato-desde" type="date" value={c.desde} onChange={(e) => c.setDesde(e.target.value)} aria-label="Desde" />
            </label>
          </div>
          <div>
            <span className="rotulo">Hasta</span>
            <label className="entrada con-ico cif">
              <Calendar {...ICONO} />
              <input type="date" value={c.hasta} onChange={(e) => c.setHasta(e.target.value)} aria-label="Hasta" />
            </label>
          </div>
        </div>
        {/* Los atajos de fecha. El plazo («31 días · 1 mes») va en el pie,
            junto al total; acá sólo si las fechas no sirven. */}
        <AtajosDeFecha c={c} />
        {!c.fechasEnOrden && (
          <p className="plazo mal">
            {c.desde && c.hasta ? "La fecha de fin es anterior a la de inicio" : "Elegí las fechas del acuerdo"}
          </p>
        )}

        {masDatos && (
          <div style={{ marginTop: 4 }}>
            <div className="campo">
              <span className="rotulo">Correo · para la constancia</span>
              <label className="entrada con-ico">
                <Mail {...ICONO} />
                <input
                  value={c.correo}
                  onChange={(e) => c.setCorreo(e.target.value)}
                  placeholder="opcional"
                  inputMode="email"
                  aria-label="Correo para la constancia"
                />
              </label>
            </div>
            <div className="campo">
              <span className="rotulo">Nota</span>
              <label className="entrada con-ico area">
                <StickyNote {...ICONO} />
                <textarea
                  rows={2}
                  value={c.nota}
                  onChange={(e) => c.setNota(e.target.value)}
                  placeholder="Algo que haya que saber de este acuerdo"
                  aria-label="Nota"
                />
              </label>
            </div>
            {/* Quién se va a enterar, ANTES de guardar. */}
            <NotifyPreview sede={c.sede} />
          </div>
        )}

        {/* El cobro y, en el mismo renglón, el desplegable del correo y la nota. */}
        <ComoSeCobra
          c={c}
          extra={(
            <button
              className="btn2"
              onClick={() => setMasDatos((v) => !v)}
              aria-expanded={masDatos}
            >
              {masDatos ? "− " : "+ "}Correo y nota
            </button>
          )}
        />

        {/* «Reservar hasta…»: la fecha la elige quien opera y arranca VACÍA
            (decisión de la dueña). De hoy al último día del contrato. */}
        {c.reservando && (
          <div className="campo reserva" data-reserva>
            <span className="rotulo">Reservar hasta</span>
            <label className="entrada con-ico cif">
              <Hourglass {...ICONO} />
              <input
                type="date"
                value={c.caduca}
                min={c.hoy}
                max={c.hasta || undefined}
                onChange={(e) => c.setCaduca(e.target.value)}
                aria-label="Reservar hasta"
              />
            </label>
            <span className="nota-campo">
              {c.faltaReserva ?? `Hasta ese día nadie más puede tomar ${queSeReserva}. Después se libera solo.`}
            </span>
          </div>
        )}
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
