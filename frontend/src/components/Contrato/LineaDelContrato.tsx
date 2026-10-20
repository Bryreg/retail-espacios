import { useEffect, useState } from "react";
import { Check, Columns3, Lock, Pencil, Percent, Rows3, Tag, TriangleAlert } from "lucide-react";
import { diaCorto, money, rangoCorto, textoDelRechazo, type Contrato, type LineaDelContrato } from "./Contrato";
import { claseDe, partesParaElegir, type FormaDeLaLinea } from "../../utils/partes";
import { CARA_ENTERA_PB, pbDeTexto, pct } from "../../utils/participaciones";
import type { CambioDePartes } from "../../utils/partesDelMueble";

/**
 * Las piezas de UNA línea del contrato de Vender (rediseño de Vender, PR 1;
 * los dibujos aprobados están en `docs/maquetas/rediseno-2026-10/`):
 *
 *  · `IconoDeLinea` — qué se vende: por partes de lado a lado (Columns3), por
 *    entrepaños (Rows3) o un porcentaje (Percent); la cara entera, sin ícono.
 *  · `FormasDeLaLinea` — «Entera · Por entrepaños · Por porcentaje», sólo lo
 *    que la familia del mueble permite; si hoy se vende de otra forma, ofrece
 *    cambiarla con las guardas del Plano, confirmado en la misma línea; si no
 *    se puede, la opción se ve apagada con su porqué, sin nombrar a nadie.
 *  · `ElegirPartes` — las partes de la cara, los entrepaños de arriba a abajo;
 *    las tomadas rayadas con la palabra «Tomado» y sin casilla, sin decir de
 *    quién.
 *  · `Porcentaje` — cuánto de la cara: lo que queda en las fechas del
 *    contrato, la barra (este contrato en tinta, lo libre, lo rayado «no
 *    disponible» sin dueño) y 10 · 25 · 50 · «Todo lo que queda» · otro.
 *  · `PrecioDeLinea` — «Total | Al mes» y de dónde sale el precio.
 *  · `RechazoDeLinea` — el 409: «Ya no entra el 75 %. Desde el 3 nov queda
 *    70 %. No se guardó nada.», con «Bajar a 70 %» y «Cambiar fechas».
 *
 * Lo mira el proveedor: de una cara por porcentaje sólo su % y lo que queda.
 * Ningún nombre, monto ni forma de otro (`probar-vender`).
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export function IconoDeLinea({ l }: { l: LineaDelContrato }) {
  /* La cara ENTERA no lleva ícono («aire y pines», el dibujo aprobado): el
     cuadrado vacío de lucide, a la izquierda del código, se leía como una
     casilla para tildar —que no existe: no hay forma de elegir líneas—. Las
     otras formas sí lo llevan, porque dicen algo que el código no dice (por
     partes, por entrepaños, un porcentaje). */
  const Icono = l.tipo === "pc" ? Percent
    : l.tipo === "partes" && claseDe(l.clase ?? "")?.base ? Rows3
    : l.tipo === "partes" || l.tipo === "pieza" ? Columns3
    : null;
  return Icono ? <span className="ico-linea"><Icono {...ICONO} /></span> : null;
}

/** Lo que una línea puede hacer para venderse de otra forma: ya se vende así
 *  (`listo`), se puede cambiando cómo se vende el mueble, o no se puede. */
export type CambioPosible = { listo: true } | { cambio: CambioDePartes; aviso: string | null } | { problema: string };

