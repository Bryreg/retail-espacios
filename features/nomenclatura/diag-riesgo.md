# Nomenclatura vs. `code`: riesgo comercial y superficie de daño

Diagnóstico. **No se modificó código de la app.** Todo lo que se parcheó para probar
una hipótesis fue sobre copias, y está dicho en cada lugar donde ocurre.

Rama analizada: `claude/fase-12-nomenclatura` en `/tmp/re-nom` (clon de `origin/main`).
Fecha: 2026-09-08.

Lente de este informe: **el riesgo comercial y la superficie de daño de
cualquier arreglo**. La reproducción por pantalla está en `diag-repro.md` y el
censo de identificadores en `diag-censo.md`, de sesiones hermanas; acá se
verifica lo que hace falta y se mide lo que ellos no midieron.

**Estado: completo.** 10 escenarios corridos con pytest contra la API real.

---

## 0. El mecanismo, confirmado (no es nuevo, es el punto de partida)

Un mueble tiene dos nombres y sólo uno es llave:

- `code` — llave. `fullSpaceCode(sede, code)`
  (`frontend/src/types/fixtures.ts:102-106`) arma `SEDE-CODE`, que es lo que se
  guarda en `spaces.code`, lo que viaja al contrato, a `space_files`, al enlace
  del correo de montaje y a la lámina.
- `nomenclatura` — texto libre. `nombreDeMueble()`
  (`frontend/src/utils/nomenclatura.ts:151-155`) devuelve
  `nomenclatura.trim() || code`, y **reemplaza al code en pantalla**.

`find_fixture_by_space_code` (`backend/app/services/layout_lookup.py:33-60`)
compara **sólo** `fixture["code"]` (línea 55: `raw = str(fixture.get("code") ...)`).
`nomenclatura` no aparece en ese archivo salvo en un comentario.

`nombreRepetido` (`frontend/src/utils/nomenclatura.ts:167-176`) compara nombre
contra nombre: nada impide que la nomenclatura de un mueble sea igual al `code`
de otro.

---

## A. EL RIESGO — cómo se calcula la disponibilidad, y con qué llave

### A.0 Escenario y cómo se corrió

Todo lo de esta sección se midió con `pytest` contra la API real (FastAPI
`TestClient`, base SQLite de usar y tirar, `conftest.py` copiado del repo).
El archivo de pruebas vive **fuera del repo**, en
`/tmp/nom-riesgo/test_riesgo_nomenclatura.py`, y **no se tocó una línea de la
app**:

```
cd /tmp/nom-riesgo && PYTHONPATH=/tmp/re-nom/backend python -m pytest test_riesgo_nomenclatura.py -q -s
# 10 passed
```

Plano sembrado (sede `CIUDAD JARDIN`): once impulsadores con `code` `IMP-07 … IMP-17`
y tres puntas `PUN-06/08/10`. Seis impulsadores llevan `nomenclatura` puesta a mano,
la renumeración a pares que se ve en la captura del dueño:

| `code` (llave) | `nomenclatura` (lo que se dibuja) |
|---|---|
| IMP-12 | **IMP-08** |
| IMP-13 | IMP-10 |
| IMP-14 | **IMP-12** |
| IMP-15 | IMP-14 |
| IMP-11 | IMP-16 |
| IMP-09 | IMP-17 |

`[00]` — con ese plano hay **cuatro nombres dibujados dos veces**: `IMP-08`,
`IMP-10`, `IMP-16`, `IMP-17`. Y **cero `code` repetidos**, que es lo único que la
app sabe mirar.

### A.1 La tabla de llaves: qué se dibuja, con qué se une

