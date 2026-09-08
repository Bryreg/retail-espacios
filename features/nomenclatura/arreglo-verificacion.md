# Verificación de la fase 12 — nomenclatura vs. código · las DOS rondas

**Verificador. RECABRA · 2026-09-08 · rama `claude/fase-12-nomenclatura` en `/tmp/re-nom`.**
Único que corrió la suite completa del backend y `npm run build`. Todo lo de abajo se midió
**por la pantalla real** con Playwright y sesión de administrador, con la app levantada en
puertos propios de cada ronda (ronda 1: backend 8081 / vite 5501; ronda 2: **backend 8091 /
vite 5601**, base SQLite en `/tmp/nom-verif2/nom.db`, `TMPDIR` fuera del repo). Servidores
apagados y bases borradas al terminar. **No arreglé nada**: no toqué una línea de
`backend/**`, de `frontend/**` ni de `docs/**` en ninguna de las dos rondas.

Capturas: `capturas/fix-*.png` (26, ronda 1) y `capturas/fix2-*.png` (42, ronda 2).

---

## VEREDICTO

**Las dos cosas que quedaron abiertas después de la ronda 1 están cerradas, y cerradas por
la pantalla.**

- **F1 (grave)** era que el consejo del propio mensaje de rechazo —«escribí el código
  completo»— reproducía la foto del dueño: la fila `CIUDAD JARDIN-IMP-08` entraba **verde,
  callada y sin una palabra** sobre el gemelo. Ahora esa misma fila entra **en ámbar, como
  «Revisar»**, con el aviso que nombra al otro mueble por su código completo, legible entero
  en su propio renglón. Y el mensaje de la fila ambigua ya no manda a ciegas: ofrece los
  **dos** códigos completos, primero el que el plano dibuja con el texto tecleado.
- **F5 (grave)** era que en el plano la colisión era invisible: de las dos cajas que se
  dibujan «IMP-08» sólo una llevaba pastilla. Ahora **las dos** la llevan, en rojo y con la
  cuenta `×2`, tanto en el plano 2D como en el mapa isométrico de Vender —que es donde se
  elige—, y el aviso **no se apaga** con el botón «Etiquetas».
- **El aviso no se abarató**: en el escenario de control una tanda limpia de cuatro filas
  da **4 listas · 0 avisos**, exactamente lo mismo que antes de la fase, y el plano sin
  colisiones dibuja **0 pastillas**, exactamente lo mismo que antes.
- **Sin regresiones.** Nada de lo que ya pasaba en la ronda 1 dejó de pasar.

Quedan huecos, ninguno nuevo y ninguno grave: el guardarraíl de servidor (**F7**), el
párrafo de `docs/ESTADO.md` del lado del backend (**F6**, a medias), y dos cosas menores que
aparecieron midiendo esta ronda (**F8** y **F9**, abajo).

| Verificación | Ronda 1 | Ronda 2 |
|---|---|---|
| `cd frontend && npx tsc --noEmit` | exit 0 | **exit 0** |
| `npm run build` | exit 0 | **exit 0** (`✓ built in 9.38s`; sólo el aviso de siempre de tamaño de chunk) |
| `npm run probar` (los 9 scripts) | exit 0 — 202 pruebas | **exit 0 — 210 pruebas** (33·18·**48**·12·31·11·21·24·12) |
| `pytest -q -p no:warnings` (suite completa, UNA vez, `TMPDIR=/tmp/pt-verif-nom2`) | exit 0 — 1016 | **exit 0 — 1021** (1010 ok · 7 xfail · 4 skipped · **0 fallas**) |
| (a) el residuo F1, por pantalla | **FALLABA** | **PASA** |
| (b) F5, la colisión en el plano | **FALLABA** | **PASA** |
| (c) que el aviso no se abarate | — | **PASA** |
| (d) la ambigüedad rechazada | PASA | **PASA** |
| (d) la doble venta por el nombre, bloqueada | PASA | **PASA** |
| (d) escenario de control, sin regresión (+ vender de a uno) | PASA | **PASA** |
| (d) el plano ya roto se abre / se mueve / se guarda | PASA | **PASA** |
| (d) «Revisar antes de negociar» con los 10 hallazgos | PASA | **PASA** |
| (d) la reconciliación con sus cuatro datos | PASA | **PASA** |

