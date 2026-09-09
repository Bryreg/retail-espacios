# Diagnóstico — Censo de identificadores y el camino de la planilla

**Rama:** `claude/fase-12-nomenclatura` · clon `/tmp/re-nom` (HEAD `c172ae7`)
**Fecha:** 2026-09-08 · **Lente:** (A) censo de identificadores por superficie · (B) la planilla de punta a punta
**Regla del encargo:** diagnóstico puro. No se modificó código de la app. Todo lo que se parcheó para probar
algo fue una COPIA en `/tmp/nom-censo/`, y está dicho en cada caso.

> Escrito de forma incremental: cada hallazgo se agregó apenas quedó confirmado.

---

## 0. Veredicto, en una línea

Un mueble tiene dos nombres, **ninguna** superficie hace el JOIN por el que se ve, y la pantalla
que existe para atrapar el error muestra un tercer nombre que no distingue un impulsador de otro.
La hipótesis del brief queda **confirmada y medida**; además aparecieron **dos caminos de doble
venta que no dependen de los nombres** y que hoy no valida nadie (§4 H4 y H5).

---

## 1. Los cinco nombres de un mueble

Un mueble del plano lleva **cinco** identificadores, no dos. Los cinco viven en el mismo objeto JSON
dentro de `layout_snapshots.fixtures_json`:

| Campo | Dónde se declara | Quién lo escribe | Para qué sirve de verdad |
|---|---|---|---|
| `fixture.id` | `frontend/src/types/fixtures.ts:349` | el editor (uuid/`crypto.randomUUID`) | llave DENTRO del layout; nunca sale del JSON |
| `fixture.code` | `frontend/src/types/fixtures.ts:350` | el sistema (`siguienteCodigo`), editable a mano | **la llave del espacio**: `fullSpaceCode` lo convierte en `SEDE-CODE`, que es lo que va a `spaces.code`, `space_files`, los correos y el enlace de montaje |
| `fixture.nomenclatura` | `frontend/src/types/fixtures.ts:395` | **texto libre de la persona** | **el nombre que se DIBUJA**, y que reemplaza a `code` en pantalla |
| `fixture.label` | `frontend/src/types/fixtures.ts:353` | el catálogo de tipos | el nombre del TIPO («Punta de góndola», «Impulsador Marca»), no del mueble |
| `fixture.sede` | `frontend/src/types/fixtures.ts:369` | el editor | prefijo del código completo |

Y del lado normalizado (tabla `spaces`):

| Campo | Dónde | Qué contiene |
|---|---|---|
| `Space.code` | `backend/app/models/models.py` | `SEDE-CODE` — **siempre derivado de `code`, nunca de `nomenclatura`** |
| `Space.name` | idem | texto descriptivo; en la carga masiva se llena con `fixture.label` (ver §4) |
| `Space.svg_id` | idem | copia de `code` en el camino de la planilla |
| `space_files.space_code` | idem | el `SEDE-CODE` |
| `lease_files` | idem | cuelga del `lease_id`, no del código |

La frase clave está escrita en el propio código, en `frontend/src/utils/nomenclatura.ts:148-149`:

> «El código nunca se toca: sigue siendo la llave del espacio. Lo que cambia es cómo se lo nombra.»

Eso es exactamente el problema: **lo que se ve y lo que se usa como llave son dos campos distintos, y
nada obliga a que sean coherentes entre muebles.**

---

## 2. (A) EL CENSO — qué se dibuja y con qué se hace el JOIN, superficie por superficie

Leyenda de la columna **⚠**: marca los puntos donde **lo que se ve y la llave que se usa
pueden ser strings distintos** para el mismo mueble.

