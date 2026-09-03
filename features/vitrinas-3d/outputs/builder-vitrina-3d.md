# Especialista Three.js — semáforo de ocupación en el 3D

Estado: **construido y verificado** (`cd frontend && npx tsc --noEmit` limpio; `cd backend && python -c "import app.main"` limpio — no toqué backend, verificación de que no rompí nada ajeno).

Rama: `claude/sistemas-maestros-retail-mzb1om` en `/tmp/retail-espacios-test`. No hice commit ni push (le toca al orquestador humano).

---

## 1. Qué se construyó

**Modo Ocupación**: un interruptor nuevo (`🚦 Ocupación`) en la barra del editor 3D, al lado de "Antes/después". Al prenderlo:

- Cada **cara** comercializable de cada mueble se pinta con la terna auditada de tres colores según su disponibilidad en el período elegido — **la MISMA terna que ya pinta el mapa 2D de la sede** (`RANGE_TOP`/`RANGE_LABEL` en `DashboardView.tsx`), nunca una paleta nueva.
- Lo no comercializable queda gris pizarra (`#64748b`) — esto YA pasaba antes de esta feature (no lo toqué; ver §5).
- Una **góndola doble pinta sus dos caras por separado** (cara A e índice de material 5/−Z; cara B e índice 4/+Z), cada una con su propio estado — usa el pipeline `facePaintArray`/`LaminaDeProducto` que ya existía para las fotos de producto, sin agregar geometría.
- Aparece una **segunda fila** bajo la barra con el `<SeasonPicker>` real (el mismo componente que usa Sede → Vender, no una fecha reinventada), envuelto en una píldora clara porque ese componente está pensado para la paleta de luz y el editor 3D es oscuro.
- La **leyenda** del panel izquierdo ("Estados") cambia a "Ocupación · leyenda" con los tres estados rotulados + "No comercializable", en vez de la leyenda de "hoy".
- El **panel del mueble seleccionado** suma un bloque "Tarifa de referencia" que llama `GET /spaces/{code}/rates` (cara A, y cara B si es góndola doble) y muestra tarifa + desvío + confirmación de ocupación del backend — degradando con gracia si el campo/endpoint no está.
- El **tooltip al pasar el mouse** por un mueble, en Modo Ocupación, muestra el estado por período (con su fecha) en vez del estado de hoy, cara A y cara B por separado si aplica.

## 2. Tabla estado → color → token

Ésta es la ÚNICA terna que se usa (no se inventó ninguna, tal como pide el guardrail). Sale literal de `frontend/src/index.css` y de `RANGE_TOP`/`RANGE_LABEL` en `pages/DashboardView.tsx`, que es donde el mapa 2D de la sede ya pinta exactamente esta misma lectura por período:

| Estado (`RangeAvailability`) | Lectura | Color | Token CSS | Dónde se usa |
|---|---|---|---|---|
| `libre` | Libre todo el período | `#00786A` | `--libre` | Cara pintada (panel sólido) + trim de estado + leyenda + tooltip |
| `parcial` | Se libera en el período | `#F08519` | `--entra` | ídem |
| `tomado` | Tomado | `#8E1226` | `--ocupado` | ídem |
| — (no comercializable) | No comercializable | `#64748b` | — (mismo valor que `NON_RENTABLE_COLOR`/`NON_RENTABLE_STROKE` del 2D; no es literalmente `--resto` `#D3D9DB`, ver §5) | Cuerpo del mueble entero |

Derivación: `rangeAvailability(face, from, to, today?)` de `frontend/src/types/fixtures.ts` — la MISMA función que usa `DashboardView.tsx`. No escribí una segunda regla; `frontend/src/utils/semaforo3d.ts` es un envoltorio delgado (`estadoDeCara`) que sólo le agrega caché de materiales y textos, no reglas nuevas.

**No hay un cuarto/quinto color** (violeta para "contratado, aún no arranca"; un rojo distinto para "vencido"). Ver el gap #1 más abajo — es la corrección más importante que encontré contra el brief original.

## 3. Endpoints consumidos

### `GET /spaces/{code}/rates?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`

**Ya existe en este checkout** — lo construyó en paralelo el agente de backend de esta misma sesión (`backend/app/routers/spaces.py` + `backend/app/services/ocupacion.py`, con `backend/tests/test_space_rates.py`). No tuve que "degradar con gracia contra un contrato futuro": pude leer el código real y alinear el cliente contra el contrato EFECTIVO, no el asumido.

`{code}` = `fullSpaceCode(sede, code)` en mayúsculas, cara B con sufijo `-B` — exactamente como pide el brief, y coincide con `find_fixture_by_space_code` del backend (que despoja el `-B` para resolver el fixture y lo conserva para resolver la fila `Space`).

