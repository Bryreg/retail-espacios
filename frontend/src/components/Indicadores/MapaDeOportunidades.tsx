import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { UnifiedFixture } from "../../types/fixtures";
import { contraLaMeta, pesos } from "../../utils/indicadores";
import { enLaCapa, prioridadDe, TEXTO_DEL_MONTAJE, type Accion, type CapaDelMapa, type EspacioDelMapa } from "../../utils/mapaDeDecision";
import MapaDeDecision, { type AccionEnElMapa } from "./MapaDeDecision";
import "./mapaDeDecision.css";

/**
 * MAPA DE OPORTUNIDADES — la pestaña principal de Indicadores (versión B,
 * aprobada por el dueño el 2026-10-28).
 *
 * El plano manda: arriba cuatro cifras de control contra su meta; a los lados
 * seis indicadores; al centro el mapa de decisión, que enciende la capa del
 * indicador que se señala (con el mouse, el foco o un toque; un clic la deja
 * fija); debajo, la lista de lo que el mapa muestra, cada espacio con su
 * acción. Sin indicador señalado, el mapa marca las acciones prioritarias con
 * su número, en el orden de la lista.
 *
 * Quien no administra ve las mismas capas sin plata: cuentas, nunca montos.
 */

export interface AccionDelTablero extends Accion {
  codigo: string;
  /** «Renovación pendiente», «Ventas sin registrar (contrato al 5 %)». */
  asunto: string;
  /** Lo corto que va en el mapa: «Renovación pendiente». */
  corto: string;
  /** Proveedor, motivo… */
  detalle: string;
  plazo: string;
  boton: string;
  onClick: () => void;
}

export interface DatosDelMapa {
  esAdmin: boolean;
  sede: string;
  fixtures: UnifiedFixture[];
  espacios: EspacioDelMapa[];
  acciones: AccionDelTablero[];
  pendientes: { total: number; hoy: number };
  /** Los contratos que corren o están firmados: uno por espacio, la cara
   *  entera o cada parte (`kpis.contratos`). */
  contratos: number;
  ocupacion: { pct: number; ocupadas: number; total: number; meta: number };
  /** Administración: el canon del mes y el potencial a tarifa. */
  canon: number | null;
  potencial: number | null;
  precio: { pct: number; meta: number; contadas: number } | null;
  /** El canon contra el mes anterior: «+12,2 % frente a septiembre». */
  variacion: { pct: number; mes: string } | null;
  /** Los contratos que empiezan este mes y cuántos ya están en la tienda. */
  montajesDelMes: { total: number; enLaTienda: number };
  vence30: { contratos: number; alMes: number | null };
  vence90: { contratos: number; alMes: number | null };
  /** El cliente principal: el que más paga (administración) o el que más
   *  espacios tiene. */
  cliente: { nombre: string; espacios: number; alMes: number | null; pct: number | null } | null;
}

export interface ManejoDelMapa {
  onFicha: (clave: string) => void;
  onPropuesta: (clave: string) => void;
  onMontaje: (clave: string) => void;
  onPendientes: (grupo?: "hoy") => void;
  onPlanoParaContratar: () => void;
  onTabla: (capa: CapaDelMapa) => void;
}

type Tono = "bien" | "aviso" | "critico";
interface Indicador {
  capa: Exclude<CapaDelMapa, "acciones">;
  titulo: string;
  ancla: string;
  valor: string;
  detalle: ReactNode;
  estado: { tono: Tono; texto: string } | null;
}
interface Item { clave: string | null; codigo: string; sub: string; valor: string | null; boton: string; onClick: () => void }

/** La definición de cada indicador en el Diccionario (`METRICAS`). */
export const METRICA_DEL_INDICADOR: Record<Exclude<CapaDelMapa, "acciones">, string> = {
  ingreso: "canon", vence: "vence_30", montaje: "montajes_pendientes", vacias: "caras_sin_contrato", parcial: "venta_parcial", cliente: "cliente_principal",
};

