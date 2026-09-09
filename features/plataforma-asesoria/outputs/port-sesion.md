# Port de la sesión y del informe · Fase 11

La pieza 2 (**la sesión de asesoría**) y la pieza 3 (**el informe del cliente**)
de la opción A («El informe»), portadas al frontend real sobre los shapes de
`src/api/plataforma.ts`. Qué se entrega, qué decisión lleva adentro cada cosa,
qué se midió y qué queda para el que integre.

**Alcance:** las dos pantallas y sus piezas. **No** se tocó el backend, ni
`Plataforma.tsx` (la cartera es del otro constructor), ni
`ReportePlataforma.tsx` (el reporte de transparencia se **enlaza** y no se
rediseña). Los diez dibujos y la hoja de estilo son del agente de gráficos:
lo que se les cambió está listado en §6: cuatro cosas chicas y un arreglo de
correctitud.

---

## 1. Archivos

| Archivo | Qué es |
|---|---|
| `frontend/src/pages/DetalleCliente.tsx` | **Reescrito.** 1.933 líneas. `/plataforma/clientes/:slug` — la sesión: cinco capítulos, más los tres estados de pantalla que no son una sesión (sin plano, arranque, detalle ilegible). |
| `frontend/src/pages/InformeCliente.tsx` | **Nuevo.** 653 líneas. `/plataforma/clientes/:slug/informe` — el informe del cliente, capítulos 1 → 3, tres páginas A4. |
| `frontend/src/components/plataforma/sesion-datos.ts` | **Nuevo.** 399 líneas. Las cuentas: derivado del cliente, agrupaciones, valor en juego, y la acción/evidencia de cada recomendación. Sin JSX. |
| `frontend/src/components/plataforma/sesion-piezas.tsx` | **Nuevo.** 444 líneas. Las piezas del documento: capítulo, frase, ruta del JSON, bloque, cifra, tabla, cajón, aviso, hallazgo, tarjeta de recomendación, escalón, candidato, pie. |
| `frontend/src/App.tsx` | **+9 líneas**: la ruta `/plataforma/clientes/:slug/informe` (lazy, junto a la del detalle, antes del `*`). |

Cambios chicos en archivos de otros, todos anotados en §6:
`components/plataforma/graficos.tsx` (4, uno de ellos un arreglo de
correctitud) y `src/plataforma.css` (1).

**Verificador propio:** `scratchpad/sesion/` — `seed_sesion.py` (cuatro
clientes sembrados), `verificar.mjs` (30 pasadas), `contraste.mjs`,
`frontera.mjs`, `interaccion.mjs`, `imprimir.mjs`. Backend propio en 8047,
Vite propio en 5231, los dos matados al terminar.

---

## 2. La sesión — `/plataforma/clientes/:slug`

Es un **documento**, no un tablero: se lee de arriba abajo, cada bloque abre
con su frase-conclusión con cifra y debajo lleva **la ruta exacta del JSON en
monoespaciada**, los dibujos van anotados sobre el dato y el detalle va
plegado. El único amarillo es «Armar el informe para el cliente».

| Capítulo | Qué contesta | Qué lleva |
|---|---|---|
| **1 · Dónde está** | ¿cómo va este cliente? | frase con las cuatro cifras contra algo · cifra **hero** del ingreso con su variación contra el mes anterior · ocupación (cifra, contra la cartera y contra el mes pasado) · canon promedio contra la cartera · espacios en oferta · la rejilla de doce meses: conteos + ingreso + movimientos divergentes, **tres paneles y una sola rejilla de tiempo**, con la tabla de los 12 meses plegada |
| **2 · Qué encontramos** | ¿qué importa? | los hallazgos que el dato sostiene, **ordenados por lo que pesan**: inventario por tipo (unidades) · la sede que no se vendió (barras en espacios con marca por barra) · de quién depende (énfasis con umbral) · qué se cae a 60 días (riel + lista por fecha) · si cobra bien (dumbbell contra el promedio de la plataforma) · lo que no se puede medir. Y el aviso de la contradicción entre la mayor oportunidad y la concentración |
| **3 · Qué proponemos** | ¿qué hago primero? | las **tres cifras del valor en juego** con sus partes y el aviso de por qué no se suman · las de prioridad alta como acciones, con la **escalera de cuatro escalones** (frase · precio · a quién · dónde) · medias y bajas en tabla plegada · las oportunidades agrupadas **sede × tipo** con precio, origen del precio, candidatos y códigos |
| **4 · Los datos detrás** | ¿de dónde sale cada cifra? | una fila de filtros (sede · tipo · estado · texto) arriba de **cuatro cajones plegados** con su conteo: espacios, contratos (con la línea contada de `contratos_fuera_del_plano`), proveedores, movimientos |
| **5 · De dónde sale** | ¿me puedo fiar? | periodo, generado, cobertura del promedio de plataforma, qué está sin dato y por qué, qué no se muestra nunca, bitácora, y el **enlace** al reporte de transparencia |

