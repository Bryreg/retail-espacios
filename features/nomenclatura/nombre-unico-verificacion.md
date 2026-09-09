# Verificación de la fase 13 — un solo nombre, y la renumeración

**Verificador. RECABRA · 2026-09-09 · rama `claude/fase-13-nombre-unico` en `/tmp/re-nom`.**
Dos rondas. La **ronda 1** verificó la fase entera y dejó cinco hallazgos (V1…V5). La
**ronda 2** —este informe reescrito— vuelve a medir todo **después** de que se arreglaran V1,
V2 y V4, porque el arreglo tocó la renumeración.

Todo se midió **contra el servidor** o **por la pantalla real** (Playwright, sesión de
administrador y una de operario), con la app levantada en puertos propios —ronda 1: backend
8118 / vite 5718; ronda 2: backend **8127** / vite **5827**—, base SQLite fuera del repo y
`TMPDIR` fuera del repo. Servidores apagados y bases borradas al terminar. **No arreglé nada**:
no toqué una línea de `backend/**`, `frontend/**` ni `docs/**` en ninguna de las dos rondas.

Capturas: `capturas/nu-*.png` (46, ronda 1) y `capturas/nu2-*.png` (43, ronda 2).

---

## VEREDICTO DE LA RONDA 2

**Los tres hallazgos están cerrados, y los tres los comprobé por la pantalla, no por el
código.** V1 —la lista «Contratos para revisar uno por uno» se vaciaba justo después de
renumerar— hoy lista los **cuatro** contratos con el nombre viejo y el nuevo, y **sobrevive a
una segunda renumeración con un renombre a mano en el medio**: sigue diciendo el nombre
original, el que dice el papel, no el intermedio. V2 —el rechazo del servidor se leía «Sin
conexión»— hoy dice **«Rechazado por el servidor»** con el panel abierto solo y la frase entera
del servidor, y esa frase **ya no trae un solo `id` interno**. V4 —la planilla vieja no decía en
qué se convirtió el código retirado— hoy lo dice, sigue en error, y sigue diciendo la verdad
después de dos renumeraciones, de un renombre a mano y de borrar el mueble.

**Y no se rompió nada de lo que ya pasaba.** Los invariantes se volvieron a correr **completos**
sobre las mismas seis sedes y 92 muebles y salen idénticos a la ronda 1, incluidos los dos que
el arreglo podía haber roto: **ninguna coordenada se movió** (18 campos, mueble por mueble,
emparejando por `id`) y **el previo no escribe una sola fila**. La suite del backend pasó de
1048 a **1058** pruebas, exit 0 sin una `F` ni una `E`; `npm run probar` de 241 a **247**, exit 0;
`tsc` y `build` en 0.

**Queda un residuo de V2 que no estaba en la ronda 1 y que anoto como W1**, más el hallazgo
cosmético V3 que sigue abierto tal cual. Ninguno es de datos.

| Verificación (ronda 2) | Resultado |
|---|---|
| `cd frontend && npx tsc --noEmit` | **exit 0** |
| `npm run build` | **exit 0** (`✓ built in 8.85s`; sólo el aviso de siempre de tamaño de chunk) |
| `npm run probar` (los 11 scripts) | **exit 0 — 247 pruebas** (33·18·40·12·**36**·12·28·11·21·24·12) |
| `ps` tras `probar` | **ningún proceso vivo** |
| `pytest -q -p no:warnings` (suite completa, UNA vez, `TMPDIR=/tmp/pt-verif-nu2`) | **exit 0 — 1058** (1047 ok · 7 xfail · 4 skipped · **0 F · 0 E**) |
| **V1** · la reconciliación después de renumerar, y tras una SEGUNDA renumeración | **CERRADO** |
| **V2** · el 409 por `PUT` y por pantalla; nombres, no `id` | **CERRADO** (con el residuo W1) |
| **V4** · la planilla vieja dice en qué se convirtió el código retirado | **CERRADO** |
| (4) los invariantes sobre 6 sedes · 92 muebles, otra vez completos | **PASA** |
| (4) el arrastre con 17 contratos y 2 montajes cargados antes | **PASA** |
| (4) la rotación pura de 9 nombres con contrato encima de los nueve | **PASA** |
| (5) el guardarraíl: choque nuevo · plano sucio · intercambio · cadena · primer plano | **PASA** |
| (5) los TRES caminos de renombre (doble clic · panel 2D · panel 3D) | **PASA** |
| (5) la pantalla de renumeración: previo, papel A4, alcance, aplicar | **PASA** |
| (5) el orden del recorrido | **PASA**, y da **0 cambios** en las tres sedes que numeré a mano |
| (5) la planilla, vender de a uno, las fechas del CSV | **PASA** |
| (5) los avisos de la fase 12 sobre un plano sin renumerar | **PASA** |
| V3 · la columna CORRIDA del papel mete una caja en un pasillo | **SIGUE ABIERTO** (cosmético) |
| V5 · dos muebles con el mismo código no se distinguen en el rótulo | correcto, no es defecto |
| **W1** (nuevo) · el 409 puede nombrar a un mueble por un texto que ninguna pantalla dibuja | **HUECO** (menor) |
| **W2** (nuevo) · el `logger.info` del rechazo no sale por ningún lado | **HUECO** (menor) |
| **F1** del frontend · el buscador de Supervisar sigue buscando por `nomenclatura` | **CONFIRMADO**, y es peor de lo que dice |

