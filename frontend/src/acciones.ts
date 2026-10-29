import type { Modulo } from "./modulos";
import type { PedidoALaPantalla, TemaDeAjustes } from "./store/armazonStore";
import type { GrupoDeRevision } from "./components/Supervisar/paraRevisar";

/**
 * Todas las funciones de RECABRA por su nombre (rediseño UX 2026-10, etapa 8).
 *
 * UN registro para tres cosas: el buscador de funciones (Ctrl K), el menú
 * «Más» de cada módulo y lo que cada persona fija en su barra. Así ninguna
 * función queda escondida: si existe, se encuentra por su nombre o por cómo le
 * dice la gente («planilla», «reno», «backup»).
 *
 * Lo que hace cada una lo resuelve el armazón (`ContextoDeAccion`): cambiar de
 * módulo, abrir Ajustes en un tema, abrir Pendientes o pedirle algo a la
 * pantalla comercial. Nada de esto lleva plata.
 */

export interface ContextoDeAccion {
  ir: (m: Modulo) => void;
  navegar: (ruta: string) => void;
  abrirAjustes: (tema: TemaDeAjustes) => void;
  abrirPendientes: (grupo?: GrupoDeRevision | null) => void;
  pedir: (p: PedidoALaPantalla) => void;
  abrirTarifas: () => void;
  abrirTemporadas: () => void;
  abrirAyuda: () => void;
  mostrarConfiguracionInicial: () => void;
}

export interface Accion {
  id: string;
  texto: string;
  /** Para qué sirve, en una línea. */
  detalle: string;
  /** Dónde vive (el grupo del mapa de funciones). */
  donde: "Inicio" | "Contratos" | "Indicadores" | "Montajes" | "Plano de la sede" | "Ajustes" | "Ayuda";
  /** Cómo más le dice la gente: el buscador también las mira. */
  sinonimos: readonly string[];
  /** Sólo administración. */
  admin: boolean;
  /** En qué módulos aparece en «Más» (lo raro o peligroso de ese módulo). */
  mas?: readonly Modulo[];
  hacer: (c: ContextoDeAccion) => void;
}

