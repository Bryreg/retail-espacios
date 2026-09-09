# Un solo nombre: el código pasa a ser EL nombre — frontend

**Fase 13 · RECABRA · 2026-09-08 · rama `claude/fase-13-nombre-unico`.**
Frontend. No se tocó una línea de `backend/**` ni se hizo la pantalla de renumeración.

La fase 12 **administró** el problema de los dos nombres: rechazó el texto ambiguo, avisó
del gemelo, pintó la colisión en el plano y en el mapa de Vender. No pudo eliminarlo porque
mover el `code` arrastraba `spaces.code`, `spaces.svg_id`, las confirmaciones de montaje y
el histórico. El dueño dijo que **los contratos cargados son de prueba**, así que ese
arrastre dejó de ser una razón para no hacerlo.

**Ahora hay un solo nombre y es el `code`.** Renombrar un mueble edita SU NOMBRE, que es su
código. Como todas las pantallas ya dibujaban uno de los dos, con un solo campo el nombre
queda igual en todas **por construcción**: la clase entera de error desaparece en vez de
quedar vigilada.

Todo lo de abajo está medido **por la pantalla real** con Playwright, con la app levantada
en puertos propios (backend 8113, vite 5713, base SQLite fuera del repo). Capturas:
`capturas/f13-*.png` (13).

---

## 1. Lo que cambió, en una tabla

| | Antes (fase 12) | Ahora |
|---|---|---|
| Cómo se llama un mueble | `nomenclatura \|\| code` — dos campos, y nada obligaba a que coincidieran | `code`. Punto. `nombreDeMueble` devuelve el código |
| Doble clic sobre la caja | escribía `nomenclatura`, validaba nombre y código ajenos | escribe el **nombre**, por `renombrar` |
| Campo del panel lateral | escribía `nomenclatura` **directo, sin comprobar nada** | escribe el **nombre**, por `renombrar` — el mismo |
| Panel del editor 3D | no se podía renombrar | se puede, y por `renombrar` — el mismo |
| La regla | `choqueDeNombre` existía, pero comprobar y escribir vivían en lugares distintos | `renombrar` **comprueba y escribe en la misma llamada**: no hay forma de escribir sin comprobar |
| Cuando el nombre está tomado | se rechazaba y se decía el código del otro | se rechaza, se dice **qué es** el otro, y se ofrece **intercambiar** — una acción, los dos nombres a la vez |
| Clases de hallazgo de nombres en la revisión | 3 (`codigo-repetido`, `nombre-repetido`, `nombre-pisa-codigo`) | 1 (`codigo-repetido`), porque hay un solo nombre |
| `utils/nomenclatura.ts` | 430 líneas, 6 funciones sobre el segundo nombre | 415, y las 6 se fueron |

**Lo que NO cambió, a propósito:** un plano que ya está mal se abre, se mira, se mueve y se
guarda. Los choques preexistentes se muestran —en rojo en el plano, en el mapa de Vender y
en la revisión— y **nunca** bloquean el guardado.

---

## 2. La regla, en un solo lugar

`frontend/src/utils/nomenclatura.ts`:

```ts
renombrar(muebles, id, nombre)
  → { ok: true, muebles, nombre }               // ya escrito, normalizado
  → { ok: false, rechazo: {razon:"vacio"} }
  → { ok: false, rechazo: {razon:"ocupado", ocupa} }   // ← quién lo tiene
```

**Por qué una función que escribe y no un predicado.** El agujero de la fase 12 no fue que
faltara la comprobación: fue que la comprobación vivía en un camino (el doble clic) y la
escritura en otro (el campo del panel), y el segundo no llamaba al primero. Un predicado se
puede olvidar; una función que hace las dos cosas, no. Los tres caminos de renombre llaman
a ésta y ninguno escribe `code` por su cuenta —comprobado con un grep: las únicas otras
escrituras de `code` en el plano 2D son `siguienteCodigo`, que devuelve el primer número
**libre**—.

**El nombre se guarda normalizado** (mayúsculas, sin espacios al borde) porque es la llave:
`imp-08` y `IMP-08` son el mismo espacio en todas las comparaciones del sistema. Medido:
tecleando `pun-99` el plano guarda `PUN-99`.

**El aviso dice quién lo tiene, y no por su código.** Con un solo nombre, el código del otro
mueble ES el texto que la persona acaba de teclear: repetírselo no le dice nada. Se lo
nombra por lo que es. Textual de la pantalla (`capturas/f13-04-panel-rechazo.png`):

