import { useMemo, useState } from "react";
import { daysTakenInRange, type UnifiedFixture } from "../../types/fixtures";
import type { SeasonOccurrence } from "../../types/seasons";

/**
 * «Cuándo se libera cada espacio» — la forma A·4.
 *
 * Una escalera sobre un eje de fechas proporcional, a todo el ancho del panel.
 * Contesta la pregunta con la que se negocia una fecha de inicio: no cuántos
 * espacios hay libres, sino CUÁNDO deja de ser cierto ese número.
 *
 * Cuatro decisiones que conviene no deshacer —salieron de medir la maqueta, no
 * de opinar sobre ella—:
 *
 *   · **A todo el ancho.** Un chip de código mide 56 px. Si el panel se
 *     angosta hasta que dos fechas de entrega quedan a menos de eso, los
 *     códigos se pisan; por eso el componente los apila en columnas y suelta
 *     los que no entran, en vez de dibujarlos encimados.
 *   · **Sin eje vertical.** El rango típico va de 15 a 20: una escala completa
 *     sería adorno. Cada tramo lleva su cifra escrita en la punta.
 *   · **Peine de días.** Un diente por día bajo el eje. Sin él, el tramo plano
 *     se lee como espacio sobrante en vez de como tiempo que pasa —que es
 *     justamente el dato: «no se mueve nada durante 25 días»—.
 *   · **El cursor escribe la lectura.** Sigue al mouse y dice «si arranca el
 *     26 de sep → 17 libres». Un gráfico que hay que interpretar con la vista
 *     puesta en dos ejes no se usa; uno que contesta en palabras, sí.
 *
 * La serie NO se asume monótona. En la maqueta sólo subía —los cinco contratos
 * vencían adentro de la ventana— pero un contrato que ARRANCA en el medio del
 * periodo baja la disponibilidad, y dibujar eso como una subida sería mentir
 * sobre inventario que ya está vendido. Se cuenta día por día.
 */

const ANCHO = 994;
const ALTO = 216;
const X0 = 8;
const X1 = 986;
const YE = 130;          // el eje de fechas
const ESCALA_MAX = 12;   // px por espacio libre
const CHIP_W = 56;
const CHIP_H = 20;

const MES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"];

const dm = (d: Date) => `${d.getDate()} ${MES[d.getMonth()]}`;
const f = (v: number) => (Math.round(v * 10) / 10).toString();

/** Una cara que cambia de mano en una fecha: entra al inventario o sale. */
interface Cambio {
  code: string;
  tipo: string;
  /** `entra` = se libera. `sale` = un contrato arranca y deja de estar libre. */
  sentido: "entra" | "sale";
}

export interface LiberaProps {
  fixtures: UnifiedFixture[];
  /** Las caras comercializables de un mueble, con su código y sus fechas. */
  facesOf: (f: UnifiedFixture) => {
    fixture: UnifiedFixture; face: "A" | "B"; code: string;
    status: UnifiedFixture["status"]; startDate: string; endDate: string;
  }[];
  /** Cómo se llama el TIPO de esa cara —«Punta de góndola»—, para el pie.
   *  El nombre propio del mueble («Punta 03») ya está en el chip del código. */
  tipoDe: (f: UnifiedFixture) => string;
  desde: Date;
  hasta: Date;
  /** Las temporadas comerciales que pisan el periodo, para el fondo. */
  temporadas?: SeasonOccurrence[];
}

