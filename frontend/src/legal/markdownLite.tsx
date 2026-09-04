/**
 * Un renderizador de markdown MUY chico, a propósito.
 *
 * Los documentos legales (`politica-datos.md`, y el que venga después) los
 * escribe/edita un agente legal en markdown liso — tablas, encabezados,
 * negrita, blockquotes, listas, líneas horizontales — y este proyecto no
 * tiene ninguna librería de markdown instalada. Meter una dependencia nueva
 * para renderizar UN documento (dos, cuando se sume la guía RNBD si algún
 * día se muestra en pantalla) es más peso del que vale: esto cubre
 * exactamente el subconjunto que el documento usa, nada más.
 *
 * No es un parser de markdown general — no sabe de imágenes, enlaces,
 * código en bloque ni HTML embebido. Si el documento legal empieza a usar
 * algo de eso, este archivo es el que hay que ampliar.
 */
import type { ReactNode } from "react";

// ─── Inline: negrita y código ────────────────────────────────────────────

const PATRON_INLINE = /\*\*(.+?)\*\*|`(.+?)`/;

function inline(texto: string, key: string): ReactNode[] {
  const partes: ReactNode[] = [];
  let restante = texto;
  let i = 0;
  while (restante) {
    const m = PATRON_INLINE.exec(restante);
    if (!m) {
      partes.push(restante);
      break;
    }
    if (m.index > 0) partes.push(restante.slice(0, m.index));
    if (m[1] !== undefined) {
      partes.push(<strong key={`${key}-b${i++}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      partes.push(
        <code
          key={`${key}-c${i++}`}
          style={{
            fontFamily: "var(--font-mono)", fontSize: "0.92em",
            background: "var(--surface-2)", padding: "1px 4px", borderRadius: 3,
          }}
        >
          {m[2]}
        </code>
      );
    }
    restante = restante.slice(m.index + m[0].length);
  }
  return partes;
}

// ─── Tablas ───────────────────────────────────────────────────────────────

function esFilaDeTabla(linea: string): boolean {
  return linea.trim().startsWith("|");
}

function esSeparadorDeTabla(linea: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(linea.trim()) && linea.includes("-");
}

function celdas(linea: string): string[] {
  const sinPuntas = linea.trim().replace(/^\|/, "").replace(/\|$/, "");
  return sinPuntas.split("|").map((c) => c.trim());
}

function Tabla({ lineas, k }: { lineas: string[]; k: string }) {
  const encabezado = celdas(lineas[0]);
  const cuerpo = lineas.slice(esSeparadorDeTabla(lineas[1] ?? "") ? 2 : 1);
  return (
    <div style={{ overflowX: "auto", margin: "10px 0 16px" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
        <thead>
          <tr>
            {encabezado.map((c, i) => (
              <th
                key={`${k}-th-${i}`}
                style={{
                  textAlign: "left", padding: "6px 10px",
                  borderBottom: "2px solid var(--line-strong)",
                  color: "var(--ink-2)", fontWeight: 600,
                }}
              >
                {inline(c, `${k}-th-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cuerpo.map((fila, ri) => (
            <tr key={`${k}-tr-${ri}`}>
              {celdas(fila).map((c, ci) => (
                <td
                  key={`${k}-td-${ri}-${ci}`}
                  style={{
                    textAlign: "left", padding: "6px 10px",
                    borderBottom: "1px solid var(--line)",
                    color: "var(--ink-2)", verticalAlign: "top",
                  }}
                >
                  {inline(c, `${k}-td-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Listas ───────────────────────────────────────────────────────────────

const MARCA_ITEM = /^(-|\d+\.)\s+(.*)$/;

function Lista({ lineas, k }: { lineas: string[]; k: string }) {
  const ordenada = /^\d+\./.test(lineas[0].trim());
  const items: string[] = [];
  for (const linea of lineas) {
    const m = MARCA_ITEM.exec(linea.trim());
    if (m) {
      items.push(m[2]);
    } else if (items.length > 0) {
      // Línea de continuación: el markdown fuente se corta a mano cerca de
      // los 90 caracteres, así que el ítem sigue en la línea siguiente sin
      // marca propia.
      items[items.length - 1] += ` ${linea.trim()}`;
    }
  }
  const Tag = ordenada ? "ol" : "ul";
  return (
    <Tag style={{ margin: "8px 0 16px", paddingLeft: 22, color: "var(--ink-2)", lineHeight: 1.6 }}>
      {items.map((it, i) => (
        <li key={`${k}-li-${i}`} style={{ marginBottom: 4 }}>
          {inline(it, `${k}-li-${i}`)}
        </li>
      ))}
    </Tag>
  );
}

// ─── Bloques ──────────────────────────────────────────────────────────────

function Bloque({ texto, k }: { texto: string; k: string }) {
  const lineas = texto.split("\n");
  const primera = lineas[0].trim();

  if (/^-{3,}$/.test(primera) && lineas.length === 1) {
    return <hr key={k} style={{ border: "none", borderTop: "1px solid var(--line)", margin: "22px 0" }} />;
  }

  const encabezado = /^(#{1,4})\s+(.*)$/.exec(primera);
  if (encabezado) {
    const nivel = encabezado[1].length;
    const contenido = inline(encabezado[2], k);
    const estilos: Record<number, React.CSSProperties> = {
      1: { fontSize: 22, fontWeight: 700, margin: "28px 0 12px", color: "var(--ink-1)" },
      2: { fontSize: 18, fontWeight: 700, margin: "26px 0 10px", color: "var(--ink-1)", borderTop: "1px solid var(--line)", paddingTop: 20 },
      3: { fontSize: 15, fontWeight: 700, margin: "18px 0 8px", color: "var(--ink-1)" },
      4: { fontSize: 13.5, fontWeight: 700, margin: "14px 0 6px", color: "var(--ink-2)" },
    };
    const Tag = (`h${Math.min(nivel, 4)}` as unknown) as keyof JSX.IntrinsicElements;
    return <Tag key={k} style={estilos[nivel] ?? estilos[4]}>{contenido}</Tag>;
  }

  if (primera.startsWith(">")) {
    const texto2 = lineas.map((l) => l.trim().replace(/^>\s?/, "")).join(" ");
    return (
      <blockquote
        key={k}
        style={{
          margin: "12px 0", padding: "8px 14px",
          borderLeft: "3px solid var(--accent)",
          background: "var(--surface-2)",
          color: "var(--ink-2)", fontSize: 12.5, lineHeight: 1.6,
        }}
      >
        {inline(texto2, k)}
      </blockquote>
    );
  }

  if (esFilaDeTabla(primera)) {
    return <Tabla key={k} lineas={lineas} k={k} />;
  }

  if (MARCA_ITEM.test(primera)) {
    return <Lista key={k} lineas={lineas} k={k} />;
  }

  const texto2 = lineas.map((l) => l.trim()).join(" ");
  return (
    <p key={k} style={{ margin: "0 0 14px", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.7 }}>
      {inline(texto2, k)}
    </p>
  );
}

/** Renderiza un documento markdown "liso" (ver el docstring de arriba) como
 *  una lista de nodos React, uno por bloque separado por línea en blanco. */
export function renderMarkdownLite(md: string): ReactNode {
  const bloques = md
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <>
      {bloques.map((b, i) => (
        <Bloque key={i} texto={b} k={`b${i}`} />
      ))}
    </>
  );
}