| Superficie | Qué se LEE en pantalla | Con qué se hace el JOIN | archivo:línea |
|---|---|---|---|
| Mapa isométrico de VENDER (rótulo) | **`nombreDeMueble`** (nomenclatura) | `fixture.id` en el layout | `DashboardView.tsx:884` |
| VENDER · «Cuándo se libera cada espacio» | **`code`** | `fixture.id` | `Libera.tsx:160`, vía `FaceEntry.code` (`DashboardView.tsx:116-120`) |
| VENDER · pastillas de «Tarifa de referencia» | **`code`** (`codigoVisible`) | `fixture.id` | `DashboardView.tsx:187-190`, `3231`, `3236` |
| Ficha del contrato multiespacio | **`nombreDeMueble`** en `nombre`, **`code`** en `visible`/`codigo` | `fullSpaceCode(sede, fixture.code)` | `Contrato.tsx:212`, `221-222` |
| Plano 2D (caja y pastilla) | **`nombreDeMueble`** | `item.id`; archivos por `fullSpaceCode` | `nomenclatura.ts:199-208`, `FloorPlan2D.tsx:3626`, `3476`+`3716` |
| Editor 3D (rótulo) | **`nombreDeMueble`** | `fixture.id` | `StoreEditor3D.tsx:17` |
| SUPERVISAR · «Estado por espacio» | **`code`** (`codigoVisible`) | `fullSpaceCode` | `DashboardView.tsx:2264`, `2589` |
| Planilla — resolución de la fila | — | **`fixture["code"]` y sólo ése** | `layout_lookup.py:55` |
| Planilla — eco de la revisión | **`label`** («Impulsador Marca») | `Space.code` | `bulk_leases.py:220` |
| Choque contra contratos existentes | — | **`Space.code` exacto** | `bulk_leases.py:283-292` |
| Choque entre filas del mismo archivo | — | **el string `codigo` exacto** | `bulk_leases.py:273-280` |
| Alta de a uno (`create_lease`) | — | `space_id` (resuelto antes por `Space.code`) | `spaces.py:305-322`, `spaces.py:111` |
| `/spaces/map` | `Space.name` (= `label` del fixture) | `Space.code` / `svg_id` | `spaces.py:78-95`, `bulk_leases.py:356` |
| Montaje (pantalla del mercaderista) | **`nombreDeMueble`** | `Space.code` + token firmado | `MountView.tsx:316`, `montaje.py:232` |
| Correo de montaje de la planilla | **`code` completo, sin enlace por espacio** | — | `bulk_leases.py:453-464` |
| Planometría del mercaderista | — | **`Space.code` exacto** | `planograms.py:158-183` |
| Plataforma / asesoría (oportunidades, detalle) | **`code` completo y corto**; `nomenclatura` **excluida a propósito** | `Space.code` | `plataforma_detalle.py:27-28`, `324-334`, `672-692` |
| Landing pública | `code` inventado, sin nomenclatura; **no llama a `/api/*`** | — | `Landing/datos.ts:1-22` |

**Tres nombres distintos para el mismo mueble, y ninguno es la llave en todas
partes.** En la MISMA pantalla de VENDER, el panel 01 (el mapa) rotula por
NOMBRE y los paneles 02 y 04 rotulan por CÓDIGO: el mapa dice `IMP-08` y la
escalera de al lado dice `IMP-12`, sobre el mismo mueble, sin nada que lo explique.

### A.2 Sí: un mueble mostrado con el nombre de otro aparece LIBRE mientras el otro está ocupado

`[07]`, medido. Una fila de planilla `IMP-08 · CASA LUKER · 2026-01-01 → 2026-09-15`
se confirma; después se aplica el mismo parche que aplica el frontend
(`DashboardView.tsx:4431-4469`, que empareja por `f.code.toUpperCase()`) y se
pregunta la disponibilidad de marzo 2026 con el espejo de `rangeAvailability`:

```
[07] cajas rotuladas IMP-08 en el mapa (marzo 2026):
       rotulo=IMP-08  code=IMP-08  disponibilidad=tomado
       rotulo=IMP-08  code=IMP-12  disponibilidad=libre
```

Dos cajas con el mismo rótulo, una vendida y la otra en venta. Y el conteo de
«Libres · entran» de la tabla de tarifas cuenta la libre, así que el sistema
**ofrece activamente** el mueble que el vendedor cree haber vendido.

### A.3 LA DOBLE VENTA, corrida y confirmada

`[02]` — dos contratos con **fechas idénticas** sobre dos muebles que el plano
dibuja los dos como `IMP-08`:

```
[02] revision del segundo: ok=1 avisos=0 errores=0  ['Proveedor nuevo: se va a crear.']
[02] IMP-12 -> CASA LUKER  2026-01-01 → 2026-09-15  $200.000
[02] IMP-08 -> COLGATE     2026-01-01 → 2026-09-15  $200.000
```

Ni un aviso. El motivo es de una línea: `bulk_leases.py:283` es
`db.query(Space).filter(Space.code == codigo)` — `CIUDAD JARDIN-IMP-08` y
`CIUDAD JARDIN-IMP-12` son dos `code` distintos y por lo tanto dos espacios.
**La validación es correcta sobre los códigos y ciega sobre los nombres, que es
lo único que la persona ve.**