### Las tres pantallas que NO son una sesión

No son «una sesión con huecos»: son estados distintos, y cada uno lo dice.

- **Sin plano** (`sedes_con_plano = 0`, `espacios[] = []`): dos capítulos. «Este
  cliente todavía no tiene un plano cargado», el aviso de que lo que
  corresponde es una operación y no un análisis, y —si tiene contratos fuera
  del plano— la plata que sí entra. **Sin amarillo:** no hay informe que armar.
- **Arranque** (plano cargado, cero contratos): la sesión entera, pero sin la
  rejilla de doce meses — «un cliente que todavía no vendió nada no tiene
  historia: no se dibuja una línea plana como si la tuviera» — y con el aviso
  de que las oportunidades vienen con la lista de candidatos vacía **y no se
  rellena con proveedores de otros clientes**.
- **Detalle ilegible** (503 / 404 / 422): el mensaje del backend tal cual, más
  lo único que existe (lo que la cartera publica de ese cliente), más el
  capítulo 5. Sin amarillo, y sin enlace al reporte si el slug ni siquiera
  existe en el registro.

**El índice de la izquierda lista los capítulos que la pantalla armó**, no
cinco siempre: un índice con cinco entradas y dos capítulos es un índice que
miente.

---

## 3. El informe — `/plataforma/clientes/:slug/informe`

La misma historia, capítulos 1 → 3, escrita para que un gerente de supermercado
la lea solo. Membrete de RECABRA con el cliente y el periodo, titular de «qué
gano» (no de «a quién llamo»), tres cifras, las sedes con su tabla abierta, los
hallazgos en segunda persona con su valor, el dumbbell contra el promedio
anónimo de la plataforma con su tabla, y las acciones del mes. Único amarillo:
«Imprimir o guardar en PDF».

**Lo que se cae, y por qué:**

- **La cartera entera.** Esta pantalla **no llama a `/metricas`**: el dato no
  está ni por accidente. «4,5 puntos por debajo de la cartera» es un número del
  operador y le contaría al gerente cómo les va a los otros supermercados. Su
  «contra qué» es el promedio anónimo por tipo, que vive en su propio detalle.
- **El capítulo 4.** Las 285 filas de espacios son el rastro del asesor, no la
  conversación del gerente.
- **Las palabras internas.** Cartera, benchmark, señal, adopción, fantasma,
  dormida, spread, prioridad — y **tarifa**, en cualquier forma. Medido: cero
  apariciones (§5).
- **La recomendación `sin_tarifa`.** Es una tarea de configuración del
  operador, no una propuesta comercial del mes.

Se lee con `/detalle` (obligatorio) y `/tendencia` del propio cliente (para el
«contra el mes pasado»). Ni un endpoint más.

---

## 4. Las decisiones que no son de gusto

**1 · Ni una lectura de `recomendaciones[].datos`.** El contrato de la Fase 8
dice que el frontend «nunca depende de una clave particular de `datos`». Así
que la acción y la evidencia de cada recomendación se arman con la **clave de
su `id`** (`"{tipo}:{clave}"`, que sí es contrato) y con campos de primera
clase: `espacios[]`, `sedes[]`, `resumen_por_tipo[]`, `proveedores[]`,
`oportunidades[]`. Si la clave no resuelve, se dice lo genérico; no se inventa.
Y el texto de `explicacion` **no se imprime nunca**: es literalmente el ejemplo
que el dueño puso como lo que no puede pasar.

