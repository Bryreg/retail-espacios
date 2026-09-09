# La pantalla con la que el dueño renumera sus sedes

**Fase 13 · RECABRA · 2026-09-08 · rama `claude/fase-13-nombre-unico`.**
La pantalla. No se tocó una línea de `backend/**`, ni `utils/nomenclatura.ts`, ni
`utils/revision.ts`, ni los dos editores más allá del botón de entrada.

El backend ya sabe renumerar y el frontend ya tiene un solo nombre. Faltaba lo único que
separa al dueño de tener el plano y la tienda hablando el mismo idioma: **la pantalla donde
mira el antes → después, lo imprime, camina la tienda con el papel y recién entonces
aplica.**

Todo lo de abajo está medido **por la pantalla real** con Playwright, con la app levantada
en puertos propios (backend `8114`, vite `5714`, base SQLite fuera del repo). El papel no
está mirado: está **impreso** — `page.pdf({format:'A4'})` y las tres hojas rasterizadas,
`capturas/f13p-03-papel-*.png`.

---

## 1. Dónde vive, y por qué ahí

**Se entra desde donde vive la higiene del plano**, que es lo que pedía el encargo: el botón
**«Renumerar»** de la barra del plano 2D, **pegado a «Revisar»** (medido: `Revisar` en la
posición 25 de la barra, `Renumerar` en la 26), y una salida al pie del panel de «Revisar
antes de negociar» (`capturas/f13p-01-entrada.png`):

```
Renumerar el plano →
El sistema reasigna los nombres siguiendo el recorrido de la tienda, en todas las sedes.
Primero muestra el antes → después completo, imprimible, y no escribe nada hasta que se
aprueba.
```

Las dos entradas son de administrador. Medido con una sesión worker: **el botón no está en
la barra** (0 apariciones) y la ruta abierta a mano contesta *«Renumerar cambia el nombre de
cada mueble de cada sede y mueve con él los contratos y los montajes. Es de administrador.»*
(`capturas/f13p-08-worker.png`). El backend además la rechaza con 403, así que la regla no
vive sólo en el navegador.

**Y es una ruta propia (`/renumerar`), no un panel del plano.** No es una preferencia de
arquitectura, es la consecuencia de para qué sirve: la mitad del valor está en el papel. Un
panel lateral del plano vive adentro de una rejilla con `overflow: hidden` y de un
contenedor `position: fixed` — y **lo fijo no pagina**: los navegadores lo dibujan una vez,
en la primera hoja, cortado. Una página entera pagina en A4, repite la cabecera de la tabla
en cada hoja y sale sin una línea de la aplicación alrededor. La forma sigue al uso.

---

## 2. Los dos pasos

Igual que la carga masiva, y por la misma razón escrita en su propio encabezado: **una
renumeración a ciegas que sale mal no se deshace con un botón.**

| | |
|---|---|
| **Al entrar** | Sube lo que este navegador tenga pendiente (`flushPending`), vuelve a bajar el plano (`syncFromServer`) y pide `POST /api/layout/renumeracion/previo`. **No se escribe una sola fila.** La pantalla abre ya con la tabla completa: el informe ES el primer paso, no la antesala del primer paso |
| **Aplicar** | `POST /api/layout/renumeracion/aplicar`, y enseguida `syncFromServer()` otra vez |

Ese segundo `syncFromServer` **no es cortesía**: después de aplicar, el caché local del
plano todavía tiene los códigos viejos, y la primera edición que alguien haga los vuelve a
subir enteros —deshaciendo la renumeración sin que nadie apriete nada—. Además es la tercera
fuente de la cuenta (§3).

**Una sola acción principal por pantalla**, medido: `document.querySelectorAll('.btn-principal').length === 1`
en el previo y **0** después de aplicar. El botón dice qué va a hacer y cuánto —
`Aplicar: renombrar 34 muebles`— y sus tres estados deshabilitados dicen **tres cosas
distintas**, porque son tres cosas distintas:

- `No se puede aplicar` — el servidor rechazó el cálculo y no hay informe;
- `Nada que aplicar` — hay informe y no cambia nada (el plano ya está numerado);
- `Aplicando…` con el reloj.

