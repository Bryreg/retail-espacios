import { useMemo, useState } from "react";
import {
  cambiarModeloPropio, crearModeloPropio, reactivarModeloPropio, retirarModeloPropio,
} from "../../api/muebles";
import { CATALOGO_DE_MUEBLES, nombreDeModelo, type Confiabilidad } from "../../catalogo/catalogo";
import type { ModeloPropio } from "../../catalogo/propias";
import type { ProblemaDeFicha } from "../../catalogo/fichas";
import { recargarFichasPropias, useFichasPropias } from "../../store/fichasPropias";
import {
  CAMPO_DEL_FORMULARIO, FAMILIAS_DEL_FORMULARIO, claveDeNombre, familiaDe, formularioDe, formularioVacio,
  guardarFicha, problemasDelFormulario, problemasDelServidor, retirarOReactivarFicha, rotuloDeTarifa,
  type FormularioDeFicha,
} from "../../utils/formularioDeFicha";
import { entrepanosQueEntran, TIPOS_CON_GEOMETRIA } from "../../utils/geometriaDelMueble";
import { useFixtureStore } from "../../store/fixtureStore";
import { conNombrePropio } from "../../catalogo/nombresPropios";
import { comoSeVendeCorto } from "../../utils/partes";

/**
 * La pestaña «Fichas» del taller: la dueña arma la ficha de un mueble suyo
 * que el catálogo no tiene —la nevera de dos puertas de su proveedor, la
 * góndola de pared de 1,70 que hay en su tienda— y desde ese momento aparece
 * en la paleta del plano y del Editor 3D, debajo de su familia. Sin pedirnos
 * un cambio y sin foto: familia, nombre, medidas, la geometría de su familia,
 * la tarifa y de dónde salieron los datos.
 *
 * El formulario es de la página (`TallerMuebles`), que dibuja al lado el
 * mueble con esta ficha mientras se escribe. Lo que se valida y cómo se le
 * dice a la dueña lo que no pasa está en `utils/formularioDeFicha.ts` (puro,
 * probado); acá sólo se muestra.
 */

const CONFIABILIDAD: { valor: Confiabilidad; rotulo: string }[] = [
  { valor: "ficha", rotulo: "Ficha técnica: la página trae las medidas" },
  { valor: "catalogo", rotulo: "Catálogo: salen del título o de un listado" },
  { valor: "estimado", rotulo: "Estimado: medido a ojo o deducido (lleva «≈»)" },
];

const cmTexto = (m: number) => String(Math.round(m * 1000) / 10).replace(".", ",");
const rangoCm = (r: [number, number]) => `de ${cmTexto(r[0])} a ${cmTexto(r[1])} cm`;
const NOMBRE_DE_TIPO = (tipo: string, variante?: string) =>
  FAMILIAS_DEL_FORMULARIO.find((f) => f.tipo === tipo && f.variante === variante)?.rotulo ?? tipo;

const estilo = {
  seccion: { padding: "12px 14px", borderBottom: "1px solid var(--line)" } as React.CSSProperties,
  titulo: { fontSize: 12, fontWeight: 700, color: "var(--ink-1)", margin: "0 0 6px" } as React.CSSProperties,
  etiqueta: { display: "block", fontSize: 11.5, color: "var(--ink-2)", marginTop: 8 } as React.CSSProperties,
  ayuda: { fontSize: 10.5, color: "var(--ink-4)", marginLeft: 4 } as React.CSSProperties,
  campo: {
    width: "100%", boxSizing: "border-box", height: 28, padding: "0 8px", marginTop: 3, borderRadius: 6,
    // Sin el atajo `border`: el campo con problema cambia sólo el color.
    borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-1)",
    fontSize: 12.5, fontFamily: "inherit",
  } as React.CSSProperties,
  mal: { fontSize: 11, color: "var(--danger)", margin: "3px 0 0" } as React.CSSProperties,
  boton: {
    height: 28, padding: "0 12px", borderRadius: 6, border: "1px solid var(--line)",
    background: "var(--surface-2)", color: "var(--ink-1)", fontSize: 12, fontFamily: "inherit", cursor: "pointer",
  } as React.CSSProperties,
};