export const ACCIONES: readonly Accion[] = [
  { id: "nuevo-contrato", texto: "Nuevo contrato", detalle: "Elegí las fechas y el espacio, y armá el contrato.", donde: "Contratos",
    sinonimos: ["contratar", "vender", "alquilar", "arrendar"], admin: true, hacer: (c) => c.ir("contratos") },
  { id: "renovar", texto: "Renovar contrato", detalle: "Los que vencen en los próximos 30 días, con «Renovar» o «No renovar».", donde: "Contratos",
    sinonimos: ["renovacion", "prorrogar", "extender", "vence", "vencimiento"], admin: true, hacer: (c) => c.abrirPendientes("dias30") },
  { id: "planilla", texto: "Cargar contratos desde planilla", detalle: "Una tanda de contratos desde un Excel o un CSV.", donde: "Contratos",
    sinonimos: ["planilla", "excel", "csv", "importar", "cargar", "subir contratos"], admin: true, mas: ["contratos"],
    hacer: (c) => { c.ir("contratos"); c.pedir("planilla"); } },
  { id: "tarifas", texto: "Tarifas de referencia", detalle: "El canon mensual de referencia por tipo de mueble, general y por sede.", donde: "Ajustes",
    sinonimos: ["tarifa", "precio", "precios", "lista de precios", "canon de referencia"], admin: true, mas: ["contratos", "indicadores"],
    hacer: (c) => c.abrirTarifas() },
  { id: "temporadas", texto: "Temporadas", detalle: "Las fechas de cada temporada comercial y si se vende.", donde: "Ajustes",
    sinonimos: ["temporada", "navidad", "halloween", "fechas especiales", "calendario"], admin: true, mas: ["contratos"],
    hacer: (c) => c.abrirTemporadas() },
  { id: "pendientes", texto: "Ver Pendientes", detalle: "Lo que hay que resolver: hoy, los próximos 30 días y lo que no cuadra.", donde: "Inicio",
    sinonimos: ["pendiente", "revisar", "para revisar", "alertas", "vencidos", "inconsistencias"], admin: false,
    hacer: (c) => c.abrirPendientes(null) },
  { id: "inicio", texto: "Inicio", detalle: "Hoy en la sede: lo que vence, lo que se monta y las cifras del mes.", donde: "Inicio",
    sinonimos: ["hoy", "principal", "tablero"], admin: false, hacer: (c) => c.ir("inicio") },
  { id: "indicadores", texto: "Resumen de Indicadores", detalle: "Ocupación, canon y montajes contra la meta.", donde: "Indicadores",
    sinonimos: ["kpi", "resumen", "metricas", "ocupacion", "reporte", "supervisar"], admin: false, hacer: (c) => c.ir("indicadores") },
  { id: "diccionario", texto: "Diccionario de métricas", detalle: "La fórmula, el periodo, la comparación y la meta de cada cifra.", donde: "Indicadores",
    sinonimos: ["glosario", "definiciones", "formula", "como se calcula"], admin: false, mas: ["indicadores"],
    hacer: (c) => { c.ir("indicadores"); c.pedir("diccionario"); } },
  { id: "metas", texto: "Metas por sede", detalle: "La ocupación y el canon ÷ tarifa que se esperan en cada sede.", donde: "Ajustes",
    sinonimos: ["meta", "objetivo", "umbral"], admin: true, mas: ["indicadores"], hacer: (c) => c.abrirAjustes("comercial") },
  { id: "montajes", texto: "Montajes", detalle: "Lo contratado y lo planificado, montado y verificado.", donde: "Montajes",
    sinonimos: ["montaje", "registrar montaje", "foto", "verificar", "mercaderista"], admin: false, hacer: (c) => c.ir("montajes") },
  { id: "plano", texto: "Plano 2D", detalle: "Colocar y editar los muebles a escala.", donde: "Plano de la sede",
    sinonimos: ["plano", "mapa", "muebles", "dibujar", "layout"], admin: true, hacer: (c) => c.ir("plano") },
  { id: "plano3d", texto: "Plano 3D", detalle: "La sede en 3D, para mostrarla al proveedor.", donde: "Plano de la sede",
    sinonimos: ["3d", "presentar", "proveedor", "recorrido"], admin: true, hacer: (c) => c.ir("plano3d") },
  { id: "renumerar", texto: "Ordenar códigos", detalle: "Renumerar el plano siguiendo el recorrido, con el informe antes → después.", donde: "Plano de la sede",
    sinonimos: ["renumerar", "numerar", "codigos", "reordenar", "renombrar codigos"], admin: true, mas: ["plano", "plano3d"],
    hacer: (c) => c.navegar("/renumerar") },
  { id: "taller", texto: "Mis muebles", detalle: "Crear, editar, retirar o reactivar los muebles del supermercado, con sus medidas.", donde: "Plano de la sede",
    sinonimos: ["taller", "fichas", "muebles propios", "modelos", "crear mueble", "catalogo de muebles"], admin: true, mas: ["plano", "plano3d"],
    hacer: (c) => c.ir("muebles") },
  { id: "caras", texto: "Caras: qué va en cada una", detalle: "Todas las caras de la sede: cuáles faltan repartir, cuáles están listas y cómo va su montaje.", donde: "Plano de la sede",
    sinonimos: ["caras", "planograma", "planogramas", "distribuir", "repartir", "no comercializable", "categorias", "marca propia"], admin: true, mas: ["plano", "plano3d"],
    hacer: (c) => c.ir("caras") },
  { id: "banco", texto: "Banco de prueba de muebles", detalle: "Mirar la forma de un mueble, el producto adentro y la luz, sin nada alrededor.", donde: "Plano de la sede",
    sinonimos: ["banco", "taller", "probar mueble", "luz", "carta de color"], admin: true, mas: ["muebles"],
    hacer: (c) => c.navegar("/taller/banco") },
  { id: "sedes", texto: "Sedes: crear, renombrar, eliminar", detalle: "Las sedes del supermercado.", donde: "Ajustes",
    sinonimos: ["sede", "sucursal", "tienda", "local", "crear sede", "borrar sede"], admin: true, mas: ["plano"],
    hacer: (c) => c.abrirAjustes("sede") },
  { id: "nombres", texto: "Nombres de los muebles", detalle: "Cómo se llama cada familia de muebles en este supermercado.", donde: "Ajustes",
    sinonimos: ["nombre propio", "como le dicen", "familia"], admin: true, hacer: (c) => c.abrirAjustes("sede") },
  { id: "avisos", texto: "Avisos por correo", detalle: "Destinatarios, días de recordatorio y responsables por sede.", donde: "Ajustes",
    sinonimos: ["correo", "aviso", "notificacion", "recordatorio", "responsable", "email"], admin: true, hacer: (c) => c.abrirAjustes("avisos") },
  { id: "usuarios", texto: "Usuarios e invitaciones", detalle: "Invitar por correo con su rol, activar o desactivar.", donde: "Ajustes",
    sinonimos: ["equipo", "invitar", "usuario", "rol", "permiso", "acceso"], admin: true, hacer: (c) => c.abrirAjustes("equipo") },
  { id: "permisos", texto: "Quién publica planogramas", detalle: "Sólo administración, o también el equipo en muebles internos.", donde: "Ajustes",
    sinonimos: ["planograma", "publicar", "permisos"], admin: true, hacer: (c) => c.abrirAjustes("equipo") },
  { id: "suscripcion", texto: "Suscripción y facturación", detalle: "Estado, próxima cuenta de cobro y cómo pagar.", donde: "Ajustes",
    sinonimos: ["pago", "factura", "cobro", "plan", "suscripcion"], admin: true, hacer: (c) => c.abrirAjustes("cuenta") },
  { id: "copia", texto: "Copia de seguridad", detalle: "Un ZIP con todo: contratos, planos, montajes y archivos.", donde: "Ajustes",
    sinonimos: ["backup", "zip", "respaldo", "descargar todo"], admin: true, hacer: (c) => c.abrirAjustes("cuenta") },
  { id: "mis-datos", texto: "Mis datos", detalle: "Descargarlos o pedir la supresión.", donde: "Ajustes",
    sinonimos: ["privacidad", "supresion", "habeas data", "datos personales"], admin: true, hacer: (c) => c.abrirAjustes("cuenta") },
  { id: "bitacora", texto: "Bitácora", detalle: "Quién hizo qué y cuándo.", donde: "Ajustes",
    sinonimos: ["historial", "registro", "auditoria", "quien hizo"], admin: true, hacer: (c) => c.abrirAjustes("cuenta") },
  { id: "config-inicial", texto: "Configuración inicial", detalle: "Los seis pasos para dejar el supermercado listo.", donde: "Ajustes",
    sinonimos: ["empezar", "primeros pasos", "configurar", "onboarding"], admin: true,
    hacer: (c) => c.mostrarConfiguracionInicial() },
  { id: "ayuda", texto: "Ayuda de esta pantalla", detalle: "Qué hace la pantalla y qué quiere decir cada término.", donde: "Ayuda",
    sinonimos: ["ayuda", "como funciona", "que es", "?"], admin: false, hacer: (c) => c.abrirAyuda() },
];

