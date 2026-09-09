# Diagnóstico por reproducción — nomenclatura vs. code

Investigador: sesión "fase-12 nomenclatura". Repo: /tmp/re-nom (claude/fase-12-nomenclatura).
Puertos propios: backend 8071, vite 5411. NO se modificó código de la app.

> Este informe se escribe INCREMENTALMENTE. Cada hallazgo se agrega apenas se confirma.

## Estado de la corrida

- [x] Lectura de código orientadora
- [x] Entorno levantado con base sembrada (backend 8071 + vite 5411)
- [x] (1) bulk validar/confirmar de la fila IMP-08 → HALLAZGO 1
- [x] (2) capturas Playwright de las pantallas → HALLAZGOS 2, 3, 7
- [x] (3) reproducción exacta del síntoma → HALLAZGO 2 (exacta, campo por campo)
- [x] (4) escenario de control → HALLAZGO 5
- [x] (5) intento de doble venta → HALLAZGO 3 (SE PUEDE, sin ningún aviso)

**VEREDICTO: REPRODUCE, exacto.** Ver la sección final.

## Lectura de código (previa a la reproducción)

Confirmado por lectura, pendiente de medir alcance:

- `backend/app/services/layout_lookup.py:34-63` — `find_fixture_by_space_code` compara
  el código pedido SÓLO contra `fixture["code"]` (`raw = str(fixture.get("code") ...)`).
  Nunca mira `nomenclatura`.
- `frontend/src/utils/nomenclatura.ts:150-155` — `nombreDeMueble` devuelve
  `nomenclatura.trim() || code`: la nomenclatura REEMPLAZA al code en pantalla.
- `frontend/src/utils/nomenclatura.ts:165-176` — `nombreRepetido` compara el NOMBRE
  contra el NOMBRE de los otros. Nada compara nomenclatura contra `code` ajeno.
- `frontend/src/types/fixtures.ts:96-101` — `fullSpaceCode(sede, code)` usa `code`.
- `backend/app/routers/bulk_leases.py` — dos detalles que importan:
  - la resolución de la fila es `find_fixture_by_space_code(db, codigo)` (por `code`);
  - lo que la planilla devuelve como `nombre` es `fixture.get("label") or fixture.get("code")`
    (**no** `nomenclatura`), así que el eco de la validación tampoco muestra el nombre
    que la persona vio en el plano.

---

## HALLAZGO 1 — La planilla resuelve contra `code`, y el eco de la revisión no deja verlo

**Reproducido.** Base sembrada: sede `CIUDAD JARDIN` con puntas PUN-06/08/10 e
impulsadores con `code` IMP-07…IMP-17. Seis de ellos tienen nomenclatura puesta a
mano (la renumeración a pares que se ve en la captura):

| code (llave del espacio) | nomenclatura (lo que se dibuja) |
|---|---|
| IMP-12 | **IMP-08** |
| IMP-13 | IMP-10 |
| IMP-14 | **IMP-12** |
| IMP-15 | IMP-14 |
| IMP-11 | IMP-16 |
| IMP-09 | IMP-17 |

Los otros cinco (IMP-07, **IMP-08**, IMP-10, IMP-16, IMP-17) se dibujan con su `code`.
Resultado: en el plano hay **dos cajas rotuladas «IMP-08»** (la de code IMP-08 y la de
code IMP-12), dos «IMP-10», dos «IMP-12», dos «IMP-14», dos «IMP-16» y dos «IMP-17».

Fila enviada, la que escribiría quien lee el plano:
`IMP-08 · CASA LUKER · ASEO · $200.000 · 2026-01-01 → 2026-09-15`, sede CIUDAD JARDIN.

`POST /api/leases/bulk/validar` responde:

```json
{ "fila": 2, "estado": "ok", "codigo": "CIUDAD JARDIN-IMP-08",
  "nombre": "Impulsador Marca", "mensajes": ["Proveedor nuevo: se va a crear."] }
```

