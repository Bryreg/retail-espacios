import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { useAuthStore } from "../store/authStore";
import { confirmMount, fetchMounts, latestByCode, type MountConfirmation } from "../api/mounts";
import { reportesPorCodigo, reporteDelContrato } from "../utils/montajeDelContrato";
import { contractPhase, fullSpaceCode, isRentable, isDoubleGondola } from "../types/fixtures";
import { planometriaDelEspacio, planometriaUrl } from "../api/planograms";
import FormularioMontaje, {
  type EspacioAMontar, type PlanoDelEspacio,
} from "../components/Montaje/FormularioMontaje";
import type { UnifiedFixture } from "../types/fixtures";
import { nombreDeMueble } from "../utils/nomenclatura";
// El tipo de cada espacio, como le dicen acá («tope de góndola»): la lista y el
// formulario del montaje.
import { conNombrePropio } from "../catalogo/nombresPropios";
import {
  cantidadDe, codigoDeParte, esParticipacion, esPieza, indiceDePartes, partirCodigo, piezasDeLaFamilia, sufijoDeParte,
  textoDeParticipacionParaMontar, textoParaMontar, type ParteRef,
} from "../utils/partes";

/** Una cara de un mueble que hay que montar, con lo que ordena la lista. */
interface Pendiente extends EspacioAMontar {
  /** El contrato ya arrancó hace poco: montarlo tarde es plata que el proveedor
   *  reclama. */
  urgente: boolean;
  /** Arrancó hace más de un mes y nunca se reportó. La exhibición está armada
   *  hace rato — lo que falta es el papel. Se deja en la lista para poder
   *  reportarlo, pero al final: si va arriba, entierra el trabajo de hoy. */
  viejo: boolean;
}

/** Días hacia atrás en que todavía tiene sentido tratar un montaje como
 *  pendiente de verdad. Espeja la ventana del tablero. */
const VENTANA_DIAS = 30;

/** Lo que dice la fila de una parte vendida: cuál es y contada desde dónde
 *  («Puerta 2 de 3, contando de izquierda a derecha…»). Una participación de
 *  la cara (`…-PC3`) es un contrato a montar como cualquier otro, con su
 *  rótulo «Participación 3 · cara A» (D13): sin el %, que el tablero no carga,
 *  ni zonas ni plata (§4.8, §4.9). */
function parteParaMontar(parte: ParteRef, cara: "A" | "B", f: UnifiedFixture): string {
  return esParticipacion(parte)
    ? textoDeParticipacionParaMontar(parte, cara)
    : textoParaMontar(parte, cantidadDe(f, parte.clase));
}