La primera versión decía «Nada que aplicar» también cuando el servidor acababa de rechazar
el cálculo, y eso hacía creer que el plano estaba bien. Se corrigió.

**Alcance.** Un selector: todas las sedes (lo que el dueño eligió: «en todas las sedes,
parejo») o una sola. Medido que sirve para lo que sirve: con CIUDAD JARDIN bloqueada por un
espacio huérfano, «Todas» da 409 y el botón queda en `No se puede aplicar`; eligiendo
**NAVE** el previo entra y el botón vuelve a `Aplicar: renombrar 20 muebles`
(`capturas/f13p-06-bloqueado.png`, `f13p-07-alcance.png`). **Una sede rota no traba a las
otras.**

---

## 3. La promesa, escrita donde se puede comprobar

El encargo lo pide con todas las letras: *«que se vea que NO se agrega ni se borra nada… es
la promesa que se le hizo y tiene que poder comprobarla sin creernos»*.

Entonces la cuenta **no repite el número del servidor**. Se arma cruzando **tres fuentes
independientes**, y vive en `utils/renumeracion.ts` para poder probarla sola:

1. **El plano que este navegador tiene dibujado** (`fixturesBySede`, que es de donde sale el
   mapa que la persona mira), bajado por `GET /api/layout/`;
2. **los renglones del informe**, que salen del planificador de la renumeración — otro
   endpoint y otro camino de código;
3. **el plano vuelto a bajar después de aplicar**.

Y se comparan **conjuntos de `id`**, no cantidades: un mueble de más en POBLADO no puede
tapar uno de menos en NAVE. Eso está probado (`«un mueble de más en una sede no tapa uno de
menos en otra»`: los largos coinciden, `faltan` y `sobran` traen cada uno su id con la sede
adelante).

En pantalla, y en el papel, por sede y en total:

```
EN EL PLANO   EN EL INFORME   DESPUÉS   SE AGREGAN   SE BORRAN   CAMBIAN DE NOMBRE   QUEDAN IGUAL
    35             35            35         0            0              34                1
```

`DESPUÉS` dice **«—» mientras no se aplicó**: no se inventa un número que todavía no existe.
Cada cifra se pinta verde o roja según cierre, y si algo no cierra la caja entera se pone en
rojo y **lista los ids**: «no aparece en el informe: NAVE·p2», «dos muebles quedarían
llamándose PUN-01».

**Lo que no se puede afirmar, no se afirma.** Si este navegador no tiene el plano de una
sede (caché recién borrado, entrar por la barra de direcciones antes del primer pull), la
cuenta dice *«no se pudo comparar contra una segunda fuente»* en vez de gritar «se borran
21». Está probado en las dos direcciones: sin plano local un nombre repetido **sigue** siendo
un error, porque eso se puede afirmar mirando sólo el informe.

**Medido de punta a punta, y no sólo en la pantalla.** El script de aplicación baja el
layout completo antes y después y compara **campo por campo**:

```
NAVE
  conteo             : 21 → 21 IGUAL ✓
  mismo conjunto ids : SÍ ✓
  geometría intacta  : SÍ ✓ (cx, cz, w, d, rotY, type, rentable)
  códigos            : mismo conjunto (es una permutación pura)
  nomenclaturas      : 3 → 0
  códigos repetidos  : 0
CIUDAD JARDIN
  conteo             : 14 → 14 IGUAL ✓
  mismo conjunto ids : SÍ ✓
  geometría intacta  : SÍ ✓
  códigos            : CAMBIARON (IMP-07…IMP-17 → IMP-01…IMP-11)
  nomenclaturas      : 6 → 0
  códigos repetidos  : 0
```

**Idempotencia, por la pantalla:** apretar «Volver a calcular» después de aplicar da
*«No hay nada que renumerar: todos los muebles ya se llaman como el recorrido dice»*, el
botón queda en `Nada que aplicar` **deshabilitado**, y `CAMBIAN DE NOMBRE: 0`
(`capturas/f13p-05-idempotente.png`).

**Y el plano dibuja los nombres nuevos.** Volcado de los `<text>` del SVG del plano 2D de
NAVE después de aplicar, en el orden en que se camina:

```
PUN-01 · GON-01 GON-02 GON-03 · PUN-02 · CAJ-01 CAJ-02 · PUN-03 … PUN-06
```