```
No se guardó: «PUN-10» ya lo tiene otro mueble de esta sede (Punta Góndola). Dos muebles
con el mismo nombre no se distinguen, y un contrato cargado como «PUN-10» no elige cuál.
Sigue llamándose «PUN-06».
```

---

## 3. El intercambio, que es la operación real

Renumerar una corrida a mano es correr los números dentro de un conjunto cerrado. Con la
regla puesta y sin intercambio eso sería **imposible**: en el medio de una corrida no hay
un solo nombre libre con el que hacer escala. Por eso el rechazo trae la salida.

```ts
intercambiarNombres(muebles, idA, idB)   // los DOS nombres, en una sola escritura
```

Los dos se escriben a la vez a propósito: en ningún momento intermedio la lista tiene dos
muebles con el mismo nombre, así que no hay estado inválido que alguien pueda guardar —ni
que el guardarraíl nuevo del servidor pueda rechazar—. Aplicarlo dos veces devuelve el
plano original (probado).

**Se entiende qué va a pasar antes de apretar.** Un intercambio toca DOS muebles y uno de
los dos no está seleccionado, así que debajo del botón va, con todas las letras
(`capturas/f13-02-rechazo-intercambio.png`):

```
[ Intercambiar con ese mueble ]
Este mueble pasa a llamarse «PUN-99» y el otro (Punta Góndola) pasa a llamarse «PUN-10».
```

Medido por la pantalla, volcado de los `<text>` del SVG del plano 2D:

```
antes del intercambio: ["PUN-99", …, "PUN-10", …]
después:               ["PUN-10", …, "PUN-99", …]
```

Y probado como operación completa en `probar:nomenclatura` — correr `IMP-08…IMP-12` un
lugar con cuatro intercambios encadenados, comprobando **en cada paso** que no queda ningún
nombre repetido, y que al final el conjunto de nombres es exactamente el mismo.

---

## 4. Los invariantes, afirmados en el código y en las pruebas

| Invariante | Dónde se afirma | Medido |
|---|---|---|
| Ningún mueble se agrega ni se borra | `renombrar` e `intercambiarNombres` son `map`, nunca `filter`/`push` | 15 muebles antes y después; el conjunto de `id` idéntico, por el servidor |
| No cambia una sola coordenada | `{ ...f, code }` — se copia el mueble y se toca un campo | Diff campo por campo del layout del servidor antes/después de un renombre: **la única diferencia es `code`** |
| Es idempotente | intercambiar dos veces devuelve el plano original | `probar:nomenclatura` |
| El plano roto se abre, se mueve y se guarda | ninguna validación del frontend bloquea el guardado | Con los dos `PUN-08` vivos se movió un mueble y el estado quedó **«Sincronizado»**; el duplicado se guardó intacto (`capturas/f13-11-plano-roto-guardado.png`) |
| Nada queda huérfano | *fuera de este encargo* — lo hace el endpoint de renumeración del backend | ver §8 |

El `id` es la identidad real a través de la renumeración, y así está escrito en
`ContratoDelPlano.id`.

---

## 5. La reconciliación no se pierde

`utils/revision.ts` se simplificó —un solo nombre, un solo hallazgo— pero
`contratosConNombreAjeno` sigue, con el sentido que le da un solo nombre: **los contratos
vigentes cuyo mueble ya no se llama como el contrato dice**.

Textual de «Revisar antes de negociar» (`capturas/f13-07-revisar.png`):

```
PUN-08 lo llevan 2 muebles — en el plano no se distinguen, comparten contratos, archivos
y correos, y quien lo escriba en una planilla no elige cuál                    [Tocá para ir]

Contratos para revisar uno por uno
1 contrato vigente sobre muebles que hoy se llaman distinto de como se llamaban cuando se
negociaron. El papel y el cartel de la góndola dicen el nombre viejo; el plano dice el de ahora.

CIUDAD JARDIN-IMP-12 · se negoció como «IMP-08»
CASA LUKER · ASEO
2026-01-01 → 2026-12-15
Cuidado: «IMP-08» hoy es el nombre de OTRO mueble (IMP-08). Quien lea el papel y camine
hasta el cartel se va a parar frente al mueble equivocado.
```

Esa última línea es el peor caso y por eso sale en rojo y primero en la lista.

**De dónde sale «como se llamaba».** De dos campos, y el primero manda
(`nombreAnterior` en `nomenclatura.ts`):