| # | Superficie | Archivo:línea | Qué se DIBUJA | Con qué se hace el JOIN contra contratos/archivos | ⚠ |
|---|---|---|---|---|---|
| 1 | Plano 2D — texto adentro de la caja | `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx:1703-1706` → `utils/nomenclatura.ts:199-207` | `nombreDeMueble` = **`nomenclatura` si existe, si no `code`** | ninguno (dibujo puro); el estado/color sale de los campos denormalizados del propio fixture | ⚠ |
| 2 | Plano 2D — pastilla flotante | idem (`rotulosDelPlano` rama `cabeAdentro === false`) | **sólo si `nombrePropio`**: es decir, sólo muebles renombrados a mano | ninguno | ⚠ |
| 3 | Plano 2D — panel del espacio, campo «Nomenclatura» | `FloorPlan2D.tsx:3616-3630` | `nombreDeMueble(item)` (`IMP-08`) | — | ⚠ |
| 4 | Plano 2D — panel del espacio, bloque Archivos / contrato | `FloorPlan2D.tsx:3449` `const fullCode = \`${item.sede \|\| sede}-${item.code}\`` y `:3476` `activeCode` | `SEDE-CODE` (`CIUDAD JARDIN-IMP-12`) | **`code`** | ⚠ |
| 5 | Editor 3D — rótulo del panel de mueble | `StoreEditor3D.tsx:5276`, `:5419`, `:4521`, `:4419` | `nombreDeMueble(fix)` | — | ⚠ |
| 6 | Editor 3D — pintado de caras (arte del proveedor) | `StoreEditor3D.tsx:3856-3881` | — | `fullCode` recompuesto a partir de **`code`** (con guard de doble prefijo y mayúsculas) | |
| 7 | Editor 3D — lámina para el proveedor (pie) | `StoreEditor3D.tsx:5119-5122` | `espacio: fullSpaceCode(...uf.code)` y `mueble: uf.label \|\| uf.code` — **nunca la nomenclatura** | `code` | ⚠ |
| 8 | SEDE / VENDER — mapa isométrico, rótulo sobre el mueble | `frontend/src/pages/DashboardView.tsx:884` (`nombre = nombreDeMueble(p.f)`), usado en `:894` | `nomenclatura` (`IMP-08`) | — | ⚠ |
| 9 | SEDE / VENDER — panel lateral del espacio (compacto y completo) | `DashboardView.tsx:1794` + `:1802`, y `:1962` + `:1965` | línea 1: `fixture.label \|\| fixture.code` («Impulsador Marca»)<br>línea 2: **`entry.code` · sede** (`IMP-12`) | — | ⚠ |
| 10 | SEDE — archivos y artes del espacio | `DashboardView.tsx:1756`, `:1941`, `:2103`, `:2135` | — | `fullSpaceCode(fixture.sede, entry.code)` → **`code`** | |
| 11 | SUPERVISAR — tabla «Estado por espacio» | `DashboardView.tsx:2402…`, celda de código en `:2272` vía `codigoVisible()` en `:186-190` | **`entry.code`** (`IMP-12`), con `·A`/`·B` para góndola doble | los datos del renglón salen del fixture ya parcheado por `code` | ⚠ |
| 12 | SUPERVISAR — buscador del mapa/tabla | `DashboardView.tsx:314-322` (`faceMatchesQuery`) | — | busca en `brandCategory`, `supplierName`, `fixture.label`, **`fixture.nomenclatura`** y `entry.code` — el único lugar del sistema que mira los dos | |
| 13 | SUPERVISAR — reportes de montaje del renglón | `DashboardView.tsx:3129-3136` (`montajeDe`) | — | `fullSpaceCode(...entry.code)` → **`code`** | |
| 14 | Tarjeta del contrato (pantalla de Vender) | `frontend/src/components/Contrato/Contrato.tsx:210-223` | `visible` = `code` (o `code·A/B`) **y** `nombre` = `nombreDeMueble(...)` — los dos, en el mismo renglón | `codigo = fullSpaceCode(fixture.sede \|\| sede, corto)` → **`code`** | ⚠ |
| 15 | Libera (la barra de liberación) | `frontend/src/components/Libera/*.tsx:63, 160, 232, 358` | **`c.code`** (el código, nunca la nomenclatura) | `code` | ⚠ |
| 16 | Minimapa (el que ve el mercaderista) | `frontend/src/components/MiniMapa/MiniMapa.tsx:275, 296, 383` | `nombreDeMueble(...)` | el destino se resuelve por `code` aguas arriba | ⚠ |
| 17 | Montaje — pantalla del mercaderista (móvil) | `frontend/src/pages/Montaje.tsx:227` y `frontend/src/pages/MountView.tsx:316` | `nombreDeMueble({code: corto, nomenclatura})` | el espacio y el reporte viajan con `SEDE-CODE` (`api/mounts.ts:11,53,73`; `MountView.tsx:95,153,157`) → **`code`** | ⚠ |
| 18 | Montaje — backend, resolución del mueble | `backend/app/routers/montaje.py:184-195` | — | compara `base` contra `code` y `SEDE-code`. **`nomenclatura` sólo viaja como dato para dibujar** (`montaje.py:43`, `:232`) | |
| 19 | Correo al comercial (contrato de a uno) | `backend/app/routers/spaces.py:368-371` | `space.code — space.name` | `Space.code` | ⚠ |
| 20 | Correo al mercaderista (contrato de a uno) | `backend/app/routers/spaces.py:384-393`, enlace en `:412-413` | `space.code — space.name` + ubicación en palabras | `Space.code` en el token y el enlace | ⚠ |
| 21 | Correo de constancia al proveedor (de a uno) | `backend/app/routers/spaces.py:431-433` | `space.code — space.name` | `Space.code` | ⚠ |
| 22 | Los tres correos de la CARGA MASIVA | `backend/app/routers/bulk_leases.py:441-445` (comercial), `:455-457` (montaje), `:483-486` (proveedor) | `f.codigo` (= `SEDE-CODE`) y, al proveedor, `f.codigo — f.nombre` donde **`f.nombre = fixture.label`** (§4) | `codigo` → `code` | ⚠ |
| 23 | Planometría — el mercaderista llega por código | `backend/app/routers/planograms.py:158-181` | — | `func.upper(func.trim(Space.code)) == codigo` → **`code`** | |
| 24 | Planometría — cuelga del contrato | `planograms.py:82-117` (`lease_files`) | — | `lease_id`; ninguna relación con el nombre | |
| 25 | Plataforma / detalle por cliente | `backend/app/plataforma_detalle.py:326-335` (`_codigo_corto`) | «el corto» = **`SEDE-CODE` menos el prefijo de sede**, o sea `code`, NO la nomenclatura, pese a que el docstring lo llama «la nomenclatura que el cliente ve adentro del plano» | `code` | ⚠ |
| 26 | Landing pública | `frontend/src/pages/Landing/datos.ts:19-21` | códigos inventados con los prefijos reales; no toca datos | — | |
| 27 | Revisión del plano («Revisar antes de negociar») | `frontend/src/utils/revision.ts:156-172`, `MuebleRevisable` en `:16-23` | — | **sólo `code`**: el tipo `MuebleRevisable` NO tiene campo `nomenclatura`, así que `duplicados()` y `prefijoDesalineado()` nunca ven el nombre dibujado | ⚠⚠ |

### 2.1 Lo que la tabla dice de un vistazo

**Ninguna superficie que hace un JOIN usa `nomenclatura`. Ninguna. Cero.** El JOIN es siempre
`code` (o el `SEDE-CODE` derivado de `code`).

