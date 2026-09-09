# `graficos.tsx` — qué componente sirve para qué dato

Los diez dibujos de la opción A («El informe»), portados a React sobre los
tipos reales de `src/api/plataforma.ts`. Todos son **puros**: props → `<svg>`.
No piden datos, no guardan estado, no tienen efectos, no traen librerías.

El CSS vive en `src/plataforma.css` (clase raíz `.plat`, importada desde
`src/index.css`). El formato de cifras, fechas y nombres, en `./formato.ts`.

---

## 1. Dato → forma → componente

| Dato (brief §3b / §4) | Pregunta | Trabajo del dato | Forma | Componente | Contra qué |
|---|---|---|---|---|---|
| Ocupación % de la **cartera** | ¿qué tan llena está? | ratio contra un límite | medidor con marca de referencia | `<Medidor>` | el mes anterior publicado |
| Ocupación % de un **cliente** | ¿qué tan lleno está? | parte de un total | una marca por espacio, agrupadas por tipo | `<Unidades>` + `unidadesPorTipo()` | — |
| Tendencia 12 meses — **ocupación** | ¿hacia dónde va? | cambio en el tiempo, con denominador móvil | dos líneas de **conteo** en una sola escala de espacios | `<DosLineasConteo>` | su propio pasado |
| Tendencia 12 meses — **ingreso** | ¿hacia dónde va la plata? | cambio en el tiempo | línea en su propio panel, misma rejilla de meses | `<LineaIngreso>` | su propio pasado |
| Ocupación **por sede** | ¿qué sede rinde y cuál no? | ranking de partes | barras apiladas ordenadas, la peor arriba, largo en **espacios** | `<BarrasSedes>` | una marca por barra: la media del cliente |
| Espacios **por estado** | ¿cuánto hay para vender? | conteo | unidades discretas con la palabra al lado del color | `<Unidades>` + `unidadesPorTipo()` | — |
| **Adopción** por clase | ¿quién no usa lo que paga? | clasificación con conteo | una marca por cliente, agrupadas por clase | `<Unidades disposicion="columnas">` + `unidadesAdopcion()` | — |
| Canon promedio por tipo **vs benchmark** | ¿cobra bien? | comparación contra referencia | dumbbell ordenado por brecha | `<Dumbbell>` | el benchmark de la plataforma |
| **Spread %** de la cartera | ¿quién cobra por debajo de lo que dice que vale? | comparación contra referencia, por cliente | puntos sobre un eje con el cero marcado | `<EjeSpread>` | cero = su propia tarifa |
| **Proveedores**: participación % | ¿de quién depende? | partes de un total, ranking | énfasis (1 + 4 + «los otros N») con umbral rotulado | `<Enfasis>` | el umbral de concentración |
| **Contratos por vencer** | ¿qué se cae y cuándo? | hechos con fecha | riel de 60 días con hoy y el fin del periodo | `<RielVencimientos>` | hoy y el fin del periodo |
| **Movimientos** entradas/salidas | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | barras divergentes en pesos + saldo neto | `<BarrasDivergentes>` | la línea del cero |

Lo que **no** es un gráfico y por eso no tiene componente: cohortes de adopción
(cinco filas, tabla), estado de cuenta y prioridad (chip con la palabra),
cobertura y `contratos_fuera_del_plano` (una línea contada), zona/área/marca
(columnas de tabla), el reporte de transparencia (un enlace), `valor en juego`
(tres cifras rotuladas, DOM). Todos se arman con las clases de
`plataforma.css` y los formateadores de `formato.ts`.

---

## 2. Las props, una por una

Todos aceptan además `titulo?: string` (el `<title>` y el `aria-label` del
`<svg>`; si no se pasa, se arma del dato), `tabla?: boolean` (agrega la tabla
equivalente plegada, alcanzable sin hover) y `tablaAbierta?: boolean` (la
despliega — se usa al imprimir).

```tsx
<Medidor
  ocupacionPct={number | null}              // AgregadosMetricas.ocupacion_pct
  espaciosComercializables={number}          // AgregadosMetricas.espacios_comercializables
  referencia={{ pct, rotulo } | null}        // el «contra qué», dibujado sobre la pista
  nota={string}                              // el «contra qué», escrito al lado de la cifra
/>
```
`ocupacionPct === null` **no dibuja un cero**: dibuja la frase «no es 0 %, es
que no hay con qué calcularla».

