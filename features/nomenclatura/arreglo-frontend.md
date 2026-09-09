# El arreglo, lado frontend: que el nombre no pueda pisar el código de otro, y que lo que ya está mal se vea

**Fase 12 · RECABRA · 2026-09-08.** Constructor de frontend. Archivos tocados:
`frontend/src/utils/nomenclatura.ts`, `frontend/src/utils/revision.ts`,
`frontend/src/components/FloorPlan2D/FloorPlan2D.tsx`,
`frontend/src/components/CargaMasiva/CargaMasiva.tsx`, `frontend/src/api/bulkLeases.ts`,
`frontend/scripts/probar-nomenclatura.mjs` y `frontend/scripts/probar-revision.mjs`.
**Ni una línea de `backend/**`.** Sin migraciones, sin librerías nuevas, sin endpoints nuevos.

Todo lo de abajo está corrido **por la pantalla real** (backend propio en 8082, vite en 5502,
base SQLite de usar y tirar en `/tmp/nom-fe/`), con el plano de CIUDAD JARDIN del diagnóstico:
once impulsadores `IMP-07…IMP-17`, seis renumerados a mano. Capturas nuevas en
`capturas/arreglo-*.png`. Los servidores quedaron apagados.

---

## 1. Qué hace ahora la pantalla que antes no hacía

| # | Antes | Ahora |
|---|---|---|
| 1 | El campo «Nomenclatura» del panel escribía directo, sin ninguna comprobación (`FloorPlan2D.tsx:3612-3620`) | Valida igual que el doble clic, **y las dos rechazan además el nombre que es el código de otro**, diciendo cuál |
| 2 | `nombreRepetido` comparaba nombres contra nombres; en cuanto el dueño de un código se renombraba, ese código quedaba libre como nombre | `choqueDeNombre` mira **las dos cosas**: quién se dibuja así y quién tiene ese código |
| 3 | «Revisar antes de negociar» declaraba limpio el plano de CIUDAD JARDIN | Lista **10 hallazgos**: 4 nombres dibujados dos veces + 6 nombres que pisan el código de otro |
| 4 | Nada mostraba los contratos ya firmados sobre un mueble que el plano dibuja con otro nombre | La misma pantalla de revisión los lista: proveedor, fechas, código real y nombre dibujado |
| 5 | La revisión de la planilla mostraba `codigo` (lo que la persona tecleó, con la sede antepuesta) y `nombre` (el label del tipo, idéntico en los once impulsadores) | Suma la columna **«Nombre dibujado»** con `nombre_dibujado`, y el mensaje de ambigüedad se lee entero |

**Lo que NO hace, a propósito:** no renombra ningún `code`, no resuelve la planilla por
nomenclatura, no toca la plantilla descargable, y **nunca impide guardar el plano**.

---

## 2. `utils/nomenclatura.ts`: la comprobación que faltaba

Lo que había eran dos comparaciones que no se cruzaban nunca: `codigoRepetido` (código contra
código, **y sin un solo llamador vivo**) y `nombreRepetido` (nombre contra nombre). El caso
grave se metía justo por el medio.

Lo nuevo, todo probado sin navegador:

- **`muebleConCodigo(texto, existentes, exceptoId)`** — devuelve **el mueble**, no un sí/no.
  Un booleano no alcanza: el aviso tiene que poder decir contra cuál se choca. `codigoRepetido`
  pasa a ser su envoltorio, así que deja de ser código muerto: hoy lo usa el guardarraíl.
- **`muebleConNombre(...)`** — el gemelo, del lado de lo que se dibuja. `nombreRepetido` pasa a
  ser su envoltorio; las dos comparaciones viven en un solo lugar.
- **`choqueDeNombre(nombre, existentes, exceptoId)`** — la comprobación única de los dos lugares
  donde se escribe un nombre. Devuelve `null` (se puede) o `{ clase, otro }`, con dos clases
  que se dicen distinto porque son dos daños distintos:
  - `nombre`: otro mueble ya se **dibuja** así. Dos cajas iguales en el plano.
  - `codigo`: el texto es el **código** de otro. En el plano puede no verse ninguna repetición
    —el dueño de ese código puede estar renombrado y no dibujarlo— y sin embargo la planilla,
    que resuelve por código, firma sobre ese otro. **Es la doble venta del diagnóstico.**
