# Legal / compliance — Fase 7 (Transparencia)

Auditor: **Legal — política §5.3, `VERSION_POLITICA` y re-consentimiento**.
Rama `claude/fase-7-transparencia`. Sin commit ni push.

---

## 1. Qué se tocó (territorio de escritura)

| Archivo | Qué |
|---|---|
| `docs/legal/politica-datos.md` | cabecera → `2026-09-v2`; §4.1 (re-consentimiento por cambio de versión); §5.3 REESCRITO entero; §7.1 nuevo ítem **c) Reporte de transparencia**; §11 versión + **Historial de versiones** + nota técnica |
| `frontend/src/legal/politica-datos.md` | copia byte-idéntica (`cp` + `cmp`, verificado) |
| `backend/app/models/consentimiento.py` | SOLO la constante y su comentario: `VERSION_POLITICA = "2026-09-v2"` |
| `backend/tests/test_consentimiento.py` | +237 líneas: bloques [F], [G], [H] |
| `backend/tests/test_derechos.py` | línea 137: compara contra `VERSION_POLITICA` importada, no contra el literal |

```
 backend/app/models/consentimiento.py |  25 ++-
 backend/tests/test_consentimiento.py | 237 +++++++++++++++++++++++++++++
 backend/tests/test_derechos.py       |   8 +-
 docs/legal/politica-datos.md         | 287 ++++++++++++++++++++++-------------
 frontend/src/legal/politica-datos.md | 287 ++++++++++++++++++++++-------------
```

Nada fuera de eso. Todo lo demás de este informe es **sólo lectura**.

---

## 2. La versión nueva

`backend/app/models/consentimiento.py`:

```python
VERSION_POLITICA = "2026-09-v2"
```

El comentario dice **por qué sube** (cambio material del trato: el operador pasó de ver
celdas suprimidas bajo K=3 a ver agregados exactos sin umbral, y la contrapartida es el
reporte de transparencia con cada dato tomado, su definición, fuente, finalidad, valores
mes a mes y quién lo consultó) y **que las filas viejas no se reescriben**: quien aceptó
`2026-09-v1` queda sin fila para la nueva y el flujo que YA existe —el alta bloquea, la
invitación da 428, el login de una cuenta existente avisa una vez con
`pedir_consentimiento`— se la vuelve a pedir. Sin backfill y sin migración.

### Dónde queda escrita la versión

| Lugar | Estado |
|---|---|
| `models/consentimiento.py::VERSION_POLITICA` | `2026-09-v2` |
| cabecera de la política (línea 5) | `**Versión: 2026-09-v2 · Vigencia: septiembre 2026**` |
| §11 «Vigencia y versionado» + historial | `2026-09-v2` y la fila del historial |
| §4.1 | menciona `2026-09-v2` como el caso que dispara el re-consentimiento |
| `tests/test_derechos.py:137` | ahora compara contra la constante importada |
| **`docs/ESTADO.md:181`** | **sigue diciendo `2026-09-v1`** → hallazgo L-5, no es mi territorio |

> **Nota de numeración.** El encargo hablaba de «§10 versión / §10 historial de versiones».
> En el documento real §10 es *Seguridad de la información* y la sección de versionado es
> **§11 «Vigencia y versionado»**: el historial se agregó ahí, que es donde corresponde.
> Ninguna sección se renumeró.

### Historial agregado en §11

| Versión | Qué cambió |
|---|---|
| **2026-09-v1** | Primera versión: rol dual, consentimiento registrado por versión, derechos del titular dentro del producto, y las métricas agregadas del operador sujetas a un umbral de 3 contratos. |
| **2026-09-v2** | El operador ve agregados exactos sin umbral; reporte de transparencia como derecho del cliente. Cambio material: dispara el re-consentimiento del punto 4.1. |

---

## 3. §5.3 nuevo, completo