`POST /api/leases/bulk/confirmar` → `creados: 1`, `lease_id: 1`, espacio
`CIUDAD JARDIN-IMP-08` pasa a `occupied`.

**El contrato fue a parar al mueble cuyo `code` es IMP-08** — que en el plano se dibuja
«IMP-08» porque no tiene nomenclatura — y **no** al mueble que la persona estaba mirando
(code IMP-12, dibujado «IMP-08»). Ambos se ven igual en el plano.

Dos cosas agravan esto y son propias de este endpoint:

1. `backend/app/routers/bulk_leases.py:203` — `out.nombre = fixture.get("label") or fixture.get("code")`.
   El eco de la revisión devuelve **`label`**, que en los once impulsadores es el mismo
   texto genérico «Impulsador Marca», y **nunca** la `nomenclatura`. El paso de `validar`
   existe, según el propio docstring del archivo, para que «la revisión sea sobre lo
   resuelto y no sobre lo que la persona cree que escribió» — pero lo resuelto se reporta
   con dos campos (`codigo` y `label`) que son idénticos para el mueble correcto y para el
   equivocado. **No hay nada en la respuesta que permita notar el desvío.**
2. `out.codigo` devuelve `CIUDAD JARDIN-IMP-08`, o sea exactamente lo que la persona
   tecleó con la sede antepuesta. Le confirma su propio error.

Evidencia: `/tmp/nom-repro/seed.py`, `/tmp/nom-repro/paso1.py`, backend propio en 8071
con `DATABASE_URL=sqlite:////tmp/nom-repro/nom.db`.

---

## HALLAZGO 2 — El síntoma de las capturas **reproduce exacto**

Base limpia, mismo plano sembrado. Se cargó por la **pantalla real** (botón «Planilla»,
CSV subido al `input[type=file]`, revisión y «Guardar 1 y avisar») una única fila:

```
Espacio,Sede,Proveedor,Marca o categoria,Valor mensual,Desde,Hasta
IMP-12,CIUDAD JARDIN,CASA LUKER,ASEO,200000,01/01/2026,15/09/2026
```

Lo que quedó en pantalla, medido leyendo los nodos de texto del DOM/SVG:

| Pantalla | Lo que se lee | De dónde sale |
|---|---|---|
| **VENDER**, rótulo sobre el mueble | `IMP-08 · libre 16 sep` | `nombreDeMueble` → `nomenclatura` (DashboardView.tsx:884) |
| **VENDER**, panel lateral | `IMP-12` | `code` |
| **SUPERVISAR**, tabla «Estado por espacio» | fila **`IMP-12`** · CASA LUKER · 1 ene → 15 sep · $200.000 · «Por vencer 7d» | `code` |
| **PLANO 2D**, pastillas | `IMP-08`, `IMP-10`, `IMP-12`, `IMP-14`, `IMP-16`, `IMP-17` | `rotulosDelPlano` → `nomenclatura` |

Las **seis pastillas son exactamente las seis de la captura del dueño**, y son los seis
muebles renombrados a mano: `rotulosDelPlano` sólo dibuja la pastilla flotante cuando
`nombrePropio(mueble)` es verdadero. Los otros cinco impulsadores muestran 🏷️ (el emoji
para el mueble chico sin nombre propio) y ningún texto.

El mismo contrato, entonces, vive bajo **dos nombres**: `IMP-08` en todo lo que se dibuja
por nombre y `IMP-12` en todo lo que se une por código. Capturas:
`capturas/A-1-vender.png`, `A-2-supervisar.png`, `A-3-plano.png`.

**Y el mapa de VENDER dibuja dos cajas rotuladas `IMP-08`**: la vendida (code IMP-12,
«IMP-08 · libre 16 sep») y otra libre (code IMP-08, «IMP-08» a secas). Los once
impulsadores se dibujan con nueve nombres distintos: `IMP-08`, `IMP-10`, `IMP-16` y
`IMP-17` aparecen **dos veces cada uno**. En el plano no hay forma de saber cuál es cuál.

### El panel del plano 2D, palabra por palabra