`[03]` — control: el mismo plano **sin ninguna nomenclatura**, la misma segunda
fila, y el guardarraíl funciona perfecto:

> «CIUDAD JARDIN-IMP-08» ya tiene un contrato del 2026-01-01 al 2026-09-15.
> Cancelalo primero o ajustá las fechas.

La causa queda aislada: no es el endpoint, no son las fechas, no es la planilla.
Es que el nombre que se lee y la llave con la que se une son dos cosas distintas.

### A.4 GRAVE, y NO es por la nomenclatura: el mismo mueble físico vendido dos veces

`[04]`. `_codigo_completo` (`bulk_leases.py:140-150`) antepone la sede **sólo si
hay sede**. Con la sede vacía el código queda corto — `IMP-08` — y
`find_fixture_by_space_code` **igual encuentra el mueble**, porque compara
`base in (_full_code(raw, sede), raw)` (`layout_lookup.py:59`) y `raw` es el
código corto. La fila pasa como válida y crea **otra fila de `spaces`**:

```
[04] sin sede: estado=ok  codigo=IMP-08
[04] espacios: ['CIUDAD JARDIN-IMP-08', 'IMP-08']
```

Dos `Space` para **el mismo mueble físico del mismo plano**, cada uno con su
contrato vigente, cada uno invisible para el chequeo de choque del otro. Esto no
necesita ninguna nomenclatura rara: es una doble venta literal del mismo mueble.
(Desde la UI hace falta que `sede` llegue vacía a `confirmarLote` —
`CargaMasiva.tsx:121` manda la sede activa—; **no pude confirmar** que la
pantalla permita llegar con la sede vacía, pero la API lo acepta y ese endpoint
es admin, no público.)

`[05]` — variante que sí se escribe a mano todos los días: la columna **Sede**
de la planilla con el nombre de OTRA tienda. `IMP-08 · sede NAVE` crea
`NAVE-IMP-08` sin un aviso. Un tipeo en una columna manda el contrato a otro
supermercado.

### A.5 Cuánta plata queda mal

`[08]`, sobre el caso de A.4 (mismo mueble, dos contratos):

| | plano limpio | 1 contrato | 2 contratos sobre el MISMO mueble |
|---|---|---|---|
| `total_spaces` | 41 | 42 | **43** |
| `occupied` | 0 | 1 | **2** |
| `monthly_revenue` | $0 | $200.000 | **$400.000** |
| `expiring_soon` | 0 | 1 | **2** |

**Leer esto junto con la sección D**, que precisa qué endpoint está vivo y cuál
no. `dashboard.py:14-88` suma `SpaceLease.monthly_rent` de todo lo que corre hoy, sin
mirar si dos contratos apuntan al mismo mueble del plano. **El inventario se
infla y el ingreso reportado se duplica**, y lo mismo sube a
`plataforma_metricas` (`ingreso_contratado_mes`, `ocupacion_pct`) y de ahí al
histórico de tendencia y al reporte del asesor.

### A.6 Qué más queda mal, superficie por superficie

- **Contratos.** El contrato existe y es válido; apunta a un mueble que nadie
  acordó. Cancelarlo y rehacerlo es la única salida: no hay «mover un contrato
  de espacio» en ninguna pantalla (`spaces.py` tiene `DELETE .../leases/{id}` y
  nada de `PATCH space_id`).
- **Correos ya enviados.** `spaces.py:368`, `384`, `431` manda tres correos con
  `space.code` escrito adentro (asunto y cuerpo). Ya salieron. La constancia al
  proveedor (`bulk_leases.py:480-490`) dice `«{codigo} — {nombre}»`, con el
  código equivocado y el `label` genérico: el proveedor recibe por escrito un
  espacio que no es el que negoció, y no tiene cómo notarlo.
- **Montaje.** El correo de la **planilla** (`bulk_leases.py:453-464`) lleva
  sólo el texto del código y un enlace genérico «Abrir RECABRA» — **no** un
  enlace por espacio. El mercaderista tiene que buscar `CIUDAD JARDIN-IMP-08` en
  el plano… donde el mueble que se llama así es OTRO. Se monta en el mueble
  equivocado. (El alta de a uno sí manda enlace con token por espacio —
  `spaces.py:412-413` — y ese camino lleva al mueble correcto, porque el
  minimapa resalta por geometría; ahí el riesgo es menor.)