export function PanelDeFichas({
  form, onForm, editando, onEditando,
}: {
  form: FormularioDeFicha;
  onForm: (f: FormularioDeFicha) => void;
  /** La clave de la ficha que se está editando, o `null` si es una nueva. */
  editando: string | null;
  onEditando: (clave: string | null) => void;
}) {
  const propias = useFichasPropias();
  // La familia como le dicen acá, delante de la de RECABRA («mamut — Estiba»).
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const vigentes = useMemo(() => propias.filter((m) => !m.retirado), [propias]);
  const retiradas = useMemo(() => propias.filter((m) => m.retirado), [propias]);
  const [delServidor, setDelServidor] = useState<ProblemaDeFicha[]>([]);
  const [intento, setIntento] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const familia = familiaDe(form.entrada);
  const nueva = editando === null;
  const problemas = useMemo(() => problemasDelFormulario(form, { nueva }), [form, nueva]);
  /** Los problemas de un campo del formulario: los de la validación, cuando
   *  ya se lo tocó o se intentó guardar, y los que dijo el servidor. */
  const de = (campo: keyof FormularioDeFicha) => [
    ...(intento || tocados.has(campo) ? problemas : []),
    ...delServidor,
  ].filter((p) => (CAMPO_DEL_FORMULARIO[p.campo] ?? null) === campo).map((p) => p.problema);
  const generales = delServidor.filter((p) => !CAMPO_DEL_FORMULARIO[p.campo]).map((p) => p.problema);

  const cambiar = (campo: keyof FormularioDeFicha, valor: string) => {
    const f = { ...form, [campo]: valor } as FormularioDeFicha;
    if (campo === "nombre" && nueva && !form.claveTocada) f.clave = claveDeNombre(valor);
    if (campo === "clave") f.claveTocada = true;
    setTocados((t) => new Set(t).add(campo));
    setDelServidor((p) => p.filter((x) => CAMPO_DEL_FORMULARIO[x.campo] !== campo));
    setAviso(null);
    onForm(f);
  };

  const empezarDeNuevo = (entrada = form.entrada) => {
    onEditando(null);
    onForm(formularioVacio(entrada));
    setIntento(false); setTocados(new Set()); setDelServidor([]);
  };

  const editar = (m: ModeloPropio) => {
    onEditando(m.clave);
    onForm(formularioDe(m));
    setIntento(false); setTocados(new Set()); setDelServidor([]); setAviso(null);
  };

  const guardar = async () => {
    setIntento(true);
    setAviso(null);
    setGuardando(true);
    try {
      const r = await guardarFicha(form, editando, { crear: crearModeloPropio, cambiar: cambiarModeloPropio });
      if (!r.ok) {
        // Los del formulario ya se ven en cada campo; los del servidor, también.
        setDelServidor(problemasDelFormulario(form, { nueva }).length ? [] : r.problemas);
        return;
      }
      await recargarFichasPropias();
      setAviso(nueva
        ? `Guardada: «${r.ficha.nombre}». Ya está en la paleta del plano y del Editor 3D, debajo de su familia.`
        : `Cambios guardados en «${r.ficha.nombre}». Los muebles ya colocados con esta ficha no cambian.`);
      if (nueva) empezarDeNuevo(form.entrada);
      else { setIntento(false); setTocados(new Set()); setDelServidor([]); }
    } finally {
      setGuardando(false);
    }
  };

  const retirarOReactivar = async (m: ModeloPropio) => {
    if (!m.retirado && !window.confirm(
      `¿Retirar «${m.nombre}»?\n\nDeja de ofrecerse en la paleta. Los muebles ya colocados con esta ficha siguen igual, con sus medidas y su tarifa.`,
    )) return;
    try {
      setAviso(await retirarOReactivarFicha(
        m, { retirar: retirarModeloPropio, reactivar: reactivarModeloPropio }, recargarFichasPropias));
    } catch (err) {
      setAviso(problemasDelServidor(err).map((p) => p.problema).join(" "));
    }
  };

  const Problemas = ({ campo }: { campo: keyof FormularioDeFicha }) => (
    <>{de(campo).map((p, i) => <p key={i} style={estilo.mal} data-problema={campo}>{p}</p>)}</>
  );
  const borde = (campo: keyof FormularioDeFicha) => (de(campo).length
    ? { ...estilo.campo, borderColor: "var(--danger)" } : estilo.campo);

  const altoM = Number(form.altoCm.replace(",", ".")) / 100;
  const caben = familia && TIPOS_CON_GEOMETRIA.has(familia.tipo) && Number.isFinite(altoM) && altoM > 0
    ? entrepanosQueEntran(familia.tipo, altoM) : undefined;

  const Fila = ({ m }: { m: ModeloPropio }) => (
    <li data-ficha-propia={m.clave}
      style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--ink-1)", fontWeight: editando === m.clave ? 700 : 500 }}>
          {nombreDeModelo({ ...m, retirado: false })}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          {NOMBRE_DE_TIPO(m.tipo, m.variante)} · {cmTexto(m.w)} × {cmTexto(m.d)} × {cmTexto(m.h)} cm
          {m.partes?.puertas != null ? ` · ${m.partes.puertas} ${m.partes.puertas === 1 ? "puerta" : "puertas"}` : ""}
          {m.partes?.tramos != null ? ` · ${m.partes.tramos} tramos` : ""}
          {m.entrepanos !== undefined ? ` · ${m.entrepanos} entrepaños` : ""}
          {/* Cómo se vende (las partes y las piezas), como lo dice la paleta. */}
          {comoSeVendeCorto(m).comoSeVende ? ` · ${comoSeVendeCorto(m).comoSeVende}` : ""}
          {m.tarifa ? ` · tarifa ${rotuloDeTarifa(m.tarifa)}` : ""}
        </div>
      </div>
      <button type="button" style={estilo.boton} onClick={() => editar(m)}>Editar</button>
      <button type="button" style={estilo.boton} data-retirar={m.clave} onClick={() => void retirarOReactivar(m)}>
        {m.retirado ? "Reactivar" : "Retirar"}
      </button>
    </li>
  );

  return (
    <div data-panel-fichas style={{ width: 380, flexShrink: 0, overflowY: "auto", borderRight: "1px solid var(--line)", background: "var(--surface)" }}>
      <div style={estilo.seccion}>
        <p style={estilo.titulo}>Fichas de tus muebles</p>
        <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: 0, lineHeight: 1.45 }}>
          Armá la ficha de un mueble que el catálogo no tiene. Queda en la paleta del plano y del Editor 3D,
          debajo de su familia. Sin foto: sólo las medidas y de dónde salieron.
        </p>
      </div>

      <form style={estilo.seccion} onSubmit={(e) => { e.preventDefault(); void guardar(); }} data-formulario-ficha>
        <p style={estilo.titulo}>{nueva ? "Ficha nueva" : `Editando «${form.nombre || editando}»`}</p>

        <label style={estilo.etiqueta}>
          Familia{!nueva && <span style={estilo.ayuda}>no cambia: retirala y armá otra</span>}
          <select value={form.entrada} disabled={!nueva} style={borde("entrada")} data-campo="entrada"
            onChange={(e) => { onForm({ ...formularioVacio(e.target.value), nombre: form.nombre, clave: form.clave, claveTocada: form.claveTocada, url: form.url, nota: form.nota, confiabilidad: form.confiabilidad }); setDelServidor([]); }}>
            {FAMILIAS_DEL_FORMULARIO.map((f) => {
              const propio = conNombrePropio({ type: f.tipo, gondolaType: f.variante }, nombresPropios, "");
              return <option key={f.entrada} value={f.entrada}>{propio ? `${propio} — ${f.rotulo}` : f.rotulo}</option>;
            })}
          </select>
        </label>
        <Problemas campo="entrada" />

        <label style={estilo.etiqueta}>
          Nombre
          <input value={form.nombre} maxLength={CATALOGO_DE_MUEBLES.fichas.largoMaximo.nombre} style={borde("nombre")}
            data-campo="nombre" placeholder="Nevera Inducol 2 puertas" onChange={(e) => cambiar("nombre", e.target.value)} />
        </label>
        <Problemas campo="nombre" />

        <label style={estilo.etiqueta}>
          Clave<span style={estilo.ayuda}>es lo que guarda el plano: no cambia nunca</span>
          <input value={form.clave} disabled={!nueva} style={borde("clave")} data-campo="clave"
            onChange={(e) => cambiar("clave", e.target.value)} />
        </label>
        <Problemas campo="clave" />

        {familia && (
          <>
            <p style={{ ...estilo.titulo, marginTop: 14 }}>Medidas, en centímetros</p>
            {([
              ["anchoCm", familia.tipo === "gondola" ? "Ancho de un módulo" : "Ancho", familia.rango.w],
              ["fondoCm", "Fondo", familia.rango.d],
              ["altoCm", "Alto", familia.rango.h],
            ] as const).map(([campo, rotulo, r]) => (
              <div key={campo}>
                <label style={estilo.etiqueta}>
                  {rotulo}<span style={estilo.ayuda}>{rangoCm(r)}</span>
                  <input inputMode="decimal" value={form[campo]} style={borde(campo)} data-campo={campo}
                    onChange={(e) => cambiar(campo, e.target.value)} />
                </label>
                <Problemas campo={campo} />
              </div>
            ))}

            {(familia.geometria.entrepanos || familia.geometria.modulo || familia.geometria.puertas
              || (familia.geometria.tramos && !familia.seCuentanEnElPlano.includes("tramos"))) && (
              <p style={{ ...estilo.titulo, marginTop: 14 }}>Cómo es por dentro</p>
            )}
            {familia.geometria.puertas && (
              <>
                <label style={estilo.etiqueta}>
                  Puertas<span style={estilo.ayuda}>de {familia.geometria.puertas[0]} a {familia.geometria.puertas[1]}; vacío: las que salen del ancho</span>
                  <input inputMode="numeric" value={form.puertas} style={borde("puertas")} data-campo="puertas"
                    onChange={(e) => cambiar("puertas", e.target.value)} />
                </label>
                <Problemas campo="puertas" />
              </>
            )}
            {familia.geometria.tramos && !familia.seCuentanEnElPlano.includes("tramos") && (
              <>
                <label style={estilo.etiqueta}>
                  Tramos<span style={estilo.ayuda}>de {familia.geometria.tramos[0]} a {familia.geometria.tramos[1]}; un montante entre tramo y tramo; vacío: el frente corrido</span>
                  <input inputMode="numeric" value={form.tramos} style={borde("tramos")} data-campo="tramos"
                    onChange={(e) => cambiar("tramos", e.target.value)} />
                </label>
                <Problemas campo="tramos" />
              </>
            )}
            {familia.geometria.entrepanos && (
              <>
                <label style={estilo.etiqueta}>
                  Entrepaños por cara, sin la base
                  <span style={estilo.ayuda}>
                    de {familia.geometria.entrepanos[0]} a {Math.min(familia.geometria.entrepanos[1], caben ?? Infinity)}
                    {caben !== undefined && caben < familia.geometria.entrepanos[1] ? " con este alto" : ""}; vacío: la cuenta de siempre
                  </span>
                  <input inputMode="numeric" value={form.entrepanos} style={borde("entrepanos")} data-campo="entrepanos"
                    onChange={(e) => cambiar("entrepanos", e.target.value)} />
                </label>
                <Problemas campo="entrepanos" />
              </>
            )}
            {familia.geometria.modulo && (
              <>
                <label style={estilo.etiqueta}>
                  Módulo<span style={estilo.ayuda}>{rangoCm(familia.geometria.modulo)}; vacío: 125</span>
                  <input inputMode="decimal" value={form.moduloCm} style={borde("moduloCm")} data-campo="moduloCm"
                    onChange={(e) => cambiar("moduloCm", e.target.value)} />
                </label>
                <Problemas campo="moduloCm" />
              </>
            )}

            {/* Vender por partes: cómo se vende lo que se coloque desde esta
                ficha. Lo ya colocado no cambia (se cambia en el panel del plano). */}
            {familia.divisiones.length > 0 && (
              <>
                <p style={{ ...estilo.titulo, marginTop: 14 }}>Cómo se vende</p>
                <label style={estilo.etiqueta}>
                  Entero o por partes
                  <span style={estilo.ayuda}>
                    la cara entera siempre se vende; nunca en las mismas fechas que sus partes
                  </span>
                  <select value={form.division} style={borde("division")} data-campo="division"
                    onChange={(e) => cambiar("division", e.target.value)}>
                    <option value="">Entero, como siempre</option>
                    {familia.divisiones.map((d) => {
                      const c = CATALOGO_DE_MUEBLES.partes.clases[d];
                      return <option key={d} value={d}>Entero o por {c?.plural ?? d}</option>;
                    })}
                  </select>
                </label>
                {form.division === "entrepanos" && (
                  <p style={estilo.ayuda} data-ayuda-division>
                    Se venden la base y los entrepaños de arriba (con 4 entrepaños, 5 partes: el EN1 es la base). La ficha
                    tiene que decir cuántos entrepaños.
                  </p>
                )}
                {form.division === "tramos" && familia.seCuentanEnElPlano.includes("tramos") && (
                  <p style={estilo.ayuda} data-ayuda-division>
                    Un tramo por módulo del corrido: cuántos, depende de cuánto se estire en el plano. Se fijan en el
                    panel del plano («Cómo se vende»); hasta entonces se vende entera.
                  </p>
                )}
                {form.division && form.division !== "entrepanos" && !familia.seCuentanEnElPlano.includes(form.division) && (
                  <p style={estilo.ayuda} data-ayuda-division>
                    Se cuentan de izquierda a derecha mirando el frente; la ficha tiene que decir cuántas (2 o más).
                  </p>
                )}
                <Problemas campo="division" />
                {form.division && (
                  <p style={estilo.ayuda} data-ayuda-numeradas>
                    En el mueble de la derecha, cada parte con el número que va a tener en Vender. Lo ya colocado no
                    cambia: en su panel del plano aparece «Usar lo de la ficha».
                  </p>
                )}
              </>
            )}

            {/* Las piezas de lo que nunca se vende entero: las bahías de
                impulso de una caja y el forro de una columna. Lo que se coloque
                desde esta ficha ya viene configurado para venderlas. */}
            {familia.piezas.length > 0 && (
              <>
                <p style={{ ...estilo.titulo, marginTop: 14 }}>Cómo se vende</p>
                {familia.geometria.bahias && (
                  <>
                    <label style={estilo.etiqueta}>
                      Bahías de impulso que se venden
                      <span style={estilo.ayuda}>
                        de {familia.geometria.bahias[0]} a {familia.geometria.bahias[1]}, del lado del cliente; la caja no se
                        vende entera; vacío: ninguna
                      </span>
                      <input inputMode="numeric" value={form.bahias} style={borde("bahias")} data-campo="bahias"
                        onChange={(e) => cambiar("bahias", e.target.value)} />
                    </label>
                    <Problemas campo="bahias" />
                  </>
                )}
                {familia.piezas.includes("forro") && (
                  <>
                    <label style={{ ...estilo.etiqueta, display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={form.forro === "si"} data-campo="forro"
                        onChange={(e) => cambiar("forro", e.target.checked ? "si" : "")} />
                      El forro se vende
                      <span style={estilo.ayuda}>la columna no se vende; su forro, sí</span>
                    </label>
                    <Problemas campo="forro" />
                  </>
                )}
                {(form.bahias.trim() || form.forro === "si") && (
                  <p style={estilo.ayuda} data-ayuda-numeradas>
                    En el mueble de la derecha, cada pieza con el número que va a tener en Vender. Lo ya colocado no
                    cambia: en su panel del plano aparece «Usar lo de la ficha».
                  </p>
                )}
              </>
            )}

            <label style={{ ...estilo.etiqueta, marginTop: 14 }}>
              Tarifa{!nueva && <span style={estilo.ayuda}>no cambia: lo colocado la busca por la clave</span>}
              <select value={form.tarifa} disabled={!nueva} style={borde("tarifa")} data-campo="tarifa"
                onChange={(e) => cambiar("tarifa", e.target.value)}>
                <option value="">La de su familia{familia.tarifa ? ` (${rotuloDeTarifa(familia.tarifa)})` : ""}</option>
                {familia.tarifasPropias.map((t) => <option key={t} value={t}>{rotuloDeTarifa(t)}</option>)}
              </select>
            </label>
            <Problemas campo="tarifa" />
          </>
        )}

        <p style={{ ...estilo.titulo, marginTop: 14 }}>De dónde salió</p>
        <label style={estilo.etiqueta}>
          URL de la ficha técnica<span style={estilo.ayuda}>la página, no una foto</span>
          <input value={form.url} type="url" maxLength={CATALOGO_DE_MUEBLES.fichas.largoMaximo.url} style={borde("url")}
            data-campo="url" placeholder="https://…" onChange={(e) => cambiar("url", e.target.value)} />
        </label>
        <Problemas campo="url" />
        <label style={estilo.etiqueta}>
          Nota, con tus palabras<span style={estilo.ayuda}>{form.nota.length}/{CATALOGO_DE_MUEBLES.fichas.largoMaximo.nota}</span>
          <textarea value={form.nota} rows={3} maxLength={CATALOGO_DE_MUEBLES.fichas.largoMaximo.nota}
            style={{ ...borde("nota"), height: "auto", padding: "6px 8px" }} data-campo="nota"
            placeholder="Medida en la tienda con metro; las puertas de la ficha del fabricante."
            onChange={(e) => cambiar("nota", e.target.value)} />
        </label>
        <Problemas campo="nota" />
        <label style={estilo.etiqueta}>
          Cuánto confiar en las medidas
          <select value={form.confiabilidad} style={borde("confiabilidad")} data-campo="confiabilidad"
            onChange={(e) => cambiar("confiabilidad", e.target.value)}>
            <option value="">— elegí —</option>
            {CONFIABILIDAD.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
        </label>
        <Problemas campo="confiabilidad" />

        {generales.map((p, i) => <p key={i} style={{ ...estilo.mal, marginTop: 10 }} data-problema="ficha">{p}</p>)}
        {intento && problemas.length > 0 && (
          <p style={{ ...estilo.mal, marginTop: 10 }} data-faltan>
            Hay {problemas.length === 1 ? "un dato" : `${problemas.length} datos`} para corregir antes de guardar.
          </p>
        )}
        {aviso && <p style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 10 }} data-aviso-ficha>{aviso}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={guardando} data-guardar-ficha
            style={{ ...estilo.boton, background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
            {guardando ? "Guardando…" : nueva ? "Guardar ficha" : "Guardar cambios"}
          </button>
          <button type="button" style={estilo.boton} onClick={() => { empezarDeNuevo(); setAviso(null); }}>
            {nueva ? "Empezar de nuevo" : "Cancelar"}
          </button>
        </div>
      </form>

      <div style={estilo.seccion} data-lista-fichas>
        <p style={estilo.titulo}>Tus fichas ({vigentes.length})</p>
        {vigentes.length === 0 ? (
          // Con todas retiradas sí armó alguna: «todavía no armaste ninguna»
          // le decía que la que acababa de retirar no existía.
          <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: 0 }}>
            {retiradas.length > 0 ? "Ninguna vigente: las retiradas están acá abajo." : "Todavía no armaste ninguna."}
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{vigentes.map((m) => <Fila key={m.clave} m={m} />)}</ul>
        )}
        {retiradas.length > 0 && (
          <details style={{ marginTop: 10 }} data-retiradas>
            <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--ink-3)" }}>
              Retiradas ({retiradas.length}): no se ofrecen en la paleta; lo ya colocado sigue igual
            </summary>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{retiradas.map((m) => <Fila key={m.clave} m={m} />)}</ul>
          </details>
        )}
      </div>
    </div>
  );
}