/** Las palabras sin tildes ni mayúsculas, para comparar. */
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** ¿La búsqueda encuentra este texto? Cada palabra buscada tiene que estar al
 *  principio de alguna palabra del texto («reno» → «renovar», «renumerar»). */
export function coincide(busqueda: string, ...textos: readonly string[]): boolean {
  const q = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (q.length === 0) return true;
  const palabras = textos.flatMap((t) => normalizar(t).split(/[^a-z0-9?]+/).filter(Boolean));
  const juntos = textos.map(normalizar).join(" ");
  return q.every((w) => palabras.some((p) => p.startsWith(w)) || juntos.includes(w));
}

/** Las acciones que encuentra una búsqueda, para un rol. */
export function buscarAcciones(busqueda: string, esAdmin: boolean): Accion[] {
  return ACCIONES.filter((a) => (esAdmin || !a.admin) && coincide(busqueda, a.texto, a.detalle, ...a.sinonimos));
}

/** Lo de «Más» de un módulo, para un rol. */
export function accionesDeMas(modulo: Modulo, esAdmin: boolean): Accion[] {
  return ACCIONES.filter((a) => (esAdmin || !a.admin) && a.mas?.includes(modulo));
}

/** Cada persona fija hasta 3 funciones de «Más» en su barra. */
export const MAXIMO_FIJADAS = 3;