**Cinco superficies dibujan `nomenclatura`** (filas 1, 2, 3, 5, 8, 16, 17) y **siete dibujan `code`
o `label`** (filas 4, 7, 9, 11, 14, 15, 19-22, 25). Dos de ellas — el panel de SEDE (fila 9) y la
tarjeta del contrato (fila 14) — muestran **los dos nombres a la vez, sin decir cuál es la llave**.

Eso reproduce exactamente lo que el dueño fotografió, sin necesidad de ningún bug adicional:
un mueble con `code = IMP-12` y `nomenclatura = IMP-08` se ve
- `IMP-08` en el plano 2D (fila 1/2), en el panel del plano (fila 3), en el mapa de Vender (fila 8) y en el 3D (fila 5);
- `IMP-12` en «Archivos» del mismo panel (fila 4), en el panel de SEDE (fila 9) y en «Estado por espacio» (fila 11).

**Un solo mueble. Dos nombres. En la misma pantalla.**

### 2.2 Dos detalles del censo que no se ven leyendo la tabla

**a) `code` ya no se puede editar desde ninguna pantalla.** El doble clic sobre un mueble en el
plano 2D **abre el editor del NOMBRE, no del código** (`FloorPlan2D.tsx:1291-1327`: `commitCodeEdit`
sólo escribe `nomenclatura`), y el panel lateral únicamente tiene el campo «Nomenclatura»
(`:3612-3618`). No hay ningún `onUpdate({ code: ... })` en todo el frontend — se comprobó con
`grep -rn "onUpdate({ code" frontend/src`, cero resultados.

Consecuencia: **la persona no tiene forma de hacer que el código y el nombre coincidan.** Le puso
`IMP-08` a un mueble creyendo que lo estaba renombrando de verdad; el sistema le dejó el `code`
que le tocó al crearlo. La divergencia no es un descuido del usuario: es la única opción que
el producto le ofrece.

**b) `codigoRepetido` es código muerto.** `frontend/src/utils/nomenclatura.ts:94-102` existe, está
probada en `frontend/scripts/probar-nomenclatura.mjs`, y **no la llama nadie**
(`grep -rn "codigoRepetido" frontend/src` → sólo su definición y una mención en un comentario).
El único guardián vivo es `nombreRepetido`, que compara **nombres contra nombres**.

---

## 3. (B) LA PLANILLA, DE PUNTA A PUNTA

### 3.1 El recorrido, en siete pasos

| Paso | Dónde | Qué pasa con el identificador |
|---|---|---|
| 1 | La persona mira el plano | ve **`nomenclatura`** (`IMP-08`) — `FloorPlan2D.tsx:1703` |
| 2 | Escribe en el Excel | escribe ese texto en la columna `Espacio`/`Código`/`Mueble` |
| 3 | El navegador lee el archivo | `frontend/src/utils/planilla.ts:175-239`. `espacio: texto(valor("espacio"))` (`:219`) — **`texto()` sólo hace `String(...).trim()`** (`:168-172`): no normaliza mayúsculas, ni acentos, ni ceros. Encabezado reconocido por sinónimos (`:48-64`) con dos pasadas (`:76-88`); la fila de títulos se busca en las primeras 15 (`:191-198`) |
| 4 | Se manda a `/leases/bulk/validar` | `frontend/src/api/bulkLeases.ts:62` → `{ sede, filas }`; la `sede` del lote es la de la pantalla |
| 5 | `_revisar` compone el código | `backend/app/routers/bulk_leases.py:191-193`: `sede = fila.sede or lote.sede`, `codigo = _codigo_completo(fila.espacio, sede)` (`:140-150`, mayúsculas + guard de prefijo) |
| 6 | Se resuelve el mueble | `find_fixture_by_space_code` (`backend/app/services/layout_lookup.py:34-61`): **recorre `db.query(LayoutSnapshot).all()` — TODAS las sedes — y compara sólo contra `fixture["code"]`, nunca contra `fixture["nomenclatura"]`. Devuelve el primero que calce.** |
| 7 | `confirmar` crea las filas | `bulk_leases.py:343-395`: `Space(code=v.codigo, svg_id=v.codigo, name=v.nombre or v.codigo, zone=fixture.type, sede=v.sede, area_m2=w*d)` + `SpaceLease(space_id, supplier_id, marca, fechas, monthly_rent, notes)` |

**El eslabón que rompe todo es el paso 6**: la única cadena que puede cerrar el círculo
—«esto que escribiste es el mueble que estabas mirando»— es la que no existe.

### 3.2 Qué muestra la pantalla de revisión, exactamente

`frontend/src/components/CargaMasiva/CargaMasiva.tsx:316-321`:

```
<td>  {r.codigo || "—"}                     ← "CIUDAD JARDIN-IMP-08"  (el CODE)
      {r.nombre && <div>{r.nombre}</div>}   ← "Impulsador Marca"      (el LABEL del tipo)
```

y `r.nombre` sale de `bulk_leases.py:220`:

```python
out.nombre = fixture.get("label") or fixture.get("code")
```

**No es la nomenclatura. Es el nombre del TIPO.** Los 40 impulsadores de la sede devuelven todos
la misma cadena, «Impulsador Marca».

Medido (`/tmp/nom-censo/backend/tests/test_zz_diag_nomenclatura.py`, caso `[2]`), la fila entera
que devuelve el servidor para el contrato del caso es:

```
{'fila': 2, 'estado': 'ok', 'mensajes': ['Proveedor nuevo: se va a crear.'],
 'codigo': 'CIUDAD JARDIN-IMP-08', 'nombre': 'Impulsador Marca',
 'sede': 'CIUDAD JARDIN', 'proveedor': 'CASA LUKER', 'marca': 'ASEO',
 'correo': None, 'valor': 200000.0, 'desde': '2026-09-11', 'hasta': '2026-10-08',
 'nota': None, 'dias': 28, 'referencia': None, 'proveedor_nuevo': True, 'lease_id': None}
```