Volcado del panel al tocar en el plano la cajita rotulada `IMP-08` que está ocupada
(captura `capturas/A-4-plano-panel.png`):

```
🏷️ Impulsador Marca            ×  Ocupado
🎯 DESTINO DEL MUEBLE   Comercializable
◉  ESTADO DEL ESPACIO   Ocupado
🏢 SEDE                 CIUDAD JARDIN
🔖 NOMENCLATURA         IMP-08
🤝 CONTRATADO           CASA LUKER · ASEO
                        2026-01-01 → 2026-09-15
                        7 días restantes
                        $200,000 / mes
📝 OBSERVACIÓN          —
📎 ARCHIVOS             ▸ CIUDAD JARDIN-IMP-12
```

Es **el mismo panel de la captura del dueño**, campo por campo. La `NOMENCLATURA` dice
`IMP-08` (`nombreDeMueble`, FloorPlan2D.tsx:3626) y los `ARCHIVOS` cuelgan de
`CIUDAD JARDIN-IMP-12` (`activeCode` = `fullSpaceCode(sede, item.code)`,
FloorPlan2D.tsx:3714-3722). Un solo mueble, dos nombres, en el mismo panel y a diez
píxeles de distancia.

**Veredicto parcial: reproduce, exacto.**

---

## HALLAZGO 3 — LA DOBLE VENTA: se puede, y ninguna validación la frena

Sobre la base anterior (CASA LUKER ya contratado en code `IMP-12`, dibujado `IMP-08`), se
subió por la misma pantalla una segunda planilla con la fila que escribiría **quien lee el
plano y quiere vender «el IMP-08»**:

```
IMP-08,CIUDAD JARDIN,COLGATE,ASEO,200000,01/01/2026,15/09/2026
```

Fechas **idénticas** a las del contrato que ya existe. La revisión dijo:

> **1 listas · 0 con avisos · 0 no entran** — `CIUDAD JARDIN-IMP-08 / Impulsador Marca / COLGATE / 1 ene → 15 sep · 258d / $200.000 / Lista`

Se guardó sin una sola advertencia. Estado resultante:

| | code | proveedor | periodo | canon | cómo se dibuja en el mapa de VENDER |
|---|---|---|---|---|---|
| contrato 1 | `CIUDAD JARDIN-IMP-12` | CASA LUKER | 1 ene → 15 sep | $200.000 | **`IMP-08 · libre 16 sep`** |
| contrato 2 | `CIUDAD JARDIN-IMP-08` | COLGATE | 1 ene → 15 sep | $200.000 | **`IMP-08 · libre 16 sep`** |

El mapa de VENDER dibuja **dos rótulos idénticos, `IMP-08 · libre 16 sep`**, sobre dos
cajas distintas, con dos proveedores distintos y el mismo periodo
(`capturas/B-1-vender.png`). Para quien mira el plano, **«IMP-08» se vendió dos veces al
mismo tiempo a dos proveedores**.

Por qué no salta ninguna alarma: el chequeo de choque de
`bulk_leases.py:271-289` es
`db.query(Space).filter(Space.code == codigo)` y compara fechas contra los leases de **ese
`code`**. `CIUDAD JARDIN-IMP-08` y `CIUDAD JARDIN-IMP-12` son dos `code` distintos, así que
para el servidor son dos espacios y no hay nada que reportar. **La validación es correcta
sobre los códigos y ciega sobre los nombres, que es lo único que la persona ve.**

### El agravante: en el plano 2D la colisión es INVISIBLE

En el plano 2D los rótulos dibujados sobre los once impulsadores son:

```
🏷️ 🏷️ IMP-17 🏷️ 🏷️ IMP-16 🏷️ IMP-08 🏷️ IMP-10 🏷️ IMP-12 🏷️ IMP-14 🏷️ 🏷️ 🏷️
```

Sólo hay **una** pastilla `IMP-08`, y es la del mueble cuyo `code` es `IMP-12`. El mueble
que de verdad se llama `IMP-08` no dibuja **ningún** nombre: muestra el emoji 🏷️, porque
`rotulosDelPlano` (`utils/nomenclatura.ts:196-205`) reserva la pastilla para el nombre
puesto a mano y en un mueble chico sin nombre propio no dibuja nada.