Reemplaza las 110 líneas anteriores (las dos notas «decisión de NO subir `VERSION_POLITICA`»
desaparecieron; en su lugar va la nota nueva de cambio material). Las frases que los tests
exigen —`agregados exactos`, `sin umbral`, `reporte de transparencia`,
`mi-reporte-plataforma`, `tarifa de referencia`, `relación`, `adopción`, `clasificación`,
`membresía`, `30 días`, `mes de alta`, `bitácora`, `[VALIDAR CON ABOGADO]`— están todas, y
también la mención histórica literal **«umbral de 3 contratos»**, que explica que la v1 lo
aplicaba y que esta versión lo retira (así `a15` pasa antes y después de su reescritura).

Texto íntegro tal como quedó en `docs/legal/politica-datos.md` (líneas 298–446):

````markdown
### 5.3 El operador de la plataforma y las métricas agregadas del negocio

> **[VALIDAR CON ABOGADO]**

RECABRA opera una consola propia (`/plataforma`) para quien administra el servicio como
negocio. Desde esa consola, el **operador de la plataforma** ve **agregados exactos** del
negocio de cada supermercado cliente, **sin umbral** mínimo de contratos, y a cambio cada
supermercado cliente puede pedir cuando quiera un **reporte de transparencia** con cada
dato que la plataforma tomó de él, cómo lo calculó, para qué, y quién del operador lo
consultó y cuándo. Las dos mitades son un solo trato y hay que leerlas juntas.

**Qué cambió respecto de la versión anterior.** La versión 2026-09-v1 de esta política
aplicaba un **umbral de 3 contratos**: los promedios y sumas de canon, el top de
proveedores y la relación con la tarifa de referencia de un supermercado sólo se mostraban
cuando agrupaban al menos tres contratos activos del período, y por debajo de eso el dato
se omitía. Esta versión **retira ese umbral de 3 contratos**: la cifra sale exacta aunque
el supermercado tenga un solo contrato activo. La razón del cambio es que el umbral daba
una protección aparente —el total consolidado de todos los clientes permitía despejar por
diferencia la celda omitida— y, en su lugar, se le da al cliente algo que sí se puede
verificar: la trazabilidad completa de lo que se tomó de él y de quién lo miró.

**a) Qué ve el operador.** De **todos** los supermercados clientes, uno por uno y también
sumado, y siempre en forma de agregados exactos, sin umbral:

- conteos: sedes con plano y espacios comercializables;
- el porcentaje de **ocupación** del período;
- el **canon promedio mensual** de los contratos activos (sin dato sólo cuando no hay
  ningún contrato activo: no existe el promedio) y el **ingreso contratado del mes**, que
  es la suma del canon de esos contratos;
- un **top de proveedores** por **nombre comercial del proveedor —depurado de datos de
  contacto: los correos y teléfonos que pudieran aparecer se enmascaran antes de
  mostrarse— y conteo de contratos activos**;
- la cantidad de **usuarios con cuenta** (personas con membresía activa) y la **fecha del
  último acceso** de cualquiera de ellas —la fecha, no quién entró—;
- el **estado de cuenta** comercial del cliente (activo, en gracia, sólo lectura o
  suspendido);
- las cifras mensuales de las que salen las anteriores, guardadas mes a mes: cuántos
  contratos activos hubo en el período, cuántas caras quedaron ocupadas y el canon total
  del mes, con la fecha en que se tomó esa foto;
- la **relación** porcentual entre el canon que el supermercado efectivamente cobra y su
  propia **tarifa de referencia**, junto con si configuró o no una tarifa (sí/no) y el
  conteo de contratos del período a los que no les aplica ninguna;
- la **lectura de adopción**: cuántas cuentas con **membresía** activa tiene el
  supermercado, cuántas de esas cuentas entraron en los últimos **30 días**, cuántos días
  pasaron desde el último acceso de cualquiera de ellas, si tiene contratos vigentes
  (sí/no), el **mes de alta** (mes y año, sin día) y una **clasificación** derivada de
  todo lo anterior, calculada por el sistema —nueva, activa, sin uso con contratos
  (*fantasma*), sin uso sin contratos (*dormida*) o sin cuentas—, agrupada además por mes
  de alta. Entre paréntesis van las etiquetas exactas que devuelve el sistema y que el
  cliente también ve en su reporte.