export function FormasDeLaLinea({ l, formas, actual, posible, onElegir }: {
  l: LineaDelContrato;
  formas: { forma: FormaDeLaLinea; texto: string }[];
  actual: FormaDeLaLinea;
  posible: (forma: FormaDeLaLinea) => CambioPosible;
  /** Con `cambio`, escribe en el plano cómo se vende el mueble; devuelve el
   *  problema si el plano no se pudo guardar. */
  onElegir: (forma: FormaDeLaLinea, cambio: CambioDePartes | null) => Promise<string | null> | void;
}) {
  /** La forma pedida que obliga a cambiar cómo se vende el mueble: se pide
   *  confirmar acá mismo, sin un diálogo encima. */
  const [pedida, setPedida] = useState<FormaDeLaLinea | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  /** La forma apagada que se tocó: su porqué se dice recién entonces, en una
   *  línea (antes el aviso estaba siempre arriba de la barra, aunque nadie
   *  quisiera cambiar nada). */
  const [probada, setProbada] = useState<FormaDeLaLinea | null>(null);
  useEffect(() => { setPedida(null); setFallo(null); setProbada(null); }, [actual]);
  const deCadaUna = formas.map((x) => ({ ...x, r: x.forma === actual ? ({ listo: true } as const) : posible(x.forma) }));
  const r = pedida ? deCadaUna.find((x) => x.forma === pedida)?.r ?? null : null;
  /* Las que no se pueden se ven, apagadas, con su porqué en el `title`; y si
     igual se toca una, el porqué en una línea (sin nombrar a nadie). */
  const rProbada = probada ? deCadaUna.find((x) => x.forma === probada)?.r ?? null : null;
  const porque = rProbada && "problema" in rProbada ? rProbada.problema : null;
  const confirmar = async () => {
    if (!pedida || !r || !("cambio" in r)) return;
    setCambiando(true);
    setFallo(null);
    try {
      const problema = await onElegir(pedida, r.cambio);
      if (problema) setFallo(problema);
      else setPedida(null);
    } finally {
      setCambiando(false);
    }
  };
  return (
    <>
      <span className="seg seg-linea" role="group" aria-label={`Cómo se vende ${l.visible}`}>
        {deCadaUna.map(({ forma, texto: t, r: rr }) => (
          <button
            key={forma}
            type="button"
            aria-pressed={forma === actual}
            aria-disabled={"problema" in rr || undefined}
            disabled={cambiando}
            title={"problema" in rr ? rr.problema : undefined}
            onClick={() => {
              setFallo(null);
              if ("problema" in rr) { setPedida(null); setProbada((x) => (x === forma ? null : forma)); return; }
              setProbada(null);
              if (forma === actual) { setPedida(null); return; }
              if ("listo" in rr) { setPedida(null); void onElegir(forma, null); return; }
              setPedida(forma);
            }}
          >
            {t}
          </button>
        ))}
      </span>
      {porque && !pedida && (
        <span className="oferta no" role="note" data-no-se-cambia>
          <Lock {...ICONO} />
          <span>{porque}</span>
        </span>
      )}
      {pedida && r && "cambio" in r && (
        <span className="oferta" role="group" data-oferta-cambio>
          <span>
            Cambia cómo se vende {l.fixture.code} en toda la tienda{l.doble ? " (las dos caras)" : ""}.
            {r.aviso && <> {r.aviso}</>}
          </span>
          <span className="oferta-botones">
            <button type="button" className="btn3" onClick={() => void confirmar()} disabled={cambiando}>
              {cambiando ? "Cambiando…" : "Cambiar"}
            </button>
            <button type="button" className="btn2" onClick={() => setPedida(null)} disabled={cambiando}>Dejarlo así</button>
          </span>
        </span>
      )}
      {fallo && <span className="aviso choque" role="alert">{fallo}</span>}
    </>
  );
}

/** Las partes de la cara para marcar, como se ven paradas frente al mueble.
 *  La tomada va rayada, con su palabra y sin casilla: no se puede marcar ni
 *  se dice por quién está tomada. */