O sea: quien lee el plano 2D ve **un solo `IMP-08`**, no tiene forma de sospechar que hay
otro, escribe `IMP-08` en la planilla con total confianza — y el contrato se va al mueble
que el plano dejó sin rotular. La ambigüedad no se le muestra en la pantalla desde la que
se hace el trabajo.

**Veredicto: el miedo del dueño está fundado. Sí se pueden vender dos veces espacios
que, en el plano, son el mismo.** Capturas: `capturas/B-1-vender.png`,
`B-2-supervisar.png`, `B-3-plano.png`.

---

## HALLAZGO 4 — «Revisar antes de negociar» declara el plano limpio

Con los dos contratos encima y cuatro nombres repetidos en el plano, se apretó el botón
**Revisar** de la barra del plano (`capturas/B-7-revisar.png`). Respuesta textual:

> **Revisión del plano** — 14 muebles · 0 pasillos
> **«El plano está limpio: sin códigos repetidos, sin muebles encimados y con pasillos por
> donde se puede caminar.»**

Es literalmente la pantalla que el proyecto puso para atrapar esto —«Un error acá no se
nota hasta que ya viajó a un contrato», `docs/ESTADO.md` §«Revisar antes de negociar»— y
no lo ve. La causa es estructural, no un olvido de una condición:

- `frontend/src/utils/revision.ts:16-24` — la interfaz `MuebleRevisable` **no tiene campo
  `nomenclatura`**. El dato ni siquiera entra a la función.
- `frontend/src/utils/revision.ts:160` — el único chequeo de nombres es
  `duplicados(fixtures)`, y `duplicados` (`utils/nomenclatura.ts:110-121`) agrupa por
  `normalizar(f.code)`. Compara códigos contra códigos.

O sea: el plano tiene **cuatro nombres dibujados dos veces cada uno** (`IMP-08`, `IMP-10`,
`IMP-16`, `IMP-17`) y la revisión no puede verlo porque mira otro campo.

### Y el guardarraíl que sí existe está en el camino equivocado

`nombreRepetido` (`utils/nomenclatura.ts:165-176`) sí compara nombre contra nombre, y sí
atraparía esto. Pero se llama desde **un solo lugar**:

- `FloorPlan2D.tsx:1321`, en `commitCodeEdit` — el doble clic sobre la caja del plano.

El **campo «Nomenclatura» del panel lateral** (`FloorPlan2D.tsx:3612-3620`) escribe directo:

```tsx
<input className={inp} placeholder={item.code}
  value={item.nomenclatura ?? ""}
  onChange={(e) => onUpdate({ nomenclatura: e.target.value })} />
```

Sin `nombreRepetido`, sin `codigoRepetido`, sin ninguna comprobación. Dos maneras de poner
el mismo nombre, y sólo una está protegida.

De paso: **`codigoRepetido` (`utils/nomenclatura.ts:97-105`) no lo llama nadie.** Un grep
sobre todo `frontend/src` fuera de su propio archivo devuelve cero usos. Está exportada,
documentada («¿Ese código ya lo usa OTRO mueble?») y muerta.

---

## HALLAZGO 5 — El escenario de control aísla la causa: sin nomenclaturas, todo funciona

Base limpia, **mismo plano y mismos códigos, con `nomenclatura` vacía en los catorce
muebles**. Misma fila por la misma pantalla (`IMP-08 · COLGATE · $200.000 · 1 ene → 15 sep`):

| Pantalla | Control (sin nomenclaturas) | Escenario del dueño |
|---|---|---|
| Rótulos del mapa de VENDER | `IMP-07 … IMP-17`, **once nombres distintos**, un solo `IMP-08 · libre 16 sep` | `IMP-08` ×2, `IMP-10` ×2, `IMP-16` ×2, `IMP-17` ×2 |
| Fila de SUPERVISAR | `IMP-08` · COLGATE | `IMP-12` · CASA LUKER (dibujado `IMP-08`) |
| Panel del plano | Nomenclatura = Archivos = `IMP-08` | Nomenclatura `IMP-08`, Archivos `CIUDAD JARDIN-IMP-12` |
| Pastillas del plano 2D | ninguna (🏷️ en los once) | seis |

