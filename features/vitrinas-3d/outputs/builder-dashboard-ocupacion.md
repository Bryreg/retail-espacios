# Dashboard — Ocupación real vs esperada — entregable

Builder: `builder-dashboard-ocupacion` (equipo sistemas-maestros). Territorio tocado, exactamente el declarado:

- `frontend/src/api/dashboard.ts` — agregado `OcupacionSede`, `OcupacionParams`, `getOcupacion()`. No se tocaron `getKpis`/`getSpaces` ni sus tipos existentes.
- `frontend/src/pages/DashboardView.tsx` — dos imports, dos `useMemo` nuevos (`brechaOcupacion`, `periodoOcupacion`) y un render nuevo de `<OcupacionSection>` al pie del modo Supervisar. Nada existente se modificó ni se movió.
- `frontend/src/components/Ocupacion/` — **nuevo**: `Ocupacion.tsx` (sección principal), `BarraSede.tsx` (barras esperada/real por sede), `TablaOcupacion.tsx` (alternativa accesible en tabla), `format.ts` (plata, espejo de `formatCOP`/`compactCOP`), `types.ts` (`BrechaEspacio`).

No se tocó `StoreEditor3D/**`, `api/spaces.ts`, `store/fixtureStore.ts`, `index.css` ni `tailwind.config.js`. `frontend/src/pages/Dashboard.tsx` no necesitó cambios: la sección nueva vive enteramente dentro de `DashboardView.tsx`, que es lo que `Dashboard.tsx` monta como pestaña "Sede".

**Este documento reemplaza la versión anterior** (ronda 1). Sección 0 resume qué cambió en la ronda 2 (ajuste de prorrateo /30); el resto del documento está reescrito para reflejar el estado final, no un diff sobre la versión vieja.

## Verificación

```
cd frontend && npx tsc --noEmit     # limpio, sin salida
cd frontend && npx vite build       # build de producción OK (2197 módulos, sin errores)
cd backend && python -c 'import app.main'   # OK (no toqué backend, verificación de cortesía)
```

---

## 0. Ronda 2 — ajuste de prorrateo /30 (lo que cambió en esta iteración)