export function ElegirPartes({ l, c }: { l: LineaDelContrato; c: Contrato }) {
  const clase = l.clase ?? "";
  const lista = partesParaElegir(l.fixture, l.face, clase);
  const c0 = claseDe(clase);
  return (
    <span className="repisas-lista" role="group" aria-label={`Qué ${c0?.plural ?? "partes"} de ${l.visible}`}>
      {lista.map(({ sufijo, texto }) => {
        const puesta = l.partes.includes(sufijo);
        const { disponibilidad, ref } = c.parteEnElContrato(l.fixture, l.face, sufijo);
        const tomada = disponibilidad !== "libre";
        return (
          <button
            key={sufijo}
            type="button"
            className={`repisa${puesta ? " si" : ""}${tomada ? " tomada" : ""}`}
            aria-pressed={puesta}
            disabled={tomada && !puesta}
            onClick={() => c.onCambiarParte(l.fixture.id, l.face, sufijo)}
            title={tomada ? `${sufijo} está tomado en estas fechas` : puesta ? `Sacar ${sufijo} del contrato` : `Vender ${sufijo}`}
          >
            <span className="caja" aria-hidden>{puesta && <Check {...ICONO} size={12} />}</span>
            <span className="mono">{texto}</span>
            <span className="estado">{tomada ? "Tomado" : puesta && ref !== null ? money(ref) : "Libre"}</span>
          </button>
        );
      })}
    </span>
  );
}

const RAPIDOS = [1000, 2500, 5000];

/** Cuánto de la cara se vende: lo que queda EN LAS FECHAS DEL CONTRATO (se
 *  vuelve a contar cuando cambian), la barra y los botones rápidos. De lo
 *  demás no se dice nada: lo rayado no está disponible, sin dueño ni forma. */