**Y la doble venta se frena sola.** Volviendo a subir la MISMA fila `IMP-08` sobre el
contrato ya creado, la revisión responde:

> **0 listas · 0 con avisos · 1 no entran** — «No entra»
> *«CIUDAD JARDIN-IMP-08» ya tiene un contrato del 2026-01-01 al 2026-09-15. Cancelalo
> primero o ajustá las fechas.*

La misma validación que en el HALLAZGO 3 dejó pasar dos proveedores sobre «el mismo
IMP-08», acá lo rechaza. **La protección contra la doble venta funciona perfectamente; lo
que la esquiva es que el nombre que la persona lee y el código con el que el servidor une
sean dos cosas distintas.** La causa queda aislada: no es el endpoint, no son las fechas,
no es la planilla. Es la divergencia `nomenclatura` / `code`.

Captura: `capturas/C-1-vender.png`, `C-2-supervisar.png`, `C-3-plano.png`.

---

## HALLAZGO 6 — El desvío no se queda en la pantalla: viaja al correo, al mercaderista y al proveedor

Con el contrato de CASA LUKER en `CIUDAD JARDIN-IMP-12` (el mueble que el plano dibuja
`IMP-08`), se pidió lo mismo que abre el mercaderista con el enlace del correo:

```
GET /api/montaje/mi-espacio?code=CIUDAD JARDIN-IMP-12
→ { "code": "CIUDAD JARDIN-IMP-12", "corto": "IMP-12", "fixture_code": "IMP-12",
    "label": "Impulsador Marca", "nomenclatura": "IMP-08",
    "proveedor": "CASA LUKER", "marca": "ASEO", "desde": "2026-01-01", "hasta": "2026-09-15" }
```

Y `frontend/src/pages/MountView.tsx:316` pinta ese espacio como
`nombreDeMueble({ code: p.corto, nomenclatura: p.nomenclatura })` → **`IMP-08`**.

Al mercaderista, entonces:

- **el correo le dice `CIUDAD JARDIN-IMP-12`** (`bulk_leases.py:_avisar`, las filas del
  correo de montaje son `(f"{f.codigo}", …)`);
- **la pantalla que abre con ese enlace le dice `IMP-08`**;
- y en la sala hay **otro** mueble que el plano también llama `IMP-08`.

Lo mismo con la constancia al proveedor: se arma con
`f"{f.codigo} — {f.nombre or ''}"` → «CIUDAD JARDIN-IMP-12 — Impulsador Marca», un nombre
que CASA LUKER no va a encontrar en ninguna pantalla de la app, porque ahí el mueble se
llama IMP-08.

**Y vender de a uno desde el mapa tiene el mismo doble nombre**: `Contrato.tsx:211-222`
guarda `codigo = fullSpaceCode(sede, fixture.code)` y muestra
`nombre = nombreDeMueble(...)`. La línea del contrato que se está firmando dice `IMP-08`
y lo que se escribe en `spaces` es `CIUDAD JARDIN-IMP-12`. No es un problema sólo de la
planilla: es del modelo.

---

## HALLAZGO 7 — Una sola pantalla da las dos respuestas a la vez

`capturas/B-1-vender.png` (VENDER, con las dos ventas hechas) es la evidencia más corta de
todo esto. En la misma imagen, sobre los mismos dos contratos:

- **El mapa isométrico (panel `01`)** dibuja **dos cajas naranjas rotuladas
  `IMP-08 / libre 16 sep`**, en dos posiciones distintas del piso. Además rotula `IMP-10`
  dos veces, `IMP-16` dos veces e `IMP-17` dos veces.