- **`textoDelChoque(nombre, choque)`** — el aviso en palabras, que **siempre nombra al otro
  mueble por su código**, que es la llave.
- **`nombresRepetidos(items)`** y **`nombresQuePisanCodigo(items)`** — los dos hallazgos de plano
  entero que consume la revisión.

Medido sobre el plano del diagnóstico, con las funciones reales
(`npm run probar:nomenclatura`, 40 pruebas):

```
duplicados(CIUDAD JARDIN)         → []          ← por eso la revisión lo daba por limpio
nombresRepetidos(CIUDAD JARDIN)   → IMP-08, IMP-10, IMP-16, IMP-17
nombresQuePisanCodigo(...)        → 6 de 6
```

Y la cascada que el censo midió (H2 de `diag-censo.md`) queda cerrada:

```
plano virgen:  renombrar IMP-12 → «IMP-08»   choque «nombre»  (lo dibuja IMP-08)
tras renombrar IMP-08 → «IMP-14»:
               renombrar IMP-12 → «IMP-08»   choque «codigo»  (es el código de IMP-08)
```

Antes, el segundo caso pasaba.

## 3. El plano: las dos puertas validan igual, y ninguna traba lo que ya existe

**El doble clic sobre la caja** (`commitCodeEdit`) llama a `choqueDeNombre` en vez de a
`nombreRepetido`, y el aviso dejó de ser un `title` de hover: es un cartel rojo sobre el plano
que **no se desvanece** —el campo sigue abierto hasta que se corrija, y dos segundos no alcanzan
para decidir qué escribir—. Corrido en el navegador (`capturas/arreglo-3-dobleclic.png`):

> «IMP-11» es el código de otro mueble, el que se dibuja «IMP-16». Un contrato cargado como
> «IMP-11» se firma sobre ése, no sobre éste.

**El campo «Nomenclatura» del panel** recibe ahora el plano entero (`items`) y llama a la misma
función. Tres comportamientos, los tres medidos por pantalla:

| Qué pasa | Qué se ve | Captura |
|---|---|---|
| El nombre guardado ya pisa a otro (los seis de CIUDAD JARDIN) | aviso ámbar «Ojo: …», **y se puede seguir editando y guardando** | `arreglo-5-panel-avisa-lo-viejo.png` |
| Se escribe el código de otro mueble | rojo «No se guardó: … Sigue llamándose «IMP-08».» | `arreglo-2-panel-rechaza.png` |
| Se escribe un nombre libre | se guarda, texto de ayuda normal | — |

Un detalle que costó una vuelta y vale decirlo: el campo escribía en cada tecla. Tecleando
`IMP-11`, el prefijo `IMP-1` es válido y quedaba guardado, y el rechazo del final dejaba al
mueble **renombrado a algo que nadie quiso**. Ahora, mientras lo escrito choque, el mueble se
queda con el nombre que tenía al empezar a editar, y el aviso lo dice: «Sigue llamándose «IMP-08»».

**La regla que no se negocia, verificada de punta a punta:** con el plano de CIUDAD JARDIN
—seis nombres que pisan códigos ajenos— se abrió el plano, se editó un mueble y se guardó:

```
estado de sync: Guardado ✓
en el servidor: [('IMP-11','IMP-16'), ('IMP-12','Punta del pasillo 3'), ('IMP-13','IMP-10')]
```

Cinco choques siguen ahí y el plano guardó igual. Ninguna de las validaciones nuevas toca el
camino de guardado: sólo deciden si un **nombre nuevo** se escribe en el mueble.

## 4. «Revisar antes de negociar»: dos hallazgos nuevos y la reconciliación

`MuebleRevisable` gana `nomenclatura` —el dato no entraba a la función, por eso el chequeo no
podía existir— y `revisarPlano` suma dos clases, las dos `error` porque las dos rompen algo
aguas abajo (la revisión **informa, nunca bloquea**: no hay ningún guardado detrás de este panel):

- `nombre-repetido` — «IMP-08 se dibuja en 2 muebles — en el plano no se distinguen, y quien lo
  escriba en una planilla no elige cuál»