---

## 4. El papel, que es la otra mitad

**Lo que se imprime es lo que se ve.** No hay una plantilla aparte: es la misma tabla, con
los controles escondidos en `@media print`. Una segunda plantilla sería una segunda verdad,
y el día que se desfasen el papel diría una cosa y la pantalla otra — que es exactamente la
clase de error que la fase 13 vino a matar.

Está impreso de verdad, no supuesto (`capturas/f13p-03-papel-1/2/3.png`, sacadas del PDF):

| | Medido |
|---|---|
| Tamaño | **595,9 × 842,9 pt = 210 × 297 mm**, tres hojas A4 |
| Controles | `.renum-barra` → `display: none`; **cero botones visibles** en el volcado |
| Claro siempre | fondo `rgb(255,255,255)`, tinta `rgb(10,16,20)`, con el tema **oscuro** puesto en pantalla |
| Una sede por hoja | `break-before: page` en cada `.renum-sede`, `auto` en la primera (medido en las dos) |
| Cabecera repetida | `thead` en `table-header-group`, con el renglón de la sede adentro |
| Casilla para tachar | una columna `☐` que **sólo existe en el papel** |
| Pie | `RECABRA · Renumeración del plano · APLICADO el 08 de septiembre de 2026, 11:20 p. m. · 35 muebles en 2 sedes` |

Cuatro decisiones del papel que no son cosméticas:

**El nombre de la sede va ADENTRO del `thead`.** Es la única forma de que se repita en cada
hoja. Sin eso, la página 3 de NAVE es una lista de códigos sin sede y sin columnas. En
pantalla está escondido, porque ahí el `<h3>` de arriba ya lo dice.

**El estado se imprime.** El cartel «Previo: no se escribió nada todavía» / «Aplicado» **no**
está en `renum-noimprime`, y el pie repite la palabra. Una hoja suelta que aparece en un
escritorio tres meses después tiene que distinguir «esto va a pasar» de «esto pasó». Medido
con la media de impresión puesta: el cartel sigue en `display: flex` y el pie dice
`APLICADO el …`.

**La fecha del papel aplicado es la del APLICAR, no la del cálculo.** Es la fecha en que la
tienda y el plano dejaron de decir lo mismo.

**Las corridas se marcan con un fondo alternado, no con una línea de corte.** La primera
versión ponía una línea gruesa al empezar cada corrida; en CIUDAD JARDIN —donde las bandas
son de uno o dos muebles— quedaba una línea en casi todos los renglones (separaba todo, o
sea nada) y el aire que le agregaba a cada fila **empujó el informe una hoja entera**: 3 → 4
hojas. El fondo alternado no ocupa un milímetro de alto y dice lo mismo. Volvió a 3 hojas.

Y una nota de degradación: si alguien imprime con los fondos apagados, se pierden la franja
ámbar y el sombreado de corrida, pero **no se pierde un dato**: el «sí / —» de la columna
CAMBIA, los tres nombres y el estado son texto.

### El antes → después, tal como sale

```
NAVE · 21 muebles · 20 cambian de nombre · 0 se agregan · 0 se borran
✓  CORRIDA  ANTES    SE LEÍA   AHORA    CAMBIA    X       Z      MUEBLE
☐     1     IMP-03   IMP-01    IMP-01     sí     1.00   15.00   Impulsador Marca
☐     4     PUN-06   PUN-06    PUN-01     sí     4.00    1.00   Punta de Góndola
☐     4     GON-02   GON-02    GON-01     sí     4.00    3.00   Góndola Doble
…
☐     6     CAJ-02   CAJ-02    CAJ-02     —      6.50   17.00   Caja
```

Las tres columnas de nombre dicen tres cosas distintas y las tres hacen falta: **ANTES** es
el código que tenía (el que está en los contratos), **SE LEÍA** es lo que el plano dibujaba
—la nomenclatura escrita a mano, cuando la había— y **AHORA** es el nombre único. La segunda
es la que el dueño reconoce del cartel de la góndola.

---

## 5. Cuando el servidor se niega