1. **`nombreAnterior`** — el campo explícito. Es el que tiene sentido después de renumerar,
   y hoy **nadie lo escribe**: ver §8.
2. **`nomenclatura`** — el respaldo, y lo único que hay hasta que se renumere. Dejó de ser
   un nombre: nada lo dibuja, nadie lo edita, y el panel del mueble lo muestra como lo que
   es (`capturas/f13-08-nombre-viejo.png`):

   ```
   NOMBRE
   IMP-12
   Antes se llamaba «IMP-08». Es lo que puede seguir diciendo el cartel de la góndola y lo
   que vio quien negoció lo que ya está contratado.
   ```

**Y el buscador sigue encontrando por el nombre viejo**, que es lo que va a tener en la mano
quien camine la tienda con la cartelería sin cambiar. Medido: buscando `IMP-08` en el plano
quedan resaltados **2** muebles —el que se llama así y el que se llamaba así—. Lo mismo en
el buscador de Supervisar (`DashboardView.tsx`), que era el único lugar que miraba los dos
campos y ahora mira el nombre y el recuerdo, que no es lo mismo.

---

## 6. Las fechas de un CSV, mes primero (F4 de la verificación de la fase 12)

**Dónde:** `frontend/src/utils/planilla.ts`. **Una línea**: `XLSX.read(buffer, { cellDates:
true })` pasó a `{ cellDates: true, raw: true }`.

Un CSV no tiene formatos: son textos. La librería, en cuanto uno de esos textos se le parece
a una fecha, lo interpreta **mes primero**, que es la convención del inglés y no la nuestra.
Y era peor que una lectura equivocada pareja: en la MISMA fila, `30/06/2026` no se parece a
ninguna fecha inglesa (no hay mes 30), así que quedaba texto y `leerFecha` lo leía bien, día
primero. **Un contrato con el inicio en un idioma y el fin en otro**, sin un solo aviso, y
sólo cuando el día es 12 o menos.

Medido con el arreglo puesto y sacado, sobre el mismo CSV:

```
sin raw:  01/03/2026 → 2026-01-03   («3 ene», la foto del verificador)
con raw:  01/03/2026 → 2026-03-01
```

**Sobre un .xlsx `raw` no cambia nada** —medido: las celdas con formato de fecha siguen
llegando como `Date` y los números como números—, así que el camino de Excel queda
exactamente igual y no hacen falta dos ramas que se puedan desfasar.

Probado con las dos formas de archivo, **por la pantalla real**, subiendo el archivo al
`input[type=file]` de Planilla (`capturas/f13-12-planilla-csv.png` y `-xlsx.png`). Las dos
dan lo mismo, textual de la revisión:

```
CSV : 1 mar → 30 jun · 122d      y      5 abr → 12 may · 38d
XLSX: 1 mar → 30 jun · 122d      y      5 abr → 12 may · 38d
```

Y en `probar:planilla` (nuevo, 12 pruebas) con archivos armados de verdad: un CSV de texto
y un .xlsx binario con celdas `Date` reales, más el serial de Excel suelto, la fecha ISO y
lo que ya andaba (montos a la colombiana, la fecha ilegible que no se inventa).

---

## 7. Qué se tocó