- **Planometría.** `[06]`: `GET /planometrias/por-espacio/CIUDAD JARDIN-IMP-12`
  devuelve **404 «Espacio no encontrado»**. La lámina de «cómo debe quedar»
  cuelga del contrato equivocado y el mueble que el proveedor va a mirar no
  tiene ninguna.
- **`/spaces/map`** `[06]`: `{'svg_id': 'CIUDAD JARDIN-IMP-08', 'status':
  'occupied', 'name': 'Impulsador Marca', 'supplier_name': 'CASA LUKER'}`. El
  `name` es el `label` del tipo, un **tercer** nombre que no identifica nada.
- **Plataforma / asesoría.** `plataforma_detalle.py:27-28` excluye
  `nomenclatura` a propósito (es texto libre del cliente). O sea que el asesor
  habla en `code` y el operador lee nombres: «`IMP-08` está libre» nombra, en el
  plano del cliente, un mueble distinto del que el asesor tiene en la mano.
- **Landing.** No corre riesgo: `Landing/datos.ts` es 100% inventado y no llama
  a `/api/*`. Pero *enseña* el modelo equivocado — «la landing enseña la misma
  nomenclatura que la persona va a usar adentro» (`datos.ts:19-21`) — con
  códigos que son a la vez nombre y llave. Entrena justo la expectativa que el
  producto rompe.

---

## B. SUPERFICIE DE DAÑO DE CUALQUIER ARREGLO

Dos cosas se pueden querer cambiar y no cuestan lo mismo:

- **B.1 — cambiar un `code`** (renombrar el mueble para que la llave sea el
  nombre que la gente usa). Es la más cara: hay historia colgada del string.
- **B.2 — cambiar el MATCHING** (que la planilla resuelva de otra forma, o que
  se valide la nomenclatura). Es barato en datos y caro en criterio.

El proyecto **no migra**: `create_all` y nada más
(`backend/app/database.py`, y dicho en `layout_lookup.py:5-10` y en
`docs/ESTADO.md` §Reglas duras). Toda «migración» es un script escrito a mano y
corrido a mano contra la base de producción de cada cliente
(`ClienteRow.db_name` — hay **una base por cliente**, `app/clientes.py`).

### B.1 Todo lo que está atado al `code` HOY