El Maestro (derivado del hallazgo del auditor contable, `auditor-contador-pl.md`, punto B-1)
avisó que `ingreso_contratado`/`ingreso_a_referencia` pasan de "suma de `monthly_rent` completo
de los contratos que tocan el período" a **devengado prorrateado**: `monthly_rent / 30 × días de
intersección` (inclusiva en los dos extremos) — fix a cargo de `builder-rates-api`, en su
territorio (`backend/app/services/ocupacion.py`). El contrato de `GET /dashboard/ocupacion` **no
cambia de forma ni de nombres** — mismas dos claves, mismo gateo por rol — así que no hubo ningún
cambio de tipos en `api/dashboard.ts`, sólo de **cómo se leen esos dos números en pantalla**.

Lo que cambié, dentro de mi territorio:

1. **Rotulado admin-only relabeled en `BarraSede.tsx` y `TablaOcupacion.tsx`.** Antes decía
   "`$X contratado · $Y a referencia`" y la columna de tabla decía "Contratado" / "A referencia" —
   ninguna de las dos palabras avisaba que la cifra es del período y no del mes. Ahora:
   - `BarraSede.tsx`: `"$X devengado del período (prorrateado) · $Y a referencia (prorrateado)"`.
   - `TablaOcupacion.tsx`: cabeceras `"Contratado (período)"` / `"A referencia (período)"`, más una
     nota de una sola línea debajo de la tabla (admin-only, no repetida por fila): *"Contratado / a
     referencia: ingreso devengado del período, prorrateado a los días que cada contrato toca el
     rango elegido (canon / 30 × días) — no es el 'Canon vigente' mensual de la franja de arriba,
     que siempre reporta hoy. Las dos columnas no se suman ni se comparan entre sí en esta tabla."*
   - Motivo: la franja de cinco cifras que está arriba de esta sección (`Cifra`, preexistente,
     fuera de mi territorio) ya usa la palabra **"Canon vigente"** para una cifra distinta —
     siempre HOY, sin prorratear, leída del JSON del layout. Si mi sección hubiera seguido diciendo
     sólo "contratado", un admin podría leer las dos cifras como la misma pregunta y restarlas o
     compararlas pensando que miden lo mismo. No lo hacen: fuentes distintas (`space_leases`
     filtrado por período vs snapshot de hoy) y períodos distintos (rango del `SeasonPicker` vs
     hoy). Esa divergencia arquitectónica (modelo dual `space_leases`/JSON, ya señalada por el
     auditor contable) **queda como hallazgo abierto** — no la resuelvo acá, sólo evito que mi
     rotulado la esconda.
2. **No se agregó ningún cálculo de desvío o porcentaje entre las dos cifras.** El aviso de
   ronda 2 decía "si mostrás la relación entre las dos cifras, el signo tiene que leerse correcto
   en ambos sentidos" — condicional. Con el prorrateo, "a referencia" puede terminar por ARRIBA
   **o por ABAJO** de "contratado" según qué contratos caigan dentro del período (el propio
   ejemplo del Maestro: caso a −4,1 %, `a_referencia` por DEBAJO de lista). Antes del prorrateo,
   "a referencia" tendía a ganar casi siempre (suma tarifas de TODAS las caras, contratadas o no,
   vs sólo las contratadas) — con el prorrateo esa intuición ya no vale, porque un contrato corto
   a tarifa alta dentro de un rango largo puede aportar más devengado que la referencia
   prorrateada de esa misma cara. En vez de calcular una resta o un `%` que dependería de tener
   el signo bien en los dos sentidos (y de mantenerlo bien si el criterio de prorrateo cambia de
   nuevo), **decidí no mostrar ninguna relación**: las dos cifras se yuxtaponen ("· ") sin
   operarlas en pantalla. Es la opción que no puede tener el signo al revés porque no hay signo
   que mostrar. Documentado con comentario en el propio código (`BarraSede.tsx`).
3. **La brecha cliente-side y el doble candado NO se tocaron**, tal como pedía la ronda 2.
   Verificado: `grep -n "isAdmin\|in fila\|in f)"` sobre los dos componentes sigue mostrando el
   mismo patrón `isAdmin && "ingreso_contratado" in fila` / `isAdmin && filas.some(...)` que
   la ronda 1 — ni una línea distinta. `brechaOcupacion` en `DashboardView.tsx` no toca dinero
   (usa `rangeAvailability` + `montajeDe`, ninguno de los dos devuelve plata), así que el fix de
   prorrateo no la afecta en absoluto — no había nada que ajustar ahí.
4. **`getOcupacion()` sigue degradando 404 → `null` → sección oculta, sin cambios.** El fix de
   ronda 2 es de semántica del valor, no de forma de la respuesta ni de status codes, así que la
   degradación no tenía por qué tocarse y no se tocó.
5. **Comentarios/JSDoc actualizados** en `api/dashboard.ts` y en el bloque de fórmulas de
   `Ocupacion.tsx` para documentar la fórmula `/30 × días` en vez de "sin prorratear" — ver
   sección 3 de este documento, que ya está reescrita con la fórmula nueva.

**Nota de honestidad sobre el estado del backend en este working tree**: al momento de escribir
esto, `backend/app/services/ocupacion.py` (territorio de `builder-rates-api`, no tocado por mí)
**todavía calcula sin prorratear** — `monto += float(lease.monthly_rent or 0)` en `_cubre_periodo`,
sin ningún `/ 30 × días` — y `features/vitrinas-3d/outputs/builder-rates-api.md` tampoco refleja
el fix (sigue diciendo "SIN prorratear" en su propio texto). El fix de prorrateo lo aplica ese
builder en paralelo o después; mi ajuste es en el LABEL y la documentación, preparado para leerse
correcto en cuanto ese fix se aplique — y como el contrato no cambia de forma, no necesito ningún
cambio adicional de mi lado cuando eso pase. Si alguien lee la pantalla HOY contra el backend tal
como está en este árbol, el número mostrado seguirá siendo el monto sin prorratear pero **ya
rotulado como "devengado del período (prorrateado)"** — un rótulo que se adelanta al dato real
hasta que el otro builder aplique su fix. Lo marco como gap explícito en la sección 7.

---

## 1. Dónde vive y cuándo se ve

La sección se agrega **al pie del modo Supervisar** de la pantalla Sede (`DashboardView.tsx`), después de "Estado por espacio" y antes de los overlays. Dos decisiones de encuadre:

- **Sólo en Supervisar, nunca en Vender.** `docs/ESTADO.md` es explícito: Vender "no lleva KPIs — para poner un precio no sirve la ocupación de hoy". Meter una comparación de ocupación ahí competiría con esa regla. El mercaderista (`worker`) **no tiene** el interruptor y su pantalla siempre es Supervisar, así que la sección le llega igual.
- **El período es el mismo `SeasonPicker` de siempre** (`mapRange`, el que ya pinta el mapa y el encabezado de la franja). No se agregó un segundo calendario. Cuando `mapRange` todavía no se inicializó (primer tick de render) se manda sin `desde`/`hasta`, que el backend interpreta como "hoy" — el mismo default que usa `hoyComoRango()` del lado del cliente, así que no hay una ventana en la que el número muestre un período distinto al que dice el encabezado.

**Deliberadamente distinto de la franja de cinco cifras que está arriba**: esa franja (`Cifra` — "Canon vigente", "Ocupación", "Sin montar"...) es **siempre "hoy"**, sin importar qué período tenga puesto el `SeasonPicker` — está documentado así en `docs/ESTADO.md` ("Las tarjetas de arriba siguen reportando hoy, a propósito") y el código lo confirma: el `useMemo` de `kpis` no depende de `mapRange`. La sección nueva es la única parte de Supervisar que de verdad contesta por el período elegido, no por hoy — que es exactamente lo que pedía la tarea ("ocupación real vs esperada... por sede y por período"). Esta distinción es también, ahora, la razón concreta por la que el rotulado admin-only tiene que decir "período" y no "canon" (ver sección 0).

## 2. Qué consume

`GET /api/dashboard/ocupacion` — **sin** `sede` (trae todas las sedes con plano guardado) y con `desde`/`hasta` = el `mapRange` vigente. La decisión de no filtrar por sede es a propósito: la comparación que pide la tarea es **entre sedes**, y filtrar a una sola habría dejado una sola barra repetida, que no compara nada. La sede en pantalla se resalta (texto "esta sede", nunca sólo color) y ordena primera; el resto sigue en orden alfabético.

No se tocó el endpoint (territorio de `builder-rates-api`) ni `backend/app/services/ocupacion.py`. El contrato consumido es el que ese builder implementó y documentó en `features/vitrinas-3d/outputs/builder-rates-api.md` — la forma no cambió en ronda 2, sólo la semántica de dos campos (sección 0).

### Degradación si el endpoint no está desplegado

`getOcupacion()` atrapa un 404 y devuelve `null` en vez de propagar el error; `OcupacionSection` con `null` (y sin error real) **no dibuja nada** — ni una tarjeta vacía, ni un mensaje de "no disponible". Es la misma regla que ya rige el resto de la pantalla: un chip o una sección que no puede devolver nada no se dibuja. Un error real (500, red caída) sí deja un renglón mudo: "No se pudo cargar la ocupación por sede." — para que una falla de verdad no desaparezca en silencio, a diferencia de "el endpoint todavía no existe". Sin cambios en ronda 2.

## 3. Las fórmulas — EXACTAS, con numerador, denominador, período y fuente

Las cuatro primeras las calcula el backend (`backend/app/services/ocupacion.py`, función `sede_ocupacion`); esta sección sólo las lee y las pinta. Las reproduzco acá tal como las implementa (con el prorrateo /30 en las dos filas de dinero, ajustado en esta ronda), porque es lo que pide el entregable:

| KPI | Numerador | Denominador | Período | Fuente |
|---|---|---|---|---|
| **`caras_comercializables`** | — (es el total) | — | No aplica (estado del plano, no del período) | `layout_snapshots` de la sede: cada fixture con `rentable !== false` cuenta como 1 cara, y 2 si es góndola doble (`SEDE-CODE` y `SEDE-CODE-B`) |
| **Ocupación esperada** (`ocupacion_esperada_pct`) | `contratadas` = caras con **al menos un** `SpaceLease` activo (`is_active=True`) cuyo `[start_date, end_date]` **toca** `[desde, hasta]` (se solapa aunque sea un día — mismo criterio que el choque de fechas al crear un contrato; **no** prorratea el conteo — un contrato de un día dentro de un período de un mes cuenta la cara entera como "contratada") | `caras_comercializables` | `[desde, hasta]` pedido; sin él, HOY (un solo día) | `spaces` + `space_leases`, filtrado por `is_active` |
| **Ocupación real** (`ocupacion_real_pct`) | `montadas` = de las `contratadas`, cuántas tienen el **último** reporte de `mount_confirmations` (no archivado, el más reciente por `confirmado_en`) en estado `"montado"` | `caras_comercializables` — **el mismo denominador que la esperada**, no `contratadas`. Elegido así (decisión del otro builder, documentada y que yo también adopto en el cliente) para que las dos barras se lean contra el mismo total y sean directamente restables entre sí en un mismo gráfico | El montaje no lleva fecha propia — es un hecho del presente — así que no se filtra por `[desde, hasta]`, sólo pregunta "¿está montada la que está contratada para este período?" | `mount_confirmations` |
| **`vencidas`** | — (es un conteo, no una razón) | — | Mirado desde el **final** del período pedido (`hasta`), no desde "hoy" real — para que el número sea coherente con el resto de las cifras del mismo período consultado | `space_leases`, ignorando `is_active` a propósito (ver nota abajo) |
| **`ingreso_contratado`** (admin) — **DEVENGADO PRORRATEADO** | Σ, sobre cada `SpaceLease` `is_active` que toca `[desde, hasta]`, de `monthly_rent / 30 × días_de_intersección` — la intersección es `[max(desde, lease.start), min(hasta, lease.end)]`, inclusiva en los dos extremos (`(b - a).days + 1`) | — (es una suma, no una razón) | `[desde, hasta]` pedido | `space_leases`. **No** es el "Canon vigente" de la franja de arriba (esa siempre es HOY, sin prorratear, del JSON del layout) — fuentes y períodos distintos, no se suman ni se comparan en esta sección |
| **`ingreso_a_referencia`** (admin) — **mismo prorrateo `/30`** | Σ, sobre TODAS las caras comercializables (contratadas o no), de `tarifa_de_referencia(tipo, sede) / 30 × días_del_período` — el techo de P&L del período si todo se hubiera vendido a tarifa de lista, ya prorrateado al mismo rango | — | `[desde, hasta]` pedido | `app_config` (`layout_reference_rates`) |

**Nota importante sobre el signo**: con el prorrateo, `ingreso_a_referencia` **no está garantizado
a ser siempre mayor** que `ingreso_contratado` — antes del fix (suma completa de `monthly_rent` sin
prorratear vs suma de TODAS las tarifas) esa relación era casi automática porque el numerador de
"a referencia" corre sobre más caras. Con las dos cifras prorrateadas al mismo rango, un contrato
corto a tarifa alta puede devengar, dentro de un período largo, más que la tarifa de referencia
prorrateada de esa misma cara — el caso que el Maestro reportó en −4,1 %. Por eso esta sección
**no calcula ni muestra una resta o un porcentaje entre las dos cifras** (ver sección 0, punto 2):
es la forma de no tener el signo mal en ningún sentido, porque no hay signo mostrado.

**La brecha** — el dato accionable que pide la tarea, mostrado como lista de códigos y no sólo
como número — **no cambió de criterio en esta ronda** (el ajuste de ronda 2 fue explícito en que
no había que tocarla). No la calcula el backend agregado (sólo da conteos). La calculo en el
cliente, en `DashboardView.tsx` (`brechaOcupacion`, `useMemo`), con el **mismo criterio** que el
backend, pero por fila:

- Numerador de la brecha: caras de la sede en pantalla con `rangeAvailability(entry, mapRange.from, mapRange.to) !== "libre"` (contratada para el período — mismo helper que ya usa `rangeTally` en esta misma pantalla para "Cuándo se libera cada espacio") **y** cuyo último reporte de montaje no es `"montado"` (`montajeDe(entry)?.estado !== "montado"`).
- Fuente: `useFixtureStore` (el JSON del layout, ya cargado por la página) + `fetchMounts()` (ya cargado por la página) — **no** un endpoint nuevo, ni una llamada extra: son datos que `DashboardView.tsx` ya tenía en memoria para otras secciones de la misma pantalla (p. ej. "Contratado sin montar" en Atención).
- Alcance: **sólo la sede en pantalla**. Ver gap #2.
- No toca dinero en ningún punto de su cálculo, así que el fix de prorrateo de ronda 2 no la afecta.

### Sobre `vencidas` e `is_active`

El backend calcula `vencidas` mirando sólo `end_date < hasta`, **ignorando** `is_active` — así sobrevive a que otro endpoint (el mapa, los KPIs) ya haya corrido `expire_leases()` y apagado esa bandera antes de que esta pantalla pregunte. Documentado con test propio del lado del backend (`test_vencido_sobrevive_a_que_otro_endpoint_ya_corrio_expire_leases`). Lo señalo acá porque es contraintuitivo mirando sólo el nombre del campo, y quien lea este entregable sin leer el del backend podría asumir lo contrario.

## 4. Visualización

- **Barras, nunca pie/donut.** Una fila horizontal por sede, con dos barras apiladas ("Esperada" arriba, "Real" abajo) — nunca un solo gráfico circular ni una dona.
- **Colores: ninguno del semáforo de tres estados.** La barra "Esperada" usa `var(--ink-3)` y "Real" usa `var(--ink-1)` — la escala de tinta neutra, no `--libre`/`--entra`/`--ocupado`. Es deliberado: esta barra no describe el estado de UN espacio (para eso está el plano, con su semáforo), describe qué fracción del INVENTARIO está en cada situación — y un "Real" pintado de verde se leería, por la convención ya establecida en toda la app, como "libre", cuando significa exactamente lo contrario (tomado y montado). El único color del semáforo que sí se reusa es `--ocupado`, pero sólo como **texto** para el conteo de "vencidas" — mismo uso que ya tiene en `Cifra`/`AtencionRow` en esta misma pantalla (alarma en texto, no en una barra de estado). Sin cambios en ronda 2.
- **Cada serie rotulada con palabra.** "Esperada" y "Real" van escritos con la clase `.rotulo` (9.5px, versalita) al lado de cada barra, más un párrafo explicando qué significa cada una arriba de todo. Ninguna lectura depende sólo del color.
- **Tamaños: sólo los siete de la escala** (9.5 · 11 · 12 · 13 · 14.5 · 17 · 27), verificados uno por uno tras el ajuste de ronda 2 — el texto nuevo de las notas de prorrateo usa 11 (heredado, sin `fontSize` propio en los `<b>`/`<span>` anidados).
- **Tabla accesible, debajo de las barras**, dentro de la misma tarjeta: mismas columnas (las dos de dinero ahora dicen "Contratado (período)" / "A referencia (período)"), con `<caption>` oculto visualmente y la sede en pantalla resaltada con el mismo patrón que `SpacesTable`. Nueva en ronda 2: una nota de una línea debajo de la tabla, admin-only, explicando el prorrateo y aclarando que las dos columnas no se suman ni se comparan en pantalla.
- **Brecha**: lista de códigos, sin cambios en ronda 2.

## 5. Rol worker

- Las dos cifras (`ocupacion_esperada_pct`, `ocupacion_real_pct`) y los conteos (`caras_comercializables`, `contratadas`, `montadas`, `vencidas`) son números y porcentajes puros — se muestran igual para los dos roles.
- Las líneas de plata (`ingreso_contratado`/`ingreso_a_referencia`, por sede, y las dos columnas correspondientes en la tabla) están gateadas **dos veces**: `isAdmin === true` **y** presencia real de la clave en la respuesta (`"ingreso_contratado" in fila`), nunca por `!== null` — **sin tocar en esta ronda**, verificado por lectura de código (sección 0, punto 3). `formatCOP` local devuelve "—" para 0, así que ni siquiera un ingreso genuinamente nulo para un admin se ve como "$0".
- **La brecha (lista de códigos) SÍ se muestra a worker**, decisión de ronda 1 que se mantiene: no lleva plata (código + nombre de proveedor), y la tarea la pide explícitamente para worker.
- Verificado en esta ronda: `grep -n "isAdmin\|in fila\|in f)"` sobre `BarraSede.tsx` y `TablaOcupacion.tsx` — el patrón de doble candado es idéntico al de ronda 1, ninguna rama nueva de dinero quedó sin gatear.

## 6. Endpoints consumidos

- `GET /api/dashboard/ocupacion` (sin `sede`, con `desde`/`hasta` = `mapRange`) — el único nuevo. Territorio de `builder-rates-api`; no lo modifiqué. La forma no cambió en ronda 2.
- Ninguno más. La lista de códigos de la brecha **no** dispara ningún llamado adicional — usa datos que `DashboardView.tsx` ya tenía cargados (`useFixtureStore`, `fetchMounts()`).

`GET /api/dashboard/kpis` y `GET /api/dashboard/spaces` (los que ya existían) no se tocaron ni se usaron para esta sección.

---

## 7. Gaps y decisiones que quedan explícitas para el orquestador

1. **El backend de este working tree todavía NO tiene aplicado el fix de prorrateo /30**
   (nuevo, detectado en esta ronda). `backend/app/services/ocupacion.py::_cubre_periodo` suma
   `monthly_rent` completo sin dividir por 30 ni multiplicar por días — el fix es territorio de
   `builder-rates-api` y no está en el árbol al momento de escribir esto (su propio entregable,
   `builder-rates-api.md`, tampoco fue actualizado — sigue describiendo "sin prorratear"). Mi
   ajuste es sólo de rotulado/documentación, preparado para la semántica nueva; no requiere ningún
   cambio adicional de mi lado una vez que ese builder aplique el fix, porque el contrato no
   cambia de forma. Mientras tanto, el rótulo "devengado del período (prorrateado)" se adelanta al
   dato real que efectivamente sirve el backend — quien revise la pantalla contra ESTE backend
   verá un número sin prorratear con una etiqueta que ya dice "prorrateado". No lo puedo cerrar
   desde mi territorio (no toco backend); lo marco para que el orquestador confirme que
   `builder-rates-api` aplicó su fix antes de considerar esta ronda cerrada de punta a punta.

2. **El contrato "acordado" de la tarea describe un objeto singular**
   (`{ sede, caras_comercializables, ... }`); el backend implementado responde **siempre una
   lista**, incluso con `sede=` puesto. Construí el cliente contra la lista — sin cambios en
   ronda 2.

3. **El endpoint agregado no expone códigos de espacio, sólo conteos.** La brecha con lista de
   códigos sólo está disponible para la sede en pantalla — sin cambios en ronda 2. Si se necesita
   para cualquier sede sin cambiar de sede en la app, hace falta un endpoint nuevo
   (`GET /dashboard/ocupacion/brecha?sede=&desde=&hasta=`), no construido porque el backend es
   territorio de otro builder.

4. **Divergencia arquitectónica `space_leases` (mi sección) vs JSON del layout (franja de
   arriba) — señalada ahora explícitamente en el rotulado, no resuelta.** El auditor contable
   (`auditor-contador-pl.md`) documenta con más detalle esta misma divergencia (tres cifras de
   ingreso distintas conviviendo en el sistema). Mi sección no la resuelve — sólo evita
   agravarla mostrando las dos cifras con nombres que ya no chocan con "Canon vigente", y no
   suma ni compara "contratado (período)" contra esa cifra de arriba en ningún punto de la UI.
   Sigue siendo una decisión de producto pendiente: ¿cuál de las fuentes manda para P&L?

5. **Dos definiciones distintas de "sin montar" conviven en la misma pantalla** —
   `montaje.sinMontar` (contratos vigentes HOY, ventana de 60 días) vs `brechaOcupacion` (caras
   contratadas para el período del `SeasonPicker`, sin ventana). Sin cambios en ronda 2; sigue
   documentado como decisión deliberada, no como inconsistencia accidental.

6. **Tamaños de fuente fuera de la escala de siete, preexistentes** en archivos que toqué
   (`DashboardView.tsx`: `12.5` en varias celdas de `SpacesTable`, no introducido por mí). Ninguno
   de mis archivos nuevos ni las líneas agregadas en ronda 2 usa un tamaño fuera de
   {9.5, 11, 12, 13, 14.5, 17, 27}.

7. **No hay test automatizado nuevo para esta sección** (sin runner de componentes React en el
   repo). Verificación manual: `tsc --noEmit` limpio, `vite build` exitoso (2197 módulos), y
   lectura de código forzando `isAdmin=false`/`true` y `filas=null`(404)/`[]`/con datos, en los
   tres componentes. Sin cambios de fondo en ronda 2 más allá de re-verificar el mismo checklist
   contra el código nuevo.

8. **No verifiqué contra un backend corriendo con datos reales** con el fix de prorrateo
   efectivamente aplicado (no levanté `uvicorn` con leases sembrados y el fix puesto) — sólo
   TypeScript, build y lectura de código, más lectura directa de `ocupacion.py` para confirmar
   que el fix todavía no está (gap #1). Si `builder-rates-api` aplica el fix con una fórmula de
   prorrateo distinta a `/30 × días_inclusivos` (p. ej. días reales del mes, o exclusivo en un
   extremo), el rotulado de esta sección ("canon / 30 × días") quedaría desactualizado y habría
   que ajustarlo — un cambio de texto, no de tipos ni de lógica.