function diasDesde(iso: string): number {
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const inicio = Date.UTC(y, m - 1, d);
  const hoy = new Date();
  const cero = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((cero - inicio) / 86_400_000);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MESES[m - 1]}` : iso;
}

/**
 * Lo que ve el mercaderista en el celular.
 *
 * No es el escritorio reducido: es una lista de tarjetas grandes y, al tocar
 * una, una sola pregunta — ¿lo montaste? — con la cámara a un toque. No hay
 * valores en ninguna parte, igual que en su correo.
 */
export default function MountView({
  initialCode,
  onDone,
}: {
  /** Código que venía en el enlace del correo, si vino por ahí. */
  initialCode?: string | null;
  onDone?: () => void;
}) {
  const fixturesBySede = useFixtureStore((s) => s.fixturesBySede);
  const sedes = useFixtureStore((s) => s.sedes);
  const activeSede = useFixtureStore((s) => s.sede);
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const fixtures = useFixtureStore(selectFixtures);
  /** Vender por partes: las puertas vendidas no están en el mueble fusionado,
   *  están en el mapa crudo de la base, por su código. */
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  const indicePartes = useMemo(() => indiceDePartes(estadoComercial), [estadoComercial]);
  /** El primer pull del servidor ya terminó — antes de eso no hay espacios. */
  const layoutListo = useFixtureStore((s) => s.lastSyncedAt) !== null;
  /** La última sincronización falló: una lista vacía puede ser falta de señal
   *  y no falta de trabajo. */
  const sinConexion = useFixtureStore((s) => s.syncState) === "error";

  const [mounts, setMounts] = useState<MountConfirmation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<Pendiente | null>(null);

  useEffect(() => {
    fetchMounts()
      .then(setMounts)
      .catch(() => setMounts([]))
      .finally(() => setCargando(false));
  }, []);

  const ultimo = useMemo(() => latestByCode(mounts), [mounts]);
  const porCodigo = useMemo(() => reportesPorCodigo(mounts), [mounts]);

  // Todas las sedes, no solo la activa: el mercaderista puede cubrir varias y
  // el enlace del correo puede apuntar a cualquiera.
  const pendientes = useMemo<Pendiente[]>(() => {
    const out: Pendiente[] = [];
    const universo = sedes.length
      ? sedes.flatMap((s) => (fixturesBySede[s] ?? []).map((f) => [s, f] as const))
      : fixtures.map((f) => [activeSede, f] as const);

    for (const [sede, f] of universo) {
      // La caja y la columna no se montan enteras (no se venden), pero sus
      // piezas vendidas sí: la bahía de impulso, el forro.
      const soloPiezas = !isRentable(f);
      if (soloPiezas && piezasDeLaFamilia(f.type).length === 0) continue;
      // El código completo se arma con la sede del propio mueble cuando la
      // trae, igual que al guardar el contrato: un mueble puede haber quedado
      // con la sede escrita adentro y no coincidir con la clave del mapa.
      const base = fullSpaceCode((f.sede as string) || sede, f.code);
      const caras: { code: string; corto: string; data: Partial<UnifiedFixture>; parte?: string }[] = [
        { code: base, corto: f.code, data: f },
      ];
      if (!soloPiezas && isDoubleGondola(f) && f.faceB) {
        caras.push({
          code: `${base}-B`,
          corto: `${f.code}-B`,
          data: f.faceB as Partial<UnifiedFixture>,
        });
      }
      // Vender por partes: cada puerta vendida se monta como un espacio más,
      // con su propio contrato y su propio reporte.
      for (const c of [...caras]) {
        for (const { partido, estado } of indicePartes.get(c.code) ?? []) {
          if (!partido.parte || (soloPiezas && !esPieza(partido.parte))) continue;
          caras.push({
            // El completo de la cara más el de la parte: `NAVE-NEV-03-PU2`.
            code: `${c.code}-${sufijoDeParte(partido.parte)}`,
            corto: codigoDeParte(f.code, partido.cara, partido.parte),
            data: { ...estado, status: estado.status as UnifiedFixture["status"] } as Partial<UnifiedFixture>,
            parte: parteParaMontar(partido.parte, partido.cara, f),
          });
        }
      }
      // De la caja, sólo sus piezas: la caja entera no tiene contrato.
      for (const { code, corto, data, parte } of soloPiezas ? caras.slice(1) : caras) {
        const cara = {
          status: (data.status ?? "free") as UnifiedFixture["status"],
          startDate: data.startDate ?? "",
          endDate: data.endDate ?? "",
        };
        const fase = contractPhase(cara);
        // Solo lo que tiene contrato por delante o corriendo. Lo vencido ya no
        // se monta, y lo libre no tiene qué montar.
        if (fase !== "vigente" && fase !== "pendiente") continue;
        // Ya reportado como montado PARA ESTE CONTRATO: sale de la lista. El
        // «montado» del contrato anterior sobre el mismo espacio no cuenta
        // (2026-10-05, `utils/montajeDelContrato.ts`): antes sacaba de acá al
        // contrato nuevo, que nadie había ido a montar.
        if (reporteDelContrato(porCodigo, code, cara.startDate)?.estado === "montado") continue;
        out.push({
          code,
          corto,
          fixtureCode: f.code,
          sede: (data.sede as string) || sede,
          label: conNombrePropio(f, nombresPropios, f.label || f.code),
          marca: (data.brandCategory as string) || "",
          proveedor: (data.supplierName as string) || "",
          desde: data.startDate ?? "",
          hasta: data.endDate ?? "",
          urgente: fase === "vigente" && diasDesde(data.startDate ?? "") <= VENTANA_DIAS,
          viejo: fase === "vigente" && diasDesde(data.startDate ?? "") > VENTANA_DIAS,
          ...(parte ? { parte } : {}),
        });
      }
    }
    // Tres tramos: lo que arrancó y hay que montar ya, lo que viene, y al final
    // lo viejo sin reportar. Ordenar solo por fecha ponía arriba contratos de
    // enero y enterraba el trabajo de esta semana.
    const tramo = (p: Pendiente) => (p.urgente ? 0 : p.viejo ? 2 : 1);
    out.sort((a, b) => tramo(a) - tramo(b) || a.desde.localeCompare(b.desde));
    return out;
  }, [fixturesBySede, sedes, fixtures, activeSede, porCodigo, nombresPropios, indicePartes]);

  // Enlace del correo: abrir directamente ese espacio.
  const [yaConfirmado, setYaConfirmado] = useState<MountConfirmation | null>(null);

  /** El espacio ya reportado, reconstruido para poder volver a abrirlo.
   *
   *  No está en `pendientes` justamente porque ya se reportó, así que se arma
   *  de nuevo desde el layout. Sin esto no hay forma de corregir una foto
   *  movida: el espacio desaparece de la lista y el enlace del correo solo
   *  dice "ya se reportó". */
  const reportarDeNuevo = useMemo<Pendiente | null>(() => {
    if (!yaConfirmado) return null;
    const code = yaConfirmado.space_code.toUpperCase();
    // `NAVE-NEV-03-B-PU2` → el mueble `NAVE-NEV-03`, la cara B y la puerta 2.
    const partido = partirCodigo(code);
    const base = partido.base;
    for (const [sede, lista] of Object.entries(fixturesBySede)) {
      for (const f of lista) {
        const completo = fullSpaceCode((f.sede as string) || sede, f.code);
        if (completo !== base) continue;
        const caraB = partido.cara === "B";
        const data = (partido.parte
          ? { ...(estadoComercial[code] ?? {}) }
          : (caraB ? f.faceB : f)) as Partial<UnifiedFixture>;
        return {
          code,
          corto: codigoDeParte(f.code, partido.cara, partido.parte),
          ...(partido.parte ? { parte: parteParaMontar(partido.parte, partido.cara, f) } : {}),
          fixtureCode: f.code,
          sede: (data?.sede as string) || (f.sede as string) || sede,
          label: conNombrePropio(f, nombresPropios, f.label || f.code),
          marca: (data?.brandCategory as string) || "",
          proveedor: (data?.supplierName as string) || "",
          desde: data?.startDate ?? "",
          hasta: data?.endDate ?? "",
          urgente: false,
          viejo: false,
        };
      }
    }
    return null;
  }, [yaConfirmado, fixturesBySede, nombresPropios, estadoComercial]);
  const abiertoPorEnlace = useRef(false);
  useEffect(() => {
    // Esperar a que el layout haya llegado del servidor. Sin esta condición el
    // efecto corría apenas terminaban de cargar las confirmaciones, cuando la
    // lista de espacios todavía estaba vacía: no encontraba nada, se marcaba
    // como consumido y el enlace del correo no volvía a funcionar nunca.
    if (!initialCode || cargando || !layoutListo || abiertoPorEnlace.current) return;
    abiertoPorEnlace.current = true;
    const code = initialCode.toUpperCase();
    const found = pendientes.find((p) => p.code.toUpperCase() === code);
    if (found) {
      setAbierto(found);
      return;
    }
    // Tocar el enlace dos veces es lo más normal del mundo. Decir por qué no
    // hay nada que hacer es mejor que dejar la lista sin explicación. Si no
    // está entre los pendientes es porque su contrato ya se reportó —y ése es
    // su último reporte— o porque no tiene contrato por montar.
    const previo = ultimo[code];
    if (previo) setYaConfirmado(previo);
  }, [initialCode, cargando, layoutListo, pendientes, ultimo]);

  if (abierto) {
    return (
      <FormularioDelTablero
        item={abierto}
        vecinos={fixturesDeSede(fixturesBySede, abierto.sede)}
        onCancel={() => setAbierto(null)}
        onSaved={(m) => {
          setMounts((prev) => [m, ...prev]);
          setAbierto(null);
        }}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", padding: "16px 14px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Montajes
        </h2>
        {onDone && (
          <button
            onClick={onDone}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "var(--ink-3)", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Ver el resumen
          </button>
        )}
      </div>
      {/* Tres estados, no dos. `cargando` era solo el fetch de confirmaciones:
          mientras el layout todavía venía en camino —o si la sincronización
          falló por falta de señal— la pantalla decía "no hay espacios
          pendientes", y con eso el mercaderista guarda el celular y se va. */}
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-3)" }}>
        {cargando || !layoutListo
          ? "Cargando espacios…"
          : pendientes.length === 0
          ? "No hay espacios pendientes de montaje."
          : `${pendientes.length} espacio${pendientes.length === 1 ? "" : "s"} por montar`}
      </p>
      {!cargando && layoutListo && pendientes.length === 0 && sinConexion && (
        <p style={{ margin: "-8px 0 16px", fontSize: 13, color: "var(--warning)" }}>
          La lista no se pudo actualizar. Buscá señal y volvé a entrar antes de dar por
          hecho que no hay nada.
        </p>
      )}

      {yaConfirmado && (
        <div
          style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "11px 12px", marginBottom: 14,
            borderRadius: "var(--r-md)",
            background: "var(--success-50)", border: "1px solid var(--success-100)",
          }}
        >
          <Check size={15} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.45 }}>
            <b style={{ fontFamily: "var(--font-mono)" }}>{yaConfirmado.space_code}</b> ya se
            reportó como {yaConfirmado.estado === "montado" ? "montado" : "no montado"}
            {yaConfirmado.reportado_por ? ` por ${yaConfirmado.reportado_por}` : ""}.
            {/* Una foto movida, con guantes y una mano, es lo más normal del
                mundo — y es la prueba que el proveedor va a discutir en tres
                meses. El histórico guarda todos los reportes y vale el último,
                así que corregir es volver a reportar. */}
            {reportarDeNuevo && (
              <>
                {" "}
                <button
                  onClick={() => { setAbierto(reportarDeNuevo); setYaConfirmado(null); }}
                  style={{
                    background: "none", border: "none", padding: 0,
                    color: "var(--accent-700)", fontWeight: 600, fontSize: 13,
                    fontFamily: "inherit", cursor: "pointer", textDecoration: "underline",
                  }}
                >
                  Corregir el reporte
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setYaConfirmado(null)}
            aria-label="Cerrar aviso"
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "var(--ink-3)", cursor: "pointer", padding: 0, flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendientes.map((p) => (
          <button
            key={`${p.sede}-${p.code}`}
            onClick={() => setAbierto(p)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "14px 14px", borderRadius: "var(--r-lg)",
              background: "var(--surface)",
              border: `1px solid ${p.urgente ? "var(--warning)" : "var(--line)"}`,
              boxShadow: "var(--shadow-xs)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                  color: "var(--ink-1)",
                }}
              >
                {nombreDeMueble({ code: p.corto })}
              </span>
              {p.parte && (
                <span style={{ fontSize: 11, color: "var(--accent-700)", fontWeight: 600 }}>{p.parte}</span>
              )}
              {p.urgente && (
                <span
                  style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                    background: "var(--warning-50)", color: "var(--warning)",
                  }}
                >
                  ya empezó
                </span>
              )}
              <span
                style={{
                  marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 11, color: "var(--ink-3)",
                }}
              >
                <MapPin size={11} /> {p.sede}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)" }}>
              {p.proveedor || "Sin proveedor"}
              {p.marca && <span style={{ color: "var(--ink-2)", fontWeight: 500 }}> · {p.marca}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>
              {p.label} · desde el {fecha(p.desde)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── El formulario, tal como lo abre el tablero ──────────────────────────────

/** Los muebles de una sede, tolerando que la clave del mapa y la sede escrita
 *  dentro del mueble difieran en mayúsculas o espacios. */
function fixturesDeSede(
  porSede: Record<string, UnifiedFixture[]>,
  sede: string,
): UnifiedFixture[] {
  const directo = porSede[sede];
  if (directo) return directo;
  const buscada = (sede ?? "").trim().toUpperCase();
  const clave = Object.keys(porSede).find((k) => k.trim().toUpperCase() === buscada);
  return clave ? porSede[clave] : [];
}

/**
 * El mismo formulario que abre el enlace del correo, conectado a la sesión.
 *
 * Lo único que cambia entre las dos puertas: acá el reporte viaja con el token
 * de la sesión y la planometría se busca por contrato; por el enlace firmado
 * las dos cosas salen del propio token.
 */
function FormularioDelTablero({
  item, vecinos, onCancel, onSaved,
}: {
  item: Pendiente;
  vecinos: UnifiedFixture[];
  onCancel: () => void;
  onSaved: (m: MountConfirmation) => void;
}) {
  /** Cómo debe quedar armada la exhibición, según lo que el proveedor mandó.
   *
   *  Se busca por el CÓDIGO del espacio y no por el id del contrato: quien
   *  monta no tiene por qué saber que existen contratos. Que no haya es normal
   *  —no todas lo traen—, así que la ausencia no se anuncia como un error. */
  const [plano, setPlano] = useState<PlanoDelEspacio | null>(null);
  // Con cuenta propia el servidor guarda quién reportó: no se pregunta.
  const nombre = useAuthStore((s) => s.nombre);
  const email = useAuthStore((s) => s.email);
  const quienReporta = email ? nombre?.trim() || email : null;
  useEffect(() => {
    let vivo = true;
    planometriaDelEspacio(item.code).then((p) => {
      if (vivo && p) setPlano({ url: planometriaUrl(p.id), tipo: p.content_type });
    });
    return () => { vivo = false; };
  }, [item.code]);

  return (
    <FormularioMontaje
      item={item}
      vecinos={vecinos}
      plano={plano}
      quienReporta={quienReporta}
      onEnviar={(datos) => confirmMount({ ...datos, spaceCode: item.code, sede: item.sede })}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}