> Nota sobre la suite: `backend/pytest.ini:3` ya trae `addopts = -q`, así que el `-q` del
> encargo la deja en `-q -q` y pytest **oculta la línea final de resumen**. El veredicto es
> el código de salida (**0**) y el mapa de puntos completo, en
> `/tmp/nom-verif2/backend-suite.log`: 1010 `.`, 7 `x`, 4 `s`, ni una `F` ni una `E`.
> Los 5 puntos nuevos respecto de la ronda 1 son las 5 pruebas que el backend agregó
> (`test_nomenclatura_planilla.py`, 16 → 21).

---

## Cómo se midió

Siembra **idéntica** a la de la ronda 1 y a la del investigador (`diag-repro.md` §HALLAZGO 1):
sede `CIUDAD JARDIN` con `PUN-06/08/10` e `IMP-07…IMP-17`, y seis renombrados a mano
(`IMP-12→«IMP-08»`, `IMP-13→«IMP-10»`, `IMP-14→«IMP-12»`, `IMP-15→«IMP-14»`,
`IMP-11→«IMP-16»`, `IMP-09→«IMP-17»`), existiendo además el mueble cuyo `code` es de verdad
`IMP-08`. Segunda sede `NAVE` con un `PUN-01`. El escenario de **control** es el mismo plano
con las nomenclaturas vacías (`CON_NOM=0`).

Dos cosas se midieron **antes y después de verdad**, no de memoria, y sin tocar el árbol:

1. `git archive HEAD | tar -x -C /tmp/nom-viejo` deja el código **previo a toda la fase 12**
   en otro directorio. Con él corrí un backend gemelo en el puerto 8092 y le mandé las
   MISMAS planillas al mismo endpoint (`POST /api/leases/bulk/validar`).
2. El mismo truco a nivel módulo: `esbuild` compila `nomenclatura.ts` de HEAD y del árbol de
   trabajo y `rotulosDelPlano` corre sobre los MISMOS muebles
   (`/tmp/nom-verif2/rotulos.mjs`).

---

## (a) El residuo F1 — cerrado

### a.1 El mensaje ambiguo ya no manda a la trampa

Fila `IMP-08 · CASA LUKER · ASEO · $200.000 · 2026-01-01 → 2026-09-15`, sede CIUDAD JARDIN,
por el botón **Planilla** → CSV al `input[type=file]`. Textual de la pantalla
(`capturas/fix2-a1-revision.png`):

```
0 listas · 0 con avisos · 1 no entran
2  CIUDAD JARDIN-IMP-08   —   CASA LUKER/ASEO   1 ene → 15 sep · 258d   $200.000   No entra
⚠ «IMP-08» es ambiguo en CIUDAD JARDIN. Escribí CIUDAD JARDIN-IMP-12 para el mueble que el
  plano dibuja «IMP-08», o CIUDAD JARDIN-IMP-08 para el que se dibuja con su propio código.
```

Antes decía «Escribí el código completo del que quisiste» y el que leía el plano escribía el
otro. Ahora están **los dos códigos completos, y en el orden que importa**: primero el que
el plano dibuja con el texto que la persona tecleó. Botón **«Guardar 0 y avisar»,
deshabilitado**.

El simétrico también es honesto — con la fila `IMP-12` (medido por el endpoint real, misma
siembra):

```
«IMP-12» es ambiguo en CIUDAD JARDIN. Escribí CIUDAD JARDIN-IMP-14 para el mueble que el
plano dibuja «IMP-12», o CIUDAD JARDIN-IMP-12 para el que tiene ese código, aunque el plano
lo dibuje «IMP-08».
```

No dice «se dibuja con su propio código» de un mueble que no se dibuja con su propio código.

### a.2 La fila que el consejo produce entra CON AVISO y nombra al otro

Ésta es la fila exacta con la que la ronda 1 reprodujo la foto del dueño:
`CIUDAD JARDIN-IMP-08 · COLGATE`, con CASA LUKER ya contratado sobre el mueble dibujado
«IMP-08». Textual de la pantalla (`capturas/fix2-a4-revision.png`):