La **tarifa de referencia** del supermercado —cuánto dice él que vale cada espacio— es
información comercial suya y **nunca se muestra al operador**, ni por sede, ni en promedio,
ni sumada: lo único que cruza es la relación porcentual descrita arriba, que ahora también
sale sin umbral.

**b) Qué sigue estando prohibido.** El cambio de esta versión es de precisión, no de
alcance. El operador **no ve, ni puede ver**:

- **filas individuales de negocio**: ningún contrato, ningún espacio, ningún proveedor con
  sus datos de contacto, ninguna nota, ninguna foto de montaje. La respuesta que arma la
  consola se construye por consulta agregada y no puede contener una fila;
- **ningún correo, nombre ni identificador de un usuario final** del supermercado ni de sus
  proveedores, ni la fecha de acceso de una persona en particular;
- el **nombre de un proveedor sin sanear** (los correos y teléfonos se enmascaran antes de
  cualquier lectura del operador);
- la **tarifa de referencia** en sí misma;
- **nada en modo escritura**: el acceso del operador a los datos de negocio de un cliente
  es de **sólo lectura**.

**c) El reporte de transparencia, como derecho del cliente.** Cualquier supermercado
cliente puede generar, cuando quiera, un **reporte de transparencia** de su propia cuenta.
El reporte contiene:

- el **catálogo** completo de los datos que la plataforma toma de él: por cada uno, su
  nombre, la definición en palabras (la fórmula), la fuente (de qué tabla sale), la
  finalidad (asesoría, salud de la cartera o cobranza) y si sale saneado o sin hora;
- los **valores tomados mes a mes** dentro de una ventana de hasta 24 meses: los mismos
  agregados exactos que ve el operador, referidos sólo a ese cliente, junto con las cifras
  mensuales guardadas de las que salen (contratos activos, caras ocupadas, canon total,
  usuarios con cuenta y el top de proveedores saneado) y la fecha de cada captura;
- los **accesos del operador** que alcanzaron a ese cliente en la ventana: por cada uno, la
  **fecha sin hora**, el **correo del operador** que consultó, la acción y el período, más
  el conteo total;
- la **versión de la política** vigente, la versión que aceptó el dueño y el día en que la
  aceptó, y la referencia a esta sección 5.3 como base de la lectura.

Se pide de dos maneras, y las dos devuelven exactamente el mismo contenido: el **dueño**
del supermercado lo genera desde su propia sesión —`GET /api/clientes/mi-reporte-plataforma`,
con las mismas garantías que el export de la sección 7: sólo el dueño, sólo su cliente, con
un límite de pedidos por hora—, o se lo pide al operador, que puede entregárselo en una
asesoría. El reporte es **informativo**: no borra, no corrige y no cambia ningún dato; para
eso están los derechos de la sección 7.

**d) La bitácora.** Cada consulta del operador queda anotada —con el **correo del
operador**, el momento y el período consultado— en la **bitácora** de la plataforma: las
métricas, la tendencia histórica, la lectura de adopción, el listado de clientes, el panel
de solicitudes de supresión y el propio reporte de transparencia. Esa bitácora es lo que
alimenta la lista de accesos del reporte: por eso el cliente puede comprobar, y no
solamente creer, quién miró sus cifras y cuándo.

Esto no cambia el reparto de responsabilidades del punto 5.2: el supermercado sigue siendo
el responsable del tratamiento de los datos de su gente y de sus proveedores, y RECABRA
sigue siendo el encargado. Lo que describe este punto es una capacidad interna de operación
del negocio —entender cuánto se usa el servicio y en qué estado está cada cartera, no
acceder a los datos personales que el supermercado trata—.

