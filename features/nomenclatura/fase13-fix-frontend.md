# Fase 13, los dos huecos del frontend: el rechazo que se leía «Sin conexión» y la reconciliación después de renumerar

**Frontend. RECABRA · 2026-09-09 · rama `claude/fase-13-nombre-unico` en `/tmp/re-nom`.**
No se tocó una línea de `backend/**`. Todo lo de abajo está medido **por la pantalla real**
(Playwright, sesión de administrador) con la app levantada en puertos propios —backend
**8121**, vite **5821**—, base SQLite en `/tmp/f13ff/f13ff.db` y `TMPDIR` fuera del repo.
Capturas: `capturas/f13f-*.png` (4).

---

## Lo que cambió, en una tabla

| | Antes | Ahora |
|---|---|---|
| El `409 nombres_repetidos` del guardarraíl | chip **«Sin conexión»** en rojo con la nube tachada, y el mensaje verdadero **sólo en el `title=`** | chip **«Rechazado por el servidor»** y un panel abierto con la frase del servidor y sus choques, uno por uno |
| Dónde vive ese estado | `syncState: "error"`, que es el mismo de «no se pudo hablar con el servidor» y que el primer pull posterior borraba | `rechazos[sede]`, aparte y por sede, con `code`, `message` y `choques` |
| «Sin conexión» | significaba dos cosas | significa una: no se pudo hablar con el servidor (medido, §1) |
| La reconciliación después de renumerar | vacía: la `nomenclatura` la borra la renumeración y `nombreAnterior` no lo escribía nadie | lista los 4 contratos con el nombre viejo y el nuevo (§2) |
| Buscar en el plano por el nombre del cartel, después de renumerar | **0 resultados** | encuentra el mueble (medido con el arreglo puesto y sacado, §2.3) |

---

## 1. V2 — el rechazo por regla se ve como lo que es

**El bicho.** `fixtureStore` atrapaba bien el `detail.code === "nombres_repetidos"` y guardaba
el mensaje en `syncState: "error"`, y `SyncStatus` pinta ese estado **«Sin conexión»**, en
rojo, con la nube tachada. Hay conexión, el servidor contestó, no escribió nada y contestó una
cosa accionable —qué nombre y en qué muebles—, y la pantalla mandaba a revisar el wifi.

**Por qué no alcanzaba con cambiar la etiqueta.** `syncState` es un solo campo y lo pisa
cualquier operación posterior: el primer pull que entrara —y entra uno cada 20 s— lo devolvía a
`idle` y el motivo desaparecía sin que nada hubiera cambiado. El rechazo tiene que durar lo que
dura el problema, que es hasta que alguien corrija el nombre.

**La forma es la que el sistema ya usa para esto**, y por eso no hay un patrón nuevo:

- **Como el conflicto entre equipos** (`conflicts` en el mismo componente): un mapa **por sede**
  (`rechazos: Record<string, RechazoDelServidor>`, `fixtureStore.ts:235`), el chip lo mira
  directamente —no a través de `syncState`— y el panel se abre solo, sin que haya que ir a
  buscar un tooltip con el mouse.
- **Como el bloqueo de la renumeración** (`Renumerar.tsx`, que lista `detail.motivos`) y como el
  rechazo de un renombre en el panel del mueble: se muestran **las frases del servidor**, una
  por renglón, sin reescribirlas. El servidor ya las escribe para leerse.
- **Sin botón**, a propósito. Forzar volvería a pasar por la misma comprobación y volvería a
  fallar: ofrecer «Conservar la mía» acá sería un lazo. Lo que destraba esto es corregir el
  nombre en el plano, y entonces el guardado pendiente entra solo — está medido abajo.

El chip usa el **mismo triángulo** que el conflicto y el color de peligro, porque es la misma
clase de cosa: algo que hay que resolver, no algo que se arregle solo. La nube tachada queda
donde corresponde: para cuando de verdad no hay servidor.