```
0 listas · 1 con avisos · 0 no entran
⚠ 1 fila entra igual, pero hay algo que mirar antes de guardar. Está en ámbar, con el aviso
  completo debajo del renglón: si no es lo que quisiste, desmarcála y arreglá la planilla.

☑ 2  CIUDAD JARDIN-IMP-08   se dibuja con su código   COLGATE/ASEO   …   Revisar
   ⚠ Ojo: este contrato va al mueble CIUDAD JARDIN-IMP-08, que se dibuja con su propio
     código. OTRO mueble de la sede se dibuja «IMP-08» y su código es CIUDAD JARDIN-IMP-12.
     Proveedor nuevo: se va a crear.
Guardar 1 y avisar   → «1 contrato guardado»
```

| | Ronda 1 (`fix-C2-revision.png`) | Ronda 2 (`fix2-a4-revision.png`) |
|---|---|---|
| Resumen | `1 listas · 0 con avisos · 0 no entran` | `0 listas · **1 con avisos** · 0 no entran` |
| Estado de la fila | **Lista** (verde) | **Revisar** (ámbar, con barra al costado) |
| Franja arriba de la tabla | no había | **la hay**, y dice qué hacer |
| Lo que se decía del gemelo | **nada** | el código completo del otro mueble |

Y el simétrico, `CIUDAD JARDIN-IMP-12 · CASA LUKER` (`capturas/fix2-a2-revision.png`), sale
con los **dos** avisos del mueble que choca por las dos puntas, en un solo párrafo:

```
☑ 2  CIUDAD JARDIN-IMP-12   IMP-08 / así lo dibuja el plano   CASA LUKER   …   Revisar
   ⚠ Ojo: este contrato va al mueble CIUDAD JARDIN-IMP-12, que el plano dibuja «IMP-08». Ese
     nombre es el código de OTRO mueble de la sede: CIUDAD JARDIN-IMP-08. Y su código,
     «IMP-12», es además el nombre con el que el plano dibuja a un tercero:
     CIUDAD JARDIN-IMP-14. Proveedor nuevo: se va a crear.
```

**La fila entra**: `Guardar 1 y avisar` habilitado, y después «1 contrato guardado». En la
base, los dos contratos de la foto del dueño, cada uno en el mueble que le toca:

```
CIUDAD JARDIN-IMP-12 | CASA LUKER | 2026-01-01 → 2026-09-15 | 200000.0
CIUDAD JARDIN-IMP-08 | COLGATE    | 2026-01-01 → 2026-09-15 | 200000.0
```

### a.3 El aviso se lee ENTERO, medido y no supuesto

El script de verificación intercepta el JSON de `/api/leases/bulk/validar` y comprueba que
**cada string de `mensajes` esté, carácter por carácter, en el texto de la pantalla**, y
además barre el modal buscando cualquier elemento con `scrollHeight > clientHeight` u
`overflow` que recorte. En las seis planillas de esta ronda:

```
SE LEE ENTERO · «IMP-08» es ambiguo en CIUDAD JARDIN. Escribí CIUDAD JARDIN-IMP-12 …
SE LEE ENTERO · Ojo: este contrato va al mueble CIUDAD JARDIN-IMP-08, que se dibuja …
SE LEE ENTERO · Y su código, «IMP-12», es además el nombre con el que el plano dibuja …
elementos con texto recortado por CSS: []
```

---

## (b) F5, la colisión en el plano — cerrado

Misma siembra, mismos dos contratos, misma pantalla. Volcado de los `<text>` del SVG:

**Plano 2D** (`capturas/fix2-B-3-plano.png`, `fix2-B-plano-zoom.png`; contra
`capturas/fix-C2-3-plano.png` y `capturas/B-3-plano.png`):

```
ANTES:  🏷️ 🏷️ IMP-17 🏷️ 🏷️ IMP-16 🏷️ IMP-08 🏷️ IMP-10 🏷️ IMP-12 🏷️ IMP-14 🏷️ 🏷️ 🏷️
AHORA:  🏷️ IMP-08 ×2 🏷️ IMP-17 ×2 🏷️ IMP-10 ×2 🏷️ IMP-16 ×2 🏷️ IMP-08 ×2 🏷️ IMP-10 ×2
        🏷️ IMP-12 🏷️ IMP-14 🏷️ IMP-16 ×2 🏷️ IMP-17 ×2 🏷️
```