> **[VALIDAR CON ABOGADO] — sobre el cambio de esta versión.** A diferencia de lo decidido
> en las versiones anteriores de este punto 5.3, acá **sí se subió `VERSION_POLITICA`** —a
> `2026-09-v2`, en el encabezado de este documento y en la constante del backend a la vez—
> porque quitar el umbral es un **cambio material** de lo que se le informó al titular, y
> se disparó el **re-consentimiento** automático del punto 4.1 para toda la base de
> usuarios. Lo que el abogado tiene que validar es, puntualmente:
>
> 1. Si un **agregado construido sobre un solo contrato** —que en los hechos equivale al
>    canon de ese contrato puntual, aunque no se muestre ninguna fila ni ninguna persona—,
>    visible para el operador pero acompañado de la trazabilidad completa del reporte de
>    transparencia (catálogo, valores y accesos con fecha y correo del operador), es
>    compatible con la finalidad informada al titular y con el contrato de encargo que
>    exige el punto 5.2. Si la conclusión fuera que no lo es, el camino es restringir la
>    lectura del operador, no ampliar el reporte.
> 2. Si la **relación** entre el canon cobrado y la **tarifa de referencia**, ahora también
>    sin umbral, debe tratarse como **información comercial reservada del supermercado
>    cliente** —no es un dato personal, pero sí un dato de negocio de un tercero— y, por lo
>    tanto, si conviene cubrir expresamente su tratamiento en el contrato de servicio del
>    punto 5.2.
>
> Sigue abierta, además, la pregunta que el contador del equipo dejó marcada: el **nombre
> comercial** de un proveedor puede, en algunos casos, coincidir con el nombre de una
> persona natural (un proveedor unipersonal que factura a su propio nombre) aun después del
> saneo de correos y teléfonos. Que el abogado evalúe si ese escenario —un nombre comercial
> que ES también el nombre de una persona determinable— cae bajo el artículo 3 de la Ley
> 1581 y qué tratamiento adicional corresponde; el retiro del umbral de 3 contratos vuelve
> esa pregunta más urgente, porque ya no hay ninguna agrupación mínima que sirva de
> disociación. Y sigue abierta la de la **fecha del último acceso** —y la de los días sin
> acceso— de un supermercado que tiene **una sola cuenta activa**: si deja de ser un dato
> de la organización y pasa a ser un dato de esa persona determinable. El mismo
> interrogante alcanza al **día en que se aceptó esta política**, que el reporte muestra sin
> decir quién la aceptó: en un supermercado con un solo dueño, esa fecha es atribuible a esa
> persona.

> **[VALIDAR CON ABOGADO]** Confirmar que estos agregados —conteos, porcentajes, promedios
> y sumas de canon ya sin umbral, nombre comercial de un proveedor junto a un conteo de
> contratos, una fecha de último acceso sin identidad y la lectura de adopción con su
> clasificación— no constituyen, ni siquiera combinados entre sí, un dato personal en el
> sentido del artículo 3 de la Ley 1581 (vinculable a una persona natural determinada o
> determinable), y que el reporte de transparencia del punto (c) es una medida adecuada de
> información al titular en los términos del artículo 8, literal b, de esa ley.
````

### Otros cambios en el documento

**§4.1 — autorización.** El tercer momento de aceptación ahora cubre también «quienes
aceptaron una versión anterior a la vigente», y se agregó un párrafo:

> **Cada versión se acepta por separado.** La constancia guarda la versión concreta que se
> aceptó, así que cuando se publica una versión nueva —como la 2026-09-v2, que cambió lo que
> ve el operador de la plataforma (punto 5.3)— la aceptación anterior deja de estar vigente y
> el sistema **vuelve a pedir la aceptación** en el siguiente ingreso, sin borrar ni reescribir
> la constancia vieja.