| Archivo | Qué |
|---|---|
| `src/utils/nomenclatura.ts` | El corazón. `nombreDeMueble` = el código. Nuevas: `nombreAnterior`, `renombrar`, `intercambiarNombres`, `textoDelIntercambio`. Se fueron: `nombrePropio`, `muebleConNombre`, `nombreRepetido`, `nombresRepetidos`, `nombresQuePisanCodigo`, y la clase `"codigo"`/`"nombre"` del choque. Cabecera actualizada, con los dos capítulos de historia (dos generadores, dos nombres) y por qué se cierran |
| `src/utils/revision.ts` | Un solo hallazgo de nombres. `contratosConNombreAjeno` re-fundada sobre `nombreAnterior` |
| `src/utils/planilla.ts` | `raw: true`, con el porqué escrito |
| `src/types/fixtures.ts` | `nomenclatura` documentada como nombre VIEJO de sólo lectura; campo nuevo `nombreAnterior` |
| `src/components/FloorPlan2D/FloorPlan2D.tsx` | Los dos caminos de renombre unificados en `aplicarRenombre`; el intercambio como acción, en la franja del plano y en el panel; el campo «Nomenclatura» pasó a «Nombre» y a guardar al salir del campo, no en cada tecla; la revisión y la reconciliación |
| `src/components/StoreEditor3D/StoreEditor3D.tsx` | Campo «Nombre» nuevo en el panel, por la misma regla y con el mismo intercambio; el renombre entra en el historial de deshacer |
| `src/pages/DashboardView.tsx` | El rótulo del mapa de Vender ya no acompaña el `×2` con el código (con un solo nombre no distinguía nada); el buscador mira el nombre viejo como recuerdo |
| `src/store/fixtureStore.ts` | El 409 `nombres_repetidos` del guardarraíl nuevo del servidor. Ver §8 |
| `Contrato.tsx`, `Montaje.tsx`, `MountView.tsx`, `FormularioMontaje.tsx`, `api/montaje.ts`, `Landing` | Los que leían el campo hoy: los tres que resolvían `nomenclatura` a mano ahora piden el nombre, y `EspacioAMontar.nomenclatura` —que se escribía y no lo leía nadie— se fue |
| `scripts/probar-nomenclatura.mjs` | Reescrito sobre el modelo de un nombre: la regla, el intercambio, y el plano que ya está mal. 40 pruebas |
| `scripts/probar-revision.mjs` | 30 pruebas |
| `scripts/probar-planilla.mjs` | **Nuevo.** 12 pruebas, con CSV y .xlsx de verdad |

---

## 8. Lo que queda abierto, y para quién

### G1 — El nombre viejo no sobrevive a la renumeración *(backend, una línea)*

`backend/app/services/renumeracion.py:481` hace `copia.pop("nomenclatura", None)`, y **tiene
que hacerlo**: mientras esa `nomenclatura` esté, `layout_lookup.nombre_de_mueble` la sigue
leyendo como el nombre dibujado y una planilla escrita con el nombre NUEVO saldría ambigua.

Pero es la única fuente que tiene hoy la reconciliación del §5. Al aplicar la renumeración,
la lista «Contratos para revisar uno por uno» **queda vacía justo cuando más se la necesita**
—que es exactamente lo que el encargo pedía que no pasara—.

**El frontend ya está listo**: `nombreAnterior` lee primero un campo `nombreAnterior` del
mueble, y los dos editores lo arrastran sin tocarlo (medido: sobrevive a guardar el plano 2D
y a pasar por el editor 3D). Falta que la renumeración lo escriba:

```python
copia["nombreAnterior"] = viejo_corto   # junto al pop de "nomenclatura"
```

Verificado simulando a mano ese estado —`nomenclatura` borrada, `nombreAnterior: "IMP-08"`—:
la lista sale idéntica, con el contrato de CASA LUKER y su aviso rojo.

### G2 — El guardarraíl del servidor y un nombre viejo de texto libre *(medido, acotado)*

El servidor rechaza con `409 {code:"nombres_repetidos"}` un guardado que CREE nombres
repetidos, y para eso mira el nombre **dibujado** (`nomenclatura || code`). Entonces
renombrar un mueble a un texto que es la `nomenclatura` vieja de otro pasa la regla del
navegador y lo rechaza el servidor. Medido:

```
PUT /layout/CIUDAD JARDIN → 409
«P1-A» quedaría como nombre de 2 muebles de la sede (imp7, imp9).
```

**En los datos reales no puede pasar**: las seis `nomenclatura` de CIUDAD JARDIN son todas
el código de otro mueble —así que la regla del navegador ya las bloquea— y los 109 muebles
de NAVE y POBLADO las tienen vacías (`docs/ESTADO.md` §«Un solo nombre para el mueble»). Y
después de renumerar deja de existir del todo. Aun así se cerró del lado del navegador lo
que se podía cerrar sin tocar el backend: **`fixtureStore` ahora mira `detail.code`** y, para
`nombres_repetidos`, muestra las frases del servidor en vez de abrir un conflicto entre
equipos —ofrecer «Conservar la mía» sería un lazo, porque forzar vuelve a pasar por la misma
comprobación y vuelve a fallar—. El guardado queda pendiente: en cuanto el nombre se
arregle, el reintento entra.

### G3 — El eco de la planilla todavía habla del plano viejo *(backend)*

Con una `nomenclatura` vieja viva, el rechazo de la planilla sigue diciendo «el mueble que
el plano dibuja «IMP-08»», y el plano ya no dibuja eso: dibuja IMP-12. Medido por la
pantalla (`capturas/f13-12-planilla-imp08.png`):