**2 · El ingreso y el conteo de contratos salen de `proveedores[]`.**
`Σ canon_total` y `Σ espacios`, no de `espacios[].contrato`. Los contratos
sobre códigos que no están en el plano son plata que entra y contrato que
existe, pero no son una cara: sumando por espacio el ingreso quedaría corto y
nadie sabría por qué. Verificado contra el backend: `Σ canon_total` = 115.670.000
= `tendencia.serie[actual].ingreso_contratado_mes`, al peso.
**Consecuencia útil:** la sesión y el informe son exactos con el detalle solo;
`/tendencia` sólo agrega el «contra el mes pasado» y `/metricas` sólo el
«contra la cartera». Si alguno de los dos falla, la pantalla no se cae: dice
«sin referencia» donde iría el contraste.

**3 · Los hallazgos del capítulo 2 no son una lista fija de seis.** Se arman
los que el dato sostiene y se ordenan por **la plata que ponen sobre la mesa**;
los dos que son medición y no negocio (la posición de precio, lo que no se
puede medir) van al final. Con el cliente sembrado salen seis; con el de
arranque, dos. El rótulo del capítulo dice cuántos hay, y es una cuenta.

**4 · La contradicción se calcula, no se redacta.** Si la mayor recomendación
de espacio libre tiene entre sus candidatos al proveedor que ya pasa el umbral
de concentración, el aviso aparece con la cuenta hecha: «ofrecerle 152 más lo
llevaría al 75,9 % (208 de 274 contratos)», y el candidato va **último en la
tarjeta, con la advertencia pegada al nombre**. Si no hay contradicción, el
aviso no existe.

**5 · Las tres cifras del valor en juego, y el total que no.** Oportunidad
nueva (`Σ oportunidades` + `Σ precio_bajo_tarifa`), ingreso en riesgo a 60 días
y ingreso expuesto a un proveedor. El total crudo (`Σ` de las 15
recomendaciones) aparece **una sola vez, adentro del aviso que explica por qué
no existe** — y ese aviso sólo aparece cuando el total está mal de verdad, y
nombra únicamente los motivos que ese cliente tiene.

**6 · Todo lo vacío dice por qué está vacío.** «$ 0 de ingreso en riesgo» se
escribe «ningún contrato vence en los próximos 60 días». La frase del capítulo
3 abre con «tres números», «dos números» o «un solo número que mover», según
cuántos existan. Un cliente sin contratos no lee «igual que agosto: $ 0 · —»
sino «igual que agosto: tampoco había contratos».

---

## 5. Mediciones

`cd frontend && npx tsc --noEmit` → **limpio**.
`npm run probar:tema` → **24 pruebas, verdes**.
`PROBAR_GRAFICOS_PUERTO=5241 npm run probar:graficos` → **8 afirmaciones
estáticas + 4 pasadas de navegador, todas verdes** (con los tres cambios de §6
adentro).

### `verificar.mjs` — 30 pasadas (Chromium 1194, backend y Vite propios)

Cinco pantallas × tres anchos (1440×900 · 1366×768 · 390×844) × dos temas.

| Medición | Resultado en las 30 |
|---|---|
| Scroll horizontal del documento | **0** en todas |
| `.btn-principal` visibles | **1** en la sesión, el informe y la sesión de arranque · **0** en la sesión sin plano y en la del 404 (no hay informe que armar) |
| Textos `<text>` por debajo de 10 px reales | **0** |
| Textos de DOM por debajo de 10 px | **0** |
| Pares de `<text>` pisados (>1,5 px en los dos ejes) | **0** |
| Controles de escritura (`form`, `input` de datos, `submit`) | **0** — todo es sólo lectura |
| Errores de JS (`pageerror`) | **0** |
| Errores de red | **0**, salvo los 4 esperados de la ruta del 404 deliberado |
| «tarifa» fuera de su forma permitida | **0** (ver abajo) |
| «tarifa» y palabras internas **en el informe** | **0** |

**Las únicas formas en que «tarifa» aparece en la sesión**, y son cuatro:
`sin tarifa`, `tarifa cargada`, y las claves `tarifa_configurada` y
`contratos_sin_tarifa` dentro de la ruta del JSON. El **valor** de la tarifa de
referencia no aparece nunca — comprobado con la sonda de §5.2. En el informe la
palabra no existe.

### `contraste.mjs` — WCAG sobre el texto de DOM, con **todo desplegado**

| | sesión | informe |
|---|---|---|
| claro | **0** textos bajo su piso (4,5:1, o 3:1 si ≥ 24 px) | **0** |
| oscuro | **0** | **0** |

Ni un `<text>` ni un nodo de DOM usa `--ink-4` para texto: el escalón más tenue
es `--ink-3`, como fijó el port de los gráficos.