const NOMBRE_DE_LA_CAPA: Record<CapaDelMapa, string> = {
  acciones: "Acciones prioritarias", ingreso: "Ingreso contratado", vence: "Ingreso por vencer · 90 días",
  montaje: "Montajes pendientes", vacias: "Caras sin contrato", parcial: "Venta parcial", cliente: "Cliente",
};

function Estado({ tono, texto }: { tono: Tono; texto: string }) {
  return <span className={`mo-estado ${tono}`}><i aria-hidden />{texto}</span>;
}

function Leyenda({ capa, verPlata }: { capa: CapaDelMapa; verPlata: boolean }) {
  const s = (clase: string, texto: string) => <span key={texto}><i className={`mo-sw ${clase}`} aria-hidden />{texto}</span>;
  const items: Record<CapaDelMapa, ReactNode[]> = {
    acciones: [s("alta", "Prioridad alta"), s("media", "Prioridad media"), <span key="n">El número es el orden de la lista de abajo</span>],
    ingreso: [s("rampa", verPlata ? "Altura y tono: lo que paga cada espacio al mes" : "Espacios con contrato vigente")],
    vence: [s("critico", "Hasta 30 días"), s("serio", "31 a 60"), s("aviso", "61 a 90"), <span key="o">Las ondas marcan la urgencia</span>],
    montaje: [s("m-alta", "No realizado"), s("m-media", "Sin montar o no coincide"), s("m-azul", "Por verificar o guía sin enviar")],
    vacias: [s("fantasma", "Sin contrato: el volumen que falta vender")],
    parcial: [s("sol", "Vendido"), s("res", "Reservado"), s("fantasma", "Libre: lo que falta vender"),
      <span key="p">{verPlata ? "% vendido junto al código" : "En las puntas, un bloque por entrepaño"}</span>],
    cliente: [s("cli", "Espacios del cliente")],
  };
  return <div className="mo-ley">{items[capa]}</div>;
}