**§7.1 — derechos.** Ítem nuevo **c) Reporte de transparencia —
`GET /api/clientes/mi-reporte-plataforma`**, al lado de a) `mi-export` y
b) `solicitar-supresion`: qué contiene, sólo el dueño verificado contra la membresía real,
sólo su cliente, límite por hora, no borra ni modifica nada, y también lo puede entregar el
operador. Cierra con la frase de que ninguno de los tres derechos se corta por el estado
comercial de la cuenta (`_EXENTOS_POR_HABEAS_DATA` ya incluye el reporte:
`backend/app/clientes.py:375`).

**§11 — versionado.** Versión a `2026-09-v2`, tabla de historial, y la nota técnica ahora
nombra el archivo (`app/models/consentimiento.py`) y dice que subir la constante no
reescribe filas viejas.

---

## 4. Tests agregados

### `backend/tests/test_consentimiento.py` (+237 líneas)

Bloque **[F] — la política subió de versión**, con el helper
`_fila_de_consentimiento_a_mano(email, version)` que escribe la fila directo con
`sesion_registro()` (por la API no hay forma de registrar una versión que ya no es la
vigente) y `_versiones_aceptadas(usuario_id)`:

| Test | Qué fija |
|---|---|
| `test_solo_acepto_la_version_anterior_pide_consentimiento_y_aceptar_lo_destraba` | fila SÓLO para `2026-09-v1` → `/oauth` da 200 con `pedir_consentimiento: true`; `POST /api/auth/aceptar-politica` → 204 y deja fila con `version == VERSION_POLITICA`; **la fila vieja NO se reescribe** (quedan las dos); el login siguiente ya no trae el campo |
| `test_invitacion_pendiente_con_solo_la_version_anterior_da_428` | el mismo criterio en la puerta de la membresía NUEVA: 428 `consentimiento_requerido`, `detail["version"] == VERSION_POLITICA` (avisa cuál falta, no la vieja) y ninguna membresía creada |
| `test_el_login_legado_no_se_entera_del_cambio_de_version` | `/api/auth/login` con clave compartida → 200, cuerpo con las 4 claves de siempre, sin `pedir_consentimiento` ni `version`; `/aceptar-politica` con ese token sigue dando 403 |

Bloque **[G] — la constante y el documento dicen lo mismo**:

| Test | Qué fija |
|---|---|
| `test_la_constante_es_la_version_de_fase_7` | `VERSION_POLITICA == "2026-09-v2"` — **el único literal de toda la suite** |
| `test_el_encabezado_y_el_versionado_de_la_politica_traen_la_version_vigente` | la cabecera (línea 5) y §11 traen la MISMA cadena que la constante; existe la fila del historial y menciona «agregados exactos», «sin umbral» y «reporte de transparencia»; `2026-09-v1` sigue en el historial (es lo que aceptaron las filas viejas); fuente y copia byte-idénticas |
| `test_la_politica_declara_el_re_consentimiento_por_cambio_de_version` | §4.1 dice «vuelve a pedir la aceptación» y nombra `2026-09-v2`; §7 lista `mi-reporte-plataforma` junto a `mi-export` y `solicitar-supresion` |

Bloque **[H]**: `test_mi_export_devuelve_la_version_vigente` — `/mi-export` publica
`version_politica == VERSION_POLITICA` (contra la constante).

### `backend/tests/test_derechos.py:137`

```python
    from app.models.consentimiento import VERSION_POLITICA

    assert body["version_politica"] == VERSION_POLITICA
```

El literal quedó en un único lugar de la suite (`test_la_constante_es_la_version_de_fase_7`),
que además lo confronta contra el encabezado del documento.

`tests/test_compliance_ataques.py:452` mantiene `"2026-09-v1"` **a propósito**: es el payload
de un ataque (un POST forjado a `/aceptar-politica`), no una aserción sobre la versión
vigente. No se tocó.

---

## 5. Verificación