```
«IMP-08» es ambiguo en CIUDAD JARDIN. Escribí CIUDAD JARDIN-IMP-12 para el mueble que el
plano dibuja «IMP-08», o CIUDAD JARDIN-IMP-08 para el que se dibuja con su propio código.
```

La protección es correcta y conviene que siga mientras la cartelería diga los nombres
viejos —una fila tecleada del cartel no debería entrar callada—, pero **la frase ya no es
cierta**. Un mensaje que describe mal el plano es lo que la fase 12 combatió. Sugerido:
«el mueble que **se llamaba** «IMP-08»». Desaparece solo al renumerar.

### G4 — `docs/ESTADO.md` *(falta pegarlo antes del PR)*

No lo toqué: no está en mis archivos y el backend lo está editando en paralelo. El texto
del lado del frontend, listo para pegar, está abajo.

### Lo que no verifiqué

- **La pantalla de renumeración** — no existe todavía; es de otro agente.
- **El correo de montaje y la lámina** con un plano renumerado: leen `nombreDeMueble`, que
  ahora devuelve el código, pero no los levanté (`smtp_listo: false` en este entorno).
- **`npm run build` y la suite completa del backend**: excluidos por la regla de
  verificación del encargo.

---

## 9. Verificación

| | |
|---|---|
| `cd frontend && npx tsc --noEmit` | **exit 0** |
| `npm run probar:nomenclatura` | **exit 0 — 40 pruebas** |
| `npm run probar:revision` | **exit 0 — 30 pruebas** |
| `npm run probar:planilla` *(nuevo)* | **exit 0 — 12 pruebas** |
| `probar:planta` · `propuesta` · `pasillos` · `acomodar` · `landing` · `tema` · `vender` | **exit 0** — 33 · 18 · 12 · 11 · 21 · 24 · 12 |

**No se corrió** la suite completa del backend ni `npm run build`, como pide el encargo.

