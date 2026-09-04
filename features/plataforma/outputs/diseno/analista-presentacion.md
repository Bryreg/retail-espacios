# Analista de presentación — Consola de plataforma (Fase 4b, Fase B)

Pase de **presentación de datos grado asesoría** sobre la consola `/plataforma`
ya refinada visualmente por el Diseñador (Fase A). No se tocó su sistema
visual ni sus primitivas (`components/plataforma/consola.tsx`): se completó
el **encuadre de negocio** que dejó pendiente — orden de las barras,
contexto de cada KPI/gráfico, tooltips de contenido — y se cerró el
**roadmap de asesoría**.

Territorio tocado: **solo** `frontend/src/pages/Plataforma.tsx` (las
funciones `GraficoOcupacion`, `GraficoProveedores`, los `KpiTile` de
"Clientes activos" / "Ocupación media", y el `title` de la celda "Últ.
acceso"). Ni fórmulas, ni endpoints, ni K=3, ni saneo de proveedores, ni
bitácora, ni login/JWT/redacción por rol tocados. Sin librerías de charts
nuevas: mismas primitivas SVG/CSS del Diseñador, mismos tokens `--con-*`.

Verificación: `npx tsc --noEmit` y `npm run build` **limpios** (el warning de
chunk >500kB es pre-existente, de Three.js — no lo introduce este pase).

---

## (a) Cada elemento del panel: qué pregunta responde y por qué esa forma

| Elemento | Pregunta de negocio | Por qué esa forma |
|---|---|---|
| **KPI hero — Ingreso contratado · mes** | "¿Cuánto factura hoy la cartera completa?" — el número por el que el dueño abre la consola. | Tile grande, primero, con contexto de clientes sin leer (honestidad sobre cobertura del dato). Es un total consolidado que decide, no se compara entre sí: tile, no barra. |
| **KPI — Clientes activos** (+ contexto "de N en el registro") | "¿Cuántos clientes tengo prendidos vs. cuántos tengo en total?" — cuantifica de un vistazo el libro fuera de servicio (suspendidos/gracia/solo-lectura), oportunidad de retención. | Tile con contexto: el numerador solo (sin el total) no dice si hay 2 suspendidos o 20. Usa dos fuentes ya presentes (`clientes` para el numerador — fuente fresca de estado — y `consolidado.clientes_total` de métricas), consistente con cómo ya se leía `clientes_con_error`. |
| **KPI — Ocupación media** (+ contexto "sobre N espacios comercializables en M sedes con plano") | "¿Qué tan grande es el inventario que sostiene ese %?" — un 44% sobre 12 espacios y un 44% sobre 400 son negocios distintos. | Tile con contexto de escala absoluta usando `sedes_con_plano` y `espacios_comercializables` (consolidado) — campos que el Diseñador dejó "sin superficie" y encajan exactamente acá: grounding del porcentaje, no una métrica nueva. |
| **KPI — Canon promedio** | "¿Cuál es el ticket promedio de un contrato activo?" — referencia de precio para conversar con un cliente puntual. | Tile simple; no se le agregó contexto porque no hay un campo del JSON que lo enriquezca sin inventar (la tarifa de referencia, que sí lo enriquecería, no está disponible — ver Roadmap). |
| **Selector de período + "Actualizado hace…"** | "¿De qué mes son estos números y qué tan frescos están?" | Sin cambios de esta fase — ya resolvía la pregunta correctamente. |
| **Gráfico — Ocupación por cliente** | "¿A qué cliente le hago la próxima llamada de asesoría?" | Barras con eje desde cero (magnitud, azul secuencial — no la terna de estado), **reordenadas de menor a mayor** ocupación: el que más necesita la conversación aparece primero, no al final. Los clientes con `ocupacion_pct: null` ya NO se excluyen del panel — aparecen como barra "sin dato" al final, porque un cliente sin contratos activos en el período es, si acaso, el caso más urgente, y ocultarlo del panel de asesoría sería el error opuesto al que se está corrigiendo. Tooltip por barra: `"{cliente}: {pct}% de {N} espacios comercializables"` — ancla el porcentaje al inventario real, sin inventar un conteo de espacios ocupados (ver descarte más abajo). |
| **Gráfico — Top proveedores (consolidado)** | "¿Qué tan expuesta está la cartera a un solo proveedor?" (riesgo de concentración) | Barras grafito (conteo, no magnitud de %). El subtítulo del panel ahora calcula y nombra la concentración real: `"{líder} concentra X% de los contratos entre los 5 principales"`. Se nombra explícitamente **"entre los 5 principales"** porque el JSON solo trae el top-5 — no hay un total de proveedores ni de contratos en el endpoint, así que un "% de la cartera completa" sería un dato inventado. Tooltip por barra con el mismo desglose por proveedor. |
| **Tabla de clientes — columna "Últ. acceso"** | "¿Hay alguien usando la cuenta, y hace cuánto entró?" (adopción) | El `title` de la celda ahora suma `usuarios_con_cuenta`: `"{N} cuenta(s) de usuario · último acceso {fecha}"`. Se decidió **no** agregar una columna nueva (la tabla ya tiene 7 columnas + botón y debe seguir legible con 30 filas) — el campo entra por el tooltip que ya existía, sin ensanchar la tabla. |
| **Tabla — resto de columnas (Estado, Ocupación, Canon prom., Ingreso mes, Cambiar)** | Sin cambios de esta fase — ya usaban las primitivas K=3/sin-dato correctamente. | — |
| **Solicitudes de supresión** | Sin cambios — es un flujo operativo (derechos ARCO), no una lectura de negocio. | — |

Comparabilidad estricta mantenida: todos los `%` nuevos (contexto de KPI,
hints de barras, concentración de proveedores) usan el mismo redondeo que ya
regía el panel (`toFixed(1)` / `formatoPct`), la misma tipografía monoespaciada
para números, y los mismos tokens de tinta. Ningún color nuevo: todo lo
agregado usa `--con-ink-*` / `--con-sindato-ink` ya existentes.

---

## (b) Elementos descartados (no responden nada nuevo)

- **`sedes_con_plano` / `espacios_comercializables` como columna o tile por
  cliente.** Ya viven, agregados, en el contexto del tile "Ocupación media"
  y (por cliente) en el hint de su propia barra de ocupación. Repetirlos como
  columna aparte en la tabla no habilita ninguna decisión nueva — solo
  densifica una tabla que ya tiene que ser legible con 30 filas.
- **`usuarios_con_cuenta` consolidado como tile propio.** Un total de cuentas
  de usuario sumado entre clientes no es accionable aislado (no dice si están
  concentradas en un cliente grande o repartidas). Sí responde algo por
  cliente — por eso se usó en el tooltip de "Últ. acceso" de cada fila, donde
  se lee junto a la fecha de acceso (adopción real, no solo "cuántas cuentas
  se crearon").
- **Conteo de "espacios ocupados" derivado (`espacios × ocupación%`).** Se
  consideró y se descartó a propósito: multiplicar dos campos ya publicados
  para mostrar un tercero implicaría una precisión (un número exacto de
  espacios ocupados) que el backend no está afirmando — el % y el total ya
  comunican la magnitud sin fabricar un dato nuevo. Queda anotado en el
  Roadmap como candidato a campo real de backend.
- **Torta / dona para proveedores o para la mezcla de estados.** Nunca se usó
  ni se consideró — la spec lo prohíbe explícitamente y las barras ya
  resuelven mejor tanto la comparación (proveedores) como el ranking
  (ocupación).
- **Spread canon cobrado vs. tarifa de referencia.** No se muestra en la
  vista bajo ninguna forma: el JSON de métricas no trae la tarifa de
  referencia (es dato por-cliente, admin-only, fuera del agregado de Fase 4).
  Mostrarlo habría significado inventar o cruzar una frontera de datos que no
  corresponde a este pase. Va al Roadmap como "necesita backend".
- **Ocupación desglosada por sede dentro de un cliente.** El JSON da un % por
  cliente y un conteo de sedes con plano, pero no el desglose sede-a-sede.
  Fuera de alcance de este endpoint — anotado en el Roadmap.

---

## (c) Roadmap de asesoría — priorizado, con factibilidad y gancho de valor

### Computable HOY con el endpoint actual

1. **Ranking "a quién llamar primero" (ocupación ascendente + sin-dato
   visible).** ✅ Implementado en este pase. *Gancho*: es la vista de
   apertura de cualquier sesión de asesoría — convierte el panel de "mirar
   números" a "decidir con quién hablar hoy".
2. **Riesgo de concentración de proveedores (top-5).** ✅ Implementado en este
   pase. *Gancho*: habilita la recomendación "diversificá tus contratos con
   {proveedor}" sin depender de un dato nuevo.
3. **"Clientes activos vs. total del registro" como salud de cartera.** ✅
   Implementado (contexto del KPI). *Gancho*: cuantifica cuánto negocio está
   fuera de servicio ahora mismo — abre la conversación de reactivación.
4. **Cohortes de adopción (cruzar `usuarios_con_cuenta` + `ultimo_acceso` por
   cliente en un panel propio, no solo en un tooltip).** Computable hoy — los
   dos campos ya están en `AgregadosMetricasCliente` — pero **no** se
   implementó como panel nuevo en este pase por prudencia de densidad (ya hay
   4 tiles + 2 gráficos + 1 tabla de 7 columnas). *Gancho*: detecta cuentas
   "fantasma" — cliente comercialmente activo pero nadie entra a mirar la
   plataforma — el disparador clásico de una cancelación silenciosa. Buen
   candidato para una **siguiente iteración** de este mismo pase, con un
   panel dedicado en vez de sumarlo a la tabla actual.
5. **Conteo real de "espacios ocupados" por cliente (no derivado).** El
   endpoint ya trae `espacios_comercializables` y `ocupacion_pct`; un campo
   `espacios_ocupados` explícito sería trivial de agregar en
   `plataforma_metricas.py` (una multiplicación que el backend ya puede hacer
   con el dato fuente, no derivada a ojo en el frontend). *Gancho*: bajo pero
   real — hoy el % y el total ya comunican la magnitud; el número entero
   ahorra una cuenta mental al operador. Prioridad baja frente a los otros.

### Necesita backend

1. **Tendencia temporal (histórico mes a mes).** El endpoint es una **foto**
   del mes elegido; el sistema no persiste snapshots. Requiere una tabla
   nueva del registro que guarde el agregado mensual (sin migración, mismo
   patrón que otras tablas de Fase 3), poblada cada vez que se calcula
   `getMetricasPlataforma`. *Gancho de valor*: **el más alto de todo el
   roadmap** — "¿estamos mejorando o empeorando?" es la primera pregunta de
   cualquier cliente que paga por una asesoría recurrente, y hoy la consola
   no puede contestarla en absoluto (compara contra nada).
2. **Spread canon cobrado vs. tarifa de referencia (oportunidad de
   precio).** `canon_promedio_mensual` está; la tarifa de referencia
   (`/layout/rates`, admin-only, por-cliente) no está en el agregado. Cruzar
   ambos en el consolidado requiere una decisión explícita de producto y de
   privacidad (¿se puede traer un promedio de tarifa de referencia al
   agregado de plataforma sin violar la frontera que ya fijó la Fase 4?), no
   solo un cambio de endpoint. *Gancho de valor*: **muy alto** — es la
   recomendación de asesoría más directa y vendible ("estás cobrando X% por
   debajo de tu propia tarifa de referencia"), pero el trabajo previo de
   decisión de privacidad es mayor que el técnico.
3. **Concentración de proveedores sobre la cartera completa (no solo
   top-5).** Un índice real de concentración (p. ej. HHI) necesita el total
   de contratos activos y el conteo de proveedores distintos, que el
   endpoint no expone (solo el top-5 con nombre + conteo). *Gancho de
   valor*: medio-alto para el pitch de "gestión de riesgo de proveedores",
   pero el top-5 actual ya cubre el caso de uso más común (identificar al
   proveedor dominante) — no es urgente.
4. **Ocupación desglosada por sede dentro de un cliente.** `sedes_con_plano`
   es hoy solo un conteo; no hay ocupación por sede individual. *Gancho de
   valor*: medio — útil para clientes con múltiples sedes ("¿cuál sede
   específica está floja?"), pero es un refinamiento sobre una vista que ya
   existe, no una vista nueva.
5. **Benchmark contra clientes similares** (comparar la ocupación/canon de un
   cliente contra el promedio de clientes de tamaño o categoría parecida).
   Necesita segmentación (tamaño de sede, categoría de comercio) que no está
   en el JSON de métricas actual, más una definición de negocio de qué hace
   comparables a dos clientes. *Gancho de valor*: alto a mediano plazo (el
   pitch "así te comparás con tus pares" vende asesorías solo), pero es el
   de mayor esfuerzo combinado (backend + producto) del roadmap — última
   prioridad.

---

## (d) Notas de accesibilidad aplicadas

- **Tooltips accesibles por teclado, no solo por mouse.** Cada barra
  (`BarraFila`) ya era `tabIndex={0}` + `role="group"` con `aria-label`; los
  hints de contenido nuevos (ocupación, proveedores) se agregaron tanto al
  `title` (hover de mouse) como quedan cubiertos por el `aria-label` propio
  de la primitiva, que ya incluye el valor en texto plano — nada del
  contenido nuevo depende exclusivamente de un hover con mouse.
- **Color nunca como única señal**, mantenido en todo lo agregado: la barra
  "sin dato" de ocupación lleva texto "sin dato" + guion en `--con-sindato-ink`,
  nunca solo la ausencia de relleno; el estado de cuenta sigue punto+palabra
  sin tocar.
- **Comparabilidad = accesibilidad de lectura.** Mismo redondeo (`toFixed(1)`)
  y misma fuente monoespaciada para todo número nuevo (contexto de KPI, hints,
  concentración de proveedores) que para los números que ya estaban — evita
  que un lector tenga que recalibrar la lectura entre paneles.
- **Vacíos honestos preservados.** La inclusión de las barras "sin dato" en
  el gráfico de ocupación es en sí una mejora de accesibilidad de la
  información: antes esos clientes desaparecían silenciosamente del panel
  (un lector de pantalla o un vistazo rápido no tenía forma de saber que
  faltaban); ahora están, marcados como tal.
- **Cero color hardcodeado.** Todo lo agregado en este pase usa tokens
  `--con-*` ya definidos por el Diseñador (`--con-ink-1/2/3/4`,
  `--con-sindato-ink`) — no se introdujo ningún valor de color nuevo, así que
  el contraste en claro/oscuro heredado por el Diseñador (ya auditado) sigue
  vigente sin cambios.

---

## Verificación

- `cd frontend && npx tsc --noEmit` → limpio.
- `cd frontend && npm run build` → limpio (warning de chunk >500kB
  pre-existente, de Three.js, no introducido por este pase).
- Sin commit ni push.