- `nombre-pisa-codigo` — «IMP-12 se dibuja «IMP-08», que es el código de otro mueble (IMP-08) —
  un contrato cargado como «IMP-08» se firma sobre IMP-08»

Cada hallazgo lleva **los dos ids**, así que «Tocá para ir» selecciona los dos muebles del par.
Sobre el plano del diagnóstico el panel pasa de «El plano está limpio» a **«10 cosas rompen algo
aguas abajo»** (`capturas/arreglo-1-revisar.png`).

**La reconciliación** (punto 4 del encargo, consulta 2 del §4 del DIAGNÓSTICO) vive abajo del
mismo panel: **«Contratos para revisar uno por uno»**. Sale de
`contratosConNombreAjeno(contratos, muebles, hoy)` en `utils/revision.ts`, y se arma **con lo que
la pantalla ya tiene**: los campos comerciales viven denormalizados en el propio mueble del
layout —es de ahí que se pinta el mapa—, incluida la cara B. Ningún endpoint nuevo.

Corrido por pantalla, con CASA LUKER sobre el mueble `IMP-12` que el plano dibuja «IMP-08»:

> **CIUDAD JARDIN-IMP-12 · se dibuja «IMP-08»**
> CASA LUKER · ASEO
> 2026-01-01 → 2026-09-15
> *Ese nombre es el código de IMP-08: hay otro mueble al que «IMP-08» apunta de verdad.*

Reglas de la lista, todas probadas: sólo contratos **vigentes** (`hasta >= hoy`, igual que la
consulta SQL; los que arrancan el mes que viene entran, que son los que todavía se pueden
corregir), sólo muebles con **nombre puesto a mano** distinto de su código, la cara B con su
propio código de espacio (`…-B`), y **primero los que pisan el código de otro**, que son los
peores porque hay otro mueble al que ese texto apunta de verdad. El contrato de COLGATE sobre
`IMP-08` —que se dibuja con su código— correctamente **no** aparece: no hay nada que reconciliar.

## 5. La planilla: la columna que faltaba

`FilaRevisada` (`api/bulkLeases.ts`) gana `nombre_dibujado?: string | null`, tal como lo fija el
contrato, y la tabla de revisión gana **su propia columna, pegada al código**: son los dos
nombres del mismo mueble, y verlos separados es lo que dejó firmar dos veces el mismo espacio.

Corrido contra el backend real de esta misma rama (`capturas/arreglo-4-planilla.png`):

```
FILA  ESPACIO                NOMBRE DIBUJADO        PROVEEDOR  …  ESTADO
2     CIUDAD JARDIN-IMP-09   IMP-17                 ALPINA        Lista
      Impulsador Marca       así lo dibuja el plano
3     CIUDAD JARDIN-IMP-08   —                      COLGATE       No entra
      «IMP-08» es ambiguo en CIUDAD JARDIN: es el código de un mueble y el nombre
      dibujado de otro (código CIUDAD JARDIN-IMP-12). Escribí el código completo
      del que quisiste.
```

La fila 2 es exactamente el escenario 1 de la tabla «lo que hay que probar» del DIAGNÓSTICO: la
persona escribió `IMP-09`, el servidor resolvió bien, y la revisión ahora **le muestra que ese
mueble en el plano se llama IMP-17** — antes las dos columnas decían lo mismo para el mueble
correcto y para el equivocado. Cuando la fila no entra, la columna dice «—» y no «se dibuja con
su código»: sin mueble resuelto, afirmarlo sería inventar uno.

## 6. Cómo verificarlo

```bash
cd /tmp/re-nom/frontend
npx tsc --noEmit                 # limpio
npm run probar:nomenclatura      # 40 pruebas
npm run probar:revision          # 31 pruebas
```

`npm run probar` completo (los nueve scripts) también pasa: 33 · 18 · 40 · 12 · 31 · 11 · 21 ·
24 · 12, sin fallas. **No se corrió `npm run build` ni la suite del backend**: los corre el
Verificador.

Para reproducir lo del navegador (levanta backend 8082 y vite 5502, y hay que apagarlos después):