**Medido, por la pantalla** (`capturas/f13f-01-rechazo-servidor.png`). Sede sembrada con una
`nomenclatura` de texto libre (`Z9-B`), que es el único estado en el que el navegador y el
servidor no miran lo mismo —y el que va a tener producción el día del despliegue—; se renombra
otro mueble a ese texto desde el campo del panel:

```
CHIP (arriba y en la barra del plano):  «Rechazado por el servidor» · «⚠ Rechazado por el servidor»
PANEL  aria-label="El servidor rechazó el guardado"
  El servidor no guardó el plano
  Este guardado dejaría nombres repetidos en «CIUDAD JARDIN» que antes no estaban.
   · «Z9-B» quedaría como nombre de 2 muebles de la sede: el que hoy se llama «PUN-02»
     (Punta de Gondola) y el que hoy se llama «Z9-B» (Impulsador Marca). Dos muebles con el
     mismo nombre no se distinguen en el plano ni en un contrato.
  No se escribió nada en el servidor y el cambio sigue en esta computadora, sin subir.
  Corregí el nombre en el plano y se guarda solo.
SERVIDOR: pun8=PUN-02  (intacto)
```

Y el ciclo entero, que es lo que hace que la frase del pie sea verdad y no una promesa:

```
1 · tras el rechazo          → ["Rechazado por el servidor","⚠ Rechazado por el servidor"] + panel
2 · tras sincronizar a mano  → ["Rechazado por el servidor","⚠ Rechazado por el servidor"] + panel
      (un pull nuevo NO lo tapa: antes lo borraba)
3 · con el nombre corregido  → ["Sincronizado","✓ Sincronizado"] · sin panel
      SERVIDOR: pun8=PUN-09   (el guardado pendiente entró solo)
```

**Y «Sin conexión» sigue siendo «Sin conexión»**, que es la otra mitad de la corrección. Con el
`PUT` cortado a nivel de red (`route.abort('connectionfailed')`) y todo lo demás andando:

```
CON EL GUARDADO CORTADO ->  ["Sin conexión","Sin conexión"]   paneles: []
```

**Tras recargar la pestaña** el rechazo no se guarda en `localStorage` a propósito —es de un
guardado de esta sesión—: el chip dice `Cambios sin subir`, que es cierto, y el motivo vuelve
entero en cuanto el sondeo reintenta el guardado. Medido: `["Cambios sin subir"]` al recargar y
`["Rechazado por el servidor"]` + panel 24 s después.

---

## 2. V1 — la reconciliación sigue viva después de renumerar

### 2.1 El contrato del backend no fue el que yo supuse, y programé contra el que hay

El encargo decía que el backend construía la memoria «probablemente una tabla propia … expuesta
por la API» y que leyera `fase13-fix-backend.md` **cuando exista**. No existe todavía, así que
fui al código del backend, que es lo otro que el encargo pedía. Lo que hay:

- **La tabla existe**: `renumeracion_nombres` (`backend/app/models/models.py:106`), una fila por
  mueble y por renumeración, con `nombre_anterior` = **lo que el plano dibujaba** (la
  `nomenclatura` escrita a mano si la había, el código si no).
- **No hay endpoint nuevo.** El servidor la **proyecta sobre la lectura del plano**:
  `_con_nombre_viejo` (`backend/app/routers/layout.py:179`) agrega `nombreAnterior` a cada mueble
  que se llamaba distinto, en `GET /layout/`, `GET /layout/{sede}` y en la respuesta del `PUT`; y
  `_sin_nombre_viejo` (`:203`) lo saca de lo que llega a guardarse.

Eso es mejor que un endpoint aparte y hace que **el frontend no necesite pedir nada**: el
recuerdo baja con el mueble, por `id`, y el editor no puede escribirlo aunque lo devuelva.
Llegué a escribir el cliente del endpoint que suponía —`fetchRenombres`, con su lector
tolerante y su índice por sede— y lo **saqué entero** cuando vi el código del servidor:
`api/layout.ts` quedó exactamente como lo dejó la pantalla de renumeración, y el store no
guarda ninguna memoria propia. Programar contra un contrato que no existe habría dejado dos
`404` por pestaña y un camino muerto.