> Nota sobre la suite: `backend/pytest.ini:3` ya trae `addopts = -q`, así que el `-q` del
> encargo la deja en `-q -q` y pytest **oculta la línea final de resumen**. El veredicto es el
> código de salida (**0**) y el mapa de puntos completo, en `/tmp/nu2/suite.log`: 1047 `.`,
> 7 `x`, 4 `s`, ni una `F` ni una `E`. Son exactamente **10 más** que la ronda 1 (1048), que son
> las diez pruebas nuevas de `test_renumeracion.py` (27 → 37).

> Nota sobre `probar`: `probar:revision` pasó de 30 a 36 pruebas (+6, las del nombre viejo
> desde el lado del navegador). Los otros diez scripts dan exactamente lo mismo que en la
> ronda 1. Total 241 → 247.

> **Tensión de instrucciones, dicha para que quede escrita.** El encargo numerado me pide
> `npm run build` y la suite completa del backend; la «REGLA DE VERIFICACIÓN» del pie las
> prohíbe. Corrí las dos, como en la ronda 1: soy el único rol que las corre, y sin ellas no
> hay veredicto de «no rompió nada». Las dos salieron en 0.

---

## Cómo se midió

**La siembra: las mismas seis sedes de la ronda 1** (`/tmp/nu2/seed6.py`), 92 muebles, planos
distintos entre sí. `rotY` en radianes, que es como lo guarda la app.

| Sede | Qué es | Muebles | Eje elegido |
|---|---|---|---|
| **CIUDAD JARDIN** | el caso del dueño: 3 puntas + 11 impulsadores y **los seis nombres puestos a mano que pisan códigos ajenos** (`IMP-12→«IMP-08»`, `IMP-13→«IMP-10»`, `IMP-14→«IMP-12»`, `IMP-15→«IMP-14»`, `IMP-11→«IMP-16»`, `IMP-09→«IMP-17»`) | 14 | `z` |
| **NAVE** | 3 corridas de 3 góndolas 3,60×0,90 giradas 90°, puntas en cabecera y cola, fila de 4 cajas al frente, 2 impulsadores sueltos | 21 | `z` |
| **POBLADO** | los pasillos corren sobre **X**: 16 góndolas dobles en 4 corridas, 4 puntas, frutas y nevera | 22 | `x` |
| **LAURELES** | puro impulsador: ninguno alargado, decide la forma del recinto | 15 | `z` |
| **ENVIGADO** | mezcla de tipos, **una columna `rentable:false`** y **un `type` que no existe en la tabla** | 11 | `z` |
| **ITAGUÍ** | plano **ya numerado como camina el recorrido** | 9 | `z` |

Cuatro rondas de ejecución, cada una con base nueva:

- **A** — invariantes y arrastre, con **17 contratos** cargados por `POST /api/leases/bulk/confirmar`
  y **2 confirmaciones de montaje**. (`/tmp/nu2/rondaA.log`)
- **A2** — V1 **por la pantalla**, con los **4 contratos del dueño cargados por la pantalla de
  Planilla**, que es la que además escribe el estado comercial en el plano y por lo tanto la que
  alimenta la reconciliación. (`/tmp/nu2/rondaA2.log`)
- **B** — V2 y el guardarraíl. (`/tmp/nu2/rondaB.log`)
- **C** — todo lo demás. **D** — el plano que llega ya roto y los caminos de renombre 2 y 3.
  (`/tmp/nu2/rondaC.log`, `rondaD.log`)

**Arnés** en `/tmp/nu2/` (fuera del repo), reutilizado de la ronda 1 con los puertos cambiados y
guiones nuevos: `v1.py`, `v1b.py`, `v2.py`, `v2_prep.py`, `v4.py`, `v4b.py`, `v5.py`,
`pw_v1.mjs`, `pw_v1panel.mjs`, `pw_v2.mjs`, `pw_f1.mjs`, `pw_mover4.mjs`.

---

## V1 — CERRADO. La reconciliación sobrevive a renumerar, y a renumerar dos veces

**Lo que fallaba (ronda 1):** `nombreAnterior` no lo escribía nadie —`grep` en `backend/app/` no
devolvía nada— y la renumeración sí borraba la `nomenclatura`. Con las dos fuentes vacías la
sección «Contratos para revisar uno por uno» **desaparecía justo después de aplicar**, que es el
momento exacto para el que existe.

**Lo que hay ahora, medido por pantalla** (`capturas/nu2-30-v1-reconciliacion-antes.png`,
`-despues.png`, `-despues2.png`), misma siembra, los mismos cuatro contratos cargados por la
pantalla de Planilla, y renumerando **por el botón de la pantalla de Renumerar**:

```
ANTES de renumerar
  Contratos para revisar uno por uno
  1 contrato vigente sobre muebles que hoy se llaman distinto de como se llamaban cuando se
  negociaron. El papel y el cartel de la góndola dicen el nombre viejo; el plano dice el de ahora.
    CIUDAD JARDIN-IMP-12 · se negoció como «IMP-08»
    CASA LUKER · ASEO · 2026-01-01 → 2026-12-31
    Cuidado: «IMP-08» hoy es el nombre de OTRO mueble (IMP-08). …

DESPUÉS de renumerar  ← esto es lo que antes desaparecía
  Contratos para revisar uno por uno
  4 contratos vigentes sobre muebles que hoy se llaman distinto …
    CIUDAD JARDIN-IMP-01 · se negoció como «IMP-07»   POSTOBON · BEBIDAS
    CIUDAD JARDIN-IMP-02 · se negoció como «IMP-08»   COLGATE · ASEO
    CIUDAD JARDIN-IMP-06 · se negoció como «IMP-08»   CASA LUKER · ASEO
    CIUDAD JARDIN-PUN-01 · se negoció como «PUN-06»   QUALA · ALIMENTOS
```