```bash
/tmp/nom-fe/run_back.sh &                                   # backend propio
cd /tmp/re-nom/backend && python3 /tmp/nom-fe/seed.py       # plano de CIUDAD JARDIN
python3 /tmp/nom-fe/seed_contrato.py                        # contratos denormalizados
cd /tmp/re-nom/frontend && VITE_API_TARGET=http://127.0.0.1:8082 npx vite --port 5502
cd /tmp/nom-fe && node pw_revisar.mjs      # el panel de revisión + la reconciliación
cd /tmp/nom-fe && node pw_panel.mjs        # el campo Nomenclatura, los tres casos
cd /tmp/nom-fe && node pw_doble.mjs        # el doble clic sobre la caja
cd /tmp/nom-fe && node pw_planilla.mjs /tmp/nom-fe/planilla_mix.csv MIX
```

---

## 7. Lo que quedó afuera, y una cosa que encontré de paso

**Lo que este PR no cierra, dicho sin adornos:**

1. **El editor 3D no es una tercera puerta, y lo comprobé:** dibuja `nombreDeMueble`
   (`StoreEditor3D.tsx:17`) pero **nunca escribe** `nomenclatura` — sólo la arrastra del store
   para no borrarla al abrirse (`:4350`, con el comentario que lo explica en `:4318-4321`). Las
   dos puertas por las que se escribe un nombre son las dos del plano 2D, y las dos validan.
2. **El guardarraíl sigue viviendo sólo en el navegador.** `PUT /layout/{sede}` acepta
   `fixtures: list[Any]` sin mirar (`schemas/layout.py:7`). Lo de acá impide crear casos nuevos
   *desde la pantalla*; una llamada directa a la API los sigue creando.
3. **La reconciliación se arma con el layout, no con `space_leases`.** Es lo único que el
   navegador tiene sin endpoints nuevos, y es de donde se pinta el mapa — pero un contrato que
   existe en la base y cuyo parche al layout nunca se guardó **no va a aparecer en la lista**.
   La consulta 2 del DIAGNÓSTICO, contra la base, sigue siendo la verdad completa. Si esta
   pantalla tiene que ser la definitiva, hace falta un endpoint que devuelva los contratos
   vigentes por sede; lo digo en vez de inventarlo.
4. **La plantilla pre-llenada** (recomendación 2 del §5 del DIAGNÓSTICO) sigue bajando con dos
   filas de ejemplo. Quedó para después, como estaba dicho.
5. El aviso del panel se **muestra**, pero el campo no impide seguir editando otra cosa: si la
   persona escribe un nombre que choca y se va a otro mueble, el nombre **no se guardó** y el
   mueble quedó como estaba. Es deliberado (rechazar es no escribir, no borrar), pero significa
   que el trabajo tecleado se pierde.

**Y una cosa que encontré de paso, que no toqué porque no es de esta fase** —está en
`utils/planilla.ts`, que no está en mi lista, y arreglarla toca el camino de Excel entero:

> **Las fechas de un CSV se leen mes primero, al revés de lo que dice el producto.**
> `leerFecha` implementa bien la regla día-primero (`planilla.ts:118`), pero sólo la aplica al
> **texto**: `XLSX.read(buffer, { cellDates: true })` ya convierte `01/10/2026` a un `Date`
> —10 de enero, a la americana— y `leerFecha` lo devuelve tal cual (`:108`).
>
> ```
> $ node -e "…XLSX.read('Espacio,Desde\nIMP-09,01/10/2026',{cellDates:true})…"
> ["IMP-09","2026-01-10T00:00:00.000Z"]     ← 10 de enero; la planilla decía 1 de octubre
> ```
>
> Se ve en `capturas/arreglo-4-planilla.png`: la fila dice `01/10/2026 → 15/12/2026` y la
> revisión muestra **«10 ene → 15 dic · 340d»**. Los días mayores a 12 se salvan (por eso las
> planillas del diagnóstico, con `15/09`, no lo delataban), y los otros crean un contrato de
> tres meses en el mes equivocado — que es, palabra por palabra, lo que el comentario de
> `planilla.ts:104` dice que hay que evitar. Es una fase propia: hay que decidir qué pasa con
> los `.xlsx` de verdad, donde la celda sí viene con formato de fecha.