### 2.2 Qué faltaba entonces, y qué se conectó

`nombreAnterior` (`utils/nomenclatura.ts:159`) ya leía `mueble.nombreAnterior ?? mueble.nomenclatura`:
con el campo llegando de verdad, **la reconciliación vuelve sola**. Lo comprobé antes de tocar
nada y lo dejo escrito porque es la mitad honesta del hallazgo: el hueco de V1 lo cerró el
backend. Lo que hice acá es lo que faltaba de este lado:

1. **Dejar escrito de dónde sale el recuerdo**, que era justo lo que estaba mal en el archivo:
   el comentario decía «lo escribe la renumeración del servidor» —y el verificador comprobó que
   no lo escribía nadie—. Ahora dice qué es: una **proyección de sólo lectura** del registro de
   renumeraciones, con el nombre **dibujado** y, de varias renumeraciones, la punta más vieja
   (que es la que dice el papel). Lo mismo en `utils/revision.ts`, donde
   `ContratoDelPlano.nombreAnterior` seguía diciendo que salía de la `nomenclatura`.
2. **El buscador del plano, que sí estaba roto.** `matchesQuery` (`FloorPlan2D.tsx:233`) buscaba
   por `item.nomenclatura`, que después de renumerar **no existe**: quien camina la tienda con la
   cartelería vieja en la mano y escribe «IMP-08» no encontraba nada. Ahora busca por
   `nombreAnterior(item)`, que es la misma función que usa la reconciliación y el panel — un solo
   lugar donde está escrito qué es «el nombre viejo», que es la regla de este archivo.
3. **Cubrirlo con pruebas** para que no se pueda volver a apagar sin que algo falle (§3).

### 2.3 Medido, por la pantalla, sobre un plano renumerado de verdad

Se sembró CIUDAD JARDIN con el caso del dueño (14 muebles, seis nombres a mano), se cargaron 4
contratos por `POST /leases/bulk/confirmar`, se escribió el estado comercial en el plano —que es
lo que hace la pantalla de Planilla— y se aplicó `POST /layout/renumeracion/aplicar` **de
verdad**, no simulado. El informe del servidor, textual, para el mueble del caso:

```
imp12   antes=IMP-12   se_leia=IMP-08   ahora=IMP-06
```

**«Contratos para revisar uno por uno», después de renumerar**
(`capturas/f13f-02-reconciliacion.png`):

```
4 contratos vigentes sobre muebles que hoy se llaman distinto de como se llamaban cuando se
negociaron. El papel y el cartel de la góndola dicen el nombre viejo; el plano dice el de ahora.

CIUDAD JARDIN-IMP-01 · se negoció como «IMP-07»   POSTOBON · BEBIDAS
CIUDAD JARDIN-IMP-02 · se negoció como «IMP-08»   COLGATE · ASEO
CIUDAD JARDIN-IMP-06 · se negoció como «IMP-08»   CASA LUKER · ASEO
CIUDAD JARDIN-PUN-01 · se negoció como «PUN-06»   QUALA · ALIMENTOS
```

Los tres primeros con su aviso en rojo («hoy es el nombre de OTRO mueble»). **CASA LUKER —el
contrato que se negoció mirando el cartel «IMP-08» sobre el mueble cuyo código era `IMP-12`—
aparece con el nombre viejo que decía el CARTEL, no con el código viejo.** Eso es lo que hace
que la lista sirva con el papel en la mano.

**El panel del mueble** (`capturas/f13f-04-panel-nombre-viejo.png`):

```
NOMBRE  PUN-01
Antes se llamaba «PUN-06». Es lo que puede seguir diciendo el cartel de la góndola y lo que
vio quien negoció lo que ya está contratado.
```

**El buscador, con el arreglo puesto y sacado**, sobre el mismo plano renumerado
(`capturas/f13f-03-buscar-nombre-viejo.png`). Se cuenta cuántos muebles quedan encendidos:

| Se busca | Sin el arreglo | Con el arreglo |
|---|---|---|
| `P1-A` — sólo es el nombre viejo de `imp9` (hoy IMP-03) | **0** | **1** |
| `IMP-08` — código de `imp14` **y** nombre viejo de `imp8` e `imp12` | **1** | **3** |
| `PUN-06` — nombre viejo de `pun6` (hoy PUN-01) | **0** | **1** |
| `IMP-99` — no lo tiene nadie | 0 | 0 |

---

## 3. Las pruebas

**`probar:revision` cubre la reconciliación DESPUÉS de renumerar, no sólo antes** (punto 3 del
encargo). Seis pruebas nuevas, y el plano de prueba está armado **como lo entrega el servidor**:
códigos nuevos, `nomenclatura` borrada y `nombreAnterior` con el nombre que el plano dibujaba.
El script ahora arma también el bundle de `nomenclatura.ts`, porque el hueco no estaba en
ninguna de las dos piezas por separado —estaba en el paso de una a la otra—, así que la prueba
recorre el camino entero: mueble como lo manda el servidor → `nombreAnterior` → la lista.

```
revisión · la reconciliación DESPUÉS de renumerar
  ok   DESPUÉS DE RENUMERAR, EL CONTRATO SIGUE EN LA LISTA, CON LOS DOS NOMBRES
  ok   sin el recuerdo del servidor, la misma pantalla no lista NADA
  ok   ninguno de los contratos vigentes de la sede se queda afuera
  ok   un mueble que la renumeración dejó como estaba no aparece
  ok   con DOS renumeraciones encima, el papel más viejo sigue valiendo
  ok   un contrato vencido tampoco se lista después de renumerar
```

La segunda es la que sostiene a las otras: con el mismo plano y el mismo contrato pero sin
`nombreAnterior`, la lista queda vacía. Si mañana alguien deja de leer el campo, esa prueba
falla y dice por qué.

En `probar:nomenclatura`, la prueba del nombre viejo pasó a describir **el mueble como llega
después de renumerar** —sin `nomenclatura`, con `nombreAnterior`— y afirma lo que más importa:
que el recuerdo es el nombre que el plano **dibujaba** («IMP-08»), no el código viejo
(«IMP-12»). El conteo del script no cambia: una prueba reemplazó a otra.

---

## 4. Qué se tocó

| Archivo | Qué |
|---|---|
| `src/store/fixtureStore.ts` | `RechazoDelServidor` y el mapa `rechazos` por sede (`:186`, `:235`); el `409 nombres_repetidos` lo escribe ahí y ya no en `syncState: "error"` (`:789`); se limpia al guardar bien, al borrar la sede y al cambiar de cliente |
| `src/components/SyncStatus/SyncStatus.tsx` | El chip «Rechazado por el servidor» (`:97`) y el bloque del panel con las frases del servidor, arriba del de conflictos |
| `src/components/FloorPlan2D/FloorPlan2D.tsx` | El chip de la barra del plano, que decía «Sin conexión» por lo mismo (`:2981`); el buscador por el nombre viejo (`:233`); comentarios del panel del mueble y de la reconciliación |
| `src/utils/nomenclatura.ts` | `nombreAnterior`: de dónde sale de verdad el recuerdo, escrito entero (`:159`). La función no cambió de firma ni de resultado |
| `src/utils/revision.ts` | Lo mismo en `ContratoDelPlano.nombreAnterior` y en `contratosConNombreAjeno`: por qué la lista se apagaba al renumerar y qué la sostiene ahora |
| `scripts/probar-revision.mjs` | La sección nueva: 6 pruebas de la reconciliación después de renumerar. 30 → **36** |
| `scripts/probar-nomenclatura.mjs` | La prueba del nombre viejo, reescrita sobre el mueble renumerado. **40** (igual) |

`src/api/layout.ts` quedó **sin tocar** (ver §2.1). `backend/**` sin tocar.

---

## 5. Verificación

