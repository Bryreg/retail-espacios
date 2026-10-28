import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { cambiarModeloPropio, crearModeloPropio } from "../../api/muebles";
import { CATALOGO_DE_MUEBLES, modelosDe } from "../../catalogo/catalogo";
import { paletaConPropias } from "../../catalogo/editor3D";
import type { ModeloPropio } from "../../catalogo/propias";
import type { ProblemaDeFicha } from "../../catalogo/fichas";
import { conNombrePropio } from "../../catalogo/nombresPropios";
import { recargarFichasPropias, useFichasPropias } from "../../store/fichasPropias";
import { useFixtureStore } from "../../store/fixtureStore";
import {
  CAMPO_DEL_FORMULARIO, CAMPOS_DEL_PASO, FAMILIAS_DEL_FORMULARIO, NOTA_DE_LA_TIENDA, ORIGENES,
  claveDeNombre, conOrigenCompleto, familiaDe, formularioDe, formularioDesdeModelo, formularioVacio,
  guardarFicha, pasoDeNumero, pasoDelProblema, problemasDelFormulario, rotuloDeTarifa,
  type FamiliaDeFicha, type FormularioDeFicha, type PasoDelAsistente,
} from "../../utils/formularioDeFicha";
import { entrepanosQueEntran, geometriaALaVista, TIPOS_CON_GEOMETRIA } from "../../utils/geometriaDelMueble";
import { puertasDeNevera } from "../StoreEditor3D/muebles/medidas";
import { comoSeVendeLaFicha, textoDeComoSeVende } from "../../utils/partes";
import { RetirarMueble } from "./RetirarMueble";
import { VistaDeLaFicha, dibujoDe, useDibujoDe, useFoto } from "./VistaDeLaFicha";
import { cmTexto, conMayuscula, medidasDe, nombreCortoDe, porDentroDe } from "./textos";

/**
 * El asistente de «Mis muebles» (2026-10-28): armar un mueble del
 * supermercado en tres pasos —qué mueble es, cuánto mide, y nombre y cómo se
 * vende— con el mueble dibujado en 3D a la derecha mientras se escribe.
 *
 * Reemplaza el formulario largo de la pestaña «Fichas» del taller. Las reglas
 * no cambiaron (`utils/formularioDeFicha.ts`, las mismas del servidor): cada
 * paso muestra y frena con lo suyo, y guardar las vuelve a correr todas; si
 * algo no pasa, vuelve al paso donde se corrige.
 *
 * Editar abre los mismos pasos. Lo que no cambia —la familia, la clave y la
 * tarifa: lo ya colocado las usa— va explicado en vez de en un campo apagado.
 */

const PASOS: { paso: PasoDelAsistente; titulo: string }[] = [
  { paso: 1, titulo: "Qué mueble es" },
  { paso: 2, titulo: "Medidas" },
  { paso: 3, titulo: "Nombre y venta" },
];

/** Un número del formulario, o `undefined` si no hay o no es número. */
const numeroDe = (t: string) => {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() && Number.isFinite(n) ? n : undefined;
};
const cmDe = (m: number) => Math.round(m * 1000) / 10;

export interface DesdeElPlano { sede: string }