```
cd /tmp/retail-espacios-test/backend
TMPDIR=/tmp/pt-legal-compliance python -m pytest tests/test_consentimiento.py \
    tests/test_derechos.py tests/test_compliance_ataques.py tests/test_identidad.py
→ 123 passed, 2 xfailed in 84.32s

TMPDIR=/tmp/pt-legal-compliance python -m pytest tests/test_asesoria_ataques.py -k a15
→ 1 passed, 18 deselected

python -c "import app.main"
→ IMPORT OK

cd /tmp/retail-espacios-test
cmp docs/legal/politica-datos.md frontend/src/legal/politica-datos.md
→ (sin salida: idénticas)
```

Los 2 `xfail` son los de `test_compliance_ataques.py` que ya existían (hallazgos abiertos
de la Fase 3, ninguno tocado por esto). No se corrió la suite completa ni `npm run build`.

---

## 6. Verificación del modal de consentimiento (sólo lectura)

**Cadena completa, verde:**

1. `backend/app/routers/auth.py:595` — `pedir_consentimiento = not _tiene_consentimiento_vigente(reg, usuario.id)`; en la línea 624 se agrega `cuerpo["pedir_consentimiento"] = True` **top-level**, sin tocar la forma del JWT. `_tiene_consentimiento_vigente` (línea 274) filtra por `Consentimiento.version == VERSION_POLITICA`, así que la subida de versión dispara el aviso sola, sin código nuevo.
2. `frontend/src/api/auth.ts:65` — el tipo de la respuesta ya declara `pedir_consentimiento?: boolean`.
3. `frontend/src/pages/Login.tsx:288` y `:300` — se lo pasan a `setAuth(...)` en los dos caminos de login.
4. `frontend/src/store/authStore.ts:98` — `pedirConsentimiento: pedirConsentimiento ?? false`; `descartarConsentimiento()` (`:101`) lo baja; `logout` lo limpia (`:105`).
5. `frontend/src/App.tsx:135` — `{pedirConsentimiento && <ModalConsentimiento />}`.
6. `frontend/src/components/ModalConsentimiento.tsx` — `aceptar()` llama `aceptarPolitica()` → `client.post("/auth/aceptar-politica")` (`src/api/auth.ts:134`) y después `descartar()`. Enlace a `/politica-datos` para leerla. «Ahora no» cierra sin llamar al backend y vuelve en el próximo login.

**No hay nada que arreglar en el frontend para el re-consentimiento.** Una observación menor,
no bloqueante: el modal dice «Actualizamos la Política de Tratamiento de Datos», que ahora es
literalmente cierto (antes se mostraba también a cuentas que nunca habían aceptado nada). No
nombra la versión; si se quisiera, `pedir_consentimiento` podría viajar como la cadena de
versión en vez de `true` — pero eso cambia el contrato del login y no vale el riesgo en esta
fase.

---

## 7. Auditoría del reporte de transparencia contra la política

Leído: `backend/app/plataforma_reporte.py` (515 líneas), `backend/app/routers/derechos.py`
(`/mi-reporte-plataforma`, líneas 286–330), `backend/app/routers/plataforma.py`
(`/clientes/{slug}/reporte`, líneas 430–477), `backend/app/clientes.py:368-376`,
`frontend/src/pages/ReportePlataforma.tsx`, `frontend/src/api/plataforma.ts`.

### Lo que está bien

- **El correo del operador en `accesos` está declarado.** `plataforma_reporte.py:417`
  publica `{"fecha", "operador", "accion", "periodo"}` y `operador` es `f.email` de
  `bitacora_plataforma` — el correo del OPERADOR, no de un usuario final. §5.3(c) y §5.3(d)
  lo declaran expresamente («la fecha sin hora, el correo del operador que consultó, la
  acción y el período»).
- **`aceptada_en` sale sin hora y sin identidad del owner.** `_politica_del_cliente`
  (`:315-348`) resuelve los ids de owners activos en memoria y devuelve sólo
  `(version, fila.aceptado_en.date().isoformat())`. Ningún correo, nombre ni id sale del
  join. `generado_en` sí lleva hora, pero es el momento de generar el reporte, no un acceso.