**`IMP-08` aparece DOS veces**, una sobre cada uno de los dos muebles rojos de la captura, y
lo mismo los otros tres nombres repetidos. Color medido, no mirado: `fill` de las pastillas
que chocan = `rgb(179, 39, 32)` = `--danger`, sobre `rgb(250, 231, 230)` = `--danger-50`;
las que no chocan (`IMP-12`, `IMP-14`) siguen en `rgb(10, 16, 20)` = `--ink-1`. Cada una
lleva su `<title>` accesible: *«IMP-08» lo dibujan 2 muebles de esta sede. Éste es el de
código IMP-12: el nombre no los distingue, el código sí.*

**Mapa de Vender**, que es donde la persona elige (`capturas/fix2-B-1-vender.png`,
`fix2-B-vender-zoom.png`; contra `capturas/fix-C2-1-vender.png` y `B-1-vender.png`):

```
ANTES:  ["IMP-08 libre 16 sep", "IMP-08 libre 16 sep", …]      ← dos cajas idénticas
AHORA:  ["IMP-08 libre 16 sep ×2 · IMP-08",
         "IMP-08 libre 16 sep ×2 · IMP-12", …]
```

La tercera línea va en el mismo rojo (`rgb(179,39,32)`) y el `<text>` lleva
`data-choque="×2 · IMP-12"`. **Se sigue viendo que las dos se llaman igual —tienen que
verse así, es lo que dice el plano— pero ya no son confundibles.**

**El aviso no se puede apagar** (`capturas/fix2-K-etiquetas-on.png` / `-off.png`):

```
Etiquetas ENCENDIDAS: IMP-08 ×2 · IMP-17 ×2 · IMP-10 ×2 · IMP-16 ×2 · IMP-08 ×2 · IMP-10 ×2 · IMP-12 · IMP-14 · IMP-16 ×2 · IMP-17 ×2
Etiquetas APAGADAS  : IMP-08 ×2 · IMP-17 ×2 · IMP-10 ×2 · IMP-16 ×2 · IMP-08 ×2 · IMP-10 ×2 ·             IMP-16 ×2 · IMP-17 ×2
```

Se apagan las dos pastillas informativas; **las ocho de choque se quedan**.

**El clic sigue eligiendo bien.** El rótulo creció una línea; tocando en el mapa el
`data-choque="×2 · IMP-12"`, el panel de Contrato queda con **`IMP-12`**
(`capturas/fix2-E1-elegido.png`). No hay regresión en el blanco de clic.

### Y el plano NO se llenó de pastillas

Ésta era la contracara y está medida de las dos maneras, sobre los MISMOS muebles:

```
=====  PLANO SIN COLISIONES (control)  =====
ANTES (HEAD)   : pastillas = 0 / 14   → []
DESPUES (árbol): pastillas = 0 / 14   → []        nombresChocados = []

=====  PLANO DEL DUEÑO (6 renombrados) =====
ANTES (HEAD)   : pastillas = 6 / 14   → ["IMP-17","IMP-16","IMP-08","IMP-10","IMP-12","IMP-14"]
DESPUES (árbol): pastillas = 10 / 14  → ["IMP-08 ×2","IMP-17 ×2","IMP-10 ×2","IMP-16 ×2",
                                         "IMP-08 ×2","IMP-10 ×2","IMP-12","IMP-14",
                                         "IMP-16 ×2","IMP-17 ×2"]
```

Y por la pantalla, en el escenario de control (`capturas/fix2-G-3-plano.png`), el volcado del
SVG del plano 2D es exactamente:

```
["PUN-06","PUN-08","PUN-10","🏷️","🏷️","🏷️","🏷️","🏷️","🏷️","🏷️","🏷️","🏷️","🏷️","🏷️"]
```

**Cero pastillas, once emojis, idéntico a antes.** Las cuatro pastillas nuevas del plano
sucio son exactamente los cuatro gemelos que antes no decían nada; no hay una sola pastilla
de más en ningún otro lado.

---

## (c) El aviso no se abarató

En el escenario de control, la misma tanda de cuatro filas normales, contra los dos
backends:

```
ANTES (HEAD, puerto 8092):    RESUMEN  ok=4  avisos=0  errores=0
DESPUES (árbol, puerto 8091): RESUMEN  ok=4  avisos=0  errores=0
```

