# Legal — Política §5.3, catálogo de transparencia y ESTADO (Fase 8)

Agente: **Legal / compliance de la Fase 8 (detalle por cliente para asesoría)**.
Rama `claude/fase-7-transparencia`, árbol de trabajo. **Sin commit ni push.**
Fecha: 2026-09-05.

`VERSION_POLITICA` **sigue siendo `"2026-09-v2"`** — no se tocó
`backend/app/models/consentimiento.py`. La v2 nunca se desplegó (Render sólo
publica desde `main` y la Fase 7 todavía no mergeó), así que la ampliación de
esta fase entra **dentro de la misma versión**: el titular consiente el trato
completo —agregados exactos sin umbral **y** detalle de espacios y contratos—
en un único acto de aceptación, en lugar de dos re-consentimientos en la misma
semana por dos mitades del mismo cambio.

## 1. Territorio tocado

| Archivo | Qué |
|---|---|
| `docs/legal/politica-datos.md` | §3.6 (nuevo), §5.3 (párrafo de ampliación, (a) detalle, (b) reescrito, (c) finalidades + accesos, (d) bitácora, `[VALIDAR CON ABOGADO]` nuevo), §11 historial |
| `frontend/src/legal/politica-datos.md` | copia byte-idéntica (`cp` + `cmp`) |
| `backend/app/plataforma_reporte.py` | SOLO docstring del módulo, `CATALOGO` (+12 entradas, nota de conteo) y `_accesos_del_cliente` (rama `detalle` + docstring) |
| `backend/tests/test_plataforma_reporte.py` | +2 tests, +1 helper. **Ninguna aserción existente borrada ni ampliada** (ver §6) |
| `docs/ESTADO.md` | cabecera, enmienda de Fase 4, nota de "Clientes comerciales", sección **Fase 8** nueva, pendientes para el abogado |

Nada más. `plataforma_detalle.py`, `routers/`, el frontend (salvo la copia de
la política) y el resto de los tests **no se tocaron**.

```
 backend/app/plataforma_reporte.py        | 190 +++++++++++++++++++++++++---
 backend/tests/test_plataforma_reporte.py |  82 ++++++++++++
 docs/ESTADO.md                           | 199 ++++++++++++++++++++++++-----
 docs/legal/politica-datos.md             | 151 +++++++++++++++++++---
 frontend/src/legal/politica-datos.md     | 151 +++++++++++++++++++---
```

**md5 de las dos copias de la política (idénticas):**

```
bf7ecfa6914a3e40502c63cd9dad9b4f  docs/legal/politica-datos.md
bf7ecfa6914a3e40502c63cd9dad9b4f  frontend/src/legal/politica-datos.md
$ cmp docs/legal/politica-datos.md frontend/src/legal/politica-datos.md
(sin salida)
```

Encabezado: **misma versión** `2026-09-v2 · Vigencia: septiembre 2026`
(línea 5, que `test_consentimiento` lee por índice — no se movió ni una línea
por encima de ella). El documento **no tiene** una fecha de "última
actualización" en el encabezado, así que no se inventó una: la fecha de la
ampliación (2026-09-05) queda escrita donde se puede verificar, en la fila de
historial del §11. La cabecera de `docs/ESTADO.md` sí llevaba una y quedó en
`2026-09-05 (Fase 8 — Detalle por cliente para asesoría…)`.

## 2. Diff resumido de la política

### (a) — el detalle de espacios y contratos

**Antes**: §5.3 (a) enumeraba nueve agregados (sedes, espacios, ocupación,
canon promedio, ingreso, top de proveedores, usuarios y último acceso, estado
de cuenta, cifras mensuales, spread, adopción) y cerraba con el párrafo de que
la tarifa de referencia nunca se muestra.

**Después**: después de ese párrafo entra un bloque nuevo,
**"El detalle de espacios y contratos, para el servicio de asesoría
comercial"**, con siete viñetas taxativas —espacio (código, tipo, sede, zona,
área, ocupado/libre/se libera), contrato vigente (proveedor por **nombre
comercial** depurado, marca, canon mensual, fechas), resumen por tipo (con la
tarifa **sólo como sí/no**), proveedores del cliente, movimientos de 12 meses,
**oportunidades** (precio sugerido del propio cliente o, si no, el promedio de
plataforma **como un solo número**, más candidatos del **mismo** cliente) y
**recomendaciones** (con la explicación *generada por el sistema*, sin PII)— y
un cierre que dice que abre **una sola base por consulta**, que es **sólo
lectura** y que **queda anotado en la bitácora**.

