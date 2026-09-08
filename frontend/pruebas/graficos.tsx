/* Banco de pruebas de `src/components/plataforma/graficos.tsx`.
 *
 * NO es una pantalla del producto: no entra en el bundle (vive fuera de `src`,
 * que es lo único que `tsconfig.json` incluye y lo único que `index.html`
 * importa). Existe para que `scripts/probar-graficos.mjs` pueda montar los
 * diez dibujos con los datos de `outputs/ejemplo.json` y medirlos: cuerpo real
 * de cada `<text>` en pantalla, cajas de texto que se cruzan, y las dos rondas
 * en claro y en oscuro.
 *
 * Se monta todo dos veces: con el cliente que tiene de todo (Mercamío) y con
 * el cliente nuevo sin contratos (Almacenes Caribe), que es donde los caminos
 * de «sin dato» tienen que dibujar una frase y no un cero. */
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "../src/index.css";
import {
  BarrasDivergentes,
  BarrasSedes,
  CLAVE_ADOPCION,
  CLAVE_ESTADOS,
  DosLineasConteo,
  Dumbbell,
  EjeSpread,
  Enfasis,
  LineaIngreso,
  Medidor,
  RielVencimientos,
  Unidades,
  unidadesAdopcion,
  unidadesPorTipo,
} from "../src/components/plataforma/graficos";
import type {
  Adopcion,
  DetalleCliente,
  MetricasPlataforma,
  MovimientoMes,
  Tendencia,
} from "../src/api/plataforma";

interface Ejemplo {
  cartera: MetricasPlataforma;
  tendencia_cartera: Tendencia;
  tendencia_cliente: Tendencia;
  adopcion: Adopcion;
  detalle_cliente: DetalleCliente;
  detalle_cliente_nuevo: DetalleCliente;
}

function ocupacionDe(d: DetalleCliente): number | null {
  if (d.espacios.length === 0) return null;
  const ocu = d.espacios.filter((e) => e.estado !== "libre").length;
  return (ocu / d.espacios.length) * 100;
}

function Caso({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="plat-cap" data-caso={id}>
      <div className="plat-cap-cab">
        <span className="num">{id}</span>
        <h2>{titulo}</h2>
      </div>
      <div className="plat-bloque">{children}</div>
    </section>
  );
}

/* ── El rótulo del último mes de las barras divergentes ──────────────────────
 *
 * Se rotulaba con las ENTRADAS del último mes y un «+» forzado. Con una
 * entrada de $ 600.000 contra una salida de $ 2.000.000 la figura anunciaba
 * «+$ 0,6 M» a diez píxeles de su propia anotación, que decía «el peor saldo
 * de la ventana: −$ 1,4 M» sobre ese MISMO mes. Dos números distintos para el
 * mismo mes, uno al lado del otro.
 *
 * Estos dos casos fijan las dos ramas: cuando el último mes ES el peor, lo
 * dice la anotación y no hay segundo rótulo; cuando no lo es, se rotula con su
 * saldo y su signo. */
function mov(mes: string, entra: number, sale: number): MovimientoMes {
  return {
    mes,
    entradas: entra
      ? [{ proveedor: "Proveedor", codigo: "SEDE-GON-01", tipo: "gondola", canon_mensual: entra, fecha: mes + "-05", cancelado: false }]
      : [],
    salidas: sale
      ? [{ proveedor: "Proveedor", codigo: "SEDE-GON-02", tipo: "gondola", canon_mensual: sale, fecha: mes + "-20", motivo: "vencimiento" }]
      : [],
  };
}

/** El último mes es el peor de la ventana. */
const MOV_ULTIMO_PEOR: MovimientoMes[] = [
  mov("2026-06", 1_200_000, 300_000),
  mov("2026-07", 900_000, 400_000),
  mov("2026-08", 1_500_000, 600_000),
  mov("2026-09", 600_000, 2_000_000),
];

/** El peor está en el medio; el último cierra en rojo, pero más chico. */
const MOV_ULTIMO_NEGATIVO: MovimientoMes[] = [
  mov("2026-06", 1_200_000, 300_000),
  mov("2026-07", 500_000, 2_400_000),
  mov("2026-08", 1_500_000, 600_000),
  mov("2026-09", 700_000, 1_100_000),
];