| | |
|---|---|
| `cd frontend && npx tsc --noEmit` | **exit 0** |
| `npm run probar:revision` | **exit 0 — 36 pruebas** (eran 30) |
| `npm run probar:nomenclatura` | **exit 0 — 40 pruebas** |
| `npm run probar:tema` | **exit 0 — 24 pruebas** (toqué dos `.tsx` que este script recorre) |
| `npm run probar:vender` | **exit 0 — 12 pruebas** (ídem) |
| Pantalla: el rechazo, el pull que no lo tapa, el nombre corregido, «Sin conexión» | **PASA** (§1) |
| Pantalla: la reconciliación, el panel del mueble y el buscador sobre un plano renumerado de verdad | **PASA** (§2.3) |

**No se corrió** la suite del backend (no toqué `backend/**`), ni el resto de los `probar:*`, ni
`npm run build`, como pide la regla de verificación del encargo.

**Higiene.** Puertos propios y exclusivos: backend `8121`, vite `5821`, apagados al terminar por
patrón acotado (`[u]vicorn.*port 8121`, `[v]ite --port 5821`), nunca `pkill -f uvicorn` a secas.
Base SQLite en `/tmp/f13ff/f13ff.db` y `TMPDIR=/tmp/f13ff/tmp`, los dos fuera del repo y
borrados al terminar; `find` sobre `/tmp/re-nom` no encuentra un `.db`, un `.sqlite` ni un
`.pid`. Playwright con `executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Sin
librerías nuevas, sin `npm install`, **sin commit ni push**. Arnés en `/tmp/f13ff/` (fuera del
repo): `run_back.sh`, `run_vite.sh`, `seed.py`, `contratos.py`, `renumerar.py`, `comercial.py`,
`lib.mjs` y los seis `pw_*.mjs`.

---

## 6. Lo que queda abierto

### F1 — El buscador de **Supervisar** todavía busca por la `nomenclatura` *(una línea, fuera de mis archivos)*

`src/pages/DashboardView.tsx:322` mete `entry.fixture.nomenclatura ?? ""` en la bolsa de la
búsqueda. Es el mismo agujero que arreglé en el plano: después de renumerar ese campo no
existe, así que buscar por lo que dice el cartel de la góndola no encuentra nada. El arreglo es
cambiar esa línea por `nombreAnterior(entry.fixture) ?? ""` e importar la función de
`utils/nomenclatura`. No lo toqué porque `src/pages/**` no está en mis archivos; queda medido y
con el remedio escrito.

### F2 — Una sede rechazada deja de sondear al servidor *(preexistente, no lo introduje)*

`pollForChanges` no baja nada mientras alguna sede esté sucia: reintenta el guardado y vuelve.
Con un rechazo que nadie corrige, esa pestaña deja de enterarse de lo que hagan los demás
equipos. Antes pasaba igual (con «Sin conexión» puesto), sólo que sin explicación; ahora al
menos la pantalla dice qué hay que arreglar para destrabarlo. Arreglarlo de verdad es dejar que
el sondeo siga aunque haya sedes sucias, y eso toca la política de sincronización entera: no es
de este encargo.

### F3 — El editor 3D no muestra el nombre viejo

`StoreEditor3D` arrastra `nombreAnterior` sin tocarlo (bien) pero su panel no lo dibuja: el
«Antes se llamaba …» existe sólo en el plano 2D. No es una regresión —nunca lo mostró— y no lo
agregué para no meter pantalla nueva en un encargo de arreglos.

### Lo que NO verifiqué

- **Con dos renumeraciones encima**, sólo por prueba de unidad: el servidor promete devolver la
  punta más vieja de la cadena (`nombres_anteriores`, con su porqué escrito) y `probar:revision`
  cubre el caso desde el lado del navegador, pero no lo corrí dos veces contra la base.
- **Varias sedes rechazadas a la vez.** El panel las lista por separado y pone el nombre de la
  sede arriba de cada una cuando hay más de una; lo probé con una sola sede sembrada.
- **La pantalla de renumeración y el papel**: no los toqué y no volví a medirlos.