Frases literales que quedaron en minúsculas dentro de §5.3, porque el auditor
de frontera y los tests las buscan: `detalle de espacios y contratos`,
`nombre comercial`, `oportunidades`, `recomendaciones`. Las de la Fase 7 que
`a15` exige siguen presentes y verificadas: `agregados exactos`, `sin umbral`,
`reporte de transparencia`, `mi-reporte-plataforma`, más `tarifa de
referencia`, `relación`, `adopción`, `clasificación`, `membresía`, `30 días`,
`mes de alta`, `bitácora`.

### Párrafo nuevo: "Ampliación de esta misma versión, antes de su despliegue"

Va inmediatamente después de "Qué cambió respecto de la versión anterior" y
marca la diferencia que el encargo pide explicitar: **aquel párrafo describe un
cambio de PRECISIÓN** (las mismas cifras, ahora exactas); **éste describe un
cambio de ALCANCE** (además de los agregados, el detalle de negocio). Explica
que la 2026-09-v2 no se había publicado ni desplegado cuando se tomó la
decisión, que por eso la ampliación se escribe dentro de la misma versión y no
en una nueva, y que el titular consiente el trato completo **una sola vez**.
Cierra diciendo que todo lo que (b) enumera como prohibido lo sigue siendo.

### (b) — lo que sigue prohibido, reescrito

**Antes** (5 viñetas), primera viñeta:

> - **filas individuales de negocio**: ningún contrato, ningún espacio, ningún
>   proveedor con sus datos de contacto, ninguna nota, ninguna foto de montaje.
>   La respuesta que arma la consola se construye por consulta agregada y no
>   puede contener una fila;

**Después** (8 viñetas; la frase "ningún contrato, ningún espacio" ya **no
existe en el documento**, verificado por `grep`):

1. datos de contacto de un proveedor (nombre de contacto, teléfono, correo) y
   sus notas;
2. notas de espacios y notas de contratos;
3. fotos de montaje y cualquier archivo o documento adjunto;
4. ningún correo, nombre ni id de un **usuario**, ni la fecha de acceso de una
   persona en particular;
5. el nombre de un proveedor **sin sanear**;
6. la **tarifa de referencia** en sí (sólo el sí/no y la relación porcentual);
7. **ningún dato de otro cliente dentro del detalle de uno** — el promedio de
   plataforma es **un solo número por tipo de espacio**, sin desglose, sedes ni
   nombres;
8. **nada en modo escritura**, en el detalle igual que en los agregados.

El encabezado de (b) cambió de "El cambio de esta versión es de precisión, no
de alcance" a "Ni el cambio de precisión —cifras exactas, sin umbral— ni la
ampliación de alcance —el detalle de espacios y contratos— tocan esta lista".

### Finalidades

- **§3.6 nuevo** ("Operación del servicio y asesoría comercial al
  supermercado"), antes del párrafo "Lo que NO hacemos con estos datos" del §3:
  enumera **asesoría comercial**, **salud de la cartera**, **cobranza y
  administración de la cuenta** y **mejora del servicio y de la plataforma**.
  Ninguna sección se renumeró: §3.6 se agrega al final del §3, que llegaba
  hasta §3.5.
- **§5.3 (c)**: la línea del catálogo pasa de "la finalidad (asesoría, salud de
  la cartera o cobranza)" a las cuatro finalidades **y explica la asimetría con
  el código**: el catálogo del reporte etiqueta con las tres primeras, que son
  las que el sistema conoce como etiqueta, y las entradas del detalle van con
  *asesoría*, sirviendo además a la mejora del servicio descrita en §3.6.