Los cuatro contratos están, con el nombre de hoy y el nombre con el que se negoció, y tres de
ellos con el aviso rojo de que ese nombre viejo hoy lo lleva **otro** mueble. Y el panel del
mueble lo dice también (`nu2-34-panel-nombre-viejo.png`, clic sobre `PUN-01`):

```
Antes se llamaba «PUN-06». Es lo que puede seguir diciendo el cartel de la góndola y lo que
vio quien negoció lo que ya está contratado.
```

### La segunda renumeración — que es donde un campo pisado habría perdido el original

Sobre el plano ya renumerado hice una **rotación pura de tres nombres a mano** (`IMP-01→IMP-02→
IMP-03→IMP-01`, que pasa el guardarraíl porque no sube la cuenta de ningún nombre) y volví a
renumerar: la segunda corrida mueve 3 nombres. La lista de la pantalla queda **exactamente
igual**, con los nombres **originales**:

```
### despues2
    CIUDAD JARDIN-IMP-01 · se negoció como «IMP-07»
    CIUDAD JARDIN-IMP-02 · se negoció como «IMP-08»
    CIUDAD JARDIN-IMP-06 · se negoció como «IMP-08»
    CIUDAD JARDIN-PUN-01 · se negoció como «PUN-06»
```

y en la base la cadena entera está, seis filas, no tres pisadas (`/tmp/nu2/v1b.py`):

```
('imp7','IMP-07','CIUDAD JARDIN-IMP-07','CIUDAD JARDIN-IMP-01')   ← primera corrida
('imp8','IMP-08','CIUDAD JARDIN-IMP-08','CIUDAD JARDIN-IMP-02')
('imp9','IMP-17','CIUDAD JARDIN-IMP-09','CIUDAD JARDIN-IMP-03')
('imp7','IMP-02','CIUDAD JARDIN-IMP-02','CIUDAD JARDIN-IMP-01')   ← segunda
('imp8','IMP-03','CIUDAD JARDIN-IMP-03','CIUDAD JARDIN-IMP-02')
('imp9','IMP-01','CIUDAD JARDIN-IMP-01','CIUDAD JARDIN-IMP-03')
```

El servidor contesta la **punta más vieja**, no la penúltima. Es la decisión correcta y la
comprobé: `imp9` sigue diciendo `IMP-17` —lo que dibujaba el plano el día que se firmó— y no
`IMP-01`, que fue un nombre intermedio de treinta segundos que nunca estuvo en una pared.

### Y el recuerdo no se metió adentro del mueble

Lo verifiqué contra la base, no contra la respuesta (`/tmp/nu2/v1.py`):

```
OK  imp12 recuerda el nombre DIBUJADO «IMP-08» (no su código IMP-12)
OK  el nombre viejo NO está en el JSON guardado del plano   ← leyendo layout_snapshots.fixtures_json
OK  la nomenclatura salió del JSON guardado
OK  GET /layout/ (todas las sedes) también trae el nombre viejo
OK  un cliente que MANDA nombreAnterior no lo guarda (PUT 200)
OK  y el que devuelve el servidor sigue siendo el del registro, no el inventado
    renumeracion_nombres: 41 filas · 3 sedes
```

Le mandé al servidor un plano con `nombreAnterior:"INVENTADO"` en los catorce muebles: el `PUT`
contesta 200, la base queda sin la clave, y el `GET` siguiente devuelve el recuerdo del
registro. Es de sólo lectura de verdad.

**El operario también lo ve, y sigue sin ver la plata** (`/tmp/nu2/v5.py`, con token de rol
`worker`): `nombreAnterior` llega en los muebles y `negotiatedValue` no aparece en ninguno.

---

## V2 — CERRADO. El rechazo del servidor se lee como un rechazo del servidor

**Lo que fallaba (ronda 1):** el 409 `nombres_repetidos` se guardaba en `syncState:"error"` y
`SyncStatus` pintaba eso como **«Sin conexión»**, en rojo y con la nube tachada; el motivo vivía
sólo en el `title=`. Además el mensaje nombraba a los muebles por su `id` interno (`imp9`,
`pun8`), que no aparece en ninguna pantalla.

### Por `PUT` — un choque nuevo (`/tmp/nu2/v2.py`)

```
OK  un choque NUEVO se rechaza: 409 · code == nombres_repetidos
    message: Este guardado dejaría nombres repetidos en «CIUDAD JARDIN» que antes no estaban.
    choque : «PUN-08» quedaría como nombre de 2 muebles de la sede: el que hoy se llama
             «PUN-06» (Punta de Gondola) y el que hoy se llama «PUN-08» (Punta de Gondola).
             Dos muebles con el mismo nombre no se distinguen en el plano ni en un contrato.
OK  NO aparece ningún id interno de mueble en el 409: []
OK  el servidor NO escribió nada
```

Busqué los catorce `id` del plano como palabra dentro del JSON entero del 409: **cero**. Y un
mueble que el guardado **agrega** se dice como tal, no como si ya estuviera en el plano:

```
choque : «PUN-06» quedaría como nombre de 2 muebles de la sede: el que hoy se llama «PUN-06»
         (Punta de Gondola) y el que se agrega en este guardado, «PUN-06» (Punta de Gondola).
```

El contrato del 409 no cambió: el intercambio de dos nombres sigue entrando con 200.

### Por pantalla (`capturas/nu2-31-v2-rechazo.png`)

Para forzarlo por pantalla hace falta el único estado en el que el navegador y el servidor no
miran lo mismo: un plano que **todavía tiene `nomenclatura`** y esa nomenclatura es un texto que
no es el código de nadie —que es como va a estar producción el día del despliegue—. Le puse a
`imp9` la nomenclatura `CARTEL VIEJO` (`v2_prep.py`) y renombré `PUN-08` a ese mismo texto desde
el panel: el navegador lo ve libre, el servidor no.

```
CHIP DE ESTADO: "Rechazado por el servidor"   (en la cabecera y en el pie)
PANEL (aria="El servidor rechazó el guardado", abierto solo):
  El servidor no guardó el plano
  Este guardado dejaría nombres repetidos en «CIUDAD JARDIN» que antes no estaban.
  «CARTEL VIEJO» quedaría como nombre de 2 muebles de la sede: el que hoy se llama
  «CARTEL VIEJO» (Impulsador Marca) y el que hoy se llama «PUN-08» (Punta Góndola). …
  No se escribió nada en el servidor y el cambio sigue en esta computadora, sin subir.
  Corregí el nombre en el plano y se guarda solo.
¿dice «Sin conexión»? false
¿aparece algún id interno? false
SERVIDOR: intacto, mueble por mueble
```

El chip lleva el triángulo del conflicto y no la nube tachada, el panel se abre solo con el
texto entero, y dice qué hay que hacer para destrabarlo. **Eso es lo que pedía V2 y está.**
El residuo está abajo, en **W1**.

---

## V4 — CERRADO. La planilla vieja dice en qué se convirtió el código retirado

Sobre el plano **ya renumerado**, por la pantalla de Planilla
(`capturas/nu2-33-planilla-viejo-revision.png`):

```
FILA 2 · CIUDAD JARDIN-IMP-17 · QUALA · 1 mar → 30 jun · $170.000 · No entra
  No hay ningún mueble con el código «CIUDAD JARDIN-IMP-17» en el plano de CIUDAD JARDIN.
  Ese plano se renumeró el 9 de septiembre de 2026: «IMP-17» lo llevaban 2 muebles, que ahora
  se llaman «IMP-03» y «IMP-11». Escribí el que corresponda.
0 contratos por guardar
```

Los dos renglones **se leen enteros** en pantalla, comprobado carácter por carácter contra el
DOM, y `elementos con texto recortado por CSS: []`. La fila **sigue en error** y no entra:
adivinar el mueble es exactamente el error que la fase eliminó.

Lo demás que medí (`/tmp/nu2/v4.py`, `v4b.py`, `v5.py`):

| Caso | Qué dice |
|---|---|
| un nombre que llevaban **dos** muebles (`IMP-17`: el código de `imp17` y el dibujado de `imp9`) | los nombra a los dos y pide elegir |
| un nombre que llevaba **uno** (`IMP-13`) | *«…«IMP-13» ahora se llama «IMP-07».»* |
| la forma **corta** (`IMP-13`) y la **cara B** (`IMP-13-B`) | la misma pista |
| un código que **nunca existió** (`ZZZ-99`) | **no** inventa pista |
| un código **vivo** | entra, y no le cuelga la pista |
| **20 filas** con el código retirado en una planilla | las 20 traen la pista (el registro se lee una vez) |
| después de un **renombre a mano** del mueble a `ZZZ-77` | *«…ahora se llama «ZZZ-77»»* — lee el plano de hoy, no la tabla |
| después de **borrar** el mueble | *«…era el nombre de un mueble que ya no está en el plano.»* |
| convive con el aviso de otra sede | *«…sí existe en LAURELES.»* **y** la pista, las dos |

Esa última fila importa: cuando el código existe en otra sede, «sí existe en NAVE» es la frase
más peligrosa del sistema —manda el contrato al supermercado equivocado— y ahora va acompañada
de la que explica por qué acá no está.

---

## (4) LOS INVARIANTES, otra vez y completos

`python3 /tmp/nu2/todo.py`, contra el servidor, sobre las 6 sedes y 92 muebles, con los 17
contratos y los 2 montajes cargados **antes**. Textual:

```
A · el PREVIO no escribe una sola fila
  OK   previo contesta 200 · muebles=92 cambian=41
  OK   previo.aplicado == False
  OK   los 6 planos (fixtures + updated_at) son IDENTICOS despues del previo
  OK   spaces / svg_id / mount_confirmations / leases / layout_snapshots IDENTICOS despues del previo

B · APLICAR en las 6 sedes
  OK   aplicar contesta 200 · muebles=92 cambian=41 · aplicado == True

C · LOS INVARIANTES, sede por sede   (las seis, idénticas en forma)
  OK   CIUDAD JARDIN: conteo identico (14 -> 14)
  OK   CIUDAD JARDIN: MISMO conjunto de fixture.id (faltan [] · sobran [])
  OK   CIUDAD JARDIN: NINGUNA coordenada se movio (cx,cz,w,d,rotY,type,rentable + 11 campos) []
  OK   CIUDAD JARDIN: ningun nombre repetido (14 distintos) []
  OK   CIUDAD JARDIN: la clave nomenclatura salio del JSON
  … ENVIGADO 11→11 · ITAGUI 9→9 · LAURELES 15→15 · NAVE 21→21 · POBLADO 22→22 …
  OK   total: 92 -> 92 muebles

D · EL ARRASTRE (contratos cargados ANTES)
  OK   ningun espacio quedo huerfano []
  OK   ningun espacio cambio de mueble fisico []
  OK   los 41 spaces de codigo CORTO (sin sede) NO se tocaron
  OK   los 17 contratos siguen colgando del mismo space_id, fechas y valor
  OK   el montaje 1 sigue en el mismo mueble (CIUDAD JARDIN-IMP-12 -> CIUDAD JARDIN-IMP-06)
  OK   el montaje 2 sigue en el mismo mueble (NAVE-GON-50 -> NAVE-GON-01)
  OK   spaces.code sin repetidos · spaces.svg_id sin repetidos

E · IDEMPOTENCIA
  OK   el segundo previo dice cambian == 0
  OK   el segundo aplicar: 200 · cambian == 0
  OK   los 6 planos IDENTICOS tras la segunda corrida (hasta updated_at)
  OK   spaces / svg_id / mounts / leases / layout_snapshots IDENTICOS tras la segunda corrida
```

Es **idéntico** a la ronda 1, cifra por cifra. Los dos que el arreglo podía haber roto están
verdes: el previo sigue sin escribir (volcando plano, `spaces`, `svg_id`, `space_leases`,
`mount_confirmations` y `layout_snapshots` antes y después, volcados idénticos) y **no se movió
una sola coordenada** —comparo 18 campos mueble por mueble emparejando por `id`, no sólo
`cx`/`cz`—. El campo derivado `nombreAnterior` no entra en esa comparación **porque no está en
el plano guardado**: lo comprobé leyendo `fixtures_json` de la base.

### La rotación pura — donde el UNIQUE explota si está mal hecho

Nueve góndolas con los nombres permutados en círculo y **un contrato encima de cada una**
(`/tmp/nu2/rotacion.py`):

```
APLICAR: 200 · cambian = 9
rt0 GON-02→GON-01 · rt1 GON-03→GON-02 · … · rt8 GON-01→GON-09
es la rotacion esperada: True
los 9 contratos identicos (mismo space_id, mismo proveedor): True
code repetidos: []  ·  svg_id repetidos: []  ·  valores temporales que quedaron: []
ROTACION PURA: VERDE
```

### El orden del recorrido — juzgado contra geometría propia

En las tres sedes donde numeré el plano a mano *como caminaría la tienda*, la renumeración da
**cero cambios**. Del previo de las seis sedes:

```
CIUDAD JARDIN  14 muebles · cambian 14 · eje z · 12 bandas
ENVIGADO       11 muebles · cambian  7 · eje z · 10 bandas
ITAGUI          9 muebles · cambian  0 · eje z ·  3 bandas   ← numerado a mano por el recorrido
LAURELES       15 muebles · cambian  0 · eje z ·  5 bandas   ← ídem
NAVE           21 muebles · cambian 20 · eje z ·  7 bandas
POBLADO        22 muebles · cambian  0 · eje x ·  4 bandas   ← ídem, y acá el eje es X
```

Es la prueba más fuerte que se me ocurre: la regla no reordena, coincide. Y en la pantalla de
alcance, ITAGUÍ dice **«Nada que aplicar»**.

---

## (5) TODO LO DEMÁS QUE YA PASABA — sin regresiones

### El guardarraíl (`/tmp/nu2/guardarrail.py`) — cinco de cinco

```
1. un choque NUEVO (PUN-08 -> PUN-06) se rechaza con 409, nombrando a los DOS muebles,
   y no se escribio nada: el plano quedo como estaba
2. el plano SUCIO tal como esta se sigue guardando: mover un mueble y guardar → 200,
   el movimiento quedo guardado, y los nombres a mano en conflicto siguen enteros
3. el INTERCAMBIO de dos nombres se acepta → 200, y contra GET los dos quedaron cambiados
4. la CADENA A→B→C→A se acepta → 200, y contra GET quedaron los tres
5. un plano SUCIO que llega por PRIMERA vez entra (200) y se puede volver a guardar (200)
```

Y **por la pantalla**, sobre el plano que llega ya roto (dos pares de gemelos de verdad,
`/tmp/nu2/seed_roto.py`): arrastré un mueble con el mouse y el servidor contestó **`PUT 200`**
con la coordenada nueva guardada (`nu2-36-roto-movido.png`). La regla que no se negocia —el
plano que ya está mal se abre, se mira, se mueve y se guarda— se cumple por los dos caminos.

> Aviso de arnés, no del producto: el guion `pw_paso7.mjs` reporta *«PLANO ROTO · se movió y se
> guardó: NO»*. Es del guion: arrastra el primer grupo del SVG justo después de cerrar el panel
> de Revisar y no engancha. Medido aparte, con `pw_mover4.mjs`, el arrastre mueve y guarda —volqué
> el plano entero antes y después, y el `PUT 200`—.

### Los choques preexistentes se siguen viendo (`nu2-13-plano.png`, `nu2-15-vender.png`)

```
PLANO   rótulos: PUN-06 PUN-08 PUN-10 🏷️ IMP-08 ×2 🏷️ 🏷️ IMP-10 ×2 🏷️ 🏷️ IMP-08 ×2 …
PLANO   en rojo: ["IMP-08 ×2","IMP-10 ×2","IMP-08 ×2","IMP-10 ×2"]
VENDER  con data-choque: ["IMP-08×2 [×2]","IMP-08×2 [×2]","IMP-10×2 [×2]","IMP-10×2 [×2]"]
```