function Banco({ d }: { d: Ejemplo }) {
  const det = d.detalle_cliente;
  const nuevo = d.detalle_cliente_nuevo;
  const serie = d.tendencia_cartera.serie;
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;

  return (
    <div className="plat">
      <main className="plat-doc" style={{ padding: 24 }}>
        <Caso id="1" titulo="Medidor · ocupación de la cartera">
          <Medidor
            ocupacionPct={d.cartera.consolidado.ocupacion_pct}
            espaciosComercializables={d.cartera.consolidado.espacios_comercializables}
            referencia={
              anterior && anterior.ocupacion_pct !== null
                ? { pct: anterior.ocupacion_pct, rotulo: `${anterior.periodo} publicado · composición distinta` }
                : null
            }
            nota="— la referencia es el mes anterior publicado"
            tabla
          />
        </Caso>

        <Caso id="2" titulo="Dos líneas de conteo · tendencia de la cartera">
          <DosLineasConteo
            serie={serie}
            anotaciones={[
              { i: 1, t: "entró el plano de TERRÓN al denominador", lado: "der" },
              { i: 3, t: "entró Almacenes Caribe", lado: "der" },
            ]}
            tabla
          />
        </Caso>

        <Caso id="3" titulo="Línea de ingreso · misma rejilla de meses">
          <LineaIngreso
            serie={serie}
            anotaciones={[{ i: serie.length - 1, t: "mes en curso: la cifra todavía se mueve", lado: "izq" }]}
            tabla
          />
        </Caso>

        <Caso id="4" titulo="Barras de sede · el largo son espacios">
          <BarrasSedes espacios={det.espacios} promedioPct={ocupacionDe(det)} tabla />
        </Caso>

        <Caso id="5" titulo="Unidades · una marca por espacio, agrupadas por tipo">
          <Unidades grupos={unidadesPorTipo(det.espacios, det.resumen_por_tipo)} clave={CLAVE_ESTADOS} tabla />
        </Caso>

        <Caso id="6" titulo="Unidades · una marca por cliente, agrupadas por clase de adopción">
          <Unidades grupos={unidadesAdopcion(d.adopcion.clientes)} disposicion="columnas" clave={CLAVE_ADOPCION} tabla />
        </Caso>

        <Caso id="7" titulo="Dumbbell · canon del cliente contra el benchmark">
          <Dumbbell resumen={det.resumen_por_tipo} benchmark={det.benchmark_plataforma} tabla />
        </Caso>

        <Caso id="8" titulo="Eje del spread · contra cero">
          <EjeSpread clientes={d.cartera.clientes} tabla />
        </Caso>

        <Caso id="9" titulo="Énfasis · de quién depende">
          <Enfasis proveedores={det.proveedores} tabla />
        </Caso>

        <Caso id="10" titulo="Riel de 60 días · qué se cae y cuándo">
          <RielVencimientos espacios={det.espacios} hasta={det.hasta} hoy={det.desde} tabla />
        </Caso>

        <Caso id="11" titulo="Barras divergentes · movimientos en pesos y saldo neto">
          <BarrasDivergentes movimientos={det.movimientos} tabla />
        </Caso>

        {/* ── Los caminos de «sin dato»: el cliente nuevo, sin un solo contrato ── */}
        <Caso id="12" titulo="Cliente nuevo · barras de sede sin promedio">
          <BarrasSedes espacios={nuevo.espacios} promedioPct={ocupacionDe(nuevo)} tabla />
        </Caso>
        <Caso id="13" titulo="Cliente nuevo · dumbbell sin contratos de ningún tipo">
          <Dumbbell resumen={nuevo.resumen_por_tipo} benchmark={nuevo.benchmark_plataforma} tabla />
        </Caso>
        <Caso id="14" titulo="Cliente nuevo · riel sin vencimientos y énfasis sin proveedores">
          <RielVencimientos espacios={nuevo.espacios} hasta={nuevo.hasta} hoy={nuevo.desde} tabla />
          <Enfasis proveedores={nuevo.proveedores} tabla />
        </Caso>
        <Caso id="15" titulo="Cliente nuevo · unidades, todo libre">
          <Unidades grupos={unidadesPorTipo(nuevo.espacios, nuevo.resumen_por_tipo)} clave={CLAVE_ESTADOS} tabla />
        </Caso>
        <Caso id="16" titulo="Medidor sin ocupación · «no es 0 %, es que no hay con qué»">
          <Medidor ocupacionPct={null} espaciosComercializables={34} tabla />
        </Caso>
        <Caso id="17" titulo="Divergentes · el último mes ES el peor: lo dice la anotación, sin un segundo rótulo">
          <BarrasDivergentes movimientos={MOV_ULTIMO_PEOR} tabla={false} />
        </Caso>
        <Caso id="18" titulo="Divergentes · el último mes no es el peor: se rotula con su saldo y su signo">
          <BarrasDivergentes movimientos={MOV_ULTIMO_NEGATIVO} tabla={false} />
        </Caso>
      </main>
    </div>
  );
}

function App() {
  const [d, setD] = useState<Ejemplo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/pruebas/ejemplo.json")
      .then((r) => r.json())
      .then(setD)
      .catch((e) => setErr(String(e)));
  }, []);
  if (err) return <pre data-listo="error">{err}</pre>;
  if (!d) return <p>cargando…</p>;
  return (
    <div data-listo="si">
      <Banco d={d} />
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