**Respuesta directa a la pregunta del encargo:** la pantalla de revisión **no** muestra el nombre
que la persona reconoce. Muestra el `code` y el nombre del tipo. **Ninguna revisión, por atenta
que sea, podía atrapar este error** — el dato con el que se atraparía no viaja en la respuesta.
Y tampoco hay nada geométrico (ni pasillo, ni vecinos, ni «a 4 m de las cajas», que el backend
YA sabe calcular con `describe_location`, `layout_lookup.py:128`) que permitiera reconocer el
mueble por otra vía.

### 3.3 TODAS las maneras de terminar en el mueble equivocado

Todo lo de esta tabla está **medido**, no razonado: los ficheros de prueba son
`/tmp/nom-censo/backend/tests/test_zz_diag_nomenclatura.py`,
`/tmp/nom-censo/backend/tests/test_zz_diag_doble_venta.py` y `/tmp/nom-censo/probar-censo.mjs`.
Corren contra una **copia** de `/tmp/re-nom` (`/tmp/nom-censo/backend`); la app no se tocó.
La corrida completa: `cd /tmp/nom-censo/backend && python -m pytest tests/test_zz_diag_*.py -q -s`.

| # | Cómo se llega | ¿Lo valida algo hoy? | Con qué mensaje | ¿Lo dejaba ver la revisión? |
|---|---|---|---|---|
| **B1** | **El nombre visto contra el `code`.** Se escribe `IMP-08` porque el plano dice `IMP-08`; el servidor lo cuelga del mueble cuyo `code` es `IMP-08`, que en el plano se lee `IMP-14` | **NO** | ninguno: `estado: ok` | **NO** — la revisión dice `CIUDAD JARDIN-IMP-08 · Impulsador Marca` |
| **B2** | **Cara B fantasma.** `IMP-08` y `IMP-08-B` son dos `Space` distintos y el mismo impulsador físico, que **no tiene cara B** (`facesOf`, `DashboardView.tsx:141-161`, sólo da cara B a `isDoubleGondola`) | **NO** | ninguno: las dos filas `ok`, los dos contratos creados | **NO** — nada dice que ese mueble no tiene dos caras |
| **B3** | **Fila sin sede** (columna `Sede` ausente y pantalla sin sede, o `lote.sede` vacío). `_codigo_completo` devuelve el corto pelado y `find_fixture_by_space_code` lo matchea contra `raw` **en cualquier sede** | **NO** | ninguno | **NO** — la revisión muestra `codigo: "IMP-08"`, `sede: None`, sin decir de qué tienda |
| **B4** | **Mismo código corto en dos sedes + fila sin sede.** Devuelve el **primer snapshot** que calce, en el orden que dé `db.query(LayoutSnapshot).all()` | **NO** | ninguno | **NO** |
| **B5** | **`SEDE-CODE` y `CODE` conviven** como dos `Space` del mismo mueble: una carga con sede y otra sin sede crean `CIUDAD JARDIN-IMP-08` **e** `IMP-08`. El choque de fechas se busca por `Space.code`, así que no se ven entre sí | **NO** | ninguno | **NO** |
| **B6** | **Dos muebles con el mismo `code` en la misma sede.** El layout se guarda sin protestar; un solo contrato pinta **los dos** muebles como ocupados en el plano | **A medias** | `revisarPlano` lo reporta como error… pero sólo si alguien aprieta el botón «Revisar», y no impide guardar | **NO** |
| **B7** | Sede de la fila ≠ sede del mueble (`sede: NAVE`, código de CIUDAD JARDIN) | **SÍ** | «No hay ningún mueble con el código «NAVE-IMP-08» en el plano de NAVE.» | sí |
| **B8** | Prefijo de sede duplicado a mano (`CIUDAD JARDIN-CIUDAD JARDIN-IMP-08`) | **SÍ** | «No hay ningún mueble con el código …» | sí |
| **B9** | Cero a la izquierda (`IMP-8` por `IMP-08`) | **SÍ** | «No hay ningún mueble con el código «CIUDAD JARDIN-IMP-8» …» | sí |
| **B10** | Guión largo `–` (en dash), guión bajo `_`, espacios adentro (`IMP - 08`) | **SÍ** | idem | sí |
| **B11** | Minúsculas (`imp-08`), espacios alrededor (` IMP-08 `) | **SÍ, y pasa bien** | — (`_codigo_completo` hace `strip().upper()`) | n/a |
| **B12** | Código completo escrito en la celda (`CIUDAD JARDIN-IMP-08`) | **SÍ, y pasa bien** | — | n/a |
| **B13** | Sede con tilde (`CIUDAD JARDÍN`), sin espacio (`CIUDADJARDIN`), abreviada (`CJ`) | **SÍ** | «No hay ningún mueble con el código «CIUDAD JARDÍN-IMP-08» en el plano de CIUDAD JARDÍN.» | sí — aunque el mensaje culpa al **código** y el error está en la **sede** |
| **B14** | Mueble **borrado** del plano después del contrato | **SÍ para una carga nueva** | «No hay ningún mueble con el código …» | sí. Pero el contrato viejo sigue en la base y **desaparece de todas las pantallas**: SEDE y «Estado por espacio» se arman desde el layout, no desde `spaces` |
| **B15** | Mueble **renombrado** después del contrato (se cambia la `nomenclatura`) | **no aplica al JOIN** | — | el contrato sigue bien colgado; lo que cambia es el nombre con el que aparece en el plano, el 3D, el minimapa y el correo del mercaderista, **sin ninguna huella de que antes se llamaba de otro modo** |
| **B16** | `rentable: false` heredado de otra sede (`is_space_rentable`, `layout_lookup.py:64-75`, usa el mismo lookup que barre todas las sedes) | **NO** | bloquearía o dejaría pasar por el mueble de la tienda equivocada | **NO** |