Y en un plano sano el panel dice *«El plano está limpio: sin dos muebles llamados igual, sin
muebles encimados y con pasillos por donde se puede caminar.»*

### Los tres caminos de renombre — los tres rechazan, los tres dicen quién lo tiene

| Camino | Lo que dice la pantalla | Servidor |
|---|---|---|
| **Doble clic** sobre la caja (`nu2-08`) | *«PUN-08» ya lo tiene otro mueble de esta sede (Punta Góndola). …* + botón **«Intercambiar con ese mueble»** | sin cambios |
| **Campo del panel** del plano 2D (`nu2-10`) | *No se guardó: «PUN-10» ya lo tiene otro mueble de esta sede (Punta Góndola). … **Sigue llamándose «PUN-06».*** | sin cambios |
| **Panel del editor 3D** (`nu2-12`) | el mismo texto, palabra por palabra, con el mismo intercambio | sin cambios |

Y el intercambio deja los dos cambiados, contra `GET`:
`pun6=PUN-06 pun8=PUN-08 → pun6=PUN-08 pun8=PUN-06` (desde el doble clic) y
`pun6=PUN-06 pun10=PUN-10 → pun6=PUN-10 pun10=PUN-06` (desde el 3D).

### La pantalla de renumeración

- **El previo** (`nu2-03`): se pide, se lee, **no escribe**, y el estado queda *«PREVIO HECHO,
  SIN APLICAR»*.
- **El papel A4** (`nu2-05-papel-1…4`): a 794 px de ancho, `@media print` deja
  `{"botones":0,"selects":0,"fijos":0}` — **ni un control en el papel** —, 5 hojas, y el cuerpo
  no desborda (ancho 794 = ventana 794).
- **El alcance** (`nu2-21`): «Todas las sedes» + las seis; ITAGUÍ → *«Nada que aplicar»*;
  NAVE → *«Aplicar: renombrar 20 muebles»* con la tabla completa (CORRIDA · ANTES · SE LEÍA ·
  AHORA · CAMBIA · X · Z · MUEBLE) y su encabezado de cuentas (21/21, 0 se agregan, 0 se borran,
  20 cambian, 1 queda igual).
- **Aplicar** (`nu2-04`, `nu2-06`): *«Aplicado. Los nombres de abajo ya son los del sistema. Los
  espacios, sus contratos y las confirmaciones de montaje se mudaron con su mueble, todo dentro
  de una misma transacción. Falta la tienda: imprimí esto y cambiá la cartelería.»* Y en
  Supervisar los cuatro contratos aparecen sobre los nombres nuevos (`PUN-01`, `IMP-01`,
  `IMP-02`, `IMP-06`) con su canon de $1.210.000.

### La planilla, vender de a uno y las fechas del CSV

- **Los avisos de la fase 12 siguen enteros** sobre un plano sin renumerar (`nu2-40`): la fila
  `CIUDAD JARDIN-IMP-12` entra en ámbar con los dos avisos del choque doble, la de
  `CIUDAD JARDIN-IMP-08` con el suyo, y **cada mensaje se lee entero**
  (`elementos con texto recortado por CSS: []`). Se guardan los 4.
- **La planilla resuelve por el nombre** sobre el plano ya renumerado (`nu2-41`, `nu2-42`):
  `IMP-04` (corto) y `CIUDAD JARDIN-IMP-05` (completo) entran los dos, **sin un solo aviso de
  ambigüedad**: ya no hay dos nombres con los que ser ambiguo.
- **Vender de a uno desde el mapa** (`nu2-18`, `nu2-19`): se tocó `IMP-07` en el mapa renumerado,
  se completó el formulario y se apretó **Guardar contrato y avisar** → *«Contrato guardado»*
  (con el aviso honesto de que el correo no está configurado en este entorno).
- **Las fechas del CSV** (`nu2-43`): `01/03/2026` se lee **1 de marzo** —`1 mar → 30 jun · 122d`—.
  La F4 de la fase 12 sigue cerrada.

---

## Hallazgos

### V3 — En el papel, la columna CORRIDA puede meter una caja adentro de un pasillo *(cosmético, SIGUE ABIERTO)*

Re-medido esta ronda, sin cambios. En NAVE la caja de `x = 5,80` queda en la **banda 3** —la de
la corrida de góndolas de `x = 6,00`— porque 0,20 m ≤ `TOLERANCIA_BANDA` (0,6 m), mientras sus
tres hermanas quedan en las bandas 1, 2 y 4:

```
    2  CAJ-08  …  CAJ-02   4.40   19.50  Caja
    3  PUN-90  …  PUN-01   6.00    2.00  Punta de Gondola
    3  GON-50 · GON-51 · GON-52 · PUN-95        (la corrida)
    3  CAJ-07  …  CAJ-03   5.80   19.50  Caja      ← ésta
    4  CAJ-06  …  CAJ-04   7.20   19.50  Caja
```

**La numeración es correcta igual** —`CAJ-01…CAJ-04` de izquierda a derecha, que es como se
caminan—, sólo el número de corrida del papel confunde.

### W1 (nuevo) — El 409 puede nombrar a un mueble por un texto que ninguna pantalla dibuja *(menor, y es el residuo de V2)*