`409 renumeracion_bloqueada` y `500 renumeracion_invariante` **no se leen como un error de
red**: `bloqueoDeRenumeracion(err)` mira `detail.code` y la pantalla lista los motivos uno
por uno, con la frase que el servidor manda. Medido con un espacio huérfano sembrado a
propósito (`capturas/f13p-06-bloqueado.png`):

```
No se puede renumerar «CIUDAD JARDIN» sin romper algo. No se escribió nada.
 · el código CIUDAD JARDIN-IMP-01 ya lo tiene el espacio #44, que no corresponde a ningún
   mueble del plano: archivalo o borralo antes de renumerar
```

Esto importa porque `409` en este proyecto ya significa otras dos cosas (`layout_conflict`,
`layout_deleted`) y tratarlo igual habría mostrado «otro equipo guardó», que no tiene nada
que ver. Es el mismo cuidado que `fixtureStore` tomó con `nombres_repetidos`.

---

## 6. La hoja de área

`frontend/src/renumerar.css`, importada desde `index.css` al lado de `vender.css`. **Todo
cuelga de `.renum`**, así que su `@media print` no puede alcanzar a ninguna otra pantalla —
la misma condición que se le puso a Vender.

- **Cero colores propios.** Consume los tokens de `tema.css`. Para el papel redefine los
  **canales** (`--ink-1-rgb`, `--surface-rgb`, `--ocupado-txt-rgb`…) y no los derivados: como
  `tema.css` los escribe `rgb(var(--x-rgb))`, `--danger`, `--success` y `--warning` se
  recalculan solos y no hay una lista que se pueda desfasar. Es el mismo criterio que
  `IMPRESION_CLARA_VARS` de la consola, traducido a la familia del interior (el encargo
  nombraba `frontend/src/plataforma.css`, que no existe: los `--con-*` viven en `tema.css` y
  el bloque de impresión de la consola en `components/plataforma/consola.tsx`).
- **La escala `--t-*` entera.** No hay un `font-size` en píxeles en toda la hoja ni un
  `fontSize` numérico en el `.tsx`. La única excepción es el bloque de impresión, que va en
  **puntos** a propósito y con el porqué escrito: esa escala está medida para 1440 × 900 px,
  no para 186 mm de papel.
- **Claro por defecto**, como todo el interior, y **oscuro entero**: medido
  (`capturas/f13p-09-oscuro.png`) fondo `#04070A`, tinta `#EDF3F2`, un solo amarillo.
- **Responsive medido**: a 1600, 1400, 700 y **390 px** el documento **no rueda de costado**
  (`scrollWidth === clientWidth`); la tabla rueda adentro de su propia caja. A 390 px no
  pasaba: la fila de controles medía 633 px porque el grupo de la derecha no envolvía. Se
  arregló con `flex-wrap` en los dos niveles de la barra.

---

## 7. Qué se tocó

| Archivo | Qué |
|---|---|
| `src/pages/Renumerar.tsx` | **Nuevo.** La pantalla: los dos pasos, la cuenta, la tabla, los anexos, el bloqueo |
| `src/renumerar.css` | **Nuevo.** La hoja de área y todo el `@media print` |
| `src/utils/renumeracion.ts` | **Nuevo.** El contrato del servidor y la CUENTA —lo único que puede desmentirlo—, sin una sola dependencia para poder probarlo solo |
| `src/api/layout.ts` | `renumeracionPrevio`, `renumeracionAplicar` y `bloqueoDeRenumeracion` (+62 líneas, nada tocado) |
| `src/App.tsx` | La ruta `/renumerar`, con `lazy()` como todas las de adentro |
| `src/index.css` | Un `@import` |
| `src/components/FloorPlan2D/FloorPlan2D.tsx` | El botón «Renumerar» al lado de «Revisar» (sólo admin) y la salida al pie del panel de revisión. ~50 líneas; no se tocó nada del renombre ni del plano |
| `scripts/probar-renumerar.mjs` | **Nuevo.** 28 pruebas |
| `package.json` | `probar:renumerar`, encadenado en `probar` |
| `features/nomenclatura/capturas/f13p-*.png` | 12 capturas, tres de ellas hojas A4 rasterizadas del PDF |

---

## 8. Verificación