- **El panel `04`, «Tarifa de referencia»**, lista las mismas dos como pastillas
  `IMP-08 16 sep` y **`IMP-12 16 sep`** — por `code`.
- **El panel `02`, «Cuándo se libera cada espacio»**, lista `IMP-08` y **`IMP-12`** — por
  `code`.

O sea: en una pantalla de 1600 px, los dos contratos se llaman `{IMP-08, IMP-08}` a la
izquierda y `{IMP-08, IMP-12}` a la derecha. Quien vende mira el mapa.

Los **contadores sí están bien** («Libre todo el periodo 12 · Se libera en el periodo 2»,
14 espacios comercializables): la aritmética corre sobre `code` y es correcta. Lo único
que miente es el nombre. Por eso el problema no se cae solo por ninguna cifra descuadrada.

---

# VEREDICTO

**REPRODUCE.** No en parte: exacto, campo por campo, en las cuatro pantallas de las
capturas del dueño, y el peor escenario que él teme —vender dos veces el mismo espacio—
también se reproduce y **ninguna validación lo frena**.

## La hipótesis del brief, corregida por la evidencia

La hipótesis era: *quien lee el plano ve `IMP-08`, lo escribe en la planilla, el servidor
lo resuelve contra `code` y lo cuelga de OTRO mueble físico.*

**Esa mitad se confirmó** (HALLAZGO 1): la fila `IMP-08` fue a parar a
`CIUDAD JARDIN-IMP-08`, que es un mueble distinto del que la persona estaba mirando.

**Pero esa mitad sola NO produce las capturas del dueño.** Si el contrato hubiera caído en
el mueble equivocado, los ARCHIVOS del panel dirían `CIUDAD JARDIN-IMP-08`, no
`CIUDAD JARDIN-IMP-12`. Las capturas muestran el caso simétrico y, en la práctica, más
frecuente: **la fila decía `IMP-12`, el contrato cayó en el mueble correcto, y es el PLANO
el que lo muestra bajo un nombre ajeno** (`IMP-08`), porque ese mueble está renombrado a
mano con un nombre que es el `code` de otro.

Las dos mitades son la misma falla vista desde los dos lados, y **juntas son la doble
venta**: la fila `IMP-12` y la fila `IMP-08` describen, para quien mira el plano, el mismo
espacio; para el servidor son dos, y las acepta las dos con fechas idénticas.

## La cadena, en una línea

`nomenclatura` reemplaza a `code` **en todo lo que se dibuja** y **en nada de lo que se
une**. Nada —ni el editor, ni la revisión del plano, ni la planilla— comprueba que la
`nomenclatura` de un mueble no sea el `code` de otro. Y el plano 2D, que es donde se lee,
es justo la pantalla que **oculta** la ambigüedad: el mueble que de verdad se llama
`IMP-08` no dibuja nombre alguno.

## Dónde está cada eslabón

| # | Archivo:línea | Qué hace |
|---|---|---|
| 1 | `frontend/src/utils/nomenclatura.ts:150-155` | `nombreDeMueble`: `nomenclatura` **reemplaza** al `code` en pantalla |
| 2 | `frontend/src/utils/nomenclatura.ts:196-205` | `rotulosDelPlano`: en mueble chico sin nombre propio **no dibuja nada** — el `IMP-08` verdadero queda mudo |
| 3 | `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx:3612-3620` | el campo «Nomenclatura» del panel escribe **sin ninguna comprobación** |
| 4 | `frontend/src/utils/nomenclatura.ts:165-176` + `FloorPlan2D.tsx:1321` | `nombreRepetido` existe y sirve, pero se llama **sólo** desde el doble clic sobre la caja |
| 5 | `frontend/src/utils/nomenclatura.ts:97-105` | `codigoRepetido`: **código muerto**, no lo llama nadie |
| 6 | `frontend/src/utils/revision.ts:16-24, 160` | «Revisar» no recibe `nomenclatura` y sólo agrupa por `code`: declara limpio un plano con cuatro nombres repetidos |
| 7 | `backend/app/services/layout_lookup.py:34-63` | `find_fixture_by_space_code` resuelve **sólo** contra `code` |
| 8 | `backend/app/routers/bulk_leases.py:203` | el eco de `validar` devuelve `label`, nunca `nomenclatura`: la revisión humana no puede ver el desvío |
| 9 | `backend/app/routers/bulk_leases.py:271-289` | el choque de fechas se busca por `Space.code`: dos `code` distintos = dos espacios, sin aviso |
| 10 | `frontend/src/components/Contrato/Contrato.tsx:211-222` | vender de a uno tiene el mismo doble nombre: muestra `nombreDeMueble`, guarda `fullSpaceCode(code)` |
| 11 | `frontend/src/pages/MountView.tsx:316` + `backend/app/routers/montaje.py:232` | el mercaderista recibe el correo con `IMP-12` y la pantalla le dice `IMP-08` |