export function alternarFijada(fijadas: readonly string[], id: string): string[] {
  if (fijadas.includes(id)) return fijadas.filter((x) => x !== id);
  if (fijadas.length >= MAXIMO_FIJADAS) return [...fijadas];
  return [...fijadas, id];
}

/** El glosario: los términos que aparecen en las pantallas. */
export const GLOSARIO: readonly { termino: string; definicion: string; sinonimos?: readonly string[]; modulos: readonly Modulo[] }[] = [
  { termino: "Canon", definicion: "Lo que paga el proveedor al mes por un espacio. Un contrato de tres meses por un total se reparte en sus meses.", sinonimos: ["alquiler", "arriendo"], modulos: ["inicio", "contratos", "indicadores"] },
  { termino: "Tarifa de referencia", definicion: "El canon mensual sugerido por tipo de mueble (general o de la sede). Sirve para comparar lo que se cobra.", modulos: ["contratos", "indicadores"] },
  { termino: "Canon ÷ tarifa", definicion: "Cuánto de la tarifa de referencia se está cobrando: 100 % es cobrar exactamente la tarifa.", modulos: ["indicadores"] },
  { termino: "Ocupación", definicion: "Las caras que se venden y tienen contrato hoy, sobre todas las que se venden.", modulos: ["inicio", "indicadores"] },
  { termino: "Cara", definicion: "Un lado de un mueble que se vende por separado: una góndola doble tiene cara A y cara B.", modulos: ["contratos", "plano", "plano3d", "indicadores", "caras"] },
  { termino: "Parte", definicion: "Una porción de una cara que se vende sola: una puerta de una nevera, un entrepaño.", modulos: ["contratos", "plano", "montajes"] },
  { termino: "Participación", definicion: "Un porcentaje de una cara que se vende a una marca; su lugar en la cara se dibuja al distribuirla.", sinonimos: ["porcentaje"], modulos: ["contratos", "plano3d", "indicadores", "montajes"] },
  { termino: "Reserva provisional", definicion: "Un espacio apartado para un proveedor hasta una fecha; si no se confirma como contrato, caduca.", sinonimos: ["reserva"], modulos: ["contratos", "inicio"] },
  { termino: "Planometría", definicion: "La imagen o el PDF de cómo tiene que quedar armada la exhibición de un contrato. Sin ella, el aviso de montaje no sale.", modulos: ["montajes", "contratos"] },
  { termino: "Planograma", definicion: "Qué va en cada lugar de una cara que no se vende (o de lo disponible), por destinos y porcentajes. Se publica por versiones.", modulos: ["plano", "montajes", "caras"] },
  { termino: "Montaje verificado", definicion: "Administración puso la foto del montaje al lado de lo pedido y dijo si coincide.", sinonimos: ["verificar"], modulos: ["montajes", "indicadores"] },
  { termino: "Temporada", definicion: "Un periodo comercial con fechas (Navidad, Halloween) que ayuda a elegir para qué fechas se vende.", modulos: ["contratos"] },
  { termino: "Sede", definicion: "Cada local del supermercado, con su plano. Se elige arriba, en la barra.", sinonimos: ["sucursal", "tienda"], modulos: ["inicio", "contratos", "indicadores", "montajes", "plano", "plano3d"] },
];