### `frontera.mjs` — la frontera del brief §4, con todos los `<details>` abiertos

Agujas buscadas en `innerText` **y** en `innerHTML` de las cuatro pantallas:
`NOTA-INTERNA`, `Juan Perez`, `contacto@proveedor.example`, `3005558899`,
`ventas@andes.com.co`, `300 555 8899`, y los **cinco valores de tarifa de
referencia** sembrados a propósito con cifras irrepetibles (987.654 ·
2.876.543 · 1.543.210 · 3.210.987 · 1.098.765), en las dos escrituras.

| Pantalla | Fugas | Filas de tabla renderizadas con todo abierto |
|---|---|---|
| sesión (285 espacios, 122 contratos) | **0** | **576** |
| informe | **0** | 10 |
| sesión de arranque | **0** | 21 |
| sesión sin plano | **0** | 0 |

El nombre del proveedor se pinta **tal como llega**: en la pantalla se lee
«Distribuidora Andes S.A. [correo oculto] [teléfono oculto]», que es lo que
sanea el backend. No se retoca.

### Impresión del informe

| Cliente | Páginas A4 | Controles visibles en `media: print` |
|---|---|---|
| MercaPaisa (285 espacios, 6 acciones) | **3** | **0** |
| Almacenes Caribe (arranque) | 2 | **0** |

En papel el informe es claro venga de donde venga el tema de la pantalla: la
página redeclara los tokens **derivados** (no los canales `-rgb`) dentro de su
`@media print`, porque el bloque oscuro los fija en la raíz y un elemento de
adentro hereda el valor ya calculado. Medido en oscuro: 3 páginas, 0 controles.

### `interaccion.mjs` — que los filtros filtren y el amarillo lleve a algún lado

`285 de 285` → sede TERRON `68` → + estado libre `66` → buscar «tinajo» `36`
(proveedor) → buscar «pasillo» `1` (zona). El amarillo lleva a
`/plataforma/clientes/mercapaisa/informe`, donde hay exactamente **1** amarillo,
y «Volver a la sesión» vuelve. Cero `pageerror` en toda la corrida.

### La siembra

`seed_sesion.py` levanta cuatro clientes en una base propia: **mercapaisa** (4
sedes, 285 espacios, 122 contratos, 3 proveedores —uno con el 45,9 % de los
contratos—, los tres estados de espacio, dos contratos que vencen dentro del
periodo y dos a ~50 días, **un contrato fuera del plano**, góndola/punta/nevera/
isla con tarifa cargada y robatope/batea **sin**, doce meses de snapshot con el
denominador movido y **un mes sin snapshot**), **surtiandes** (para que el
promedio de plataforma por tipo salga de otro lado y no del propio cliente),
**almacaribe** (plano cargado, cero contratos → `arranque`, cuenta en gracia) y
**sinplano**.

---

## 6. Lo que se le cambió a los archivos de otros

Cinco cosas, cada una por una medición y no por gusto. Todas mantienen el
comportamiento actual como *default*: quien ya los usa no ve un cambio, salvo
(e), que es un arreglo de correctitud y sí lo cambia (para bien).

**(a) `plataforma.css`: `.plat-cand.ojo` → `.plat-cand--ojo`** (dos reglas).
`vender.css` define un **`.ojo` GLOBAL** —sin clase raíz: el número de panel,
en monoespaciada, con `letter-spacing: .2em` y un `::after` de 14 px—. Con
`.plat-cand.ojo`, esa regla se colaba y la ficha del candidato salía
monoespaciada, centrada y con una rayita colgando. Está en la captura anterior
al arreglo. *(El `.ojo` sin scope de `vender.css` sigue ahí y va a volver a
morder: es un pendiente del sistema, no de esta pantalla.)*

**(b) `graficos.tsx` · `Dumbbell`: tres props opcionales de VOZ** —
`etiquetaCliente`, `etiquetaReferencia`, `nombreReferencia`. Los defaults son
exactamente los textos de hoy («lo que cobra el cliente», «el promedio de la
plataforma», «benchmark de la plataforma»), así que la sesión no cambia ni un
pixel. El informe pasa las suyas, porque **«benchmark» es una palabra interna**
y el gerente se lee a sí mismo, no «al cliente». De paso, la línea del tipo sin
contratos pasó de `sale del benchmark $X` a `precio sugerido = benchmark de la
plataforma $X`, que no se rompe al sustituir la palabra.