| # | Qué | Dónde | Qué pasa si el `code` cambia |
|---|---|---|---|
| 1 | `spaces.code` — **UNIQUE** | `models.py:32` | La fila es la misma; hay que hacer UPDATE. Un rename a un code ya usado **choca el UNIQUE** |
| 2 | `spaces.svg_id` — **UNIQUE**, se guarda igual al code (`svg_id=v.codigo`) o `fix-{code}` | `models.py:33`, `bulk_leases.py:353-354`, `spaces.py:117-119` | Queda **desincronizado** salvo que se renombre también. `GET /spaces/by-svg/{svg_id}` (`spaces.py:220-224`) apunta al viejo |
| 3 | `space_leases` | `models.py:79` FK `space_id` | **No se rompe**: cuelga del id |
| 4 | `space_files` | `models.py:125` FK `space_id` | **No se rompe**, pero la pantalla llega por `GET /spaces/by-code/{code}` (`DashboardView.tsx:1537`, `spaces.py:230-237`): con el code viejo escrito en algún lado, 404 |
| 5 | `space_faces` (la cara del 3D) | `models.py:161` FK | La fila no se rompe. **Sí se rompe la textura**: `GET /spaces/face-images` devuelve `{code, file_id}` (`spaces.py:196-209`) y el 3D empareja por code en el cliente (`StoreEditor3D.tsx:3696`, `3858-3869`) |
| 6 | `lease_files` (planometría) | `models.py:274` FK `lease_id` | **No se rompe** |
| 7 | **`mount_confirmations.space_code` — STRING, no FK** | `models.py:185`, escrito en `mounts.py:207`, `montaje.py:304` | **Se huerfaniza**: el histórico de montajes queda apuntando a un código que ya no existe. `montaje.py:204` y `mounts.py` filtran por igualdad de string |
| 8 | **Enlaces de montaje YA ENVIADOS por correo** | `spaces.py:412-413`: `?montar={space.code}&t={token}`; el token es un **JWT firmado con el code adentro** (`auth.py:336-346`) y se valida por igualdad exacta (`auth.py:616-620`) | **Se rompen todos los que estén vivos.** TTL = **30 días** (`auth.py:56`). Un rename deja al mercaderista con un enlace que da 403/404 y ninguna forma de reemitirlo salvo volver a guardar el contrato |
| 9 | `GET /planometrias/por-espacio/{code}` | `planograms.py:158-183` | Devuelve 404 con el code viejo (`[06]`, medido) |
| 10 | Bitácora | `spaces.py:257` `entidad_id=space.code`; `files.py:188` `detalle=f"{space.code} · …"` | Texto histórico. **Queda viejo a propósito** (es un registro), pero deja de poder cruzarse con el espacio actual |
| 11 | Correos ya enviados (los tres del alta y los tres de la tanda) | `spaces.py:368`, `384`, `431`; `bulk_leases.py:453-464`, `480-490` | Papel ya entregado con el código viejo, incluida la constancia al proveedor |
| 12 | Recordatorios de vencimiento | `reminders.py:110-134` | Se recalculan solos; llevan el code nuevo desde el próximo envío |
| 13 | Plataforma / asesoría | `plataforma_detalle.py:325-334` (código completo y corto), oportunidades y recomendaciones por código | El histórico de tendencia queda con códigos que ya no existen; las series por espacio se parten en dos |
| 14 | `archived_spaces.original_code` y el rename `code#id` | `sede_archive.py:121`, `141-142` | **Precedente**: es el ÚNICO lugar del proyecto donde un code cambia hoy. Y para hacerlo tiene que renombrar `code` **y** `svg_id`, cerrar los contratos y estampar los montajes: la lista de arriba, resuelta a mano |
| 15 | Vistas guardadas del 3D (`vista3D`) | `types/fixtures.ts:404-414` — viven **dentro del fixture** del layout | **No se rompen**: cuelgan del fixture, no del code |
| 16 | Pasillos | `utils/pasillos.ts` — se deducen de la geometría, no se guardan | **No se rompen** |
| 17 | Landing | `Landing/datos.ts` — inventado, sin `/api/*` | **No se rompe** |
| 18 | Tests | 20 archivos de `backend/tests/` nombran códigos literales (`PUN-0…`, `GON-0…`); `frontend/scripts/probar-nomenclatura.mjs` y `probar-revision.mjs` prueban las reglas de nombre | Se actualizan; son el guardarraíl de cualquier cambio, no un costo |

**Lo que NO existe y haría falta**: no hay ningún endpoint ni pantalla para
**mover un contrato de espacio** ni para **renombrar un `code`**. `spaces.py`
tiene `DELETE /spaces/{id}/leases/{id}` y nada de `PATCH`. Arreglar los
contratos ya mal colgados es hoy: cancelar y volver a crear, con los correos
que eso dispara.

**Y no hay ninguna validación del lado del servidor**: `PUT /layout/{sede}`
recibe `fixtures: list[Any]` (`schemas/layout.py:7`) y guarda el JSON tal cual
(`layout.py:414-473`). Ni códigos repetidos, ni nomenclaturas, ni nada. Todo el
guardarraíl de nombres vive en el navegador.

### B.2 Cuánta ambigüedad hay que absorber

`[09]`, sobre el plano sembrado (14 muebles, 6 renombrados a mano):

| Medida | Cuántos |
|---|---|
| (a) nombres **dibujados** dos veces | 4 — `IMP-08`, `IMP-10`, `IMP-16`, `IMP-17` |
| (b) nomenclaturas que pisan el **`code` de OTRO** mueble | **6 de 6** |
| (c) textos que quedarían **ambiguos** si se resolviera por code Y por nomenclatura | **6** |
| (d) muebles que violarían «la nomenclatura debe ser igual al code» | **6** |

O sea: en este plano **todos** los renombres son problemáticos, y la ambigüedad
no es un caso de borde sino la regla. Es coherente con lo que hizo la persona:
renumeró una corrida corriendo los números, y correr números dentro de un
conjunto cerrado garantiza que cada nombre nuevo sea el viejo de otro.

### B.3 Un dato que cambia el tamaño del problema: hoy TODO pasa por la tanda

`POST /spaces/{id}/leases` —el «alta de a uno» de `spaces.py:264-440`— es el
**único** lugar del backend que emite el enlace firmado de montaje
(`create_mount_token`, `spaces.py:412-413`; un grep sobre `backend/app` no
devuelve ningún otro emisor). Y su único llamador en el frontend es
`components/SpacePanel/SpacePanel.tsx:179` — un archivo que **nadie importa**:
`grep -rn "SpacePanel" frontend/src frontend/scripts` fuera de su propia carpeta
devuelve cero.