`layout_lookup._como_se_ven` nombra a los muebles «por el nombre que el plano dibuja hoy», y para
eso usa el `nombre_de_mueble` **del servidor**, que sigue siendo `nomenclatura || code`. Pero
desde la fase 13 la pantalla dibuja **sólo el `code`**
(`utils/nomenclatura.ts: nombreDeMueble(m) { return m.code; }`). En un plano que todavía tiene
`nomenclatura` los dos no coinciden — y ése es el único plano en el que este 409 puede dispararse
desde la pantalla.

Medido, en la misma corrida de V2 (`capturas/nu2-31-v2-rechazo.png` y
`nu2-35-v2-nombre-que-no-se-dibuja.png`):

```
el servidor dice:   … el que hoy se llama «CARTEL VIEJO» (Impulsador Marca)
                    y el que hoy se llama «PUN-08» (Punta Góndola).
la pantalla dibuja: PUN-06 · CARTEL VIEJO · PUN-10   (los impulsadores, a ese zoom, 🏷️)
Supervisar lista:   … IMP-09 …        ¿aparece «CARTEL VIEJO» en alguna pantalla? false
```

O sea: la caja que en el plano dice **CARTEL VIEJO** es una **punta** —es la que se está
renombrando, todavía sin subir—, y el mensaje llama «CARTEL VIEJO» a un **impulsador** que la
pantalla nunca dibujó así; y llama «PUN-08» a la punta que en ese momento ya no se lee «PUN-08».
Se lee invertido.

**Qué lo salva hoy y por qué igual lo anoto:** el rótulo entre paréntesis («Impulsador Marca» /
«Punta Góndola») es el único dato que sí desempata, y el texto puede coincidir con lo que dice el
cartel físico. Pero es la misma clase de confusión que V2 venía a arreglar, y aparece en el único
estado en que este 409 se ve por pantalla — que es el estado en que va a estar producción el día
del despliegue. El remedio parece de una línea: nombrar por el `code` (o por los dos, «el que el
plano dibuja «IMP-09»») en vez de por el nombre dibujado del servidor.

### W2 (nuevo) — El `logger.info` del rechazo no sale por ningún lado *(menor, pero desmiente una compensación declarada)*

`routers/layout.py:663` anota el rechazo con `logger.info(...)` y el comentario de al lado dice
que los `id` internos «no van en el mensaje pero el rechazo sí queda en el registro del
servidor». El informe del constructor lo declara más fuerte: *«los ids quedan en el log del
servidor»*. **Las dos cosas son falsas:**

1. lo que se registra es `" · ".join(choques)`, o sea **las mismas frases sin `id`** que ve el
   usuario: en el log no queda ni un `id`;
2. y ni eso sale. No hay `logging.basicConfig` ni `dictConfig` en ningún lado de `backend/app/`
   (`grep -rn "basicConfig\|dictConfig\|logging.config\|setLevel" app/` → nada), así que bajo
   uvicorn el logger `app.routers.layout` no tiene handler. Lo verifiqué: forcé tres 409 con el
   servidor en `--log-level info` y en `back.log` quedan las tres líneas de acceso
   `PUT … 409 Conflict` y **cero** del rechazo (`grep -ci "repetid\|rechaz" back.log` → 0).

No es un problema de datos ni de pantalla: es que la vía de soporte que el arreglo dice haber
dejado a cambio de sacar los `id` **no existe**.

### F1 del frontend — CONFIRMADO, y es peor de lo que dice *(una línea, fuera de los archivos del constructor)*

`src/pages/DashboardView.tsx:322` mete `entry.fixture.nomenclatura ?? ""` en la bolsa de la
búsqueda de Supervisar. El constructor lo declaró diciendo que «después de renumerar ese campo no
existe, así que buscar por lo que dice el cartel no encuentra nada». Medido por pantalla sobre el
plano renumerado (`nu2-32-f1-buscar-IMP-08.png`), es un grado peor: buscar `IMP-08` **sí devuelve
una fila**, pero la del mueble que **hoy** se llama `IMP-08`, no la de `imp12`, que es el que
tiene el cartel que dice `IMP-08` y el contrato de CASA LUKER encima.

```
buscando «IMP-08»
CÓDIGO   TIPO                   PROVEEDOR  ESTADO
IMP-08   Impulsador de marca    —          Libre     ← el mueble equivocado, y sale como libre
```

Quien busque por lo que dice el cartel se para frente al mueble equivocado — el mismo error que
la fase 13 eliminó en la planilla, todavía vivo en el buscador. El remedio que el constructor
dejó escrito (`nombreAnterior(entry.fixture) ?? ""`) es el correcto.

### Detalles de redacción, para quien pase después

- **La pista cuenta muebles que ya no están.** Si un nombre lo llevaban dos muebles y uno se
  borró del plano después de renumerar, la frase queda *«…«IMP-17» lo llevaban 2 muebles, que
  ahora se llaman «IMP-03». Escribí el que corresponda.»* — dice dos y nombra uno. Se lee como un
  error de la aplicación. Medido en `/tmp/nu2/v5.py`.
- **`frontend/src/types/fixtures.ts:402`** sigue documentando `nombreAnterior` como «antes de la
  **última** renumeración» y el servidor devuelve el **origen**. Con una sola corrida dicen lo
  mismo; con dos, no. El propio constructor de backend lo dejó anotado.
- **F3 del frontend**: el panel del editor 3D no dibuja el nombre viejo (el plano 2D sí). No es
  regresión —nunca lo mostró—; lo confirmo.