| | |
|---|---|
| `cd frontend && npx tsc --noEmit` | **exit 0** |
| `npm run probar:renumerar` *(nuevo)* | **exit 0 — 28 pruebas** |
| `npm run probar:tema` | **exit 0 — 24 pruebas** (toqué `index.css`; verifica «un solo amarillo por pantalla», que la pantalla nueva cumple) |
| `npm run probar:landing` | **exit 0 — 21 pruebas** (agregué un `.css`; verifica que la landing sigue colgando entera de `.lp`) |

**No se corrió** la suite del backend (no toqué `backend/**`), ni el resto de los `probar:*`,
ni `npm run build`, como pide la regla de verificación del encargo.

Las 28 pruebas nuevas no prueban el cálculo de la renumeración —ése es del backend y tiene
las suyas—: prueban **la cuenta**, que es lo único de acá que puede desmentir al servidor.
Tienen que fallar cuando el servidor se equivoca y sólo entonces, así que están escritas al
revés: se le da un informe al que le falta un mueble, uno que inventa uno, uno donde dos
quedan llamándose igual (y su variante en minúsculas), uno donde el mueble desaparece
DESPUÉS de aplicar, y se comprueba que la pantalla lo dice con el id en la mano.

**Higiene.** Puertos propios y exclusivos: backend `8114`, vite `5714`, apagados al terminar
por patrón acotado (`[u]vicorn.*port 8114`, `[v]ite --port 5714`), nunca `pkill -f uvicorn` a
secas; `ss -lnt` sin nada escuchando. Base SQLite en `/tmp/re13p/re13p.db` y
`TMPDIR=/tmp/re13p/tmp`, los dos fuera del repo, y la base borrada al terminar; `find` sobre
`/tmp/re-nom` no encuentra un `.db`, un `.sqlite` ni un `.pid`. Playwright con
`executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`, sin bajar Chromium.
**Sin librerías nuevas, sin `npm install`, sin commit ni push.** Arnés en `/tmp/re13p/`
(fuera del repo): `run_back.sh`, `run_vite.sh`, `seed.py`, `lib.mjs` y los siete `pw_*.mjs`.

---

## 9. Lo que queda abierto

### P1 — Después de renumerar, la reconciliación de la pantalla queda vacía *(backend, una línea)*

Es el **G1** del informe de frontend y sigue vivo. `services/renumeracion.py` hace
`copia.pop("nomenclatura", None)` —y tiene que hacerlo— pero eso es la única fuente de
«Contratos para revisar uno por uno». Al aplicar, esa lista se vacía **justo cuando más se
la necesita**. La línea que falta ya está escrita en aquel informe:

```python
copia["nombreAnterior"] = viejo_corto   # junto al pop de "nomenclatura"
```

**Mitigado, no resuelto, y por acá:** el papel de esta pantalla ES la reconciliación. La
columna **SE LEÍA** guarda exactamente lo que el plano dibujaba antes, mueble por mueble, y
el dueño se lo lleva a la tienda. Lo que se pierde con G1 no es el dato: es poder verlo en
la pantalla dentro de tres semanas sin el papel al lado. Vale la línea.

### P2 — Los enlaces de montaje ya emitidos dejan de servir

Está en el §3 del informe de backend: el token lleva el código adentro y está firmado. La
pantalla **no lo dice**, y debería, porque es la pantalla donde se toma la decisión. No lo
agregué porque no tengo cómo saber si hay enlaces vivos: haría falta un dato del servidor
(«hay N enlaces de montaje sin vencer para estas sedes») y eso es un endpoint, no una frase.
Mientras tanto: **si se emitieron enlaces, hay que reenviarlos después de renumerar.**

### P3 — El previo no se corrió nunca contra los planos de producción

Igual que el backend (§9.5 de su informe): acá se probó contra planos de prueba con la
geometría medida en NAVE. **El previo existe para eso**: hay que abrirlo contra la base real,
leer el informe sede por sede y recién ahí aplicar. La pantalla no escribe nada hasta que
alguien lo aprieta.

### P4 — `docs/ESTADO.md`

No lo toqué: los otros dos agentes tienen texto pendiente de pegar ahí y editarlo en
paralelo sería pisarlos. El párrafo que falta del lado de esta pantalla, listo para pegar,
está abajo.

### Lo que no verifiqué