- **Fechas de acceso sin hora**: `f.en.date().isoformat()` (`:415`).
- **Proveedor saneado**: `_top_reporte` reusa `_top` de `plataforma_metricas` entero
  (orden, tope de 5 y saneo del nombre), sólo renombra la clave del conteo.
- **Nunca filas de negocio**: `valores` sale de `snapshot_metricas` (agregados por mes) y la
  única apertura de base de cliente es `_spread_actual` → `_metricas_de_un_cliente`, sólo
  lectura y sólo de ESTE cliente.
- **La tarifa de referencia no sale**: `spread_actual` publica `tarifa_configurada` (sí/no),
  `spread_pct` y `contratos_sin_tarifa`. Coincide con §5.3(a).
- **Frontera del dueño**: el slug nunca sale de un parámetro (`require_owner` →
  `cliente_del_pedido`), así que un owner no puede pedir el reporte de otro.
- **Bitácora**: el endpoint del operador anota `accion="reporte"` con
  `periodo="<slug>:<desde>..<hasta>"` DESPUÉS de armar; el del dueño no anota, y está bien
  —la bitácora constata accesos del operador, no que el dueño mire lo suyo—. §5.3(d) quedó
  redactado en esos términos («cada consulta **del operador**»), sin contradicción.
- **Catálogo vs §5.3**: las 17 entradas de `CATALOGO` están declaradas una por una en
  §5.3(a) — `sedes_con_plano`, `espacios_comercializables`, `ocupacion_pct`,
  `canon_promedio_mensual`, `ingreso_contratado_mes`, `top_proveedores`,
  `usuarios_con_cuenta`, `ultimo_acceso`, `estado_cuenta`, `spread_pct`,
  `tarifa_configurada`, `contratos_sin_tarifa`, `cohorte` (mes de alta), `clasificacion`,
  `usuarios_activos_30d`, `dias_sin_acceso`, `con_contratos_activos`. **Ninguna entrada del
  catálogo queda sin declarar en la política.**
- **`derechos`** del JSON (`export`/`supresion`/`reporte`/`contacto`) coincide con §7.1 a/b/c.

### Hallazgos