Es decir: los dos caminos vivos —la ficha de contrato del mapa
(`Contrato.tsx:329`) y la planilla (`CargaMasiva.tsx:121`)— entran los dos por
`/leases/bulk/confirmar`. Consecuencias:

- Toda la validación de choque que corre hoy es la de `bulk_leases.py:273-292`,
  la que se acaba de mostrar ciega a los nombres.
- El correo al mercaderista es siempre el agrupado de
  `bulk_leases.py:453-464`: **códigos en texto y un enlace genérico**, sin token
  por espacio. El mercaderista tiene que encontrar `CIUDAD JARDIN-IMP-08` en el
  plano, donde el mueble que se llama así es otro. Ahí es donde la doble venta
  se vuelve física: dos exhibiciones dirigidas al mismo mueble.
- La contracara: **el punto 8 de la tabla B.1 pesa menos de lo que parece**.
  Si no se están emitiendo enlaces firmados, un rename no rompe enlaces vivos.
  *(No pude confirmar si en producción se emitieron alguna vez —dependería de
  versiones anteriores de la app y de la base real, que no tengo.)*

---

## C. MAPA DE OPCIONES DE ARREGLO, con su costo. **Sin elegir.**

Ninguna de estas es recomendación. Están ordenadas por lo que tocan, no por
preferencia.

### (i) Prohibir que la nomenclatura difiera del `code`

Renombrar pasa a ser renombrar el `code`.

- **Arregla:** todo. Un solo nombre, que es la llave.
- **Cuesta:** la lista entera de **B.1** cada vez que alguien renombra: UPDATE
  de `spaces.code` **y** `spaces.svg_id` (los dos UNIQUE), `mount_confirmations.
  space_code` (string suelto), reemisión de enlaces de montaje, y el histórico
  de la plataforma partido. Hoy **no existe** ningún endpoint que haga eso; el
  único precedente (`sede_archive.py:141-142`) tuvo que hacerlo a mano y sólo
  para liberar el UNIQUE.
- **Y no es retroactivo:** los 6 muebles ya renombrados violan la regla desde el
  primer arranque. Hay que decidir qué se hace con ellos, y sin migraciones eso
  es un script por cliente.
- **Riesgo propio:** un rename que choque contra un `code` existente
  —**6 de 6** en el plano medido— tiene que fallar, o intercambiar dos códigos
  en una transacción, que es una operación que nadie escribió todavía.

### (ii) Resolver la planilla también por nomenclatura, y fallar si es ambiguo

- **Arregla:** el caso del brief. Quien escribe lo que ve, acierta o recibe un
  error.
- **Cuesta poco en datos:** sólo toca `layout_lookup.py:34-60` y el eco de
  `bulk_leases.py`. Cero cambios de llave, cero huérfanos.
- **Pero:** en el plano medido **6 de 6** nomenclaturas son ambiguas contra un
  `code` ajeno `[09]`. O sea que esta opción, sola, convierte el problema en
  «seis filas que no se pueden cargar» y deja a la persona sin forma de decir
  cuál quiso. Necesita un desempate en la pantalla de revisión.
- **Ojo:** también hay que decidir el orden de precedencia. Si `code` gana,
  quien escribe el nombre sigue perdiendo en silencio; si gana `nomenclatura`,
  cambia el significado de planillas viejas ya cargadas.

### (iii) Mostrar siempre el `code` junto al nombre

- **Arregla:** la ceguera, no el mecanismo. La persona ve
  `IMP-08 (CIUDAD JARDIN-IMP-12)` y no escribe el nombre por error.
- **Cuesta:** nada estructural. Es el mapa de Vender (`DashboardView.tsx:884`),
  el plano 2D (`nomenclatura.ts:199-208`), el 3D y el panel. El costo real es de
  **diseño**: `rotulosDelPlano` existe justamente porque en un mueble chico no
  entra un texto (`nomenclatura.ts:181-197`), y dos textos entran menos.
- **No arregla** A.4 (la sede vacía) ni la doble venta hecha por dos personas
  distintas en dos momentos.

### (iv) Validar la nomenclatura contra los `code` ajenos