#### La evidencia, textual

```
[1] escrito IMP-08 -> ok CIUDAD JARDIN-IMP-08 | nombre: Impulsador Marca

[3] minusculas               «imp-08»    -> ok    'CIUDAD JARDIN-IMP-08'
[3] espacios alrededor       « IMP-08 »  -> ok    'CIUDAD JARDIN-IMP-08'
[3] cero a la izquierda      «IMP-8»     -> error 'CIUDAD JARDIN-IMP-8'
[3] guion largo (en dash)    «IMP–08»    -> error 'CIUDAD JARDIN-IMP–08'
[3] espacios adentro         «IMP - 08»  -> error 'CIUDAD JARDIN-IMP - 08'
[3] guion bajo               «IMP_08»    -> error 'CIUDAD JARDIN-IMP_08'
[3] codigo completo          «CIUDAD JARDIN-IMP-08» -> ok
[3] cara B de un mueble de una sola cara «IMP-08-B» -> ok 'CIUDAD JARDIN-IMP-08-B'
[3] prefijo duplicado        «CIUDAD JARDIN-CIUDAD JARDIN-IMP-08» -> error

[4] fila sin sede, codigo PUN-04 (solo existe en NAVE) -> ok 'PUN-04' sede=None
[5] IMP-08 existe en las DOS sedes, fila sin sede      -> ok 'IMP-08'  sede=None
[6] IMP-08 con sede NAVE (existe en CIUDAD JARDIN)     -> error

[7] mismo impulsador, cara A y cara B, mismas fechas:
    fila 2 ok CIUDAD JARDIN-IMP-08
    fila 3 ok CIUDAD JARDIN-IMP-08-B
[8] confirmar: 2 creados, 0 omitidos
    espacios creados: ['CIUDAD JARDIN-IMP-08', 'CIUDAD JARDIN-IMP-08-B']

[A] con sede : 1 creado -> CIUDAD JARDIN-IMP-08
[A] sin sede : 1 creado -> IMP-08
[A] espacios en la base para el MISMO mueble fisico: ['CIUDAD JARDIN-IMP-08', 'IMP-08']

[D] segundo contrato sobre el MISMO codigo -> 0 creados
    «CIUDAD JARDIN-IMP-08» ya tiene un contrato del 2026-09-11 al 2026-10-08.
```

**Lo que SÍ funciona, y hay que decirlo:** el choque de fechas sobre el **mismo** `Space.code`
se detecta bien, tanto entre filas de la misma planilla (`bulk_leases.py:274-280`) como contra
la base (`:283-293`), y `confirmar` revalida (`:334`). El tipeo grueso —ceros, guiones, sedes
mal escritas— falla ruidosamente. **El agujero no está en la validación de fechas: está en que
el string que se valida no identifica un mueble físico.**

---

## 4. Hallazgos

### H1 — GRAVE · El nombre que se lee en el plano nunca es la llave, y nada lo dice

- `frontend/src/utils/nomenclatura.ts:151-155` (`nombreDeMueble`) contra
  `frontend/src/types/fixtures.ts:102-107` (`fullSpaceCode`)
- `backend/app/services/layout_lookup.py:55` — `raw = str(fixture.get("code") …)`, y en ninguna
  línea de ese archivo aparece `nomenclatura`.

**Evidencia.** Con el plano del caso (seis impulsadores renombrados), `/tmp/nom-censo/probar-censo.mjs`
importando las funciones REALES:

```
  dibuja «IMP-14»  ·  llave «CIUDAD JARDIN-IMP-08»
  dibuja «IMP-16»  ·  llave «CIUDAD JARDIN-IMP-09»
  dibuja «IMP-17»  ·  llave «CIUDAD JARDIN-IMP-10»
  dibuja «IMP-10»  ·  llave «CIUDAD JARDIN-IMP-11»
  dibuja «IMP-08»  ·  llave «CIUDAD JARDIN-IMP-12»   ← el del caso
  dibuja «IMP-12»  ·  llave «CIUDAD JARDIN-IMP-13»
```

Escribir `IMP-08` en la planilla resuelve a `CIUDAD JARDIN-IMP-08` (`ok`), que es el mueble que
**en el plano se lee `IMP-14`**. Escribir `IMP-12` resuelve al mueble que se lee `IMP-08`, que es
exactamente lo que muestran las capturas del dueño.

### H2 — GRAVE · `nombreRepetido` sólo compara nombres con nombres, y el segundo rename abre la puerta

- `frontend/src/utils/nomenclatura.ts:167-177`
- Guardián único: `FloorPlan2D.tsx:1321-1324` (`if (nombreRepetido(val, items, editingCodeId))`)

**Evidencia** (misma corrida):

```
  Plano virgen, sin ninguna nomenclatura:
   renombrar a5 (code IMP-12) a «IMP-08» -> BLOQUEADO
   primero a1 (code IMP-08)  a «IMP-14»  -> PERMITIDO
   y AHORA a5 a «IMP-08»                 -> PERMITIDO   <-- la puerta se abre sola
```