| # | Sev. | Archivo:línea | Qué |
|---|---|---|---|
| **L-1** | **ALTA** | `frontend/src/pages/ReportePlataforma.tsx:240` y `frontend/src/api/plataforma.ts:351` | **Shape roto entre backend y frontend en `top_proveedores`.** El backend emite `{"nombre", "contratos"}` (`plataforma_reporte.py:262`, y `tests/test_plataforma_reporte.py:41` lo fija como `CLAVES_TOP_PROVEEDOR = {"nombre", "contratos"}`); el frontend tipa `ValorReporte.top_proveedores: ProveedorTop[]` y lee `p.contratos_activos`, que en este JSON **no existe**. La tabla «Valores tomados, mes a mes» va a imprimir `Alpina (undefined)` en cada mes con proveedores. `tsc` no lo ve (el JSON no está tipado en runtime) y el test de backend no mira el frontend. **Arreglo**: un tipo propio (`ProveedorTopReporte { nombre; contratos }`) y `p.contratos`. No es mi territorio. |
| **L-2** | **MEDIA** | `backend/app/plataforma_reporte.py:85-239` vs `:271-312` | **El catálogo se declara taxativo pero `valores` publica cinco claves que no están en él**: `ocupadas`, `contratos_activos`, `canon_total`, `origen` y `capturado_en`. No es una fuga —son datos del propio cliente, salen de su propio `snapshot_metricas`—, pero rompe la promesa que sostiene el trato de la fase («cada dato tomado, con su definición, fuente y finalidad»): un cliente que audita la columna «Contratos» no encuentra su fila en el catálogo. **Mitigado por el lado de la política**: §5.3(a) y §5.3(c) ahora declaran esas cifras mensuales y la fecha de captura, así que el reporte no expone nada que la política calle. **Falta del lado del código**: agregar entradas de `CATALOGO` para `ocupadas`, `contratos_activos` y `canon_total` (y una nota sobre `origen`/`capturado_en` como metadato de la captura). |
| **L-3** | **MEDIA** | `backend/app/routers/derechos.py:305-317` | **El reporte comparte el freno de 3/hora con `/mi-export`** (`_chequear_y_anotar_freno_export`, tabla `export_attempts`). La decisión está bien argumentada (sin migraciones no hay contador aparte), pero tiene una consecuencia de habeas data: ejercer un derecho **consume la cuota de otro** —tres exports dejan al dueño sin poder generar su reporte de transparencia durante una hora—. Es exactamente el patrón que la Fase 3 cerró con `_EXENTOS_POR_HABEAS_DATA` (el cobro no puede bloquear el habeas data). §7.1(c) quedó redactado de forma veraz («un límite de pedidos por hora») pero no dice que sea compartido. **Sugerido**: o subir el tope compartido, o distinguir por un campo ya existente de `export_attempts`. Decisión del Maestro; el texto de la política aguanta las dos. |
| **L-4** | **BAJA** | `backend/app/plataforma_reporte.py:161` | La entrada `estado_cuenta` del catálogo dice «…con el **motivo** del último cambio». El motivo lo escribe el operador, no sale de datos del cliente, y §5.3(a) declara el estado sin mencionarlo. No es una discrepancia real, pero conviene que el catálogo diga «el motivo que escribió el operador» para que el cliente no lea que la plataforma le está tomando un dato suyo. |
| **L-5** | **BAJA** | `docs/ESTADO.md:181` | Sigue afirmando `VERSION_POLITICA = "2026-09-v1"` como regla dura vigente. Fuera de mi territorio de escritura (Parte A se lo asignó a otro agente). **Hay que actualizarlo a `2026-09-v2` antes de cerrar la fase**, junto con el resto de la reescritura de la enmienda de Fase 4. |
| **L-6** | **INFO** | `backend/app/plataforma_reporte.py:206` | El catálogo publica los identificadores reales de la clasificación de adopción (`nueva`, `activa`, `fantasma`, `dormida`, `sin_cuentas`); la política venía describiéndolos en castellano llano («sin uso con contratos», «sin uso sin contratos»). Se resolvió **por el lado de la política**: §5.3(a) ahora trae las dos formas —«sin uso con contratos (*fantasma*)», «sin uso sin contratos (*dormida*)»— para que el cliente pueda mapear lo que ve en su reporte. Sin cambio de código. |

### Lo que se le deja al abogado

Las dos notas viejas —«decisión de NO subir `VERSION_POLITICA`»— se reemplazaron por una
sola, que dice que **sí se subió** a `2026-09-v2` por cambio material y que se disparó el
re-consentimiento, y le pide validar puntualmente:

1. Si un **agregado sobre un solo contrato** —visible para el operador, pero acompañado de
   la trazabilidad completa del reporte— es compatible con la finalidad informada y con el
   contrato de encargo del §5.2. Con la instrucción explícita de que, si la respuesta es no,
   el camino es **restringir la lectura del operador, no ampliar el reporte**.
2. La **relación canon / tarifa de referencia sin umbral** como información comercial
   reservada del cliente (dato de negocio de un tercero, no dato personal) y si conviene
   cubrirla en el contrato de servicio del §5.2.

Se mantienen abiertas las preguntas heredadas y se agrega una: el **nombre comercial** de un
proveedor unipersonal (más urgente ahora, porque ya no hay agrupación mínima que sirva de
disociación), la **fecha de último acceso / días sin acceso** de un cliente con una sola
cuenta activa, y —nueva— el **día de aceptación de la política** que el reporte muestra al
operador: en un supermercado con un solo dueño esa fecha es atribuible a esa persona. Los
demás marcadores `[COMPLETAR]` y `[VALIDAR CON ABOGADO]` del documento quedaron intactos.