Que `nombreRepetido` también compare contra los `code` de los otros muebles, y
que el campo del panel lateral lo llame (hoy `FloorPlan2D.tsx:3616-3617` escribe
directo, sin ninguna comprobación — el doble clic sobre la caja sí valida,
`FloorPlan2D.tsx:1321`).

- **Arregla:** que se creen nuevos casos.
- **Cuesta:** nada en datos. Es frontend puro.
- **No arregla** los 6 que ya existen, y **no puede** arreglarlos: al abrir el
  plano ya renombrado, la validación diría que seis muebles están mal y no habría
  forma de guardar nada hasta resolverlos.
- **Y no cierra la puerta**: `PUT /layout/{sede}` acepta `list[Any]` sin mirar
  (`schemas/layout.py:7`, `layout.py:414-473`). Un guardarraíl que vive sólo en
  el navegador no es un guardarraíl del sistema.

### (v) Las que se me ocurren

**(v.a) Que «Revisar antes de negociar» vea los nombres.** `utils/revision.ts`
ni siquiera recibe `nomenclatura` (su interfaz `MuebleRevisable` no tiene el
campo) y su único chequeo de nombres es `duplicados(fixtures)`, que agrupa por
`code`. Agregar «nombres repetidos» y «nomenclatura igual al code de otro
mueble» es barato, no rompe nada y convierte un error invisible en una lista.
**Detecta, no previene.**

**(v.b) Que la planilla deje de ser texto libre.** La plantilla descargable
(`utils/planilla.ts:241-262`) trae hoy dos filas de EJEMPLO inventadas
(`PUN-04`, `PUN-05`) que pueden no existir en esa sede; podría bajar
**pre-llenada con los espacios reales de la sede**
(código + nombre dibujado), y la columna «Espacio» pasar a ser una lista
cerrada. Ataca la fuente —el tipeo— sin tocar ninguna llave. Cuesta una pantalla
y no cuesta datos.

**(v.c) Que el eco de la revisión muestre lo que la persona reconoce.**
`bulk_leases.py:220` devuelve `label` («Impulsador Marca», idéntico en los once
impulsadores). Devolver además la `nomenclatura` y el `code` del fixture
resuelto hace que el desvío se vea en la pantalla de revisión, que es
exactamente para lo que ese paso existe. Una línea de backend y una columna de
frontend. **Es lo más barato de todo el mapa y no cambia ninguna llave.**

**(v.d) Renombrar el `code` de verdad, con un endpoint que arrastre todo.**
Es (i) hecho bien: un `PATCH /spaces/{id}/code` que en una transacción mueva
`code`, `svg_id`, `mount_confirmations.space_code`, deje una fila de alias para
el histórico y reemita los enlaces vivos. Es el único arreglo que deja el
sistema con un solo nombre. Es también el más caro y el que más superficie
nueva abre (ver B.1 completa).

**(v.e) Una reconciliación para encontrar lo que YA está mal.** Nada de lo
anterior arregla los contratos ya cargados sobre el mueble equivocado. Hace
falta un listado —una pantalla o un script— que cruce cada contrato vigente con
el nombre dibujado de su mueble y muestre los que no coinciden. Sin eso, el
arreglo tapa la fuga y deja adentro el agua que ya entró.

**(v.f) Tapar A.4, que no tiene nada que ver con la nomenclatura.** Rechazar la
fila cuando no hay sede, o resolverla contra la sede del fixture encontrado en
vez de crear un `Space` con el código corto (`bulk_leases.py:140-150` +
`layout_lookup.py:59`). Es un `if`, y hoy permite vender dos veces el mismo
mueble físico sin ningún renombre de por medio.

---

## D. Precisiones honestas sobre A.5 (la plata)

El endpoint que medí en `[08]`, `GET /api/dashboard/kpis`
(`routers/dashboard.py:14-88`), **no tiene consumidor vivo**: `api/dashboard.ts`
lo expone y ningún `.tsx` lo importa
(`grep -rn "api/dashboard" frontend/src --include=*.tsx` → cero). O sea que el
número que medí es aritmética correcta sobre un endpoint que hoy nadie mira.

La misma suma sí está viva en la consola del operador:
`plataforma_metricas.py:675` — `canon_total = sum(canon for … in contratos)` —
que alimenta `ingreso_contratado_mes` (`:742`) y de ahí la tendencia histórica
(`plataforma_tendencia.py`) y el reporte del asesor. **No corrí ese endpoint**
(pide rol operador y una base por cliente; el montaje excedía lo que este
diagnóstico necesitaba), así que lo afirmo por lectura:

- En el caso de **A.3** (dos `code` del plano, dos nombres iguales) los dos
  códigos están en `caras`, así que **`ocupadas` y `canon_total` se inflan los
  dos**: la ocupación reportada sube y el ingreso también.
- En el caso de **A.4** (código corto, sin sede) el contrato **no** entra en
  `caras`, así que `ocupadas` no lo cuenta pero `canon_total` **sí**
  (`plataforma_metricas.py:667-675`, y el tipo `fuera_del_plano` de
  `plataforma_detalle.py:113`). Resultado: plata reportada sin espacio detrás.

Los KPI que el dueño ve en VENDER **no** salen de ahí: se derivan del JSON del
layout (`DashboardView.tsx:3252` y `displayStatus` en `DashboardView.tsx:252`), y ahí el mueble
equivocado se pinta ocupado y el correcto libre — que es el `[07]` medido.

---

## E. Veredicto sobre la hipótesis del brief

**Confirmada, y el alcance es mayor que la hipótesis.**

La hipótesis —«quien lee el plano ve el nombre, lo escribe en la planilla, el
servidor lo resuelve contra `code` y lo cuelga de OTRO mueble»— es exactamente
lo que pasa: `[01]` lo muestra fila por fila y `[02]` muestra las dos ventas
conviviendo sin un aviso. `[03]`, el control con el mismo plano sin
nomenclaturas, aísla la causa: el guardarraíl de choque funciona perfecto y lo
único que lo esquiva es que el nombre leído y la llave usada sean campos
distintos.

Lo que la hipótesis no cubría y también es cierto:

1. **Se puede vender dos veces el MISMO mueble físico sin ninguna nomenclatura
   de por medio** (`[04]`): con la sede vacía el código queda corto y se crea un
   `Space` paralelo. Dos contratos vigentes sobre el mismo mueble del mismo
   plano, invisibles el uno para el otro.
2. **Una columna «Sede» mal escrita manda el contrato a otra tienda** (`[05]`).
3. **La misma pantalla de VENDER se contradice a sí misma**: el mapa rotula por
   nombre y los paneles de al lado por código (A.1).
4. **El eco de la revisión no puede mostrar el desvío**: devuelve `label`, que
   es idéntico en los once impulsadores (`bulk_leases.py:220`).
5. **El correo al mercaderista de la tanda no lleva enlace por espacio**
   (B.3), así que el montaje se guía por el plano — donde el código nombra a
   otro mueble.

## F. Lo que NO pude confirmar

- **Si esto ya pasó en producción.** No tengo la base de CIUDAD JARDIN. El plano
  que sembré es la reconstrucción de las capturas (la misma que usó
  `diag-repro.md`); coincide con las seis pastillas y con el panel campo por
  campo, pero es una reconstrucción, no el dato del dueño. **Para saber cuántos
  contratos están hoy colgados del mueble equivocado hace falta correr una
  reconciliación contra la base real** (v.e).
- **Si la UI puede mandar `sede` vacía** a `/leases/bulk/confirmar`. La API lo
  acepta y ahí está el agujero de A.4; `CargaMasiva.tsx:121` manda la sede
  activa, y no rastreé todos los caminos por los que esa sede podría quedar en
  blanco.
- **Si alguna vez se emitieron enlaces firmados de montaje** desde una versión
  anterior. Hoy su único emisor no tiene llamador vivo (B.3), pero eso es cierto
  de ESTE commit, no necesariamente de lo desplegado hace seis meses.
- **La textura de cara del 3D tras un rename**: lo afirmo por lectura
  (`spaces.py:196-209` devuelve `{code, file_id}` y `StoreEditor3D.tsx:3858-3869`
  empareja por code), no lo corrí en un navegador.
- **`plataforma_metricas`**: leído, no corrido (ver D).

## G. Cómo reproducir todo esto

```bash
# NO toca el repo: el archivo de pruebas vive fuera
cd /tmp/nom-riesgo
PYTHONPATH=/tmp/re-nom/backend python -m pytest test_riesgo_nomenclatura.py -q -s
# 10 passed
```

`/tmp/nom-riesgo/test_riesgo_nomenclatura.py` — un test por hallazgo, con los
`print` que producen las líneas `[00]`…`[09]` citadas arriba.
`/tmp/nom-riesgo/conftest.py` es copia literal de `backend/tests/conftest.py`.
