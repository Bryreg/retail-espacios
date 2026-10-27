import { contractPhase, isDoubleGondola, isRentable } from "../types/fixtures";
import type { UnifiedFixture } from "../types/fixtures";
import type { ContactBook, UsuariosResponse } from "../api/auth";

/**
 * Los seis pasos de la configuración inicial (rediseño UX 2026-10, etapa 8),
 * armados con lo que el supermercado ya tiene. Pura: la prueba
 * `probar-ajustes` la corre con datos inventados; la pantalla es
 * `components/Inicio/ConfiguracionInicial.tsx`.
 */
export interface PasoInicial {
  n: number;
  titulo: string;
  hecho: boolean;
  /** Lo que falta o lo ya hecho, con los datos de verdad. */
  detalle: string;
  /** Qué abre el botón del paso. */
  ir: "ajustes-sede" | "plano" | "tarifas" | "ajustes-avisos" | "ajustes-equipo" | "contratos";
  boton: string;
}

/** Cuántos espacios se venden en un mueble: sus caras que se venden. */
function contratables(f: UnifiedFixture): number {
  if (!isRentable(f)) return 0;
  return isDoubleGondola(f) && f.faceB ? 2 : 1;
}

/** Los seis pasos, armados con lo que el supermercado ya tiene. Pura: la
 *  prueba `probar-ajustes` la corre con datos inventados. */
export function pasosIniciales(d: {
  sedes: readonly string[];
  porSede: Record<string, readonly UnifiedFixture[]>;
  tarifas: number;
  contactos: ContactBook | null;
  usuarios: UsuariosResponse | null;
}): PasoInicial[] {
  const conPlano = d.sedes.filter((s) => (d.porSede[s] ?? []).length > 0);
  const sinPlano = d.sedes.filter((s) => (d.porSede[s] ?? []).length === 0);
  const planos = conPlano.map((s) => {
    const fx = d.porSede[s] ?? [];
    return `${s}: ${fx.length} ${fx.length === 1 ? "mueble" : "muebles"}, ${fx.reduce((t, f) => t + contratables(f), 0)} espacios contratables`;
  });
  const faltanResp = d.contactos ? d.sedes.flatMap((s) => {
    const c = d.contactos!.by_sede[s];
    const f: string[] = [];
    if (!c?.admin?.length) f.push("administración");
    if (!c?.mercaderista?.length) f.push("montaje");
    return f.length ? [`${s}: falta ${f.join(" y ")}`] : [];
  }) : null;
  const personas = d.usuarios ? d.usuarios.miembros.length + d.usuarios.invitaciones.length : null;
  const contratos = d.sedes.reduce((t, s) => t + (d.porSede[s] ?? []).filter((f) => {
    const caras = [f, ...(f.faceB ? [f.faceB] : [])] as { status?: string; startDate?: string; endDate?: string }[];
    return caras.some((c) => { const fase = contractPhase({ status: (c.status ?? "free") as never, startDate: c.startDate ?? "", endDate: c.endDate ?? "" }); return fase === "vigente" || fase === "pendiente"; });
  }).length, 0);
  return [
    { n: 1, titulo: "Crear las sedes", hecho: d.sedes.length > 0, ir: "ajustes-sede", boton: "Crear las sedes",
      detalle: d.sedes.length ? `${d.sedes.length === 1 ? "La sede" : "Las sedes"}: ${d.sedes.join(", ")}.` : "Todavía no hay sedes." },
    { n: 2, titulo: "Dibujar el plano de cada sede", hecho: d.sedes.length > 0 && sinPlano.length === 0, ir: "plano", boton: "Dibujar el plano",
      detalle: [planos.join(" · "), sinPlano.length ? `Sin plano: ${sinPlano.join(", ")}.` : ""].filter(Boolean).join(" ") || "Ninguna sede tiene plano todavía." },
    { n: 3, titulo: "Definir las tarifas", hecho: d.tarifas > 0, ir: "tarifas", boton: "Definir las tarifas",
      detalle: d.tarifas > 0 ? `${d.tarifas} ${d.tarifas === 1 ? "tipo de mueble tiene" : "tipos de mueble tienen"} tarifa de referencia.` : "Sin tarifas, Indicadores no puede comparar el canon contra la tarifa." },
    { n: 4, titulo: "Definir responsables por sede", hecho: faltanResp !== null && faltanResp.length === 0, ir: "ajustes-avisos", boton: "Definir responsables",
      detalle: faltanResp === null ? "Leyendo los responsables…" : faltanResp.length ? `${faltanResp.join(" · ")}. Sin responsable de montaje, el aviso de montaje no le llega a nadie.` : "Cada sede tiene administración y montaje." },
    { n: 5, titulo: "Invitar al equipo", hecho: personas !== null && personas > 1, ir: "ajustes-equipo", boton: "Invitar al equipo",
      detalle: personas === null ? "Leyendo el equipo…" : personas > 1 ? `${personas} personas entre miembros e invitaciones.` : "Sólo estás vos." },
    { n: 6, titulo: "Registrar el primer contrato", hecho: contratos > 0, ir: "contratos", boton: "Registrar un contrato",
      detalle: contratos > 0 ? `${contratos} ${contratos === 1 ? "mueble tiene" : "muebles tienen"} contrato.` : "Registralo, o cargá los que ya existen desde una planilla." },
  ];
}