**Higiene.** Puertos propios y exclusivos: backend `8113`, vite `5713`, apagados por patrón
acotado al terminar; nunca `pkill -f uvicorn` a secas. Base SQLite en `/tmp/re13/re13.db` y
`TMPDIR=/tmp/re13/tmp`, los dos fuera del repo; `find` sobre `/tmp/re-nom` no encuentra un
solo `.db`, `.sqlite` ni `.pid`. Playwright con `executablePath
/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, sin bajar Chromium. Sin librerías
nuevas, sin `npm install`, **sin commit ni push**. Arnés en `/tmp/re13/` (fuera del repo):
`run_back.sh`, `run_vite.sh`, `seed.py`, `lib.mjs` y los diez `pw_*.mjs`.

---

## 10. Para `docs/ESTADO.md` — texto listo para pegar

**En §«El código ambiguo, que es cómo un contrato terminaba en el mueble equivocado»**,
reemplazar el párrafo **«Lo que esta fase NO hace, y por qué»** por:

> **Y en la fase 13 se hizo lo que ésta no hizo.** El dueño confirmó que los contratos
> cargados son de prueba, así que el arrastre de `spaces.code` y `spaces.svg_id` dejó de ser
> una razón para no mover el nombre. **El `code` pasó a ser EL nombre y la `nomenclatura`
> dejó de existir como segundo nombre.** Con un solo campo, «el nombre que se lee» y «la
> llave que une» no se pueden separar: la clase entera de error desapareció en vez de quedar
> vigilada. Lo de acá —el rechazo del texto ambiguo, el aviso del gemelo, las pastillas
> rojas— queda como **red**, porque un plano guardado antes de la regla puede seguir
> teniendo dos muebles llamados igual y hay que poder verlo.

**Reemplazar §«Una sola nomenclatura»** (§«El plano, que es donde empieza todo») por
§«Un solo nombre, y es el código»:

> Había dos generadores, uno por editor: el plano 2D hacía `GON-01` con `max + 1` y el
> editor 3D `NAVE-GON-001` **contando** cuántos había —con `GON-01` y `GON-03`, contaba 2 y
> devolvía `GON-03` otra vez—. Ahora viven en `utils/nomenclatura.ts`, los usan los dos
> editores, y el número devuelto es el primer **libre**.
>
> Y después hubo dos NOMBRES, que fue peor y que la fase 12 documentó entero. **Ahora hay
> uno: el nombre de un mueble es su código.** Renombrar edita ese código, y como todas las
> pantallas dibujan ese campo, el nombre queda igual en todas por construcción.
>
> **La regla vive en un solo lugar y escribe ella misma.** `renombrar(muebles, id, nombre)`
> comprueba y escribe en la misma llamada, y la llaman los tres caminos: el doble clic sobre
> la caja, el campo «Nombre» del panel del plano 2D y el del panel del editor 3D. Esto no es
> prolijidad: el agujero de la fase 12 fue que la comprobación vivía en un camino y la
> escritura en otro. Un predicado se puede olvidar; una función que hace las dos cosas, no.
>
> **Cuando el nombre está tomado se ofrece intercambiar**, y el intercambio escribe los dos
> nombres a la vez. Sin eso la regla correcta volvería imposible el trabajo normal: renumerar
> una corrida es correr los números dentro de un conjunto cerrado, y en el medio de una
> corrida no hay un solo nombre libre con el que hacer escala. Debajo del botón se dice qué
> le pasa a cada uno de los dos muebles, porque uno de los dos no está seleccionado.
>
> **Un plano que ya está mal se abre, se mira, se mueve y se guarda.** La regla impide CREAR
> un nombre repetido; los que ya estaban se muestran —en rojo, con `×2`, en el plano y en el
> mapa de Vender— y no traban nada.

**Reemplazar §«Un solo nombre para el mueble»** (el bloque de la píldora y del campo
«Nomenclatura») por:

> El panel del plano decía «—» en Nomenclatura mientras el plano dibujaba `GON-800` sobre el
> mismo mueble: eran **dos campos distintos**. Primero se unificó la lectura
> (`nomenclatura || code` en un solo lugar); en la fase 13 se unificó el campo. El nombre es
> el código, el campo del panel se llama **Nombre** y escribe el código, y la `nomenclatura`
> quedó como **nombre viejo**: de sólo lectura, nada la dibuja, y sirve para dos cosas —que
> buscar por lo que dice la cartelería de la tienda siga encontrando el mueble, y que
> «Revisar antes de negociar» pueda listar los contratos que se negociaron mirando ese texto—.
>
> La píldora de arriba del mueble ya no es para el nombre puesto a mano —no hay tal cosa—:
> queda **sólo para los que chocan**. Un mueble chico dibuja su emoji, como siempre, y un
> plano sano no tiene una sola píldora.

**En §«Carga masiva desde una planilla»**, agregar al párrafo de las fechas:

> Las fechas se leen **día primero** (`03/04/2026` es el 3 de abril), y ahora también en un
> CSV. Un CSV no tiene formatos: son textos, y la librería interpretaba mes primero cualquier
> texto que se le pareciera a una fecha inglesa. `01/03/2026` entraba como 3 de enero — y en
> la misma fila `30/06/2026` se leía bien, porque no hay mes 30. Un contrato con el inicio en
> un idioma y el fin en otro, sin un solo aviso, y sólo cuando el día es 12 o menos. Se lee
> con `raw`, que deja las celdas de texto como texto; en un .xlsx no cambia nada, porque ahí
> el día y el mes los decidió Excel con el formato guardado en el archivo.

---

## Índice de capturas

| Archivo | Qué muestra |
|---|---|
| `f13-01-plano.png` | El plano con un solo nombre: los códigos adentro de las cajas, los chicos con su emoji, **cero pastillas** salvo el `×2` del par que ya se llamaba igual |
| `f13-02-rechazo-intercambio.png` | El rechazo del doble clic: quién tiene el nombre, el botón, y qué va a pasar con los dos muebles |
| `f13-03-intercambiado.png` | Después de intercambiar |
| `f13-04-panel-rechazo.png` | Lo mismo desde el campo del panel lateral, que antes escribía sin comprobar nada |
| `f13-06-gemelo.png` | El mueble que ya tenía gemelo: se avisa, se deja editar y se deja guardar |
| `f13-07-revisar.png` | «Revisar antes de negociar»: un solo hallazgo de nombres y la reconciliación |
| `f13-08-nombre-viejo.png` | El panel del mueble que se negoció con otro nombre |
| `f13-09-3d.png` · `f13-10-3d-rechazo.png` | El editor 3D, que antes no podía renombrar, con la misma regla y el mismo intercambio |
| `f13-11-plano-roto-guardado.png` | El plano que ya está mal se mueve y se guarda: «Sincronizado» |
| `f13-12-planilla-csv.png` · `-xlsx.png` | Las fechas, por la pantalla, con las dos formas de archivo |
| `f13-12-planilla-imp08.png` | G3: el eco del servidor todavía habla del plano viejo |