export default function Libera({ fixtures, facesOf, tipoDe, desde, hasta, temporadas = [] }: LiberaProps) {
  const [cursor, setCursor] = useState<number | null>(null);

  const datos = useMemo(() => {
    const dia = 86400000;
    const d0 = new Date(desde); d0.setHours(0, 0, 0, 0);
    const d1 = new Date(hasta); d1.setHours(0, 0, 0, 0);
    const dias = Math.max(0, Math.round((d1.getTime() - d0.getTime()) / dia));
    const fecha = (i: number) => new Date(d0.getTime() + i * dia);

    const caras = fixtures.flatMap(facesOf);
    // Libre día por día. Un rango de un solo día en `daysTakenInRange` contesta
    // exactamente «¿está tomada esa fecha?», que es la pregunta acá, y usa la
    // MISMA cuenta que pinta el plano: los dos números no pueden discrepar.
    const librePorDia: boolean[][] = caras.map((c) => {
      const fila: boolean[] = [];
      for (let i = 0; i <= dias; i++) {
        const d = fecha(i);
        fila.push(daysTakenInRange(c, d, d) === 0);
      }
      return fila;
    });

    const serie: number[] = [];
    for (let i = 0; i <= dias; i++) {
      let n = 0;
      for (const fila of librePorDia) if (fila[i]) n++;
      serie.push(n);
    }

    // Los días en que la cuenta cambia, y qué caras la movieron.
    const cambios = new Map<number, Cambio[]>();
    librePorDia.forEach((fila, k) => {
      for (let i = 1; i <= dias; i++) {
        if (fila[i] === fila[i - 1]) continue;
        const lista = cambios.get(i) ?? [];
        lista.push({
          code: caras[k].code,
          tipo: tipoDe(caras[k].fixture),
          sentido: fila[i] ? "entra" : "sale",
        });
        cambios.set(i, lista);
      }
    });

    return { dias, fecha, serie, cambios: [...cambios].sort((a, b) => a[0] - b[0]) };
  }, [fixtures, facesOf, tipoDe, desde, hasta]);

  const { dias, fecha, serie, cambios } = datos;
  if (dias <= 0 || serie.length === 0) return null;

  const x = (i: number) => X0 + (i * (X1 - X0)) / dias;
  const minN = Math.min(...serie);
  const maxN = Math.max(...serie);
  // El alto disponible va del eje hasta debajo del rótulo de temporada. La
  // escala se achica sola cuando el rango de la serie es grande: sin esto, una
  // sede donde se liberan veinte caras se salía del panel por arriba.
  const escala = Math.min(ESCALA_MAX, 84 / Math.max(1, maxN - minN + 2));
  const y = (n: number) => YE - (n - minN + 2) * escala;

  // La escalera: horizontal hasta el cambio, vertical en el cambio.
  const pasos: [number, number][] = [];
  let previo = serie[0];
  pasos.push([x(0), y(previo)]);
  for (let i = 1; i <= dias; i++) {
    if (serie[i] === previo) continue;
    pasos.push([x(i), y(previo)]);
    pasos.push([x(i), y(serie[i])]);
    previo = serie[i];
  }
  pasos.push([x(dias), y(previo)]);
  const poli = (p: [number, number][]) => p.map(([a, b]) => `${f(a)},${f(b)}`).join(" ");

  // Qué fechas se ganan una columna de chips. Dos entregas a menos de 58 px
  // dibujarían los códigos uno encima del otro; la de más a la izquierda se
  // queda con la columna y la otra conserva su fecha bajo el eje.
  const columnas: { i: number; cambios: Cambio[] }[] = [];
  let ultimoX = -Infinity;
  for (const [i, lista] of cambios) {
    if (x(i) - ultimoX < CHIP_W + 2) continue;
    ultimoX = x(i);
    columnas.push({ i, cambios: lista });
  }

  const iCursor = cursor ?? (cambios[0]?.[0] ?? 0);
  const libresEn = serie[Math.max(0, Math.min(dias, iCursor))];

  // La lectura del cursor va centrada sobre él, pero sin salirse por ninguno de
  // los dos costados. El ancho se estima por la cantidad de caracteres: adentro
  // de un SVG no hay manera de medir texto antes de dibujarlo, y una estimación
  // por lo alto es más segura que un margen fijo —que es lo que había, y por eso
  // el rótulo del eje y la lectura se pisaban cuando el cursor caía a la
  // izquierda.
  const lectura = `si arranca el ${dm(fecha(iCursor))} → ${libresEn} libres`;
  const anchoLectura = lectura.length * 6.6;
  const xLectura = Math.max(anchoLectura / 2 + X0,
                            Math.min(X1 - anchoLectura / 2, x(iCursor)));
  const ROTULO_ANCHO = 236;   // «ESPACIOS LIBRES A LO LARGO DEL PERIODO» en 9.5
  const pisaElRotulo = xLectura - anchoLectura / 2 < X0 + ROTULO_ANCHO + 12;

  // El primer tramo plano: «sin cambios durante N días» es la mitad del valor
  // de este gráfico, y es lo único que no se ve mirando la escalera.
  const primerCambio = cambios[0]?.[0] ?? null;

  const tipos: [string, string][] = [];
  const vistos = new Set<string>();
  for (const [, lista] of cambios) {
    for (const c of lista) {
      const pre = c.code.split("-")[0];
      if (vistos.has(pre) || !c.tipo) continue;
      vistos.add(pre);
      tipos.push([pre, c.tipo]);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      style={{ width: "100%", height: "100%", display: "block" }}
      onMouseMove={(e) => {
        // De píxeles de pantalla a unidades del viewBox, con la matriz del SVG.
        //
        // Acá había una regla de tres contra el rectángulo del elemento
        // —`(clientX - caja.left) / caja.width * ANCHO`— y esa cuenta supone que
        // el viewBox llena la caja. No la llena: el `preserveAspectRatio` por
        // omisión es `xMidYMid meet`, que encaja el dibujo por el lado que le
        // queda corto y CENTRA lo que sobra. Este viewBox es de 4,6:1 y la caja
        // en una pantalla ancha es de 6,6:1, así que el dibujo entra por el alto
        // y quedan ~215 px en blanco de cada lado. La regla de tres los cuenta
        // como si fueran gráfico: el cursor salía corrido hacia adentro, cada
        // vez más lejos del mouse cuanto más cerca del borde.
        //
        // `getScreenCTM()` es la transformación real que aplicó el navegador,
        // con el encaje y el centrado adentro. Invertida, lleva el punto del
        // mouse a la coordenada del dibujo, ande donde ande la caja.
        const m = e.currentTarget.getScreenCTM();
        if (!m) return;
        const px = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
        const i = Math.round(((px - X0) / (X1 - X0)) * dias);
        setCursor(Math.max(0, Math.min(dias, i)));
      }}
      onMouseLeave={() => setCursor(null)}
    >
      {/* El rótulo del eje y la lectura del cursor comparten este renglón, y
          cuando el cursor está a la izquierda se pisan. Manda la lectura: es la
          respuesta, y el rótulo dice lo que el gráfico ya está mostrando. */}
      {!pisaElRotulo && (
        <text x={f(X0)} y="17" style={rot}>Espacios libres a lo largo del periodo</text>
      )}

      {/* La temporada, detrás: explica por qué varias entregas caen juntas. */}
      {temporadas.map((t) => {
        const a = Math.max(0, Math.round((t.from.getTime() - fecha(0).getTime()) / 86400000));
        const b = Math.min(dias, Math.round((t.to.getTime() - fecha(0).getTime()) / 86400000));
        if (b <= a) return null;
        return (
          <g key={t.label}>
            <rect x={f(x(a))} y="30" width={f(x(b) - x(a))} height={f(YE - 30)} fill="#F1F5F4" />
            <text x={f((x(a) + x(b)) / 2)} y="41" style={temp}>{t.label.toUpperCase()}</text>
          </g>
        );
      })}

      <polygon points={poli([[X0, YE], ...pasos, [X1, YE]])} fill="#E3F1ED" />
      <line x1={f(X0)} y1={f(YE)} x2={f(X1)} y2={f(YE)} stroke="#C7CED0" strokeWidth="1" />

      {/* Peine: un diente por día, más largo cada cinco. */}
      {Array.from({ length: dias + 1 }, (_, i) => (
        <line
          key={i}
          x1={f(x(i))} y1={f(YE)} x2={f(x(i))} y2={f(YE + (i % 5 === 0 || i === dias ? 5 : 2.5))}
          stroke="#C7CED0" strokeWidth="1"
        />
      ))}

      <polyline
        points={poli(pasos)}
        fill="none" stroke="var(--libre)" strokeWidth="2.4"
        strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={f(x(0))} cy={f(y(serie[0]))} r="3.4" fill="var(--libre)" />
      {cambios.map(([i]) => (
        <circle key={i} cx={f(x(i))} cy={f(y(serie[i]))} r="3.4" fill="var(--libre)" />
      ))}

      {/* La cifra de cada tramo, en vez de un eje vertical. Arranca donde
          arranca su tramo —no en el medio de la meseta— para quedar pegada a
          su escalón y no chocar con el anillo del cursor. */}
      <text x={f(X0 + 2)} y={f(y(serie[0]) - 10)} style={num}>{serie[0]}</text>
      {primerCambio !== null && primerCambio > 1 && (
        <text x={f(X0 + 34)} y={f(y(serie[0]) - 10)} style={nota}>
          sin cambios durante {primerCambio} días
        </text>
      )}
      {cambios.map(([i]) => (
        <text key={i} x={f(x(i) + 7)} y={f(y(serie[i]) - 11)} style={num}>{serie[i]}</text>
      ))}

      {/* El cursor: la respuesta escrita. */}
      <line x1={f(x(iCursor))} y1="26" x2={f(x(iCursor))} y2={f(YE)} stroke="#14181C" strokeWidth="1.2" />
      <circle
        data-cursor cx={f(x(iCursor))} cy={f(y(libresEn))}
        r="6" fill="none" stroke="#14181C" strokeWidth="2"
      />
      <text x={f(xLectura)} y="17" style={cruzT} textAnchor="middle">
        {lectura}
      </text>

      {/* Las fechas y, debajo, los códigos que se mueven en cada una. */}
      <text x={f(X0)} y={f(YE + 22)} style={hoy}>hoy · {dm(fecha(0))}</text>
      {cambios.map(([i]) => (
        <text key={i} x={f(x(i))} y={f(YE + 22)} style={fechaT} textAnchor="middle">
          {dm(fecha(i))}
        </text>
      ))}
      {columnas.map(({ i, cambios: lista }) => {
        const cx = x(i);
        const visibles = lista.slice(0, 3);
        const sobran = lista.length - visibles.length;
        return (
          <g key={i}>
            {visibles.map((c, j) => (
              <g key={c.code}>
                <rect
                  x={f(cx - CHIP_W / 2)} y={f(YE + 32 + j * 24)}
                  width={CHIP_W} height={CHIP_H} rx="2.5"
                  fill={c.sentido === "entra" ? "var(--entra-suave)" : "var(--ocupado-suave)"}
                  stroke={c.sentido === "entra" ? "var(--entra-borde)" : "var(--ocupado-borde)"}
                  strokeWidth="1"
                />
                <text
                  x={f(cx)} y={f(YE + 46.5 + j * 24)} textAnchor="middle"
                  style={{ ...cod, fill: c.sentido === "entra" ? "var(--entra-txt)" : "var(--ocupado)" }}
                >
                  {c.code}
                </text>
              </g>
            ))}
            {sobran > 0 && (
              <text x={f(cx)} y={f(YE + 46.5 + visibles.length * 24)} textAnchor="middle" style={nota}>
                +{sobran}
              </text>
            )}
          </g>
        );
      })}
      {tipos.slice(0, 3).map(([pre, tipo], i) => (
        <text key={pre} x={f(X0)} y={f(YE + 46 + i * 16)} style={tipoT}>
          {pre} · {tipo.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}

// ─── Los siete tamaños, tal como se renderizan adentro del viewBox ───────────
// El SVG se escala con su caja, así que estos números NO son los píxeles
// finales: a 1024 px de ancho el factor es ~1.03 y quedan donde tienen que
// quedar. Si el panel se angosta mucho hay que subirlos, no achicar el gráfico.

const rot: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 9.5,
  letterSpacing: "0.11em", textTransform: "uppercase", fill: "var(--ink-3)",
};
const num: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 14.5, fill: "var(--libre)",
};
const nota: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--ink-3)" };
const hoy: React.CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 11, fill: "var(--ink-1)" };
const fechaT: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--ink-2)" };
const cruzT: React.CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 12, fill: "var(--ink-1)" };
const temp: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 9.5,
  letterSpacing: "0.1em", fill: "var(--ink-4)", textAnchor: "middle",
};
const cod: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, letterSpacing: "0.02em",
};
const tipoT: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 9.5,
  letterSpacing: "0.09em", textTransform: "uppercase", fill: "var(--ink-3)",
};