Y por la pantalla (`capturas/fix2-F1-revision.png`): **«4 listas · 0 con avisos · 0 no
entran»**, sin franja arriba de la tabla, sin barra al costado de ninguna fila, las cuatro
en verde y la nota «Proveedor nuevo: se va a crear.» en gris, sin triángulo. Una planilla
normal en un plano sano **no gana un solo aviso nuevo**.

(La misma tanda contra el plano SUCIO da `3 ok · 0 avisos · 1 error`: la fila `IMP-10` cae
en la ambigüedad, que es lo correcto y ya estaba fijado en la ronda 1.)

---

## (d) Todo lo que ya pasaba, otra vez

**La ambigüedad rechazada** — arriba, (a.1). **La doble venta por el camino del nombre,
bloqueada**: con CASA LUKER ya sobre el mueble dibujado «IMP-08», la fila `IMP-08 · COLGATE`
con las mismas fechas sale `0 listas · 0 con avisos · 1 no entran` y el botón deshabilitado
(`capturas/fix2-a3-revision.png`).

**El escenario de control, sin una regresión** (base limpia, nomenclaturas vacías):

- `IMP-08 · CASA LUKER` → **entra** (`1 listas · 0 con avisos · 0 no entran`), se guarda
  (`capturas/fix2-F2-revision.png`).
- `IMP-08 · COLGATE`, mismas fechas → **no entra**, con el mensaje de siempre: «`CIUDAD
  JARDIN-IMP-08` ya tiene un contrato del 2026-01-01 al 2026-09-15. Cancelalo primero o
  ajustá las fechas.» (`capturas/fix2-F3-revision.png`).
- Mapa de Vender: **catorce rótulos distintos**, un solo `IMP-08 · libre 16 sep`, ningún
  `×2`, ningún `data-choque` (`capturas/fix2-G-1-vender.png`).
- «Revisar antes de negociar»: *«El plano está limpio: sin códigos ni nombres repetidos, sin
  nombres que sean el código de otro mueble, sin muebles encimados y con pasillos por donde
  se puede caminar.»* (`capturas/fix2-H-revisar.png`).
- **Vender de a uno desde el mapa**: se tocó `IMP-07` en el mapa, se completó `POSTOBON ·
  $300.000 · 2026-10-01 → 2026-11-30` y se apretó **Guardar contrato y avisar**
  (`capturas/fix2-I-guardado.png`). En la base:
  `CIUDAD JARDIN-IMP-07 | POSTOBON | 2026-10-01 | 2026-11-30 | 300000.0`.

**El plano que ya está mal se abre, se mira y se guarda** — la regla que no se negocia.
Con los seis nombres en conflicto vivos se abrió el plano 2D, se tocó el mueble cuyo código
es de verdad `IMP-08`, se arrastró y se guardó (`capturas/fix2-D-plano-guardado.png`):
estado **«Sincronizado»**, ningún cartel de error, y contra el servidor
(`GET /api/layout/CIUDAD JARDIN`):

```
ANTES:   updated_at 21:10:52 · IMP-08 cz 8.2
DESPUES: updated_at 21:11:32 · IMP-08 cz 6.7 · 14 muebles
nomenclaturas: {IMP-09:IMP-17, IMP-11:IMP-16, IMP-12:IMP-08, IMP-13:IMP-10,
                IMP-14:IMP-12, IMP-15:IMP-14}   ← las seis, enteras
```

Y algo que en la ronda 1 no pasaba: **el panel del mueble PISADO ahora habla**. Antes, del
par, sólo avisaba el renombrado; el que de verdad se llama IMP-08 —que es justo el que se
vende por error— abría el panel sin una palabra. Ahora:

```
🔖 NOMENCLATURA … Ojo: «IMP-08» ya es el nombre del mueble IMP-12. Dos cajas con el mismo
rótulo no se distinguen en el plano.
```

…y **deja editar y guardar igual**.

**«Revisar antes de negociar» con los 10 hallazgos** (`capturas/fix2-C-revisar.png`): los 4
nombres dibujados dos veces (`IMP-08`, `IMP-17`, `IMP-10`, `IMP-16`) y los 6 que pisan el
código de otro, cada uno con su par.

**La reconciliación, con sus cuatro datos**, abajo del mismo panel:

```
Contratos para revisar uno por uno
1 contrato vigente sobre muebles que el plano dibuja con un nombre distinto de su código.
El contrato dice el código; la persona que lo negoció vio el nombre.

CIUDAD JARDIN-IMP-12 · se dibuja «IMP-08»
CASA LUKER · ASEO
2026-01-01 → 2026-09-15
Ese nombre es el código de IMP-08: hay otro mueble al que «IMP-08» apunta de verdad.
```

**La sede de otra tienda** (no estaba en el encargo de esta ronda; lo corrí igual):
`NAVE-IMP-07` sigue rechazada («`IMP-07` no existe en NAVE; sí existe en CIUDAD JARDIN») y
la fila con la columna Sede vacía sigue cayendo en la sede activa
(`capturas/fix2-J-revision.png`). Sin cambios respecto de la ronda 1 → **F2**.

---

## Hallazgos

### F1 — CERRADO (era grave)

El residuo de la ronda 1. Cerrado por el servidor, medido por la pantalla en (a). La fila
que el propio consejo produce ya no es una trampa: entra, pero entra diciendo a qué mueble
va y quién es el otro. Y el consejo mismo dejó de ser ambiguo.

### F3 — CERRADO (era cosmético)

`CargaMasiva.tsx` ponía «—» en la columna **Nombre dibujado** para toda fila en `error`, con
lo que una fila rechazada por **choque de fechas** —donde el mueble SÍ se resolvió— escondía
el dato justo cuando más se lo quiere ver. Medido en el escenario de control
(`capturas/fix2-F3-revision.png`): la fila rechazada por fechas ahora dice **«se dibuja con
su código»** donde antes decía «—» (`capturas/fix-E2-revision.png`), y la fila ambigua —que
de verdad no resolvió mueble— sigue diciendo «—», que ahí es la verdad.

### F5 — CERRADO (era grave)

El hallazgo «en el plano la colisión es invisible» del diagnóstico. Cerrado en el plano 2D
**y** en el mapa de Vender, sin llenar de pastillas un plano sano (0 → 0) y sin poder
apagarse. Medido en (b).

### F2 — CONFIRMADO, no es un defecto

La pantalla siempre manda la sede activa como sede del lote, así que una fila con la columna
Sede vacía nunca llega sin sede: cae en la sede activa y resuelve bien. El rechazo existe y
funciona, pero sólo por API cuando el lote entero viene sin sede. Es la regla del producto,
escrita en la propia pantalla («las filas sin sede caen en {sede}»), y el invariante que
importaba se cumple: **en ninguna corrida apareció un `Space` con código corto nuevo**.

### F4 — SIGUE VIVO, fuera de fase: las fechas de un CSV se leen mes primero

**Dónde:** `frontend/src/utils/planilla.ts:102-118, 177` (`XLSX.read(…, { cellDates: true })`).

Vuelto a ver sin buscarlo, en las dos rondas. Esta vez con un CSV que decía `01/03/2026`
(1 de marzo) y la revisión mostró **«3 ene → 30 jun»** (`capturas/fix2-F1-revision.png`).
Está vivo en `main` y crea contratos en el mes equivocado cuando el día es ≤ 12. Es una fase
propia y no toca lo de acá, pero conviene que no se pierda.

### F6 — `docs/ESTADO.md`: hecho a medias

Ahora sí está tocado (`+11` líneas), pero **sólo el bullet del rotulado del plano** que
agregó el constructor de frontend (§ «Un mueble tiene UN nombre» → y qué pasa cuando dos se
llaman igual). Verificado con `sed` sobre el archivo: el párrafo de
§«Carga masiva desde una planilla» → **«Qué se rechaza y qué sólo se avisa»** (`docs/ESTADO.md:1830`)
sigue **sin mencionar** la ambigüedad que se rechaza ni el aviso de colisión que se emite;
sigue listando sólo «valor 15% por debajo de la referencia» y «correo con formato dudoso»
como los dos únicos avisos. El texto propuesto está redactado al final de
`arreglo-backend.md` §6 y de `arreglo2-backend.md`. **Falta pegarlo antes del PR**, y con lo
de acá hay dos cosas más que decir: que la fila sin sede cae en la sede activa (F2) y que el
código completo desempata.

### F7 — SIGUE ABIERTO: el guardarraíl de servidor no existe