## Alcance

- **Afecta a cualquier mueble con `nomenclatura` puesta a mano cuyo texto sea el `code` de
  otro mueble de la misma sede.** No hace falta mala fe ni un caso raro: alcanza con
  renumerar un tramo del pasillo para que coincida con la cartelería física, que es
  exactamente lo que se ve en la captura (seis impulsadores renombrados a pares).
- **No hay nada en el sistema que lo detecte** — ni al escribir el nombre por el panel, ni
  al revisar el plano, ni al validar la planilla, ni al confirmarla, ni al vender de a uno.
- Los **contadores y la plata son correctos** (corren por `code`), así que nada se
  descuadra y el problema no se delata solo. Se delata cuando dos proveedores se presentan
  el mismo día al mismo mueble.

## Cómo reproducirlo

```bash
/tmp/nom-repro/reset.sh                                  # backend 8071 + plano sembrado
cd /tmp/nom-repro && node pw_planilla.mjs /tmp/nom-repro/planilla_imp12.csv A   # contrato 1
cd /tmp/nom-repro && node pw_planilla.mjs /tmp/nom-repro/planilla_imp08.csv B   # doble venta
cd /tmp/nom-repro && node pw_caps.mjs B                  # capturas de las tres pantallas
cd /tmp/nom-repro && node pw_revisar.mjs B               # «el plano está limpio»
SEED=/tmp/nom-repro/seed_control.py /tmp/nom-repro/reset.sh   # control
```

**No se modificó una sola línea del código de la app.** Todo el diagnóstico corre contra
el árbol tal cual está en `claude/fase-12-nomenclatura`, con un backend propio en 8071
(SQLite en `/tmp/nom-repro/nom.db`) y vite en 5411.

---

## Anexo — lo que se ve en `capturas/B-3-plano.png` (el plano 2D con las dos ventas hechas)

Vale mirarla, porque es la pantalla desde la que se trabaja:

- Hay **dos cajitas rojas** (ocupadas). Una es la que dice **`IMP-08`** (code `IMP-12`,
  CASA LUKER). La otra —la segunda desde la izquierda— es el `IMP-08` verdadero (code
  `IMP-08`, COLGATE) y **no tiene ningún rótulo**: sólo el emoji 🏷️.
- De los once impulsadores, **sólo seis tienen nombre dibujado**: `IMP-17`, `IMP-16`,
  `IMP-08`, `IMP-10`, `IMP-12`, `IMP-14`. Los otros cinco son cajitas anónimas.
- Dicho de otro modo: **de los dos espacios vendidos a dos proveedores distintos por el
  mismo periodo, uno se llama `IMP-08` y el otro no se llama nada.** No hay manera de que
  quien mira este plano note que vendió dos veces.

Sobre el «tercer nombre» que menciona el reporte del dueño: lo que se reproduce en el panel
son **dos** nombres —`IMP-08` en NOMENCLATURA y `CIUDAD JARDIN-IMP-12` en ARCHIVOS—, donde
el segundo es la forma con sede antepuesta del `code`. No observé un tercer código ajeno y
distinto; si en la captura del dueño hay uno más, no lo pude reproducir y habría que verlo
con su base.