Es decir: **el guardián sólo aguanta hasta el primer rename**. En cuanto un mueble deja de
llamarse como su `code`, ese `code` queda libre para que otro mueble lo use como nombre. Con seis
impulsadores renombrados en cascada —que es exactamente lo que hay en la captura, seis pastillas—
el plano queda en un estado donde **todo nombre es el `code` de otro mueble**, y el sistema lo
considera correcto.

### H3 — GRAVE · La pantalla de revisión de la planilla no muestra el nombre que la persona reconoce

- `backend/app/routers/bulk_leases.py:220` — `out.nombre = fixture.get("label") or fixture.get("code")`
- `frontend/src/components/CargaMasiva/CargaMasiva.tsx:316-321`

**Evidencia.** La fila devuelta por `/leases/bulk/validar` para el contrato del caso trae
`'codigo': 'CIUDAD JARDIN-IMP-08'` y `'nombre': 'Impulsador Marca'`. El campo `nomenclatura` del
fixture está a mano en esa misma función (`fixture` es el dict completo) y no se usa.

Los dos pasos existen «para que la revisión ocurra ANTES de crear cuarenta contratos»
(`bulk_leases.py:9-12`), pero la revisión **no puede** ver este error: el dato con el que se vería
no viaja. Este es, en la práctica, el hallazgo que convierte H1 de «trampa» en «trampa sin red».

### H4 — GRAVE · Cara B fantasma: dos contratos vigentes sobre el mismo mueble físico, sin un solo aviso

- `backend/app/services/layout_lookup.py:43` — `base = code[:-2] if code.endswith("-B") else code`
- `backend/app/routers/bulk_leases.py:204-228` — nada comprueba que el mueble TENGA cara B
- `frontend/src/pages/DashboardView.tsx:141-161` (`facesOf`) — sólo `isDoubleGondola` produce cara B

**Evidencia** (`test_zz_diag_nomenclatura.py::test_cara_B_*`):

```
[7] mismo impulsador, cara A y cara B, mismas fechas:
    fila 2 ok CIUDAD JARDIN-IMP-08
    fila 3 ok CIUDAD JARDIN-IMP-08-B
[8] confirmar: 2 creados, 0 omitidos
    espacios creados: ['CIUDAD JARDIN-IMP-08', 'CIUDAD JARDIN-IMP-08-B']
```

Dos proveedores, el mismo impulsador, las mismas fechas, cero avisos. Y el segundo espacio
**no se dibuja en ninguna pantalla**, porque `facesOf` no le da cara B a un impulsador: queda
cobrando y sin montar. Este es el «vender dos veces el mismo espacio» en su forma más literal,
y **no necesita ninguna confusión de nombres para ocurrir.**

### H5 — GRAVE · Una fila sin sede se resuelve contra TODAS las tiendas y crea un espacio paralelo

- `backend/app/services/layout_lookup.py:45` — `for snap in db.query(LayoutSnapshot).all():`
- `:59` — `if base in (_full_code(raw, sede), raw)` — el `raw` pelado matchea sin sede
- Contraste: `_fixtures_de_sede` (`:110-125`) SÍ acota, y su docstring explica por qué
  («buscar en todas devolvería el mueble de la sede equivocada»). El lookup principal no lo hace.

**Evidencia:**

```
[4] fila sin sede, codigo PUN-04 (solo existe en NAVE) -> ok 'PUN-04'  sede=None
[5] IMP-08 existe en las DOS sedes, fila sin sede      -> ok 'IMP-08'  sede=None
[A] espacios en la base para el MISMO mueble fisico: ['CIUDAD JARDIN-IMP-08', 'IMP-08']
```

El choque de fechas se busca por `Space.code` (`bulk_leases.py:283`), así que `CIUDAD JARDIN-IMP-08`
e `IMP-08` **no se ven entre sí**: segundo camino de doble venta, y con el correo al comercial
agrupado bajo la sede `""` (`bulk_leases.py:431`).

### H6 — MEDIA · «Revisar antes de negociar» es ciego a la nomenclatura

- `frontend/src/utils/revision.ts:16-23` — el tipo `MuebleRevisable` **no tiene campo `nomenclatura`**
- `:160-165` — `duplicados(fixtures)` sólo sobre `code`

**Evidencia:** `revisarPlano` sobre el plano del caso (seis muebles cuyos nombres son los códigos
de otros seis) devuelve `[]`. Cero hallazgos. La tabla de la sección «Revisar antes de negociar»
de `docs/ESTADO.md:2369-2382` promete «Códigos repetidos → error — dos espacios compartiendo
historia»; el caso real de este informe es *nombres que son códigos de otros*, y no está en la lista.

### H7 — MEDIA · `codigoRepetido` es código muerto

- `frontend/src/utils/nomenclatura.ts:94-102` — definida y probada
- `grep -rn "codigoRepetido" frontend/src` → sólo la definición y una mención en un comentario

Sobre el plano del caso devuelve `codigoRepetido('IMP-08', plano, 'nuevo') === true`: sabe la
respuesta correcta y nadie se la pregunta. El único guardián vivo es el que compara nombre contra
nombre (H2).

### H8 — MEDIA · Tres composiciones distintas del código de espacio; una no tiene los guards

- `frontend/src/types/fixtures.ts:102-107` — `fullSpaceCode`: `trim`, `toUpperCase`, guard de doble prefijo
- `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx:3858-3864` — la reimplementa con los mismos guards
- `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx:3449` — **`const fullCode = \`${item.sede || sede}-${item.code}\``**: sin `toUpperCase`, sin guard de doble prefijo, sin guard de sede vacía

Ese `fullCode` es el que alimenta `activeCode` (`:3476`) y con eso los **archivos del espacio**
(`:3717-3718`, `listSpaceFiles`) y el bloque de contrato del panel.

**Evidencia** (`probar-censo.mjs`, sección 6):