- **§5.3 (a)** también nombra las dos finalidades del detalle en su párrafo de
  apertura ("la **asesoría comercial** … y la **mejora del servicio y de la
  plataforma**").

**Por qué la finalidad nueva vive en la política y no en el enum del
`CATALOGO`.** El enum de `finalidad` no es una taxonomía legal: es un contrato
de datos. `frontend/src/api/plataforma.ts:335` lo tipa
`"asesoria" | "salud_cartera" | "cobranza"` y la vista del reporte lo pinta con
esa unión cerrada; agregar un cuarto valor rompe el `tsc` del frontend (que no
es mi territorio) y obliga a versionar el shape del reporte, en una fase que
promete no romper el contrato de Fase 7. Y no le agregaría nada al titular: las
12 entradas nuevas **son** de asesoría —esa es su finalidad principal y la que
justifica la lectura— y la "mejora del servicio y de la plataforma" es una
finalidad transversal del tratamiento, no la etiqueta de un dato puntual. El
lugar donde la ley exige que la finalidad esté informada es la política
(art. 9 y 12 de la Ley 1581; art. 5 del Decreto 1377), y ahí está, en §3.6 y en
§5.3. El §5.3 (c) además le dice al titular, en el mismo documento, por qué en
su reporte va a ver tres etiquetas y no cuatro: sin esa frase, el catálogo y la
política se contradirían a los ojos de quien los lee juntos.

### (c) y (d)

- **(c)**: la viñeta de accesos ahora dice "—incluidas las consultas del
  **detalle de espacios y contratos** de ese cliente—".
- **(d)**: la lista de consultas anotadas en la bitácora pasa de
  "…el panel de solicitudes de supresión y el propio reporte de transparencia"
  a "…el panel de solicitudes de supresión, el **detalle de espacios y
  contratos** de un cliente y el propio reporte de transparencia".

### `[VALIDAR CON ABOGADO]`

**7 → 8 marcadores en el documento** (`grep -c`, contra `git show HEAD`).
Ninguno se borró ni se debilitó; los 4 que ya tenía §5.3 siguen ahí. El nuevo,
"**sobre el detalle de espacios y contratos**", se inserta antes del marcador
de cierre de §5.3 y pregunta exactamente las dos cosas del encargo:

1. si el **contrato de encargo del §5.2** y la finalidad de asesoría alcanzan
   para que el operador lea el **canon y las fechas de un contrato individual**
   junto al **nombre comercial** del proveedor —información comercial del
   supermercado y, a la vez, de un tercero que puede ser persona natural—, o si
   hace falta cláusula/autorización adicional; con la instrucción heredada de
   la Fase 7: si la respuesta es no, el camino es **restringir la lectura del
   operador, no ampliar el reporte**;
2. si el **precio sugerido basado en el promedio de toda la plataforma** —uso
   de datos de otros clientes en beneficio de uno, un solo número por tipo, sin
   desglose ni nombres— queda cubierto por el contrato de servicio del §5.2
   como estadística agregada o hay que pactarlo expresamente, y si la
   disociación por promedio alcanza con pocos clientes de ese tipo.

Los `[COMPLETAR]` heredados (contacto, encargado, plazo de bitácora, proveedor
de correo saliente) siguen intactos: 18 en el documento.

### §11 — historial

La fila de `| **2026-09-v2** |` **no se modificó en su parte verificada por
test** (sigue diciendo "agregados exactos", "sin umbral" y "reporte de
transparencia" en la misma línea, que es lo que
`test_el_encabezado_y_el_versionado_de_la_politica_traen_la_version_vigente`
busca); se le añadió al final una remisión, y debajo va una fila nueva que **no
empieza** con `| **2026-09-v2**` (para no confundir al `next()` de ese test):

> | ↳ 2026-09-v2, ampliación previa al despliegue (2026-09-05) | El operador
> pasa a ver, además de los agregados, el **detalle de espacios y contratos**
> de cada cliente para la asesoría comercial (punto 5.3 (a)), con la finalidad
> nueva de **mejora del servicio y de la plataforma** (punto 3.6), anotado en
> la bitácora y declarado en el reporte de transparencia. **No se creó una
> versión nueva**: la 2026-09-v2 todavía no se había publicado ni desplegado, y
> el titular consiente el trato completo en un solo acto de aceptación. |

## 3. `CATALOGO`: 22 → 34 entradas

Las 12 nuevas, todas con `endpoints: ["detalle"]` (valor nuevo y válido) y
`finalidad: "asesoria"`:

| clave | fuente | tratamiento | por qué está |
|---|---|---|---|
| `espacio_codigo_y_tipo` | `layout_snapshots` | `exacto` | el código `SEDE-CODE` (cara B con `-B`) y el tipo son lo que identifica cada fila del detalle |
| `espacio_estado` | `layout_snapshots, space_leases` | `exacto` | ocupado / libre / se libera en el período: es un dato derivado del contrato, no del plano solo |
| `contrato_proveedor` | `suppliers.name` | `saneado` | **el dato más sensible de la fase**: nombre de un tercero. Declararlo `saneado` es la promesa verificable de que pasa por `sanear_nombre_proveedor` |
| `contrato_marca` | `space_leases` | `exacto` | la marca es dato de un tercero distinto del proveedor; sale tal como la cargó el supermercado |
| `contrato_canon_mensual` | `space_leases` | `exacto` | el canon **contrato por contrato**, no el promedio: es la ruptura de "agregados, nunca filas" y tiene que estar dicha con esas palabras |
| `contrato_fechas` | `space_leases` | `exacto` | inicio, fin y días para vencer |
| `resumen_por_tipo` | `space_leases, layout_snapshots, app_config (sólo el sí/no de la tarifa)` | `relacion` | la fuente nombra `app_config` **acotada al sí/no**: es la garantía de que la tarifa de referencia no cruza |
| `proveedores_del_cliente` | `space_leases, suppliers` | `saneado` | agrupación por proveedor con canon y participación |
| `movimientos` | `space_leases` (y las cancelaciones registradas) | `exacto` | 12 meses de entradas y salidas |
| `benchmark_plataforma` | `space_leases` de todos los clientes legibles (un promedio por tipo) | `relacion` | **la única entrada que mira más de una base**; la definición dice "UN solo número por tipo… sin desglose, sin sedes y sin el nombre de ningún otro supermercado" |
| `oportunidades` | derivado | `relacion` | precio sugerido + candidatos del **mismo** cliente |
| `recomendaciones` | derivado (texto generado por el sistema) | `relacion` | la definición dice expresamente que la explicación **la genera el sistema**, no es la nota de nadie, y no lleva contacto ni personas |

`tratamiento` y `finalidad` siguen dentro de los enums que tipa el frontend
(`exacto|saneado|sin_hora|conteo|relacion` y
`asesoria|salud_cartera|cobranza`), verificado en runtime. `endpoints` es
`string[]` en el frontend, así que `"detalle"` entra sin romper `tsc`.

También se actualizaron, en el mismo archivo y dentro de mi territorio:

- **el comentario de conteo** ("22 entradas" → "34 entradas") y una nota nueva
  que explica qué son las 12 y por qué `T-61` y `T-62` no las alcanzan (no
  salen por `/metricas`//`tendencia`//`adopcion` ni en `valores[]`), y por qué
  la finalidad nueva de la política no está en el enum;
- **el docstring del módulo**, que decía que la frontera es "agregados, nunca
  filas". Ahora distingue: la frontera **de este reporte** sigue igual (su
  propio JSON son agregados), pero la regla general **dejó de ser cierta en un
  punto acotado y declarado** — `/clientes/{slug}/detalle` sí publica filas de
  contratos de un cliente, vive en `plataforma_detalle.py`, y este módulo no lo
  llama: lo **declara**, que es lo que hace defendible la ampliación.

## 4. `_accesos_del_cliente`: la rama `detalle`

```python
        elif f.accion == "detalle":
            # Fase 8: `GET /api/plataforma/clientes/{slug}/detalle` anota
            # `periodo="<slug>:<YYYY-MM>"` -- alcanza SÓLO al cliente cuyo slug
            # va adelante. …
            alcanza = periodo.startswith(f"{slug}:")
```

Misma regla que `reporte` y `tendencia`: el slug va adelante del `:`, así que
la consulta de un cliente **no** aparece en el reporte de otro. El docstring de
la función pasó de remitir al módulo a enumerar la regla **acción por acción**
(`metricas`/`adopcion`/`clientes` alcanzan siempre; `tendencia` por slug o
consolidado; `supresiones` si hay solicitud; `reporte`; `detalle`) y cierra con
la advertencia de que una acción nueva sin su rama queda **sin declarar** en el
reporte del titular — que es exactamente lo que el módulo existe para impedir.

## 5. ESTADO — el texto que quedó

### 5.1 La enmienda (sección Fase 4, `docs/ESTADO.md`)

> **Enmienda de la regla del operador, RE-ENMENDADA en Fase 7 y AMPLIADA en
> Fase 8** (ver la nota en "Clientes comerciales" arriba): el operador ve los
> **agregados EXACTOS de todos los clientes, sin umbral** — con un contrato
> activo, el ingreso del mes es ese contrato y así se publica — **y, desde la
> Fase 8, también el DETALLE DE NEGOCIO de cada cliente**: espacios (código,
> tipo, estado en el período), contratos (proveedor saneado, marca, canon
> mensual, fechas) y proveedores, más el resumen por tipo, los movimientos de
> 12 meses y las oportunidades y recomendaciones que se derivan de todo eso.
> Ese detalle es **de un cliente por vez, solo lectura, con bitácora
> (`accion="detalle"`) y declarado en la política (§5.3 (a)) y en el catálogo
> del reporte de transparencia** (`endpoints: ["detalle"]`), de modo que el
> cliente ve en su propio reporte qué se lee de él y quién lo leyó. Hasta la
> Fase 6 los agregados se protegían con una supresión de celda chica (K=3: por
> debajo de 3 contratos activos, el dato salía `null`); el dueño de la
> plataforma decidió cambiar el trato en vez de parcharlo (la auditoría
> integral encontró que la regla era porosa, `frontera-5`, resuelto abajo). La
> contrapartida sigue siendo el **reporte de transparencia** (Fase 7, más
> abajo). **Lo que sigue intacto, y es la frontera que no se movió**: datos de
> contacto de proveedores (`contact_name`, `phone`, `email`) y sus notas; notas
> de espacios y de contratos; fotos y archivos (`SpaceFile`, `LeaseFile`);
> cualquier correo, nombre o id de un **usuario** final; la **tarifa de
> referencia** (sólo `tarifa_configurada` sí/no y el spread); y la
> **escritura** — ningún endpoint de plataforma modifica el negocio de un
> cliente. El JSON de `/metricas` sigue sin llevar filas: el detalle vive SÓLO
> en `/clientes/{slug}/detalle`. Un cliente suspendido también aparece en
> métricas (el operador necesita ver el negocio completo).

La **nota gemela en "Clientes comerciales"** (Fase 2, `:161`) también se
reescribió: pasa de la cita entrecomillada de Fase 4 ("solo agregados, nunca
filas individuales") a la formulación de Fase 8 —agregados exactos de
`/metricas`//`tendencia`//`adopcion` **y** detalle de negocio de
`/clientes/{slug}/detalle`, siempre solo lectura, siempre en bitácora, siempre
declarado en §5.3 y en el catálogo—, cerrando con la lista de lo que ningún
endpoint abre. Era obligatorio: esa nota era la única del documento que todavía
afirmaba "nunca filas individuales" como regla vigente.

### 5.2 Sección "Fase 8 — Detalle por cliente para asesoría"

Nueva, entre "Fase 7 — Transparencia" y "Pendientes conocidos: clientes y
plataforma". Contiene, en este orden: **la decisión del dueño** (con su cita);
**el endpoint** y sus códigos de error, con el recordatorio de SIN MIGRACIONES
y los helpers a reusar; **el shape completo** en un bloque como el de Fase 7;
**las reglas de estado, oportunidad y recomendación** (ocupado / libre /
se_libera, precio sugerido del cliente o benchmark, candidatos del mismo
cliente, los siete tipos de recomendación con sus umbrales, `arranque` cuando
no hay contratos) cerrando con el placeholder
`[completar con outputs/backend-detalle.md: los umbrales finales y las cifras
exactas de la sonda de verificación, si difieren de éstos.]` — puesto **sólo en
las cifras**, la estructura queda escrita; **el benchmark** como un número por
tipo con caché de 5 min; **la frontera** como lista taxativa; **la política**
(misma v2, §5.3 ampliada, §3.6, historial, marcador nuevo, copia
byte-idéntica); **el catálogo** (22 → 34, las 12 claves, `"detalle"` como valor
de `endpoints`, el enum de `finalidad` que no cambia y por qué) y la rama de
`_accesos_del_cliente`; **el frontend** (`/plataforma/clientes/:slug`,
Recomendaciones primero, "Imprimir recomendaciones", "Ver detalle", enlace al
reporte); y **el gotcha heredado** de `test_montaje_enlace` (`slug` ya está en
`relleno` desde el cierre de Fase 7, así que el GET nuevo queda barrido solo).

### 5.3 Pendientes y retoques de Fase 7

- En "Pendientes conocidos: clientes y plataforma" se agregó el bloque **"Para
  el abogado, abiertas por la Fase 8"** con las cuatro preguntas nuevas
  (contrato individual + nombre comercial; benchmark cruzado; la marca como
  dato de tercero; el plazo de retención de `bitacora_plataforma`, que sigue
  `[COMPLETAR]` y ahora guarda también las consultas de detalle), remitiendo a
  las heredadas de Fase 7.
- **Retoque c) de la ENTREGA de Fase 7 ("Los 8 archivos" → 9): ya estaba
  aplicado** en el árbol (`docs/ESTADO.md:707` dice "Los 9 archivos"), igual
  que `VERSION_POLITICA = "2026-09-v2"` en `:181` (L-5). No quedaba nada que
  corregir ahí.

## 6. Tests: qué se agregó y qué NO hizo falta ampliar

**Ninguna aserción existente necesitó ampliarse, y ninguna se borró.** Lo
verifiqué antes de tocar el catálogo, porque el encargo lo contemplaba:

- **No existe** ninguna aserción `len(CATALOGO) == 22` en la suite. El "22"
  vivía sólo en un comentario del código y en la prosa de ESTADO/ENTREGA; los
  dos se actualizaron a 34.
- **No existe** un enum cerrado de `endpoints` en los tests. `test_t61`
  (`test_transparencia_ataques.py:1621`) sólo comprueba el recíproco **para
  `"metricas"` y `"adopcion"`** ("si una entrada dice salir por ahí, tiene que
  salir"); las 12 nuevas declaran `["detalle"]` y no lo disparan. `test_t62`
  exige que toda clave de `valores[]` esté en el catálogo — dirección
  contraria: un catálogo con entradas de más no la viola. `test_t27` y
  `test_owner_200_…` verifican las **claves de cada item** (`clave`, `nombre`,
  `definicion`, `fuente`, `finalidad`, `endpoints`, `tratamiento`), que las 12
  respetan exactamente. `test_t28` ya permitía `$.catalogo[].endpoints` como
  arreglo. `test_t63` fija `ultimo_acceso` puntualmente, no el conjunto.
- El **enum de `finalidad`/`tratamiento`** no aparece en los tests de backend;
  sí en el tipo del frontend (`api/plataforma.ts:335-337`), y por eso las 12
  entradas se quedaron dentro de esos valores.

**Dos tests nuevos** en `backend/tests/test_plataforma_reporte.py` (19 → 21, y
un helper `_anotar_bitacora_a_mano`):

1. `test_el_dueno_ve_la_consulta_de_detalle_de_su_cliente_y_no_la_de_otro` —
   escribe a mano dos líneas de `bitacora_plataforma` con `accion="detalle"`,
   una con `periodo="repdetalle:<mes en curso>"` y otra con
   `periodo="otrocliente:<mes en curso>"`, y afirma que el reporte del **dueño**
   lista **exactamente una**, la suya, con su período, el correo del operador,
   la fecha sin hora y el shape de línea exacto. A mano y no por el endpoint a
   propósito: `/detalle` lo construye otro agente y este archivo prueba el
   reporte, no el detalle; lo que se fija es la regla de `_accesos_del_cliente`
   y el **formato del período** — si mañana alguien cambia `"<slug>:<YYYY-MM>"`,
   el test se pone rojo antes de que el titular deje de ver quién le miró los
   contratos.
2. `test_el_catalogo_declara_el_detalle_de_espacios_y_contratos` — las 12
   claves están, cada una con el shape exacto, `endpoints == ["detalle"]`,
   `finalidad` dentro del enum de tres valores y `tratamiento` dentro del de
   cinco; el proveedor (suelto y agrupado) declarado `saneado`; y la fuente de
   `resumen_por_tipo` acotada al "sólo el sí/no" de la tarifa.

## 7. Verificación

```
$ cd /tmp/retail-espacios-test/backend
$ mkdir -p /tmp/pt-legal-catalogo
$ TMPDIR=/tmp/pt-legal-catalogo python -m pytest -q \
    tests/test_plataforma_reporte.py tests/test_transparencia_ataques.py \
    tests/test_asesoria_ataques.py tests/test_compliance_ataques.py \
    tests/test_consentimiento.py
→ 187 tests: 185 passed, 2 xfailed, 0 failed (exit 0). Corrido dos veces.
  `test_plataforma_reporte.py` 21/21 (19 + los 2 nuevos); los 2 `xfail` son los
  preexistentes de `test_compliance_ataques.py` (hallazgos abiertos de Fase 3,
  ninguno tocado por esto).

$ python -c "import app.main"
→ IMPORT OK

$ cd /tmp/retail-espacios-test
$ cmp docs/legal/politica-datos.md frontend/src/legal/politica-datos.md
→ (sin salida: idénticas)
```

Sin suite completa, sin `npm run build`, sin `npx tsc` (otros tres agentes
trabajan en el mismo árbol; el `tsc` lo corre el Verificador). No se borró
ningún `backend/*.db`.

## 8. Revisión legal del trato (Ley 1581/2012 · Decreto 1377/2013)

El eje: la Fase 8 **cambia la naturaleza de lo que el operador lee**. Hasta hoy
RECABRA podía sostener que lo que cruzaba la frontera eran estadísticas sin
sujeto; desde hoy cruzan **filas de contratos con el nombre de un tercero**. Eso
no es necesariamente ilícito —el supermercado es el responsable, RECABRA el
encargado y el encargado puede tratar lo que la finalidad instruida exija
(art. 3 lit. d y art. 25 del Decreto 1377)—, pero **sí** hace que el documento
que falta (el contrato de transmisión del §5.2, hoy `[COMPLETAR]`) pase de
deuda formal a dependencia crítica.

| # | Riesgo | Sev. | Por qué |
|---|---|---|---|
| **F8-1** | **Contrato individual + nombre comercial de un proveedor unipersonal** | **ALTA** | Un nombre comercial que ES el de una persona natural, ahora unido a un **canon exacto, unas fechas y un espacio concreto**, es un dato personal de un determinable (art. 3 lit. c). Hasta Fase 7 el mismo nombre salía junto a un conteo; ahora sale junto a su precio. Ya no hay ninguna agregación que sirva de disociación, y el saneo sólo enmascara correo y teléfono, no el nombre. **Mitigación existente**: no es un dato sensible, la lectura es del encargado, es sólo lectura, queda en bitácora y el titular-cliente lo ve en su reporte. **Lo que falta**: el contrato de encargo firmado y la validación de si la finalidad de asesoría lo cubre. Si la respuesta fuera no, el arreglo es **restringir la lectura**, no ampliar el reporte. |
| **F8-2** | **Benchmark cruzado entre clientes** | **MEDIA-ALTA** | El precio sugerido puede salir del promedio de **otros** supermercados. Es dato de negocio, no personal, así que el problema es contractual y de confianza, no de Ley 1581: un cliente cuyos cánones alimentan la sugerencia que RECABRA le hace a su competidor **no lo pactó**. La disociación (un número por tipo, sin nombres) es buena, pero **decae con pocos clientes**: con dos supermercados con neveras, el promedio es despejable por diferencia — exactamente el patrón de `frontera-5`. Recomendación de producto: no publicar el benchmark de un tipo con menos de N clientes aportantes (la decisión es del Maestro / backend-detalle; la política ya lo describe con honestidad). |
| **F8-3** | **La marca como dato de un tercero** | **MEDIA** | `contrato_marca` sale `exacto` y no pasa por ningún saneo. Una marca suele ser una empresa, pero el campo es texto libre del supermercado: nada impide que alguien escriba ahí un nombre y un teléfono, igual que pasaba con `Supplier.name` (que por eso se sanea). **Sugerencia al backend**: pasar `marca` por `sanear_nombre_proveedor` — es la misma clase de campo y el costo es una llamada. Queda declarado en el catálogo y en §5.3 mientras tanto. |
| **F8-4** | **Explicaciones generadas por el sistema** | **MEDIA** | Las `recomendaciones` viajan como **prosa**, no como números, y esa prosa la arma el backend con nombres de proveedores y cifras. Dos consecuencias: (i) es la superficie más fácil por donde se filtra algo no declarado (un nombre sin sanear, una tarifa "explicada"), porque un `grep` de claves prohibidas no la detecta —hay que mirar el texto—; (ii) roza el art. 15 del Decreto 1377 / la prohibición de decisiones automatizadas del §3 de la política: hoy **no** lo es (es una sugerencia a un humano, sin efecto jurídico sobre nadie), pero conviene que siga siendo así y que la política lo diga —lo dice: "la redacta el sistema… no contiene ningún dato de contacto ni ninguna persona"—. El auditor de frontera debería barrer las `explicacion` como texto, no sólo como claves. |
| **F8-5** | **Retención de la bitácora** | **MEDIA** | `bitacora_plataforma` guarda ahora, además de "miró las métricas", "miró los contratos de este cliente en este mes". El §6 sigue diciendo `[COMPLETAR: plazo concreto]`. Un registro de accesos sin plazo contradice el art. 4 lit. c/d de la Ley 1581 (conservación limitada a la finalidad) justo en la tabla que sostiene la promesa de transparencia. Es la deuda de Fase 3 que cada fase encarece. |
| **F8-6** | **El detalle no tiene freno de tasa** | **BAJA-MEDIA** | Como `/reporte` (A3 de Fase 7): se controla por bitácora, no por cupo. Con el detalle, un operador puede barrer todos los clientes espacio por espacio; queda todo anotado, pero el control es *ex post*. Aceptable mientras el operador sea el dueño del SaaS; deja de serlo el día que haya empleados con ese rol. |
| **F8-7** | **Asimetría de finalidades entre política y catálogo** | **BAJA** | La política declara cuatro finalidades y el catálogo etiqueta con tres. Está explicado en §5.3 (c), pero es una costura: si mañana el enum se amplía, hay que revisar el párrafo. |
| **F8-8** | **El reporte del titular no muestra el detalle leído, sólo que se leyó** | **INFO / a decidir** | El titular ve la línea `accion="detalle"` con fecha, operador y período — sabe **que** le miraron los contratos de septiembre, no **qué** vio exactamente. Es coherente con el resto del reporte (que tampoco reproduce el JSON de `/metricas`) y con el art. 8 lit. b, pero el dato leído es ahora mucho más granular. Si el abogado quiere, la mejora natural es que el reporte enumere las **claves del catálogo con `endpoints: ["detalle"]`** al lado de esa línea; el catálogo ya lo permite sin código nuevo en el reporte. |

**Lo que se sostiene bien**, y conviene decirlo: el detalle abre **una sola
base**; el proveedor sigue saneado en las dos entradas donde aparece; la tarifa
de referencia sigue afuera (sólo el sí/no, y la fuente del catálogo lo dice
literalmente); no hay ningún dato de usuario; no hay escritura; hay bitácora; y
—lo importante para la defensa— **todo está declarado antes de existir**: la
política, el catálogo y el reporte lo dicen, y los tests lo fijan.

## 9. Preguntas para el abogado, en orden de urgencia

1. **[bloqueante para desplegar]** ¿El contrato de encargo del §5.2 —que **hoy
   no existe firmado** (`[COMPLETAR]` desde la Fase 3)— y la finalidad de
   asesoría comercial informada en la política alcanzan para que el operador lea
   **canon, fechas y nombre comercial contrato por contrato**? Si no, ¿qué
   cláusula o autorización adicional hace falta, y de quién: del supermercado
   como responsable, o también del proveedor?
2. **[bloqueante]** El **nombre comercial de un proveedor unipersonal** junto a
   su canon exacto: ¿dato personal del art. 3? Ya no hay agrupación mínima que
   disocie. ¿Basta el saneo de correo/teléfono, o hay que seudonimizar el
   nombre para el operador (p. ej. "Proveedor #3") y romper así el valor de la
   asesoría?
3. **[alta]** El **benchmark de plataforma**: usar los cánones de unos clientes
   para sugerirle un precio a otro. ¿Cubierto por el contrato de servicio como
   estadística agregada, o hay que informarlo y pactarlo con cada supermercado?
   ¿Hay un mínimo de clientes aportantes por debajo del cual no se debe
   publicar?
4. **[alta]** La **marca** exhibida: ¿la tratamos como dato de un tercero y la
   saneamos igual que el nombre del proveedor?
5. **[media]** El **plazo de retención de `bitacora_plataforma`** (§6,
   `[COMPLETAR]`), ahora que registra accesos a contratos individuales.
6. **[media]** Heredadas de la Fase 7 y **más urgentes** con el detalle
   encima: agregado sobre un solo contrato; relación canon/tarifa sin umbral
   (despejable con `contratos_sin_tarifa == 0`); fecha de último acceso y días
   sin acceso de un cliente con una sola cuenta; día de aceptación de la
   política.
7. **[media]** El **aviso previo a los clientes** (punto 6.3 de la ENTREGA de
   Fase 7) tiene que **reescribirse**: ya no basta con "dejamos de omitir
   cifras cuando hay pocos contratos". Hay que decir, en el mismo correo y
   antes del deploy, que el operador pasa a ver **espacio por espacio quién
   ocupa qué y a qué precio** para poder asesorarlo, y qué sigue sin verse. El
   modal de re-consentimiento seguirá siendo uno solo —esa es la razón de no
   subir la versión—, pero la comunicación tiene que cubrir el trato completo.
8. **[baja]** §7.1(c): el freno del reporte compartido con `/mi-export` (L-3 de
   Fase 7) sigue abierto; sin cambios en esta fase.

## 10. Gaps y notas para el Maestro (fuera de mi territorio)

- **`app/models/plataforma.py:98`**: el comentario de `BitacoraPlataforma.accion`
  todavía dice `"metricas" | "tendencia" | "adopcion"` — le faltan `clientes`,
  `supresiones`, `reporte` y ahora `detalle`. No lo toqué (no es mi territorio);
  lo hereda quien construya el endpoint o el commit de cierre.
- **`plataforma_detalle.py` no existía** cuando escribí esto: el docstring del
  módulo y ESTADO lo nombran como el lugar donde vive el endpoint, asumiendo el
  nombre de la spec. Si backend-detalle lo llama distinto, hay que corregir esas
  dos menciones.
- **Sugerencia para backend-detalle**: sanear `marca` (F8-3) y barrer las
  `explicacion` como **texto** en el red team, no sólo por claves (F8-4).
- **Sugerencia para el Verificador**: en el checklist de la spec, el `grep` de
  fugas debería incluir el texto de `recomendaciones[].explicacion` y el barrido
  de `tarifa` debe seguir aceptando sólo `tarifa_configurada`.
- No corrí `npx tsc`: mi único archivo del frontend es la copia `.md` de la
  política, que no entra en el typecheck.