```tsx
<DosLineasConteo
  serie={PuntoTendencia[]}                   // Tendencia.serie, tal cual
  anotaciones={Anotacion[]}                  // {i, t, lado?} — escritas sobre el dato
  etiquetaTotal={string} etiquetaOcupados={string}
  rotulo={string | null}                     // por defecto: rotuloRejillaMeses(serie)
/>
<LineaIngreso serie={PuntoTendencia[]} anotaciones={Anotacion[]} rotulo={string|null} />
```
`sin_dato: true` es un **hueco** rotulado, no una recta entre vecinos.
`parcial: true` lleva su franja y su palabra.

```tsx
<BarrasSedes
  espacios={EspacioDetalle[]}                // DetalleCliente.espacios
  promedioPct={number | null}                // la media del cliente; null = sin marca
/>
```
Se usa `espacios[]` y no `sedes[]` porque sólo el estado por espacio permite
partir la barra en los tres estados.

```tsx
<Unidades
  grupos={GrupoUnidades[]}                   // {etiqueta, sub?, detalle?, marcas: TonoUnidad[]}
  disposicion={"filas" | "columnas"}         // filas: 254 espacios · columnas: 6 clientes
  clave={CLAVE_ESTADOS | CLAVE_ADOPCION | …}
/>
unidadesPorTipo(espacios, resumen_por_tipo) → GrupoUnidades[]
unidadesAdopcion(adopcion.clientes)         → GrupoUnidades[]
```

```tsx
<Dumbbell
  resumen={ResumenTipoDetalle[]}             // DetalleCliente.resumen_por_tipo
  benchmark={Record<string, number>}         // DetalleCliente.benchmark_plataforma
/>
```
La brecha se calcula acá (`canon_promedio / benchmark − 1`). El tipo sin
contratos vigentes **no dibuja punto**: dice que no tiene con qué compararse.
La tarifa de referencia del cliente no entra nunca.

```tsx
<EjeSpread clientes={ClienteMetricas[]} />   // MetricasPlataforma.clientes
```
Sólo dibuja a los que tienen `spread_pct`. Los de `spread_pct: null` y los de
`metricas: null` **se cuentan aparte, con su nombre, dentro del dibujo**: no
se dibujan en cero.

```tsx
<Enfasis proveedores={ProveedorDetalle[]} top={5} umbralPct={40} />
<RielVencimientos espacios={EspacioDetalle[]} hasta={"YYYY-MM-DD"} hoy={"YYYY-MM-DD"} dias={60} />
<BarrasDivergentes movimientos={MovimientoMes[]} />
```
Sin `hoy` no se dibuja el corte de fin de periodo (no se adivina). `dias` es 60
porque 60 es la ventana que mira el backend.

---

## 3. Lo que hay que respetar al usarlos

1. **Cada figura va debajo de su frase-conclusión** (`.plat-frase`), con su
   número. Un gráfico sin la frase de arriba está incompleto: la frase es del
   bloque, no del componente.
2. **El ancho útil es 940 px** (900 el medidor). El `<svg>` no baja de ahí: en
   una caja más angosta la figura se desliza dentro de `.plat-fig-cuerpo`, y
   no se achica. Es lo que mantiene el cuerpo de la letra en su medida real.
3. **`tabla` es la accesibilidad del gráfico**, no un extra. Si una cifra sólo
   se puede leer del dibujo, falta la tabla.
4. **Los tres colores de estado sólo dicen estado de espacio.** Para señal,
   estado de cuenta y prioridad están `.plat-chip--fuerte/medio/suave`, en
   tinta gris con la palabra.
5. **Un solo amarillo por pantalla**, y es `.btn-principal` de `index.css`.
   Esta hoja no pinta ni un fondo con `--signal`.

## 4. Cómo se verifica

`npm run probar:graficos` levanta un Vite propio en el puerto 5211, monta
`pruebas/graficos.html` con los datos de
`features/plataforma-asesoria/outputs/ejemplo.json` y mide, en claro y en
oscuro a 1440×900 y 1366×768: cuerpos de `<text>` por debajo de 10 px o por
encima de 30 px, pares de texto pisados, textos fuera de la caja de su `<svg>`
y errores de consola. Todos tienen que dar **0**.