export function AsistenteDeMueble({ editando, entradaInicial, desdePlano, onGuardado, onSalir, onVolverAlPlano, onRetirado }: {
  /** La ficha que se edita, o `null` para una nueva. */
  editando: ModeloPropio | null;
  entradaInicial?: string;
  /** Se vino de «Crear un mueble con otras medidas», en el plano. */
  desdePlano: DesdeElPlano | null;
  onGuardado: (ficha: ModeloPropio) => void;
  onSalir: () => void;
  onVolverAlPlano: () => void;
  onRetirado: (aviso: string) => void;
}) {
  const nueva = editando === null;
  const [form, setForm] = useState<FormularioDeFicha>(() => (editando
    ? formularioDe(editando)
    : formularioVacio(entradaInicial ?? FAMILIAS_DEL_FORMULARIO[0]?.entrada ?? "gondola:double")));
  /** Al editar se arranca en las medidas: la familia no cambia. */
  const [paso, setPaso] = useState<PasoDelAsistente>(nueva ? 1 : 2);
  /** Los pasos donde se pidió seguir (o guardar): ahí se muestran todos sus
   *  problemas, no sólo los de lo que ya se tocó. */
  const [intentados, setIntentados] = useState<ReadonlySet<PasoDelAsistente>>(new Set());
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [delServidor, setDelServidor] = useState<ProblemaDeFicha[]>([]);
  const [guardando, setGuardando] = useState(false);
  /** «Empezar desde»: el modelo de RECABRA del que salió, o `null` (la medida
   *  estándar). */
  const [desde, setDesde] = useState<string | null>(null);
  const [retirando, setRetirando] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const familia = familiaDe(form.entrada);
  const dibujo = useDibujoDe(form);
  // Sin elegir de dónde salieron las medidas, lo que falta es eso: «falta el
  // enlace o la nota» sería pedir lo de una opción que no se eligió.
  const problemas = useMemo(() => problemasDelFormulario(conOrigenCompleto(form), { nueva })
    .filter((p) => form.confiabilidad || !["url", "nota"].includes(CAMPO_DEL_FORMULARIO[p.campo] ?? "")), [form, nueva]);
  const delPaso = (p: PasoDelAsistente) => problemas.filter((x) => pasoDelProblema(x) === p);

  /** Los problemas a la vista de un campo. */
  const de = (campo: keyof FormularioDeFicha): string[] => {
    const paso = (Object.entries(CAMPOS_DEL_PASO) as [string, readonly string[]][])
      .find(([, campos]) => campos.includes(campo))?.[0];
    const visibles = intentados.has(Number(paso) as PasoDelAsistente) || tocados.has(campo) ? problemas : [];
    return [...visibles, ...delServidor]
      .filter((p) => (CAMPO_DEL_FORMULARIO[p.campo] ?? null) === campo)
      // En el asistente la confiabilidad es «de dónde salieron».
      .map((p) => (campo === "confiabilidad" && !form.confiabilidad ? "elegí de dónde salieron las medidas" : p.problema));
  };
  const generales = delServidor.filter((p) => !CAMPO_DEL_FORMULARIO[p.campo]).map((p) => p.problema);

  const cambiar = (campo: keyof FormularioDeFicha, valor: string) => {
    setForm((f) => {
      const g = { ...f, [campo]: valor } as FormularioDeFicha;
      if (campo === "nombre" && nueva && !f.claveTocada) g.clave = claveDeNombre(valor);
      if (campo === "clave") g.claveTocada = true;
      return g;
    });
    setTocados((t) => new Set(t).add(campo));
    setDelServidor((p) => p.filter((x) => CAMPO_DEL_FORMULARIO[x.campo] !== campo));
  };

  /** Lo que se escribe a mano sigue al cambiar de familia o de modelo de
   *  partida: el nombre, la clave y de dónde salió. */
  const conLoEscrito = (g: FormularioDeFicha): FormularioDeFicha => ({
    ...g, nombre: form.nombre, clave: form.clave, claveTocada: form.claveTocada,
    url: form.url, nota: form.nota, confiabilidad: form.confiabilidad,
  });
  const elegirFamilia = (entrada: string) => {
    if (!nueva || entrada === form.entrada) return;
    setForm(conLoEscrito(formularioVacio(entrada)));
    setDesde(null); setDelServidor([]);
  };
  const empezarDesde = (id: string | null) => {
    const m = id ? modelosDe(form.entrada).find((x) => x.id === id) : null;
    setForm(conLoEscrito(m ? formularioDesdeModelo(form.entrada, m) : formularioVacio(form.entrada)));
    setDesde(m ? m.id : null);
  };

  useEffect(() => { formRef.current?.scrollTo({ top: 0 }); }, [paso]);

  /** Ir a otro paso: para atrás siempre; para adelante, si los de antes
   *  están bien (si no, al primero que no). */
  const irA = (destino: PasoDelAsistente) => {
    if (destino <= paso) { setPaso(destino); return; }
    for (let p = paso; p < destino; p = (p + 1) as PasoDelAsistente) {
      if (delPaso(p).length) {
        setIntentados((s) => new Set(s).add(p));
        setPaso(p);
        return;
      }
    }
    setPaso(destino);
  };

  const guardar = async () => {
    setIntentados(new Set([1, 2, 3]));
    setGuardando(true);
    try {
      const r = await guardarFicha(conOrigenCompleto(form), editando?.clave ?? null,
        { crear: crearModeloPropio, cambiar: cambiarModeloPropio });
      if (!r.ok) {
        const delForm = problemasDelFormulario(conOrigenCompleto(form), { nueva });
        const deVerdad = delForm.length ? [] : r.problemas;
        setDelServidor(deVerdad);
        const todos = delForm.length ? delForm : deVerdad;
        if (todos.length) setPaso(Math.min(...todos.map(pasoDelProblema)) as PasoDelAsistente);
        return;
      }
      await recargarFichasPropias();
      onGuardado(r.ficha);
    } finally {
      setGuardando(false);
    }
  };

  const principal = () => {
    if (!nueva || paso === 3) { void guardar(); return; }
    irA((paso + 1) as PasoDelAsistente);
  };
  const textoPrincipal = guardando ? "Guardando…"
    : !nueva ? "Guardar cambios"
      : paso === 1 ? "Siguiente: medidas →" : paso === 2 ? "Siguiente: nombre →" : "Guardar mueble";

  const adentro = dibujo
    ? porDentroDe({ tipo: familia?.tipo ?? "", w: dibujo.def.w, entrepanos: dibujo.def.entrepanos, partes: dibujo.def.partes })
    : "";
  const pie = dibujo ? `${medidasDe(dibujo.def)}${adentro ? ` · ${adentro}` : ""}` : "";
  const numerosA = dibujo ? [...new Set(dibujo.numeradas.filter((p) => p.cara === "A").map((p) => p.etiqueta))] : [];
  const conNumeros = paso === 3 && numerosA.length > 0;

  return (
    <div className="mm" data-asistente={nueva ? "nuevo" : "editar"} data-paso={paso}>
      <div className="mm-h">
        <nav className="mm-miga" aria-label="Dónde estás">
          <span>Plano</span><span aria-hidden>›</span>
          <button type="button" className="mm-link" onClick={onSalir}>Mis muebles</button><span aria-hidden>›</span>
          <b>{nueva ? "Nuevo" : editando.nombre}</b>
        </nav>
        <ol className="mm-pasos" aria-label="Pasos">
          {PASOS.map(({ paso: p, titulo }) => (
            <li key={p}>
              <button type="button" className="mm-paso" onClick={() => irA(p)} data-paso-pill={p}
                data-ahora={p === paso || undefined} data-hecho={(p < paso && delPaso(p).length === 0) || undefined}
                aria-current={p === paso ? "step" : undefined}>
                <span className="n">{p < paso && delPaso(p).length === 0 ? <Check size={13} strokeWidth={2.5} aria-hidden /> : p}</span>
                <span className="t">{titulo}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {desdePlano && (
        <div className="mm-aviso-plano" role="note" data-taller-desde-plano>
          <span>
            Desde el plano de <b>{desdePlano.sede || "la sede"}</b>: armá el mueble y al guardarlo queda en
            «Mis muebles», listo para colocar.
          </span>
          <button type="button" className="mm-bt chico" onClick={onVolverAlPlano} data-volver-al-plano>
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden /> Volver al plano
          </button>
        </div>
      )}

      <div className="mm-cuerpo">
        <div className="mm-form" ref={formRef}>
          {paso === 1 && <PasoQueEs form={form} familia={familia} nueva={nueva} desde={desde}
            onFamilia={elegirFamilia} onDesde={empezarDesde} problemas={de("entrada")} />}
          {paso === 2 && familia && <PasoMedidas form={form} familia={familia} nueva={nueva} de={de} cambiar={cambiar} />}
          {paso === 3 && familia && <PasoNombre form={form} familia={familia} nueva={nueva} de={de} cambiar={cambiar}
            numerosA={numerosA} generales={generales} />}
          {intentados.has(paso) && delPaso(paso).length > 0 && (
            <p className="mm-mal" data-faltan>
              {delPaso(paso).length === 1 ? "Hay un dato para corregir" : `Hay ${delPaso(paso).length} datos para corregir`} antes de seguir.
            </p>
          )}
        </div>
        <div className="mm-vista">
          <div className="mm-lienzo"><VistaDeLaFicha dibujo={dibujo} conNumeros={conNumeros} /></div>
          <div className="mm-vista-pie" data-pie-vista>
            <span>{paso === 2 ? "Así se va a colocar" : conNumeros ? "Lo que se vende" : nombreDelPie(form, familia, desde)}</span>
            <b>{conNumeros ? numerosA.join(" · ") : pie}</b>
          </div>
        </div>
      </div>

      <div className="mm-abajo">
        <span className="mm-abajo-izq">
          {!nueva && (
            <button type="button" className="mm-bt peligro-suave" onClick={() => setRetirando(true)} data-retirar-mueble>
              Retirar este mueble
            </button>
          )}
          {nueva && paso === 1 && <span className="mm-nota">Paso 1 de 3</span>}
          {paso > 1 && (nueva || paso > 2) && (
            <button type="button" className="mm-bt" onClick={() => setPaso((paso - 1) as PasoDelAsistente)}>
              <ArrowLeft size={15} strokeWidth={1.75} aria-hidden /> Atrás
            </button>
          )}
        </span>
        <span className="mm-abajo-der">
          {!nueva && <button type="button" className="mm-bt" onClick={onSalir}>Cancelar</button>}
          {!nueva && paso < 3 && (
            <button type="button" className="mm-bt mm-siguiente-edicion" onClick={() => irA((paso + 1) as PasoDelAsistente)}>
              Siguiente →
            </button>
          )}
          <button type="button" className="btn-principal mm-principal" onClick={principal} disabled={guardando}
            data-guardar-ficha={!nueva || paso === 3 || undefined} data-siguiente={(nueva && paso < 3) || undefined}>
            {textoPrincipal}
          </button>
        </span>
      </div>

      {retirando && editando && (
        <RetirarMueble mueble={editando} onCerrar={() => setRetirando(false)} onRetirado={onRetirado} />
      )}
    </div>
  );
}

/** Lo que dice el pie de la vista en el paso 1: la familia y de qué modelo
 *  se parte. */
function nombreDelPie(form: FormularioDeFicha, familia: FamiliaDeFicha | undefined, desde: string | null): string {
  if (!familia) return "";
  const m = desde ? modelosDe(form.entrada).find((x) => x.id === desde) : null;
  return `${nombreCortoDe(familia)} · ${m ? m.nombre : "medida estándar"}`;
}

/** Lo que no cambia al editar, dicho una vez. */
function Candado() {
  return (
    <div className="mm-candado" data-candado>
      <Lock size={15} strokeWidth={1.75} aria-hidden />
      <span>
        Qué mueble es, la clave y la tarifa no cambian: lo ya colocado las usa. Para otra familia, retiralo y armá
        otro. Las medidas nuevas valen para lo que se coloque desde ahora; lo ya colocado se cambia en su ficha del
        plano («Usar lo de la ficha»).
      </span>
    </div>
  );
}

function Problemas({ lista, campo }: { lista: string[]; campo: string }) {
  if (!lista.length) return null;
  return <>{lista.map((p, i) => <p key={i} className="mm-mal" data-problema={campo}>{p}</p>)}</>;
}

// ─── Paso 1: qué mueble es ───────────────────────────────────────────────────

function PasoQueEs({ form, familia, nueva, desde, onFamilia, onDesde, problemas }: {
  form: FormularioDeFicha; familia: FamiliaDeFicha | undefined; nueva: boolean; desde: string | null;
  onFamilia: (entrada: string) => void; onDesde: (id: string | null) => void; problemas: string[];
}) {
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const modelos = useMemo(() => modelosDe(form.entrada), [form.entrada]);
  return (
    <>
      <h2>¿Qué mueble es?</h2>
      {nueva
        ? <p className="mm-sub">Elegí el más parecido. Las medidas y cómo se vende se ajustan en los pasos que siguen.</p>
        : <Candado />}
      <div className="mm-familias" role="radiogroup" aria-label="Qué mueble es">
        {FAMILIAS_DEL_FORMULARIO.map((f) => (
          <TarjetaDeFamilia key={f.entrada} familia={f} elegida={f.entrada === form.entrada} apagada={!nueva}
            propio={conNombrePropio({ type: f.tipo, gondolaType: f.variante }, nombresPropios, "")}
            onElegir={() => onFamilia(f.entrada)} />
        ))}
      </div>
      <Problemas lista={problemas} campo="entrada" />
      {nueva && familia && modelos.length > 0 && (
        <div className="mm-bloque" data-empezar-desde>
          <span className="mm-t">Empezar desde <small>opcional: copia sus medidas y cómo se vende</small></span>
          {modelos.length <= 5 ? (
            <div className="mm-chips" role="radiogroup" aria-label="Empezar desde">
              <button type="button" role="radio" aria-checked={desde === null} className="mm-chip" onClick={() => onDesde(null)}>
                Medida estándar
              </button>
              {modelos.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={desde === m.id} className="mm-chip"
                  data-modelo={m.id} onClick={() => onDesde(m.id)}>{m.nombre}</button>
              ))}
            </div>
          ) : (
            <select className="mm-campo" value={desde ?? ""} onChange={(e) => onDesde(e.target.value || null)}
              aria-label="Empezar desde">
              <option value="">Medida estándar</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          )}
        </div>
      )}
    </>
  );
}

/** Una familia del paso 1, con la foto de su mueble de siempre. */
function TarjetaDeFamilia({ familia, elegida, apagada, propio, onElegir }: {
  familia: FamiliaDeFicha; elegida: boolean; apagada: boolean; propio: string; onElegir: () => void;
}) {
  const propias = useFichasPropias();
  const paleta = useMemo(() => paletaConPropias(propias), [propias]);
  const fixture = useMemo(() => dibujoDe(formularioVacio(familia.entrada), paleta)?.fixture ?? null, [familia.entrada, paleta]);
  const foto = useFoto(`familia:${familia.entrada}`, fixture);
  const corto = nombreCortoDe(familia);
  return (
    <button type="button" role="radio" aria-checked={elegida} className="mm-familia" disabled={apagada && !elegida}
      data-familia={familia.entrada} onClick={onElegir}>
      <span className="foto">{foto ? <img src={foto} alt="" /> : <span className="cargando" aria-hidden />}</span>
      <span className="nom">{propio || corto}</span>
      {propio && <span className="rec">{corto}</span>}
    </button>
  );
}

// ─── Paso 2: cuánto mide ─────────────────────────────────────────────────────

type De = (campo: keyof FormularioDeFicha) => string[];
type Cambiar = (campo: keyof FormularioDeFicha, valor: string) => void;

function PasoMedidas({ form, familia, nueva, de, cambiar }: {
  form: FormularioDeFicha; familia: FamiliaDeFicha; nueva: boolean; de: De; cambiar: Cambiar;
}) {
  const geo = familia.geometria;
  const wM = (numeroDe(form.anchoCm) ?? cmDe(familia.rango.w[0])) / 100;
  const hM = (numeroDe(form.altoCm) ?? cmDe(familia.rango.h[0])) / 100;
  const conGeometria = TIPOS_CON_GEOMETRIA.has(familia.tipo);
  const caben = conGeometria ? entrepanosQueEntran(familia.tipo, hM) : undefined;
  const entrepanosAuto = conGeometria
    ? geometriaALaVista({ id: "", code: "", type: familia.tipo, gondolaType: familia.variante, w: wM, h: hM }).entrepanos
    : undefined;
  const tramosEnFicha = !!geo.tramos && !familia.seCuentanEnElPlano.includes("tramos");
  const hayPorDentro = !!(geo.puertas || tramosEnFicha || geo.entrepanos || geo.modulo);
  return (
    <>
      <h2>¿Cuánto mide?</h2>
      {nueva
        ? <p className="mm-sub">En centímetros, como lo medís con el metro. El dibujo de la derecha cambia mientras escribís.</p>
        : <Candado />}
      {([
        ["anchoCm", familia.tipo === "gondola" ? "Ancho de un módulo" : "Ancho", familia.rango.w],
        ["fondoCm", "Fondo", familia.rango.d],
        ["altoCm", "Alto", familia.rango.h],
      ] as const).map(([campo, rotulo, r]) => (
        <Medida key={campo} campo={campo} rotulo={rotulo} min={cmDe(r[0])} max={cmDe(r[1])} unidad="cm"
          valor={form[campo]} problemas={de(campo)} onCambio={(v) => cambiar(campo, v)} />
      ))}
      {hayPorDentro && (
        <div className="mm-bloque" data-por-dentro>
          <span className="mm-t">Por dentro</span>
          {geo.puertas && (
            <Medida campo="puertas" rotulo="Puertas" min={geo.puertas[0]} max={geo.puertas[1]} paso={1}
              valor={form.puertas} problemas={de("puertas")} onCambio={(v) => cambiar("puertas", v)}
              automatico={{ valor: puertasDeNevera(wM), texto: `${puertasDeNevera(wM)}, las que salen del ancho. Cambialo si la tuya tiene otras.` }} />
          )}
          {tramosEnFicha && geo.tramos && (
            <Medida campo="tramos" rotulo="Tramos" min={geo.tramos[0]} max={geo.tramos[1]} paso={1}
              valor={form.tramos} problemas={de("tramos")} onCambio={(v) => cambiar("tramos", v)}
              automatico={{ valor: geo.tramos[0] - 1, marcador: "—", texto: "el frente corrido. Con tramos, un montante entre tramo y tramo." }} />
          )}
          {geo.entrepanos && (
            <Medida campo="entrepanos" rotulo="Entrepaños por cara" detalle="sin la base"
              min={geo.entrepanos[0]} max={Math.max(geo.entrepanos[0], Math.min(geo.entrepanos[1], caben ?? Infinity))} paso={1}
              valor={form.entrepanos} problemas={de("entrepanos")} onCambio={(v) => cambiar("entrepanos", v)}
              automatico={{
                valor: entrepanosAuto ?? geo.entrepanos[0],
                texto: `${entrepanosAuto ?? "la cuenta de siempre"}${caben !== undefined && caben < geo.entrepanos[1] ? `; con este alto entran hasta ${caben}` : ""}.`,
              }} />
          )}
          {geo.modulo && (
            <Medida campo="moduloCm" rotulo="Módulo" detalle="de parante a parante" min={cmDe(geo.modulo[0])} max={cmDe(geo.modulo[1])} unidad="cm"
              valor={form.moduloCm} problemas={de("moduloCm")} onCambio={(v) => cambiar("moduloCm", v)}
              automatico={{ valor: 125, texto: "125 cm." }} />
          )}
        </div>
      )}
    </>
  );
}

/** Una medida con − y +, su rango dibujado y, si tiene, su valor automático
 *  (vacío es «automático»). */
function Medida({ campo, rotulo, detalle, min, max, paso = 1, unidad, valor, problemas, onCambio, automatico }: {
  campo: keyof FormularioDeFicha; rotulo: string; detalle?: string; min: number; max: number; paso?: number;
  unidad?: string; valor: string; problemas: string[]; onCambio: (v: string) => void;
  /** `valor`: desde dónde arrancan − y +; `marcador`: lo que se ve en el
   *  campo vacío, si no es ese número. */
  automatico?: { valor: number; texto: string; marcador?: string };
}) {
  const n = numeroDe(valor);
  const fuera = n !== undefined && (n < min || n > max);
  const pos = n === undefined ? null : Math.min(1, Math.max(0, (n - min) / (max - min || 1)));
  const desde = automatico?.valor ?? n ?? min;
  const id = `mm-${campo}`;
  const rango = `de ${cmTexto(min / 100)} a ${cmTexto(max / 100)}${unidad ? ` ${unidad}` : ""}`;
  return (
    <div className="mm-medida" data-medida={campo} data-mal={problemas.length > 0 || undefined}>
      <label className="k" htmlFor={id}>{rotulo}<small>{detalle ? `${detalle} · ` : ""}{rango}</small></label>
      <span className="mm-num">
        <button type="button" aria-label={`Menos ${rotulo.toLowerCase()}`} onClick={() => onCambio(pasoDeNumero(valor, -paso, min, max, desde))}>−</button>
        <input id={id} inputMode="decimal" value={valor} data-campo={campo}
          placeholder={automatico ? automatico.marcador ?? String(automatico.valor) : undefined}
          aria-invalid={problemas.length > 0 || undefined} aria-describedby={`${id}-a`}
          onChange={(e) => onCambio(e.target.value)} />
        {unidad && <em>{unidad}</em>}
        <button type="button" aria-label={`Más ${rotulo.toLowerCase()}`} onClick={() => onCambio(pasoDeNumero(valor, paso, min, max, desde))}>+</button>
      </span>
      <span className="mm-medida-der" id={`${id}-a`}>
        {automatico ? (
          <span className="mm-ayuda">
            {valor.trim() === "" ? <>Automático: {automatico.texto}</> : (
              <>Fijado a mano. <button type="button" className="mm-link" onClick={() => onCambio("")}>Volver a automático</button></>
            )}
          </span>
        ) : (
          <>
            <span className="mm-regla" aria-hidden>{pos !== null && <i data-fuera={fuera || undefined} style={{ left: `calc(${pos * 100}% - 7px)` }} />}</span>
            <span className="mm-regla-l" aria-hidden><span>{cmTexto(min / 100)}</span><span>{cmTexto(max / 100)}</span></span>
          </>
        )}
        <Problemas lista={problemas} campo={campo} />
      </span>
    </div>
  );
}

// ─── Paso 3: nombre y cómo se vende ──────────────────────────────────────────

function PasoNombre({ form, familia, nueva, de, cambiar, numerosA, generales }: {
  form: FormularioDeFicha; familia: FamiliaDeFicha; nueva: boolean; de: De; cambiar: Cambiar;
  numerosA: string[]; generales: string[];
}) {
  const largo = CATALOGO_DE_MUEBLES.fichas.largoMaximo;
  const enMas = [...de("clave"), ...de("tarifa"), ...(form.confiabilidad === "estimado" ? de("nota") : [])];
  const [masAbierto, setMasAbierto] = useState(enMas.length > 0);
  useEffect(() => { if (enMas.length) setMasAbierto(true); }, [enMas.length]);
  const origen = ORIGENES.find((o) => o.valor === form.confiabilidad);
  const entrepanos = numeroDe(form.entrepanos);
  const puertas = numeroDe(form.puertas);
  const tramos = numeroDe(form.tramos);
  /** El rótulo de cada forma de venderse, con lo que diría Vender:
   *  «Entera o por puertas (2)». */
  const rotuloDe = (division: string) => {
    const w = (numeroDe(form.anchoCm) ?? 0) / 100;
    const partes = {
      division,
      ...(familia.geometria.puertas ? { puertas: puertas ?? puertasDeNevera(w) } : {}),
      ...(tramos !== undefined ? { tramos } : {}),
    };
    const como = comoSeVendeLaFicha({ tipo: familia.tipo, partes, entrepanos: entrepanos ?? null });
    return como ? conMayuscula(textoDeComoSeVende(como)) : `Entera o por ${CATALOGO_DE_MUEBLES.partes.clases[division]?.plural ?? division}`;
  };
  return (
    <>
      <h2>{nueva ? "Nombre y cómo se vende" : `Editar «${form.nombre || "sin nombre"}»`}</h2>
      <div className="mm-campo-c">
        <label htmlFor="mm-nombre">Nombre</label>
        <input id="mm-nombre" className="mm-campo" value={form.nombre} maxLength={largo.nombre} data-campo="nombre"
          placeholder="Nevera de la entrada" aria-invalid={de("nombre").length > 0 || undefined}
          onChange={(e) => cambiar("nombre", e.target.value)} />
        <small>Así aparece en «Mis muebles» y en el plano.</small>
        <Problemas lista={de("nombre")} campo="nombre" />
      </div>

      {familia.divisiones.length > 0 && (
        <div className="mm-bloque" data-como-se-vende>
          <span className="mm-t">Cómo se vende</span>
          <div className="mm-seg" role="radiogroup" aria-label="Cómo se vende">
            <button type="button" role="radio" aria-checked={form.division === ""} onClick={() => cambiar("division", "")}>Entera</button>
            {familia.divisiones.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={form.division === d} data-division={d}
                onClick={() => cambiar("division", d)}>{rotuloDe(d)}</button>
            ))}
          </div>
          {form.division === "entrepanos" && (
            <p className="mm-ayuda" data-ayuda-division>
              Se venden la base y los entrepaños de arriba (con 4 entrepaños, 5 partes: el EN1 es la base). Hace falta
              decir cuántos entrepaños, en las medidas.
            </p>
          )}
          {form.division === "tramos" && familia.seCuentanEnElPlano.includes("tramos") && (
            <p className="mm-ayuda" data-ayuda-division>
              Un tramo por módulo del corrido: cuántos, depende de cuánto se estire en el plano. Se fijan en la ficha
              del mueble en el plano («Cómo se vende»); hasta entonces se vende entera.
            </p>
          )}
          {form.division && form.division !== "entrepanos" && !familia.seCuentanEnElPlano.includes(form.division) && (
            <p className="mm-ayuda" data-ayuda-division>
              Se cuentan de izquierda a derecha mirando el frente.
            </p>
          )}
          {form.division && numerosA.length > 0 && (
            <p className="mm-ayuda" data-ayuda-numeradas>
              En el dibujo, cada parte con el número que va a tener en Vender: {numerosA.join(", ")}. Nunca el mueble
              entero y sus partes en las mismas fechas.
            </p>
          )}
          <Problemas lista={de("division")} campo="division" />
        </div>
      )}

      {familia.piezas.length > 0 && (
        <div className="mm-bloque" data-como-se-vende>
          <span className="mm-t">Cómo se vende</span>
          {familia.geometria.bahias && (
            <>
              <div className="mm-seg" role="radiogroup" aria-label="Bahías de impulso que se venden">
                {["", ...Array.from({ length: familia.geometria.bahias[1] - familia.geometria.bahias[0] + 1 },
                  (_, i) => String(familia.geometria.bahias![0] + i))].map((v) => (
                  <button key={v || "0"} type="button" role="radio" aria-checked={form.bahias === v} data-bahias={v || "0"}
                    onClick={() => cambiar("bahias", v)}>
                    {v === "" ? "Ninguna bahía" : `${v} ${v === "1" ? "bahía" : "bahías"}`}
                  </button>
                ))}
              </div>
              <p className="mm-ayuda">Las bahías de impulso del lado del cliente. La caja no se vende entera.</p>
              <Problemas lista={de("bahias")} campo="bahias" />
            </>
          )}
          {familia.piezas.includes("forro") && (
            <>
              <div className="mm-seg" role="radiogroup" aria-label="El forro">
                <button type="button" role="radio" aria-checked={form.forro !== "si"} onClick={() => cambiar("forro", "")}>El forro no se vende</button>
                <button type="button" role="radio" aria-checked={form.forro === "si"} data-forro onClick={() => cambiar("forro", "si")}>El forro se vende</button>
              </div>
              <p className="mm-ayuda">La columna no se vende; su forro, sí.</p>
              <Problemas lista={de("forro")} campo="forro" />
            </>
          )}
          {(form.bahias.trim() || form.forro === "si") && numerosA.length > 0 && (
            <p className="mm-ayuda" data-ayuda-numeradas>
              En el dibujo, cada pieza con el número que va a tener en Vender: {numerosA.join(", ")}.
            </p>
          )}
        </div>
      )}

      <div className="mm-bloque" data-origen>
        <span className="mm-t" id="mm-origen-t">¿De dónde salieron las medidas?</span>
        <div className="mm-opciones" role="radiogroup" aria-labelledby="mm-origen-t">
          {ORIGENES.map((o) => (
            <button key={o.valor} type="button" role="radio" aria-checked={form.confiabilidad === o.valor}
              className="mm-opcion" data-origen-opcion={o.valor} onClick={() => cambiar("confiabilidad", o.valor)}>
              <b>{o.titulo}</b><span>{o.detalle}</span>
            </button>
          ))}
        </div>
        <Problemas lista={de("confiabilidad")} campo="confiabilidad" />
        {origen && origen.pide !== "nada" && (
          <div className="mm-campo-c">
            <label htmlFor="mm-url">{origen.valor === "ficha" ? "Enlace de la página del fabricante" : "Enlace del catálogo o listado"}</label>
            <input id="mm-url" className="mm-campo" type="url" value={form.url} maxLength={largo.url} data-campo="url"
              placeholder="https://…" aria-invalid={de("url").length > 0 || undefined} onChange={(e) => cambiar("url", e.target.value)} />
            <small>{origen.pide === "url" ? "La página, no una foto." : "El enlace, o una nota con tus palabras."}</small>
            <Problemas lista={de("url")} campo="url" />
          </div>
        )}
        {origen?.pide === "url_o_nota" && <NotaDeFuente form={form} de={de} cambiar={cambiar} />}
      </div>

      <details className="mm-mas" open={masAbierto} onToggle={(e) => setMasAbierto((e.target as HTMLDetailsElement).open)} data-mas-opciones>
        <summary>
          Más opciones: clave <b className="codigo">{form.clave || "—"}</b> · tarifa «{form.tarifa ? rotuloDeTarifa(form.tarifa) : "la de su familia"}» · nota
        </summary>
        <div className="mm-mas-b">
          <div className="mm-campo-c">
            <label htmlFor="mm-clave">Clave</label>
            <input id="mm-clave" className="mm-campo codigo" value={form.clave} disabled={!nueva} data-campo="clave"
              aria-invalid={de("clave").length > 0 || undefined} onChange={(e) => cambiar("clave", e.target.value)} />
            <small>{nueva ? "Sale sola del nombre. Es lo que guarda el plano: después no cambia." : "No cambia: es lo que guarda el plano."}</small>
            <Problemas lista={de("clave")} campo="clave" />
          </div>
          <div className="mm-campo-c">
            <label htmlFor="mm-tarifa">Tarifa</label>
            <select id="mm-tarifa" className="mm-campo" value={form.tarifa} disabled={!nueva} data-campo="tarifa"
              onChange={(e) => cambiar("tarifa", e.target.value)}>
              <option value="">La de su familia{familia.tarifa ? ` (${rotuloDeTarifa(familia.tarifa)})` : ""}</option>
              {familia.tarifasPropias.map((t) => <option key={t} value={t}>{rotuloDeTarifa(t)}</option>)}
            </select>
            <small>{nueva ? "La de su familia, o una propia de las que ya existen." : "No cambia: lo colocado la busca por la clave."}</small>
            <Problemas lista={de("tarifa")} campo="tarifa" />
          </div>
          {origen?.pide !== "url_o_nota" && <NotaDeFuente form={form} de={de} cambiar={cambiar} />}
        </div>
      </details>

      {generales.map((p, i) => <p key={i} className="mm-mal" data-problema="ficha">{p}</p>)}
    </>
  );
}

function NotaDeFuente({ form, de, cambiar }: { form: FormularioDeFicha; de: De; cambiar: Cambiar }) {
  const largo = CATALOGO_DE_MUEBLES.fichas.largoMaximo.nota;
  return (
    <div className="mm-campo-c">
      <label htmlFor="mm-nota">Nota, con tus palabras <small>{form.nota.length}/{largo}</small></label>
      <textarea id="mm-nota" className="mm-campo" rows={2} value={form.nota} maxLength={largo} data-campo="nota"
        placeholder={form.confiabilidad === "estimado" ? NOTA_DE_LA_TIENDA : "Las puertas, de la ficha del fabricante."}
        aria-invalid={de("nota").length > 0 || undefined} onChange={(e) => cambiar("nota", e.target.value)} />
      <Problemas lista={de("nota")} campo="nota" />
    </div>
  );
}