`PUT /layout/{sede}` acepta la lista de muebles sin mirar
(`backend/app/schemas/layout.py:7`). La prohibición de crear un nombre que pisa el código de
otro **vive sólo en el navegador**. Los dos constructores lo declaran fuera de alcance con
razón argumentada —bloquear los choques a secas rompería la regla que no se negocia, y el
guardarraíl correcto es «no aceptar choques NUEVOS» comparando contra el snapshot anterior,
que es un diseño propio y no una línea—. Lo repito porque es el hueco más grande que queda.

### F8 — NUEVO, menor: vender de a uno un mueble que choca guarda el aviso y no lo muestra

**Dónde:** el camino de a uno de Vender pasa por `POST /api/leases/bulk/confirmar`
(`frontend/src/components/…/Contrato.tsx`), y el panel de Vender pinta «Contrato guardado»
sin mirar `filas[].mensajes`.

Medido: se tocó en el mapa el rótulo `data-choque="×2 · IMP-13"` (el mueble `IMP-13`, que el
plano dibuja «IMP-10») y se guardó `QUALA · $250.000 · 2026-10-01 → 2026-11-30`. El servidor
contestó, textual:

```
{"creados":1,"omitidos":0,"filas":[{"estado":"aviso","mensajes":[
  "Ojo: este contrato va al mueble CIUDAD JARDIN-IMP-13, que el plano dibuja «IMP-10». Ese
   nombre es el código de OTRO mueble de la sede: CIUDAD JARDIN-IMP-10.", …]}]}
```

y la pantalla mostró **«Contrato guardado · IMP-13 queda contratado para QUALA…»** y nada
más (`capturas/fix2-L-vender-choque.png`; la palabra «Ojo» aparece una sola vez en todo el
volcado, y es dentro del JSON, nunca en el DOM).

**No es una regresión** —antes no había aviso ninguno— y **no rompe nada**: lo importante,
que la venta de a uno **no se bloquee** con el estado `aviso`, se cumple (`creados: 1`, el
contrato quedó con el código correcto). Además, en ese camino la colisión ya se vio: el
rótulo que la persona tocó decía `×2 · IMP-13`. Queda anotado porque el mismo dato que la
planilla muestra en ámbar, Vender lo tira.

### F9 — NUEVO, menor y cosmético: en el peor plano posible las pastillas se tocan

En el plano del dueño, 8 de 14 muebles quedan marcados y sus pastillas —que el plano 2D
dibuja sin deschoque de rótulos, a diferencia del mapa isométrico— **se solapan al 100% de
zoom**: el «×2» de una queda tapado por el borde de la vecina
(`capturas/fix2-B-plano-zoom.png`). Se leen igual y el color rojo se ve de lejos, que es lo
que hace falta, pero el constructor de frontend ya lo declaró (su §7.4) y lo confirmo: es el
peor caso posible, once impulsadores pegados en fila; en un plano sano no hay ninguna.

### Lo que NO verifiqué

- **Que el aviso no salga en un mueble no comercializable** (el backend lo emite sólo dentro
  de la rama «resolvió y es comercializable», `bulk_leases.py:353-355`). Mi siembra no tiene
  muebles marcados como parte del local, así que ese guardarraíl está leído en el código y
  probado por el backend, no medido por mí.
- **El editor 3D**: no se tocó en ninguna ronda y —comprobado en la ronda 1— no escribe
  `nomenclatura`.
- **Los correos**: `smtp_listo: false` en este entorno; la app lo dice en pantalla («No se
  avisó a nadie…») y eso no cambió.

---

## Higiene

- Procesos: al empezar no había huérfanos. Al terminar, backend 8091, backend gemelo 8092 y
  vite 5601 muertos por patrón acotado (`[u]vicorn.*port 8091`, `[u]vicorn.*port 8092`,
  `[v]ite --port 5601`), nunca `pkill -f uvicorn` a secas. `ss -lnt` sin nada escuchando en
  8091 / 8092 / 5601.
- Bases: `/tmp/nom-verif2/nom.db` y `/tmp/nom-verif2/viejo.db` borradas. `find` sobre
  `/tmp/re-nom` no encuentra un solo `.db`, `.sqlite` ni `.pid`. `TMPDIR=/tmp/pt-verif-nom2`
  para la suite y `/tmp/nom-verif2/tmp` para los servidores: ni pytest ni los servidores
  escribieron dentro del repo. `frontend/dist/` (de `npm run build`, ignorado por
  `.gitignore:12`) borrado al terminar.