export function buscarEnElGlosario(busqueda: string): typeof GLOSARIO[number][] {
  if (!normalizar(busqueda)) return [];
  return GLOSARIO.filter((g) => coincide(busqueda, g.termino, ...(g.sinonimos ?? [])));
}

/** Qué hace cada pantalla: la ayuda «?». */
export const AYUDA_DE_LA_PANTALLA: Record<Modulo, { titulo: string; que: string; pasos: readonly string[] }> = {
  inicio: { titulo: "Inicio", que: "Lo de hoy en la sede: lo que vence, lo que se monta, las reservas que caducan y, para administración, las cifras del mes.",
    pasos: ["Tocá una fila para abrir la ficha del espacio.", "«Pendientes», arriba, junta todo lo que hay que resolver."] },
  contratos: { titulo: "Contratos", que: "Vender un espacio: primero las fechas, después el espacio en el plano o en la línea de tiempo, y el contrato se lee como una frase antes de guardarlo.",
    pasos: ["Elegí para qué fechas.", "Tocá un espacio disponible (en verde) en el plano o un hueco en la línea de tiempo.", "Completá proveedor, vigencia y canon, y guardá."] },
  indicadores: { titulo: "Indicadores", que: "Cómo va la sede contra su meta: ocupación, canon, lo que vence y los montajes. Cada cifra tiene su «?» con la fórmula.",
    pasos: ["Resumen: las tarjetas con su lectura.", "Las pestañas abren el plano, la tabla, quién paga, todas las sedes, el detalle y el diccionario.", "Cada tabla se baja en CSV."] },
  montajes: { titulo: "Montajes", que: "Que lo contratado y lo planificado esté en la tienda como se pidió: contratos y planogramas en una sola lista, con su estado.",
    pasos: ["Filtrá por estado.", "Registrá un montaje con su foto.", "Administración verifica: la planometría al lado de la foto."] },
  plano: { titulo: "Plano de la sede", que: "Donde se arma el supermercado: los muebles a escala. Editar para colocar y mover; Mirar para recorrerlo.",
    pasos: ["Tocá o arrastrá un tipo de la tira de la izquierda al plano.", "Tocá un mueble para ver su ficha.", "«Revisar» lista códigos repetidos, muebles encimados y pasillos angostos."] },
  plano3d: { titulo: "Plano 3D", que: "La sede en 3D, para mostrarla y para la reunión con el proveedor.",
    pasos: ["Es para mirar: los muebles se colocan, mueven y borran en el 2D.", "Cenital para ver la planta; Primera persona para caminar (WASD).", "Elegí un mueble para probar un producto o distribuir su cara; «Presentar» deja la vista lista para el proveedor."] },
  muebles: { titulo: "Mis muebles", que: "Los muebles de tu supermercado que miden otra cosa que el estándar: se arman una vez, con sus medidas, y quedan en el catálogo del plano para colocarlos.",
    pasos: ["«Crear un mueble»: qué mueble es, cuánto mide, y nombre y cómo se vende.", "Mientras escribís, a la derecha se dibuja en 3D.", "Al guardarlo, «Colocarlo en el plano» vuelve al 2D con el mueble listo para soltar.", "Retirar no borra nada: lo ya colocado sigue igual, y se reactiva desde «Retirados»."] },
  caras: { titulo: "Caras", que: "Todas las caras de la sede en una lista: cuáles faltan repartir, cuáles tienen un borrador sin publicar, cuáles piden revisión y cuáles están listas, con cómo va su montaje.",
    pasos: ["Arriba, cuántas hay en cada estado; tocá uno para ver sólo esas.", "Arranca con los muebles que no se venden; «Lo libre» muestra lo que queda sin vender de los que sí.", "Cada fila tiene su botón: «Distribuir la cara», «Seguir y publicar», «Nueva versión» o «Revisar el montaje».", "Al salir de la cara, volvés a esta lista con el estado al día."] },
};