**(c) `graficos.tsx` · `BarrasSedes`: una prop opcional** `etiquetaPromedio`
(default `"del cliente"`). El informe pasa `"de su promedio"`.

**(d) `graficos.tsx` · `DosLineasConteo`: las dos etiquetas del extremo derecho
se separan cuando se pisarían.** Cada una es un bloque de dos renglones (~30 px);
cuando las dos series terminan cerca —un cliente casi vacío, o casi lleno— se
solapan. Medido: un cliente con 12 espacios y 0 contratos daba el par
`("comercializables", "0")` pisado. Ahora, si la distancia es menor a 32 px, se
mueve **la etiqueta, nunca el punto ni la línea**. `probar:graficos` sigue en
verde.

**(e) `graficos.tsx` · `RielVencimientos`: el cero del riel no es hoy, es el
primer día del periodo.** Es un **error de lectura del dato**, no una
preferencia: el backend calcula `dias_para_vencer` como
`(contrato.fin − desde).days` (`plataforma_detalle.py:398`), o sea desde el
**primer día del periodo**. El port pasaba la fecha de hoy como origen, así que
el corte de «fin del periodo» caía siete días antes de donde va y un contrato
que vence **dentro** del mes aparecía del lado de afuera. Medido con el cliente
sembrado: la frase del hallazgo decía «2 se caen dentro del periodo por
$ 5.000.000» y el riel dibujaba «1 contrato · $ 2.600.000». Con el origen en
`desde`, los dos dicen 2 y $ 5.000.000. Se agregó además `etiquetaOrigen`
(default `"hoy"`, para no cambiarle el dibujo a nadie) y la página pasa la
fecha real de ese cero («1 sep»), que es lo que el eje dice de verdad. El
`hoy` del prop quedó documentado como «el día que representa el cero del riel».

---

## 7. Lo que queda

1. **`docs/ESTADO.md` no se tocó a propósito.** Los dos ports (gráficos y
   pantallas) y el de la cartera caen en la misma sección; escribirla tres
   veces en paralelo es pedir un conflicto. Hay que agregar la Fase 11 **una
   vez, al integrar**: la hoja `plataforma.css` y la clase raíz `.plat`, la
   regla de los chips grises, el hallazgo de `--ink-4` sobre el papel, las dos
   rutas nuevas (`/plataforma/clientes/:slug` rediseñada y
   `/plataforma/clientes/:slug/informe`), y que el detalle ya no se imprime
   desde la sesión sino desde el informe.
2. **`vender.css` tiene ocho clases sin scope** (`.ojo`, `.vpill`, `.herr`,
   `.clave`, `.iso-escena`, `.p-cod`, `.rotulos`, `.pl-hit`) en un archivo cuyo
   encabezado promete «todo bajo una clase raíz». `.ojo` ya chocó; `.clave` es
   el próximo candidato. Es un arreglo de dos minutos y un PR aparte.
3. **`BarrasSedes` dice «Ver la tabla de las 1 sedes»** con una sola sede. Es
   una cadena de `graficos.tsx` y no la toqué para no seguir editando el
   archivo de otro; una línea.
4. **En papel, las figuras se achican.** El bloque `@media print` de
   `plataforma.css` les quita el `min-width` y las lleva a `width: 100%`: en A4
   con márgenes de 12 mm eso es un factor de 0,75, y un rótulo de 11,5 px queda
   en 8,6 px impresos. Es lo mismo que hacía la maqueta A. En pantalla no pasa:
   la hoja del informe se ensancha a 1.036 px justamente para que los 940 px de
   figura entren a escala 1 (por eso el cuerpo declarado es el cuerpo en
   pantalla). Si se quiere letra más grande en papel, la palanca es el margen
   de `@page`, no el `viewBox`.
5. **El periodo se elige con `<input type="month">`**, que en un navegador en
   inglés escribe «September 2026» en el control. Es el control nativo, el
   mismo que ya usaba la pantalla anterior; cambiarlo por un `<select>` de
   meses conocidos es una decisión de producto, no un arreglo.
6. **`/favicon.ico` da 404 en dev** y el navegador lo anota como error de
   consola en la primera carga de un contexto nuevo. Es preexistente y no tiene
   nada que ver con estas pantallas (el proyecto no tiene favicon).

Capturas en `outputs/capturas/f11-*.png` y el informe impreso en
`outputs/capturas/f11-informe-A4.pdf`. Sin commit ni push.