- Playwright con `executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Sin
  librerías nuevas, sin `npm install`, **sin commit ni push**.
- El árbol quedó con exactamente los mismos 12 archivos modificados y el mismo archivo de
  prueba nuevo que traía, más las capturas y este informe.
- Arnés de la ronda 2 en `/tmp/nom-verif2/` (fuera del repo): `run_back.sh`,
  `run_back_viejo.sh`, `run_vite.sh`, `seed.py` (con `CON_NOM=0` para el control),
  `seed_viejo.py`, `validar.py`, `rotulos.mjs`, `lib.mjs`, `pw_planilla2.mjs`, `pw_caps2.mjs`,
  `pw_colores.mjs`, `pw_revisar3.mjs`, `pw_mover2.mjs`, `pw_clic3.mjs`, `pw_vender_uno.mjs`,
  `pw_vender_choque.mjs`, `pw_etiq.mjs`, `pw_zoom.mjs`, `estado.py` y los diez CSV. El árbol
  previo a la fase, para las comparaciones «antes», en `/tmp/nom-viejo/`
  (`git archive HEAD`, sin tocar el working tree).

## Índice de capturas de la ronda 2

| Archivo | Qué muestra | Contra |
|---|---|---|
| `fix2-a1-revision.png` | la fila ambigua rechazada, con los DOS códigos completos y en orden | `fix-A-revision.png` |
| `fix2-a2-revision.png` · `-confirmado.png` | `CIUDAD JARDIN-IMP-12` entra en ámbar, con los dos avisos del choque doble | `fix-B-revision.png` |
| `fix2-a3-revision.png` | la doble venta por el código corto, rechazada | `fix-C-revision.png` |
| **`fix2-a4-revision.png`** · `-confirmado.png` | **el residuo F1 cerrado**: la fila del consejo entra, pero en ámbar y nombrando al otro | **`fix-C2-revision.png`** |
| **`fix2-B-3-plano.png`** · `fix2-B-plano-zoom.png` | **F5 cerrado**: los dos muebles dicen `IMP-08 ×2`, en rojo | **`fix-C2-3-plano.png`**, `B-3-plano.png` |
| **`fix2-B-1-vender.png`** · `fix2-B-vender-zoom.png` | el mapa de Vender: `×2 · IMP-08` y `×2 · IMP-12` en las dos cajas | **`fix-C2-1-vender.png`**, `B-1-vender.png` |
| `fix2-B-2-supervisar.png` | la tabla con los dos contratos, cada uno en su código real | `fix-C2-2-supervisar.png` |
| `fix2-C-revisar.png` | los 10 hallazgos y la reconciliación, sin regresión | `fix-F-1-revisar.png`, `fix-G-revisar.png` |
| `fix2-D-plano-guardado.png` | el plano ya roto se mueve y se guarda; y el panel del mueble PISADO ahora avisa | `fix-F-3-guardado.png` |
| `fix2-E1-elegido.png` | tocando el rótulo del gemelo, el contrato queda con `IMP-12` | `fix-V-1-elegido.png` |
| **`fix2-F1-revision.png`** | **el aviso no se abarató**: tanda limpia, `4 listas · 0 con avisos`, sin franja | — |
| `fix2-F2/F3-revision.png` | control: entra, y la segunda choca por fechas — y **F3**: «se dibuja con su código» donde antes iba «—» | `fix-E1/E2-revision.png` |
| **`fix2-G-3-plano.png`** | **el plano sano sigue con CERO pastillas** | `fix-E-3-plano.png` |
| `fix2-G-1-vender.png` | control: catorce rótulos distintos, ningún `×2` | `fix-E-1-vender.png` |
| `fix2-H-revisar.png` | «El plano está limpio» | `fix-E-revisar.png` |
| `fix2-I-*.png` | vender de a uno desde el mapa, sin regresión | `fix-V-3-guardado.png` |
| `fix2-J-revision.png` | sede ajena rechazada; sede vacía cae en la activa | `fix-D-revision.png` |
| `fix2-K-etiquetas-on/off.png` | con «Etiquetas» apagadas quedan los ocho avisos | — |
| `fix2-L-vender-choque.png` | **F8**: vender de a uno un mueble que choca guarda bien y no muestra el aviso | — |