export function Porcentaje({ l, c }: { l: LineaDelContrato; c: Contrato }) {
  const [otro, setOtro] = useState("");
  const [otroMal, setOtroMal] = useState(false);
  const queda = l.quedaPb;
  const pb = l.pb;
  const elegir = (n: number) => { setOtroMal(false); c.escribirPorcentaje(l.codigoCara, n); };
  const suyo = queda === null ? pb : Math.min(pb, queda);
  const libre = queda === null ? 0 : Math.max(0, queda - pb);
  const no = queda === null ? 0 : CARA_ENTERA_PB - queda;
  const ancho = (x: number) => `${(x / CARA_ENTERA_PB) * 100}%`;
  return (
    <span className="lpct" data-porcentaje={l.codigoCara}>
      <span className="cap">
        <span className="barra" aria-hidden>
          {suyo > 0 && <span className="suyo" style={{ width: ancho(suyo) }} />}
          {libre > 0 && <span className="queda" style={{ width: ancho(libre) }} />}
          {no > 0 && <span className="no" style={{ width: ancho(no) }} />}
        </span>
        <span className="lee">
          {queda === null ? (
            <span>Todavía no se sabe cuánto queda: el servidor lo revisa al guardar.</span>
          ) : pb > 0 ? (
            <>
              <span><b>{pct(pb)}</b> en este contrato</span>
              <span><b>{pct(Math.max(0, queda - pb))}</b> sigue libre</span>
            </>
          ) : (
            <span><b>{pct(queda)}</b> libre {c.fechasEnOrden ? `del ${rangoCorto(c.desde, c.hasta)}` : ""}</span>
          )}
          {no > 0 && <span>lo rayado no está disponible</span>}
        </span>
      </span>
      <span className="selpct">
        {RAPIDOS.map((n) => (
          <button key={n} type="button" className="atajo" aria-pressed={pb === n}
            disabled={queda !== null && n > queda} onClick={() => elegir(n)}>
            {pct(n)}
          </button>
        ))}
        {queda !== null && queda > 0 && (
          <button type="button" className="atajo" aria-pressed={pb === queda} onClick={() => elegir(queda)}>
            Todo lo que queda · {pct(queda)}
          </button>
        )}
        <input
          className={`entrada otro${otroMal ? " mal" : ""}`}
          value={otro}
          placeholder="otro"
          inputMode="decimal"
          aria-label={`Otro porcentaje de ${l.visible}`}
          onChange={(e) => setOtro(e.target.value)}
          onBlur={() => {
            if (!otro.trim()) return;
            const n = pbDeTexto(otro);
            if (n === null) { setOtroMal(true); return; }
            elegir(n);
            setOtro("");
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </span>
      {otroMal && <span className="nota-linea">Escribí un porcentaje entre 0,01 y 100.</span>}
    </span>
  );
}

/** «Total | Al mes» y de dónde sale el precio: «75 % de $ 800.000 al mes»,
 *  «2 × $ 130.000», «× 3 meses = $ 2.400.000». Si se escribió a mano, lo dice
 *  y ofrece volver a la tarifa. */
export function PrecioDeLinea({ l, c }: { l: LineaDelContrato; c: Contrato }) {
  const editado = c.tocado(l.clave) && l.ref !== null && l.numero !== l.ref;
  const origen = l.modo === "mensual"
    ? (c.nMeses > 0 ? `al mes × ${c.textoDeMeses(c.nMeses)} = ${money(l.monto)}` : "al mes")
    : l.tipo === "pc"
    ? (l.tarifaCara !== null ? `${pct(l.pb)} de ${money(l.tarifaCara)} al mes` : "sin tarifa de referencia")
    : l.tipo === "partes" && l.refUnidad !== null && l.items.length > 1 && l.items.every((i) => i.ref === l.refUnidad)
    ? `${l.items.length} × ${money(l.refUnidad)}`
    : l.ref !== null
    ? `tarifa ${money(l.ref)} al mes`
    : "sin tarifa de referencia";
  return (
    <span className="precio-fila">
      <span className="seg seg-chico" role="group" aria-label={`Cómo se escribe el precio de ${l.visible}`}>
        {(["total", "mensual"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={l.modo === m} onClick={() => c.cambiarModo(l.clave, m)}>
            {m === "total" ? "Total" : "Al mes"}
          </button>
        ))}
      </span>
      <span className="origen">
        {editado ? <Pencil {...ICONO} size={12} /> : <Tag {...ICONO} size={12} />}
        {origen}
      </span>
      {editado && l.modo === "total" && (
        <button type="button" className="enlace" onClick={() => c.volverALaTarifa(l.clave, l.ref!)}>
          Volver a la tarifa
        </button>
      )}
    </span>
  );
}

/** El 409 de una línea: no se guardó nada, y qué se puede hacer. */
export function RechazoDeLinea({ l, c, onCambiarFechas }: {
  l: LineaDelContrato; c: Contrato; onCambiarFechas: () => void;
}) {
  if (!l.rechazo) return null;
  const t = textoDelRechazo(l.rechazo, l.tipo === "pc" ? l.pb : null);
  const queda = l.rechazo.queda_pb;
  return (
    <span className="aviso-error" role="alert" data-rechazo>
      <TriangleAlert {...ICONO} />
      <span className="txt">
        <b>{t.titulo}</b>
        <span>{t.detalle ? `${t.detalle} ` : ""}No se guardó nada.</span>
        <span className="botones">
          {l.tipo === "pc" && l.rechazo.code === "capacidad_excedida" && typeof queda === "number" && queda > 0 && (
            <button type="button" className="btn3" onClick={() => c.escribirPorcentaje(l.codigoCara, queda)}>
              Bajar a {pct(queda)}
            </button>
          )}
          <button type="button" className="btn3" onClick={onCambiarFechas}>Cambiar fechas</button>
        </span>
      </span>
    </span>
  );
}

/** Lo que una línea de porcentaje dice ANTES de guardar si ya no entra en las
 *  fechas escritas («Ya no entra el 75 %: desde el 3 nov queda 70 %»). */
export function textoDeNoEntra(l: LineaDelContrato): string {
  return `Ya no entra el ${pct(l.pb)}: ${l.quedaDesde ? `desde el ${diaCorto(l.quedaDesde)} ` : ""}queda ${pct(l.quedaPb ?? 0)}.`;
}