### V5 — Dos muebles con el mismo código ya no se distinguen en el rótulo *(observación, no defecto)*

Sin cambios respecto de la ronda 1. Si dos muebles comparten `code`, los dos rótulos son
idénticos (`IMP-08×2` y `IMP-08×2`): no hay un segundo dato con el que distinguirlos, porque el
modelo nuevo tiene uno solo. **Es correcto y es el punto de la fase**; el aviso rojo `×2` sigue
en las dos cajas, en el plano y en Vender, y «Revisar» los nombra con el enlace a Renumerar.

### Lo que NO verifiqué

- **Contra los planos de producción**: no están en el repo. Todo lo de arriba corre contra seis
  planos que armé yo. La tabla `renumeracion_nombres` se crea sola en el arranque y arranca
  vacía; en un plano que nunca se renumeró la reconciliación sigue saliendo de la `nomenclatura`,
  como hoy. **Hay que correr el previo contra la base real y leer el informe sede por sede antes
  de aplicar.**
- **Los enlaces firmados de montaje ya emitidos**: siguen rompiéndose con la renumeración (el
  código va dentro del token firmado, `auth.py:337`). Sin cambios desde la fase 12.
- **Los correos**: `smtp_listo: false` en este entorno, y la app lo dice en pantalla. No cambió.
- **Varias sedes rechazadas a la vez** en el panel de `SyncStatus`: lo probé con una.
- **`docs/ESTADO.md`**: sigue desactualizado. Lo volví a comprobar: las líneas 1841, 2868 y 4429
  siguen describiendo el modelo de dos nombres («la nomenclatura… lo reemplaza en pantalla»,
  «renombrar escribe `nomenclatura`»). **Falta antes del PR**, fuera de este encargo; el
  constructor de backend dejó el párrafo listo para pegar en `fase13-fix-backend.md`.
- **Los once archivos de prueba de la plataforma no se aíslan entre sí** cuando se corren por
  partes: es previo a esta rama y el constructor lo midió sobre HEAD. Corriendo la suite **entera
  de una vez**, que es como la corrí, no se manifiesta: exit 0.

---

## Higiene

- Procesos: al empezar no había huérfanos. Al terminar, backend **8127** y vite **5827** muertos
  por patrón acotado (`[u]vicorn.*port 8127`, `[v]ite --port 5827`), nunca `pkill -f uvicorn` a
  secas. `ss -lnt` sin nada escuchando en 8127 ni 5827. **`ps` después de `npm run probar`:
  ningún proceso vivo** — las pruebas no dejan nada corriendo.
- Bases: `/tmp/nu2/nu.db` borrada. `find` sobre `/tmp/re-nom` no encuentra un solo `.db`,
  `.sqlite`, `.sqlite3` ni `.pid`. `TMPDIR=/tmp/pt-verif-nu2` para la suite y `/tmp/nu2/tmp` para
  los servidores, los dos borrados: ni pytest ni los servidores escribieron dentro del repo.
  `frontend/dist/` (de `npm run build`) borrado al terminar.
- Playwright con `executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Sin
  librerías nuevas, sin `npm install`, **sin commit ni push**.
- El árbol quedó con exactamente los mismos 28 archivos modificados y los mismos archivos nuevos
  que traía, más las capturas `nu2-*.png` y este informe.

## Índice de capturas de la ronda 2

| Archivo | Qué muestra |
|---|---|
| `nu2-30-v1-reconciliacion-antes / -despues / -despues2` | **V1**: la lista antes de renumerar, después, y después de la SEGUNDA renumeración |
| `nu2-34-panel-nombre-viejo` | **V1**: «Antes se llamaba «PUN-06»…» en el panel del mueble |
| `nu2-31-v2-rechazo` | **V2**: el chip «Rechazado por el servidor» y el panel abierto con la frase entera |
| `nu2-35-v2-nombre-que-no-se-dibuja` | **W1**: Supervisar lista `IMP-09`, nunca «CARTEL VIEJO» |
| `nu2-33-planilla-viejo-revision / -revision-full` | **V4**: la planilla vieja y la pista, en pantalla |
| `nu2-33-planilla-antes-*` | los cuatro contratos del dueño, cargados por la pantalla de Planilla |
| `nu2-32-f1-buscar-IMP-08` | **F1**: el buscador de Supervisar devuelve el mueble equivocado |
| `nu2-01-entrada`, `nu2-03-previo`, `nu2-04-aplicado`, `nu2-06-supervisar` | la pantalla de renumeración de punta a punta |
| `nu2-05-papel-1…4` | el informe en A4, sin un solo control |
| `nu2-21-alcance-ITAGUI / -NAVE` | el alcance, y «Nada que aplicar» donde no hay nada que aplicar |
| `nu2-08-dobleclic-rechazo`, `nu2-09-intercambio`, `nu2-10-panel-rechazo`, `nu2-11-3d`, `nu2-12-3d-rechazo` | los tres caminos de renombre y el intercambio |
| `nu2-13-plano`, `nu2-14-revisar`, `nu2-15-vender`, `nu2-16-roto-guardado`, `nu2-36-roto-movido` | el plano roto: se ve, se revisa, se mueve y se guarda |
| `nu2-40…nu2-43` (planilla) | los avisos de la fase 12, por código, por nombre corto, y las fechas del CSV |
| `nu2-18-vender-uno`, `nu2-19-vender-guardado` | vender de a uno desde el mapa renumerado |