```
  sede="ciudad jardin" code=IMP-12
     fullSpaceCode -> "CIUDAD JARDIN-IMP-12"
     FloorPlan2D   -> "ciudad jardin-IMP-12"     <-- DIFIEREN
  sede="NAVE" code=NAVE-GON-001        (código heredado del generador 3D viejo)
     fullSpaceCode -> "NAVE-GON-001"
     FloorPlan2D   -> "NAVE-NAVE-GON-001"        <-- DIFIEREN
  sede="" code=IMP-12
     fullSpaceCode -> "IMP-12"
     FloorPlan2D   -> "-IMP-12"                  <-- DIFIEREN
```

**Honestidad sobre el alcance:** las sedes se normalizan a mayúsculas al crearlas
(`fixtureStore.ts:91-95`, `normalizeSede`), así que el primer caso hoy es improbable; el segundo
sólo muerde a los códigos `SEDE-TIPO-NNN` que dejó el generador 3D anterior —el propio comentario
de `StoreEditor3D.tsx:3855-3857` dice que existen—. **No pude confirmar si quedan códigos así en
la base de producción**: no hay ningún volcado del layout real en el repo.

### H9 — MEDIA · Dos muebles con el mismo `code` se guardan sin protesta, y un contrato pinta los dos

- El PUT de layout (`backend/app/routers/layout.py:414-471`) no valida unicidad de códigos
- `frontend/src/pages/DashboardView.tsx:4458` — `patches.get(f.code.toUpperCase())` empareja por
  código, así que **todos** los muebles con ese código reciben el parche

**Evidencia** (`probar-censo.mjs`, sección 8):

```
[C] el layout con dos muebles code=IMP-08 se guardo sin protesta
[8] pintado: id=g1 code=IMP-08 nombre=«IMP-14»
    pintado: id=g2 code=IMP-08 nombre=«IMP-08»
```

Un contrato, dos muebles en rojo. Uno de los dos está libre de verdad y nadie lo va a vender.

### H10 — MENOR · Los correos y la lámina llevan un tercer nombre

- `backend/app/routers/spaces.py:371, 393, 433` y `backend/app/routers/bulk_leases.py:484` —
  todos escriben `código — space.name` / `f.nombre`, donde ese nombre es
  `fixture.label` = **el nombre del TIPO** («Impulsador Marca»), no el del mueble
- `backend/app/routers/montaje.py:232` manda `nomenclatura` al teléfono y
  `frontend/src/pages/Montaje.tsx:227` la dibuja con `nombreDeMueble`

Resultado concreto para el caso: el correo al mercaderista dice **`CIUDAD JARDIN-IMP-08`** y la
pantalla que abre desde ese mismo correo le muestra el mueble rotulado **`IMP-14`**. Nada le dice
que son la misma cosa. La lámina del proveedor (`StoreEditor3D.tsx:5119-5122`) es igual:
`espacio: fullSpaceCode(...)` + `mueble: uf.label || uf.code`, **nunca** la nomenclatura, mientras
el panel de al lado (`:5276`) sí la muestra.

### H11 — MENOR · Un comentario del código afirma lo contrario de lo que hace

- `frontend/src/components/Libera/Libera.tsx:79-80`:
  «*El nombre propio del mueble («Punta 03») ya está en el chip del código.*»

El chip dibuja `c.code` (`Libera.tsx:160` `code: caras[k].code` → `FaceEntry.code` → `fixture.code`,
`DashboardView.tsx:143`), es decir **el código, nunca el nombre propio**. Lo mismo en
`backend/app/plataforma_detalle.py:326-331`, cuyo docstring llama «la nomenclatura que el cliente
ve adentro del plano» a lo que es el `code` sin prefijo de sede.

### H12 — MENOR · El estado del plano vive en el JSON del layout y lo puede pisar una estación con copia vieja

- El mapa, los colores y «Estado por espacio» se arman desde `fixtures` (el layout), no desde `spaces`
- `backend/app/routers/layout.py:439` — el guard de concurrencia sólo corre
  `if snap and payload.base_updated_at is not None`
- `frontend/src/main.tsx:45` — `base_updated_at: state.serverRev[sede] ?? null`

**Evidencia** (`test_zz_diag_doble_venta.py::test_E_...`): tras vender y parchear, el layout dice
`IMP-08 occupied`; una segunda escritura con el plano previo lo deja en `free`, y el contrato
sigue en la base. **Honestidad sobre el alcance:** mi prueba mandó `base_updated_at: None`, que es
justo el caso que el guard deja pasar; una estación que ya leyó la revisión recibiría 409.
El camino existe (`serverRev` vacío = nunca leyó esa sede), pero **no pude confirmar con qué
frecuencia se da en el uso real**.

---

## 5. Veredicto sobre la hipótesis del brief

> «Quien lee el plano ve el nombre (IMP-08), lo escribe en la planilla, y el servidor lo resuelve
> contra `code` y lo cuelga de OTRO mueble físico, el que de verdad se llama IMP-08.»

**CONFIRMADA, con dos precisiones que cambian el tamaño del problema.**

**Precisión 1 — el mecanismo es simétrico, y las capturas muestran la otra mitad.**
El daño no necesita que la persona escriba el nombre. Basta con que escriba **cualquiera** de los
dos strings, porque `code` y `nomenclatura` están corridos entre sí:

- escribe el **nombre** `IMP-08` → cae en el mueble cuyo `code` es `IMP-08`, que en el plano se lee `IMP-14`;
- escribe el **código** `IMP-12` → cae en el mueble cuyo `code` es `IMP-12`, que en el plano se lee `IMP-08`.