Contrato real (confirmado leyendo `services/ocupacion.py`, NO asumido):

```ts
interface SpaceRatesDTO {
  code: string;
  sede: string;
  type: string;
  reference_rate?: number;        // sólo admin — lista blanca real: para otro rol la clave NI EXISTE en el JSON
  occupancy: {
    estado: "libre" | "se_libera" | "tomado";   // con desde+hasta (este cliente siempre los manda)
    lease_desde?: string | null;
    lease_hasta?: string | null;
    se_libera_el?: string | null;
  };
}
```

Cliente: `frontend/src/api/spaces.ts` → `getSpaceRates(code, desde, hasta): Promise<SpaceRatesDTO | null>`. Nunca rechaza — cualquier error (404, 403, red) resuelve a `null` y el panel simplemente no dibuja el bloque. El semáforo del 3D **no depende de esta llamada**: pinta desde el store del layout (regla dura #2 del brief), esto es sólo la tarifa suplementaria del panel.

## 4. Archivos tocados

- `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx` — toda la integración: interruptor, `SeasonPicker` embebido, leyenda, `facePaintById` con rama de Ocupación, `statusColorOverride` en `FixtureMesh`, bloque de tarifa en `CommercialPanel`, tooltip enriquecido. (~266 líneas nuevas sobre 5.490.)
- `frontend/src/api/spaces.ts` — `getSpaceRates`, `SpaceRatesDTO`, `SpaceOccupancyDTO`, `OCCUPANCY_ESTADO_LABEL`.
- `frontend/src/utils/semaforo3d.ts` — **nuevo**. Colores/labels de la terna (mirror literal de `index.css`/`DashboardView.tsx`), `estadoDeCara` (envoltorio de `rangeAvailability`), `getOcupacionMaterial` (caché de 3 `THREE.MeshBasicMaterial`, mismo patrón que `photoMatCache`/`faceTextureCache` del archivo grande), `detalleDeCara` (texto de fechas para el tooltip), `CARA_B_VACIA` (default "free" para una cara B nunca tocada — mismo patrón que `EMPTY_FACE` en `DashboardView.tsx`/`FloorPlan2D.tsx`).

No toqué `fixtureStore.ts` (no hizo falta), ni `pages/Dashboard*`, ni `api/dashboard.ts`, ni `index.css`, ni `tailwind.config.js`, ni nada de `backend/`.

## 5. Gaps y decisiones reportadas (nada inventado)

**#1 — El brief pide violeta para "contratado, aún no arranca" y un tratamiento distinto para "vencido"; el código y `docs/ESTADO.md` dicen exactamente lo contrario, y son más recientes que el brief.**
Leyendo `pages/DashboardView.tsx` encontré el comentario explícito sobre `RANGE_TOP`: *"sale de la misma paleta de tres, **sin el violeta que arrastraba del sistema anterior**"*. Y en `docs/ESTADO.md` § Paleta: *"El plano pinta siempre esa escala de tres [...] antes [...] contestaba con la otra —"qué pasa hoy", siete clases— y ahí `free` contra `maintenance` daba ΔE 3.6 en deuteranopía"*. O sea: hubo un violeta para "contratado", se sacó a propósito por la auditoría de dicromacia, y la regla dura del proyecto es que **una vista por período usa SIEMPRE la terna de tres, nunca una cuarta clase**. `rangeAvailability` (la única fuente de verdad para lecturas por período) sólo puede devolver `libre`/`parcial`/`tomado` — no hay una cuarta rama para "pendiente" ni una quinta para "vencido": un contrato que ya venció simplemente no bloquea el período elegido (se lee `libre`, correctamente, porque para un período futuro SÍ está libre).
Seguí `docs/ESTADO.md` y el código, como manda `CLAUDE.md` ("ante cualquier contradicción, manda ESTADO.md y el código"). **No agregué violeta ni un color nuevo para vencido.** Lo que SÍ agregué, sin tocar la terna, es texto: el tooltip y (indirectamente, vía `occupancy.estado` del backend) el panel de tarifa distinguen "vigente" de "recién firmado" con **palabras**, nunca con un color extra — que es justo lo que pide la regla "el estado va siempre rotulado".
Si el Maestro necesita el violeta de verdad, es una decisión de paleta (mover/agregar un color) que **exige volver a correr la cuenta de dicromacia**, como dice `docs/ESTADO.md` explícitamente — no es algo que yo deba decidir ni improvisar en este archivo.

**#2 — `frontend/src/components/FloorMap/zones.ts` (que el brief señaló como "cómo pinta estados el 2D") es código casi muerto, no la fuente de verdad.**
Lo leí completo: es un mapa de zonas por coordenadas de píxel sobre una imagen `plano.png` de 1229×896, con una paleta vieja (verde/rojo/ámbar genéricos, sin relación con `--libre`/`--entra`/`--ocupado`). Sólo lo importa `components/Legend/Legend.tsx`, que a su vez **no lo importa nadie** (confirmé con grep en todo `frontend/src`). La fuente de verdad real del pintado por período es `rangeAvailability` (`types/fixtures.ts`) + `RANGE_TOP`/`RANGE_LABEL` (`pages/DashboardView.tsx`), que es lo que usé. Lo señalo porque seguir la pista literal del brief hacia `zones.ts` habría llevado a una paleta equivocada.

**#3 — El contrato de `occupancy.estado` que trae el brief no coincide con el que construyó en paralelo el agente de backend.**
El brief describía `occupancy: { estado, lease_desde?, lease_hasta?, se_libera_el? }` sin fijar los valores de `estado`. El backend real usa **`"se_libera"`**, no `"parcial"` (que es el vocabulario de `RangeAvailability` del cliente). Son dos vocabularios a propósito — el del pintado local y el que confirma el backend — y los mezclé mal en un primer borrador (usé por error el label del cliente para el estado del backend); lo encontré leyendo `services/ocupacion.py` y lo corregí antes de terminar (`OCCUPANCY_ESTADO_LABEL` en `api/spaces.ts`, separado de `OCUPACION_LABELS` en `utils/semaforo3d.ts`). Dejo esto explícito porque es exactamente el tipo de discrepancia silenciosa que un bug real no avisa.
También: `occupancy_range` (la rama que corre cuando mandás `desde`/`hasta`, que es SIEMPRE en este cliente) **nunca llena `lease_desde`/`lease_hasta`/`se_libera_el`** — sólo devuelve `{"estado": ...}`. Esos tres campos sólo se llenan en `occupancy_today` (sin `desde`/`hasta`), que este cliente no usa. El tipo los deja opcionales (no rompe nada, el código ya los gatea con `&&`), pero en la práctica hoy nunca se van a ver — lo aviso para que nadie los dé por garantizados.

**#4 — Cobertura parcial fuera de `TIPOS_CON_PRODUCTO`.**
El pintado de cara completa (panel sólido, el indicador más visible) sólo llega a los tipos con lámina de producto: góndola, punta, robatope, ristra, cross, mueble, isla, batea, impulsador, nevera_refrescos, nevera_carnes, isla_fria, stand_frutas — que cubre prácticamente todo el inventario real vendible. Dos tipos comercializables de verdad (están en `RATE_TYPES` con tarifa propia) quedan afuera de ese camino: **`checkout`** y **`metro`**. Para ésos agregué una segunda vía — `statusColorOverride` en `FixtureMesh`, que alimenta el trim de estado que esos meshes YA tenían (antes coloreaba por el estado de HOY; ahora, en Modo Ocupación, colorea por período) — así que si alguien flipea una "Zona Libre" o una "Cabecera de caja" a comercializable, sigue recibiendo una señal de color, aunque más chica que el panel completo de una góndola. `servicio_cliente` (no está en `RATE_TYPES`, es infraestructura por defecto) se queda sin ninguna señal si alguna vez se lo flipea a comercializable — su mesh (`ServicioClienteMesh`) nunca tomó el prop `statusColor` ni antes de esta feature; agregárselo hubiese significado tocar geometría de un componente que hoy no tiene ningún elemento coloreable por estado, y no quise inventar uno.

**#5 — "Gris pizarra" para lo no comercializable ya existía; no inventé un color, pero tampoco es literalmente `--resto`.**
`NON_RENTABLE_COLOR = "#64748b"` ya estaba en el archivo desde antes de esta feature (usado para TODO fixture no comercializable, con o sin Modo Ocupación). Es el mismo valor que `NON_RENTABLE_STROKE` del 2D (`FloorPlan2D.tsx`). No es el mismo hex que `--resto` (`#D3D9DB`, el gris del plano 2D-por-período en `DashboardView.tsx`) ni que `NON_RENTABLE_TOP` del mapa isométrico (`#E4E8E9`) — son grises de familia distinta, con un rol distinto en cada superficie (el 3D ya usaba uno más oscuro porque, según el propio comentario del archivo, "estos son materiales 3D iluminados, no trazos SVG planos"). No lo toqué porque tocar un color de la paleta exige la cuenta de dicromacia, y éste ni siquiera es nuevo de esta feature.

**#6 — Panel de tarifa: para un `worker`, el bloque puede aparecer con encabezado "Tarifa de referencia" mostrando sólo la línea de ocupación (sin monto).**
`reference_rate` nunca llega para un rol no-admin (ni el desvío, que además gateo explícitamente con `isAdmin` del lado del cliente como resguardo extra) — cero plata visible, que es la regla dura. Pero como `occupancy.estado` SÍ es legible para cualquier rol autenticado, el bloque puede quedar visible con sólo esa línea bajo un título que habla de tarifa. Es un detalle de rotulado, no una fuga de dinero — lo dejo anotado por si el Maestro prefiere un encabezado condicional.

**#7 — El período no es una única variable global compartida entre pestañas — ni antes de esta feature ni ahora.**
El brief dice "el período es uno solo, regla del proyecto" apuntando a "SeasonPicker / store". Revisé `fixtureStore.ts` (Zustand): **no existe un campo de período en el store**. `DateRange` es puramente estado local de componente en cada pantalla que usa `<SeasonPicker>` (Dashboard, Sede → Vender), cada una arrancando en "hoy" por su cuenta — Sede y Dashboard **tampoco comparten** el período entre sí hoy. Interpreté la regla como "reusá el MISMO componente y la MISMA aritmética de fechas, nunca un date-picker propio" (que es lo que hice: el editor 3D usa el `<SeasonPicker>` real, con su propio estado local, igual que las otras pantallas) y no como "un valor sincronizado entre pestañas", porque ese valor sincronizado no existe en ningún lado del código actual. Si el Maestro quería literalmente un período compartido cross-pestaña, eso es trabajo nuevo sobre `fixtureStore.ts` que decidí NO hacer sin pedirlo explícitamente — el brief dice tocar el store "sólo si es estrictamente necesario", y esto no lo era para cumplir la letra de la regla tal como está implementada hoy en el resto de la app.

**#8 — Capturar "la lámina para el proveedor" con Modo Ocupación prendido produce una lámina de colores, no de producto.**
No es un bug — nadie pidió bloquear la captura en ese modo, y el usuario lo prende a propósito — pero lo señalo porque es la clase de interacción que un QA humano probaría: si alguien captura la propuesta para un proveedor sin darse cuenta de que Ocupación sigue prendido, se lleva un PNG de semáforo en vez de la góndola vestida. Mismo modelo mental que "antes/después": es responsabilidad de quien opera el editor, no algo que la herramienta debería adivinar.

## 6. Guardrails — verificación explícita, uno por uno

- **El 3D pinta, no construye**: cero `boxGeometry`/mesh nuevo posicionado. Todo el color entra como MATERIAL sobre meshes que ya existían (`LaminaDeProducto` para el panel completo, el trim de `statusColor` para el resto) — el mismo pipeline que ya pintaba fotos de producto.
- **`frameloop='demand'` / `invalidate()`**: no agregué ningún `invalidate()` manual, y no hacía falta — confirmé que `sinArte` (el toggle hermano, ya en producción) tampoco lo tiene: react-three-fiber invalida automáticamente cuando cambia una prop de un componente dentro de `<Canvas>`. Los `invalidate()` manuales que sí existen en el archivo son todos para eventos que NO pasan por React (`PointerLockControls`, teclado, carga async de textura).
- **Guards de espejo por identidad**: no toqué ningún guard de sincronización store↔editor. `rangoOcupacionEfectivo` está memoizado (`useMemo`) precisamente para no crear un objeto `Date` nuevo en cada render y no ensuciar dependencias de otros hooks.
- **Código corto vs. código con sede**: `getSpaceRates` siempre recibe `fullSpaceCode(sede, fix.code)` en mayúsculas, `sede` leído reactivamente del store (`useFixtureStore(s => s.sede)`), nunca el código corto.
- **Prioridad prueba → foto → patrón → color**: intacta. La rama de Ocupación en `facePaintById` es un `if (ocupacion) { ...; return map; }` ANTES de tocar `sinArte`/`prueba`/fotos — cuando el interruptor está apagado, el árbol de siempre corre exactamente igual, ni una línea tocada.
- **`userData.chrome` / captura de lámina**: no agregué gizmos ni objetos 3D de interfaz. Todo lo nuevo (leyenda, `SeasonPicker`, tooltip) es DOM/React por encima del canvas, igual que los botones de la barra ya existentes — nunca entra al `toDataURL()` del lienzo.
- **Índices de material [+X,−X,+Y,−Y,+Z,−Z]**: no reimplementé el mapeo — reuso `facePaintArray` tal cual estaba (cara A → índice 5/−Z, cara B → índice 4/+Z).

## 7. Verificación

```
cd frontend && npx tsc --noEmit    # limpio
cd backend && python -c "import app.main"   # limpio (no toqué backend; confirmo que no rompí nada)
```

No corrí `npm run build` ni la suite de tests (no se pidió, y `docs/ESTADO.md` no lista un comando de tests de frontend en la verificación mínima).