- **La impresión de verdad, en una impresora.** Verifiqué el PDF que genera Chromium en A4,
  que es lo mismo que manda el diálogo de impresión, pero no hay papel de por medio.
- **Un plano de cien muebles** (NAVE real). El de prueba tiene 21 y CIUDAD JARDIN 14: las
  tres hojas salen de dos sedes chicas. La paginación está ejercitada (una sede parte entre
  dos hojas y la cabecera se repite), pero no con cien renglones seguidos.
- **Otras pantallas.** No abrí Vender, Supervisar, Montaje ni el editor 3D más allá del plano
  2D: no toqué nada suyo.

---

## 10. Para `docs/ESTADO.md` — texto listo para pegar

**En §«El plano, que es donde empieza todo»**, después de §«Revisar antes de negociar»,
agregar §«Renumerar»:

> «Revisar antes de negociar» dice qué está mal; **renumerar es lo único que lo arregla de
> raíz**, y por eso se entra desde el mismo lugar: un botón al lado de «Revisar», y una
> salida al pie de ese panel. Es de administrador.
>
> El sistema reasigna el nombre de cada mueble siguiendo el recorrido del plano —la regla
> está en `backend/app/services/renumeracion.py` y sale de la misma agrupación por la
> coordenada perpendicular con la que `utils/pasillos.ts` acertó nueve de las diez corridas
> de NAVE—, de modo que **caminar la tienda y leer los números vayan en el mismo orden**.
> No se agrega ni se borra un mueble y no se mueve una coordenada: lo único que cambia es
> cómo se llama.
>
> **Dos pasos, como la carga masiva.** El previo no escribe una sola fila y muestra el
> antes → después completo; aplicar escribe todo dentro de una transacción. Es idempotente:
> correrla dos veces no cambia nada la segunda vez, y la pantalla lo dice.
>
> **La cuenta se hace en el navegador, no se copia del servidor.** «Ningún mueble se agrega
> ni se borra» es una promesa, y una promesa que sólo se puede comprobar creyéndole al que
> la hizo no es comprobable: la pantalla cruza el informe contra el plano que ella misma
> tiene dibujado y, después de aplicar, contra el plano vuelto a bajar. Si las tres no
> coinciden lo dice con los ids en la mano.
>
> **La mitad del valor está en el papel.** El informe se imprime en A4, una sede por hoja,
> con la cabecera repetida en cada página y una casilla para tachar: es lo que el dueño se
> lleva a la tienda para reconciliar la cartelería, que no se entera sola. Por eso es una
> ruta (`/renumerar`) y no un panel del plano: un panel fijo adentro de una rejilla con
> `overflow: hidden` se imprime una vez, cortado, en la primera hoja.
>
> **Después de renumerar, los enlaces de montaje ya emitidos dejan de servir**: el código va
> firmado adentro del token. Hay que reenviarlos.

---

## Índice de capturas

| Archivo | Qué muestra |
|---|---|
| `f13p-01-entrada.png` | La entrada: «Renumerar» pegado a «Revisar» en la barra, y la salida al pie del panel de revisión |
| `f13p-02-previo.png` | El previo entero: el cartel ámbar, la cuenta, y las dos sedes con su tabla y sus anexos |
| `f13p-03-papel-1/2/3.png` | **Las tres hojas A4 de verdad**, sacadas del PDF: sin controles, en claro, una sede por hoja, con la casilla para tachar |
| `f13p-04-aplicado.png` | Aplicado: cartel verde, `DESPUÉS 35`, `se agregan 0`, `se borran 0`, y el botón principal ya no está |
| `f13p-05-idempotente.png` | La segunda corrida: «No hay nada que renumerar», `CAMBIAN 0`, botón deshabilitado |
| `f13p-06-bloqueado.png` | El 409 del servidor, con el motivo entero y «No se puede aplicar» |
| `f13p-07-alcance.png` | Y la salida: eligiendo NAVE en el alcance, la sede sana se renumera igual |
| `f13p-08-worker.png` | Un worker: la pantalla se lo dice, y en la barra del plano el botón no existe |
| `f13p-09-oscuro.png` | Modo oscuro entero, un solo amarillo |
| `f13p-09-angosto.png` | 700 px: nada rueda de costado |