Lo que el dueño fotografió es lo segundo: un contrato con código `CIUDAD JARDIN-IMP-12`, que
«Estado por espacio» lista como fila `IMP-12` y que el plano y el mapa de Vender dibujan sobre el
mueble rotulado `IMP-08`. **La misma fila de la base, con dos nombres, en dos pantallas del mismo
producto.** No hace falta ningún bug adicional para reproducirlo: es lo que el código hace hoy.

**Precisión 2 — la nomenclatura no es la única forma de vender dos veces, ni la peor.**
La confusión de nombres produce contratos colgados del mueble equivocado, que es grave: se cobra
por A y se monta en B, y el proveedor no ve su marca donde la pagó. Pero la **doble venta con dos
contratos vigentes y ningún aviso** sale por caminos que no tienen nada que ver con los nombres:

- **H4, cara B fantasma** (`IMP-08` + `IMP-08-B` sobre un impulsador de una sola cara): dos
  contratos, dos proveedores, las mismas fechas, `2 creados, 0 omitidos`. Medido.
- **H5, sede ausente** (`IMP-08` sin prefijo junto a `CIUDAD JARDIN-IMP-08`): dos `Space` para un
  mueble; el chequeo de choque no los ve porque compara `Space.code`. Medido.

El miedo del dueño —«podríamos estar vendiendo espacios que ya están ocupados»— **está justificado,
pero por H4 y H5 más que por H1.** Contra el mismo `Space.code` el sistema se defiende bien:
detecta el choque entre filas de la misma planilla, contra la base, y revalida al confirmar
(`bulk_leases.py:274-293`, `:334`; caso `[D]`, `0 creados`).

**Lo que agrava H1 hasta hacerlo inatrapable es H3.** Los dos pasos de la carga masiva existen
exactamente para que un humano vea el error antes de crear cuarenta contratos, y la pantalla de
revisión muestra `CIUDAD JARDIN-IMP-08 · Impulsador Marca`: el código que la persona no reconoce
y el nombre del tipo, que es el mismo para los cuarenta impulsadores de la sede. **El único dato
que habría delatado el error —la nomenclatura, o la ubicación en palabras que el backend ya sabe
calcular— está a mano en esa función y no se usa.**

**Y la causa raíz, dicha sin rodeos:** el producto **obliga** a la divergencia. `code` no se puede
editar desde ninguna pantalla (§2.2a); lo único que la persona puede cambiar es el nombre; y el
nombre no es la llave de nada. Renombrar un mueble en RECABRA es, hoy, ponerle una etiqueta encima
del número de serie sin cambiar el número de serie — y después pedirle a la gente que escriba el
número de serie en una planilla mirando la etiqueta.

---

## 6. Otras causas posibles que NO pude descartar

Honestidad sobre los límites de este diagnóstico:

1. **No hay ningún volcado del layout real de CIUDAD JARDIN en el repo** (`find . -name "*.db" -o
   -name "*layout*.json"` → nada). Todo lo de arriba se reprodujo con un plano sintético
   construido para calzar con las capturas. **No pude verificar cuáles son los `code` reales
   detrás de las seis pastillas IMP.** Bastaría un `GET /api/layout/CIUDAD JARDIN` contra
   producción, o `SELECT fixtures_json FROM layout_snapshots WHERE sede='CIUDAD JARDIN'`, para
   cerrar esto en un minuto: hay que mirar, por cada mueble, el par `(code, nomenclatura)`.
2. **No pude confirmar qué escribió realmente la persona en la celda** — si el nombre o el código.
   El resultado es el mismo (§5, precisión 1), pero la diferencia importa para saber si además
   hubo un mueble que quedó vendido dos veces o sólo uno mal asignado.
3. **No sé si quedan códigos heredados del generador 3D viejo** (`SEDE-TIPO-NNN`) en producción.
   Si los hay, H8 es un segundo desalineamiento vivo, entre los archivos del espacio y el pintado 3D.
4. **No revisé el camino de venta de a uno desde el mapa** con la misma profundidad que la
   planilla: ahí la persona hace clic sobre el mueble, así que la identidad la pone la geometría
   y no un string tecleado, y el modo de falla de H1 no aplica. Pero `Contrato.tsx:210-223` arma
   el código con `fixture.code` y muestra **los dos** nombres en el renglón, y no medí qué pasa
   si el mapa está pintado desde un layout viejo.
5. **No probé con Playwright**: todo lo de este informe se pudo medir llamando a las funciones
   reales (backend por pytest, frontend por esbuild + node), que es evidencia más dura que una
   captura. Lo que sí quedaría por ver en navegador es cuánto de esta ambigüedad se percibe
   mirando una pantalla completa, que es lo que el dueño ya documentó con sus capturas.

---

## 7. Cómo reproducir todo esto

```bash
# Backend (copia de trabajo, la app no se toca)
cd /tmp/nom-censo/backend && python -m pytest tests/test_zz_diag_nomenclatura.py \
                                             tests/test_zz_diag_doble_venta.py -q -s

# Frontend: importa las funciones REALES de /tmp/re-nom/frontend/src vía esbuild
cd /tmp/nom-censo && node probar-censo.mjs
```

Archivos de prueba (todos fuera del árbol de la app):
- `/tmp/nom-censo/backend/tests/test_zz_diag_nomenclatura.py`
- `/tmp/nom-censo/backend/tests/test_zz_diag_doble_venta.py`
- `/tmp/nom-censo/probar-censo.mjs`

`/tmp/nom-censo/backend` es una copia literal de `/tmp/re-nom/backend` más esos dos archivos de
prueba. **No se modificó ninguna línea de la aplicación, ni en `/tmp/re-nom` ni en la copia.**