export default function MapaDeOportunidades({ datos, manejo, capaInicial = null }: {
  datos: DatosDelMapa; manejo: ManejoDelMapa;
  /** La capa que abre fija (al venir de «Ver en el mapa» de Análisis). */
  capaInicial?: CapaDelMapa | null;
}) {
  const { esAdmin: plata } = datos;
  const [senalada, setSenalada] = useState<CapaDelMapa | null>(null);
  const [fija, setFija] = useState<CapaDelMapa | null>(capaInicial);
  const [todos, setTodos] = useState(false);
  /** La fila de la lista bajo el mouse (o con el foco): su espacio se señala
   *  en el mapa con su globo, aunque no entre entre los de arriba. */
  const [enLaLista, setEnLaLista] = useState<string | null>(null);
  const capa: CapaDelMapa = senalada ?? fija ?? "acciones";

  const porClave = useMemo(() => new Map(datos.espacios.map((e) => [e.clave, e])), [datos.espacios]);
  const comerciales = datos.espacios.filter((e) => e.comercial);
  const en = (c: CapaDelMapa) => datos.espacios.filter((e) => enLaCapa(e, c, datos.cliente?.nombre));
  const suma = (xs: (number | null)[]) => xs.reduce<number>((t, v) => t + (v ?? 0), 0);

  // ── Las seis capas, con sus cuentas.
  const conIngreso = en("ingreso");
  const vacias = en("vacias");
  const parciales = en("parcial");
  const montajes = en("montaje");
  const faltanParaMeta = Math.max(0, Math.ceil((datos.ocupacion.meta / 100) * datos.ocupacion.total) - datos.ocupacion.ocupadas);
  const cuentaMontaje = (e: EspacioDelMapa["montaje"]) => montajes.filter((m) => m.montaje === e).length;
  const clienteVence = datos.cliente ? datos.espacios.some((e) => e.vence && e.vence.proveedor === datos.cliente!.nombre) : false;

  const izq: Indicador[] = [
    {
      capa: "ingreso", titulo: plata ? "Ingreso mensual contratado" : "Caras con contrato", ancla: "Vigentes",
      valor: plata ? pesos(datos.canon ?? 0) : String(datos.ocupacion.ocupadas),
      detalle: plata
        ? <>{datos.variacion && <><b>{datos.variacion.pct >= 0 ? "+" : "−"}{Math.abs(datos.variacion.pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</b> frente a {datos.variacion.mes} · </>}{conIngreso.length} cara{conIngreso.length === 1 ? "" : "s"} con contrato</>
        : <>de {datos.ocupacion.total} caras de la sede</>,
      estado: null,
    },
    {
      capa: "vence", titulo: plata ? "Ingreso por vencer · 30 días" : "Contratos por vencer · 30 días", ancla: "Por vencer",
      valor: plata ? pesos(datos.vence30.alMes ?? 0) : String(datos.vence30.contratos),
      detalle: <>{datos.vence30.contratos} contrato{datos.vence30.contratos === 1 ? "" : "s"} · en 90 días: {plata ? `${pesos(datos.vence90.alMes ?? 0)} (${datos.vence90.contratos})` : datos.vence90.contratos}</>,
      estado: datos.vence30.contratos > 0 ? { tono: "critico", texto: "Sin renovar" } : datos.vence90.contratos > 0 ? { tono: "aviso", texto: "Vencen en 90 días" } : { tono: "bien", texto: "Nada por vencer" },
    },
    {
      capa: "montaje", titulo: "Montajes pendientes", ancla: "Sin montar",
      valor: String(montajes.length),
      detalle: montajes.length === 0 ? "nada pendiente"
        : ([["sin_montar", "sin montar", "sin montar"], ["no_realizado", "no realizado", "no realizados"], ["no_coincide", "no coincide", "no coinciden"],
          ["guia", "guía sin enviar", "guías sin enviar"], ["por_verificar", "por verificar", "por verificar"]] as const)
          .filter(([k]) => cuentaMontaje(k) > 0).map(([k, uno, varios]) => `${cuentaMontaje(k)} ${cuentaMontaje(k) === 1 ? uno : varios}`).join(" · "),
      estado: cuentaMontaje("no_realizado") > 0 ? { tono: "critico", texto: "Requieren gestión" } : montajes.length > 0 ? { tono: "aviso", texto: "Por resolver" } : { tono: "bien", texto: "Al día" },
    },
  ];
  const der: Indicador[] = [
    {
      capa: "vacias", titulo: "Caras sin contrato", ancla: "Libres",
      valor: String(vacias.length),
      detalle: plata ? `${pesos(suma(vacias.map((e) => e.tarifa)))} al mes a tarifa` : `de ${comerciales.length} caras`,
      estado: faltanParaMeta > 0 ? { tono: "aviso", texto: `Meta ${datos.ocupacion.meta} %: faltan ${faltanParaMeta}` } : { tono: "bien", texto: `En la meta de ${datos.ocupacion.meta} %` },
    },
    {
      capa: "parcial", titulo: "Venta parcial", ancla: "En parte",
      valor: `${parciales.length} cara${parciales.length === 1 ? "" : "s"}`,
      detalle: plata ? `${pesos(suma(parciales.map((e) => e.libreAlMes)))} al mes disponibles` : "con lugar para vender más",
      estado: null,
    },
    {
      capa: "cliente", titulo: plata ? "Cliente principal" : "Cliente con más espacios", ancla: "Cliente",
      valor: datos.cliente?.nombre ?? "—",
      detalle: datos.cliente
        ? plata && datos.cliente.pct !== null ? `${datos.cliente.pct} % del ingreso · ${pesos(datos.cliente.alMes ?? 0)} al mes` : `${datos.cliente.espacios} espacio${datos.cliente.espacios === 1 ? "" : "s"}`
        : "sin contratos vigentes",
      estado: clienteVence ? { tono: "aviso", texto: "Contrato por vencer" } : null,
    },
  ];

  // ── Lo que dice la lista de abajo, capa por capa (una sola acción por espacio).
  const ficha = (e: EspacioDelMapa) => () => manejo.onFicha(e.clave);
  const proponer = (e: EspacioDelMapa) => (plata ? { boton: "Preparar propuesta", onClick: () => manejo.onPropuesta(e.clave) } : { boton: "Ver ficha", onClick: ficha(e) });
  const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "");
  const panel = ((): { titulo: string; sub: string; items: Item[] } => {
    switch (capa) {
      case "acciones":
        return {
          titulo: "Acciones prioritarias",
          sub: datos.acciones.length ? "Ordenadas por impacto en el ingreso y por plazo. Al señalar un indicador, sus espacios se encienden en el mapa." : "Nada urgente: no hay renovaciones, ventas ni montajes pendientes.",
          items: datos.acciones.map((a) => ({
            clave: a.clave, codigo: a.codigo, sub: `${a.asunto}${a.detalle ? ` · ${a.detalle}` : ""} · ${a.plazo}`,
            valor: plata && a.impacto ? pesos(a.impacto) : null, boton: a.boton, onClick: a.onClick,
          })),
        };
      case "ingreso":
        return {
          titulo: `${NOMBRE_DE_LA_CAPA.ingreso} · ${conIngreso.length} caras`,
          sub: `${plata ? `${pesos(datos.canon ?? 0)} al mes en` : "Los espacios con contrato vigente:"} ${datos.contratos} contrato${datos.contratos === 1 ? "" : "s"} (la cara entera o cada parte).${plata ? " La altura de cada columna es lo que paga ese espacio." : ""}`,
          items: [...conIngreso].sort((a, b) => (b.ingresoAlMes ?? 0) - (a.ingresoAlMes ?? 0)).map((e) => ({
            clave: e.clave, codigo: e.codigo, sub: e.clientes.join(", ") || e.tipo,
            valor: plata ? pesos(e.ingresoAlMes ?? 0) : null, boton: "Ver ficha", onClick: ficha(e),
          })),
        };
      case "vence": {
        const lista = en("vence").sort((a, b) => a.vence!.dias - b.vence!.dias);
        return {
          titulo: `${NOMBRE_DE_LA_CAPA.vence} · ${lista.length} espacio${lista.length === 1 ? "" : "s"}`,
          sub: plata ? `Sin renovar: ${pesos(datos.vence90.alMes ?? 0)} al mes en ${datos.vence90.contratos} contrato${datos.vence90.contratos === 1 ? "" : "s"}.` : `${datos.vence90.contratos} contrato${datos.vence90.contratos === 1 ? "" : "s"} sin renovar.`,
          items: lista.map((e) => ({
            clave: e.clave, codigo: e.vence!.codigo,
            sub: `${e.vence!.proveedor ?? "Sin proveedor"} · vence el ${fecha(e.vence!.fecha)} · ${e.vence!.dias} día${e.vence!.dias === 1 ? "" : "s"}`,
            valor: plata && e.vence!.alMes !== null ? pesos(e.vence!.alMes) : null, boton: "Gestionar renovación", onClick: ficha(e),
          })),
        };
      }
      case "montaje": {
        const orden = ["no_realizado", "no_coincide", "sin_montar", "guia", "por_verificar"];
        const lista = [...montajes].sort((a, b) => orden.indexOf(a.montaje!) - orden.indexOf(b.montaje!));
        return {
          titulo: `${NOMBRE_DE_LA_CAPA.montaje} · ${lista.length}`,
          sub: "Contratos que ya corren sin montar, montajes que no se pudieron hacer y planogramas por verificar.",
          items: lista.map((e) => ({
            clave: e.clave, codigo: e.codigo,
            sub: `${TEXTO_DEL_MONTAJE[e.montaje!].replace(/^./, (c) => c.toUpperCase())}${e.montajeDetalle ? ` · ${e.montajeDetalle}` : ""}`,
            valor: null, boton: e.montaje === "guia" || e.montaje === "sin_montar" ? "Mandar la guía" : e.montaje === "por_verificar" ? "Verificar" : "Ver detalle",
            onClick: () => manejo.onMontaje(e.clave),
          })),
        };
      }
      case "vacias":
        return {
          titulo: `${NOMBRE_DE_LA_CAPA.vacias} · ${vacias.length}`,
          sub: plata ? `${pesos(suma(vacias.map((e) => e.tarifa)))} al mes a tarifa.${faltanParaMeta > 0 ? ` Para la meta de ${datos.ocupacion.meta} % faltan ${faltanParaMeta} caras.` : ""}` : `${vacias.length} de ${comerciales.length} caras sin contrato hoy.`,
          items: [...vacias].sort((a, b) => (b.tarifa ?? 0) - (a.tarifa ?? 0) || a.codigo.localeCompare(b.codigo)).map((e) => ({
            clave: e.clave, codigo: e.codigo,
            sub: `${e.tipo} · ${e.nuncaContratada ? "Nunca contratada" : e.diasSinContrato !== null ? `${e.diasSinContrato} días sin contrato` : "Sin contrato"}`,
            valor: plata && e.tarifa !== null ? pesos(e.tarifa) : null, ...proponer(e),
          })),
        };
      case "parcial":
        return {
          titulo: `${NOMBRE_DE_LA_CAPA.parcial} · ${parciales.length} cara${parciales.length === 1 ? "" : "s"}`,
          sub: plata ? `${pesos(suma(parciales.map((e) => e.libreAlMes)))} al mes disponibles en caras que ya tienen clientes. Ordenadas por valor disponible.` : "Caras con algo vendido y lugar para vender más.",
          items: [...parciales].sort((a, b) => (b.libreAlMes ?? 0) - (a.libreAlMes ?? 0)).map((e) => ({
            clave: e.clave, codigo: e.codigo, sub: [e.detalleParcial, e.clientes.join(", ")].filter(Boolean).join(" · "),
            valor: plata && e.libreAlMes !== null ? pesos(e.libreAlMes) : null, ...proponer(e),
          })),
        };
      case "cliente": {
        const c = datos.cliente;
        const lista = en("cliente");
        return {
          titulo: c ? `${c.nombre} · ${lista.length} espacio${lista.length === 1 ? "" : "s"}` : "Cliente",
          sub: c && plata && c.alMes !== null ? `${pesos(c.alMes)} al mes${c.pct !== null ? `, ${c.pct} % del ingreso de la sede` : ""}.` : "Los espacios donde tiene contrato.",
          items: lista.map((e) => {
            const suyos = e.contratos.filter((k) => k.proveedor === c?.nombre);
            const hasta = suyos.map((k) => k.hasta).sort().pop();
            const vence = e.vence && e.vence.proveedor === c?.nombre;
            return {
              clave: e.clave, codigo: e.codigo,
              sub: `${e.tipo}${hasta ? ` · ${vence ? "vence" : "hasta"} el ${fecha(hasta)}` : ""}${e.estado === "parcial" && e.detalleParcial ? ` · ${e.detalleParcial} al lado` : ""}`,
              valor: plata ? pesos(suma(suyos.map((k) => k.alMes))) : null,
              ...(e.estado === "parcial" && plata ? { boton: "Proponer ampliación", onClick: () => manejo.onPropuesta(e.clave) }
                : { boton: vence ? "Gestionar renovación" : "Ver ficha", onClick: ficha(e) }),
            };
          }),
        };
      }
    }
  })();
  const LIMITE = 8;
  const visibles = todos ? panel.items : panel.items.slice(0, LIMITE);

  // Lo que el mapa numera: las acciones de la lista, una por espacio.
  const accionesEnElMapa: AccionEnElMapa[] = [];
  datos.acciones.slice(0, LIMITE).forEach((a, k) => {
    if (porClave.has(a.clave) && !accionesEnElMapa.some((x) => x.clave === a.clave)) {
      accionesEnElMapa.push({ clave: a.clave, n: k + 1, texto: a.corto, prioridad: prioridadDe(a) });
    }
  });
  const clienteDelMapa = datos.cliente
    ? { nombre: datos.cliente.nombre, detalle: `${datos.cliente.espacios} espacio${datos.cliente.espacios === 1 ? "" : "s"}${plata && datos.cliente.alMes !== null ? ` · ${pesos(datos.cliente.alMes)} al mes` : ""}` }
    : null;

  const tarjeta = (ind: Indicador) => {
    const on = capa === ind.capa;
    return (
      <button key={ind.capa} type="button" className={`mo-ind${on ? " on" : ""}`} data-indicador={ind.capa} data-metrica={METRICA_DEL_INDICADOR[ind.capa]} aria-pressed={fija === ind.capa}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") setSenalada(ind.capa); }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") setSenalada(null); }}
        onFocus={() => setSenalada(ind.capa)}
        onBlur={() => setSenalada(null)}
        onClick={() => { setFija((f) => (f === ind.capa ? null : ind.capa)); setTodos(false); }}>
        <span className="l">{ind.titulo}<span className="ancla">{ind.ancla}</span></span>
        <span className="v">{ind.valor}</span>
        <span className="d">{ind.detalle}</span>
        {ind.estado && <Estado {...ind.estado} />}
        {on && <span className="mostrando">{fija === ind.capa ? "Fijo en el mapa · tocá de nuevo para soltar" : "Resaltado en el mapa"}</span>}
      </button>
    );
  };

  const ocup = contraLaMeta(datos.ocupacion.pct, datos.ocupacion.meta);
  const realizacion = plata && datos.potencial ? Math.round(((datos.canon ?? 0) / datos.potencial) * 100) : null;

  return (
    <div className="mo" data-mapa-de-oportunidades>
      <div className="mo-metas">
        <div className="mo-meta">
          <span className="t">Ocupación</span>
          <b>{datos.ocupacion.pct} %</b>
          <div className="mo-medidor" role="img" aria-label={`Ocupación ${datos.ocupacion.pct} %, meta ${datos.ocupacion.meta} %`}>
            <div style={{ width: `${Math.min(100, datos.ocupacion.pct)}%` }} /><span style={{ left: `${Math.min(100, datos.ocupacion.meta)}%` }} />
          </div>
          <span className="n">{datos.ocupacion.ocupadas} de {datos.ocupacion.total} caras · meta {datos.ocupacion.meta} %{ocup !== "ok" ? "" : " · en la meta"}</span>
        </div>
        {plata && realizacion !== null ? (
          <div className="mo-meta">
            <span className="t">Realización del potencial</span>
            <b>{realizacion} %</b>
            <div className="mo-medidor" role="img" aria-label={`Realización del potencial ${realizacion} %`}><div style={{ width: `${Math.min(100, realizacion)}%` }} /></div>
            <span className="n">de {plata && pesos(datos.potencial ?? 0)} a tarifa</span>
          </div>
        ) : (
          <div className="mo-meta">
            <span className="t">Por vencer · 90 días</span>
            <b>{datos.vence90.contratos}</b>
            <span className="n">contrato{datos.vence90.contratos === 1 ? "" : "s"} sin renovar</span>
          </div>
        )}
        {plata && datos.precio ? (
          <div className="mo-meta">
            <span className="t">Precio frente a tarifa</span>
            <b>{datos.precio.pct} %</b>
            <div className="mo-medidor" role="img" aria-label={`Precio frente a tarifa ${datos.precio.pct} %, meta ${datos.precio.meta} %`}>
              <div style={{ width: `${Math.min(100, (datos.precio.pct / 120) * 100)}%` }} /><span style={{ left: `${(datos.precio.meta / 120) * 100}%` }} />
            </div>
            <span className="n">meta {datos.precio.meta} % · {datos.precio.contadas} contrato{datos.precio.contadas === 1 ? "" : "s"} con tarifa</span>
          </div>
        ) : (
          <div className="mo-meta">
            <span className="t">Montajes del mes</span>
            <b>{datos.montajesDelMes.enLaTienda} de {datos.montajesDelMes.total}</b>
            <span className="n">de los contratos que empiezan este mes, en la tienda</span>
          </div>
        )}
        <div className="mo-meta">
          <span className="t">Pendientes</span>
          <b>{datos.pendientes.total}</b>
          <button type="button" className="mo-link" onClick={() => manejo.onPendientes(datos.pendientes.hoy ? "hoy" : undefined)}>
            {datos.pendientes.hoy ? `${datos.pendientes.hoy} para hoy ›` : "Ver los pendientes ›"}
          </button>
        </div>
      </div>

      <div className="mo-grilla">
        <div className="mo-rail" aria-label="Indicadores de ingreso y operación">{izq.map(tarjeta)}</div>
        <section className="mo-mapa" aria-label="Mapa de decisión">
          <div className="mo-mapa-cab">
            <h3>Mapa de decisión · {datos.sede}</h3>
            <span className="mo-capa" data-capa-activa={capa}>{capa === "cliente" && datos.cliente ? `Cliente: ${datos.cliente.nombre}` : NOMBRE_DE_LA_CAPA[capa]}</span>
            <button type="button" className="mo-link der" onClick={manejo.onPlanoParaContratar}>
              Plano para contratar <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <Leyenda capa={capa} verPlata={plata} />
          <MapaDeDecision
            fixtures={datos.fixtures}
            espacios={porClave}
            capa={capa}
            cliente={clienteDelMapa}
            acciones={accionesEnElMapa}
            verPlata={plata}
            onElegir={(clave) => {
              const item = panel.items.find((x) => x.clave === clave);
              if (item) item.onClick(); else manejo.onFicha(clave);
            }}
            resaltada={enLaLista}
            descripcion={`Mapa de ${datos.sede}: ${NOMBRE_DE_LA_CAPA[capa]}. La misma información está en la lista de abajo.`}
          />
        </section>
        <div className="mo-rail" aria-label="Indicadores de capacidad y clientes">{der.map(tarjeta)}</div>
      </div>

      <section className="mo-panel" data-panel-capa={capa}>
        <div className="mo-panel-cab">
          <div>
            <h3>{panel.titulo}</h3>
            <p>{panel.sub}</p>
          </div>
          {capa === "acciones"
            ? <button type="button" className="mo-link" onClick={() => manejo.onPendientes()}>Ver los {datos.pendientes.total} en Pendientes ›</button>
            : capa !== "cliente" && <button type="button" className="mo-link" onClick={() => manejo.onTabla(capa)}>Ver como tabla ›</button>}
        </div>
        {visibles.length > 0 && (
          <ul className="mo-esps">
            {visibles.map((it, k) => (
              <li key={`${it.clave ?? it.codigo}-${k}`} className="mo-esp" data-espacio={it.clave ?? undefined}
                onPointerEnter={(e) => { if (e.pointerType !== "touch") setEnLaLista(it.clave); }}
                onPointerLeave={() => setEnLaLista(null)}
                onFocus={() => setEnLaLista(it.clave)} onBlur={() => setEnLaLista(null)}>
                <code>{it.codigo}</code>
                {it.valor && <span className="m">{it.valor}</span>}
                <span className="s">{it.sub}</span>
                <button type="button" className={k === 0 ? "btn-principal mo-accion" : "mo-accion sec"} onClick={it.onClick}>{it.boton}</button>
              </li>
            ))}
          </ul>
        )}
        {panel.items.length > LIMITE && (
          <button type="button" className="mo-link mas" onClick={() => setTodos((t) => !t)}>
            {todos ? "Ver menos" : `Ver los ${panel.items.length}`}
          </button>
        )}
      </section>
    </div>
  );
}
